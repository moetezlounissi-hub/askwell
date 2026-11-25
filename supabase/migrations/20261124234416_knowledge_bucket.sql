-- Only server-issued signed uploads may reach this private bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge', 'knowledge', false, 10485760,
  array['application/pdf', 'text/markdown', 'text/plain']
);

-- This ledger intentionally survives source and project deletion.
create schema knowledge_storage;
revoke all on schema knowledge_storage from public, anon, authenticated;
grant usage on schema knowledge_storage to service_role, supabase_storage_admin;

create table knowledge_storage.reservations (
  source_id uuid primary key,
  storage_key text unique not null,
  uploaded boolean not null default false,
  cleanup_attempted_at timestamptz
);
alter table knowledge_storage.reservations enable row level security;
revoke all on knowledge_storage.reservations from public, anon, authenticated, service_role;
grant select, insert, update, delete on knowledge_storage.reservations to service_role;
grant select, update (uploaded) on knowledge_storage.reservations to supabase_storage_admin;
create policy storage_reservation_read on knowledge_storage.reservations
  for select to supabase_storage_admin using (true);
create policy storage_reservation_consume on knowledge_storage.reservations
  for update to supabase_storage_admin using (not uploaded) with check (uploaded);

-- Lock only the reserved source, with no ability to change its contents.
grant select (id, status, storage_key, created_at), update (id)
  on public.knowledge_sources to supabase_storage_admin;
create policy storage_upload_source_read on public.knowledge_sources
  for select to supabase_storage_admin using (status = 'uploading');
create policy storage_upload_source_lock on public.knowledge_sources
  for update to supabase_storage_admin using (status = 'uploading') with check (false);

create index knowledge_sources_stale_upload_idx
  on public.knowledge_sources (created_at, id) where status = 'uploading';

create function knowledge_storage.guard_upload()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.bucket_id = 'knowledge' or new.bucket_id = 'knowledge' then
      raise sqlstate 'PT409' using message = 'Knowledge objects cannot be replaced';
    end if;
    return new;
  end if;
  if new.bucket_id is distinct from 'knowledge' then
    return new;
  end if;

  select source_id into reservation_id
  from knowledge_storage.reservations where storage_key = new.name;
  -- The lock orders an in-flight upload against claim, expiry and source deletion.
  perform 1 from public.knowledge_sources
  where id = reservation_id and status = 'uploading' and storage_key = new.name
  for share;
  if not found or not exists (
    select 1 from public.knowledge_sources
    where id = reservation_id and created_at > clock_timestamp() - interval '2 hours'
  ) then
    raise sqlstate 'PT409' using message = 'Knowledge upload reservation is inactive';
  end if;

  update knowledge_storage.reservations
  set uploaded = true
  where source_id = reservation_id and not uploaded;
  if not found then
    raise sqlstate 'PT409' using message = 'Knowledge upload reservation was already used';
  end if;
  return new;
end;
$$;
revoke all on function knowledge_storage.guard_upload() from public, anon, authenticated;
grant execute on function knowledge_storage.guard_upload() to service_role, supabase_storage_admin;
create trigger askwell_knowledge_guard_upload
  before insert or update on storage.objects
  for each row execute function knowledge_storage.guard_upload();

create or replace function public.reserve_knowledge_source(
  p_project_id uuid,
  p_owner_id text,
  p_title text,
  p_type text,
  p_source_limit integer,
  p_storage_key text default null
)
returns table (source_id uuid, reclaimed_storage_keys text[])
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reserved_at timestamptz;
begin
  if p_source_limit is null or p_source_limit < 1 then
    raise sqlstate 'PT400' using message = 'Invalid knowledge source limit';
  end if;

  perform 1 from public.projects
  where id = p_project_id and owner_id = p_owner_id
  for no key update;
  if not found then
    raise sqlstate 'PT404' using message = 'Project not found';
  end if;

  reserved_at := clock_timestamp();
  with expired as (
    delete from public.knowledge_sources
    where project_id = p_project_id
      and status = 'uploading'
      and created_at <= reserved_at - interval '2 hours'
    returning storage_key
  )
  select coalesce(array_agg(storage_key order by storage_key), array[]::text[])
  into reclaimed_storage_keys
  from expired
  where storage_key is not null;

  if (select count(*) from public.knowledge_sources where project_id = p_project_id) >= p_source_limit then
    raise sqlstate 'PT409' using message = 'Knowledge source limit reached';
  end if;

  insert into public.knowledge_sources (project_id, title, type, storage_key, status, created_at)
  values (
    p_project_id, p_title, p_type, p_storage_key,
    case when p_type = 'text' then 'processing' else 'uploading' end,
    reserved_at
  )
  returning id into source_id;
  if p_storage_key is not null then
    insert into knowledge_storage.reservations (source_id, storage_key)
    values (source_id, p_storage_key);
  end if;
  return next;
end;
$$;


create function public.claim_knowledge_upload(p_project_id uuid, p_owner_id text, p_source_id uuid)
returns setof public.knowledge_sources
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.knowledge_sources s
  join public.projects p on p.id = s.project_id
  where s.id = p_source_id and p.id = p_project_id and p.owner_id = p_owner_id
    and s.status = 'uploading'
  for no key update of s;
  if not found then
    return;
  end if;

  return query update public.knowledge_sources s set status = 'processing'
  where s.id = p_source_id and s.created_at > clock_timestamp() - interval '2 hours'
    and exists (
      select 1 from knowledge_storage.reservations r where r.source_id = s.id and r.uploaded
    )
  returning s.*;
end;
$$;

create function public.delete_knowledge_source(p_owner_id text, p_source_id uuid)
returns table (storage_key text)
language sql
security invoker
set search_path = ''
as $$
  delete from public.knowledge_sources s using public.projects p
  where s.id = p_source_id and s.project_id = p.id and p.owner_id = p_owner_id
  returning s.storage_key;
$$;

create function public.collect_knowledge_cleanup()
returns table (storage_key text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  with expired as (
    select id from public.knowledge_sources
    where status = 'uploading' and created_at <= statement_timestamp() - interval '2 hours'
    order by created_at, id limit 100 for update skip locked
  )
  delete from public.knowledge_sources s using expired where s.id = expired.id;

  -- Move attempted keys to the back so persistent errors do not starve newer work.
  return query
  with pending as (
    select r.source_id from knowledge_storage.reservations r
    where not exists (select 1 from public.knowledge_sources s where s.id = r.source_id)
    order by r.cleanup_attempted_at nulls first, r.storage_key
    limit 100 for update of r skip locked
  )
  update knowledge_storage.reservations r set cleanup_attempted_at = statement_timestamp()
  from pending where r.source_id = pending.source_id
  returning r.storage_key;
end;
$$;

create function public.complete_knowledge_cleanup(p_storage_key text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from knowledge_storage.reservations r where r.storage_key = p_storage_key
    and not exists (select 1 from public.knowledge_sources s where s.id = r.source_id);
$$;

revoke all on function
  public.claim_knowledge_upload(uuid, text, uuid),
  public.delete_knowledge_source(text, uuid),
  public.collect_knowledge_cleanup(),
  public.complete_knowledge_cleanup(text)
from public, anon, authenticated, service_role;
grant execute on function
  public.claim_knowledge_upload(uuid, text, uuid),
  public.delete_knowledge_source(text, uuid),
  public.collect_knowledge_cleanup(),
  public.complete_knowledge_cleanup(text)
to service_role;

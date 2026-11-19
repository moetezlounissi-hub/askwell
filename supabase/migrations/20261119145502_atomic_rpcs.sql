create function public.create_project(p_owner_id text, p_name text, p_project_limit integer)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_project public.projects;
begin
  if p_project_limit is null or p_project_limit < 1 then
    raise sqlstate 'PT400' using message = 'Invalid project limit';
  end if;

  -- Serialize project creation for this account across RPC calls.
  perform 1 from public.accounts
  where clerk_user_id = p_owner_id
  for no key update;
  if not found then
    raise sqlstate 'PT404' using message = 'Account not found';
  end if;

  if (select count(*) from public.projects where owner_id = p_owner_id) >= p_project_limit then
    raise sqlstate 'PT409' using message = 'Project limit reached';
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, 'pk_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into new_project;

  insert into public.widget_configs (project_id) values (new_project.id);
  return new_project;
end;
$$;

create function public.reserve_knowledge_source(
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
  return next;
end;
$$;

create function public.consume_message(
  p_project_id uuid,
  p_message_limit integer,
  p_conversation_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  usage_period timestamptz;
  current_month timestamptz;
  used integer;
begin
  if p_message_limit is null or p_message_limit < 1 then
    raise sqlstate 'PT400' using message = 'Invalid message limit';
  end if;

  select messages_used, period_start into used, usage_period
  from public.projects
  where id = p_project_id
  for no key update;
  if not found then
    raise sqlstate 'PT404' using message = 'Project not found';
  end if;

  if p_conversation_id is not null then
    perform 1 from public.conversations
    where id = p_conversation_id and project_id = p_project_id
    for share;
    if not found then
      raise sqlstate 'PT404' using message = 'Conversation not found';
    end if;
  end if;

  current_month := date_trunc('month', clock_timestamp(), 'UTC');
  if usage_period < current_month then
    used := 0;
    usage_period := current_month;
  end if;
  if used >= p_message_limit then
    raise sqlstate 'PT429' using message = 'Monthly message limit reached';
  end if;

  update public.projects
  set messages_used = used + 1, period_start = usage_period
  where id = p_project_id
  returning messages_used into used;
  return used;
end;
$$;

create function public.save_chat_turn(
  p_project_id uuid,
  p_visitor_id text,
  p_message text,
  p_reply text,
  p_conversation_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conversation uuid;
  sent_at timestamptz;
begin
  if p_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    select id, p_visitor_id from public.projects where id = p_project_id
    returning id into conversation;
    if not found then
      raise sqlstate 'PT404' using message = 'Project not found';
    end if;
  else
    select id into conversation from public.conversations
    where id = p_conversation_id and project_id = p_project_id
    for no key update;
    if not found then
      raise sqlstate 'PT404' using message = 'Conversation not found';
    end if;
  end if;

  -- Keep the visitor and bot in order, even when two turns have the same clock time.
  select greatest(clock_timestamp(), max(created_at) + interval '1 microsecond')
  into sent_at
  from public.messages
  where conversation_id = conversation;

  insert into public.messages (conversation_id, role, body, created_at)
  values
    (conversation, 'visitor', p_message, sent_at),
    (conversation, 'bot', p_reply, sent_at + interval '1 microsecond');

  return conversation;
end;
$$;

create function public.match_chunks(p_project_id uuid, p_embedding extensions.vector)
returns table (id uuid, source_id uuid, content text, distance double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Filter first so closer vectors in another project or status cannot reduce the result count.
  with candidates as materialized (
    select c.id, c.source_id, c.content, c.embedding
    from public.knowledge_chunks c
    join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
    where c.project_id = p_project_id and s.status = 'ready'
  )
  select c.id, c.source_id, c.content, c.embedding operator(extensions.<=>) p_embedding as distance
  from candidates c
  order by distance, c.id
  limit 5;
$$;

create function public.owner_activity()
returns table (projects bigint, knowledge_sources bigint, conversations bigint, messages_this_month bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.projects),
    (select count(*) from public.knowledge_sources
      where status <> 'uploading' or created_at > statement_timestamp() - interval '2 hours'),
    (select count(*) from public.conversations),
    (select coalesce(sum(messages_used), 0) from public.projects
      where period_start >= date_trunc('month', statement_timestamp(), 'UTC'));
$$;

revoke all on function
  public.create_project(text, text, integer),
  public.reserve_knowledge_source(uuid, text, text, text, integer, text),
  public.consume_message(uuid, integer, uuid),
  public.save_chat_turn(uuid, text, text, text, uuid),
  public.match_chunks(uuid, extensions.vector),
  public.owner_activity()
from public, anon, authenticated, service_role;

grant execute on function
  public.create_project(text, text, integer),
  public.reserve_knowledge_source(uuid, text, text, text, integer, text),
  public.consume_message(uuid, integer, uuid),
  public.save_chat_turn(uuid, text, text, text, uuid),
  public.match_chunks(uuid, extensions.vector)
to service_role;

grant execute on function public.owner_activity() to authenticated;

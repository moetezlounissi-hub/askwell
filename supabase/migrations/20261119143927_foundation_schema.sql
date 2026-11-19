create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to service_role;

create schema private;
revoke all on schema private from public, anon, authenticated, service_role;

create table public.accounts (
  clerk_user_id text primary key check (clerk_user_id <> ''),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  public_key text not null unique check (public_key ~ '^pk_[A-Za-z0-9_-]{1,252}$'),
  messages_used integer not null default 0 check (messages_used >= 0),
  period_start timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null default '#000000' check (button_color ~ '^#[0-9A-Fa-f]{6}$'),
  position text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null default 'Ask us' check (char_length(btrim(label)) between 1 and 80),
  animation text not null default 'fade' check (animation in ('fade', 'slide', 'scale')),
  header_text text not null default 'Askwell' check (char_length(btrim(header_text)) between 1 and 120),
  show_badge boolean not null default true
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  type text not null check (type in ('text', 'pdf', 'md', 'txt')),
  storage_key text,
  status text not null default 'processing' check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  constraint knowledge_sources_storage_key_check check (
    (type = 'text' and storage_key is null) or
    (type <> 'text' and storage_key is not null and storage_key <> '')
  ),
  unique (project_id, id)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  source_id uuid not null,
  content text not null check (content <> ''),
  embedding extensions.vector(1536) not null,
  foreign key (project_id, source_id) references public.knowledge_sources (project_id, id) on delete cascade
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null check (visitor_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('visitor', 'bot')),
  body text not null,
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);
create index knowledge_chunks_project_source_idx on public.knowledge_chunks (project_id, source_id);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index conversations_project_created_at_idx on public.conversations (project_id, created_at desc);
create index messages_conversation_created_at_idx on public.messages (conversation_id, created_at);

create function private.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.projects
  where owner_id = (select auth.jwt() ->> 'sub');
$$;

create function private.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.conversations
  where project_id in (select private.owned_project_ids());
$$;

revoke all on function private.owned_project_ids(), private.owned_conversation_ids()
  from public, anon, authenticated, service_role;
grant execute on function private.owned_project_ids(), private.owned_conversation_ids()
  to authenticated;

alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy accounts_owner_select on public.accounts for select to authenticated
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));
create policy projects_owner_select on public.projects for select to authenticated
  using (id in (select private.owned_project_ids()));
create policy projects_owner_update on public.projects for update to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));
create policy projects_owner_delete on public.projects for delete to authenticated
  using (id in (select private.owned_project_ids()));
create policy widget_configs_owner_select on public.widget_configs for select to authenticated
  using (project_id in (select private.owned_project_ids()));
create policy knowledge_sources_owner_select on public.knowledge_sources for select to authenticated
  using (project_id in (select private.owned_project_ids()));
create policy knowledge_chunks_owner_select on public.knowledge_chunks for select to authenticated
  using (project_id in (select private.owned_project_ids()));
create policy conversations_owner_select on public.conversations for select to authenticated
  using (project_id in (select private.owned_project_ids()));
create policy messages_owner_select on public.messages for select to authenticated
  using (conversation_id in (select private.owned_conversation_ids()));

revoke all on table public.accounts, public.projects, public.widget_configs,
  public.knowledge_sources, public.knowledge_chunks, public.conversations, public.messages
  from public, anon, authenticated, service_role;
grant select on table public.accounts, public.projects, public.widget_configs,
  public.knowledge_sources, public.knowledge_chunks, public.conversations, public.messages
  to authenticated;
grant update (name), delete on public.projects to authenticated;
grant select, insert, update, delete on table public.accounts, public.projects, public.widget_configs,
  public.knowledge_sources, public.knowledge_chunks, public.conversations, public.messages
  to service_role;

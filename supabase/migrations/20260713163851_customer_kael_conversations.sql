-- Customer Kael has two conversation catalogs with different runtime roles:
-- normal is an always-on assistant, while case links to the authoritative
-- kael_chat_sessions workflow only after a real service has been identified.
-- This catalog lets both modes create an empty, durable conversation without
-- manufacturing a service type, job, estimate, or worker opportunity.

create table if not exists public.kael_customer_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles on delete cascade not null,
  chat_mode text not null check (chat_mode in ('normal', 'case')),
  case_session_id uuid references public.kael_chat_sessions on delete set null unique,
  client_request_id uuid not null,
  title text,
  pinned_at timestamptz,
  archived_at timestamptz,
  total_turns integer not null default 0 check (total_turns >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, chat_mode, client_request_id),
  unique (id, customer_id),
  constraint kael_customer_conversations_title_check
    check (title is null or char_length(btrim(title)) between 1 and 64),
  constraint kael_customer_conversations_case_link_check
    check (chat_mode = 'case' or case_session_id is null)
);

create table if not exists public.kael_customer_conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  customer_id uuid not null,
  turn_index integer not null check (turn_index > 0),
  role text not null check (role in ('customer', 'kael', 'system')),
  text_content text not null check (char_length(text_content) between 1 and 4000),
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint kael_customer_conversation_turns_owner_fk
    foreign key (conversation_id, customer_id)
    references public.kael_customer_conversations (id, customer_id)
    on delete cascade,
  unique (conversation_id, turn_index)
);

create unique index if not exists kael_customer_conversation_turns_request_idx
  on public.kael_customer_conversation_turns (conversation_id, client_request_id)
  where client_request_id is not null and role = 'customer';

create index if not exists kael_customer_conversations_customer_mode_active_idx
  on public.kael_customer_conversations
  (customer_id, chat_mode, pinned_at desc, updated_at desc)
  where archived_at is null;

create index if not exists kael_customer_conversations_case_session_idx
  on public.kael_customer_conversations (case_session_id)
  where case_session_id is not null;

create index if not exists kael_customer_conversation_turns_session_idx
  on public.kael_customer_conversation_turns (conversation_id, turn_index);

create or replace function public.append_customer_kael_conversation_exchange(
  p_conversation_id uuid,
  p_customer_id uuid,
  p_client_request_id uuid,
  p_customer_text text,
  p_kael_text text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_turns integer;
begin
  select conversations.total_turns
    into current_turns
  from public.kael_customer_conversations as conversations
  where conversations.id = p_conversation_id
    and conversations.customer_id = p_customer_id
    and conversations.archived_at is null
  for update;

  if not found then
    raise exception 'customer Kael conversation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.kael_customer_conversation_turns as turns
    where turns.conversation_id = p_conversation_id
      and turns.customer_id = p_customer_id
      and turns.client_request_id = p_client_request_id
  ) then
    return current_turns;
  end if;

  insert into public.kael_customer_conversation_turns (
    conversation_id,
    customer_id,
    turn_index,
    role,
    text_content,
    client_request_id
  ) values
    (p_conversation_id, p_customer_id, current_turns + 1, 'customer', p_customer_text, p_client_request_id),
    (p_conversation_id, p_customer_id, current_turns + 2, 'kael', p_kael_text, null);

  update public.kael_customer_conversations
  set total_turns = current_turns + 2
  where id = p_conversation_id
    and customer_id = p_customer_id;

  return current_turns + 2;
end;
$$;

revoke all on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text)
  to service_role;

drop trigger if exists kael_customer_conversations_updated_at
  on public.kael_customer_conversations;
create trigger kael_customer_conversations_updated_at
  before update on public.kael_customer_conversations
  for each row execute function public.update_updated_at();

-- Preserve existing Customer Case Work sessions in the new catalog. Using the
-- case session id as the fallback idempotency key keeps the backfill stable.
insert into public.kael_customer_conversations (
  id,
  customer_id,
  chat_mode,
  case_session_id,
  client_request_id,
  total_turns,
  created_at,
  updated_at
)
select
  sessions.id,
  sessions.customer_id,
  'case',
  sessions.id,
  coalesce(sessions.client_request_id, sessions.id),
  0,
  sessions.created_at,
  coalesce(sessions.updated_at, sessions.created_at)
from public.kael_chat_sessions as sessions
on conflict do nothing;

alter table public.kael_customer_conversations enable row level security;
alter table public.kael_customer_conversation_turns enable row level security;

drop policy if exists "Customers read own Kael conversations"
  on public.kael_customer_conversations;
create policy "Customers read own Kael conversations"
  on public.kael_customer_conversations for select
  to authenticated
  using ((select auth.uid()) = customer_id or private.is_admin());

drop policy if exists "Customers read own Kael conversation turns"
  on public.kael_customer_conversation_turns;
create policy "Customers read own Kael conversation turns"
  on public.kael_customer_conversation_turns for select
  to authenticated
  using ((select auth.uid()) = customer_id or private.is_admin());

grant select on public.kael_customer_conversations to authenticated;
grant select on public.kael_customer_conversation_turns to authenticated;
revoke all on public.kael_customer_conversations from anon;
revoke all on public.kael_customer_conversation_turns from anon;
revoke insert, update, delete on public.kael_customer_conversations from authenticated;
revoke insert, update, delete on public.kael_customer_conversation_turns from authenticated;
grant all on public.kael_customer_conversations to service_role;
grant all on public.kael_customer_conversation_turns to service_role;

comment on table public.kael_customer_conversations is
  'Owner-scoped Customer Kael conversation catalog. Case rows may link to authoritative Case Work; normal rows never fabricate service or job data.';
comment on table public.kael_customer_conversation_turns is
  'PII-scrubbed normal and Customer advisory turns. Linked workflow intake remains authoritative in kael_chat_turns.';
comment on column public.kael_customer_conversations.total_turns is
  'Count of catalog turns only. APIs add linked kael_chat_sessions turns for the visible session total.';

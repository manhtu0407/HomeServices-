-- Keep normal-chat vision findings and summaries attached to their source session turns.
begin;

alter table public.kael_customer_conversation_turns
  add column if not exists safe_metadata jsonb not null default '{}'::jsonb;
alter table public.kael_customer_conversation_turns
  drop constraint if exists kael_customer_conversation_turns_safe_metadata_check;
alter table public.kael_customer_conversation_turns
  add constraint kael_customer_conversation_turns_safe_metadata_check
  check (
    jsonb_typeof(safe_metadata) = 'object'
    and pg_catalog.pg_column_size(safe_metadata) <= 16384
  );

create or replace function public.append_customer_kael_conversation_exchange(
  p_conversation_id uuid,
  p_customer_id uuid,
  p_client_request_id uuid,
  p_customer_text text,
  p_media_refs text[],
  p_kael_text text,
  p_safe_metadata jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  current_turns integer;
  customer_media_refs text[] := coalesce(p_media_refs, '{}'::text[]);
  customer_turn_id uuid;
begin
  if p_conversation_id is null or p_customer_id is null or p_client_request_id is null
    or p_customer_text is null or p_kael_text is null
    or char_length(p_customer_text) > 2000
    or char_length(p_kael_text) not between 1 and 4000
    or cardinality(customer_media_refs) > 5
    or (char_length(p_customer_text) = 0 and cardinality(customer_media_refs) = 0)
    or p_safe_metadata is null
    or jsonb_typeof(p_safe_metadata) <> 'object'
    or pg_catalog.pg_column_size(p_safe_metadata) > 16384
  then
    raise exception 'invalid normal customer Kael exchange' using errcode = '22023';
  end if;

  select conversations.total_turns
    into current_turns
  from public.kael_customer_conversations as conversations
  where conversations.id = p_conversation_id
    and conversations.customer_id = p_customer_id
    and conversations.chat_mode = 'normal'
    and conversations.archived_at is null
  for update;

  if not found then
    raise exception 'customer Kael conversation not found' using errcode = 'P0002';
  end if;

  select turns.id
    into customer_turn_id
  from public.kael_customer_conversation_turns as turns
  where turns.conversation_id = p_conversation_id
    and turns.customer_id = p_customer_id
    and turns.client_request_id = p_client_request_id
    and turns.role = 'customer';
  if found then
    update public.kael_customer_conversation_turns
      set safe_metadata = p_safe_metadata
      where id = customer_turn_id
        and safe_metadata = '{}'::jsonb
        and p_safe_metadata <> '{}'::jsonb;
    return current_turns;
  end if;

  insert into public.kael_customer_conversation_turns (
    conversation_id, customer_id, turn_index, role, text_content,
    client_request_id, media_refs, safe_metadata
  ) values (
    p_conversation_id, p_customer_id, current_turns + 1, 'customer',
    p_customer_text, p_client_request_id, customer_media_refs, p_safe_metadata
  ) returning id into customer_turn_id;

  if p_safe_metadata ? 'normal_chat_image_analysis' then
    update public.kael_customer_conversation_turns
      set safe_metadata = pg_catalog.jsonb_set(
        p_safe_metadata,
        '{normal_chat_image_analysis}',
        (p_safe_metadata->'normal_chat_image_analysis') || pg_catalog.jsonb_build_object(
          'source_turn_id', customer_turn_id::text,
          'source_turn_index', current_turns + 1
        ),
        true
      )
      where id = customer_turn_id;
  end if;

  insert into public.kael_customer_conversation_turns (
    conversation_id, customer_id, turn_index, role, text_content,
    client_request_id, media_refs, safe_metadata
  ) values (
    p_conversation_id, p_customer_id, current_turns + 2, 'kael',
    p_kael_text, null, '{}'::text[], '{}'::jsonb
  );

  update public.kael_customer_conversations
  set total_turns = current_turns + 2
  where id = p_conversation_id
    and customer_id = p_customer_id;

  return current_turns + 2;
end;
$function$;

create or replace function public.append_customer_kael_conversation_exchange(
  p_conversation_id uuid,
  p_customer_id uuid,
  p_client_request_id uuid,
  p_customer_text text,
  p_media_refs text[],
  p_kael_text text
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select public.append_customer_kael_conversation_exchange(
    p_conversation_id, p_customer_id, p_client_request_id,
    p_customer_text, p_media_refs, p_kael_text, '{}'::jsonb
  );
$function$;

create or replace function public.append_customer_kael_conversation_exchange(
  p_conversation_id uuid,
  p_customer_id uuid,
  p_client_request_id uuid,
  p_customer_text text,
  p_kael_text text
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select public.append_customer_kael_conversation_exchange(
    p_conversation_id, p_customer_id, p_client_request_id,
    p_customer_text, '{}'::text[], p_kael_text, '{}'::jsonb
  );
$function$;

revoke all on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text[], text, jsonb)
  from public, anon, authenticated;
grant execute on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text[], text, jsonb)
  to service_role;
revoke all on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text[], text)
  to service_role;
revoke all on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text)
  to service_role;

create table if not exists public.kael_normal_chat_session_memory (
  actor_role text not null check (actor_role in ('customer', 'worker')),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  source_through_turn_index integer not null check (source_through_turn_index > 0),
  summary text not null check (char_length(summary) between 1 and 4000),
  facts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(facts) = 'array' and pg_catalog.pg_column_size(facts) <= 32768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (actor_role, actor_id, session_id)
);

create index if not exists kael_normal_chat_session_memory_session_idx
  on public.kael_normal_chat_session_memory (session_id, actor_role, actor_id);

alter table public.kael_normal_chat_session_memory enable row level security;
drop policy if exists "Users read own normal Kael session memory"
  on public.kael_normal_chat_session_memory;
create policy "Users read own normal Kael session memory"
  on public.kael_normal_chat_session_memory for select to authenticated
  using (
    actor_id = (select auth.uid())
    and (
      (actor_role = 'customer' and exists (
        select 1 from public.kael_customer_conversations as conversations
        where conversations.id = session_id
          and conversations.customer_id = (select auth.uid())
          and conversations.chat_mode = 'normal'
          and conversations.archived_at is null
      ))
      or (actor_role = 'worker' and exists (
        select 1 from public.kael_worker_chat_sessions as sessions
        where sessions.id = session_id
          and sessions.worker_id = (select auth.uid())
          and sessions.chat_mode = 'normal'
          and sessions.job_id is null
          and sessions.archived_at is null
      ))
    )
  );
revoke all on public.kael_normal_chat_session_memory from anon, authenticated;
grant select on public.kael_normal_chat_session_memory to authenticated;
grant all on public.kael_normal_chat_session_memory to service_role;

create or replace function public.upsert_kael_normal_chat_session_memory(
  p_actor_role text,
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision integer,
  p_source_through_turn_index integer,
  p_summary text,
  p_facts jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_revision integer;
  session_turns integer;
  changed_rows integer;
begin
  if p_actor_role not in ('customer', 'worker')
    or p_actor_role is null
    or p_actor_id is null
    or p_session_id is null
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_source_through_turn_index is null
    or p_source_through_turn_index <= 0
    or p_summary is null
    or char_length(p_summary) not between 1 and 4000
    or p_facts is null
    or jsonb_typeof(p_facts) <> 'array'
    or pg_catalog.pg_column_size(p_facts) > 32768
  then
    raise exception 'invalid normal Kael session memory' using errcode = '22023';
  end if;

  if p_actor_role = 'customer' then
    select conversations.total_turns into session_turns
    from public.kael_customer_conversations as conversations
    where conversations.id = p_session_id
      and conversations.customer_id = p_actor_id
      and conversations.chat_mode = 'normal'
      and conversations.archived_at is null
    for update;
  else
    select sessions.total_turns into session_turns
    from public.kael_worker_chat_sessions as sessions
    where sessions.id = p_session_id
      and sessions.worker_id = p_actor_id
      and sessions.chat_mode = 'normal'
      and sessions.job_id is null
      and sessions.archived_at is null
    for update;
  end if;
  if not found or p_source_through_turn_index > session_turns then
    raise exception 'normal Kael session memory source is outside its session' using errcode = '42501';
  end if;

  select memory.revision into current_revision
  from public.kael_normal_chat_session_memory as memory
  where memory.actor_role = p_actor_role
    and memory.actor_id = p_actor_id
    and memory.session_id = p_session_id
  for update;
  if not found then
    if p_expected_revision <> 0 then return false; end if;
    insert into public.kael_normal_chat_session_memory (
      actor_role, actor_id, session_id, revision,
      source_through_turn_index, summary, facts
    ) values (
      p_actor_role, p_actor_id, p_session_id, 1,
      p_source_through_turn_index, p_summary, p_facts
    ) on conflict (actor_role, actor_id, session_id) do nothing;
    get diagnostics changed_rows = row_count;
    return changed_rows = 1;
  end if;

  if current_revision <> p_expected_revision then return false; end if;
  update public.kael_normal_chat_session_memory
  set revision = current_revision + 1,
      source_through_turn_index = p_source_through_turn_index,
      summary = p_summary,
      facts = p_facts,
      updated_at = now()
  where actor_role = p_actor_role
    and actor_id = p_actor_id
    and session_id = p_session_id
    and revision = p_expected_revision
    and source_through_turn_index < p_source_through_turn_index;
  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$function$;

revoke all on function public.upsert_kael_normal_chat_session_memory(text, uuid, uuid, integer, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_kael_normal_chat_session_memory(text, uuid, uuid, integer, integer, text, jsonb)
  to service_role;

comment on table public.kael_normal_chat_session_memory is
  'Private per-session DeepSeek summaries for Customer and Worker normal chat; the source transcript remains authoritative.';
comment on column public.kael_normal_chat_session_memory.facts is
  'Compact facts with source turn indices and ids; read only with the exact actor role and session key.';

commit;

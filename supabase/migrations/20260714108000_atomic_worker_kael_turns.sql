-- Serialize worker Kael provider ownership and enforce the job-scoped Q&A cap in Postgres.

begin;

alter table public.kael_worker_chat_turns
  add column if not exists source_turn_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'kael_worker_chat_turns_source_turn_id_fkey'
      and conrelid = 'public.kael_worker_chat_turns'::pg_catalog.regclass
  ) then
    alter table public.kael_worker_chat_turns
      add constraint kael_worker_chat_turns_source_turn_id_fkey
      foreign key (source_turn_id)
      references public.kael_worker_chat_turns(id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists kael_worker_chat_turns_source_once_idx
  on public.kael_worker_chat_turns (source_turn_id)
  where source_turn_id is not null;

create table if not exists public.kael_worker_chat_turn_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.kael_worker_chat_sessions(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  content_type text not null check (content_type in ('text', 'photo_attached')),
  text_content text not null check (char_length(text_content) between 1 and 1200),
  media_refs text[] not null default '{}'::text[],
  source_job_status public.job_status not null,
  status text not null check (status in ('in_flight', 'retryable', 'completed')),
  claim_id uuid,
  claimed_at timestamptz,
  worker_turn_id uuid not null references public.kael_worker_chat_turns(id) on delete cascade,
  assistant_turn_id uuid references public.kael_worker_chat_turns(id) on delete set null,
  attempt_count integer not null default 1 check (attempt_count > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, client_request_id),
  unique (worker_turn_id),
  check (
    (status = 'completed' and assistant_turn_id is not null and completed_at is not null
      and claim_id is null and claimed_at is null)
    or (status = 'in_flight' and assistant_turn_id is null and completed_at is null
      and claim_id is not null and claimed_at is not null)
    or (status = 'retryable' and assistant_turn_id is null and completed_at is null
      and claim_id is null and claimed_at is null)
  )
);

create unique index if not exists kael_worker_chat_turn_requests_one_unresolved_idx
  on public.kael_worker_chat_turn_requests (session_id)
  where status in ('in_flight', 'retryable');

create index if not exists kael_worker_chat_turn_requests_lease_idx
  on public.kael_worker_chat_turn_requests (status, claimed_at)
  where status = 'in_flight';

alter table public.kael_worker_chat_turn_requests enable row level security;

revoke all on public.kael_worker_chat_turn_requests from public, anon, authenticated;
grant all on public.kael_worker_chat_turn_requests to service_role;

drop trigger if exists kael_worker_chat_turn_requests_updated_at
  on public.kael_worker_chat_turn_requests;
create trigger kael_worker_chat_turn_requests_updated_at
  before update on public.kael_worker_chat_turn_requests
  for each row execute function public.update_updated_at();

create or replace function public.claim_worker_kael_chat_turn_atomic(
  p_session_id uuid,
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_claim_id uuid,
  p_content_type text,
  p_text_content text,
  p_media_refs text[],
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  ok boolean,
  error_code text,
  claimed boolean,
  completed boolean,
  request_id uuid,
  worker_turn_id uuid,
  assistant_turn_id uuid,
  worker_turn_index integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.kael_worker_chat_sessions%rowtype;
  v_job_status public.job_status;
  v_request public.kael_worker_chat_turn_requests%rowtype;
  v_blocking_request public.kael_worker_chat_turn_requests%rowtype;
  v_worker_turn public.kael_worker_chat_turns%rowtype;
  v_assistant_turn public.kael_worker_chat_turns%rowtype;
  v_worker_turn_index integer;
begin
  if p_session_id is null or p_job_id is null or p_worker_id is null
    or p_client_request_id is null or p_claim_id is null or p_now is null
    or p_content_type not in ('text', 'photo_attached')
    or pg_catalog.btrim(coalesce(p_text_content, '')) = ''
    or pg_catalog.char_length(p_text_content) > 1200
    or p_media_refs is null
    or pg_catalog.cardinality(p_media_refs) > 5
    or (p_content_type = 'text' and pg_catalog.cardinality(p_media_refs) <> 0)
    or (p_content_type = 'photo_attached' and pg_catalog.cardinality(p_media_refs) = 0)
    or exists (
      select 1
      from pg_catalog.unnest(p_media_refs) as media_ref(value)
      where media_ref.value is null
        or pg_catalog.btrim(media_ref.value) = ''
        or pg_catalog.char_length(media_ref.value) > 500
        or media_ref.value !~* (
          '^supabase://job-media/' || p_job_id::text
          || '/kael_reference/[^[:space:]?#]+$'
        )
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.unnest(p_media_refs) as media_ref(value)
    ) <> (
      select pg_catalog.count(distinct media_ref.value)
      from pg_catalog.unnest(p_media_refs) as media_ref(value)
    )
  then
    return query select false, 'INVALID_INPUT'::text, false, false,
      null::uuid, null::uuid, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  select *
    into v_session
    from public.kael_worker_chat_sessions
    where id = p_session_id
    for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false,
      null::uuid, null::uuid, null::uuid, null::integer, null::timestamptz;
    return;
  end if;
  if v_session.job_id is distinct from p_job_id
    or v_session.worker_id is distinct from p_worker_id
  then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false,
      null::uuid, null::uuid, null::uuid, null::integer, null::timestamptz;
    return;
  end if;
  if v_session.status <> 'active' then
    return query select false, 'INVALID_STATUS'::text, false, false,
      null::uuid, null::uuid, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  select status
    into v_job_status
    from public.jobs
    where id = p_job_id
      and worker_id = p_worker_id
    for share;
  if not found then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false,
      null::uuid, null::uuid, null::uuid, null::integer, null::timestamptz;
    return;
  end if;
  if v_job_status not in (
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
    'completed_by_worker'
  ) then
    return query select false, 'INVALID_STATUS'::text, false, false,
      null::uuid, null::uuid, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  select *
    into v_request
    from public.kael_worker_chat_turn_requests
    where session_id = p_session_id
      and client_request_id = p_client_request_id
    for update;
  if found then
    if v_request.job_id is distinct from p_job_id
      or v_request.worker_id is distinct from p_worker_id
      or v_request.content_type is distinct from p_content_type
      or v_request.text_content is distinct from p_text_content
      or v_request.media_refs is distinct from p_media_refs
    then
      return query select false, 'IDEMPOTENCY_CONFLICT'::text, false, false,
        v_request.id, v_request.worker_turn_id, v_request.assistant_turn_id,
        null::integer, null::timestamptz;
      return;
    end if;

    select *
      into v_worker_turn
      from public.kael_worker_chat_turns
      where id = v_request.worker_turn_id
        and session_id = p_session_id
        and job_id = p_job_id
        and role = 'worker'
      for update;
    if not found
      or v_worker_turn.client_request_id is distinct from p_client_request_id::text
      or v_worker_turn.content_type is distinct from p_content_type
      or v_worker_turn.text_content is distinct from p_text_content
      or v_worker_turn.media_refs is distinct from p_media_refs
    then
      return query select false, 'SOURCE_TURN_INVALID'::text, false, false,
        v_request.id, v_request.worker_turn_id, v_request.assistant_turn_id,
        null::integer, null::timestamptz;
      return;
    end if;

    if v_request.status = 'completed' then
      select *
        into v_assistant_turn
        from public.kael_worker_chat_turns
        where id = v_request.assistant_turn_id
          and session_id = p_session_id
          and job_id = p_job_id
          and role = 'kael'
          and source_turn_id = v_worker_turn.id
          and turn_index = v_worker_turn.turn_index + 1
        for update;
      if not found then
        return query select false, 'SOURCE_TURN_INVALID'::text, false, false,
          v_request.id, v_request.worker_turn_id, v_request.assistant_turn_id,
          v_worker_turn.turn_index, null::timestamptz;
        return;
      end if;
      return query select true, null::text, false, true,
        v_request.id, v_request.worker_turn_id, v_request.assistant_turn_id,
        v_worker_turn.turn_index, null::timestamptz;
      return;
    end if;
    if v_request.status = 'in_flight'
      and v_request.claimed_at >= p_now - interval '5 minutes'
    then
      return query select false, 'REQUEST_IN_PROGRESS'::text, false, false,
        v_request.id, v_request.worker_turn_id, null::uuid,
        v_worker_turn.turn_index, v_request.claimed_at + interval '5 minutes';
      return;
    end if;
    if v_request.source_job_status is distinct from v_job_status then
      return query select false, 'SOURCE_STATUS_STALE'::text, false, false,
        v_request.id, v_request.worker_turn_id, null::uuid,
        v_worker_turn.turn_index, null::timestamptz;
      return;
    end if;

    update public.kael_worker_chat_turn_requests
      set status = 'in_flight',
          claim_id = p_claim_id,
          claimed_at = p_now,
          attempt_count = v_request.attempt_count + 1
      where id = v_request.id
      returning * into v_request;
    return query select true, null::text, true, false,
      v_request.id, v_request.worker_turn_id, null::uuid,
      v_worker_turn.turn_index, p_now + interval '5 minutes';
    return;
  end if;

  select *
    into v_blocking_request
    from public.kael_worker_chat_turn_requests
    where session_id = p_session_id
      and status in ('in_flight', 'retryable')
    order by created_at, id
    limit 1
    for update;
  if found then
    return query select false, 'SESSION_TURN_IN_PROGRESS'::text, false, false,
      v_blocking_request.id, v_blocking_request.worker_turn_id, null::uuid,
      null::integer,
      case when v_blocking_request.status = 'in_flight'
        then v_blocking_request.claimed_at + interval '5 minutes'
        else null::timestamptz
      end;
    return;
  end if;

  select *
    into v_worker_turn
    from public.kael_worker_chat_turns
    where session_id = p_session_id
      and client_request_id = p_client_request_id::text
    for update;
  if found then
    if v_worker_turn.job_id is distinct from p_job_id
      or v_worker_turn.role <> 'worker'
      or v_worker_turn.content_type is distinct from p_content_type
      or v_worker_turn.text_content is distinct from p_text_content
      or v_worker_turn.media_refs is distinct from p_media_refs
    then
      return query select false, 'IDEMPOTENCY_CONFLICT'::text, false, false,
        null::uuid, v_worker_turn.id, null::uuid,
        v_worker_turn.turn_index, null::timestamptz;
      return;
    end if;

    select *
      into v_assistant_turn
      from public.kael_worker_chat_turns
      where source_turn_id = v_worker_turn.id
      for update;
    if found and (
      v_assistant_turn.session_id is distinct from p_session_id
      or v_assistant_turn.job_id is distinct from p_job_id
      or v_assistant_turn.role <> 'kael'
      or v_assistant_turn.turn_index <> v_worker_turn.turn_index + 1
    ) then
      return query select false, 'SOURCE_TURN_INVALID'::text, false, false,
        null::uuid, v_worker_turn.id, v_assistant_turn.id,
        v_worker_turn.turn_index, null::timestamptz;
      return;
    end if;

    if v_assistant_turn.id is null then
      select *
        into v_assistant_turn
        from public.kael_worker_chat_turns
      where session_id = p_session_id
        and turn_index = v_worker_turn.turn_index + 1
        and role = 'kael'
      for update;
      if found then
        if v_assistant_turn.source_turn_id is null then
          update public.kael_worker_chat_turns
            set source_turn_id = v_worker_turn.id
            where id = v_assistant_turn.id
              and source_turn_id is null
            returning * into v_assistant_turn;
        elsif v_assistant_turn.source_turn_id is distinct from v_worker_turn.id then
          return query select false, 'SOURCE_TURN_INVALID'::text, false, false,
            null::uuid, v_worker_turn.id, v_assistant_turn.id,
            v_worker_turn.turn_index, null::timestamptz;
          return;
        end if;
      end if;
    end if;

    if v_assistant_turn.id is not null then
      insert into public.kael_worker_chat_turn_requests (
        session_id, job_id, worker_id, client_request_id,
        content_type, text_content, media_refs, source_job_status,
        status, worker_turn_id, assistant_turn_id, completed_at
      ) values (
        p_session_id, p_job_id, p_worker_id, p_client_request_id,
        p_content_type, p_text_content, p_media_refs, v_job_status,
        'completed', v_worker_turn.id, v_assistant_turn.id, p_now
      ) returning * into v_request;
      return query select true, null::text, false, true,
        v_request.id, v_worker_turn.id, v_assistant_turn.id,
        v_worker_turn.turn_index, null::timestamptz;
      return;
    end if;

    update public.kael_worker_chat_sessions
      set total_turns = greatest(total_turns, v_worker_turn.turn_index)
      where id = p_session_id
      returning * into v_session;
    insert into public.kael_worker_chat_turn_requests (
      session_id, job_id, worker_id, client_request_id,
      content_type, text_content, media_refs, source_job_status,
      status, claim_id, claimed_at, worker_turn_id
    ) values (
      p_session_id, p_job_id, p_worker_id, p_client_request_id,
      p_content_type, p_text_content, p_media_refs, v_job_status,
      'in_flight', p_claim_id, p_now, v_worker_turn.id
    ) returning * into v_request;
    return query select true, null::text, true, false,
      v_request.id, v_worker_turn.id, null::uuid,
      v_worker_turn.turn_index, p_now + interval '5 minutes';
    return;
  end if;

  v_worker_turn_index := v_session.total_turns + 1;
  insert into public.kael_worker_chat_turns (
    session_id, job_id, turn_index, role, content_type,
    text_content, media_refs, client_request_id, safe_metadata
  ) values (
    p_session_id, p_job_id, v_worker_turn_index, 'worker', p_content_type,
    p_text_content, p_media_refs, p_client_request_id::text, '{}'::jsonb
  ) returning * into v_worker_turn;

  insert into public.kael_worker_chat_turn_requests (
    session_id, job_id, worker_id, client_request_id,
    content_type, text_content, media_refs, source_job_status,
    status, claim_id, claimed_at, worker_turn_id
  ) values (
    p_session_id, p_job_id, p_worker_id, p_client_request_id,
    p_content_type, p_text_content, p_media_refs, v_job_status,
    'in_flight', p_claim_id, p_now, v_worker_turn.id
  ) returning * into v_request;

  update public.kael_worker_chat_sessions
    set total_turns = v_worker_turn_index
    where id = p_session_id;

  return query select true, null::text, true, false,
    v_request.id, v_worker_turn.id, null::uuid,
    v_worker_turn_index, p_now + interval '5 minutes';
end;
$function$;

create or replace function public.complete_worker_kael_chat_turn_atomic(
  p_request_id uuid,
  p_claim_id uuid,
  p_session_id uuid,
  p_job_id uuid,
  p_worker_id uuid,
  p_worker_turn_id uuid,
  p_content_type text,
  p_text_content text,
  p_safe_metadata jsonb,
  p_ai_provider public.api_provider,
  p_ai_model text,
  p_latency_ms integer,
  p_cost_usd numeric,
  p_session_metadata_patch jsonb,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  ok boolean,
  error_code text,
  applied boolean,
  completed boolean,
  stale boolean,
  assistant_turn_id uuid,
  assistant_turn_index integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.kael_worker_chat_sessions%rowtype;
  v_request public.kael_worker_chat_turn_requests%rowtype;
  v_worker_turn public.kael_worker_chat_turns%rowtype;
  v_assistant_turn public.kael_worker_chat_turns%rowtype;
  v_job_status public.job_status;
begin
  if p_request_id is null or p_claim_id is null or p_session_id is null
    or p_job_id is null or p_worker_id is null or p_worker_turn_id is null
    or p_now is null or p_content_type not in ('text', 'guidance')
    or pg_catalog.btrim(coalesce(p_text_content, '')) = ''
    or pg_catalog.char_length(p_text_content) > 5000
    or p_safe_metadata is null
    or pg_catalog.jsonb_typeof(p_safe_metadata) <> 'object'
    or pg_catalog.octet_length(p_safe_metadata::text) > 16384
    or p_session_metadata_patch is null
    or pg_catalog.jsonb_typeof(p_session_metadata_patch) <> 'object'
    or pg_catalog.octet_length(p_session_metadata_patch::text) > 4096
    or not (
      p_safe_metadata ? 'redirect_scope_change'
      and p_safe_metadata ? 'fallback_used'
      and p_session_metadata_patch ? 'latest_redirect_scope_change'
      and p_session_metadata_patch ? 'latest_fallback_used'
    )
    or pg_catalog.jsonb_typeof(p_safe_metadata->'redirect_scope_change') <> 'boolean'
    or pg_catalog.jsonb_typeof(p_safe_metadata->'fallback_used') <> 'boolean'
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_session_metadata_patch) as metadata_key(value)
      where metadata_key.value not in (
        'latest_redirect_scope_change',
        'latest_fallback_used'
      )
    )
    or (
      p_session_metadata_patch ? 'latest_redirect_scope_change'
      and pg_catalog.jsonb_typeof(p_session_metadata_patch->'latest_redirect_scope_change') <> 'boolean'
    )
    or (
      p_session_metadata_patch ? 'latest_fallback_used'
      and pg_catalog.jsonb_typeof(p_session_metadata_patch->'latest_fallback_used') <> 'boolean'
    )
    or p_safe_metadata->'redirect_scope_change'
      is distinct from p_session_metadata_patch->'latest_redirect_scope_change'
    or p_safe_metadata->'fallback_used'
      is distinct from p_session_metadata_patch->'latest_fallback_used'
    or p_latency_ms is not null and (p_latency_ms < 0 or p_latency_ms > 3600000)
    or p_cost_usd is null or p_cost_usd < 0 or p_cost_usd > 100
    or (p_ai_provider is null and p_ai_model is not null)
    or pg_catalog.char_length(coalesce(p_ai_model, '')) > 200
  then
    return query select false, 'INVALID_INPUT'::text, false, false, false,
      null::uuid, null::integer;
    return;
  end if;

  select *
    into v_session
    from public.kael_worker_chat_sessions
    where id = p_session_id
    for update;
  if not found
    or v_session.job_id is distinct from p_job_id
    or v_session.worker_id is distinct from p_worker_id
  then
    return query select false, 'NOT_FOUND'::text, false, false, false,
      null::uuid, null::integer;
    return;
  end if;

  select *
    into v_request
    from public.kael_worker_chat_turn_requests
    where id = p_request_id
    for update;
  if not found
    or v_request.session_id is distinct from p_session_id
    or v_request.job_id is distinct from p_job_id
    or v_request.worker_id is distinct from p_worker_id
    or v_request.worker_turn_id is distinct from p_worker_turn_id
  then
    return query select false, 'REQUEST_INVALID'::text, false, false, false,
      null::uuid, null::integer;
    return;
  end if;

  if v_request.status = 'completed' then
    select *
      into v_assistant_turn
      from public.kael_worker_chat_turns
      where id = v_request.assistant_turn_id
        and source_turn_id = p_worker_turn_id;
    if not found
      or v_assistant_turn.content_type is distinct from p_content_type
      or v_assistant_turn.text_content is distinct from p_text_content
      or v_assistant_turn.safe_metadata is distinct from p_safe_metadata
      or v_assistant_turn.ai_provider is distinct from p_ai_provider
      or v_assistant_turn.ai_model is distinct from p_ai_model
      or v_assistant_turn.latency_ms is distinct from p_latency_ms
      or coalesce(v_assistant_turn.cost_usd, 0) is distinct from p_cost_usd
    then
      return query select false, 'IDEMPOTENCY_CONFLICT'::text, false, true, false,
        v_request.assistant_turn_id, null::integer;
      return;
    end if;
    return query select true, null::text, false, true, false,
      v_assistant_turn.id, v_assistant_turn.turn_index;
    return;
  end if;

  if v_request.status <> 'in_flight'
    or v_request.claim_id is distinct from p_claim_id
  then
    return query select false, 'CLAIM_STALE'::text, false, false, false,
      null::uuid, null::integer;
    return;
  end if;

  select status
    into v_job_status
    from public.jobs
    where id = p_job_id
      and worker_id = p_worker_id
    for share;
  select *
    into v_worker_turn
    from public.kael_worker_chat_turns
    where id = p_worker_turn_id
      and session_id = p_session_id
      and job_id = p_job_id
      and role = 'worker'
      and client_request_id = v_request.client_request_id::text
    for share;

  if v_session.status <> 'active'
    or v_job_status is distinct from v_request.source_job_status
    or v_job_status not in (
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker'
    )
    or v_worker_turn.id is null
    or v_session.total_turns <> v_worker_turn.turn_index
    or exists (
      select 1
      from public.kael_worker_chat_turns as answer_turn
      where answer_turn.source_turn_id = p_worker_turn_id
    )
  then
    update public.kael_worker_chat_turn_requests
      set status = 'retryable', claim_id = null, claimed_at = null
      where id = p_request_id
        and claim_id = p_claim_id;
    return query select true, null::text, false, false, true,
      null::uuid, null::integer;
    return;
  end if;

  insert into public.kael_worker_chat_turns (
    session_id, job_id, turn_index, role, content_type,
    text_content, media_refs, safe_metadata, source_turn_id,
    ai_provider, ai_model, latency_ms, cost_usd
  ) values (
    p_session_id, p_job_id, v_worker_turn.turn_index + 1, 'kael', p_content_type,
    p_text_content, '{}'::text[], p_safe_metadata, p_worker_turn_id,
    p_ai_provider, p_ai_model, p_latency_ms, p_cost_usd
  ) returning * into v_assistant_turn;

  update public.kael_worker_chat_sessions
    set total_turns = v_assistant_turn.turn_index,
        total_cost_usd = total_cost_usd + p_cost_usd,
        safe_metadata = safe_metadata || p_session_metadata_patch
    where id = p_session_id;

  update public.kael_worker_chat_turn_requests
    set status = 'completed',
        assistant_turn_id = v_assistant_turn.id,
        completed_at = p_now,
        claim_id = null,
        claimed_at = null
    where id = p_request_id;

  return query select true, null::text, true, true, false,
    v_assistant_turn.id, v_assistant_turn.turn_index;
end;
$function$;

create or replace function public.release_worker_kael_chat_turn_claim_atomic(
  p_request_id uuid,
  p_claim_id uuid,
  p_session_id uuid,
  p_worker_id uuid,
  p_discard boolean default false,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (released boolean, discarded boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.kael_worker_chat_sessions%rowtype;
  v_request public.kael_worker_chat_turn_requests%rowtype;
  v_worker_turn public.kael_worker_chat_turns%rowtype;
begin
  if p_request_id is null or p_claim_id is null or p_session_id is null
    or p_worker_id is null or p_discard is null or p_now is null
  then
    return query select false, false;
    return;
  end if;

  select *
    into v_session
    from public.kael_worker_chat_sessions
    where id = p_session_id
      and worker_id = p_worker_id
    for update;
  if not found then
    return query select false, false;
    return;
  end if;

  select *
    into v_request
    from public.kael_worker_chat_turn_requests
    where id = p_request_id
      and session_id = p_session_id
      and worker_id = p_worker_id
    for update;
  if not found
    or v_request.status <> 'in_flight'
    or v_request.claim_id is distinct from p_claim_id
  then
    return query select false, false;
    return;
  end if;

  select *
    into v_worker_turn
    from public.kael_worker_chat_turns
    where id = v_request.worker_turn_id
      and session_id = p_session_id
      and role = 'worker'
    for update;

  if p_discard
    and found
    and v_session.total_turns = v_worker_turn.turn_index
    and not exists (
      select 1
      from public.kael_worker_chat_turns as answer_turn
      where answer_turn.source_turn_id = v_worker_turn.id
    )
  then
    delete from public.kael_worker_chat_turn_requests
      where id = p_request_id;
    delete from public.kael_worker_chat_turns
      where id = v_worker_turn.id;
    update public.kael_worker_chat_sessions
      set total_turns = greatest(0, v_worker_turn.turn_index - 1)
      where id = p_session_id;
    return query select true, true;
    return;
  end if;

  update public.kael_worker_chat_turn_requests
    set status = 'retryable',
        claim_id = null,
        claimed_at = null,
        updated_at = p_now
    where id = p_request_id;
  return query select true, false;
end;
$function$;

create or replace function public.record_worker_kael_qa_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_question text,
  p_answer jsonb,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  ok boolean,
  error_code text,
  qa_id uuid,
  remaining_questions integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job_status public.job_status;
  v_used integer;
  v_qa_id uuid;
begin
  if p_job_id is null or p_worker_id is null or p_now is null
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_question, ''))) not between 3 and 1000
    or p_answer is null
    or pg_catalog.jsonb_typeof(p_answer) <> 'object'
    or pg_catalog.octet_length(p_answer::text) > 16384
  then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::integer;
    return;
  end if;

  select status
    into v_job_status
    from public.jobs
    where id = p_job_id
      and worker_id = p_worker_id
    for update;
  if not found then
    return query select false, 'AUTH_FORBIDDEN'::text, null::uuid, null::integer;
    return;
  end if;
  if v_job_status not in (
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
    'completed_by_worker'
  ) then
    return query select false, 'INVALID_STATUS'::text, null::uuid, null::integer;
    return;
  end if;

  select pg_catalog.count(*)::integer
    into v_used
    from public.kael_worker_qa_log
    where job_id = p_job_id
      and worker_id = p_worker_id;
  if v_used >= 3 then
    return query select false, 'KAEL_QA_LIMIT_REACHED'::text, null::uuid, 0;
    return;
  end if;

  insert into public.kael_worker_qa_log (
    job_id, worker_id, question, answer, created_at
  ) values (
    p_job_id, p_worker_id, pg_catalog.btrim(p_question), p_answer, p_now
  ) returning id into v_qa_id;

  return query select true, null::text, v_qa_id, 2 - v_used;
end;
$function$;

revoke execute on function public.claim_worker_kael_chat_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_worker_kael_chat_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) to service_role;

revoke execute on function public.complete_worker_kael_chat_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  public.api_provider, text, integer, numeric, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_worker_kael_chat_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  public.api_provider, text, integer, numeric, jsonb, timestamptz
) to service_role;

revoke execute on function public.release_worker_kael_chat_turn_claim_atomic(
  uuid, uuid, uuid, uuid, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.release_worker_kael_chat_turn_claim_atomic(
  uuid, uuid, uuid, uuid, boolean, timestamptz
) to service_role;

revoke execute on function public.record_worker_kael_qa_atomic(
  uuid, uuid, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_worker_kael_qa_atomic(
  uuid, uuid, text, jsonb, timestamptz
) to service_role;

comment on table public.kael_worker_chat_turn_requests is
  'Durable service-only provider lease and completion state for one worker Kael source turn.';
comment on column public.kael_worker_chat_turns.source_turn_id is
  'Worker source turn that produced this single assistant turn.';
comment on function public.claim_worker_kael_chat_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) is
  'Binds a durable worker request payload, serializes a session, and grants at most one provider lease.';
comment on function public.complete_worker_kael_chat_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  public.api_provider, text, integer, numeric, jsonb, timestamptz
) is
  'Atomically appends the source-bound assistant turn, cost, session count, and completed request state.';
comment on function public.record_worker_kael_qa_atomic(
  uuid, uuid, text, jsonb, timestamptz
) is
  'Serializes the fixed three-question worker clarification cap on the authoritative job row.';

commit;

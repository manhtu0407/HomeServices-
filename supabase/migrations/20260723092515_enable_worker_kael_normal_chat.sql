-- Keep general worker conversations independent from job-scoped intake chats.
begin;

update public.kael_worker_chat_sessions
set chat_mode = 'intake'
where chat_mode = 'normal'
  and job_id is not null;

alter table public.kael_worker_chat_sessions
  alter column job_id drop not null;

alter table public.kael_worker_chat_turns
  alter column job_id drop not null;

alter table public.kael_worker_chat_turn_requests
  alter column job_id drop not null,
  alter column source_job_status drop not null;

alter table public.kael_worker_chat_sessions
  drop constraint if exists kael_worker_chat_sessions_chat_mode_check;

alter table public.kael_worker_chat_sessions
  add constraint kael_worker_chat_sessions_chat_mode_check
  check (
    (chat_mode = 'normal' and job_id is null)
    or (chat_mode = 'intake' and job_id is not null)
  );

drop index if exists public.kael_worker_chat_sessions_worker_job_mode_idempotency_idx;

create unique index if not exists kael_worker_chat_sessions_intake_idempotency_idx
  on public.kael_worker_chat_sessions (
    worker_id,
    job_id,
    chat_mode,
    client_request_id
  )
  where chat_mode = 'intake'
    and job_id is not null
    and client_request_id is not null;

create unique index if not exists kael_worker_chat_sessions_normal_idempotency_idx
  on public.kael_worker_chat_sessions (
    worker_id,
    chat_mode,
    client_request_id
  )
  where chat_mode = 'normal'
    and job_id is null
    and client_request_id is not null;

create or replace function public.claim_worker_kael_general_turn_atomic(
  p_session_id uuid,
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
  v_request public.kael_worker_chat_turn_requests%rowtype;
  v_blocking_request public.kael_worker_chat_turn_requests%rowtype;
  v_worker_turn public.kael_worker_chat_turns%rowtype;
  v_assistant_turn public.kael_worker_chat_turns%rowtype;
  v_worker_turn_index integer;
begin
  if p_session_id is null or p_worker_id is null
    or p_client_request_id is null or p_claim_id is null or p_now is null
    or p_content_type <> 'text'
    or pg_catalog.btrim(coalesce(p_text_content, '')) = ''
    or pg_catalog.char_length(p_text_content) > 1200
    or p_media_refs is null
    or pg_catalog.cardinality(p_media_refs) <> 0
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
  if v_session.worker_id is distinct from p_worker_id
    or v_session.chat_mode <> 'normal'
    or v_session.job_id is not null
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

  select *
    into v_request
    from public.kael_worker_chat_turn_requests
    where session_id = p_session_id
      and client_request_id = p_client_request_id
    for update;
  if found then
    if v_request.job_id is not null
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
        and job_id is null
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
          and job_id is null
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
    if v_worker_turn.job_id is not null
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
      or v_assistant_turn.job_id is not null
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
        if v_assistant_turn.job_id is not null then
          return query select false, 'SOURCE_TURN_INVALID'::text, false, false,
            null::uuid, v_worker_turn.id, v_assistant_turn.id,
            v_worker_turn.turn_index, null::timestamptz;
          return;
        elsif v_assistant_turn.source_turn_id is null then
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
        p_session_id, null, p_worker_id, p_client_request_id,
        p_content_type, p_text_content, p_media_refs, null,
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
      p_session_id, null, p_worker_id, p_client_request_id,
      p_content_type, p_text_content, p_media_refs, null,
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
    p_session_id, null, v_worker_turn_index, 'worker', p_content_type,
    p_text_content, p_media_refs, p_client_request_id::text, '{}'::jsonb
  ) returning * into v_worker_turn;

  insert into public.kael_worker_chat_turn_requests (
    session_id, job_id, worker_id, client_request_id,
    content_type, text_content, media_refs, source_job_status,
    status, claim_id, claimed_at, worker_turn_id
  ) values (
    p_session_id, null, p_worker_id, p_client_request_id,
    p_content_type, p_text_content, p_media_refs, null,
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

create or replace function public.complete_worker_kael_general_turn_atomic(
  p_request_id uuid,
  p_claim_id uuid,
  p_session_id uuid,
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
begin
  if p_request_id is null or p_claim_id is null or p_session_id is null
    or p_worker_id is null or p_worker_turn_id is null
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
    or v_session.worker_id is distinct from p_worker_id
    or v_session.chat_mode <> 'normal'
    or v_session.job_id is not null
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
    or v_request.job_id is not null
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
        and session_id = p_session_id
        and job_id is null
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

  select *
    into v_worker_turn
    from public.kael_worker_chat_turns
    where id = p_worker_turn_id
      and session_id = p_session_id
      and job_id is null
      and role = 'worker'
      and client_request_id = v_request.client_request_id::text
    for share;

  if v_session.status <> 'active'
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
    p_session_id, null, v_worker_turn.turn_index + 1, 'kael', p_content_type,
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

revoke execute on function public.claim_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) to service_role;

revoke execute on function public.complete_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  public.api_provider, text, integer, numeric, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  public.api_provider, text, integer, numeric, jsonb, timestamptz
) to service_role;

commit;

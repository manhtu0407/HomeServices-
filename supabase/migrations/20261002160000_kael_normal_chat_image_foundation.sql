-- Separate routing purposes and image-only persistence for normal Kael Chat.
begin;

alter table public.ai_provider_routing
  drop constraint if exists ai_provider_routing_purpose_check;

alter table public.ai_provider_routing
  add constraint ai_provider_routing_purpose_check check (purpose in (
    'intent_classification', 'vision_analysis', 'clarification', 'problem_synthesis',
    'market_lookup', 'price_synthesis', 'advisory_generation', 'worker_brief',
    'scope_change', 'job_incident', 'post_job_learning', 'educational_response',
    'worker_assist', 'normal_chat_vision', 'normal_chat_response', 'normal_chat_memory',
    'normal_chat_search'
  ));

insert into public.ai_provider_routing (
  purpose, primary_provider, primary_model, fallback_provider, fallback_model,
  cost_ceiling_usd, latency_budget_ms, user_visible, daily_provider_cap_usd
) values
  ('normal_chat_vision', 'anthropic', 'claude-sonnet-5-5', 'anthropic', 'claude-sonnet-5', 0.025, 15000, false, 30),
  ('normal_chat_response', 'deepseek', 'deepseek-v4-pro', 'deepseek', 'deepseek-v4-flash', 0.010, 12000, true, 30),
  ('normal_chat_memory', 'deepseek', 'deepseek-v4-flash', null, null, 0.005, 8000, false, 30),
  ('normal_chat_search', 'perplexity', 'pplx-fast-search', null, null, 0.001, 8000, false, 30)
on conflict (purpose) do update set
  primary_provider = excluded.primary_provider,
  primary_model = excluded.primary_model,
  fallback_provider = excluded.fallback_provider,
  fallback_model = excluded.fallback_model,
  cost_ceiling_usd = excluded.cost_ceiling_usd,
  latency_budget_ms = excluded.latency_budget_ms,
  user_visible = excluded.user_visible,
  daily_provider_cap_usd = excluded.daily_provider_cap_usd,
  updated_at = now();

alter table public.kael_customer_conversation_turns
  drop constraint if exists kael_customer_conversation_turns_text_content_check;
alter table public.kael_customer_conversation_turns
  add constraint kael_customer_conversation_turns_text_content_check
  check (
    char_length(text_content) between 1 and 4000
    or (role = 'customer' and cardinality(media_refs) > 0 and char_length(text_content) = 0)
  );
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
    or p_content_type is null or p_content_type not in ('text', 'photo_attached')
    or p_text_content is null
    or (pg_catalog.btrim(coalesce(p_text_content, '')) = ''
      and (p_content_type <> 'photo_attached' or pg_catalog.cardinality(p_media_refs) = 0))
    or pg_catalog.char_length(p_text_content) > 1200
    or p_media_refs is null
    or pg_catalog.cardinality(p_media_refs) > 5
    or (p_content_type = 'text' and pg_catalog.cardinality(p_media_refs) <> 0)
    or (p_content_type = 'photo_attached' and pg_catalog.cardinality(p_media_refs) = 0)
    or exists (
      select 1
      from pg_catalog.unnest(p_media_refs) as media_ref(value)
      where media_ref.value is null
        or pg_catalog.char_length(media_ref.value) > 500
        or media_ref.value !~* (
          '^supabase://kael-chat-media/' || p_worker_id::text
          || '/kael-chat/model_vision/[^[:space:]?#/]+$'
        )
        or media_ref.value like '%..%'
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
  if v_session.worker_id is distinct from p_worker_id
    or v_session.chat_mode not in ('normal', 'intake')
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
  -- Job-less photos belong to the general chat only; opportunity intake stays text.
  if pg_catalog.cardinality(p_media_refs) > 0 and v_session.chat_mode <> 'normal' then
    return query select false, 'INVALID_INPUT'::text, false, false,
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

revoke execute on function public.claim_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) to service_role;

commit;

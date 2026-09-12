begin;

create or replace function public.confirm_kael_chat_durable_atomic_v4(
  p_session_id uuid, p_customer_id uuid, p_idempotency_key text,
  p_confirmation_kind text, p_price_reasoning_receipt_id text, p_matching_mode text
) returns table (
  ok boolean, error_code text, operation_id uuid, receipt_id uuid, job_id uuid,
  job_status public.job_status, quote_mode public.service_quote_mode, operation_state text,
  already_applied boolean, accepted_at timestamptz, updated_at timestamptz,
  idempotency_key text, support_code text, terminal boolean, retry_after_ms integer
) language plpgsql security invoker set search_path = public, pg_catalog
as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_result record;
  v_cohort text;
  v_strategy text;
  v_preferred uuid;
begin
  if p_matching_mode is not null and p_matching_mode <> 'prompt_if_saved' then
    raise exception using errcode='22023', message='MATCHING_MODE_INVALID';
  end if;
  if not exists(select 1 from public.profiles where id=p_customer_id and role='customer') then
    raise exception using errcode='42501', message='CUSTOMER_CONFIRMATION_REQUIRED';
  end if;

  -- The session lock serializes first confirmation before a job or outbox can exist.
  select session.* into v_session from public.kael_chat_sessions session
    where session.id=p_session_id and session.customer_id=p_customer_id for update;
  if not found then
    raise exception using errcode='42501', message='CONFIRMATION_NOT_OWNED';
  end if;
  if exists(select 1 from public.confirmation_operations operation
    where operation.session_id=p_session_id and operation.customer_id=p_customer_id) then
    -- Replays read the receipt; reacquiring capacity could resurrect an exhausted search.
    return query select * from public.confirm_kael_chat_durable_atomic_v2(
      p_session_id,p_customer_id,p_idempotency_key,p_confirmation_kind,p_price_reasoning_receipt_id);
    return;
  end if;

  select * into strict v_result from public.confirm_kael_chat_durable_atomic_v3(
    p_session_id,p_customer_id,p_idempotency_key,p_confirmation_kind,p_price_reasoning_receipt_id);
  if not coalesce(v_result.ok,false) then
    return query select v_result.ok, v_result.error_code, v_result.operation_id, v_result.receipt_id,
    v_result.job_id, v_result.job_status, v_result.quote_mode, v_result.operation_state,
    v_result.already_applied, v_result.accepted_at, v_result.updated_at,
    v_result.idempotency_key, v_result.support_code, v_result.terminal, v_result.retry_after_ms;
    return;
  end if;
  select job.synthetic_cohort_id into strict v_cohort from public.jobs job where job.id=v_result.job_id;
  if v_session.preferred_worker_id is not null and exists(
    select 1 from public.customer_favorite_workers favorite
    join public.worker_profiles worker on worker.id=favorite.worker_id
    where favorite.customer_id=p_customer_id and favorite.worker_id=v_session.preferred_worker_id
      and favorite.synthetic_cohort_id is not distinct from v_cohort
      and worker.synthetic_cohort_id is not distinct from v_cohort
  ) then
    v_strategy:='saved_worker_first';
    v_preferred:=v_session.preferred_worker_id;
  elsif v_session.preferred_worker_id is not null or (
    p_matching_mode='prompt_if_saved' and exists(
      select 1 from public.customer_favorite_workers favorite
      join public.worker_profiles worker on worker.id=favorite.worker_id
      where favorite.customer_id=p_customer_id
        and favorite.synthetic_cohort_id is not distinct from v_cohort
        and worker.synthetic_cohort_id is not distinct from v_cohort
    )
  ) then
    v_strategy:='pending';
  else
    v_strategy:='general';
  end if;

  insert into public.job_matching_preferences(job_id,customer_id,strategy,preferred_worker_id,
    auto_general,selected_at)
  values(v_result.job_id,p_customer_id,v_strategy,v_preferred,false,
    case when v_strategy='pending' then null else pg_catalog.clock_timestamp() end);
  if v_strategy='pending' then
    update public.matching_capacity_reservations capacity
      set status='released',released_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp()
      where capacity.operation_id=v_result.operation_id and capacity.status in ('held','offered');
  end if;
  return query select v_result.ok, v_result.error_code, v_result.operation_id, v_result.receipt_id,
    v_result.job_id, v_result.job_status, v_result.quote_mode, v_result.operation_state,
    v_result.already_applied, v_result.accepted_at, v_result.updated_at,
    v_result.idempotency_key, v_result.support_code, v_result.terminal, v_result.retry_after_ms;
end;
$func$;

revoke execute on function public.confirm_kael_chat_durable_atomic_v4(uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.confirm_kael_chat_durable_atomic_v4(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.confirm_kael_chat_durable_authorized_v6(
  p_session_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_confirmation_kind text,
  p_price_reasoning_receipt_id text,
  p_matching_mode text,
  p_run_id uuid,
  p_trace_id uuid,
  p_actor_id_hash text,
  p_actor_role text,
  p_route_kind text,
  p_capability text,
  p_environment text,
  p_release_id text,
  p_privileged boolean,
  p_resource_type text,
  p_resource_id_hash text,
  p_duration_ms integer
) returns table (
  ok boolean,
  error_code text,
  operation_id uuid,
  receipt_id uuid,
  job_id uuid,
  job_status public.job_status,
  quote_mode public.service_quote_mode,
  operation_state text,
  already_applied boolean,
  accepted_at timestamptz,
  updated_at timestamptz,
  idempotency_key text,
  support_code text,
  terminal boolean,
  retry_after_ms integer,
  trace_finalized boolean
) language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_result record;
  v_trace_finalized boolean;
begin
  if p_actor_role is distinct from 'customer' then
    raise exception using errcode='42501', message='CUSTOMER_CONFIRMATION_REQUIRED';
  end if;
  if p_duration_ms is null or p_duration_ms < 0 or p_duration_ms > 600000 then
    raise exception using errcode = '22023', message = 'HARNESS_DURATION_INVALID';
  end if;

  select * into strict v_result
  from public.confirm_kael_chat_durable_atomic_v4(
    p_session_id,
    p_customer_id,
    p_idempotency_key,
    p_confirmation_kind,
    p_price_reasoning_receipt_id,
    p_matching_mode
  );

  if not coalesce(v_result.ok, false) then
    return query select
      v_result.ok, v_result.error_code, v_result.operation_id, v_result.receipt_id,
      v_result.job_id, v_result.job_status, v_result.quote_mode,
      v_result.operation_state, v_result.already_applied, v_result.accepted_at,
      v_result.updated_at, v_result.idempotency_key, v_result.support_code,
      v_result.terminal, v_result.retry_after_ms, false;
    return;
  end if;

  select public.finish_harness_authorized_request(
    p_run_id,
    p_trace_id,
    p_actor_id_hash,
    p_actor_role,
    p_route_kind,
    p_capability,
    p_environment,
    p_release_id,
    p_privileged,
    p_resource_type,
    p_resource_id_hash,
    p_duration_ms
  ) into v_trace_finalized;

  if not coalesce(v_trace_finalized, false) then
    raise exception using errcode = '55000', message = 'TRACE_FINALIZATION_UNAVAILABLE';
  end if;

  return query select
    v_result.ok, v_result.error_code, v_result.operation_id, v_result.receipt_id,
    v_result.job_id, v_result.job_status, v_result.quote_mode,
    v_result.operation_state, v_result.already_applied, v_result.accepted_at,
    v_result.updated_at, v_result.idempotency_key, v_result.support_code,
    v_result.terminal, v_result.retry_after_ms, true;
end;
$func$;
revoke execute on function public.confirm_kael_chat_durable_authorized_v6(
  uuid,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) from public,anon,authenticated;
grant execute on function public.confirm_kael_chat_durable_authorized_v6(
  uuid,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) to service_role;

create or replace function public.claim_confirmation_matching_outbox_batch(
  p_dispatcher_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 45
) returns table(
  outbox_id uuid,
  lease_token uuid,
  operation_id uuid,
  customer_id uuid,
  session_id uuid,
  job_id uuid,
  diagnosis_scope jsonb,
  preferred_worker_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if p_dispatcher_id is null or length(p_dispatcher_id) not between 8 and 160
    or p_dispatcher_id !~ '^[A-Za-z0-9_.:-]+$'
    or p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 15 and 120
  then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_CLAIM_INVALID';
  end if;

  return query
  with claimable as (
    select outbox.id
    from public.workflow_outbox outbox
    where outbox.event_type = 'matching_requested'
      and outbox.dead_lettered_at is null
      and outbox.attempt_count < 8
      and not exists (
        select 1 from public.confirmation_operations operation
        join public.job_matching_preferences preference on preference.job_id=operation.job_id
        where operation.id=outbox.operation_id and preference.strategy='pending'
      )
      and (
        (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= pg_catalog.clock_timestamp())
        or (
          outbox.status = 'processing' and
          coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= pg_catalog.clock_timestamp()
        )
      )
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.workflow_outbox outbox
    set status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      lease_token = gen_random_uuid(),
      leased_by = p_dispatcher_id,
      lease_expires_at = pg_catalog.clock_timestamp() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      updated_at = pg_catalog.clock_timestamp()
    from claimable
    where outbox.id = claimable.id
    returning outbox.id, outbox.lease_token, outbox.operation_id, outbox.attempt_count
  )
  select claimed.id, claimed.lease_token, operation.id, operation.customer_id,
    operation.session_id, operation.job_id, session.diagnosis_scope,
    session.preferred_worker_id, claimed.attempt_count
  from claimed
  join public.confirmation_operations operation on operation.id = claimed.operation_id
  join public.kael_chat_sessions session on session.id = operation.session_id
  where operation.job_id is not null;
end;
$func$;

create or replace function public.claim_confirmation_matching_outbox(
  p_session_id uuid, p_customer_id uuid, p_lease_seconds integer default 30
) returns table (
  operation_id uuid, job_id uuid, operation_state text, claimed boolean
) language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare
  v_operation public.confirmation_operations%rowtype;
  v_outbox public.workflow_outbox%rowtype;
  v_has_active_delivery boolean;
begin
  if p_lease_seconds not between 5 and 60 then
    raise exception using errcode = '22023', message = 'OUTBOX_LEASE_INVALID';
  end if;
  select * into v_operation from public.confirmation_operations
    where session_id = p_session_id and customer_id = p_customer_id for update;
  if not found then return; end if;
  if exists(select 1 from public.job_matching_preferences preference
    where preference.job_id=v_operation.job_id and preference.strategy='pending') then
    return query select v_operation.id,v_operation.job_id,v_operation.state,false;
    return;
  end if;
  select * into v_outbox from public.workflow_outbox
    where workflow_outbox.operation_id = v_operation.id
      and event_type = 'matching_requested' for update;
  if not found then
    return query select v_operation.id, v_operation.job_id, v_operation.state, false;
    return;
  end if;
  select exists (
    select 1 from public.matching_recipient_deliveries delivery
    where delivery.job_id = v_operation.job_id
      and delivery.status in ('queued', 'delivered', 'seen')
      and delivery.expires_at > now()
  ) into v_has_active_delivery;
  if v_operation.state in ('broadcasting', 'candidate_ready', 'official_match',
      'no_reachable_worker', 'stopped')
    or (v_operation.state in ('matching_queued', 'recovery_required') and v_has_active_delivery)
  then
    if v_operation.state in ('matching_queued', 'recovery_required') and v_has_active_delivery then
      update public.confirmation_operations set state = 'broadcasting',
        last_error_code = null, retry_after_ms = null, updated_at = now()
        where id = v_operation.id;
      update public.matching_operations set state = 'broadcasting', updated_at = now()
        where confirmation_operation_id = v_operation.id
          and state in ('queued', 'recovery_required');
      v_operation.state := 'broadcasting';
    end if;
    update public.workflow_outbox set status = 'completed', lease_expires_at = null,
      last_error_code = null, updated_at = now() where id = v_outbox.id;
    return query select v_operation.id, v_operation.job_id, v_operation.state, false;
    return;
  end if;
  if v_outbox.status in ('queued', 'failed')
    and v_outbox.next_attempt_at <= now()
    or v_outbox.status = 'processing'
      and coalesce(v_outbox.lease_expires_at, '-infinity'::timestamptz) <= now()
  then
    update public.workflow_outbox set status = 'processing',
      attempt_count = attempt_count + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = null, updated_at = now()
      where id = v_outbox.id;
    return query select v_operation.id, v_operation.job_id, v_operation.state, true;
    return;
  end if;
  return query select v_operation.id, v_operation.job_id, v_operation.state, false;
end;
$func$;

commit;

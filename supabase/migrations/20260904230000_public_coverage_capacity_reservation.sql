-- Public launch readiness and confirmation-time capacity must use the same Worker predicate.
-- Existing V2/V4 RPCs remain available during the expand window for already-shipped binaries.

begin;

create table if not exists public.matching_capacity_reservations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.confirmation_operations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  service_type public.service_type not null,
  district_code text not null,
  status text not null default 'held' check (status in (
    'held', 'offered', 'released', 'expired'
  )),
  held_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  synthetic_cohort_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, worker_id),
  check (expires_at > held_at),
  check (
    (status in ('held', 'offered') and released_at is null)
    or (status in ('released', 'expired') and released_at is not null)
  )
);

create unique index if not exists matching_capacity_reservations_worker_active_uidx
  on public.matching_capacity_reservations(worker_id)
  where status in ('held', 'offered');

create index if not exists matching_capacity_reservations_operation_active_idx
  on public.matching_capacity_reservations(operation_id, status, expires_at, worker_id);

create index if not exists matching_capacity_reservations_job_active_idx
  on public.matching_capacity_reservations(job_id, status, expires_at, worker_id);

do $trigger_guard$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'matching_capacity_reservations_updated_at'
      and tgrelid = 'public.matching_capacity_reservations'::regclass
      and not tgisinternal
  ) then
    create trigger matching_capacity_reservations_updated_at
    before update on public.matching_capacity_reservations
    for each row execute function public.update_updated_at();
  end if;
end;
$trigger_guard$;

alter table public.matching_capacity_reservations enable row level security;
revoke all on public.matching_capacity_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.matching_capacity_reservations to service_role;

create or replace function private.eligible_matching_worker_ids(
  p_service_type public.service_type,
  p_district_code text,
  p_quote_mode public.service_quote_mode,
  p_diagnosis_scope jsonb,
  p_intake_scope_snapshot jsonb,
  p_synthetic_cohort_id text,
  p_observed_at timestamptz,
  p_excluded_job_id uuid default null,
  p_operation_id uuid default null
) returns table(worker_id uuid)
language sql
stable
security definer
set search_path = ''
as $func$
  select worker.id
  from public.worker_profiles as worker
  where worker.is_approved
    and worker.verification_status = 'approved'::public.worker_verification_status
    and worker.is_available
    and not worker.is_suspended
    and p_service_type = any(worker.selected_service_types)
    and (
      p_district_code = any(worker.districts)
      or 'hcmc_all' = any(worker.districts)
    )
    and worker.synthetic_cohort_id is not distinct from p_synthetic_cohort_id
    and (
      (
        worker.matching_push_proven_at between p_observed_at - interval '24 hours' and p_observed_at
        and exists (
          select 1
          from public.device_push_tokens as push_token
          where push_token.user_id = worker.id
            and push_token.enabled
            and push_token.permission_status = 'granted'
            and push_token.updated_at <= worker.matching_push_proven_at
        )
      )
      or worker.matching_foreground_active_until >= p_observed_at
    )
    and not exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = worker.id
        and quality.service_type = p_service_type
        and quality.is_locked
    )
    and not exists (
      select 1
      from public.jobs as busy_job
      where busy_job.worker_id = worker.id
        and busy_job.id is distinct from p_excluded_job_id
        and busy_job.status in (
          'worker_matched', 'worker_on_way', 'arrived', 'inspecting',
          'repairing', 'scope_change_pending', 'completed_by_worker',
          'confirmed_by_customer', 'payment_pending'
        )
    )
    and not exists (
      select 1
      from public.job_worker_candidates as candidate
      where candidate.worker_id = worker.id
        and candidate.status = 'proposed'
        and (candidate.expires_at is null or candidate.expires_at > p_observed_at)
        and candidate.job_id is distinct from p_excluded_job_id
    )
    and not exists (
      select 1
      from public.matching_capacity_reservations as capacity
      where capacity.worker_id = worker.id
        and capacity.status in ('held', 'offered')
        and capacity.expires_at > p_observed_at
        and capacity.operation_id is distinct from p_operation_id
    )
    and private.worker_meets_job_matching_requirements(
      p_quote_mode,
      p_diagnosis_scope,
      p_intake_scope_snapshot,
      worker.problem_specializations
    );
$func$;

revoke execute on function private.eligible_matching_worker_ids(
  public.service_type,text,public.service_quote_mode,jsonb,jsonb,text,timestamptz,uuid,uuid
) from public, anon, authenticated;
grant execute on function private.eligible_matching_worker_ids(
  public.service_type,text,public.service_quote_mode,jsonb,jsonb,text,timestamptz,uuid,uuid
) to service_role;

create or replace function public.get_service_coverage_readiness(
  p_customer_id uuid,
  p_service_type public.service_type,
  p_district_code text
) returns table (
  service_type public.service_type,
  district_code text,
  status text,
  minimum_worker_count integer,
  eligible_reachable_worker_count integer,
  required_capabilities text[],
  reason_code text,
  checked_at timestamptz,
  valid_until timestamptz
) language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_checked_at timestamptz := pg_catalog.clock_timestamp();
  v_cohort_id text;
  v_district_code text;
  v_worker_count integer;
begin
  if p_customer_id is null
    or (
      coalesce((select auth.role()), '') <> 'service_role'
      and (select auth.uid()) is distinct from p_customer_id
    )
  then
    raise exception using errcode = '42501', message = 'CUSTOMER_IDENTITY_REQUIRED';
  end if;

  if not exists (
    select 1 from public.customer_profiles as customer where customer.id = p_customer_id
  ) then
    raise exception using errcode = 'P0002', message = 'CUSTOMER_NOT_FOUND';
  end if;

  v_district_code := public.normalize_hcmc_district_code(p_district_code);
  if v_district_code is null or v_district_code = 'hcmc_all' then
    raise exception using errcode = '22023', message = 'DISTRICT_INVALID';
  end if;

  select member.cohort_id into v_cohort_id
  from public.synthetic_matching_cohort_members as member
  where member.profile_id = p_customer_id
    and member.member_role = 'customer'::public.user_role;

  select pg_catalog.count(*)::integer into v_worker_count
  from private.eligible_matching_worker_ids(
    p_service_type,
    v_district_code,
    null,
    null,
    null,
    v_cohort_id,
    v_checked_at,
    null,
    null
  );

  return query select
    p_service_type,
    v_district_code,
    case when v_worker_count >= 3 then 'ready' else 'closed' end,
    3,
    v_worker_count,
    array[]::text[],
    case when v_worker_count >= 3 then 'READY' else 'INSUFFICIENT_ELIGIBLE_WORKERS' end,
    v_checked_at,
    v_checked_at + interval '30 seconds';
end;
$func$;

revoke execute on function public.get_service_coverage_readiness(uuid,public.service_type,text)
from public, anon;
grant execute on function public.get_service_coverage_readiness(uuid,public.service_type,text)
to authenticated, service_role;

create or replace function public.confirm_kael_chat_durable_atomic_v3(
  p_session_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_confirmation_kind text,
  p_price_reasoning_receipt_id text default null
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
  retry_after_ms integer
) language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_capacity_unavailable boolean := false;
  v_had_operation boolean;
  v_job public.jobs%rowtype;
  v_operation public.confirmation_operations%rowtype;
  v_preferred_worker_id uuid;
  v_required_worker_count integer;
  v_result record;
  v_worker_ids uuid[] := array[]::uuid[];
begin
  select exists (
    select 1
    from public.confirmation_operations as operation
    where operation.idempotency_key = p_idempotency_key
  ) into v_had_operation;

  begin
    select * into strict v_result
    from public.confirm_kael_chat_durable_atomic_v2(
      p_session_id,
      p_customer_id,
      p_idempotency_key,
      p_confirmation_kind,
      p_price_reasoning_receipt_id
    );

    if not coalesce(v_result.ok, false) then
      return query select
        v_result.ok, v_result.error_code, v_result.operation_id, v_result.receipt_id,
        v_result.job_id, v_result.job_status, v_result.quote_mode,
        v_result.operation_state, v_result.already_applied, v_result.accepted_at,
        v_result.updated_at, v_result.idempotency_key, v_result.support_code,
        v_result.terminal, v_result.retry_after_ms;
      return;
    end if;

    if v_result.operation_state in (
      'candidate_ready', 'official_match', 'no_reachable_worker', 'stopped'
    ) or (
      v_result.already_applied
      and exists (
        select 1
        from public.matching_recipient_deliveries as delivery
        where delivery.job_id = v_result.job_id
          and delivery.status in ('queued', 'delivered', 'seen', 'accepted')
          and delivery.expires_at > pg_catalog.clock_timestamp()
      )
    ) then
      return query select
        v_result.ok, v_result.error_code, v_result.operation_id, v_result.receipt_id,
        v_result.job_id, v_result.job_status, v_result.quote_mode,
        v_result.operation_state, v_result.already_applied, v_result.accepted_at,
        v_result.updated_at, v_result.idempotency_key, v_result.support_code,
        v_result.terminal, v_result.retry_after_ms;
      return;
    end if;

    select job.* into strict v_job
    from public.jobs as job
    where job.id = v_result.job_id;

    select operation.* into strict v_operation
    from public.confirmation_operations as operation
    where operation.id = v_result.operation_id
    for update;

    select session.preferred_worker_id into v_preferred_worker_id
    from public.kael_chat_sessions as session
    where session.id = p_session_id;

    update public.matching_capacity_reservations as capacity
    set status = 'expired', released_at = pg_catalog.clock_timestamp()
    where capacity.status in ('held', 'offered')
      and capacity.expires_at <= pg_catalog.clock_timestamp();

    v_required_worker_count := case
      when v_job.synthetic_cohort_id is null then 3
      else 1
    end;

    select coalesce(
      pg_catalog.array_agg(selected.worker_id order by selected.preference_rank, selected.worker_id),
      array[]::uuid[]
    ) into v_worker_ids
    from (
      select worker.id as worker_id,
        case when worker.id = v_preferred_worker_id then 0 else 1 end as preference_rank
      from public.worker_profiles as worker
      join private.eligible_matching_worker_ids(
        v_job.service_type,
        public.normalize_hcmc_district_code(v_job.address_district),
        v_job.quote_mode,
        v_job.diagnosis_scope,
        v_job.intake_scope_snapshot,
        v_job.synthetic_cohort_id,
        pg_catalog.clock_timestamp(),
        v_job.id,
        v_operation.id
      ) as eligible on eligible.worker_id = worker.id
      order by preference_rank, worker.id
      for update of worker skip locked
      limit v_required_worker_count
    ) as selected;

    if pg_catalog.cardinality(v_worker_ids) <> v_required_worker_count then
      raise exception using errcode = 'P6701', message = 'COVERAGE_UNAVAILABLE';
    end if;

    update public.matching_capacity_reservations as existing_capacity
    set status = 'held',
      expires_at = pg_catalog.clock_timestamp() + interval '5 minutes',
      released_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where existing_capacity.operation_id = v_operation.id
      and existing_capacity.worker_id = any(v_worker_ids);

    insert into public.matching_capacity_reservations(
      operation_id,
      job_id,
      worker_id,
      service_type,
      district_code,
      status,
      expires_at,
      synthetic_cohort_id
    )
    select
      v_operation.id,
      v_job.id,
      selected_worker.worker_id,
      v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),
      'held',
      pg_catalog.clock_timestamp() + interval '5 minutes',
      v_job.synthetic_cohort_id
    from pg_catalog.unnest(v_worker_ids) as selected_worker(worker_id)
    where not exists (
      select 1
      from public.matching_capacity_reservations as existing_capacity
      where existing_capacity.operation_id = v_operation.id
        and existing_capacity.worker_id = selected_worker.worker_id
    )
    on conflict do nothing;

    if (
      select pg_catalog.count(*)
      from public.matching_capacity_reservations as capacity
      where capacity.operation_id = v_operation.id
        and capacity.status in ('held', 'offered')
        and capacity.expires_at > pg_catalog.clock_timestamp()
    ) < v_required_worker_count then
      raise exception using errcode = 'P6701', message = 'COVERAGE_UNAVAILABLE';
    end if;

    if v_operation.state = 'recovery_required' then
      update public.confirmation_operations as operation
      set state = 'matching_queued',
        last_error_code = null,
        retry_after_ms = null,
        updated_at = pg_catalog.clock_timestamp()
      where operation.id = v_operation.id;
      update public.matching_operations as matching
      set state = 'queued', updated_at = pg_catalog.clock_timestamp()
      where matching.confirmation_operation_id = v_operation.id
        and matching.state = 'recovery_required';
      update public.workflow_outbox as outbox
      set status = 'queued',
        next_attempt_at = pg_catalog.clock_timestamp(),
        lease_expires_at = null,
        last_error_code = null,
        updated_at = pg_catalog.clock_timestamp()
      where outbox.operation_id = v_operation.id
        and outbox.event_type = 'matching_requested';
    end if;
  exception
    when sqlstate 'P6701' then
      v_capacity_unavailable := true;
  end;

  if v_capacity_unavailable then
    if not v_had_operation then
      return query select
        false, 'COVERAGE_UNAVAILABLE'::text, null::uuid, null::uuid, null::uuid,
        null::public.job_status, v_result.quote_mode, null::text, false,
        null::timestamptz, null::timestamptz, null::text, null::text, false,
        null::integer;
      return;
    end if;

    select operation.* into strict v_operation
    from public.confirmation_operations as operation
    where operation.idempotency_key = p_idempotency_key
    for update;
    update public.confirmation_operations as operation
    set state = 'recovery_required',
      last_error_code = 'COVERAGE_UNAVAILABLE',
      retry_after_ms = 5000,
      updated_at = pg_catalog.clock_timestamp()
    where operation.id = v_operation.id
    returning operation.* into v_operation;
    update public.matching_operations as matching
    set state = 'recovery_required', updated_at = pg_catalog.clock_timestamp()
    where matching.confirmation_operation_id = v_operation.id
      and matching.state in ('queued', 'broadcasting', 'recovery_required');
    update public.workflow_outbox as outbox
    set status = 'failed',
      next_attempt_at = pg_catalog.clock_timestamp() + interval '5 seconds',
      lease_expires_at = null,
      last_error_code = 'COVERAGE_UNAVAILABLE',
      updated_at = pg_catalog.clock_timestamp()
    where outbox.operation_id = v_operation.id
      and outbox.event_type = 'matching_requested';

    return query select
      true, null::text, v_operation.id,
      (select receipt.id from public.confirmation_operation_receipts as receipt
        where receipt.operation_id = v_operation.id),
      v_operation.job_id,
      (select job.status from public.jobs as job where job.id = v_operation.job_id),
      v_operation.quote_mode,
      v_operation.state,
      true,
      v_operation.accepted_at,
      v_operation.updated_at,
      v_operation.idempotency_key,
      v_operation.support_code,
      false,
      v_operation.retry_after_ms;
    return;
  end if;

  select operation.* into strict v_operation
  from public.confirmation_operations as operation
  where operation.id = v_result.operation_id;

  return query select
    true, null::text, v_operation.id, v_result.receipt_id, v_operation.job_id,
    (select job.status from public.jobs as job where job.id = v_operation.job_id),
    v_operation.quote_mode, v_operation.state, v_result.already_applied,
    v_operation.accepted_at, v_operation.updated_at, v_operation.idempotency_key,
    v_operation.support_code,
    v_operation.state in ('official_match', 'no_reachable_worker', 'stopped'),
    v_operation.retry_after_ms;
end;
$func$;

revoke execute on function public.confirm_kael_chat_durable_atomic_v3(uuid,uuid,text,text,text)
from public, anon, authenticated;
grant execute on function public.confirm_kael_chat_durable_atomic_v3(uuid,uuid,text,text,text)
to service_role;

create or replace function public.get_matching_capacity_reservation_worker_ids(
  p_job_id uuid
) returns table(worker_id uuid)
language sql
stable
security invoker
set search_path = ''
as $func$
  select capacity.worker_id
  from public.matching_capacity_reservations as capacity
  where capacity.job_id = p_job_id
    and capacity.status in ('held', 'offered')
    and capacity.expires_at > pg_catalog.now()
  order by capacity.worker_id
  limit 5;
$func$;

revoke execute on function public.get_matching_capacity_reservation_worker_ids(uuid)
from public, anon, authenticated;
grant execute on function public.get_matching_capacity_reservation_worker_ids(uuid)
to service_role;

create or replace function public.activate_job_broadcast_batch_durable_atomic_v2(
  p_job_id uuid,
  p_worker_ids uuid[],
  p_batch_id uuid,
  p_sent_at timestamptz,
  p_expires_at timestamptz
) returns table (
  id uuid,
  worker_id uuid,
  delivery_id uuid,
  operation_id uuid,
  confirmed_recipient_count integer
) language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
  v_requested_count integer;
  v_reserved_worker_ids uuid[];
begin
  if p_job_id is null
    or pg_catalog.cardinality(p_worker_ids) not between 1 and 5
    or p_expires_at is distinct from p_sent_at + interval '5 minutes'
  then
    raise exception using errcode = '22023', message = 'MATCHING_BATCH_INVALID';
  end if;

  select job.* into strict v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  select matching.* into strict v_matching
  from public.matching_operations as matching
  where matching.job_id = p_job_id
    and matching.confirmation_operation_id is not null
    and matching.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')
  order by matching.created_at desc
  limit 1
  for update;

  select pg_catalog.count(distinct requested.worker_id)::integer into v_requested_count
  from pg_catalog.unnest(p_worker_ids) as requested(worker_id);
  if v_requested_count <> pg_catalog.cardinality(p_worker_ids) then
    raise exception using errcode = '22023', message = 'MATCHING_BATCH_DUPLICATE_WORKER';
  end if;

  select coalesce(
    pg_catalog.array_agg(capacity.worker_id order by capacity.worker_id),
    array[]::uuid[]
  ) into v_reserved_worker_ids
  from public.matching_capacity_reservations as capacity
  join private.eligible_matching_worker_ids(
    v_job.service_type,
    public.normalize_hcmc_district_code(v_job.address_district),
    v_job.quote_mode,
    v_job.diagnosis_scope,
    v_job.intake_scope_snapshot,
    v_job.synthetic_cohort_id,
    p_sent_at,
    v_job.id,
    v_matching.confirmation_operation_id
  ) as eligible on eligible.worker_id = capacity.worker_id
  where capacity.operation_id = v_matching.confirmation_operation_id
    and capacity.job_id = p_job_id
    and capacity.worker_id = any(p_worker_ids)
    and capacity.status in ('held', 'offered')
    and capacity.expires_at > p_sent_at;

  if pg_catalog.cardinality(v_reserved_worker_ids) <> v_requested_count then
    raise exception using errcode = '55000', message = 'MATCHING_RESERVATION_REQUIRED';
  end if;

  update public.matching_capacity_reservations as capacity
  set status = 'offered',
    expires_at = p_expires_at,
    updated_at = pg_catalog.clock_timestamp()
  where capacity.operation_id = v_matching.confirmation_operation_id
    and capacity.worker_id = any(v_reserved_worker_ids)
    and capacity.status in ('held', 'offered');

  return query
  select activated.id, activated.worker_id, activated.delivery_id,
    activated.operation_id, activated.confirmed_recipient_count
  from public.activate_job_broadcast_batch_durable_atomic(
    p_job_id,
    v_reserved_worker_ids,
    p_batch_id,
    p_sent_at,
    p_expires_at
  ) as activated;
end;
$func$;

revoke execute on function public.activate_job_broadcast_batch_durable_atomic_v2(
  uuid,uuid[],uuid,timestamptz,timestamptz
) from public, anon, authenticated;
grant execute on function public.activate_job_broadcast_batch_durable_atomic_v2(
  uuid,uuid[],uuid,timestamptz,timestamptz
) to service_role;

create or replace function public.confirm_kael_chat_durable_authorized_v5(
  p_session_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_confirmation_kind text,
  p_price_reasoning_receipt_id text,
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
  if p_duration_ms is null or p_duration_ms < 0 or p_duration_ms > 600000 then
    raise exception using errcode = '22023', message = 'HARNESS_DURATION_INVALID';
  end if;

  select * into strict v_result
  from public.confirm_kael_chat_durable_atomic_v3(
    p_session_id,
    p_customer_id,
    p_idempotency_key,
    p_confirmation_kind,
    p_price_reasoning_receipt_id
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

revoke execute on function public.confirm_kael_chat_durable_authorized_v5(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) from public, anon, authenticated;
grant execute on function public.confirm_kael_chat_durable_authorized_v5(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) to service_role;

comment on table public.matching_capacity_reservations is
  'Short server-owned leases that prevent two confirmations from promising the same reachable Worker capacity.';
comment on function public.get_service_coverage_readiness(uuid,public.service_type,text) is
  'Returns aggregate service-by-district launch readiness without exposing Worker identity.';
comment on function public.confirm_kael_chat_durable_atomic_v3(uuid,uuid,text,text,text) is
  'Creates one durable confirmation only after atomically reserving the required reachable Worker capacity.';

commit;

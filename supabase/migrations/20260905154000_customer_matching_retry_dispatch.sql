begin;

create or replace function private.reserve_fresh_matching_workers(p_job_id uuid,p_confirmation_id uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_worker record;
  v_capacity public.matching_capacity_reservations%rowtype;
  v_worker_ids uuid[] := array[]::uuid[];
  v_required integer;
  v_now timestamptz;
begin
  select job.* into strict v_job from public.jobs job where job.id=p_job_id for update;
  select confirmation.* into strict v_confirmation from public.confirmation_operations confirmation
    where confirmation.id=p_confirmation_id and confirmation.job_id=v_job.id
      and confirmation.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id;
  v_now := clock_timestamp();
  v_required := case when v_job.synthetic_cohort_id is null then 3 else 1 end;
  for v_worker in
    select worker.id from public.worker_profiles worker
      join private.eligible_matching_worker_ids(v_job.service_type,
        public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_job.diagnosis_scope,
        v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,v_now,v_job.id,v_confirmation.id) eligible
        on eligible.worker_id=worker.id
    where not exists(select 1 from public.job_broadcasts prior where prior.job_id=v_job.id and prior.worker_id=worker.id)
      and not exists(select 1 from public.worker_cancellation_requests cancellation
        where cancellation.job_id=v_job.id and cancellation.worker_id=worker.id and cancellation.status='approved')
    order by worker.id limit 50 for update of worker skip locked
  loop
    -- Expired unique-index holders can be reclaimed only if their capacity row is not busy.
    select capacity.* into v_capacity from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered') for update skip locked;
    if found then
      if v_capacity.expires_at>clock_timestamp() then
        if v_capacity.operation_id is distinct from v_confirmation.id or v_capacity.job_id is distinct from v_job.id
        then continue; end if;
      else
        update public.matching_capacity_reservations set status='expired',released_at=clock_timestamp(),
          updated_at=clock_timestamp() where id=v_capacity.id;
      end if;
    elsif exists(select 1 from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered')) then continue;
    end if;
    if not exists(select 1 from private.eligible_matching_worker_ids(v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,clock_timestamp(),v_job.id,v_confirmation.id) eligible
      where eligible.worker_id=v_worker.id) then continue; end if;
    v_worker_ids := array_append(v_worker_ids,v_worker.id);
    exit when cardinality(v_worker_ids)=5;
  end loop;
  if cardinality(v_worker_ids)<v_required then
    raise exception using errcode='55000',message='COVERAGE_UNAVAILABLE';
  end if;

  v_now := clock_timestamp();
  insert into public.matching_capacity_reservations(operation_id,job_id,worker_id,service_type,district_code,
    status,held_at,expires_at,synthetic_cohort_id)
    select v_confirmation.id,v_job.id,worker_id,v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),'held',v_now,v_now+interval '5 minutes',v_job.synthetic_cohort_id
    from unnest(v_worker_ids) selected(worker_id)
    on conflict(operation_id,worker_id) do update set status='held',held_at=excluded.held_at,
      expires_at=excluded.expires_at,released_at=null,updated_at=v_now;

  return v_worker_ids;
end;
$func$;

create or replace function public.request_job_matching_retry_atomic(
  p_job_id uuid,p_customer_id uuid,p_client_request_id uuid,p_expected_matching_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_existing public.matching_operations%rowtype;
  v_parent public.matching_operations%rowtype;
  v_operation uuid;
  v_now timestamptz;
begin
  if p_job_id is null or p_customer_id is null or p_client_request_id is null
    or p_expected_matching_operation_id is null then
    raise exception using errcode='22023',message='MATCHING_RETRY_INPUT_INVALID';
  end if;
  select job.* into v_job from public.jobs job join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and job.customer_id=p_customer_id and actor.role='customer' for update of job;
  if not found then raise exception using errcode='42501',message='MATCHING_RETRY_NOT_OWNED'; end if;

  -- Replay precedes state checks so a lost response can be recovered even after Customer selection.
  select matching.* into v_existing from public.matching_operations matching where matching.retry_request_id=p_client_request_id;
  if found then
    if v_existing.job_id<>p_job_id or v_existing.retry_requested_by<>p_customer_id
      or v_existing.retry_parent_operation_id<>p_expected_matching_operation_id then
      raise exception using errcode='23505',message='MATCHING_RETRY_REQUEST_CONFLICT';
    end if;
    return private.matching_retry_receipt(v_existing.id);
  end if;
  if v_job.status<>'broadcasting' or v_job.worker_id is not null
    or v_job.quote_mode is null or v_job.quote_mode::text not in ('kael_auto_quote','rfq','inspection_only') then
    raise exception using errcode='55000',message='MATCHING_RETRY_NOT_READY';
  end if;
  select confirmation.* into v_confirmation from public.confirmation_operations confirmation
    where confirmation.job_id=v_job.id and confirmation.customer_id=p_customer_id for update;
  if not found or v_confirmation.quote_mode is distinct from v_job.quote_mode
    or v_confirmation.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id then
    raise exception using errcode='55000',message='MATCHING_RETRY_CONFIRMATION_UNAVAILABLE';
  end if;
  perform private.reconcile_job_matching_expiry(v_job.id);
  select matching.* into v_parent from public.matching_operations matching where matching.job_id=v_job.id
    order by matching.created_at desc,matching.id desc limit 1;
  if v_parent.id is distinct from p_expected_matching_operation_id
    or v_parent.confirmation_operation_id is distinct from v_confirmation.id
    or v_parent.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id then
    raise exception using errcode='55000',message='MATCHING_RETRY_PARENT_CHANGED';
  end if;
  if v_parent.state<>'no_reachable_worker' or exists(
    select 1 from public.workflow_outbox outbox left join public.matching_operations replacement
      on replacement.id=outbox.replacement_matching_operation_id
    where (outbox.operation_id=v_confirmation.id or replacement.job_id=v_job.id)
      and outbox.status in ('queued','processing','failed') and outbox.dead_lettered_at is null)
    or exists(select 1 from public.job_worker_candidates candidate where candidate.job_id=v_job.id
      and candidate.status='proposed' and candidate.expires_at>clock_timestamp())
    or exists(select 1 from public.job_broadcasts broadcast where broadcast.job_id=v_job.id
      and broadcast.status in ('pending','sent','accepted') and broadcast.expires_at>clock_timestamp())
  then raise exception using errcode='55000',message='MATCHING_RETRY_NOT_READY'; end if;
  if exists(select 1 from public.job_matching_preferences preference where preference.job_id=v_job.id
    and preference.strategy<>'general' and preference.fallback_at is null) then
    raise exception using errcode='55000',message='MATCHING_PREFERENCE_PENDING';
  end if;
  perform private.reserve_fresh_matching_workers(v_job.id,v_confirmation.id);
  v_now := clock_timestamp();
  insert into public.matching_operations(confirmation_operation_id,job_id,state,synthetic_cohort_id,
    retry_request_id,retry_parent_operation_id,retry_requested_by,created_at,updated_at)
    values(v_confirmation.id,v_job.id,'queued',v_job.synthetic_cohort_id,p_client_request_id,v_parent.id,
      p_customer_id,v_now,v_now) returning id into v_operation;
  insert into public.workflow_outbox(operation_id,event_type,retry_matching_operation_id,safe_payload,next_attempt_at)
    values(v_confirmation.id,'matching_reconcile',v_operation,jsonb_build_object('job_id',v_job.id),v_now)
    on conflict(operation_id,event_type) do update set retry_matching_operation_id=excluded.retry_matching_operation_id,
      status='queued',attempt_count=0,lease_token=null,leased_by=null,lease_expires_at=null,
      last_error_code=null,dead_lettered_at=null,next_attempt_at=v_now,updated_at=v_now,
      safe_payload=excluded.safe_payload;
  update public.confirmation_operations set state='matching_queued',retry_after_ms=1000,
    last_error_code=null,updated_at=v_now where id=v_confirmation.id;
  return private.matching_retry_receipt(v_operation);
end;
$func$;

create or replace function public.activate_worker_replacement_outbox_claim(p_outbox_id uuid, p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_outbox public.workflow_outbox%rowtype;
  v_matching public.matching_operations%rowtype;
  v_job public.jobs%rowtype;
  v_worker_ids uuid[];
  v_targets jsonb;
  v_sent_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  -- All workflow mutations lock the job before the outbox; recheck the lease after both locks.
  select job.* into v_job from public.jobs as job
    join public.matching_operations as matching on matching.job_id = job.id
    join public.workflow_outbox as outbox on coalesce(outbox.replacement_matching_operation_id,outbox.retry_matching_operation_id) = matching.id
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null) for update of job;
  if not found then return jsonb_build_object('state', 'lease_lost'); end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null) for update;
  v_sent_at := clock_timestamp();
  if v_outbox.id is null or v_outbox.status <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_outbox.lease_expires_at is null
    or v_outbox.lease_expires_at <= v_sent_at then
    return jsonb_build_object('state', 'lease_lost');
  end if;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = coalesce(v_outbox.replacement_matching_operation_id,v_outbox.retry_matching_operation_id) and matching.job_id = v_job.id;
  if v_matching.state = 'stopped' or exists (select 1 from public.matching_operations as current_operation
    where current_operation.job_id = v_job.id and current_operation.id <> v_matching.id
      and current_operation.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')) then
    return jsonb_build_object('state', 'stopped');
  end if;
  if v_job.worker_id is not null then return jsonb_build_object('state', 'official_match'); end if;
  if v_job.status = 'worker_candidate_pending' then return jsonb_build_object('state', 'candidate_ready'); end if;
  if v_job.status <> 'broadcasting' then return jsonb_build_object('state', 'stopped'); end if;
  if v_matching.confirmation_operation_id is null or v_job.quote_mode is null then
    return jsonb_build_object('state', 'recovery_required', 'error_code', 'LEGACY_MATCHING_REQUIRES_REVIEW');
  end if;

  select jsonb_agg(jsonb_build_object('worker_id', delivery.worker_id, 'broadcast_id', delivery.broadcast_id,
    'delivery_id', delivery.id, 'operation_id', delivery.operation_id) order by delivery.worker_id), max(delivery.expires_at)
    into v_targets, v_expires_at from public.matching_recipient_deliveries as delivery
    join public.job_broadcasts as broadcast on broadcast.id = delivery.broadcast_id
    where delivery.operation_id = v_matching.id and delivery.status in ('queued', 'delivered', 'seen')
      and delivery.expires_at > v_sent_at and broadcast.status = 'sent';
  if v_targets is not null then
    return jsonb_build_object('state', 'broadcasting', 'matching_reason',
      case when v_outbox.retry_matching_operation_id is null then 'worker_cancellation' else 'customer_retry' end, 'job_id', v_job.id, 'customer_id', v_job.customer_id,
      'service_type', v_job.service_type, 'district', v_job.address_district,
      'expires_at', v_expires_at, 'targets', v_targets);
  end if;
  if exists (select 1 from public.job_broadcasts as broadcast where broadcast.job_id = v_job.id
    and broadcast.status = 'sent' and broadcast.expires_at > v_sent_at) then
    return jsonb_build_object('state', 'recovery_required', 'error_code', 'REPLACEMENT_OTHER_BATCH_ACTIVE');
  end if;

  begin
    v_worker_ids := private.reserve_fresh_matching_workers(v_job.id,v_matching.confirmation_operation_id);
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'COVERAGE_UNAVAILABLE' then raise; end if;
    return jsonb_build_object('state','no_reachable_worker');
  end;
  select min(capacity.held_at),min(capacity.expires_at) into v_sent_at,v_expires_at
    from public.matching_capacity_reservations capacity where capacity.operation_id=v_matching.confirmation_operation_id
      and capacity.worker_id=any(v_worker_ids) and capacity.status='held';
  select jsonb_agg(jsonb_build_object('worker_id', target.worker_id, 'broadcast_id', target.id,
    'delivery_id', target.delivery_id, 'operation_id', target.operation_id) order by target.worker_id) into v_targets
    from public.activate_job_broadcast_batch_durable_atomic_v2(v_job.id, v_worker_ids, v_matching.id,
      v_sent_at, v_expires_at) as target;
  if v_targets is null then raise exception using errcode = '55000', message = 'REPLACEMENT_ACTIVATION_FAILED'; end if;
  return jsonb_build_object('state', 'broadcasting', 'matching_reason',
      case when v_outbox.retry_matching_operation_id is null then 'worker_cancellation' else 'customer_retry' end, 'job_id', v_job.id, 'customer_id', v_job.customer_id,
    'service_type', v_job.service_type, 'district', v_job.address_district, 'expires_at', v_expires_at, 'targets', v_targets);
end;
$func$;

create or replace function public.settle_worker_replacement_outbox_claim(
  p_outbox_id uuid, p_lease_token uuid, p_state text, p_error_code text default null
) returns text language plpgsql security definer set search_path = '' as $func$
declare
  v_outbox public.workflow_outbox%rowtype;
  v_matching public.matching_operations%rowtype;
  v_job public.jobs%rowtype;
  v_state text := p_state;
  v_outcome text;
  v_now timestamptz;
begin
  if p_state is null or p_state not in ('broadcasting', 'candidate_ready', 'official_match', 'no_reachable_worker', 'recovery_required', 'stopped')
    or (p_state = 'recovery_required' and (p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$'))
    or (p_state <> 'recovery_required' and p_error_code is not null) then
    raise exception using errcode = '22023', message = 'REPLACEMENT_OUTBOX_SETTLE_INVALID';
  end if;
  -- All workflow mutations lock the job before the outbox; recheck the lease after both locks.
  select job.* into v_job from public.jobs as job
    join public.matching_operations as matching on matching.job_id = job.id
    join public.workflow_outbox as outbox on coalesce(outbox.replacement_matching_operation_id,outbox.retry_matching_operation_id) = matching.id
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null) for update of job;
  if not found then return 'lease_lost'; end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null) for update;
  v_now := clock_timestamp();
  if v_outbox.id is null or v_outbox.status <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_outbox.lease_expires_at is null
    or v_outbox.lease_expires_at <= v_now then return 'lease_lost'; end if;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = coalesce(v_outbox.replacement_matching_operation_id,v_outbox.retry_matching_operation_id) and matching.job_id = v_job.id;
  if v_matching.state = 'stopped' or exists (select 1 from public.matching_operations as current_operation
    where current_operation.job_id = v_job.id and current_operation.id <> v_matching.id
      and current_operation.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')) then
    -- A delayed worker cancellation cannot overwrite the next replacement's receipt or capacity.
    update public.workflow_outbox set status = 'completed', lease_token = null, leased_by = null,
      lease_expires_at = null, last_error_code = null, updated_at = v_now where id = v_outbox.id;
    return 'completed';
  end if;
  if v_job.worker_id is not null then v_state := 'official_match';
  elsif v_job.status = 'worker_candidate_pending' then v_state := 'candidate_ready';
  elsif v_job.status <> 'broadcasting' then v_state := 'stopped'; end if;
  v_outcome := case when v_state <> 'recovery_required' then 'completed'
    when v_outbox.attempt_count >= 8 or p_error_code = 'LEGACY_MATCHING_REQUIRES_REVIEW' then 'dead_letter'
    else 'retry_scheduled' end;
  update public.matching_operations set state = v_state, updated_at = v_now where id = v_matching.id;
  update public.confirmation_operations set state = v_state, updated_at = v_now,
    last_error_code = case when v_state = 'recovery_required' then p_error_code else null end,
    retry_after_ms = case when v_outcome = 'retry_scheduled' then least(30000, power(2, least(v_outbox.attempt_count, 8))::integer * 1000) else null end
    where id = v_matching.confirmation_operation_id;
  if v_state in ('no_reachable_worker', 'stopped') then
    update public.matching_capacity_reservations set status = 'released', released_at = v_now, updated_at = v_now
      where job_id = v_job.id and status in ('held', 'offered');
  end if;
  update public.workflow_outbox set status = case when v_outcome = 'completed' then 'completed' else 'failed' end,
    lease_token = null, leased_by = null, lease_expires_at = null,
    next_attempt_at = v_now + make_interval(secs => least(300, power(2, least(v_outbox.attempt_count, 8))::integer)),
    dead_lettered_at = case when v_outcome = 'dead_letter' then v_now else null end,
    last_error_code = case when v_state = 'recovery_required' then p_error_code else null end, updated_at = v_now
    where id = v_outbox.id;
  return v_outcome;
end;
$func$;

create or replace function private.reconcile_exhausted_replacement_outbox(p_limit integer)
returns integer language plpgsql security definer set search_path = '' as $func$
declare
  v_target record;
  v_outbox public.workflow_outbox%rowtype;
  v_token uuid;
  v_outcome text;
  v_reconciled integer := 0;
  v_now timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'REPLACEMENT_OUTBOX_RECONCILE_INVALID';
  end if;
  for v_target in
    select outbox.id from public.jobs as job
      join public.matching_operations as matching on matching.job_id = job.id
      join public.workflow_outbox as outbox on coalesce(outbox.replacement_matching_operation_id,outbox.retry_matching_operation_id) = matching.id
    where outbox.event_type = 'matching_reconcile' and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null)
      and outbox.attempt_count >= 8 and outbox.dead_lettered_at is null and (
        (outbox.status = 'processing' and coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= clock_timestamp())
        or (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= clock_timestamp()))
    order by job.id, outbox.id limit p_limit for update of job skip locked
  loop
    select outbox.* into v_outbox from public.workflow_outbox as outbox
      where outbox.id = v_target.id for update skip locked;
    v_now := clock_timestamp();
    if v_outbox.id is null or v_outbox.attempt_count < 8 or v_outbox.dead_lettered_at is not null
      or not (
        (v_outbox.status = 'processing' and coalesce(v_outbox.lease_expires_at, '-infinity'::timestamptz) <= v_now)
        or (v_outbox.status in ('queued', 'failed') and v_outbox.next_attempt_at <= v_now))
    then continue; end if;
    -- Fence the crashed dispatcher and settle atomically, without a ninth matching attempt.
    v_token := gen_random_uuid();
    update public.workflow_outbox set status = 'processing', lease_token = v_token,
      leased_by = 'replacement-exhausted-lease-reconciler', lease_expires_at = v_now + interval '15 seconds'
      where id = v_outbox.id;
    v_outcome := public.settle_worker_replacement_outbox_claim(
      v_outbox.id, v_token, 'recovery_required', 'MATCHING_RETRY_EXHAUSTED');
    if v_outcome not in ('completed', 'dead_letter') then
      raise exception using errcode = '55000', message = 'REPLACEMENT_OUTBOX_RECONCILE_LOST';
    end if;
    v_reconciled := v_reconciled + 1;
  end loop;
  return v_reconciled;
end;
$func$;

create or replace function public.claim_worker_replacement_outbox_batch(
  p_dispatcher_id text, p_limit integer default 20, p_lease_seconds integer default 45
) returns table(outbox_id uuid, lease_token uuid)
language plpgsql security definer set search_path = '' as $func$
begin
  if p_dispatcher_id is null or p_dispatcher_id !~ '^[A-Za-z0-9_.:-]{8,160}$'
    or p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 15 and 120 then
    raise exception using errcode = '22023', message = 'REPLACEMENT_OUTBOX_CLAIM_INVALID';
  end if;
  perform private.reconcile_exhausted_replacement_outbox(p_limit);
  return query with claimable as (
    select outbox.id from public.workflow_outbox as outbox
    where outbox.event_type = 'matching_reconcile' and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null)
      and outbox.dead_lettered_at is null and outbox.attempt_count < 8
      and ((outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= clock_timestamp())
        or (outbox.status = 'processing' and coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= clock_timestamp()))
    order by outbox.next_attempt_at, outbox.created_at, outbox.id for update skip locked limit p_limit
  ) update public.workflow_outbox as outbox set status = 'processing',
    attempt_count = outbox.attempt_count + 1, lease_token = gen_random_uuid(), leased_by = p_dispatcher_id,
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), updated_at = clock_timestamp()
    from claimable where outbox.id = claimable.id returning outbox.id, outbox.lease_token;
end;
$func$;

create or replace function private.require_live_replacement_capacity(p_job_id uuid, p_worker_id uuid, p_broadcast_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
begin
  select job.* into strict v_job from public.jobs as job where job.id = p_job_id for update;
  select matching.* into v_matching from public.matching_operations as matching
    join public.workflow_outbox as outbox on coalesce(outbox.replacement_matching_operation_id,outbox.retry_matching_operation_id) = matching.id
    where matching.job_id = p_job_id and matching.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required');
  if not found then return; end if;
  perform worker.id from public.worker_profiles as worker where worker.id = p_worker_id for update;
  if v_matching.confirmation_operation_id is null or not exists (
    select 1 from private.eligible_matching_worker_ids(v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district), v_job.quote_mode,
      v_job.diagnosis_scope, v_job.intake_scope_snapshot, v_job.synthetic_cohort_id,
      clock_timestamp(), v_job.id, v_matching.confirmation_operation_id) as eligible
      where eligible.worker_id = p_worker_id
  ) or not exists (
    select 1 from public.matching_recipient_deliveries as delivery
    where delivery.operation_id = v_matching.id and delivery.worker_id = p_worker_id
      and delivery.job_id = v_job.id and delivery.expires_at > clock_timestamp()
      and delivery.status in ('queued', 'delivered', 'seen', 'accepted')
      and (p_broadcast_id is null or delivery.broadcast_id = p_broadcast_id)
      and delivery.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
  ) then raise exception using errcode = '55000', message = 'MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE'; end if;
  perform capacity.id from public.matching_capacity_reservations as capacity
    where capacity.operation_id = v_matching.confirmation_operation_id and capacity.job_id = v_job.id
      and capacity.worker_id = p_worker_id and capacity.status in ('held', 'offered')
      and capacity.expires_at > clock_timestamp()
      and capacity.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id for update;
  if not found then raise exception using errcode = '55000', message = 'MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE'; end if;
end;
$func$;

create or replace function private.kick_confirmation_matching_dispatcher()
returns trigger language plpgsql security definer set search_path = '' as $func$
declare
  v_project_url text;
  v_maintainer_secret text;
begin
  if not (new.event_type = 'matching_requested' or (new.event_type = 'matching_reconcile' and (new.worker_cancellation_id is not null or new.retry_matching_operation_id is not null)))
    or to_regclass('vault.decrypted_secrets') is null then return new; end if;
  select max(secret.decrypted_secret) filter (where secret.name = 'project_url'),
    max(secret.decrypted_secret) filter (where secret.name = 'kael_matching_maintainer_secret')
    into v_project_url, v_maintainer_secret from vault.decrypted_secrets as secret;
  if nullif(btrim(v_project_url), '') is null or nullif(btrim(v_maintainer_secret), '') is null then return new; end if;
  perform net.http_post(url := rtrim(v_project_url, '/') || '/functions/v1/kael-matching-maintainer',
    headers := jsonb_build_object('content-type', 'application/json', 'x-kael-matching-maintainer-secret', v_maintainer_secret),
    body := jsonb_build_object('source', 'confirmation_outbox'));
  return new;
exception when others then
  -- The outbox still commits when the fast wake-up fails; the existing cron reclaims it.
  return new;
end;
$func$;

create or replace trigger workflow_outbox_kick_confirmation_dispatcher
  after insert or update of status,retry_matching_operation_id on public.workflow_outbox for each row
  when (new.status='queued' and (new.event_type='matching_requested' or (new.event_type='matching_reconcile'
    and (new.worker_cancellation_id is not null or new.retry_matching_operation_id is not null))))
  execute function private.kick_confirmation_matching_dispatcher();

create or replace function public.get_confirmation_matching_outbox_health()
returns table(queued_count bigint, processing_count bigint, retry_count bigint, dead_letter_count bigint, oldest_ready_age_seconds integer)
language sql security definer set search_path = '' stable as $func$
  select count(*) filter (where outbox.status = 'queued' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.status = 'processing' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.status = 'failed' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.dead_lettered_at is not null),
    coalesce(max(extract(epoch from now() - outbox.next_attempt_at)) filter (
      where outbox.dead_lettered_at is null and outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= now()), 0)::integer
  from public.workflow_outbox as outbox where outbox.event_type = 'matching_requested'
    or (outbox.event_type = 'matching_reconcile' and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null));
$func$;

revoke execute on function private.reserve_fresh_matching_workers(uuid,uuid),
  private.reconcile_exhausted_replacement_outbox(integer) from public,anon,authenticated,service_role;
revoke execute on function public.request_job_matching_retry_atomic(uuid,uuid,uuid,uuid),
  public.activate_worker_replacement_outbox_claim(uuid,uuid),
  public.settle_worker_replacement_outbox_claim(uuid,uuid,text,text),
  public.claim_worker_replacement_outbox_batch(text,integer,integer),
  public.get_confirmation_matching_outbox_health() from public,anon,authenticated;
grant execute on function public.request_job_matching_retry_atomic(uuid,uuid,uuid,uuid),
  public.activate_worker_replacement_outbox_claim(uuid,uuid),
  public.settle_worker_replacement_outbox_claim(uuid,uuid,text,text),
  public.claim_worker_replacement_outbox_batch(text,integer,integer),
  public.get_confirmation_matching_outbox_health() to service_role;

commit;

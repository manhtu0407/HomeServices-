begin;

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
    join public.workflow_outbox as outbox on outbox.replacement_matching_operation_id = matching.id
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and outbox.worker_cancellation_id is not null for update of job;
  if not found then return jsonb_build_object('state', 'lease_lost'); end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and outbox.worker_cancellation_id is not null for update;
  v_sent_at := clock_timestamp();
  if v_outbox.id is null or v_outbox.status <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_outbox.lease_expires_at is null
    or v_outbox.lease_expires_at <= v_sent_at then
    return jsonb_build_object('state', 'lease_lost');
  end if;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = v_outbox.replacement_matching_operation_id and matching.job_id = v_job.id;
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
    return jsonb_build_object('state', 'broadcasting', 'job_id', v_job.id, 'customer_id', v_job.customer_id,
      'service_type', v_job.service_type, 'district', v_job.address_district,
      'expires_at', v_expires_at, 'targets', v_targets);
  end if;
  if exists (select 1 from public.job_broadcasts as broadcast where broadcast.job_id = v_job.id
    and broadcast.status = 'sent' and broadcast.expires_at > v_sent_at) then
    return jsonb_build_object('state', 'recovery_required', 'error_code', 'REPLACEMENT_OTHER_BATCH_ACTIVE');
  end if;

  update public.matching_capacity_reservations as capacity set status = 'expired',
    released_at = v_sent_at, updated_at = v_sent_at
    where capacity.job_id = v_job.id and capacity.status in ('held', 'offered') and capacity.expires_at <= v_sent_at;
  select coalesce(array_agg(selected.worker_id order by selected.worker_id), array[]::uuid[])
    into v_worker_ids from (
      select worker.id as worker_id from public.worker_profiles as worker
      join private.eligible_matching_worker_ids(v_job.service_type,
        public.normalize_hcmc_district_code(v_job.address_district), v_job.quote_mode,
        v_job.diagnosis_scope, v_job.intake_scope_snapshot, v_job.synthetic_cohort_id,
        v_sent_at, v_job.id, v_matching.confirmation_operation_id) as eligible on eligible.worker_id = worker.id
      where not exists (select 1 from public.worker_cancellation_requests as cancelled
        where cancelled.job_id = v_job.id and cancelled.worker_id = worker.id and cancelled.status = 'approved')
        and not exists (select 1 from public.job_broadcasts as prior
          where prior.job_id = v_job.id and prior.worker_id = worker.id)
        and not exists (select 1 from public.matching_capacity_reservations as capacity
          where capacity.worker_id = worker.id and capacity.job_id <> v_job.id and capacity.status in ('held', 'offered'))
      order by worker.id for update of worker skip locked limit 5
    ) as selected;
  if cardinality(v_worker_ids) = 0 then return jsonb_build_object('state', 'no_reachable_worker'); end if;
  v_expires_at := v_sent_at + interval '5 minutes';
  insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
    district_code, held_at, expires_at, synthetic_cohort_id)
    select v_matching.confirmation_operation_id, v_job.id, worker_id, v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district), v_sent_at, v_expires_at, v_job.synthetic_cohort_id
    from unnest(v_worker_ids) as selected(worker_id)
    on conflict (operation_id, worker_id) do update set status = 'held', held_at = excluded.held_at,
      released_at = null, expires_at = excluded.expires_at, updated_at = v_sent_at;
  select jsonb_agg(jsonb_build_object('worker_id', target.worker_id, 'broadcast_id', target.id,
    'delivery_id', target.delivery_id, 'operation_id', target.operation_id) order by target.worker_id) into v_targets
    from public.activate_job_broadcast_batch_durable_atomic_v2(v_job.id, v_worker_ids, v_outbox.id,
      v_sent_at, v_expires_at) as target;
  if v_targets is null then raise exception using errcode = '55000', message = 'REPLACEMENT_ACTIVATION_FAILED'; end if;
  return jsonb_build_object('state', 'broadcasting', 'job_id', v_job.id, 'customer_id', v_job.customer_id,
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
    join public.workflow_outbox as outbox on outbox.replacement_matching_operation_id = matching.id
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and outbox.worker_cancellation_id is not null for update of job;
  if not found then return 'lease_lost'; end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and outbox.worker_cancellation_id is not null for update;
  v_now := clock_timestamp();
  if v_outbox.id is null or v_outbox.status <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_outbox.lease_expires_at is null
    or v_outbox.lease_expires_at <= v_now then return 'lease_lost'; end if;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = v_outbox.replacement_matching_operation_id and matching.job_id = v_job.id;
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
      join public.workflow_outbox as outbox on outbox.replacement_matching_operation_id = matching.id
    where outbox.event_type = 'matching_reconcile' and outbox.worker_cancellation_id is not null
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
    where outbox.event_type = 'matching_reconcile' and outbox.worker_cancellation_id is not null
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

revoke execute on function private.reconcile_exhausted_replacement_outbox(integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.activate_worker_replacement_outbox_claim(uuid,uuid),
  public.settle_worker_replacement_outbox_claim(uuid,uuid,text,text),
  public.claim_worker_replacement_outbox_batch(text,integer,integer) from public, anon, authenticated;
grant execute on function public.activate_worker_replacement_outbox_claim(uuid,uuid),
  public.settle_worker_replacement_outbox_claim(uuid,uuid,text,text),
  public.claim_worker_replacement_outbox_batch(text,integer,integer) to service_role;

commit;

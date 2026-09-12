begin;

create or replace function public.request_job_matching_preference_atomic(
  p_job_id uuid,p_customer_id uuid,p_strategy text,p_preferred_worker_id uuid,
  p_auto_general boolean,p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $func$
declare
  v_job public.jobs%rowtype;
  v_preference public.job_matching_preferences%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_matching public.matching_operations%rowtype;
  v_outbox public.workflow_outbox%rowtype;
  v_worker record;
  v_capacity public.matching_capacity_reservations%rowtype;
  v_worker_ids uuid[]:=array[]::uuid[];
  v_required integer;
  v_now timestamptz;
begin
  if p_job_id is null or p_customer_id is null or p_client_request_id is null
    or p_strategy is null or p_strategy not in ('general','saved_worker_first') or p_auto_general is null
    or (p_strategy='saved_worker_first' and p_preferred_worker_id is null)
    or (p_strategy='general' and p_preferred_worker_id is not null)
  then raise exception using errcode='22023',message='MATCHING_PREFERENCE_INPUT_INVALID'; end if;
  select job.* into v_job from public.jobs job join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and job.customer_id=p_customer_id and actor.role='customer' for update of job;
  if not found then raise exception using errcode='42501',message='MATCHING_PREFERENCE_NOT_OWNED'; end if;

  -- Replay precedes workflow checks so the same receipt survives delivery, matching and completion.
  select preference.* into v_preference from public.job_matching_preferences preference
    where preference.job_id=p_job_id;
  if v_preference.matching_operation_id is not null then
    if v_preference.client_request_id is distinct from p_client_request_id
      or v_preference.strategy is distinct from p_strategy
      or v_preference.preferred_worker_id is distinct from p_preferred_worker_id
      or v_preference.auto_general is distinct from p_auto_general then
      raise exception using errcode='23505',message='MATCHING_PREFERENCE_REQUEST_CONFLICT';
    end if;
    return private.matching_preference_receipt(p_job_id);
  end if;
  if exists(select 1 from public.job_matching_preferences preference
    where preference.matching_operation_id is not null and preference.client_request_id=p_client_request_id)
  then raise exception using errcode='23505',message='MATCHING_PREFERENCE_REQUEST_CONFLICT'; end if;
  if v_preference.job_id is null or v_preference.strategy<>'pending'
    or v_job.status not in ('awaiting_customer_confirm','broadcasting') or v_job.worker_id is not null
    or v_job.quote_mode is null or v_job.quote_mode='blocked'
  then raise exception using errcode='55000',message='MATCHING_PREFERENCE_NOT_READY'; end if;

  -- Job -> outbox -> confirmation -> matching is shared with activation and settlement.
  select outbox.* into v_outbox from public.workflow_outbox outbox
    join public.confirmation_operations confirmation on confirmation.id=outbox.operation_id
    where confirmation.job_id=p_job_id and confirmation.customer_id=p_customer_id
      and outbox.event_type='matching_requested' for update of outbox;
  if not found then raise exception using errcode='55000',message='MATCHING_PREFERENCE_CONFIRMATION_UNAVAILABLE'; end if;
  select confirmation.* into strict v_confirmation from public.confirmation_operations confirmation
    where confirmation.id=v_outbox.operation_id for update;
  select matching.* into v_matching from public.matching_operations matching
    where matching.confirmation_operation_id=v_confirmation.id and matching.job_id=p_job_id
      and matching.retry_request_id is null
    order by matching.created_at,matching.id limit 1 for update;
  if not found or v_matching.state not in ('queued','recovery_required')
    or v_confirmation.state not in ('matching_queued','recovery_required')
    or v_confirmation.quote_mode is distinct from v_job.quote_mode
    or v_matching.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or v_confirmation.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or exists(select 1 from public.matching_recipient_deliveries where job_id=p_job_id)
    or exists(select 1 from public.job_worker_candidates where job_id=p_job_id)
  then raise exception using errcode='55000',message='MATCHING_PREFERENCE_NOT_READY'; end if;
  select preference.* into strict v_preference from public.job_matching_preferences preference
    where preference.job_id=p_job_id for update;
  if v_preference.strategy<>'pending' then
    raise exception using errcode='23505',message='MATCHING_PREFERENCE_REQUEST_CONFLICT';
  end if;
  if p_strategy='saved_worker_first' and not exists(
    select 1 from public.customer_favorite_workers favorite join public.worker_profiles worker on worker.id=favorite.worker_id
    where favorite.customer_id=p_customer_id and favorite.worker_id=p_preferred_worker_id
      and favorite.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
      and worker.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id)
  then raise exception using errcode='55000',message='MATCHING_PREFERENCE_FAVORITE_UNAVAILABLE'; end if;

  v_required:=case when v_job.synthetic_cohort_id is null then 3 else 1 end;
  for v_worker in
    select worker.id from public.worker_profiles worker join private.eligible_matching_worker_ids(
      v_job.service_type,public.normalize_hcmc_district_code(v_job.address_district),
      v_job.quote_mode,v_job.diagnosis_scope,v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,
      clock_timestamp(),v_job.id,v_confirmation.id) eligible on eligible.worker_id=worker.id
    order by case when worker.id=p_preferred_worker_id then 0 else 1 end,worker.id
    limit 50 for update of worker skip locked
  loop
    select capacity.* into v_capacity from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered') for update skip locked;
    if found then
      if v_capacity.expires_at>clock_timestamp() then continue; end if;
      update public.matching_capacity_reservations set status='expired',released_at=clock_timestamp(),
        updated_at=clock_timestamp() where id=v_capacity.id;
    elsif exists(select 1 from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered')) then continue;
    end if;
    if not exists(select 1 from private.eligible_matching_worker_ids(
      v_job.service_type,public.normalize_hcmc_district_code(v_job.address_district),
      v_job.quote_mode,v_job.diagnosis_scope,v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,
      clock_timestamp(),v_job.id,v_confirmation.id) eligible where eligible.worker_id=v_worker.id) then continue; end if;
    v_worker_ids:=array_append(v_worker_ids,v_worker.id);
    exit when cardinality(v_worker_ids)=5;
  end loop;
  if cardinality(v_worker_ids)<v_required then
    raise exception using errcode='55000',message='COVERAGE_UNAVAILABLE';
  end if;
  if p_strategy='saved_worker_first' and not p_auto_general and not p_preferred_worker_id=any(v_worker_ids) then
    raise exception using errcode='55000',message='MATCHING_PREFERENCE_FAVORITE_UNAVAILABLE';
  end if;
  v_now:=clock_timestamp();
  insert into public.matching_capacity_reservations(operation_id,job_id,worker_id,service_type,district_code,
    status,held_at,expires_at,synthetic_cohort_id)
    select v_confirmation.id,v_job.id,worker_id,v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),'held',v_now,v_now+interval '5 minutes',v_job.synthetic_cohort_id
    from unnest(v_worker_ids) selected(worker_id)
    on conflict(operation_id,worker_id) do update set status='held',held_at=excluded.held_at,
      expires_at=excluded.expires_at,released_at=null,updated_at=v_now;

  update public.job_matching_preferences set strategy=p_strategy,preferred_worker_id=p_preferred_worker_id,
    auto_general=p_auto_general,client_request_id=p_client_request_id,selected_at=v_now,matching_operation_id=v_matching.id
    where job_id=p_job_id;
  update public.matching_operations set state='queued',updated_at=v_now where id=v_matching.id;
  update public.confirmation_operations set state='matching_queued',last_error_code=null,retry_after_ms=1000,updated_at=v_now
    where id=v_confirmation.id;
  update public.workflow_outbox set status='queued',attempt_count=0,lease_token=null,leased_by=null,
    lease_expires_at=null,last_error_code=null,dead_lettered_at=null,next_attempt_at=v_now,updated_at=v_now
    where id=v_outbox.id;
  return private.matching_preference_receipt(p_job_id);
end;
$func$;

create or replace function public.settle_confirmation_matching_outbox_claim(
  p_outbox_id uuid, p_lease_token uuid, p_operation_id uuid,
  p_state text, p_error_code text default null
) returns text language plpgsql security definer set search_path = '' as $func$
declare
  v_outbox public.workflow_outbox%rowtype;
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
  v_state text := p_state;
  v_error text := p_error_code;
  v_delay_seconds integer;
  v_outcome text;
  v_now timestamptz;
  v_obsolete boolean;
  v_preferred_worker uuid;
begin
  if p_outbox_id is null or p_lease_token is null or p_operation_id is null
    or p_state is null or p_state not in ('broadcasting', 'no_reachable_worker', 'recovery_required')
    or (p_state = 'recovery_required' and (
      p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$'))
    or (p_state <> 'recovery_required' and p_error_code is not null) then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_SETTLE_INVALID';
  end if;

  -- Customer decisions lock the job first; the dispatcher must use the same order.
  select job.* into v_job from public.jobs as job
    join public.confirmation_operations as operation on operation.job_id = job.id
    where operation.id = p_operation_id for update of job;
  if not found then return 'lease_lost'; end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox
    where outbox.id = p_outbox_id and outbox.operation_id = p_operation_id
      and outbox.event_type = 'matching_requested' for update;
  v_now := clock_timestamp();
  if v_outbox.id is null or v_outbox.status <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or v_outbox.lease_expires_at is null or v_outbox.lease_expires_at <= v_now then
    return 'lease_lost';
  end if;

  select matching.* into v_matching from public.matching_operations as matching
    where matching.confirmation_operation_id = p_operation_id
      and not exists (select 1 from public.workflow_outbox as replacement
        where replacement.replacement_matching_operation_id = matching.id)
    order by matching.created_at, matching.id limit 1;
  v_obsolete := v_matching.state = 'stopped' or exists (
    select 1 from public.matching_operations as successor
    where successor.confirmation_operation_id = p_operation_id
      and successor.id is distinct from v_matching.id
  );
  if v_obsolete then
    -- Retiring an old delivery receipt cannot change a replacement operation.
    update public.workflow_outbox set status = 'completed', lease_token = null,
      leased_by = null, lease_expires_at = null, last_error_code = null, updated_at = v_now
      where id = v_outbox.id;
    return 'completed';
  end if;

  if v_job.status = 'cancelled' then v_state := 'stopped';
  elsif v_job.worker_id is not null then v_state := 'official_match';
  elsif v_job.status = 'worker_candidate_pending' then v_state := 'candidate_ready';
  elsif v_job.status <> 'broadcasting' or v_matching.id is null then
    v_state := 'recovery_required';
    v_error := 'MATCHING_STATE_REQUIRES_REVIEW';
  end if;
  if v_state <> 'recovery_required' then v_error := null; end if;
  v_delay_seconds := least(300, power(2, least(v_outbox.attempt_count, 8))::integer);
  v_outcome := case when v_state <> 'recovery_required' then 'completed'
    when v_outbox.attempt_count >= 8 or v_error = 'MATCHING_STATE_REQUIRES_REVIEW' then 'dead_letter'
    else 'retry_scheduled' end;

  update public.confirmation_operations set state = v_state,
    last_error_code = v_error,
    retry_after_ms = case when v_outcome = 'retry_scheduled'
      then least(30000, v_delay_seconds * 1000) else null end,
    updated_at = v_now where id = p_operation_id;
  update public.matching_operations set state = v_state, updated_at = v_now
    where id = v_matching.id;
  update public.workflow_outbox set
    status = case when v_outcome = 'completed' then 'completed' else 'failed' end,
    lease_token = null, leased_by = null, lease_expires_at = null,
    last_error_code = v_error,
    next_attempt_at = case when v_outcome = 'retry_scheduled'
      then v_now + make_interval(secs => v_delay_seconds) else next_attempt_at end,
    dead_lettered_at = case when v_outcome = 'dead_letter' then v_now else null end,
    updated_at = v_now where id = v_outbox.id;
  if v_state='no_reachable_worker' then
    select preference.preferred_worker_id into v_preferred_worker
      from public.job_matching_preferences preference
      where preference.job_id=v_job.id and preference.customer_id=v_job.customer_id
        and preference.strategy='saved_worker_first' and preference.auto_general
        and preference.matching_operation_id=v_matching.id and preference.fallback_at is null;
    if v_preferred_worker is not null then
      -- Persist the authorized continuation before a client can observe an exhausted initial attempt.
      perform public.request_job_saved_worker_fallback_atomic(v_job.id,v_preferred_worker);
    end if;
  end if;
  return v_outcome;
end;
$func$;

commit;

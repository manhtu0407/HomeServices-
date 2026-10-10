begin;

create or replace function private.reserve_fresh_matching_workers(
  p_job_id uuid,p_confirmation_id uuid,p_allow_expired_reuse boolean
) returns uuid[] language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_worker record;
  v_capacity public.matching_capacity_reservations%rowtype;
  v_worker_ids uuid[] := array[]::uuid[];
  v_required integer;
  v_now timestamptz;
  v_matching_scope jsonb;
  v_legacy_requirements jsonb;
  v_service_capabilities jsonb;
  v_case_capabilities jsonb;
begin
  select job.* into strict v_job from public.jobs job where job.id=p_job_id for update;
  select confirmation.* into strict v_confirmation from public.confirmation_operations confirmation
    where confirmation.id=p_confirmation_id and confirmation.job_id=v_job.id
      and confirmation.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id;
  v_now := clock_timestamp();

  v_matching_scope := case
    when jsonb_typeof(v_job.diagnosis_scope)='object' then v_job.diagnosis_scope
    when jsonb_typeof(v_job.intake_scope_snapshot)='object' then v_job.intake_scope_snapshot
    else '{}'::jsonb
  end;
  v_legacy_requirements := v_matching_scope->'worker_requirements';
  select floor.capability_requirements into v_service_capabilities
  from public.service_intake_policy_floors floor
  where floor.service_type=v_job.service_type;

  if jsonb_typeof(v_legacy_requirements)='array'
    and jsonb_typeof(v_service_capabilities)='array'
  then
    if jsonb_array_length(v_legacy_requirements)>0
      and jsonb_array_length(v_legacy_requirements)=jsonb_array_length(v_service_capabilities)
      and v_legacy_requirements @> v_service_capabilities
      and v_service_capabilities @> v_legacy_requirements
    then
      select policy.capability_requirements into v_case_capabilities
      from public.service_intake_policies policy
      where policy.status='active'
        and policy.service_type=v_job.service_type
        and (
          (v_job.service_problem_id is not null and policy.service_problem_id=v_job.service_problem_id)
          or (v_job.service_problem_id is null and policy.problem_slug=v_job.kael_problem_identified)
        )
      order by policy.version desc
      limit 1;
      if found and jsonb_typeof(v_case_capabilities)='array' then
        if jsonb_array_length(v_case_capabilities)>0
          and v_service_capabilities @> v_case_capabilities
        then
          v_matching_scope := jsonb_set(v_matching_scope,'{worker_requirements}',v_case_capabilities,true);
          update public.jobs set diagnosis_scope=v_matching_scope,updated_at=v_now where id=v_job.id;
        end if;
      end if;
    end if;
  end if;

  -- Initial public booking keeps its separate three-Worker coverage gate.
  v_required := 1;
  for v_stage in 1..2 loop
    if v_stage=2 and (not coalesce(p_allow_expired_reuse,false) or cardinality(v_worker_ids)>0) then exit; end if;
    for v_worker in
      select worker.id from public.worker_profiles worker
        join private.eligible_matching_worker_ids(v_job.service_type,
          public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_matching_scope,
          v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,v_now,v_job.id,v_confirmation.id) eligible
          on eligible.worker_id=worker.id
      where (
        (v_stage=1 and not exists(select 1 from public.job_broadcasts prior
          where prior.job_id=v_job.id and prior.worker_id=worker.id))
        or (v_stage=2 and exists(select 1 from public.job_broadcasts prior
          where prior.job_id=v_job.id and prior.worker_id=worker.id)
          and not exists(select 1 from public.job_broadcasts prior where prior.job_id=v_job.id
            and prior.worker_id=worker.id and prior.status<>'expired'))
      )
        and not exists(select 1 from public.job_worker_candidates candidate where candidate.job_id=v_job.id
          and candidate.worker_id=worker.id)
        and not exists(select 1 from public.worker_cancellation_requests cancellation
          where cancellation.job_id=v_job.id and cancellation.worker_id=worker.id and cancellation.status='approved')
      order by worker.id limit 50 for update of worker skip locked
    loop
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
        public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_matching_scope,
        v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,clock_timestamp(),v_job.id,v_confirmation.id) eligible
        where eligible.worker_id=v_worker.id) then continue; end if;
      v_worker_ids := array_append(v_worker_ids,v_worker.id);
      exit when cardinality(v_worker_ids)=5;
    end loop;
    exit when cardinality(v_worker_ids)>0;
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

create or replace function private.reserve_fresh_matching_workers(p_job_id uuid,p_confirmation_id uuid)
returns uuid[] language sql security definer set search_path = '' as $func$
  select private.reserve_fresh_matching_workers(p_job_id,p_confirmation_id,exists(
    select 1 from public.matching_operations matching
    join public.workflow_outbox outbox on outbox.retry_matching_operation_id=matching.id
    where matching.job_id=p_job_id and matching.confirmation_operation_id=p_confirmation_id
      and matching.retry_source='customer_explicit' and matching.state in ('queued','broadcasting')
      and outbox.event_type='matching_reconcile' and outbox.status='processing'
      and outbox.lease_token is not null and outbox.lease_expires_at>clock_timestamp()
  ));
$func$;

create or replace function private.queue_job_matching_continuation(
  p_job_id uuid,p_customer_id uuid,p_client_request_id uuid,p_expected_matching_operation_id uuid,p_retry_source text
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
    or p_expected_matching_operation_id is null or p_retry_source is null
    or p_retry_source not in ('customer_explicit','saved_worker_fallback') then
    raise exception using errcode='22023',message='MATCHING_RETRY_INPUT_INVALID';
  end if;
  select job.* into v_job from public.jobs job join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and job.customer_id=p_customer_id and actor.role='customer' for update of job;
  if not found then raise exception using errcode='42501',message='MATCHING_RETRY_NOT_OWNED'; end if;

  select matching.* into v_existing from public.matching_operations matching where matching.retry_request_id=p_client_request_id;
  if found then
    if v_existing.job_id<>p_job_id or v_existing.retry_requested_by<>p_customer_id
      or v_existing.retry_parent_operation_id<>p_expected_matching_operation_id
      or v_existing.retry_source<>p_retry_source then
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
  if p_retry_source='saved_worker_fallback' and not exists(
    select 1 from public.job_matching_preferences preference where preference.job_id=v_job.id
      and preference.customer_id=p_customer_id and preference.strategy='saved_worker_first'
      and preference.auto_general and preference.matching_operation_id=v_parent.id
      and preference.fallback_at is null) then
    raise exception using errcode='55000',message='MATCHING_FALLBACK_CONSENT_REQUIRED';
  end if;
  if p_retry_source='customer_explicit' and exists(select 1 from public.job_matching_preferences preference where preference.job_id=v_job.id
    and preference.strategy<>'general' and preference.fallback_at is null) then
    raise exception using errcode='55000',message='MATCHING_PREFERENCE_PENDING';
  end if;
  perform private.reserve_fresh_matching_workers(v_job.id,v_confirmation.id,p_retry_source='customer_explicit');
  v_now := clock_timestamp();
  insert into public.matching_operations(confirmation_operation_id,job_id,state,synthetic_cohort_id,
    retry_request_id,retry_parent_operation_id,retry_requested_by,retry_source,created_at,updated_at)
    values(v_confirmation.id,v_job.id,'queued',v_job.synthetic_cohort_id,p_client_request_id,v_parent.id,
      p_customer_id,p_retry_source,v_now,v_now) returning id into v_operation;
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

revoke execute on function private.reserve_fresh_matching_workers(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;

commit;

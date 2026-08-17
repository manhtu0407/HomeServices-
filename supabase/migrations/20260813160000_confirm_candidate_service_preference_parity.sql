-- Candidate confirmation must recheck the same worker service preference and
-- quality gate that allowed the worker to accept the broadcast.

create or replace function public.confirm_worker_candidate_atomic(
  p_job_id uuid,
  p_candidate_id uuid,
  p_customer_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  candidate_id uuid,
  worker_id uuid,
  already_applied boolean
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_candidate record;
  v_job record;
  v_worker record;
  v_job_district text;
  v_now timestamptz := now();
begin
  select j.id, j.status, j.customer_id, j.worker_id, j.matched_at,
      j.service_type, j.address_district
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found or v_job.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, null::uuid, false;
    return;
  end if;

  select c.id, c.worker_id, c.status, c.expires_at
    into v_candidate
    from public.job_worker_candidates as c
    where c.id = p_candidate_id
      and c.job_id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      v_job.status, null::uuid, null::uuid, false;
    return;
  end if;

  if v_candidate.status = 'proposed'
    and v_candidate.expires_at is not null
    and v_candidate.expires_at <= v_now
  then
    update public.job_worker_candidates
      set status = 'expired', updated_at = v_now
      where id = v_candidate.id and status = 'proposed';
    update public.jobs
      set status = 'broadcasting'::public.job_status,
          worker_id = null,
          matched_at = null,
          broadcast_at = null
      where id = p_job_id
        and customer_id = p_customer_id
        and status = 'worker_candidate_pending'::public.job_status;
    return query select false, 'EXPIRED'::text,
      'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  if v_candidate.status = 'customer_confirmed'
    and v_job.worker_id = v_candidate.worker_id
    and v_job.status in (
      'worker_matched'::public.job_status,
      'worker_on_way'::public.job_status,
      'arrived'::public.job_status,
      'inspecting'::public.job_status,
      'repairing'::public.job_status,
      'scope_change_pending'::public.job_status,
      'completed_by_worker'::public.job_status,
      'confirmed_by_customer'::public.job_status,
      'payment_pending'::public.job_status,
      'paid'::public.job_status,
      'reviewed'::public.job_status
    )
  then
    return query select true, null::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, true;
    return;
  end if;

  if v_candidate.status <> 'proposed'
    or v_job.status <> 'worker_candidate_pending'::public.job_status
  then
    return query select false, 'INVALID_STATUS'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  select wp.id, wp.is_approved, wp.is_available, wp.is_suspended,
      wp.selected_service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = v_candidate.worker_id
    for update;

  v_job_district := public.normalize_hcmc_district_code(v_job.address_district);

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_job_district is null
    or v_job_district = 'hcmc_all'
    or v_worker.selected_service_types is null
    or cardinality(v_worker.selected_service_types) = 0
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (
      v_job_district = any(v_worker.districts)
      or 'hcmc_all' = any(v_worker.districts)
    )
    or exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = v_candidate.worker_id
        and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1
      from public.jobs as active_job
      where active_job.worker_id = v_candidate.worker_id
        and active_job.id <> p_job_id
        and active_job.status in (
          'worker_matched'::public.job_status,
          'worker_on_way'::public.job_status,
          'arrived'::public.job_status,
          'inspecting'::public.job_status,
          'repairing'::public.job_status,
          'scope_change_pending'::public.job_status,
          'completed_by_worker'::public.job_status
        )
      limit 1
    )
  then
    update public.job_worker_candidates as c
      set status = 'withdrawn',
          updated_at = v_now
      where c.id = v_candidate.id
        and c.status = 'proposed';
    update public.jobs as j
      set status = 'broadcasting'::public.job_status,
          worker_id = null,
          matched_at = null,
          broadcast_at = null
      where j.id = p_job_id
        and j.customer_id = p_customer_id
        and j.status = 'worker_candidate_pending'::public.job_status;
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.job_worker_candidates as c
    set status = 'customer_confirmed',
        customer_decided_at = v_now,
        updated_at = v_now
    where c.id = v_candidate.id
      and c.status = 'proposed';

  if not found then
    return query select false, 'STATUS_CHANGED'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.jobs as j
    set worker_id = v_candidate.worker_id,
        status = 'worker_matched'::public.job_status,
        matched_at = v_now
    where j.id = p_job_id
      and j.customer_id = p_customer_id
      and j.status = 'worker_candidate_pending'::public.job_status;

  if not found then
    raise exception using errcode = '40001',
      message = 'job status changed while confirming worker';
  end if;

  return query select true, null::text,
    'worker_matched'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$func$;

revoke execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) from public;
revoke execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) from anon;
revoke execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) to service_role;

comment on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) is
  'Customer-confirmed candidate assignment with selected-service, quality, district, availability, expiry, and idempotency guards.';

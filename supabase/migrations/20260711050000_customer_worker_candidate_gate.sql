-- Customer-confirmed worker candidate gate.
--
-- A worker accepting a broadcast reserves that worker and proposes them to the
-- customer. The job remains address-locked and has no jobs.worker_id until the
-- owning customer confirms the exact candidate id.

drop function if exists public.accept_broadcast_atomic(uuid, uuid);

create function public.accept_broadcast_atomic(
  p_job_id uuid,
  p_worker_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  candidate_id uuid,
  already_applied boolean
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_broadcast record;
  v_candidate record;
  v_job record;
  v_worker record;
  v_job_district text;
  v_now timestamptz := now();
begin
  select j.id, j.status, j.service_type, j.address_district
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  -- Safe retry after the same worker already won the job lock.
  if v_job.status = 'worker_candidate_pending'::public.job_status then
    select c.id, c.worker_id, c.status
      into v_candidate
      from public.job_worker_candidates as c
      where c.job_id = p_job_id
        and c.worker_id = p_worker_id
        and c.status = 'proposed'
      order by c.proposed_at desc, c.id desc
      limit 1;

    if found then
      return query select true, null::text,
        'worker_candidate_pending'::public.job_status,
        v_candidate.id, true;
      return;
    end if;

    return query select false, 'ALREADY_TAKEN'::text,
      v_job.status, null::uuid, false;
    return;
  end if;

  if v_job.status <> 'broadcasting'::public.job_status then
    return query select false, 'ALREADY_TAKEN'::text,
      v_job.status, null::uuid, false;
    return;
  end if;

  select jb.id, jb.status, jb.expires_at
    into v_broadcast
    from public.job_broadcasts as jb
    where jb.job_id = p_job_id
      and jb.worker_id = p_worker_id
      and jb.status = 'sent'::public.broadcast_status
    order by jb.sent_at desc nulls last,
      jb.broadcast_at desc nulls last,
      jb.id desc
    limit 1
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  if v_broadcast.expires_at is not null and v_broadcast.expires_at <= v_now then
    update public.job_broadcasts as jb
      set status = 'expired'::public.broadcast_status,
          responded_at = v_now
      where jb.id = v_broadcast.id
        and jb.status = 'sent'::public.broadcast_status;
    return query select false, 'EXPIRED'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  select wp.id, wp.is_approved, wp.is_available, wp.is_suspended,
      wp.service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = p_worker_id
    for update;

  if v_job.address_district is null
    or v_job.address_district = 'hcmc_all'
  then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  v_job_district := v_job.address_district;

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_worker.service_types is null
    or cardinality(v_worker.service_types) = 0
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (v_job.service_type = any(v_worker.service_types))
    or not (
      v_job_district = any(v_worker.districts)
      or 'hcmc_all' = any(v_worker.districts)
    )
    or exists (
      select 1
      from public.jobs as active_job
      where active_job.worker_id = p_worker_id
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
    or exists (
      select 1
      from public.job_worker_candidates as reserved
      where reserved.worker_id = p_worker_id
        and reserved.job_id <> p_job_id
        and reserved.status = 'proposed'
        and reserved.expires_at > v_now
      limit 1
    )
  then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  insert into public.job_worker_candidates (
    job_id,
    worker_id,
    broadcast_id,
    status,
    proposed_at,
    expires_at
  ) values (
    p_job_id,
    p_worker_id,
    v_broadcast.id,
    'proposed',
    v_now,
    v_now + interval '10 minutes'
  )
  returning id, worker_id, status into v_candidate;

  update public.jobs as j
    set status = 'worker_candidate_pending'::public.job_status,
        worker_id = null,
        matched_at = null
    where j.id = p_job_id
      and j.status = 'broadcasting'::public.job_status;

  if not found then
    raise exception using errcode = '40001',
      message = 'job status changed while proposing worker';
  end if;

  update public.job_broadcasts as jb
    set status = 'accepted'::public.broadcast_status,
        responded_at = v_now
    where jb.id = v_broadcast.id
      and jb.status = 'sent'::public.broadcast_status;

  update public.job_broadcasts as jb
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where jb.job_id = p_job_id
      and jb.id <> v_broadcast.id
      and jb.status = 'sent'::public.broadcast_status;

  return query select true, null::text,
    'worker_candidate_pending'::public.job_status,
    v_candidate.id, false;
end;
$func$;

create function public.confirm_worker_candidate_atomic(
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
      wp.service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = v_candidate.worker_id
    for update;

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_job.address_district is null
    or v_job.address_district = 'hcmc_all'
    or v_worker.service_types is null
    or cardinality(v_worker.service_types) = 0
    or not (v_job.service_type = any(v_worker.service_types))
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (
      v_job.address_district = any(v_worker.districts)
      or 'hcmc_all' = any(v_worker.districts)
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

create function public.reject_worker_candidate_atomic(
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
  v_now timestamptz := now();
begin
  select j.id, j.status, j.customer_id, j.worker_id
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

  if v_candidate.status = 'expired' then
    return query select true, null::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, true;
    return;
  end if;

  if v_candidate.status = 'proposed'
    and v_candidate.expires_at is not null
    and v_candidate.expires_at <= v_now
  then
    update public.job_worker_candidates as c
      set status = 'expired',
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
    return query select true, null::text,
      'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  -- A stale retry targets its original candidate id and cannot reject a newer
  -- proposal that may already exist for the same job.
  if v_candidate.status = 'customer_declined' then
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

  update public.job_worker_candidates as c
    set status = 'customer_declined',
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
    set status = 'broadcasting'::public.job_status,
        worker_id = null,
        matched_at = null,
        broadcast_at = null
    where j.id = p_job_id
      and j.customer_id = p_customer_id
      and j.status = 'worker_candidate_pending'::public.job_status;

  if not found then
    raise exception using errcode = '40001',
      message = 'job status changed while rejecting worker';
  end if;

  return query select true, null::text,
    'broadcasting'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$func$;

revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from public;
revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from anon;
revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from authenticated;
grant execute on function public.accept_broadcast_atomic(uuid, uuid) to service_role;

revoke execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) from public;
revoke execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) from anon;
revoke execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) to service_role;

revoke execute on function public.reject_worker_candidate_atomic(uuid, uuid, uuid) from public;
revoke execute on function public.reject_worker_candidate_atomic(uuid, uuid, uuid) from anon;
revoke execute on function public.reject_worker_candidate_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.reject_worker_candidate_atomic(uuid, uuid, uuid) to service_role;

comment on function public.accept_broadcast_atomic(uuid, uuid) is
  'Service-role-only atomic worker proposal. Reserves the worker without assigning jobs.worker_id or releasing address fields.';

comment on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid) is
  'Service-role-only owning-customer confirmation that atomically assigns the exact proposed worker.';

comment on function public.reject_worker_candidate_atomic(uuid, uuid, uuid) is
  'Service-role-only owning-customer rejection that releases the reservation and safely returns the job to matching.';

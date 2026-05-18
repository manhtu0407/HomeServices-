-- =============================================================================
-- Migration: accept_broadcast_privacy_guard
--
-- Why:
-- - Keep the job-first lock order from the race hardening migrations.
-- - Avoid returning job lifecycle state to a worker that has no active broadcast
--   for the job. Without this guard, a guessed job id could receive
--   ALREADY_TAKEN before the worker-broadcast membership check.
-- =============================================================================

create or replace function public.accept_broadcast_atomic(
  p_job_id uuid,
  p_worker_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  address_building text,
  address_unit text,
  address_floor text,
  address_district text
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_broadcast record;
  v_job_state record;
  v_job record;
  v_worker record;
  v_job_district text;
  v_now timestamptz := now();
begin
  select j.id, j.status, j.service_type, j.address_district
    into v_job_state
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  select jb.id, jb.status, jb.expires_at
    into v_broadcast
    from public.job_broadcasts as jb
    where jb.job_id = p_job_id
      and jb.worker_id = p_worker_id
      and jb.status = 'sent'::public.broadcast_status
    order by jb.sent_at desc nulls last, jb.broadcast_at desc nulls last, jb.id desc
    limit 1
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_job_state.status <> 'broadcasting'::public.job_status then
    return query select false, 'ALREADY_TAKEN'::text,
      v_job_state.status, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_broadcast.status <> 'sent'::public.broadcast_status then
    return query select false, 'BROADCAST_NOT_ACTIVE'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_broadcast.expires_at is not null and v_broadcast.expires_at <= v_now then
    update public.job_broadcasts as jb
      set status = 'expired'::public.broadcast_status, responded_at = v_now
      where jb.id = v_broadcast.id
        and jb.status = 'sent'::public.broadcast_status;
    return query select false, 'EXPIRED'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  select wp.id, wp.is_approved, wp.is_available, wp.is_suspended, wp.service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = p_worker_id
    for update;

  if v_job_state.address_district is null
    or v_job_state.address_district = 'hcmc_all'
  then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_job_district := v_job_state.address_district;

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_worker.service_types is null
    or cardinality(v_worker.service_types) = 0
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (v_job_state.service_type = any(v_worker.service_types))
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
  then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  update public.jobs as j
    set worker_id = p_worker_id,
        status = 'worker_matched'::public.job_status,
        matched_at = v_now
    where j.id = p_job_id and j.status = 'broadcasting'::public.job_status
    returning j.id, j.address_building, j.address_unit, j.address_floor, j.address_district
    into v_job;

  if not found then
    return query select false, 'ALREADY_TAKEN'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
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

  update public.worker_profiles as wp
    set is_available = false,
        updated_at = v_now
    where wp.id = p_worker_id;

  return query select
    true,
    null::text,
    'worker_matched'::public.job_status,
    v_job.address_building,
    v_job.address_unit,
    v_job.address_floor,
    v_job.address_district;
end;
$func$;

revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from public;
revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from anon;
revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from authenticated;
grant execute on function public.accept_broadcast_atomic(uuid, uuid) to service_role;

comment on function public.accept_broadcast_atomic(uuid, uuid) is
  'Atomic worker broadcast accept with privacy-preserving broadcast membership guard, service/district eligibility guard, job-first lock order, and job-wide sent-broadcast cleanup. Service-role only.';

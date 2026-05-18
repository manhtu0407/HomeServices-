-- =============================================================================
-- Migration: accept_broadcast_worker_eligibility
-- Re-check worker eligibility at accept time. A broadcast may have been sent
-- while the worker was approved/available, but the worker can be suspended or
-- taken offline before tapping accept.
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
  v_job record;
  v_worker record;
  v_now timestamptz := now();
begin
  select id, status, expires_at, batch_id
    into v_broadcast
    from public.job_broadcasts
    where job_id = p_job_id
      and worker_id = p_worker_id
      and status = 'sent'::public.broadcast_status
    order by sent_at desc nulls last, broadcast_at desc nulls last, created_at desc
    limit 1
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_broadcast.status <> 'sent'::public.broadcast_status then
    return query select false, 'BROADCAST_NOT_ACTIVE'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_broadcast.expires_at is not null and v_broadcast.expires_at <= v_now then
    update public.job_broadcasts
      set status = 'expired'::public.broadcast_status, responded_at = v_now
      where id = v_broadcast.id;
    return query select false, 'EXPIRED'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  select id, is_approved, is_available, is_suspended
    into v_worker
    from public.worker_profiles
    where id = p_worker_id;

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or exists (
      select 1
        from public.jobs
        where worker_id = p_worker_id
          and id <> p_job_id
          and status in (
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

  update public.jobs
    set worker_id = p_worker_id,
        status = 'worker_matched'::public.job_status,
        matched_at = v_now
    where id = p_job_id and status = 'broadcasting'::public.job_status
    returning id, address_building, address_unit, address_floor, address_district
    into v_job;

  if not found then
    return query select false, 'ALREADY_TAKEN'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  update public.job_broadcasts
    set status = 'accepted'::public.broadcast_status,
        responded_at = v_now
    where id = v_broadcast.id;

  update public.job_broadcasts
    set status = 'reassigned'::public.broadcast_status
    where batch_id = v_broadcast.batch_id
      and status = 'sent'::public.broadcast_status;

  update public.worker_profiles
    set is_available = false,
        updated_at = v_now
    where id = p_worker_id;

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

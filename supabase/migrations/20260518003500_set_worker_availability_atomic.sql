-- =============================================================================
-- Migration: set_worker_availability_atomic
--
-- Why:
-- - Availability changes race with accept_broadcast_atomic unless they lock the
--   same worker_profiles row.
-- - Going online must re-check active jobs in the same transaction as the row
--   update so a worker cannot become available after accepting another job.
-- =============================================================================

drop function if exists public.set_worker_availability_atomic(uuid, boolean);

create function public.set_worker_availability_atomic(
  p_worker_id uuid,
  p_is_available boolean
) returns table (
  ok boolean,
  error_code text,
  is_available boolean,
  updated_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_worker record;
  v_now timestamptz := now();
begin
  select id, is_approved, is_suspended
    into v_worker
    from public.worker_profiles
    where id = p_worker_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::boolean, null::timestamptz;
    return;
  end if;

  if p_is_available is true and (
    v_worker.is_approved is not true or v_worker.is_suspended is true
  ) then
    return query select false, 'NOT_APPROVED'::text, null::boolean, null::timestamptz;
    return;
  end if;

  if p_is_available is true and exists (
    select 1
      from public.jobs
      where worker_id = p_worker_id
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
  ) then
    return query select false, 'WORKER_BUSY'::text, null::boolean, null::timestamptz;
    return;
  end if;

  update public.worker_profiles
    set is_available = p_is_available,
        updated_at = v_now
    where id = p_worker_id;

  return query select true, null::text, p_is_available, v_now;
end;
$func$;

revoke execute on function public.set_worker_availability_atomic(uuid, boolean) from public;
revoke execute on function public.set_worker_availability_atomic(uuid, boolean) from anon;
revoke execute on function public.set_worker_availability_atomic(uuid, boolean) from authenticated;
grant execute on function public.set_worker_availability_atomic(uuid, boolean) to service_role;

comment on function public.set_worker_availability_atomic(uuid, boolean) is
  'Atomic worker availability toggle with worker row lock and active-job guard. Service-role only.';

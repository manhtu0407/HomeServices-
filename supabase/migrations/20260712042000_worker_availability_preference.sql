-- =============================================================================
-- Migration: worker_availability_preference
--
-- Availability is the worker's explicit preference. Capacity remains enforced
-- by matching and accept-time active-job guards, so a worker can set their
-- future availability while they finish the current job without receiving a
-- concurrent assignment.
-- =============================================================================

create or replace function public.set_worker_availability_atomic(
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
  if p_is_available is false then
    update public.job_broadcasts
      set status = 'expired'::public.broadcast_status,
          responded_at = v_now
      where worker_id = p_worker_id
        and status = 'sent'::public.broadcast_status;
  end if;

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
  'Atomic worker availability preference update with approval guard and offline broadcast expiry.';

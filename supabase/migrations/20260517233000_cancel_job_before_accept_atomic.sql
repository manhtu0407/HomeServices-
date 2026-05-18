-- =============================================================================
-- Migration: cancel_job_before_accept_atomic
-- Customer cancellation before worker acceptance must update the job and active
-- broadcasts in one transaction. This prevents API success with stale sent
-- broadcasts still available for worker accept.
-- =============================================================================

drop function if exists public.cancel_job_before_accept_atomic(uuid, uuid);

create function public.cancel_job_before_accept_atomic(
  p_job_id uuid,
  p_customer_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  cancelled_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job record;
  v_now timestamptz := now();
begin
  select id, customer_id, status
    into v_job
    from public.jobs
    where id = p_job_id
    for update;

  if not found or v_job.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::timestamptz;
    return;
  end if;

  if v_job.status not in (
    'awaiting_customer_confirm'::public.job_status,
    'broadcasting'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text,
      v_job.status, null::timestamptz;
    return;
  end if;

  update public.jobs
    set status = 'cancelled'::public.job_status,
        cancelled_at = v_now
    where id = p_job_id
      and status = v_job.status;

  if not found then
    return query select false, 'STATUS_CHANGED'::text,
      null::public.job_status, null::timestamptz;
    return;
  end if;

  update public.job_broadcasts
    set status = 'cancelled'::public.broadcast_status,
        responded_at = v_now
    where job_id = p_job_id
      and status in (
        'pending'::public.broadcast_status,
        'sent'::public.broadcast_status
      );

  return query select
    true,
    null::text,
    'cancelled'::public.job_status,
    v_now;
end;
$func$;

revoke execute on function public.cancel_job_before_accept_atomic(uuid, uuid) from public;
revoke execute on function public.cancel_job_before_accept_atomic(uuid, uuid) from anon;
revoke execute on function public.cancel_job_before_accept_atomic(uuid, uuid) from authenticated;
grant execute on function public.cancel_job_before_accept_atomic(uuid, uuid) to service_role;

comment on function public.cancel_job_before_accept_atomic(uuid, uuid) is
  'Atomic customer cancellation before worker acceptance. Service-role only.';

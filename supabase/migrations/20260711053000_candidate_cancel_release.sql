-- Keep customer cancellation atomic while a worker is reserved for review.
-- The pending candidate is declined, the worker reservation is released, and
-- every broadcast for the cancelled job is closed in the same transaction.

create or replace function public.cancel_job_before_accept_atomic(
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
    'broadcasting'::public.job_status,
    'worker_candidate_pending'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text,
      v_job.status, null::timestamptz;
    return;
  end if;

  if v_job.status = 'worker_candidate_pending'::public.job_status then
    update public.job_worker_candidates as c
      set status = 'customer_declined',
          customer_decided_at = v_now,
          updated_at = v_now
      where c.job_id = p_job_id
        and c.status = 'proposed';
  end if;

  update public.jobs as j
    set status = 'cancelled'::public.job_status,
        worker_id = null,
        matched_at = null,
        cancelled_at = v_now
    where j.id = p_job_id
      and j.customer_id = p_customer_id
      and j.status = v_job.status;

  if not found then
    return query select false, 'STATUS_CHANGED'::text,
      null::public.job_status, null::timestamptz;
    return;
  end if;

  update public.job_broadcasts as jb
    set status = 'cancelled'::public.broadcast_status,
        responded_at = coalesce(jb.responded_at, v_now)
    where jb.job_id = p_job_id
      and jb.status in (
        'pending'::public.broadcast_status,
        'sent'::public.broadcast_status,
        'accepted'::public.broadcast_status,
        'reassigned'::public.broadcast_status
      );

  return query select true, null::text,
    'cancelled'::public.job_status, v_now;
end;
$func$;

revoke execute on function public.cancel_job_before_accept_atomic(uuid, uuid) from public;
revoke execute on function public.cancel_job_before_accept_atomic(uuid, uuid) from anon;
revoke execute on function public.cancel_job_before_accept_atomic(uuid, uuid) from authenticated;
grant execute on function public.cancel_job_before_accept_atomic(uuid, uuid) to service_role;

comment on function public.cancel_job_before_accept_atomic(uuid, uuid) is
  'Atomic customer cancellation before match confirmation, including candidate reservation release. Service-role only.';

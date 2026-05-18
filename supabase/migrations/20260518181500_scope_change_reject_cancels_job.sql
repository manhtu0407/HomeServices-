-- =============================================================================
-- Migration: scope_change_reject_cancels_job
--
-- A rejected scope change must stop changed work. The current product does not
-- have an explicit "continue original scope" state, so rejection cancels the job
-- instead of silently returning the worker to repairing.
-- =============================================================================

create or replace function public.decide_scope_change_atomic(
  p_scope_change_id uuid,
  p_customer_id uuid,
  p_decision text
) returns table (
  ok boolean,
  error_code text,
  job_id_out uuid,
  scope_status public.scope_change_status,
  decided_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_sc record;
  v_job record;
  v_new_status public.scope_change_status;
  v_decision_text text;
  v_job_status public.job_status;
  v_now timestamptz := now();
  v_updated_scope_id uuid;
  v_updated_job_id uuid;
begin
  if p_decision not in ('approve', 'reject') then
    return query select false, 'INVALID_DECISION'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select id, job_id, status into v_sc
    from public.scope_change_requests
    where id = p_scope_change_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_sc.status not in (
    'waiting_customer_decision'::public.scope_change_status,
    'reviewing_by_kael'::public.scope_change_status
  ) then
    return query select false, 'ALREADY_DECIDED'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select id, customer_id, status into v_job
    from public.jobs
    where id = v_sc.job_id
    for update;

  if not found or v_job.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_job.status <> 'scope_change_pending'::public.job_status then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if p_decision = 'approve' then
    v_new_status := 'approved_by_customer'::public.scope_change_status;
    v_decision_text := 'approved';
    v_job_status := 'repairing'::public.job_status;
  else
    v_new_status := 'rejected_by_customer'::public.scope_change_status;
    v_decision_text := 'rejected';
    v_job_status := 'cancelled'::public.job_status;
  end if;

  with updated_job as (
    update public.jobs
      set status = v_job_status,
          scope_change_customer_decision = v_decision_text,
          cancelled_at = case
            when v_job_status = 'cancelled'::public.job_status then v_now
            else cancelled_at
          end
      where id = v_sc.job_id
        and status = 'scope_change_pending'::public.job_status
      returning id
  ),
  updated_scope as (
    update public.scope_change_requests
      set status = v_new_status,
          customer_decision_at = v_now
      where id = p_scope_change_id
        and status = v_sc.status
        and exists (select 1 from updated_job)
      returning id
  )
  select
    (select id from updated_job),
    (select id from updated_scope)
    into v_updated_job_id, v_updated_scope_id;

  if v_updated_job_id is null then
    return query select false, 'STATUS_CHANGED'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_updated_scope_id is null then
    raise exception 'scope change decision invariant violated'
      using errcode = 'P0001';
  end if;

  return query select
    true,
    null::text,
    v_sc.job_id,
    v_new_status,
    v_now;
end;
$func$;

revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from public;
revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from anon;
revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from authenticated;
grant execute on function public.decide_scope_change_atomic(uuid, uuid, text) to service_role;

comment on function public.decide_scope_change_atomic(uuid, uuid, text) is
  'Atomic customer scope-change decision. Approve resumes repairing; reject cancels to stop changed work until original-scope support exists.';

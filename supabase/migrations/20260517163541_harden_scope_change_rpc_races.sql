-- =============================================================================
-- Migration: harden_scope_change_rpc_races
--
-- Why:
-- - Scope-change RPCs are lifecycle boundaries. Race conditions must return
--   explicit API-safe error codes instead of surfacing as generic DB errors.
-- - The previous implementation raised exceptions when job status changed
--   mid-transaction. That is atomic, but the mobile API could only map it to
--   DB_ERROR.
--
-- Scope:
-- - Keep service-role-only execution.
-- - Keep SECURITY INVOKER to avoid privilege escalation in public schema.
-- - Lock lifecycle rows with FOR UPDATE before deciding transitions.
-- =============================================================================

create or replace function public.request_scope_change_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_new_description text,
  p_new_price_min int,
  p_new_price_max int,
  p_reason text
) returns table (
  ok boolean,
  error_code text,
  scope_change_id uuid,
  scope_status public.scope_change_status,
  created_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job record;
  v_sc_id uuid;
  v_sc_created timestamptz;
  v_updated_job_id uuid;
begin
  if p_new_price_min <= 0
    or p_new_price_max <= 0
    or p_new_price_max < p_new_price_min
  then
    return query select false, 'INVALID_PRICE_RANGE'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select id, status, worker_id, kael_problem_identified
    into v_job
    from public.jobs
    where id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_job.worker_id <> p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_job.status not in (
    'inspecting'::public.job_status,
    'repairing'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  update public.jobs
    set status = 'scope_change_pending'::public.job_status,
        scope_change_description = p_new_description,
        scope_change_price_min = p_new_price_min,
        scope_change_price_max = p_new_price_max,
        scope_change_reason = p_reason
    where id = p_job_id
      and status = v_job.status
    returning id into v_updated_job_id;

  if v_updated_job_id is null then
    return query select false, 'STATUS_CHANGED'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  insert into public.scope_change_requests (
    job_id, worker_id, status,
    original_summary, requested_description, reason,
    price_min, price_max
  ) values (
    p_job_id,
    p_worker_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_job.kael_problem_identified,
    p_new_description,
    p_reason,
    p_new_price_min,
    p_new_price_max
  )
  returning id, created_at into v_sc_id, v_sc_created;

  return query select
    true,
    null::text,
    v_sc_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_sc_created;
end;
$func$;

revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, int, int, text) from public;
revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, int, int, text) from anon;
revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, int, int, text) from authenticated;
grant execute on function public.request_scope_change_atomic(uuid, uuid, text, int, int, text) to service_role;

comment on function public.request_scope_change_atomic(uuid, uuid, text, int, int, text) is
  'Atomic worker scope change request with row locking and explicit race error codes. Service-role only.';


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
  else
    v_new_status := 'rejected_by_customer'::public.scope_change_status;
    v_decision_text := 'rejected';
  end if;

  with updated_job as (
    update public.jobs
      set status = 'repairing'::public.job_status,
          scope_change_customer_decision = v_decision_text
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
  'Atomic customer scope change decision with row locking and explicit race error codes. Service-role only.';

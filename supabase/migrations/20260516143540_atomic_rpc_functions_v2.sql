-- =============================================================================
-- Migration: 20260516170000_atomic_rpc_functions.sql
-- Tier 3 â€” Atomic multi-step writes via plpgsql functions.
--
-- Background:
--   Supabase JS client cannot start a multi-statement transaction. Modules
--   like acceptBroadcast and scope-change perform 2-4 writes that should be
--   atomic but currently aren't. Partial failures leave orphan rows.
--
-- Fix:
--   Wrap each multi-write op as a single plpgsql function. The function body
--   runs as one transaction; either all writes commit or all roll back.
--
-- Security:
--   - SECURITY DEFINER: runs as function owner, bypasses RLS for cross-table
--     writes. Necessary because RLS doesn't permit atomic UPDATE across jobs
--     + job_broadcasts in a single client call.
--   - Functions do NOT take actor_id as a parameter â€” they read auth.uid()
--     directly so callers cannot impersonate other users by passing a foreign
--     id. Anonymous (no JWT) calls fail at the auth.uid() IS NULL check.
--   - search_path pinned to prevent function hijack via schema poisoning.
--   - EXECUTE revoked from public/anon; granted only to authenticated.
--
-- Idempotency:
--   DROP FUNCTION IF EXISTS for re-runs. Functions never have side effects
--   until they actually mutate rows.
-- =============================================================================

-- =============================================================================
-- accept_broadcast_atomic
-- =============================================================================
-- Replaces 3-step accept flow in accept-broadcast.ts. Caller is identified by
-- auth.uid() â€” no worker_id parameter, no spoof surface.

drop function if exists public.accept_broadcast_atomic(uuid, uuid);
drop function if exists public.accept_broadcast_atomic(uuid);

create function public.accept_broadcast_atomic(
  p_job_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  address_building text,
  address_unit text,
  address_floor text,
  address_district text
) language plpgsql security definer
set search_path = public, pg_catalog
as $func$
declare
  v_worker_id uuid := auth.uid();
  v_broadcast record;
  v_job record;
  v_now timestamptz := now();
begin
  if v_worker_id is null then
    return query select false, 'AUTH_MISSING'::text,
      null::public.job_status, null::text, null::text, null::text, null::text;
    return;
  end if;

  -- Step 1: locate this worker's broadcast for this job.
  select id, status, expires_at, batch_id
    into v_broadcast
    from public.job_broadcasts
    where job_id = p_job_id and worker_id = v_worker_id
    limit 1;

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

  -- Step 2: atomic claim â€” only succeeds if job still in 'broadcasting'.
  update public.jobs
    set worker_id = v_worker_id,
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

  -- Step 3: mark this broadcast accepted.
  update public.job_broadcasts
    set status = 'accepted'::public.broadcast_status,
        responded_at = v_now
    where id = v_broadcast.id;

  -- Step 4: mark sibling broadcasts in same batch as reassigned.
  update public.job_broadcasts
    set status = 'reassigned'::public.broadcast_status
    where batch_id = v_broadcast.batch_id
      and status = 'sent'::public.broadcast_status;

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

revoke execute on function public.accept_broadcast_atomic(uuid) from public;
revoke execute on function public.accept_broadcast_atomic(uuid) from anon;
grant execute on function public.accept_broadcast_atomic(uuid) to authenticated;
grant execute on function public.accept_broadcast_atomic(uuid) to service_role;

comment on function public.accept_broadcast_atomic(uuid) is
  'Atomic worker accept: claims job + marks broadcasts in single transaction. '
  'Caller identified by auth.uid(). Replaces multi-step accept-broadcast.ts logic.';


-- =============================================================================
-- request_scope_change_atomic
-- =============================================================================
-- Caller (worker) identified by auth.uid(). No worker_id param.

drop function if exists public.request_scope_change_atomic(uuid, uuid, text, int, int, text);
drop function if exists public.request_scope_change_atomic(uuid, text, int, int, text);

create function public.request_scope_change_atomic(
  p_job_id uuid,
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
) language plpgsql security definer
set search_path = public, pg_catalog
as $func$
declare
  v_worker_id uuid := auth.uid();
  v_job record;
  v_sc_id uuid;
  v_sc_created timestamptz;
begin
  if v_worker_id is null then
    return query select false, 'AUTH_MISSING'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if p_new_price_max < p_new_price_min then
    return query select false, 'INVALID_PRICE_RANGE'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select id, status, worker_id, kael_problem_identified
    into v_job
    from public.jobs
    where id = p_job_id;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_job.worker_id <> v_worker_id then
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

  insert into public.scope_change_requests (
    job_id, worker_id, status,
    original_summary, requested_description, reason,
    price_min, price_max
  ) values (
    p_job_id,
    v_worker_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_job.kael_problem_identified,
    p_new_description,
    p_reason,
    p_new_price_min,
    p_new_price_max
  )
  returning id, created_at into v_sc_id, v_sc_created;

  update public.jobs
    set status = 'scope_change_pending'::public.job_status,
        scope_change_description = p_new_description,
        scope_change_price_min = p_new_price_min,
        scope_change_price_max = p_new_price_max,
        scope_change_reason = p_reason
    where id = p_job_id
      and status = v_job.status;

  if not found then
    raise exception 'job status changed during scope change request'
      using errcode = 'P0001';
  end if;

  return query select
    true,
    null::text,
    v_sc_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_sc_created;
end;
$func$;

revoke execute on function public.request_scope_change_atomic(uuid, text, int, int, text) from public;
revoke execute on function public.request_scope_change_atomic(uuid, text, int, int, text) from anon;
grant execute on function public.request_scope_change_atomic(uuid, text, int, int, text) to authenticated;
grant execute on function public.request_scope_change_atomic(uuid, text, int, int, text) to service_role;

comment on function public.request_scope_change_atomic(uuid, text, int, int, text) is
  'Atomic worker scope change request. Caller identified by auth.uid().';


-- =============================================================================
-- decide_scope_change_atomic
-- =============================================================================
-- Caller (customer) identified by auth.uid(). No customer_id param.

drop function if exists public.decide_scope_change_atomic(uuid, uuid, text);
drop function if exists public.decide_scope_change_atomic(uuid, text);

create function public.decide_scope_change_atomic(
  p_scope_change_id uuid,
  p_decision text  -- 'approve' | 'reject'
) returns table (
  ok boolean,
  error_code text,
  job_id_out uuid,
  scope_status public.scope_change_status,
  decided_at_ts timestamptz
) language plpgsql security definer
set search_path = public, pg_catalog
as $func$
declare
  v_customer_id uuid := auth.uid();
  v_sc record;
  v_job record;
  v_new_status public.scope_change_status;
  v_decision_text text;
  v_now timestamptz := now();
begin
  if v_customer_id is null then
    return query select false, 'AUTH_MISSING'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if p_decision not in ('approve', 'reject') then
    return query select false, 'INVALID_DECISION'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select id, job_id, status into v_sc
    from public.scope_change_requests
    where id = p_scope_change_id;

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
    where id = v_sc.job_id;

  if not found or v_job.customer_id <> v_customer_id then
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

  update public.scope_change_requests
    set status = v_new_status,
        customer_decision_at = v_now
    where id = p_scope_change_id;

  update public.jobs
    set status = 'repairing'::public.job_status,
        scope_change_customer_decision = v_decision_text
    where id = v_sc.job_id
      and status = 'scope_change_pending'::public.job_status;

  if not found then
    raise exception 'job status changed during scope change decision'
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

revoke execute on function public.decide_scope_change_atomic(uuid, text) from public;
revoke execute on function public.decide_scope_change_atomic(uuid, text) from anon;
grant execute on function public.decide_scope_change_atomic(uuid, text) to authenticated;
grant execute on function public.decide_scope_change_atomic(uuid, text) to service_role;

comment on function public.decide_scope_change_atomic(uuid, text) is
  'Atomic customer scope change decision. Caller identified by auth.uid().';
;

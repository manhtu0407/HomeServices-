-- Phase 2.0 (decision 2026-05-23, plan §22.7.B): Kael Final Price Authority.
--
-- Worker không nhập giá ở B6 (scope change) hoặc B7 (complete). Kael computes
-- final price từ original Kael estimate + worker's reported scope. Giảm rủi ro
-- worker tự đẩy giá ở B7 + cho phép customer thấy Kael-locked price tại A11/A12.
--
-- Changes:
--   1. scope_change_requests.price_min / price_max → nullable + relaxed check
--      (Kael fills them after compute; worker không cung cấp nữa).
--   2. scope_change_requests + kael_computed_min / kael_computed_max columns
--      (audit trail: giá Kael compute, ngay cả khi price_min/max bị edit sau).
--   3. request_scope_change_atomic: new signature without price params.
--      Old signature dropped. Edge mobile-api gọi new RPC + sau đó fill price
--      từ Kael compute.
--   4. jobs.final_price gets explicit comment about Kael authority.
--
-- Backward compat: old jobs với worker-typed final_price được giữ nguyên
-- (read-only legacy). RLS/grants tiếp tục revoke-on-public + grant authenticated.

begin;

-- 1. Make price columns nullable + relax check
alter table public.scope_change_requests
  alter column price_min drop not null;

alter table public.scope_change_requests
  alter column price_max drop not null;

alter table public.scope_change_requests
  drop constraint if exists scope_change_requests_price_min_check;

alter table public.scope_change_requests
  drop constraint if exists scope_change_requests_price_max_check;

alter table public.scope_change_requests
  add constraint scope_change_requests_price_min_check
    check (price_min is null or price_min > 0);

alter table public.scope_change_requests
  add constraint scope_change_requests_price_max_check
    check (price_max is null or price_max >= coalesce(price_min, 0));

-- 2. Kael-computed columns (audit trail; price_min/max also written for app reads)
alter table public.scope_change_requests
  add column if not exists kael_computed_min integer
    check (kael_computed_min is null or kael_computed_min > 0);

alter table public.scope_change_requests
  add column if not exists kael_computed_max integer
    check (
      kael_computed_max is null
      or kael_computed_max >= coalesce(kael_computed_min, 0)
    );

comment on column public.scope_change_requests.kael_computed_min is
  'Phase 2.0 (2026-05-23): Kael-computed minimum price from worker reported scope. Source of truth for A11 customer decision.';
comment on column public.scope_change_requests.kael_computed_max is
  'Phase 2.0 (2026-05-23): Kael-computed maximum price from worker reported scope. Source of truth for A11 customer decision.';

-- 3. Replace request_scope_change_atomic with version that does NOT take price
drop function if exists public.request_scope_change_atomic(uuid, uuid, text, int, int, text);
drop function if exists public.request_scope_change_atomic(uuid, text, int, int, text);
drop function if exists public.request_scope_change_atomic(uuid, text, text);

create function public.request_scope_change_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_new_description text,
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
  if p_worker_id is null then
    return query select false, 'AUTH_MISSING'::text,
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
        scope_change_reason = p_reason
    where id = p_job_id
      and status = v_job.status
    returning id into v_updated_job_id;

  if v_updated_job_id is null then
    return query select false, 'STATUS_CHANGED'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  -- Phase 2.0: price_min/max inserted NULL; Edge will fill after Kael compute.
  insert into public.scope_change_requests (
    job_id, worker_id, status,
    original_summary, requested_description, reason
  ) values (
    p_job_id,
    p_worker_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_job.kael_problem_identified,
    p_new_description,
    p_reason
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

revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, text) from public;
revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, text) from anon;
revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, text) from authenticated;
grant execute on function public.request_scope_change_atomic(uuid, uuid, text, text) to service_role;

comment on function public.request_scope_change_atomic(uuid, uuid, text, text) is
  'Phase 2.0 (2026-05-23): Worker scope change request without price. Edge service_role supplies p_worker_id after role guard; Kael compute fills price post-insert.';

-- 4. Comment jobs.final_price as Kael-locked authority
comment on column public.jobs.final_price is
  'Phase 2.0 (2026-05-23): Kael-locked final price. Set at A7 confirm (kael_price_max baseline) or A11 approve (kael_computed_max). Worker không nhập trực tiếp ở B7.';

commit;

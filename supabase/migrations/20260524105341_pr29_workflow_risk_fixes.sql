-- =============================================================================
-- Migration: pr29_workflow_risk_fixes
--
-- Money/status paths must be atomic:
-- - B6 persists Kael's computed scope-change estimate before customer notify.
-- - A11 approve locks jobs.final_price inside the decision RPC.
-- - Scope-change evidence photos get their own media stage.
-- =============================================================================

begin;

alter table public.scope_change_requests
  add column if not exists evidence_photo_urls text[] not null default '{}'::text[];

alter table public.scope_change_requests
  add column if not exists kael_computed_min integer
    check (kael_computed_min is null or kael_computed_min > 0);

alter table public.scope_change_requests
  add column if not exists kael_computed_max integer
    check (
      kael_computed_max is null
      or kael_computed_max >= coalesce(kael_computed_min, 0)
    );

comment on column public.scope_change_requests.evidence_photo_urls is
  'PR#29 follow-up: media refs for B6 scope-change evidence. Kept separate from jobs.completion_photo_urls.';

drop function if exists public.request_scope_change_atomic(uuid, uuid, text, int, int, text);
drop function if exists public.request_scope_change_atomic(uuid, text, int, int, text);
drop function if exists public.request_scope_change_atomic(uuid, text, text);
drop function if exists public.request_scope_change_atomic(uuid, uuid, text, text);
drop function if exists public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb);

create function public.request_scope_change_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_new_description text,
  p_reason text,
  p_evidence_photo_urls text[],
  p_kael_computed_min int,
  p_kael_computed_max int,
  p_kael_review jsonb
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

  if p_kael_computed_min is null
    or p_kael_computed_max is null
    or p_kael_computed_min <= 0
    or p_kael_computed_max <= 0
    or p_kael_computed_max < p_kael_computed_min
  then
    return query select false, 'KAEL_PRICE_MISSING'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if p_kael_review is null or jsonb_typeof(p_kael_review) <> 'object' then
    return query select false, 'KAEL_REVIEW_MISSING'::text,
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
        scope_change_price_min = p_kael_computed_min,
        scope_change_price_max = p_kael_computed_max,
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
    price_min, price_max,
    kael_computed_min, kael_computed_max, kael_review,
    evidence_photo_urls
  ) values (
    p_job_id,
    p_worker_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_job.kael_problem_identified,
    p_new_description,
    p_reason,
    p_kael_computed_min,
    p_kael_computed_max,
    p_kael_computed_min,
    p_kael_computed_max,
    p_kael_review,
    coalesce(p_evidence_photo_urls, '{}'::text[])
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

alter function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) security invoker;
revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) from public;
revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) from anon;
revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) from authenticated;
grant execute on function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) to service_role;

comment on function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) is
  'PR#29 follow-up: atomic B6 request. Worker provides scope text/evidence only; Edge provides Kael-computed price/review before customer notification.';

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

  select id, job_id, status, kael_computed_min, kael_computed_max
    into v_sc
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

  if p_decision = 'approve'
    and (v_sc.kael_computed_max is null or v_sc.kael_computed_max <= 0)
  then
    return query select false, 'KAEL_PRICE_MISSING'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select id, customer_id, status
    into v_job
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
          scope_change_price_min = case
            when p_decision = 'approve' then v_sc.kael_computed_min
            else scope_change_price_min
          end,
          scope_change_price_max = case
            when p_decision = 'approve' then v_sc.kael_computed_max
            else scope_change_price_max
          end,
          final_price = case
            when p_decision = 'approve' then v_sc.kael_computed_max
            else final_price
          end,
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

alter function public.decide_scope_change_atomic(uuid, uuid, text) security invoker;
revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from public;
revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from anon;
revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from authenticated;
grant execute on function public.decide_scope_change_atomic(uuid, uuid, text) to service_role;

comment on function public.decide_scope_change_atomic(uuid, uuid, text) is
  'PR#29 follow-up: atomic customer scope-change decision. Approve locks jobs.final_price to kael_computed_max; reject cancels changed work.';

drop policy if exists "Participants upload job media files" on storage.objects;
create policy "Participants upload job media files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (
        (
          (storage.foldername(name))[2] in ('before', 'kael_reference')
          and private.is_job_customer(((storage.foldername(name))[1])::uuid)
        )
        or (
          (storage.foldername(name))[2] in ('after', 'cancellation_evidence', 'scope_change_evidence')
          and private.is_job_worker(((storage.foldername(name))[1])::uuid)
        )
        or private.is_admin()
      )
      else false
    end
  );

commit;

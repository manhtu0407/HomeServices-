-- Unify pre-arrival and on-site scope adjustments behind the same explicit
-- customer decision. Rejecting an adjustment resumes the agreed work; it does
-- not cancel the whole job.

begin;

alter table public.scope_change_requests
  add column if not exists request_timing text not null default 'on_site',
  add column if not exists resume_job_status public.job_status not null default 'repairing';

alter table public.scope_change_requests
  add constraint scope_change_requests_timing_check
  check (request_timing in ('pre_arrival', 'on_site'));

create or replace function public.request_scope_change_atomic(
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
  v_request_timing text;
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
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  v_request_timing := case
    when v_job.status in (
      'worker_matched'::public.job_status,
      'worker_on_way'::public.job_status,
      'arrived'::public.job_status
    ) then 'pre_arrival'
    else 'on_site'
  end;

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
    evidence_photo_urls, request_timing, resume_job_status
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
    coalesce(p_evidence_photo_urls, '{}'::text[]),
    v_request_timing,
    v_job.status
  )
  returning id, created_at into v_sc_id, v_sc_created;

  return query select true, null::text, v_sc_id,
    'waiting_customer_decision'::public.scope_change_status, v_sc_created;
end;
$func$;

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

  select id, job_id, status, kael_computed_min, kael_computed_max,
      request_timing, resume_job_status
    into v_sc
    from public.scope_change_requests
    where id = p_scope_change_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_sc.status = 'reviewing_by_kael'::public.scope_change_status then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if v_sc.status <> 'waiting_customer_decision'::public.scope_change_status then
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
    v_job_status := case
      when v_sc.request_timing = 'on_site' then 'repairing'::public.job_status
      else v_sc.resume_job_status
    end;
  else
    v_new_status := 'rejected_by_customer'::public.scope_change_status;
    v_decision_text := 'rejected';
    v_job_status := v_sc.resume_job_status;
  end if;

  if v_job_status not in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status
  ) then
    raise exception 'scope change resume status invariant violated'
      using errcode = 'P0001';
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
  select (select id from updated_job), (select id from updated_scope)
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

  return query select true, null::text, v_sc.job_id, v_new_status, v_now;
end;
$func$;

revoke execute on function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) from public, anon, authenticated;
grant execute on function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) to service_role;
revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.decide_scope_change_atomic(uuid, uuid, text) to service_role;

comment on column public.scope_change_requests.request_timing is
  'Whether the same customer-confirmed adjustment gate was opened before arrival or on site.';
comment on column public.scope_change_requests.resume_job_status is
  'Server-captured status to resume when the customer keeps the original scope.';

commit;

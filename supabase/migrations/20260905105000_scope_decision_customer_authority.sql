-- A retained job owner id does not authorize a scope decision after the actor changes role.
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
  v_scope_job_id uuid;
begin
  if p_customer_id is null or not exists (
    select 1 from public.profiles
    where id = p_customer_id and role = 'customer'::public.user_role
  ) then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject') then
    return query select false, 'INVALID_DECISION'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  -- Match the job-first order used by proposal/cancellation before locking the scope row.
  select job_id into v_scope_job_id
    from public.scope_change_requests where id = p_scope_change_id;
  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select j.id, j.customer_id, j.status
    into v_job
    from public.jobs j
    join public.profiles p on p.id = j.customer_id and p.role = 'customer'::public.user_role
    where j.id = v_scope_job_id
    for update of j;
  if not found or v_job.customer_id is distinct from p_customer_id then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select id, job_id, status, kael_computed_min, kael_computed_max,
      request_timing, resume_job_status
    into v_sc
    from public.scope_change_requests
    where id = p_scope_change_id and job_id = v_job.id
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

  if v_job_status is null or v_job_status not in (
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

revoke execute on function public.decide_scope_change_atomic(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.decide_scope_change_atomic(uuid, uuid, text) to service_role;

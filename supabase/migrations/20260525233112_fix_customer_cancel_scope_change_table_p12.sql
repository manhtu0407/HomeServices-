-- P12 follow-up: the accepted-worker cancel RPC must close the current
-- scope_change_requests rows, not a legacy worker_scope_changes table name.

begin;

create or replace function public.cancel_job_after_accept_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_reason_code text,
  p_reason_note text default null,
  p_reason_category text default null,
  p_abuse_signals text[] default '{}'::text[]
) returns table (
  ok boolean,
  error_code text,
  cancellation_id uuid,
  job_id_out uuid,
  job_status public.job_status,
  sub_case text,
  reason_code text,
  reason_category text,
  worker_id_out uuid,
  admin_review_required boolean,
  phase0_no_monetary_penalty boolean,
  worker_goodwill jsonb,
  abuse_signals text[],
  created_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job record;
  v_category text := p_reason_category;
  v_sub_case text := 'after_worker_accept';
  v_id uuid;
  v_created timestamptz;
  v_abuse_signals text[] := coalesce(p_abuse_signals, '{}'::text[]);
  v_admin_review_required boolean;
  v_worker_goodwill jsonb;
begin
  select j.id, j.status, j.customer_id, j.worker_id, j.scheduled_at
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found or v_job.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::uuid,
      null::public.job_status, null::text, null::text, null::text,
      null::uuid, null::boolean, null::boolean, null::jsonb, null::text[],
      null::timestamptz;
    return;
  end if;

  if v_job.status not in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text, null::uuid, p_job_id,
      v_job.status, null::text, null::text, null::text, v_job.worker_id,
      null::boolean, null::boolean, null::jsonb, null::text[], null::timestamptz;
    return;
  end if;

  if p_reason_code is null or btrim(p_reason_code) = '' then
    return query select false, 'INVALID_REASON'::text, null::uuid, p_job_id,
      v_job.status, null::text, null::text, null::text, v_job.worker_id,
      null::boolean, null::boolean, null::jsonb, null::text[], null::timestamptz;
    return;
  end if;

  if v_category is null then
    select t.category into v_category
      from public.customer_cancellation_reason_taxonomy as t
      where t.code = p_reason_code
        and t.is_active is true;
  end if;

  if v_category is null then
    return query select false, 'INVALID_REASON'::text, null::uuid, p_job_id,
      v_job.status, null::text, null::text, null::text, v_job.worker_id,
      null::boolean, null::boolean, null::jsonb, null::text[], null::timestamptz;
    return;
  end if;

  if v_job.scheduled_at is not null and v_job.scheduled_at > now() then
    v_sub_case := 'scheduled_job';
  end if;

  if exists (
    select 1
    from public.customer_cancellation_records as c
    where c.job_id = p_job_id
      and c.customer_id = p_customer_id
      and c.status in ('requested', 'dispute_pending')
  ) then
    return query select false, 'ALREADY_REQUESTED'::text, null::uuid, p_job_id,
      v_job.status, v_sub_case, p_reason_code, v_category, v_job.worker_id,
      null::boolean, null::boolean, null::jsonb, null::text[], null::timestamptz;
    return;
  end if;

  update public.jobs
     set status = 'cancelled'::public.job_status,
         cancelled_at = now(),
         updated_at = now()
   where id = p_job_id
     and status = v_job.status;

  if not found then
    return query select false, 'STATUS_CHANGED'::text, null::uuid, p_job_id,
      v_job.status, v_sub_case, p_reason_code, v_category, v_job.worker_id,
      null::boolean, null::boolean, null::jsonb, null::text[], null::timestamptz;
    return;
  end if;

  update public.job_broadcasts
     set status = 'cancelled',
         responded_at = now()
   where job_id = p_job_id
     and status in ('pending', 'sent');

  update public.scope_change_requests
     set status = 'cancelled',
         updated_at = now()
   where job_id = p_job_id
     and status in ('requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision');

  v_admin_review_required := v_category in ('needs_admin_review', 'flag_suspicious')
    or cardinality(v_abuse_signals) > 0;
  v_worker_goodwill := jsonb_build_object(
    'required', true,
    'kind', 'phase0_goodwill_note',
    'worker_id', v_job.worker_id,
    'amount', null
  );

  insert into public.customer_cancellation_records (
    job_id,
    customer_id,
    worker_id,
    sub_case,
    reason_code,
    reason_category,
    reason_note,
    status,
    admin_review_required,
    phase0_no_monetary_penalty,
    worker_goodwill,
    abuse_signals,
    safe_metadata
  ) values (
    p_job_id,
    p_customer_id,
    v_job.worker_id,
    v_sub_case,
    p_reason_code,
    v_category,
    nullif(btrim(coalesce(p_reason_note, '')), ''),
    'requested',
    v_admin_review_required,
    true,
    v_worker_goodwill,
    v_abuse_signals,
    jsonb_build_object('phase', 'P12', 'case', 'customer_cancel')
  )
  returning id, created_at into v_id, v_created;

  return query select true, null::text, v_id, p_job_id,
    'cancelled'::public.job_status, v_sub_case, p_reason_code, v_category,
    v_job.worker_id, v_admin_review_required, true, v_worker_goodwill,
    v_abuse_signals, v_created;
end;
$func$;

revoke execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) from public;
revoke execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) from anon;
revoke execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) from authenticated;
grant execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) to service_role;

commit;

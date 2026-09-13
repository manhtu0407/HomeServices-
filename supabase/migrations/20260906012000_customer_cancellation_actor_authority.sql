begin;

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

  if not found or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
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
revoke all on function public.cancel_job_before_accept_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_job_before_accept_atomic(uuid, uuid) to service_role;

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

  if not found or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
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
revoke all on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) to service_role;

create or replace function public.request_customer_cancellation_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_reason_code text,
  p_reason_note text default null
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
  v_category text;
  v_sub_case text;
  v_status text := 'requested';
  v_id uuid;
  v_created timestamptz;
  v_abuse_signals text[] := '{}'::text[];
  v_admin_review_required boolean;
  v_worker_goodwill jsonb := jsonb_build_object(
    'required', false,
    'kind', 'none',
    'worker_id', null,
    'amount', null
  );
  v_cancel_count_30d int := 0;
  v_completed_count_30d int := 0;
  v_after_accept_count_30d int := 0;
  v_same_day_count int := 0;
  v_no_reason_count_30d int := 0;
  v_cancel_row record;
begin
  if p_reason_code is null or btrim(p_reason_code) = '' then
    return query select false, 'INVALID_REASON'::text, null::uuid, null::uuid,
      null::public.job_status, null::text, null::text, null::text,
      null::uuid, null::boolean, null::boolean, null::jsonb, null::text[],
      null::timestamptz;
    return;
  end if;

  select t.category into v_category
    from public.customer_cancellation_reason_taxonomy as t
    where t.code = p_reason_code
      and t.is_active is true;

  if v_category is null then
    return query select false, 'INVALID_REASON'::text, null::uuid, null::uuid,
      null::public.job_status, null::text, null::text, null::text,
      null::uuid, null::boolean, null::boolean, null::jsonb, null::text[],
      null::timestamptz;
    return;
  end if;

  select j.id, j.status, j.customer_id, j.worker_id, j.scheduled_at
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::uuid,
      null::public.job_status, null::text, null::text, null::text,
      null::uuid, null::boolean, null::boolean, null::jsonb, null::text[],
      null::timestamptz;
    return;
  end if;

  if exists (
    select 1
    from public.customer_cancellation_records as c
    where c.job_id = p_job_id
      and c.customer_id = p_customer_id
      and c.status in ('requested', 'dispute_pending')
  ) then
    return query select false, 'ALREADY_REQUESTED'::text, null::uuid, p_job_id,
      v_job.status, null::text, p_reason_code, v_category, v_job.worker_id,
      null::boolean, null::boolean, null::jsonb, null::text[], null::timestamptz;
    return;
  end if;

  if v_job.status = 'completed_by_worker'::public.job_status then
    v_sub_case := 'after_worker_completed_trigger_dispute';
    v_status := 'dispute_pending';
  elsif v_job.scheduled_at is not null and v_job.scheduled_at > now() then
    v_sub_case := 'scheduled_job';
  elsif v_job.status = 'awaiting_customer_confirm'::public.job_status then
    v_sub_case := 'before_a7';
  elsif v_job.status = 'broadcasting'::public.job_status then
    v_sub_case := 'after_a7_before_worker_accept';
  elsif v_job.status in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status
  ) then
    v_sub_case := 'after_worker_accept';
  else
    return query select false, 'INVALID_STATUS'::text, null::uuid, p_job_id,
      v_job.status, null::text, p_reason_code, v_category, v_job.worker_id,
      null::boolean, null::boolean, null::jsonb, null::text[], null::timestamptz;
    return;
  end if;

  select count(*)::int into v_cancel_count_30d
    from public.customer_cancellation_records as c
    where c.customer_id = p_customer_id
      and c.created_at >= now() - interval '30 days';

  select count(*)::int into v_completed_count_30d
    from public.jobs as j
    where j.customer_id = p_customer_id
      and j.status in (
        'completed_by_worker'::public.job_status,
        'confirmed_by_customer'::public.job_status,
        'payment_pending'::public.job_status,
        'paid'::public.job_status,
        'reviewed'::public.job_status
      )
      and j.created_at >= now() - interval '30 days';

  select count(*)::int into v_after_accept_count_30d
    from public.customer_cancellation_records as c
    where c.customer_id = p_customer_id
      and c.sub_case in ('after_worker_accept', 'scheduled_job')
      and c.worker_id is not null
      and c.created_at >= now() - interval '30 days';

  select count(*)::int into v_same_day_count
    from public.customer_cancellation_records as c
    where c.customer_id = p_customer_id
      and c.created_at >= date_trunc('day', now());

  select count(*)::int into v_no_reason_count_30d
    from public.customer_cancellation_records as c
    where c.customer_id = p_customer_id
      and c.reason_code = 'no_reason_provided'
      and c.created_at >= now() - interval '30 days';

  if ((v_cancel_count_30d + 1)::numeric / greatest(1, v_completed_count_30d)) > 0.30 then
    v_abuse_signals := array_append(v_abuse_signals, 'customer_cancellation_rate_exceeded');
  end if;
  if v_after_accept_count_30d + (case when v_sub_case in ('after_worker_accept', 'scheduled_job') and v_job.worker_id is not null then 1 else 0 end) >= 3 then
    v_abuse_signals := array_append(v_abuse_signals, 'cancel_after_accept_threshold');
  end if;
  if v_same_day_count + 1 >= 2 then
    v_abuse_signals := array_append(v_abuse_signals, 'same_day_cancel_threshold');
  end if;
  if v_no_reason_count_30d + (case when p_reason_code = 'no_reason_provided' then 1 else 0 end) >= 3 then
    v_abuse_signals := array_append(v_abuse_signals, 'no_reason_cancel_threshold');
  end if;

  if v_sub_case in ('after_worker_accept', 'scheduled_job') and v_job.worker_id is not null then
    select *
      into v_cancel_row
      from public.cancel_job_after_accept_atomic(
        p_job_id,
        p_customer_id,
        p_reason_code,
        p_reason_note,
        v_category,
        v_abuse_signals
      );

    return query select v_cancel_row.ok, v_cancel_row.error_code,
      v_cancel_row.cancellation_id, v_cancel_row.job_id_out,
      v_cancel_row.job_status, v_cancel_row.sub_case,
      v_cancel_row.reason_code, v_cancel_row.reason_category,
      v_cancel_row.worker_id_out, v_cancel_row.admin_review_required,
      v_cancel_row.phase0_no_monetary_penalty, v_cancel_row.worker_goodwill,
      v_cancel_row.abuse_signals, v_cancel_row.created_at_ts;
    return;
  end if;

  v_admin_review_required := v_category in ('needs_admin_review', 'flag_suspicious')
    or cardinality(v_abuse_signals) > 0
    or v_sub_case = 'after_worker_completed_trigger_dispute';

  if v_sub_case <> 'after_worker_completed_trigger_dispute' then
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
  end if;

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
    v_status,
    v_admin_review_required,
    true,
    v_worker_goodwill,
    v_abuse_signals,
    jsonb_build_object(
      'phase', 'P12',
      'case', 'customer_cancel',
      'defer_to_case_5', v_sub_case = 'after_worker_completed_trigger_dispute'
    )
  )
  returning id, created_at into v_id, v_created;

  return query select true, null::text, v_id, p_job_id,
    case
      when v_sub_case = 'after_worker_completed_trigger_dispute'
        then v_job.status
      else 'cancelled'::public.job_status
    end,
    v_sub_case, p_reason_code, v_category, v_job.worker_id,
    v_admin_review_required, true, v_worker_goodwill, v_abuse_signals,
    v_created;
end;
$func$;
revoke all on function public.request_customer_cancellation_atomic(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_customer_cancellation_atomic(uuid, uuid, text, text) to service_role;

commit;

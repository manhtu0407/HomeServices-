-- P14 verification follow-up:
-- Postgres lint reported request_worker_cancellation_atomic.reason_category
-- as ambiguous because the RETURNS TABLE output column shadows same-named table
-- columns inside PL/pgSQL. Replace the function with qualified aliases.

begin;

create or replace function public.request_worker_cancellation_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_reason text,
  p_evidence_photo_urls text[] default '{}'::text[]
) returns table (
  ok boolean,
  error_code text,
  cancellation_id uuid,
  cancellation_status text,
  job_id_out uuid,
  job_status public.job_status,
  service_type_out public.service_type,
  district_code text,
  worker_id_out uuid,
  created_at_ts timestamptz,
  reason_code text,
  reason_category text,
  admin_review_required boolean,
  fallback_options jsonb,
  abuse_signals text[]
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job record;
  v_existing record;
  v_id uuid;
  v_created timestamptz;
  v_now timestamptz := now();
  v_recent_approved_count int := 0;
  v_recent_approved_count_30d int := 0;
  v_completed_count_30d int := 0;
  v_no_reason_count_30d int := 0;
  v_updated_rows int := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_evidence_count int := cardinality(coalesce(p_evidence_photo_urls, '{}'::text[]));
  v_reason_lower text := lower(coalesce(p_reason, ''));
  v_reason_code text := 'changed_mind';
  v_reason_category text := 'suspicious';
  v_admin_review_required boolean := true;
  v_abuse_signals text[] := '{}'::text[];
  v_fallback_options jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'wait_15_minutes',
      'label_vi', 'Đợi 15 phút để Kael tìm tiếp',
      'effect', 'continue_rebroadcast_search'
    ),
    jsonb_build_object(
      'id', 'reschedule',
      'label_vi', 'Đổi sang khung giờ khác',
      'effect', 'reschedule_job'
    ),
    jsonb_build_object(
      'id', 'cancel_no_charge',
      'label_vi', 'Hủy việc, chưa tính phí trong Phase 0',
      'effect', 'cancel_without_charge',
      'no_charge_phase0', true
    )
  );
begin
  if p_reason is null or char_length(p_reason) < 10 or char_length(p_reason) > 1000 then
    return query select false, 'INVALID_REASON'::text, null::uuid, null::text,
      null::uuid, null::public.job_status, null::public.service_type,
      null::text, null::uuid, null::timestamptz, null::text, null::text,
      null::boolean, null::jsonb, null::text[];
    return;
  end if;

  if v_reason = '' then
    v_reason_code := 'no_reason';
    v_reason_category := 'no_reason';
  elsif v_evidence_count > 0 and (
    v_reason_lower like '%xe%' or v_reason_lower like '%hỏng%' or v_reason_lower like '%hong%' or
    v_reason_lower like '%vehicle%' or v_reason_lower like '%breakdown%'
  ) then
    v_reason_code := 'vehicle_breakdown_with_photo';
    v_reason_category := 'legit_auto_approve';
  elsif v_evidence_count > 0 and (
    v_reason_lower like '%y tế%' or v_reason_lower like '%y te%' or v_reason_lower like '%tai nạn%' or
    v_reason_lower like '%tai nan%' or v_reason_lower like '%medical%'
  ) then
    v_reason_code := 'medical_emergency_with_evidence';
    v_reason_category := 'legit_auto_approve';
  elsif v_evidence_count > 0 and (
    v_reason_lower like '%gia đình%' or v_reason_lower like '%gia dinh%' or v_reason_lower like '%family%'
  ) then
    v_reason_code := 'family_emergency_confirmed';
    v_reason_category := 'legit_auto_approve';
  elsif v_reason_lower like '%phức tạp%' or v_reason_lower like '%phuc tap%' or
        v_reason_lower like '%mô tả%' or v_reason_lower like '%mo ta%' or
        v_reason_lower like '%complex%' then
    v_reason_code := 'job_more_complex_than_described';
    v_reason_category := 'legit_with_admin_review';
  elsif v_reason_lower like '%không an toàn%' or v_reason_lower like '%khong an toàn%' or
        v_reason_lower like '%khong an toan%' or v_reason_lower like '%unsafe%' or
        v_reason_lower like '%nguy hiểm%' or v_reason_lower like '%nguy hiem%' then
    v_reason_code := 'unsafe_conditions_on_site';
    v_reason_category := 'legit_with_admin_review';
  elsif v_reason_lower like '%khách không phản hồi%' or v_reason_lower like '%khach khong phan hoi%' or
        v_reason_lower like '%không phản hồi%' or v_reason_lower like '%khong phan hoi%' then
    v_reason_code := 'customer_not_responding_at_site';
    v_reason_category := 'legit_with_admin_review';
  elsif v_reason_lower like '%trả cao hơn%' or v_reason_lower like '%tra cao hon%' or
        v_reason_lower like '%chỗ khác%' or v_reason_lower like '%cho khac%' or
        v_reason_lower like '%higher pay%' then
    v_reason_code := 'higher_pay_elsewhere';
    v_reason_category := 'suspicious';
  elsif v_reason_lower like '%không tìm%' or v_reason_lower like '%khong tim%' or
        v_reason_lower like '%địa chỉ%' or v_reason_lower like '%dia chi%' or
        v_reason_lower like '%find address%' then
    v_reason_code := 'unable_to_find_address';
    v_reason_category := 'suspicious';
  elsif v_reason_lower like '%đổi ý%' or v_reason_lower like '%doi y%' or
        v_reason_lower like '%changed mind%' then
    v_reason_code := 'changed_mind';
    v_reason_category := 'suspicious';
  end if;

  v_admin_review_required := v_reason_category <> 'legit_auto_approve';

  select j.id, j.status, j.worker_id, j.service_type, j.address_district
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found or v_job.worker_id <> p_worker_id then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::text,
      null::uuid, null::public.job_status, null::public.service_type,
      null::text, null::uuid, null::timestamptz, null::text, null::text,
      null::boolean, null::jsonb, null::text[];
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
    return query select false, 'INVALID_STATUS'::text, null::uuid, null::text,
      null::uuid, null::public.job_status, null::public.service_type,
      null::text, null::uuid, null::timestamptz, null::text, null::text,
      null::boolean, null::jsonb, null::text[];
    return;
  end if;

  select wcr.id, wcr.status into v_existing
    from public.worker_cancellation_requests as wcr
    where wcr.job_id = p_job_id
      and wcr.worker_id = p_worker_id
      and wcr.status in ('requested', 'reviewing_by_kael')
    order by wcr.created_at desc
    limit 1
    for update;

  if found then
    return query select false, 'ALREADY_REQUESTED'::text, v_existing.id, v_existing.status,
      p_job_id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      null::timestamptz, null::text, null::text, null::boolean, null::jsonb, null::text[];
    return;
  end if;

  select count(*)::int into v_recent_approved_count
    from public.worker_cancellation_requests as wcr
    where wcr.worker_id = p_worker_id
      and wcr.status = 'approved'
      and wcr.created_at >= v_now - interval '24 hours';

  if v_recent_approved_count >= 2 then
    return query select false, 'RATE_LIMITED'::text, null::uuid, null::text,
      p_job_id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      null::timestamptz, null::text, null::text, null::boolean, null::jsonb, null::text[];
    return;
  end if;

  select count(*)::int into v_recent_approved_count_30d
    from public.worker_cancellation_requests as wcr
    where wcr.worker_id = p_worker_id
      and wcr.status = 'approved'
      and wcr.created_at >= v_now - interval '30 days';

  select count(*)::int into v_completed_count_30d
    from public.jobs as j
    where j.worker_id = p_worker_id
      and j.status in (
        'completed_by_worker'::public.job_status,
        'confirmed_by_customer'::public.job_status,
        'payment_pending'::public.job_status,
        'paid'::public.job_status,
        'reviewed'::public.job_status
      )
      and j.created_at >= v_now - interval '30 days';

  select count(*)::int into v_no_reason_count_30d
    from public.worker_cancellation_requests as wcr
    where wcr.worker_id = p_worker_id
      and wcr.status = 'approved'
      and wcr.reason_category = 'no_reason'
      and wcr.created_at >= v_now - interval '30 days';

  if ((v_recent_approved_count_30d + 1)::numeric /
      greatest(1, v_completed_count_30d + v_recent_approved_count_30d + 1)) > 0.30 then
    v_abuse_signals := array_append(v_abuse_signals, 'cancellation_rate_exceeded');
  end if;
  if v_recent_approved_count_30d + 1 >= 3 then
    v_abuse_signals := array_append(v_abuse_signals, 'consecutive_cancel_threshold');
  end if;
  if v_reason_category = 'no_reason' and v_no_reason_count_30d + 1 >= 2 then
    v_abuse_signals := array_append(v_abuse_signals, 'no_reason_cancel_threshold');
  end if;
  if v_job.status in (
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status
  ) then
    v_abuse_signals := array_append(v_abuse_signals, 'cancel_after_arrival_threshold');
  end if;
  if cardinality(v_abuse_signals) > 0 then
    v_admin_review_required := true;
  end if;

  insert into public.worker_cancellation_requests (
    job_id,
    worker_id,
    status,
    reason,
    evidence_photo_urls,
    kael_review,
    admin_decision_at,
    review_note,
    reason_code,
    reason_category,
    admin_review_required,
    fallback_options,
    abuse_signals
  ) values (
    p_job_id,
    p_worker_id,
    'approved',
    p_reason,
    coalesce(p_evidence_photo_urls, '{}'::text[]),
    jsonb_build_object(
      'case', 'worker_cancel',
      'sub_case', 'explicit_cancel',
      'reason_code', v_reason_code,
      'reason_category', v_reason_category,
      'admin_review_required', v_admin_review_required,
      'abuse_signals', to_jsonb(v_abuse_signals),
      'autonomous_suspension', false
    ),
    v_now,
    case
      when v_admin_review_required then 'auto-approved for customer continuity; admin review queued'
      else 'auto-approved by Edge worker cancellation workflow'
    end,
    v_reason_code,
    v_reason_category,
    v_admin_review_required,
    v_fallback_options,
    v_abuse_signals
  )
  returning id, created_at into v_id, v_created;

  update public.job_broadcasts as jb
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where jb.job_id = v_job.id
      and jb.status in (
        'pending'::public.broadcast_status,
        'sent'::public.broadcast_status,
        'accepted'::public.broadcast_status
      );

  update public.scope_change_requests as scr
    set status = 'cancelled'::public.scope_change_status
    where scr.job_id = v_job.id
      and scr.status in (
        'waiting_customer_decision'::public.scope_change_status,
        'reviewing_by_kael'::public.scope_change_status
      );

  update public.jobs as j
    set worker_id = null,
        status = 'broadcasting'::public.job_status,
        broadcast_at = v_now,
        matched_at = null,
        arrived_at = null
    where j.id = v_job.id
      and j.worker_id = p_worker_id;

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    return query select false, 'STATUS_CHANGED'::text, v_id, 'approved'::text,
      v_job.id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      v_created, v_reason_code, v_reason_category, v_admin_review_required,
      v_fallback_options, v_abuse_signals;
    return;
  end if;

  return query select true, null::text, v_id, 'approved'::text,
    v_job.id, 'broadcasting'::public.job_status, v_job.service_type,
    v_job.address_district, p_worker_id, v_created, v_reason_code,
    v_reason_category, v_admin_review_required, v_fallback_options, v_abuse_signals;
end;
$func$;

revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from public;
revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from anon;
revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from authenticated;
grant execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) to service_role;

comment on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) is
  'P11 worker cancellation RPC: auto-approves valid explicit worker cancels for customer continuity, qualifies worker_cancellation_requests columns for Postgres lint, and never autonomously suspends a worker.';

commit;

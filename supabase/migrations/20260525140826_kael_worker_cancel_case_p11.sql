-- P11 Kael Agentic Case 3: worker cancellation taxonomy, review-only abuse
-- controls, and no-show review queue. This supersedes the earlier auto-suspend
-- RPC behavior without editing historical migrations.

begin;

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_queue_type_check;
alter table public.kael_admin_queue
  add constraint kael_admin_queue_queue_type_check
  check (queue_type in ('demanding_customer', 'worker_cancellation_review', 'worker_no_show'));

create table if not exists public.worker_cancellation_reason_taxonomy (
  code text primary key check (char_length(code) between 3 and 120),
  category text not null check (category in (
    'legit_auto_approve',
    'legit_with_admin_review',
    'suspicious',
    'no_reason'
  )),
  label_vi text not null check (char_length(label_vi) between 3 and 200),
  is_active boolean not null default true,
  admin_tunable boolean not null default true,
  sort_order int not null default 0,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_cancellation_reason_taxonomy_category_idx
  on public.worker_cancellation_reason_taxonomy (category, sort_order, code);
create index if not exists worker_cancellation_reason_taxonomy_active_idx
  on public.worker_cancellation_reason_taxonomy (is_active, sort_order, code);

drop trigger if exists worker_cancellation_reason_taxonomy_updated_at
  on public.worker_cancellation_reason_taxonomy;
create trigger worker_cancellation_reason_taxonomy_updated_at
  before update on public.worker_cancellation_reason_taxonomy
  for each row execute function public.update_updated_at();

alter table public.worker_cancellation_reason_taxonomy enable row level security;

drop policy if exists "Authenticated read active worker cancellation taxonomy"
  on public.worker_cancellation_reason_taxonomy;
create policy "Authenticated read active worker cancellation taxonomy"
  on public.worker_cancellation_reason_taxonomy
  for select
  to authenticated
  using (is_active or private.is_admin());

revoke all on public.worker_cancellation_reason_taxonomy from public;
revoke all on public.worker_cancellation_reason_taxonomy from anon;
revoke all on public.worker_cancellation_reason_taxonomy from authenticated;
grant select on public.worker_cancellation_reason_taxonomy to authenticated;
grant all on public.worker_cancellation_reason_taxonomy to service_role;

insert into public.worker_cancellation_reason_taxonomy
  (code, category, label_vi, sort_order, safe_metadata)
values
  ('medical_emergency_with_evidence', 'legit_auto_approve', 'Khẩn cấp y tế có bằng chứng', 10, '{"requires_evidence": true}'::jsonb),
  ('family_emergency_confirmed', 'legit_auto_approve', 'Việc gia đình khẩn cấp đã xác nhận', 20, '{"requires_evidence": true}'::jsonb),
  ('vehicle_breakdown_with_photo', 'legit_auto_approve', 'Xe hỏng có ảnh bằng chứng', 30, '{"requires_evidence": true}'::jsonb),
  ('job_more_complex_than_described', 'legit_with_admin_review', 'Việc phức tạp hơn mô tả ban đầu', 40, '{}'::jsonb),
  ('unsafe_conditions_on_site', 'legit_with_admin_review', 'Điều kiện tại nhà không an toàn', 50, '{}'::jsonb),
  ('customer_not_responding_at_site', 'legit_with_admin_review', 'Khách không phản hồi khi thợ đã đến nơi', 60, '{}'::jsonb),
  ('higher_pay_elsewhere', 'suspicious', 'Thợ báo có việc khác trả cao hơn', 70, '{}'::jsonb),
  ('changed_mind', 'suspicious', 'Thợ đổi ý sau khi nhận việc', 80, '{}'::jsonb),
  ('unable_to_find_address', 'suspicious', 'Thợ báo không tìm được địa chỉ', 90, '{}'::jsonb),
  ('no_reason', 'no_reason', 'Không có lý do rõ ràng', 100, '{}'::jsonb)
on conflict (code) do update
set category = excluded.category,
    label_vi = excluded.label_vi,
    sort_order = excluded.sort_order,
    safe_metadata = excluded.safe_metadata,
    is_active = true,
    admin_tunable = true,
    updated_at = now();

alter table public.worker_cancellation_requests
  add column if not exists reason_code text references public.worker_cancellation_reason_taxonomy(code),
  add column if not exists reason_category text,
  add column if not exists admin_review_required boolean not null default false,
  add column if not exists fallback_options jsonb not null default '[]'::jsonb,
  add column if not exists abuse_signals text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_cancellation_reason_category_check'
      and conrelid = 'public.worker_cancellation_requests'::regclass
  ) then
    alter table public.worker_cancellation_requests
      add constraint worker_cancellation_reason_category_check
      check (
        reason_category is null or
        reason_category in (
          'legit_auto_approve',
          'legit_with_admin_review',
          'suspicious',
          'no_reason'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_cancellation_fallback_options_array_check'
      and conrelid = 'public.worker_cancellation_requests'::regclass
  ) then
    alter table public.worker_cancellation_requests
      add constraint worker_cancellation_fallback_options_array_check
      check (jsonb_typeof(fallback_options) = 'array');
  end if;
end $$;

create index if not exists worker_cancellation_requests_reason_idx
  on public.worker_cancellation_requests (reason_category, reason_code, created_at desc);
create index if not exists worker_cancellation_requests_admin_review_idx
  on public.worker_cancellation_requests (admin_review_required, created_at desc)
  where admin_review_required is true;

drop function if exists public.request_worker_cancellation_atomic(uuid, uuid, text, text[]);

create function public.request_worker_cancellation_atomic(
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

  select id, status, worker_id, service_type, address_district
    into v_job
    from public.jobs
    where id = p_job_id
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

  select id, status into v_existing
    from public.worker_cancellation_requests
    where job_id = p_job_id
      and worker_id = p_worker_id
      and status in ('requested', 'reviewing_by_kael')
    order by created_at desc
    limit 1
    for update;

  if found then
    return query select false, 'ALREADY_REQUESTED'::text, v_existing.id, v_existing.status,
      p_job_id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      null::timestamptz, null::text, null::text, null::boolean, null::jsonb, null::text[];
    return;
  end if;

  select count(*)::int into v_recent_approved_count
    from public.worker_cancellation_requests
    where worker_id = p_worker_id
      and status = 'approved'
      and created_at >= v_now - interval '24 hours';

  if v_recent_approved_count >= 2 then
    return query select false, 'RATE_LIMITED'::text, null::uuid, null::text,
      p_job_id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      null::timestamptz, null::text, null::text, null::boolean, null::jsonb, null::text[];
    return;
  end if;

  select count(*)::int into v_recent_approved_count_30d
    from public.worker_cancellation_requests
    where worker_id = p_worker_id
      and status = 'approved'
      and created_at >= v_now - interval '30 days';

  select count(*)::int into v_completed_count_30d
    from public.jobs
    where worker_id = p_worker_id
      and status in (
        'completed_by_worker'::public.job_status,
        'confirmed_by_customer'::public.job_status,
        'payment_pending'::public.job_status,
        'paid'::public.job_status,
        'reviewed'::public.job_status
      )
      and created_at >= v_now - interval '30 days';

  select count(*)::int into v_no_reason_count_30d
    from public.worker_cancellation_requests
    where worker_id = p_worker_id
      and status = 'approved'
      and reason_category = 'no_reason'
      and created_at >= v_now - interval '30 days';

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

  update public.job_broadcasts
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where job_id = v_job.id
      and status in (
        'pending'::public.broadcast_status,
        'sent'::public.broadcast_status,
        'accepted'::public.broadcast_status
      );

  update public.scope_change_requests
    set status = 'cancelled'::public.scope_change_status
    where job_id = v_job.id
      and status in (
        'waiting_customer_decision'::public.scope_change_status,
        'reviewing_by_kael'::public.scope_change_status
      );

  update public.jobs
    set worker_id = null,
        status = 'broadcasting'::public.job_status,
        broadcast_at = v_now,
        matched_at = null,
        arrived_at = null
    where id = v_job.id
      and worker_id = p_worker_id;

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
  'P11 worker cancellation RPC: auto-approves valid explicit worker cancels for customer continuity, returns taxonomy/fallback/admin-review context, and never autonomously suspends a worker.';

create or replace function public.enqueue_worker_no_show_reviews(
  p_now timestamptz default now()
) returns table (
  job_id_out uuid,
  worker_id_out uuid,
  reason_code text,
  fallback_options jsonb
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
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
  return query
  with candidates as (
    select j.id, j.worker_id
    from public.jobs j
    where j.worker_id is not null
      and j.status = 'worker_matched'::public.job_status
      and (
        (j.matched_at is not null and j.matched_at <= p_now - interval '15 minutes')
        or (j.scheduled_at is not null and j.scheduled_at <= p_now)
      )
      and not exists (
        select 1
        from public.kael_admin_queue q
        where q.job_id = j.id
          and q.actor_id = j.worker_id
          and q.queue_type = 'worker_no_show'
          and q.status = 'open'
      )
  ),
  inserted as (
    insert into public.kael_admin_queue (
      job_id,
      actor_id,
      actor_role,
      queue_type,
      priority,
      status,
      escalation_level,
      reason_code,
      response_summary,
      safe_metadata
    )
    select
      c.id,
      c.worker_id,
      'worker',
      'worker_no_show',
      'medium',
      'open',
      'soft',
      'no_reason',
      'admin_review_worker_no_show',
      jsonb_build_object(
        'case', 'worker_cancel',
        'sub_case', 'no_show',
        'fallback_options', v_fallback_options,
        'admin_review_required', true,
        'autonomous_suspension', false
      )
    from candidates c
    returning job_id, actor_id, reason_code, safe_metadata
  )
  select
    inserted.job_id,
    inserted.actor_id,
    inserted.reason_code,
    inserted.safe_metadata->'fallback_options'
  from inserted;
end;
$func$;

revoke execute on function public.enqueue_worker_no_show_reviews(timestamptz) from public;
revoke execute on function public.enqueue_worker_no_show_reviews(timestamptz) from anon;
revoke execute on function public.enqueue_worker_no_show_reviews(timestamptz) from authenticated;
grant execute on function public.enqueue_worker_no_show_reviews(timestamptz) to service_role;

comment on function public.enqueue_worker_no_show_reviews(timestamptz) is
  'P11 no-show timer hook: queues admin review and fallback options for stale worker_matched jobs without autonomous suspension or customer-charge effects.';

comment on table public.worker_cancellation_reason_taxonomy is
  'P11 admin-tunable worker cancellation reason taxonomy. Authenticated users read active reasons; service role/admin tooling writes.';

commit;

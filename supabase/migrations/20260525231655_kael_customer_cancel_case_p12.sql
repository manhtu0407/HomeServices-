-- P12 Kael Agentic Case 4: customer cancellation taxonomy, Phase 0
-- goodwill audit, and atomic request/cancel RPCs.

begin;

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_queue_type_check;
alter table public.kael_admin_queue
  add constraint kael_admin_queue_queue_type_check
  check (queue_type in ('demanding_customer', 'worker_cancellation_review', 'worker_no_show', 'customer_cancellation_review'));

create table if not exists public.customer_cancellation_reason_taxonomy (
  code text primary key check (char_length(code) between 3 and 120),
  category text not null check (category in (
    'no_penalty_anytime',
    'no_penalty_phase_0',
    'needs_admin_review',
    'flag_suspicious'
  )),
  label_vi text not null check (char_length(label_vi) between 3 and 200),
  is_active boolean not null default true,
  admin_tunable boolean not null default true,
  sort_order int not null default 0,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_cancellation_reason_taxonomy_category_idx
  on public.customer_cancellation_reason_taxonomy (category, sort_order, code);
create index if not exists customer_cancellation_reason_taxonomy_active_idx
  on public.customer_cancellation_reason_taxonomy (is_active, sort_order, code);

drop trigger if exists customer_cancellation_reason_taxonomy_updated_at
  on public.customer_cancellation_reason_taxonomy;
create trigger customer_cancellation_reason_taxonomy_updated_at
  before update on public.customer_cancellation_reason_taxonomy
  for each row execute function public.update_updated_at();

alter table public.customer_cancellation_reason_taxonomy enable row level security;

drop policy if exists "Authenticated read active customer cancellation taxonomy"
  on public.customer_cancellation_reason_taxonomy;
create policy "Authenticated read active customer cancellation taxonomy"
  on public.customer_cancellation_reason_taxonomy
  for select
  to authenticated
  using (is_active or private.is_admin());

revoke all on public.customer_cancellation_reason_taxonomy from public;
revoke all on public.customer_cancellation_reason_taxonomy from anon;
revoke all on public.customer_cancellation_reason_taxonomy from authenticated;
grant select on public.customer_cancellation_reason_taxonomy to authenticated;
grant all on public.customer_cancellation_reason_taxonomy to service_role;

insert into public.customer_cancellation_reason_taxonomy
  (code, category, label_vi, sort_order, safe_metadata)
values
  ('worker_late_significantly', 'no_penalty_anytime', 'Thợ đến trễ đáng kể', 10, '{}'::jsonb),
  ('worker_no_show', 'no_penalty_anytime', 'Thợ không xuất hiện', 20, '{}'::jsonb),
  ('personal_emergency_with_note', 'no_penalty_anytime', 'Khách có việc khẩn cấp và ghi chú rõ', 30, '{}'::jsonb),
  ('service_issue_resolved_itself', 'no_penalty_anytime', 'Sự cố đã tự hết', 40, '{}'::jsonb),
  ('changed_mind', 'no_penalty_phase_0', 'Khách đổi ý trong Phase 0', 50, '{}'::jsonb),
  ('found_alternative', 'no_penalty_phase_0', 'Khách đã có phương án khác', 60, '{}'::jsonb),
  ('wrong_service_selected', 'no_penalty_phase_0', 'Khách chọn nhầm dịch vụ', 70, '{}'::jsonb),
  ('worker_not_trustworthy_claim', 'needs_admin_review', 'Khách báo không tin tưởng thợ', 80, '{}'::jsonb),
  ('address_inaccessible', 'needs_admin_review', 'Địa chỉ không thể tiếp cận', 90, '{}'::jsonb),
  ('pricing_disagreement_late', 'needs_admin_review', 'Bất đồng giá ở giai đoạn muộn', 100, '{}'::jsonb),
  ('repeat_cancel_same_day', 'flag_suspicious', 'Hủy lặp lại trong cùng ngày', 110, '{}'::jsonb),
  ('multiple_cancel_after_accept', 'flag_suspicious', 'Nhiều lần hủy sau khi thợ nhận', 120, '{}'::jsonb),
  ('no_reason_provided', 'flag_suspicious', 'Không cung cấp lý do rõ ràng', 130, '{}'::jsonb)
on conflict (code) do update
set category = excluded.category,
    label_vi = excluded.label_vi,
    sort_order = excluded.sort_order,
    safe_metadata = excluded.safe_metadata,
    is_active = true,
    admin_tunable = true,
    updated_at = now();

create table if not exists public.customer_cancellation_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid references public.profiles(id) on delete set null,
  sub_case text not null check (sub_case in (
    'before_a7',
    'after_a7_before_worker_accept',
    'after_worker_accept',
    'after_worker_completed_trigger_dispute',
    'scheduled_job'
  )),
  reason_code text not null references public.customer_cancellation_reason_taxonomy(code),
  reason_category text not null check (reason_category in (
    'no_penalty_anytime',
    'no_penalty_phase_0',
    'needs_admin_review',
    'flag_suspicious'
  )),
  reason_note text,
  status text not null default 'requested' check (status in ('requested', 'reviewed', 'dispute_pending')),
  admin_review_required boolean not null default false,
  phase0_no_monetary_penalty boolean not null default true,
  worker_goodwill jsonb not null default '{"required": false, "kind": "none", "worker_id": null, "amount": null}'::jsonb,
  abuse_signals text[] not null default '{}'::text[],
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_cancellation_records_job_idx
  on public.customer_cancellation_records (job_id, created_at desc);
create index if not exists customer_cancellation_records_customer_idx
  on public.customer_cancellation_records (customer_id, created_at desc);
create index if not exists customer_cancellation_records_worker_idx
  on public.customer_cancellation_records (worker_id, created_at desc)
  where worker_id is not null;
create index if not exists customer_cancellation_records_review_idx
  on public.customer_cancellation_records (admin_review_required, created_at desc)
  where admin_review_required is true;

drop trigger if exists customer_cancellation_records_updated_at
  on public.customer_cancellation_records;
create trigger customer_cancellation_records_updated_at
  before update on public.customer_cancellation_records
  for each row execute function public.update_updated_at();

alter table public.customer_cancellation_records enable row level security;

drop policy if exists "Customers view own customer cancellations"
  on public.customer_cancellation_records;
drop policy if exists "Workers view assigned customer cancellations"
  on public.customer_cancellation_records;
drop policy if exists "Admins view customer cancellations"
  on public.customer_cancellation_records;
drop policy if exists "Admins manage customer cancellations"
  on public.customer_cancellation_records;
drop policy if exists "Participants and admins view customer cancellations"
  on public.customer_cancellation_records;
create policy "Participants and admins view customer cancellations"
  on public.customer_cancellation_records
  for select
  to authenticated
  using (
    customer_id = (select auth.uid()) or
    worker_id = (select auth.uid()) or
    (select private.is_admin())
  );

drop policy if exists "Admins insert customer cancellations"
  on public.customer_cancellation_records;
create policy "Admins insert customer cancellations"
  on public.customer_cancellation_records
  for insert
  to authenticated
  with check ((select private.is_admin()));

drop policy if exists "Admins update customer cancellations"
  on public.customer_cancellation_records;
create policy "Admins update customer cancellations"
  on public.customer_cancellation_records
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Admins delete customer cancellations"
  on public.customer_cancellation_records;
create policy "Admins delete customer cancellations"
  on public.customer_cancellation_records
  for delete
  to authenticated
  using ((select private.is_admin()));

revoke all on public.customer_cancellation_records from public;
revoke all on public.customer_cancellation_records from anon;
revoke all on public.customer_cancellation_records from authenticated;
grant select on public.customer_cancellation_records to authenticated;
grant all on public.customer_cancellation_records to service_role;

drop function if exists public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]);

create function public.cancel_job_after_accept_atomic(
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

drop function if exists public.request_customer_cancellation_atomic(uuid, uuid, text, text);

create function public.request_customer_cancellation_atomic(
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

  if not found or v_job.customer_id <> p_customer_id then
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

revoke execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) from public;
revoke execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) from anon;
revoke execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) from authenticated;
grant execute on function public.cancel_job_after_accept_atomic(uuid, uuid, text, text, text, text[]) to service_role;

revoke execute on function public.request_customer_cancellation_atomic(uuid, uuid, text, text) from public;
revoke execute on function public.request_customer_cancellation_atomic(uuid, uuid, text, text) from anon;
revoke execute on function public.request_customer_cancellation_atomic(uuid, uuid, text, text) from authenticated;
grant execute on function public.request_customer_cancellation_atomic(uuid, uuid, text, text) to service_role;

commit;

-- @pillar id: P89-refund-obligation-integrity-sql
-- @pillar invariant: Paid cancellation requests preserve paid facts; Customer and Worker disputes open from every eligible job state without changing job status; approved refunds create capped durable obligations and cannot claim completed money without verified outbound receipts.
-- @pillar authority: governance/RULES.md #7; governance/RULES.md #8
-- @pillar target: supabase/migrations/20260905104000_refund_obligation_integrity.sql
-- @pillar layer: sql
-- @pillar siblings: P88-refund-obligations-runtime, P81-completion-media-attachment-sql, P189-dispute-lifecycle
-- @pillar mutation: Remove obligation triggers, bypass the verified refund guard, reject an eligible Worker origin state, or conflate dispute state with jobs.status; the local SQL assertions turn red.

begin;

do $preflight$
begin
  if to_regclass('public.job_refund_obligations') is null then raise exception 'refund obligation table is missing'; end if;
end;
$preflight$;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('d8900000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'refund-customer@example.test', '{"provider":"email","providers":["email"]}', '{}'),
  ('d8900000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'refund-worker@example.test', '{"provider":"email","providers":["email"]}', '{}'),
  ('d8900000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'refund-admin@example.test', '{"provider":"email","providers":["email"]}', '{}'),
  ('d8900000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'refund-outsider@example.test', '{"provider":"email","providers":["email"]}', '{}');
update public.profiles set role = 'worker' where id = 'd8900000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin' where id = 'd8900000-0000-4000-8000-000000000003';
insert into public.worker_profiles(id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name, date_of_birth, verification_status)
values ('d8900000-0000-4000-8000-000000000002', array['plumbing']::public.service_type[],
  array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[], true, true, 'Refund Test Worker', '1990-01-01', 'approved')
on conflict (id) do nothing;

insert into public.jobs(id, customer_id, worker_id, service_type, description, address_district, status,
  final_price, gross_amount, platform_fee, worker_net, paid_at, confirmed_at, payment_received_at, payment_amount_received, payment_status, payment_provider)
select ('d8900000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'd8900000-0000-4000-8000-000000000001', 'd8900000-0000-4000-8000-000000000002', 'plumbing',
  'Refund integrity transaction fixture', 'q7', 'paid', 450000, 450000, 67500, 382500,
  now(), now(), case when value = 102 then null else now() end,
  case when value = 102 then null else 450000 end, case when value = 102 then 'not_started' else 'manual_verified' end,
  'platform_bank_manual'
from generate_series(101, 104) as value;

insert into public.jobs(id, customer_id, worker_id, service_type, description, address_district, status, final_price)
select ('d8900000-0000-4000-8000-' || lpad((104 + allowed.status_order)::text, 12, '0'))::uuid,
  'd8900000-0000-4000-8000-000000000001', 'd8900000-0000-4000-8000-000000000002',
  'plumbing', 'Dispute origin state fixture', 'q7', allowed.status, 450000
from unnest(array[
  'completed_by_worker'::public.job_status,
  'confirmed_by_customer'::public.job_status,
  'payment_pending'::public.job_status,
  'paid'::public.job_status,
  'reviewed'::public.job_status,
  'scope_change_pending'::public.job_status,
  'repairing'::public.job_status
]) with ordinality as allowed(status, status_order);

insert into public.jobs(id, customer_id, worker_id, service_type, description, address_district, status, final_price)
select ('d8900000-0000-4000-8000-' || lpad((111 + allowed.status_order)::text, 12, '0'))::uuid,
  'd8900000-0000-4000-8000-000000000001', 'd8900000-0000-4000-8000-000000000002',
  'plumbing', 'Worker dispute origin state fixture', 'q7', allowed.status, 450000
from unnest(array[
  'completed_by_worker'::public.job_status,
  'confirmed_by_customer'::public.job_status,
  'payment_pending'::public.job_status,
  'paid'::public.job_status,
  'reviewed'::public.job_status,
  'scope_change_pending'::public.job_status,
  'repairing'::public.job_status
]) with ordinality as allowed(status, status_order);

insert into public.job_payment_orders(id, job_id, customer_id, worker_id, payment_method, status,
  gross_amount, platform_fee, worker_net, payment_code, transfer_content, qr_image_url,
  amount_received, bank_reference_hash, bank_reference_suffix, credited_at, verified_by, verified_at)
select ('d8900000-0000-4000-8000-' || lpad((value + 100)::text, 12, '0'))::uuid,
  ('d8900000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'd8900000-0000-4000-8000-000000000001', 'd8900000-0000-4000-8000-000000000002',
  'platform_bank_manual', 'manual_verified', 450000, 67500, 382500,
  'NS' || repeat(case when value = 101 then 'A' else 'B' end, 24),
  'NS' || repeat(case when value = 101 then 'A' else 'B' end, 24),
  'https://vietqr.app/img?amount=450000', 450000,
  repeat(case when value = 101 then 'a' else 'b' end, 64), 'P89', now(),
  'd8900000-0000-4000-8000-000000000003', now()
from unnest(array[101,103]) as value;

do $required_receipt_facts$
declare
  v_field text;
  v_column text;
  v_case jsonb;
begin
  perform * from private.verified_refund_payment('d8900000-0000-4000-8000-000000000101');
  foreach v_field in array array['paid_at', 'payment_received_at', 'payment_amount_received', 'payment_status', 'payment_provider'] loop
    begin
      execute format('update public.jobs set %I = null where id = $1', v_field)
        using 'd8900000-0000-4000-8000-000000000101'::uuid;
      perform * from private.verified_refund_payment('d8900000-0000-4000-8000-000000000101');
      raise exception 'missing job receipt field passed: %', v_field;
    exception
      when sqlstate 'P0001' then
        if sqlerrm <> 'REFUND_PAYMENT_UNVERIFIED' then raise; end if;
      when not_null_violation then
        get stacked diagnostics v_column = column_name;
        if v_field <> 'payment_status' or v_column <> v_field then raise; end if;
    end;
  end loop;
  foreach v_field in array array['verified_at', 'verified_by', 'credited_at', 'bank_reference_hash', 'amount_received'] loop
    begin
      execute format('update public.job_payment_orders set %I = null where job_id = $1', v_field)
        using 'd8900000-0000-4000-8000-000000000101'::uuid;
      perform * from private.verified_refund_payment('d8900000-0000-4000-8000-000000000101');
      raise exception 'missing order receipt field passed: %', v_field;
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'REFUND_PAYMENT_UNVERIFIED' then raise; end if;
    end;
  end loop;
  begin
    update public.jobs set payment_provider = 'direct_worker' where id = 'd8900000-0000-4000-8000-000000000101';
    perform * from private.verified_refund_payment('d8900000-0000-4000-8000-000000000101');
    raise exception 'a changed payment provider reused the manual bank receipt';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REFUND_PAYMENT_UNVERIFIED' then raise; end if;
  end;
  for v_case in select value from jsonb_array_elements('[
    {"source":null,"amount":100000,"actor":"d8900000-0000-4000-8000-000000000003"},
    {"source":"approved_dispute","amount":null,"actor":"d8900000-0000-4000-8000-000000000003"},
    {"source":"approved_dispute","amount":100000,"actor":null},
    {"source":"paid_cancellation","amount":100000,"actor":null}
  ]'::jsonb) loop
    begin
      perform private.record_refund_obligation('d8900000-0000-4000-8000-000000000101',
        v_case->>'source', 'd8900000-0000-4000-8000-000000000101',
        (v_case->>'amount')::integer, (v_case->>'actor')::uuid);
      raise exception 'incomplete source authority created an obligation';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'REFUND_SOURCE_CONFLICT' then raise; end if;
    end;
  end loop;
end;
$required_receipt_facts$;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $customer_dispute_origin_matrix$
declare
  v_index integer;
  v_job uuid;
  v_status public.job_status;
  v_after_status public.job_status;
  v_result record;
begin
  for v_index in 1..7 loop
    v_job := ('d8900000-0000-4000-8000-' || lpad((104 + v_index)::text, 12, '0'))::uuid;
    select status into strict v_status from public.jobs where id = v_job;
    select * into strict v_result from public.open_dispute_atomic(
      v_job,
      'd8900000-0000-4000-8000-000000000001',
      'customer',
      'other',
      'Đề nghị kiểm tra trạng thái tranh chấp ' || v_status::text || '.'
    );
    if v_result.ok is not true or v_result.error_code is not null or v_result.dispute_id is null
      or v_result.evidence_snapshot_id is null or v_result.dispute_status is distinct from 'open'
      or v_result.admin_review_required is not true then
      raise exception 'P89_CUSTOMER_DISPUTE_ORIGIN_REJECTED status=% result=%', v_status, row_to_json(v_result);
    end if;
    select status into strict v_after_status from public.jobs where id = v_job;
    if v_after_status is distinct from v_status
      or not exists (
        select 1 from public.disputes
         where id = v_result.dispute_id and job_id = v_job and initiated_by = 'customer'
           and initiated_by_id = 'd8900000-0000-4000-8000-000000000001'
           and counter_party_id = 'd8900000-0000-4000-8000-000000000002'
           and status = 'open' and evidence_snapshot_id = v_result.evidence_snapshot_id
      )
      or not exists (
        select 1 from public.evidence_snapshots
         where id = v_result.evidence_snapshot_id and job_id = v_job and evidence_locked_at is not null
      ) then
      raise exception 'P89_CUSTOMER_DISPUTE_ORIGIN_CHANGED_JOB_OR_RECEIPT status=% after=% result=%',
        v_status, v_after_status, row_to_json(v_result);
    end if;
  end loop;
end;
$customer_dispute_origin_matrix$;

do $worker_dispute_origin_matrix$
declare
  v_index integer;
  v_job uuid;
  v_status public.job_status;
  v_after_status public.job_status;
  v_result record;
begin
  select * into strict v_result from public.open_dispute_atomic(
    'd8900000-0000-4000-8000-000000000112',
    'd8900000-0000-4000-8000-000000000004',
    'worker',
    'other',
    'Đề nghị kiểm tra quyền mở tranh chấp của Worker.'
  );
  if v_result.ok is not false or v_result.error_code is distinct from 'AUTH_FORBIDDEN'
    or v_result.dispute_id is not null
    or exists (select 1 from public.disputes where job_id = 'd8900000-0000-4000-8000-000000000112') then
    raise exception 'P89_WORKER_DISPUTE_WRONG_ACTOR_WAS_ACCEPTED result=%', row_to_json(v_result);
  end if;

  for v_index in 1..7 loop
    v_job := ('d8900000-0000-4000-8000-' || lpad((111 + v_index)::text, 12, '0'))::uuid;
    select status into strict v_status from public.jobs where id = v_job;
    select * into strict v_result from public.open_dispute_atomic(
      v_job,
      'd8900000-0000-4000-8000-000000000002',
      'worker',
      'other',
      'Đề nghị kiểm tra trạng thái tranh chấp Worker ' || v_status::text || '.'
    );
    if v_result.ok is not true or v_result.error_code is not null or v_result.dispute_id is null
      or v_result.evidence_snapshot_id is null or v_result.dispute_status is distinct from 'open'
      or v_result.admin_review_required is not true then
      raise exception 'P89_WORKER_DISPUTE_ORIGIN_REJECTED status=% result=%', v_status, row_to_json(v_result);
    end if;
    select status into strict v_after_status from public.jobs where id = v_job;
    if v_after_status is distinct from v_status
      or not exists (
        select 1 from public.disputes
         where id = v_result.dispute_id and job_id = v_job and initiated_by = 'worker'
           and initiated_by_id = 'd8900000-0000-4000-8000-000000000002'
           and counter_party_id = 'd8900000-0000-4000-8000-000000000001'
           and status = 'open' and evidence_snapshot_id = v_result.evidence_snapshot_id
      )
      or not exists (
        select 1 from public.evidence_snapshots
         where id = v_result.evidence_snapshot_id and job_id = v_job and evidence_locked_at is not null
      ) then
      raise exception 'P89_WORKER_DISPUTE_ORIGIN_CHANGED_JOB_OR_RECEIPT status=% after=% result=%',
        v_status, v_after_status, row_to_json(v_result);
    end if;
  end loop;
end;
$worker_dispute_origin_matrix$;

do $review_and_obligation$
declare
  v_receipt jsonb;
  v_replay jsonb;
  v_dispute record;
  v_counter record;
  v_decision record;
  v_summary jsonb;
  v_request_id uuid;
  v_iteration integer;
begin
  v_receipt := public.request_paid_cancellation_review_atomic(
    'd8900000-0000-4000-8000-000000000101', 'd8900000-0000-4000-8000-000000000001',
    'pricing_disagreement_late', 'Đề nghị kiểm tra lại thanh toán đã ghi nhận.');
  if v_receipt->>'reason_code' is distinct from 'pricing_disagreement_late' then
    raise exception 'paid review receipt omitted its persisted reason';
  end if;
  v_replay := public.request_paid_cancellation_review_atomic(
    'd8900000-0000-4000-8000-000000000101', 'd8900000-0000-4000-8000-000000000001',
    'other', 'A changed retry must not rewrite the accepted review.');
  if v_replay is distinct from v_receipt then
    raise exception 'changed retry misrepresented the persisted paid review';
  end if;
  for v_iteration in 1..100 loop
    v_replay := public.request_paid_cancellation_review_atomic(
      'd8900000-0000-4000-8000-000000000101', 'd8900000-0000-4000-8000-000000000001',
      'pricing_disagreement_late', 'Đề nghị kiểm tra lại thanh toán đã ghi nhận.');
    if v_replay <> v_receipt then raise exception 'paid review replay changed receipt'; end if;
  end loop;
  if (select count(*) from public.customer_cancellation_records where job_id = 'd8900000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.job_events where job_id = 'd8900000-0000-4000-8000-000000000101'
      and event_type = 'paid_cancellation_review_requested') <> 1
    or exists (select 1 from public.job_refund_obligations where job_id = 'd8900000-0000-4000-8000-000000000101') then
    raise exception 'review request duplicated or promised a refund';
  end if;
  if not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000101'
    and status = 'paid' and payment_status = 'manual_verified' and payment_amount_received = 450000 and paid_at is not null) then
    raise exception 'paid review mutated paid facts';
  end if;
  v_summary := public.read_job_refund_summary('d8900000-0000-4000-8000-000000000101', true);
  if v_summary->>'state' <> 'review_required' or v_summary->>'amount_vnd' is not null then
    raise exception 'unapproved request advertised a refund amount';
  end if;
  if not exists (select 1 from public.disputes where id = (v_receipt->>'dispute_id')::uuid and status = 'open')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000101' and status = 'paid') then
    raise exception 'opening a dispute changed the job state or returned the wrong dispute state';
  end if;

  select * into v_counter from public.submit_counter_statement_atomic(
    (v_receipt->>'dispute_id')::uuid, 'd8900000-0000-4000-8000-000000000002',
    'Tôi đã đọc nội dung tranh chấp và bổ sung phản hồi của mình.'
  );
  if v_counter.ok is not true or v_counter.dispute_status <> 'admin_review'
    or not exists (select 1 from public.disputes where id = (v_receipt->>'dispute_id')::uuid and status = 'admin_review')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000101' and status = 'paid') then
    raise exception 'counter-statement did not advance the dispute independently of the job state';
  end if;

  select * into v_decision from public.admin_decide_dispute_atomic(
    (v_receipt->>'dispute_id')::uuid, 'd8900000-0000-4000-8000-000000000003', 'customer_favor_partial',
    100000, null, 'none', 'none', repeat('Đã kiểm tra bằng chứng và xác nhận nghĩa vụ hoàn tiền. ', 2));
  if v_decision.ok is not true then raise exception 'approved dispute could not create obligation'; end if;
  v_summary := public.read_job_refund_summary('d8900000-0000-4000-8000-000000000101', true);
  if v_summary->>'state' <> 'refund_required' or (v_summary->>'amount_vnd')::integer <> 100000
    or (v_summary->>'receipt_verification_available')::boolean is not false then
    raise exception 'approved dispute missing honest obligation';
  end if;
  if not exists (select 1 from public.disputes where id = (v_receipt->>'dispute_id')::uuid and status = 'admin_decided')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000101' and status = 'paid') then
    raise exception 'Admin decision conflated the dispute state with the paid job state';
  end if;
  update public.disputes set admin_decision = admin_decision where id = (v_receipt->>'dispute_id')::uuid;
  if (select count(*) from public.job_refund_obligations where job_id = 'd8900000-0000-4000-8000-000000000101') <> 1 then
    raise exception 'replayed dispute duplicated refund obligation';
  end if;

  select * into v_dispute from public.open_dispute_atomic('d8900000-0000-4000-8000-000000000101',
    'd8900000-0000-4000-8000-000000000001', 'customer', 'other', 'Đề nghị xem xét thêm bằng chứng.');
  update public.disputes set status = 'awaiting_counter_party' where id = v_dispute.dispute_id;
  select * into v_counter from public.submit_counter_statement_atomic(
    v_dispute.dispute_id, 'd8900000-0000-4000-8000-000000000002',
    'Tôi đã đọc nội dung tranh chấp và bổ sung phản hồi của mình.'
  );
  if v_counter.ok is not true or v_counter.dispute_status <> 'admin_review'
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000101' and status = 'paid') then
    raise exception 'awaiting-counter-party path did not enter admin review independently of job status';
  end if;
  begin
    perform * from public.admin_decide_dispute_atomic(v_dispute.dispute_id,
      'd8900000-0000-4000-8000-000000000003', 'customer_favor_partial', 400000, null,
      'none', 'none', repeat('Đã kiểm tra bằng chứng và xác nhận nghĩa vụ hoàn tiền. ', 2));
    raise exception 'refund obligations exceeded verified received amount';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REFUND_AMOUNT_EXCEEDS_PAID' then raise; end if;
  end;
  if not exists (select 1 from public.disputes where id = v_dispute.dispute_id and status = 'admin_review')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000101' and status = 'paid') then
    raise exception 'rejected refund changed the dispute or job lifecycle';
  end if;
  select * into v_decision from public.admin_decide_dispute_atomic(v_dispute.dispute_id,
    'd8900000-0000-4000-8000-000000000003', 'worker_favor', null, null,
    'none', 'none', repeat('Đã kiểm tra bằng chứng và ghi nhận quyết định của Admin. ', 2));
  if v_decision.ok is not true
    or not exists (select 1 from public.disputes where id = v_dispute.dispute_id and status = 'admin_decided')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000101' and status = 'paid') then
    raise exception 'Admin review decision changed the job state or failed to close the dispute';
  end if;

  select * into v_dispute from public.open_dispute_atomic('d8900000-0000-4000-8000-000000000102',
    'd8900000-0000-4000-8000-000000000001', 'customer', 'other', 'Đề nghị kiểm tra chứng từ thanh toán.');
  begin
    perform * from public.admin_decide_dispute_atomic(v_dispute.dispute_id,
      'd8900000-0000-4000-8000-000000000003', 'customer_favor_partial', 100000, null,
      'none', 'none', repeat('Đã kiểm tra bằng chứng và xác nhận nghĩa vụ hoàn tiền. ', 2));
    raise exception 'final price was mistaken for a verified paid receipt';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REFUND_PAYMENT_UNVERIFIED' then raise; end if;
  end;
  if not exists (select 1 from public.disputes where id = v_dispute.dispute_id and status = 'open')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000102' and status = 'paid') then
    raise exception 'failed refund decision changed the dispute or job lifecycle';
  end if;

  select * into v_dispute from public.open_dispute_atomic('d8900000-0000-4000-8000-000000000104',
    'd8900000-0000-4000-8000-000000000001', 'customer', 'other', 'Đề nghị xem xét thêm bằng chứng.');
  select * into v_decision from public.admin_decide_dispute_atomic(v_dispute.dispute_id,
    'd8900000-0000-4000-8000-000000000003', 'worker_favor', null, null,
    'none', 'none', repeat('Đã kiểm tra bằng chứng và ghi nhận quyết định của Admin. ', 2));
  if v_decision.ok is not true
    or not exists (select 1 from public.disputes where id = v_dispute.dispute_id and status = 'admin_decided')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000104' and status = 'paid') then
    raise exception 'Admin decision from an open dispute changed the job state or failed to close the dispute';
  end if;

  select * into v_dispute from public.open_dispute_atomic('d8900000-0000-4000-8000-000000000104',
    'd8900000-0000-4000-8000-000000000001', 'customer', 'other', 'Đề nghị xem xét thêm bằng chứng.');
  update public.disputes set status = 'awaiting_counter_party' where id = v_dispute.dispute_id;
  select * into v_decision from public.admin_decide_dispute_atomic(v_dispute.dispute_id,
    'd8900000-0000-4000-8000-000000000003', 'worker_favor', null, null,
    'none', 'none', repeat('Đã kiểm tra bằng chứng và ghi nhận quyết định của Admin. ', 2));
  if v_decision.ok is not true
    or not exists (select 1 from public.disputes where id = v_dispute.dispute_id and status = 'admin_decided')
    or not exists (select 1 from public.jobs where id = 'd8900000-0000-4000-8000-000000000104' and status = 'paid') then
    raise exception 'Admin decision from the awaiting-counter-party state changed the job state or failed';
  end if;

  begin
    perform public.request_paid_cancellation_review_atomic('d8900000-0000-4000-8000-000000000101',
      'd8900000-0000-4000-8000-000000000004', 'changed_mind', null);
    raise exception 'cross-customer financial review was permitted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'JOB_NOT_FOUND' then raise; end if;
  end;

  update public.jobs set status = 'cancelled', cancelled_at = now()
    where id = 'd8900000-0000-4000-8000-000000000103';
  if not exists (select 1 from public.job_refund_obligations
    where job_id = 'd8900000-0000-4000-8000-000000000103' and amount_vnd = 450000 and source_type = 'paid_cancellation') then
    raise exception 'actual paid cancellation lost refund obligation';
  end if;
  begin
    insert into public.admin_financial_adjustments(source_key, adjustment_type, job_id,
      gross_refund_vnd, cash_outflow_vnd, reason_code, recorded_by, realized_at)
    values ('p89-unverified-refund', 'refund', 'd8900000-0000-4000-8000-000000000101',
      100000, 100000, 'DISPUTE_APPROVED', 'd8900000-0000-4000-8000-000000000003', now());
    raise exception 'refund completed without outbound bank receipt and maker/checker verification';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REFUND_RECEIPT_VERIFICATION_UNAVAILABLE' then raise; end if;
  end;
end;
$review_and_obligation$;

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $actor_boundaries$
declare v_actor uuid;
begin
  foreach v_actor in array array['d8900000-0000-4000-8000-000000000001',
    'd8900000-0000-4000-8000-000000000002', 'd8900000-0000-4000-8000-000000000003']::uuid[] loop
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    begin
      perform * from public.job_refund_obligations;
      raise exception 'authenticated actor read service-owned refund obligations directly';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.read_job_refund_summary('d8900000-0000-4000-8000-000000000101', false);
      raise exception 'authenticated actor bypassed Edge refund read authorization';
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$actor_boundaries$;
reset role;
rollback;

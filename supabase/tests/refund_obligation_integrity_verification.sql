-- @pillar id: P89-refund-obligation-integrity-sql
-- @pillar invariant: Paid cancellation requests preserve paid facts; approved refunds create capped durable obligations and cannot claim completed money without verified outbound receipts.
-- @pillar authority: governance/RULES.md #7; governance/RULES.md #8
-- @pillar target: supabase/migrations/20260905104000_refund_obligation_integrity.sql
-- @pillar layer: sql
-- @pillar siblings: P88-refund-obligations-runtime, P81-completion-media-attachment-sql
-- @pillar mutation: Remove the obligation triggers or refund-completion guard; approved refunds vanish or unverified completed refunds are inserted.

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
from generate_series(101, 103) as value;

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

do $review_and_obligation$
declare
  v_receipt jsonb;
  v_replay jsonb;
  v_dispute record;
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

  select * into v_decision from public.admin_decide_dispute_atomic(
    (v_receipt->>'dispute_id')::uuid, 'd8900000-0000-4000-8000-000000000003', 'customer_favor_partial',
    100000, null, 'none', 'none', repeat('Đã kiểm tra bằng chứng và xác nhận nghĩa vụ hoàn tiền. ', 2));
  if v_decision.ok is not true then raise exception 'approved dispute could not create obligation'; end if;
  v_summary := public.read_job_refund_summary('d8900000-0000-4000-8000-000000000101', true);
  if v_summary->>'state' <> 'refund_required' or (v_summary->>'amount_vnd')::integer <> 100000
    or (v_summary->>'receipt_verification_available')::boolean is not false then
    raise exception 'approved dispute missing honest obligation';
  end if;
  update public.disputes set admin_decision = admin_decision where id = (v_receipt->>'dispute_id')::uuid;
  if (select count(*) from public.job_refund_obligations where job_id = 'd8900000-0000-4000-8000-000000000101') <> 1 then
    raise exception 'replayed dispute duplicated refund obligation';
  end if;

  select * into v_dispute from public.open_dispute_atomic('d8900000-0000-4000-8000-000000000101',
    'd8900000-0000-4000-8000-000000000001', 'customer', 'other', 'Đề nghị xem xét thêm bằng chứng.');
  begin
    perform * from public.admin_decide_dispute_atomic(v_dispute.dispute_id,
      'd8900000-0000-4000-8000-000000000003', 'customer_favor_partial', 400000, null,
      'none', 'none', repeat('Đã kiểm tra bằng chứng và xác nhận nghĩa vụ hoàn tiền. ', 2));
    raise exception 'refund obligations exceeded verified received amount';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REFUND_AMOUNT_EXCEEDS_PAID' then raise; end if;
  end;
  if exists (select 1 from public.disputes where id = v_dispute.dispute_id and status = 'admin_decided') then
    raise exception 'rejected refund left committed dispute decision';
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

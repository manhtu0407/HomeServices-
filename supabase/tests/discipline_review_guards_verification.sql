-- @pillar id: P292-discipline-review-guards-sql
-- @pillar invariant: A confirmed harm ban cannot be undone by a general reinstate, and its withdrawal hold stops a payout request already waiting; a report on a job that changed workers is refused rather than filed against the latest one; a worker whose on-the-way job never arrives is proposed as a no-show; the worker's own record lists level-1 cases; an off-app case shows only the chat messages it was built on; and an identity another confirmed harm case still covers stays blocked when one case is overturned
-- @pillar authority: governance/RULES.md #7 | PR #294 review 2026-09-28
-- @pillar target: supabase/migrations/20260928122000_worker_discipline_decisions.sql
-- @pillar layer: sql
-- @pillar siblings: P291-dismissal-keeps-other-suspension-sql, P268-appeal-restores-exactly-sql
-- @pillar mutation: Make private.enforce_withdrawal_hold_on_payout always return new; the held request is paid out and P292 raises P292_HELD_PAYOUT_MOVED

begin;
set local statement_timeout = '40s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2920000-0000-4000-8000-000000000001','authenticated','authenticated','guards-p292-customer@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2920000-0000-4000-8000-000000000002','authenticated','authenticated','guards-p292-worker@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2920000-0000-4000-8000-000000000003','authenticated','authenticated','guards-p292-admin@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2920000-0000-4000-8000-000000000004','authenticated','authenticated','guards-p292-worker-two@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role = 'worker'
where id in ('c2920000-0000-4000-8000-000000000002', 'c2920000-0000-4000-8000-000000000004');
update public.profiles set role = 'admin' where id = 'c2920000-0000-4000-8000-000000000003';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
)
select id::uuid, array['plumbing']::public.service_type[], array['q7'], true, true, 4.9, 10, 'approved', false,
  'Guard Fixture Worker', '1990-01-01'
from (values ('c2920000-0000-4000-8000-000000000002'), ('c2920000-0000-4000-8000-000000000004')) as fixture(id)
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

-- 101 paid (balance for a withdrawal), 102 on the way long past its slot, 103 reassigned from
-- worker two to worker one, 104 and 105 carry redacted chat.
insert into public.jobs (id, customer_id, worker_id, service_type, description, status, quote_mode,
  final_price, gross_amount, platform_fee, worker_net, display_code, scheduled_at, created_at, paid_at)
values
  ('c2920000-0000-4000-8000-000000000101', 'c2920000-0000-4000-8000-000000000001', 'c2920000-0000-4000-8000-000000000002',
    'plumbing', 'Guard paid fixture', 'paid', 'rfq', 1000000, 1000000, 150000, 850000, 'GRD-0001', now() - interval '2 days', now(), now()),
  ('c2920000-0000-4000-8000-000000000102', 'c2920000-0000-4000-8000-000000000001', 'c2920000-0000-4000-8000-000000000002',
    'plumbing', 'Guard on-the-way fixture', 'worker_on_way', 'rfq', null, null, null, null, 'GRD-0002', now() - interval '3 hours', now(), null),
  ('c2920000-0000-4000-8000-000000000103', 'c2920000-0000-4000-8000-000000000001', 'c2920000-0000-4000-8000-000000000002',
    'plumbing', 'Guard reassigned fixture', 'worker_matched', 'rfq', null, null, null, null, 'GRD-0003', now() + interval '1 day', now(), null),
  ('c2920000-0000-4000-8000-000000000104', 'c2920000-0000-4000-8000-000000000001', 'c2920000-0000-4000-8000-000000000002',
    'plumbing', 'Guard chat fixture one', 'arrived', 'rfq', null, null, null, null, 'GRD-0004', null, now(), null),
  ('c2920000-0000-4000-8000-000000000105', 'c2920000-0000-4000-8000-000000000001', 'c2920000-0000-4000-8000-000000000002',
    'plumbing', 'Guard chat fixture two', 'arrived', 'rfq', null, null, null, null, 'GRD-0005', null, now(), null);

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state, settlement_state, gross_amount,
  platform_fee, worker_net, commission_level, commission_rate_bps, available_at
) values ('c2920000-0000-4000-8000-000000000101', 'c2920000-0000-4000-8000-000000000002', 'platform_bank_manual',
  'available', 'admin_verified', 1000000, 150000, 850000, 1, 1500, now());

insert into public.worker_payout_methods (
  worker_id, bank_key, bank_name, account_holder_name, bank_account, bank_account_masked,
  is_default, status, reviewed_at, reviewed_by
) values ('c2920000-0000-4000-8000-000000000002', 'vietcombank', 'Vietcombank', 'GUARD FIXTURE WORKER',
  '12345678', '**** 5678', true, 'verified', now(), 'c2920000-0000-4000-8000-000000000003');

insert into public.worker_cancellation_requests (job_id, worker_id, reason, reason_category)
values ('c2920000-0000-4000-8000-000000000103', 'c2920000-0000-4000-8000-000000000004', 'Bận việc gia đình', 'legit_with_admin_review');

insert into public.chat_messages (id, job_id, sender_id, sender_role, content) values
  ('c2920000-0000-4000-8000-000000000201', 'c2920000-0000-4000-8000-000000000104', 'c2920000-0000-4000-8000-000000000002', 'worker', 'redacted'),
  ('c2920000-0000-4000-8000-000000000202', 'c2920000-0000-4000-8000-000000000105', 'c2920000-0000-4000-8000-000000000002', 'worker', 'redacted');
insert into public.chat_guard_redaction_evidence (id, job_id, message_id, sender_id, sender_role, original_body, matched_rules) values
  ('c2920000-0000-4000-8000-000000000301', 'c2920000-0000-4000-8000-000000000104', 'c2920000-0000-4000-8000-000000000201',
    'c2920000-0000-4000-8000-000000000002', 'worker', 'Chuyen khoan rieng cho em nhe', array['off_app']),
  ('c2920000-0000-4000-8000-000000000302', 'c2920000-0000-4000-8000-000000000105', 'c2920000-0000-4000-8000-000000000202',
    'c2920000-0000-4000-8000-000000000002', 'worker', 'Khach khac khong lien quan', array['off_app']);

do $guards$
declare
  v_customer constant uuid := 'c2920000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'c2920000-0000-4000-8000-000000000002';
  v_admin constant uuid := 'c2920000-0000-4000-8000-000000000003';
  v_case uuid;
  v_detail jsonb;
  v_request uuid;
  v_version integer;
  v_access record;
  v_moved boolean := false;
  v_second uuid;
begin
  -- Level-1 cases are on the worker's own record.
  v_case := private.propose_violation_case(v_worker, v_customer, 'c2920000-0000-4000-8000-000000000104',
    'late_arrival', 'detector', null, null, '{}'::jsonb, 'p292:late');
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(public.get_worker_violations(v_worker)) as item
    where (item->>'id')::uuid = v_case
  ) then
    raise exception 'P292_LEVEL_ONE_HIDDEN';
  end if;

  -- An off-app case shows only its own evidence.
  v_case := private.propose_violation_case(v_worker, v_customer, 'c2920000-0000-4000-8000-000000000104',
    'off_app_dealing', 'detector', null, null,
    pg_catalog.jsonb_build_object('chat_evidence_ids', pg_catalog.jsonb_build_array('c2920000-0000-4000-8000-000000000301')),
    'p292:offapp');
  v_detail := public.admin_get_violation_case(v_admin, v_case);
  if pg_catalog.jsonb_array_length(v_detail->'chat_evidence') <> 1
     or v_detail#>>'{chat_evidence,0,original_body}' <> 'Chuyen khoan rieng cho em nhe' then
    raise exception 'P292_FOREIGN_CHAT_EXPOSED: %', v_detail->'chat_evidence';
  end if;

  -- A report on a job that changed workers is refused.
  begin
    perform public.create_worker_report(v_customer, 'c2920000-0000-4000-8000-000000000103', 'theft', 'Mất đồ sau khi thợ đến sửa');
    raise exception 'P292_REPORT_ON_CHANGED_JOB';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'JOB_WORKER_CHANGED' then raise; end if;
  end;

  -- A worker on the way long past the slot is proposed as a no-show.
  perform private.detect_worker_violations();
  if not exists (select 1 from public.worker_violation_cases
                 where dedupe_key = 'noshow:c2920000-0000-4000-8000-000000000102:' || v_worker) then
    raise exception 'P292_ON_THE_WAY_NO_SHOW_MISSED';
  end if;

  -- A payout already being processed when a harm case is confirmed cannot be paid out.
  -- Requested two days ago, so the 24-hour eligibility delay has passed.
  insert into public.worker_withdrawal_requests (
    worker_id, payout_method_id, client_request_id, amount_vnd, bank_key, bank_name,
    account_holder_name, bank_account, bank_account_masked, status, requested_at
  )
  select v_worker, method.id, gen_random_uuid(), 300000, method.bank_key, method.bank_name,
    method.account_holder_name, method.bank_account, method.bank_account_masked, 'pending', now() - interval '2 days'
  from public.worker_payout_methods as method where method.worker_id = v_worker
  returning id into v_request;
  select version into strict v_version from public.worker_withdrawal_requests where id = v_request;
  perform public.admin_claim_worker_withdrawal_v2(v_admin, v_request, v_version, gen_random_uuid(), null);
  if (select status from public.worker_withdrawal_requests where id = v_request) <> 'processing' then
    raise exception 'P292_FIXTURE_NOT_PROCESSING';
  end if;
  v_case := private.propose_violation_case(v_worker, v_customer, 'c2920000-0000-4000-8000-000000000101',
    'theft', 'customer_report', v_customer, 'Mất đồ sau khi thợ rời đi', '{}'::jsonb, 'p292:theft');
  perform public.admin_decide_violation_case(v_admin, v_case, 'confirm', 'Có bằng chứng camera rõ ràng',
    0, pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind', 'phone', 'value_hmac', repeat('b', 64))));

  select version into strict v_version from public.worker_withdrawal_requests where id = v_request;
  begin
    perform public.admin_resolve_worker_withdrawal_v2(v_admin, v_request, v_version, gen_random_uuid(), 'paid',
      repeat('a', 64), 'REF01', true, null);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WITHDRAWAL_HOLD_ACTIVE' then raise; end if;
  end;
  select status <> 'processing' into v_moved from public.worker_withdrawal_requests where id = v_request;
  if v_moved then
    raise exception 'P292_HELD_PAYOUT_MOVED';
  end if;

  -- The ban holds against a general reinstate.
  select * into v_access from public.admin_set_worker_access_atomic(v_admin, v_worker, 'reinstate', 'Mở lại tài khoản thử');
  if v_access.ok or v_access.error_code <> 'DISCIPLINE_HOLD_ACTIVE'
     or not (select is_suspended from public.worker_profiles where id = v_worker) then
    raise exception 'P292_BAN_BYPASSED: % %', v_access.ok, v_access.error_code;
  end if;

  -- A second confirmed harm case covers the same phone; overturning the first keeps it blocked.
  v_second := private.propose_violation_case(v_worker, v_customer, 'c2920000-0000-4000-8000-000000000104',
    'violence', 'customer_report', v_customer, 'Thợ có hành vi bạo lực với khách', '{}'::jsonb, 'p292:violence');
  perform public.admin_decide_violation_case(v_admin, v_second, 'confirm', 'Có nhân chứng và video xác nhận',
    0, pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind', 'phone', 'value_hmac', repeat('b', 64))));
  perform public.submit_violation_appeal(v_worker, v_case, 'Tôi không lấy đồ, camera quay nhầm người khác', '{}');
  perform public.admin_decide_violation_appeal(v_admin, v_case, 'overturned', 'Camera cho thấy người khác lấy đồ');
  if not private.identity_blocked('phone', repeat('b', 64))
     or not exists (select 1 from public.identity_blocklist where value_hmac = repeat('b', 64) and case_id = v_second and lifted_at is null)
     or not (select is_suspended from public.worker_profiles where id = v_worker) then
    raise exception 'P292_SHARED_BLOCK_LIFTED';
  end if;
end;
$guards$;

rollback;

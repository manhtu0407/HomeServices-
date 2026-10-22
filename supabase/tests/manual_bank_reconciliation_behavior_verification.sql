-- @pillar id: P423-manual-bank-reconciliation-sql
-- @pillar invariant: A Customer-confirmed completion opens one manual-bank order at the final price for each of the six services, a QR display or a Customer transfer claim never marks a Job paid, only a finance reconciler's exact-amount decision with an unused bank reference does so once and with a held Worker credit, including for an order that a wrong amount first sent to reconciliation (its reversed Worker credit is reopened, but never for an order that was not in reconciliation), and wrong amounts, repeated references, unclaimed orders, invalid inputs and every other actor leave the Job in payment_pending.
-- @pillar authority: governance/RULES.md #7 | governance/RULES.md #8 | owner four-blocker update (personal bank QR payment rail)
-- @pillar target: supabase/migrations/20260811213000_manual_bank_payment_finance_v1.sql
-- @pillar layer: sql
-- @pillar siblings: P371-customer-completion-atomic-sql, P68-completion-payment-authority
-- @pillar mutation: Let decide_manual_bank_payment_reconciliation accept an order that is still manual_qr_ready, skip the amount comparison, or drop the bank-reference reuse check; the unclaimed, wrong-amount and repeated-reference assertions fail. Require a pending Worker ledger again, or reopen a reversed ledger under any order status; the recovery and guarded-reopen assertions fail.
-- Rollback-only behavioural proof for the platform_bank_manual payment rail.

begin;
set local statement_timeout = '60s';

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d6910000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bank-behavior-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6910000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bank-behavior-other-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6910000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'bank-behavior-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6910000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'bank-behavior-admin-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6910000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'bank-behavior-admin-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6910000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'bank-behavior-operator-plain@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'worker' where id = 'd6910000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin' where id in (
  'd6910000-0000-4000-8000-000000000004', 'd6910000-0000-4000-8000-000000000005'
);
update public.profiles set role = 'admin_operator' where id = 'd6910000-0000-4000-8000-000000000006';
insert into public.admin_operator_accounts(user_id, baseline_role, capabilities, status, granted_by, last_changed_by)
values (
  'd6910000-0000-4000-8000-000000000006', 'customer', array['operations.read']::text[], 'active',
  'd6910000-0000-4000-8000-000000000004', 'd6910000-0000-4000-8000-000000000004'
);

insert into public.customer_profiles(id, building_name, unit_number, district)
values
  ('d6910000-0000-4000-8000-000000000001', 'Bank Behavior Building', 'D691-1', 'q7'),
  ('d6910000-0000-4000-8000-000000000002', 'Bank Behavior Building', 'D691-2', 'q7')
on conflict (id) do update
set building_name = excluded.building_name, unit_number = excluded.unit_number, district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name, date_of_birth, verification_status
) values (
  'd6910000-0000-4000-8000-000000000003',
  array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']::public.service_type[],
  array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']::public.service_type[],
  5, array['q7'], array[]::text[], true, true, 'Bank Behavior Worker', '1990-01-01', 'approved'
);

do $fixtures$
declare
  v_index integer;
  v_job uuid;
begin
  for v_index in 1..7 loop
    v_job := ('d6910000-0000-4000-8000-0000000001' || lpad(v_index::text, 2, '0'))::uuid;
    insert into public.jobs(
      id, customer_id, worker_id, service_type, description, address_district,
      status, final_price, completion_notes, completion_photo_urls,
      worker_commission_level, worker_commission_rate_bps
    ) values (
      v_job,
      'd6910000-0000-4000-8000-000000000001',
      'd6910000-0000-4000-8000-000000000003',
      (array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman', 'electrical'])[v_index]::public.service_type,
      'Manual bank behaviour verification ' || v_index,
      'q7',
      'completed_by_worker',
      450000 + v_index * 10000,
      'Đã hoàn tất và gửi bằng chứng.',
      array['supabase://job-media/' || v_job || '/after/photo-1.jpg'],
      1,
      1000
    );
    insert into public.job_media_assets(job_id, owner_id, service_type, stage, bucket_id, object_path, mime_type)
    values (
      v_job,
      'd6910000-0000-4000-8000-000000000003',
      (array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman', 'electrical'])[v_index]::public.service_type,
      'after', 'job-media', v_job || '/after/photo-1.jpg', 'image/jpeg'
    );
  end loop;
end;
$fixtures$;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

-- 1. Approval precedes payment: before the Customer confirms completion no order can exist, be claimed or be decided.
do $approval_first$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000107';
  v_customer constant uuid := 'd6910000-0000-4000-8000-000000000001';
  v_other constant uuid := 'd6910000-0000-4000-8000-000000000002';
  v_code constant text := 'NS000000000000000000000007';
  v_url constant text := 'https://vietqr.app/img?acc=1234567890&bank=VCB&amount=520000&des=NS000000000000000000000007';
begin
  begin
    perform * from public.claim_manual_bank_payment(v_job, v_customer, now(), 'VCB');
    raise exception 'a transfer claim was accepted before completion was confirmed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PAYMENT_METHOD_LOCKED' then raise; end if;
  end;
  begin
    perform * from public.create_manual_bank_payment_order(v_job, v_customer, 520000, v_code, v_code, v_url, now());
    raise exception 'a payment order was opened before completion was confirmed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'INVALID_STATUS' then raise; end if;
  end;
  begin
    perform * from public.confirm_completion_manual_bank_atomic(v_job, v_other, 'completion-payment:' || v_job || ':' || v_other, 520000, v_code, v_code, v_url, now());
    raise exception 'another Customer confirmed completion';
  exception when sqlstate 'P0001' then
    null;
  end;
  begin
    perform * from public.confirm_completion_manual_bank_atomic(v_job, v_customer, 'completion-payment:' || v_job || ':' || v_customer, 519999, v_code, v_code, v_url, now());
    raise exception 'completion was accepted at a price that is not the final price';
  exception when sqlstate 'P0001' then
    null;
  end;
  if exists (select 1 from public.job_payment_orders where job_id = v_job)
    or exists (select 1 from public.worker_payment_ledger where job_id = v_job)
    or exists (select 1 from public.completion_payment_operations where job_id = v_job)
    or (select status from public.jobs where id = v_job) is distinct from 'completed_by_worker'::public.job_status
  then
    raise exception 'refused pre-completion payment attempts left a partial effect';
  end if;
end;
$approval_first$;

-- 2. All six services open one manual-bank order priced at the final price, with the QR carrying the amount and the transfer reference.
do $six_services$
declare
  v_index integer;
  v_job uuid;
  v_price integer;
  v_code text;
  v_url text;
  v_result record;
  v_order record;
  v_ledger record;
  v_job_row record;
  v_services constant text[] := array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'];
begin
  for v_index in 1..6 loop
    v_job := ('d6910000-0000-4000-8000-0000000001' || lpad(v_index::text, 2, '0'))::uuid;
    v_price := 450000 + v_index * 10000;
    v_code := 'NS' || lpad(v_index::text, 24, '0');
    v_url := format('https://vietqr.app/img?acc=1234567890&bank=VCB&amount=%s&des=%s', v_price, v_code);
    select * into strict v_result from public.confirm_completion_manual_bank_atomic(
      v_job, 'd6910000-0000-4000-8000-000000000001',
      'completion-payment:' || v_job || ':d6910000-0000-4000-8000-000000000001',
      v_price, v_code, v_code, v_url, now()
    );
    if v_result.status <> 'payment_pending'::public.job_status
      or v_result.payment_status <> 'manual_qr_ready'
      or v_result.final_price <> v_price
      or v_result.already_applied
    then
      raise exception 'service % did not open a manual-bank order: %', v_services[v_index], row_to_json(v_result);
    end if;
    select * into strict v_order from public.job_payment_orders where job_id = v_job;
    select * into strict v_ledger from public.worker_payment_ledger where job_id = v_job;
    select * into strict v_job_row from public.jobs where id = v_job;
    if v_order.payment_method <> 'platform_bank_manual'
      or v_order.status <> 'manual_qr_ready'
      or v_order.gross_amount <> v_price
      or v_order.gross_amount <> v_order.platform_fee + v_order.worker_net
      or v_order.payment_code <> v_code
      or v_order.transfer_content <> v_code
      or v_order.qr_image_url not like '%amount=' || v_price || '&%'
      or v_order.qr_image_url not like '%des=' || v_code
      or v_order.version <> 1
      or v_order.amount_received is not null
      or v_order.verified_by is not null
      or v_ledger.payment_provider <> 'platform_bank_manual'
      or v_ledger.payment_state <> 'pending'
      or v_ledger.gross_amount <> v_price
      or v_job_row.status <> 'payment_pending'::public.job_status
      or v_job_row.payment_provider <> 'platform_bank_manual'
      or v_job_row.payment_status <> 'manual_qr_ready'
      or v_job_row.paid_at is not null
      or v_job_row.payment_amount_received is not null
    then
      raise exception 'service % manual-bank order, ledger or Job projection is wrong', v_services[v_index];
    end if;
  end loop;
  if (select count(*) from public.job_payment_orders where job_id in (
        select id from public.jobs where customer_id = 'd6910000-0000-4000-8000-000000000001')) <> 6
    or exists (
      select 1 from public.job_payment_orders
      where job_id in (select id from public.jobs where customer_id = 'd6910000-0000-4000-8000-000000000001')
        and payment_method <> 'platform_bank_manual')
    or exists (
      select 1 from public.jobs
      where customer_id = 'd6910000-0000-4000-8000-000000000001'
        and payment_provider is not null and payment_provider <> 'platform_bank_manual')
  then
    raise exception 'a service used a payment rail other than platform_bank_manual';
  end if;
end;
$six_services$;

-- 3. A QR on screen is not a payment: the reconciler cannot confirm an order the Customer has not claimed.
do $qr_is_not_payment$
declare
  v_order uuid;
  v_result record;
begin
  select id into strict v_order from public.job_payment_orders where job_id = 'd6910000-0000-4000-8000-000000000101';
  select * into strict v_result from public.admin_claim_payment_reconciliation_atomic(
    'd6910000-0000-4000-8000-000000000004', v_order, 1, 'd6910000-0000-4000-8000-0000000a0001', null);
  if not v_result.ok or v_result.version_out <> 2 then raise exception 'reconciler could not claim the order: %', row_to_json(v_result); end if;
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, 'd6910000-0000-4000-8000-0000000b0001',
    'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if v_result.ok or v_result.error_code <> 'INVALID_STATUS' then
    raise exception 'an unclaimed QR order was confirmed as paid: %', row_to_json(v_result);
  end if;
  if (select status from public.job_payment_orders where id = v_order) <> 'manual_qr_ready'
    or (select status from public.jobs where id = 'd6910000-0000-4000-8000-000000000101') <> 'payment_pending'::public.job_status
    or (select paid_at from public.jobs where id = 'd6910000-0000-4000-8000-000000000101') is not null
    or (select payment_state from public.worker_payment_ledger where job_id = 'd6910000-0000-4000-8000-000000000101') <> 'pending'
  then
    raise exception 'a refused confirmation changed the order, Job or ledger';
  end if;
end;
$qr_is_not_payment$;

-- 4. The Customer can report a transfer, once, without marking the Job paid; nobody else can report it.
do $customer_claim$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000101';
  v_customer constant uuid := 'd6910000-0000-4000-8000-000000000001';
  v_claim record;
begin
  begin
    perform * from public.claim_manual_bank_payment(v_job, 'd6910000-0000-4000-8000-000000000002', now(), 'VCB');
    raise exception 'another Customer reported a transfer';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'JOB_NOT_FOUND' then raise; end if;
  end;
  begin
    perform * from public.claim_manual_bank_payment(v_job, v_customer, now() + interval '1 hour', 'VCB');
    raise exception 'a future transfer time was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;
  select * into strict v_claim from public.claim_manual_bank_payment(v_job, v_customer, now() - interval '5 minutes', 'VCB');
  if v_claim.payment_status <> 'manual_customer_claimed' or v_claim.status <> 'payment_pending'::public.job_status or not v_claim.notification_required then
    raise exception 'the first claim is wrong: %', row_to_json(v_claim);
  end if;
  select * into strict v_claim from public.claim_manual_bank_payment(v_job, v_customer, now() - interval '4 minutes', 'VCB');
  if v_claim.payment_status <> 'manual_customer_claimed' or v_claim.notification_required then
    raise exception 'a duplicate claim was not idempotent: %', row_to_json(v_claim);
  end if;
  if (select count(*) from public.job_events where job_id = v_job and event_type = 'customer_claimed_bank_transfer') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where job_id = v_job and event_type = 'customer_transfer_claimed') <> 1
    or exists (select 1 from public.jobs where id = v_job and (status <> 'payment_pending'::public.job_status or paid_at is not null or payment_status <> 'manual_customer_claimed'))
    or (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'pending'
    or (select status from public.job_payment_orders where job_id = v_job) <> 'manual_customer_claimed'
  then
    raise exception 'a Customer claim paid the Job or duplicated its records';
  end if;
end;
$customer_claim$;

-- 5. Only a finance reconciler decides; the Customer, the Worker, a plain operator and a stranger cannot.
do $authority$
declare
  v_order uuid;
  v_actor uuid;
begin
  select id into strict v_order from public.job_payment_orders where job_id = 'd6910000-0000-4000-8000-000000000101';
  foreach v_actor in array array[
    'd6910000-0000-4000-8000-000000000001'::uuid,
    'd6910000-0000-4000-8000-000000000003'::uuid,
    'd6910000-0000-4000-8000-000000000006'::uuid,
    'd6910000-0000-4000-8000-0000000000ff'::uuid
  ] loop
    begin
      perform * from public.admin_decide_payment_reconciliation_v2(v_actor, v_order, 2, gen_random_uuid(), 'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
      raise exception 'actor % decided a payment reconciliation', v_actor;
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'FINANCE_RECONCILE_REQUIRED' then raise; end if;
    end;
    begin
      perform * from public.admin_claim_payment_reconciliation_atomic(v_actor, v_order, 2, gen_random_uuid(), 'takeover');
      raise exception 'actor % claimed a payment reconciliation', v_actor;
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'FINANCE_RECONCILE_REQUIRED' then raise; end if;
    end;
    begin
      perform * from public.decide_manual_bank_payment_reconciliation(v_order, v_actor, 'confirm', 460000, now() - interval '1 minute', repeat('a', 64), 'REF-0001', null);
      raise exception 'actor % reached the base reconciliation function', v_actor;
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'FINANCE_RECONCILE_REQUIRED' then raise; end if;
    end;
  end loop;
  if (select status from public.job_payment_orders where id = v_order) <> 'manual_customer_claimed'
    or (select assigned_to from public.job_payment_orders where id = v_order) is distinct from 'd6910000-0000-4000-8000-000000000004'::uuid
  then
    raise exception 'an unauthorized actor changed the order';
  end if;
end;
$authority$;

-- 6. The assigned reconciler is the only one who can decide, and only against the current version.
do $assignment$
declare
  v_order uuid;
  v_result record;
begin
  select id into strict v_order from public.job_payment_orders where job_id = 'd6910000-0000-4000-8000-000000000101';
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000005', v_order, 2, gen_random_uuid(), 'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if v_result.ok or v_result.error_code <> 'ASSIGNED_TO_OTHER' then raise exception 'a second reconciler decided an assigned order: %', row_to_json(v_result); end if;
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 1, gen_random_uuid(), 'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if v_result.ok or v_result.error_code <> 'VERSION_CONFLICT' then raise exception 'a stale version decided the order: %', row_to_json(v_result); end if;
  select * into strict v_result from public.admin_claim_payment_reconciliation_atomic(
    'd6910000-0000-4000-8000-000000000005', v_order, 2, gen_random_uuid(), null);
  if v_result.ok or v_result.error_code <> 'TAKEOVER_REASON_REQUIRED' then raise exception 'a takeover without a reason was accepted: %', row_to_json(v_result); end if;
end;
$assignment$;

-- 7. Invalid or incomplete decisions are refused and change nothing; a rejected decision value never pays.
do $invalid_decisions$
declare
  v_order uuid;
  v_case record;
  v_result record;
begin
  select id into strict v_order from public.job_payment_orders where job_id = 'd6910000-0000-4000-8000-000000000101';
  for v_case in
    select * from (values
      ('reject'::text, 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute'),
      ('approve'::text, 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute'),
      ('confirm'::text, 0, repeat('a', 64), 'REF-0001', now() - interval '1 minute'),
      ('confirm'::text, -460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute'),
      ('confirm'::text, 460000, 'not-a-sha256', 'REF-0001', now() - interval '1 minute'),
      ('confirm'::text, 460000, repeat('A', 64), 'REF-0001', now() - interval '1 minute'),
      ('confirm'::text, 460000, repeat('a', 64), 'x', now() - interval '1 minute'),
      ('confirm'::text, 460000, repeat('a', 64), 'REF-0001', now() + interval '1 hour')
    ) as t(decision, amount, hash, suffix, credited)
  loop
    select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
      'd6910000-0000-4000-8000-000000000004', v_order, 2, gen_random_uuid(),
      v_case.decision, v_case.amount, v_case.hash, v_case.suffix, v_case.credited, null);
    if v_result.ok or v_result.error_code <> 'INVALID_INPUT' then
      raise exception 'invalid decision % was not refused: %', v_case, row_to_json(v_result);
    end if;
  end loop;
  if (select status from public.job_payment_orders where id = v_order) <> 'manual_customer_claimed'
    or (select version from public.job_payment_orders where id = v_order) <> 2
    or (select status from public.jobs where id = 'd6910000-0000-4000-8000-000000000101') <> 'payment_pending'::public.job_status
  then
    raise exception 'an invalid decision changed the order or the Job';
  end if;
end;
$invalid_decisions$;

-- 8. An incorrect amount goes to reconciliation and never becomes paid.
do $wrong_amount$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000103';
  v_order uuid;
  v_result record;
begin
  perform * from public.claim_manual_bank_payment(v_job, 'd6910000-0000-4000-8000-000000000001', now() - interval '6 minutes', 'VCB');
  select id into strict v_order from public.job_payment_orders where job_id = v_job;
  select * into strict v_result from public.admin_claim_payment_reconciliation_atomic(
    'd6910000-0000-4000-8000-000000000004', v_order, 1, gen_random_uuid(), null);
  if not v_result.ok or v_result.version_out <> 2 then raise exception 'reconciler could not claim the order: %', row_to_json(v_result); end if;
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, gen_random_uuid(),
    'confirm', 479999, repeat('c', 64), 'REF-0003', now() - interval '1 minute', null);
  if not v_result.ok or v_result.outcome <> 'reconcile_required' or v_result.payment_status <> 'manual_reconcile_required' or v_result.status <> 'payment_pending' then
    raise exception 'a short payment was not routed to reconciliation: %', row_to_json(v_result);
  end if;
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 3, gen_random_uuid(),
    'confirm', 480001, repeat('c', 64), 'REF-0003', now() - interval '1 minute', null);
  if not v_result.ok or v_result.outcome <> 'reconcile_required' then
    raise exception 'an over payment was not routed to reconciliation: %', row_to_json(v_result);
  end if;
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 4, gen_random_uuid(),
    'reconcile_required', 480001, repeat('c', 64), 'REF-0003', now() - interval '1 minute', 'bank_statement_unclear');
  if not v_result.ok or v_result.outcome <> 'reconcile_required' then
    raise exception 'an explicit reconcile_required decision was not honoured: %', row_to_json(v_result);
  end if;
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 5, gen_random_uuid(),
    'reconcile_required', 480000, repeat('c', 64), 'REF-0003', now() - interval '1 minute', 'bank_statement_unclear');
  if v_result.ok or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'a conflicting reconcile_required replay was accepted: %', row_to_json(v_result);
  end if;
  if exists (select 1 from public.jobs where id = v_job and (status <> 'payment_pending'::public.job_status or paid_at is not null or payment_status <> 'manual_reconcile_required' or payment_amount_received is distinct from 480001))
    or exists (select 1 from public.job_events where job_id = v_job and event_type = 'payment_confirmed')
    or exists (select 1 from public.job_payment_orders where id = v_order and (status <> 'manual_reconcile_required' or verified_by is null))
  then
    raise exception 'an incorrect amount marked the Job paid';
  end if;
  if (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'reversed'
    or (select settlement_state from public.worker_payment_ledger where job_id = v_job) <> 'admin_rejected'
    or (select available_at from public.worker_payment_ledger where job_id = v_job) is not null
  then
    raise exception 'an incorrect amount left a Worker credit that is not reversed: %', (select row_to_json(l) from public.worker_payment_ledger l where job_id = v_job);
  end if;

end;
$wrong_amount$;

-- 9. The exact amount with an unused reference pays once: Job paid, order verified, Worker credit held, immutable trail.
do $verified$
declare
  v_order uuid;
  v_result record;
  v_replay record;
  v_ledger record;
begin
  select id into strict v_order from public.job_payment_orders where job_id = 'd6910000-0000-4000-8000-000000000101';
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, 'd6910000-0000-4000-8000-0000000b0005',
    'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if not v_result.ok or v_result.outcome <> 'paid' or v_result.status <> 'paid' or v_result.payment_status <> 'manual_verified'
    or v_result.hold_until < now() + interval '23 hours 59 minutes' or v_result.hold_until > now() + interval '24 hours 1 minute'
  then
    raise exception 'the exact payment was not verified: %', row_to_json(v_result);
  end if;
  select * into strict v_ledger from public.worker_payment_ledger where job_id = 'd6910000-0000-4000-8000-000000000101';
  if v_ledger.payment_state <> 'on_hold' or v_ledger.worker_net <> 414000 or v_ledger.platform_fee <> 46000
    or v_ledger.available_at is distinct from v_result.hold_until
  then
    raise exception 'the Worker credit is wrong: %', row_to_json(v_ledger);
  end if;
  if exists (select 1 from public.jobs where id = 'd6910000-0000-4000-8000-000000000101'
        and (status <> 'paid'::public.job_status or paid_at is null or payment_status <> 'manual_verified' or payment_amount_received <> 460000))
    or exists (select 1 from public.job_payment_orders where id = v_order
        and (status <> 'manual_verified' or amount_received <> 460000 or verified_by <> 'd6910000-0000-4000-8000-000000000004' or bank_reference_hash <> repeat('a', 64)))
    or (select count(*) from public.job_events where job_id = 'd6910000-0000-4000-8000-000000000101' and event_type = 'payment_confirmed'
        and actor_id = 'd6910000-0000-4000-8000-000000000004' and actor_role = 'admin'::public.user_role
        and from_status = 'payment_pending'::public.job_status and to_status = 'paid'::public.job_status) <> 1
    or (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order and event_type = 'manual_payment_verified') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order and event_type = 'customer_transfer_claimed') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order and event_type = 'manual_reconcile_required') <> 0
  then
    raise exception 'the verified payment left an incomplete or duplicated record';
  end if;

  select * into strict v_replay from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, 'd6910000-0000-4000-8000-0000000b0005',
    'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if not v_replay.ok or v_replay.outcome <> 'paid' or v_replay.event_id_out is distinct from v_result.event_id_out or v_replay.version_out <> v_result.version_out then
    raise exception 'a replay with the same request id was not idempotent: %', row_to_json(v_replay);
  end if;
  select * into strict v_replay from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, gen_random_uuid(),
    'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if v_replay.ok or v_replay.error_code <> 'VERSION_CONFLICT' then
    raise exception 'a replay with a new request id and a stale version was accepted: %', row_to_json(v_replay);
  end if;
  select * into strict v_replay from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 3, gen_random_uuid(),
    'confirm', 460000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if not v_replay.ok or v_replay.outcome <> 'paid' then
    raise exception 'an equivalent confirmation of a paid order was not idempotent: %', row_to_json(v_replay);
  end if;
  select * into strict v_replay from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 4, gen_random_uuid(),
    'confirm', 999999, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if v_replay.ok or v_replay.error_code <> 'INVALID_INPUT' then
    raise exception 'a different amount was accepted for a paid order: %', row_to_json(v_replay);
  end if;
  if (select count(*) from public.job_events where job_id = 'd6910000-0000-4000-8000-000000000101' and event_type = 'payment_confirmed') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order and event_type = 'manual_payment_verified') <> 1
    or (select count(*) from public.worker_payment_ledger where job_id = 'd6910000-0000-4000-8000-000000000101') <> 1
  then
    raise exception 'replays duplicated the payment records';
  end if;
end;
$verified$;

-- 9b. An order sent to reconciliation by a wrong amount is confirmed on the exact amount: the reversed Worker credit is reopened, then held.
do $recovery$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000104';
  v_order uuid;
  v_result record;
  v_replay record;
  v_ledger record;
begin
  perform * from public.claim_manual_bank_payment(v_job, 'd6910000-0000-4000-8000-000000000001', now() - interval '7 minutes', 'VCB');
  select id into strict v_order from public.job_payment_orders where job_id = v_job;
  perform * from public.admin_claim_payment_reconciliation_atomic('d6910000-0000-4000-8000-000000000004', v_order, 1, gen_random_uuid(), null);
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, gen_random_uuid(),
    'confirm', 489999, repeat('7', 64), 'REF-0004', now() - interval '1 minute', null);
  if not v_result.ok or v_result.outcome <> 'reconcile_required' then
    raise exception 'a short payment was not routed to reconciliation: %', row_to_json(v_result);
  end if;
  if (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'reversed'
    or (select status from public.jobs where id = v_job) <> 'payment_pending'::public.job_status
    or exists (select 1 from public.job_events where job_id = v_job and event_type = 'payment_confirmed')
  then
    raise exception 'the reconciliation state is not the expected starting point';
  end if;

  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 3, 'd6910000-0000-4000-8000-0000000b0007',
    'confirm', 490000, repeat('7', 64), 'REF-0004', now() - interval '1 minute', null);
  if not v_result.ok or v_result.outcome <> 'paid' or v_result.status <> 'paid' or v_result.payment_status <> 'manual_verified'
    or v_result.hold_until < now() + interval '23 hours 59 minutes' or v_result.hold_until > now() + interval '24 hours 1 minute'
  then
    raise exception 'the exact payment after reconciliation was not verified: %', row_to_json(v_result);
  end if;
  select * into strict v_ledger from public.worker_payment_ledger where job_id = v_job;
  if v_ledger.payment_state <> 'on_hold' or v_ledger.settlement_state <> 'admin_verified'
    or v_ledger.platform_fee <> 49000 or v_ledger.worker_net <> 441000 or v_ledger.available_at is distinct from v_result.hold_until
  then
    raise exception 'the reopened Worker credit is wrong: %', row_to_json(v_ledger);
  end if;
  if exists (select 1 from public.jobs where id = v_job
        and (status <> 'paid'::public.job_status or paid_at is null or payment_status <> 'manual_verified' or payment_amount_received <> 490000 or payment_failure_reason is not null))
    or exists (select 1 from public.job_payment_orders where id = v_order
        and (status <> 'manual_verified' or amount_received <> 490000 or verified_by <> 'd6910000-0000-4000-8000-000000000004' or bank_reference_hash <> repeat('7', 64)))
    or (select count(*) from public.job_events where job_id = v_job and event_type = 'payment_confirmed') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order and event_type = 'customer_transfer_claimed') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order and event_type = 'manual_reconcile_required') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order and event_type = 'manual_payment_verified' and safe_metadata ->> 'ledger_reopened' = 'true') <> 1
  then
    raise exception 'the recovered payment left an incomplete or duplicated record';
  end if;

  select * into strict v_replay from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 3, 'd6910000-0000-4000-8000-0000000b0007',
    'confirm', 490000, repeat('7', 64), 'REF-0004', now() - interval '1 minute', null);
  if not v_replay.ok or v_replay.outcome <> 'paid' or v_replay.event_id_out is distinct from v_result.event_id_out then
    raise exception 'a replay of the recovering decision was not idempotent: %', row_to_json(v_replay);
  end if;
  select * into strict v_replay from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 4, gen_random_uuid(),
    'confirm', 490000, repeat('7', 64), 'REF-0004', now() - interval '1 minute', null);
  if not v_replay.ok or v_replay.outcome <> 'paid' then
    raise exception 'an equivalent confirmation of the recovered order was not idempotent: %', row_to_json(v_replay);
  end if;
  select * into strict v_replay from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 5, gen_random_uuid(),
    'confirm', 489999, repeat('7', 64), 'REF-0004', now() - interval '1 minute', null);
  if v_replay.ok or v_replay.error_code <> 'INVALID_INPUT' then
    raise exception 'a different amount was accepted for the recovered order: %', row_to_json(v_replay);
  end if;
  if (select count(*) from public.job_events where job_id = v_job and event_type = 'payment_confirmed') <> 1
    or (select count(*) from public.worker_payment_ledger where job_id = v_job) <> 1
    or (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'on_hold'
  then
    raise exception 'replays duplicated or moved the recovered payment';
  end if;
end;
$recovery$;

-- 9c. A reversed Worker credit under an order that never went to reconciliation is not reopened.
do $guarded_reopen_setup$
begin
  perform * from public.claim_manual_bank_payment('d6910000-0000-4000-8000-000000000105', 'd6910000-0000-4000-8000-000000000001', now() - interval '8 minutes', 'VCB');
  perform * from public.admin_claim_payment_reconciliation_atomic('d6910000-0000-4000-8000-000000000004',
    (select id from public.job_payment_orders where job_id = 'd6910000-0000-4000-8000-000000000105'), 1, gen_random_uuid(), null);
end;
$guarded_reopen_setup$;
reset role;
update public.worker_payment_ledger set payment_state = 'reversed', settlement_state = 'admin_rejected', available_at = null
where job_id = 'd6910000-0000-4000-8000-000000000105';
set local role service_role;
do $guarded_reopen$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000105';
  v_result record;
begin
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', (select id from public.job_payment_orders where job_id = v_job), 2, gen_random_uuid(),
    'confirm', 500000, repeat('8', 64), 'REF-0005', now() - interval '1 minute', null);
  if v_result.ok or v_result.error_code <> 'WORKER_LEDGER_INVALID' then
    raise exception 'a reversed credit under a claimed order was reopened: %', row_to_json(v_result);
  end if;
  if (select status from public.jobs where id = v_job) <> 'payment_pending'::public.job_status
    or (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'reversed'
    or (select status from public.job_payment_orders where job_id = v_job) <> 'manual_customer_claimed'
  then
    raise exception 'the refused reopen changed state';
  end if;
end;
$guarded_reopen$;

-- 9d. A credit reversed for another reason than the reconciliation decision is not reopened either, even under an order in reconciliation.
do $guarded_reopen_reason_setup$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000106';
  v_order uuid;
  v_result record;
begin
  perform * from public.claim_manual_bank_payment(v_job, 'd6910000-0000-4000-8000-000000000001', now() - interval '9 minutes', 'VCB');
  select id into strict v_order from public.job_payment_orders where job_id = v_job;
  perform * from public.admin_claim_payment_reconciliation_atomic('d6910000-0000-4000-8000-000000000004', v_order, 1, gen_random_uuid(), null);
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, gen_random_uuid(),
    'confirm', 509999, repeat('6', 64), 'REF-0006', now() - interval '1 minute', null);
  if not v_result.ok or v_result.outcome <> 'reconcile_required' then
    raise exception 'a short payment was not routed to reconciliation: %', row_to_json(v_result);
  end if;
end;
$guarded_reopen_reason_setup$;
reset role;
update public.worker_payment_ledger set settlement_state = 'customer_claimed' where job_id = 'd6910000-0000-4000-8000-000000000106';
set local role service_role;
do $guarded_reopen_reason$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000106';
  v_result record;
begin
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', (select id from public.job_payment_orders where job_id = v_job), 3, gen_random_uuid(),
    'confirm', 510000, repeat('6', 64), 'REF-0006', now() - interval '1 minute', null);
  if v_result.ok or v_result.error_code <> 'WORKER_LEDGER_INVALID' then
    raise exception 'a credit reversed for another reason was reopened: %', row_to_json(v_result);
  end if;
  if (select status from public.jobs where id = v_job) <> 'payment_pending'::public.job_status
    or (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'reversed'
    or (select status from public.job_payment_orders where job_id = v_job) <> 'manual_reconcile_required'
  then
    raise exception 'the refused reopen changed state';
  end if;
end;
$guarded_reopen_reason$;

-- 10. A bank reference that already paid one order cannot pay another, in the function and in the index.
do $reference_reuse$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000102';
  v_order uuid;
  v_result record;
begin
  perform * from public.claim_manual_bank_payment(v_job, 'd6910000-0000-4000-8000-000000000001', now() - interval '3 minutes', 'VCB');
  select id into strict v_order from public.job_payment_orders where job_id = v_job;
  perform * from public.admin_claim_payment_reconciliation_atomic('d6910000-0000-4000-8000-000000000004', v_order, 1, gen_random_uuid(), null);
  select * into strict v_result from public.admin_decide_payment_reconciliation_v2(
    'd6910000-0000-4000-8000-000000000004', v_order, 2, gen_random_uuid(),
    'confirm', 470000, repeat('a', 64), 'REF-0001', now() - interval '1 minute', null);
  if v_result.ok or v_result.error_code <> 'BANK_REFERENCE_USED' then
    raise exception 'a reused bank reference was accepted: %', row_to_json(v_result);
  end if;
  if (select status from public.jobs where id = v_job) <> 'payment_pending'::public.job_status
    or (select status from public.job_payment_orders where id = v_order) <> 'manual_customer_claimed'
  then
    raise exception 'a refused reference reuse changed the second order';
  end if;
end;
$reference_reuse$;

reset role;
do $reference_index$
begin
  begin
    update public.job_payment_orders set bank_reference_hash = repeat('a', 64) where job_id = 'd6910000-0000-4000-8000-000000000102';
    raise exception 'the unique bank-reference index accepted a duplicate';
  exception when unique_violation then null;
  end;
end;
$reference_index$;

-- 11. The audit trail is immutable, even for the owner of the table.
do $immutable_events$
declare
  v_order uuid;
begin
  select id into strict v_order from public.job_payment_orders where job_id = 'd6910000-0000-4000-8000-000000000101';
  begin
    update public.job_payment_reconciliation_events set reason_code = 'tampered' where payment_order_id = v_order;
    raise exception 'a reconciliation event was updated';
  exception when others then
    if sqlerrm like 'a reconciliation event was updated' then raise; end if;
  end;
  begin
    delete from public.job_payment_reconciliation_events where payment_order_id = v_order;
    raise exception 'a reconciliation event was deleted';
  exception when others then
    if sqlerrm like 'a reconciliation event was deleted' then raise; end if;
  end;
  if (select count(*) from public.job_payment_reconciliation_events where payment_order_id = v_order) <> 3 then
    raise exception 'the reconciliation trail changed: %', (select array_agg(event_type order by created_at, id) from public.job_payment_reconciliation_events where payment_order_id = v_order);
  end if;
end;
$immutable_events$;

-- 12. The Worker credit is released only after the hold, once.
set local role service_role;
do $hold_release$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000101';
  v_result record;
begin
  select * into strict v_result from public.maintain_manual_bank_payment_holds(10);
  if v_result.released_count <> 0 or (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'on_hold' then
    raise exception 'the Worker credit was released during the hold: %', row_to_json(v_result);
  end if;
end;
$hold_release$;
reset role;
update public.worker_payment_ledger set available_at = now() - interval '1 minute' where job_id = 'd6910000-0000-4000-8000-000000000101';
set local role service_role;
do $hold_release_after$
declare
  v_job constant uuid := 'd6910000-0000-4000-8000-000000000101';
  v_result record;
begin
  select * into strict v_result from public.maintain_manual_bank_payment_holds(10);
  if v_result.released_count <> 1 or (select payment_state from public.worker_payment_ledger where job_id = v_job) <> 'available' then
    raise exception 'the Worker credit was not released after the hold: %', row_to_json(v_result);
  end if;
  select * into strict v_result from public.maintain_manual_bank_payment_holds(10);
  if v_result.released_count <> 0
    or (select count(*) from public.job_payment_reconciliation_events where job_id = v_job and event_type = 'worker_credit_released') <> 1
    or exists (select 1 from public.worker_payment_ledger where job_id <> v_job and payment_state = 'available')
  then
    raise exception 'the hold release repeated or reached another Worker credit';
  end if;
end;
$hold_release_after$;

-- 13. Nothing but jobs 1 and 4 is paid.
do $only_one_paid$
begin
  if (select count(*) from public.jobs where customer_id = 'd6910000-0000-4000-8000-000000000001' and status = 'paid'::public.job_status) <> 2
    or exists (select 1 from public.jobs where customer_id = 'd6910000-0000-4000-8000-000000000001' and id not in ('d6910000-0000-4000-8000-000000000101', 'd6910000-0000-4000-8000-000000000104') and paid_at is not null)
  then
    raise exception 'a Job other than the two verified ones is paid';
  end if;
end;
$only_one_paid$;

-- 13b. The SePay webhook, even with a manual order's payment code and exact amount, never pays a manual-bank order.
reset role;
do $sepay_cannot_pay_manual$
declare
  v_result record;
begin
  select * into strict v_result from public.apply_sepay_vietqr_payment_webhook('NS000000000000000000000002', '123456789012', 470000, 'REF-SEPAY');
  if v_result.outcome <> 'ignored' or v_result.job_id is not null then
    raise exception 'the SePay webhook acted on a manual-bank order: %', row_to_json(v_result);
  end if;
  if (select status from public.jobs where id = 'd6910000-0000-4000-8000-000000000102') <> 'payment_pending'::public.job_status
    or (select payment_status from public.jobs where id = 'd6910000-0000-4000-8000-000000000102') <> 'manual_customer_claimed'
    or (select sepay_transaction_id from public.jobs where id = 'd6910000-0000-4000-8000-000000000102') is not null
  then
    raise exception 'the SePay webhook changed a manual-bank Job';
  end if;
end;
$sepay_cannot_pay_manual$;

-- 14. No Customer, Worker, Admin or anonymous caller can bypass the rail through the API roles.
reset role;
do $bypass$
declare
  v_actor uuid;
  v_role text;
  v_blocked boolean;
  v_rows integer;
  v_function regprocedure;
  v_actors constant uuid[] := array[
    'd6910000-0000-4000-8000-000000000001'::uuid,
    'd6910000-0000-4000-8000-000000000003'::uuid,
    'd6910000-0000-4000-8000-000000000004'::uuid
  ];
  v_target constant uuid := 'd6910000-0000-4000-8000-000000000103';
begin
  foreach v_function in array array[
    'public.confirm_completion_manual_bank_atomic(uuid,uuid,text,integer,text,text,text,timestamptz)'::regprocedure,
    'public.create_manual_bank_payment_order(uuid,uuid,integer,text,text,text,timestamptz)'::regprocedure,
    'public.claim_manual_bank_payment(uuid,uuid,timestamptz,text)'::regprocedure,
    'public.decide_manual_bank_payment_reconciliation(uuid,uuid,text,integer,timestamptz,text,text,text)'::regprocedure,
    'public.decide_manual_bank_payment_reconciliation_idempotent(uuid,uuid,text,integer,timestamptz,text,text,text)'::regprocedure,
    'public.admin_decide_payment_reconciliation_v2(uuid,uuid,integer,uuid,text,integer,text,text,timestamptz,text)'::regprocedure,
    'public.admin_claim_payment_reconciliation_atomic(uuid,uuid,integer,uuid,text)'::regprocedure,
    'public.maintain_manual_bank_payment_holds(integer)'::regprocedure
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_function, 'execute') then
        raise exception 'role % can execute %', v_role, v_function;
      end if;
    end loop;
  end loop;

  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.job_payment_orders', 'insert,update,delete')
      or has_table_privilege(v_role, 'public.job_payment_reconciliation_events', 'insert,update,delete')
      or has_table_privilege(v_role, 'public.worker_payment_ledger', 'insert,update,delete')
      or has_table_privilege(v_role, 'public.completion_payment_operations', 'insert,update,delete')
    then
      raise exception 'role % can write a payment table directly', v_role;
    end if;
  end loop;

  foreach v_actor in array v_actors loop
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_blocked := false;
    begin
      update public.jobs set status = 'paid'::public.job_status, payment_status = 'manual_verified', paid_at = now(), payment_amount_received = final_price where id = v_target;
      get diagnostics v_rows = row_count;
      v_blocked := v_rows = 0;
    exception when insufficient_privilege then v_blocked := true;
    end;
    reset role;
    if not v_blocked or (select status from public.jobs where id = v_target) = 'paid'::public.job_status then
      raise exception 'actor % marked a Job paid through the table API', v_actor;
    end if;

    set local role authenticated;
    v_blocked := false;
    begin
      update public.job_payment_orders set status = 'manual_verified', amount_received = gross_amount where job_id = v_target;
      get diagnostics v_rows = row_count;
      v_blocked := v_rows = 0;
    exception when insufficient_privilege then v_blocked := true;
    end;
    reset role;
    if not v_blocked or (select status from public.job_payment_orders where job_id = v_target) = 'manual_verified' then
      raise exception 'actor % verified an order through the table API', v_actor;
    end if;
  end loop;

  set local role anon;
  v_blocked := false;
  begin
    update public.jobs set status = 'paid'::public.job_status where id = v_target;
    get diagnostics v_rows = row_count;
    v_blocked := v_rows = 0;
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked or (select status from public.jobs where id = v_target) = 'paid'::public.job_status then
    raise exception 'an anonymous caller marked a Job paid';
  end if;
end;
$bypass$;

-- 15. Final global assertion: only the two verified orders are manual_verified and credited.
do $final$
begin
  if (select count(*) from public.job_payment_orders where status = 'manual_verified' and customer_id = 'd6910000-0000-4000-8000-000000000001') <> 2
    or (select count(*) from public.worker_payment_ledger where job_id in (select id from public.jobs where customer_id = 'd6910000-0000-4000-8000-000000000001') and payment_state in ('available', 'on_hold')) <> 2
  then
    raise exception 'an order other than the two verified ones was verified or credited';
  end if;
end;
$final$;

rollback;

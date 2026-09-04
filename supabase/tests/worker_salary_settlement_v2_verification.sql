-- Rollback-only contract proof for provisional salary, Admin cash decisions,
-- and server-owned withdrawal eligibility.
begin;

do $verification$
declare
  payment_order_constraint text;
  job_status_constraint text;
  ledger_constraint text;
  acknowledgement_definition text;
  earnings_definition text;
  admin_snapshot_definition text;
  cash_definition text;
  direct_definition text;
  settlement_sync_definition text;
  idempotent_definition text;
  withdrawal_definition text;
begin
  select pg_get_constraintdef(oid) into payment_order_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.job_payment_orders'::regclass
    and conname = 'job_payment_orders_status_check';
  if payment_order_constraint is null or position('direct_admin_confirmation_required' in payment_order_constraint) = 0 then
    raise exception 'direct Admin confirmation status is missing from payment orders';
  end if;

  select pg_get_constraintdef(oid) into job_status_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.jobs'::regclass
    and conname = 'jobs_payment_status_check';
  if job_status_constraint is null or position('direct_admin_confirmation_required' in job_status_constraint) = 0 then
    raise exception 'direct Admin confirmation status is missing from jobs';
  end if;

  select pg_get_constraintdef(oid) into ledger_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.worker_payment_ledger'::regclass
    and conname = 'worker_payment_ledger_settlement_state_check';
  if ledger_constraint is null or position('customer_claimed' in ledger_constraint) = 0 or position('admin_verified' in ledger_constraint) = 0 then
    raise exception 'Worker ledger settlement states are incomplete';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.worker_payment_ledger'::regclass
      and attname = 'settlement_state'
      and not attisdropped
  ) then
    raise exception 'worker_payment_ledger settlement_state is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.worker_withdrawal_requests'::regclass
      and attname = 'eligible_at'
      and not attisdropped
  ) then
    raise exception 'worker withdrawal eligible_at is missing';
  end if;

  select pg_get_functiondef('public.recognize_customer_payment_claim(uuid,uuid)'::regprocedure) into earnings_definition;
  if position('customer_claimed' in earnings_definition) = 0 or position('salary_visible' in earnings_definition) = 0 then
    raise exception 'customer claim RPC does not expose provisional salary state';
  end if;
  if position('admin_rejected' in earnings_definition) = 0 or position('payment_state = ''reversed''' in earnings_definition) = 0 then
    raise exception 'rejected online claims do not reverse provisional salary';
  end if;
  if position('where job_id = v_job.id' in earnings_definition) > 0
    or position('where id = v_job.id' in earnings_definition) > 0
    or position('and status = ''payment_pending''::public.job_status' in earnings_definition) > 0
  then
    raise exception 'customer claim RPC has an ambiguous ledger or job target';
  end if;

  select pg_get_functiondef('public.acknowledge_worker_cash_payment(uuid,uuid,boolean)'::regprocedure) into acknowledgement_definition;
  if position('where id = v_job.id' in acknowledgement_definition) > 0
    or position('and status = ''payment_pending''::public.job_status' in acknowledgement_definition) > 0
  then
    raise exception 'Worker cash acknowledgement has an ambiguous job target';
  end if;

  select pg_get_functiondef('public.get_admin_worker_finance_snapshot(uuid,uuid,timestamptz,timestamptz,numeric)'::regprocedure) into admin_snapshot_definition;
  if position('assert_finance_reader' in admin_snapshot_definition) = 0 or position('get_worker_earnings_summary_v2' in admin_snapshot_definition) = 0 then
    raise exception 'Admin Worker finance snapshot is not protected by the finance reader boundary';
  end if;

  select pg_get_functiondef('public.decide_cash_payment_reconciliation(uuid,uuid,text,text)'::regprocedure) into cash_definition;
  if position('cash_commission_due' in cash_definition) = 0
    or position('admin_verified' in cash_definition) = 0
    or position('v_job.worker_commission_level' in cash_definition) = 0
    or position('v_job.worker_commission_rate_bps' in cash_definition) = 0
    or position('on conflict on constraint worker_cash_commission_ledger_job_id_key do nothing' in cash_definition) = 0
    or position('and status = ''held''' in cash_definition) > 0
    or position('where job_id = v_job.id' in cash_definition) > 0
  then
    raise exception 'cash reconciliation RPC does not preserve frozen terms and an unambiguous ledger write';
  end if;

  select pg_get_functiondef('public.select_direct_worker_payment(uuid,uuid,text)'::regprocedure) into direct_definition;
  if position('direct_admin_confirmation_required' in direct_definition) = 0 then
    raise exception 'repeat direct selection does not expose Admin confirmation';
  end if;
  if position('private.resolve_job_commission_terms' in direct_definition) = 0
    or position('v_tier.commission_rate_bps' in direct_definition) = 0
    or position('0.15' in direct_definition) > 0
  then
    raise exception 'direct selection does not use the frozen commission tier';
  end if;

  select pg_get_functiondef('private.sync_worker_payment_settlement_state()'::regprocedure) into settlement_sync_definition;
  if position('v_job.worker_commission_level' in settlement_sync_definition) = 0
    or position('v_job.worker_commission_rate_bps' in settlement_sync_definition) = 0
  then
    raise exception 'settlement trigger does not preserve frozen commission terms';
  end if;

  select pg_get_functiondef(
    'public.decide_manual_bank_payment_reconciliation_idempotent(uuid,uuid,text,integer,timestamptz,text,text,text)'::regprocedure
  ) into idempotent_definition;
  if position('private.assert_finance_reconciler' in idempotent_definition) = 0
    or position('is not distinct from p_amount_received' in idempotent_definition) = 0
    or position('exception when others' in lower(idempotent_definition)) > 0
    or position('private.assert_finance_reconciler' in idempotent_definition)
      > position('from public.decide_manual_bank_payment_reconciliation' in lower(idempotent_definition))
  then
    raise exception 'manual-bank idempotency does not fail closed on actor or snapshot mismatch';
  end if;

  select pg_get_functiondef('private.enforce_worker_withdrawal_eligibility()'::regprocedure) into withdrawal_definition;
  if position('WITHDRAWAL_NOT_ELIGIBLE' in withdrawal_definition) = 0 or position('24 hours' in lower(withdrawal_definition)) = 0 then
    raise exception 'withdrawal eligibility guard is not fail-closed';
  end if;

  if to_regprocedure('public.confirm_worker_cash_payment(uuid,uuid)') is not null
    and has_function_privilege('service_role', 'public.confirm_worker_cash_payment(uuid,uuid)', 'execute') then
    raise exception 'legacy unilateral cash confirmation is executable';
  end if;

  if not has_function_privilege('service_role', 'public.decide_cash_payment_reconciliation(uuid,uuid,text,text)', 'execute') then
    raise exception 'service role cannot execute Admin cash reconciliation';
  end if;
  if has_function_privilege('authenticated', 'public.decide_cash_payment_reconciliation(uuid,uuid,text,text)', 'execute') then
    raise exception 'authenticated users can execute Admin cash reconciliation';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.decide_manual_bank_payment_reconciliation_idempotent(uuid,uuid,text,integer,timestamptz,text,text,text)',
    'execute'
  ) then
    raise exception 'service role cannot execute manual-bank idempotent reconciliation';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.decide_manual_bank_payment_reconciliation_idempotent(uuid,uuid,text,integer,timestamptz,text,text,text)',
    'execute'
  ) then
    raise exception 'authenticated users can execute manual-bank idempotent reconciliation';
  end if;
  if not has_function_privilege('service_role', 'public.get_admin_worker_finance_snapshot(uuid,uuid,timestamptz,timestamptz,numeric)', 'execute') then
    raise exception 'service role cannot read Admin Worker finance snapshots';
  end if;
  if has_function_privilege('authenticated', 'public.get_admin_worker_finance_snapshot(uuid,uuid,timestamptz,timestamptz,numeric)', 'execute') then
    raise exception 'authenticated users can read Admin Worker finance snapshots';
  end if;
end;
$verification$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'b7600000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'salary-admin@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin"}'::jsonb, now(), now()
  ),
  (
    'b7600000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'salary-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"customer"}'::jsonb, now(), now()
  ),
  (
    'b7600000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'salary-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"worker"}'::jsonb, now(), now()
  ),
  (
    'b7600000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'salary-outsider@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"customer"}'::jsonb, now(), now()
  );

update public.profiles
set role = 'admin'::public.user_role
where id = 'b7600000-0000-4000-8000-000000000001';

update public.profiles
set role = 'worker'::public.user_role
where id = 'b7600000-0000-4000-8000-000000000003';

insert into public.customer_profiles (id, building_name, unit_number, district)
values (
  'b7600000-0000-4000-8000-000000000002',
  'Salary Verification Building', 'A-01', 'q7'
)
on conflict (id) do update
set building_name = excluded.building_name,
    unit_number = excluded.unit_number,
    district = excluded.district;

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'b7600000-0000-4000-8000-000000000003',
  array['plumbing']::public.service_type[], array['q7'], true, true, 4.9, 120,
  'approved', false, 'Salary Verification Worker', '1990-01-01'
);

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, gross_amount, platform_fee, worker_net,
  worker_commission_level, worker_commission_rate_bps,
  payment_provider, payment_status, display_code, created_at
) values
  (
    'b7610000-0000-4000-8000-000000000001',
    'b7600000-0000-4000-8000-000000000002',
    'b7600000-0000-4000-8000-000000000003',
    'plumbing', 'Available balance fixture', 'paid',
    500000, 500000, 50000, 450000, 2, 1000,
    'sepay_vietqr', 'received', 'SLR-0001', '2001-08-13T00:00:00Z'
  ),
  (
    'b7610000-0000-4000-8000-000000000002',
    'b7600000-0000-4000-8000-000000000002',
    'b7600000-0000-4000-8000-000000000003',
    'plumbing', 'Direct tier fixture', 'confirmed_by_customer',
    200000, null, null, null, 2, 1000,
    null, 'not_started', 'SLR-0002', '2001-08-13T00:00:00Z'
  ),
  (
    'b7610000-0000-4000-8000-000000000003',
    'b7600000-0000-4000-8000-000000000002',
    'b7600000-0000-4000-8000-000000000003',
    'plumbing', 'Manual idempotency fixture', 'payment_pending',
    100000, 100000, 10000, 90000, 2, 1000,
    'platform_bank_manual', 'manual_customer_claimed', 'SLR-0003',
    '2001-08-13T00:00:00Z'
  );

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state, settlement_state,
  gross_amount, platform_fee, worker_net, commission_level,
  commission_rate_bps, available_at
) values (
  'b7610000-0000-4000-8000-000000000001',
  'b7600000-0000-4000-8000-000000000003',
  'sepay_vietqr', 'available', 'admin_verified',
  500000, 50000, 450000, 2, 1000, '2001-08-13T00:00:00Z'
);

insert into public.job_payment_orders (
  id, job_id, customer_id, worker_id, payment_method, status,
  gross_amount, platform_fee, worker_net, payment_code, transfer_content,
  qr_image_url
) values (
  'b7620000-0000-4000-8000-000000000003',
  'b7610000-0000-4000-8000-000000000003',
  'b7600000-0000-4000-8000-000000000002',
  'b7600000-0000-4000-8000-000000000003',
  'platform_bank_manual', 'manual_customer_claimed',
  100000, 10000, 90000,
  'NSBBBBBBBBBBBBBBBBBBBBBBBB',
  'NSBBBBBBBBBBBBBBBBBBBBBBBB',
  'https://example.test/salary-manual-qr.png'
);

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state, settlement_state,
  gross_amount, platform_fee, worker_net, commission_level,
  commission_rate_bps
) values (
  'b7610000-0000-4000-8000-000000000003',
  'b7600000-0000-4000-8000-000000000003',
  'platform_bank_manual', 'pending', 'customer_claimed',
  100000, 10000, 90000, 2, 1000
);

do $direct_tier_behavior$
declare
  v_result record;
  v_order public.job_payment_orders%rowtype;
  v_job public.jobs%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_worker_ledger public.worker_payment_ledger%rowtype;
  v_cash_ledger public.worker_cash_commission_ledger%rowtype;
begin
  select * into strict v_result
  from public.select_direct_worker_payment(
    'b7610000-0000-4000-8000-000000000002',
    'b7600000-0000-4000-8000-000000000002',
    'salary-tier-direct-selection'
  );
  if not v_result.ok or v_result.collateral_amount <> 20000 then
    raise exception 'direct selection did not apply frozen 10 percent commission: %', row_to_json(v_result);
  end if;

  select payment_order.* into strict v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = 'b7610000-0000-4000-8000-000000000002';
  select job.* into strict v_job
  from public.jobs as job
  where job.id = 'b7610000-0000-4000-8000-000000000002';
  select reservation.* into strict v_reservation
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.job_id = v_job.id;
  if v_order.platform_fee <> 20000
    or v_order.worker_net <> 180000
    or v_job.worker_commission_level <> 2
    or v_job.worker_commission_rate_bps <> 1000
    or v_reservation.collateral_amount <> 20000
  then
    raise exception 'direct selection did not freeze a consistent tier-two snapshot';
  end if;

  update public.job_payment_orders
  set status = 'direct_admin_confirmation_required'
  where id = v_order.id;

  select ledger.* into strict v_worker_ledger
  from public.worker_payment_ledger as ledger
  where ledger.job_id = v_job.id;
  if v_worker_ledger.commission_level <> 2
    or v_worker_ledger.commission_rate_bps <> 1000
    or v_worker_ledger.platform_fee <> 20000
    or v_worker_ledger.worker_net <> 180000
    or v_worker_ledger.settlement_state <> 'customer_claimed'
  then
    raise exception 'provisional direct salary lost its frozen commission snapshot';
  end if;

  select * into strict v_result
  from public.decide_cash_payment_reconciliation(
    v_order.id,
    'b7600000-0000-4000-8000-000000000001',
    'confirm',
    null
  );
  if not v_result.ok
    or v_result.cash_commission_collected <> 20000
    or v_result.cash_commission_due <> 0
  then
    raise exception 'Admin cash confirmation did not preserve the frozen commission: %', row_to_json(v_result);
  end if;

  select cash_ledger.* into strict v_cash_ledger
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.job_id = v_job.id;
  select ledger.* into strict v_worker_ledger
  from public.worker_payment_ledger as ledger
  where ledger.job_id = v_job.id;
  if v_cash_ledger.commission_level <> 2
    or v_cash_ledger.commission_rate_bps <> 1000
    or v_worker_ledger.commission_level <> 2
    or v_worker_ledger.commission_rate_bps <> 1000
    or v_worker_ledger.settlement_state <> 'admin_verified'
  then
    raise exception 'Admin cash settlement rewrote the frozen commission tier';
  end if;
end;
$direct_tier_behavior$;

do $manual_idempotency_behavior$
declare
  v_result record;
  v_forbidden boolean := false;
  v_snapshot public.job_payment_orders%rowtype;
  v_credited_at timestamptz := '2001-08-13T01:00:00Z';
  v_reference_hash text := repeat('a', 64);
begin
  begin
    perform *
    from public.decide_manual_bank_payment_reconciliation_idempotent(
      'b7620000-0000-4000-8000-000000000003',
      'b7600000-0000-4000-8000-000000000004',
      'confirm', 100000, v_credited_at, v_reference_hash, 'REF-0003', null
    );
  exception when raise_exception then
    v_forbidden := true;
  end;
  if not v_forbidden then
    raise exception 'actor without finance.reconcile passed the idempotent wrapper';
  end if;

  select * into strict v_result
  from public.decide_manual_bank_payment_reconciliation_idempotent(
    'b7620000-0000-4000-8000-000000000003',
    'b7600000-0000-4000-8000-000000000001',
    'confirm', 100000, v_credited_at, v_reference_hash, 'REF-0003', null
  );
  if not v_result.ok or v_result.payment_status <> 'manual_verified' then
    raise exception 'initial manual-bank confirmation failed: %', row_to_json(v_result);
  end if;

  select * into strict v_result
  from public.decide_manual_bank_payment_reconciliation_idempotent(
    'b7620000-0000-4000-8000-000000000003',
    'b7600000-0000-4000-8000-000000000001',
    'confirm', 100000, v_credited_at, v_reference_hash, 'REF-0003', null
  );
  if not v_result.ok or v_result.payment_status <> 'manual_verified' then
    raise exception 'exact manual-bank retry was not idempotent: %', row_to_json(v_result);
  end if;

  select * into strict v_result
  from public.decide_manual_bank_payment_reconciliation_idempotent(
    'b7620000-0000-4000-8000-000000000003',
    'b7600000-0000-4000-8000-000000000001',
    'confirm', 99999, v_credited_at, v_reference_hash, 'REF-0003', null
  );
  if v_result.ok or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'mismatched manual-bank retry was accepted: %', row_to_json(v_result);
  end if;

  select payment_order.* into strict v_snapshot
  from public.job_payment_orders as payment_order
  where payment_order.id = 'b7620000-0000-4000-8000-000000000003';
  if v_snapshot.amount_received <> 100000
    or v_snapshot.credited_at is distinct from v_credited_at
    or v_snapshot.bank_reference_hash <> v_reference_hash
    or v_snapshot.bank_reference_suffix <> 'REF-0003'
  then
    raise exception 'mismatched retry changed the verified payment snapshot';
  end if;
end;
$manual_idempotency_behavior$;

select jsonb_build_object(
  'customer_claim_is_provisional', true,
  'admin_cash_decision_is_explicit', true,
  'direct_commission_tier_is_frozen', true,
  'manual_retry_requires_exact_snapshot', true,
  'worker_net_is_preserved', true,
  'admin_worker_snapshot_is_capability_gated', true,
  'withdrawal_wait_is_server_owned', true,
  'legacy_unilateral_cash_is_fail_closed', true
) as worker_salary_settlement_v2_verification;

rollback;

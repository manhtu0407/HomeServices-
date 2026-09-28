-- @pillar id: P206-withdrawable-balance-single-owner-sql
-- @pillar invariant: The worker safety balance, the earnings summary, the withdrawal RPC with its insert trigger, and the admin finance overview all report the same withdrawable amount — available ledger credit minus admin-rejected rows, plus admin worker credits, minus held collateral and pending or paid withdrawals — before and after a withdrawal
-- @pillar authority: governance/RULES.md #7, #8 | Plan moonlit-singing-phoenix Phase 0.1: six divergent balance formulas
-- @pillar target: supabase/migrations/20260925100000_worker_withdrawable_balance_unification.sql
-- @pillar layer: sql
-- @pillar siblings: P209-commission-tiers-service-only-sql
-- @pillar mutation: Drop the collateral term from private.worker_withdrawable_balance or restore the earnings summary's private formula; the collateral fixture makes the numbers diverge and P206 raises P206_BALANCES_DIVERGE

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2060000-0000-4000-8000-000000000001','authenticated','authenticated','balance-p206-customer@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2060000-0000-4000-8000-000000000002','authenticated','authenticated','balance-p206-worker@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2060000-0000-4000-8000-000000000003','authenticated','authenticated','balance-p206-admin@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='worker' where id='c2060000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='c2060000-0000-4000-8000-000000000003';

insert into public.customer_profiles (id, building_name, unit_number, district)
values ('c2060000-0000-4000-8000-000000000001', 'Balance Building', 'A-01', 'q7')
on conflict (id) do nothing;

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2060000-0000-4000-8000-000000000002',
  array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.9, 10, 'approved', false, 'Balance Fixture Worker', '1990-01-01'
)
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, gross_amount, platform_fee, worker_net, display_code, created_at, paid_at
) values
  ('c2060000-0000-4000-8000-000000000101','c2060000-0000-4000-8000-000000000001','c2060000-0000-4000-8000-000000000002',
    'plumbing','Balance fixture available','paid',1000000,1000000,150000,850000,'BAL-0001',now(),now()),
  ('c2060000-0000-4000-8000-000000000102','c2060000-0000-4000-8000-000000000001','c2060000-0000-4000-8000-000000000002',
    'plumbing','Balance fixture rejected','paid',200000,200000,30000,170000,'BAL-0002',now(),now()),
  ('c2060000-0000-4000-8000-000000000103','c2060000-0000-4000-8000-000000000001','c2060000-0000-4000-8000-000000000002',
    'plumbing','Balance fixture collateral','completed_by_worker',300000,300000,45000,255000,'BAL-0003',now(),null);

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state, settlement_state, gross_amount,
  platform_fee, worker_net, commission_level, commission_rate_bps, available_at
) values
  ('c2060000-0000-4000-8000-000000000101','c2060000-0000-4000-8000-000000000002','platform_bank_manual',
    'available','admin_verified',1000000,150000,850000,1,1500,now()),
  ('c2060000-0000-4000-8000-000000000102','c2060000-0000-4000-8000-000000000002','platform_bank_manual',
    'available','admin_rejected',200000,30000,170000,1,1500,now());

insert into public.admin_financial_adjustments (
  source_key, adjustment_type, job_id, worker_id, worker_credit_vnd, reason_code, recorded_by, realized_at
) values (
  'p206-worker-credit', 'worker_credit', 'c2060000-0000-4000-8000-000000000101',
  'c2060000-0000-4000-8000-000000000002', 7000, 'WORKER_CREDIT', 'c2060000-0000-4000-8000-000000000003', now()
);

insert into public.job_payment_orders (
  id, job_id, customer_id, worker_id, payment_method, status, gross_amount, platform_fee, worker_net
) values (
  'c2060000-0000-4000-8000-000000000201','c2060000-0000-4000-8000-000000000103',
  'c2060000-0000-4000-8000-000000000001','c2060000-0000-4000-8000-000000000002',
  'direct_worker','direct_awaiting_customer_confirmation',300000,45000,255000
);

insert into public.worker_direct_payment_collateral_reservations (
  job_id, payment_order_id, worker_id, collateral_amount, status
) values (
  'c2060000-0000-4000-8000-000000000103','c2060000-0000-4000-8000-000000000201',
  'c2060000-0000-4000-8000-000000000002',45000,'held'
);

insert into public.worker_payout_methods (
  worker_id, bank_key, bank_name, account_holder_name, bank_account, bank_account_masked,
  is_default, status, reviewed_at, reviewed_by
) values (
  'c2060000-0000-4000-8000-000000000002','vietcombank','Vietcombank','BALANCE FIXTURE WORKER',
  '12345678','**** 5678', true, 'verified', now(), 'c2060000-0000-4000-8000-000000000003'
);

create temporary table p206_readings (label text, helper bigint, safety bigint, earnings bigint, overview bigint)
on commit drop;

create or replace function pg_temp.p206_read(p_label text) returns void
language plpgsql as $read$
declare
  v_worker constant uuid := 'c2060000-0000-4000-8000-000000000002';
  v_overview jsonb;
begin
  v_overview := public.admin_finance_overview('c2060000-0000-4000-8000-000000000003', now() - interval '1 day', now() + interval '1 day');
  insert into p206_readings values (
    p_label,
    (select withdrawable_vnd from private.worker_withdrawable_balance(v_worker)),
    (select available_balance from public.get_worker_payment_safety_balance(v_worker)),
    (select available_balance from public.get_worker_earnings_summary_v2(v_worker, null, null, 0.15)),
    (v_overview->'current_worker_balances'->>'available')::bigint
  );
end;
$read$;

do $before_withdrawal$
declare
  v_row p206_readings%rowtype;
begin
  perform pg_temp.p206_read('before');
  select * into v_row from p206_readings where label = 'before';
  -- 850,000 available + 7,000 admin credit - 45,000 held collateral; the rejected row is excluded.
  if v_row.helper <> 812000 then
    raise exception 'P206_HELPER_WRONG: %', v_row.helper;
  end if;
  if v_row.safety <> v_row.helper or v_row.earnings <> v_row.helper or v_row.overview <> v_row.helper then
    raise exception 'P206_BALANCES_DIVERGE: helper % safety % earnings % overview %',
      v_row.helper, v_row.safety, v_row.earnings, v_row.overview;
  end if;
end;
$before_withdrawal$;

do $withdraw$
declare
  v_worker constant uuid := 'c2060000-0000-4000-8000-000000000002';
  v_result record;
  v_row p206_readings%rowtype;
begin
  select * into v_result from public.create_worker_withdrawal_request(v_worker, 900000, gen_random_uuid());
  if v_result.ok or v_result.error_code <> 'INSUFFICIENT_BALANCE' or v_result.available_balance_before_vnd_out <> 812000 then
    raise exception 'P206_OVERDRAW_NOT_REFUSED: % %', v_result.error_code, v_result.available_balance_before_vnd_out;
  end if;

  select * into v_result from public.create_worker_withdrawal_request(v_worker, 300000, gen_random_uuid());
  if not v_result.ok or v_result.available_balance_before_vnd_out <> 812000 then
    raise exception 'P206_WITHDRAWAL_SNAPSHOT_WRONG: % %', v_result.error_code, v_result.available_balance_before_vnd_out;
  end if;

  perform pg_temp.p206_read('after');
  select * into v_row from p206_readings where label = 'after';
  if v_row.helper <> 512000 or v_row.safety <> 512000 or v_row.earnings <> 512000 or v_row.overview <> 512000 then
    raise exception 'P206_BALANCES_DIVERGE_AFTER: helper % safety % earnings % overview %',
      v_row.helper, v_row.safety, v_row.earnings, v_row.overview;
  end if;
end;
$withdraw$;

rollback;

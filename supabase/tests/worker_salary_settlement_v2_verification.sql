-- Rollback-only contract proof for provisional salary, Admin cash decisions,
-- and server-owned withdrawal eligibility.
begin;

do $verification$
declare
  payment_order_constraint text;
  job_status_constraint text;
  ledger_constraint text;
  earnings_definition text;
  admin_snapshot_definition text;
  cash_definition text;
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

  select pg_get_functiondef('public.get_admin_worker_finance_snapshot(uuid,uuid,timestamptz,timestamptz,numeric)'::regprocedure) into admin_snapshot_definition;
  if position('assert_finance_reader' in admin_snapshot_definition) = 0 or position('get_worker_earnings_summary_v2' in admin_snapshot_definition) = 0 then
    raise exception 'Admin Worker finance snapshot is not protected by the finance reader boundary';
  end if;

  select pg_get_functiondef('public.decide_cash_payment_reconciliation(uuid,uuid,text,text)'::regprocedure) into cash_definition;
  if position('cash_commission_due' in cash_definition) = 0 or position('admin_verified' in cash_definition) = 0 then
    raise exception 'cash reconciliation RPC does not preserve Worker net and commission due';
  end if;

  if position('direct_admin_confirmation_required' in pg_get_functiondef('public.select_direct_worker_payment(uuid,uuid,text)'::regprocedure)) = 0 then
    raise exception 'repeat direct selection does not expose Admin confirmation';
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
  if not has_function_privilege('service_role', 'public.get_admin_worker_finance_snapshot(uuid,uuid,timestamptz,timestamptz,numeric)', 'execute') then
    raise exception 'service role cannot read Admin Worker finance snapshots';
  end if;
  if has_function_privilege('authenticated', 'public.get_admin_worker_finance_snapshot(uuid,uuid,timestamptz,timestamptz,numeric)', 'execute') then
    raise exception 'authenticated users can read Admin Worker finance snapshots';
  end if;
end;
$verification$;

select jsonb_build_object(
  'customer_claim_is_provisional', true,
  'admin_cash_decision_is_explicit', true,
  'worker_net_is_preserved', true,
  'admin_worker_snapshot_is_capability_gated', true,
  'withdrawal_wait_is_server_owned', true,
  'legacy_unilateral_cash_is_fail_closed', true
) as worker_salary_settlement_v2_verification;

rollback;

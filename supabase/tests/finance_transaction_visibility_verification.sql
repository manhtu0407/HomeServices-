-- @pillar id: P95-finance-transaction-visibility-sql
-- @pillar invariant: Paid cancellations retain their financial history; synthetic terminal jobs never enter real Finance detail, pagination, exports, totals, or breakdowns.
-- @pillar authority: governance/RULES.md #8; user-approved Production Agentic Transaction Readiness
-- @pillar target: supabase/migrations/20260905113000_finance_transaction_visibility.sql
-- @pillar layer: sql
-- @pillar siblings: P89-refund-obligation-integrity-sql, P92-admin-finance-refund-obligation
-- @pillar mutation: Restore the paid/reviewed-only predicate or remove cohort exclusion; cancellation history vanishes or the synthetic paid count leaks.

begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('d9500000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'p95-' || value || '@example.test',
  '{"provider":"email","providers":["email"]}', '{}'
from generate_series(1, 5) as value;
update public.profiles set role = 'worker' where id in (
  'd9500000-0000-4000-8000-000000000002', 'd9500000-0000-4000-8000-000000000005');
update public.profiles set role = 'admin' where id = 'd9500000-0000-4000-8000-000000000003';
insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
  districts, is_approved, is_available, legal_name, date_of_birth, verification_status)
select id, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[], 5,
  array['q7'], true, true, 'P95 Fixture Worker', '1990-01-01', 'approved'
from public.profiles where id in (
  'd9500000-0000-4000-8000-000000000002', 'd9500000-0000-4000-8000-000000000005');

set local role service_role;
select * from public.bind_synthetic_matching_cohort('synthetic-p95-finance-isolation',
  array['d9500000-0000-4000-8000-000000000004']::uuid[],
  array['d9500000-0000-4000-8000-000000000005']::uuid[]);
reset role;

insert into public.jobs(id, customer_id, worker_id, service_type, description, status,
  final_price, gross_amount, platform_fee, worker_net, paid_at, confirmed_at,
  payment_received_at, payment_amount_received, payment_status, payment_provider, display_code)
values ('d9500000-0000-4000-8000-000000000101',
  'd9500000-0000-4000-8000-000000000001', 'd9500000-0000-4000-8000-000000000002',
  'plumbing', 'P95 historical transaction', 'paid', 450000, 450000, 67500, 382500,
  '2002-01-15T02:00:00Z', '2002-01-15T01:00:00Z', '2002-01-15T02:00:00Z',
  450000, 'manual_verified', 'platform_bank_manual', 'P95-REAL');
insert into public.job_payment_orders(id, job_id, customer_id, worker_id, payment_method, status,
  gross_amount, platform_fee, worker_net, payment_code, transfer_content, qr_image_url,
  amount_received, bank_reference_hash, bank_reference_suffix, credited_at, verified_by, verified_at)
values ('d9500000-0000-4000-8000-000000000201', 'd9500000-0000-4000-8000-000000000101',
  'd9500000-0000-4000-8000-000000000001', 'd9500000-0000-4000-8000-000000000002',
  'platform_bank_manual', 'manual_verified', 450000, 67500, 382500,
  'NS' || repeat('P', 24), 'NS' || repeat('P', 24), 'https://example.test/qr.png',
  450000, repeat('9', 64), 'P95', '2002-01-15T02:00:00Z',
  'd9500000-0000-4000-8000-000000000003', '2002-01-15T02:00:00Z');

-- This rollback-only SQL fixture exercises read isolation, not public terminal-flow proof.
set local app.synthetic_terminal_cohort = 'synthetic-p95-finance-isolation';
set local app.synthetic_terminal_job_id = 'd9500000-0000-4000-8000-000000000102';
insert into public.jobs(id, customer_id, worker_id, service_type, description, status,
  confirmed_at, paid_at, payment_received_at, payment_status, payment_provider, display_code)
values ('d9500000-0000-4000-8000-000000000102',
  'd9500000-0000-4000-8000-000000000004', 'd9500000-0000-4000-8000-000000000005',
  'plumbing', 'P95 synthetic terminal fixture', 'paid', '2002-01-15T01:00:00Z',
  '2002-01-15T02:00:00Z', '2002-01-15T02:00:00Z', 'received', 'staging_simulator', 'P95-SYNTHETIC');
set local app.synthetic_terminal_cohort = '';
set local app.synthetic_terminal_job_id = '';

set local role service_role;
do $isolation$
declare v_result jsonb;
begin
  v_result := public.admin_finance_transaction_detail('d9500000-0000-4000-8000-000000000003',
    'd9500000-0000-4000-8000-000000000102');
  if v_result is not null then raise exception 'P95_SYNTHETIC_DETAIL_LEAK'; end if;
  v_result := public.admin_finance_overview('d9500000-0000-4000-8000-000000000003',
    '2002-01-15T00:00:00Z', '2002-01-16T00:00:00Z', 'day');
  if (v_result#>>'{metrics,paid_job_count}')::integer is distinct from 1
    or v_result::text like '%staging_simulator%'
    or v_result#>>'{data_quality,paid_financials}' is distinct from 'complete' then
    raise exception 'P95_SYNTHETIC_OVERVIEW_LEAK: %', v_result;
  end if;
end;
$isolation$;

update public.jobs set status = 'cancelled', cancelled_at = now()
where id = 'd9500000-0000-4000-8000-000000000101';
do $cancelled_history$
declare
  v_result jsonb;
  v_filter text;
begin
  v_result := public.admin_finance_transaction_detail('d9500000-0000-4000-8000-000000000003',
    'd9500000-0000-4000-8000-000000000101');
  if v_result#>>'{transaction,status}' is distinct from 'cancelled'
    or (v_result#>>'{transaction,gross_amount_vnd}')::integer is distinct from 450000
    or (v_result#>>'{transaction,refund_amount_vnd}')::integer is distinct from 0 then
    raise exception 'P95_PAID_CANCELLATION_HISTORY_LOST: %', v_result;
  end if;
  if (public.read_job_refund_summary('d9500000-0000-4000-8000-000000000101', true)->>'state')
    is distinct from 'refund_required' then raise exception 'P95_REFUND_OBLIGATION_LOST'; end if;
  foreach v_filter in array array[null, 'cancelled']::text[] loop
    v_result := public.admin_finance_transactions_page('d9500000-0000-4000-8000-000000000003',
      '2002-01-15T00:00:00Z', '2002-01-16T00:00:00Z', 1, null, null, null, null, v_filter);
    if jsonb_array_length(v_result->'rows') <> 1 or (v_result->>'has_more')::boolean
      or v_result#>>'{rows,0,job_id}' is distinct from 'd9500000-0000-4000-8000-000000000101' then
      raise exception 'P95_TRANSACTION_PAGE_DRIFT: %', v_result;
    end if;
    v_result := public.admin_finance_export_rows('d9500000-0000-4000-8000-000000000003',
      '2002-01-15T00:00:00Z', '2002-01-16T00:00:00Z', 10, null, null, v_filter);
    if (v_result->>'row_count')::integer <> 1
      or v_result#>>'{rows,0,status}' is distinct from 'cancelled'
      or v_result::text like '%P95-SYNTHETIC%' then raise exception 'P95_EXPORT_DRIFT'; end if;
  end loop;
  v_result := public.admin_finance_overview('d9500000-0000-4000-8000-000000000003',
    '2002-01-15T00:00:00Z', '2002-01-16T00:00:00Z', 'day');
  if (v_result#>>'{metrics,paid_job_count}')::integer is distinct from 1
    or (v_result#>>'{metrics,platform_incoming}')::integer is distinct from 450000
    or (v_result#>>'{metrics,refund_outflow}')::integer is distinct from 0
    or (v_result#>>'{metrics,net_cash_flow}')::integer is distinct from 450000
    or (v_result#>>'{payment_method_breakdown,0,paid_jobs}')::integer is distinct from 1
    or (v_result#>>'{service_breakdown,0,paid_jobs}')::integer is distinct from 1 then
    raise exception 'P95_CANCELLATION_ERASED_RECEIVED_MONEY: %', v_result;
  end if;
end;
$cancelled_history$;
reset role;
rollback;

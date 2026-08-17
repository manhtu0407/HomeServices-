-- Rollback-only proof for Worker earnings recognition and realtime invalidation.
begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'e4100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'earnings-realtime-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e4100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'earnings-realtime-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'e4100000-0000-4000-8000-000000000002';

insert into public.customer_profiles (id, building_name, unit_number, district)
values ('e4100000-0000-4000-8000-000000000001', 'Realtime QA', 'QA-01', 'q1');

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'e4100000-0000-4000-8000-000000000002',
  array['handyman']::public.service_type[],
  array['q1'],
  true,
  true,
  5,
  1,
  'approved',
  false,
  'Realtime QA Worker',
  '1990-01-01'
);

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, kael_price_max, gross_amount, platform_fee, worker_net,
  payment_provider, payment_status, created_at, paid_at, display_code
) values
  (
    'e4200000-0000-4000-8000-000000000001',
    'e4100000-0000-4000-8000-000000000001',
    'e4100000-0000-4000-8000-000000000002',
    'handyman', 'Verified Worker hold', 'paid',
    500000, 500000, 500000, 75000, 425000,
    'platform_bank_manual', 'manual_verified',
    '2026-08-14T01:00:00Z', '2026-08-14T02:00:00Z', 'EARN-RT-001'
  ),
  (
    'e4200000-0000-4000-8000-000000000002',
    'e4100000-0000-4000-8000-000000000001',
    'e4100000-0000-4000-8000-000000000002',
    'handyman', 'Unverified amount mismatch hold', 'payment_pending',
    600000, 600000, 600000, 90000, 510000,
    'sepay_vietqr', 'amount_mismatch',
    '2026-08-14T03:00:00Z', null, 'EARN-RT-002'
  ),
  (
    'e4200000-0000-4000-8000-000000000003',
    'e4100000-0000-4000-8000-000000000001',
    'e4100000-0000-4000-8000-000000000002',
    'handyman', 'Customer payment claim', 'payment_pending',
    700000, 700000, 700000, 105000, 595000,
    'platform_bank_manual', 'manual_customer_claimed',
    '2026-08-14T04:00:00Z', null, 'EARN-RT-003'
  );

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state,
  gross_amount, platform_fee, worker_net, commission_level,
  commission_rate_bps, available_at, created_at, updated_at
) values
  (
    'e4200000-0000-4000-8000-000000000001',
    'e4100000-0000-4000-8000-000000000002',
    'platform_bank_manual', 'on_hold',
    500000, 75000, 425000, 1, 1500,
    '2026-08-15T02:00:00Z', '2026-08-14T01:00:00Z', '2026-08-14T02:00:00Z'
  ),
  (
    'e4200000-0000-4000-8000-000000000002',
    'e4100000-0000-4000-8000-000000000002',
    'sepay_vietqr', 'on_hold',
    600000, 90000, 510000, 1, 1500,
    null, '2026-08-14T03:00:00Z', '2026-08-14T03:01:00Z'
  ),
  (
    'e4200000-0000-4000-8000-000000000003',
    'e4100000-0000-4000-8000-000000000002',
    'platform_bank_manual', 'pending',
    700000, 105000, 595000, 1, 1500,
    null, '2026-08-14T04:00:00Z', '2026-08-14T04:00:00Z'
  );

do $verification$
declare
  earnings record;
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'worker_payment_ledger'
  ) then
    raise exception 'worker payment ledger is missing from Supabase Realtime';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class
    where oid = 'public.worker_payment_ledger'::regclass
      and relrowsecurity
  ) or not pg_catalog.has_table_privilege('authenticated', 'public.worker_payment_ledger', 'select') then
    raise exception 'worker payment ledger realtime reads lost their RLS or authenticated select boundary';
  end if;

  select * into strict earnings
  from public.get_worker_earnings_summary(
    'e4100000-0000-4000-8000-000000000002',
    null,
    null,
    0.10
  );

  if earnings.total_jobs_paid <> 1
    or earnings.gross_earnings <> 500000
    or earnings.platform_fee_total <> 75000
    or earnings.net_earnings <> 425000
    or earnings.available_balance <> 0
    or earnings.on_hold_amount <> 425000
    or earnings.pending_payment_count <> 1
    or earnings.pending_payment_amount <> 595000 then
    raise exception 'Worker earnings did not separate verified, unverified, and pending money: %', row_to_json(earnings);
  end if;

  if earnings.daily_earnings <> '[{
    "date": "2026-08-14",
    "gross_earnings": 500000,
    "platform_fee_total": 75000,
    "net_earnings": 425000,
    "paid_job_count": 1
  }]'::jsonb then
    raise exception 'verified hold was not recognized on its paid date: %', earnings.daily_earnings;
  end if;
end;
$verification$;

select jsonb_build_object(
  'worker_ledger_realtime', true,
  'verified_hold_recognized', true,
  'customer_claim_not_counted_as_income', true,
  'unverified_mismatch_not_counted_as_income', true
) as worker_earnings_realtime_verification;

rollback;

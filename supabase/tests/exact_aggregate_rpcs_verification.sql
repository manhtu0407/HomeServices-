begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a3100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'exact-aggregate-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a3100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'exact-aggregate-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a3100000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'exact-aggregate-outsider@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a3100000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'exact-aggregate-timezone-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id in (
  'a3100000-0000-4000-8000-000000000002',
  'a3100000-0000-4000-8000-000000000004'
);

insert into public.customer_profiles (id, building_name, unit_number, district)
values (
  'a3100000-0000-4000-8000-000000000001',
  'Aggregate QA Building',
  'A-01',
  'q7'
)
on conflict (id) do update
set building_name = excluded.building_name,
    unit_number = excluded.unit_number,
    district = excluded.district;

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'a3100000-0000-4000-8000-000000000002',
  array['plumbing']::public.service_type[],
  array['q7'],
  true,
  true,
  4.8,
  1205,
  'approved',
  false,
  'Aggregate QA Worker',
  '1990-01-01'
), (
  'a3100000-0000-4000-8000-000000000004',
  array['plumbing']::public.service_type[],
  array['q7'],
  true,
  true,
  4.8,
  3,
  'approved',
  false,
  'Timezone Aggregate Worker',
  '1990-01-01'
), (
  'a3100000-0000-4000-8000-000000000003',
  array['plumbing']::public.service_type[],
  array['q7'],
  false,
  false,
  0,
  0,
  'draft',
  false,
  'Aggregate Outsider',
  '1990-01-01'
)
on conflict (id) do update
set service_types = excluded.service_types,
    districts = excluded.districts,
    is_approved = excluded.is_approved,
    is_available = excluded.is_available,
    rating = excluded.rating,
    total_jobs = excluded.total_jobs,
    verification_status = excluded.verification_status,
    is_suspended = excluded.is_suspended,
    legal_name = excluded.legal_name,
    date_of_birth = excluded.date_of_birth;

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, kael_price_max, gross_amount, platform_fee, worker_net,
  created_at, paid_at, completed_at, confirmed_at, reviewed_at,
  scheduled_at, arrived_at, display_code
)
select
  md5('exact-aggregate-paid-' || series)::uuid,
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'a3100000-0000-4000-8000-000000000002'::uuid,
  'plumbing'::public.service_type,
  'Exact aggregate paid fixture ' || series,
  'paid'::public.job_status,
  100000,
  110000,
  90000,
  5000,
  85000,
  '2026-07-10T00:00:00Z'::timestamptz + make_interval(secs => series),
  '2026-07-10T00:00:00Z'::timestamptz + make_interval(secs => series),
  '2026-07-10T00:00:00Z'::timestamptz + make_interval(secs => series),
  '2026-07-10T00:00:00Z'::timestamptz + make_interval(secs => series),
  case when series <= 620
    then '2026-07-10T00:00:00Z'::timestamptz + make_interval(secs => series)
    else null
  end,
  '2026-07-10T01:00:00Z'::timestamptz + make_interval(secs => series),
  '2026-07-10T01:04:00Z'::timestamptz + make_interval(secs => series),
  'AGG-P-' || lpad(series::text, 4, '0')
from generate_series(1, 1205) as series;

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, kael_price_max, created_at, confirmed_at, display_code
)
select
  md5('exact-aggregate-pending-' || series)::uuid,
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'a3100000-0000-4000-8000-000000000002'::uuid,
  'plumbing'::public.service_type,
  'Exact aggregate pending fixture ' || series,
  'payment_pending'::public.job_status,
  200000,
  210000,
  '2026-07-11T00:00:00Z'::timestamptz + make_interval(secs => series),
  '2026-07-11T00:00:00Z'::timestamptz + make_interval(secs => series),
  'AGG-N-' || lpad(series::text, 4, '0')
from generate_series(1, 17) as series;

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state,
  gross_amount, platform_fee, worker_net, commission_level,
  commission_rate_bps, available_at, created_at, updated_at
)
select
  job.id,
  job.worker_id,
  'sepay_vietqr',
  case when job.status = 'paid'::public.job_status then 'available' else 'pending' end,
  case when job.status = 'paid'::public.job_status then job.gross_amount else job.final_price end,
  case when job.status = 'paid'::public.job_status then job.platform_fee else 0 end,
  case when job.status = 'paid'::public.job_status then job.worker_net else job.final_price end,
  1,
  1500,
  case when job.status = 'paid'::public.job_status then job.paid_at else null end,
  job.created_at,
  job.created_at
from public.jobs as job
where job.description like 'Exact aggregate paid fixture %'
   or job.description like 'Exact aggregate pending fixture %';

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, gross_amount, platform_fee, worker_net, created_at, paid_at,
  display_code
) values
  (
    'a3300000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000003',
    'a3100000-0000-4000-8000-000000000004',
    'plumbing', 'Timezone aggregate first day', 'paid',
    100000, 100000, 10000, 90000,
    '2026-07-09T16:59:59Z', '2026-07-09T16:59:59Z', 'AGG-TZ-0001'
  ),
  (
    'a3300000-0000-4000-8000-000000000002',
    'a3100000-0000-4000-8000-000000000003',
    'a3100000-0000-4000-8000-000000000004',
    'plumbing', 'Timezone aggregate second day one', 'paid',
    200000, 200000, 20000, 180000,
    '2026-07-09T17:00:00Z', '2026-07-09T17:00:00Z', 'AGG-TZ-0002'
  ),
  (
    'a3300000-0000-4000-8000-000000000003',
    'a3100000-0000-4000-8000-000000000003',
    'a3100000-0000-4000-8000-000000000004',
    'plumbing', 'Timezone aggregate second day two', 'paid',
    300000, 300000, 30000, 270000,
    '2026-07-10T16:59:59Z', '2026-07-10T16:59:59Z', 'AGG-TZ-0003'
  );

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state,
  gross_amount, platform_fee, worker_net, commission_level,
  commission_rate_bps, available_at, created_at, updated_at
)
select
  job.id,
  job.worker_id,
  'sepay_vietqr',
  'available',
  job.gross_amount,
  job.platform_fee,
  job.worker_net,
  1,
  1500,
  job.paid_at,
  job.created_at,
  job.created_at
from public.jobs as job
where job.description like 'Timezone aggregate %';

insert into public.reviews (id, job_id, customer_id, worker_id, rating, tags, created_at)
select
  md5('exact-aggregate-review-' || series)::uuid,
  md5('exact-aggregate-paid-' || series)::uuid,
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'a3100000-0000-4000-8000-000000000002'::uuid,
  5,
  array['professional'],
  '2026-07-10T02:00:00Z'::timestamptz + make_interval(secs => series)
from generate_series(1, 620) as series;

insert into public.job_broadcasts (
  id, job_id, worker_id, status, broadcast_at, sent_at, responded_at
)
select
  md5('exact-aggregate-broadcast-' || series)::uuid,
  md5('exact-aggregate-paid-' || series)::uuid,
  'a3100000-0000-4000-8000-000000000002'::uuid,
  case
    when series <= 400 then 'accepted'::public.broadcast_status
    when series <= 800 then 'declined'::public.broadcast_status
    else 'expired'::public.broadcast_status
  end,
  '2026-07-10T00:00:00Z'::timestamptz + make_interval(secs => series),
  '2026-07-10T00:00:00Z'::timestamptz + make_interval(secs => series),
  case when series <= 800
    then '2026-07-10T00:08:00Z'::timestamptz + make_interval(secs => series)
    else null
  end
from generate_series(1, 1205) as series;

insert into public.kael_chat_sessions (
  id, customer_id, service_type, status, started_at, created_at
)
select
  md5('exact-aggregate-session-' || series)::uuid,
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'plumbing'::public.service_type,
  'active',
  '2026-07-09T00:00:00Z'::timestamptz + make_interval(secs => series),
  '2026-07-09T00:00:00Z'::timestamptz + make_interval(secs => series)
from generate_series(1, 650) as series;

insert into public.scope_change_requests (
  id, job_id, worker_id, status, requested_description, reason,
  price_min, price_max, kael_review, customer_decision_at
)
select
  md5('exact-aggregate-scope-' || series)::uuid,
  md5('exact-aggregate-paid-' || series)::uuid,
  'a3100000-0000-4000-8000-000000000002'::uuid,
  case when series % 2 = 0
    then 'approved_by_customer'::public.scope_change_status
    else 'rejected_by_customer'::public.scope_change_status
  end,
  'Exact aggregate scope adjustment',
  'Verified on-site condition',
  100000,
  120000,
  jsonb_build_object('decision', 'reviewed'),
  '2026-07-10T03:00:00Z'::timestamptz
from generate_series(1, 4) as series;

insert into public.evidence_snapshots (id, job_id, evidence_snapshot)
values (
  'a3200000-0000-4000-8000-000000000001',
  md5('exact-aggregate-paid-1')::uuid,
  '{"source":"exact-aggregate-verification"}'::jsonb
);

insert into public.disputes (
  id, job_id, dispute_type, initiated_by, initiated_by_id,
  counter_party_id, initiator_statement, counter_party_response_deadline,
  evidence_locked_at, evidence_snapshot_id, kael_neutral_summary, status, resolved_at
) values (
  'a3300000-0000-4000-8000-000000000001',
  md5('exact-aggregate-paid-1')::uuid,
  'other',
  'customer',
  'a3100000-0000-4000-8000-000000000001',
  'a3100000-0000-4000-8000-000000000002',
  'Customer supplied a sufficiently detailed aggregate verification statement.',
  '2026-07-12T00:00:00Z',
  '2026-07-10T04:00:00Z',
  'a3200000-0000-4000-8000-000000000001',
  'Aggregate verification dispute with a neutral and sufficiently detailed summary.',
  'resolved',
  '2026-07-11T00:00:00Z'
);

do $$
declare
  earnings record;
  timezone_earnings record;
  customer_insights record;
  invalid_fee_rejected boolean := false;
  worker_insights record;
begin
  if has_function_privilege(
    'authenticated',
    to_regprocedure('public.get_worker_earnings_summary(uuid,timestamptz,timestamptz,numeric)'),
    'execute'
  ) then
    raise exception 'authenticated must not execute the earnings aggregate RPC';
  end if;
  if has_function_privilege(
    'authenticated',
    to_regprocedure('public.get_customer_profile_insights_aggregate(uuid)'),
    'execute'
  ) then
    raise exception 'authenticated must not execute the customer insights aggregate RPC';
  end if;
  if has_function_privilege(
    'authenticated',
    to_regprocedure('public.get_worker_performance_insights_aggregate(uuid)'),
    'execute'
  ) then
    raise exception 'authenticated must not execute the worker insights aggregate RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    to_regprocedure('public.get_worker_earnings_summary(uuid,timestamptz,timestamptz,numeric)'),
    'execute'
  ) then
    raise exception 'service_role must execute the aggregate RPCs';
  end if;

  begin
    perform public.get_worker_earnings_summary(
      'a3100000-0000-4000-8000-000000000002', null, null, null
    );
  exception
    when sqlstate '22023' then
      invalid_fee_rejected := true;
  end;

  if invalid_fee_rejected is not true then
    raise exception 'null platform fee rate was accepted';
  end if;

  select * into strict earnings
  from public.get_worker_earnings_summary(
    'a3100000-0000-4000-8000-000000000002', null, null, 0.10
  );
  if earnings.total_jobs_paid <> 1205
    or earnings.gross_earnings <> 108450000
    or earnings.platform_fee_total <> 6025000
    or earnings.net_earnings <> 102425000
    or earnings.pending_payment_count <> 17
    or earnings.pending_payment_amount <> 3400000 then
    raise exception 'unexpected all-time earnings aggregate: %', row_to_json(earnings);
  end if;

  select * into strict timezone_earnings
  from public.get_worker_earnings_summary(
    'a3100000-0000-4000-8000-000000000004', null, null, 0.10
  );
  if timezone_earnings.daily_earnings <> '[
    {
      "date": "2026-07-10",
      "gross_earnings": 500000,
      "platform_fee_total": 50000,
      "net_earnings": 450000,
      "paid_job_count": 2
    },
    {
      "date": "2026-07-09",
      "gross_earnings": 100000,
      "platform_fee_total": 10000,
      "net_earnings": 90000,
      "paid_job_count": 1
    }
  ]'::jsonb then
    raise exception 'unexpected timezone daily earnings aggregate: %', row_to_json(timezone_earnings);
  end if;

  select * into strict earnings
  from public.get_worker_earnings_summary(
    'a3100000-0000-4000-8000-000000000002',
    '2026-07-11T00:00:00Z',
    '2026-07-11T23:59:59Z',
    0.10
  );
  if earnings.total_jobs_paid <> 0
    or earnings.pending_payment_count <> 17
    or earnings.pending_payment_amount <> 3400000 then
    raise exception 'earnings range must use paid_at for paid and created_at for pending: %', row_to_json(earnings);
  end if;

  select * into strict customer_insights
  from public.get_customer_profile_insights_aggregate(
    'a3100000-0000-4000-8000-000000000001'
  );
  if customer_insights.member_since is null
    or customer_insights.has_primary_address is not true
    or customer_insights.kael_interaction_count <> 650
    or customer_insights.completed_service_count <> 1222
    or customer_insights.preferred_service_count <> 1
    or customer_insights.active_service_days <> 2
    or customer_insights.active_streak_days <> 2
    or customer_insights.positive_review_rate_percent <> 100
    or customer_insights.fair_price_service_count <> 1222
    or customer_insights.price_savings_vnd <> 12220000
    or customer_insights.total_spend_vnd <> 123900000
    or customer_insights.reviewed_service_count <> 620
    or customer_insights.protected_value_vnd <> 123900000
    or customer_insights.protected_transaction_count <> 1222
    or customer_insights.total_transaction_count <> 1222
    or customer_insights.disputed_transaction_count <> 1 then
    raise exception 'unexpected customer insights aggregate: %', row_to_json(customer_insights);
  end if;

  select * into strict worker_insights
  from public.get_worker_performance_insights_aggregate(
    'a3100000-0000-4000-8000-000000000002'
  );
  if worker_insights.profile_exists is not true
    or worker_insights.is_approved is not true
    or worker_insights.is_available is not true
    or worker_insights.is_suspended is not false
    or worker_insights.profile_rating <> 5.0
    or worker_insights.profile_total_jobs <> 620
    or worker_insights.verification_status <> 'approved'
    or worker_insights.total_broadcast_count <> 1205
    or worker_insights.responded_broadcast_count <> 800
    or worker_insights.accepted_broadcast_count <> 400
    or worker_insights.average_response_minutes <> 8
    or worker_insights.completed_job_count <> 1222
    or worker_insights.scheduled_arrival_job_count <> 1205
    or worker_insights.on_time_job_count <> 1205
    or worker_insights.paid_job_count <> 1205
    or worker_insights.reconciled_earnings_vnd <> 120500000
    or worker_insights.review_count <> 620
    or worker_insights.average_review_rating <> 5.0
    or worker_insights.work_response_review_count <> 620
    or worker_insights.work_response_score <> 100
    or worker_insights.resolved_incident_case_count <> 4 then
    raise exception 'unexpected worker insights aggregate: %', row_to_json(worker_insights);
  end if;

  select * into strict earnings
  from public.get_worker_earnings_summary(
    'a3100000-0000-4000-8000-000000000003', null, null, 0.10
  );
  if earnings.total_jobs_paid <> 0 or earnings.pending_payment_count <> 0 then
    raise exception 'aggregate RPC leaked another actor history: %', row_to_json(earnings);
  end if;
end;
$$;

rollback;

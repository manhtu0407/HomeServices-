-- P54: rollback-only proof that Production synthetic smoke cannot enter real
-- marketplace, Admin, analytics, or money surfaces even through service_role.

begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d5400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'p54-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d5400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'p54-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d5400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'p54-real-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d5400000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
    'p54-admin@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

update public.profiles set role = 'worker'::public.user_role
where id in (
  'd5400000-0000-4000-8000-000000000002',
  'd5400000-0000-4000-8000-000000000003'
);
update public.profiles set role = 'admin'::public.user_role
where id = 'd5400000-0000-4000-8000-000000000004';

insert into public.customer_profiles(id, building_name, unit_number, district)
values ('d5400000-0000-4000-8000-000000000001', 'P54 Building', 'P54', 'q7')
on conflict (id) do update set
  building_name = excluded.building_name,
  unit_number = excluded.unit_number,
  district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status
) values
  ('d5400000-0000-4000-8000-000000000002', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'P54 Synthetic Worker', '1990-01-01', 'approved'),
  ('d5400000-0000-4000-8000-000000000003', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'P54 Real Worker', '1991-01-01', 'approved')
on conflict (id) do update set
  service_types = excluded.service_types,
  selected_service_types = excluded.selected_service_types,
  years_experience = excluded.years_experience,
  districts = excluded.districts,
  problem_specializations = excluded.problem_specializations,
  is_approved = excluded.is_approved,
  is_available = excluded.is_available,
  legal_name = excluded.legal_name,
  date_of_birth = excluded.date_of_birth,
  verification_status = excluded.verification_status;

set local role service_role;

select * from public.bind_synthetic_matching_cohort(
  'synthetic-p54-sql-proof',
  array['d5400000-0000-4000-8000-000000000001']::uuid[],
  array['d5400000-0000-4000-8000-000000000002']::uuid[]
);

reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'd5400000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $rls_test$
begin
  if (select count(*) from public.synthetic_matching_cohort_members
      where profile_id = 'd5400000-0000-4000-8000-000000000001') <> 1
  then raise exception 'customer cannot resolve own synthetic cohort scope'; end if;
  if (select count(*) from public.synthetic_matching_cohort_members
      where profile_id = 'd5400000-0000-4000-8000-000000000002') <> 0
  then raise exception 'customer can read another synthetic cohort member'; end if;
end;
$rls_test$;

reset role;

insert into public.kael_chat_sessions(
  id, customer_id, service_type, status, safe_metadata
) values (
  'd5400000-0000-4000-8000-000000000010',
  'd5400000-0000-4000-8000-000000000001',
  'plumbing', 'active', '{"source":"p54_sql"}'::jsonb
);

insert into public.jobs(
  id, customer_id, service_type, service_problem_id, description, status
)
select
  'd5400000-0000-4000-8000-000000000011',
  'd5400000-0000-4000-8000-000000000001',
  'plumbing', problem.id, 'P54 isolated synthetic matching job', 'broadcasting'
from public.service_problems as problem
where problem.service_type = 'plumbing' and problem.is_active
order by problem.slug
limit 1;

insert into public.job_broadcasts(
  id, job_id, worker_id, status, synthetic_cohort_id
) values (
  'd5400000-0000-4000-8000-000000000012',
  'd5400000-0000-4000-8000-000000000011',
  'd5400000-0000-4000-8000-000000000002',
  'pending', 'synthetic-p54-sql-proof'
);

insert into public.customer_favorite_workers(customer_id, worker_id)
values (
  'd5400000-0000-4000-8000-000000000001',
  'd5400000-0000-4000-8000-000000000002'
);

insert into public.api_logs(
  job_id, request_id, purpose, provider, success, safe_metadata
) values (
  'd5400000-0000-4000-8000-000000000011',
  'p54-synthetic-request', 'intent_classification', 'deepseek', true,
  '{"surface":"kael_chat"}'::jsonb
);
insert into public.kael_optimization_metrics(
  request_id, job_id, purpose, provider, option_flags, enabled_options,
  quality_pass, quality_signal, metric_source, safe_metadata
) values (
  'p54-synthetic-request', 'd5400000-0000-4000-8000-000000000011',
  'intent_classification', 'deepseek', '{}'::jsonb, '{}'::text[],
  true, 'provider_success', 'edge_api_log', '{"surface":"kael_chat"}'::jsonb
);

select private.recompute_all_actor_stats();

do $analytics_test$
begin
  if exists (select 1 from public.worker_stats
      where worker_id = 'd5400000-0000-4000-8000-000000000002')
    or exists (select 1 from public.customer_stats
      where customer_id = 'd5400000-0000-4000-8000-000000000001')
  then
    raise exception 'synthetic actor entered marketplace analytics';
  end if;
end;
$analytics_test$;

do $test$
declare
  v_receipt record;
  v_snapshot jsonb;
  v_broadcasting_count integer;
  v_analytics_detail jsonb;
begin
  if (select synthetic_cohort_id from public.kael_chat_sessions
      where id = 'd5400000-0000-4000-8000-000000000010') <> 'synthetic-p54-sql-proof'
    or (select synthetic_cohort_id from public.jobs
      where id = 'd5400000-0000-4000-8000-000000000011') <> 'synthetic-p54-sql-proof'
    or (select synthetic_cohort_id from public.customer_favorite_workers
      where customer_id = 'd5400000-0000-4000-8000-000000000001'
        and worker_id = 'd5400000-0000-4000-8000-000000000002') <> 'synthetic-p54-sql-proof'
    or (select synthetic_cohort_id from public.api_logs
      where request_id = 'p54-synthetic-request') <> 'synthetic-p54-sql-proof'
    or (select synthetic_cohort_id from public.kael_optimization_metrics
      where request_id = 'p54-synthetic-request') <> 'synthetic-p54-sql-proof'
  then
    raise exception 'synthetic scope did not propagate to owned records';
  end if;

  begin
    insert into public.customer_favorite_workers(customer_id, worker_id)
    values (
      'd5400000-0000-4000-8000-000000000001',
      'd5400000-0000-4000-8000-000000000003'
    );
    raise exception 'cross-cohort favorite was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.worker_payout_methods(
      worker_id, bank_key, bank_name, account_holder_name,
      bank_account, bank_account_masked
    ) values (
      'd5400000-0000-4000-8000-000000000002', 'vietcombank',
      'Vietcombank', 'P54 SYNTHETIC WORKER', '12345678', '**** 5678'
    );
    raise exception 'synthetic payout method was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.jobs set status = 'payment_pending'
    where id = 'd5400000-0000-4000-8000-000000000011';
    raise exception 'synthetic job entered payment without terminal simulator authority';
  exception when insufficient_privilege then null;
  end;

  v_snapshot := public.admin_operations_snapshot(
    'd5400000-0000-4000-8000-000000000004'
  );
  select coalesce((flow ->> 'count')::integer, 0) into v_broadcasting_count
  from jsonb_array_elements(v_snapshot -> 'flow') as flow
  where flow ->> 'status' = 'broadcasting';
  if coalesce(v_broadcasting_count, 0) <> (
    select count(*)::integer from public.jobs
    where synthetic_cohort_id is null and status = 'broadcasting'
  ) then
    raise exception 'Admin operations snapshot includes synthetic flow';
  end if;
  if (select coalesce(sum(call_count), 0) from public.kael_cost_daily_summary) <> (
    select count(*) from public.api_logs where synthetic_cohort_id is null
  ) then
    raise exception 'Kael cost analytics includes synthetic provider calls';
  end if;

  select * into v_receipt from public.verify_synthetic_matching_cohort_isolation(
    'synthetic-p54-sql-proof'
  );
  v_analytics_detail := jsonb_build_object(
    'api_log_mismatch', (select count(*) from public.api_logs as log
      where (exists (select 1 from public.jobs as job
          where job.id = log.job_id and job.synthetic_cohort_id = 'synthetic-p54-sql-proof')
        or exists (select 1 from public.kael_chat_sessions as session
          where session.id::text = log.safe_metadata ->> 'session_id'
            and session.synthetic_cohort_id = 'synthetic-p54-sql-proof'))
        and log.synthetic_cohort_id is distinct from 'synthetic-p54-sql-proof'),
    'metric_mismatch', (select count(*) from public.kael_optimization_metrics as metric
      where (exists (select 1 from public.jobs as job
          where job.id = metric.job_id and job.synthetic_cohort_id = 'synthetic-p54-sql-proof')
        or exists (select 1 from public.api_logs as log
          where log.request_id = metric.request_id
            and log.synthetic_cohort_id = 'synthetic-p54-sql-proof'))
        and metric.synthetic_cohort_id is distinct from 'synthetic-p54-sql-proof'),
    'sample_mismatch', (select count(*) from public.kael_ab_price_synthesis_cases as sample
      where (exists (select 1 from public.jobs as job
          where job.id = sample.job_id and job.synthetic_cohort_id = 'synthetic-p54-sql-proof')
        or exists (select 1 from public.api_logs as log
          where log.request_id = sample.request_id
            and log.synthetic_cohort_id = 'synthetic-p54-sql-proof'))
        and sample.synthetic_cohort_id is distinct from 'synthetic-p54-sql-proof'),
    'worker_stats', (select count(*) from public.worker_stats as stats
      join public.synthetic_matching_cohort_members as member on member.profile_id = stats.worker_id
      where member.cohort_id = 'synthetic-p54-sql-proof'),
    'customer_stats', (select count(*) from public.customer_stats as stats
      join public.synthetic_matching_cohort_members as member on member.profile_id = stats.customer_id
      where member.cohort_id = 'synthetic-p54-sql-proof'),
    'estimate_view_guard', position('synthetic_cohort_id is null' in lower(
      pg_get_viewdef('public.kael_estimate_accuracy'::regclass, true))),
    'cost_view_guard', position('synthetic_cohort_id is null' in lower(
      pg_get_viewdef('public.kael_cost_daily_summary'::regclass, true))),
    'projection_view_guard', position('synthetic_cohort_id is null' in lower(
      pg_get_viewdef('public.kael_cost_projection_daily'::regclass, true))),
    'provider_view_guard', position('synthetic_cohort_id is null' in lower(
      pg_get_viewdef('public.kael_monitoring_provider_daily'::regclass, true)))
  );
  if v_receipt.member_count <> 2
    or v_receipt.customer_member_count <> 1
    or v_receipt.worker_member_count <> 1
    or v_receipt.job_count <> 1
    or v_receipt.session_count <> 1
    or v_receipt.broadcast_count <> 1
    or v_receipt.favorite_count <> 1
    or v_receipt.financial_record_count <> 0
    or v_receipt.real_surface_leak_count <> 0
    or v_receipt.analytics_leak_count <> 0
  then
    raise exception 'synthetic isolation receipt failed: %, detail: %',
      row_to_json(v_receipt), v_analytics_detail;
  end if;

  if has_function_privilege('authenticated',
      'public.verify_synthetic_matching_cohort_isolation(text)', 'execute')
    or has_function_privilege('anon',
      'public.verify_synthetic_matching_cohort_isolation(text)', 'execute')
  then
    raise exception 'aggregate isolation verifier is exposed beyond service_role';
  end if;

  begin
    perform public.verify_synthetic_matching_cohort_isolation('');
    raise exception 'unscoped synthetic verifier input was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.verify_synthetic_matching_cohort_isolation('synthetic-p54-missing');
    raise exception 'missing synthetic cohort was accepted';
  exception when no_data_found then null;
  end;
end;
$test$;

select * from public.cleanup_synthetic_matching_cohort('synthetic-p54-sql-proof');

do $cleanup_test$
begin
  if not exists (
      select 1 from public.synthetic_matching_cohorts
      where cohort_id = 'synthetic-p54-sql-proof'
    ) or not exists (
      select 1 from public.synthetic_matching_cohort_members
      where cohort_id = 'synthetic-p54-sql-proof'
        and profile_id = 'd5400000-0000-4000-8000-000000000001'
    ) or (select synthetic_cohort_id from public.worker_profiles
      where id = 'd5400000-0000-4000-8000-000000000002') <> 'synthetic-p54-sql-proof'
  then
    raise exception 'cleanup declassified a dedicated synthetic actor';
  end if;
  if exists (select 1 from public.jobs where synthetic_cohort_id = 'synthetic-p54-sql-proof')
    or exists (select 1 from public.kael_chat_sessions where synthetic_cohort_id = 'synthetic-p54-sql-proof')
    or exists (select 1 from public.api_logs where synthetic_cohort_id = 'synthetic-p54-sql-proof')
    or exists (select 1 from public.customer_favorite_workers
      where synthetic_cohort_id = 'synthetic-p54-sql-proof')
  then
    raise exception 'cleanup left exact-cohort scenario data behind';
  end if;
end;
$cleanup_test$;

rollback;

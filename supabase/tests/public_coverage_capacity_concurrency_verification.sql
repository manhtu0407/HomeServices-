-- P67 concurrency proof: four reachable Workers cannot satisfy two overlapping
-- public confirmations that each require a three-Worker capacity reservation.

\set ON_ERROR_STOP on

\getenv dblink_connstr NESTSCOUT_TEST_DB_URL
\if :{?dblink_connstr}
\else
do $missing_connection$
begin
  raise exception 'NESTSCOUT_TEST_DB_URL is required for dblink concurrency verification.';
end;
$missing_connection$;
\endif

select exists (
  select 1 from pg_catalog.pg_extension where extname = 'dblink'
) as dblink_preexisting \gset

create extension if not exists dblink;

delete from public.jobs where customer_id in (
  'd6710000-0000-4000-8000-000000000001',
  'd6710000-0000-4000-8000-000000000002'
);
delete from public.kael_chat_sessions where id in (
  'd6710000-0000-4000-8000-000000000101',
  'd6710000-0000-4000-8000-000000000102'
);
delete from auth.users where id in (
  'd6710000-0000-4000-8000-000000000001',
  'd6710000-0000-4000-8000-000000000002',
  'd6710000-0000-4000-8000-000000000011',
  'd6710000-0000-4000-8000-000000000012',
  'd6710000-0000-4000-8000-000000000013',
  'd6710000-0000-4000-8000-000000000014'
);

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d6710000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'coverage-race-customer-one@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6710000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'coverage-race-customer-two@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6710000-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
    'coverage-race-worker-one@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6710000-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
    'coverage-race-worker-two@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6710000-0000-4000-8000-000000000013', 'authenticated', 'authenticated',
    'coverage-race-worker-three@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6710000-0000-4000-8000-000000000014', 'authenticated', 'authenticated',
    'coverage-race-worker-four@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'worker'
where id in (
  'd6710000-0000-4000-8000-000000000011',
  'd6710000-0000-4000-8000-000000000012',
  'd6710000-0000-4000-8000-000000000013',
  'd6710000-0000-4000-8000-000000000014'
);

insert into public.customer_profiles(id, building_name, unit_number, district)
values
  ('d6710000-0000-4000-8000-000000000001', 'Coverage Race Building One', 'D671-1', 'q7'),
  ('d6710000-0000-4000-8000-000000000002', 'Coverage Race Building Two', 'D671-2', 'q7')
on conflict (id) do update
set building_name = excluded.building_name,
  unit_number = excluded.unit_number,
  district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status
) values
  ('d6710000-0000-4000-8000-000000000011', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Race Worker One', '1990-01-01', 'approved'),
  ('d6710000-0000-4000-8000-000000000012', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Race Worker Two', '1990-01-02', 'approved'),
  ('d6710000-0000-4000-8000-000000000013', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Race Worker Three', '1990-01-03', 'approved'),
  ('d6710000-0000-4000-8000-000000000014', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Race Worker Four', '1990-01-04', 'approved');

select * from public.record_worker_matching_heartbeat(
  'd6710000-0000-4000-8000-000000000011', now()
);
select * from public.record_worker_matching_heartbeat(
  'd6710000-0000-4000-8000-000000000012', now()
);
select * from public.record_worker_matching_heartbeat(
  'd6710000-0000-4000-8000-000000000013', now()
);
select * from public.record_worker_matching_heartbeat(
  'd6710000-0000-4000-8000-000000000014', now()
);

do $$
declare
  v_problem_id uuid;
begin
  select problem.id into strict v_problem_id
  from public.service_problems as problem
  join public.service_intake_policies as policy
    on policy.service_problem_id = problem.id
    and policy.status = 'active'
    and policy.quote_mode = 'rfq'
  where problem.service_type = 'plumbing'
    and problem.slug = 'plumbing-general'
    and problem.is_active;

  insert into public.kael_chat_sessions(
    id, customer_id, service_type, status, case_phase, diagnosis_scope,
    scheduled_at, safe_metadata
  ) values
    (
      'd6710000-0000-4000-8000-000000000101',
      'd6710000-0000-4000-8000-000000000001',
      'plumbing', 'active', 'offer_review',
      jsonb_build_object(
        'version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose',
        'case_phase', 'offer_review', 'facts', '{}'::jsonb,
        'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb,
        'scope_summary', 'Khảo sát và báo giá xử lý hệ thống nước trong căn hộ.',
        'quote_ready', false, 'quote_blockers', '["worker_quote_required"]'::jsonb,
        'worker_requirements', '[]'::jsonb,
        'next_action', '{"kind":"request_worker_quote"}'::jsonb
      ),
      now() + interval '1 day',
      jsonb_build_object(
        'address_district', 'q7', 'address_label', 'Coverage Race Building One D671-1',
        'problem_chips', jsonb_build_array('plumbing-general')
      )
    ),
    (
      'd6710000-0000-4000-8000-000000000102',
      'd6710000-0000-4000-8000-000000000002',
      'plumbing', 'active', 'offer_review',
      jsonb_build_object(
        'version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose',
        'case_phase', 'offer_review', 'facts', '{}'::jsonb,
        'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb,
        'scope_summary', 'Khảo sát và báo giá xử lý hệ thống nước trong căn hộ.',
        'quote_ready', false, 'quote_blockers', '["worker_quote_required"]'::jsonb,
        'worker_requirements', '[]'::jsonb,
        'next_action', '{"kind":"request_worker_quote"}'::jsonb
      ),
      now() + interval '1 day',
      jsonb_build_object(
        'address_district', 'q7', 'address_label', 'Coverage Race Building Two D671-2',
        'problem_chips', jsonb_build_array('plumbing-general')
      )
    );

  insert into public.kael_chat_turns(
    session_id, turn_index, role, content_type, safe_metadata
  ) values
    ('d6710000-0000-4000-8000-000000000101', 1, 'kael', 'analysis',
      jsonb_build_object('service_problem_id', v_problem_id)),
    ('d6710000-0000-4000-8000-000000000102', 1, 'kael', 'analysis',
      jsonb_build_object('service_problem_id', v_problem_id));
end;
$$;

select dblink_connect('coverage_capacity_a', :'dblink_connstr');
select dblink_connect('coverage_capacity_b', :'dblink_connstr');

select dblink_send_query('coverage_capacity_a', $remote$
  with confirmed as materialized (
    select *
    from public.confirm_kael_chat_durable_atomic_v3(
      'd6710000-0000-4000-8000-000000000101',
      'd6710000-0000-4000-8000-000000000001',
      'kael-confirm:d6710000-0000-4000-8000-000000000101:d6710000-0000-4000-8000-000000000001',
      'rfq_request',
      null
    )
  ), pause_after_confirmation as materialized (
    select pg_catalog.pg_sleep(1) from confirmed
  )
  select pg_catalog.row_to_json(confirmation_row)::text
  from confirmed as confirmation_row cross join pause_after_confirmation;
$remote$);

select dblink_send_query('coverage_capacity_b', $remote$
  with confirmed as materialized (
    select *
    from public.confirm_kael_chat_durable_atomic_v3(
      'd6710000-0000-4000-8000-000000000102',
      'd6710000-0000-4000-8000-000000000002',
      'kael-confirm:d6710000-0000-4000-8000-000000000102:d6710000-0000-4000-8000-000000000002',
      'rfq_request',
      null
    )
  ), pause_after_confirmation as materialized (
    select pg_catalog.pg_sleep(1) from confirmed
  )
  select pg_catalog.row_to_json(confirmation_row)::text
  from confirmed as confirmation_row cross join pause_after_confirmation;
$remote$);

create temporary table coverage_capacity_concurrent_results (payload jsonb not null);

insert into coverage_capacity_concurrent_results(payload)
select remote_result.payload::jsonb
from dblink_get_result('coverage_capacity_a') as remote_result(payload text);

insert into coverage_capacity_concurrent_results(payload)
select remote_result.payload::jsonb
from dblink_get_result('coverage_capacity_b') as remote_result(payload text);

select dblink_disconnect('coverage_capacity_a');
select dblink_disconnect('coverage_capacity_b');

do $$
declare
  v_winning_operation_id uuid;
begin
  if (
    select pg_catalog.count(*) <> 2
      or pg_catalog.count(*) filter (where payload->>'ok' = 'true') <> 1
      or pg_catalog.count(*) filter (
        where payload->>'ok' = 'false'
          and payload->>'error_code' = 'COVERAGE_UNAVAILABLE'
          and payload->>'job_id' is null
          and payload->>'operation_id' is null
      ) <> 1
    from coverage_capacity_concurrent_results
  ) then
    raise exception 'overlapping confirmations did not allocate capacity fail-closed';
  end if;

  select operation.id into strict v_winning_operation_id
  from public.confirmation_operations as operation
  where operation.session_id in (
    'd6710000-0000-4000-8000-000000000101',
    'd6710000-0000-4000-8000-000000000102'
  );

  if (
    select pg_catalog.count(*) <> 2
      or pg_catalog.count(*) filter (where session.job_id is not null) <> 1
    from public.kael_chat_sessions as session
    where session.id in (
      'd6710000-0000-4000-8000-000000000101',
      'd6710000-0000-4000-8000-000000000102'
    )
  ) then
    raise exception 'capacity loser retained a job projection';
  end if;

  if (select pg_catalog.count(*) from public.jobs as job
      where job.customer_id in (
        'd6710000-0000-4000-8000-000000000001',
        'd6710000-0000-4000-8000-000000000002'
      )) <> 1
    or (select pg_catalog.count(*) from public.workflow_outbox as outbox
      where outbox.operation_id = v_winning_operation_id) <> 2
    or (select pg_catalog.count(*) from public.matching_capacity_reservations as capacity
      where capacity.operation_id = v_winning_operation_id
        and capacity.status = 'held'
        and capacity.expires_at > now()) <> 3
    or (select pg_catalog.count(distinct capacity.worker_id)
      from public.matching_capacity_reservations as capacity
      where capacity.operation_id = v_winning_operation_id
        and capacity.status = 'held'
        and capacity.expires_at > now()) <> 3
  then
    raise exception 'concurrent capacity reservation cardinality is inconsistent';
  end if;

  if exists (
    select capacity.worker_id
    from public.matching_capacity_reservations as capacity
    where capacity.worker_id in (
      'd6710000-0000-4000-8000-000000000011',
      'd6710000-0000-4000-8000-000000000012',
      'd6710000-0000-4000-8000-000000000013',
      'd6710000-0000-4000-8000-000000000014'
    )
      and capacity.status in ('held', 'offered')
      and capacity.expires_at > now()
    group by capacity.worker_id
    having pg_catalog.count(distinct capacity.operation_id) > 1
  ) then
    raise exception 'one Worker was reserved by overlapping operations';
  end if;
end;
$$;

delete from public.jobs where customer_id in (
  'd6710000-0000-4000-8000-000000000001',
  'd6710000-0000-4000-8000-000000000002'
);
delete from public.kael_chat_sessions where id in (
  'd6710000-0000-4000-8000-000000000101',
  'd6710000-0000-4000-8000-000000000102'
);
delete from auth.users where id in (
  'd6710000-0000-4000-8000-000000000001',
  'd6710000-0000-4000-8000-000000000002',
  'd6710000-0000-4000-8000-000000000011',
  'd6710000-0000-4000-8000-000000000012',
  'd6710000-0000-4000-8000-000000000013',
  'd6710000-0000-4000-8000-000000000014'
);

\if :dblink_preexisting
\else
drop extension dblink;
\endif

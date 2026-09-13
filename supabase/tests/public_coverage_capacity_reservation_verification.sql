-- P67: rollback-only proof for aggregate coverage, identity privacy, atomic capacity leases,
-- duplicate confirmation recovery, and reservation-bound durable fan-out.

begin;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d6700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'coverage-customer-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'coverage-customer-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6700000-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
    'coverage-worker-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6700000-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
    'coverage-worker-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6700000-0000-4000-8000-000000000013', 'authenticated', 'authenticated',
    'coverage-worker-three@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6700000-0000-4000-8000-000000000014', 'authenticated', 'authenticated',
    'coverage-worker-four@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'worker'
where id in (
  'd6700000-0000-4000-8000-000000000011',
  'd6700000-0000-4000-8000-000000000012',
  'd6700000-0000-4000-8000-000000000013',
  'd6700000-0000-4000-8000-000000000014'
);

insert into public.customer_profiles(id, building_name, unit_number, district)
values
  ('d6700000-0000-4000-8000-000000000001', 'Coverage Building One', 'D67-1', 'q7'),
  ('d6700000-0000-4000-8000-000000000002', 'Coverage Building Two', 'D67-2', 'q7')
on conflict (id) do update
set building_name = excluded.building_name,
  unit_number = excluded.unit_number,
  district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status
) values
  ('d6700000-0000-4000-8000-000000000011', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Worker One', '1990-01-01', 'approved'),
  ('d6700000-0000-4000-8000-000000000012', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Worker Two', '1990-01-02', 'approved'),
  ('d6700000-0000-4000-8000-000000000013', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, false, 'Coverage Worker Three', '1990-01-03', 'approved'),
  ('d6700000-0000-4000-8000-000000000014', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, false, 'Coverage Worker Four', '1990-01-04', 'approved');

select * from public.record_worker_matching_heartbeat(
  'd6700000-0000-4000-8000-000000000011', now()
);
select * from public.record_worker_matching_heartbeat(
  'd6700000-0000-4000-8000-000000000012', now()
);
select * from public.record_worker_matching_heartbeat(
  'd6700000-0000-4000-8000-000000000013', now()
);
select * from public.record_worker_matching_heartbeat(
  'd6700000-0000-4000-8000-000000000014', now()
);

do $$
declare
  v_problem_id uuid;
begin
  select problem.id into strict v_problem_id
  from public.service_problems as problem
  where problem.service_type = 'plumbing' and problem.is_active
  order by problem.slug
  limit 1;

  update public.service_intake_policies as policy
  set quote_mode = 'rfq'
  where policy.service_problem_id = v_problem_id
    and policy.status = 'active';

  insert into public.kael_chat_sessions(
    id, customer_id, service_type, status, case_phase, diagnosis_scope,
    scheduled_at, safe_metadata
  ) values
    (
      'd6700000-0000-4000-8000-000000000101',
      'd6700000-0000-4000-8000-000000000001',
      'plumbing', 'active', 'offer_review',
      jsonb_build_object(
        'version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose',
        'case_phase', 'offer_review', 'facts', '{}'::jsonb,
        'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb,
        'scope_summary', 'Khảo sát và báo giá xử lý đường ống bị rò nước trong căn hộ.',
        'quote_ready', false, 'quote_blockers', '["worker_quote_required"]'::jsonb,
        'worker_requirements', '[]'::jsonb,
        'next_action', '{"kind":"request_worker_quote"}'::jsonb
      ),
      now() + interval '1 day',
      jsonb_build_object(
        'address_district', 'q7', 'address_label', 'Coverage Building One D67-1',
        'problem_chips', jsonb_build_array('pipe_leak')
      )
    ),
    (
      'd6700000-0000-4000-8000-000000000102',
      'd6700000-0000-4000-8000-000000000002',
      'plumbing', 'active', 'offer_review',
      jsonb_build_object(
        'version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose',
        'case_phase', 'offer_review', 'facts', '{}'::jsonb,
        'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb,
        'scope_summary', 'Khảo sát và báo giá xử lý đường ống bị rò nước trong căn hộ.',
        'quote_ready', false, 'quote_blockers', '["worker_quote_required"]'::jsonb,
        'worker_requirements', '[]'::jsonb,
        'next_action', '{"kind":"request_worker_quote"}'::jsonb
      ),
      now() + interval '1 day',
      jsonb_build_object(
        'address_district', 'q7', 'address_label', 'Coverage Building Two D67-2',
        'problem_chips', jsonb_build_array('pipe_leak')
      )
    );

  insert into public.kael_chat_turns(
    session_id, turn_index, role, content_type, safe_metadata
  ) values
    ('d6700000-0000-4000-8000-000000000101', 1, 'kael', 'analysis',
      jsonb_build_object('service_problem_id', v_problem_id)),
    ('d6700000-0000-4000-8000-000000000102', 1, 'kael', 'analysis',
      jsonb_build_object('service_problem_id', v_problem_id));
end;
$$;

set local role service_role;
set local request.jwt.claim.sub = 'd6700000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_readiness record;
begin
  select * into strict v_readiness
  from public.get_service_coverage_readiness(
    'd6700000-0000-4000-8000-000000000001', 'plumbing', 'q7'
  );
  if v_readiness.status <> 'closed'
    or v_readiness.minimum_worker_count <> 3
    or v_readiness.eligible_reachable_worker_count <> 2
    or v_readiness.reason_code <> 'INSUFFICIENT_ELIGIBLE_WORKERS'
  then
    raise exception 'two Workers opened public coverage: %', row_to_json(v_readiness);
  end if;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    perform 1 from public.matching_capacity_reservations;
    raise exception 'Customer read server-owned reservation identities';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

update public.worker_profiles
set is_available = true
where id in (
  'd6700000-0000-4000-8000-000000000013',
  'd6700000-0000-4000-8000-000000000014'
);

set local role service_role;
set local request.jwt.claim.sub = 'd6700000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_readiness record;
begin
  select * into strict v_readiness
  from public.get_service_coverage_readiness(
    'd6700000-0000-4000-8000-000000000001', 'plumbing', 'Quận 7'
  );
  if v_readiness.status <> 'ready'
    or v_readiness.district_code <> 'q7'
    or v_readiness.eligible_reachable_worker_count <> 4
    or v_readiness.reason_code <> 'READY'
  then
    raise exception 'four Workers did not open canonical q7 coverage: %', row_to_json(v_readiness);
  end if;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd6700000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    perform * from public.get_service_coverage_readiness(
      'd6700000-0000-4000-8000-000000000001', 'plumbing', 'q7'
    );
    raise exception 'Customer queried coverage using another Customer identity';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_first_job_id uuid;
  v_index integer;
  v_result record;
begin
  for v_index in 1..100 loop
    select * into strict v_result
    from public.confirm_kael_chat_durable_atomic_v3(
      'd6700000-0000-4000-8000-000000000101',
      'd6700000-0000-4000-8000-000000000001',
      'kael-confirm:d6700000-0000-4000-8000-000000000101:d6700000-0000-4000-8000-000000000001',
      'rfq_request',
      null
    );
    if not v_result.ok then
      raise exception 'capacity-backed confirmation failed: %', v_result.error_code;
    end if;
    if v_index = 1 then
      v_first_job_id := v_result.job_id;
    elsif v_result.job_id is distinct from v_first_job_id or not v_result.already_applied then
      raise exception 'duplicate confirmation did not recover the same reserved job';
    end if;
  end loop;

  if (select count(*) from public.jobs where id = v_first_job_id) <> 1
    or (select count(*) from public.confirmation_operations
      where session_id = 'd6700000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.matching_capacity_reservations
      where job_id = v_first_job_id and status = 'held' and expires_at > now()) <> 3
    or (select count(distinct worker_id) from public.matching_capacity_reservations
      where job_id = v_first_job_id and status = 'held' and expires_at > now()) <> 3
  then
    raise exception 'confirmation or reservation exactly-once cardinality failed';
  end if;

  select * into strict v_result
  from public.confirm_kael_chat_durable_atomic_v3(
    'd6700000-0000-4000-8000-000000000102',
    'd6700000-0000-4000-8000-000000000002',
    'kael-confirm:d6700000-0000-4000-8000-000000000102:d6700000-0000-4000-8000-000000000002',
    'rfq_request',
    null
  );
  if v_result.ok or v_result.error_code <> 'COVERAGE_UNAVAILABLE' then
    raise exception 'capacity race did not fail closed: %', row_to_json(v_result);
  end if;
  if exists (
    select 1 from public.confirmation_operations
    where session_id = 'd6700000-0000-4000-8000-000000000102'
  ) or exists (
    select 1 from public.jobs
    where customer_id = 'd6700000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from public.kael_chat_sessions
    where id = 'd6700000-0000-4000-8000-000000000102' and job_id is not null
  ) then
    raise exception 'failed capacity confirmation leaked a job or operation';
  end if;
end;
$$;

do $$
declare
  v_delivery_count integer;
  v_job_id uuid;
  v_reserved_worker_ids uuid[];
  v_sent_at timestamptz := date_trunc('milliseconds', clock_timestamp());
begin
  select session.job_id into strict v_job_id
  from public.kael_chat_sessions as session
  where session.id = 'd6700000-0000-4000-8000-000000000101';

  update public.jobs set status = 'broadcasting' where id = v_job_id;

  begin
    perform * from public.activate_job_broadcast_batch_durable_atomic_v2(
      v_job_id,
      array['d6700000-0000-4000-8000-000000000014']::uuid[],
      gen_random_uuid(),
      v_sent_at,
      v_sent_at + interval '5 minutes'
    );
    raise exception 'unreserved Worker entered durable fan-out';
  exception when sqlstate '55000' then
    if sqlerrm not like '%MATCHING_RESERVATION_REQUIRED%' then raise; end if;
  end;

  select array_agg(worker_id order by worker_id) into strict v_reserved_worker_ids
  from public.get_matching_capacity_reservation_worker_ids(v_job_id);
  select count(*) into v_delivery_count
  from public.activate_job_broadcast_batch_durable_atomic_v2(
    v_job_id,
    v_reserved_worker_ids,
    gen_random_uuid(),
    v_sent_at,
    v_sent_at + interval '5 minutes'
  );
  if v_delivery_count <> 3 then
    raise exception 'reservation-bound fan-out created % recipients instead of 3', v_delivery_count;
  end if;
  if (select count(*) from public.matching_capacity_reservations
      where job_id = v_job_id and status = 'offered') <> 3
  then
    raise exception 'fan-out did not promote held reservations to offered';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege(
      'authenticated', 'public.matching_capacity_reservations', 'select'
    )
    or not has_table_privilege(
      'service_role', 'public.matching_capacity_reservations', 'select,insert,update,delete'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_service_coverage_readiness(uuid,public.service_type,text)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.confirm_kael_chat_durable_atomic_v3(uuid,uuid,text,text,text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.confirm_kael_chat_durable_atomic_v3(uuid,uuid,text,text,text)',
      'execute'
    )
  then
    raise exception 'coverage reservation least-privilege contract failed';
  end if;
end;
$$;

reset role;

rollback;

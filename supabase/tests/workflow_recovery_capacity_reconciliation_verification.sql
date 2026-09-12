-- P70: rollback-only proof for stuck workflow observation and bounded capacity recovery.

begin;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'recovery-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d7000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'recovery-worker-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d7000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'recovery-worker-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d7000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
    'recovery-admin@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = case
  when id in (
    'd7000000-0000-4000-8000-000000000002',
    'd7000000-0000-4000-8000-000000000003'
  ) then 'worker'::public.user_role
  when id = 'd7000000-0000-4000-8000-000000000004'
    then 'admin'::public.user_role
  else role
end
where id in (
  'd7000000-0000-4000-8000-000000000002',
  'd7000000-0000-4000-8000-000000000003',
  'd7000000-0000-4000-8000-000000000004'
);

insert into public.customer_profiles(id, building_name, unit_number, district)
values ('d7000000-0000-4000-8000-000000000001', 'Recovery Building', 'D700', 'q7')
on conflict (id) do update
set building_name = excluded.building_name,
  unit_number = excluded.unit_number,
  district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status
) values
  (
    'd7000000-0000-4000-8000-000000000002',
    array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
    5, array['q7'], array[]::text[], true, true,
    'Recovery Worker One', '1990-01-01', 'approved'
  ),
  (
    'd7000000-0000-4000-8000-000000000003',
    array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
    5, array['q7'], array[]::text[], true, true,
    'Recovery Worker Two', '1990-01-02', 'approved'
  );

insert into public.jobs(
  id, customer_id, worker_id, service_type, description, address_district,
  status, quote_mode, created_at, updated_at
) values
  (
    'd7000000-0000-4000-8000-000000000101',
    'd7000000-0000-4000-8000-000000000001', null,
    'plumbing', 'Broadcast recovery verification.', 'q7',
    'broadcasting', 'rfq', now() - interval '2 hours', now() - interval '1 hour'
  ),
  (
    'd7000000-0000-4000-8000-000000000102',
    'd7000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000003',
    'plumbing', 'Arrival recovery verification.', 'q7',
    'arrived', 'rfq', now() - interval '8 hours', now() - interval '5 hours'
  ),
  (
    'd7000000-0000-4000-8000-000000000103',
    'd7000000-0000-4000-8000-000000000001', null,
    'plumbing', 'Trigger release verification.', 'q7',
    'broadcasting', 'rfq', now(), now()
  );

insert into public.kael_chat_sessions(
  id, customer_id, service_type, status, case_phase, safe_metadata
) values
  ('d7000000-0000-4000-8000-000000000201', 'd7000000-0000-4000-8000-000000000001',
    'plumbing', 'active', 'matching', '{}'::jsonb),
  ('d7000000-0000-4000-8000-000000000202', 'd7000000-0000-4000-8000-000000000001',
    'plumbing', 'active', 'matching', '{}'::jsonb),
  ('d7000000-0000-4000-8000-000000000203', 'd7000000-0000-4000-8000-000000000001',
    'plumbing', 'active', 'matching', '{}'::jsonb);

insert into public.confirmation_operations(
  id, idempotency_key, session_id, customer_id, job_id, quote_mode,
  confirmation_kind, state, support_code, accepted_at, updated_at
) values
  (
    'd7000000-0000-4000-8000-000000000301', 'recovery-operation-job-101',
    'd7000000-0000-4000-8000-000000000201', 'd7000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000101', 'rfq', 'rfq_request',
    'recovery_required', 'D7000101', now() - interval '1 hour', now() - interval '1 hour'
  ),
  (
    'd7000000-0000-4000-8000-000000000302', 'recovery-operation-job-102',
    'd7000000-0000-4000-8000-000000000202', 'd7000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000102', 'rfq', 'rfq_request',
    'official_match', 'D7000102', now() - interval '8 hours', now() - interval '5 hours'
  ),
  (
    'd7000000-0000-4000-8000-000000000303', 'recovery-operation-job-103',
    'd7000000-0000-4000-8000-000000000203', 'd7000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000103', 'rfq', 'rfq_request',
    'broadcasting', 'D7000103', now(), now()
  );

insert into public.matching_operations(
  id, confirmation_operation_id, job_id, state, created_at, updated_at
) values
  (
    'd7000000-0000-4000-8000-000000000401',
    'd7000000-0000-4000-8000-000000000301',
    'd7000000-0000-4000-8000-000000000101',
    'recovery_required', now() - interval '1 hour', now() - interval '1 hour'
  ),
  (
    'd7000000-0000-4000-8000-000000000402',
    'd7000000-0000-4000-8000-000000000302',
    'd7000000-0000-4000-8000-000000000102',
    'official_match', now() - interval '8 hours', now() - interval '5 hours'
  ),
  (
    'd7000000-0000-4000-8000-000000000403',
    'd7000000-0000-4000-8000-000000000303',
    'd7000000-0000-4000-8000-000000000103',
    'broadcasting', now(), now()
  );

insert into public.matching_capacity_reservations(
  operation_id, job_id, worker_id, service_type, district_code,
  status, held_at, expires_at
) values
  (
    'd7000000-0000-4000-8000-000000000301',
    'd7000000-0000-4000-8000-000000000101',
    'd7000000-0000-4000-8000-000000000002',
    'plumbing', 'q7', 'offered', now() - interval '10 minutes', now() - interval '5 minutes'
  ),
  (
    'd7000000-0000-4000-8000-000000000302',
    'd7000000-0000-4000-8000-000000000102',
    'd7000000-0000-4000-8000-000000000003',
    'plumbing', 'q7', 'offered', now() - interval '1 minute', now() + interval '4 minutes'
  );

set local role authenticated;
set local request.jwt.claim.sub = 'd7000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $client_boundary$
begin
  begin
    perform 1 from public.workflow_recovery_cases;
    raise exception 'Customer read workflow recovery cases';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.detect_workflow_recovery_cases(now());
    raise exception 'Customer invoked workflow recovery detector';
  exception when insufficient_privilege then null;
  end;
end;
$client_boundary$;

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $detector$
declare
  v_result record;
  v_before_status_101 public.job_status;
  v_before_status_102 public.job_status;
begin
  select status into strict v_before_status_101
  from public.jobs where id = 'd7000000-0000-4000-8000-000000000101';
  select status into strict v_before_status_102
  from public.jobs where id = 'd7000000-0000-4000-8000-000000000102';

  select * into strict v_result
  from public.detect_workflow_recovery_cases(now());

  if v_result.detected_count < 2
    or v_result.expired_reservation_count <> 1
    or v_result.released_reservation_count <> 1
  then
    raise exception 'detector receipt mismatch: %', row_to_json(v_result);
  end if;
  if (select count(*) from public.workflow_recovery_cases
      where job_id in (
        'd7000000-0000-4000-8000-000000000101',
        'd7000000-0000-4000-8000-000000000102'
      ) and status = 'open') <> 2
  then
    raise exception 'detector did not create exactly two active recovery cases';
  end if;
  if (select status from public.jobs where id = 'd7000000-0000-4000-8000-000000000101')
      is distinct from v_before_status_101
    or (select status from public.jobs where id = 'd7000000-0000-4000-8000-000000000102')
      is distinct from v_before_status_102
  then
    raise exception 'detector changed a job state';
  end if;
  if (select status from public.matching_capacity_reservations
      where job_id = 'd7000000-0000-4000-8000-000000000101') <> 'expired'
    or (select status from public.matching_capacity_reservations
      where job_id = 'd7000000-0000-4000-8000-000000000102') <> 'released'
  then
    raise exception 'capacity reconciliation did not distinguish expiry from obsolete lease';
  end if;
end;
$detector$;

do $admin_actions$
declare
  v_case public.workflow_recovery_cases%rowtype;
  v_result record;
begin
  select recovery.* into strict v_case
  from public.workflow_recovery_cases as recovery
  where recovery.job_id = 'd7000000-0000-4000-8000-000000000101';

  select * into strict v_result
  from public.admin_apply_workflow_recovery_action_atomic(
    v_case.id,
    'd7000000-0000-4000-8000-000000000001',
    'acknowledge',
    'Customer must not administer recovery.',
    'd7000000-0000-4000-8000-000000000501',
    v_case.version
  );
  if v_result.ok or v_result.error_code <> 'OPERATIONS_TRIAGE_REQUIRED' then
    raise exception 'non-Admin recovery action was accepted: %', row_to_json(v_result);
  end if;

  select * into strict v_result
  from public.admin_apply_workflow_recovery_action_atomic(
    v_case.id,
    'd7000000-0000-4000-8000-000000000004',
    'acknowledge',
    'Admin acknowledged the matching recovery case.',
    'd7000000-0000-4000-8000-000000000502',
    v_case.version
  );
  if not v_result.ok or v_result.status <> 'acknowledged' or v_result.already_applied then
    raise exception 'Admin acknowledgement failed: %', row_to_json(v_result);
  end if;

  select * into strict v_result
  from public.admin_apply_workflow_recovery_action_atomic(
    v_case.id,
    'd7000000-0000-4000-8000-000000000004',
    'acknowledge',
    'Admin acknowledged the matching recovery case.',
    'd7000000-0000-4000-8000-000000000502',
    v_case.version
  );
  if not v_result.ok or not v_result.already_applied then
    raise exception 'Admin action idempotency failed: %', row_to_json(v_result);
  end if;

  select * into strict v_case
  from public.workflow_recovery_cases
  where id = v_case.id;
  select * into strict v_result
  from public.admin_apply_workflow_recovery_action_atomic(
    v_case.id,
    'd7000000-0000-4000-8000-000000000004',
    'resolve_verified',
    'Attempted resolution while workflow remains stuck.',
    'd7000000-0000-4000-8000-000000000503',
    v_case.version
  );
  if v_result.ok or v_result.error_code <> 'CASE_STILL_STUCK' then
    raise exception 'stuck case was falsely resolved: %', row_to_json(v_result);
  end if;

  update public.jobs
  set status = 'worker_matched', updated_at = now()
  where id = v_case.job_id;
  update public.matching_operations
  set state = 'official_match', updated_at = now()
  where job_id = v_case.job_id;

  select * into strict v_result
  from public.admin_apply_workflow_recovery_action_atomic(
    v_case.id,
    'd7000000-0000-4000-8000-000000000004',
    'resolve_verified',
    'Workflow advanced through the public state contract.',
    'd7000000-0000-4000-8000-000000000504',
    v_case.version
  );
  if not v_result.ok or v_result.status <> 'resolved'
    or (select count(*) from public.workflow_recovery_action_audit
      where recovery_case_id = v_case.id) <> 2
  then
    raise exception 'verified recovery resolution failed: %', row_to_json(v_result);
  end if;
end;
$admin_actions$;

insert into public.matching_capacity_reservations(
  operation_id, job_id, worker_id, service_type, district_code,
  status, held_at, expires_at
) values (
  'd7000000-0000-4000-8000-000000000303',
  'd7000000-0000-4000-8000-000000000103',
  'd7000000-0000-4000-8000-000000000002',
  'plumbing', 'q7', 'held', now(), now() + interval '5 minutes'
);

update public.jobs
set status = 'cancelled'
where id = 'd7000000-0000-4000-8000-000000000103';

do $trigger_release$
begin
  if (select status from public.matching_capacity_reservations
      where job_id = 'd7000000-0000-4000-8000-000000000103') <> 'released'
  then
    raise exception 'job terminal transition did not release the active capacity lease';
  end if;
end;
$trigger_release$;

select jsonb_build_object(
  'stuck_cases', 2,
  'job_state_mutations_by_detector', 0,
  'expired_capacity', 1,
  'obsolete_capacity', 1,
  'admin_actions_audited', true,
  'false_resolution_blocked', true,
  'terminal_trigger_release', true
) as workflow_recovery_capacity_reconciliation;

rollback;

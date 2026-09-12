-- @pillar id: P117-customer-cancellation-durability-sql
-- @pillar invariant: Customer cancellation retires matching, delivery and capacity in the same commit, without allowing stale dispatch to revive the job
-- @pillar authority: governance/RULES.md #7 and #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260906010000_customer_cancellation_durable_projection.sql
-- @pillar layer: sql
-- @pillar siblings: P116-customer-cancellation-http, P98-confirmation-outbox-state-authority-sql
-- @pillar mutation: Omit cancellation projection; the persisted operation remains broadcasting after the job is cancelled

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-customer-cancel-p117');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('c1170000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'customer-cancel-p117-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i = 3 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-customer-cancel-p117', v_actor,
      case when i = 3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i = 3 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Cancellation fixture', '1990-01-01',
        'approved', 'synthetic-customer-cancel-p117');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('c1170000-0000-4000-8000-000000000101', 'c1170000-0000-4000-8000-000000000001',
  'plumbing', 'Customer cancellation fixture', 'q7', 'broadcasting', 'rfq'),
  ('c1170000-0000-4000-8000-000000000102','c1170000-0000-4000-8000-000000000002',
  'plumbing','Foreign cancellation fixture','q7','broadcasting','rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('c1170000-0000-4000-8000-000000000201', 'c1170000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('c1170000-0000-4000-8000-000000000301', 'customer-cancellation-operation-p117',
  'c1170000-0000-4000-8000-000000000201', 'c1170000-0000-4000-8000-000000000001',
  'c1170000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'broadcasting', 'P1170101',
  'synthetic-customer-cancel-p117');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('c1170000-0000-4000-8000-000000000401', 'c1170000-0000-4000-8000-000000000301',
  'c1170000-0000-4000-8000-000000000101', 'broadcasting', 'synthetic-customer-cancel-p117');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('c1170000-0000-4000-8000-000000000301', 'c1170000-0000-4000-8000-000000000101',
  'c1170000-0000-4000-8000-000000000003', 'plumbing', 'q7', 'held', now(), now()+interval '5 minutes',
  'synthetic-customer-cancel-p117');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'c1170000-0000-4000-8000-000000000101', array['c1170000-0000-4000-8000-000000000003']::uuid[],
  'c1170000-0000-4000-8000-000000000501', now(), now()+interval '5 minutes');
insert into public.workflow_outbox(id, operation_id, event_type, status, attempt_count, lease_token,
  leased_by, lease_expires_at)
values ('c1170000-0000-4000-8000-000000000601', 'c1170000-0000-4000-8000-000000000301',
  'matching_requested', 'processing', 1, 'c1170000-0000-4000-8000-000000000602',
  'customer-cancellation-fixture-p117', now()+interval '45 seconds');

savepoint before_cancellation;
do $cancellation$
declare
  v_job constant uuid := 'c1170000-0000-4000-8000-000000000101';
  v_customer constant uuid := 'c1170000-0000-4000-8000-000000000001';
  v_result record;
  v_outcome text;
  v_cancelled_at timestamptz;
begin
  if (select count(*) from public.matching_recipient_deliveries where job_id=v_job) <> 1 then
    raise exception 'P117_DURABLE_OFFER_FIXTURE_MISSING';
  end if;
  select * into strict v_result from public.cancel_job_before_accept_atomic(
    v_job, 'c1170000-0000-4000-8000-000000000002');
  if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND'
    or (select status from public.jobs where id=v_job) <> 'broadcasting' then
    raise exception 'P117_FOREIGN_CUSTOMER_CANCELLED_JOB';
  end if;
  select * into strict v_result from public.cancel_job_before_accept_atomic(v_job, v_customer);
  if not v_result.ok or v_result.job_status <> 'cancelled' then
    raise exception 'P117_DIRECT_CANCELLATION_FAILED: %', row_to_json(v_result);
  end if;
  if exists (select 1 from public.matching_capacity_reservations
    where job_id=v_job and status in ('held','offered')) then
    raise exception 'P117_CANCELLED_JOB_RETAINS_CAPACITY';
  end if;
  if exists (select 1 from public.confirmation_operations where job_id=v_job and state <> 'stopped')
    or exists (select 1 from public.matching_operations where job_id=v_job and state <> 'stopped') then
    raise exception 'P117_CANCELLED_JOB_RETAINS_ACTIVE_OPERATION';
  end if;
  v_cancelled_at := v_result.cancelled_at_ts;
  if exists (select 1 from public.workflow_outbox
    where operation_id='c1170000-0000-4000-8000-000000000301'
      and (status <> 'completed' or lease_token is not null or leased_by is not null or lease_expires_at is not null)) then
    raise exception 'P117_CANCELLED_JOB_RETAINS_DISPATCH_LEASE';
  end if;
  if exists (select 1 from public.job_broadcasts where job_id=v_job and status <> 'cancelled')
    or exists (select 1 from public.matching_recipient_deliveries where job_id=v_job and status <> 'expired') then
    raise exception 'P117_CANCELLED_JOB_RETAINS_ACTIVE_OFFER';
  end if;
  v_outcome := public.settle_confirmation_matching_outbox_claim(
    'c1170000-0000-4000-8000-000000000601', 'c1170000-0000-4000-8000-000000000602',
    'c1170000-0000-4000-8000-000000000301', 'broadcasting', null);
  if v_outcome is distinct from 'lease_lost' then
    raise exception 'P117_STALE_DISPATCH_LEASE_SURVIVED';
  end if;
  for i in 1..100 loop
    select * into strict v_result from public.cancel_job_before_accept_atomic(v_job, v_customer);
    if v_result.ok or v_result.error_code is distinct from 'INVALID_STATUS'
      or v_result.job_status is distinct from 'cancelled' then
      raise exception 'P117_REPLAY_CHANGED_CANCELLATION: %', i;
    end if;
  end loop;
  if (select cancelled_at from public.jobs where id=v_job) is distinct from v_cancelled_at
    or (select state from public.confirmation_operations where job_id=v_job) <> 'stopped' then
    raise exception 'P117_REPLAY_CHANGED_TERMINAL_RECEIPT';
  end if;
  if has_function_privilege('authenticated', 'public.cancel_job_before_accept_atomic(uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'public.cancel_job_before_accept_atomic(uuid,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.cancel_job_before_accept_atomic(uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'private.retire_cancelled_job_matching()', 'execute')
    or has_function_privilege('anon', 'private.retire_cancelled_job_matching()', 'execute') then
    raise exception 'P117_CANCELLATION_EXECUTE_PRIVILEGE_LEAK';
  end if;
end;
$cancellation$;

rollback to before_cancellation;
do $candidate_authority$
declare
  v_job constant uuid := 'c1170000-0000-4000-8000-000000000101';
  v_worker constant uuid := 'c1170000-0000-4000-8000-000000000003';
  v_customer constant uuid := 'c1170000-0000-4000-8000-000000000001';
  v_broadcast uuid;
  v_candidate record;
  v_result record;
  v_role public.user_role;
begin
  select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_worker;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if not v_candidate.ok then raise exception 'P117_CANDIDATE_FIXTURE_FAILED: %',row_to_json(v_candidate); end if;
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(
    'c1170000-0000-4000-8000-000000000102',v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if v_result.ok or v_result.candidate_id is not null or v_result.proposal_id is not null then
    raise exception 'P117_FOREIGN_JOB_REPLAY_EXPOSED_CANDIDATE';
  end if;
  update public.profiles set role='admin' where id=v_worker;
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if v_result.ok then raise exception 'P117_NON_WORKER_REPLAY_ACCEPTED'; end if;
  update public.profiles set role='worker' where id=v_worker;
  select * into strict v_result from public.cancel_job_before_accept_atomic(v_job,null);
  if v_result.ok or (select status from public.job_worker_candidates where id=v_candidate.candidate_id) <> 'proposed' then
    raise exception 'P117_NULL_CUSTOMER_WITHDREW_CANDIDATE';
  end if;
  if v_result.error_code is distinct from 'NOT_FOUND' then raise exception 'P117_NULL_CUSTOMER_NOT_DENIED_EARLY'; end if;
  foreach v_role in array array['admin','worker']::public.user_role[] loop
    update public.profiles set role=v_role where id=v_customer;
    select * into strict v_result from public.cancel_job_before_accept_atomic(v_job,v_customer);
    if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND'
      or (select status from public.job_worker_candidates where id=v_candidate.candidate_id) <> 'proposed'
      or (select status from public.jobs where id=v_job) <> 'worker_candidate_pending' then
      raise exception 'P117_NON_CUSTOMER_WITHDREW_CANDIDATE: %',v_role;
    end if;
  end loop;
  update public.profiles set role='customer' where id=v_customer;
  select * into strict v_result from public.cancel_job_before_accept_atomic(v_job,v_customer);
  if not v_result.ok or v_result.job_status is distinct from 'cancelled'
    or (select status from public.job_worker_candidates where id=v_candidate.candidate_id) <> 'customer_declined'
    or exists(select 1 from public.matching_capacity_reservations where job_id=v_job and status in ('held','offered'))
    or exists(select 1 from public.matching_operations where job_id=v_job and state <> 'stopped') then
    raise exception 'P117_VALID_CUSTOMER_CANDIDATE_CANCELLATION_FAILED';
  end if;
  if exists(select 1 from public.worker_matching_proposals where job_id=v_job and status='proposed') then
    raise exception 'P117_CANCELLED_CANDIDATE_RETAINS_OPEN_PROPOSAL';
  end if;
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if v_result.ok then
    raise exception 'P117_LATE_PROPOSAL_FALSE_SUCCESS: %',row_to_json(v_result);
  end if;
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(
    v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if v_result.ok or v_result.error_code is distinct from 'DELIVERY_NOT_ACTIVE' then
    raise exception 'P117_PUBLIC_OVERLOAD_LATE_PROPOSAL_FALSE_SUCCESS';
  end if;
  if (select status from public.jobs where id=v_job) <> 'cancelled'
    or (select count(*) from public.job_worker_candidates where job_id=v_job) <> 1
    or exists(select 1 from public.job_worker_candidates where job_id=v_job and status='proposed') then
    raise exception 'P117_LATE_WORKER_PROPOSAL_REVIVED_CANCELLED_JOB';
  end if;
end;
$candidate_authority$;

select 'P117 customer cancellation durable projection passed' as result;
rollback;

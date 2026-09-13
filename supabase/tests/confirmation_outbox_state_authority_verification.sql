-- @pillar id: P98-confirmation-outbox-state-authority-sql
-- @pillar invariant: A delayed matching outbox settlement cannot regress a newer Worker proposal or Customer-confirmed assignment.
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905130000_confirmation_outbox_state_authority.sql
-- @pillar layer: sql
-- @pillar siblings: P58-confirmation-outbox-dispatcher, P96-matching-candidate-capacity-sql
-- @pillar mutation: Restore unconditional settlement state writes; delayed broadcasting overwrites candidate_ready and the state-authority assertion raises.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p98');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('d9800000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p98-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p98', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p98');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('d9800000-0000-4000-8000-000000000101', 'd9800000-0000-4000-8000-000000000001',
  'plumbing', 'Candidate capacity fixture', 'q7', 'broadcasting', 'rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('d9800000-0000-4000-8000-000000000201', 'd9800000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('d9800000-0000-4000-8000-000000000301', 'candidate-operation-p98',
  'd9800000-0000-4000-8000-000000000201', 'd9800000-0000-4000-8000-000000000001',
  'd9800000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P9600101',
  'synthetic-candidate-p98');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('d9800000-0000-4000-8000-000000000401', 'd9800000-0000-4000-8000-000000000301',
  'd9800000-0000-4000-8000-000000000101', 'queued', 'synthetic-candidate-p98');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'd9800000-0000-4000-8000-000000000301', 'd9800000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-candidate-p98'
from public.worker_profiles where id in (
  'd9800000-0000-4000-8000-000000000002', 'd9800000-0000-4000-8000-000000000003');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'd9800000-0000-4000-8000-000000000101',
  array['d9800000-0000-4000-8000-000000000002', 'd9800000-0000-4000-8000-000000000003']::uuid[],
  'd9800000-0000-4000-8000-000000000501', now(), now() + interval '5 minutes');


insert into public.workflow_outbox(id,operation_id,event_type,status,attempt_count,lease_token,leased_by,lease_expires_at)
values ('d9800000-0000-4000-8000-000000000601','d9800000-0000-4000-8000-000000000301',
  'matching_requested','processing',1,'d9800000-0000-4000-8000-000000000602','outbox-fixture-p98',now()+interval '45 seconds');

savepoint settlement_base;
do $authority$
declare
  v_job constant uuid := 'd9800000-0000-4000-8000-000000000101';
  v_worker constant uuid := 'd9800000-0000-4000-8000-000000000002';
  v_outbox constant uuid := 'd9800000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd9800000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd9800000-0000-4000-8000-000000000301';
  v_candidate uuid; v_result record; v_outcome text; v_state text; v_new_matching uuid;
begin
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(v_job,
    (select id from public.job_broadcasts where job_id=v_job and worker_id=v_worker),
    v_worker,'Kiểm tra rò nước và báo giá phạm vi xử lý.',200000,300000);
  if not v_result.ok then raise exception 'P98_PROPOSAL_FIXTURE_FAILED: %',row_to_json(v_result); end if;
  v_candidate := v_result.candidate_id;
  foreach v_state in array array['broadcasting','no_reachable_worker','recovery_required'] loop
    update public.workflow_outbox set status='processing',lease_token=v_token,
      lease_expires_at=clock_timestamp()+interval '45 seconds' where id=v_outbox;
    v_outcome := public.settle_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation,
      v_state,case when v_state='recovery_required' then 'SIMULATED_RESTART' end);
    if v_outcome is distinct from 'completed'
      or (select state from public.confirmation_operations where id=v_operation) <> 'candidate_ready'
      or (select state from public.matching_operations where job_id=v_job) <> 'candidate_ready'
      or (select status from public.jobs where id=v_job) <> 'worker_candidate_pending'
    then raise exception 'P98_DELAYED_DISPATCH_REGRESSED_CANDIDATE: %',v_state; end if;
  end loop;

  select * into strict v_result from public.confirm_worker_matching_proposal_atomic(
    v_job,v_candidate,'d9800000-0000-4000-8000-000000000001');
  if not v_result.ok then raise exception 'P98_CUSTOMER_CONFIRM_FIXTURE_FAILED: %',row_to_json(v_result); end if;
  foreach v_state in array array['broadcasting','no_reachable_worker','recovery_required'] loop
    update public.workflow_outbox set status='processing',lease_token=v_token,
      lease_expires_at=clock_timestamp()+interval '45 seconds' where id=v_outbox;
    v_outcome := public.settle_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation,
      v_state,case when v_state='recovery_required' then 'SIMULATED_RESTART' end);
    if v_outcome is distinct from 'completed'
      or (select state from public.confirmation_operations where id=v_operation) <> 'official_match'
      or (select state from public.matching_operations where job_id=v_job) <> 'official_match'
      or (select worker_id from public.jobs where id=v_job) is distinct from v_worker
    then raise exception 'P98_DELAYED_DISPATCH_REGRESSED_CUSTOMER_DECISION: %',v_state; end if;
  end loop;

  select * into strict v_result from public.request_worker_cancellation_atomic(
    v_job,v_worker,'Unexpected vehicle breakdown prevents continuing',array[]::text[]);
  if not v_result.ok then raise exception 'P98_CANCELLATION_FIXTURE_FAILED: %',row_to_json(v_result); end if;
  set constraints worker_cancellation_durable_replacement immediate;
  set constraints worker_cancellation_durable_replacement deferred;
  select replacement_matching_operation_id into strict v_new_matching from public.workflow_outbox
    where worker_cancellation_id=v_result.cancellation_id;
  update public.workflow_outbox set status='processing',lease_token=v_token,
    lease_expires_at=clock_timestamp()+interval '45 seconds' where id=v_outbox;
  v_outcome := public.settle_confirmation_matching_outbox_claim(
    v_outbox,v_token,v_operation,'recovery_required','SIMULATED_RESTART');
  if v_outcome is distinct from 'completed'
    or (select state from public.matching_operations where id=v_new_matching) <> 'queued'
    or (select state from public.confirmation_operations where id=v_operation) <> 'matching_queued'
  then raise exception 'P98_INITIAL_DISPATCH_OVERWROTE_REPLACEMENT'; end if;
end;
$authority$;
rollback to settlement_base;

do $backoff$
declare
  v_outbox constant uuid := 'd9800000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd9800000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd9800000-0000-4000-8000-000000000301';
  v_outcome text; v_before timestamptz; v_delay integer; v_row public.workflow_outbox%rowtype;
begin
  for v_attempt in 1..8 loop
    update public.workflow_outbox set status='processing',attempt_count=v_attempt,
      lease_token=v_token,lease_expires_at=clock_timestamp()+interval '45 seconds' where id=v_outbox;
    v_before := clock_timestamp();
    v_outcome := public.settle_confirmation_matching_outbox_claim(
      v_outbox,v_token,v_operation,'recovery_required','SIMULATED_RESTART');
    select * into strict v_row from public.workflow_outbox where id=v_outbox;
    if v_row.status <> 'failed' or v_row.lease_token is not null or v_row.leased_by is not null
      or v_row.lease_expires_at is not null or v_row.last_error_code <> 'SIMULATED_RESTART'
      or (select state from public.confirmation_operations where id=v_operation) <> 'recovery_required'
    then raise exception 'P98_RETRY_LOST_DURABLE_RECEIPT: %',v_attempt; end if;
    if v_attempt < 8 then
      v_delay := power(2,v_attempt)::integer;
      if v_outcome is distinct from 'retry_scheduled' or v_row.dead_lettered_at is not null
        or v_row.next_attempt_at < v_before + make_interval(secs => v_delay)
        or v_row.next_attempt_at > clock_timestamp() + make_interval(secs => v_delay)
        or (select retry_after_ms from public.confirmation_operations where id=v_operation)
          is distinct from least(30000,v_delay*1000)
      then raise exception 'P98_INVALID_BOUNDED_BACKOFF: %',v_attempt; end if;
    elsif v_outcome is distinct from 'dead_letter' or v_row.dead_lettered_at is null
      or (select retry_after_ms from public.confirmation_operations where id=v_operation) is not null then
      raise exception 'P98_RETRY_LIMIT_NOT_TERMINAL';
    end if;
  end loop;
end;
$backoff$;
rollback to settlement_base;

do $lease_and_input$
declare
  v_outbox constant uuid := 'd9800000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd9800000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd9800000-0000-4000-8000-000000000301';
  v_before jsonb; v_after jsonb; v_outcome text; v_state text;
begin
  select to_jsonb(outbox) into v_before from public.workflow_outbox as outbox where id=v_outbox;
  foreach v_state in array array[null,'candidate_ready','official_match','unknown']::text[] loop
    begin
      perform public.settle_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation,v_state,null);
      raise exception 'P98_INVALID_STATE_ACCEPTED: %',v_state;
    exception when invalid_parameter_value then
      if sqlerrm <> 'CONFIRMATION_OUTBOX_SETTLE_INVALID' then raise; end if;
    end;
  end loop;
  v_outcome := public.settle_confirmation_matching_outbox_claim(v_outbox,gen_random_uuid(),v_operation,'broadcasting',null);
  if v_outcome is distinct from 'lease_lost' then raise exception 'P98_WRONG_TOKEN_ACCEPTED'; end if;
  select to_jsonb(outbox) into v_after from public.workflow_outbox as outbox where id=v_outbox;
  if v_before is distinct from v_after then raise exception 'P98_INVALID_SETTLEMENT_MUTATED_RECEIPT'; end if;

  -- Transaction time is deliberately older than this expired lease; now() would accept it.
  update public.workflow_outbox set lease_expires_at=clock_timestamp()-interval '1 microsecond' where id=v_outbox;
  if (select lease_expires_at from public.workflow_outbox where id=v_outbox) <= now() then
    raise exception 'P98_WALL_CLOCK_FIXTURE_INVALID';
  end if;
  v_outcome := public.settle_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation,'broadcasting',null);
  if v_outcome is distinct from 'lease_lost'
    or (select status from public.workflow_outbox where id=v_outbox) <> 'processing'
  then raise exception 'P98_EXPIRED_LEASE_ACCEPTED'; end if;
  if has_function_privilege('anon','public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text)','execute')
    or has_function_privilege('authenticated','public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text)','execute')
    or not has_function_privilege('service_role','public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text)','execute')
  then raise exception 'P98_SETTLEMENT_AUTHORITY_LEAK'; end if;
end;
$lease_and_input$;
select 'P98 candidate/official/replacement authority, eight retries, wall-clock lease and input/ACL guards passed' as result;
rollback;

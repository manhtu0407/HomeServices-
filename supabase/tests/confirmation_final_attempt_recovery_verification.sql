-- @pillar id: P99-confirmation-final-attempt-crash-sql
-- @pillar invariant: Dispatcher restart reconciles an expired final attempt without a ninth matching execution or regression of Customer decisions.
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905133000_confirmation_final_attempt_recovery.sql
-- @pillar layer: sql
-- @pillar siblings: P58-confirmation-outbox-dispatcher, P98-confirmation-outbox-state-authority-sql
-- @pillar mutation: Remove the exhausted-lease reconciliation from batch claim; the final-attempt crash stays processing without a terminal receipt.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p99');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('d9900000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p99-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p99', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p99');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('d9900000-0000-4000-8000-000000000101', 'd9900000-0000-4000-8000-000000000001',
  'plumbing', 'Candidate capacity fixture', 'q7', 'broadcasting', 'rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('d9900000-0000-4000-8000-000000000201', 'd9900000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('d9900000-0000-4000-8000-000000000301', 'candidate-operation-p99',
  'd9900000-0000-4000-8000-000000000201', 'd9900000-0000-4000-8000-000000000001',
  'd9900000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P9900101',
  'synthetic-candidate-p99');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('d9900000-0000-4000-8000-000000000401', 'd9900000-0000-4000-8000-000000000301',
  'd9900000-0000-4000-8000-000000000101', 'queued', 'synthetic-candidate-p99');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'd9900000-0000-4000-8000-000000000301', 'd9900000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-candidate-p99'
from public.worker_profiles where id in (
  'd9900000-0000-4000-8000-000000000002', 'd9900000-0000-4000-8000-000000000003');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'd9900000-0000-4000-8000-000000000101',
  array['d9900000-0000-4000-8000-000000000002', 'd9900000-0000-4000-8000-000000000003']::uuid[],
  'd9900000-0000-4000-8000-000000000501', now(), now() + interval '5 minutes');


insert into public.workflow_outbox(id,operation_id,event_type,status,attempt_count,lease_token,leased_by,lease_expires_at)
values ('d9900000-0000-4000-8000-000000000601','d9900000-0000-4000-8000-000000000301',
  'matching_requested','processing',1,'d9900000-0000-4000-8000-000000000602','outbox-fixture-p99',now()+interval '45 seconds');


savepoint crashed_claim;
do $crash$
declare
  v_outbox constant uuid := 'd9900000-0000-4000-8000-000000000601';
  v_operation constant uuid := 'd9900000-0000-4000-8000-000000000301';
  v_before jsonb; v_row public.workflow_outbox%rowtype;
begin
  update public.workflow_outbox set attempt_count=8,lease_expires_at=now()-interval '1 second',
    next_attempt_at=now()-interval '1 day' where id=v_outbox;
  if exists (select 1 from public.claim_confirmation_matching_outbox_batch('sql:p99-restarted',50,45)
    where outbox_id=v_outbox) then raise exception 'P99_NINTH_MATCHING_ATTEMPT'; end if;
  select * into strict v_row from public.workflow_outbox where id=v_outbox;
  if v_row.status <> 'failed' or v_row.dead_lettered_at is null or v_row.lease_token is not null
    or v_row.attempt_count <> 8 or v_row.last_error_code <> 'MATCHING_RETRY_EXHAUSTED'
    or (select state from public.confirmation_operations where id=v_operation) <> 'recovery_required'
    or (select retry_after_ms from public.confirmation_operations where id=v_operation) is not null
  then raise exception 'P99_FINAL_ATTEMPT_CRASH_STILL_PROCESSING'; end if;
  v_before := to_jsonb(v_row);
  perform * from public.claim_confirmation_matching_outbox_batch('sql:p99-repeat',50,45);
  select * into strict v_row from public.workflow_outbox where id=v_outbox;
  if to_jsonb(v_row) is distinct from v_before then raise exception 'P99_DEAD_LETTER_REPLAY_MUTATED'; end if;
end;
$crash$;
rollback to crashed_claim;

do $live_lease$
declare
  v_outbox constant uuid := 'd9900000-0000-4000-8000-000000000601';
  v_row public.workflow_outbox%rowtype; v_claim record; v_before jsonb;
begin
  update public.workflow_outbox set attempt_count=8,lease_expires_at=clock_timestamp()+interval '45 seconds' where id=v_outbox;
  select to_jsonb(outbox) into v_before from public.workflow_outbox as outbox where id=v_outbox;
  perform * from public.claim_confirmation_matching_outbox_batch('sql:p99-live-final',50,45);
  select * into strict v_row from public.workflow_outbox where id=v_outbox;
  if to_jsonb(v_row) is distinct from v_before then raise exception 'P99_LIVE_FINAL_LEASE_STOLEN'; end if;

  update public.workflow_outbox set attempt_count=7,lease_expires_at=now()-interval '1 second',
    next_attempt_at=now()-interval '1 day' where id=v_outbox;
  select * into strict v_claim from public.claim_confirmation_matching_outbox_batch('sql:p99-last-permitted',50,45)
    where outbox_id=v_outbox;
  if v_claim.attempt_count <> 8 then raise exception 'P99_VALID_LAST_ATTEMPT_SKIPPED'; end if;
  select * into strict v_row from public.workflow_outbox where id=v_outbox;
  if v_row.status <> 'processing' or v_row.dead_lettered_at is not null
    or v_row.lease_expires_at <= clock_timestamp() then raise exception 'P99_LAST_ATTEMPT_NOT_LEASED'; end if;
end;
$live_lease$;
rollback to crashed_claim;

do $advanced_job$
declare
  v_job constant uuid := 'd9900000-0000-4000-8000-000000000101';
  v_worker constant uuid := 'd9900000-0000-4000-8000-000000000002';
  v_outbox constant uuid := 'd9900000-0000-4000-8000-000000000601';
  v_operation constant uuid := 'd9900000-0000-4000-8000-000000000301';
  v_result record; v_candidate uuid; v_state text;
begin
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(v_job,
    (select id from public.job_broadcasts where job_id=v_job and worker_id=v_worker),
    v_worker,'Kiểm tra rò nước và báo giá phạm vi xử lý.',200000,300000);
  if not v_result.ok then raise exception 'P99_PROPOSAL_FIXTURE_FAILED'; end if;
  v_candidate := v_result.candidate_id;
  foreach v_state in array array['candidate_ready','official_match'] loop
    if v_state='official_match' then
      select * into strict v_result from public.confirm_worker_matching_proposal_atomic(
        v_job,v_candidate,'d9900000-0000-4000-8000-000000000001');
      if not v_result.ok then raise exception 'P99_CONFIRM_FIXTURE_FAILED'; end if;
    end if;
    update public.workflow_outbox set status='processing',attempt_count=8,
      lease_token='d9900000-0000-4000-8000-000000000602',lease_expires_at=now()-interval '1 second',
      next_attempt_at=now()-interval '1 day' where id=v_outbox;
    perform * from public.claim_confirmation_matching_outbox_batch('sql:p99-advanced',50,45);
    if (select status from public.workflow_outbox where id=v_outbox) <> 'completed'
      or (select dead_lettered_at from public.workflow_outbox where id=v_outbox) is not null
      or (select state from public.confirmation_operations where id=v_operation) <> v_state
    then raise exception 'P99_REAPER_REGRESSED_ADVANCED_JOB: %',v_state; end if;
  end loop;
end;
$advanced_job$;
do $authority$
begin
  if has_function_privilege('anon','private.reconcile_exhausted_confirmation_outbox(integer)','execute')
    or has_function_privilege('authenticated','private.reconcile_exhausted_confirmation_outbox(integer)','execute')
    or has_function_privilege('authenticated','public.claim_confirmation_matching_outbox_batch(text,integer,integer)','execute')
  then raise exception 'P99_REAPER_AUTHORITY_LEAK'; end if;
end;
$authority$;
select 'P99 exhausted crash, live final lease, last permitted attempt, replay and advanced-job authority passed' as result;
rollback;

-- @pillar id: P102-replacement-outbox-lease-authority-sql
-- @pillar invariant: Expired replacement leases cannot mutate Customer state; a crashed eighth attempt reconciles without executing matching again.
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905150000_replacement_outbox_lease_authority.sql
-- @pillar layer: sql
-- @pillar siblings: P84-worker-cancellation-matching-outbox, P99-confirmation-final-attempt-crash-sql
-- @pillar mutation: Use transaction-start time for leases or omit exhausted reconciliation; expired settlement succeeds or the eighth crash remains processing.

begin;

insert into public.synthetic_matching_cohorts(cohort_id)
values ('synthetic-cancellation-p102'), ('synthetic-cancellation-foreign-p102');

do $fixtures$
declare
  v_actor uuid;
begin
  for i in 1..7 loop
    v_actor := ('dc000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'replacement-p102-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    if i <> 6 then
      insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
      values (case when i = 5 then 'synthetic-cancellation-foreign-p102' else 'synthetic-cancellation-p102' end,
        v_actor, case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    end if;
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience, districts,
        problem_specializations, is_approved, is_available, legal_name, date_of_birth, verification_status,
        synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, i <> 7, 'Replacement fixture ' || i, '1990-01-01', 'approved',
        case when i = 6 then null when i = 5 then 'synthetic-cancellation-foreign-p102' else 'synthetic-cancellation-p102' end);
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.customer_profiles(id, building_name, unit_number, district)
values ('dc000000-0000-4000-8000-000000000001', 'Replacement fixture building', 'P102', 'q7')
on conflict (id) do nothing;

insert into public.jobs(id, customer_id, worker_id, service_type, description, address_district, status,
  quote_mode, apartment_access_state)
values
  ('dc000000-0000-4000-8000-000000000101', 'dc000000-0000-4000-8000-000000000001',
    'dc000000-0000-4000-8000-000000000002', 'plumbing', 'Durable replacement RFQ fixture', 'q7',
    'worker_on_way', 'rfq', '{"access_granted":true}'),
  ('dc000000-0000-4000-8000-000000000102', 'dc000000-0000-4000-8000-000000000001',
    'dc000000-0000-4000-8000-000000000007', 'plumbing', 'Legacy replacement recovery fixture', 'q7',
    'worker_on_way', null, '{}');

insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase, safe_metadata)
values ('dc000000-0000-4000-8000-000000000201', 'dc000000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching', '{}');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id, quote_mode,
  confirmation_kind, state, support_code, synthetic_cohort_id)
values ('dc000000-0000-4000-8000-000000000301', 'replacement-operation-p102-101',
  'dc000000-0000-4000-8000-000000000201', 'dc000000-0000-4000-8000-000000000001',
  'dc000000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'official_match', 'P1020101', 'synthetic-cancellation-p102');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('dc000000-0000-4000-8000-000000000401', 'dc000000-0000-4000-8000-000000000301',
  'dc000000-0000-4000-8000-000000000101', 'official_match', 'synthetic-cancellation-p102');
insert into public.workflow_outbox(operation_id, event_type, status)
values ('dc000000-0000-4000-8000-000000000301', 'matching_requested', 'completed');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('dc000000-0000-4000-8000-000000000301', 'dc000000-0000-4000-8000-000000000101',
  'dc000000-0000-4000-8000-000000000002', 'plumbing', 'q7', 'offered', now(), now() + interval '5 minutes', 'synthetic-cancellation-p102');


do $setup$
declare v_cancel record;
begin
  select * into strict v_cancel from public.request_worker_cancellation_atomic(
    'dc000000-0000-4000-8000-000000000101','dc000000-0000-4000-8000-000000000002',
    'Unexpected vehicle breakdown prevents continuing',array[]::text[]);
  if not v_cancel.ok or v_cancel.cancellation_status <> 'approved' then raise exception 'P102_FIXTURE_FAILED'; end if;
  set constraints worker_cancellation_durable_replacement immediate;
  set constraints worker_cancellation_durable_replacement deferred;
end;
$setup$;

savepoint replacement_fixture;
do $wall_clock$
declare v_claim record; v_before jsonb; v_result text;
begin
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p102-wall-clock',1,45);
  update public.workflow_outbox set lease_expires_at=clock_timestamp()-interval '1 microsecond'
    where id=v_claim.outbox_id;
  select to_jsonb(outbox) into v_before from public.workflow_outbox outbox where id=v_claim.outbox_id;
  v_result := public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,'broadcasting');
  if v_result <> 'lease_lost' or
    (select to_jsonb(outbox) from public.workflow_outbox outbox where id=v_claim.outbox_id) is distinct from v_before
  then raise exception 'P102_EXPIRED_LEASE_SETTLED_AFTER_TRANSACTION_START'; end if;
  if public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token)->>'state' <> 'lease_lost'
  then raise exception 'P102_EXPIRED_LEASE_ACTIVATED'; end if;
end;
$wall_clock$;
rollback to replacement_fixture;

do $exhausted$
declare v_claim record; v_matching uuid; v_before integer;
begin
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p102-crashed',1,45);
  select replacement_matching_operation_id into v_matching from public.workflow_outbox where id=v_claim.outbox_id;
  update public.workflow_outbox set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 microsecond'
    where id=v_claim.outbox_id;
  select count(*) into v_before from public.job_broadcasts where job_id='dc000000-0000-4000-8000-000000000101';
  if exists(select 1 from public.claim_worker_replacement_outbox_batch('sql:p102-recover',1,45))
  then raise exception 'P102_NINTH_MATCHING_ATTEMPT'; end if;
  if not exists(select 1 from public.workflow_outbox where id=v_claim.outbox_id and status='failed'
      and attempt_count=8 and dead_lettered_at is not null and lease_token is null
      and leased_by is null and lease_expires_at is null and last_error_code='MATCHING_RETRY_EXHAUSTED')
    or (select state from public.matching_operations where id=v_matching) <> 'recovery_required'
    or (select state from public.confirmation_operations where job_id='dc000000-0000-4000-8000-000000000101') <> 'recovery_required'
    or (select retry_after_ms from public.confirmation_operations where job_id='dc000000-0000-4000-8000-000000000101') is not null
  then raise exception 'P102_FINAL_ATTEMPT_CRASH_NOT_RECONCILED'; end if;
  if public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,'broadcasting') <> 'lease_lost'
    or public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token)->>'state' <> 'lease_lost'
  then raise exception 'P102_CRASHED_DISPATCHER_NOT_FENCED'; end if;
  for i in 1..100 loop perform * from public.claim_worker_replacement_outbox_batch('sql:p102-idempotent',1,45); end loop;
  if (select count(*) from public.job_broadcasts where job_id='dc000000-0000-4000-8000-000000000101') <> v_before
    or (select attempt_count from public.workflow_outbox where id=v_claim.outbox_id) <> 8
  then raise exception 'P102_RECOVERY_EXECUTED_MATCHING'; end if;
end;
$exhausted$;
rollback to replacement_fixture;

do $customer_authority$
declare v_claim record; v_receipt jsonb; v_candidate record; v_before jsonb;
begin
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p102-customer',1,45);
  v_receipt := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
    'dc000000-0000-4000-8000-000000000101',(v_receipt#>>'{targets,0,broadcast_id}')::uuid,
    (v_receipt#>>'{targets,0,worker_id}')::uuid,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if not v_candidate.ok then raise exception 'P102_CANDIDATE_FIXTURE_FAILED'; end if;
  update public.workflow_outbox set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 microsecond'
    where id=v_claim.outbox_id;
  select to_jsonb(job) into v_before from public.jobs job where id='dc000000-0000-4000-8000-000000000101';
  perform * from public.claim_worker_replacement_outbox_batch('sql:p102-candidate-recover',1,45);
  if (select state from public.confirmation_operations where job_id='dc000000-0000-4000-8000-000000000101') <> 'candidate_ready'
    or not exists(select 1 from public.workflow_outbox where id=v_claim.outbox_id and status='completed'
      and attempt_count=8 and dead_lettered_at is null and lease_token is null)
    or (select to_jsonb(job) from public.jobs job where id='dc000000-0000-4000-8000-000000000101') is distinct from v_before
  then raise exception 'P102_CANDIDATE_REGRESSED_ON_CRASH_RECOVERY'; end if;

  select * into strict v_candidate from public.confirm_worker_matching_proposal_atomic(
    'dc000000-0000-4000-8000-000000000101',v_candidate.candidate_id,'dc000000-0000-4000-8000-000000000001');
  if not v_candidate.ok then raise exception 'P102_OFFICIAL_FIXTURE_FAILED'; end if;
  update public.workflow_outbox set status='processing',lease_token=gen_random_uuid(),
    lease_expires_at=clock_timestamp()-interval '1 microsecond' where id=v_claim.outbox_id;
  perform * from public.claim_worker_replacement_outbox_batch('sql:p102-official-recover',1,45);
  if (select state from public.confirmation_operations where job_id='dc000000-0000-4000-8000-000000000101') <> 'official_match'
    or (select worker_id from public.jobs where id='dc000000-0000-4000-8000-000000000101') is null
  then raise exception 'P102_OFFICIAL_MATCH_REGRESSED'; end if;
end;
$customer_authority$;
rollback to replacement_fixture;

do $successor$
declare v_claim record; v_new uuid; v_confirmation_before jsonb;
begin
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p102-superseded',1,45);
  update public.matching_operations set state='stopped' where id=(
    select replacement_matching_operation_id from public.workflow_outbox where id=v_claim.outbox_id);
  insert into public.matching_operations(confirmation_operation_id,job_id,state,synthetic_cohort_id)
    values ('dc000000-0000-4000-8000-000000000301','dc000000-0000-4000-8000-000000000101',
      'queued','synthetic-cancellation-p102') returning id into v_new;
  update public.workflow_outbox set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 microsecond'
    where id=v_claim.outbox_id;
  select to_jsonb(operation) into v_confirmation_before from public.confirmation_operations operation
    where id='dc000000-0000-4000-8000-000000000301';
  perform * from public.claim_worker_replacement_outbox_batch('sql:p102-superseded-recover',1,45);
  if (select state from public.matching_operations where id=v_new) <> 'queued'
    or (select to_jsonb(operation) from public.confirmation_operations operation
      where id='dc000000-0000-4000-8000-000000000301') is distinct from v_confirmation_before
    or (select status from public.workflow_outbox where id=v_claim.outbox_id) <> 'completed'
  then raise exception 'P102_SUCCESSOR_REGRESSED'; end if;
end;
$successor$;
rollback to replacement_fixture;

do $live_final_lease$
declare v_claim record; v_before jsonb;
begin
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p102-still-live',1,45);
  update public.workflow_outbox set attempt_count=8 where id=v_claim.outbox_id;
  select to_jsonb(outbox) into v_before from public.workflow_outbox outbox where id=v_claim.outbox_id;
  perform * from public.claim_worker_replacement_outbox_batch('sql:p102-no-steal',1,45);
  if (select to_jsonb(outbox) from public.workflow_outbox outbox where id=v_claim.outbox_id) is distinct from v_before
  then raise exception 'P102_LIVE_FINAL_LEASE_STOLEN'; end if;
end;
$live_final_lease$;
rollback to replacement_fixture;

do $bounded_retries$
declare v_claim record; v_result text;
begin
  for i in 1..8 loop
    select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p102-backoff',1,45);
    v_result := public.settle_worker_replacement_outbox_claim(
      v_claim.outbox_id,v_claim.lease_token,'recovery_required','REPLACEMENT_DISPATCH_FAILED');
    if v_result <> (case when i=8 then 'dead_letter' else 'retry_scheduled' end)
      or (select attempt_count from public.workflow_outbox where id=v_claim.outbox_id) <> i
      or (i<8 and (select retry_after_ms from public.confirmation_operations
        where id='dc000000-0000-4000-8000-000000000301') <> least(30000,power(2,i)::integer*1000))
      or (i=8 and (select retry_after_ms from public.confirmation_operations
        where id='dc000000-0000-4000-8000-000000000301') is not null)
    then raise exception 'P102_RETRY_BOUND_OR_HINT_INVALID'; end if;
    update public.workflow_outbox set next_attempt_at=clock_timestamp()-interval '1 microsecond'
      where id=v_claim.outbox_id;
  end loop;
  if exists(select 1 from public.claim_worker_replacement_outbox_batch('sql:p102-no-ninth',1,45))
  then raise exception 'P102_DEAD_LETTER_RECLAIMED'; end if;
end;
$bounded_retries$;
rollback to replacement_fixture;

do $contract$
declare v_claim record; v_before jsonb;
begin
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p102-validation',1,45);
  select to_jsonb(outbox) into v_before from public.workflow_outbox outbox where id=v_claim.outbox_id;
  begin
    perform public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,'broadcasting','UNRELATED_ERROR');
    raise exception 'P102_INVALID_ERROR_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,null,null);
    raise exception 'P102_NULL_STATE_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  if (select to_jsonb(outbox) from public.workflow_outbox outbox where id=v_claim.outbox_id) is distinct from v_before
  then raise exception 'P102_INVALID_COMMAND_MUTATED_RECEIPT'; end if;
  if has_function_privilege('service_role','private.reconcile_exhausted_replacement_outbox(integer)','execute')
    or has_function_privilege('anon','public.claim_worker_replacement_outbox_batch(text,integer,integer)','execute')
    or has_function_privilege('authenticated','public.activate_worker_replacement_outbox_claim(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.settle_worker_replacement_outbox_claim(uuid,uuid,text,text)','execute')
  then raise exception 'P102_OUTBOX_AUTHORITY_EXPOSED'; end if;
end;
$contract$;

set local role service_role;
select * from public.claim_worker_replacement_outbox_batch('sql:p102-service-boundary',1,45);
reset role;

rollback;

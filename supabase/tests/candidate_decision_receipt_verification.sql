-- @pillar id: P133-candidate-decision-receipt-sql
-- @pillar invariant: Explicit Customer decisions survive retries and cannot be confused with cancellation or expiry
-- @pillar authority: governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260908013000_candidate_decision_receipt.sql
-- @pillar layer: sql
-- @pillar siblings: P119-candidate-rejection-durability-sql, P122-official-match-durability-sql
-- @pillar mutation: Omit the audit-to-candidate projection; explicit rejection has no durable decision marker

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-customer-cancel-p133');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor := ('c1330000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'customer-cancel-p133-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i >= 3 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-customer-cancel-p133', v_actor,
      case when i >= 3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i >= 3 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, i=3, 'Rejection fixture', '1990-01-01',
        'approved', 'synthetic-customer-cancel-p133');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('c1330000-0000-4000-8000-000000000101', 'c1330000-0000-4000-8000-000000000001',
  'plumbing', 'Customer cancellation fixture', 'q7', 'broadcasting', 'rfq'),
  ('c1330000-0000-4000-8000-000000000102','c1330000-0000-4000-8000-000000000002',
  'plumbing','Foreign cancellation fixture','q7','broadcasting','rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('c1330000-0000-4000-8000-000000000201', 'c1330000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('c1330000-0000-4000-8000-000000000301', 'customer-cancellation-operation-p133',
  'c1330000-0000-4000-8000-000000000201', 'c1330000-0000-4000-8000-000000000001',
  'c1330000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'broadcasting', 'P1190101',
  'synthetic-customer-cancel-p133');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('c1330000-0000-4000-8000-000000000401', 'c1330000-0000-4000-8000-000000000301',
  'c1330000-0000-4000-8000-000000000101', 'broadcasting', 'synthetic-customer-cancel-p133');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('c1330000-0000-4000-8000-000000000301', 'c1330000-0000-4000-8000-000000000101',
  'c1330000-0000-4000-8000-000000000003', 'plumbing', 'q7', 'held', now(), now()+interval '5 minutes',
  'synthetic-customer-cancel-p133');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'c1330000-0000-4000-8000-000000000101', array['c1330000-0000-4000-8000-000000000003']::uuid[],
  'c1330000-0000-4000-8000-000000000501', now(), now()+interval '5 minutes');
insert into public.workflow_outbox(id, operation_id, event_type, status, attempt_count, lease_token,
  leased_by, lease_expires_at)
values ('c1330000-0000-4000-8000-000000000601', 'c1330000-0000-4000-8000-000000000301',
  'matching_requested', 'processing', 1, 'c1330000-0000-4000-8000-000000000602',
  'customer-cancellation-fixture-p133', now()+interval '45 seconds');



savepoint before_decision;
do $receipt$
declare
  v_job constant uuid := 'c1330000-0000-4000-8000-000000000101';
  v_customer constant uuid := 'c1330000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'c1330000-0000-4000-8000-000000000003';
  v_broadcast uuid; v_candidate record; v_result record; v_decided_at timestamptz;
begin
  select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_worker;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if not v_candidate.ok then raise exception 'P133_PROPOSAL_FAILED: %',row_to_json(v_candidate); end if;
  for scenario in 1..4 loop
    begin
      if scenario=1 then
        update public.job_worker_candidates set worker_id='c1330000-0000-4000-8000-000000000004'
          where id=v_candidate.candidate_id;
      elsif scenario=2 then
        update public.worker_matching_proposals set scope_summary='Nội dung khác' where candidate_id=v_candidate.candidate_id;
      elsif scenario=3 then
        update public.worker_matching_proposals set price_min=1 where candidate_id=v_candidate.candidate_id;
      else
        update public.job_worker_candidates set job_id='c1330000-0000-4000-8000-000000000102'
          where id=v_candidate.candidate_id;
      end if;
      raise exception 'P133_MUTABLE_CONSENT_CONTEXT: scenario %',scenario;
    exception when check_violation then
      if sqlerrm not in ('CANDIDATE_IDENTITY_IMMUTABLE','WORKER_PROPOSAL_TERMS_IMMUTABLE') then raise; end if;
    end;
  end loop;
  select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
  if not v_result.ok or (select customer_decision_kind from public.job_worker_candidates where id=v_candidate.candidate_id)
    is distinct from 'reject' then raise exception 'P133_EXPLICIT_REJECTION_NOT_RECORDED'; end if;
  select customer_decided_at into v_decided_at from public.job_worker_candidates where id=v_candidate.candidate_id;
  for i in 1..100 loop
    select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
    if not v_result.ok or not v_result.already_applied then raise exception 'P133_REPLAY_FAILED: %',i; end if;
  end loop;
  if (select customer_decided_at from public.job_worker_candidates where id=v_candidate.candidate_id)
    is distinct from v_decided_at then raise exception 'P133_REPLAY_REDATED_DECISION'; end if;
  if (select count(*) from public.job_events where job_id=v_job and event_type='customer_rejected_worker')<>1 then
    raise exception 'P133_DUPLICATE_DECISION_AUDIT'; end if;
  for scenario in 1..3 loop
    begin
      if scenario=1 then
        update public.job_worker_candidates set status='proposed' where id=v_candidate.candidate_id;
      elsif scenario=2 then
        update public.job_worker_candidates set customer_decided_at=clock_timestamp() where id=v_candidate.candidate_id;
      else
        update public.job_worker_candidates set customer_decision_kind=null where id=v_candidate.candidate_id;
      end if;
      raise exception 'P133_MUTABLE_DECISION: scenario %',scenario;
    exception when check_violation then
      if sqlerrm<>'CANDIDATE_DECISION_IMMUTABLE' then raise; end if;
    end;
  end loop;
end;
$receipt$;
rollback to savepoint before_decision;

do $outcomes$
declare
  v_job constant uuid := 'c1330000-0000-4000-8000-000000000101';
  v_customer constant uuid := 'c1330000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'c1330000-0000-4000-8000-000000000003';
  v_broadcast uuid; v_candidate record; v_result record;
begin
  for scenario in 1..3 loop
    begin
      select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_worker;
      select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
        v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
      if not v_candidate.ok then raise exception 'P133_OUTCOME_FIXTURE_FAILED'; end if;
      begin
        update public.job_worker_candidates set status='customer_declined',customer_decided_at=now(),
          customer_decision_kind='reject' where id=v_candidate.candidate_id;
        raise exception 'P133_FORGED_DECISION_WITHOUT_AUDIT';
      exception when check_violation then
        if sqlerrm<>'CANDIDATE_DECISION_AUDIT_REQUIRED' then raise; end if;
      end;
      if scenario=1 then
        select * into strict v_result from public.confirm_worker_matching_proposal_atomic(v_job,v_candidate.candidate_id,v_customer);
        if not v_result.ok or (select customer_decision_kind from public.job_worker_candidates where id=v_candidate.candidate_id)
          is distinct from 'confirm' then raise exception 'P133_CONFIRMATION_NOT_RECORDED'; end if;
      elsif scenario=2 then
        update public.job_worker_candidates set proposed_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'
          where id=v_candidate.candidate_id;
        select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
        if not v_result.ok or (select status from public.job_worker_candidates where id=v_candidate.candidate_id)<>'expired'
          or (select customer_decision_kind from public.job_worker_candidates where id=v_candidate.candidate_id) is not null then
          raise exception 'P133_EXPIRY_FABRICATED_CUSTOMER_REJECTION'; end if;
      else
        select * into strict v_result from public.cancel_job_before_accept_atomic(v_job,v_customer);
        if not v_result.ok or (select status from public.job_worker_candidates where id=v_candidate.candidate_id)<>'customer_declined'
          or (select customer_decision_kind from public.job_worker_candidates where id=v_candidate.candidate_id) is not null then
          raise exception 'P133_CANCELLATION_FABRICATED_CANDIDATE_DECISION'; end if;
      end if;
      raise exception using errcode='PT133',message='rollback tested outcome';
    exception when sqlstate 'PT133' then null;
    end;
  end loop;
end;
$outcomes$;

create function private.p133_receipt_fault() returns trigger language plpgsql set search_path='' as $func$
begin
  if new.customer_decision_kind is not null and new.job_id='c1330000-0000-4000-8000-000000000101'::uuid then
    raise exception using errcode='PT133',message='P133_INJECTED_RECEIPT_FAILURE';
  end if;
  return new;
end;
$func$;
create trigger p133_receipt_fault before update on public.job_worker_candidates
  for each row execute function private.p133_receipt_fault();
do $atomicity$
declare
  v_job constant uuid := 'c1330000-0000-4000-8000-000000000101';
  v_customer constant uuid := 'c1330000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'c1330000-0000-4000-8000-000000000003';
  v_broadcast uuid; v_candidate record;
begin
  select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_worker;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if not v_candidate.ok then raise exception 'P133_FAULT_FIXTURE_FAILED'; end if;
  for scenario in 1..2 loop
    begin
      if scenario=1 then
        perform public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
      else
        perform public.confirm_worker_matching_proposal_atomic(v_job,v_candidate.candidate_id,v_customer);
      end if;
      raise exception 'P133_RECEIPT_FAILURE_SWALLOWED: scenario %',scenario;
    exception when sqlstate 'PT133' then
      if sqlerrm<>'P133_INJECTED_RECEIPT_FAILURE' then raise; end if;
    end;
    if (select status from public.job_worker_candidates where id=v_candidate.candidate_id)<>'proposed'
      or (select customer_decision_kind from public.job_worker_candidates where id=v_candidate.candidate_id) is not null
      or (select status from public.jobs where id=v_job)<>'worker_candidate_pending'
      or exists(select 1 from public.job_events where job_id=v_job
        and event_type in ('customer_confirmed_worker','customer_rejected_worker'))
      or exists(select 1 from public.notifications where job_id=v_job
        and event_type in ('customer_confirmed_worker','customer_rejected_worker','worker_matched')) then
      raise exception 'P133_PARTIAL_DECISION_COMMITTED: scenario %',scenario;
    end if;
  end loop;
end;
$atomicity$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1330000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c1330000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $owner$
begin
  if (select count(*) from public.job_worker_candidates where job_id='c1330000-0000-4000-8000-000000000101'
    and customer_decision_kind is null)<>1 then raise exception 'P133_OWNER_CANNOT_READ_RECEIPT_COLUMN'; end if;
  if has_column_privilege('authenticated','public.job_worker_candidates','customer_decision_kind','UPDATE') then
    raise exception 'P133_CLIENT_CAN_MUTATE_DECISION'; end if;
end;
$owner$;
select set_config('request.jwt.claim.sub','c1330000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"c1330000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $foreign_customer$
begin
  if exists(select 1 from public.job_worker_candidates where job_id='c1330000-0000-4000-8000-000000000101') then
    raise exception 'P133_FOREIGN_CUSTOMER_READ_DECISION'; end if;
end;
$foreign_customer$;
select set_config('request.jwt.claim.sub','c1330000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c1330000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $worker$
begin
  if (select count(*) from public.job_worker_candidates where job_id='c1330000-0000-4000-8000-000000000101')<>1 then
    raise exception 'P133_WORKER_OWN_INBOX_REGRESSION'; end if;
end;
$worker$;
select set_config('request.jwt.claim.sub','c1330000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"c1330000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $foreign_worker$
begin
  if exists(select 1 from public.job_worker_candidates where job_id='c1330000-0000-4000-8000-000000000101') then
    raise exception 'P133_FOREIGN_WORKER_READ_DECISION'; end if;
end;
$foreign_worker$;
reset role;
select 'P133 exact candidate decision receipt passed' as result;
rollback;

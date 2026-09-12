-- @pillar id: P121-candidate-decision-durability-sql
-- @pillar invariant: Candidate confirmation validates exact identity and durably projects expiry or withdrawal while preserving explicit Customer retry
-- @pillar authority: governance/RULES.md #7 and #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260906019000_unavailable_candidate_durable_projection.sql
-- @pillar layer: sql
-- @pillar siblings: P119-candidate-rejection-durability-sql, P96-matching-candidate-capacity-sql
-- @pillar mutation: Confirm an absent candidate ID; the pending job and original proposal must not change

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-customer-cancel-p121');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor := ('c1210000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'customer-cancel-p121-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i >= 3 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-customer-cancel-p121', v_actor,
      case when i >= 3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i >= 3 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, i=3, 'Rejection fixture', '1990-01-01',
        'approved', 'synthetic-customer-cancel-p121');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('c1210000-0000-4000-8000-000000000101', 'c1210000-0000-4000-8000-000000000001',
  'plumbing', 'Customer cancellation fixture', 'q7', 'broadcasting', 'rfq'),
  ('c1210000-0000-4000-8000-000000000102','c1210000-0000-4000-8000-000000000002',
  'plumbing','Foreign cancellation fixture','q7','broadcasting','rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('c1210000-0000-4000-8000-000000000201', 'c1210000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('c1210000-0000-4000-8000-000000000301', 'customer-cancellation-operation-p121',
  'c1210000-0000-4000-8000-000000000201', 'c1210000-0000-4000-8000-000000000001',
  'c1210000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'broadcasting', 'P1210101',
  'synthetic-customer-cancel-p121');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('c1210000-0000-4000-8000-000000000401', 'c1210000-0000-4000-8000-000000000301',
  'c1210000-0000-4000-8000-000000000101', 'broadcasting', 'synthetic-customer-cancel-p121');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('c1210000-0000-4000-8000-000000000301', 'c1210000-0000-4000-8000-000000000101',
  'c1210000-0000-4000-8000-000000000003', 'plumbing', 'q7', 'held', now(), now()+interval '5 minutes',
  'synthetic-customer-cancel-p121');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'c1210000-0000-4000-8000-000000000101', array['c1210000-0000-4000-8000-000000000003']::uuid[],
  'c1210000-0000-4000-8000-000000000501', now(), now()+interval '5 minutes');
insert into public.workflow_outbox(id, operation_id, event_type, status, attempt_count, lease_token,
  leased_by, lease_expires_at)
values ('c1210000-0000-4000-8000-000000000601', 'c1210000-0000-4000-8000-000000000301',
  'matching_requested', 'processing', 1, 'c1210000-0000-4000-8000-000000000602',
  'customer-cancellation-fixture-p121', now()+interval '45 seconds');



set local role service_role;
do $missing_candidate$
declare
  v_job constant uuid:='c1210000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1210000-0000-4000-8000-000000000001';
  v_worker constant uuid:='c1210000-0000-4000-8000-000000000003';
  v_candidate record;
  v_result record;
  v_before jsonb;
begin
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(v_job,
    (select id from public.job_broadcasts where job_id=v_job and worker_id=v_worker),
    v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if not v_candidate.ok then raise exception 'P121_PROPOSAL_FIXTURE_FAILED'; end if;
  select to_jsonb(job) into v_before from public.jobs job where id=v_job;
  select * into strict v_result from public.confirm_worker_matching_proposal_atomic(
    v_job,'c1210000-0000-4000-8000-000000000999',v_customer);
  if (select to_jsonb(job) from public.jobs job where id=v_job) is distinct from v_before then
    raise exception 'P121_MISSING_CANDIDATE_CHANGED_JOB: %',row_to_json(v_result);
  end if;
  if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then
    raise exception 'P121_MISSING_CANDIDATE_NOT_REFUSED: %',row_to_json(v_result);
  end if;
end;
$missing_candidate$;
do $confirm_expiry$
declare
  v_job constant uuid:='c1210000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1210000-0000-4000-8000-000000000001';
  v_candidate uuid;
  v_result record;
begin
  begin
    select id into strict v_candidate from public.job_worker_candidates where job_id=v_job and status='proposed';
    update public.job_worker_candidates set proposed_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'
      where id=v_candidate;
    select * into strict v_result from public.confirm_worker_matching_proposal_atomic(v_job,v_candidate,v_customer);
    if v_result.ok or v_result.error_code is distinct from 'EXPIRED' then
      raise exception 'P121_LATE_CONFIRM_NOT_REFUSED: %',row_to_json(v_result);
    end if;
    if (select state from public.matching_operations where job_id=v_job) is distinct from 'no_reachable_worker'
      or (select state from public.confirmation_operations where job_id=v_job) is distinct from 'no_reachable_worker'
      or exists(select 1 from public.matching_capacity_reservations where job_id=v_job and status in ('held','offered'))
      or exists(select 1 from public.job_broadcasts where job_id=v_job and status in ('pending','sent','accepted'))
      or exists(select 1 from public.workflow_outbox where operation_id='c1210000-0000-4000-8000-000000000301'
        and (status<>'completed' or lease_token is not null)) then
      raise exception 'P121_LATE_CONFIRM_LEFT_ACTIVE_MATCHING';
    end if;
    if (select customer_decided_at from public.job_worker_candidates where id=v_candidate) is not null
      or (select count(*) from public.job_events where job_id=v_job and event_type='worker_candidate_expired')<>1 then
      raise exception 'P121_LATE_CONFIRM_FALSE_CUSTOMER_DECISION_OR_MISSING_EVENT';
    end if;
    raise exception using errcode='PT121',message='ROLLBACK_CONFIRMED_EXPIRY_FIXTURE';
  exception when sqlstate 'PT121' then null;
  end;
end;
$confirm_expiry$;
do $unavailable_candidate$
declare
  v_job constant uuid:='c1210000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1210000-0000-4000-8000-000000000001';
  v_candidate uuid;
  v_result record;
begin
  begin
    select id into strict v_candidate from public.job_worker_candidates where job_id=v_job and status='proposed';
    update public.worker_profiles set is_available=false where id='c1210000-0000-4000-8000-000000000003';
    select * into strict v_result from public.confirm_worker_matching_proposal_atomic(v_job,v_candidate,v_customer);
    if v_result.ok or v_result.error_code is distinct from 'WORKER_NOT_ELIGIBLE' then
      raise exception 'P121_UNAVAILABLE_CONFIRM_NOT_REFUSED: %',row_to_json(v_result);
    end if;
    if (select state from public.matching_operations where job_id=v_job) is distinct from 'no_reachable_worker'
      or exists(select 1 from public.matching_capacity_reservations where job_id=v_job and status in ('held','offered'))
      or exists(select 1 from public.job_broadcasts where job_id=v_job and status in ('pending','sent','accepted'))
      or exists(select 1 from public.matching_recipient_deliveries where job_id=v_job and status<>'expired')
      or exists(select 1 from public.workflow_outbox where operation_id='c1210000-0000-4000-8000-000000000301'
        and (status<>'completed' or lease_token is not null)) then
      raise exception 'P121_UNAVAILABLE_CONFIRM_LEFT_ACTIVE_MATCHING';
    end if;
    if (select count(*) from public.job_events where job_id=v_job and event_type='worker_candidate_became_ineligible')<>1
      or (select customer_decided_at from public.job_worker_candidates where id=v_candidate) is not null then
      raise exception 'P121_UNAVAILABLE_CONFIRM_FALSE_DECISION_OR_MISSING_AUDIT';
    end if;
    raise exception using errcode='PT121',message='ROLLBACK_UNAVAILABLE_CANDIDATE_FIXTURE';
  exception when sqlstate 'PT121' then null;
  end;
end;
$unavailable_candidate$;
do $expiry$
declare
  v_job constant uuid:='c1210000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1210000-0000-4000-8000-000000000001';
  v_candidate uuid;
  v_result record;
begin
  select id into strict v_candidate from public.job_worker_candidates where job_id=v_job and status='proposed';
  update public.job_worker_candidates set proposed_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'
    where id=v_candidate;
  select * into strict v_result from public.expire_worker_candidate_atomic(v_job,v_candidate,v_customer);
  if not v_result.ok then raise exception 'P121_EXPIRY_REFUSED: %',row_to_json(v_result); end if;
  if (select state from public.matching_operations where job_id=v_job) is distinct from 'no_reachable_worker'
    or (select state from public.confirmation_operations where job_id=v_job) is distinct from 'no_reachable_worker'
    or exists(select 1 from public.workflow_outbox where operation_id='c1210000-0000-4000-8000-000000000301'
      and (status<>'completed' or lease_token is not null)) then
    raise exception 'P121_EXPIRED_LAST_CANDIDATE_LEFT_ACTIVE_MATCHING';
  end if;
end;
$expiry$;
do $replay_and_retry$
declare
  v_job constant uuid:='c1210000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1210000-0000-4000-8000-000000000001';
  v_candidate uuid;
  v_result record;
  v_receipt jsonb;
  v_repeat jsonb;
begin
  select id into strict v_candidate from public.job_worker_candidates where job_id=v_job and status='expired';
  for i in 1..100 loop
    select * into strict v_result from public.expire_worker_candidate_atomic(v_job,v_candidate,v_customer);
    if not v_result.ok or not v_result.already_applied then raise exception 'P121_EXPIRY_REPLAY_CHANGED_OUTCOME'; end if;
  end loop;
  if (select count(*) from public.job_events where job_id=v_job and event_type='worker_candidate_expired')<>1
    or (select count(*) from public.job_events where job_id=v_job and event_type='no_worker_found')<>1
    or exists(select 1 from public.matching_operations where job_id=v_job and retry_request_id is not null)
    or (select customer_decided_at from public.job_worker_candidates where id=v_candidate) is not null then
    raise exception 'P121_EXPIRY_REPLAY_DUPLICATED_OR_INVENTED_CUSTOMER_ACTION';
  end if;
  update public.worker_profiles set is_available=true where id='c1210000-0000-4000-8000-000000000004';
  v_receipt:=public.request_job_matching_retry_atomic(v_job,v_customer,
    'c1210000-0000-4000-8000-000000000701','c1210000-0000-4000-8000-000000000401');
  if v_receipt->>'state' is distinct from 'queued' or (v_receipt->>'broadcast_sent')::boolean is distinct from false then
    raise exception 'P121_CUSTOMER_RETRY_UNAVAILABLE_AFTER_EXPIRY: %',v_receipt;
  end if;
  for i in 1..100 loop
    v_repeat:=public.request_job_matching_retry_atomic(v_job,v_customer,
      'c1210000-0000-4000-8000-000000000701','c1210000-0000-4000-8000-000000000401');
    if v_repeat is distinct from v_receipt then raise exception 'P121_RETRY_REPLAY_CHANGED_RECEIPT'; end if;
  end loop;
  if (select count(*) from public.matching_operations where job_id=v_job and state='queued')<>1
    or (select count(*) from public.workflow_outbox where retry_matching_operation_id=(v_receipt->>'operation_id')::uuid
      and status='queued')<>1 then raise exception 'P121_RETRY_DUPLICATED_OPERATION_OR_OUTBOX'; end if;
  if has_function_privilege('service_role','private.withdraw_unavailable_worker_candidate(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.confirm_worker_candidate_atomic(uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid)','execute')
    or has_function_privilege('anon','public.expire_worker_candidate_atomic(uuid,uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.confirm_worker_candidate_atomic(uuid,uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid)','execute') then
    raise exception 'P121_COMMAND_AUTHORITY_GRANTS_INVALID';
  end if;
end;
$replay_and_retry$;
select 'P121 candidate decision durability passed' as result;
rollback;

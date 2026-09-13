-- @pillar id: P119-candidate-rejection-durability-sql
-- @pillar invariant: Customer candidate rejection atomically retires the proposal and offer and records recoverable matching continuation
-- @pillar authority: governance/RULES.md #7 and #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260906015000_customer_candidate_rejection_durable.sql
-- @pillar layer: sql
-- @pillar siblings: P117-customer-cancellation-durability-sql, P96-matching-candidate-capacity-sql
-- @pillar mutation: Leave proposal retirement in Edge post-processing; the committed rejection still exposes a proposed Worker quote

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-customer-cancel-p119');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor := ('c1190000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'customer-cancel-p119-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i >= 3 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-customer-cancel-p119', v_actor,
      case when i >= 3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i >= 3 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, i=3, 'Rejection fixture', '1990-01-01',
        'approved', 'synthetic-customer-cancel-p119');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('c1190000-0000-4000-8000-000000000101', 'c1190000-0000-4000-8000-000000000001',
  'plumbing', 'Customer cancellation fixture', 'q7', 'broadcasting', 'rfq'),
  ('c1190000-0000-4000-8000-000000000102','c1190000-0000-4000-8000-000000000002',
  'plumbing','Foreign cancellation fixture','q7','broadcasting','rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('c1190000-0000-4000-8000-000000000201', 'c1190000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('c1190000-0000-4000-8000-000000000301', 'customer-cancellation-operation-p119',
  'c1190000-0000-4000-8000-000000000201', 'c1190000-0000-4000-8000-000000000001',
  'c1190000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'broadcasting', 'P1190101',
  'synthetic-customer-cancel-p119');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('c1190000-0000-4000-8000-000000000401', 'c1190000-0000-4000-8000-000000000301',
  'c1190000-0000-4000-8000-000000000101', 'broadcasting', 'synthetic-customer-cancel-p119');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('c1190000-0000-4000-8000-000000000301', 'c1190000-0000-4000-8000-000000000101',
  'c1190000-0000-4000-8000-000000000003', 'plumbing', 'q7', 'held', now(), now()+interval '5 minutes',
  'synthetic-customer-cancel-p119');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'c1190000-0000-4000-8000-000000000101', array['c1190000-0000-4000-8000-000000000003']::uuid[],
  'c1190000-0000-4000-8000-000000000501', now(), now()+interval '5 minutes');
insert into public.workflow_outbox(id, operation_id, event_type, status, attempt_count, lease_token,
  leased_by, lease_expires_at)
values ('c1190000-0000-4000-8000-000000000601', 'c1190000-0000-4000-8000-000000000301',
  'matching_requested', 'processing', 1, 'c1190000-0000-4000-8000-000000000602',
  'customer-cancellation-fixture-p119', now()+interval '45 seconds');


savepoint before_rejection;
do $rejection$
declare
  v_job constant uuid := 'c1190000-0000-4000-8000-000000000101';
  v_customer constant uuid := 'c1190000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'c1190000-0000-4000-8000-000000000003';
  v_broadcast uuid;
  v_candidate record;
  v_result record;
  v_notice uuid;
  v_decided_at timestamptz;
begin
  select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_worker;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if not v_candidate.ok then raise exception 'P119_CANDIDATE_FIXTURE_FAILED: %',row_to_json(v_candidate); end if;
  select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,null);
  if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then raise exception 'P119_NULL_ACTOR_ALLOWED'; end if;
  select * into strict v_result from public.reject_worker_candidate_atomic(
    v_job,v_candidate.candidate_id,'c1190000-0000-4000-8000-000000000002');
  if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then raise exception 'P119_FOREIGN_ACTOR_ALLOWED'; end if;
  update public.profiles set role='admin' where id=v_customer;
  select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
  if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then raise exception 'P119_ADMIN_ROLE_ALLOWED'; end if;
  update public.profiles set role='customer' where id=v_customer;
  select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
  if not v_result.ok or v_result.job_status is distinct from 'broadcasting' then
    raise exception 'P119_REJECTION_FIXTURE_FAILED: %',row_to_json(v_result);
  end if;
  if exists(select 1 from public.worker_matching_proposals where job_id=v_job and status='proposed') then
    raise exception 'P119_REJECTION_LEFT_OPEN_WORKER_PROPOSAL';
  end if;
  if exists(select 1 from public.matching_capacity_reservations where job_id=v_job and status in ('held','offered'))
    or exists(select 1 from public.matching_recipient_deliveries where job_id=v_job and status<>'expired')
    or exists(select 1 from public.job_broadcasts where job_id=v_job and status<>'expired') then
    raise exception 'P119_REJECTED_OFFER_RETAINS_CAPACITY';
  end if;
  if (select state from public.confirmation_operations where job_id=v_job) is distinct from 'no_reachable_worker'
    or (select state from public.matching_operations where job_id=v_job) is distinct from 'no_reachable_worker'
    or exists(select 1 from public.workflow_outbox where operation_id='c1190000-0000-4000-8000-000000000301'
      and (status<>'completed' or lease_token is not null)) then
    raise exception 'P119_NO_SUPPLY_IS_NOT_TERMINAL';
  end if;
  select id into strict v_notice from public.notifications where job_id=v_job and event_type='customer_rejected_worker';
  if public.settle_confirmation_matching_outbox_claim(
    'c1190000-0000-4000-8000-000000000601','c1190000-0000-4000-8000-000000000602',
    'c1190000-0000-4000-8000-000000000301','broadcasting',null)<>'lease_lost' then
    raise exception 'P119_STALE_DISPATCH_LEASE_SURVIVED';
  end if;
  select customer_decided_at into v_decided_at from public.job_worker_candidates where id=v_candidate.candidate_id;
  update public.notifications set status='read',read_at=now() where id=v_notice;
  for i in 1..100 loop
    select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
    if not v_result.ok or not v_result.already_applied then raise exception 'P119_REPLAY_NOT_ACKNOWLEDGED'; end if;
    select * into strict v_result from public.insert_notification_atomic(v_worker,v_job,'customer_rejected_worker',
      'Retry title','Retry body',jsonb_build_object('candidate_id',v_candidate.candidate_id));
    if v_result.notification_id<>v_notice then raise exception 'P119_NOTICE_REPLAY_DUPLICATED'; end if;
  end loop;
  if (select count(*) from public.job_events where job_id=v_job and event_type='customer_rejected_worker')<>1
    or (select count(*) from public.notifications where job_id=v_job)<>1
    or (select status from public.notifications where id=v_notice)<>'read'
    or (select customer_decided_at from public.job_worker_candidates where id=v_candidate.candidate_id)<>v_decided_at then
    raise exception 'P119_REPLAY_CHANGED_COMMITTED_DECISION';
  end if;
  begin
    perform public.insert_notification_atomic('c1190000-0000-4000-8000-000000000004',v_job,
      'customer_rejected_worker','Invalid','Invalid',jsonb_build_object('candidate_id',v_candidate.candidate_id));
    raise exception 'P119_FOREIGN_NOTICE_ALLOWED';
  exception when invalid_parameter_value then
    if sqlerrm<>'CANDIDATE_NOTIFICATION_NOT_AUTHORIZED' then raise; end if;
  end;
  if has_function_privilege('authenticated','public.reject_worker_candidate_atomic(uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.reject_worker_candidate_atomic(uuid,uuid,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.reject_worker_candidate_atomic(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'P119_REJECTION_EXECUTION_GRANT_INVALID';
  end if;
end;
$rejection$;
rollback to savepoint before_rejection;
update public.worker_profiles set is_available=true where id='c1190000-0000-4000-8000-000000000004';
do $continuation$
declare
  v_job constant uuid:='c1190000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1190000-0000-4000-8000-000000000001';
  v_worker constant uuid:='c1190000-0000-4000-8000-000000000003';
  v_next_worker constant uuid:='c1190000-0000-4000-8000-000000000004';
  v_broadcast uuid;
  v_candidate record;
  v_next_candidate record;
  v_result record;
  v_matching public.matching_operations%rowtype;
  v_outbox public.workflow_outbox%rowtype;
  v_lease uuid:=gen_random_uuid();
  v_activation jsonb;
begin
  select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_worker;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
  if not v_result.ok then raise exception 'P119_REJECTION_WITH_SUPPLY_FAILED'; end if;
  select * into strict v_matching from public.matching_operations where retry_request_id=v_candidate.candidate_id;
  select * into strict v_outbox from public.workflow_outbox where retry_matching_operation_id=v_matching.id;
  if v_matching.state<>'queued' or v_outbox.status<>'queued' or v_outbox.lease_token is not null
    or (select state from public.confirmation_operations where job_id=v_job)<>'matching_queued' then
    raise exception 'P119_CONTINUATION_NOT_DURABLE';
  end if;
  for i in 1..100 loop
    select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
    if not v_result.ok or not v_result.already_applied then raise exception 'P119_QUEUED_REPLAY_FAILED'; end if;
  end loop;
  if (select count(*) from public.matching_operations where job_id=v_job and state in ('queued','broadcasting','candidate_ready'))<>1
    or (select count(*) from public.workflow_outbox where retry_matching_operation_id=v_matching.id)<>1 then
    raise exception 'P119_DUPLICATE_CONTINUATION';
  end if;
  -- The fixture owns this lease; activation runs without any further Customer request.
  update public.workflow_outbox set status='processing',lease_token=v_lease,leased_by='p119',
    lease_expires_at=clock_timestamp()+interval '45 seconds',attempt_count=1 where id=v_outbox.id;
  v_activation:=public.activate_worker_replacement_outbox_claim(v_outbox.id,v_lease);
  if v_activation->>'state'<>'broadcasting' or jsonb_array_length(v_activation->'targets')<>1
    or v_activation->'targets'->0->>'worker_id'<>v_next_worker::text then
    raise exception 'P119_ACTIVATION_WRONG_RECIPIENT: %',v_activation;
  end if;
  if public.settle_worker_replacement_outbox_claim(v_outbox.id,v_lease,'broadcasting')<>'completed' then
    raise exception 'P119_CONTINUATION_SETTLE_FAILED';
  end if;
  select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_next_worker;
  select * into strict v_next_candidate from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_next_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if not v_next_candidate.ok then raise exception 'P119_NEXT_WORKER_PROPOSAL_FAILED: %',row_to_json(v_next_candidate); end if;
  select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
  if not v_result.ok or not v_result.already_applied or v_result.job_status<>'worker_candidate_pending'
    or (select status from public.job_worker_candidates where id=v_next_candidate.candidate_id)<>'proposed'
    or (select state from public.matching_operations where id=v_matching.id)<>'candidate_ready' then
    raise exception 'P119_STALE_REJECTION_CHANGED_NEXT_CANDIDATE';
  end if;
end;
$continuation$;
rollback to savepoint before_rejection;
do $preference_and_expiry$
declare
  v_job constant uuid:='c1190000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1190000-0000-4000-8000-000000000001';
  v_worker constant uuid:='c1190000-0000-4000-8000-000000000003';
  v_broadcast uuid;
  v_candidate record;
  v_result record;
begin
  for scenario in 1..3 loop
    begin
      update public.worker_profiles set is_available=true where id='c1190000-0000-4000-8000-000000000004';
      if scenario<3 then
        insert into public.job_matching_preferences(job_id,customer_id,strategy,preferred_worker_id,auto_general,
          client_request_id,selected_at,matching_operation_id)
        values(v_job,v_customer,'saved_worker_first',v_worker,scenario=2,gen_random_uuid(),now(),
          'c1190000-0000-4000-8000-000000000401');
      end if;
      select id into strict v_broadcast from public.job_broadcasts where job_id=v_job and worker_id=v_worker;
      select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
        v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
      if not v_candidate.ok then raise exception 'P119_VARIANT_PROPOSAL_FAILED: %',row_to_json(v_candidate); end if;
      if scenario=3 then
        update public.job_worker_candidates set proposed_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'
          where id=v_candidate.candidate_id;
      end if;
      select * into strict v_result from public.reject_worker_candidate_atomic(v_job,v_candidate.candidate_id,v_customer);
      if not v_result.ok then raise exception 'P119_VARIANT_REJECTION_FAILED: %',row_to_json(v_result); end if;
      if scenario=1 then
        if exists(select 1 from public.matching_operations where retry_request_id=v_candidate.candidate_id)
          or (select state from public.confirmation_operations where job_id=v_job)<>'no_reachable_worker'
          or (select fallback_at from public.job_matching_preferences where job_id=v_job) is not null then
          raise exception 'P119_REJECTION_BYPASSED_SAVED_WORKER_CONSENT';
        end if;
      elsif scenario=2 then
        if not exists(select 1 from public.matching_operations where retry_request_id=v_candidate.candidate_id
          and retry_source='saved_worker_fallback' and state='queued')
          or (select fallback_at from public.job_matching_preferences where job_id=v_job) is null then
          raise exception 'P119_STANDING_FALLBACK_CONSENT_NOT_RESUMED';
        end if;
      else
        if (select status from public.job_worker_candidates where id=v_candidate.candidate_id)<>'expired'
          or exists(select 1 from public.notifications where job_id=v_job)
          or (select count(*) from public.job_events where job_id=v_job and event_type='worker_candidate_expired')<>1 then
          raise exception 'P119_EXPIRY_MISATTRIBUTED_TO_CUSTOMER';
        end if;
      end if;
      raise exception using errcode='PT119',message='rollback successful fixture variant';
    exception when sqlstate 'PT119' then null;
    end;
  end loop;
end;
$preference_and_expiry$;
select 'P119 candidate rejection durability passed' as result;
rollback;

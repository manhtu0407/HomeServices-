-- @pillar id: P103-customer-matching-retry-sql
-- @pillar invariant: An explicit retry after exhausted matching dispatches to one or more real eligible public Workers, keeps zero-worker retries fail-closed, and records a durable outbox receipt without inventing delivery.
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905153000_customer_matching_retry_command.sql
-- @pillar layer: sql
-- @pillar siblings: P100-matching-expiry-maintenance-sql, P102-replacement-outbox-lease-authority-sql
-- @pillar mutation: Omit the atomic retry command or its request identity; exhausted matching cannot create one recoverable next operation.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p103');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor := ('dd000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p103-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p103', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p103');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('dd000000-0000-4000-8000-000000000101', 'dd000000-0000-4000-8000-000000000001',
  'plumbing', 'Candidate capacity fixture', 'q7', 'broadcasting', 'rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('dd000000-0000-4000-8000-000000000201', 'dd000000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('dd000000-0000-4000-8000-000000000301', 'candidate-operation-p103',
  'dd000000-0000-4000-8000-000000000201', 'dd000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P1030101',
  'synthetic-candidate-p103');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('dd000000-0000-4000-8000-000000000401', 'dd000000-0000-4000-8000-000000000301',
  'dd000000-0000-4000-8000-000000000101', 'queued', 'synthetic-candidate-p103');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'dd000000-0000-4000-8000-000000000301', 'dd000000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-candidate-p103'
from public.worker_profiles where id in (
  'dd000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000003');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'dd000000-0000-4000-8000-000000000101',
  array['dd000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000003']::uuid[],
  'dd000000-0000-4000-8000-000000000501', now(), now() + interval '5 minutes');



update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond'
  where job_id='dd000000-0000-4000-8000-000000000101';
update public.job_broadcasts set expires_at=clock_timestamp()-interval '1 microsecond'
  where job_id='dd000000-0000-4000-8000-000000000101';
update public.matching_capacity_reservations set expires_at=clock_timestamp()-interval '1 microsecond'
  where job_id='dd000000-0000-4000-8000-000000000101';
select private.reconcile_job_matching_expiry('dd000000-0000-4000-8000-000000000101');

savepoint retry_fixture;
do $retry$
declare v_receipt jsonb; v_repeat jsonb; v_operation uuid; v_prior_broadcasts integer;
begin
  select count(*) into v_prior_broadcasts from public.job_broadcasts where job_id='dd000000-0000-4000-8000-000000000101';
  v_receipt := public.request_job_matching_retry_atomic(
    'dd000000-0000-4000-8000-000000000101','dd000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000601','dd000000-0000-4000-8000-000000000401');
  if v_receipt->>'state' <> 'queued' or (v_receipt->>'broadcast_sent')::boolean is distinct from false
    or v_receipt->>'request_id' <> 'dd000000-0000-4000-8000-000000000601'
  then raise exception 'P103_RETRY_NOT_DURABLY_ACCEPTED'; end if;
  v_operation := (v_receipt->>'operation_id')::uuid;
  for i in 1..100 loop
    v_repeat := public.request_job_matching_retry_atomic(
      'dd000000-0000-4000-8000-000000000101','dd000000-0000-4000-8000-000000000001',
      'dd000000-0000-4000-8000-000000000601','dd000000-0000-4000-8000-000000000401');
    if v_repeat <> v_receipt then raise exception 'P103_DUPLICATE_COMMAND_CHANGED_RECEIPT'; end if;
  end loop;
  if (select count(*) from public.matching_operations where job_id='dd000000-0000-4000-8000-000000000101' and state='queued') <> 1
    or (select count(*) from public.workflow_outbox where retry_matching_operation_id=v_operation and status='queued') <> 1
    or (select count(*) from public.matching_capacity_reservations where job_id='dd000000-0000-4000-8000-000000000101' and status='held') <> 1
    or not exists(select 1 from public.matching_capacity_reservations where job_id='dd000000-0000-4000-8000-000000000101'
      and worker_id='dd000000-0000-4000-8000-000000000004' and status='held'
      and expires_at-held_at=interval '5 minutes')
    or (select count(*) from public.job_broadcasts where job_id='dd000000-0000-4000-8000-000000000101') <> v_prior_broadcasts
  then raise exception 'P103_RETRY_DUPLICATED_OR_INVENTED_DELIVERY'; end if;
end;
$retry$;

do $dispatch$
declare v_claim record; v_receipt jsonb; v_repeat jsonb;
begin
  select * into v_claim from public.claim_worker_replacement_outbox_batch('sql:p103-retry-dispatch',1,45);
  if v_claim.outbox_id is null then raise exception 'P103_RETRY_OUTBOX_HAS_NO_CONSUMER'; end if;
  v_receipt := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
  if v_receipt->>'state'<>'broadcasting' or jsonb_array_length(v_receipt->'targets')<>1
    or v_receipt#>>'{targets,0,worker_id}'<>'dd000000-0000-4000-8000-000000000004'
    or v_receipt->>'matching_reason'<>'customer_retry'
  then raise exception 'P103_RETRY_DID_NOT_ACTIVATE_ITS_RESERVED_RECIPIENT'; end if;
  for i in 1..100 loop
    v_repeat := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
    if v_repeat->'targets'<>v_receipt->'targets' then raise exception 'P103_DISPATCH_REPLAY_CHANGED_TARGET'; end if;
  end loop;
  if public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,'broadcasting')<>'completed'
  then raise exception 'P103_RETRY_DISPATCH_NOT_SETTLED'; end if;
  v_receipt := public.get_job_matching_retry_operation('dd000000-0000-4000-8000-000000000101',
    'dd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000601');
  if v_receipt->>'state'<>'broadcasting' or (v_receipt->>'broadcast_sent')::boolean is distinct from true
  then raise exception 'P103_RECONCILIATION_LOST_DELIVERY_RECEIPT'; end if;
end;
$dispatch$;

do $next_attempt$
declare v_previous record; v_claim record; v_receipt jsonb; v_next jsonb; v_proposal record; v_reason text;
begin
  select outbox.id,outbox.retry_matching_operation_id into strict v_previous from public.workflow_outbox outbox
    where outbox.operation_id='dd000000-0000-4000-8000-000000000301' and outbox.event_type='matching_reconcile';
  update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond'
    where job_id='dd000000-0000-4000-8000-000000000101';
  update public.job_broadcasts set expires_at=clock_timestamp()-interval '1 microsecond'
    where job_id='dd000000-0000-4000-8000-000000000101';
  update public.matching_capacity_reservations set expires_at=clock_timestamp()-interval '1 microsecond'
    where job_id='dd000000-0000-4000-8000-000000000101';
  perform private.reconcile_job_matching_expiry('dd000000-0000-4000-8000-000000000101');
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values('dd000000-0000-4000-8000-000000000005','authenticated','authenticated','next-p103@example.test',
      '{"provider":"email","providers":["email"]}','{}',now(),now());
  update public.profiles set role='worker' where id='dd000000-0000-4000-8000-000000000005';
  insert into public.synthetic_matching_cohort_members(cohort_id,profile_id,member_role)
    values('synthetic-candidate-p103','dd000000-0000-4000-8000-000000000005','worker');
  insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,
    problem_specializations,is_approved,is_available,legal_name,date_of_birth,verification_status,synthetic_cohort_id)
    select 'dd000000-0000-4000-8000-000000000005',service_types,selected_service_types,years_experience,districts,
      problem_specializations,true,true,'Next retry fixture','1990-01-01','approved',synthetic_cohort_id
    from public.worker_profiles where id='dd000000-0000-4000-8000-000000000004';
  perform public.record_worker_matching_heartbeat('dd000000-0000-4000-8000-000000000005',now());
  v_next := public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000101',
    'dd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000602',v_previous.retry_matching_operation_id);
  if not exists(select 1 from public.workflow_outbox where id=v_previous.id and status='queued'
      and attempt_count=0 and lease_token is null and retry_matching_operation_id=(v_next->>'operation_id')::uuid)
    or v_next->>'operation_id'=v_previous.retry_matching_operation_id::text
  then raise exception 'P103_REARM_LOST_HISTORY_OR_LEASE_FENCE'; end if;
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p103-next-attempt',1,45);
  v_receipt := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
  if v_receipt#>>'{targets,0,worker_id}'<>'dd000000-0000-4000-8000-000000000005'
    or (select count(distinct batch_id) from public.job_broadcasts where job_id='dd000000-0000-4000-8000-000000000101')<>3
  then raise exception 'P103_REARM_REUSED_AN_EXPIRED_BATCH_OR_WORKER'; end if;
  select * into strict v_proposal from public.submit_worker_matching_proposal_atomic(
    'dd000000-0000-4000-8000-000000000101',(v_receipt#>>'{targets,0,broadcast_id}')::uuid,
    'dd000000-0000-4000-8000-000000000005','Kiểm tra rò nước và báo giá phạm vi xử lý.',200000,300000);
  if not v_proposal.ok then raise exception 'P103_RETRY_PROPOSAL_FAILED'; end if;
  foreach v_reason in array array['expired_capacity', 'offline', 'changed_role'] loop
    begin
      if v_reason='expired_capacity' then
        update public.matching_capacity_reservations
          set held_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'
          where job_id='dd000000-0000-4000-8000-000000000101'
            and worker_id='dd000000-0000-4000-8000-000000000005';
      elsif v_reason='offline' then
        update public.worker_profiles set matching_foreground_active_until=now()-interval '1 minute'
          where id='dd000000-0000-4000-8000-000000000005';
      else
        update public.profiles set role='admin' where id='dd000000-0000-4000-8000-000000000005';
      end if;
      perform * from public.confirm_worker_matching_proposal_atomic(
        'dd000000-0000-4000-8000-000000000101',v_proposal.candidate_id,'dd000000-0000-4000-8000-000000000001');
      raise exception 'P103_RETRY_ASSIGNED_WITH_INVALID_CAPACITY: %',v_reason;
    exception when object_not_in_prerequisite_state then
      if sqlerrm<>'MATCHING_CAPACITY_UNAVAILABLE' then raise; end if;
    end;
  end loop;
  select * into strict v_proposal from public.confirm_worker_matching_proposal_atomic(
    'dd000000-0000-4000-8000-000000000101',v_proposal.candidate_id,'dd000000-0000-4000-8000-000000000001');
  if not v_proposal.ok then raise exception 'P103_CUSTOMER_SELECTION_FAILED'; end if;
  perform public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,'broadcasting');
  v_receipt := public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000101',
    'dd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000602',v_previous.retry_matching_operation_id);
  if v_receipt->>'state'<>'official_match' or v_receipt->>'operation_id'<>v_next->>'operation_id'
  then raise exception 'P103_POST_COMMIT_REPLAY_LOST_CUSTOMER_SELECTION'; end if;
end;
$next_attempt$;
rollback to retry_fixture;

do $negative$
declare v_before integer;
begin
  select count(*) into v_before from public.matching_operations where job_id='dd000000-0000-4000-8000-000000000101';
  begin
    perform public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000101',
      'dd000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000601','dd000000-0000-4000-8000-000000000401');
    raise exception 'P103_WORKER_RETRIED_CUSTOMER_JOB';
  exception when insufficient_privilege then null; end;
  begin
    perform public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000101',
      'dd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000601',gen_random_uuid());
    raise exception 'P103_STALE_PARENT_ACCEPTED';
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'MATCHING_RETRY_PARENT_CHANGED' then raise; end if;
  end;
  update public.worker_profiles set is_available=false where id='dd000000-0000-4000-8000-000000000004';
  begin
    perform public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000101',
      'dd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000601','dd000000-0000-4000-8000-000000000401');
    raise exception 'P103_MISSING_SUPPLY_ACCEPTED';
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'COVERAGE_UNAVAILABLE' then raise; end if;
  end;
  if (select count(*) from public.matching_operations where job_id='dd000000-0000-4000-8000-000000000101')<>v_before
    or exists(select 1 from public.matching_capacity_reservations where job_id='dd000000-0000-4000-8000-000000000101' and status='held')
    or exists(select 1 from public.workflow_outbox where operation_id='dd000000-0000-4000-8000-000000000301' and event_type='matching_reconcile')
  then raise exception 'P103_REJECTED_REQUEST_COMMITTED_SIDE_EFFECTS'; end if;
end;
$negative$;
rollback to retry_fixture;

do $identity$
declare v_receipt jsonb;
begin
  v_receipt := public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000101',
    'dd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000601','dd000000-0000-4000-8000-000000000401');
  begin
    perform public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000101',
      'dd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000601',gen_random_uuid());
    raise exception 'P103_REQUEST_KEY_CHANGED_PARENT';
  exception when unique_violation then
    if sqlerrm<>'MATCHING_RETRY_REQUEST_CONFLICT' then raise; end if;
  end;
  begin
    update public.matching_operations set retry_request_id=gen_random_uuid() where id=(v_receipt->>'operation_id')::uuid;
    raise exception 'P103_RETRY_IDENTITY_WAS_MUTABLE';
  exception when check_violation then null; end;
  begin
    perform public.get_job_matching_retry_operation('dd000000-0000-4000-8000-000000000101',
      'dd000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000601');
    raise exception 'P103_FOREIGN_ACTOR_READ_RECEIPT';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.request_job_matching_retry_atomic(uuid,uuid,uuid,uuid)','execute')
    or has_function_privilege('anon','public.get_job_matching_retry_operation(uuid,uuid,uuid)','execute')
    or has_function_privilege('service_role','private.reserve_fresh_matching_workers(uuid,uuid)','execute')
  then raise exception 'P103_RETRY_AUTHORITY_EXPOSED'; end if;
end;
$identity$;
rollback to retry_fixture;

do $public_coverage$
declare v_actor uuid; v_receipt jsonb; v_claim record;
begin
  -- Public-shaped fixtures are isolated by rollback; they are not real-account launch evidence.
  update public.worker_profiles set is_available=false
    where synthetic_cohort_id is null and is_available and 'plumbing'=any(service_types)
      and ('q7'=any(districts) or 'hcmc_all'=any(districts));
  for i in 7..10 loop
    v_actor := ('dd000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(v_actor,'authenticated','authenticated','public-p103-'||i||'@example.test',
        '{"provider":"email","providers":["email"]}','{}',now(),now());
    if i>7 then
      update public.profiles set role='worker' where id=v_actor;
      insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,
        problem_specializations,is_approved,is_available,legal_name,date_of_birth,verification_status)
        values(v_actor,array['plumbing']::public.service_type[],array['plumbing']::public.service_type[],5,
          array['q7'],array[]::text[],true,i<10,'Public retry fixture','1990-01-01','approved');
      perform public.record_worker_matching_heartbeat(v_actor,now());
    end if;
  end loop;
  insert into public.jobs(id,customer_id,service_type,description,address_district,status,quote_mode)
    values('dd000000-0000-4000-8000-000000000107','dd000000-0000-4000-8000-000000000007',
      'plumbing','Public quota rollback fixture','q7','broadcasting','rfq');
  insert into public.kael_chat_sessions(id,customer_id,service_type,status,case_phase)
    values('dd000000-0000-4000-8000-000000000207','dd000000-0000-4000-8000-000000000007','plumbing','active','matching');
  insert into public.confirmation_operations(id,idempotency_key,session_id,customer_id,job_id,
    quote_mode,confirmation_kind,state,support_code)
    values('dd000000-0000-4000-8000-000000000307','public-retry-operation-p103',
      'dd000000-0000-4000-8000-000000000207','dd000000-0000-4000-8000-000000000007',
      'dd000000-0000-4000-8000-000000000107','rfq','rfq_request','no_reachable_worker','P1030107');
  insert into public.matching_operations(id,confirmation_operation_id,job_id,state)
    values('dd000000-0000-4000-8000-000000000407','dd000000-0000-4000-8000-000000000307',
      'dd000000-0000-4000-8000-000000000107','no_reachable_worker');
  update public.worker_profiles set is_available=false where id in (
    'dd000000-0000-4000-8000-000000000008','dd000000-0000-4000-8000-000000000009',
    'dd000000-0000-4000-8000-000000000010');
  begin
    perform public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000107',
      'dd000000-0000-4000-8000-000000000007','dd000000-0000-4000-8000-000000000607','dd000000-0000-4000-8000-000000000407');
    raise exception 'P103_PUBLIC_RETRY_OPENED_WITH_ZERO_WORKERS';
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'COVERAGE_UNAVAILABLE' then raise; end if;
  end;
  if exists(select 1 from public.matching_capacity_reservations where job_id='dd000000-0000-4000-8000-000000000107')
    or exists(select 1 from public.matching_operations where retry_request_id='dd000000-0000-4000-8000-000000000607')
  then raise exception 'P103_PUBLIC_QUOTA_FAILURE_COMMITTED_CAPACITY'; end if;
  update public.worker_profiles set is_available=true where id='dd000000-0000-4000-8000-000000000008';
  v_receipt := public.request_job_matching_retry_atomic('dd000000-0000-4000-8000-000000000107',
    'dd000000-0000-4000-8000-000000000007','dd000000-0000-4000-8000-000000000607','dd000000-0000-4000-8000-000000000407');
  if v_receipt->>'state'<>'queued'
    or (select count(distinct worker_id) from public.matching_capacity_reservations
      where job_id='dd000000-0000-4000-8000-000000000107' and status='held' and synthetic_cohort_id is null)<>1
    or exists(select 1 from public.matching_capacity_reservations where job_id='dd000000-0000-4000-8000-000000000107'
      and worker_id<>'dd000000-0000-4000-8000-000000000008')
  then raise exception 'P103_PUBLIC_RETRY_DID_NOT_RESERVE_THE_ONLY_ELIGIBLE_REAL_WORKER'; end if;
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p103-one-public-worker',1,45);
  v_receipt := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
  if v_receipt->>'state'<>'broadcasting' or jsonb_array_length(v_receipt->'targets')<>1
    or v_receipt#>>'{targets,0,worker_id}'<>'dd000000-0000-4000-8000-000000000008'
    or v_receipt->>'matching_reason'<>'customer_retry'
  then raise exception 'P103_PUBLIC_RETRY_DID_NOT_DISPATCH_TO_ITS_ONLY_REAL_WORKER'; end if;
  if public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,'broadcasting')<>'completed'
    or (select count(*) from public.matching_recipient_deliveries where job_id='dd000000-0000-4000-8000-000000000107'
      and worker_id='dd000000-0000-4000-8000-000000000008' and status in ('queued','delivered','seen'))<>1
  then raise exception 'P103_PUBLIC_RETRY_DID_NOT_RECORD_ONE_REAL_RECIPIENT'; end if;
end;
$public_coverage$;

rollback;

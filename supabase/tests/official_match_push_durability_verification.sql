-- @pillar id: P124-official-match-push-sql
-- @pillar invariant: Official matching persists participant push intent independently of the request and exposes only leased release-isolated dispatch
-- @pillar authority: governance/RULES.md #7 and #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260908011000_official_match_push_dispatch.sql
-- @pillar layer: sql
-- @pillar siblings: P122-official-match-durability-sql
-- @pillar mutation: Omit durable push intent; confirmation commits inbox rows that the maintainer cannot recover

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-customer-cancel-p124');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor := ('c1240000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'customer-cancel-p124-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i >= 3 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-customer-cancel-p124', v_actor,
      case when i >= 3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i >= 3 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, i=3, 'Rejection fixture', '1990-01-01',
        'approved', 'synthetic-customer-cancel-p124');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('c1240000-0000-4000-8000-000000000101', 'c1240000-0000-4000-8000-000000000001',
  'plumbing', 'Customer cancellation fixture', 'q7', 'broadcasting', 'rfq'),
  ('c1240000-0000-4000-8000-000000000102','c1240000-0000-4000-8000-000000000002',
  'plumbing','Foreign cancellation fixture','q7','broadcasting','rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('c1240000-0000-4000-8000-000000000201', 'c1240000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('c1240000-0000-4000-8000-000000000301', 'customer-cancellation-operation-p124',
  'c1240000-0000-4000-8000-000000000201', 'c1240000-0000-4000-8000-000000000001',
  'c1240000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'broadcasting', 'P1220101',
  'synthetic-customer-cancel-p124');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('c1240000-0000-4000-8000-000000000401', 'c1240000-0000-4000-8000-000000000301',
  'c1240000-0000-4000-8000-000000000101', 'broadcasting', 'synthetic-customer-cancel-p124');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('c1240000-0000-4000-8000-000000000301', 'c1240000-0000-4000-8000-000000000101',
  'c1240000-0000-4000-8000-000000000003', 'plumbing', 'q7', 'held', now(), now()+interval '5 minutes',
  'synthetic-customer-cancel-p124');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'c1240000-0000-4000-8000-000000000101', array['c1240000-0000-4000-8000-000000000003']::uuid[],
  'c1240000-0000-4000-8000-000000000501', now(), now()+interval '5 minutes');
insert into public.workflow_outbox(id, operation_id, event_type, status, attempt_count, lease_token,
  leased_by, lease_expires_at)
values ('c1240000-0000-4000-8000-000000000601', 'c1240000-0000-4000-8000-000000000301',
  'matching_requested', 'processing', 1, 'c1240000-0000-4000-8000-000000000602',
  'customer-cancellation-fixture-p124', now()+interval '45 seconds');



set local role service_role;


do $push_intent$
declare v_proposal record; v_receipt record;
begin
  select * into strict v_proposal from public.submit_worker_matching_proposal_atomic(
    'c1240000-0000-4000-8000-000000000101',
    (select id from public.job_broadcasts where job_id='c1240000-0000-4000-8000-000000000101'
      and worker_id='c1240000-0000-4000-8000-000000000003'),
    'c1240000-0000-4000-8000-000000000003','Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  select * into strict v_receipt from public.confirm_worker_matching_proposal_atomic(
    'c1240000-0000-4000-8000-000000000101',v_proposal.candidate_id,
    'c1240000-0000-4000-8000-000000000001');
  if not v_receipt.ok then raise exception 'P124_CONFIRM_FIXTURE_FAILED: %',row_to_json(v_receipt); end if;
  if (select count(*) from public.notifications notice
    where job_id='c1240000-0000-4000-8000-000000000101'
      and event_type in ('worker_matched','customer_confirmed_worker')
      and to_jsonb(notice)->>'push_state'='queued')<>2 then
    raise exception 'P124_OFFICIAL_MATCH_HAS_NO_DURABLE_PUSH_INTENT';
  end if;
end;
$push_intent$;


-- Attestation is an isolated SQL fixture, not a claim that this Edge bundle was deployed.
reset role;
do $release_fixture$
declare
  v_release constant text:='harness-124000000000-124000000000';
  v_deployment constant text:='xyylanuyflrjzbjzhqfl_c1240000-0000-4000-8000-000000000058_1';
begin
  insert into public.harness_releases(release_id,environment,git_sha,manifest_sha256,migration_inventory_sha256,
    database_types_sha256,prompt_bundle_sha256,policy_bundle_sha256,runtime_configuration_sha256,
    evaluation_suite_version,evaluation_suite_sha256,capability_registry_sha256,access_matrix_sha256,
    reliability_policy_sha256,promotion_policy_sha256,bundle_sha256,edge_function_digests,release_artifact,created_by)
  values(v_release,'staging',repeat('1',40),repeat('1',64),repeat('1',64),repeat('1',64),repeat('1',64),
    repeat('1',64),repeat('1',64),'harness-eval.1.0.0',repeat('1',64),repeat('1',64),repeat('1',64),
    repeat('1',64),repeat('1',64),repeat('1',64),'{}','{}','sql-p124-fixture');
  insert into public.stage1_source_deployment_attestations(deployment_id,environment,release_id,function_name,
    edge_version,source_sha256,hosted_bundle_sha256,runtime_configuration_sha256,verify_jwt,import_map,
    entrypoint_path,import_map_path,proof_sha256)
  values(v_deployment,'staging',v_release,'kael-matching-maintainer',1,repeat('1',64),repeat('1',64),
    repeat('1',64),false,false,'supabase/functions/kael-matching-maintainer/index.ts',null,repeat('1',64));
  insert into public.stage1_release_controls(environment) values('staging') on conflict do nothing;
  update public.stage1_release_controls set active_release_id=null,previous_active_release_id=null,
    candidate_release_id=v_release,candidate_cohort_id='synthetic-not-this-cohort',
    candidate_packet_sha256=repeat('1',64),candidate_started_at=clock_timestamp() where environment='staging';
  if exists(select 1 from public.claim_official_match_push('sql-p124','staging',v_release,v_deployment,10))
  then raise exception 'P124_CANARY_CROSSED_COHORT'; end if;
  update public.stage1_release_controls set candidate_cohort_id='synthetic-customer-cancel-p124' where environment='staging';
  if exists(select 1 from public.claim_official_match_push('sql-p124','staging',v_release,v_deployment||'-wrong',10))
  then raise exception 'P124_UNATTESTED_RELEASE_DISPATCHED'; end if;
end;
$release_fixture$;

savepoint push_cases;
set local role service_role;
do $lease_receipts$
declare
  v_release constant text:='harness-124000000000-124000000000';
  v_deployment constant text:='xyylanuyflrjzbjzhqfl_c1240000-0000-4000-8000-000000000058_1';
  v_first record; v_second record; v_reclaimed record; v_role text;
begin
  foreach v_role in array array['anon','authenticated'] loop
    if has_function_privilege(v_role,'public.claim_official_match_push(text,text,text,text,integer)','EXECUTE')
      or has_function_privilege(v_role,'public.begin_official_match_push(uuid,uuid,text,text,text,text)','EXECUTE')
      or has_function_privilege(v_role,'public.finish_official_match_push(uuid,uuid,text,text,integer,text)','EXECUTE') then
      raise exception 'P124_ACTOR_CAN_DISPATCH_PUSH: %',v_role;
    end if;
  end loop;
  if has_function_privilege('service_role','private.enqueue_official_match_push()','EXECUTE')
    or has_function_privilege('service_role','private.official_match_push_release_allows(uuid,text,text,text)','EXECUTE') then
    raise exception 'P124_PRIVATE_HELPER_PUBLICLY_EXECUTABLE';
  end if;
  select * into strict v_first from public.claim_official_match_push('sql-p124','staging',v_release,v_deployment);
  select * into strict v_second from public.claim_official_match_push('sql-p124','staging',v_release,v_deployment);
  if v_first.notification_id=v_second.notification_id then raise exception 'P124_DUPLICATE_ACTIVE_CLAIM'; end if;
  if exists(select 1 from public.claim_official_match_push('sql-other','staging',v_release,v_deployment))
    then raise exception 'P124_LIVE_LEASE_STOLEN'; end if;
  update public.notifications set status='read',read_at=clock_timestamp() where id=v_first.notification_id;
  perform public.insert_notification_atomic(v_first.user_id,v_first.job_id,v_first.event_type,
    'Không ghi đè bản gốc','Không ghi đè bản gốc',jsonb_build_object('candidate_id',v_first.candidate_id));
  if (select push_state from public.notifications where id=v_first.notification_id)<>'processing'
    or (select push_lease_token from public.notifications where id=v_first.notification_id)<>v_first.lease_token
    then raise exception 'P124_INBOX_READ_LOST_PENDING_PUSH'; end if;
  if public.begin_official_match_push(v_first.notification_id,gen_random_uuid(),'sql-p124','staging',v_release,v_deployment)
    or public.finish_official_match_push(v_first.notification_id,v_first.lease_token,'wrong-dispatcher','submitted',1)
    then raise exception 'P124_FOREIGN_LEASE_ACCEPTED'; end if;
  if not public.begin_official_match_push(v_first.notification_id,v_first.lease_token,'sql-p124','staging',v_release,v_deployment)
    then raise exception 'P124_VALID_LEASE_REFUSED'; end if;
  begin
    perform public.finish_official_match_push(v_first.notification_id,v_first.lease_token,'sql-p124','submitted',0);
    raise exception 'P124_ZERO_COUNT_REPORTED_SUBMITTED';
  exception when invalid_parameter_value then
    if sqlerrm<>'OFFICIAL_MATCH_PUSH_RECEIPT_INVALID' then raise; end if;
  end;
  if not public.finish_official_match_push(v_first.notification_id,v_first.lease_token,'sql-p124','submitted',1)
    or public.finish_official_match_push(v_first.notification_id,v_first.lease_token,'sql-p124','unreachable',0)
    then raise exception 'P124_SUBMISSION_SETTLEMENT_NOT_FENCED'; end if;
  if (select status from public.notifications where id=v_first.notification_id)<>'read'
    or (select push_submitted_count from public.notifications where id=v_first.notification_id)<>1
    then raise exception 'P124_PUSH_CHANGED_READ_STATE_OR_LOST_SUBMISSION'; end if;
  update public.notifications set push_lease_expires_at=clock_timestamp()-interval '1 microsecond'
    where id=v_second.notification_id;
  if public.finish_official_match_push(v_second.notification_id,v_second.lease_token,'sql-p124','submitted',1)
    then raise exception 'P124_EXPIRED_LEASE_COMMITTED'; end if;
  select * into strict v_reclaimed from public.claim_official_match_push('sql-recovery','staging',v_release,v_deployment);
  if v_reclaimed.notification_id<>v_second.notification_id or v_reclaimed.lease_token=v_second.lease_token
    then raise exception 'P124_CRASHED_LEASE_NOT_RECOVERED'; end if;
  if public.finish_official_match_push(v_second.notification_id,v_second.lease_token,'sql-p124','submitted',1)
    then raise exception 'P124_REPLACED_LEASE_COMMITTED'; end if;
  if not public.finish_official_match_push(v_reclaimed.notification_id,v_reclaimed.lease_token,'sql-recovery','retry',0,'RATE_LIMITED')
    then raise exception 'P124_SAFE_RETRY_NOT_SCHEDULED'; end if;
  if exists(select 1 from public.claim_official_match_push('sql-recovery','staging',v_release,v_deployment))
    then raise exception 'P124_RETRY_IGNORED_BACKOFF'; end if;
  update public.notifications set push_next_attempt_at=clock_timestamp()-interval '1 microsecond'
    where id=v_reclaimed.notification_id;
  select * into strict v_reclaimed from public.claim_official_match_push('sql-recovery','staging',v_release,v_deployment);
  if not public.finish_official_match_push(v_reclaimed.notification_id,v_reclaimed.lease_token,'sql-recovery','unreachable',0,'NO_REGISTERED_PUSH_TOKEN')
    then raise exception 'P124_NO_TOKEN_RECEIPT_LOST'; end if;
  if exists(select 1 from public.notifications where job_id=v_first.job_id and push_state in ('queued','processing'))
    then raise exception 'P124_TERMINAL_PUSH_STILL_ACTIVE'; end if;
end;
$lease_receipts$;
rollback to push_cases;

do $release_and_expiry$
declare
  v_release constant text:='harness-124000000000-124000000000';
  v_deployment constant text:='xyylanuyflrjzbjzhqfl_c1240000-0000-4000-8000-000000000058_1';
  v_claim record; v_claimed_count integer;
begin
  select * into strict v_claim from public.claim_official_match_push('sql-p124','staging',v_release,v_deployment);
  update public.stage1_release_controls set candidate_cohort_id='synthetic-other-cohort' where environment='staging';
  if public.begin_official_match_push(v_claim.notification_id,v_claim.lease_token,'sql-p124','staging',v_release,v_deployment)
    then raise exception 'P124_ROLLED_BACK_RELEASE_STARTED_PUSH'; end if;
  if (select push_state from public.notifications where id=v_claim.notification_id)<>'stopped'
    then raise exception 'P124_RELEASE_REJECTION_LEFT_PROCESSING'; end if;
  update public.stage1_release_controls set candidate_cohort_id='synthetic-customer-cancel-p124' where environment='staging';
  select * into strict v_claim from public.claim_official_match_push('sql-p124','staging',v_release,v_deployment);
  update public.notifications set push_attempt_count=8,push_lease_expires_at=clock_timestamp()-interval '1 microsecond'
    where id=v_claim.notification_id;
  select count(*) into v_claimed_count from public.claim_official_match_push('sql-p124','staging',v_release,v_deployment);
  if v_claimed_count<>0 or (select push_state from public.notifications where id=v_claim.notification_id)<>'recovery_required'
    then raise exception 'P124_FINAL_CRASH_NEVER_RECONCILED'; end if;
end;
$release_and_expiry$;
rollback to push_cases;

do $stale_job$
declare v_claim record;
begin
  select * into strict v_claim from public.claim_official_match_push('sql-p124','staging',
    'harness-124000000000-124000000000','xyylanuyflrjzbjzhqfl_c1240000-0000-4000-8000-000000000058_1');
  update public.jobs set status='worker_on_way' where id=v_claim.job_id;
  if public.begin_official_match_push(v_claim.notification_id,v_claim.lease_token,'sql-p124','staging',
    'harness-124000000000-124000000000','xyylanuyflrjzbjzhqfl_c1240000-0000-4000-8000-000000000058_1')
    then raise exception 'P124_OBSOLETE_MATCH_PUSH_STARTED'; end if;
end;
$stale_job$;
rollback to push_cases;
select 'P124 official match push durability passed' as result;
rollback;

-- @pillar id: P100-matching-expiry-maintenance-sql
-- @pillar invariant: Server-owned lease expiry preserves Customer authority and closes exhausted matching without foreground requests or invented recipients.
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905140000_matching_expiry_maintenance.sql
-- @pillar layer: sql
-- @pillar siblings: P96-matching-candidate-capacity-sql, P98-confirmation-outbox-state-authority-sql
-- @pillar mutation: Omit candidate expiry or exhaustion settlement; a stopped app leaves a proposed candidate or broadcasting operation indefinitely.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p100');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('da000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p100-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p100', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p100');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('da000000-0000-4000-8000-000000000101', 'da000000-0000-4000-8000-000000000001',
  'plumbing', 'Candidate capacity fixture', 'q7', 'broadcasting', 'rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('da000000-0000-4000-8000-000000000201', 'da000000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('da000000-0000-4000-8000-000000000301', 'candidate-operation-p100',
  'da000000-0000-4000-8000-000000000201', 'da000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P1000101',
  'synthetic-candidate-p100');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('da000000-0000-4000-8000-000000000401', 'da000000-0000-4000-8000-000000000301',
  'da000000-0000-4000-8000-000000000101', 'queued', 'synthetic-candidate-p100');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'da000000-0000-4000-8000-000000000301', 'da000000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-candidate-p100'
from public.worker_profiles where id in (
  'da000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-000000000003');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'da000000-0000-4000-8000-000000000101',
  array['da000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-000000000003']::uuid[],
  'da000000-0000-4000-8000-000000000501', now(), now() + interval '5 minutes');


savepoint expiry_fixture;
do $expiry$
declare
  v_job constant uuid := 'da000000-0000-4000-8000-000000000101';
  v_worker constant uuid := 'da000000-0000-4000-8000-000000000002';
  v_result record; v_candidate uuid; v_before jsonb; v_count integer;
begin
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(v_job,
    (select id from public.job_broadcasts where job_id=v_job and worker_id=v_worker),
    v_worker,'Kiểm tra rò nước và báo giá phạm vi xử lý.',200000,300000);
  if not v_result.ok then raise exception 'P100_PROPOSAL_FIXTURE_FAILED'; end if;
  v_candidate := v_result.candidate_id;
  select to_jsonb(candidate) into v_before from public.job_worker_candidates candidate where id=v_candidate;
  perform private.reconcile_job_matching_expiry(v_job);
  if (select to_jsonb(candidate) from public.job_worker_candidates candidate where id=v_candidate) is distinct from v_before
  then raise exception 'P100_LIVE_CANDIDATE_CHANGED'; end if;

  update public.job_worker_candidates set expires_at=clock_timestamp()-interval '1 microsecond' where id=v_candidate;
  perform private.reconcile_job_matching_expiry(v_job);
  if (select status from public.job_worker_candidates where id=v_candidate) <> 'expired'
    or (select status from public.worker_matching_proposals where candidate_id=v_candidate) <> 'expired'
    or (select worker_id from public.jobs where id=v_job) is not null
    or (select status from public.jobs where id=v_job) <> 'broadcasting'
    or (select state from public.matching_operations where job_id=v_job) <> 'broadcasting'
    or (select status from public.matching_capacity_reservations where job_id=v_job and worker_id=v_worker) <> 'released'
  then raise exception 'P100_CANDIDATE_NOT_EXPIRED_WITHOUT_CUSTOMER'; end if;

  update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  update public.job_broadcasts set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  update public.matching_capacity_reservations set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  perform private.reconcile_job_matching_expiry(v_job);
  if (select state from public.matching_operations where job_id=v_job) <> 'no_reachable_worker'
    or (select state from public.confirmation_operations where job_id=v_job) <> 'no_reachable_worker'
    or (select retry_after_ms from public.confirmation_operations where job_id=v_job) is not null
    or exists (select 1 from public.matching_recipient_deliveries where job_id=v_job and status in ('queued','delivered','seen','accepted'))
    or exists (select 1 from public.matching_capacity_reservations where job_id=v_job and status in ('held','offered'))
  then raise exception 'P100_EXHAUSTED_MATCHING_STILL_BROADCASTING'; end if;
  select count(*) into v_count from public.job_events where job_id=v_job and event_type='no_worker_found';
  perform private.reconcile_job_matching_expiry(v_job);
  if v_count <> 1 or (select count(*) from public.job_events where job_id=v_job and event_type='no_worker_found') <> v_count
    or exists (select 1 from public.job_events where job_id=v_job and event_type='no_worker_found' and (actor_id is not null or actor_role is not null))
  then raise exception 'P100_EXPIRY_REPLAY_OR_FALSE_CUSTOMER_AUTHORITY'; end if;
end;
$expiry$;
rollback to expiry_fixture;

do $authority$
declare
  v_job constant uuid := 'da000000-0000-4000-8000-000000000101';
  v_result record; v_before jsonb;
begin
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(v_job,
    (select id from public.job_broadcasts where job_id=v_job and worker_id='da000000-0000-4000-8000-000000000002'),
    'da000000-0000-4000-8000-000000000002','Kiểm tra rò nước và báo giá phạm vi xử lý.',200000,300000);
  select * into strict v_result from public.confirm_worker_matching_proposal_atomic(v_job,
    v_result.candidate_id,'da000000-0000-4000-8000-000000000001');
  if not v_result.ok then raise exception 'P100_CONFIRM_FIXTURE_FAILED'; end if;
  select to_jsonb(job) into v_before from public.jobs job where id=v_job;
  update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  perform private.reconcile_job_matching_expiry(v_job);
  if (select to_jsonb(job) from public.jobs job where id=v_job) is distinct from v_before
    or (select state from public.matching_operations where job_id=v_job) <> 'official_match'
  then raise exception 'P100_OFFICIAL_MATCH_REGRESSED'; end if;
end;
$authority$;
rollback to expiry_fixture;

do $dispatch_lease$
declare v_job constant uuid := 'da000000-0000-4000-8000-000000000101';
begin
  update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  update public.job_broadcasts set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  update public.matching_capacity_reservations set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  insert into public.workflow_outbox(operation_id,event_type,status,lease_token,leased_by,lease_expires_at)
  values ('da000000-0000-4000-8000-000000000301','matching_requested','processing',gen_random_uuid(),
    'sql:p100-live-dispatch',clock_timestamp()+interval '45 seconds');
  perform private.reconcile_job_matching_expiry(v_job);
  if (select state from public.matching_operations where job_id=v_job) <> 'broadcasting'
  then raise exception 'P100_LIVE_DISPATCH_REGRESSED'; end if;
  update public.workflow_outbox set status='completed',lease_token=null,leased_by=null,lease_expires_at=null
    where operation_id='da000000-0000-4000-8000-000000000301';
  perform private.reconcile_job_matching_expiry(v_job);
  if (select state from public.matching_operations where job_id=v_job) <> 'no_reachable_worker'
  then raise exception 'P100_NO_RESPONSE_NOT_RECONCILED'; end if;
end;
$dispatch_lease$;
rollback to expiry_fixture;

-- These release/attestation rows are rollback-only SQL fixtures, never hosted release evidence.
do $release_fixture$
declare
  v_release constant text := 'harness-100000000000-100000000000';
  v_deployment constant text := 'xyylanuyflrjzbjzhqfl_da000000-0000-4000-8000-000000000058_1';
  v_job constant uuid := 'da000000-0000-4000-8000-000000000101';
begin
  insert into public.harness_releases(release_id,environment,git_sha,manifest_sha256,migration_inventory_sha256,
    database_types_sha256,prompt_bundle_sha256,policy_bundle_sha256,runtime_configuration_sha256,
    evaluation_suite_version,evaluation_suite_sha256,capability_registry_sha256,access_matrix_sha256,
    reliability_policy_sha256,promotion_policy_sha256,bundle_sha256,edge_function_digests,release_artifact,created_by)
  values(v_release,'staging',repeat('1',40),repeat('1',64),repeat('1',64),repeat('1',64),repeat('1',64),
    repeat('1',64),repeat('1',64),'harness-eval.1.0.0',repeat('1',64),repeat('1',64),repeat('1',64),
    repeat('1',64),repeat('1',64),repeat('1',64),'{}','{}','sql-p100-fixture');
  insert into public.stage1_source_deployment_attestations(deployment_id,environment,release_id,function_name,
    edge_version,source_sha256,hosted_bundle_sha256,runtime_configuration_sha256,verify_jwt,import_map,
    entrypoint_path,import_map_path,proof_sha256)
  values(v_deployment,'staging',v_release,'kael-matching-maintainer',1,repeat('1',64),repeat('1',64),
    repeat('1',64),false,false,'supabase/functions/kael-matching-maintainer/index.ts',null,
    '1000000000000000000000000000000000000000000000000000000000000000');
  insert into public.stage1_release_controls(environment) values('staging') on conflict do nothing;
  update public.stage1_release_controls set active_release_id=null,previous_active_release_id=null,
    candidate_release_id=v_release,candidate_cohort_id='synthetic-not-this-cohort',
    candidate_packet_sha256=repeat('1',64),candidate_started_at=clock_timestamp() where environment='staging';
  update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  update public.job_broadcasts set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  update public.matching_capacity_reservations set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  if public.reconcile_expired_matching_leases('staging',v_release,v_deployment,50) <> 0
    or (select state from public.matching_operations where job_id=v_job) <> 'broadcasting'
  then raise exception 'P100_CANARY_CROSSED_COHORT'; end if;
  update public.stage1_release_controls set candidate_release_id=null,candidate_cohort_id=null,
    candidate_packet_sha256=null,candidate_started_at=null where environment='staging';
  if public.reconcile_expired_matching_leases('staging',v_release,v_deployment,50) <> 0
  then raise exception 'P100_EMPTY_CONTROL_ACCEPTED'; end if;
  update public.stage1_release_controls set candidate_release_id=v_release,
    candidate_cohort_id='synthetic-candidate-p100',candidate_packet_sha256=repeat('1',64),
    candidate_started_at=clock_timestamp() where environment='staging';
end;
$release_fixture$;
-- Foreground reconciliation may have expired inbox rows before the scheduler runs.
update public.matching_recipient_deliveries set status='expired' where job_id='da000000-0000-4000-8000-000000000101';
set local role service_role;
select public.reconcile_expired_matching_leases('staging','harness-100000000000-100000000000',
  'xyylanuyflrjzbjzhqfl_da000000-0000-4000-8000-000000000058_1',50);
reset role;
do $release_result$
begin
  if (select state from public.matching_operations where job_id='da000000-0000-4000-8000-000000000101') <> 'no_reachable_worker'
  then raise exception 'P100_ATTESTED_COHORT_NOT_RECONCILED'; end if;
end;
$release_result$;
rollback to expiry_fixture;


do $acl$
begin
  if has_function_privilege('anon','private.reconcile_job_matching_expiry(uuid)','execute')
    or has_function_privilege('authenticated','private.reconcile_job_matching_expiry(uuid)','execute')
    or has_function_privilege('service_role','private.reconcile_job_matching_expiry(uuid)','execute')
    or has_function_privilege('anon','public.reconcile_expired_matching_leases(text,text,text,integer)','execute')
    or has_function_privilege('authenticated','public.reconcile_expired_matching_leases(text,text,text,integer)','execute')
    or not has_function_privilege('service_role','public.reconcile_expired_matching_leases(text,text,text,integer)','execute')
  then raise exception 'P100_EXPIRY_AUTHORITY_LEAK'; end if;
  if public.reconcile_expired_matching_leases('production','harness-000000000000-000000000000',
    'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000058_1',50) <> 0
  then raise exception 'P100_UNATTESTED_PRODUCTION_MUTATION'; end if;
end;
$acl$;
select 'P100 server-owned expiry, exhaustion, replay, Customer authority and release/ACL guards passed' as result;
rollback;

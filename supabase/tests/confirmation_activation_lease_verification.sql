-- @pillar id: P106-confirmation-activation-lease-sql
-- @pillar invariant: Initial matching activates exactly one durable batch under a live outbox lease, accepts unpriced RFQ and preserves the saved-worker recipient boundary.
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905161000_confirmation_activation_capacity_release.sql
-- @pillar layer: sql
-- @pillar siblings: P58-confirmation-outbox-dispatcher, P98-confirmation-outbox-state-authority-sql
-- @pillar mutation: Omit lease-bound activation and the RPC is absent; omit capacity release and expired reservations remain held.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p106');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('d1060000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p106-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p106', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p106');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('d1060000-0000-4000-8000-000000000101', 'd1060000-0000-4000-8000-000000000001',
  'plumbing', 'Candidate capacity fixture', 'q7', 'awaiting_customer_confirm', 'rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('d1060000-0000-4000-8000-000000000201', 'd1060000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('d1060000-0000-4000-8000-000000000301', 'candidate-operation-p106',
  'd1060000-0000-4000-8000-000000000201', 'd1060000-0000-4000-8000-000000000001',
  'd1060000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P9600101',
  'synthetic-candidate-p106');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('d1060000-0000-4000-8000-000000000401', 'd1060000-0000-4000-8000-000000000301',
  'd1060000-0000-4000-8000-000000000101', 'queued', 'synthetic-candidate-p106');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'd1060000-0000-4000-8000-000000000301', 'd1060000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-candidate-p106'
from public.worker_profiles where id in (
  'd1060000-0000-4000-8000-000000000002', 'd1060000-0000-4000-8000-000000000003');


insert into public.workflow_outbox(id,operation_id,event_type,status,attempt_count,lease_token,leased_by,lease_expires_at)
values ('d1060000-0000-4000-8000-000000000601','d1060000-0000-4000-8000-000000000301',
  'matching_requested','processing',1,'d1060000-0000-4000-8000-000000000602','outbox-fixture-p106',now()+interval '45 seconds');


savepoint activation_base;
do $activation$
declare
  v_job constant uuid := 'd1060000-0000-4000-8000-000000000101';
  v_outbox constant uuid := 'd1060000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd1060000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd1060000-0000-4000-8000-000000000301';
  v_result jsonb; v_first jsonb; v_before jsonb;

begin
  v_first := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_first->>'state'<>'broadcasting' or jsonb_array_length(v_first->'targets')<>2
    or v_first->>'matching_operation_id'<>'d1060000-0000-4000-8000-000000000401'
    or (select status from public.jobs where id=v_job)<>'broadcasting'
    or (select final_price from public.jobs where id=v_job) is not null
    or (select kael_price_max from public.jobs where id=v_job) is not null
  then raise exception 'P106_RFQ_NOT_ACTIVATED: %',v_first; end if;
  for i in 1..100 loop
    v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
    if v_result is distinct from v_first then raise exception 'P106_REPLAY_CHANGED_RECEIPT: %',i; end if;
  end loop;
  if (select count(*) from public.job_broadcasts where job_id=v_job)<>2
    or (select count(distinct batch_id) from public.job_broadcasts where job_id=v_job)<>1
    or (select count(*) from public.matching_operations where job_id=v_job)<>1
  then raise exception 'P106_REPLAY_DUPLICATED_BATCH'; end if;
  update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond'
    where job_id=v_job;
  update public.job_broadcasts set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_job;
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'state'<>'no_reachable_worker'
    or (select count(*) from public.job_broadcasts where job_id=v_job)<>2
  then raise exception 'P106_EXPIRED_BATCH_RECREATED'; end if;
end;
$activation$;
rollback to activation_base;

do $lease$
declare
  v_job constant uuid := 'd1060000-0000-4000-8000-000000000101';
  v_outbox constant uuid := 'd1060000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd1060000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd1060000-0000-4000-8000-000000000301';
  v_result jsonb; v_first jsonb; v_before jsonb;

begin
  select to_jsonb(job) into v_before from public.jobs job where id=v_job;
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,gen_random_uuid(),v_operation);
  if v_result->>'state'<>'lease_lost' then raise exception 'P106_WRONG_TOKEN_ACCEPTED'; end if;
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,null,v_operation);
  if v_result->>'state'<>'lease_lost' then raise exception 'P106_NULL_TOKEN_ACCEPTED'; end if;
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,gen_random_uuid());
  if v_result->>'state'<>'lease_lost' then raise exception 'P106_FOREIGN_OPERATION_ACCEPTED'; end if;
  update public.workflow_outbox set lease_expires_at=clock_timestamp()-interval '1 microsecond' where id=v_outbox;
  if (select lease_expires_at from public.workflow_outbox where id=v_outbox)<=now()
  then raise exception 'P106_WALL_CLOCK_FIXTURE_INVALID'; end if;
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'state'<>'lease_lost' then raise exception 'P106_EXPIRED_LEASE_ACCEPTED'; end if;
  if v_before is distinct from (select to_jsonb(job) from public.jobs job where id=v_job)
    or exists(select 1 from public.job_broadcasts where job_id=v_job)
    or exists(select 1 from public.job_matching_preferences where job_id=v_job)
  then raise exception 'P106_STALE_DISPATCHER_MUTATED_WORKFLOW'; end if;
end;
$lease$;
rollback to activation_base;

do $preference$
declare
  v_job constant uuid := 'd1060000-0000-4000-8000-000000000101';
  v_outbox constant uuid := 'd1060000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd1060000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd1060000-0000-4000-8000-000000000301';
  v_result jsonb; v_first jsonb; v_before jsonb;

begin
  insert into public.customer_favorite_workers(customer_id,worker_id)
    values('d1060000-0000-4000-8000-000000000001','d1060000-0000-4000-8000-000000000002');
  update public.kael_chat_sessions set preferred_worker_id='d1060000-0000-4000-8000-000000000002'
    where id='d1060000-0000-4000-8000-000000000201';
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'state'<>'broadcasting' or jsonb_array_length(v_result->'targets')<>1
    or v_result#>>'{targets,0,worker_id}'<>'d1060000-0000-4000-8000-000000000002'
    or (select auto_general from public.job_matching_preferences where job_id=v_job) is not false
    or (select strategy from public.job_matching_preferences where job_id=v_job)<>'saved_worker_first'
  then raise exception 'P106_SAVED_RFQ_BROADENED_OR_PRICE_GATED: %',v_result; end if;
  if exists(select 1 from public.matching_capacity_reservations where job_id=v_job
    and worker_id='d1060000-0000-4000-8000-000000000003' and status in ('held','offered'))
  then raise exception 'P106_SAVED_ONLY_HELD_UNUSED_WORKER'; end if;
end;
$preference$;
rollback to activation_base;

do $pending$
declare
  v_job constant uuid := 'd1060000-0000-4000-8000-000000000101';
  v_outbox constant uuid := 'd1060000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd1060000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd1060000-0000-4000-8000-000000000301';
  v_result jsonb; v_first jsonb; v_before jsonb;

begin
  insert into public.job_matching_preferences(job_id,customer_id,strategy,auto_general)
    values(v_job,'d1060000-0000-4000-8000-000000000001','pending',false);
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'state'<>'recovery_required' or v_result->>'error_code'<>'MATCHING_PREFERENCE_PENDING'
    or exists(select 1 from public.job_broadcasts where job_id=v_job)
    or (select status from public.jobs where id=v_job)<>'awaiting_customer_confirm'
  then raise exception 'P106_PENDING_PREFERENCE_BYPASSED'; end if;
end;
$pending$;
rollback to activation_base;

do $missing_favorite$
declare
  v_job constant uuid := 'd1060000-0000-4000-8000-000000000101';
  v_outbox constant uuid := 'd1060000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd1060000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd1060000-0000-4000-8000-000000000301';
  v_result jsonb; v_first jsonb; v_before jsonb;

begin
  update public.kael_chat_sessions set preferred_worker_id='d1060000-0000-4000-8000-000000000002'
    where id='d1060000-0000-4000-8000-000000000201';
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'error_code'<>'MATCHING_PREFERENCE_REQUIRES_REVIEW'
    or exists(select 1 from public.job_broadcasts where job_id=v_job)
  then raise exception 'P106_MISSING_FAVORITE_FELL_BACK_TO_GENERAL'; end if;
end;
$missing_favorite$;
rollback to activation_base;

do $capacity_and_acl$
declare
  v_job constant uuid := 'd1060000-0000-4000-8000-000000000101';
  v_outbox constant uuid := 'd1060000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd1060000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd1060000-0000-4000-8000-000000000301';
  v_result jsonb; v_first jsonb; v_before jsonb;

begin
  update public.matching_capacity_reservations set expires_at=clock_timestamp()-interval '1 microsecond'
    where job_id=v_job;
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'state'<>'no_reachable_worker'
    or exists(select 1 from public.job_broadcasts where job_id=v_job)
    or exists(select 1 from public.matching_capacity_reservations where job_id=v_job and status in ('held','offered'))
  then raise exception 'P106_EXPIRED_CAPACITY_REUSED'; end if;
  if has_function_privilege('anon','public.activate_confirmation_matching_outbox_claim(uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.activate_confirmation_matching_outbox_claim(uuid,uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.activate_confirmation_matching_outbox_claim(uuid,uuid,uuid)','execute')
  then raise exception 'P106_ACTIVATION_AUTHORITY_LEAK'; end if;
end;
$capacity_and_acl$;
rollback to activation_base;

do $inspection_and_customer_authority$
declare
  v_job constant uuid := 'd1060000-0000-4000-8000-000000000101';
  v_outbox constant uuid := 'd1060000-0000-4000-8000-000000000601';
  v_token constant uuid := 'd1060000-0000-4000-8000-000000000602';
  v_operation constant uuid := 'd1060000-0000-4000-8000-000000000301';
  v_result jsonb; v_proposal record; v_confirm record; v_first jsonb;
begin
  update public.jobs set quote_mode='inspection_only' where id=v_job;
  update public.confirmation_operations set quote_mode='inspection_only',confirmation_kind='inspection_request'
    where id=v_operation;
  v_first := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_first->>'state'<>'broadcasting' then raise exception 'P106_INSPECTION_PRICE_GATED: %',v_first; end if;
  select * into strict v_proposal from public.submit_worker_matching_proposal_atomic(v_job,
    (v_first#>>'{targets,0,broadcast_id}')::uuid,(v_first#>>'{targets,0,worker_id}')::uuid,
    'Khảo sát đường ống và xác định phạm vi sửa chữa.',null,null);
  if not v_proposal.ok then raise exception 'P106_INSPECTION_PROPOSAL_FAILED: %',row_to_json(v_proposal); end if;
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'state'<>'candidate_ready' then raise exception 'P106_CANDIDATE_REGRESSED: %',v_result; end if;
  select * into strict v_confirm from public.confirm_worker_matching_proposal_atomic(
    v_job,v_proposal.candidate_id,'d1060000-0000-4000-8000-000000000001');
  if not v_confirm.ok then raise exception 'P106_CUSTOMER_SELECTION_FAILED: %',row_to_json(v_confirm); end if;
  -- A newer Customer decision can complete the mailbox. A stale dispatcher must return lease loss or authority, never another batch.
  v_result := public.activate_confirmation_matching_outbox_claim(v_outbox,v_token,v_operation);
  if v_result->>'state' not in ('lease_lost','official_match')
    or (select state from public.confirmation_operations where id=v_operation)<>'official_match'
    or (select count(distinct batch_id) from public.job_broadcasts where job_id=v_job)<>1
  then raise exception 'P106_CUSTOMER_DECISION_REGRESSED: %',v_result; end if;
end;
$inspection_and_customer_authority$;
rollback to activation_base;

do $saved_worker_unreachable$
declare
  v_result jsonb;
begin
  insert into public.customer_favorite_workers(customer_id,worker_id)
    values('d1060000-0000-4000-8000-000000000001','d1060000-0000-4000-8000-000000000002');
  insert into public.job_matching_preferences(job_id,customer_id,strategy,preferred_worker_id,auto_general)
    values('d1060000-0000-4000-8000-000000000101','d1060000-0000-4000-8000-000000000001',
      'saved_worker_first','d1060000-0000-4000-8000-000000000002',false);
  update public.worker_profiles set is_available=false where id='d1060000-0000-4000-8000-000000000002';
  v_result := public.activate_confirmation_matching_outbox_claim('d1060000-0000-4000-8000-000000000601',
    'd1060000-0000-4000-8000-000000000602','d1060000-0000-4000-8000-000000000301');
  if v_result->>'state'<>'no_reachable_worker'
    or exists(select 1 from public.job_broadcasts where job_id='d1060000-0000-4000-8000-000000000101')
  then raise exception 'P106_UNAVAILABLE_SAVED_WORKER_BROADENED'; end if;
end;
$saved_worker_unreachable$;
select 'P106 live lease, RFQ/inspection, 100 receipt replays, saved-worker consent, Customer authority, capacity and ACL checks passed' as result;
rollback;

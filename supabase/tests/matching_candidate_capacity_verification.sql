-- @pillar id: P96-matching-candidate-capacity-sql
-- @pillar invariant: Initial and replacement matching require current eligibility and a live same-operation capacity lease; payment-pending jobs no longer occupy physical Worker capacity.
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905115000_matching_candidate_capacity.sql
-- @pillar layer: sql
-- @pillar siblings: P84-worker-cancellation-matching-outbox, P91-matching-replacement-capacity-http
-- @pillar mutation: Remove the initial-operation lease check; a released reservation still creates a candidate and P96 raises, or count payment_pending as busy and the eligible Worker fixture fails.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p96');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('d9600000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p96-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p96', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p96');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('d9600000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
  'candidate-capacity-external-customer@example.test',
  '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('d9600000-0000-4000-8000-000000000101', 'd9600000-0000-4000-8000-000000000001',
  'plumbing', 'Candidate capacity fixture', 'q7', 'broadcasting', 'rfq');
insert into public.jobs (
  id, customer_id, worker_id, service_type, description, address_district, status, quote_mode,
  final_price, kael_price_max, gross_amount, platform_fee, worker_net,
  payment_provider, payment_status
) values (
  'd9600000-0000-4000-8000-000000000103', 'd9600000-0000-4000-8000-000000000004',
  'd9600000-0000-4000-8000-000000000003', 'plumbing', 'Completed work awaiting payment', 'q7',
  'payment_pending', 'rfq', 300000, 300000, 300000, 45000, 255000,
  'platform_bank_manual', 'manual_qr_ready'
);
do $payment_pending_capacity$
begin
  if not exists (
    select 1 from private.eligible_matching_worker_ids(
      'plumbing', 'q7', 'rfq', '{}'::jsonb, '{}'::jsonb, 'synthetic-candidate-p96', now(), null, null
    ) eligible where eligible.worker_id='d9600000-0000-4000-8000-000000000003'
  ) then raise exception 'P96_PAYMENT_PENDING_JOB_BLOCKED_AVAILABLE_WORKER'; end if;
end;
$payment_pending_capacity$;
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('d9600000-0000-4000-8000-000000000201', 'd9600000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('d9600000-0000-4000-8000-000000000301', 'candidate-operation-p96',
  'd9600000-0000-4000-8000-000000000201', 'd9600000-0000-4000-8000-000000000001',
  'd9600000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P9600101',
  'synthetic-candidate-p96');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('d9600000-0000-4000-8000-000000000401', 'd9600000-0000-4000-8000-000000000301',
  'd9600000-0000-4000-8000-000000000101', 'queued', 'synthetic-candidate-p96');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'd9600000-0000-4000-8000-000000000301', 'd9600000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-candidate-p96'
from public.worker_profiles where id in (
  'd9600000-0000-4000-8000-000000000002', 'd9600000-0000-4000-8000-000000000003');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'd9600000-0000-4000-8000-000000000101',
  array['d9600000-0000-4000-8000-000000000002', 'd9600000-0000-4000-8000-000000000003']::uuid[],
  'd9600000-0000-4000-8000-000000000501', now(), now() + interval '5 minutes');

savepoint expiry_candidate;
do $expiry$
declare
  v_job constant uuid := 'd9600000-0000-4000-8000-000000000101';
  v_owner constant uuid := 'd9600000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'd9600000-0000-4000-8000-000000000002';
  v_broadcast uuid; v_candidate uuid; v_result record;
begin
  select id into strict v_broadcast from public.job_broadcasts where job_id = v_job and worker_id = v_worker;
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(
    v_job, v_broadcast, v_worker, 'Khảo sát và báo giá phạm vi cần sửa.', 200000, 300000);
  if not v_result.ok or v_result.candidate_id is null then raise exception 'P96_EXPIRY_FIXTURE_PROPOSAL: %', row_to_json(v_result); end if;
  v_candidate := v_result.candidate_id;
  select * into strict v_result from public.expire_worker_candidate_atomic(v_job, v_candidate, v_owner);
  if v_result.ok or v_result.error_code <> 'NOT_EXPIRED'
    or (select status from public.job_worker_candidates where id = v_candidate) <> 'proposed'
    or (select worker_id from public.jobs where id = v_job) is not null
  then raise exception 'P96_EXPIRY_CHOSE_OR_DECLINED_LIVE_CANDIDATE'; end if;
  update public.job_worker_candidates set proposed_at = now() - interval '2 minutes',
    expires_at = now() - interval '1 minute' where id = v_candidate;
  select * into strict v_result from public.expire_worker_candidate_atomic(v_job, v_candidate, null);
  if v_result.ok or v_result.error_code <> 'NOT_FOUND' then raise exception 'P96_EXPIRY_NULL_OWNER'; end if;
  select * into strict v_result from public.expire_worker_candidate_atomic(v_job, v_candidate, v_worker);
  if v_result.ok or v_result.error_code <> 'NOT_FOUND' then raise exception 'P96_EXPIRY_CROSS_OWNER'; end if;
  update public.profiles set role = 'admin' where id = v_owner;
  select * into strict v_result from public.expire_worker_candidate_atomic(v_job, v_candidate, v_owner);
  if v_result.ok or v_result.error_code <> 'NOT_FOUND' then raise exception 'P96_EXPIRY_ADMIN_OWNER'; end if;
  update public.profiles set role = 'customer' where id = v_owner;
  select * into strict v_result from public.expire_worker_candidate_atomic(v_job, v_candidate, v_owner);
  if not v_result.ok or v_result.already_applied or v_result.job_status <> 'broadcasting'
    or (select status from public.job_worker_candidates where id = v_candidate) <> 'expired'
    or (select customer_decided_at from public.job_worker_candidates where id = v_candidate) is not null
    or (select status from public.worker_matching_proposals where candidate_id = v_candidate) <> 'expired'
    or (select status from public.job_broadcasts where id = v_broadcast) <> 'expired'
    or (select status from public.matching_recipient_deliveries where broadcast_id = v_broadcast) <> 'expired'
    or (select status from public.matching_capacity_reservations where job_id = v_job and worker_id = v_worker) <> 'released'
    or (select state from public.matching_operations where job_id = v_job) <> 'broadcasting'
    or (select state from public.confirmation_operations where job_id = v_job) <> 'broadcasting'
  then raise exception 'P96_EXPIRY_LEFT_PARTIAL_STATE'; end if;
  for i in 1..100 loop
    select * into strict v_result from public.expire_worker_candidate_atomic(v_job, v_candidate, v_owner);
    if not v_result.ok or not v_result.already_applied then raise exception 'P96_EXPIRY_REPLAY_FAILED'; end if;
  end loop;
  if (select worker_id from public.jobs where id = v_job) is not null
    or (select status from public.matching_capacity_reservations where job_id = v_job
      and worker_id = 'd9600000-0000-4000-8000-000000000003') not in ('held', 'offered')
  then raise exception 'P96_EXPIRY_CHANGED_ASSIGNMENT_OR_OTHER_WORKER'; end if;
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(v_job,
    (select id from public.job_broadcasts where job_id = v_job
      and worker_id = 'd9600000-0000-4000-8000-000000000003'),
    'd9600000-0000-4000-8000-000000000003', 'Kiểm tra và báo giá phương án xử lý.', 220000, 320000);
  if not v_result.ok then raise exception 'P96_NEXT_CANDIDATE_UNAVAILABLE'; end if;
  select * into strict v_result from public.expire_worker_candidate_atomic(v_job, v_candidate, v_owner);
  if not v_result.ok or not v_result.already_applied or v_result.job_status <> 'worker_candidate_pending'
    or not exists (select 1 from public.job_worker_candidates where job_id = v_job
      and id <> v_candidate and status = 'proposed')
  then raise exception 'P96_STALE_EXPIRY_CHANGED_NEW_CANDIDATE'; end if;
end;
$expiry$;
rollback to expiry_candidate;

savepoint inspection_candidate;
update public.jobs set quote_mode = 'inspection_only' where id = 'd9600000-0000-4000-8000-000000000101';
do $inspection$
declare v_result record;
begin
  select * into strict v_result from public.submit_worker_matching_proposal_atomic(
    'd9600000-0000-4000-8000-000000000101',
    (select id from public.job_broadcasts where job_id = 'd9600000-0000-4000-8000-000000000101'
      and worker_id = 'd9600000-0000-4000-8000-000000000002'),
    'd9600000-0000-4000-8000-000000000002', 'Khảo sát hiện trạng trước khi báo giá.', null, null);
  if not v_result.ok then raise exception 'P96_INSPECTION_PROPOSAL_FAILED'; end if;
  select * into strict v_result from public.confirm_worker_matching_proposal_atomic(
    'd9600000-0000-4000-8000-000000000101', v_result.candidate_id, 'd9600000-0000-4000-8000-000000000001');
  if not v_result.ok or exists (select 1 from public.jobs
    where id = 'd9600000-0000-4000-8000-000000000101'
      and (final_price is not null or kael_price_min is not null or kael_price_max is not null))
  then raise exception 'P96_INSPECTION_ASSIGNED_FAKE_PRICE'; end if;
end;
$inspection$;
rollback to inspection_candidate;

savepoint priced_candidate;
update public.jobs set quote_mode = 'kael_auto_quote', kael_price_min = 150000, kael_price_max = 250000,
kael_estimate_card_v3 = '{"card":{"price_source":"baseline_with_market","price_reasoning_receipt":{"schema_version":"price_reasoning_receipt.v1","receipt_id":"price_reasoning:d9600000-0000-4000-8000-000000000101","costs":{"total_min":150000,"total_max":250000},"scenarios":{"low":{"total":150000},"high":{"total":250000}},"fairness":{"price_source":"baseline_with_market","confidence":"medium","baseline_evidence":null,"market_source_count":3,"high_trust_source_count":2,"quorum_met":true,"cap_statement":"Verified fixture range only."}}}}'::jsonb where id = 'd9600000-0000-4000-8000-000000000101';
update public.job_broadcasts set status = 'expired' where job_id = 'd9600000-0000-4000-8000-000000000101';
select * from public.activate_job_broadcast_batch_atomic('d9600000-0000-4000-8000-000000000101',
array['d9600000-0000-4000-8000-000000000002']::uuid[],gen_random_uuid(),now(),now()+interval '5 minutes');
do $priced$
declare v_result record; v_denied record; v_quote uuid; v_expired uuid;
begin
select (original_scope_price_quote->>'quote_id')::uuid into v_quote from public.job_broadcasts
where job_id='d9600000-0000-4000-8000-000000000101' and worker_id='d9600000-0000-4000-8000-000000000002';
select * into strict v_result from public.accept_priced_broadcast_durable_atomic(
'd9600000-0000-4000-8000-000000000101','d9600000-0000-4000-8000-000000000002',v_quote);
if not v_result.ok then raise exception 'P96_PRICED_ACCEPT_FAILED: %', row_to_json(v_result); end if;
begin
  -- Priced receipts are immutable: seed an expired receipt instead of rewriting an accepted one.
  update public.job_worker_candidates set status='withdrawn' where id=v_result.candidate_id;
  insert into public.job_worker_candidates(job_id,worker_id,broadcast_id,status,proposed_at,expires_at,original_scope_price_quote)
    select job_id,worker_id,broadcast_id,'proposed',now()-interval '2 minutes',now()-interval '1 minute',
      original_scope_price_quote || jsonb_build_object(
        'quote_id',gen_random_uuid(),'expires_at',now()-interval '1 minute','worker_confirmed_at',now()-interval '2 minutes')
    from public.job_worker_candidates where id=v_result.candidate_id returning id into v_expired;
  select * into strict v_denied from public.confirm_worker_candidate_atomic(
    'd9600000-0000-4000-8000-000000000101',v_expired,'d9600000-0000-4000-8000-000000000001');
  if v_denied.ok or v_denied.error_code is distinct from 'EXPIRED' then
    raise exception 'P96_PRICED_LATE_CONFIRM_NOT_EXPIRED: %',row_to_json(v_denied);
  end if;
  if exists(select 1 from public.matching_capacity_reservations
    where job_id='d9600000-0000-4000-8000-000000000101' and worker_id='d9600000-0000-4000-8000-000000000002'
      and status in ('held','offered'))
    or exists(select 1 from public.matching_recipient_deliveries
      where broadcast_id=(select broadcast_id from public.job_worker_candidates where id=v_result.candidate_id)
        and status in ('queued','delivered','seen','accepted'))
    or (select count(*) from public.job_events
      where job_id='d9600000-0000-4000-8000-000000000101' and event_type='worker_candidate_expired')<>1 then
    raise exception 'P96_PRICED_LATE_CONFIRM_LEFT_ACTIVE_OFFER';
  end if;
  raise exception using errcode='PT096',message='ROLLBACK_LATE_CONFIRM_FIXTURE';
exception when sqlstate 'PT096' then null;
end;
begin
  update public.worker_profiles set is_available=false where id='d9600000-0000-4000-8000-000000000002';
  select * into strict v_denied from public.confirm_worker_candidate_atomic(
    'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,'d9600000-0000-4000-8000-000000000001');
  if v_denied.ok or v_denied.error_code is distinct from 'WORKER_NOT_ELIGIBLE'
    or exists(select 1 from public.matching_capacity_reservations
      where job_id='d9600000-0000-4000-8000-000000000101' and worker_id='d9600000-0000-4000-8000-000000000002'
        and status in ('held','offered'))
    or (select count(*) from public.job_events
      where job_id='d9600000-0000-4000-8000-000000000101' and event_type='worker_candidate_became_ineligible')<>1 then
    raise exception 'P96_PRICED_UNAVAILABLE_CONFIRM_NOT_DURABLE: %',row_to_json(v_denied);
  end if;
  raise exception using errcode='PT096',message='ROLLBACK_UNAVAILABLE_PRICED_FIXTURE';
exception when sqlstate 'PT096' then null;
end;
select * into strict v_denied from public.expire_worker_candidate_atomic(
'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,'d9600000-0000-4000-8000-000000000001');
if v_denied.ok or v_denied.error_code <> 'NOT_EXPIRED' then raise exception 'P96_PRICED_PREMATURE_EXPIRY'; end if;
select * into strict v_denied from public.confirm_worker_candidate_atomic(
'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,null);
if v_denied.ok or v_denied.error_code <> 'NOT_FOUND' then raise exception 'P96_PRICED_NULL_CUSTOMER'; end if;
select * into strict v_denied from public.reject_worker_candidate_atomic(
'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,null);
if v_denied.ok or v_denied.error_code <> 'NOT_FOUND' then raise exception 'P96_REJECT_NULL_CUSTOMER'; end if;
update public.profiles set role = 'admin' where id = 'd9600000-0000-4000-8000-000000000001';
select * into strict v_denied from public.confirm_worker_candidate_atomic(
'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,'d9600000-0000-4000-8000-000000000001');
if v_denied.ok or v_denied.error_code <> 'NOT_FOUND' then raise exception 'P96_PRICED_ADMIN_CONFIRMED'; end if;
select * into strict v_denied from public.reject_worker_candidate_atomic(
'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,'d9600000-0000-4000-8000-000000000001');
if v_denied.ok or v_denied.error_code <> 'NOT_FOUND' then raise exception 'P96_ADMIN_REJECTED'; end if;
update public.profiles set role = 'customer' where id = 'd9600000-0000-4000-8000-000000000001';
select * into strict v_result from public.confirm_worker_candidate_atomic(
'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,'d9600000-0000-4000-8000-000000000001');
if not v_result.ok then raise exception 'P96_PRICED_CONFIRM_FAILED: %', row_to_json(v_result); end if;
if (select count(*) from public.job_events where job_id='d9600000-0000-4000-8000-000000000101'
  and event_type='customer_confirmed_worker' and actor_role='customer')<>1
  or (select count(*) from public.notifications where job_id='d9600000-0000-4000-8000-000000000101'
    and event_type in ('worker_matched','customer_confirmed_worker'))<>2
  or exists(select 1 from public.matching_capacity_reservations
    where job_id='d9600000-0000-4000-8000-000000000101' and status in ('held','offered')) then
  raise exception 'P96_PRICED_MATCH_MISSING_DURABLE_PROJECTION';
end if;
select * into strict v_denied from public.expire_worker_candidate_atomic(
'd9600000-0000-4000-8000-000000000101',v_result.candidate_id,'d9600000-0000-4000-8000-000000000001');
if v_denied.ok or v_denied.error_code <> 'INVALID_STATUS'
  or (select worker_id from public.jobs where id='d9600000-0000-4000-8000-000000000101') <> 'd9600000-0000-4000-8000-000000000002'
then raise exception 'P96_EXPIRY_UNASSIGNED_OFFICIAL_WORKER'; end if;
end; $priced$;
rollback to priced_candidate;

do $capacity$
declare
  v_job constant uuid := 'd9600000-0000-4000-8000-000000000101';
  v_worker constant uuid := 'd9600000-0000-4000-8000-000000000002';
  v_broadcast uuid;
  v_candidate record;
  v_repeat record;
  v_expected_expiry timestamptz;
  v_proposed_at timestamptz;
  v_reason text;
begin
  select id into strict v_broadcast from public.job_broadcasts where job_id = v_job and worker_id = v_worker;
  begin
    update public.matching_capacity_reservations set status = 'released', released_at = now()
      where job_id = v_job and worker_id = v_worker;
    select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
      v_job, v_broadcast, v_worker, 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
    if v_candidate.ok then raise exception 'P96_RELEASED_CAPACITY_CREATED_CANDIDATE'; end if;
    raise exception 'P96_WRONG_CAPACITY_REFUSAL: %', row_to_json(v_candidate);
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'MATCHING_CAPACITY_UNAVAILABLE' then raise; end if;
  end;

  foreach v_reason in array array['expired_lease', 'offline', 'changed_role'] loop
    begin
      if v_reason = 'expired_lease' then
        update public.matching_capacity_reservations set held_at = now() - interval '2 minutes',
          expires_at = now() - interval '1 minute' where job_id = v_job and worker_id = v_worker;
      elsif v_reason = 'offline' then
        update public.worker_profiles set matching_foreground_active_until = now() - interval '1 second'
          where id = v_worker;
      else
        update public.profiles set role = 'admin' where id = v_worker;
      end if;
      select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
        v_job, v_broadcast, v_worker, 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
      if v_reason='changed_role' and v_candidate.ok is false
        and v_candidate.error_code='DELIVERY_NOT_ACTIVE' then
        if exists(select 1 from public.job_worker_candidates where job_id=v_job)
          or (select status from public.jobs where id=v_job) <> 'broadcasting' then
          raise exception 'P96_EARLY_ROLE_DENIAL_CHANGED_MATCHING';
        end if;
        update public.profiles set role='worker' where id=v_worker;
      else
        raise exception 'P96_INELIGIBLE_WORKER_PROPOSED: %, %', v_reason,row_to_json(v_candidate);
      end if;
    exception when object_not_in_prerequisite_state then
      if sqlerrm <> 'MATCHING_CAPACITY_UNAVAILABLE' then raise; end if;
    end;
  end loop;

  update public.matching_capacity_reservations set expires_at = now() + interval '2 minutes'
    where job_id = v_job and worker_id = v_worker returning expires_at into v_expected_expiry;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job, v_broadcast, v_worker, 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
  if not v_candidate.ok or (select worker_id from public.jobs where id = v_job) is not null then
    raise exception 'P96_VALID_PROPOSAL_LOST_CUSTOMER_GATE';
  end if;
  if (select expires_at from public.job_worker_candidates where id = v_candidate.candidate_id)
    is distinct from v_expected_expiry then raise exception 'P96_CANDIDATE_OUTLIVED_CAPACITY'; end if;
  for i in 1..100 loop
    select * into strict v_repeat from public.submit_worker_matching_proposal_atomic(
      v_job, v_broadcast, v_worker, 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
    if not v_repeat.ok or not v_repeat.already_applied
      or v_repeat.candidate_id <> v_candidate.candidate_id then raise exception 'P96_DUPLICATE_PROPOSAL'; end if;
  end loop;
  if (select count(*) from public.job_worker_candidates where job_id = v_job) <> 1 then
    raise exception 'P96_MULTIPLE_CANDIDATES';
  end if;
  select proposed_at into v_proposed_at from public.job_worker_candidates where id=v_candidate.candidate_id;
  update public.job_worker_candidates set proposed_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'
    where id=v_candidate.candidate_id;
  select * into strict v_repeat from public.submit_worker_matching_proposal_atomic(
    v_job,v_broadcast,v_worker,'Kiểm tra và báo giá xử lý rò nước.',300000,500000);
  if v_repeat.ok or v_repeat.error_code is distinct from 'DELIVERY_NOT_ACTIVE' then
    raise exception 'P96_EXPIRED_PROPOSAL_REPLAY_FALSE_SUCCESS';
  end if;
  update public.job_worker_candidates set proposed_at=v_proposed_at,expires_at=v_expected_expiry
    where id=v_candidate.candidate_id;
  select * into strict v_repeat from public.submit_worker_matching_proposal_atomic(
    v_job, (select id from public.job_broadcasts where job_id = v_job and worker_id <> v_worker),
    'd9600000-0000-4000-8000-000000000003', 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
  if v_repeat.ok then raise exception 'P96_SECOND_WORKER_STOLE_CANDIDATE'; end if;
  select * into strict v_repeat from public.confirm_worker_matching_proposal_atomic(
    v_job, v_candidate.candidate_id, 'd9600000-0000-4000-8000-000000000003');
  if v_repeat.ok or v_repeat.error_code <> 'NOT_FOUND' then raise exception 'P96_CROSS_CUSTOMER_CONFIRM'; end if;
  select * into strict v_repeat from public.confirm_worker_matching_proposal_atomic(v_job, v_candidate.candidate_id, null);
  if v_repeat.ok or v_repeat.error_code <> 'NOT_FOUND' then raise exception 'P96_NULL_CUSTOMER_CONFIRMED_WORKER'; end if;
  update public.profiles set role = 'admin' where id = 'd9600000-0000-4000-8000-000000000001';
  select * into strict v_repeat from public.confirm_worker_matching_proposal_atomic(
    v_job, v_candidate.candidate_id, 'd9600000-0000-4000-8000-000000000001');
  if v_repeat.ok or v_repeat.error_code <> 'NOT_FOUND' then raise exception 'P96_ADMIN_CONFIRMED_WORKER'; end if;
  update public.profiles set role = 'customer' where id = 'd9600000-0000-4000-8000-000000000001';

  foreach v_reason in array array['expired_lease', 'offline', 'changed_role'] loop
    begin
      if v_reason = 'expired_lease' then
        update public.matching_capacity_reservations set held_at = now() - interval '2 minutes',
          expires_at = now() - interval '1 minute' where job_id = v_job and worker_id = v_worker;
      elsif v_reason = 'offline' then
        update public.worker_profiles set matching_foreground_active_until = now() - interval '1 second'
          where id = v_worker;
      else
        update public.profiles set role = 'admin' where id = v_worker;
      end if;
      perform * from public.confirm_worker_matching_proposal_atomic(
        v_job, v_candidate.candidate_id, 'd9600000-0000-4000-8000-000000000001');
      raise exception 'P96_INELIGIBLE_WORKER_ASSIGNED: %', v_reason;
    exception when object_not_in_prerequisite_state then
      if sqlerrm <> 'MATCHING_CAPACITY_UNAVAILABLE' then raise; end if;
    end;
  end loop;
  if (select status from public.job_worker_candidates where id = v_candidate.candidate_id) <> 'proposed'
    or (select worker_id from public.jobs where id = v_job) is not null then
    raise exception 'P96_FAILED_ASSIGNMENT_LEFT_PARTIAL_MUTATION';
  end if;
  select * into strict v_repeat from public.confirm_worker_matching_proposal_atomic(
    v_job, v_candidate.candidate_id, 'd9600000-0000-4000-8000-000000000001');
  if not v_repeat.ok or v_repeat.worker_id <> v_worker then raise exception 'P96_VALID_ASSIGNMENT_FAILED'; end if;
  for i in 1..100 loop
    select * into strict v_repeat from public.confirm_worker_matching_proposal_atomic(
      v_job, v_candidate.candidate_id, 'd9600000-0000-4000-8000-000000000001');
    if not v_repeat.ok or not v_repeat.already_applied or v_repeat.worker_id <> v_worker then
      raise exception 'P96_ASSIGNMENT_REPLAY_CHANGED_OUTCOME';
    end if;
  end loop;
end;
$capacity$;

do $grants$
begin
  if has_function_privilege('authenticated', 'private.require_live_matching_capacity(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'private.require_live_matching_capacity(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.confirm_worker_candidate_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.reject_worker_candidate_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.expire_worker_candidate_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'public.expire_worker_candidate_atomic(uuid,uuid,uuid)', 'execute')
  then raise exception 'P96_CLIENT_CAN_BYPASS_EDGE_AUTHORITY'; end if;
end;
$grants$;
select 'P96 capacity, deadline, actor authority and replay guards passed' as result;
rollback;

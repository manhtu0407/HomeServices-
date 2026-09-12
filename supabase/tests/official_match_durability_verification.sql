-- @pillar id: P122-official-match-durability-sql
-- @pillar invariant: Official assignment commits its audit and participant inbox receipts and fences obsolete matching work exactly once
-- @pillar authority: governance/RULES.md #7 and #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260908010000_official_match_durable_projection.sql
-- @pillar layer: sql
-- @pillar siblings: P121-candidate-decision-durability-sql, P96-matching-candidate-capacity-sql
-- @pillar mutation: Omit the success projection; a successful confirmation has no committed audit or participant notices

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-customer-cancel-p122');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor := ('c1220000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'customer-cancel-p122-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i >= 3 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-customer-cancel-p122', v_actor,
      case when i >= 3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i >= 3 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, i=3, 'Rejection fixture', '1990-01-01',
        'approved', 'synthetic-customer-cancel-p122');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('c1220000-0000-4000-8000-000000000101', 'c1220000-0000-4000-8000-000000000001',
  'plumbing', 'Customer cancellation fixture', 'q7', 'broadcasting', 'rfq'),
  ('c1220000-0000-4000-8000-000000000102','c1220000-0000-4000-8000-000000000002',
  'plumbing','Foreign cancellation fixture','q7','broadcasting','rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('c1220000-0000-4000-8000-000000000201', 'c1220000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('c1220000-0000-4000-8000-000000000301', 'customer-cancellation-operation-p122',
  'c1220000-0000-4000-8000-000000000201', 'c1220000-0000-4000-8000-000000000001',
  'c1220000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'broadcasting', 'P1220101',
  'synthetic-customer-cancel-p122');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('c1220000-0000-4000-8000-000000000401', 'c1220000-0000-4000-8000-000000000301',
  'c1220000-0000-4000-8000-000000000101', 'broadcasting', 'synthetic-customer-cancel-p122');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('c1220000-0000-4000-8000-000000000301', 'c1220000-0000-4000-8000-000000000101',
  'c1220000-0000-4000-8000-000000000003', 'plumbing', 'q7', 'held', now(), now()+interval '5 minutes',
  'synthetic-customer-cancel-p122');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'c1220000-0000-4000-8000-000000000101', array['c1220000-0000-4000-8000-000000000003']::uuid[],
  'c1220000-0000-4000-8000-000000000501', now(), now()+interval '5 minutes');
insert into public.workflow_outbox(id, operation_id, event_type, status, attempt_count, lease_token,
  leased_by, lease_expires_at)
values ('c1220000-0000-4000-8000-000000000601', 'c1220000-0000-4000-8000-000000000301',
  'matching_requested', 'processing', 1, 'c1220000-0000-4000-8000-000000000602',
  'customer-cancellation-fixture-p122', now()+interval '45 seconds');



set local role service_role;

do $official_match$
declare
  v_job constant uuid:='c1220000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1220000-0000-4000-8000-000000000001';
  v_worker constant uuid:='c1220000-0000-4000-8000-000000000003';
  v_candidate record;
  v_result record;
  v_mode public.service_quote_mode;
begin
  foreach v_mode in array array['rfq','inspection_only']::public.service_quote_mode[] loop
  begin
  update public.jobs set quote_mode=v_mode where id=v_job;
  update public.confirmation_operations set quote_mode=v_mode,
    confirmation_kind=case when v_mode='rfq' then 'rfq_request' else 'inspection_request' end where job_id=v_job;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(v_job,
    (select id from public.job_broadcasts where job_id=v_job and worker_id=v_worker),
    v_worker,'Kiểm tra và báo giá xử lý rò nước.',
    case when v_mode='rfq' then 300000 else null end,case when v_mode='rfq' then 500000 else null end);
  if not v_candidate.ok then raise exception 'P122_PROPOSAL_FIXTURE_FAILED: %',row_to_json(v_candidate); end if;
  select * into strict v_result from public.confirm_worker_matching_proposal_atomic(
    v_job,v_candidate.candidate_id,v_customer);
  if not v_result.ok or v_result.already_applied or v_result.job_status<>'worker_matched' then
    raise exception 'P122_OFFICIAL_MATCH_REFUSED: %',row_to_json(v_result);
  end if;
  if (select count(*) from public.job_events where job_id=v_job and event_type='customer_confirmed_worker'
      and actor_id=v_customer and actor_role='customer'
      and safe_metadata->>'candidate_id'=v_candidate.candidate_id::text)<>1 then
    raise exception 'P122_OFFICIAL_MATCH_MISSING_DURABLE_CUSTOMER_AUDIT';
  end if;
  if (select count(*) from public.notifications where job_id=v_job
      and ((user_id=v_customer and event_type='worker_matched')
        or (user_id=v_worker and event_type='customer_confirmed_worker')))<>2 then
    raise exception 'P122_OFFICIAL_MATCH_MISSING_PARTICIPANT_INBOX';
  end if;
  if (select state from public.confirmation_operations where job_id=v_job)<>'official_match'
    or (select state from public.matching_operations where job_id=v_job)<>'official_match'
    or exists(select 1 from public.matching_capacity_reservations where job_id=v_job and status in ('held','offered'))
    or exists(select 1 from public.workflow_outbox where operation_id='c1220000-0000-4000-8000-000000000301'
      and (status<>'completed' or lease_token is not null or lease_expires_at is not null)) then
    raise exception 'P122_OFFICIAL_MATCH_LEFT_OBSOLETE_MATCHING_ACTIVE';
  end if;
  if exists(select 1 from public.notifications notice where notice.job_id=v_job
    and not exists(select 1 from public.synthetic_matching_cohort_members member
      join public.jobs job on job.synthetic_cohort_id=member.cohort_id
      where job.id=notice.job_id and member.profile_id=notice.user_id)) then
    raise exception 'P122_PARTICIPANT_INBOX_LOST_COHORT';
  end if;
  begin
    perform public.insert_notification_atomic(
      'c1220000-0000-4000-8000-000000000002',v_job,'worker_matched','Sai người nhận','Không được gửi',
      jsonb_build_object('candidate_id',v_candidate.candidate_id));
    raise exception 'P122_FOREIGN_ACTOR_RECEIVED_OFFICIAL_NOTICE';
  exception when invalid_parameter_value then
    if sqlerrm<>'OFFICIAL_MATCH_NOTIFICATION_NOT_AUTHORIZED' then raise; end if;
  end;
  begin
    perform public.insert_notification_atomic(v_worker,v_job,'customer_confirmed_worker','Sai đề xuất','Không được gửi',
      jsonb_build_object('candidate_id','c1220000-0000-4000-8000-000000000999'));
    raise exception 'P122_FOREIGN_CANDIDATE_RECEIVED_OFFICIAL_NOTICE';
  exception when invalid_parameter_value then
    if sqlerrm<>'OFFICIAL_MATCH_NOTIFICATION_NOT_AUTHORIZED' then raise; end if;
  end;
  begin
    insert into public.job_events(job_id,event_type,actor_id,actor_role,from_status,to_status,safe_metadata)
      values(v_job,'customer_confirmed_worker',v_worker,'worker','worker_candidate_pending','worker_matched',
        jsonb_build_object('candidate_id',v_candidate.candidate_id));
    raise exception 'P122_WORKER_FORGED_CUSTOMER_AUDIT';
  exception when invalid_parameter_value then
    if sqlerrm<>'OFFICIAL_MATCH_AUDIT_NOT_AUTHORIZED' then raise; end if;
  end;
  update public.notifications set status='read',read_at=now() where job_id=v_job;
  for i in 1..100 loop
    select * into strict v_result from public.confirm_worker_matching_proposal_atomic(v_job,v_candidate.candidate_id,v_customer);
    if not v_result.ok or not v_result.already_applied then raise exception 'P122_REPLAY_NOT_IDEMPOTENT'; end if;
    perform public.insert_notification_atomic(v_customer,v_job,'worker_matched','Ancien client','Ancien client',
      jsonb_build_object('worker_id',v_worker));
    perform public.insert_notification_atomic(v_worker,v_job,'customer_confirmed_worker','Ancien client','Ancien client',
      jsonb_build_object('candidate_id',v_candidate.candidate_id));
    insert into public.job_events(job_id,event_type,actor_id,actor_role,from_status,to_status,safe_metadata)
      values(v_job,'customer_confirmed_worker',v_customer,'customer','worker_candidate_pending','worker_matched',
        jsonb_build_object('candidate_id',v_candidate.candidate_id,'worker_id',v_worker));
  end loop;
  if (select count(*) from public.job_events where job_id=v_job and event_type='customer_confirmed_worker')<>1
    or (select count(*) from public.notifications where job_id=v_job and event_type in ('worker_matched','customer_confirmed_worker'))<>2
    or exists(select 1 from public.notifications where job_id=v_job and status<>'read') then
    raise exception 'P122_REPLAY_DUPLICATED_OR_RESET_DURABLE_RECEIPT';
  end if;
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  set local role authenticated;
  if (select count(*) from public.notifications where job_id=v_job)<>1
    or exists(select 1 from public.notifications where job_id=v_job and user_id<>v_customer) then
    raise exception 'P122_CUSTOMER_INBOX_RLS_BROKEN';
  end if;
  set local role service_role;
  perform set_config('request.jwt.claim.sub',v_worker::text,true);
  set local role authenticated;
  if (select count(*) from public.notifications where job_id=v_job)<>1
    or exists(select 1 from public.notifications where job_id=v_job and user_id<>v_worker) then
    raise exception 'P122_WORKER_INBOX_RLS_BROKEN';
  end if;
  set local role service_role;
  perform set_config('request.jwt.claim.sub','c1220000-0000-4000-8000-000000000002',true);
  set local role authenticated;
  if exists(select 1 from public.notifications where job_id=v_job)
    or exists(select 1 from public.job_events where job_id=v_job) then
    raise exception 'P122_FOREIGN_CUSTOMER_READ_OFFICIAL_MATCH';
  end if;
  set local role service_role;
  raise exception using errcode='PT122',message='ROLLBACK_OFFICIAL_MODE_FIXTURE';
  exception when sqlstate 'PT122' then null;
  end;
  end loop;
end;
$official_match$;
do $grants$
begin
  if has_function_privilege('service_role','private.project_official_worker_match(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid)','execute')
    or has_function_privilege('anon','public.confirm_worker_candidate_atomic(uuid,uuid,uuid)','execute') then
    raise exception 'P122_OFFICIAL_PROJECTION_EXPOSED';
  end if;
end;
$grants$;
select 'PASS' as official_match_durability;
rollback;

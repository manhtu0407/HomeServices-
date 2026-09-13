-- @pillar id: P129-apartment-access-authority-sql
-- @pillar invariant: Customer authorization locks the exact assignment and check-in, with one durable audit and inbox receipt
-- @pillar authority: governance/RULES.md #7 and #9 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260908012000_apartment_access_atomic_authorization.sql
-- @pillar layer: sql
-- @pillar siblings: P128-apartment-access-authorization
-- @pillar mutation: Remove the expected check-in comparison; the stale visit rejection becomes an unauthorized success

begin;
set local statement_timeout='20s';
set local lock_timeout='3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-apartment-p129');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor:=('c1290000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(v_actor,'authenticated','authenticated','apartment-p129-'||i||'@example.test',
        '{"provider":"email","providers":["email"]}','{}',now(),now());
    if i>=3 then update public.profiles set role='worker' where id=v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id,profile_id,member_role)
      values('synthetic-apartment-p129',v_actor,
        case when i>=3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i>=3 then
      insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,
        problem_specializations,is_approved,is_available,legal_name,date_of_birth,verification_status,synthetic_cohort_id)
      values(v_actor,array['plumbing']::public.service_type[],array['plumbing']::public.service_type[],
        5,array['q7'],array[]::text[],true,true,'Apartment fixture','1990-01-01','approved','synthetic-apartment-p129');
      perform public.record_worker_matching_heartbeat(v_actor,now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode,apartment_access_state)
values('c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000001',
  'c1290000-0000-4000-8000-000000000003','plumbing','Apartment authorization fixture','q7','arrived','rfq',
  '{"worker_checked_in":true,"check_in":{"worker_id":"c1290000-0000-4000-8000-000000000003","checked_in_at":"2026-09-08T01:00:00.000Z","mode":"geofence"}}');

set local role service_role;
do $authorize$
declare
  v_job constant uuid:='c1290000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c1290000-0000-4000-8000-000000000001';
  v_worker constant uuid:='c1290000-0000-4000-8000-000000000003';
  v_time constant text:='2026-09-08T01:00:00.000Z';
  v_result record;
  v_first timestamptz;
  v_original jsonb;
begin
  select apartment_access_state into strict v_original from public.jobs where id=v_job;
  select * into strict v_result from public.authorize_apartment_access_atomic(v_job,
    'c1290000-0000-4000-8000-000000000002',v_worker,v_time);
  if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' or v_result.job_id is not null then
    raise exception 'P129_FOREIGN_CUSTOMER_GAINED_ACCESS_OR_DISCLOSED_JOB: %',row_to_json(v_result);
  end if;
  select * into strict v_result from public.authorize_apartment_access_atomic(v_job,v_customer,
    'c1290000-0000-4000-8000-000000000004',v_time);
  if v_result.ok or v_result.error_code is distinct from 'ACCESS_CONTEXT_CHANGED' then
    raise exception 'P129_STALE_WORKER_INTENT_ACCEPTED: %',row_to_json(v_result);
  end if;
  select * into strict v_result from public.authorize_apartment_access_atomic(v_job,v_customer,v_worker,'2026-09-08T00:59:00.000Z');
  if v_result.ok or v_result.error_code is distinct from 'ACCESS_CONTEXT_CHANGED' then
    raise exception 'P129_STALE_CHECK_IN_INTENT_ACCEPTED: %',row_to_json(v_result);
  end if;
  if (select apartment_access_state from public.jobs where id=v_job) is distinct from v_original then
    raise exception 'P129_REJECTED_COMMAND_MUTATED_ACCESS';
  end if;
  begin
    update public.jobs set apartment_access_state=apartment_access_state
      ||'{"exact_unit_released":true,"customer_authorized":true}'::jsonb where id=v_job;
    raise exception 'P129_LEGACY_DIRECT_GRANT_BYPASSED_CUSTOMER_RPC';
  exception when insufficient_privilege then
    if sqlerrm<>'ACCESS_CUSTOMER_AUTHORIZATION_REQUIRED' then raise; end if;
  end;
  for i in 1..100 loop
    select * into strict v_result from public.authorize_apartment_access_atomic(v_job,v_customer,v_worker,v_time);
    if not v_result.ok or v_result.error_code is not null or v_result.worker_id<>v_worker
      or v_result.checked_in_at<>v_time or v_result.authorized_at is null
      or v_result.already_authorized<>(i>1) then
      raise exception 'P129_CURRENT_CUSTOMER_RECEIPT_INVALID iteration %: %',i,row_to_json(v_result);
    end if;
    if i=1 then v_first:=v_result.authorized_at;
    elsif v_result.authorized_at is distinct from v_first then raise exception 'P129_REPLAY_CHANGED_RECEIPT'; end if;
  end loop;
  if (select count(*) from public.job_events where job_id=v_job and event_type='apartment_access_authorized'
    and actor_id=v_customer and actor_role='customer')<>1
    or (select count(*) from public.notifications where job_id=v_job and user_id=v_worker
      and event_type='apartment_access_authorized')<>1 then
    raise exception 'P129_AUTHORIZATION_AUDIT_OR_INBOX_NOT_EXACTLY_ONCE';
  end if;
  if exists(select 1 from public.notifications notice where notice.job_id=v_job
    and not exists(select 1 from public.synthetic_matching_cohort_members member
      join public.jobs job on job.synthetic_cohort_id=member.cohort_id
      where job.id=notice.job_id and member.profile_id=notice.user_id)) then
    raise exception 'P129_INBOX_ESCAPED_COHORT';
  end if;
  select * into strict v_result from public.authorize_apartment_access_atomic(v_job,v_customer,v_worker,'2026-09-08T00:59:00.000Z');
  if v_result.ok or v_result.error_code is distinct from 'ACCESS_CONTEXT_CHANGED' then
    raise exception 'P129_ALREADY_AUTHORIZED_BYPASSED_INTENT_VALIDATION';
  end if;
  update public.jobs set apartment_access_state=jsonb_set(apartment_access_state,
    '{check_in,checked_in_at}','"2026-09-08T01:10:00.000Z"') where id=v_job;
  if (select apartment_access_state->'exact_unit_released' from public.jobs where id=v_job)='true'::jsonb then
    raise exception 'P129_CHANGED_CHECK_IN_INHERITED_AUTHORIZATION';
  end if;
  select * into strict v_result from public.authorize_apartment_access_atomic(v_job,v_customer,v_worker,v_time);
  if v_result.ok or v_result.error_code is distinct from 'ACCESS_CONTEXT_CHANGED' then
    raise exception 'P129_PRIOR_VISIT_REAUTHORIZED_NEW_CHECK_IN';
  end if;
  select * into strict v_result from public.authorize_apartment_access_atomic(v_job,v_customer,v_worker,'2026-09-08T01:10:00.000Z');
  if not v_result.ok or v_result.already_authorized then raise exception 'P129_NEW_VISIT_FRESH_CONSENT_REFUSED'; end if;
  insert into public.kael_chat_sessions(id,customer_id,service_type,status,case_phase)
    values('c1290000-0000-4000-8000-000000000201',v_customer,'plumbing','active','matching');
  insert into public.confirmation_operations(id,idempotency_key,session_id,customer_id,job_id,
    quote_mode,confirmation_kind,state,support_code,synthetic_cohort_id)
    values('c1290000-0000-4000-8000-000000000301','apartment-p129-confirmation',
      'c1290000-0000-4000-8000-000000000201',v_customer,v_job,'rfq','rfq_request','broadcasting',
      'P1290101','synthetic-apartment-p129');
  insert into public.matching_operations(id,confirmation_operation_id,job_id,state,synthetic_cohort_id)
    values('c1290000-0000-4000-8000-000000000401','c1290000-0000-4000-8000-000000000301',
      v_job,'candidate_ready','synthetic-apartment-p129');
  insert into public.matching_capacity_reservations(operation_id,job_id,worker_id,service_type,
    district_code,status,held_at,expires_at,synthetic_cohort_id)
    values('c1290000-0000-4000-8000-000000000301',v_job,'c1290000-0000-4000-8000-000000000004',
      'plumbing','q7','held',now(),now()+interval '5 minutes','synthetic-apartment-p129');
  insert into public.job_broadcasts(id,job_id,worker_id,status,expires_at)
    values('c1290000-0000-4000-8000-000000000501',v_job,'c1290000-0000-4000-8000-000000000004',
      'accepted',now()+interval '5 minutes');
  insert into public.matching_recipient_deliveries(operation_id,job_id,worker_id,broadcast_id,status,
    expires_at,synthetic_cohort_id)
    values('c1290000-0000-4000-8000-000000000401',v_job,'c1290000-0000-4000-8000-000000000004',
      'c1290000-0000-4000-8000-000000000501','accepted',now()+interval '5 minutes','synthetic-apartment-p129');
  insert into public.job_worker_candidates(job_id,worker_id,broadcast_id,status,customer_decided_at,expires_at)
    values(v_job,'c1290000-0000-4000-8000-000000000004','c1290000-0000-4000-8000-000000000501',
      'customer_confirmed',now(),now()+interval '5 minutes');
  update public.jobs set worker_id='c1290000-0000-4000-8000-000000000004' where id=v_job;
  if (select apartment_access_state from public.jobs where id=v_job)<>'{}'::jsonb then
    raise exception 'P129_REASSIGNMENT_RETAINED_APARTMENT_ACCESS';
  end if;
  update public.jobs set worker_id=null where id=v_job;
  if (select apartment_access_state from public.jobs where id=v_job)<>'{}'::jsonb then
    raise exception 'P129_UNASSIGNMENT_RETAINED_APARTMENT_ACCESS';
  end if;
  select * into strict v_result from public.authorize_apartment_access_atomic(v_job,v_customer,v_worker,'2026-09-08T01:10:00.000Z');
  if v_result.ok or v_result.error_code is distinct from 'ACCESS_NOT_READY' then
    raise exception 'P129_UNASSIGNED_JOB_ACCEPTED_ACCESS';
  end if;
end;
$authorize$;

reset role;
do $acl$
declare v_role text;
begin
  foreach v_role in array array['anon','authenticated'] loop
    if has_function_privilege(v_role,'public.authorize_apartment_access_atomic(uuid,uuid,uuid,text)','execute') then
      raise exception 'P129_DIRECT_CLIENT_CAN_AUTHORIZE: %',v_role;
    end if;
  end loop;
  if not has_function_privilege('service_role','public.authorize_apartment_access_atomic(uuid,uuid,uuid,text)','execute') then
    raise exception 'P129_EDGE_CANNOT_AUTHORIZE';
  end if;
end;
$acl$;
set local role authenticated;
do $direct$
begin
  perform public.authorize_apartment_access_atomic('c1290000-0000-4000-8000-000000000101',
    'c1290000-0000-4000-8000-000000000001','c1290000-0000-4000-8000-000000000003','2026-09-08T01:00:00.000Z');
  raise exception 'P129_DIRECT_AUTHENTICATED_RPC_BYPASS';
exception when insufficient_privilege then null;
end;
$direct$;
reset role;
select 'P129_PASS' as result;
rollback;

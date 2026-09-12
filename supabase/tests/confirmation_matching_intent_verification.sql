-- @pillar id: P108-confirmation-preference-sql
-- @pillar invariant: First confirmation persists matching intent atomically; pending choice holds neither Worker capacity nor a dispatch attempt, and confirmation replay cannot change intent.
-- @pillar authority: governance/RULES.md #7 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260905162000_confirmation_matching_intent.sql
-- @pillar layer: sql
-- @pillar siblings: P107-confirmation-preference-http, P106-confirmation-activation-lease-sql
-- @pillar mutation: Discard intent or claim pending outbox rows; the pending preference or zero-attempt assertion fails.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p108');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('d1080000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p108-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p108', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p108');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;


insert into public.customer_favorite_workers(customer_id,worker_id)
values('d1080000-0000-4000-8000-000000000001','d1080000-0000-4000-8000-000000000002');

do $sessions$
declare v_problem uuid;
begin
  select id into strict v_problem from public.service_problems
    where service_type='plumbing' and is_active order by slug limit 1;
  update public.service_intake_policies set quote_mode='rfq'
    where service_problem_id=v_problem and status='active';
  for i in 1..4 loop
    insert into public.kael_chat_sessions(id,customer_id,service_type,status,case_phase,
      diagnosis_scope,scheduled_at,safe_metadata)
    values(('d1080000-0000-4000-8000-'||lpad((200+i)::text,12,'0'))::uuid,
      'd1080000-0000-4000-8000-000000000001','plumbing','active','offer_review',
      jsonb_build_object('version',1,'service_type','plumbing','profile_id','plumbing-diagnose',
        'case_phase','offer_review','facts','{}'::jsonb,'missing_facts','[]'::jsonb,
        'evidence','[]'::jsonb,'scope_summary','Khảo sát và báo giá xử lý đường ống bị rò nước trong căn hộ.',
        'quote_ready',false,'quote_blockers','["worker_quote_required"]'::jsonb,
        'worker_requirements','[]'::jsonb,'next_action','{"kind":"request_worker_quote"}'::jsonb),
      now()+interval '1 day',
      jsonb_build_object('address_district','q7','address_label','Synthetic fixture q7',
        'problem_chips',jsonb_build_array('pipe_leak')));
    insert into public.kael_chat_turns(session_id,turn_index,role,content_type,safe_metadata)
    values(('d1080000-0000-4000-8000-'||lpad((200+i)::text,12,'0'))::uuid,
      1,'kael','analysis',jsonb_build_object('service_problem_id',v_problem));
  end loop;
end;
$sessions$;

savepoint preference_base;
set local role service_role;
do $pending$
declare
  v_session constant uuid := 'd1080000-0000-4000-8000-000000000201';
  v_customer constant uuid := 'd1080000-0000-4000-8000-000000000001';
  v_key text := 'kael-confirm:'||v_session||':'||v_customer;
  v_first record; v_retry record; v_before jsonb;
begin
  select * into strict v_first from public.confirm_kael_chat_durable_atomic_v4(
    v_session,v_customer,v_key,'rfq_request',null,'prompt_if_saved');
  if not v_first.ok or v_first.already_applied
    or (select strategy from public.job_matching_preferences where job_id=v_first.job_id) is distinct from 'pending'
    or (select auto_general from public.job_matching_preferences where job_id=v_first.job_id) is not false
    or exists(select 1 from public.matching_capacity_reservations
      where job_id=v_first.job_id and status in ('held','offered'))
    or exists(select 1 from public.job_broadcasts where job_id=v_first.job_id)
    or (select kael_price_max from public.jobs where id=v_first.job_id) is not null
  then raise exception 'P108_PENDING_INTENT_NOT_ATOMIC: %',row_to_json(v_first); end if;
  select to_jsonb(preference) into v_before from public.job_matching_preferences preference where job_id=v_first.job_id;
  for i in 1..100 loop
    select * into strict v_retry from public.confirm_kael_chat_durable_atomic_v4(
      v_session,v_customer,v_key,'rfq_request',null,null);
    if not v_retry.ok or not v_retry.already_applied or v_retry.job_id<>v_first.job_id
      or v_retry.operation_id<>v_first.operation_id
    then raise exception 'P108_CONFIRM_REPLAY_CHANGED_IDENTITY'; end if;
    perform * from public.claim_confirmation_matching_outbox_batch('preference-p108',50,45);
    begin
      perform * from public.claim_confirmation_matching_outbox(v_session,v_customer,30);
      raise exception 'P108_LEGACY_CLAIM_EXPOSED';
    exception when insufficient_privilege then null;
    end;
  end loop;
  if v_before is distinct from (select to_jsonb(preference) from public.job_matching_preferences preference where job_id=v_first.job_id)
    or exists(select 1 from public.matching_capacity_reservations where job_id=v_first.job_id and status in ('held','offered'))
    or exists(select 1 from public.workflow_outbox where operation_id=v_first.operation_id and event_type='matching_requested'
      and (attempt_count<>0 or status<>'queued' or lease_token is not null or dead_lettered_at is not null))
    or (select count(*) from public.confirmation_operations where session_id=v_session)<>1
  then raise exception 'P108_PENDING_REPLAY_OR_DISPATCH_MUTATED_INTENT'; end if;
end;
$pending$;
rollback to preference_base;

set local role service_role;
do $general$
declare v_result record; v_job uuid; v_before jsonb;
begin
  select * into strict v_result from public.confirm_kael_chat_durable_atomic_v4(
    'd1080000-0000-4000-8000-000000000201','d1080000-0000-4000-8000-000000000001',
    'kael-confirm:d1080000-0000-4000-8000-000000000201:d1080000-0000-4000-8000-000000000001',
    'rfq_request',null,null);
  v_job:=v_result.job_id;
  if not v_result.ok or (select strategy from public.job_matching_preferences where job_id=v_job)<>'general'
    or (select count(*) from public.matching_capacity_reservations where job_id=v_job and status='held')<>1
  then raise exception 'P108_GENERAL_CAPACITY_MISSING: %',row_to_json(v_result); end if;
  update public.matching_capacity_reservations set status='expired',released_at=clock_timestamp(),
    held_at=clock_timestamp()-interval '5 minutes',
    expires_at=clock_timestamp()-interval '1 second' where job_id=v_job;
  select to_jsonb(capacity) into v_before from public.matching_capacity_reservations capacity where job_id=v_job;
  select * into strict v_result from public.confirm_kael_chat_durable_atomic_v4(
    'd1080000-0000-4000-8000-000000000201','d1080000-0000-4000-8000-000000000001',
    'kael-confirm:d1080000-0000-4000-8000-000000000201:d1080000-0000-4000-8000-000000000001',
    'rfq_request',null,'prompt_if_saved');
  if not v_result.already_applied
    or (select strategy from public.job_matching_preferences where job_id=v_job)<>'general'
    or v_before is distinct from (select to_jsonb(capacity) from public.matching_capacity_reservations capacity where job_id=v_job)
  then raise exception 'P108_REPLAY_REACQUIRED_CAPACITY_OR_CHANGED_INTENT'; end if;
end;
$general$;
rollback to preference_base;

update public.kael_chat_sessions set preferred_worker_id='d1080000-0000-4000-8000-000000000002'
  where id='d1080000-0000-4000-8000-000000000201';
set local role service_role;
do $saved$
declare v_result record;
begin
  select * into strict v_result from public.confirm_kael_chat_durable_atomic_v4(
    'd1080000-0000-4000-8000-000000000201','d1080000-0000-4000-8000-000000000001',
    'kael-confirm:d1080000-0000-4000-8000-000000000201:d1080000-0000-4000-8000-000000000001',
    'rfq_request',null,'prompt_if_saved');
  if not v_result.ok or not exists(select 1 from public.job_matching_preferences
    where job_id=v_result.job_id and strategy='saved_worker_first' and not auto_general
      and preferred_worker_id='d1080000-0000-4000-8000-000000000002')
  then raise exception 'P108_EXPLICIT_SAVED_WORKER_NOT_PRESERVED'; end if;
end;
$saved$;
rollback to preference_base;

do $authority$
begin
  if has_function_privilege('anon','public.confirm_kael_chat_durable_atomic_v4(uuid,uuid,text,text,text,text)','execute')
    or has_function_privilege('authenticated','public.confirm_kael_chat_durable_atomic_v4(uuid,uuid,text,text,text,text)','execute')
    or not has_function_privilege('service_role','public.confirm_kael_chat_durable_atomic_v4(uuid,uuid,text,text,text,text)','execute')
  then raise exception 'P108_CONFIRM_RPC_EXPOSED'; end if;
  begin
    perform * from public.confirm_kael_chat_durable_atomic_v4(
      'd1080000-0000-4000-8000-000000000201','d1080000-0000-4000-8000-000000000001',
      'kael-confirm:d1080000-0000-4000-8000-000000000201:d1080000-0000-4000-8000-000000000001',
      'rfq_request',null,'force_general');
    raise exception 'P108_INVALID_MATCHING_MODE_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform * from public.confirm_kael_chat_durable_atomic_v4(
      'd1080000-0000-4000-8000-000000000201','d1080000-0000-4000-8000-000000000002',
      'kael-confirm:d1080000-0000-4000-8000-000000000201:d1080000-0000-4000-8000-000000000002',
      'rfq_request',null,'prompt_if_saved');
    raise exception 'P108_WORKER_CONFIRM_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.confirm_kael_chat_durable_authorized_v6(
      'd1080000-0000-4000-8000-000000000201','d1080000-0000-4000-8000-000000000001',
      'kael-confirm:d1080000-0000-4000-8000-000000000201:d1080000-0000-4000-8000-000000000001',
      'rfq_request',null,'prompt_if_saved',gen_random_uuid(),gen_random_uuid(),
      repeat('a',64),'admin','kael.chat.confirm','mobile.route.kael.chat.confirm',
      'staging','synthetic-p108',true,'session',repeat('b',64),20);
    raise exception 'P108_ADMIN_AUTHORIZED_CONFIRM_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  if exists(select 1 from public.jobs where customer_id='d1080000-0000-4000-8000-000000000001')
  then raise exception 'P108_INVALID_COMMAND_CREATED_JOB'; end if;
end;
$authority$;
rollback;

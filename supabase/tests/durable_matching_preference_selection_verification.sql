-- @pillar id: P110-matching-selection-sql
-- @pillar invariant: Customer selection atomically reserves eligible capacity and resumes one initial outbox with immutable request identity and no pre-dispatch delivery.
-- @pillar authority: governance/RULES.md #7 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260905163000_durable_matching_preference_selection.sql
-- @pillar layer: sql
-- @pillar siblings: P109-matching-selection-http, P108-confirmation-preference-sql
-- @pillar mutation: Omit durable selection or capacity recheck; the receipt is missing or unavailable capacity commits a selection.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p110');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('d1100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p110-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p110', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p110');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;


insert into public.customer_favorite_workers(customer_id,worker_id)
values('d1100000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000002');

do $sessions$
declare v_problem uuid;
begin
  select id into strict v_problem from public.service_problems
    where service_type='plumbing' and slug='plumbing-general' and is_active;
  update public.service_intake_policies set quote_mode='rfq'
    where service_problem_id=v_problem and status='active';
  for i in 1..4 loop
    insert into public.kael_chat_sessions(id,customer_id,service_type,status,case_phase,
      diagnosis_scope,scheduled_at,safe_metadata)
    values(('d1100000-0000-4000-8000-'||lpad((200+i)::text,12,'0'))::uuid,
      'd1100000-0000-4000-8000-000000000001','plumbing','active','offer_review',
      jsonb_build_object('version',1,'service_type','plumbing','profile_id','plumbing-diagnose',
        'case_phase','offer_review','facts','{}'::jsonb,'missing_facts','[]'::jsonb,
        'evidence','[]'::jsonb,'scope_summary','Khảo sát và báo giá xử lý đường ống bị rò nước trong căn hộ.',
        'quote_ready',false,'quote_blockers','["worker_quote_required"]'::jsonb,
        'worker_requirements','[]'::jsonb,'next_action','{"kind":"request_worker_quote"}'::jsonb),
      now()+interval '1 day',
      jsonb_build_object('address_district','q7','address_label','Synthetic fixture q7',
        'problem_chips',jsonb_build_array('pipe_leak')));
    insert into public.kael_chat_turns(session_id,turn_index,role,content_type,safe_metadata)
    values(('d1100000-0000-4000-8000-'||lpad((200+i)::text,12,'0'))::uuid,
      1,'kael','analysis',jsonb_build_object('service_problem_id',v_problem));
  end loop;
end;
$sessions$;


savepoint selection_base;
set local role service_role;
do $selection$
declare
  v_customer constant uuid:='d1100000-0000-4000-8000-000000000001';
  v_worker constant uuid:='d1100000-0000-4000-8000-000000000002';
  v_request constant uuid:='d1100000-0000-4000-8000-000000000901';
  v_session constant uuid:='d1100000-0000-4000-8000-000000000201';
  v_confirm record; v_first jsonb; v_replay jsonb; v_claim record; v_activation jsonb;
begin
  select * into strict v_confirm from public.confirm_kael_chat_durable_atomic_v4(
    v_session,v_customer,'kael-confirm:'||v_session||':'||v_customer,'rfq_request',null,'prompt_if_saved');
  v_first:=public.request_job_matching_preference_atomic(v_confirm.job_id,v_customer,
    'saved_worker_first',v_worker,false,v_request);
  if v_first->>'state'<>'queued' or (v_first->>'broadcast_sent')::boolean
    or v_first->>'request_id'<>v_request::text or v_first->>'preferred_worker_id'<>v_worker::text
    or (v_first->>'auto_general')::boolean
    or (select status from public.jobs where id=v_confirm.job_id)<>'awaiting_customer_confirm'
    or exists(select 1 from public.job_broadcasts where job_id=v_confirm.job_id)
  then raise exception 'P110_SELECTION_NOT_DURABLE_OR_INVENTED_DELIVERY: %',v_first; end if;
  for i in 1..100 loop
    v_replay:=public.request_job_matching_preference_atomic(v_confirm.job_id,v_customer,
      'saved_worker_first',v_worker,false,v_request);
    if v_replay is distinct from v_first then raise exception 'P110_REPLAY_CHANGED_RECEIPT'; end if;
  end loop;
  if public.get_job_matching_preference_receipt(v_confirm.job_id,v_customer,v_request) is distinct from v_first
    or (select count(*) from public.workflow_outbox where operation_id=v_confirm.operation_id and event_type='matching_requested')<>1
    or exists(select 1 from public.workflow_outbox where operation_id=v_confirm.operation_id and attempt_count<>0)
    or (select count(*) from public.matching_capacity_reservations where job_id=v_confirm.job_id
      and status='held' and worker_id=v_worker)<>1
  then raise exception 'P110_REPLAY_DUPLICATED_OR_LOST_COMMAND'; end if;
  begin
    perform public.request_job_matching_preference_atomic(v_confirm.job_id,v_customer,
      'saved_worker_first',v_worker,true,v_request);
    raise exception 'P110_REPLAY_CHANGED_CONSENT';
  exception when unique_violation then null; end;
  begin
    perform public.request_job_matching_preference_atomic(v_confirm.job_id,v_customer,
      'saved_worker_first',v_worker,false,gen_random_uuid());
    raise exception 'P110_SECOND_REQUEST_REPLACED_CHOICE';
  exception when unique_violation then null; end;
  select * into strict v_claim from public.claim_confirmation_matching_outbox_batch('selection-p110',50,45)
    where operation_id=v_confirm.operation_id;
  v_activation:=public.activate_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id);
  if v_activation->>'state'<>'broadcasting' or jsonb_array_length(v_activation->'targets')<>1
    or v_activation#>>'{targets,0,worker_id}'<>v_worker::text
  then raise exception 'P110_DURABLE_CHOICE_NOT_DISPATCHED: %',v_activation; end if;
  v_replay:=public.request_job_matching_preference_atomic(v_confirm.job_id,v_customer,
    'saved_worker_first',v_worker,false,v_request);
  if v_replay->>'request_id'<>v_request::text or v_replay->>'operation_id'<>v_first->>'operation_id'
    or not (v_replay->>'broadcast_sent')::boolean
    or (select count(*) from public.job_broadcasts where job_id=v_confirm.job_id)<>1
  then raise exception 'P110_DISPATCH_REPLAY_DUPLICATED'; end if;
end;
$selection$;
rollback to selection_base;

set local role service_role;
do $unavailable$
declare v_confirm record; v_request uuid:=gen_random_uuid(); v_result jsonb;
begin
  select * into strict v_confirm from public.confirm_kael_chat_durable_atomic_v4(
    'd1100000-0000-4000-8000-000000000201','d1100000-0000-4000-8000-000000000001',
    'kael-confirm:d1100000-0000-4000-8000-000000000201:d1100000-0000-4000-8000-000000000001',
    'rfq_request',null,'prompt_if_saved');
  update public.worker_profiles set is_available=false where synthetic_cohort_id='synthetic-candidate-p110';
  begin
    perform public.request_job_matching_preference_atomic(v_confirm.job_id,'d1100000-0000-4000-8000-000000000001',
      'general',null,false,v_request);
    raise exception 'P110_UNAVAILABLE_CAPACITY_ACCEPTED';
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'COVERAGE_UNAVAILABLE' then raise; end if;
  end;
  if (select strategy from public.job_matching_preferences where job_id=v_confirm.job_id)<>'pending'
    or exists(select 1 from public.matching_capacity_reservations where job_id=v_confirm.job_id and status in ('held','offered'))
  then raise exception 'P110_FAILED_SELECTION_MUTATED_INTENT'; end if;
  update public.worker_profiles set is_available=true where synthetic_cohort_id='synthetic-candidate-p110';
  v_result:=public.request_job_matching_preference_atomic(v_confirm.job_id,'d1100000-0000-4000-8000-000000000001',
    'general',null,false,v_request);
  if v_result->>'mode'<>'general' or v_result->>'request_id'<>v_request::text
  then raise exception 'P110_FAILED_REQUEST_CANNOT_RESUME'; end if;
  begin
    perform public.get_job_matching_preference_receipt(v_confirm.job_id,'d1100000-0000-4000-8000-000000000002',v_request);
    raise exception 'P110_FOREIGN_RECEIPT_VISIBLE';
  exception when insufficient_privilege then null; end;
  begin
    update public.job_matching_preferences set auto_general=true where job_id=v_confirm.job_id;
    raise exception 'P110_RECEIPT_IDENTITY_MUTABLE';
  exception when check_violation then null; end;
end;
$unavailable$;
rollback to selection_base;

do $authority$
begin
  if has_function_privilege('anon','public.request_job_matching_preference_atomic(uuid,uuid,text,uuid,boolean,uuid)','execute')
    or has_function_privilege('authenticated','public.request_job_matching_preference_atomic(uuid,uuid,text,uuid,boolean,uuid)','execute')
    or has_function_privilege('authenticated','public.get_job_matching_preference_receipt(uuid,uuid,uuid)','execute')
  then raise exception 'P110_RPC_AUTHORITY_LEAK'; end if;
end;
$authority$;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d1110000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'coverage-customer-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1110000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'coverage-customer-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1110000-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
    'coverage-worker-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1110000-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
    'coverage-worker-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1110000-0000-4000-8000-000000000013', 'authenticated', 'authenticated',
    'coverage-worker-three@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1110000-0000-4000-8000-000000000014', 'authenticated', 'authenticated',
    'coverage-worker-four@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'worker'
where id in (
  'd1110000-0000-4000-8000-000000000011',
  'd1110000-0000-4000-8000-000000000012',
  'd1110000-0000-4000-8000-000000000013',
  'd1110000-0000-4000-8000-000000000014'
);

insert into public.customer_profiles(id, building_name, unit_number, district)
values
  ('d1110000-0000-4000-8000-000000000001', 'Coverage Building One', 'D67-1', 'q7'),
  ('d1110000-0000-4000-8000-000000000002', 'Coverage Building Two', 'D67-2', 'q7')
on conflict (id) do update
set building_name = excluded.building_name,
  unit_number = excluded.unit_number,
  district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status
) values
  ('d1110000-0000-4000-8000-000000000011', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Worker One', '1990-01-01', 'approved'),
  ('d1110000-0000-4000-8000-000000000012', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, true, 'Coverage Worker Two', '1990-01-02', 'approved'),
  ('d1110000-0000-4000-8000-000000000013', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, false, 'Coverage Worker Three', '1990-01-03', 'approved'),
  ('d1110000-0000-4000-8000-000000000014', array['plumbing']::public.service_type[],
    array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[],
    true, false, 'Coverage Worker Four', '1990-01-04', 'approved');

select * from public.record_worker_matching_heartbeat(
  'd1110000-0000-4000-8000-000000000011', now()
);
select * from public.record_worker_matching_heartbeat(
  'd1110000-0000-4000-8000-000000000012', now()
);
select * from public.record_worker_matching_heartbeat(
  'd1110000-0000-4000-8000-000000000013', now()
);
select * from public.record_worker_matching_heartbeat(
  'd1110000-0000-4000-8000-000000000014', now()
);

do $$
declare
  v_problem_id uuid;
begin
  select problem.id into strict v_problem_id
  from public.service_problems as problem
  where problem.service_type = 'plumbing'
    and problem.slug = 'plumbing-general'
    and problem.is_active;

  update public.service_intake_policies as policy
  set quote_mode = 'rfq'
  where policy.service_problem_id = v_problem_id
    and policy.status = 'active';

  insert into public.kael_chat_sessions(
    id, customer_id, service_type, status, case_phase, diagnosis_scope,
    scheduled_at, safe_metadata
  ) values
    (
      'd1110000-0000-4000-8000-000000000101',
      'd1110000-0000-4000-8000-000000000001',
      'plumbing', 'active', 'offer_review',
      jsonb_build_object(
        'version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose',
        'case_phase', 'offer_review', 'facts', '{}'::jsonb,
        'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb,
        'scope_summary', 'Khảo sát và báo giá xử lý đường ống bị rò nước trong căn hộ.',
        'quote_ready', false, 'quote_blockers', '["worker_quote_required"]'::jsonb,
        'worker_requirements', '[]'::jsonb,
        'next_action', '{"kind":"request_worker_quote"}'::jsonb
      ),
      now() + interval '1 day',
      jsonb_build_object(
        'address_district', 'q7', 'address_label', 'Coverage Building One D67-1',
        'problem_chips', jsonb_build_array('pipe_leak')
      )
    ),
    (
      'd1110000-0000-4000-8000-000000000102',
      'd1110000-0000-4000-8000-000000000002',
      'plumbing', 'active', 'offer_review',
      jsonb_build_object(
        'version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose',
        'case_phase', 'offer_review', 'facts', '{}'::jsonb,
        'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb,
        'scope_summary', 'Khảo sát và báo giá xử lý đường ống bị rò nước trong căn hộ.',
        'quote_ready', false, 'quote_blockers', '["worker_quote_required"]'::jsonb,
        'worker_requirements', '[]'::jsonb,
        'next_action', '{"kind":"request_worker_quote"}'::jsonb
      ),
      now() + interval '1 day',
      jsonb_build_object(
        'address_district', 'q7', 'address_label', 'Coverage Building Two D67-2',
        'problem_chips', jsonb_build_array('pipe_leak')
      )
    );

  insert into public.kael_chat_turns(
    session_id, turn_index, role, content_type, safe_metadata
  ) values
    ('d1110000-0000-4000-8000-000000000101', 1, 'kael', 'analysis',
      jsonb_build_object('service_problem_id', v_problem_id)),
    ('d1110000-0000-4000-8000-000000000102', 1, 'kael', 'analysis',
      jsonb_build_object('service_problem_id', v_problem_id));
end;
$$;


update public.worker_profiles set is_available=true where id::text like 'd1110000-%';
insert into public.customer_favorite_workers(customer_id,worker_id)
values('d1110000-0000-4000-8000-000000000001','d1110000-0000-4000-8000-000000000011');
set local role service_role;
do $public_threshold$
declare v_confirm record; v_request uuid:=gen_random_uuid(); v_result jsonb;
begin
  select * into strict v_confirm from public.confirm_kael_chat_durable_atomic_v4(
    'd1110000-0000-4000-8000-000000000101','d1110000-0000-4000-8000-000000000001',
    'kael-confirm:d1110000-0000-4000-8000-000000000101:d1110000-0000-4000-8000-000000000001',
    'rfq_request',null,'prompt_if_saved');
  if not v_confirm.ok then raise exception 'P110_PUBLIC_CONFIRM_FIXTURE_FAILED'; end if;
  update public.worker_profiles set is_available=false where id in (
    'd1110000-0000-4000-8000-000000000013','d1110000-0000-4000-8000-000000000014');
  begin
    perform public.request_job_matching_preference_atomic(v_confirm.job_id,'d1110000-0000-4000-8000-000000000001',
      'general',null,false,v_request);
    raise exception 'P110_TWO_WORKERS_OPENED_PUBLIC_SELECTION';
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'COVERAGE_UNAVAILABLE' then raise; end if;
  end;
  update public.worker_profiles set is_available=true where id='d1110000-0000-4000-8000-000000000013';
  v_result:=public.request_job_matching_preference_atomic(v_confirm.job_id,'d1110000-0000-4000-8000-000000000001',
    'general',null,false,v_request);
  if v_result->>'state'<>'queued'
    or (select count(*) from public.matching_capacity_reservations where job_id=v_confirm.job_id and status='held')<>3
  then raise exception 'P110_PUBLIC_THREE_WORKER_LEASE_MISSING: %',v_result; end if;
end;
$public_threshold$;
rollback;

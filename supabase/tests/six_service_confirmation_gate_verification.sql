-- @pillar id: P425-six-service-confirmation-gate-sql
-- @pillar invariant: For each of the six services the database refuses a Customer confirmation that is not ready, has the wrong kind, has no active policy or carries a safety blocker without writing a Job, an operation or an outbox row, accepts the ready confirmation once and replays it to the same Job, refuses a Worker, an Admin and a non-owner, and keeps Case rows readable only by their owner and Admin, unwritable by every API role, unique per turn and unchanged by a confirmation that raises.
-- @pillar authority: governance/RULES.md #6 | governance/RULES.md #7 | owner four-blocker update (J03 and J15)
-- @pillar target: supabase/migrations/20261012120000_kael_evidence_gap_rfq_fallback.sql
-- @pillar layer: sql
-- @pillar siblings: P108-confirmation-preference-sql, P67-public-coverage-reservation
-- @pillar mutation: Skip the Tier A field loop or the confirmation kind comparison in the durable confirmation function; the not-ready and wrong-kind assertions fail for every service.
-- Rollback-only proof for J03 (no offer before the Case is ready) and J15 (atomicity and RLS) on all six services.

begin;
set local statement_timeout = '60s';

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('d6930000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'gate-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6930000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'gate-other-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6930000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'gate-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6930000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'gate-admin@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());
update public.profiles set role = 'worker' where id = 'd6930000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin' where id = 'd6930000-0000-4000-8000-000000000004';
insert into public.customer_profiles(id, building_name, unit_number, district)
values
  ('d6930000-0000-4000-8000-000000000001', 'Gate Building', 'D693-1', 'q7'),
  ('d6930000-0000-4000-8000-000000000002', 'Gate Building', 'D693-2', 'q7')
on conflict (id) do update set building_name = excluded.building_name;

do $workers$
declare
  v_worker uuid;
  v_index integer;
begin
  for v_index in 1..18 loop
    v_worker := ('d6930000-0000-4000-8000-0000000001' || lpad(v_index::text, 2, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_worker, 'authenticated', 'authenticated', 'gate-coverage-worker-' || v_index || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());
    update public.profiles set role = 'worker' where id = v_worker;
    insert into public.worker_profiles(id, service_types, selected_service_types, years_experience, districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth, verification_status)
    values (v_worker, array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']::public.service_type[], array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']::public.service_type[], 5, array['q7'], array[]::text[], true, true, 'Gate coverage worker ' || v_index, '1990-01-01', 'approved');
    perform public.record_worker_matching_heartbeat(v_worker, now());
  end loop;
end;
$workers$;

-- Five sessions per service: 1 incomplete, 2 wrong kind, 3 no policy, 4 safety blocker, 5 ready.
do $fixtures$
declare
  v_services constant text[] := array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'];
  v_service text;
  v_index integer;
  v_scenario integer;
  v_problem uuid;
  v_session uuid;
  v_summary text;
  v_metadata jsonb;
begin
  for v_index in 1..6 loop
    v_service := v_services[v_index];
    select problem.id into strict v_problem
    from public.service_problems as problem
    where problem.service_type = v_service::public.service_type and problem.slug = 'other_' || v_service and problem.is_active;
    for v_scenario in 1..5 loop
      v_session := ('d6930000-0000-4000-8000-0000000' || lpad((v_index * 10 + v_scenario)::text, 5, '0'))::uuid;
      v_summary := case when v_scenario = 1 then 'x' else 'Kiểm tra và báo giá xử lý sự cố ' || v_service || ' trong căn hộ.' end;
      v_metadata := jsonb_build_object('address_district', 'q7', 'address_label', 'Gate Building D693-1', 'problem_chips', jsonb_build_array('other_' || v_service));
      if v_scenario = 4 then
        v_metadata := v_metadata || jsonb_build_object('intake_coverage', jsonb_build_object('safety_blocker', 'live_hazard'));
      end if;
      insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, safe_metadata)
      values (v_session, 'd6930000-0000-4000-8000-000000000001', v_service::public.service_type, 'active',
        case when v_scenario = 5 then 'offer_review' else 'analysis' end,
        jsonb_build_object('version', 1, 'service_type', v_service, 'profile_id', v_service || '-diagnose',
          'case_phase', case when v_scenario = 5 then 'offer_review' else 'analysis' end, 'facts', '{}'::jsonb,
          'missing_facts', case when v_scenario = 1 then '["symptom"]'::jsonb else '[]'::jsonb end, 'evidence', '[]'::jsonb,
          'scope_summary', v_summary, 'quote_ready', v_scenario <> 1,
          'quote_blockers', case when v_scenario = 1 then '["missing_symptom"]'::jsonb else '["worker_quote_required"]'::jsonb end,
          'worker_requirements', '[]'::jsonb, 'next_action', '{"kind":"request_worker_quote"}'::jsonb),
        now() + interval '1 day', v_metadata);
      if v_scenario <> 3 then
        insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
        values (v_session, 1, 'kael', 'analysis', jsonb_build_object('service_problem_id', v_problem));
      end if;
    end loop;
  end loop;
end;
$fixtures$;

set local role service_role;

-- J03: every not-ready confirmation is refused and writes nothing, for every service.
do $refusals$
declare
  v_services constant text[] := array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'];
  v_customer constant uuid := 'd6930000-0000-4000-8000-000000000001';
  v_expected constant text[] := array['TIER_A_INCOMPLETE', 'CONFIRMATION_KIND_MISMATCH', 'POLICY_UNAVAILABLE', 'SAFETY_BLOCKED'];
  v_kind text;
  v_index integer;
  v_scenario integer;
  v_session uuid;
  v_result record;
begin
  for v_index in 1..6 loop
    for v_scenario in 1..4 loop
      v_session := ('d6930000-0000-4000-8000-0000000' || lpad((v_index * 10 + v_scenario)::text, 5, '0'))::uuid;
      v_kind := case when v_scenario = 2 then 'priced_offer' else 'rfq_request' end;
      select * into strict v_result from public.confirm_kael_chat_durable_atomic_v4(
        v_session, v_customer, 'kael-confirm:' || v_session || ':' || v_customer, v_kind, null, 'prompt_if_saved');
      if v_result.ok or v_result.error_code is distinct from v_expected[v_scenario] or v_result.job_id is not null or v_result.operation_id is not null then
        raise exception 'service % scenario % was not refused as %: %', v_services[v_index], v_scenario, v_expected[v_scenario], row_to_json(v_result);
      end if;
    end loop;
  end loop;
  if exists (select 1 from public.jobs where customer_id = v_customer)
    or exists (select 1 from public.confirmation_operations where customer_id = v_customer)
    or exists (select 1 from public.workflow_outbox where operation_id in (select id from public.confirmation_operations where customer_id = v_customer))
    or exists (select 1 from public.kael_chat_sessions where customer_id = v_customer and (job_id is not null or status <> 'active'))
  then
    raise exception 'a refused confirmation wrote a Job, an operation, an outbox row or changed a Case';
  end if;
end;
$refusals$;

-- Only the owning Customer can confirm: a Worker, an Admin and another Customer are refused before any write.
do $actors$
declare
  v_session constant uuid := 'd6930000-0000-4000-8000-000000000015';
  v_actor uuid;
begin
  foreach v_actor in array array['d6930000-0000-4000-8000-000000000003'::uuid, 'd6930000-0000-4000-8000-000000000004'::uuid] loop
    begin
      perform * from public.confirm_kael_chat_durable_atomic_v4(v_session, v_actor, 'kael-confirm:' || v_session || ':' || v_actor, 'rfq_request', null, 'prompt_if_saved');
      raise exception 'actor % confirmed a Customer Case', v_actor;
    exception when insufficient_privilege then
      if sqlerrm <> 'CUSTOMER_CONFIRMATION_REQUIRED' then raise; end if;
    end;
  end loop;
  begin
    perform * from public.confirm_kael_chat_durable_atomic_v4(v_session, 'd6930000-0000-4000-8000-000000000002', 'kael-confirm:' || v_session || ':d6930000-0000-4000-8000-000000000002', 'rfq_request', null, 'prompt_if_saved');
    raise exception 'another Customer confirmed the Case';
  exception when insufficient_privilege then
    if sqlerrm <> 'CONFIRMATION_NOT_OWNED' then raise; end if;
  end;
  if exists (select 1 from public.confirmation_operations where session_id = v_session) or exists (select 1 from public.jobs where customer_id = 'd6930000-0000-4000-8000-000000000001') then
    raise exception 'a refused actor left a write';
  end if;
end;
$actors$;

-- J03 positive control: the ready Case is accepted once per service and replays to the same Job.
do $ready$
declare
  v_services constant text[] := array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'];
  v_customer constant uuid := 'd6930000-0000-4000-8000-000000000001';
  v_index integer;
  v_session uuid;
  v_first record;
  v_replay record;
begin
  for v_index in 1..6 loop
    v_session := ('d6930000-0000-4000-8000-0000000' || lpad((v_index * 10 + 5)::text, 5, '0'))::uuid;
    select * into strict v_first from public.confirm_kael_chat_durable_atomic_v4(
      v_session, v_customer, 'kael-confirm:' || v_session || ':' || v_customer, 'rfq_request', null, 'prompt_if_saved');
    if not v_first.ok or v_first.already_applied or v_first.job_id is null then
      raise exception 'service % ready Case was not accepted: %', v_services[v_index], row_to_json(v_first);
    end if;
    select * into strict v_replay from public.confirm_kael_chat_durable_atomic_v4(
      v_session, v_customer, 'kael-confirm:' || v_session || ':' || v_customer, 'rfq_request', null, null);
    if not v_replay.ok or not v_replay.already_applied or v_replay.job_id <> v_first.job_id or v_replay.operation_id <> v_first.operation_id then
      raise exception 'service % replay changed identity: %', v_services[v_index], row_to_json(v_replay);
    end if;
    if (select service_type::text from public.jobs where id = v_first.job_id) <> v_services[v_index]
      or (select count(*) from public.confirmation_operations where session_id = v_session) <> 1
      or (select count(*) from public.jobs where customer_id = v_customer and service_type = v_services[v_index]::public.service_type) <> 1
    then
      raise exception 'service % created the wrong or a duplicate Job', v_services[v_index];
    end if;
  end loop;
  if (select count(*) from public.jobs where customer_id = v_customer) <> 6
    or exists (select 1 from public.jobs where customer_id = v_customer and (payment_status <> 'not_started' or payment_provider is not null or paid_at is not null))
  then
    raise exception 'ready confirmations did not create exactly one Job per service without payment state: %', (select jsonb_agg(jsonb_build_object('service', service_type, 'status', status, 'payment_status', payment_status, 'provider', payment_provider, 'paid_at', paid_at)) from public.jobs where customer_id = v_customer);
  end if;
end;
$ready$;

-- J15: a confirmation that raises leaves nothing behind.
do $atomicity$
declare
  v_customer constant uuid := 'd6930000-0000-4000-8000-000000000001';
  v_problem uuid;
  v_session constant uuid := 'd6930000-0000-4000-8000-000000000081';
  v_operations integer;
  v_jobs integer;
begin
  select problem.id into strict v_problem
  from public.service_problems as problem
  join public.service_intake_policies as policy on policy.service_problem_id = problem.id and policy.status = 'active' and policy.quote_mode = 'kael_auto_quote'
  where problem.service_type = 'electrical' and problem.slug = 'outlet_or_switch_broken'
    and not exists (
      select 1 from public.price_baseline_versions as baseline
      where baseline.service_problem_id = problem.id and baseline.status = 'active' and public.price_evidence_has_quorum(baseline.price_evidence));
  insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, safe_metadata)
  values (v_session, v_customer, 'electrical', 'active', 'offer_review',
    jsonb_build_object('version', 1, 'service_type', 'electrical', 'profile_id', 'electrical-diagnose', 'case_phase', 'offer_review', 'facts', '{}'::jsonb,
      'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb, 'scope_summary', 'Thay ổ cắm bị lỏng trong phòng khách của căn hộ.', 'quote_ready', true,
      'quote_blockers', '[]'::jsonb, 'worker_requirements', '[]'::jsonb, 'next_action', '{"kind":"confirm_offer"}'::jsonb),
    now() + interval '1 day', jsonb_build_object('address_district', 'q7', 'address_label', 'Gate Building D693-1', 'problem_chips', jsonb_build_array('outlet_or_switch_broken')));
  insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
  values (v_session, 1, 'kael', 'analysis', jsonb_build_object('service_problem_id', v_problem));
  select count(*) into v_operations from public.confirmation_operations;
  select count(*) into v_jobs from public.jobs;
  begin
    perform * from public.confirm_kael_chat_durable_atomic_v4(v_session, v_customer, 'kael-confirm:' || v_session || ':' || v_customer, 'priced_offer', null, 'prompt_if_saved');
    raise exception 'an auto-quote confirmation without price evidence was accepted';
  exception when check_violation then
    if sqlerrm <> 'KAEL_PRICE_EVIDENCE_REQUIRED' then raise; end if;
  end;
  if (select count(*) from public.confirmation_operations) <> v_operations
    or (select count(*) from public.jobs) <> v_jobs
    or exists (select 1 from public.confirmation_operations where session_id = v_session)
    or (select job_id from public.kael_chat_sessions where id = v_session) is not null
  then
    raise exception 'a confirmation that raised left a partial write';
  end if;
end;
$atomicity$;

-- J15: one turn index per Case.
reset role;
do $unique_turn$
begin
  begin
    insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
    values ('d6930000-0000-4000-8000-000000000015', 1, 'customer', 'text', '{}'::jsonb);
    raise exception 'two turns shared one index';
  exception when unique_violation then null;
  end;
end;
$unique_turn$;

-- J15: row security per actor on the Case tables, and no write path for any API role.
do $rls$
declare
  v_owner constant uuid := 'd6930000-0000-4000-8000-000000000001';
  v_other constant uuid := 'd6930000-0000-4000-8000-000000000002';
  v_worker constant uuid := 'd6930000-0000-4000-8000-000000000003';
  v_admin constant uuid := 'd6930000-0000-4000-8000-000000000004';
  v_actor uuid;
  v_sessions integer;
  v_turns integer;
  v_blocked boolean;
  v_total_sessions constant integer := (select count(*) from public.kael_chat_sessions where customer_id = 'd6930000-0000-4000-8000-000000000001');
  v_total_turns constant integer := (select count(*) from public.kael_chat_turns where session_id in (select id from public.kael_chat_sessions where customer_id = 'd6930000-0000-4000-8000-000000000001'));
  v_rows integer;
begin
  foreach v_actor in array array[v_owner, v_other, v_worker, v_admin] loop
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_sessions from public.kael_chat_sessions where id::text like 'd6930000-%';
    select count(*) into v_turns from public.kael_chat_turns where session_id::text like 'd6930000-%';
    reset role;
    if v_actor in (v_owner, v_admin) and (v_sessions <> v_total_sessions or v_turns <> v_total_turns) then
      raise exception 'actor % cannot read the Case rows it is allowed to read: %/% %/%', v_actor, v_sessions, v_total_sessions, v_turns, v_total_turns;
    end if;
    if v_actor in (v_other, v_worker) and (v_sessions <> 0 or v_turns <> 0) then
      raise exception 'actor % can read another Customer Case: % sessions, % turns', v_actor, v_sessions, v_turns;
    end if;

    set local role authenticated;
    v_blocked := false;
    begin
      update public.kael_chat_sessions set status = 'abandoned' where id = 'd6930000-0000-4000-8000-000000000011';
      get diagnostics v_rows = row_count;
      v_blocked := v_rows = 0;
    exception when insufficient_privilege then v_blocked := true;
    end;
    reset role;
    if not v_blocked or (select status from public.kael_chat_sessions where id = 'd6930000-0000-4000-8000-000000000011') <> 'active' then
      raise exception 'actor % changed a Case through the table API', v_actor;
    end if;
    set local role authenticated;
    v_blocked := false;
    begin
      insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
      values ('d6930000-0000-4000-8000-000000000015', 99, 'customer', 'text', '{}'::jsonb);
      v_blocked := false;
    exception when insufficient_privilege then v_blocked := true;
    end;
    reset role;
    if not v_blocked then raise exception 'actor % wrote a Case turn through the table API', v_actor; end if;
  end loop;
  if has_table_privilege('anon', 'public.kael_chat_sessions', 'select,insert,update,delete')
    or has_table_privilege('anon', 'public.kael_chat_turns', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'public.confirmation_operations', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'public.workflow_outbox', 'select,insert,update,delete')
    or has_function_privilege('anon', 'public.confirm_kael_chat_durable_atomic_v4(uuid,uuid,text,text,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.confirm_kael_chat_durable_atomic_v4(uuid,uuid,text,text,text,text)', 'execute')
  then
    raise exception 'an API role can reach the confirmation tables or function';
  end if;
end;
$rls$;

rollback;

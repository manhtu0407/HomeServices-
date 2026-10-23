-- Committed-data concurrency proof for J11 (worker accept) and J15 (confirmation, turn index) on a disposable local database.
\set ON_ERROR_STOP on

create extension if not exists dblink;

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-race-p427');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..9 loop
    v_actor := ('d6950000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'race-p427-' || i || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-race-p427', v_actor, case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience, districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth, verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[], true, true, 'Race fixture', '1990-01-01', 'approved', 'synthetic-race-p427');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

-- A ready Case for the confirmation race, in the same synthetic cohort so its coverage is the fixture workers.
do $case$
declare v_problem uuid;
begin
  select id into strict v_problem from public.service_problems where service_type = 'plumbing' and slug = 'other_plumbing' and is_active;
  insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, safe_metadata, synthetic_cohort_id)
  values ('d6950000-0000-4000-8000-000000000301', 'd6950000-0000-4000-8000-000000000001', 'plumbing', 'active', 'offer_review',
    jsonb_build_object('version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose', 'case_phase', 'offer_review', 'facts', '{}'::jsonb,
      'missing_facts', '[]'::jsonb, 'evidence', '[]'::jsonb, 'scope_summary', 'Kiểm tra và xử lý rò nước đường ống trong căn hộ.', 'quote_ready', true,
      'quote_blockers', '[]'::jsonb, 'worker_requirements', '[]'::jsonb, 'next_action', '{"kind":"request_worker_quote"}'::jsonb),
    now() + interval '1 day', jsonb_build_object('address_district', 'q7', 'address_label', 'Race Building', 'problem_chips', jsonb_build_array('other_plumbing')),
    'synthetic-race-p427');
  insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
  values ('d6950000-0000-4000-8000-000000000301', 1, 'kael', 'analysis', jsonb_build_object('service_problem_id', v_problem));
end;
$case$;

-- A priced broadcast for the accept race.
insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode, synthetic_cohort_id)
values ('d6950000-0000-4000-8000-000000000101', 'd6950000-0000-4000-8000-000000000001', 'plumbing', 'Accept race fixture', 'q7', 'broadcasting', 'rfq', 'synthetic-race-p427');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase, synthetic_cohort_id)
values ('d6950000-0000-4000-8000-000000000201', 'd6950000-0000-4000-8000-000000000001', 'plumbing', 'active', 'matching', 'synthetic-race-p427');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id, quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('d6950000-0000-4000-8000-000000000401', 'accept-race-operation-p427', 'd6950000-0000-4000-8000-000000000201', 'd6950000-0000-4000-8000-000000000001', 'd6950000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P4270101', 'synthetic-race-p427');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('d6950000-0000-4000-8000-000000000501', 'd6950000-0000-4000-8000-000000000401', 'd6950000-0000-4000-8000-000000000101', 'queued', 'synthetic-race-p427');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type, district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'd6950000-0000-4000-8000-000000000401', 'd6950000-0000-4000-8000-000000000101', id, 'plumbing', 'q7', 'held', now(), now() + interval '30 minutes', 'synthetic-race-p427'
from public.worker_profiles where id in ('d6950000-0000-4000-8000-000000000002', 'd6950000-0000-4000-8000-000000000003');
select count(*) from public.activate_job_broadcast_batch_durable_atomic_v2('d6950000-0000-4000-8000-000000000101',
  array['d6950000-0000-4000-8000-000000000002', 'd6950000-0000-4000-8000-000000000003']::uuid[], 'd6950000-0000-4000-8000-000000000601', now(), now() + interval '5 minutes');
update public.jobs set quote_mode = 'kael_auto_quote', kael_price_min = 150000, kael_price_max = 250000,
kael_estimate_card_v3 = '{"card":{"price_source":"baseline_with_market","price_reasoning_receipt":{"schema_version":"price_reasoning_receipt.v1","receipt_id":"price_reasoning:d6950000-0000-4000-8000-000000000101","costs":{"total_min":150000,"total_max":250000},"scenarios":{"low":{"total":150000},"high":{"total":250000}},"fairness":{"price_source":"baseline_with_market","confidence":"medium","baseline_evidence":null,"market_source_count":3,"high_trust_source_count":2,"quorum_met":true,"cap_statement":"Verified fixture range only."}}}}'::jsonb where id = 'd6950000-0000-4000-8000-000000000101';
update public.job_broadcasts set status = 'expired' where job_id = 'd6950000-0000-4000-8000-000000000101';
select count(*) from public.activate_job_broadcast_batch_atomic('d6950000-0000-4000-8000-000000000101',
  array['d6950000-0000-4000-8000-000000000002', 'd6950000-0000-4000-8000-000000000003']::uuid[], gen_random_uuid(), now(), now() + interval '5 minutes');

select (original_scope_price_quote ->> 'quote_id') as quote_one from public.job_broadcasts where job_id = 'd6950000-0000-4000-8000-000000000101' and worker_id = 'd6950000-0000-4000-8000-000000000002' and status = 'sent' \gset
select (original_scope_price_quote ->> 'quote_id') as quote_two from public.job_broadcasts where job_id = 'd6950000-0000-4000-8000-000000000101' and worker_id = 'd6950000-0000-4000-8000-000000000003' and status = 'sent' \gset

select dblink_connect('race_a', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres');
select dblink_connect('race_b', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres');

create temporary table race_results(race text, side text, payload jsonb, failure text);

create or replace function pg_temp.run_race(p_race text, p_first text, p_second text) returns void language plpgsql as $$
begin
  perform dblink_send_query('race_a', p_first);
  perform pg_sleep(0.5);
  perform dblink_send_query('race_b', p_second);
  begin
    insert into race_results select p_race, 'first', t.payload::jsonb, null from dblink_get_result('race_a') as t(payload text);
  exception when others then
    insert into race_results values (p_race, 'first', null, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into race_results select p_race, 'second', t.payload::jsonb, null from dblink_get_result('race_b') as t(payload text);
  exception when others then
    insert into race_results values (p_race, 'second', null, sqlstate || ' ' || sqlerrm);
  end;
  begin perform dblink_get_result('race_a'); exception when others then null; end;
  begin perform dblink_get_result('race_b'); exception when others then null; end;
end;
$$;

-- J03/J15: the same confirmation arrives twice at once.
select pg_temp.run_race('confirm_same_key',
  $q$ with r as materialized (select * from public.confirm_kael_chat_durable_atomic_v4('d6950000-0000-4000-8000-000000000301', 'd6950000-0000-4000-8000-000000000001', 'kael-confirm:d6950000-0000-4000-8000-000000000301:d6950000-0000-4000-8000-000000000001', 'rfq_request', null, 'prompt_if_saved')),
          s as materialized (select pg_sleep(1.5) from r)
     select row_to_json(r)::text from r cross join s $q$,
  $q$ select row_to_json(r)::text from public.confirm_kael_chat_durable_atomic_v4('d6950000-0000-4000-8000-000000000301', 'd6950000-0000-4000-8000-000000000001', 'kael-confirm:d6950000-0000-4000-8000-000000000301:d6950000-0000-4000-8000-000000000001', 'rfq_request', null, 'prompt_if_saved') r $q$);

-- J11: two eligible Workers accept the same Job at once.
select pg_temp.run_race('worker_accept',
  format($q$ with r as materialized (select * from public.accept_priced_broadcast_durable_atomic('d6950000-0000-4000-8000-000000000101', 'd6950000-0000-4000-8000-000000000002', %L::uuid)),
          s as materialized (select pg_sleep(1.5) from r)
     select row_to_json(r)::text from r cross join s $q$, :'quote_one'),
  format($q$ select row_to_json(r)::text from public.accept_priced_broadcast_durable_atomic('d6950000-0000-4000-8000-000000000101', 'd6950000-0000-4000-8000-000000000003', %L::uuid) r $q$, :'quote_two'));

-- J11: the same Worker double-taps accept.
update public.jobs set status = 'broadcasting' where false;

-- J15: two writers claim the same (session, turn_index).
select pg_temp.run_race('turn_index',
  $q$ with ins as materialized (insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata) values ('d6950000-0000-4000-8000-000000000301', 50, 'customer', 'text', '{}'::jsonb) returning 1),
          s as materialized (select pg_sleep(1.5) from ins)
     select '{"inserted":true}' from ins cross join s $q$,
  $q$ insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata) values ('d6950000-0000-4000-8000-000000000301', 50, 'customer', 'text', '{}'::jsonb) $q$);

select dblink_disconnect('race_a');
select dblink_disconnect('race_b');

select race, side, payload->>'ok' as ok, payload->>'error_code' as error_code, payload->>'already_applied' as already_applied, payload->>'job_status' as job_status, failure from race_results order by race, side;

do $assertions$
begin
  if (select count(*) from race_results where race = 'confirm_same_key' and payload->>'ok' = 'true') <> 2
    or (select count(*) from race_results where race = 'confirm_same_key' and payload->>'already_applied' = 'false') <> 1
    or (select count(distinct payload->>'job_id') from race_results where race = 'confirm_same_key') <> 1
    or (select count(*) from public.confirmation_operations where session_id = 'd6950000-0000-4000-8000-000000000301') <> 1
    or (select count(*) from public.jobs where customer_id = 'd6950000-0000-4000-8000-000000000001' and id <> 'd6950000-0000-4000-8000-000000000101') <> 1
  then raise exception 'confirmation race: not exactly one operation and one Job'; end if;

  if (select count(*) from race_results where race = 'worker_accept' and payload->>'ok' = 'true') <> 1
    or (select count(*) from race_results where race = 'worker_accept' and (payload->>'ok' = 'false' or failure is not null)) <> 1
    or (select count(*) from public.job_worker_candidates where job_id = 'd6950000-0000-4000-8000-000000000101') <> 1
    or (select status from public.jobs where id = 'd6950000-0000-4000-8000-000000000101') <> 'worker_candidate_pending'::public.job_status
  then raise exception 'accept race: not exactly one winner'; end if;

  if (select count(*) from race_results where race = 'turn_index' and failure like '23505%') <> 1
    or (select count(*) from public.kael_chat_turns where session_id = 'd6950000-0000-4000-8000-000000000301' and turn_index = 50) <> 1
  then raise exception 'turn index race: the unique index did not allow exactly one writer'; end if;
end;
$assertions$;

select 'confirmation, accept and turn-index concurrency: all assertions passed' as result;

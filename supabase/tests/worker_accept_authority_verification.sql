-- @pillar id: P426-worker-accept-authority-sql
-- @pillar invariant: Only an eligible Worker with a live priced broadcast can accept a Job: a Customer, an Admin, a Worker without a broadcast and an unknown id are refused before any durable write, the first eligible Worker moves the Job to worker_candidate_pending exactly once and replays to the same candidate, and a second Worker is refused once the Job is taken.
-- @pillar authority: governance/RULES.md #7 | governance/RULES.md #8 | owner four-blocker update (J11)
-- @pillar target: supabase/migrations/20260823110000_durable_confirmation_matching.sql
-- @pillar layer: sql
-- @pillar siblings: P135-candidate-quote-slot-immutability-sql, P96-matching-candidate-capacity-sql
-- @pillar mutation: Drop the eligibility test at the top of accept_priced_broadcast_durable_atomic or the broadcast ownership join in accept_broadcast_atomic; the refused-actor and already-taken assertions fail.
-- Rollback-only proof for J11 (worker-only accept) on a priced broadcast.

begin;
set local statement_timeout = '60s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-accept-p426');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..5 loop
    v_actor := ('d6940000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'accept-p426-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i in (2, 3, 4) then update public.profiles set role = 'worker' where id = v_actor; end if;
    if i = 5 then update public.profiles set role = 'admin' where id = v_actor; end if;
    if i <> 5 then
      insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
      values ('synthetic-accept-p426', v_actor,
        case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    end if;
    if i in (2, 3, 4) then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Accept fixture', '1990-01-01',
        'approved', 'synthetic-accept-p426');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('d6940000-0000-4000-8000-000000000101', 'd6940000-0000-4000-8000-000000000001',
  'plumbing', 'Accept authority fixture', 'q7', 'broadcasting', 'rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('d6940000-0000-4000-8000-000000000201', 'd6940000-0000-4000-8000-000000000001', 'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('d6940000-0000-4000-8000-000000000301', 'accept-operation-p426',
  'd6940000-0000-4000-8000-000000000201', 'd6940000-0000-4000-8000-000000000001',
  'd6940000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P4260101',
  'synthetic-accept-p426');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('d6940000-0000-4000-8000-000000000401', 'd6940000-0000-4000-8000-000000000301',
  'd6940000-0000-4000-8000-000000000101', 'queued', 'synthetic-accept-p426');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'd6940000-0000-4000-8000-000000000301', 'd6940000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-accept-p426'
from public.worker_profiles where id in (
  'd6940000-0000-4000-8000-000000000002', 'd6940000-0000-4000-8000-000000000003');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'd6940000-0000-4000-8000-000000000101',
  array['d6940000-0000-4000-8000-000000000002', 'd6940000-0000-4000-8000-000000000003']::uuid[],
  'd6940000-0000-4000-8000-000000000501', now(), now() + interval '5 minutes');

update public.jobs set quote_mode = 'kael_auto_quote', kael_price_min = 150000, kael_price_max = 250000,
kael_estimate_card_v3 = '{"card":{"price_source":"baseline_with_market","price_reasoning_receipt":{"schema_version":"price_reasoning_receipt.v1","receipt_id":"price_reasoning:d6940000-0000-4000-8000-000000000101","costs":{"total_min":150000,"total_max":250000},"scenarios":{"low":{"total":150000},"high":{"total":250000}},"fairness":{"price_source":"baseline_with_market","confidence":"medium","baseline_evidence":null,"market_source_count":3,"high_trust_source_count":2,"quorum_met":true,"cap_statement":"Verified fixture range only."}}}}'::jsonb where id = 'd6940000-0000-4000-8000-000000000101';
update public.job_broadcasts set status = 'expired' where job_id = 'd6940000-0000-4000-8000-000000000101';
select * from public.activate_job_broadcast_batch_atomic('d6940000-0000-4000-8000-000000000101',
array['d6940000-0000-4000-8000-000000000002', 'd6940000-0000-4000-8000-000000000003']::uuid[], gen_random_uuid(), now(), now() + interval '5 minutes');

set local role service_role;

do $refused_actors$
declare
  v_job constant uuid := 'd6940000-0000-4000-8000-000000000101';
  v_quote uuid;
  v_actor uuid;
  v_result record;
  v_candidates integer;
  v_deliveries jsonb;
  v_broadcasts jsonb;
begin
  select (original_scope_price_quote ->> 'quote_id')::uuid into strict v_quote
  from public.job_broadcasts where job_id = v_job and worker_id = 'd6940000-0000-4000-8000-000000000002' and status = 'sent';
  select count(*) into v_candidates from public.job_worker_candidates where job_id = v_job;
  select jsonb_agg(to_jsonb(d) order by d.id) into v_deliveries from public.matching_recipient_deliveries d where d.job_id = v_job;
  select jsonb_agg(to_jsonb(b) order by b.id) into v_broadcasts from public.job_broadcasts b where b.job_id = v_job;
  foreach v_actor in array array[
    'd6940000-0000-4000-8000-000000000001'::uuid,
    'd6940000-0000-4000-8000-000000000005'::uuid,
    'd6940000-0000-4000-8000-000000000004'::uuid,
    'd6940000-0000-4000-8000-0000000000ff'::uuid
  ] loop
    select * into strict v_result from public.accept_priced_broadcast_durable_atomic(v_job, v_actor, v_quote);
    if v_result.ok or v_result.error_code is null then
      raise exception 'actor % accepted another Worker broadcast: %', v_actor, row_to_json(v_result);
    end if;
  end loop;
  if (select status from public.jobs where id = v_job) <> 'broadcasting'::public.job_status
    or (select count(*) from public.job_worker_candidates where job_id = v_job) <> v_candidates
    or v_deliveries is distinct from (select jsonb_agg(to_jsonb(d) order by d.id) from public.matching_recipient_deliveries d where d.job_id = v_job)
    or v_broadcasts is distinct from (select jsonb_agg(to_jsonb(b) order by b.id) from public.job_broadcasts b where b.job_id = v_job)
  then
    raise exception 'a refused accept changed the Job, its candidates, deliveries or broadcasts';
  end if;
  select * into strict v_result from public.accept_priced_broadcast_durable_atomic(v_job, 'd6940000-0000-4000-8000-000000000002', gen_random_uuid());
  if v_result.ok then raise exception 'a wrong quote id was accepted'; end if;
  if (select status from public.jobs where id = v_job) <> 'broadcasting'::public.job_status then raise exception 'a wrong quote id moved the Job'; end if;
end;
$refused_actors$;

do $first_wins$
declare
  v_job constant uuid := 'd6940000-0000-4000-8000-000000000101';
  v_quote_one uuid;
  v_quote_two uuid;
  v_first record;
  v_replay record;
  v_late record;
begin
  select (original_scope_price_quote ->> 'quote_id')::uuid into strict v_quote_one
  from public.job_broadcasts where job_id = v_job and worker_id = 'd6940000-0000-4000-8000-000000000002' and status = 'sent';
  select (original_scope_price_quote ->> 'quote_id')::uuid into strict v_quote_two
  from public.job_broadcasts where job_id = v_job and worker_id = 'd6940000-0000-4000-8000-000000000003' and status = 'sent';

  select * into strict v_first from public.accept_priced_broadcast_durable_atomic(v_job, 'd6940000-0000-4000-8000-000000000002', v_quote_one);
  if not v_first.ok or v_first.already_applied or v_first.candidate_id is null or v_first.job_status <> 'worker_candidate_pending'::public.job_status then
    raise exception 'the first eligible Worker was not accepted: %', row_to_json(v_first);
  end if;
  select * into strict v_replay from public.accept_priced_broadcast_durable_atomic(v_job, 'd6940000-0000-4000-8000-000000000002', v_quote_one);
  if not v_replay.ok or not v_replay.already_applied or v_replay.candidate_id <> v_first.candidate_id then
    raise exception 'the first Worker replay changed identity: %', row_to_json(v_replay);
  end if;
  select * into strict v_late from public.accept_priced_broadcast_durable_atomic(v_job, 'd6940000-0000-4000-8000-000000000003', v_quote_two);
  if v_late.ok or v_late.error_code not in ('ALREADY_TAKEN', 'NOT_FOUND') then
    raise exception 'a second Worker was not refused after the Job was taken: %', row_to_json(v_late);
  end if;
  if (select count(*) from public.job_worker_candidates where job_id = v_job) <> 1
    or (select count(*) from public.job_worker_candidates where job_id = v_job and status = 'proposed' and worker_id = 'd6940000-0000-4000-8000-000000000002') <> 1
    or (select status from public.jobs where id = v_job) <> 'worker_candidate_pending'::public.job_status
    or (select worker_id from public.jobs where id = v_job) is not null
  then
    raise exception 'the accept left more than one candidate or assigned the Worker before the Customer chose';
  end if;
end;
$first_wins$;

do $privileges$
begin
  if has_function_privilege('anon', 'public.accept_priced_broadcast_durable_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.accept_priced_broadcast_durable_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'public.accept_broadcast_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.accept_broadcast_atomic(uuid,uuid,uuid)', 'execute')
    or has_table_privilege('authenticated', 'public.job_worker_candidates', 'insert,update,delete')
    or has_table_privilege('authenticated', 'public.job_broadcasts', 'insert,update,delete')
  then
    raise exception 'an API role can reach the accept function or the candidate tables directly';
  end if;
end;
$privileges$;

rollback;

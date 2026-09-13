-- @pillar id: P135-candidate-quote-slot-immutability-sql
-- @pillar invariant: An existing candidate cannot acquire a priced offer after being presented without one
-- @pillar authority: governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260908014000_candidate_quote_slot_immutability.sql
-- @pillar layer: sql
-- @pillar siblings: P133-candidate-decision-receipt-sql, P96-matching-candidate-capacity-sql
-- @pillar mutation: Restore the old non-null-only guard; an initially unpriced candidate accepts a different priced agreement

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p135');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('c1350000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p96-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p135', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p135');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id, customer_id, service_type, description, address_district, status, quote_mode)
values ('c1350000-0000-4000-8000-000000000101', 'c1350000-0000-4000-8000-000000000001',
  'plumbing', 'Candidate capacity fixture', 'q7', 'broadcasting', 'rfq');
insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase)
values ('c1350000-0000-4000-8000-000000000201', 'c1350000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id,
  quote_mode, confirmation_kind, state, support_code, synthetic_cohort_id)
values ('c1350000-0000-4000-8000-000000000301', 'candidate-operation-p135',
  'c1350000-0000-4000-8000-000000000201', 'c1350000-0000-4000-8000-000000000001',
  'c1350000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'matching_queued', 'P9600101',
  'synthetic-candidate-p135');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('c1350000-0000-4000-8000-000000000401', 'c1350000-0000-4000-8000-000000000301',
  'c1350000-0000-4000-8000-000000000101', 'queued', 'synthetic-candidate-p135');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
select 'c1350000-0000-4000-8000-000000000301', 'c1350000-0000-4000-8000-000000000101',
  id, 'plumbing', 'q7', 'held', now(), now() + interval '5 minutes', 'synthetic-candidate-p135'
from public.worker_profiles where id in (
  'c1350000-0000-4000-8000-000000000002', 'c1350000-0000-4000-8000-000000000003');
select * from public.activate_job_broadcast_batch_durable_atomic_v2(
  'c1350000-0000-4000-8000-000000000101',
  array['c1350000-0000-4000-8000-000000000002', 'c1350000-0000-4000-8000-000000000003']::uuid[],
  'c1350000-0000-4000-8000-000000000501', now(), now() + interval '5 minutes');


update public.jobs set quote_mode = 'kael_auto_quote', kael_price_min = 150000, kael_price_max = 250000,
kael_estimate_card_v3 = '{"card":{"price_source":"baseline_with_market","price_reasoning_receipt":{"schema_version":"price_reasoning_receipt.v1","receipt_id":"price_reasoning:c1350000-0000-4000-8000-000000000101","costs":{"total_min":150000,"total_max":250000},"scenarios":{"low":{"total":150000},"high":{"total":250000}},"fairness":{"price_source":"baseline_with_market","confidence":"medium","baseline_evidence":null,"market_source_count":3,"high_trust_source_count":2,"quorum_met":true,"cap_statement":"Verified fixture range only."}}}}'::jsonb where id = 'c1350000-0000-4000-8000-000000000101';
update public.job_broadcasts set status = 'expired' where job_id = 'c1350000-0000-4000-8000-000000000101';
select * from public.activate_job_broadcast_batch_atomic('c1350000-0000-4000-8000-000000000101',
array['c1350000-0000-4000-8000-000000000002']::uuid[],gen_random_uuid(),now(),now()+interval '5 minutes');

do $price_slot$
declare v_result record; v_quote uuid; v_candidate uuid; v_terms jsonb;
begin
  select (original_scope_price_quote->>'quote_id')::uuid into v_quote from public.job_broadcasts
    where job_id='c1350000-0000-4000-8000-000000000101' and worker_id='c1350000-0000-4000-8000-000000000002';
  select * into strict v_result from public.accept_priced_broadcast_durable_atomic(
    'c1350000-0000-4000-8000-000000000101','c1350000-0000-4000-8000-000000000002',v_quote);
  if not v_result.ok then raise exception 'P135_PRICED_FIXTURE_FAILED: %',row_to_json(v_result); end if;
  select original_scope_price_quote || jsonb_build_object('quote_id',gen_random_uuid())
    into v_terms from public.job_worker_candidates where id=v_result.candidate_id;
  insert into public.job_worker_candidates(job_id,worker_id,broadcast_id,status,proposed_at,expires_at,original_scope_price_quote)
    select job_id,worker_id,broadcast_id,'withdrawn',proposed_at,expires_at,null
      from public.job_worker_candidates where id=v_result.candidate_id returning id into v_candidate;
  if not (select private.is_valid_original_scope_price_quote(v_terms,job_id,worker_id,broadcast_id,expires_at,true)
    from public.job_worker_candidates where id=v_candidate) then raise exception 'P135_INVALID_QUOTE_FIXTURE'; end if;
  begin
    update public.job_worker_candidates set original_scope_price_quote=v_terms where id=v_candidate;
    raise exception 'P135_EXISTING_UNPRICED_CANDIDATE_ACQUIRED_PRICE';
  exception when check_violation then
    if sqlerrm<>'CANDIDATE_PRICE_TERMS_IMMUTABLE' then raise; end if;
  end;
end;
$price_slot$;
select 'P135 candidate quote slot immutable passed' as result;
rollback;

-- P366: rollback-only proof that an auto-quote case without a validated price may be confirmed as a
-- worker-quote request only when the active policy allows it and the Edge recorded the fallback for
-- exactly that policy id and version. Every other combination keeps CONFIRMATION_KIND_MISMATCH.

begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e3660000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'rfq-fallback-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table p366_context on commit drop as
select problem.id as problem_id, policy.id as policy_id, policy.version as policy_version
from public.service_problems problem
join public.service_intake_policies policy
  on policy.service_problem_id = problem.id and policy.status = 'active'
where problem.service_type = 'handyman' and problem.slug = 'drill_or_mount_shelf' and problem.is_active;

do $$
begin
  if (select count(*) from p366_context) <> 1 then
    raise exception 'P366 needs exactly one active drill_or_mount_shelf policy';
  end if;
  if exists (
    select 1 from public.service_intake_policies
    where status = 'active' and quote_mode = 'kael_auto_quote'
      and evidence_requirements ->> 'evidence_unavailable_fallback' is distinct from 'rfq'
  ) then
    raise exception 'an active auto-quote policy is missing the worker-quote fallback';
  end if;
  if exists (
    select 1 from public.service_intake_policies
    where status = 'active' and quote_mode <> 'kael_auto_quote'
      and evidence_requirements ? 'evidence_unavailable_fallback'
  ) then
    raise exception 'a non auto-quote policy gained a fallback it cannot use';
  end if;
end;
$$;

create or replace function pg_temp.p366_session(p_suffix text, p_fallback jsonb) returns uuid
language plpgsql as $fn$
declare
  v_id uuid := ('e3660000-0000-4000-8000-0000000001' || p_suffix)::uuid;
  v_context record;
begin
  select * into strict v_context from p366_context;
  insert into public.kael_chat_sessions(
    id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, safe_metadata
  ) values (
    v_id, 'e3660000-0000-4000-8000-000000000001', 'handyman', 'estimate_ready', 'offer_review',
    jsonb_build_object(
      'version', 1, 'service_type', 'handyman', 'profile_id', 'task_scope',
      'case_phase', 'offer_review', 'facts', '{}'::jsonb, 'missing_facts', '[]'::jsonb,
      'evidence', '[]'::jsonb, 'scope_summary', 'Khoan và lắp kệ gỗ 30x20cm nặng khoảng 1kg.',
      'quote_ready', false, 'quote_blockers', '[]'::jsonb,
      'worker_requirements', '["safe_drilling_and_mounting"]'::jsonb,
      'next_action', '{"kind":"wait"}'::jsonb
    ),
    now() + interval '1 day',
    jsonb_strip_nulls(jsonb_build_object(
      'address_district', 'q1', 'address_label', 'Tòa S1',
      'problem_chips', jsonb_build_array('drill_or_mount_shelf'),
      'intake_coverage', jsonb_build_object('quote_mode', 'rfq', 'order_eligible', true,
        'confirmation_kind', 'rfq_request', 'safety_blocker', null),
      'quote_mode_fallback', p_fallback
    ))
  );
  insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
  values (v_id, 1, 'kael', 'analysis', jsonb_build_object(
    'service_problem_id', v_context.problem_id,
    'quote_readiness', 'worker_quote_or_inspection_ready'
  ));
  return v_id;
end;
$fn$;

do $$
declare
  v_context record;
  v_result record;
  v_job_mode public.service_quote_mode;
  v_new_policy record;
begin
  select * into strict v_context from p366_context;

  select * into v_result from public.confirm_kael_chat_durable_atomic(
    pg_temp.p366_session('01', null), 'e3660000-0000-4000-8000-000000000001',
    'kael-confirm:e3660000-0000-4000-8000-000000000101:e3660000-0000-4000-8000-000000000001',
    'rfq_request', null);
  if v_result.ok or v_result.error_code <> 'CONFIRMATION_KIND_MISMATCH' then
    raise exception 'rfq_request accepted on an auto-quote case without a recorded fallback';
  end if;

  select * into v_result from public.confirm_kael_chat_durable_atomic(
    pg_temp.p366_session('02', jsonb_build_object('mode', 'rfq', 'policy_id', v_context.policy_id,
      'policy_version', v_context.policy_version - 1)),
    'e3660000-0000-4000-8000-000000000001',
    'kael-confirm:e3660000-0000-4000-8000-000000000102:e3660000-0000-4000-8000-000000000001',
    'rfq_request', null);
  if v_result.ok or v_result.error_code <> 'CONFIRMATION_KIND_MISMATCH' then
    raise exception 'a fallback recorded for another policy version was accepted';
  end if;

  select * into v_result from public.confirm_kael_chat_durable_atomic(
    pg_temp.p366_session('03', jsonb_build_object('mode', 'rfq', 'policy_id', v_context.policy_id,
      'policy_version', v_context.policy_version)),
    'e3660000-0000-4000-8000-000000000001',
    'kael-confirm:e3660000-0000-4000-8000-000000000103:e3660000-0000-4000-8000-000000000001',
    'rfq_request', null);
  if not coalesce(v_result.ok, false) or v_result.quote_mode <> 'rfq' then
    raise exception 'a valid worker-quote fallback was refused: %', v_result.error_code;
  end if;
  select quote_mode into strict v_job_mode from public.jobs where id = v_result.job_id;
  if v_job_mode <> 'rfq' then
    raise exception 'the confirmed job did not take the worker-quote mode';
  end if;

  -- Policy versions are immutable, so a policy without the key is published the way governance does it.
  update public.service_intake_policies set status = 'retired', updated_at = now()
  where id = v_context.policy_id;
  insert into public.service_intake_policies(
    service_problem_id, service_type, problem_slug, version, status, quote_mode,
    tier_a_fields, tier_b_slots, question_overrides, safety_requirements,
    capability_requirements, evidence_requirements, reason, approved_at, published_at
  )
  select service_problem_id, service_type, problem_slug, version + 1, 'active', quote_mode,
    tier_a_fields, tier_b_slots, question_overrides, safety_requirements,
    capability_requirements, evidence_requirements - 'evidence_unavailable_fallback',
    'P366 policy without the worker-quote fallback', now(), now()
  from public.service_intake_policies where id = v_context.policy_id
  returning id, version into v_new_policy;
  select * into v_result from public.confirm_kael_chat_durable_atomic(
    pg_temp.p366_session('04', jsonb_build_object('mode', 'rfq', 'policy_id', v_new_policy.id,
      'policy_version', v_new_policy.version)),
    'e3660000-0000-4000-8000-000000000001',
    'kael-confirm:e3660000-0000-4000-8000-000000000104:e3660000-0000-4000-8000-000000000001',
    'rfq_request', null);
  if v_result.ok or v_result.error_code <> 'CONFIRMATION_KIND_MISMATCH' then
    raise exception 'a policy without the fallback key accepted rfq_request';
  end if;
end;
$$;

select jsonb_build_object('p366_rfq_fallback_confirm', 'passed') as verification;

rollback;

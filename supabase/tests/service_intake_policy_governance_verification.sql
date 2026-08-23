begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a5230000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'policy-maker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a5230000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'policy-checker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a5230000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'policy-outsider@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

update public.profiles set role = 'admin'::public.user_role
where id in ('a5230000-0000-4000-8000-000000000001', 'a5230000-0000-4000-8000-000000000002');

do $test$
declare
  v_maker constant uuid := 'a5230000-0000-4000-8000-000000000001';
  v_checker constant uuid := 'a5230000-0000-4000-8000-000000000002';
  v_outsider constant uuid := 'a5230000-0000-4000-8000-000000000003';
  v_problem uuid;
  v_policy public.service_intake_policies%rowtype;
  v_evidence_policy public.service_intake_policies%rowtype;
  v_active public.service_intake_policies%rowtype;
  v_revision integer;
  v_active_count integer;
  v_price public.price_baselines%rowtype;
  v_price_version public.price_baseline_versions%rowtype;
  v_weak_version public.price_baseline_versions%rowtype;
  v_weak_evidence jsonb;
begin
  if (select count(*) from public.service_intake_policy_floors) <> 6 then
    raise exception 'expected locked floors for all six supported services';
  end if;
  if exists (
    select 1 from public.service_problems sp
    where sp.is_active and not exists (
      select 1 from public.service_intake_policies p
      where p.service_problem_id = sp.id and p.status = 'active'
    )
  ) then
    raise exception 'every active service problem must have one seeded active policy';
  end if;
  if exists (
    select 1
    from public.service_intake_policies as policy
    where policy.status = 'active'
      and not public.service_intake_evidence_requirements_valid(
        policy.quote_mode,
        policy.evidence_requirements
      )
  ) then
    raise exception 'every active policy must carry valid immutable evidence requirements';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('service_intake_policies', 'service_intake_policy_audit', 'price_baseline_versions', 'price_baseline_governance_audit')
      and not c.relrowsecurity
  ) then
    raise exception 'governance tables must have RLS enabled';
  end if;
  if has_table_privilege('authenticated', 'public.service_intake_policies', 'select')
    or has_table_privilege('authenticated', 'public.price_baseline_versions', 'insert') then
    raise exception 'authenticated clients must not access governance tables directly';
  end if;

  select p.* into strict v_active
  from public.service_intake_policies p
  where p.service_type = 'electrical' and p.status = 'active'
  order by p.problem_slug limit 1;
  v_problem := v_active.service_problem_id;
  select revision into v_revision from public.service_intake_policy_heads where service_problem_id = v_problem;

  select * into v_policy from public.admin_draft_service_intake_policy(
    v_maker, v_problem, v_revision, 'rfq', v_active.tier_a_fields, v_active.tier_b_slots,
    v_active.question_overrides, v_active.safety_requirements, v_active.capability_requirements,
    'Verification draft uses conservative RFQ routing'
  );
  if v_policy.status <> 'draft' or v_policy.created_by <> v_maker then
    raise exception 'policy draft did not bind maker identity';
  end if;
  if v_policy.evidence_requirements <> '{"minimum_source_count":0,"minimum_high_trust_source_count":0,"requires_active_baseline":false}'::jsonb then
    raise exception 'legacy draft compatibility route did not apply conservative RFQ evidence requirements';
  end if;

  begin
    perform public.admin_transition_service_intake_policy(v_maker, v_policy.id, v_revision + 1, 'approve', 'Maker cannot approve own policy');
    raise exception 'expected policy maker-checker rejection';
  exception when insufficient_privilege then null;
  end;

  perform public.admin_transition_service_intake_policy(v_checker, v_policy.id, v_revision + 1, 'approve', 'Independent Admin approves policy');
  perform public.admin_transition_service_intake_policy(v_checker, v_policy.id, v_revision + 2, 'publish', 'Independent Admin publishes policy');
  select count(*) into v_active_count from public.service_intake_policies where service_problem_id = v_problem and status = 'active';
  if v_active_count <> 1 then raise exception 'policy scope must have exactly one active version'; end if;

  begin
    perform public.admin_draft_service_intake_policy(
      v_maker, v_problem, v_revision + 3, 'rfq', v_active.tier_a_fields, v_active.tier_b_slots,
      v_active.question_overrides, '[]'::jsonb, v_active.capability_requirements,
      'Attempt to lower a locked safety floor'
    );
    raise exception 'expected locked safety floor rejection';
  exception when check_violation then null;
  end;

  begin
    perform public.admin_draft_service_intake_policy(
      v_maker, v_problem, 0, 'rfq', v_active.tier_a_fields, v_active.tier_b_slots,
      v_active.question_overrides, v_active.safety_requirements, v_active.capability_requirements,
      'Attempt with an obsolete optimistic revision'
    );
    raise exception 'expected stale policy revision rejection';
  exception when serialization_failure then null;
  end;

  begin
    perform public.assert_stage1_governance_admin(v_outsider);
    raise exception 'expected non-Admin actor rejection';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_draft_service_intake_policy(
      v_maker, v_problem, v_revision + 3, 'kael_auto_quote', v_active.tier_a_fields,
      v_active.tier_b_slots, v_active.question_overrides, v_active.safety_requirements,
      v_active.capability_requirements,
      '{"minimum_source_count":2,"minimum_high_trust_source_count":0,"requires_active_baseline":false}'::jsonb,
      'Invalid auto quote evidence requirements must fail closed'
    );
    raise exception 'expected invalid auto quote evidence requirements rejection';
  exception when check_violation then null;
  end;

  select * into v_evidence_policy from public.admin_draft_service_intake_policy(
    v_maker, v_problem, v_revision + 3, 'kael_auto_quote', v_active.tier_a_fields,
    v_active.tier_b_slots, v_active.question_overrides, v_active.safety_requirements,
    v_active.capability_requirements,
    '{"minimum_source_count":50,"minimum_high_trust_source_count":1,"requires_active_baseline":true}'::jsonb,
    'Verification policy deliberately requires unavailable evidence'
  );
  perform public.admin_transition_service_intake_policy(
    v_checker, v_evidence_policy.id, v_revision + 4, 'approve',
    'Independent Admin approves strict evidence policy for verification'
  );
  begin
    perform public.admin_transition_service_intake_policy(
      v_checker, v_evidence_policy.id, v_revision + 5, 'publish',
      'Unavailable evidence must prevent policy activation'
    );
    raise exception 'expected policy evidence availability rejection';
  exception when check_violation then null;
  end;

  select * into v_price from public.price_baselines pb
  where public.price_evidence_has_quorum(pb.price_evidence)
  order by pb.updated_at desc limit 1;
  if v_price.id is null then raise exception 'a real two-source baseline fixture is required'; end if;
  select revision into v_revision from public.price_baseline_governance_heads
  where service_problem_id = v_price.service_problem_id and district_code = v_price.district_code and complexity = v_price.complexity;

  select * into v_price_version from public.admin_draft_price_baseline(
    v_maker, v_price.service_problem_id, v_price.district_code, v_price.complexity, v_revision,
    v_price.price_min, v_price.price_max, v_price.source, v_price.price_evidence,
    'Verification draft preserves real provenance evidence'
  );
  begin
    perform public.admin_transition_price_baseline(v_maker, v_price_version.id, v_revision + 1, 'approve', 'Maker cannot approve own price baseline');
    raise exception 'expected price maker-checker rejection';
  exception when insufficient_privilege then null;
  end;
  perform public.admin_transition_price_baseline(v_checker, v_price_version.id, v_revision + 1, 'approve', 'Independent Admin approves price baseline');
  perform public.admin_transition_price_baseline(v_checker, v_price_version.id, v_revision + 2, 'publish', 'Independent Admin publishes price baseline');
  if not exists (
    select 1 from public.price_baselines pb where pb.service_problem_id = v_price.service_problem_id
      and pb.district_code = v_price.district_code and pb.complexity = v_price.complexity
      and pb.version = v_price_version.version and pb.price_evidence = v_price.price_evidence
  ) then
    raise exception 'governed publish did not atomically update legacy runtime baseline';
  end if;

  v_weak_evidence := jsonb_build_object('schema_version', 'baseline_price_evidence.v1', 'sources', jsonb_build_array(v_price.price_evidence -> 'sources' -> 0));
  select revision into v_revision from public.price_baseline_governance_heads
  where service_problem_id = v_price.service_problem_id and district_code = v_price.district_code and complexity = v_price.complexity;
  select * into v_weak_version from public.admin_draft_price_baseline(
    v_maker, v_price.service_problem_id, v_price.district_code, v_price.complexity, v_revision,
    v_price.price_min, v_price.price_max, v_price.source, v_weak_evidence,
    'Verification draft intentionally lacks evidence quorum'
  );
  perform public.admin_transition_price_baseline(v_checker, v_weak_version.id, v_revision + 1, 'approve', 'Independent Admin reviews weak evidence');
  begin
    perform public.admin_transition_price_baseline(v_checker, v_weak_version.id, v_revision + 2, 'publish', 'Weak evidence must never become active');
    raise exception 'expected price evidence quorum rejection';
  exception when check_violation then null;
  end;

  if not exists (select 1 from public.service_intake_policy_audit where policy_id = v_policy.id and actor_id = v_checker and event = 'published')
    or not exists (select 1 from public.price_baseline_governance_audit where baseline_version_id = v_price_version.id and actor_id = v_checker and event = 'published') then
    raise exception 'publish audit actor and event are required';
  end if;
end;
$test$;

select 'service intake and price baseline governance verified' as result;

rollback;

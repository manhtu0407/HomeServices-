begin;

do $$
declare
  v_admin_id constant uuid := '00000000-0000-0000-0000-000000000003';
  v_candidate_id constant uuid := 'a5100000-0000-4000-8000-000000000001';
  v_legacy_candidate_id constant uuid := 'a5100000-0000-4000-8000-000000000002';
  v_first record;
  v_retry record;
  v_legacy_approval record;
  v_healed record;
  v_count integer;
begin
  insert into public.learning_candidates (
    id,
    candidate_type,
    affected_service,
    affected_problem,
    affected_district,
    suggested_payload,
    confidence,
    evidence_count,
    status
  ) values (
    v_candidate_id,
    'service_knowledge_candidate',
    'cleaning',
    'atomic-admin-approval',
    'atomic-admin',
    '{
      "candidate_type":"service_knowledge_candidate",
      "skill_id":"LS5",
      "target":"advisory_pattern",
      "effects":[],
      "knowledge_upsert":{
        "service_type":"cleaning",
        "slug":"cleaning",
        "label_vi":"Vệ sinh/dọn dẹp",
        "purpose":"Atomic manual learning approval verification.",
        "safe_metadata":{"verification":"atomic_admin_approval"}
      }
    }'::jsonb,
    0.9,
    5,
    'manual_review'
  );

  select * into v_first
  from public.admin_approve_learning_candidate_atomic(
    v_candidate_id,
    v_admin_id,
    'approved in atomic verification'
  );

  if v_first.ok is not true
     or v_first.error_code is not null
     or v_first.rule_id is null
     or v_first.rule_version <> 1
     or v_first.status <> 'auto_promoted'
     or v_first.knowledge_ok is not true
     or v_first.knowledge_table <> 'service_knowledge_boxes'
     or v_first.record_key <> 'cleaning'
     or v_first.knowledge_version is null then
    raise exception 'manual approval and knowledge write did not commit atomically';
  end if;

  select * into v_retry
  from public.admin_approve_learning_candidate_atomic(
    v_candidate_id,
    v_admin_id,
    'retry after lost response'
  );

  if v_retry.ok is not true
     or v_retry.rule_id <> v_first.rule_id
     or v_retry.rule_version <> v_first.rule_version
     or v_retry.knowledge_version <> v_first.knowledge_version then
    raise exception 'manual approval retry did not return its durable receipt';
  end if;

  select count(*)::integer into v_count
  from public.learning_rule_versions as version
  where version.change_reason =
    'admin_approve_learning_candidate:' || v_candidate_id::text;
  if v_count <> 1 then
    raise exception 'manual approval retry created a duplicate rule version';
  end if;

  select count(*)::integer into v_count
  from public.kael_rule_lifecycle_log as lifecycle
  where lifecycle.candidate_id = v_candidate_id
    and lifecycle.transition_reason = 'admin_approved_knowledge_upsert';
  if v_count <> 1 then
    raise exception 'manual approval retry created a duplicate knowledge version';
  end if;

  insert into public.learning_candidates (
    id,
    candidate_type,
    affected_service,
    affected_problem,
    affected_district,
    suggested_payload,
    confidence,
    evidence_count,
    status
  ) values (
    v_legacy_candidate_id,
    'service_knowledge_candidate',
    'cleaning',
    'legacy-partial-admin-approval',
    'atomic-admin',
    '{
      "candidate_type":"service_knowledge_candidate",
      "skill_id":"LS5",
      "target":"advisory_pattern",
      "effects":[],
      "knowledge_upsert":{
        "service_type":"cleaning",
        "slug":"cleaning",
        "label_vi":"Vệ sinh/dọn dẹp",
        "purpose":"Heal a legacy approval that missed its knowledge write.",
        "safe_metadata":{"verification":"legacy_partial_heal"}
      }
    }'::jsonb,
    0.9,
    5,
    'manual_review'
  );

  select * into v_legacy_approval
  from public.admin_approve_learning_candidate(
    v_legacy_candidate_id,
    v_admin_id,
    'legacy split approval'
  );

  if v_legacy_approval.ok is not true then
    raise exception 'legacy approval setup failed';
  end if;

  select * into v_healed
  from public.admin_approve_learning_candidate_atomic(
    v_legacy_candidate_id,
    v_admin_id,
    'heal legacy split approval'
  );

  if v_healed.ok is not true
     or v_healed.rule_id <> v_legacy_approval.rule_id
     or v_healed.rule_version <> v_legacy_approval.rule_version
     or v_healed.knowledge_ok is not true then
    raise exception 'atomic approval did not heal a legacy partial approval';
  end if;

  select count(*)::integer into v_count
  from public.kael_rule_lifecycle_log as lifecycle
  where lifecycle.candidate_id = v_legacy_candidate_id
    and lifecycle.transition_reason = 'admin_approved_knowledge_upsert';
  if v_count <> 1 then
    raise exception 'legacy partial approval was not healed exactly once';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.admin_approve_learning_candidate_atomic(uuid,uuid,text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_approve_learning_candidate_atomic(uuid,uuid,text)',
    'execute'
  ) then
    raise exception 'non-service role can execute atomic manual approval RPC';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid =
      'public.admin_approve_learning_candidate_atomic(uuid,uuid,text)'::pg_catalog.regprocedure
      and proc.prosecdef is true
      and proc.proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'atomic manual approval definer RPC search path is not empty';
  end if;
end;
$$;

select jsonb_build_object(
  'manual_approval_atomic', true,
  'retry_idempotent', true,
  'legacy_partial_healed', true,
  'service_role_only', true
) as learning_admin_approval_atomic_verification;

rollback;

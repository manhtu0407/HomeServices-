begin;

do $structure$
declare
  v_publish regprocedure := 'public.admin_publish_price_baseline_version(uuid,uuid,uuid,timestamptz,integer,uuid,text)'::regprocedure;
  v_retire regprocedure := 'public.admin_retire_price_baseline(uuid,uuid,integer,uuid,text)'::regprocedure;
  v_taxonomy regprocedure := 'public.admin_apply_service_taxonomy_revision(uuid,public.service_type,integer,uuid,text,jsonb,jsonb)'::regprocedure;
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.admin_system_mutation_receipts'::regclass
      and relrowsecurity
  ) then
    raise exception 'system mutation receipts must have RLS enabled';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.admin_system_mutation_receipts', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.admin_system_mutation_receipts', 'select')
    or not pg_catalog.has_table_privilege('service_role', 'public.admin_system_mutation_receipts', 'select')
  then
    raise exception 'system mutation receipts are not service-owned';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.admin_price_evidence_packages'::regclass
      and tgname = 'admin_price_evidence_packages_immutable'
      and tgenabled <> 'D'
  ) then
    raise exception 'price evidence packages are not immutable';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'price_baselines_one_active_key_idx'
      and indexdef like '%WHERE (lifecycle = ''active''::text)%'
  ) then
    raise exception 'active price baseline uniqueness is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid in (v_publish, v_retire, v_taxonomy)
      and prosecdef
      and proconfig = array['search_path=""']::text[]
    group by prosecdef, proconfig
    having count(*) = 3
  ) then
    raise exception 'system mutation RPCs are not locked-path definers';
  end if;

  if pg_catalog.has_function_privilege('anon', v_publish, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_publish, 'execute')
    or pg_catalog.has_function_privilege('anon', v_retire, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_retire, 'execute')
    or pg_catalog.has_function_privilege('anon', v_taxonomy, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_taxonomy, 'execute')
    or not pg_catalog.has_function_privilege('service_role', v_publish, 'execute')
    or not pg_catalog.has_function_privilege('service_role', v_retire, 'execute')
    or not pg_catalog.has_function_privilege('service_role', v_taxonomy, 'execute')
  then
    raise exception 'system mutation RPC execute grants are unsafe';
  end if;
end;
$structure$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'fa700000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'system-owner@example.test',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

update public.profiles
set role = 'admin'::public.user_role
where id = 'fa700000-0000-4000-8000-000000000001';

do $behavior$
declare
  v_active_count integer;
  v_baseline public.price_baselines%rowtype;
  v_category public.service_categories%rowtype;
  v_effective_from timestamptz := clock_timestamp();
  v_new_baseline public.price_baselines%rowtype;
  v_publish record;
  v_replay record;
  v_retire record;
  v_taxonomy record;
  v_rollback record;
begin
  select baseline.* into strict v_baseline
  from public.price_baselines as baseline
  where baseline.lifecycle = 'active'
  order by baseline.updated_at desc, baseline.id desc
  limit 1;

  insert into public.admin_price_evidence_packages (
    id, schema_version, package_hash, service_type, service_problem_id,
    complexity, district_code, aggregate_min, aggregate_max, unit,
    evidence_document, verified_at
  ) values (
    'fa710000-0000-4000-8000-000000000001',
    'baseline_price_evidence.v1',
    repeat('a', 64),
    v_baseline.service_type,
    v_baseline.service_problem_id,
    v_baseline.complexity,
    v_baseline.district_code,
    v_baseline.price_min,
    v_baseline.price_max,
    'VND',
    jsonb_build_object('schema_version', 'baseline_price_evidence.v1', 'sources', jsonb_build_array()),
    now()
  );

  select * into strict v_publish
  from public.admin_publish_price_baseline_version(
    'fa700000-0000-4000-8000-000000000001',
    v_baseline.id,
    'fa710000-0000-4000-8000-000000000001',
    v_effective_from,
    v_baseline.version,
    'fa720000-0000-4000-8000-000000000001',
    'Verified test price version'
  );

  select baseline.* into strict v_new_baseline
  from public.price_baselines as baseline
  where baseline.id = v_publish.resource_id::uuid;

  select count(*) into v_active_count
  from public.price_baselines as baseline
  where baseline.service_problem_id = v_baseline.service_problem_id
    and baseline.complexity = v_baseline.complexity
    and baseline.district_code = v_baseline.district_code
    and baseline.lifecycle = 'active';

  if v_publish.replayed
    or v_new_baseline.version <> v_baseline.version + 1
    or v_new_baseline.supersedes_id <> v_baseline.id
    or v_active_count <> 1
    or (select lifecycle from public.price_baselines where id = v_baseline.id) <> 'superseded'
  then
    raise exception 'price publish did not atomically supersede the active version';
  end if;

  select * into strict v_replay
  from public.admin_publish_price_baseline_version(
    'fa700000-0000-4000-8000-000000000001',
    v_baseline.id,
    'fa710000-0000-4000-8000-000000000001',
    v_effective_from,
    v_baseline.version,
    'fa720000-0000-4000-8000-000000000001',
    'Verified test price version'
  );

  if not v_replay.replayed or v_replay.event_id <> v_publish.event_id then
    raise exception 'price publish replay was not idempotent';
  end if;

  select * into strict v_retire
  from public.admin_retire_price_baseline(
    'fa700000-0000-4000-8000-000000000001',
    v_new_baseline.id,
    v_new_baseline.version,
    'fa720000-0000-4000-8000-000000000002',
    'Verified test retirement'
  );

  if v_retire.replayed
    or (select lifecycle from public.price_baselines where id = v_new_baseline.id) <> 'retired'
  then
    raise exception 'price retirement did not preserve the historical row';
  end if;

  select category.* into strict v_category
  from public.service_categories as category
  where category.service_type = 'electrical'
  for update;

  select * into strict v_taxonomy
  from public.admin_apply_service_taxonomy_revision(
    'fa700000-0000-4000-8000-000000000001',
    'electrical',
    v_category.revision,
    'fa720000-0000-4000-8000-000000000003',
    'Verified test taxonomy revision',
    jsonb_build_object('label_vi', v_category.label_vi),
    '[]'::jsonb
  );

  if v_taxonomy.replayed
    or v_taxonomy.new_version <> v_category.revision + 1
    or not exists (
      select 1 from public.service_taxonomy_revisions as revision
      where revision.service_type = 'electrical'
        and revision.revision = v_taxonomy.new_version
    )
  then
    raise exception 'taxonomy revision did not record its append-only history';
  end if;

  insert into public.learning_candidates (
    id, candidate_type, affected_service, suggested_payload,
    confidence, evidence_count, status, audit_reason
  ) values (
    'fa730000-0000-4000-8000-000000000001',
    'service_guidance',
    'electrical',
    jsonb_build_object('skill_id', 'LS2'),
    0.8,
    5,
    'auto_promoted',
    'Verified rollback provenance'
  );

  insert into public.learning_rules (
    id, rule_type, affected_service, rule_payload, confidence,
    evidence_count, status, active_version, rollback_available
  ) values (
    'fa740000-0000-4000-8000-000000000001',
    'service_guidance',
    'electrical',
    jsonb_build_object('revision', 2),
    0.8,
    5,
    'active',
    2,
    true
  );

  insert into public.learning_rule_versions (
    rule_id, version, rule_payload, change_reason, status
  ) values
    ('fa740000-0000-4000-8000-000000000001', 1, jsonb_build_object('revision', 1), 'Verified version one', 'active'),
    ('fa740000-0000-4000-8000-000000000001', 2, jsonb_build_object('revision', 2), 'Verified version two', 'active');

  insert into public.kael_rule_lifecycle_log (
    rule_id, candidate_id, skill_id, previous_state, next_state,
    transition_reason, actor_role, safe_metadata
  ) values (
    'fa740000-0000-4000-8000-000000000001',
    'fa730000-0000-4000-8000-000000000001',
    'LS2',
    'evidence_gate_check',
    'active',
    'verified_admin_system_rollback',
    'system',
    '{}'::jsonb
  );

  insert into public.learning_rule_dependencies (
    rule_id, rule_version, candidate_id, source_hash,
    evidence_hash, release_id, status
  ) values
    ('fa740000-0000-4000-8000-000000000001', 1, 'fa730000-0000-4000-8000-000000000001', repeat('b', 64), repeat('c', 64), 'verified-release', 'active'),
    ('fa740000-0000-4000-8000-000000000001', 2, 'fa730000-0000-4000-8000-000000000001', repeat('b', 64), repeat('c', 64), 'verified-release', 'active');

  select * into strict v_rollback
  from public.admin_rollback_learning_rule_atomic(
    'fa700000-0000-4000-8000-000000000001',
    'fa740000-0000-4000-8000-000000000001',
    1,
    2,
    'fa720000-0000-4000-8000-000000000004',
    'Verified learning rule rollback'
  );

  if v_rollback.replayed
    or v_rollback.new_version <> 3
    or (select active_version from public.learning_rules where id = 'fa740000-0000-4000-8000-000000000001') <> 3
    or (select rule_payload from public.learning_rules where id = 'fa740000-0000-4000-8000-000000000001') <> jsonb_build_object('revision', 1)
  then
    raise exception 'learning rollback did not use lifecycle provenance or publish the restored version';
  end if;
end;
$behavior$;

rollback;

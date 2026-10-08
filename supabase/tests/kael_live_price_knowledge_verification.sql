-- @pillar id: P346-kael-price-knowledge-sql-integrity
-- @pillar invariant: active price knowledge has complete quorum-backed amounts, customer and worker reads are blocked, admins can inspect and quarantine it, and service-role writes are allowed
-- @pillar authority: governance/RULES.md #2
-- @pillar target: public.kael_price_knowledge constraints, RLS, and live-evidence policy validation
-- @pillar layer: sql
-- @pillar siblings: P344-kael-price-knowledge-reuse,P345-kael-market-anchored-price
-- @pillar mutation: allow NULL aggregate or quorum fields through the active-row check, grant customer or worker reads, or remove the admin quarantine path; this rollback-only matrix turns red

begin;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a3460000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'price-knowledge-admin@nestscout.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3460000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'price-knowledge-customer@nestscout.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3460000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'price-knowledge-worker@nestscout.test', '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

update public.profiles set role = 'admin'::public.user_role
where id = 'a3460000-0000-4000-8000-000000000001';
update public.profiles set role = 'customer'::public.user_role
where id = 'a3460000-0000-4000-8000-000000000002';
update public.profiles set role = 'worker'::public.user_role
where id = 'a3460000-0000-4000-8000-000000000003';

do $verification$
declare
  v_service_type public.service_type;
  v_research_fingerprint text := repeat('a', 64);
  v_expires_at timestamptz := now() + interval '1 day';
  v_rls_enabled boolean;
  v_knowledge_id uuid;
begin
  select enumlabel::public.service_type
  into strict v_service_type
  from pg_catalog.pg_enum
  where enumtypid = 'public.service_type'::regtype
  order by enumsortorder
  limit 1;

  select relrowsecurity
  into strict v_rls_enabled
  from pg_catalog.pg_class
  where oid = 'public.kael_price_knowledge'::regclass;
  if not v_rls_enabled then
    raise exception 'KAEL_PRICE_KNOWLEDGE_RLS_DISABLED';
  end if;
  select relrowsecurity
  into strict v_rls_enabled
  from pg_catalog.pg_class
  where oid = 'public.kael_case_knowledge'::regclass;
  if not v_rls_enabled then
    raise exception 'KAEL_CASE_KNOWLEDGE_RLS_DISABLED';
  end if;
  if has_table_privilege('anon', 'public.kael_price_knowledge', 'SELECT')
    or has_table_privilege('anon', 'public.kael_price_knowledge', 'INSERT')
    or has_table_privilege('authenticated', 'public.kael_price_knowledge', 'INSERT')
    or has_table_privilege('anon', 'public.kael_case_knowledge', 'SELECT')
    or has_table_privilege('anon', 'public.kael_case_knowledge', 'INSERT')
    or has_table_privilege('authenticated', 'public.kael_case_knowledge', 'INSERT')
    or has_table_privilege('authenticated', 'public.kael_case_knowledge', 'UPDATE') then
    raise exception 'KAEL_KNOWLEDGE_DIRECT_WRITE_OR_ANON_READ_ALLOWED';
  end if;
  if not has_table_privilege('service_role', 'public.kael_price_knowledge', 'INSERT')
    or not has_table_privilege('service_role', 'public.kael_case_knowledge', 'INSERT') then
    raise exception 'KAEL_KNOWLEDGE_SERVICE_WRITE_MISSING';
  end if;

  begin
    insert into public.kael_price_knowledge (
      service_type, problem_slug, status, unit, aggregate_min, aggregate_max,
      accepted_source_count, high_trust_source_count, required_quorum, sources,
      research_fingerprint, expires_at
    ) values (
      v_service_type, 'schema_probe', 'active', 'per_visit', null, null,
      2, 2, 2, '[{},{}]'::jsonb, v_research_fingerprint, v_expires_at
    );
    raise exception 'ACTIVE_KNOWLEDGE_WITHOUT_AGGREGATE_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.kael_price_knowledge (
      service_type, problem_slug, status, unit, aggregate_min, aggregate_max,
      accepted_source_count, high_trust_source_count, required_quorum, sources,
      research_fingerprint, expires_at
    ) values (
      v_service_type, 'schema_probe', 'active', 'per_visit', 100000, 200000,
      2, 2, null, '[{},{}]'::jsonb, v_research_fingerprint, v_expires_at
    );
    raise exception 'ACTIVE_KNOWLEDGE_WITHOUT_QUORUM_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  insert into public.kael_price_knowledge (
    service_type, problem_slug, status, unit, aggregate_min, aggregate_max,
    accepted_source_count, high_trust_source_count, required_quorum, sources,
    research_fingerprint, expires_at
  ) values (
    v_service_type, 'schema_probe', 'active', 'per_visit', 100000, 200000,
    2, 2, 2, '[{},{}]'::jsonb, v_research_fingerprint, v_expires_at
  ) returning id into v_knowledge_id;

  insert into public.kael_case_knowledge (
    service_type, problem_slug, finding, severity_indicators, price_knowledge_id
  ) values (
    v_service_type, 'schema_probe', 'Verified rollback-only case finding', '{}', v_knowledge_id
  );

  if not public.service_intake_evidence_requirements_valid(
    'kael_auto_quote'::public.service_quote_mode,
    '{"minimum_source_count":2,"minimum_high_trust_source_count":2,"requires_active_baseline":false,"allow_live_market_evidence":true}'::jsonb
  ) then
    raise exception 'TWO_HIGH_TRUST_LIVE_EVIDENCE_POLICY_REJECTED';
  end if;
  if public.service_intake_evidence_requirements_valid(
    'kael_auto_quote'::public.service_quote_mode,
    '{"minimum_source_count":2,"minimum_high_trust_source_count":1,"requires_active_baseline":false,"allow_live_market_evidence":true}'::jsonb
  ) then
    raise exception 'WEAK_LIVE_EVIDENCE_POLICY_ACCEPTED';
  end if;

  if exists (
    select 1
    from public.service_problems as problem
    join public.service_intake_policies as policy
      on policy.service_problem_id = problem.id
    where problem.is_active
      and (
        problem.slug like '%-general'
        or problem.slug ~ '^other($|[_-])'
      )
      and policy.status = 'active'
      and policy.quote_mode = 'kael_auto_quote'::public.service_quote_mode
  ) then
    raise exception 'BROAD_PROBLEM_WAS_ENABLED_FOR_AUTOMATIC_QUOTING';
  end if;
end;
$verification$;

set local role authenticated;
set local request.jwt.claim.sub = 'a3460000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';

do $customer_rls$
declare
  v_visible integer;
  v_updated integer;
begin
  select count(*) into v_visible
  from public.kael_price_knowledge
  where research_fingerprint = repeat('a', 64);
  if v_visible <> 0 then raise exception 'CUSTOMER_READS_PRICE_KNOWLEDGE'; end if;

  select count(*) into v_visible
  from public.kael_case_knowledge
  where problem_slug = 'schema_probe';
  if v_visible <> 0 then raise exception 'CUSTOMER_READS_CASE_KNOWLEDGE'; end if;

  update public.kael_price_knowledge
  set status = 'quarantined'
  where research_fingerprint = repeat('a', 64);
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then raise exception 'CUSTOMER_QUARANTINED_PRICE_KNOWLEDGE'; end if;
end;
$customer_rls$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a3460000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';

do $worker_rls$
declare
  v_visible integer;
  v_updated integer;
begin
  select count(*) into v_visible
  from public.kael_price_knowledge
  where research_fingerprint = repeat('a', 64);
  if v_visible <> 0 then raise exception 'WORKER_READS_PRICE_KNOWLEDGE'; end if;

  select count(*) into v_visible
  from public.kael_case_knowledge
  where problem_slug = 'schema_probe';
  if v_visible <> 0 then raise exception 'WORKER_READS_CASE_KNOWLEDGE'; end if;

  update public.kael_price_knowledge
  set status = 'quarantined'
  where research_fingerprint = repeat('a', 64);
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then raise exception 'WORKER_QUARANTINED_PRICE_KNOWLEDGE'; end if;
end;
$worker_rls$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a3460000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $admin_rls$
declare
  v_visible integer;
  v_updated integer;
begin
  select count(*) into v_visible
  from public.kael_price_knowledge
  where research_fingerprint = repeat('a', 64);
  if v_visible <> 1 then raise exception 'ADMIN_CANNOT_READ_PRICE_KNOWLEDGE'; end if;

  select count(*) into v_visible
  from public.kael_case_knowledge
  where problem_slug = 'schema_probe';
  if v_visible <> 1 then raise exception 'ADMIN_CANNOT_READ_CASE_KNOWLEDGE'; end if;

  update public.kael_price_knowledge
  set status = 'quarantined'
  where research_fingerprint = repeat('a', 64);
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'ADMIN_CANNOT_QUARANTINE_PRICE_KNOWLEDGE'; end if;
end;
$admin_rls$;

reset role;

rollback;

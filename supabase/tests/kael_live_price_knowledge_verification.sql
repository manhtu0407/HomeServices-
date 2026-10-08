-- @pillar id: P346-kael-price-knowledge-sql-integrity
-- @pillar invariant: active price knowledge has complete quorum-backed amounts and its tables stay behind admin RLS and service-role writes
-- @pillar authority: governance/RULES.md #2
-- @pillar target: public.kael_price_knowledge constraints, RLS, and live-evidence policy validation
-- @pillar layer: sql
-- @pillar siblings: P344-kael-price-knowledge-reuse,P345-kael-market-anchored-price
-- @pillar mutation: allow NULL aggregate or quorum fields through the active-row check, or grant anonymous access; this rollback-only matrix turns red

begin;

do $verification$
declare
  v_service_type public.service_type;
  v_research_fingerprint text := repeat('a', 64);
  v_expires_at timestamptz := now() + interval '1 day';
  v_rls_enabled boolean;
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
  if has_table_privilege('anon', 'public.kael_price_knowledge', 'SELECT')
    or has_table_privilege('anon', 'public.kael_price_knowledge', 'INSERT')
    or has_table_privilege('authenticated', 'public.kael_price_knowledge', 'INSERT') then
    raise exception 'KAEL_PRICE_KNOWLEDGE_DIRECT_WRITE_OR_ANON_READ_ALLOWED';
  end if;
  if not has_table_privilege('service_role', 'public.kael_price_knowledge', 'INSERT') then
    raise exception 'KAEL_PRICE_KNOWLEDGE_SERVICE_WRITE_MISSING';
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
end;
$verification$;

rollback;

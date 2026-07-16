begin;

do $$
declare
  v_candidate_id constant uuid := 'a4100000-0000-4000-8000-000000000001';
  v_invalid_candidate_id constant uuid := 'a4100000-0000-4000-8000-000000000002';
  v_decoy_rule_id constant uuid := 'a4200000-0000-4000-8000-000000000001';
  v_ok boolean;
  v_error_code text;
  v_rule_id uuid;
  v_rule_version integer;
  v_first_rule_id uuid;
  v_first_rule_version integer;
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
    'price_prior_update',
    'hvac',
    'air-conditioner-not-cooling',
    'q7',
    '{
      "candidate_type":"price_prior_update",
      "scope":{
        "service_type":"hvac",
        "problem_slug":"air-conditioner-not-cooling",
        "district_code":"q7",
        "complexity":"medium"
      },
      "observed":{"sample_size":5},
      "suggested":{
        "new_min":350000,
        "new_max":650000,
        "direction":"underestimate"
      },
      "window":{"from_ts":"2026-07-01T00:00:00Z","to_ts":"2026-07-14T00:00:00Z"}
    }'::jsonb,
    0.8,
    5,
    'pending_evidence'
  );

  select result.ok, result.error_code, result.rule_id, result.rule_version
    into v_ok, v_error_code, v_rule_id, v_rule_version
  from public.auto_promote_learning_candidate_atomic(v_candidate_id) as result;

  if v_ok is not true or v_error_code is not null
     or v_rule_id is null or v_rule_version <> 1 then
    raise exception 'valid six-service candidate was not promoted atomically';
  end if;
  v_first_rule_id := v_rule_id;
  v_first_rule_version := v_rule_version;

  select count(*) into v_count
  from public.learning_rule_versions as version
  where version.rule_id = v_first_rule_id;
  if v_count <> 1 then
    raise exception 'promotion did not create exactly one immutable version';
  end if;

  select result.ok, result.error_code, result.rule_id, result.rule_version
    into v_ok, v_error_code, v_rule_id, v_rule_version
  from public.auto_promote_learning_candidate_atomic(v_candidate_id) as result;

  if v_ok is not true or v_error_code is not null
     or v_rule_id <> v_first_rule_id
     or v_rule_version <> v_first_rule_version then
    raise exception 'promotion retry was not idempotent';
  end if;

  select count(*) into v_count
  from public.learning_rule_versions as version
  where version.rule_id = v_first_rule_id;
  if v_count <> 1 then
    raise exception 'promotion retry created a duplicate version';
  end if;

  update public.learning_rules
  set status = 'rolled_back'
  where id = v_first_rule_id;

  update public.learning_rule_versions
  set status = 'rolled_back'
  where rule_id = v_first_rule_id;

  insert into public.learning_rules (
    id,
    rule_type,
    affected_service,
    affected_problem,
    affected_district,
    rule_payload,
    confidence,
    evidence_count,
    status,
    active_version
  ) values (
    v_decoy_rule_id,
    'price_prior_update',
    'hvac',
    'air-conditioner-not-cooling',
    'q7',
    '{"candidate_type":"price_prior_update"}'::jsonb,
    0.8,
    5,
    'active',
    1
  );

  insert into public.learning_rule_versions (
    rule_id,
    version,
    rule_payload,
    change_reason,
    status
  ) values (
    v_decoy_rule_id,
    1,
    '{"candidate_type":"price_prior_update"}'::jsonb,
    'decoy rule for retry verification',
    'active'
  );

  select result.ok, result.error_code, result.rule_id, result.rule_version
    into v_ok, v_error_code, v_rule_id, v_rule_version
  from public.auto_promote_learning_candidate_atomic(v_candidate_id) as result;

  if v_ok is not true or v_error_code is not null
     or v_rule_id <> v_first_rule_id
     or v_rule_version <> v_first_rule_version then
    raise exception 'promotion retry lost its durable rule receipt after lifecycle changes';
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
    v_invalid_candidate_id,
    'analysis_rule',
    'handyman',
    'minor-installation',
    'q1',
    '{
      "candidate_type":"analysis_rule",
      "scope":{
        "service_type":"handyman",
        "problem_slug":"minor-installation",
        "district_code":"q1"
      },
      "observed":{"sample_size":5},
      "suggested":{"kind":"auto_book_worker"}
    }'::jsonb,
    0.9,
    5,
    'pending_evidence'
  );

  select result.ok, result.error_code
    into v_ok, v_error_code
  from public.auto_promote_learning_candidate_atomic(v_invalid_candidate_id) as result;

  if v_ok is not false or v_error_code <> 'UNSAFE_ANALYSIS_RULE_PAYLOAD' then
    raise exception 'unsafe analysis autonomy was not rejected';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.auto_promote_learning_candidate_atomic(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated retained execute on auto-promotion RPC';
  end if;

  select count(*)::integer
  into v_count
  from pg_catalog.pg_proc as proc
  where proc.oid = 'public.auto_promote_learning_candidate_atomic(uuid)'::pg_catalog.regprocedure
    and proc.prosecdef is true
    and proc.proconfig = array['search_path=""']::text[];

  if v_count <> 1 then
    raise exception 'auto-promotion definer RPC search path is not empty';
  end if;
end $$;

rollback;

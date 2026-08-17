-- Rollback-only verification for six-service quote-ready price evidence.
begin;

do $verification$
declare
  quote_ready_service_count integer;
  target record;
  actual record;
begin
  select count(distinct problem.service_type)
  into quote_ready_service_count
  from public.price_baselines as baseline
  join public.service_problems as problem on problem.id = baseline.service_problem_id
  where problem.service_type in (
    'electrical',
    'plumbing',
    'cleaning',
    'hvac',
    'upholstery',
    'handyman'
  )
    and baseline.price_evidence ->> 'schema_version' = 'baseline_price_evidence.v1'
    and jsonb_typeof(baseline.price_evidence -> 'sources') = 'array'
    and jsonb_array_length(baseline.price_evidence -> 'sources') >= 2;

  if quote_ready_service_count <> 6 then
    raise exception 'six-service quote-ready coverage is incomplete: %', quote_ready_service_count;
  end if;

  for target in
    select *
    from (values
      ('electrical'::public.service_type, 'install_device', 'small'::public.complexity_level, 115000, 250000, 'per_repair_point', 2),
      ('plumbing'::public.service_type, 'pipe_leak', 'medium'::public.complexity_level, 150000, 375000, 'per_repair_point', 2),
      ('cleaning'::public.service_type, 'standard_home_cleaning', 'small'::public.complexity_level, 253000, 315000, 'per_visit', 2),
      ('hvac'::public.service_type, 'routine_hvac_cleaning', 'small'::public.complexity_level, 200000, 200000, 'per_item', 2),
      ('upholstery'::public.service_type, 'sofa_cleaning', 'small'::public.complexity_level, 250000, 300000, 'per_item', 2),
      ('handyman'::public.service_type, 'repair_hinge_or_handle', 'small'::public.complexity_level, 140000, 375000, 'per_cabinet_door', 2)
    ) as expected(service_type, problem_slug, complexity, price_min, price_max, evidence_unit, source_count)
  loop
    select
      baseline.price_min,
      baseline.price_max,
      jsonb_array_length(baseline.price_evidence -> 'sources') as source_count,
      count(*) filter (
        where source.value ->> 'unit' = target.evidence_unit
          and source.value #>> '{verification,ledger_ref}' like 'docs/foundation/source-trust-samples/%-ledger.json'
          and source.value #>> '{verification,price_snapshot_sha256}' ~ '^[A-F0-9]{64}$'
          and source.value #>> '{verification,identity_snapshot_sha256}' ~ '^[A-F0-9]{64}$'
      ) as valid_source_count,
      round(avg((source.value ->> 'price_min')::numeric) / 1000) * 1000 as aggregate_min,
      round(avg((source.value ->> 'price_max')::numeric) / 1000) * 1000 as aggregate_max
    into actual
    from public.price_baselines as baseline
    join public.service_problems as problem on problem.id = baseline.service_problem_id
    cross join lateral jsonb_array_elements(baseline.price_evidence -> 'sources') as source(value)
    where problem.service_type = target.service_type
      and problem.slug = target.problem_slug
      and baseline.complexity = target.complexity
      and baseline.district_code = 'hcmc_all'
    group by baseline.id;

    if actual is null
      or actual.price_min <> target.price_min
      or actual.price_max <> target.price_max
      or actual.source_count <> target.source_count
      or actual.valid_source_count <> target.source_count
      or actual.aggregate_min <> target.price_min
      or actual.aggregate_max <> target.price_max
    then
      raise exception 'invalid quote-ready baseline for %/%', target.service_type, target.problem_slug;
    end if;
  end loop;

  if exists (
    select 1
    from public.source_trust_registry as registry
    where registry.domain in (
      '1fix.vn',
      'thoviet.com.vn',
      'cogiupviec.com',
      'be.com.vn',
      'dienmayxanh.com',
      'vesinhnhao24h.com',
      'vesinhmastercare.com',
      'suachuatainha.com.vn',
      'nhabepsaigon.vn'
    )
      and (
        registry.is_active is not true
        or registry.auto_tier > 2
        or registry.integrity_flag is not true
        or registry.criteria_met <> '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb
      )
  ) then
    raise exception 'quote source registry lost A-G or tier eligibility';
  end if;
end;
$verification$;

select jsonb_build_object(
  'quote_ready_service_count', 6,
  'multi_source_price_evidence', true,
  'aggregate_reconciliation', true,
  'source_registry_a_to_g', true
) as six_service_quote_ready_baselines_verification;

rollback;

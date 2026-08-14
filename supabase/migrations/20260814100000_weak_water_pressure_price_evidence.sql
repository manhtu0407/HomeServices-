-- A high-value diagnostic baseline requires three independent T1/T2 sources.
-- The aggregate covers one non-destructive HCMC leak-detection visit only.

begin;

insert into public.source_trust_registry (
  domain,
  tier,
  trust_score,
  description,
  last_reviewed_at,
  review_notes,
  is_active,
  metadata,
  criteria_met,
  auto_tier,
  entity_type,
  region,
  last_price_seen_at,
  price_unit,
  integrity_flag
)
values
  (
    '1fix.vn',
    'tier_1',
    0.9,
    'Registered HCMC repair provider with a dated, directly published ultrasonic leak-detection price range.',
    '2026-08-14T00:00:00Z'::timestamptz,
    'Verified company identity, tax ID, HCMC operation, explicit per-visit range, and repair exclusion.',
    true,
    '{"review_reference":"price_baseline_water_pressure_20260814"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    1,
    'direct_service_provider',
    'hcmc',
    '2026-08-12T00:00:00Z'::timestamptz,
    'per_visit',
    true
  ),
  (
    'aloviecnha.com',
    'tier_2',
    0.78,
    'HCMC direct service provider with a current machine-assisted underground leak-detection range.',
    '2026-08-14T00:00:00Z'::timestamptz,
    'Verified provider identity, HCMC relevance, price-page revision date, and one-visit service range; no legal ID captured.',
    true,
    '{"review_reference":"price_baseline_water_pressure_20260814"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    2,
    'direct_service_provider',
    'hcmc',
    '2026-07-18T00:00:00Z'::timestamptz,
    'per_visit',
    true
  ),
  (
    'thoviet.com.vn',
    'tier_2',
    0.78,
    'HCMC technical service company with an August 2026 machine-assisted underground leak-detection table.',
    '2026-08-14T00:00:00Z'::timestamptz,
    'Verified company identity, HCMC scope, displayed price-table month, and one-service-visit mapping; no legal ID captured.',
    true,
    '{"review_reference":"price_baseline_water_pressure_20260814"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    2,
    'direct_service_provider',
    'hcmc',
    '2026-08-01T00:00:00Z'::timestamptz,
    'per_visit',
    true
  )
on conflict (domain) do update
set
  tier = excluded.tier,
  trust_score = excluded.trust_score,
  description = excluded.description,
  last_reviewed_at = excluded.last_reviewed_at,
  review_notes = excluded.review_notes,
  is_active = excluded.is_active,
  metadata = public.source_trust_registry.metadata || excluded.metadata,
  criteria_met = excluded.criteria_met,
  auto_tier = excluded.auto_tier,
  entity_type = excluded.entity_type,
  region = excluded.region,
  last_price_seen_at = excluded.last_price_seen_at,
  price_unit = excluded.price_unit,
  integrity_flag = excluded.integrity_flag,
  effective_until = null;

update public.price_baselines as baseline
set
  price_min = 700000,
  price_max = 1200000,
  source = 'multi_source_hcmc_non_destructive_leak_diagnosis_2026_08',
  price_evidence = jsonb_build_object(
    'schema_version', 'baseline_price_evidence.v1',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'domain', '1fix.vn',
        'url', 'https://1fix.vn/dich-vu-do-tim-ro-ri-nuoc-ro-ri-nuoc-am-nen-nha-am-tuong',
        'observed_at', '2026-08-14',
        'price_min', 500000,
        'price_max', 1200000,
        'unit', 'per_visit',
        'verification', jsonb_build_object(
          'source_published_at', '2026-08-12',
          'verified_at', '2026-08-14',
          'verified_by', 'codex_agentic_e2e_price_audit',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-water-pressure-20260814-ledger.json',
          'price_snapshot_sha256', '129C4E16A02AD34B608D85BB76FC693E25C02BE28B52C43550675BF62775626B',
          'identity_snapshot_sha256', 'A4D33F90F976DB76B314FE6D7BBE9F6AFA6FAC2944561818A7872B6DF3D8BA00'
        ),
        'signals', jsonb_build_object(
          'identity_verified', true,
          'source_type', 'direct_pricing',
          'hcmc_relevant', true,
          'clear_price_and_unit', true,
          'integrity_verified', true,
          'review_overdue', false,
          'price_jump_suspected', false
        )
      ),
      jsonb_build_object(
        'domain', 'aloviecnha.com',
        'url', 'https://www.aloviecnha.com/do-tim-ro-ri-nuoc',
        'observed_at', '2026-08-14',
        'price_min', 800000,
        'price_max', 1200000,
        'unit', 'per_visit',
        'verification', jsonb_build_object(
          'source_published_at', '2026-07-18',
          'verified_at', '2026-08-14',
          'verified_by', 'codex_agentic_e2e_price_audit',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-water-pressure-20260814-ledger.json',
          'price_snapshot_sha256', 'FB838E2872E9CB1F1DD91FBB64E87D016C491269796F88C73C1B93C47B688081',
          'identity_snapshot_sha256', 'E4129EFA0F1EDE39A95A0E599925BA8D3596D7AC79E1D8EFB7AE2E9901C7AE0C'
        ),
        'signals', jsonb_build_object(
          'identity_verified', true,
          'source_type', 'direct_pricing',
          'hcmc_relevant', true,
          'clear_price_and_unit', true,
          'integrity_verified', true,
          'review_overdue', false,
          'price_jump_suspected', false
        )
      ),
      jsonb_build_object(
        'domain', 'thoviet.com.vn',
        'url', 'https://thoviet.com.vn/do-nuoc-ri',
        'observed_at', '2026-08-14',
        'price_min', 800000,
        'price_max', 1200000,
        'unit', 'per_visit',
        'verification', jsonb_build_object(
          'source_published_at', '2026-08-01',
          'verified_at', '2026-08-14',
          'verified_by', 'codex_agentic_e2e_price_audit',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-water-pressure-20260814-ledger.json',
          'price_snapshot_sha256', '55A9FA2B5E89736144D2B2B79E054DE353DB8E8D1474B7DACA3D1C29E382A306',
          'identity_snapshot_sha256', '55A9FA2B5E89736144D2B2B79E054DE353DB8E8D1474B7DACA3D1C29E382A306'
        ),
        'signals', jsonb_build_object(
          'identity_verified', true,
          'source_type', 'direct_pricing',
          'hcmc_relevant', true,
          'clear_price_and_unit', true,
          'integrity_verified', true,
          'review_overdue', false,
          'price_jump_suspected', false
        )
      )
    )
  ),
  version = baseline.version + 1,
  updated_at = now()
from public.service_problems as problem
where baseline.service_problem_id = problem.id
  and problem.service_type = 'plumbing'
  and problem.slug = 'weak_water_pressure'
  and baseline.complexity = 'medium'
  and baseline.district_code = 'hcmc_all';

commit;

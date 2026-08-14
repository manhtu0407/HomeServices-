-- One-point pipe-leak scope changes require a current multi-source HCMC labor
-- baseline. Materials and surface restoration remain outside this price.

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
    'kythuatdiennuochaphat.com',
    'tier_2',
    0.78,
    'HCMC direct plumbing provider with a dated 2026 small pipe-leak labor range.',
    '2026-08-14T00:00:00Z'::timestamptz,
    'Verified HCMC scope, provider identity, explicit range and material exclusion; no legal ID captured.',
    true,
    '{"review_reference":"price_baseline_pipe_leak_20260814"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    2,
    'direct_service_provider',
    'hcmc',
    '2026-03-15T00:00:00Z'::timestamptz,
    'per_repair_point',
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
  price_min = 150000,
  price_max = 375000,
  source = 'multi_source_hcmc_hidden_pipe_repair_point_2026_08',
  price_evidence = jsonb_build_object(
    'schema_version', 'baseline_price_evidence.v1',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'domain', '1fix.vn',
        'url', 'https://1fix.vn/dich-vu-sua-ong-nuoc-tai-nha',
        'observed_at', '2026-08-14',
        'price_min', 150000,
        'price_max', 400000,
        'unit', 'per_repair_point',
        'verification', jsonb_build_object(
          'source_published_at', '2026-08-01',
          'verified_at', '2026-08-14',
          'verified_by', 'codex_agentic_e2e_price_audit',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-pipe-leak-20260814-ledger.json',
          'price_snapshot_sha256', '193247C16CF0C506839F6C266F719981DE81E0114AB60A0BF6E7AAB591E6C60D',
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
        'domain', 'kythuatdiennuochaphat.com',
        'url', 'https://kythuatdiennuochaphat.com/tho-sua-dien-nuoc-phuong-long-phuoc',
        'observed_at', '2026-08-14',
        'price_min', 150000,
        'price_max', 350000,
        'unit', 'per_repair_point',
        'verification', jsonb_build_object(
          'source_published_at', '2026-03-15',
          'verified_at', '2026-08-14',
          'verified_by', 'codex_agentic_e2e_price_audit',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-pipe-leak-20260814-ledger.json',
          'price_snapshot_sha256', '3F9113E64A67E1566E75378A092E800FFA36450A3955F2C5D88C5EA77A00FCF0',
          'identity_snapshot_sha256', '3F9113E64A67E1566E75378A092E800FFA36450A3955F2C5D88C5EA77A00FCF0'
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
  and problem.slug = 'pipe_leak'
  and baseline.complexity = 'medium'
  and baseline.district_code = 'hcmc_all';

commit;

-- Keep the evidence guardrail strict while guaranteeing one bounded,
-- source-backed quote path for every supported service box.

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
    'cogiupviec.com',
    'tier_2',
    0.82,
    'Direct HCMC household-help provider with a dated 2026 four-hour visit range.',
    '2026-08-15T00:00:00Z'::timestamptz,
    'Verified provider identity, HCMC relevance, explicit visit duration, range, and stored page snapshot.',
    true,
    '{"review_reference":"price_baseline_six_services_20260815"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    2,
    'direct_service_provider',
    'hcmc',
    '2026-07-25T00:00:00Z'::timestamptz,
    'per_visit',
    true
  ),
  (
    'be.com.vn',
    'tier_1',
    0.95,
    'Official consumer platform publishing current weekday and weekend HCMC four-hour cleaning prices.',
    '2026-08-15T00:00:00Z'::timestamptz,
    'Verified official platform identity, exact HCMC duration prices, and byte-exact live-page snapshot.',
    true,
    '{"review_reference":"price_baseline_six_services_20260815"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    1,
    'direct_service_provider',
    'hcmc',
    '2026-08-15T00:00:00Z'::timestamptz,
    'per_visit',
    true
  ),
  (
    'vesinhnhao24h.com',
    'tier_2',
    0.8,
    'Direct HCMC upholstery-cleaning provider with a 2026 per-sofa price table.',
    '2026-08-15T00:00:00Z'::timestamptz,
    'Verified provider identity, sofa dimensions, per-item unit, HCMC scope, and stored snapshot.',
    true,
    '{"review_reference":"price_baseline_six_services_20260815"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    2,
    'direct_service_provider',
    'hcmc',
    '2026-03-01T00:00:00Z'::timestamptz,
    'per_item',
    true
  ),
  (
    'vesinhmastercare.com',
    'tier_2',
    0.8,
    'Direct HCMC upholstery-cleaning provider with a July 2026 sofa price table.',
    '2026-08-15T00:00:00Z'::timestamptz,
    'Verified provider identity, July 2026 range, sofa-form boundary, HCMC address, and stored snapshot.',
    true,
    '{"review_reference":"price_baseline_six_services_20260815"}'::jsonb,
    '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
    2,
    'direct_service_provider',
    'hcmc',
    '2026-07-01T00:00:00Z'::timestamptz,
    'per_item',
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

update public.source_trust_registry
set
  last_reviewed_at = '2026-08-15T00:00:00Z'::timestamptz,
  review_notes = 'Rechecked direct 2026 price, unit, provider identity, and repository evidence snapshot.',
  metadata = metadata || '{"review_reference":"price_baseline_six_services_20260815"}'::jsonb,
  criteria_met = '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
  auto_tier = case domain when 'thoviet.com.vn' then 2 else 1 end,
  entity_type = 'direct_service_provider',
  region = 'hcmc',
  last_price_seen_at = case domain
    when 'dienmayxanh.com' then '2026-05-01T00:00:00Z'::timestamptz
    when 'thoviet.com.vn' then '2026-08-01T00:00:00Z'::timestamptz
    else '2026-08-01T00:00:00Z'::timestamptz
  end,
  price_unit = case domain
    when 'thoviet.com.vn' then 'per_repair_point'
    when 'dienmayxanh.com' then 'per_item'
    else 'mixed'
  end,
  integrity_flag = true,
  is_active = true,
  effective_until = null
where domain in ('1fix.vn', 'thoviet.com.vn', 'dienmayxanh.com');

update public.price_baselines as baseline
set
  price_min = 115000,
  price_max = 250000,
  source = 'multi_source_hcmc_surface_outlet_install_2026_08',
  price_evidence = jsonb_build_object(
    'schema_version', 'baseline_price_evidence.v1',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'domain', '1fix.vn',
        'url', 'https://1fix.vn/bang-gia-sua-dien-nuoc',
        'observed_at', '2026-08-15',
        'price_min', 120000,
        'price_max', 280000,
        'unit', 'per_repair_point',
        'verification', jsonb_build_object(
          'source_published_at', '2026-08-01',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', '81ADB9C88BE011FC826C26ED317E1A08117D429F89EBC6C95698988B1E2E5250',
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
        'domain', 'thoviet.com.vn',
        'url', 'https://thoviet.com.vn/thi-cong-noi-that',
        'observed_at', '2026-08-15',
        'price_min', 110000,
        'price_max', 220000,
        'unit', 'per_repair_point',
        'verification', jsonb_build_object(
          'source_published_at', '2026-08-01',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', '0C8C2700062439774350CE93FC07C1D5EF4EB1CE5F7137B29A71F39BE169C877',
          'identity_snapshot_sha256', '0C8C2700062439774350CE93FC07C1D5EF4EB1CE5F7137B29A71F39BE169C877'
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
  and problem.service_type = 'electrical'
  and problem.slug = 'install_device'
  and baseline.complexity = 'small'
  and baseline.district_code = 'hcmc_all';

update public.price_baselines as baseline
set
  price_min = 253000,
  price_max = 315000,
  source = 'multi_source_hcmc_four_hour_standard_clean_2026_08',
  price_evidence = jsonb_build_object(
    'schema_version', 'baseline_price_evidence.v1',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'domain', 'cogiupviec.com',
        'url', 'https://cogiupviec.com/cam-nang/don-nha-theo-gio-go-vap/',
        'observed_at', '2026-08-15',
        'price_min', 200000,
        'price_max', 260000,
        'unit', 'per_visit',
        'verification', jsonb_build_object(
          'source_published_at', '2026-07-25',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', '848B4D310A165AC3D910B1D4C6C762EA8D035AC458D8A52EEAB940057B8857C1',
          'identity_snapshot_sha256', '848B4D310A165AC3D910B1D4C6C762EA8D035AC458D8A52EEAB940057B8857C1'
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
        'domain', 'be.com.vn',
        'url', 'https://be.com.vn/khach-hang-ca-nhan/be-clean/',
        'observed_at', '2026-08-15',
        'price_min', 305000,
        'price_max', 370000,
        'unit', 'per_visit',
        'verification', jsonb_build_object(
          'source_published_at', '2026-08-15',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', '240CC0601BF02E3EC9F814BA4855961B98B4958F3A37FB4D20AF97262ECC4C4E',
          'identity_snapshot_sha256', '240CC0601BF02E3EC9F814BA4855961B98B4958F3A37FB4D20AF97262ECC4C4E'
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
  and problem.service_type = 'cleaning'
  and problem.slug = 'standard_home_cleaning'
  and baseline.complexity = 'small'
  and baseline.district_code = 'hcmc_all';

update public.price_baselines as baseline
set
  price_min = 200000,
  price_max = 200000,
  source = 'multi_source_wall_ac_one_hp_cleaning_2026_08',
  price_evidence = jsonb_build_object(
    'schema_version', 'baseline_price_evidence.v1',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'domain', 'dienmayxanh.com',
        'url', 'https://www.dienmayxanh.com/tho-dien-may-xanh-dich-vu-tan-tam',
        'observed_at', '2026-08-15',
        'price_min', 200000,
        'price_max', 200000,
        'unit', 'per_item',
        'verification', jsonb_build_object(
          'source_published_at', '2026-05-01',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', '8EE3C2E2CAA700717960D3EDEF36EA6DFC757A17B5D339D5AE56D415A1684B53',
          'identity_snapshot_sha256', '8EE3C2E2CAA700717960D3EDEF36EA6DFC757A17B5D339D5AE56D415A1684B53'
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
        'domain', '1fix.vn',
        'url', 'https://1fix.vn/ve-sinh-may-lanh-tai-nha',
        'observed_at', '2026-08-15',
        'price_min', 200000,
        'price_max', 200000,
        'unit', 'per_item',
        'verification', jsonb_build_object(
          'source_published_at', '2026-01-01',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', '0B14E90212A62882B9CA2355FC393894649A1D68B6836ADB7355D9187E619B22',
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
      )
    )
  ),
  version = baseline.version + 1,
  updated_at = now()
from public.service_problems as problem
where baseline.service_problem_id = problem.id
  and problem.service_type = 'hvac'
  and problem.slug = 'routine_hvac_cleaning'
  and baseline.complexity = 'small'
  and baseline.district_code = 'hcmc_all';

update public.price_baselines as baseline
set
  price_min = 250000,
  price_max = 300000,
  source = 'multi_source_hcmc_fabric_bench_sofa_cleaning_2026_08',
  price_evidence = jsonb_build_object(
    'schema_version', 'baseline_price_evidence.v1',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'domain', 'vesinhnhao24h.com',
        'url', 'https://vesinhnhao24h.com/giat-ghe-sofa-tai-nha-tphcm/',
        'observed_at', '2026-08-15',
        'price_min', 250000,
        'price_max', 250000,
        'unit', 'per_item',
        'verification', jsonb_build_object(
          'source_published_at', '2026-03-01',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', '1C9D3BABBAC82984D7B55930CB6FDC664338E0D1E22048D51CF2B8F6F666B70A',
          'identity_snapshot_sha256', '1C9D3BABBAC82984D7B55930CB6FDC664338E0D1E22048D51CF2B8F6F666B70A'
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
        'domain', 'vesinhmastercare.com',
        'url', 'https://vesinhmastercare.com/bang-gia/',
        'observed_at', '2026-08-15',
        'price_min', 250000,
        'price_max', 350000,
        'unit', 'per_item',
        'verification', jsonb_build_object(
          'source_published_at', '2026-07-01',
          'verified_at', '2026-08-15',
          'verified_by', 'codex_six_service_agentic_e2e',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
          'price_snapshot_sha256', 'EE8A0C00D73F6D35256109DB4EFD2BD44EAC2BF436BFD3939F310BF991826F28',
          'identity_snapshot_sha256', 'EE8A0C00D73F6D35256109DB4EFD2BD44EAC2BF436BFD3939F310BF991826F28'
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
  and problem.service_type = 'upholstery'
  and problem.slug = 'sofa_cleaning'
  and baseline.complexity = 'small'
  and baseline.district_code = 'hcmc_all';

with verified_hinge as (
  select
    source_baseline.price_min,
    source_baseline.price_max,
    source_baseline.source,
    source_baseline.price_evidence
  from public.price_baselines as source_baseline
  join public.service_problems as source_problem
    on source_problem.id = source_baseline.service_problem_id
  where source_problem.service_type = 'handyman'
    and source_problem.slug = 'replace_cabinet_hinges'
    and source_baseline.complexity = 'small'
    and source_baseline.district_code = 'hcmc_all'
)
update public.price_baselines as baseline
set
  price_min = verified_hinge.price_min,
  price_max = verified_hinge.price_max,
  source = verified_hinge.source,
  price_evidence = verified_hinge.price_evidence,
  version = baseline.version + 1,
  updated_at = now()
from public.service_problems as problem, verified_hinge
where baseline.service_problem_id = problem.id
  and problem.service_type = 'handyman'
  and problem.slug = 'repair_hinge_or_handle'
  and baseline.complexity = 'small'
  and baseline.district_code = 'hcmc_all';

do $quote_ready$
declare
  quote_ready_service_count integer;
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
    raise exception 'all six services require at least one multi-source quote path';
  end if;
end;
$quote_ready$;

commit;

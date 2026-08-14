-- Price baselines remain admin-managed, but a legacy source label is not enough
-- to authorize a Customer-visible price. The runtime validates this evidence
-- against source_trust_registry and independently recomputes its aggregate.

begin;

alter table public.price_baselines
  add column if not exists price_evidence jsonb not null default
    '{"schema_version":"baseline_price_evidence.v1","sources":[]}'::jsonb;

alter table public.price_baselines
  drop constraint if exists price_baselines_price_evidence_shape_check;

alter table public.price_baselines
  add constraint price_baselines_price_evidence_shape_check check (
    jsonb_typeof(price_evidence) = 'object'
    and price_evidence ->> 'schema_version' = 'baseline_price_evidence.v1'
    and jsonb_typeof(price_evidence -> 'sources') = 'array'
  );

comment on column public.price_baselines.price_evidence is
  'Versioned source evidence. Edge validates registry identity, freshness, unit normalization, outliers, quorum, and exact aggregate reconciliation before showing a price.';

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
values (
  'nhabepsaigon.vn',
  'tier_1',
  0.9,
  'HCMC kitchen service provider with a directly published 2026 cabinet-hinge price table.',
  '2026-08-14T00:00:00Z'::timestamptz,
  'Reviewed direct HCMC service identity, dated price page, explicit per-item unit, and two-hinge normalization evidence.',
  true,
  '{"review_reference":"price_baseline_multi_source_evidence_2026_08"}'::jsonb,
  '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
  1,
  'direct_service_provider',
  'hcmc',
  '2026-08-14T00:00:00Z'::timestamptz,
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
  last_reviewed_at = '2026-08-14T00:00:00Z'::timestamptz,
  review_notes = 'Reviewed direct HCMC provider identity and current per-cabinet-door hinge replacement table.',
  criteria_met = '{"A":true,"B":true,"C":true,"D":true,"E":true,"F":true,"G":true}'::jsonb,
  auto_tier = 1,
  entity_type = 'direct_service_provider',
  region = 'hcmc',
  last_price_seen_at = '2026-08-14T00:00:00Z'::timestamptz,
  price_unit = 'per_cabinet_door',
  integrity_flag = true,
  is_active = true,
  effective_until = null
where domain = 'suachuatainha.com.vn';

update public.price_baselines as baseline
set
  price_min = 140000,
  price_max = 375000,
  source = 'multi_source_hcmc_cabinet_door_2026_08',
  price_evidence = jsonb_build_object(
    'schema_version', 'baseline_price_evidence.v1',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'domain', 'suachuatainha.com.vn',
        'url', 'https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/',
        'observed_at', '2026-08-14',
        'price_min', 120000,
        'price_max', 250000,
        'unit', 'per_cabinet_door',
        'verification', jsonb_build_object(
          'source_published_at', '2025-12-14',
          'verified_at', '2026-08-14',
          'verified_by', 'codex_agentic_e2e_price_audit',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-hinge-20260814-ledger.json',
          'price_snapshot_sha256', '251989BF6C0164DECCFAADEC460901340D68C90E1B98C9007D5FFB12F67BF35B',
          'identity_snapshot_sha256', 'F20C6FBCBC2183ED1A26CF38A2DC7F979711F1CA1C2A4EA146F41376C5161668'
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
        'domain', 'nhabepsaigon.vn',
        'url', 'https://nhabepsaigon.vn/bao-gia-sua-tu-bep-moi-nhat',
        'observed_at', '2026-08-14',
        'price_min', 160000,
        'price_max', 500000,
        'unit', 'per_cabinet_door',
        'verification', jsonb_build_object(
          'source_published_at', '2026-06-04',
          'verified_at', '2026-08-14',
          'verified_by', 'codex_agentic_e2e_price_audit',
          'ledger_ref', 'docs/foundation/source-trust-samples/price-baseline-hinge-20260814-ledger.json',
          'price_snapshot_sha256', '0AB71E27B74DFBB137E15FBD611FB8122B3E653A354ADFED1A9C0B8DD8C145CD',
          'identity_snapshot_sha256', '568479BCAF5746026273EF18D4C66F53F36F1337B2244FDA34206DE5BECB658E'
        ),
        'normalization', jsonb_build_object(
          'original_price_min', 80000,
          'original_price_max', 250000,
          'original_unit', 'per_item',
          'quantity', 2,
          'calculation', '2 cabinet hinges x published per-item range'
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
  and problem.service_type = 'handyman'
  and problem.slug = 'replace_cabinet_hinges'
  and baseline.complexity = 'small'
  and baseline.district_code = 'hcmc_all';

create or replace function public.enforce_kael_estimate_price_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_card jsonb;
  v_receipt jsonb;
  v_fairness jsonb;
  v_baseline jsonb;
  v_baseline_valid boolean := false;
  v_market_valid boolean := false;
  v_source_count integer := 0;
  v_distinct_domain_count integer := 0;
begin
  if new.kael_estimate_card_v3 is null then
    return new;
  end if;

  v_card := coalesce(
    nullif(new.kael_estimate_card_v3 -> 'card', '{}'::jsonb),
    new.kael_estimate_card_v3,
    '{}'::jsonb
  );
  v_receipt := coalesce(v_card -> 'price_reasoning_receipt', '{}'::jsonb);
  v_fairness := coalesce(v_receipt -> 'fairness', '{}'::jsonb);
  v_baseline := coalesce(v_fairness -> 'baseline_evidence', '{}'::jsonb);

  if v_receipt ->> 'schema_version' = 'price_reasoning_receipt.v1'
    and coalesce(v_receipt -> 'costs' ->> 'total_min', '') ~ '^[0-9]+$'
    and coalesce(v_receipt -> 'costs' ->> 'total_max', '') ~ '^[0-9]+$'
    and (v_receipt -> 'costs' ->> 'total_min')::numeric = new.kael_price_min
    and (v_receipt -> 'costs' ->> 'total_max')::numeric = new.kael_price_max
    and v_fairness ->> 'price_source' = v_card ->> 'price_source'
  then
    if v_card ->> 'price_source' in ('baseline_with_market', 'baseline_only')
      and v_baseline ->> 'schema_version' = 'baseline_price_evidence_receipt.v1'
      and v_baseline ->> 'quorum_met' = 'true'
      and jsonb_typeof(v_baseline -> 'sources') = 'array'
      and coalesce(v_baseline ->> 'accepted_source_count', '') ~ '^[0-9]+$'
      and coalesce(v_baseline ->> 'high_trust_source_count', '') ~ '^[0-9]+$'
      and coalesce(v_baseline ->> 'required_quorum', '') ~ '^[0-9]+$'
      and coalesce(v_baseline ->> 'aggregate_price_min', '') ~ '^[0-9]+$'
      and coalesce(v_baseline ->> 'aggregate_price_max', '') ~ '^[0-9]+$'
    then
      select
        count(*),
        count(distinct nullif(source.value ->> 'domain', ''))
      into v_source_count, v_distinct_domain_count
      from jsonb_array_elements(v_baseline -> 'sources') as source(value);

      v_baseline_valid :=
        v_source_count = (v_baseline ->> 'accepted_source_count')::integer
        and v_distinct_domain_count = v_source_count
        and (v_baseline ->> 'high_trust_source_count')::integer = v_source_count
        and (v_baseline ->> 'high_trust_source_count')::integer >=
          (v_baseline ->> 'required_quorum')::integer
        and (v_baseline ->> 'required_quorum')::integer >= 2
        and (v_baseline ->> 'aggregate_price_min')::numeric = new.kael_price_min
        and (v_baseline ->> 'aggregate_price_max')::numeric = new.kael_price_max
        and not exists (
          select 1
          from jsonb_array_elements(v_baseline -> 'sources') as source(value)
          where jsonb_typeof(source.value) <> 'object'
            or coalesce(source.value ->> 'effective_tier', '') not in ('1', '2')
            or nullif(source.value ->> 'domain', '') is null
            or nullif(source.value ->> 'url', '') is null
            or coalesce(source.value ->> 'observed_at', '') !~ '^\d{4}-\d{2}-\d{2}$'
            or source.value ->> 'unit' <> v_baseline ->> 'unit'
        );
    end if;

    v_market_valid :=
      v_card ->> 'price_source' in ('perplexity_validated', 'baseline_with_market')
      and v_fairness ->> 'quorum_met' = 'true'
      and coalesce(v_fairness ->> 'market_source_count', '') ~ '^[0-9]+$'
      and coalesce(v_fairness ->> 'high_trust_source_count', '') ~ '^[0-9]+$'
      and (v_fairness ->> 'market_source_count')::integer >= 2
      and (v_fairness ->> 'high_trust_source_count')::integer >= 1
      and (v_fairness ->> 'high_trust_source_count')::integer <=
        (v_fairness ->> 'market_source_count')::integer;
  end if;

  if not v_baseline_valid and not v_market_valid then
    raise exception using
      errcode = '23514',
      message = 'KAEL_PRICE_EVIDENCE_REQUIRED';
  end if;

  return new;
end;
$func$;

drop trigger if exists trg_enforce_kael_estimate_price_evidence on public.jobs;
create trigger trg_enforce_kael_estimate_price_evidence
before insert on public.jobs
for each row execute function public.enforce_kael_estimate_price_evidence();

revoke execute on function public.enforce_kael_estimate_price_evidence()
from public, anon, authenticated;
grant execute on function public.enforce_kael_estimate_price_evidence()
to service_role;

commit;

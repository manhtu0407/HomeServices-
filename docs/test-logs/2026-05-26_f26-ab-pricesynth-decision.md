# 2026-05-26 F26 A/B Price Synthesis Decision

Plan ref: `Plan.md` §26.9, D28.

## Runner

Script: `apps/api/scripts/kael-ab-pricesynth.mjs`

Edge evaluator: `POST /admin/kael-ab/price-synthesis`

```text
run_id: f26-ab-20260526133817
project: HomeServices Staging
ref: xyylanuyflrjzbjzhqfl
experiment_key: p17-price-synthesis-perplexity-vs-anthropic-2026-05-26
sample_target: 100
persisted_cases: 100
split: 50 perplexity_primary / 50 anthropic_shadow
```

The runner created a temporary admin user, called the staging Edge Function so
provider keys stayed inside Edge secrets, then persisted case rows through the
service role. Temporary admin cleanup completed.

## Metrics

```text
schema_validation_rate: 0.9300
price_range_deviation_vs_anthropic: 0.0305
price_range_deviation_vs_actual: 0.4942
fallback_rate: 0.0700
failed_metric_count: 2
threshold_decision: reject_perplexity
```

Thresholds:

```text
schema_validation_rate_min: 0.95
price_range_deviation_vs_anthropic_max: 0.25
price_range_deviation_vs_actual_max: 0.30
fallback_rate_max: 0.10
reject_if_failed_metric_count_gte: 2
```

Decision:

```text
reject_perplexity for price_synthesis purpose #6
```

Reason:

- Perplexity failed schema rate: `0.93 < 0.95`.
- Perplexity failed fixture actual-proxy deviation: `0.4942 > 0.30`.
- It passed deviation vs Anthropic and fallback rate.

## Important Limitation

`actual_final_price` is a deterministic manual-shadow fixture proxy generated
from staging baselines and market ranges, not a real paid transaction. This is
recorded in every row as `safe_metadata.actual_price_source =
manual_shadow_fixture_proxy`. The metric is still useful for D28 relative
quality gating, but it must not be reported as real production payment accuracy.

## Code Action

`routing.config.ts` now makes Anthropic primary for `price_synthesis`; Perplexity
is no longer the primary route for purpose #6 after this A/B result.

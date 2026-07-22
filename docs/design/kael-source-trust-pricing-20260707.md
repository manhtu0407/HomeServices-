# Kael Source Trust and Model Board — §40 Execution Companion

Canonical plan: `governance/Plan.md` §40. This companion records the executed contract and verification evidence; it does not override governance.

Status: implemented, locally verified, and schema-verified on staging `xyylanuyflrjzbjzhqfl` on 2026-07-10. Production is untouched.

## Locked invariants

- LIVE price remains deterministic: validated market evidence enters `synthesizePrice`; raw model prose and model-claimed tiers/verdicts cannot set money.
- Baseline/market weight is always 50/50. Weak evidence changes confidence, band width, and inspection state, never the blend weight.
- Mobile has no provider call or server secret. All model paths stay behind Edge `callAI` / `callStructuredAI`.
- Unknown or unpriced models fail loudly outside production and over-reserve with the highest known price in production.

## Model Board

| Job family | Primary | Escalation / fallback | Role boundary |
|---|---|---|---|
| Intent and fast classification | `deepseek-v4-flash` | V4 Pro model failover; Sonnet 5 provider fallback | Low-latency structured classification |
| Vision | `claude-sonnet-5` | Opus 4.8 for hard/low-confidence images | No Haiku or DeepSeek vision path |
| Clarification | `deepseek-v4-flash` | V4 Pro model failover; Haiku 4.5 provider fallback | Cheap user-facing clarification |
| Problem synthesis | `deepseek-v4-flash` | V4 Pro model failover; Sonnet 5 provider fallback | Structured synthesis, not LIVE price authority |
| Market lookup | `sonar` | Sonar Pro below confidence floor; Sonnet 5 transport fallback | Perplexity only supplies cited evidence |
| Price A/B evaluator | Sonnet 5 | Existing Sonar comparison | Shadow/evaluation only; LIVE math remains deterministic |
| Advisory / education | `deepseek-v4-flash` | V4 Pro model failover; Haiku 4.5 provider fallback | Low-cost bounded prose through output guards |
| Worker brief / worker assist | `deepseek-v4-flash` | V4 Pro model failover; Sonnet 5 provider fallback | Operational structured assistance |
| Scope change | Sonnet 5 | Opus 4.8 for low confidence or configured high stakes | Server-only threshold; validated decision path |
| Post-job learning | `deepseek-v4-pro` | Sonnet 5 Message Batch fallback | Bounded concurrency, structured candidate, durable queue/audit |

`claude-sonnet-4-6` remains only as a historical pricing row. The runtime roster test fails if it appears in `KAEL_ROUTING_CONFIG`.

Interactive DeepSeek routes use one attempt per model: Flash → V4 Pro → cross-provider fallback. Provider-wide authentication, credit, rate-limit, missing-key, or open-circuit failures skip the remaining DeepSeek model instead of wasting another request.

Official verification on 2026-07-10:

- Anthropic model IDs/capabilities: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic prices and Sonnet 5 effective periods: https://platform.claude.com/docs/en/about-claude/pricing
- Sonnet 5 / Opus 4.8 sampling-parameter migration rules: https://platform.claude.com/docs/en/about-claude/models/migration-guide
- DeepSeek V4 IDs and pricing: https://api-docs.deepseek.com/quick_start/pricing/
- Perplexity Sonar token/request pricing: https://docs.perplexity.ai/docs/getting-started/pricing

## Source trust contract

Per source, Perplexity returns only structured evidence:

```text
domain, price_min, price_max, unit, date,
signals: identity_verified, source_type, hcmc_relevant,
         clear_price_and_unit, integrity_verified, evidence_verified,
         review_overdue, price_jump_suspected
```

The provider cannot return an accepted tier. Zod strips unknown tier claims and the deterministic rulebook computes T1–T5 from the A–G evidence, citation registry match, evidence date, review state, and price-jump state.

| Tier | Required role | Price weight |
|---|---|---:|
| T1 | Verified HCMC direct price source with A–G evidence and fresh price | 1.0 |
| T2 | Verified direct/material reference; HCMC/material source 1.0, other region 0.7 | 1.0 / 0.7 |
| T3 | Verified secondary reference, fresh within 24 months | 0.3 |
| T4 | Known but weak/incomplete source; cannot stand alone | 0.1 |
| T5 | Unknown, blocked, listing, forum, or quarantined source | 0 |

Deterministic order:

1. Validate schema and citation/domain registry match.
2. Compute effective tier from A–G evidence; ignore a model tier claim.
3. Reject duplicate, uncited, stale, or non-`per_visit` evidence.
4. Remove any source over 40% from the T1–T2 median.
5. Require 2 T1–T2 sources below `KAEL_SOURCE_TRUST_HIGH_VALUE_VND`, otherwise 3.
6. Zero T1–T2 sources fails closed to baseline. A non-zero but weak quorum preserves 50/50, marks `insufficient_trusted_quorum`, widens the band, lowers confidence, and requires inspection.
7. Aggregate by effective tier and emit a deterministic Vietnamese source-count/tier summary to Estimate Card v3.
8. Apply the five deterministic verdict gates and the final 4× market clamp before synthesis.

## Files / Action / Acceptance

| Phase | Owner files | Acceptance |
|---|---|---|
| M0 / §41 P2 | `model-pricing.ts`, `provider-adapter.ts`, `provider-client.ts` | Every selected ID has verified cost; Sonnet 5/Opus omit unsupported sampling parameters; spend reserve/finalize uses the selected model |
| M1 | `routing.config.ts`, `cron/process-learning-queue.ts` | Complete roster, Sonnet 5 default, DeepSeek V4 Pro live learning path |
| M2 | `escalation.ts`, `vision.ts`, `market.ts`, `scope-change.ts` | Escalation invokes the stronger model only on the locked trigger and remains behind all guards |
| S0 | `synthesis.ts`, reference `apps/api/.../pricing.ts` | Exact 50/50 deterministic blend |
| S1 | `20260710082345_kael_source_trust_tiering.sql`, generated types | A–G fields, T1–T5 compatibility remap, RLS/grants, no row loss |
| S2 | `source-tier-rulebook.ts`, `types.ts`, `source-trust-aggregation.ts` | Runtime effective tier comes from A–G evidence, not provider/legacy tier authority |
| S3 | `source-trust.ts`, `market.ts`, `source-trust-aggregation.ts` | Per-source evidence, unit/freshness/outlier/quorum/weight rules, deterministic summary |
| S4 | `market-verdict.ts`, `pipeline.ts`, Estimate Card callers | Weak/suspicious market keeps 50/50 and requires inspection; reject cases use baseline |
| S5 | `synthesis.ts` | Endpoint outside the relative 4× baseline band drops the market half |
| S6 | adversarial/unit/schema suites | Forged tiers/verdicts/ranges, stale/mixed units, outliers, quorum, clamp, and deterministic pricing covered |

## Adversarial vectors

- `claimed_tier: 1` with failed A evidence → no T1/T2 quorum.
- Unknown/uncited/duplicate domain → rejected before aggregation.
- Stale date or hourly/m² price without conversion → rejected.
- More than 40% from T1–T2 median → removed even if registry once marked it trusted.
- Two T1/T2 sources on a high-value range → weak signal, 50/50 retained, inspection required.
- No T1/T2 source → baseline fallback.
- Forged provider verdict `reasonable` → ignored by deterministic verdict.
- Market endpoint beyond 4× baseline → baseline fallback.
- Current Sonnet 5/Opus request with `temperature` in the caller → adapter omits it to avoid provider HTTP 400.

## Verification

- `pnpm test:api`: 121 files passed / 4 skipped; 1,720 tests passed / 75 skipped after the final §40 correction and batch-helper split.
- Focused source evidence/verdict/provider/model-board suites: 35 tests passed.
- API/shared/mobile type-checks: passed. Shared: 17 files / 594 tests; mobile: 20 suites / 126 tests.
- `pnpm dlx deno@2.9.2 check --config supabase/functions/mobile-api/deno.json supabase/functions/mobile-api/index.ts`: passed.
- API build, structure lint, PGlite migration/rollback harness, and staging SQL/RLS/type checks passed.

## Staging evidence / rollout boundary

Staging records `20260710082345_kael_source_trust_tiering` after the durable-guards migration. The migration preserved all 20 existing legacy `tier_1` rows and set `auto_tier=1`; RLS keeps authenticated read compatibility while denying direct insert/update, and generated types expose all nine evidence columns. The exact local Edge graph is deployed as `mobile-api` v117 and its public charter smoke route returned HTTP 200. `KAEL_SOURCE_TRUST_HIGH_VALUE_VND=1000000` is set and fingerprint-verified server-side, implementing Plan DS6's 2-source/3-source boundary without hardcoding VND in source. No live billable provider call ran and production was not mutated.

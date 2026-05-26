# P17 Staging Deploy + Monitoring + A/B Setup

Date: 2026-05-26
Environment: staging `xyylanuyflrjzbjzhqfl`
Production ref: `iwevizmsedyqozxlawwl` not migrated and not deployed
Result: passed, with honest collection status `0/100`

## Scope

P17 completes the Plan.md final phase:

- deploy staging migration and `mobile-api`
- expose monitoring dashboards
- start A/B test #6 for `price_synthesis`
- create the 100-case collection plan and live dashboard state
- prepare production deploy plan behind Tu's manual approval gate

## Staging Deploy

- Migration created with Supabase CLI: `20260526012712_kael_p17_monitoring_ab_setup.sql`.
- Dry-run before push listed only the P17 migration.
- Migration pushed to staging `xyylanuyflrjzbjzhqfl`.
- `mobile-api` redeployed to staging with `functions deploy mobile-api --project-ref xyylanuyflrjzbjzhqfl --no-verify-jwt --use-api`.
- Post-deploy unauth smoke returned expected `401` with `AUTH_MISSING`.
- Final dry-run after push returned `Remote database is up to date`.

## Monitoring Dashboards

Live dashboard views:

- `public.kael_monitoring_provider_daily`
- `public.kael_monitoring_ab_price_synthesis`

Security model:

- Views use `security_invoker = true`.
- Authenticated users get select grants, but underlying RLS/admin policies keep dashboard data admin-only.
- Service role can read dashboard views for staging verification.

Provider dashboard smoke:

```text
2026-05-25 intent_classification deepseek   call_count=4 success=4 failure=0 total_cost_usd=0.000316 p95=920.55ms
2026-05-25 market_lookup         perplexity call_count=4 success=4 failure=0 total_cost_usd=0.000674 p95=3135.10ms
2026-05-25 vision_analysis       anthropic  call_count=4 success=2 failure=2 total_cost_usd=0.000000 p95=5876.85ms
```

## A/B Test #6

Experiment row:

```text
experiment_key=p17-price-synthesis-perplexity-vs-anthropic-2026-05-26
status=running
purpose=price_synthesis
primary_provider=perplexity
comparison_provider=anthropic
fallback_provider=anthropic
sample_target=100
started=true
```

Dashboard state:

```text
sample_target=100
collected_cases=0
completed_cases=0
schema_validation_rate=NULL
price_range_deviation_vs_anthropic=NULL
price_range_deviation_vs_actual=NULL
fallback_rate=NULL
failed_metric_count=0
threshold_decision=collecting
```

Data honesty note:

- No A/B case rows were fabricated to satisfy the gate.
- `0/100` is expected immediately after setup; collection is live and waiting for real staging/live-approved samples.
- Existing runtime logs provider calls under `market_lookup`; the P17 A/B data contract is intentionally separate so `price_synthesis` sample collection can be populated by approved paired-evaluation runs without changing customer-visible pricing in this phase.

## Metrics

Decision thresholds from Plan D28:

- Schema validation rate must be `>= 95%`.
- Price range deviation vs Anthropic must be `<= 25%`.
- Price range deviation vs actual paid must be `<= 30%`.
- Fallback rate must be `<= 10%`.
- If 2 or more metrics fail after 100 completed cases, reject Perplexity and keep Anthropic as main.

## Production Deploy Plan

Production remains a manual gate. After Tu approves:

1. Confirm production ref is `iwevizmsedyqozxlawwl` and staging evidence is still fresh.
2. Run `db push --dry-run` against production and verify only intended P3-P17 migrations are pending.
3. Apply migrations to production.
4. Deploy `mobile-api` to production.
5. Run unauth smoke, authenticated `/services` smoke, provider dashboard smoke, and A/B dashboard smoke.
6. Run `db lint`, performance advisor, security advisor, exact secret sweep, API/shared/mobile type-checks, and targeted schema tests.
7. Keep `auth_leaked_password_protection` documented until it is enabled in Supabase Auth settings.

## Verification

- P17 schema tests passed with P15/P16 schema gates: `3 files`, `147 passed`.
- API `tsc --noEmit` passed.
- Shared `tsc --noEmit` passed.
- `db push --dry-run --linked` passed after final push: remote database up to date.
- `db lint --linked --fail-on error` passed after transient CLI login retry: `No schema errors found`.
- Performance advisor: `No issues found`.
- Security advisor: only existing `auth_leaked_password_protection`.
- Exact Supabase personal access token sweep found no repo matches after P17 docs.

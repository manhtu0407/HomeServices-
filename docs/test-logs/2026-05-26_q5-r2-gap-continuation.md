# Q5 DeepSeek Health And Section 25 R2 Gap Continuation - 2026-05-26

Status: staging verified, production rollout not enabled.
Branch: `codex/kael-gap-continuation`.
Staging ref: `xyylanuyflrjzbjzhqfl`.

## Scope

Follow-up for the remaining honest gaps after the Q4/Q5/R1 batch:

- Q5 DeepSeek provider-health blocker.
- Section 25 R2 Perplexity source-trust config and live Edge smoke.
- Production canary/rollout remains gated by Tu approval and was not changed.

## Code Changes

- `intent_classification` now uses the routed latency budget (`2500ms`) instead of a hardcoded `1000ms` request timeout.
- R2 source-trust config is centralized in `kael/source-trust.ts` with the final 20-domain allowlist, `sonar-pro`, recency `month`, search mode `web`, context size `medium`, max tokens `600`, and source-trust latency budget `6000ms`.
- Edge request context now carries request URL, host, and project ref so staging source-trust activation can be proven without affecting production.
- R2 market lookup fails closed: when trusted Perplexity reports insufficient trusted data or fails validation, Edge uses baseline fallback instead of silently accepting an untrusted Anthropic market fallback.
- `api_logs.safe_metadata` now preserves source-trust metadata even on market failures and outer stage timeouts.

## Staging Evidence

R2 provider smoke with `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED=true` and market cache temporarily disabled:

- run id: `r2-6s-smoke-1779791681924-71b4ed`;
- created job status: `awaiting_customer_confirm`;
- `fallback_used=true` because market data failed closed to baseline;
- market log:
  - purpose `market_lookup`;
  - provider `perplexity`;
  - model `sonar-pro`;
  - latency `3883ms`;
  - success `false`;
  - error `perplexity:insufficient_trusted_data`;
  - safe metadata includes `source_trust_enabled=true`, `source_trust_version=source-trust-r1-1779781564809`, `search_domain_filter_count=20`, `search_recency_filter=month`, `search_mode=web`, `search_context_size=medium`, `latency_budget_ms=6000`;
- DeepSeek intent in same smoke succeeded at `1009ms`;
- cleanup counts: `jobs=0`, `job_events=0`, `job_broadcasts=0`, `api_logs=0`, `notifications=0`, `profiles=0`.

Q5 DeepSeek health rerun with R2 flag restored off and market cache on:

- report: `docs/test-logs/2026-05-26_q5-deepseek-health-rerun.md`;
- baseline key: `q1-1779791748798-a4da4c-staging-50`;
- 50 jobs through Edge;
- 100 provider log rows;
- schema validation rate `1`;
- provider success rate `1`;
- DeepSeek intent: `50/50` success, `0` failures, avg `874ms`, p95 `1050ms`;
- market lookup cache path: `50/50` success, p95 `86ms`;
- cost/job `$0.000076`;
- projected 1000 jobs `$0.08`;
- cleanup counts all `0`.

## Final Remote Flag State

- Staging `KAEL_OPT_MARKET_CACHE_ENABLED=true`.
- Staging `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED=false` after the R2 smoke, so Q5 and normal staging intake are not slowed by the source-trust experimental path.
- Production was not changed in this continuation.

## Remaining Gates

- Section 24 Q5 production canary/rollout/rollback monitoring still needs Tu approval.
- Section 25 R2 is code-complete and live-smoked on staging, but source-trust quality is not production-ready: the strict month-recency allowlist can return `insufficient_trusted_data`.
- Section 25 R4-R8 remain future work: citation validator, trust registry, LS1 weighted blend, user/admin citation surfaces, A/B rollout, and production monitoring.

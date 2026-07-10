# Kael Harness Reliability — Execution Companion

Canonical plan: `governance/Plan.md` §41. This document records implementation evidence; it does not override governance or the locked decisions D-A through D-G.

## Invariants

- Production mobile AI remains `Expo -> mobile-api Edge -> server-side providers`; no provider key or AI call moves to the client.
- `synthesizePrice` and the LIVE deterministic pricing path are out of scope and must remain byte-untouched.
- Existing `AIResponse.usage.inputTokens`, `outputTokens`, and `costUsd` remain backward compatible.
- Durable guards remain fail-open; the AI kill switch and spend gate remain fail-closed where already specified.

## P2 — Cost truth per model / §40 M0

Status: complete; `kael-review` passed.

Verified on: 2026-07-10.

| Provider | Model ID | Input USD/MTok | Output USD/MTok | Cache/request detail |
|---|---:|---:|---:|---|
| Anthropic | `claude-sonnet-4-6` | 3 | 15 | 5m write 1.25x; read 0.1x |
| Anthropic | `claude-sonnet-5` through 2026-08-31 | 2 | 10 | 5m write 1.25x; read 0.1x |
| Anthropic | `claude-sonnet-5` from 2026-09-01 | 3 | 15 | effective-date switch in registry |
| Anthropic | `claude-opus-4-8` | 5 | 25 | 5m write 1.25x; read 0.1x |
| Anthropic | `claude-haiku-4-5-20251001` | 1 | 5 | 5m write 1.25x; read 0.1x |
| DeepSeek | `deepseek-v4-flash` | 0.14 miss / 0.0028 hit | 0.28 | reads hit/miss token fields |
| DeepSeek | `deepseek-v4-pro` | 0.435 miss / 0.003625 hit | 0.87 | reads hit/miss token fields |
| Perplexity | `sonar` | 1 | 1 | request: low 0.005 / medium 0.008 / high 0.012 |
| Perplexity | `sonar-pro` | 3 | 15 | request: low 0.006 / medium 0.010 / high 0.014 |

Official sources:

- Anthropic model IDs: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic model/cache pricing: https://platform.claude.com/docs/en/about-claude/pricing
- DeepSeek model/cache pricing: https://api-docs.deepseek.com/quick_start/pricing/
- DeepSeek cache usage fields: https://api-docs.deepseek.com/guides/kv_cache/
- Perplexity token/request pricing: https://docs.perplexity.ai/docs/getting-started/pricing
- Perplexity provider-reported cost shape: https://docs.perplexity.ai/api-reference/sonar-post
- Hosted Edge detection for production-safe fallback: https://supabase.com/docs/guides/functions/secrets

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `supabase/functions/mobile-api/_shared/kael/model-pricing.ts` | Canonical registry, effective periods, cost and pre-call estimate helpers, unknown-model policy | All current and §40-planned models covered; dev/test throws; production uses max-known safe-high fallback |
| `supabase/functions/mobile-api/_shared/kael/provider-client.ts` | Replace inline provider formulas; parse provider usage; reserve at least model estimate | Perplexity request fee included; provider total preferred; reserve occurs before fetch; no routing change |
| `supabase/functions/mobile-api/_shared/kael/cost-tracking.ts` | Delegate analytics estimate to canonical registry | No duplicate pricing formula |
| `supabase/functions/mobile-api/_shared/kael/types.ts` | Add optional cache/provider-cost usage fields | Existing required response fields unchanged |
| `apps/api/src/__tests__/unit/mobile-api-kael-model-pricing.test.ts` | Table, schedule, cache, unknown model, reserve/finalize tests | R-G3 and P2.2 accounting wiring covered |

### Test log

- Baseline before P2 edit: 3 files / 33 tests passed.
- TDD red: pricing module missing.
- Focused green: 4 files / 50 tests passed.
- `pnpm type-check:api`: passed.
- Deno check with `supabase/functions/mobile-api/deno.json`: passed.
- `pnpm lint:structure`: passed (14 existing grandfathered oversize files).
- Full API: 110 files passed / 4 skipped; 1,654 tests passed / 75 skipped.
- Full shared: 17 files / 594 tests passed.
- `pnpm build:api`: passed (Next.js 16.2.6 production build, 14 pages).
- `pnpm lint:structure`: passed (446 source files; 14 existing grandfathered oversize files).
- `git diff --check`: passed; line-ending warnings only.
- `pnpm lint:comments`: remains red with the same 55 pre-existing violations in 41 files; no P2 file introduced a new violation.

### Risks / not yet verified

- Provider prices are time-sensitive; the registry records its verification date and official URLs but still needs deliberate review when a model is added or a provider changes pricing.
- No live billable provider request was made. Provider response shapes are verified against official docs and mocked contract tests only.
- §40 M0 is satisfied by this registry and its coverage tests; later §40 work must consume `resolveModelPrice` rather than duplicate pricing math.

## §40 M1 — Model roster and escalation metadata

Status: complete locally; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `kael/routing.config.ts` | Add an explicit `escalation` route and trigger alongside the pre-existing failover `fallback` | Existing fallback candidate selection keeps its behavior; M2 can consume escalation metadata without overloading a transport failure route |
| `kael/routing.config.ts`, `kael/cron/process-learning-queue.ts` | Move Anthropic defaults from Sonnet 4.6 to Sonnet 5; use Haiku 4.5 for clarification, advisory, and educational failover; run DeepSeek V4 Pro for standard offline post-job learning | Every selected model resolves in M0. DeepSeek uses the existing queue/audit tables plus the structured Edge choke point; only direct provider/schema failures fall back to the Sonnet 5 Anthropic Message Batch path, which retains kill-switch, circuit, spend reservation/finalization, timeout, and bounded-retry guards |
| `kael/routing.config.ts` | Set Vision Sonnet 5 -> Opus 4.8, market Sonar -> Sonar Pro, and high-stakes scope change Sonnet 5 -> Opus 4.8 escalation metadata | DM2–DM5 roster is explicit; low-confidence trigger reuses the existing server autonomy confidence floor of `0.82` rather than inventing a second policy value |
| `mobile-api-kael-p3.test.ts` and existing Edge/Q2 tests | Pin the roster and update only assertions affected by the Sonnet 5 selection | Expected model telemetry and configured fallback match the runtime config |

### AI boundary

- Provider routing: Edge-only through the existing `callAI` / `callStructuredAI` boundary; no new provider, SDK, secret, or client call.
- Prompt/version and structured schemas: unchanged.
- Fallback: unchanged. `fallback` remains transport/circuit failover; DeepSeek post-job direct failures retain their pending queue row before submission to the Sonnet 5 Anthropic batch fallback.
- Sonnet 5 Message Batch omits unsupported sampling parameters, applies the official 50% batch token discount, reserves spend before submission, reconciles actual usage on completion, and cannot bypass the kill switch or durable circuit.
- Cost tracking: all selected IDs are already resolved by the canonical M0 registry before a request can be sent.

### Test log

- Official ID verification: Anthropic model IDs, DeepSeek V4 model list, and Perplexity Sonar Pro docs were rechecked on 2026-07-10.
- TDD red: one new M1 roster assertion failed because Vision still used `claude-sonnet-4-6` and had no escalation metadata.
- TDD red: the former Anthropic-only learning batch test could not submit a DeepSeek V4 Pro route; it passed after the provider-group path and Sonnet 5 fallback were wired.
- Focused green: routing suite 16/16; DeepSeek learning queue 14/14; provider adapter 4/4; routing and source-trust suites remain green.
- DeepSeek V4 Pro request assertions cover its official chat-completions path, JSON schema validation, high thinking effort, spend reservation/finalization, safe audit metadata, no raw malformed provider content persisted, and no kill-switch/spend-cap bypass through the Anthropic batch fallback.
- Final local API gate: 116 files passed / 4 skipped; 1,695 tests passed / 75 skipped. `pnpm build:api` and `pnpm lint:structure` passed.
- `pnpm type-check:api`: passed.
- `pnpm build:api`: passed (Next.js 16.2.6 production build, 14 pages).
- `pnpm lint:structure`: passed (449 source files; 14 existing grandfathered oversize files, 122 grandfathered duplicate-type groups).

### Risks / not yet verified

- DeepSeek's documented path is chat-completions rather than a documented batch endpoint. The implementation therefore groups bounded direct structured calls under the existing durable queue/audit lifecycle and reserves the Anthropic Message Batch API for its configured fallback; no raw provider content is retained in the direct audit payload.
- `claude-sonnet-4-6` remains only in the price registry for backward-compatible historical cost resolution, not as a selected production Edge route.
- This workstation has no `deno` executable on `PATH`, so a targeted Edge Deno check remains outstanding.
- No live billable provider request was made; tests use deterministic mocks and official provider documentation.

## §40 M2 — Escalation mechanism

Status: complete locally; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `kael/escalation.ts` | Select an escalation only after a successful configured primary route and log a safe purpose/provider/model/reason event | Escalation stays distinct from transport fallback and retains the existing `callStructuredAI`/spend/circuit/kill-switch choke point |
| `kael/vision.ts` | Re-run a `large` complexity vision result from Sonnet 5 through Opus 4.8; retain the successful Sonnet result if Opus is unavailable | Vision never uses Haiku or DeepSeek and a hard image really invokes Opus |
| `kael/market.ts`, `kael/source-trust.ts` | Start trusted and standard market lookup on Sonar; escalate low confidence below 0.82 to Sonar Pro | Source-trust no longer bypasses the roster by making Sonar Pro primary; both provider calls retain the same search restriction and validation path |
| `kael/scope-change.ts`, `workspace.env.example` | Escalate low-confidence scope review/estimate or a configured server-only high-stakes amount to Opus | No VND amount is hardcoded. `KAEL_SCOPE_CHANGE_ESCALATION_VND` is unset by default, so high-stakes escalation is opt-in until configured server-side |
| `services/scope-change.service.ts` | Persist every safe scope-change provider trace rather than only the final selected model | Sonnet 5 and Opus costs/latencies are individually auditable when an escalation occurs; the escalation reason is safe metadata only |

### Test log

- TDD red: the new escalation suite failed before the selector existed.
- `pnpm test:api -- escalation`: 3/3 passed (primary-only negative cases and high-stakes Sonnet 5 -> Opus request/trace).
- `pnpm test:api -- vision-language`: 2/2 passed (hard vision invokes Sonnet 5 then Opus 4.8).
- `pnpm test:api -- q2-q3`: 20/20 passed (low-confidence Sonar -> Sonar Pro and source-trust primary Sonar).
- `pnpm test:api -- structured-call`: 7/7 passed; all live structured routes remain through the shared schema/breaker boundary.
- `pnpm type-check:api`: passed.
- Final local API gate: 116 files passed / 4 skipped; 1,695 tests passed / 75 skipped. `pnpm build:api` and `pnpm lint:structure` passed.

### Risks / not yet verified

- No live billable provider request was made. A staged provider smoke should confirm account access and the DeepSeek V4 Pro thinking response shape before enabling the batch-learning flag in production.
- `KAEL_SCOPE_CHANGE_ESCALATION_VND` must be configured only in the Edge/server secret environment to enable the high-stakes amount trigger; low-confidence escalation works without it.
- This workstation has no `deno` executable on `PATH`, so a targeted Edge Deno check remains outstanding.
- `pnpm lint:comments` remains red with the documented baseline of 55 violations in 41 pre-existing files; none of this M1/M2 slice's files is reported.

## §40 S0 — Locked 50/50 deterministic blend

Status: complete locally; `kael-review` passed.

### Changed

- `synthesizePrice()` in the production Edge runtime now uses an explicit 50/50 market/baseline weight. The Next reference/parity implementation has the same named weight.
- Baseline-only behavior, market confidence, complexity multiplier, VND rounding, and the deterministic pricing boundary are unchanged.
- The new Edge regression locks a medium-complexity example to 150,000–300,000 VND, and the reference test no longer encodes the obsolete 60/40 result.
- Historical audit documents retain their original 60/40 observations; this companion document and the active implementations are the current decision record.

### Verification / risks

- TDD red: both Edge and reference synthesis returned 160,000–320,000 before the change.
- Focused synthesis 1/1 and reference pricing 23/23 passed; final API suite after S0–S2: 119 files passed / 4 skipped; 1,701 tests passed / 75 skipped.
- `pnpm build:api`, API/shared type-check, and structure lint passed. LIVE pricing remains deterministic and receives only validated market data, never raw LLM price text.

## §40 S1 — Source-trust schema and compatibility remap

Status: complete locally; remote apply intentionally not performed.

### Changed

- Added `20260710082345_kael_source_trust_tiering.sql` with A–G `criteria_met`, evidence fields, and non-null `auto_tier` 1–5 while retaining the legacy `tier` column and current RLS/grants.
- Migration maps `tier_1/tier_2/tier_3/blocked` to `1/2/3/5`; no legacy row or caller contract is removed. Generated shared database types now include the new fields.

### Verification / risks

- Source-tier migration schema test 2/2, API/shared type-check, full API suite, structure lint, and diff check passed.
- `supabase db lint --local` could not connect because local Postgres on `127.0.0.1:54322` is unavailable. No staging or production migration was applied.

## §40 S2 — Deterministic T1–T5 source rulebook

Status: complete locally; `kael-review` passed.

### Changed

- Added a pure rulebook that maps server-side evidence to T1–T5 and maps results back to the legacy tier vocabulary for compatibility.
- Unknown/listing/blocked sources quarantine at T5; T1/T2/T3 require their documented evidence; known but insufficient sources become T4. Overdue review and suspicious price jumps degrade a source before it can influence a price.
- The classifier accepts no claimed tier field, so an LLM-supplied `claimedTier: 1` cannot elevate a quarantined source.

### Verification / risks

- TDD red: rulebook module absent. Focused decision-table and LLM-claim regression 3/3 passed.
- The pure rulebook is ready for S3’s per-source evidence pipeline; no provider output is yet treated as a source classification or money authority.

## §40 S3 — Per-source evidence and deterministic aggregation

Status: complete locally; `kael-review` passed.

### Changed

- Trusted Perplexity calls now require source-only evidence: `{domain, price_min, price_max, unit, date}`. The response schema rejects a trusted blended market range, and the Edge computes the final market range itself.
- The production price path accepts only `per_visit` evidence because no job-scope conversion exists for hourly or square-metre prices. It rejects unsupported/mixed units, stale evidence older than 24 calendar months, duplicate source domains, uncited domains, and values more than 40% from the T1–T2 median.
- `validateCitations()` remains the single citation-validator path. Its additive options now load `auto_tier`, accept T1–T4 only where requested, and raise its existing quorum from two to three T1–T2 domains when the deterministic market range reaches `KAEL_SOURCE_TRUST_HIGH_VALUE_VND`.
- Weighted aggregation is deterministic: T1=1.0; T2=1.0 for HCMC/materials and 0.7 otherwise; T3=0.3; T4=0.1; T5 cannot enter. T1–T2 still must satisfy the post-filter quorum, so lower tiers cannot set a price by themselves.
- The final trusted market artifact records safe accepted-source evidence (domain/range/unit/date/tier/weight) and rejection reasons. Raw provider content, LLM tier claims, and source summaries do not determine the final price.

### Verification / risks

- TDD red: the per-source aggregation module did not exist; source-only trusted payloads failed the previous range-only schema and prompt assertion.
- Focused Edge/unit tests: 25/25 passed. They cover per-source request/response wiring, citation quorum escalation, >40% outlier removal, stale evidence, mixed units, insufficient high-value quorum, and rejection of a model-supplied blended range.
- Full API after S3: 120 files passed / 4 skipped; 1,706 tests passed / 75 skipped. API/shared type-check, shared suite 17 files / 594 tests, API production build, and structure lint passed.
- `KAEL_SOURCE_TRUST_HIGH_VALUE_VND` is server-only and intentionally blank in the checked-in example. If source-trust is enabled without it, trusted market lookup fails closed to the existing deterministic baseline path; set the approved deployment value before enabling the flag.
- This workstation has no `deno` executable on `PATH`; no direct Edge Deno check was run. No live provider call or remote database change was made.

## §40 S4 — Deterministic market verdict and inspection handoff

Status: complete locally; `kael-review` passed.

### Changed

- Added five deterministic verdict gates for source-trust market evidence: baseline band, a common `per_visit` unit, source agreement, source freshness, and reasonable market width. A source-less, stale, or mixed-unit result rejects the market; a baseline/spread/width concern remains suspicious.
- S4 runs only after a source-trust market success, leaving the legacy market path unchanged. LLM verdict claims are not an input to the evaluator.
- A suspicious signal keeps the locked 50/50 blend, expands the resulting deterministic band by 15%, caps numeric confidence at 0.44, and marks `needs_inspection`. A rejected signal falls back to the baseline and remains inspection-required.
- Both job creation and Kael chat pass the deterministic inspection reason to Estimate Card v3's existing `kael_reasoning`/inspection slots. Raw Perplexity prose is not surfaced or trusted.

### Verification / risks

- TDD red: market-verdict module and inspection-band synthesis behavior did not exist.
- Focused market evidence/verdict/synthesis suite: 30/30 passed, including stale evidence despite a forged provider verdict.
- Full API after S4: 121 files passed / 4 skipped; 1,710 tests passed / 75 skipped. API/shared type-check, shared suite 17 files / 594 tests, API production build, structure lint, and diff check passed.
- The verdict factors are deterministic safety bands, not a replacement for S5's market clamp. No provider call, mobile change, or remote database operation was made.

## §40 S5 — Market clamp

Status: complete locally; `kael-review` passed.

### Changed

- Added the same endpoint-by-endpoint 4× baseline band used by the existing learned-price defense to the LIVE market input in `synthesizePrice()`.
- A market range outside the band is discarded before any blend arithmetic. Synthesis returns the deterministic baseline path and emits a safe alert with the factor only; a valid correction at exactly 4× remains eligible for the locked 50/50 blend.

### Verification / risks

- TDD red: the market clamp export did not exist and pathological market data still changed the LIVE estimate.
- Focused source evidence/verdict/synthesis suite: 32/32 passed. It pins both the allowed 4× correction and the >4× fallback-to-baseline behavior.
- The 4× factor is a relative deterministic guard, not a VND threshold. No provider request, mobile change, or remote database operation was made.

## §40 S6 — Workstream S verification

Status: complete locally; `kael-review` passed.

### Verification / limitations

- Full API: 121 files passed / 4 skipped; 1,713 tests passed / 75 skipped. Shared: 17 files / 594 tests passed. API/shared type-check, API production build, structure lint, and `git diff --check` passed.
- Adversarial coverage now rejects or prevents influence from forged blended ranges, unknown/uncited domains, duplicate domains, stale evidence, mixed units, >40% outliers, insufficient high-value quorum, forged LLM verdicts, and >4× market ranges. Valid 50/50 and valid 4× market-correction cases remain green.
- `pnpm lint:comments` is red only for the existing baseline: 55 violations in 41 pre-existing files; none of the S3–S5 files appears in the report.
- Edge Deno 2.9.2 check passed. No live billable provider call, production apply, commit, push, or PR was performed.

## P1 — Durable breaker and rate limit

Status: complete, deployed, and activated on staging; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `supabase/migrations/20260710082120_kael_durable_guards.sql` | Add `kael_provider_circuit`, `kael_rate_counter`, two-level circuit RPCs, and atomic multi-bucket `rate_take` | Provider-global 402/429; purpose-provider schema/timeout/server; original thresholds retained; RLS and grants are service-role only |
| `supabase/functions/mobile-api/_shared/kael/durable-guards.ts` | Add timeout-bounded, fail-open Edge adapters | Missing/error/timeout/unparsed RPC results never become a Kael outage and logs contain only guard/error codes |
| `supabase/functions/mobile-api/_shared/kael/provider-client.ts` | Select durable guards behind `KAEL_DURABLE_GUARDS_ENABLED` | Flag OFF retains the existing rollback path; flag ON checks before fetch and records success/failure without changing routing, spend gate, or kill switch |
| `supabase/functions/mobile-api/_shared/services/kael-chat.service.ts` and `worker-kael-chat.service.ts` | Route customer and worker chat through the generic durable token buckets when enabled | Exact 5/minute and 20/hour limits; durable-path RPC errors fail open; old behavior remains available when disabled |
| `supabase/tests/kael_durable_guards_verification.sql` | Rollback-only SQL behavior/security harness | Circuit threshold/cross-purpose/reset, rate limit/no partial consume, and direct-client denial execute against PostgreSQL |
| `packages/shared/src/types/database.types.ts` | Synchronize the new tables/functions contract | API type-check and Tier-1 completeness tests cover all four RPCs pending regeneration from an applied database |

### Test log

- TDD baseline: 5 relevant files / 165 tests passed before P1 edits.
- TDD red: durable module, migration, rollout flag, and generated function contracts were absent; the Perplexity open-circuit fallback returned early instead of continuing.
- Focused green: 7 files / 303 tests passed.
- PGlite 0.3.14 compiled the migration and executed the rollback-only SQL harness: 8 statements passed.
- PGlite behavior evidence: provider rate-limit threshold `[false,false,true]`; provider-global cross-purpose open `true`; purpose isolation `true`; minute results `[true,true,true,true,true,false]`; 20 hourly calls allowed; blocked minute call left 15 hourly tokens; authenticated access denied and service-role execute granted.
- Local in-process PGlite latency, 50 sequential samples: `is_circuit_open` p50 0.501 ms / p95 0.879 ms; `rate_take` p50 0.877 ms / p95 1.364 ms. These numbers exclude network and hosted Supabase latency.
- `pnpm type-check:api`: passed.
- Deno 2.9.2 check with `supabase/functions/mobile-api/deno.json`: passed.
- Full API: 112 files passed / 4 skipped; 1,670 tests passed / 75 skipped.
- Full shared: 17 files / 594 tests passed.
- `pnpm build:api`: passed (Next.js 16.2.6 production build, 14 pages).
- `pnpm lint:structure`: passed (447 source files; 14 existing grandfathered oversize files, 122 grandfathered duplicate-type groups).
- `git diff --check`: passed; line-ending warnings only.
- `pnpm lint:comments`: remains red with the same 55 pre-existing violations in 41 files; no P1 file introduced a reported violation.

### Staging verification / remaining risk

- Staging `xyylanuyflrjzbjzhqfl` records `20260710082120_kael_durable_guards`; local filename was synchronized to the connector-assigned migration version.
- The rollback-only hosted SQL harness passed circuit threshold/cross-purpose/reset, minute/hour atomicity with no partial consume, and authenticated denial/service-role execution.
- A committed session A opened a provider-global circuit; a separate session B read it through a different purpose as open. Cleanup confirmed zero verification rows remained.
- Both durable tables have RLS enabled; `authenticated` has no table read or RPC execution, while `service_role` does. Generated staging types include both tables and all four durable RPCs.
- Hosted Edge v117 is active and serves the public charter smoke route. `KAEL_DURABLE_GUARDS_ENABLED=true` is present on staging; the local PGlite DB-execution figures still do not claim durable-RPC round-trip latency on a live provider call.
- Production was untouched.

## P3 — Output-health breaker

Status: complete locally; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `supabase/functions/mobile-api/_shared/kael/structured-call.ts` | Centralize provider call, balanced JSON parse, schema validation, and circuit completion | Valid output records success; invalid output records `schema` failure; transport errors remain owned by `callAI`; no raw output is logged |
| `supabase/functions/mobile-api/_shared/kael/provider-client.ts` | Allow circuit success to be deferred until structured validation finishes | HTTP 200 with invalid JSON cannot erase the preceding schema-failure count |
| `intent.ts`, `vision.ts`, `market.ts`, `scope-change.ts`, `worker-assist.ts`, `customer-assistant.ts`, `price-synthesis-ab.ts` | Migrate all nine live structured invocations across eight caller paths | No caller retains inline `safeParseJSON`/`parseJsonObject`; prior fallback strings, cost/latency metadata, traces, and provider loops remain covered |
| `apps/api/src/__tests__/unit/mobile-api-kael-structured-call.test.ts` | Pin durable threshold, fallback routing, fail-open behavior, sentinel handling, caller inventory, and fallback parity | One schema failure stays closed; third opens; fourth is blocked before fetch; intent falls through to Anthropic; expected market sentinel is not counted as malformed |
| `kael/cron/process-batch-results.ts`, `batch-learning-candidate.ts`, `batch-result-guards.ts` | Feed asynchronous Sonnet 5 Message Batch schema results into the same breaker and reconcile actual batch spend | Invalid completed output records `schema`; valid output clears; no raw output is logged; batch parsing/spend/health stay outside the queue god-file |

### Caller inventory

- Intent classification: two calls (`classifyIntent`, `diagnoseIntake`).
- Vision analysis: one call; the Vietnamese-diacritics output rule is part of its structured schema and retains the existing Vietnamese-specific fallback reason.
- Market lookup: one call; `{"error":"insufficient_trusted_data"}` remains a valid domain sentinel and does not feed the schema breaker; reversed ranges do.
- Scope change: review and estimate calls.
- Worker assist and customer assistant: one provider-loop call each, including their test injection seam.
- Price synthesis A/B: one shadow-evaluation call. Deterministic LIVE synthesis remains untouched.
- Post-job learning: direct DeepSeek V4 Pro uses `callStructuredAI`; asynchronous Sonnet 5 Message Batch completion explicitly records the same schema health after retrieval.

### Test log

- Baseline before P3 edits: 7 caller files / 67 tests passed.
- TDD red: `structured-call.ts` absent; after the wrapper existed but before intent migration, the persistent-bad-model test still fetched DeepSeek four times instead of three.
- Focused green: 9 files / 81 tests passed; dedicated P3 suite 7/7.
- `pnpm type-check:api`: passed.
- Deno 2.9.2 check with `supabase/functions/mobile-api/deno.json`: passed.
- Full API: 113 files passed / 4 skipped; 1,677 tests passed / 75 skipped.
- Full shared: 17 files / 594 tests passed.
- `pnpm build:api`: passed (Next.js 16.2.6 production build, 14 pages).
- `pnpm lint:structure`: passed (448 source files; 14 existing grandfathered oversize files, 122 grandfathered duplicate-type groups).
- `git diff --check`: passed; line-ending warnings only.
- `pnpm lint:comments`: remains red with the same 55 pre-existing violations in 41 files; no P3 file introduced a reported violation.

### Risks / not yet verified

- The durable schema store and cross-session behavior are staging-verified, and Edge `mobile-api` v117 is active. No live billable model was intentionally made to return malformed output; provider response/fallback parity uses deterministic mocks.
- `KAEL_DURABLE_GUARDS_ENABLED=true` was set and fingerprint-verified on staging after CLI re-authentication. No live billable model was intentionally made to return malformed output, so output-health fallback parity remains mock-verified rather than an induced-production-error test.

## W2 — Permission confidence and topic provenance

Status: complete locally; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `permission-gate.ts` | Require `intentConfidence`, `topicSource`, and `boundarySignal`; define the server-only confidence configuration and sensitive-topic confirmation rule | An LLM-sourced topic fails closed to clarification when confidence is invalid, below the configured threshold, or configuration is absent; no numeric fallback threshold is embedded in code |
| `canonicalize-vn.ts` via `hasKaelForbiddenTopicBoundarySignal` | Reuse canonical Vietnamese matching for sensitive boundary evidence | Accented and unaccented legal signals produce the same decision; only boolean provenance reaches audits, never the source text |
| `customer-assistant.ts`, `worker-assist.ts` | Mark existing regex classifiers as `deterministic_rule` at confidence `1` and attach an independent boundary signal | Current deterministic behavior stays compatible; legal advice is redirected before provider invocation |
| `services/*`, `rate-limit.ts`, `autonomy-gate.ts` | Carry explicit deterministic provenance for policy decisions, rate-limit decisions, and replayed historical autonomy audits | Money/status paths keep existing authority; historical audit rows normalize to deterministic provenance rather than silently changing outcome |
| `workspace.env.example` | Document `KAEL_PERMISSION_CONFIDENCE_THRESHOLD` as server-only rollout configuration | No mobile public env or provider secret added |
| W2 tests in P5, customer assistant, and autonomy suites | Pin clarification, DB short-circuit, canonical VN, chat redirect, audit provenance, and autonomy blocking | No LLM label alone can unlock a sensitive topic or autonomy decision |

### Test log

- TDD red: a low-confidence LLM label was accepted by the pre-W2 permission gate.
- Focused green: P5 permission, customer-chat, and autonomy suites: 25/25 tests passed.
- Full API: 113 files passed / 4 skipped; 1,682 tests passed / 75 skipped.
- `pnpm type-check:api`: passed.
- `pnpm build:api`: passed (Next.js 16.2.6 production build, 14 pages).
- `pnpm lint:structure`: passed (448 source files; 14 existing grandfathered oversize files, 122 grandfathered duplicate-type groups).
- `git diff --check`: passed; line-ending warnings only.

### Risks / not yet verified

- This workstation has no `deno` executable on `PATH`, so the targeted Edge Deno check could not run for W2. API TypeScript and Vitest compile the shared modules, but this is not a substitute for a real Deno check.
- The confidence threshold is deliberately unconfigured by default. That only denies future `llm` topic sources; all existing paths declare deterministic provenance and retain their prior policy outcome.
- No provider call, mobile client call, secret, routing rule, or deterministic LIVE pricing behavior changed.

## W3 — Quarantine dormant L1-L6 context memory

Status: complete locally; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `kael/index.ts` | Stop re-exporting `memory.ts` from the production Kael barrel | The six-layer context engine is no longer evaluated through the production Edge import graph |
| `kael/memory.ts` | Mark the retained L1-L6 experiment as quarantined, test-only reference code | The file explicitly says it is not production runtime and must not be wired without a real continuity feature |
| `mobile-api-edge-schema.test.ts` | Replace the obsolete "memory is in the barrel" assertion with a quarantine/import-graph assertion | The test proves the context engine is absent from the barrel while the sanitizer and self-memory routes remain live |

The live `/me/kael-memory` and `/workers/me/kael-memory` APIs are intentionally unchanged. They provide authenticated self-view/edit/delete of persisted preferences and use the sanitizer; they do not invoke `KaelMemory.getContext` or put L1-L6 context into prompts.

### Test log

- TDD red: schema assertion showed `kael/index.ts` still exported the L1-L6 module.
- Focused green: schema, P6 memory, and Edge runtime suites: 202/202 tests passed.

### Risks / not yet verified

- The quarantined code and its direct P6 unit tests remain in the repository as a future reference. A future continuity feature must explicitly review RLS, audit actor identity, PII/token budget, and prompt wiring before reactivation.
- No migration, memory data deletion, route removal, or mobile-client change was made.

## W5 — Thin ProviderAdapter boundary

Status: complete locally; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `kael/provider-adapter.ts` | Add exactly three provider adapters (Anthropic, DeepSeek, Perplexity) with capabilities, request construction, response parsing, model-registry cost calculation, and circuit failure classification | Adding a later provider has one explicit adapter seam; no provider was added in this slice |
| `kael/provider-client.ts` | Keep `callAI` as the only network/cost/circuit choke point and delegate just transport request/response/failure differences | Existing endpoint, headers, body fields, timeout/retry, reservation/finalization, safe logs, and fallback behavior remain in place |
| `kael/types.ts` | Make `ProviderRequestSpec` transport-only; parsing belongs to the adapter contract | There is one response parser per provider adapter rather than a parser closure hidden in a request object |
| `circuit-breaker.ts`, `durable-guards.ts` | Permit a provider adapter to supply the existing circuit kind while retaining the pre-existing error-code classifier as fallback | Existing schema and non-adapter failure callers retain identical classification behavior |
| `mobile-api-kael-provider-adapter.test.ts` | Pin provider inventory, capabilities, request shapes, model-registry response cost, and failure classes | Anthropic, DeepSeek, and Perplexity behavior remains separately covered without a live provider call |

### AI boundary

- Provider routing: unchanged; only the existing three server-side providers are represented.
- Prompt/version and structured schemas: unchanged; all caller paths still use `callAI`/`callStructuredAI` and their existing validation/output gateway.
- Fallback, timeout/retry, circuit, and spend reservation/finalization: still owned by `callAI`.
- Cost tracking: each adapter calls the shared §40 model-price registry; deterministic LIVE price synthesis was not imported or modified.

### Test log

- TDD red: provider adapter module did not exist.
- Focused green: adapter, model-pricing, and durable-guard suites: 29/29 tests passed.
- Full API: 114 files passed / 4 skipped; 1,686 tests passed / 75 skipped.
- `pnpm type-check:api`: passed.
- `pnpm build:api`: passed (Next.js 16.2.6 production build, 14 pages).
- `pnpm lint:structure`: passed (449 source files; 14 existing grandfathered oversize files, 122 grandfathered duplicate-type groups).
- `git diff --check`: passed; line-ending warnings only.

### Risks / not yet verified

- No live billable provider request was made; endpoint/payload, parsing, cost, and failure behavior are regression-tested with deterministic mocks.
- This workstation has no `deno` executable on `PATH`, so a targeted Edge Deno check remains outstanding.
- Comment discipline remains red only on the baseline 55 violations in 41 pre-existing files; this slice introduced no listed violation.

## W4 — Explicit orchestrator stage status

Status: complete locally; `kael-review` passed.

Verified on: 2026-07-10.

### Files / Action / Acceptance

| File | Action | Acceptance |
|---|---|---|
| `kael/orchestrator.ts` | Replace ambiguous stage `success` with `status: ok | declined | degraded | failed` | Permission declines, guardrail substitutions, fallback results, and hard errors are distinguishable without changing `value`, `fallbackUsed`, or `failureReason` semantics |
| `kael/pipeline.ts` | Change the only stage-level boolean branch to read `baselineStage.status` | The existing inner intent/vision/market result `.success` logic remains untouched, so pipeline output behavior is unchanged |
| `kael/orchestrator-facade.ts` | Preserve legacy `stage_success` telemetry as `status === ok`; add `stage_status` | Existing consumers keep the boolean while new consumers can distinguish degradation |
| W4 and existing orchestrator tests | Pin all four statuses and update timeout, policy-decline, self-check, and facade expectations | A caller can identify `degraded` instead of treating it as a normal success |

### Test log

- TDD red: a completed stage returned no `status` field.
- Focused green: orchestrator-status, P3, P5, P8, and façade suites: 40/40 tests passed.
- Full API: 115 files passed / 4 skipped; 1,687 tests passed / 75 skipped.
- `pnpm type-check:api`: passed.
- `pnpm build:api`: passed (Next.js 16.2.6 production build, 14 pages).
- `pnpm lint:structure`: passed (449 source files; 14 existing grandfathered oversize files, 122 grandfathered duplicate-type groups).
- `git diff --check`: passed; line-ending warnings only.

### Risks / not yet verified

- `KaelStageRunResult.success` is intentionally removed in favor of the explicit status union. The current repository has no remaining stage-result caller; façade telemetry retains `stage_success` for compatibility.
- This workstation has no `deno` executable on `PATH`, so the targeted Edge Deno check remains outstanding.

## Final PR #100 completion audit — 2026-07-10

The per-slice logs above preserve what was known when each slice closed. This section is the current aggregate truth and supersedes their temporary Deno/source-trust limitations.

### Final corrections

- Deno 2.9.2 was run through the package runtime with the Edge `deno.json`; the entire `mobile-api/index.ts` graph passes `deno check`.
- The §40 A–G rulebook now runs on the trusted market path. Perplexity must return A–G signals per source, an unknown `claimed_tier` is stripped, and the deterministic rulebook computes the effective tier used for quorum and weight.
- A non-zero T1–T2 set below quorum now follows DS2/DS6: it remains a weak market signal, keeps the 50/50 blend, widens the deterministic band, lowers confidence, and requires inspection. Zero T1–T2 sources still fail closed.
- Estimate Card v3 receives a deterministic Vietnamese source-count/tier summary, not raw Perplexity reasoning.
- Sonnet 5 and Opus 4.8 requests omit unsupported sampling parameters; otherwise the provider would return HTTP 400 despite the correct model ID.
- The exact §40 and §42 companion documents required by Plan now exist at `kael-source-trust-pricing-20260707.md` and `kael-harness-hardening-20260708.md`.

### Current verification

- Full API: 121 files passed / 4 skipped; 1,720 tests passed / 75 skipped.
- Full shared: 17 files / 594 tests passed. Full mobile: 20 suites / 126 tests passed.
- API/shared/mobile type-checks passed; API production build passed with 14 pages.
- Edge Deno 2.9.2 full-graph check passed.
- Structure ratchet passed with 455 source files, 14 existing grandfathered oversize files, and 122 existing duplicate-type groups. The new batch result guards/parser were split out after the ratchet caught growth in `process-batch-results.ts`; the owner file is now 980 lines.
- `pnpm lint:comments` remains red at the unchanged baseline: 55 violations in 41 pre-existing files; no new §40–§42 file appears in the report.

### Staging completion evidence

- Applied and recorded on staging: `20260710082120_kael_durable_guards` then `20260710082345_kael_source_trust_tiering`; local filenames match remote history.
- Hosted rollback harness passed all six durable assertions. A committed session A opened a provider circuit and a separate session B observed it; cleanup left zero verification rows.
- RLS/grants match the contracts. The source-trust remap preserved all 20 existing `tier_1` rows as `auto_tier=1`, and generated staging types match the new table/RPC/column surface.
- Security advisor found no migration-specific issue. The project still has the unrelated Auth warning that leaked-password protection is disabled; new indexes report expected unused-index INFO before traffic.
- Pre-existing migration history still names the hosted voice-transcript migration `20260706154350` while the local file is `20260706120000`; this predates PR #100 and was not repaired or rewritten in this scope. The two PR #100 filenames do match their hosted versions.
- Deployed the exact local 127-file Edge graph as `mobile-api` v117 with the existing `verify_jwt=false` setting. `/kael/charter` returned HTTP 200; logs recorded 84 v117 requests, all 2xx, no startup/import error, and p95 execution time 777 ms across the current log window.
- `KAEL_DURABLE_GUARDS_ENABLED=true` and `KAEL_SOURCE_TRUST_HIGH_VALUE_VND=1000000` were set and fingerprint-verified through the re-authenticated staging CLI. The public Edge smoke route remains HTTP 200. No live billable provider call, production mutation, commit, push, or PR was performed.
- Post-activation aggregate evidence found zero v117 Kael-route requests and zero durable circuit/rate rows in the current window. Configuration is active, but this is not represented as a live authenticated chat/provider proof.

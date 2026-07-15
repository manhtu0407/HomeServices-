# Home Services — Progress Log

> Relocated from README.md (2026-06-23) so README can be a lean intro. This is the durable,
> reverse-chronological build history; new entries (e.g. via /log) append here.


> Current runtime decision (2026-05-18): React Native AppStore/CHPlay ->
> Supabase Auth -> Supabase Edge Function `mobile-api` ->
> DB/RPC/Storage/Realtime -> AI providers. Do not use Vercel or hosted
> Next.js as the mobile runtime; `apps/api` is reference/parity code only.

### 2026-07-14 -- DEFINITIVE: playbook injected + active, but routing delta ≈ 0 (weak model does not act on it)

- **Proved the flag is live**: deployed a throwaway `pb-flag-check` edge function that returns `Deno.env.get("KAEL_PLAYBOOK_ELECTRICAL_ENABLED")` → responded `"1"`. So the flag IS readable in the deployed runtime, `isElectricalPlaybookEnabled()` is true, and the playbook segment IS injected into the electrical intake-diagnosis prompt. (Ruled out "flag not read" and "wiring broken".)
- **But the after-eval shows no behaviour change**: gap cases el_04 (building outage), el_19 (TV mount), el_20 (EV charger) all stayed `in_scope` + clarification — identical to baseline. The DeepSeek-class intake model, even with the playbook in its system prompt, does NOT apply the routing rules (it asks a clarification instead of declining). **Routing delta ≈ 0 on the tested gap cases.**
- **Honest read**: injecting a distilled playbook into the prompt is necessary but NOT sufficient — a ~1.6k-token segment inside a large system prompt does not reliably move the weak runtime model's routing. This does not test diagnosis/safety quality (evidence-gated, unmeasured) or the stronger escalation model.
- **Value delivered regardless**: the full teach→distill→deploy→measure loop is now proven end-to-end infrastructure.
- **Staging left dirty — needs cleanup**: flag still ON; mobile-api v131 carries a now-reverted debug `console.warn`; `pb-flag-check` function still deployed (CLI delete was permission-denied). Access token was pasted in chat → REVOKE.
- Not committed (debug revert + this entry).

### 2026-07-14 -- Playbook committed + deployed to staging; routing after-eval running

- **Committed** the playbook feature (13 files, playbook-only): `feat(kael): electrical teaching playbook + eval harness (flag-gated)` = `31dface4a`. Runtime wiring + docs/playbooks + eval harness + eval reports; docs-reorg/governance changes left separate.
- **Deployed** `mobile-api` to staging via `npx supabase functions deploy` (Docker bundling): **v127 → v128** (entrypoint = this worktree, new bundle sha). Flag off by default → behaviour unchanged by the deploy itself.
- **Enabled the flag** on staging: `supabase secrets set KAEL_PLAYBOOK_ELECTRICAL_ENABLED=1` (user explicitly named it — the secret-store write is permission-gated). Playbook now ACTIVE for electrical intake.
- **Routing after-eval running** (background, single-turn, flag ON, paced 190s): `docs/test-logs/2026-07-14_kael-playbook-electrical-after.md`. Compares `scope_signal` routing vs the ~70% baseline / the 6 routing gaps.
- Token hygiene: the Supabase access token was pasted in chat → to be REVOKED after; flag to be unset after the delta is captured.
- Not committed (this entry / reorg).

### 2026-07-14 -- Multi-turn run finding: estimates are evidence-gated → routing is the metric

- Ran the paced multi-turn baseline. Two findings: (1) **estimates are photo-evidence-gated** — text-only conversation never reaches an estimate within 3 turns (every reached case had `problem_slug=null`, still clarifying), so `problem_slug`/`safety_signals` are NOT measurable via the text API without uploading real images; (2) **token-expiry bug** — the user JWT (~1h) expired mid paced-run → 13 tail cases failed HTTP 401. **Fixed:** runner now re-signs-in on a mid-run 401 (`config.refresh()`), plus stronger 429 pacing/retry.
- **Conclusion: the honest measurable metric is `scope_signal` (turn-1 routing), ~70–73% consistent.** The playbook's routing/disambiguation section targets exactly the 6 baseline routing gaps, so before/after is measured on routing. slug/safety measurement is deferred (needs an image-uploading harness or a provider-level unit test).
- Next: to get the routing delta, deploy the flag-off wiring + toggle `KAEL_PLAYBOOK_ELECTRICAL_ENABLED` on for the after-run — awaiting Tu's deploy decision.
- Not committed.

### 2026-07-14 -- Multi-turn harness + playbook wired behind flag (runs rate-gated)

- **Step 1 (harness → multi-turn) DONE + mock-verified 21/24.** Runner now opens with the terse message and, while Kael keeps asking to clarify, answers with a per-case `detail` (added to all 24 corpus cases) up to `--max-turns`, so `problem_slug` + `safety_signals` become observable. Key fact verified in code: `sendKaelChatTurn` is NOT rate-limited (only the create is), so multi-turn costs one create per case.
- **Step 3 (playbook wiring) CODE DONE + verified.** New `supabase/functions/mobile-api/_shared/kael/playbooks/electrical.ts` holds the compressed Appendix-A segment + `isElectricalPlaybookEnabled()` (env `KAEL_PLAYBOOK_ELECTRICAL_ENABLED`). Wired into `buildIntakeDiagnosisMessages` via `electricalPlaybookAddendum()` — off by default, electrical-only. `deno check` passes; gating test confirms {offElec:false, onElec:true, onPlumb:false}. NOT deployed.
- **Step 2 (full live baseline) BLOCKED — hard 20/hour create cap** ("Bạn đã đạt giới hạn 20 phiên Kael trong 1 giờ"). I spent this hour's 20 creates on the single-turn baseline windows. A full multi-turn before/after = 24 baseline + 24 after = ~48 creates = a ~2.5-hour paced run on one throwaway user. Options to complete: pace over hours / Tu adds 2-3 more test users to parallelize / trim corpus / relax the staging limit. Deploy of the flag-off wiring to staging awaits Tu's OK (outward action).
- Not committed.

### 2026-07-14 -- Electrical baseline eval RAN live (20/24)

- **Ran it end-to-end on staging** with a Tu-provisioned throwaway user (`pb-eval@test.local`), auth via GoTrue password-grant (dropped supabase-js to avoid its Node<22 WebSocket init). Report: `docs/test-logs/2026-07-14_kael-playbook-electrical-baseline.md`.
- **Coverage 20/24** — the per-user Kael-chat cap is 5/min + **20/hour** (confirmed in `_shared/kael/rate-limit.ts`). First burst got 5, then paced 16s to beat 5/min for the next 15 (0 errored). el_21–24 deferred to the next hour window. Added `--delay/--offset/--limit` + retry-on-429 to the runner for this.
- **Result: 8/20 overall (40%); the trustworthy number is turn-1 routing `scope_signal` = 14/20 (70%)** with 6 real routing gaps (building-wide outage & EV-charger not declined; valid heater-install & rò-điện wrongly declined out_of_scope; TV-mount not routed to handyman; heater-water-leak not routed to plumbing).
- **Methodology finding (honest):** the harness is single-turn but Kael is multi-turn — every case returned `problem_slug = "-"` because Kael asks a clarification / requests evidence on turn 1 and only produces the estimate + safety_signals later. So `problem_slug` and `safety_signals` are NOT fairly measured yet; fix the harness to answer turn-1 before comparing an "after" delta on those.
- Not committed.

### 2026-07-14 -- Playbook eval runner + dry-run (electrical baseline pending token)

- **Runner built**: `apps/api/scripts/kael-playbook-eval.mjs` — sends each of the 24 electrical corpus cases through the live `/kael/chat` intake-diagnosis path and scores observed intake fields (`scope_signal`, `needs_clarification`, `problem_slug`, `safety_signals` recall) against the corpus. `suggested_service` is not observable via the serialized API and is reported-not-gated. Verified against code that `llmClarificationEnabled = true` (intake-diagnosis always on) and that `createKaelChat` runs the pipeline synchronously, so a single POST returns the scored `{session, turns}`.
- **Dry-run PASS**: `--mock` mode (fixture `apps/api/scripts/fixtures/kael-playbook-eval-mock.json`, generated from the corpus with 3 deliberately corrupted cases) scored 21/24, catching exactly the 3 corruptions (el_06 needs_clarification, el_08 clarification+slug cascade, el_24 safety recall). Report: `docs/test-logs/2026-07-14_kael-playbook-electrical-mock.md`. This proves the scoring wiring only — it is NOT a live baseline.
- **Live baseline BLOCKED on credentials (honest)**: the real baseline needs a signed-in staging **user** JWT (route requires `ctx.user`); an agent cannot mint one and must not create accounts or handle credentials, and the classifier (correctly) blocked reading `auth.users`. Handoff: a human runs `KAEL_PB_EVAL_MOBILE_API_URL=... KAEL_PB_EVAL_ANON_KEY=... KAEL_PB_EVAL_BEARER_TOKEN=... node apps/api/scripts/kael-playbook-eval.mjs --label baseline`. Then inject Appendix A behind `KAEL_PLAYBOOK_ELECTRICAL_ENABLED` and re-run with `--label after`; the delta is the real measure.
- Not committed.

### 2026-07-14 -- docs reorganization 2026-07-14 + Kael teaching-playbook channel

- **Context**: Tu asked Claude to "teach Kael" (logic/understanding/analysis/vision) by distilling reasoning into prompts/knowledge + eval (not model training), then to reorganize `docs/` and record the method.
- **Electrical playbook (sample)**: produced `docs/playbooks/services/electrical.md` (v0.1) — 11 procedural diagnostic sections bound to the exact code contract (8 problem_slugs, 6 quote_drivers, both gates' trigger_signals, self-check limits), plus a compressed ~1.6k-token STABLE runtime segment (Appendix A, cache-friendly per Plan §43-C), a 24-case eval corpus (`docs/playbooks/eval/electrical-cases.json`, valid JSON), and an honest verification status (Appendix C). No runtime code changed; nothing injected. Awaiting Tu's [VERIFY] domain review + 3 product-policy calls before any baseline eval / injection.
- **Distillation method recorded**: `docs/playbooks/process-distillation.md` — the repeatable SOP (three-artifact model, contract-extraction-first, the 8 weak-model output traps, adversarial authoring, compression, eval, the measurement loop). Approved by Tu.
- **docs/ reorganization**: added `docs/INDEX.md` (navigation map — the missing structural piece); created `docs/playbooks/` and `docs/archive/` (each with an `INDEX.md`). Moved the ephemeral `handoff/` prompts to `archive/handoff/`. Archived two superseded design contracts to `archive/design/`: `worker-map-operation-balanced-20260531.md` (superseded by `worker-map-real-provider-20260608.md`, §37) and `frontend-redesign-production-contract-20260521.md`; Plan.md path references updated. Kept `design/kael-core-v9.md` active (evidence: it is the current identity/motion direction, referenced by `governance/design/ASSET_MAP.md`).
- **Naming lesson**: `README.md` is a locked filename in this project; directory indexes use `INDEX.md` (matching `test-logs/INDEX.md`). The three new index files were named accordingly. See `docs/agent-lessons.md`.
- **Left in place (deliberate)**: `docs/test-logs/` (referenced by `apps/api` tests/scripts, cannot relocate).
- **Stale refs cleaned (Plan.md)**: the six planned doc paths were resolved — `source-trust-maintenance.md` repointed to the real file under `foundation/`; the five never-created ones (`ai-cost-optimization.md` ×2, `cost-optimization-2026-XX-results.md`, `ai-source-trust.md`, `learning-aggregation.md`, `architecture/kael-price-authority.md`) annotated in place as "NOT created" with a pointer to where the content actually lives (code / Plan §24 / STRUCTURES.md), rather than deleted — the plan intent is preserved, the dead links are gone.
- **Cross-agent (Codex) wiring**: added routing rows to `AGENTS.md` so Codex (not just Claude Code) discovers `docs/INDEX.md` (docs map + the README-is-locked/use-INDEX rule), `docs/playbooks/process-distillation.md` (distillation SOP), and `docs/agent-lessons.md` (gotchas). The SOP and playbooks are plain repo files (no dependence on Claude Code's private memory), so a future distillation by any agent follows the same process.
- Not committed.

### 2026-07-10 -- Kael Harness §42 W1 + §41 P2/P1/P3 / §40 M0

- **Task**: Begin the PR #100 Kael Harness execution sequence from current `main`, with W1 first and then §41 P2 before durable guards.
- **W1**: Added one Edge output gateway plus Vietnamese canonicalization; migrated the four live chat paths and orchestrator to the same choke point; closed accented/unaccented forbidden-output and compact-money (`500k`, `nghìn`, `triệu`) bypasses; added guardrail trip evidence and false-positive regression cases.
- **P2 / M0**: Added the canonical per-model registry for current and §40-planned Anthropic, DeepSeek, and Perplexity models; included Sonnet 5's 2026-09-01 price transition, Anthropic prompt-cache math, DeepSeek cache hit/miss prices, Perplexity context request fees, provider-reported total cost, and dev/test fail-loud versus production safe-high unknown-model handling.
- **P1**: Added flag-gated, pure-DB durable provider circuits and generic chat token buckets. Circuit state is atomic and two-level (provider-global for 402/429; purpose-provider for server/timeout/schema), both customer and worker chat use 5/minute plus 20/hour when enabled, and every guard adapter fails open on DB error/timeout.
- **P3**: Added one `callStructuredAI` path and migrated all nine structured Edge calls. HTTP-200 schema failures now count toward the purpose-provider breaker without being cleared as transport successes; the third persistent failure opens the circuit and provider loops continue to their configured fallback. The market insufficient-data sentinel remains a valid non-failure result.
- **W2**: Reconciled the Plan's LLM-confidence requirement with the actual deterministic chat wiring: every source now declares provenance; existing deterministic topics retain confidence 1, while any future LLM topic requires valid server-only configuration and sufficient confidence. Sensitive labels additionally require independently canonicalized Vietnamese evidence, otherwise Kael returns clarification before DB/provider work. Permission and autonomy audits store only safe provenance metadata.
- **W3**: Quarantined the unused L1–L6 `KaelMemory` context engine by removing it from the production Kael barrel and documenting its test-only status. Backward-compatible self-memory CRUD remains live but is separate from prompt context and does not activate multi-layer memory.
- **W5**: Extracted three thin ProviderAdapters around the existing `callAI` choke point. Provider capabilities, request shapes, response parsing, shared model-registry cost, and circuit failure class are explicit; routing, timeouts/retries, spend gates, output validation, and all provider endpoints remain unchanged.
- **W4**: Replaced ambiguous orchestrator stage success with `ok`/`declined`/`degraded`/`failed`, preserving values/fallback reasons and legacy façade boolean telemetry while adding `stage_status`. Pipeline decisions continue to read their existing inner stage-result contracts.
- **§40 M1/M2**: Completed the model roster and the execution paths. Anthropic defaults now select Sonnet 5; vision runs Sonnet 5 then Opus 4.8 for hard images; market runs Sonar then Sonar Pro below the configured confidence floor; scope change runs Sonnet 5 then Opus for low confidence or a server-configured high-stakes amount. Haiku 4.5 remains the cheaper configured fallback for clarification, advisory, and educational routes. Source-trust no longer bypasses the roster by forcing Sonar Pro as primary.
- **DeepSeek V4 Pro path**: `post_job_learning` now uses bounded direct structured DeepSeek V4 Pro calls grouped under the existing queue/audit lifecycle, with the same prompt and candidate lifecycle as the Sonnet 5 Anthropic Message Batch fallback. Spend gate, kill switch, circuit breaker, schema validation, safe audit metadata, and no-raw-output handling all remain enforced. `claude-sonnet-4-6` remains only as a backward-compatible historical price-registry entry, never as a selected production Edge model.
- **§40 S0/S1/S2**: Locked deterministic LIVE pricing to 50/50 baseline↔market in both Edge and reference/parity synthesis (without exposing raw LLM price text); added a compatibility-preserving source-trust migration with A–G evidence fields plus `auto_tier` 1–5; and added the pure deterministic T1–T5 rulebook. Unknown/listing/blocked sources quarantine at T5, stale reviews and suspicious price jumps degrade, and an LLM-claimed tier is ignored.
- **§40 S3**: Trusted Perplexity now returns per-source price evidence plus A–G signals rather than a blended range. The Edge strips model tier claims, computes effective T1–T5 through the deterministic rulebook, accepts only cited/current `per_visit` evidence, removes duplicates and >40% T1–T2-median outliers, and applies the locked weights. Zero T1–T2 or invalid configuration fails closed; a non-zero but weak 2/3-source quorum follows DS2 instead of dropping market.
- **§40 S4**: Added the deterministic five-gate market verdict. Weak/suspicious evidence preserves 50/50, widens the deterministic band, and requires inspection; stale/mixed/unitless evidence is rejected to baseline. Estimate Card v3 receives only the server-computed inspection reason and deterministic source-count/tier summary, never raw Perplexity reasoning or a model-claimed verdict.
- **§40 S5/S6**: Added the 4× relative market clamp directly before LIVE synthesis: an endpoint outside the baseline band drops the entire market half and falls back to deterministic baseline, while a valid 4× correction stays eligible. Completed the §40 adversarial verification matrix across forged ranges/verdicts, citations, stale and mixed-unit sources, outliers, quorum, and clamp behavior.
- **Spend safety**: `callAI` now reserves at least the deterministic model estimate before fetch and reconciles the parsed actual cost. `market_lookup` no longer reserves only the stale `$0.002` route ceiling when the provider request fee is already higher.
- **Boundary**: No mobile AI call or secret was added. M1 changes server-side model routing metadata only; deterministic LIVE price synthesis was not changed.
- **Verification**: Final API gate: 121 files passed / 4 skipped; 1,720 tests passed / 75 skipped. Shared passed 594/594; mobile passed 126/126. API/shared/mobile type-checks, API production build, Edge Deno 2.9.2 full-graph check, structure lint, PGlite migration/rollback harness, and staging SQL/RLS/type checks passed. The structure ratchet caught batch-result growth; spend/output-health and parsing were split into focused helpers, leaving `process-batch-results.ts` at 980 lines. Comment discipline remains red only on the recorded baseline of 55 violations in 41 pre-existing files.
- **Evidence**: `docs/design/kael-harness-reliability-20260708.md`, `docs/design/kael-source-trust-pricing-20260707.md`, and `docs/design/kael-harness-hardening-20260708.md` record official sources, file/action/acceptance, adversarial vectors, and honest rollout limitations.
- **Staging**: Applied `20260710082120_kael_durable_guards` and `20260710082345_kael_source_trust_tiering` to `xyylanuyflrjzbjzhqfl`. The rollback harness passed all six durable assertions; session B observed a circuit committed by session A; RLS/grants matched the service-role/authenticated contracts; the source-trust remap preserved all 20 existing rows; cleanup removed verification state.
- **Staging Edge deploy**: Deployed the exact 127-file local Edge graph as `mobile-api` v117, preserving `verify_jwt=false`. Public `/kael/charter` smoke returned 200. Current v117 logs show 84 requests, all 2xx, no startup/import error, and a 777 ms p95 execution time over the observed window.
- **Known baseline drift**: Hosted migration history already records the older voice-transcript migration as `20260706154350` while its local file is `20260706120000`. This run did not rewrite that unrelated history; the two PR #100 migration filenames are synchronized to staging.
- **Staging activation**: Re-authenticated the CLI, then set and fingerprint-verified `KAEL_DURABLE_GUARDS_ENABLED=true` and `KAEL_SOURCE_TRUST_HIGH_VALUE_VND=1000000`. The first activates durable circuit/rate RPC adapters; the second implements the Plan DS6 higher-quorum boundary without source-code VND literals.
- **Honest live-status note**: The post-activation log window contained no v117 Kael-route request and both durable tables had zero rows. The runtime configuration is confirmed, but a live authenticated chat/provider call has not yet produced direct Edge evidence.
- **Next**: PR #100 §§40–42 implementation, staging schema verification, Edge deployment, and server-only activation are complete. A future authenticated staging chat/provider smoke may observe live durable RPC latency and a real provider response; it is not required to mutate production. Production remains untouched.

### 2026-07-01 -- NestScout / Kael Rebuild PR72 Checkpoint Consolidation

- **Task**: Consolidate the PR72 rebuild root docs into existing repo topics instead of keeping loose root markdown files.
- **What landed in the rebuild checkpoint**: Phase 1 foundation and screen checkpoint evidence were preserved under the design docs topic: official NestScout logo 01, Kael Orb, status icons, 20 Kael state crops, 10 Kael emotion crops, Component System primitives, Agentic Center route, auth/customer/worker/profile rebuild groups A-F, worker application review path, mojibake cleanup, audio-ready job media, and production-source guards for raw TextInput / legacy Kael assets / hardcoded typography weight regressions.
- **Docs**: Former `REBUILD_PLAN.md` and `SCOREBOARD.md` are folded into `docs/design/rebuild-preserve-handshakes-20260613.md`; former `ASSETS_NEEDED.md` is folded into `governance/design/ASSET_MAP.md`; former `PROGRESS.md` is represented here as this durable checkpoint.
- **Verification captured from the checkpoint**: package-level mobile/API/shared type-checks passed; full mobile Jest, API Vitest, and shared Vitest passed in the recorded rebuild batches; focused auth/customer/worker/profile/Agentic Center suites passed for their respective checkpoints; `expo config --type public` read the NestScout config successfully.
- **Open gates**: native visual screenshot comparison is still pending; prompt-level zero raw-token gate was not complete at the recorded 2026-06-12 grep; React Doctor did not complete on that host because the portable Node install lacked `npm.cmd`/`pnpm`; native voice recording remains intentionally unavailable until a real recorder dependency, permissions, and device validation exist.

### 2026-06-10 -- §32.14 Steps 1-4 Execution + §37 MP0 việc 1-2 + Staging Migration Gate

- **Task**: Execute the two merged PR plans (PR #64 §32.14 remaining-gap build plan, PR #65 §37 worker-map MP0 spike) after an optimization review of both (tweaks recorded in Plan.md §32.14/§37 change logs; Tu approved scope: Steps 1-4 only, §37 việc 1-2 + handoff, staging-only deploy, 1 PR).
- **What landed**: (1) §32.7 worker lobby check-in UI (manual_photo) via `useWorkerArrivalCheckIn` wired into both arrival call sites, with a NEW dedicated `access_check_in` job-media stage end-to-end (shared/Edge/mobile schemas, status-gated to `worker_on_way`/`arrived`, never merged into completion evidence) + migration `20260610075217` which also fixes the pre-existing `scope_change_evidence` CHECK violation; (2) §32.7 customer "Cho thợ lên" — `jobService.authorizeApartmentAccess`, provider action, history-surface panel keyed on the new `address_access.worker_checked_in` projection; (3) §32.6 matching soft-penalty (−15 score at `disintermediation_risk_count >= 2`, fail-open read, logged, penalty-not-exclusion); (4) §32.3 first-turn perceived-perf via one-shot terminal-progress fetch after create() resolves; (5) §37 MP0: VietMap ToS research verdict **SILENT** (support-email template + decision rule in `docs/design/worker-map-real-provider-20260608.md`) + `map-proxy-spike` Edge function with pure style-rewrite module; build gate stays CLOSED pending device-bound việc 3-4.
- **Verification (real runs)**: mobile Jest 145/145 (single-fork) + mobile/shared type-check clean; targeted apps/api Vitest 128/128 (incl. 8 new spike + 4 new §32 tests; full-suite run showed 7 route-security timeouts under parallel load that pass 28/28 in isolation — load flake, not regression); shared Vitest green except 1 **pre-existing** mobile-wiring drift (`value: \`${completedJobs}\`` absent at HEAD — flagged as separate task, predates this change). Staging verified via MCP: all 7 §32 migrations + 3 same-batch were already applied; `20260610075217` applied + CHECK/policy verified live.
- **Open gates (handoff)**: staging `mobile-api` is still v100 (2026-06-05) — redeploy + `kael-section32-staging-smoke.mjs` (`SECTION32_RUN_LIVE=1`) need Tu's CLI token + staging service-role key (G1); G3 native recordings; production migrations untouched by design; VietMap confirmation email to send; §37 MP0 việc 3-4 on-device per companion doc.

### 2026-06-05 -- Kael Section 32 Local Completion Audit

- **Task**: Execute and audit Plan.md section 32 from PR #60: customer perceived-performance, worker Kael felt-parity, anti-disintermediation, apartment access, and flexible-not-slop interaction rules.
- **What landed locally**: Section-32 progress/SSE/customer-chat wiring, worker sibling chat contracts, worker advisory safety/idempotency fixes, generated Supabase type drift coverage, worker mobile stale-job SSE guards, Reduce Transparency worker surface handling, SDK-compatible Expo Doctor fixes, a staging-only Section 32 smoke harness, a staging-only Android recording harness with names-only env examples, deterministic mobile Jest config, and evidence docs.
- **Verification**: Local API/shared/mobile type-check and test gates pass, targeted mobile ESLint passes, default mobile Jest now passes serially, and Expo Doctor now passes 18/18. See `docs/test-logs/2026-06-04_kael-section32-local-verification.md` and `docs/test-logs/2026-06-05_kael-section32-completion-audit.md`.
- **Open gates**: Do not mark section 32 complete yet. Follow-up migration `20260605005000_scope_worker_kael_chat_idempotency_by_job.sql` still needs staging lint/apply proof, the staging smoke harness has not run live, and the authenticated native section-32 chat/stream/worker recordings are still missing.

### 2026-05-30 — Recent PR Audit Gap Fix

- **Task**: Close review gaps from recent PR updates after rebasing the audit branch to `origin/main`.
- **What landed**: Stop-hook false-completion guard reruns gates even when `stop_hook_active`; mobile config changes now trigger the gate; mobile lint remains manual as `lint:mobile` until debt is cleared; job/chat idempotency retries reuse stable client request IDs; duplicate in-flight job/chat creates return pending errors instead of fake estimate/session data; Kael chat rate-limit RPC is serialized per user; worker district backup table is protected; explicit `hcmc_all` worker coverage is accepted while unknown districts still fail; pump-water plumbing is no longer rejected as out of scope.
- **Docs**: Stale command docs reconciled to canonical protocols, Plan supersession notes added for worker cancellation auto-suspend/rating penalty drift, Kael charter/system prompt accented, and frontend-test docs updated for the lint script state.
- **Verification**: See branch verification output for targeted unit/static tests and `git diff --check`. Follow-up 2026-05-31 added direct `@babel/runtime` for the Expo mobile Jest/Babel runtime; mobile `type-check` and `test` now pass after hydrating dev dependencies from the lockfile.

### 2026-05-17 — Kael Two Supporting Services (MarketMemory + CaseReview)

- **Task**: Build Kael's two supporting services per STRUCTURES.md §10A/§10B. Real working loop end-to-end, not just code that looks pretty.
- **Scope chosen** (Tu): Tier 2 Phase 1 — both services, evidence gate, auto-promote opt-in, rule application in `fetchBaseline` + complexity raise in pipeline.
- **What landed**:
  - New `apps/api/src/lib/learning/` (7 files): `types.ts`, `evidence-gate.ts`, `market-memory.ts`, `case-review.ts`, `apply-price-rule.ts`, `apply-complexity-rule.ts`, `hook.ts`.
  - Wired into review route (fire-and-forget), `fetchBaseline` (parallel rule query), pipeline stage 2.5 (`applyLearnedComplexityRule`).
  - Two env flags default false: `LEARNING_ENABLED` (read path) + `LEARNING_AUTOPROMOTE_ENABLED` (write path).
  - Evidence gate: MIN_EVIDENCE=5, CONFIDENCE_THRESHOLD=0.6, CONTRADICTION_MAX_RATIO=0.2. IQR-based confidence formula, capped at 0.95.
  - PricePriorPayload (price drift detection) + AnalysisRulePayload (raise_complexity_prior suggestion kind). Rule #9 audit: no PII in payloads.
- **Bug caught by integration test**: hook was rewriting `status='pending_evidence'` when `evidence_count < MIN_EVIDENCE` — fixed so observe() owns created↔pending_evidence transition by count.
- **Test count**: 800 local / 859 staging pass (+80 unit + 5 integration). 0 fail.
- **Verification**:
  - `corepack pnpm --filter @nestscout/api test` → 800 pass / 59 skip / 0 fail.
  - Staging integration (5 tests, real Supabase): 4-job evidence floor, 5-job + autopromote on → rule active + version v1, fetchBaseline returns learned range, autopromote-off path, null final_price graceful skip.
- **Decision update (2026-05-18)**: runtime path is locked to Supabase Edge Function `mobile-api`. Vercel/hosted Next.js is not part of the mobile release path.
- **Next**: Continue Edge/mobile parity, staging/prod gates, and App E2E last.

### 2026-05-16 — Real Backend Build (Customer + Worker) + 3-Tier Quality Pass

- **Task**: Build real backend per STRUCTURES.md (Customer A2-A14 + Worker B0-B8) on top of monorepo. Then 3-tier audit + enhancement pass to lift quality > 10%.
- **Scope chosen**: Tu approved full customer + worker + Supabase audit. No mobile changes (Codex builds frontend separately).
- **Backend build (Phases A-F)**:
  - Foundation: brace-counting JSON parser, `withDbTimeout` (15s), typed `EventActor` event log, canonical shared types, DB taxonomy seed (14 problems × 3 complexities = 42 baselines), worker registration fields migration.
  - Kael pipeline rewrite: stage logs, DI providers, honest `NO_BASELINE` error, no fabricated VND.
  - 7 customer routes (A2-A14) hardened: optimistic concurrency, admin bypass via `assertOwnership`, `scope_change_pending` blocking, no auto-pay on A12.
  - 10 worker routes (B0-B8): registration, availability, broadcasts inbox, accept/decline (race-safe atomic claim), jobs list, earnings, scope change request, customer scope decision.
  - 678 tests at end of build pass.
- **Tier 1 audit + 16 quality fixes** (cumulative): district normalization (`HCMC_DISTRICTS` + `normalizeDistrict`), `PLATFORM_FEE_WORKER` constant, type cast removal, `withDbTimeout` timer cleanup, dead code removal (`scopeChangeSchema` old, `acceptBroadcastSchema`, dup `apps/api/src/lib/validation.ts`), blank worker profile helper, baseline OR-query (2 → 1 roundtrip), earnings date filter, JSON parser depth + length guards, orphan draft cleanup (analyzing → cancelled on AI fail), DOB real-date validation, optimistic concurrency on confirm-search (with `current_status` in 409), `broadcast_expired` event logging, FK indexes migration to production.
- **Tier 2 (real integration tests + observability)**:
  - Synced staging Supabase (xyylanuyflrjzbjzhqfl) with 3 missing migrations.
  - E12: 22 security negative tests (cross-role 403, ownership 404, admin bypass).
  - E13: `request_id` correlation IDs propagated through pipeline → `api_logs.request_id`.
  - E11: 12-test integration suite for B0-B8 worker flow against real staging Supabase (creates real auth users, walks register → approve → availability → broadcast → accept → status chain → complete → confirm → review → earnings, cleans up).
  - Fixed env.test.ts isolation (shell env pollution from integration runs).
  - **773 pass with staging env / 719 pass local with proper skips**.
- **Tier 3 (atomic RPC functions — race condition fixes)**:
  - Migration `20260516144400_atomic_rpc_functions.sql` applied to **production** and staging.
  - 3 plpgsql functions: `accept_broadcast_atomic`, `request_scope_change_atomic`, `decide_scope_change_atomic`. All SECURITY DEFINER with pinned search_path. EXECUTE granted **only to service_role** (eliminates the authenticated_security_definer_function_executable advisor warnings).
  - Refactored `accept-broadcast.ts` and `scope-change.ts` to call RPCs. Each operation now runs as a single Postgres transaction — partial-fail orphan rows can no longer happen.
  - Updated 32 unit tests to mock `.rpc()` pattern.
- **Overall audit + Tier-organized enhancement**:
  - A1: Batched `logApiCall` (3 INSERTs → 1) via new `logApiCalls` array-input variant.
  - A2: Skip transient 'draft' state in `create-job.ts` — INSERT directly as 'analyzing'.
  - A3: Removed redundant `validateTransition` calls inside `create-job` (fixed internal sequence; state machine validation reserved for cross-boundary worker updates).
  - Collapsed estimate_ready → awaiting_customer_confirm into single UPDATE+event. Added `analyzing → awaiting_customer_confirm` to state machine as valid alternative.
  - **Result: POST /api/jobs went from ~10 DB roundtrips → ~5 (50% reduction on hot path).**
  - B1: Removed weird `awaiting_customer_confirm: 'estimate_ready_at'` from `STATUS_TIMESTAMP_MAP`.
  - B2: Updated stale comment in accept-broadcast.ts.
- **Production state (`iwevizmsedyqozxlawwl`)**:
  - 9 migrations applied (init → taxonomy → worker fields → FK indexes → atomic RPC).
  - 17 public tables, all RLS-enabled, 35 policies.
  - 16 service_problems, 48 price_baselines (city-wide), 0 workers (clean for first registrations).
  - 3 atomic RPC functions, service_role only execute.
  - Security advisors: **0** warnings.
  - Performance advisors: 17 multiple_permissive_policies (pre-existing design), 0 unindexed_foreign_keys, 22 unused_index (auto-resolves with traffic).
- **Final verification**:
  - `corepack pnpm --filter @nestscout/shared exec tsc --noEmit` clean.
  - `corepack pnpm --filter @nestscout/api exec tsc --noEmit` clean.
  - `corepack pnpm --filter @nestscout/api build` ✅ Next.js 16, 18 routes.
  - Local test: **719 pass / 54 skipped / 0 fail** (32 test files).
  - Staging test (with env): **773 pass / 0 fail / 0 skip** (34 files including 12 integration B0-B8 + 42 real-supabase RLS).
- **Known limitations**:
  - Mock-heavy tests still ~90%; integration coverage now ~7% (better than ~1% pre-audit). Bug #10 partially addressed.
  - Multiple permissive RLS policies (admin + role-specific for same action) — pre-existing design; optimization requires touching all RLS policies, deferred.
  - No cron for stale broadcast expiry — broadcasts expire on read; phase 1 OK.
- **Next**: After frontend (PR#8) finishes, audit Clients + Fleets sections and wire backend.
- **Supabase access**: Tu's temporary management token was used for staging RPC verification + production migration push; token values must stay redacted and out of repo files.

### 2026-05-15 — Prototype Runtime Cleanup

- **Task**: Remove mobile runtime prototype artifacts after the accepted production UI baseline.
- **Scope**: Cleanup-only. Production React Native UI, customer shell surfaces, booking flow, backend, and Supabase were preserved.
- **Removed**:
  - `apps/mobile/app/prototype/`
  - `apps/mobile/components/client-price-check/client-price-check-prototype.tsx`
  - `apps/mobile/components/customer/client-frontier-prototype.tsx`
  - `apps/mobile/components/fleets/fleets-prototype.tsx`
  - `apps/mobile/public/` static mockup artifacts
  - Remotion/prototype scratch artifacts: `apps/remotion/`, `.superpowers/`, `docs/superpowers/`, the old scratch `design.md`, and `packages/shared/src/__tests__/remotion-wiring.test.ts`
  - Follow-up note: root `design.md` was later recreated intentionally as the locked Home Services design operating system; do not treat the new file as a scratch artifact.
- **Tests/contracts**: `packages/shared/src/__tests__/mobile-wiring.test.ts` now guards that prototype runtime routes/components/public mockups are absent and production customer tabs do not import prototype components.
- **Lessons**: Durable cleanup lessons are captured in `docs/agent-lessons.md`.
- **Next**: Keep production UI work in `apps/mobile/app/(customer)` and production components only; do not reintroduce `/prototype` routes before store builds.

### 2026-05-15 — Client Price Check Production UI Standard Baseline

- **Task**: Build customer-side `Đặt lịch` production UI from the approved Client Price Check prototype direction, then document the handoff for the next Codex/Claude session.
- **Scope**: Frontend-only mobile UI. No backend, no Supabase migration, no Kael backend module, no API routes, no booking broadcast, no worker matching, no payment, no scope change, no Kael learning.
- **Prototype-first work**:
  - Added isolated review route `apps/mobile/app/prototype/client-price-check.tsx` with layout `apps/mobile/app/prototype/_layout.tsx`.
  - Added prototype implementation `apps/mobile/components/client-price-check/client-price-check-prototype.tsx`.
  - Prototype kept local fixtures/state only and stayed detached from production customer tabs.
  - Cleanup note: these runtime prototype files were removed later in the Prototype Runtime Cleanup entry above. Keep only the decisions, not the throwaway files.
- **Design decisions accepted by Tu**:
  - Warm/trust/natural green direction with V11-style material color layers.
  - Medium visual complexity: not flat mint, not overly complex.
  - Light, Anthropic Sans-like typography direction.
  - Icons accepted at prototype quality; can be refined in later production enhancement.
  - Motion must be interaction-triggered only, distributed lightly, and not decorative auto-loop.
  - Layout should be multi-step and spacious, not a PowerPoint-like one-section dump.
- **Prep artifact**: Added `docs/product/client-price-check-production-ui-prep.md` with production surface, visual, architecture, and safety contracts for the later build.
- **Production UI result**:
  - `apps/mobile/app/(customer)/booking.tsx` now renders `ClientPriceCheckFlow`.
  - New production component: `apps/mobile/components/client-price-check/client-price-check-flow.tsx`.
  - First screen is a clean HomeServices services hub with app bar, compact banner scene, address card, service cards for `Sửa điện`/`Sửa nước`, and small honesty info tiles.
  - Flow states: `hub` → `problem` → `details` → `clarification` → `estimate`.
  - Status states cover default/editing/loading/clarification/estimate/fallback/error.
  - Every estimate/fallback keeps the required Vietnamese price disclaimer.
- **Motion final standard**:
  - Final accepted baseline uses `MotionPressable` + `StateReveal`.
  - Service cards use subtle `motionServiceInset` + `serviceTileSweep`.
  - Chips/CTA/retry use small `chipActionSheen`.
  - Service-card navigation uses `deferPressMs={150}` so the motion appears before the step transition.
  - Explicitly removed heavy full-card overlays, hover-triggered animation, and decorative idle/auto-loop animation.
- **Responsive work**:
  - Added compact guards with `useWindowDimensions()`, `isShortScreen`, `hubFirstViewport`, `compactHeroHeight`, `compactServiceCardHeight`, and `minimumTouchTarget`.
  - Added safe-area-aware bottom bar and long-Vietnamese-copy constraints.
- **Mobile preview support**:
  - Added Expo web dependencies: `react-dom`, `react-native-web`, `react-native-svg`, `react-native-reanimated`.
  - Added missing-config Supabase fallback so local web preview can render without real mobile env config: `isSupabaseConfigured`, nullable `supabase`, and `AuthProvider` graceful fallback.
- **Tests/contracts**:
  - Expanded `packages/shared/src/__tests__/mobile-wiring.test.ts` to lock prototype isolation, production route wiring, supported service scope, disclaimer copy, no backend/AI/Supabase mutation leakage, no future workflow leakage, motion contract, and compact iOS/Android guards.
- **Verification**:
  - `corepack pnpm --filter @nestscout/mobile type-check` passed.
  - `corepack pnpm --filter @nestscout/shared test -- src/__tests__/mobile-wiring.test.ts` passed.
  - `corepack pnpm type-check` passed.
  - `corepack pnpm test` passed.
  - `corepack pnpm lint` passed.
  - `corepack pnpm build` passed.
  - `http://localhost:8083/booking` returned HTTP 200.
- **Accepted quality**: Tu accepted this as **Standard** production UI baseline. It is not final enhanced polish.
- **Next**: Tu said there are 4 more parts to build and then enhance. Do not assume the exact order. At the next session, ask Tu which of the four parts to start, then create a short plan before coding.
- **Handoff details**: See `.claude/MEMORY.md` Session 16 for full context, decisions, rejected motion approaches, file list, and future cautions.

### 2026-05-11 — PR#3 Schema Tests

- **Task**: Viết 177 test cases cho database schema PR#3 (4 files, Vitest)
- **Result**: 177/177 PASSED — 4 files, 312ms. Tier1 (types), Tier2 (business rules), Tier3 (relationships), Tier4 (SQL migration).
- **Next**: Merge tests vào PR#3, tiến tới Phase 1 application code
- **Blockers**: None. `database.types.ts` có artifact `<claude-code-hint>` tag cần remove (đã fix).

### 2026-05-12 — Foundation Hardening (Phase 0)

- **Task**: Fix 6 infrastructure gaps phát hiện qua audit: env validator, type-safe Supabase, AI wrapper, CLAUDE.md updates, settings.json, layout.tsx
- **Result**: 6/6 items done. `npm run build` pass, 177/177 tests pass. Files: `src/lib/env.ts`, `src/lib/ai/` (client + types + 3 providers), `server.ts`/`client.ts`/`middleware.ts` type-safe, CLAUDE.md thêm Platform/Structure/Phase, settings.json mở rộng, layout.tsx lang=vi
- **Next**: Feature implementation plan (riêng) — bắt đầu từ Auth (A0/B0)
- **Blockers**: None

### 2026-05-12 — PR#5: Full Audit Remediation + 417 Tests

- **Task**: Audit toàn bộ PR#1-4 với góc nhìn senior engineer (Anthropic/OpenAI), fix critical bugs, viết comprehensive test suite multi-layer
- **Audit verdict**: 65-70% solid. Schema tốt, nhưng 4 critical bugs + 4 gaps + 3 design issues
- **Critical bugs fixed**:
  - C1: Next.js 16 proxy wiring — `src/proxy.ts` (middleware.ts deprecated, dùng `export function proxy()`)
  - C2: Role escalation — `handle_new_user()` force `'customer'` always (trước đây user có thể pass `{ role: 'admin' }`)
  - C3: Env validator — server keys giờ throw khi missing (trước đây return empty string)
  - C4: Admin RLS — 12 policies cho all 9 tables (trước đó admin không query được gì)
- **Gaps filled**: Zod validation (`validation.ts`), rate limiter (`rate-limit.ts`), health check (`/api/health`), seed.sql, SMS signup enabled
- **Bug found in testing**: `scopeChangeSchema` cho phép `new_price_min > new_price_max` — fixed với `.refine()`
- **Test suite**: 240 new tests across 8 files + 177 existing = **417/417 PASSED**
  - Unit (5 files): env, ai-types, ai-client, validation, rate-limit
  - Wiring (1 file): proxy, providers, supabase clients, health route, env structure
  - SQL (2 files): security hardening migration, seed validation
- **Verification**: `npm test` 417 pass, `tsc --noEmit` 0 errors, `npm run build` success
- **Testing guidelines**: Viết vào `.claude/commands/test-log.md` — 5 sections, anti-patterns, checklists
- **PR**: [#5](https://github.com/manhtu0407/HomeServices-/pull/5)
- **Next**: Monorepo setup + RN skeleton
- **Blockers**: None

### 2026-05-13 — PR#6: Monorepo + Expo RN Skeleton + 255 Adversarial Tests

- **Task**: Audit PR#1→5 stability, setup Turborepo monorepo, create Expo RN app skeleton, write adversarial tests
- **Audit**: Foundation stable. 6 non-blocking issues (dead code migration #1, in-memory rate limiter, missing AI content validation, missing region column, no proxy test, fragile isBuildTime). No blockers.
- **Monorepo**: Turborepo + pnpm workspaces — `apps/api/` (Next.js 16 moved from root), `apps/mobile/` (Expo SDK 54, RN 0.81.5, Expo Router 6), `packages/shared/` (constants, validation, types)
- **RN Skeleton**: Auth stack (login → verify-otp → onboard), Customer 5-tab (Trang chủ | Đặt lịch | Kael | Lịch sử | Hồ sơ), Worker 5-tab (Trang chủ | Công việc | Chat | Thu nhập | Hồ sơ), Auth provider (role-based routing), Supabase client (AsyncStorage, no secrets)
- **Bugs found & fixed**:
  - `as const` arrays mutable at runtime — added `Object.freeze()` to all constants
  - SQL enum parser broke on inline comments with commas — fixed by stripping comments before splitting
- **Test suite**: 255 new tests across 5 files + 417 existing = **672/672 PASSED**
  - constants.test.ts (28): enum cross-check against SQL, business rules, immutability
  - validation.test.ts (48): boundary values, Rule #6, sanitizeForLLM edge cases
  - exports.test.ts (17): barrel export completeness, package.json export map
  - monorepo-wiring.test.ts (42): workspace structure, turbo pipeline, dependency consistency
  - mobile-wiring.test.ts (120): navigation vs STRUCTURES.md, Rule #1 sweep, auth wiring
- **Verification**: `turbo test` 672 pass, `tsc --noEmit` 0 errors on api + shared + mobile
- **PR**: [#6](https://github.com/manhtu0407/HomeServices-/pull/6)
- **Next**: Feature implementation plan — Auth (A0/B0) → Kael Price Check → Worker matching
- **Blockers**: None

### 2026-05-13 — Critical Execution Contract

- **Task**: Create `critical.md` as the mandatory AI execution contract after reading `Master Prompt 2.0.pdf` and repo context.
- **Result**: Added embedded Kael protocols for preflight, diagnose, TDD, review, architecture, AI boundary, Supabase, security, UI/RN, PRD/issues/triage, docs, handoff, dormant protocols, and forbidden behaviors.
- **Next**: Use `critical.md` before every coding task; edit it only when Tu explicitly requests updates.
- **Blockers**: None

### 2026-05-13 — Rebuild App Workflow Blueprint

- **Task**: Rewrite `STRUCTURES.md` into the app workflow source of truth for frontend/backend implementation.
- **Result**: Added full customer/worker/admin/Kael workflows, backend domain modules, state machines, trust/safety, notifications, failure recovery, testing blueprint, and evidence-gated Kael self-learning.
- **Next**: Use `STRUCTURES.md` as the workflow contract before building Auth, Kael Price Check, matching, chat, admin, or learning services.
- **Blockers**: None

### 2026-05-13 - Mission 3 Prepared Foundation

- **Task**: Prepare the repo for future mobile/backend/Kael implementation without building those features yet.
- **Result**: Restored dependency state with `npm ci`, fixed Next/Turbopack workspace root, removed build-time Google Fonts dependency, added `docs/foundation/pre-app-build-contract.md`, and added 10 foundation guard tests.
- **Quality gates**: `npm run test` 427/427 pass, `npm run lint` pass with clean output, `npm run build` pass.
- **Security note**: Supabase temporary access token was not persisted to repo files. Static test now scans repo text files for Supabase management-token patterns.
- **Next**: Design Supabase schema alignment migration and shared state-machine contracts before Expo mobile scaffold.
- **Blockers**: `npm audit --omit=dev` reports 2 moderate vulnerabilities from Next's transitive `postcss`; npm only offers `--force` with a breaking downgrade, so no automatic fix was applied.

### 2026-05-13 - Supabase Schema Alignment Foundation

- **Task**: Align local Supabase schema/types/tests with rebuilt `STRUCTURES.md` before mobile/backend feature work.
- **Result**: Added `20260513114845_align_structures_workflow.sql` with workflow enums, service taxonomy, price baseline granularity, job events, scope-change requests, notifications, learning candidates/rules/versions, private RLS helpers, tighter storage policies, explicit Data API grants, and API log metadata fields.
- **Security changes**: Removed broad profile/worker self-update patterns from the new policy layer, moved admin helper to `private.is_admin()`, scoped media access by job/worker folder, and kept normal app users away from learning tables.
- **Types/tests**: Updated `database.types.ts`, schema relationship/business-rule tests, SQL migration tests, and seed status for the new workflow. Test suite is now 357 passing tests.
- **Verification**: `npx supabase --version` 2.98.2, `npm run test` pass, `npm run lint` pass, `npm run build` pass.
- **Blockers**: `npx supabase migration list --local`, `db reset`, and `gen types --local` cannot run until Docker/Supabase local Postgres is available. Docker engine is not running or reachable on this machine.
- **Next**: Start Docker Desktop, run local `supabase db reset`, regenerate types from the local DB, then review SQL runtime issues before any remote Supabase deployment.

### 2026-05-13 - Supabase Remote Dry-Run Check

- **Task**: Try the non-Docker Supabase remote/staging direction without applying migrations.
- **Result**: Supabase CLI token-based project listing worked after network permission. Organization currently shows no dedicated staging project; linked project is `HomeServices` with ref `iwevizmsedyqozxlawwl`.
- **Dry-run result**: `supabase db push --dry-run --linked` did not mutate remote and reported two pending local migrations: `20260512000000_security_hardening.sql` and `20260513114845_align_structures_workflow.sql`.
- **Risk note**: Any real remote push would apply both pending migrations in order, not only the new schema-alignment migration.
- **Next**: Create a separate HomeServices staging project or explicitly approve using the linked project for a real staging apply. Revoke the temporary Supabase access token used in this session.

### 2026-05-13 - Supabase Staging Runtime Verification

- **Task**: Apply the local migration chain to the new `HomeServices Staging` Supabase project and verify runtime schema behavior before any production decision.
- **Target**: `HomeServices Staging` ref `xyylanuyflrjzbjzhqfl`, region `ap-southeast-1`. The local Supabase link is currently set to this staging project.
- **Result**: `supabase db push --linked` applied `20260511000000_init_schema.sql`, `20260512000000_security_hardening.sql`, and `20260513114845_align_structures_workflow.sql` successfully on staging.
- **Runtime checks**: Remote migration history matches all three local migrations. SQL smoke checks found 17 public tables, RLS enabled on all 17, policies on all 17, 3 storage buckets, 6 storage policies, 2 service categories, 2 service problems, 6 price baselines, and 3 learning tables.
- **Types/tests**: Regenerated `src/lib/database.types.ts` from staging, converted it to UTF-8 for local tooling, and reran `npm run test`, `npm run lint`, and `npm run build` successfully.
- **Next**: Review staging schema in Dashboard if desired, then decide whether to keep iterating on staging or prepare a production migration checklist for `HomeServices`.

### 2026-05-13 - Supabase Staging Security Verification

- **Task**: Verify real RLS and storage behavior on `HomeServices Staging` before any production migration checklist.
- **Result**: Added `supabase/tests/staging_security_verification.sql`, a rollback-only staging harness with deterministic auth/profile/job fixtures.
- **Remote checks**: Harness passed 29/29 checks on staging, covering customer/job isolation, matched worker access, pre-match worker privacy, outsider denial, admin visibility, learning table protection, direct client mutation denial, and job/completion/worker-document storage boundaries.
- **Local tests**: Added a static harness guard test to keep the staging verification rollback-only, secret-free, and coverage-aware.
- **Verification**: `npm run test` 362/362 pass, `npm run lint` pass, `npm run build` pass, and repo secret scan found no Supabase management token.
- **Next**: Keep staging as the verification target for any further schema/auth/storage changes. Production migration still requires explicit approval and a separate checklist.

### 2026-05-13 - Production Migration Checklist Prep

- **Task**: Prepare the production migration safety gate without applying production changes.
- **Result**: Added `docs/ops/production-migration-checklist.md` and a new staging-verified migration `20260513125704_harden_function_execution.sql`.
- **Preflight**: Production `HomeServices` ref `iwevizmsedyqozxlawwl` currently has only `20260511000000_init_schema.sql`; checked production app/storage table counts are all 0.
- **Dry-run status**: Production dry-run before hardening reported two pending migrations. After adding hardening, final production dry-run requires `SUPABASE_DB_PASSWORD`; expected pending chain is now `20260512000000_security_hardening.sql`, `20260513114845_align_structures_workflow.sql`, and `20260513125704_harden_function_execution.sql`.
- **Security advisor fix**: Staging advisors initially flagged mutable function `search_path` and executable `handle_new_user()`. The hardening migration pins function search paths and revokes direct API execution of `handle_new_user()`.
- **Staging verification**: Applied hardening to staging, reran security advisors (`No issues found`), and reran RLS/storage harness (29/29 pass).
- **Verification**: `npm run test` 364/364 pass, `npm run lint` pass, `npm run build` pass, secret scan clean. Local Supabase link restored to staging `xyylanuyflrjzbjzhqfl`.
- **Next**: Do not apply production until Tu explicitly approves and provides production DB password as process env for a final dry-run/apply window.

### 2026-05-13 - Production Apply Attempt Blocked

- **Task**: Execute the final production dry-run/apply sequence after Tu provided credentials.
- **Result**: Production was linked temporarily, but final `supabase db push --dry-run --linked` failed before any migration apply because the provided production database password failed PostgreSQL SASL authentication for user `postgres`.
- **Safety outcome**: No production migration was applied. Local Supabase link was restored to staging `xyylanuyflrjzbjzhqfl`.
- **Verification**: Secret scan found no Supabase access token or provided DB password persisted in repo files.
- **Next**: Verify or reset the production database password in Supabase, then rerun the checklist final dry-run before any production apply.

### 2026-05-13 - Production Migration Applied With Advisor Blocker

- **Task**: Retry final production migration with corrected DB password.
- **Result**: Production dry-run matched the expected chain exactly, then production applied `20260512000000_security_hardening.sql`, `20260513114845_align_structures_workflow.sql`, and `20260513125704_harden_function_execution.sql`.
- **Post-apply checks**: Production migration history shows all four migrations. Schema smoke checks passed: 17 public tables, RLS enabled on all 17, policies on all 17, 3 storage buckets, 6 storage policies, 2 service categories, 2 service problems, 6 price baselines, 3 learning tables, and 0 app/storage fixture rows after rollback.
- **RLS/storage harness**: Rollback-only production harness passed 29/29 checks.
- **Blocker**: Supabase security advisors still warn that production-only `public.rls_auto_enable()` is executable by `anon` and `authenticated` via RPC. Production is migrated but not fully green until this is revoked with a targeted follow-up migration.
- **Safety outcome**: Local Supabase link was restored to staging `xyylanuyflrjzbjzhqfl`.
- **Next**: Add and verify a small migration that revokes direct API execution of `public.rls_auto_enable()` from `public`, `anon`, and `authenticated`.

### 2026-05-13 - Production Security Advisor Cleared

- **Task**: Fix the remaining production `public.rls_auto_enable()` security advisor warning with a sustainable migration.
- **Result**: Added `20260513131949_revoke_rls_auto_enable_rpc.sql`, a conditional no-op-safe migration that revokes direct `EXECUTE` from `public`, `anon`, and `authenticated` only when `public.rls_auto_enable()` exists.
- **Staging verification**: Migration applied cleanly on staging where the function is absent; security advisors still report `No issues found`; RLS/storage harness still passes 29/29.
- **Production verification**: Dry-run showed exactly the new migration, apply succeeded, security advisors now report `No issues found`, migration history includes all five migrations, production smoke counts pass, and RLS/storage harness still passes 29/29.
- **Safety outcome**: Local Supabase link was restored to staging `xyylanuyflrjzbjzhqfl`, and secret scan found no token/password persisted.
- **Next**: Rotate/revoke the Supabase access token and reset/rotate the DB password used in this session.

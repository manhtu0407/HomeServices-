# KAWA Mini Plan 01 — Execution Evidence Ledger

This is the single append-only checkpoint ledger for the authorized W00–W03 scope. It records evidence and state only; `governance/Plan.md` remains the live execution-plan source.

The attached KAWA packet proposes `docs/ops/kawa-execution-ledger.md`. Repository `docs/INDEX.md` routes test evidence to `docs/test-logs/` and requires its index to be updated, so this ledger lives here. No parallel execution plan is created.

## Checkpoint W00 — Repo preflight and reproducible baseline (2026-10-20)

- **TASK_ID:** W00 — Repo preflight & reproducible baseline
- **BASELINE:** branch `codex/kawa-foundation-safety-20261020`; SHA `ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72`; tracked tree `clean` before ledger creation.
- **SCOPE:** W00–W03 only; no changes to `governance/Plan.md`; at the initial W00 checkpoint, no commit, push, PR, merge, deploy, hosted database, paid provider, or secret mutation was authorized.
- **TEST_LANE:** T0, deterministic fixtures and local static checks.
- **ISOLATION:** local-only verified for commands run; synthetic fixtures; no provider or database calls.
**G0:** PASS for this isolated worktree and reproducible T0 baseline. The repository still records Plan §55 as active; it was not changed. The user selected a new worktree and branch, so this task remains isolated and unmerged.

### Ownership and source snapshot

- W01 safety routing owners found in this checkout: `supabase/functions/mobile-api/_shared/kael/kael-guardrails/permission-gate.ts`, `service-intake-safety-policy.ts`, `electrical-intake-policy.ts`, and `handyman-intake-policy.ts`; existing API tests include `mobile-api-kael-p5.test.ts` and `mobile-api-kael-electrical-intake-policy.test.ts`.
- W02 evaluator owner: `apps/api/scripts/kael-eval.mjs`; fixture inputs under `apps/api/fixtures/kael-eval/`; existing report contract coverage includes `apps/api/src/__tests__/schema/kael-a5-eval-harness.test.ts`.
- W03 trace/stream candidates found: Edge `platform/turn-trace.ts`, `kael/pipeline/streaming.ts`, `kael/domains/kael-chat/{stream,customer-conversation-stream}.ts`, `kael/kael-usage/`, and mobile `apps/mobile/lib/kael-stream.ts`. No W03 ownership or behavior change is claimed before its checkpoint.
- The initial PDF paths were treated as snapshot hints and verified against this checkout; no path was assumed to exist solely because the PDF named it.

### Baseline commands

| Command | Exit | Expected / actual evidence | Status |
|---|---:|---|---|
| `pnpm install --offline --frozen-lockfile` | 0 | Lockfile unchanged; 1,294 packages linked from the local store; downloaded 0 packages. This populated ignored `node_modules` only. | PASS (setup) |
| `pnpm lint:structure` | 0 | `structure ok: 1448 source files; 9 grandfathered oversize, 120 grandfathered dup-type groups`. | PASS |
| `pnpm lint:edge-db` | 0 | 265 RPC names found (227 literal, 38 local-const); 0 unscannable call sites. No `--functions` target was supplied, so no database comparison was performed. | PASS (offline scan only) |
| `pnpm lint:playbooks` | 0 | Six services; 24 corpus + 24 holdout cases per service (288 fixture cases total). | PASS |
| `pnpm lint:comments --working` | 0 | `comment-discipline: clean — no note-banner comments found.` | PASS |
| `node apps/api/scripts/kael-eval.mjs --mode deterministic --fixtures apps/api/fixtures/kael-eval/golden-cases.json --knowledge-fixtures apps/api/fixtures/kael-eval/knowledge-cases.json --report %TEMP%\kawa-foundation-review\kael-eval.md --json-output %TEMP%\kawa-foundation-review\kael-eval.json` | 0 | 99 cases: 84 supported, 15 decline; failures 0; critical safety failures 0; deterministic status `passed`. Knowledge fixtures n=6: ON safety/legal/citation 1.0, OFF 0.0. Temporary reports are outside the repository. | PASS (T0 only) |

The deterministic evaluator explicitly warns that it does not exercise an AI model. Its 99/99 fixture agreement is not live-model accuracy. The temporary report path emitted by the runtime was `C:\Users\PHANMA~1\AppData\Local\Temp\kawa-foundation-review\kael-eval.md`.

### Safety, environment, and limits

- Current process environment key presence was checked by name only; values were not read or printed. `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` were absent from this process environment. `.env` contents were not inspected.
- No live provider/model, hosted staging, remote database, Docker stack, or production target was used. T1/T2/T2+/T3 remain `NOT_RUN`.
- No trace IDs were produced by the deterministic evaluator; sample `traceId`, `runId`, and `releaseId` fields are null. No user data or raw traces were handled.
- No product code, schema, migration, policy, secret, or production state changed. Rollback: not applicable.
- W01–W03 are `NOT_RUN` at this checkpoint. W01 requires official-source verification of Vietnam emergency routing before changing safety behavior; W02 requires truthful report-schema tests; W03 requires trace-propagation and redaction tests.

## Checkpoint W01 — Emergency decision matrix (2026-10-20)

- **TASK_ID:** W01 — Emergency safety decision matrix
- **SCOPE:** Customer Kael deterministic response only; active fire/smoke, medical distress, police threat, electrical/water hazard, and unclear or mixed emergencies. No hosted DB, paid provider, or external mutation.
- **EVIDENCE_TIER:** T0 only; local Vitest, type-check, and static/inventory gates.
**STATUS:** PASS for the implemented matrix and the tested examples. No live-model or device evidence is claimed.

### Routing and policy

- Verified the official government routing: 112 is the national emergency line; 113 is police, 114 is fire, and 115 is emergency medical care. Sources: [Government guidance for 112](https://xaydungchinhsach.chinhphu.vn/tong-dai-so-112-tiep-nhan-24-7-cac-thong-tin-ve-su-co-thien-tai-tham-hoa-119250902150528929.htm) and [Government Gazette 04/VBHN-BTTTT](https://congbao.chinhphu.vn/van-ban/van-ban-hop-nhat-so-04-vbhn-btttt-36965/40179.htm).
- Emergency cue handling runs in the Edge customer assistant before prompt-injection fallback, model generation, knowledge retrieval, or provider spend. It stores only a fixed route reason code; it does not retain the source message.
- Active fire/smoke routes to 114, medical distress to 115, and an explicit police threat to 113. Electrical/water hazards get no-contact / no-approach guidance with 114/115 conditions and 112 for uncertain immediate dispatch. Unclassified or mixed emergencies route to 112.
- Generic medical-advice fallbacks now use 115 for emergency medical care and 112 when the service is unclear. Free-text `legal_awareness_patterns` emergency copy is no longer surfaced for this path; its safe metadata remains available. Generic unsafe/sensitive fallbacks use 112 only for an unclear emergency.
- Unsafe circuit-breaker disabling is refused before a model call. Vietnamese and English copy stay in the selected mode. Ordinary old smoke odor does not take the fire route.

### Commands and evidence

| Command | Exit | Expected / actual evidence | Status |
|---|---:|---|---|
| `pnpm --filter @nestscout/api exec vitest run src/__tests__/unit/kael-emergency-routing-pillar.test.ts` | 0 | P401: 11/11 examples pass. Earlier red runs exposed provider routing for active smoke, a missed water-near-outlet phrase, prompt-injection priority, and stale DB emergency copy; each regression was fixed before the final green run. | PASS (T0) |
| `pnpm type-check:api` | 0 | TypeScript API project check completed with no diagnostics. | PASS |
| `pnpm test:api` | 0 | Vitest: 184 files passed, 2 skipped; 2,467 passed, 6 skipped. Node contract suite: 114 passed, 1 skipped, 0 failed. | PASS |
| `pnpm lint:structure` | 0 | 1,449 source files; 9 grandfathered oversize files and 120 duplicate-type groups. The emergency answer builder stays within the source-size limit. | PASS |
| `pnpm lint:comments --working` | 0 | No note-banner comments found. | PASS |
| `pnpm lint:edge-db` | 0 | 265 RPC names; 0 unscannable call sites. No database target supplied, so this is an offline source scan only. | PASS (offline) |
| `pnpm harness:migrations:check` | 0 | 463 migration inventory entries consistent. No migrations were changed. | PASS (offline parity lane) |
| `pnpm harness:pillars:check` | 0 | 396 pillars, 396 unique IDs, manifest copies identical. | PASS |
| `pnpm lint:test-collection` | 0 | 14/14 CI-named filters resolve; 0 declared unresolved. | PASS |
| `pnpm lint:authority` | 1 | Existing violation at `apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31` cites absent Plan §3.4. That file is outside this diff. Other Plan-archive references are warnings. | FAIL (pre-existing, out of scope) |

**ROLLBACK:** No external state changed. Reverting W01 requires removing its assistant/permission-gate code, P401 test and generated pillar-index row; preserve the W00 ledger and index entry.

**LIMITS:** The multilingual emergency cue matrix is deterministic and bounded to tested phrases; it is not a complete emergency-language classifier. T1/T2/T2+/T3, a live model, hosted DB, and native-device behavior were not run.

**NEXT:** W03 — trace propagation, progress reporting, and redaction tests. Keep all checks local; no hosted or paid provider calls.

## Checkpoint W02 — Truthful evaluator report contract (2026-10-20)

**TASK_ID:** W02 — evaluator taxonomy and report-contract tests
**SCOPE:** Local evaluator output schema, fixture mismatch accounting, minimum sample refusal, and endpoint-unavailable behavior. No prompt or production-provider changes.
**EVIDENCE_TIER:** T0 only; local CLI/Vitest/static checks.
**STATUS:** PASS for the tested report contract. No model-accuracy claim is made.

### Contract and behavior

- The JSON report schema is 1.1.0. Deterministic mode reports measurement scope fixture_agreement, modelAccuracy null, providerInvocation not_attempted, and n=99 with a 75-case minimum. B6 is explicitly labeled deterministic knowledge-fixture rule agreement, n=6, and not retrieval/model accuracy.
- Metric field names remain compatible with the release-evaluation consumer; the report now names their fixture basis. The deterministic evaluator identity remains kael-deterministic-v1.
- Live endpoint mode is identified as kael-mobile-api-shadow-v1 / endpoint_shadow. Its scope is api_shadow_fixture_agreement, modelAccuracy remains null, and providerInvocation is unverified because the response does not attest whether a provider ran. evidenceClass remains the existing live_shadow value for compatibility.
- Non-2xx endpoint responses are evaluation_error records with a status-only code. They fail the report, are excluded from quality denominators, do not count as user declines or safety failures, and do not expose the response body. Unobserved live cost remains not measured instead of zero.
- P402 exercises deterministic report schema, a deliberate golden-label mismatch, the 74-case refusal before writing either report, missing live opt-in, and 99 loopback 503 responses. The fake endpoint is local and does not call a provider.
- TDD reds exposed the missing measurement fields, untyped fixture mismatch, and 503-as-decline behavior. A recorded mutation removed the JSON measurement block and made the P402 deterministic-report assertion red; the mutation was reverted and P402 passed 5/5.
- The existing schema-named test file is outside Vitest collection (the targeted run reported no test files); P402 is the collected behavioral contract.

### Commands and evidence

| Command | Exit | Expected / actual evidence | Status |
|---|---:|---|---|
| pnpm --filter @nestscout/api exec vitest run src/__tests__/unit/kael-eval-report-contract-pillar.test.ts | 0 | P402: 5/5 pass, including deterministic n=99, B6 n=6, mismatch, 74-case refusal, live opt-in guard, and a mocked local 503 endpoint. | PASS (T0) |
| Same P402 command with the measurement block temporarily removed | 1 | Mutation proof: deterministic and live report-contract assertions fail because measurement metadata is absent; source was restored, then final P402 run returned 0. | EXPECTED RED |
| pnpm test:api | 0 | Vitest: 185 files passed, 2 skipped; 2,472 passed, 6 skipped. Node contract suite: 114 passed, 1 skipped, 0 failed. | PASS |
| pnpm type-check:api | 0 | TypeScript API project check completed with no diagnostics after narrowing subprocess overrides to a string map. | PASS |
| node scripts/run.mjs run-node --test scripts/harness/evaluation.test.mjs scripts/harness/evaluate-release.test.mjs | 0 | 16 downstream evidence/report tests passed; deterministic release evaluation consumer remained compatible. | PASS |
| pnpm lint:structure | 0 | 1,449 source files; 9 grandfathered oversize files and 120 duplicate-type groups. | PASS |
| pnpm lint:comments --working | 0 | No note-banner comments found. | PASS |
| node scripts/harness/pillar-registry.mjs --write | 0 | Generated registry contains 397 pillars, 397 unique IDs, manifest copies identical. | PASS |
| pnpm harness:pillars:check | 0 | 397 pillars and unique IDs; generated manifest parity passes. | PASS |
| pnpm lint:test-collection | 0 | 14/14 CI-named filters resolve to collected files. | PASS |
| git diff --check | 0 | No whitespace errors. | PASS |
| pnpm lint:authority | 1 | Only the existing apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31 Plan §3.4 citation violation remains; P402 adds no authority-citation violation. | FAIL (pre-existing, out of scope) |
| pnpm --filter @nestscout/api exec vitest run src/__tests__/schema/kael-a5-eval-harness.test.ts | 1 | No test files found; API Vitest collects the pillar glob. Runtime report behavior is covered by P402. | NOT COLLECTED |

**ROLLBACK:** No external state changed. Revert the W02 changes in apps/api/scripts/kael-eval.mjs, remove P402 and regenerate the pillar index; preserve the W00/W01 ledger and files.

**LIMITS:** No real model/provider, hosted API/DB, Docker, device, Production, or T1/T2/T2+/T3 evidence. Live endpoint behavior was exercised only against an in-process loopback server with synthetic fixtures. Provider invocation and model accuracy remain unverified by this evaluator.

**NEXT:** W03 — trace propagation, progress reporting, and redaction tests; use T0 only.

## Checkpoint W03 — Trace, progress redaction, and measured-only telemetry (2026-10-20)

**TASK_ID:** W03 — observability safety and honest measurement
**SCOPE:** Bounded Kael trace logs, safe progress reason codes across live/legacy/stream paths, and null/unobserved telemetry when measurement inputs are absent. No public API or private DB contract change; no migration.
**EVIDENCE_TIER:** T0 only; local tests, type checks, and offline static/inventory gates.
**STATUS:** PASS for the tested contracts. No live-model, hosted-database, deployed-runtime, or native-device evidence is claimed.

### Trace, progress, and telemetry behavior

- Trace logs now include a SHA-256 hash of the authenticated actor ID plus role for non-answered turns only. The hash is allow-listed, rate-limited, written only to the log line, and omitted from the trace object persisted with the reply. Missing/malformed identity or unavailable Web Crypto degrades to no hash. The value is deterministic and therefore linkable across eligible log lines; raw actor ID is not written.
- Progress failure reasons use a closed server allowlist and unknown non-empty values become `stage_failed`; the mobile SSE parser drops unknown/free-text failure reasons while preserving its existing bounded compatibility for older backend snapshots. Governed stage/status validation remains intact. Legacy customer and worker progress snapshots are sanitized before serialization.
- Missing cost, latency, token counts, and provider result remain null/unobserved. Cost estimation requires both token counters; a cost projection without a positive sample and target returns null fields. Existing Admin model-health summaries expose `call_count`, `success_count`, `failure_count`, and `fallback_count` denominators in `supabase/functions/mobile-api/_shared/domains/admin/system-model-health.ts`.

### Commands and evidence

| Command | Exit | Expected / actual evidence | Status |
|---|---:|---|---|
| `pnpm --filter @nestscout/api exec vitest run src/__tests__/kael-edge-runtime/domains/kael-turn-trace-pillar.test.ts src/__tests__/unit/kael-observability-contract-pillar.test.ts` | 0 | P394 + P403: 22/22 passed after final trace/hash changes. | PASS (T0) |
| `pnpm --filter @nestscout/mobile exec jest lib/__tests__/kael-observability-pillar-test.tsx --runInBand` | 0 | P404: 2/2 passed after the compatibility adjustment; untrusted free-text failure reason is removed and invalid stage/status is rejected. | PASS (T0) |
| `pnpm type-check:api` | 0 | API TypeScript check completed without diagnostics after final code changes. | PASS |
| `pnpm type-check:mobile` | 0 | Mobile TypeScript check completed without diagnostics after final code changes. | PASS |
| `pnpm test:api` | 0 | 186 Vitest files passed, 2 skipped; 2,479 tests passed, 6 skipped. Node contracts: 114 passed, 1 skipped. This final run includes the role/hash refinements. | PASS |
| `pnpm test:mobile` | 0 | 284/284 suites passed; 2,631/2,631 tests passed. This final run includes the progress compatibility adjustment and P404. Existing React `act(...)` console warnings were emitted; all suites passed. | PASS |
| `pnpm lint:structure` | 0 | 1,450 source files; 9 grandfathered oversize files and 120 duplicate-type groups. | PASS |
| `pnpm lint:comments --working` | 0 | No note-banner comments found. | PASS |
| `pnpm lint:edge-db` | 0 | 265 RPC names and 0 unscannable call sites. Offline source scan only; no database target was supplied. | PASS (offline only) |
| `pnpm harness:migrations:check` | 0 | 463 migration inventory entries consistent; no migrations were added. | PASS (offline only) |
| `pnpm harness:pillars:check` | 0 | 399 pillars, 399 unique IDs, API/mobile manifest copies identical. | PASS |
| `pnpm lint:test-collection` | 0 | 14/14 CI-named test filters resolve. | PASS |
| `pnpm lint:workplan` | 0 | Five slices: W00–W02 preservation and all three W03 slices closed; all changed files are assigned. | PASS |
| `git diff --check` | 0 | No whitespace errors. | PASS |
| `pnpm lint:authority` | 1 | Existing out-of-scope violation remains at `apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31`, referencing absent Plan §3.4. No new authority violation is attributed to this work. | FAIL (pre-existing) |

**ROLLBACK:** No hosted or external state changed. Revert only W03 code, P394/P403/P404 coverage, and generated pillar-registry entries to undo this checkpoint; keep completed W00–W02 work intact.

**LIMITS:** No provider, hosted DB, deployed Edge runtime, Docker database replay, native device, or Production work was run. The Deno-container `edge:check` was also not run in this offline T0 lane; API/mobile type checks do not establish Deno compilation. Backend parity therefore used its degraded T0 lane: offline RPC/migration inventory checks only; no intended Supabase target was supplied and no database query was run, so deployed Edge/schema parity is **unverified**, not green. Actor-role hashes remain linkable pseudonyms. `lint:authority` remains red for the pre-existing out-of-scope citation.

**NEXT:** Stop after W03 as requested by the Input. Do not start Plan 02 without a new instruction.

## Publication authorization (2026-10-20)

- After approving the session-memory draft, Tu authorized committing and pushing this branch to GitHub, while explicitly excluding merge and CI. No pull request or workflow dispatch was created. Repository push workflows are filtered to `main`, so this feature-branch push does not match their configured `push` triggers.

## Checkpoint AUDIT-01 — Independent audit and repair of W00–W03 (2026-10-20)

**TASK_ID:** AUDIT-01 — independent review of commit `0f3b2e2b` against the KAWA_01 packet and Master Plan v1.1
**BASELINE:** branch `codex/kawa-foundation-safety-20261020`; HEAD `0f3b2e2b` (pushed); base `ce4bd3cd`; tracked tree clean before this checkpoint. All AUDIT-01 edits are uncommitted.
**SCOPE:** W00–W03 only. No commit, push, PR, merge, deploy, hosted DB, paid provider, or secret change. KAWA_02 not started.
**EVIDENCE_TIER:** T0 plus a local Deno container compile (`edge-check`); no T1 database, T2, T2+, or T3.
**STATUS:** The earlier W01 PASS was overstated; the defects below were reproduced, fixed red-to-green, and re-verified.

### Findings

| ID | Severity | Finding | Reproduction | Resolution |
|---|---|---|---|---|
| A1 | High | Emergency cues matched after diacritics were stripped, so `đang chạy` (running), `đang chảy` (flowing) and `đang cháy` (burning) collapsed together. Routine HVAC and plumbing requests such as "máy lạnh đang chạy nhưng không mát" and "nước đang chảy ra từ vòi" were answered with the fire route (114) before any service flow. The English cue `bleeding` also routed "bleeding the radiator valve" to 115. | Probe plus 8 red cases in P401. | Bare `dang chay` / `co chay` removed; fire cues now need a place or electrical-fitting noun, `phòng cháy chữa cháy` is excluded, `bleeding` requires a person subject. 7 positive controls (nhà / căn hộ / ổ điện đang cháy, bleeding person) stay green. |
| A2 | Medium | W01 requires the generic fallback and the specialist intake branch to agree. P401 only exercised `runCustomerAssistant`. The Case intake path (`deterministicSafetyGuidance`) named 114 only and never 115 or 112. | 4 red cases in P401. | `electrical-intake-policy.ts` guidance now adds 115 (shock or injury) and 112 (unsure), VI and EN. |
| A3 | Medium | W02 asks for explicit tier tags. The evaluator emitted `measurement` but no tier. | 2 red assertions in P402. | `evidenceTier` added to the JSON summary and the report header: `T0` deterministic, `T1` loopback endpoint. |
| A4 | Medium | W03 log line paired the stable `actor_role_hash` with `permission_reason: EMERGENCY_MEDICAL`, linking one pseudonym to a health or police event. Probe output confirmed it. | 4 red cases in P403. | `logKaelTurnTrace` withholds the hash when the reason code starts with `EMERGENCY_`. The reason code stays visible. |
| A5 | Info | `lint:authority` failure is pre-existing: `normal-chat-suggestions-cache-pillar-test.tsx:31` cites Plan §3.4, absent from `governance/Plan.md` and the archive. Neither that file nor `Plan.md` is in the diff, and the lint is not part of any workflow. | File diff empty; heading search. | Left unfixed on purpose. |
| A6 | Info | The `evaluator.kind` change (`live` to `endpoint_shadow`) does not break the release consumer: `evaluate-release.mjs` builds its own report from `config/harness/evaluation.json` and never reads the kael-eval `evaluator` field. | Source read; 16 downstream tests green. | None needed. |
| A7 | Info | Vitest in `apps/api` only collects `*-pillar.test.ts`. `mobile-api-kael-p5.test.ts` (edited by Codex) and `mobile-api-kael-electrical-intake-policy.test.ts` are not collected, so they are not evidence. | `vitest run` on the file reports no test files. | New assertions placed in collected pillars. |

### Commands and evidence

| Command | Exit | Actual evidence | Status |
|---|---:|---|---|
| `vitest run kael-emergency-routing-pillar.test.ts` before the fix | 1 | 8 failed, 18 passed (negative sentinels red). | EXPECTED RED |
| Same file after A1 and A2 fixes | 0 | 32 passed (28 after A1, plus 4 specialist-intake cases red then green). | PASS |
| `vitest run kael-eval-report-contract-pillar.test.ts` before / after A3 | 1 / 0 | 2 failed then 5 passed. | RED then PASS |
| `vitest run kael-observability-contract-pillar.test.ts kael-turn-trace-pillar.test.ts` before / after A4 | 1 / 0 | 4 failed then 26 passed. | RED then PASS |
| `pnpm test:api` | 0 | Vitest 186 files passed, 2 skipped; 2,504 tests passed, 6 skipped. Node contracts 114 passed, 1 skipped. | PASS |
| `pnpm type-check:api` / `pnpm type-check:mobile` | 0 / 0 | No diagnostics. | PASS |
| mobile `jest lib/__tests__/kael-observability-pillar-test.tsx` | 0 | P404: 2/2. Full mobile suite not re-run: no mobile file changed in AUDIT-01. | PASS (targeted) |
| `node scripts/run.mjs run-node --test scripts/harness/evaluation.test.mjs scripts/harness/evaluate-release.test.mjs` | 0 | 16/16. | PASS |
| `bash docker/scripts/edge-check.sh --only mobile-api` | 0 | Deno 2.9.4 pinned image, `discovered=7 selected=1 checked=1 failed=0`; 4 embedded Deno tests passed. Fetched npm dependencies into the container cache. Other six Edge functions not checked. | PASS (mobile-api only) |
| `pnpm lint:structure`, `lint:comments --working`, `lint:playbooks`, `lint:test-collection`, `harness:pillars:check`, `lint:workplan`, `lint:edge-db`, `harness:migrations:check`, `git diff --check` | 0 | structure 1,450 files; 463 migrations consistent; no new pillar IDs. `lint:edge-db` is an offline scan, no database compared. | PASS |
| `pnpm lint:authority` | 1 | Only the pre-existing A5 violation. | FAIL (pre-existing) |

An earlier playbook edit (adding 115/112 to the verbatim safety wording in `playbooks/electrical.ts`) broke `lint:playbooks` (Appendix A parity) and would change the model prompt bundle; it was reverted before this checkpoint. The playbook's "verbatim" safety wording therefore still lacks 115/112 while the runtime intake guidance has them.

**SAFETY / PRIVACY:** The actor hash is `SHA-256(role:userId)`, unsalted, log-only, never persisted with the reply. User IDs are UUIDs so the digest cannot be brute-forced from logs alone, but it is deterministic and linkable to anyone who holds a candidate ID. A keyed HMAC would need a new secret and is left to the operator.
**ROLLBACK:** Revert the seven AUDIT-01 files; nothing external changed. The committed W00–W03 work is untouched.
**LIMITS:** T0 and a local compile only. No live model, hosted or local database, SQL/RLS suite, device, or Production. Emergency cues remain a bounded phrase list, not a classifier; Case intake turns outside the electrical branch are not pre-routed to 112/113/114/115. Deployed Edge and schema parity is **unverified**.
**OUTCOME:** W00 VERIFIED, W01 VERIFIED (T0, after repair), W02 VERIFIED (T0, after repair), W03 VERIFIED (T0, after repair), with the operator items in the handoff. KAWA_01 meets T0 acceptance; it does not meet T1/T2.
**NEXT:** Stop. KAWA_02 requires a new instruction.

## Checkpoint REMEDIATION-01 — Owner-authorized closure of A1–A4 and final verification (2026-10-20)

**TASK_ID:** REMEDIATION-01 — continuation of AUDIT-01 after the owner approved three scoped changes
**BASELINE:** branch `codex/kawa-foundation-safety-20261020`; HEAD `0f3b2e2b` (published); base `ce4bd3cd`; tracked tree dirty with the AUDIT-01 files plus this checkpoint's edits. Nothing is committed or pushed.
**AUTHORIZATION (owner, this session):** (1) bump the electrical playbook version and keep Appendix A and the runtime segment in parity; (2) keep the current privacy approach, no new HMAC secret and no new identity tracking; (3) extend emergency routing into the Case intake flow. No commit, push, PR, merge, deploy, hosted resource, new credential, paid call or KAWA_02 was authorized and none occurred.
**SCOPE:** W00–W03 only. Owner files: `kael-guardrails/emergency-guidance.ts`, new `emergency-signal-text.ts`, new `domains/kael-chat/emergency-turn.ts` wired from `turn.ts`, `create.ts`, `intake-confirmation.service.ts`; `turn-intent-router.ts` exports one existing helper; `electrical-intake-policy.ts`; `playbooks/electrical.ts` and `docs/playbooks/services/electrical.md`; `platform/turn-trace.ts`; `apps/api/scripts/kael-eval.mjs`; pillars P401–P403, P405, P406 and the P46 registry pillar. `advance.ts` was investigated and not changed: the gate sits ahead of every caller that matters.
**PLAN.md:** it holds no KAWA section. Sections 51–54 and 60 are still `EXECUTING` and 61 is `EXECUTED (chưa commit)`; none was edited, no parallel live plan was created, and this ledger remains the KAWA evidence record. Hot files in §60/§61 branches (`turn.ts`, `create.ts`, `intake-confirmation.service.ts`, `turn-intent-router.ts`) change here by 12, 12, 12 and 1 lines, so a later merge may need a manual look.
**EVIDENCE_TIER:** T0 deterministic plus a local pinned-container compile of all seven Edge functions. The Case-intake tests run the real HTTP handler, services and serializer against an in-memory PostgREST stand-in with provider `fetch` stubbed; that is T0, not T1, because no real Postgres, RLS or policy ran.
**STATUS:** every finding below was reproduced, fixed red-to-green and mutation-checked.

### Root-cause closure

| ID | Defect | Root cause | Fix | Evidence | Residual |
|---|---|---|---|---|---|
| A1a | Ordinary requests routed to fire/medical: "máy lạnh đang chạy", "nước đang chảy", "bleeding the radiator", "sau vụ hỏa hoạn", "smells of smoke from cooking" | The classifier compared accent-stripped text, so `cháy / chạy / chảy`, `khói / khối / khởi` and `lửa / lừa` were one word; negation reached only 48 characters back; no tense, condition, quotation or technical-term handling | `emergency-signal-text.ts` keeps an index-aligned accented twin and rejects a cue whose tone marks spell another word (an unmarked spelling is still accepted); clause splitting at sentence stops, dashes and contrast words; past, conditional, resolved, named-quote and radiator/brake/valve rules | P405: 88 ordinary phrases (37 + 51, all six services), 0 false routes; before: the audit-state classifier routed 2 historical-smoke phrases to fire (probe1) and the first rewrite routed 2 more (aftermath cleaning, cooking smoke) until fixed | Phrase rules, not a classifier; gas/LPG leaks are deliberately not a cue because they collide with refrigerant wording |
| A1b | Genuine dangers missed: "Không có khói nhưng có lửa", "no smoke, but flames are visible", "Không phải tôi bị điện giật, người bên cạnh mới bị" | Negation crossed contrast words; third-party affected was not modelled; no "flames visible" cue | Contrast words end a negation; narrow "not me, someone else" rules; added cues | P405: 91 danger phrasings (34 six-service matrix rows + 57 paraphrases), 0 misses, both entry points; before: the audit-state classifier missed 3 (probe1). The review pass found and closed five more misses (`sau khi … bốc khói`, "started 5 minutes ago", `phòng cháy rồi`, a condition before a comma, a stop typed after a space) and six recall gaps (`cháy ở`, `có cháy`, `giật điện`, `thở không nổi`, `ngạt thở`) | Same as above |
| A2 | Case intake had no emergency path of its own: with the playbook flag off `persistentKaelSafetySignals` returned nothing, and `resolveEmergencyGuidance` was reached only from the normal assistant | The only early safety path was gated by `getEnabledKaelPlaybook`; medical and police cues existed only in the normal assistant | `emergency-turn.ts` runs before the boundary guard, intent router and pipeline on the follow-up turn, the first message and the intake-confirmation boundary, independent of any flag and of the AI kill switch. Fire, medical, police and unclear emergencies end the turn with fixed guidance; a wiring or water hazard advises and the intake continues; a flagged service path that already answers a smoke or wiring hazard keeps that reply | P406: 36 cases across six services, flags off and on, offer and blocker restored, cross-actor 404/403/403, replay, kill switch, failed write returns 500, log carries the route code only, confirm and create paths; mutations: gate off (17 red), flag-gated (11 red), confirm site only (1 red), create site only (1 red) | Real Postgres, RLS and a device were not exercised |
| A3 | `evidenceTier: T1` was emitted for a loopback endpoint | A reachable URL cannot attest a database or provider behind it | Live endpoint mode now reports `unattested`; only deterministic mode reports `T0` | P402 asserts both | A real T1 label needs an attested local stack |
| A4 | The actor-role hash sat beside an `EMERGENCY_*` code in a log line | Both fields were emitted together | Hash withheld for `EMERGENCY_*`; the Case-intake log line carries the route code and nothing else (no session, user or text) | P403 and a P406 log assertion | The unsalted hash stays on non-emergency refusals and is linkable by anyone who holds a candidate ID; no keyed hash was authorized |

### Electrical playbook

| Item | Result |
|---|---|
| Version | `electrical-playbook-2026-07-16.v2` → `electrical-playbook-2026-10-20.v3` (repository `<service>-playbook-<date>.v<n>` convention) |
| Mismatch found | The verbatim hazard wording in PB11 and Appendix A ended at 114, while `deterministicSafetyGuidance` also told people to call 115 and 112. The prompt told the model to copy text the server no longer matched |
| Change order | Textbook first (PB11 §2.1–2.4, the two "only 114" rules, the runtime-version and addendum notes), then Appendix A, then the runtime segment and constant, then the server string was split into two sentences of at most 20 words to honour the textbook rule |
| Parity | `pnpm lint:playbooks` exit 0 (six services, 24+24 cases each, Appendix A equals the runtime segment); a new registry-pillar test asserts each of the four hazard lines equals the server guidance verbatim and that 114, 115 and 112 appear; mutation (one extra word in the runtime line) turned both that test and `lint:playbooks` red |
| Hashes | The evaluator hashes the working-tree source file at run time and nothing is stored. Working-tree (CRLF) `playbooks/electrical.ts` sha256 `521c4d4ead5a1eb4bc1aeaed1b98982bdfc5277be30a912e8dca18b9facc0a1a`; `docs/playbooks/services/electrical.md` sha256 `7399b80c19b069e795de050b8b4f720771d10f6aee55ff6218bde79950e4d1e0`. Both were recorded before the final edits to other files and the playbook files have not changed since; a LF checkout hashes differently |
| Not done | No evaluator run, no corpus or label change, no flag change, no deployment. Domain review of the 115/112 sentences is pending (Appendix C). The §52/§53 measurements describe v2 and are not evidence for v3. The mock fixture and historical `docs/test-logs` reports still name v2 on purpose |
| Rollback | Restore `playbooks/electrical.ts`, `docs/playbooks/services/electrical.md`, the P46 registry-pillar assertions and the one string in `electrical-intake-policy.ts` from `HEAD`/AUDIT-01; the flag is off by default so rollback has no runtime effect until the flag is enabled |

### Commands and evidence

| Command | Exit | Actual evidence | Status |
|---|---:|---|---|
| `vitest run kael-emergency-signal-matrix-pillar.test.ts kael-emergency-routing-pillar.test.ts kael-case-emergency-intake-pillar.test.ts` | 0 | P405 235, P401 32, P406 36 = 303 passed | PASS |
| Same suites with the new rows only, before each source fix | 1 | 1 (bleeding guard), 2 (aftermath, cooking smoke), 5 (review misses), 6 (recall gaps) red in four rounds | EXPECTED RED |
| Mutation runs: gate off, gate behind the playbook flag, tone check off, contrast split off, loose third-party rule, one extra playbook word, confirm site off, create site off | 1 | 17, 11, 15, 1, 3, 1 (plus `lint:playbooks` exit 1), 1 and 1 red; every source restored byte-identical | PASS |
| `pnpm test:api` | 0 | Vitest 188 files passed, 2 skipped; 2,776 tests passed, 6 skipped (was 2,504). Node contracts 114 passed, 1 skipped. A mid-session full run under heavier load timed out two 5 s tests (P398 R23, the synthetic terminal-transaction proof), both green in isolation and in the final run; its third failure, P398 R17, was a real conflict with the new gate and was fixed by deferring to the flagged path | PASS |
| `pnpm test:mobile` | 0 | 284 suites, 2,631 tests passed (no mobile file changed; run because a new server reply variant reaches the app) | PASS |
| `pnpm type-check:api` / `pnpm type-check:mobile` | 0 / 0 | no diagnostics | PASS |
| `pnpm edge:check` (the only supported arguments are repeated `--only <function>`; none given, so all seven) | 0 | Pinned Deno container: `discovered=7 selected=7 checked=7 failed=0` (kael-learning-monitor, kael-matching-maintainer, kael-media-retention, mobile-api, payment-maintainer, system-monitor, sepay-webhook) | PASS |
| `pnpm lint:structure`, `lint:comments`, `lint:playbooks`, `lint:test-collection`, `harness:pillars:check`, `lint:workplan`, `lint:edge-db`, `harness:migrations:check`, `lint:baseline`, `git diff --check` | 0 | structure ok 1,452 files; 401 pillars; 463 migrations; baseline no weaker; `lint:edge-db` scanned offline only | PASS |
| `pnpm lint:authority` | 1 | One violation, unchanged: `apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31` cites Plan §3.4. `governance/Plan.md`, that file and the checker are identical to `ce4bd3cd`, so the failure pre-dates this work. Not suppressed, not edited | FAIL (pre-existing) |

### Findings not fixed (and why)

| Finding | Severity | Reproduction | Why left |
|---|---|---|---|
| `scripts/harness/evaluate-release.mjs` turns a `null` unmeasured cost into `0` (`Number(null)` is finite) when it aggregates samples | P2 | `aggregateEvaluationSamples` on `costPerCaseUsd: null` returns mean 0 | Release-control code outside W02's owner file; a real fix needs a decision on null propagation and thresholds. Live-shadow summaries are not release evidence today |
| A chat turn is refused with 409 while a booking intake confirmation is pending, so an emergency typed in that window is not answered until the customer confirms | P2 | Source read of `assertIntakeConfirmationCompleted` | Changing it adds a flow step the owner has not asked for |
| Flagged non-electrical service paths answer a smoke or wiring hazard with their own text, which names no emergency number | P2 | `deterministicSafetyGuidance` hvac/upholstery/handyman branches | Existing tests pin that behaviour (P398 R17); the gate defers to it rather than duplicate it |
| `mobile-api-kael-intake-observation.test.ts` and similar files are not collected by any runner | P2 | `vitest run` reports no test file | Pre-existing; the two lines edited there carry no evidence |

**SAFETY / PRIVACY:** An emergency reply is fixed server text, never raw model output; it writes one turn row and restores the session, creating no Job, quote, match or payment (`unexpectedWrites` empty in every case). No raw ID, text or phone number reaches the new log line. Authorization is unchanged: the owner check runs before the gate and refused actors write nothing.
**COST:** actual_calls=0; actual_usd=NOT_RUN; approval_ref=none.
**ROLLBACK:** Revert the files named in SCOPE (all uncommitted, nothing external changed). No migration, RPC, contract, secret or flag was touched.
**LIMITS:** T0 only. Hosted Edge and database parity were not queried (Production is a separate approval lane); the fix is not deployed. No real-model run, no T1/T2 stack, no device. The classifier is a bounded rule set with a documented matrix, not a guarantee against unseen wording.
**OUTCOME:** W00 VERIFIED, W01 VERIFIED (T0), W02 VERIFIED (T0), W03 VERIFIED (T0). KAWA_01 is eligible for owner acceptance at T0 and not for any T1/T2/T3 claim.
**NEXT:** Stop. KAWA_02 requires a new instruction.

## Checkpoint CLOSURE-01 — Strict final closure review (2026-10-21)

**TASK_ID:** CLOSURE-01 — continuation of REMEDIATION-01 after an owner review rejected the first T0 closure
**BASELINE:** branch `codex/kawa-foundation-safety-20261020`; HEAD `0f3b2e2b` (published); base `ce4bd3cd`; tree dirty with AUDIT-01, REMEDIATION-01 and this checkpoint. Nothing is committed, pushed, merged or deployed.
**AUTHORIZATION (owner, this session):** resolve the remaining W01 defects, verify electrical playbook v3, audit `evaluate-release.mjs` without changing release-control behavior, and return an auditable package. No commit, push, PR, merge, deploy, hosted database change, new secret, flag change, paid call or KAWA_02 was authorized and none occurred.
**SCOPE:** W00–W03. Plan.md still has no KAWA section; no parallel plan was created. `.scratch/work-plan.json` gained slice `KAWA01-strict-closure`.
**EVIDENCE_TIER:** T0 (deterministic tests, an in-memory PostgREST stand-in, a local pinned-container compile of the seven Edge functions). No real Postgres, RLS, device, hosted Edge or live model ran. Nothing here is T1, T2 or T3 evidence.
**SUPERSEDES:** the OUTCOME of REMEDIATION-01. Its A2 closure was incomplete: it said the gate sat ahead of every caller that matters, but the evidence route (P1d) had none.
**REVIEW:** this checkpoint was reviewed by the author only. No separate reviewer or agent was used, so it is NOT independently reviewed.

### Findings and closure

| ID | Finding | Root cause | Fix | Evidence (red → green, mutation) |
|---|---|---|---|---|
| P1a | An emergency typed while a booking intake confirmation is pending returned 409 `INTAKE_CONFIRMATION_REQUIRED` and was never answered | `assertIntakeConfirmationCompleted` runs inside `persistIncomingKaelChatTurn` (`turn.ts`) and at the top of `evidence.ts`, before any emergency check | `answerEmergencyBeforeIntake` answers a reported emergency first, records what the customer said, leaves `intake_confirmation` byte-identical, and only for a reported emergency; every other message keeps the 409 | P407 reproduced 11 red on unchanged source (409 across six services, hazard, flags, kill switch, replay, failed write) and 13 existing guard rows stayed green; now green. Mutations: gate skipped while pending 10 red; reply confirms the intake 14 red; customer turn not recorded 6 red; deferral reused for the parked case 1 red |
| P1b | A booking whose description reports an emergency waited for the customer to press confirm before any guidance | `create.ts` returns before `advanceInitialKaelChatAnalysis` when a confirmation is pending or analysis is deferred | `processInitialKaelChatMessage` answers a reported emergency from the message and the confirmation description before it returns; the confirmation stays pending | P407 10 red with the old `create.ts`, green with the fix |
| P1c | The `price_question` chip dropped an emergency message with a 200 and no reply | Early return at the top of `sendKaelChatTurn` | The same parked answer runs before that return | P407: mutation 1 red |
| P1d | **Missed in REMEDIATION-01.** The evidence route (`POST /kael/chat/:id/evidence`) had no emergency gate: a message, skip reason, voice transcript or text note went to the pipeline and a model was called | `evidence.ts` calls `advanceKaelChatEstimate` directly; the earlier trace stopped at turn, create and confirm | `resolveCaseEmergency` over the message, skip reason, transcript and reviewed notes before the pipeline; pending variant included; P407 scans every caller of `advanceKaelChatEstimate` for the gate so a fifth caller cannot skip it | P406 7 red on unchanged source, text note 1 red; mutations: gate removed 10 red, pending variant removed 2 red, text note ignored 1 red |
| P1e | Review finding: a parked reply could move a `collecting_evidence` Case to `active` | `appendKaelSystemTurn` sets the status | The status is put back | P407 1 red → green; mutation 1 red |
| P2 | Fuel-gas (LPG) leaks were not an emergency at all, and a gas stove message could be declined as an unsupported service (`bep ga` is out of scope) without any safety text | Gas was deliberately not a cue because Vietnamese calls HVAC refrigerant "gas" too | New `gas` route: 114, no flame, no switch, leave, call from a safe place. Fuel gas needs an object (stove, cylinder, pipe, hose, valve, `khí đốt`, LPG), a smell of gas, or an English "gas leak". A bare `rò/xì/hở gas` is refrigerant when AC words are present or the service is HVAC, fuel gas with a kitchen word, and otherwise asks the national line (112). Tone rules reject gà, họ, rõ, dày, ông. Detector, alarm and inspection phrases are not reports | P405 43 red on the unchanged classifier, then green; 56 gas rows across P401, P405, P406 and P407 red with the pre-gas classifier restored, then green; 12 mutations red (two survived at first and led to sharper rows). An independent 79-phrase probe found 4 misses, all fixed and added as rows |
| P3 | Electrical playbook v3 verification | — | See the playbook table | — |
| P4 | `aggregateEvaluationSamples` turns a `null` or `''` metric into a measured 0 (`Number(null)`), `true` into 1, and `buildEvaluationReport` fills a missing metric with `?? 0`, so an unmeasured cost or latency passes the ratchet as an improvement | `Number(x)` plus `Number.isFinite`, and `?? 0` | **Proposed only; `scripts/harness/*` is unchanged.** See the diff below | Proposed tests: 3 red on the original module, 11 of 11 green on a throwaway patched copy (deleted) |
| W02 | The playbook evaluator's `source_tree_hash` did not cover the emergency gate | `SOURCE_FILES` listed `turn.ts`, `create.ts` and `evidence.ts` but none of the files that decide an emergency reply | Five paths added to `kael-playbook-eval.mjs`; P402 asserts they are listed and that every listed path exists | 1 red → green |
| W03 | Privacy re-audit | — | The hash stays withheld for every `EMERGENCY_*` code, including the new `EMERGENCY_GAS` and `EMERGENCY_ELECTRICAL_WATER`, now pinned in P403. The log line carries the route code only | P403 |

### Electrical playbook v3

| Check | Result |
|---|---|
| Version consistency | Runtime constant, textbook runtime note, addendum and registry pins all name `electrical-playbook-2026-10-20.v3`. Every remaining v2 mention is historical: the mock fixture, two older test constants, the 2026-07-16, 2026-08-27 logs and Plan §52/§53 |
| Appendix A ↔ runtime | `pnpm lint:playbooks` exit 0 for six services. The registry pillar asserts each of the four hazard lines equals `deterministicSafetyGuidance` verbatim and names 114, 115 and 112 |
| Hashes | Tool: `node apps/api/scripts/kael-playbook-eval.mjs --mock apps/api/scripts/fixtures/kael-playbook-eval-mock.json --label kawa01-v3-mock --date 2026-10-21 --repetitions 3 --allow-failures --service electrical` reported `playbook_hash sha256:521c4d4ead5a1eb4bc1aeaed1b98982bdfc5277be30a912e8dca18b9facc0a1a`, equal to `sha256sum` of `playbooks/electrical.ts`. `docs/playbooks/services/electrical.md` is `7399b80c19b069e795de050b8b4f720771d10f6aee55ff6218bde79950e4d1e0`. Both are working-tree (CRLF/LF as checked out) hashes, unchanged since REMEDIATION-01. The run's three output files were deleted; the run is reproducible from the command |
| Regression contracts | Registry pillar and service-playbook-safety pillar 10 passed. Two files outside collection, `kael-playbook-eval-core.test.ts` and `mobile-api-kael-intake-observation.test.ts`, were run explicitly with a throwaway config: 83 passed |
| History | No file under `docs/test-logs` other than this ledger was changed; the v2 evaluation reports are intact |
| Pending | Domain review of the 115/112 wording, and any live or staged evaluation of v3, are NOT done. The §52/§53 measurements describe v2 only. Flags unchanged (off) |

### Proposed fix for `scripts/harness/evaluate-release.mjs` (NOT applied; release-control code)

Affected consumers: the evaluation ratchets for `p95_latency_ms` and `mean_cost_usd` (10% regression), the signed `aggregate` block of every report, `scripts/harness/verify.mjs` and the `plan55-postreceipt-finalization` workflow (both run deterministic samples, whose latency and cost are true zeros today, so no current bypass), and `promotion.mjs` (its abort thresholds use other metric names and already fail closed on a missing metric). Live layers take cost and latency from strictly validated live samples and are not affected for those two metrics.

```diff
@@ aggregateEvaluationSamples
-    const values = samples.map((sample) => Number(sample.metrics?.[name])).filter(Number.isFinite)
+    const values = samples.map((sample) => sample.metrics?.[name]).filter(isMeasuredNumber)
@@ buildEvaluationReport, non-live canonical samples
-      latencyMs: finiteNumber(sample.metrics?.latencyP95Ms),
-      costUsd: finiteNumber(sample.metrics?.costPerCaseUsd),
+      latencyMs: measuredNumberOrNull(sample.metrics?.latencyP95Ms),
+      costUsd: measuredNumberOrNull(sample.metrics?.costPerCaseUsd),
@@ buildEvaluationReport, metrics
-    service_accuracy: aggregate.metrics.serviceAccuracy?.mean ?? 0,
-    decline_precision: aggregate.metrics.declinePrecision?.mean ?? 0,
-    price_band_hit_rate: aggregate.metrics.priceBandHitRate?.mean ?? 0,
-    p95_latency_ms: liveMetrics?.p95_latency_ms ?? aggregate.metrics.latencyP95Ms?.mean ?? 0,
-    mean_cost_usd: liveMetrics?.mean_cost_usd ?? aggregate.metrics.costPerCaseUsd?.mean ?? 0,
+    service_accuracy: measuredNumberOrNull(aggregate.metrics.serviceAccuracy?.mean),
+    decline_precision: measuredNumberOrNull(aggregate.metrics.declinePrecision?.mean),
+    price_band_hit_rate: measuredNumberOrNull(aggregate.metrics.priceBandHitRate?.mean),
+    p95_latency_ms: liveMetrics?.p95_latency_ms ?? measuredNumberOrNull(aggregate.metrics.latencyP95Ms?.mean),
+    mean_cost_usd: liveMetrics?.mean_cost_usd ?? measuredNumberOrNull(aggregate.metrics.costPerCaseUsd?.mean),
@@ replace finiteNumber
-function finiteNumber(value) {
-  return Number.isFinite(Number(value)) ? Number(value) : 0
-}
+function isMeasuredNumber(value) {
+  return typeof value === 'number' && Number.isFinite(value)
+}
+
+function measuredNumberOrNull(value) {
+  return isMeasuredNumber(value) ? value : null
+}
```

Behavior change the owner must accept: a report whose cost, latency or accuracy was never measured now fails its ratchet (`metric_missing`) instead of passing as a zero; the first baseline must be a fully measured report. Reproduction before the fix (aggregate over two samples): `null,null` → count 2, mean 0; `null,0.02` → mean 0.01; `''` → 0; `true` → 1 (mean 0.51); `[]` → 0; a missing key or `'abc'` is excluded. With a real baseline of 0.02, a report with `costPerCaseUsd: null` or no key had `mean_cost_usd` ratchet `pass (actual=0)`, and the same for latency; a missing accuracy failed. The three proposed tests, added to `scripts/harness/evaluate-release.test.mjs` once the fix is authorized (they fail on the current module and pass on the patched copy):

```js
test('an unmeasured metric is not averaged in as zero', () => {
  const costs = (values) => aggregateEvaluationSamples(values.map((value) => ({
    ...sample,
    metrics: { ...sample.metrics, costPerCaseUsd: value },
  }))).metrics.costPerCaseUsd
  assert.deepEqual(
    [costs([0.02, 0.02]).count, costs([0.02, 0.02]).mean],
    [2, 0.02],
  )
  assert.deepEqual(
    [costs([0, 0]).count, costs([0, 0]).mean],
    [2, 0],
    'a measured zero stays a zero',
  )
  for (const unmeasured of [null, '', false, [], 'abc', true, Number.NaN]) {
    const summary = costs([unmeasured, 0.02])
    assert.equal(summary.count, 1, `${JSON.stringify(unmeasured)} is not a measurement`)
    assert.equal(summary.mean, 0.02)
  }
  const none = costs([null, null])
  assert.equal(none.count, 0)
  assert.equal(none.mean, null)
})

test('an unmeasured cost, latency or accuracy fails the ratchet instead of passing as a zero improvement', () => {
  const run = (metrics, baseline = null) => buildEvaluationReport({
    config,
    evidenceClass: 'deterministic',
    evaluatorId: 'kael-deterministic-v1',
    samples: [{ ...sample, metrics }],
    assurance,
    release,
    versions,
    baseline,
  })
  const measured = { ...sample.metrics, latencyP95Ms: 100, costPerCaseUsd: 0.02 }
  const baseline = (({ reportId, metrics }) => ({ reportId, metrics }))(run(measured))
  const ratchetOf = (report, metric) => report.gates.ratchets.find((gate) => gate.metric === metric)

  assert.equal(ratchetOf(run(measured, baseline), 'mean_cost_usd').passed, true)
  assert.equal(ratchetOf(run({ ...measured, costPerCaseUsd: 0.04 }, baseline), 'mean_cost_usd').passed, false)
  for (const [metric, field] of [['mean_cost_usd', 'costPerCaseUsd'], ['p95_latency_ms', 'latencyP95Ms'], ['service_accuracy', 'serviceAccuracy']]) {
    for (const value of [null, undefined]) {
      const report = run({ ...measured, [field]: value }, baseline)
      const gate = ratchetOf(report, metric)
      assert.equal(gate.passed, false, `${metric}=${String(value)} must not pass`)
      assert.equal(gate.status, 'metric_missing')
      assert.equal(report.metrics[metric], null)
    }
  }
})

test('a deterministic report whose cost was never measured cannot be the first baseline either', () => {
  const report = buildEvaluationReport({
    config,
    evidenceClass: 'deterministic',
    evaluatorId: 'kael-deterministic-v1',
    samples: [{ ...sample, metrics: { ...sample.metrics, costPerCaseUsd: null } }],
    assurance,
    release,
    versions,
  })
  assert.equal(report.gates.ratchets.find((gate) => gate.metric === 'mean_cost_usd').passed, false)
  assert.equal(report.status, 'failed')
})
```

### Commands and evidence

| Command | Exit | Actual evidence | Status |
|---|---:|---|---|
| `vitest run` P407 on unchanged source | 1 | 11 failed, 13 passed (the 13 are the guard rows for the existing 409, cross-actor, abandoned and confirm paths) | EXPECTED RED |
| `vitest run` P406 evidence rows on unchanged source | 1 | 7 failed, 2 passed; the pipeline ran and a model was called for an emergency message | EXPECTED RED |
| P407 create rows with the pre-closure `create.ts` temporarily restored | 1 | 10 failed, 1 passed; file restored byte-identical | EXPECTED RED |
| P405 gas rows on the unchanged classifier | 1 | 43 failed, 276 passed | EXPECTED RED |
| gas rows in P401, P405, P406, P407 with the pre-gas classifier restored | 1 | 56 failed; files restored byte-identical | EXPECTED RED |
| P402 source-hash rows on the unchanged evaluator | 1 | 1 failed | EXPECTED RED |
| Closure review rows (`collecting_evidence`, non-pending text note) on unfixed source | 1 | 2 failed | EXPECTED RED |
| Mutations for P1 (turn gate skipped while pending, chip skipped, reply confirms the intake, evidence gate removed, evidence pending variant removed, customer turn not recorded, flagged-path deferral reused, create site removed) | 1 each | 10, 1, 14, 10, 2, 6, 1, 10 red; two survivors (chip row ran in a pending world; the in-memory table does not enforce a unique `turn_index`) were fixed and re-killed; sources restored byte-identical | PASS |
| Mutations for P2 (refrigerant context ignored for a bare leak and for a smell, HVAC service rule off, bare leak read as fuel gas, gas-word tone rules off, `gas lạnh` exclusion off, detector phrases off, service context not passed in the Case gate and in the assistant, an approach-the-leak step added to the text, gas+fire sent to 112, negation inside an object phrase) | 1 each | 8, 1, 2, 6, 3, 1, 3, 1, 1, 1, 1, 1 red; two survivors (`gas lạnh`, assistant service context) fixed and re-killed | PASS |
| Mutations for closure fixes (`collecting_evidence` not kept, text note ignored) | 1 each | 1 and 1 red | PASS |
| Independent probe of 79 gas, refrigerant and collision phrases | 0 | 4 mismatches, all fixed and added as rows; after tuning it is no longer independent for those four. A timing probe at 5,000 characters: worst input 14.1 ms | PASS |
| `pnpm lint:playbooks` | 0 | six services; Appendix A equals the runtime segment | PASS |
| `node apps/api/scripts/kael-playbook-eval.mjs --mock apps/api/scripts/fixtures/kael-playbook-eval-mock.json --label kawa01-v3-mock --date 2026-10-21 --repetitions 3 --allow-failures --service electrical` | 0 | `playbook_hash sha256:521c4d4e…0a1a` = `sha256sum` of `playbooks/electrical.ts`; output files deleted; fixture replay only, "After: NOT RUN" | PASS |
| Two uncollected playbook test files run with a throwaway config | 0 | 83 passed (`kael-playbook-eval-core.test.ts`, `mobile-api-kael-intake-observation.test.ts`) | PASS |
| `node --test` of the proposed `evaluate-release` tests on throwaway copies | 1 / 0 | 3 failed of 11 on the original module; 11 of 11 on the patched copy; every copy deleted; `scripts/` unchanged | PASS (proposal) |
| `pnpm type-check:api` / `pnpm type-check:mobile` | 0 / 0 | no diagnostics | PASS |
| `pnpm edge:check` (no arguments; the script accepts only repeated `--only <function>`) | 0 | pinned Deno container, `discovered=7 selected=7 checked=7 failed=0`: kael-learning-monitor, kael-matching-maintainer, kael-media-retention, mobile-api, payment-maintainer, system-monitor, sepay-webhook | PASS |
| `pnpm test:api` | 0 | Vitest 189 files passed, 2 skipped; 2,947 tests passed, 6 skipped (was 2,776). Node contracts 115 tests: 114 passed, 0 failed, 1 skipped | PASS |
| Collected pillar counts (JSON report) | 0 | P401 37, P402 7, P403 13, P405 324, P406 60, P407 49, registry pillar 7; 497 passed, 0 failed | PASS |
| `pnpm test:mobile` | 0 | 284 suites, 2,631 tests passed (no mobile file changed; run because a new Kael reply now exists while a confirmation card is pending) | PASS |
| `pnpm lint:structure`, `lint:comments`, `lint:playbooks`, `lint:test-collection`, `harness:pillars:check`, `lint:workplan`, `lint:edge-db`, `harness:migrations:check`, `lint:baseline`, `git diff --check` | 0 | structure ok 1,452 files; 463 migrations; baseline no weaker; `lint:edge-db` scanned offline only; workplan 8 slices closed | PASS |
| `pnpm lint:authority` | 1 | One violation, unchanged: `apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31` cites Plan §3.4, which exists in neither `Plan.md` nor the archive. `Plan.md` and that file are identical to `ce4bd3cd`. Not suppressed, not edited | FAIL (pre-existing) |

### Residual risks (not fixed, and why)

| Risk | Severity | Reproduction or reason |
|---|---|---|
| `evaluate-release.mjs` null-to-zero coercion | P2 | Reproduced above; release-control code, needs owner authorization |
| The mobile composer is hidden while a booking confirmation is pending (`showComposer` false), so a customer in the shipped app cannot type into that window; the server now answers, but the confirmation card has no emergency affordance | P2 | A UI change is a flow change and was not requested. How an emergency reply renders above the card was not seen on a device |
| After a create-time emergency reply the guidance is repeated when the customer confirms | P2 | Deliberate: the confirm is a new decision point. A shared flag would suppress the repeat |
| A chat turn that carries an invalid schedule is rejected with 400 before the emergency check | P2 | `validateFutureHcmcSchedule` runs before the session is loaded; the mobile app does not send schedule fields on chat turns |
| Voice-only turns while a confirmation is pending (no message text, only evidence items) are still refused with 409 on the turn route | P2 | The evidence route is covered; the turn route's transcript needs evidence validation first |
| Flagged non-electrical hazard text names no emergency number | P2 | Existing behavior pinned by P398 R17 |
| LPG guidance text is new safety copy | P2 | Built only from the steps shared by the sources found (no flame, no switch, leave, call from a safe place); it omits closing the valve and opening windows because both need approaching the leak. Awaits domain review. 114 for a gas leak is supported by a Vietnamese media article, not by a regulation text |
| `lint:authority` fails on one pre-existing violation | pre-existing | `apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31` cites Plan §3.4; unchanged from `ce4bd3cd`; not touched |
| Case-intake behavior was run against an in-memory stand-in, not real Postgres or RLS | P1 for any T1 claim | No Docker database ran |
| Nothing is deployed; hosted Edge and database parity were not queried | P1 for any production claim | Production is a separate approval lane |

**COST:** actual_calls=0; actual_usd=NOT_RUN; approval_ref=none.
**ROLLBACK:** revert the files listed by `git status` (all uncommitted). No migration, RPC, contract, secret or flag was touched. The playbook flag is off by default, so rolling back v3 changes nothing at runtime.
**NEXT:** Stop. KAWA_02 requires a new instruction.

## Checkpoint REMEDIATION-02 — Audit findings remediation (2026-10-21)

**TASK_ID:** REMEDIATION-02 — "KAWA_01 — Audit Findings Remediation", after an independent audit rejected the CLOSURE-01 closure
**BASELINE:** branch `codex/kawa-foundation-safety-20261020`; HEAD `8a8765e9` (evidence-only commit on `0f3b2e2b`, already published at the owner's request); base `ce4bd3cd`. All source work of this checkpoint is uncommitted. Nothing here is committed, pushed, merged or deployed.
**AUTHORIZATION (owner, this session):** investigate and fix the eight listed audit items inside KAWA_01. No commit, push, PR, merge, deploy, hosted database change, migration, protected RPC change, release-control change, secret, flag change, spending or KAWA_02 was authorized and none occurred. `scripts/harness/*` is untouched.
**SCOPE:** W01 safety (items 1–5), W02/W03 (items 6–8). `.scratch/work-plan.json` gained slice `KAWA01-audit-remediation`; Plan.md was not changed.
**EVIDENCE_TIER:** T0 only (deterministic tests, an in-memory PostgREST stand-in, a pinned-container compile of the seven Edge functions). No real Postgres, RLS, device, hosted Edge or live model ran. Nothing here is T1, T2 or T3 evidence.
**INPUT CAVEAT:** the audit report itself was not supplied. The eight items in the instruction were treated as investigation inputs and each one was reproduced before it was fixed; no finding is claimed to match the auditor's own wording.
**SUPERSEDES:** the OUTCOME of CLOSURE-01 and its residual "voice-only turns while a confirmation is pending are still refused with 409" (now answered). The mock-evaluator rows of CLOSURE-01 and earlier checkpoints that say PASS mean "the replay ran", not model quality (see item 8).
**REVIEW:** reviewed by the author only. No separate reviewer or agent was used, so this checkpoint is NOT independently reviewed.

### Classification (item 8): defect or documentation/evidence issue

| Kind | Items |
|---|---|
| Genuine product or code defect | 1 voice-transcript bypass, 2 no cross-field aggregation, 3 classifier false negatives and false positives, 4 partial-write poisoning, 6 hash coverage, 7 emergency answer outside the observability contract |
| Evidence or documentation issue | stale test counts (INDEX row at 2,479), mock-evaluator rows labelled PASS, digest manifest self-reference risk, undefined holdout methodology |
| Verified, no defect found | 5 authorization, Case state, no business writes, no provider call (now pinned by tests) |

### Findings and closure

| # | Root cause | Smallest correction | Evidence (old implementation → new) |
|---|---|---|---|
| 1 | The gate read `input.message` only. A reviewed voice transcript, text note, evidence summary, skip reason or booking description reached the pipeline and a model, or on the pending/price-question paths was refused or dropped | `customerAuthoredTexts` collects every customer-authored text once; `turn.ts`, `evidence.ts`, `create.ts` and `intake-confirmation.service.ts` read it through `resolveCaseEmergency` before any model, evidence consumption or phase change. A voice-only Case is checked too. Parked requests (pending booking confirmation, deferred analysis, price-question chip) answer every route | P408 (44 tests): 35 red on the pre-remediation code, 44 green. P407 49 and P406 59 of 60 stayed green on the old code (they pin earlier behavior); P406's log row changed and was the 1 red |
| 2 | Each text was classified alone, so a wiring hazard in one field and gas in another never combined | Each text is read for signals, the readings are unioned, and the same combination rule is applied (gas + fire or wiring → gas; other mixes → 112; fire + wiring → wiring) | P408: five field pairs, plus a 36-pair check that two fields give exactly the route of the same two sentences in one text, in either order; first-field-wins mutation 23 red |
| 3 | Reproduced false negatives (smoke, fainting, forced entry, water at wiring, gas hose, "which number") and false positives (cooking smoke, refrigerant tubing, "collapsed" as a transitive verb, negation words that collide with other words) | New cues, a cooking/candle guard, refrigerant-versus-fuel object scoping, negation spelling check using the accented twin, tone rules that ignore filler words | See the holdout table. P405 332 tests (7 red on the old classifier), P410 20 tests (5 red on the old classifier) |
| 4 | A failed second write leaves a customer row that the session counter does not count, and `kael_chat_turns` is unique on `(session_id, turn_index)`, so every retry collides | Inside the existing tables: read the tail, reuse a stranded identical customer turn, finish a complete-but-uncounted exchange by updating the counter only, insert after `max(counted, tail)`, one bounded retry, one session update that keeps status, phase and estimate time | P409 (10 tests): 10 red on the old code, 10 green; mutations on tail index, reuse, retry, status, estimate time and recognition all red |
| 5 | Verification | The owner check runs before the gate; refused actors write nothing; the reply is fixed server text; `unexpectedWrites()` is empty and no model purpose is called in every emergency test | P408 refused-actor rows (strangers, wrong role), P407, P409 |
| 6 | `SOURCE_FILES` listed turn, create and evidence but not what decides an emergency reply (and the list was a hand-kept set) | 70 listed paths; the hash code moved to `apps/api/scripts/lib/kael-playbook-source-hash.mjs` so the test uses the production implementation. P402 derives the required set from the code: every file that calls an emergency resolver or collector plus its direct imports must be listed, sorted and unique, each must exist, and the list stays under the manifest cap of 100 | P402 13 tests (1 red on the old evaluator). Sensitivity rows: one byte of any hashed file changes the hash; rename, removal, addition change it; order and repeats do not; the algorithm equals the named `sha256_path_and_file_sha256_v1`; swapped texts differ. Mutations: path ignored, order-dependent, content ignored, trace module dropped from the list, all red |
| 7 | The emergency answer produced no trace | Additive inside `kael_turn_trace.v1`: route `case_emergency`, stage `emergency_gate`, outcomes `emergency_stop` and `emergency_advice`, `gate_entry` (turn, evidence, create, confirm), `emergency_gate_version`, `permission_reason` `EMERGENCY_<ROUTE>`. The correlation id comes from the HTTP layer for every request; release and client identity ride along; no text, no actor hash for `EMERGENCY_*`. `summarizeCaseEmergencyTraces(traces, evaluatedTurns)` counts by route, entry and outcome and returns a rate of `null`, never 0, when there is no valid sample or the denominator is smaller than the count | P403 28 tests (14 red on the old module), P408 trace rows, P406 log row. Mutations: hash linked to a code, empty sample as 0, denominator below the count, outcome always stop, entry or version dropped, all red |
| 8 | Evidence hygiene | This table; mock rows relabelled; counts reconciled; manifest below | — |

### Holdout measurements (item 3)

Each set was written before the fixes of its round, run once against the then-current classifier, and the first-run result was recorded unedited. A set that guided a fix became a development set and is no longer evidence of generalization. "Clear" rows are those with an unambiguous expected route (or none); "judgement" rows are borderline and are informational only.

| Set | First run, clear rows | False negatives | False positives | Wrong route | Judgement rows matching my expectation |
|---|---|---:|---:|---:|---|
| H1 | 72 / 88 | 14 | 1 | 1 | 2 of 12 |
| H2 | 46 / 62 | 14 | 2 | 0 | 2 of 8 |
| H3 | 49 / 66 | 17 | 0 | 0 | 2 of 4 |
| H4 | 38 / 53 | 14 | 1 | 0 | 2 of 5 |

After the fixes every development set passes 100 % of its clear rows (P410). That figure says nothing about unseen wording. The honest estimate of generalization is the first run: 72 % to 82 % of the clear rows were right on an unseen set, and where recall was split out (H3, H4) only about 54 % and 53 % (16 of 30) of the genuine emergencies were caught, with specificity 100 % (H3) and 22 of 23 (H4). The sets are small, so these figures are imprecise. Two rows (H1-008, H2-002) were mislabelled by me and are marked disputed with the reason; their first-run output is kept. A sealed set H5 of 63 rows exists in `fixtures/emergency-phrases/sealed-h5.json` and was never run; the re-auditor should evaluate it once, first, and report the result as is. The judgement rows are owner decisions, not defects.

### Mutation run

35 mutants of the new code across P402, P403, P405, P407, P408, P409 and P410. First pass: 31 killed, 4 survived (a parked reply that does not end the turn, the price-question chip not parked, persisted safety signals read from the first text only, the refrigerant object check). Each survivor was reproduced, a test written for it (a wiring phrase sent with the price-question chip and the trace outcome, a direct `stopsTurn` check for parked requests, a persisted-signal row for a later field, a refrigerant-tubing row in services without the air-conditioning rule), and re-run: all four now red. Final: 35 of 35 killed. Sources were restored byte-identical after every mutation (hashes compared).

### Commands and evidence

| Command | Exit | Actual evidence | Status |
|---|---:|---|---|
| New and extended pillars run on the pre-remediation implementation (nine source files and the evaluator swapped to their saved copies, then restored; sha256 before and after identical) | 1 | P408 35 red / 9 green, P409 10 / 0, P410 5 / 15, P405 7 / 325, P402 1 / 12, P403 14 / 14, P406 1 / 59; P407 and P401 0 red (they pin earlier behavior). 73 red in total | EXPECTED RED |
| The same files on the new implementation | 0 | P408 44, P409 10, P410 20, P405 332, P402 13, P403 28, P406 60, P407 49, P401 37, registry 7: 600 passed, 0 failed | PASS |
| Mutation runner (35 mutants) | 0 | 35 of 35 killed after the four survivors were fixed | PASS |
| `pnpm type-check:api` / `pnpm type-check:mobile` | 0 / 0 | the first API run found two implicit-any parameters in P402, fixed; clean afterwards | PASS |
| `pnpm edge:check` | 0 | `discovered=7 selected=7 checked=7 failed=0`. A first attempt exited 1 with `checked=0` because Docker Desktop had stopped; it was rerun with Docker up | PASS (after a failed first attempt) |
| `pnpm test:api` | 0 | Vitest 192 files passed, 2 skipped; 3,050 tests passed, 6 skipped. Node contracts 115 tests: 114 passed, 0 failed, 1 skipped | PASS |
| `pnpm test:mobile` | 0 | 284 suites, 2,631 tests passed (no mobile file changed) | PASS |
| `pnpm lint:structure`, `lint:comments`, `lint:playbooks`, `lint:test-collection`, `harness:pillars:check`, `lint:edge-db`, `harness:migrations:check`, `lint:baseline`, `git diff --check` | 0 | structure ok 1,452 files; 463 migrations; baseline no weaker; `lint:edge-db` scanned offline only | PASS |
| `pnpm lint:workplan` | 1 then 0 | failed first because twelve new files were outside every slice; slice `KAWA01-audit-remediation` added; 9 slices closed | PASS |
| `pnpm harness:pillars:write` | 0 | registry regenerated; the check passes | PASS |
| `node apps/api/scripts/kael-playbook-eval.mjs --mock apps/api/scripts/fixtures/kael-playbook-eval-mock.json --label kawa01-remediation-mock --date 2026-10-21 --repetitions 3 --allow-failures --service electrical` | 0 | fixture replay only: `playbook_hash sha256:521c4d4e…0a1a` (unchanged), 71 `source_files`, `source_tree_hash sha256:704cc6af508f4269880797f80dba027e654125dced70d1686f4f54e9f7ab2b87`; outputs deleted. This is NOT a model-quality result and `--allow-failures` exit 0 proves nothing about quality | REPLAY ONLY |
| `pnpm lint:authority` | 1 | unchanged pre-existing violation (`normal-chat-suggestions-cache-pillar-test.tsx:31` cites Plan §3.4); not touched | FAIL (pre-existing) |

### Test-count reconciliation

| Checkpoint | Vitest passed | Skipped | Note |
|---|---:|---:|---|
| W00 | 2,467 | 6 | |
| W01 | 2,472 | 6 | |
| W03 final | 2,479 | 6 | the figure still quoted by the `INDEX.md` row; stale, corrected there |
| AUDIT-01 | 2,504 | 6 | |
| REMEDIATION-01 | 2,776 | 6 | |
| CLOSURE-01 | 2,947 | 6 | |
| REMEDIATION-02 | 3,050 | 6 | +103 = P402 +6, P403 +15, P405 +8, P408 +44, P409 +10, P410 +20 |

A first full run in this checkpoint showed 3,049 passed and 7 skipped. Docker Desktop had stopped; the untouched P43 staging-catalog test skips when the local stack is unreachable. With Docker up the full run was repeated and gave the 3,050 and 6 above. All figures are T0 and include no test that reaches a hosted target.

### Proposals for approval (not applied)

1. **Atomic append-exchange RPC and migration.** The in-table mitigation makes a retry recoverable, but exactly-once needs one transaction. Proposal: a security-definer function that locks the session row, checks ownership, inserts the customer row and the reply at consecutive indexes, updates the counter, keeps status, phase and estimate time, and is idempotent on a client message id with a unique index. It needs a contract change for the id and a migration. Not written; protected database semantics are unchanged.
2. **`scripts/harness/evaluate-release.mjs`** null-to-zero fix and tests, as in CLOSURE-01. Still unapplied.
3. **Manifest cap.** The shared attestation contract caps `source_files` at 100; 71 are used. Growing past it needs a contract change.

### Residual risks and limits

| Risk | Severity | Note |
|---|---|---|
| Classifier recall on unseen wording | P1 for any model-quality or field claim | First run on unseen sets: 72 % to 82 % of clear rows right, about 53 % to 54 % of genuine emergencies caught where split out; a bounded rule set, not a guarantee. Sealed set H5 not run |
| Atomicity under concurrent requests | P1 for T1 | In-memory stand-in only; no real constraint or lock behavior observed; needs the RPC above |
| Excluded fields | P2 | `apartment_access_profile`, `address_label` and `problem_chips` are not scanned because they persist across turns and would lock a Case on one old phrase; owner decision |
| Composer hidden while a confirmation is pending | P2 | The server answers; the confirmation card has no emergency affordance; not seen on a device |
| LPG, fire and health wording | P2 | Fixed server copy awaits domain review (including 114 for gas) |
| All behavior ran against an in-memory stand-in | P1 for T1/T2 | No Docker database, RLS, device, hosted Edge or live model |
| `lint:authority` | pre-existing | unchanged from `ce4bd3cd` |

**COST:** actual_calls=0; actual_usd=NOT_RUN; approval_ref=none.
**ROLLBACK:** revert the files listed in the manifest (all uncommitted). No migration, RPC, contract, secret or flag was touched.
**OUTCOME:** W00 VERIFIED (preserved). W01, W02 and W03 are REMEDIATED AT T0 and AWAIT INDEPENDENT RE-AUDIT; they are not claimed closed. T1, T2 and T3 are NOT_RUN.
**NEXT:** Stop. Request an independent re-audit. KAWA_02 requires a new instruction.

## Checkpoint CLOSURE-FINAL — Targeted final remediation (2026-10-21)

**TASK_ID:** CLOSURE-FINAL — "NESTSCOUT KAWA_01 — FINAL CLOSURE EXECUTION", after an independent re-audit of `63c01524`
**BASELINE:** branch `codex/kawa-foundation-safety-20261020`; base and HEAD `63c01524ed6b11bdd059f58c64421d8cbdb79017` (REMEDIATION-02, committed and pushed at the owner's request). All source work of this checkpoint is uncommitted. Nothing here is committed, pushed, merged or deployed.
**AUTHORIZATION (owner, this session):** close the confirmed T0 acceptance blockers inside W00–W03. No commit, push, PR, merge, deploy, hosted database change, new RPC, migration, idempotency contract, release-control change, credential, flag change, paid call, production operation or KAWA_02 work was authorized and none occurred. `scripts/harness/*` is untouched.
**INPUTS READ:** `KAWA_01_Foundation_Safety_Evaluation.pdf` and the Master Plan v1.1 (text extracted locally with `pdftotext`), and the independent re-audit folder (`<auditor-artifacts>`, outside the repository) (H5 first-run log, HTTP probes, concurrency probe, focused and full test logs, a mock playbook run). The auditor's written findings were not supplied; what the probe files show is what was treated as confirmed. Copies of the probe files are in the evidence folder.
**EVIDENCE_TIER:** T0 only (deterministic tests, an in-memory PostgREST stand-in, a pinned-container compile of the seven Edge functions). No real Postgres, RLS, device, hosted Edge or live model ran. Nothing here is T1, T2 or T3 evidence.
**REVIEW:** reviewed by the author only. No separate reviewer or agent was used, so this checkpoint is NOT independently reviewed.

### Confirmed defects, root cause and smallest fix

| # | Defect (baseline `63c01524`, from the auditor's probes and reproduced here) | Root cause | Smallest fix | Red → green |
|---|---|---|---|---|
| 1 | `POST /kael/chat` with an existing `session_id`, no typed `message` and an emergency voice transcript returned 201 with the unchanged chat and no guidance (`voice_only_existing_session`) | `createKaelChat` returned `getKaelChat` for a session id with no message before any gate ran | `answerEmergencyOnOwnedSession`: after the ownership check, read the transcripts, notes, summaries and booking description and answer an emergency with the parked reply; an ordinary request still returns the chat with no write | P411: 19 of 31 red on the first version, 24 of 67 red (P411 + P403) on the old implementation with the final tests, 37 of 37 green |
| 2 | An emergency sent with an invalid schedule got the plain 400 on the turn route, on the create route with a session id, and on a new-Case create (`invalid_schedule_turn`, `invalid_schedule_create`) | The schedule refusal ran before any text was read | `refuseWithEmergencyGuidance`: the same code (`VALIDATION`) and status (400), the deterministic guidance in front of the message, nothing written, nothing created. Only the Case owner gets the guidance (`ownedSessionForRefusal`); anyone else, or a missing Case, gets the plain refusal exactly as before | P411 rows for turn, voice-only create, new-Case create, stranger and missing Case |
| 3 | An emergency sent to an abandoned, confirmed or unsupported Case got the plain 409 (`terminal_status_emergency`) | The closed-status refusal ran before any text was read | The same helper on the turn and evidence routes and the voice-only create: `INVALID_STATUS` 409 with the guidance in front of the message. The terminal guard is not bypassed and a closed Case is never written to | P411 closed-Case rows for turn, evidence (transcript and skip reason), voice-only create, and a stranger's plain 404 |
| 4 | A classified emergency whose reply could not be written became a bare `DB_ERROR` with no guidance and no trace | `answerParkedEmergency` and `answerCaseEmergency` rethrew the raw error | `emergencyWriteFailure`: log a redacted `emergency_write_failed` trace and rethrow the same code and status with the guidance in front of the message | P411 failure rows (parked path, advice path, correlation and release identity, no text, no actor hash) |
| 5 | W02 asks to "prepare a 100-case evaluation blueprint, groups 20/20/15/20/15/10"; none existed | Deliverable never produced | `apps/api/fixtures/kael-eval/evaluation-blueprint-100.json`: six groups, required case fields, `authored_cases: 0`, status `blueprint_only`; the deterministic report now says it is a plan with 0 authored cases and the 99-case suite is not it | P402 +3 blueprint rows and the report row |
| 6 | `source_tree_hash` could be read as binding more than it does | The 70-file list is a curated set; the transitive import closure of the gate callers is 301 files (shared barrels) and the manifest holds 100 | Claim narrowed, not widened: a scope comment above `SOURCE_FILES` and a P402 row that pins it. The classifier closure (`emergency-guidance.ts`, `emergency-signal-text.ts`, 2 files) is proven fully hashed. The manifest already carries `source_scope: local_curated_source_set` | P402 +2 rows |

Classification: items 1–4 are product defects; item 5 is a missing deliverable; item 6 is an evidence-claim issue. Nothing was changed for the reliability items (see below).

### W01 sentinel and negative matrix

The 647 tests of the eleven emergency pillars (P401, P402, P403, P405–P411) pass, including: fire → 114, medical → 115, police → 113, gas, uncertain escalation and unsafe-DIY refusal; negation and cooking-guard negatives; voice-only, multi-field and multi-hazard inputs; refused actors (stranger 404, worker 403, admin 403) writing nothing; pending confirmation left pending; no model call on any emergency path; no Job, quote, match or payment created. The new P411 adds the existing-session voice-only create, the three terminal statuses, invalid schedules, the failure path, and the plain refusal for a non-owner.

### W02 H5 (sealed holdout)

- The auditor's `H5-first-run-63c01524.log` shows `1 passed | 19 skipped` and no metrics. The original first-run metrics were never captured and are **not recovered** by anything in this checkpoint.
- A run on the frozen classifier (`emergency-guidance.ts` and `emergency-signal-text.ts` byte-identical to `63c01524`; H5 sealed hash `80e3e907…` matched; no row used for tuning) is saved as `h5-reproduction.json` with `label: REPRODUCTION`, `independent_validation: false`. It was run twice; the metrics were identical (the second run only fixed a metadata comparison).
- Result on the 59 clear rows: 29 labelled emergencies, 30 labelled non-emergencies. Detected and exactly routed 11 of 29 (recall 37.9 %); missed 18; wrong route 0; false alarms 1; specificity 29 of 30 (96.7 %). Four judgement rows are listed separately and excluded from every rate.
- H5 is no longer a holdout after this run. The classifier was not changed.
- This recall is the most important residual risk of KAWA_01 (see below).

### W03 observability

Case emergency traces now cover four outcomes: `emergency_stop`, `emergency_advice`, `emergency_guidance_only` (a refusal that carried the guidance) and `emergency_write_failed`. Each carries correlation id, gate version, entry, bounded `EMERGENCY_<ROUTE>` reason and release identity; none carries customer text or an actor hash. `summarizeCaseEmergencyTraces` counts each outcome separately, so a refusal or a failure never inflates the answered counts, and the rate stays `null` without a valid denominator. The success response shape and the progress stream are unchanged. A trace is a log line subject to a per-isolate allowance, so a burst can drop log lines; the persisted reply row is the durable record of an answer.

### Reliability boundaries

| Class | Item |
|---|---|
| Confirmed T0 defect, fixed | A failed write lost the guidance and left no trace (item 4) |
| Recoverable limitation | Tail read, stranded-turn reuse, one retry and a single session update (REMEDIATION-02) heal a half-written exchange. The auditor's concurrency probe returned 200/200 with unique turn indexes and a matching counter; two identical messages are still two customer turns, because there is no idempotency key |
| Needs T1 PostgreSQL | Unique `(session_id, turn_index)` under real concurrency, RLS, lock behaviour |
| Needs owner approval (not implemented) | The atomic append-exchange RPC with an idempotency key and a client message id (security-definer, row lock, ownership check, unique index). Exactly-once is **not** claimed from in-memory tests |

### Mutation testing

18 mutants of the new code (guidance dropped from a refusal, refusal trace removed, closed-Case check removed, ownership removed on both paths, failure trace and failure guidance removed, wrapper removed on both write paths, soft flag ignored, description not read, plain new-Case refusal, owner lookup removed, closed-Case text emptied on turn and evidence, outcome mis-counted, vocabulary missing, voice-only text emptied). 17 were killed on the first pass. M11 (booking description not read on a voice-only create) survived, a test was added, and it was killed on the rerun. 18 of 18 killed. Sources were restored byte-identical after each mutant.

### Commands and exit codes (raw logs in `kawa-01-final-closure-evidence/gates/`)

| Command | Exit | Result |
|---|---|---|
| `pnpm type-check:api` (first run) | 2 | 5 implicit-any errors in the new P411 file; fixed |
| `pnpm type-check:api` (after the fix) | 0 | no diagnostics |
| `pnpm type-check:mobile` | 0 | no diagnostics |
| `pnpm edge:check` | 0 | discovered 7, checked 7, failed 0 (Docker running) |
| `pnpm test:api` | 0 | 193 files passed, 2 skipped; 3,097 passed, 6 skipped (was 3,050); node contracts 114 passed, 1 skipped |
| `pnpm test:mobile` | 0 | 284 suites, 2,631 passed |
| `pnpm lint:structure` / `lint:comments` / `lint:playbooks` / `lint:test-collection` / `harness:pillars:check` / `lint:edge-db` / `harness:migrations:check` / `lint:baseline` | 0 each | |
| `pnpm lint:workplan` (first run) | 1 | new files outside every slice; scope extended in the gitignored plan |
| `pnpm lint:workplan` (after) | 0 | 9 slices, 45 files in the read window |
| `git diff --check` | 0 | |
| `pnpm lint:authority` | 1 | existing failure only, unchanged from `ce4bd3cd`; not introduced here |
| Eleven emergency pillars, JSON reporter | 0 | 647 passed, 0 failed, 0 pending |
| `kael-eval.mjs --mode deterministic` | 0 | T0, fixture agreement, `modelAccuracy: null`, n=99; report names the blueprint as a plan with 0 authored cases |
| `kael-playbook-eval.mjs --mock … --allow-failures` | 0 | fixture replay only, not model quality; `source_tree_hash` `2fbb2075…` (was `704cc6af…`, it moved because gate files changed), 71 files, `playbook_hash` unchanged, `deployment_attestation: not_performed`; output files deleted, manifest kept |

Test-count reconciliation: API passes 3,050 → 3,097 (+47) = P411 +37, P402 +5, P410 +3, P403 +2. Skipped stays 6 (the same six as before).

**Unexplained historical run:** the first run after `63c01524` reported 599 passed and 1 failed in the ten pillars. The failing test was not captured, and 7 later runs of the same files (4 sequential, 3 parallel) and one more in this checkpoint all passed. The cause is **unresolved**. No explanation is offered.

### Acceptance matrix (original KAWA_01 criteria only)

| Item | Status | Basis |
|---|---|---|
| W00 reproducible baseline and authority | VERIFIED (preserved) | Earlier checkpoints untouched |
| W01 decision matrix, zero critical sentinel misses | T0 evidence complete for the defined sentinel suite | P405–P411; unseen-wording recall is a separate residual risk |
| W02 truthful taxonomy and provenance | T0 evidence complete | Tier tags, n, denominators, `modelAccuracy: null`, narrowed hash claim, blueprint, H5 labelled REPRODUCTION |
| W03 redacted trace, progress and observability contracts | T0 evidence complete | P403, P404, P408, P411 |
| G0 repository authority | PASS | Locked docs and `scripts/harness/*` untouched |
| G1 isolation | N/A | No T1 used |
| G2 before/after regression evidence | PASS at T0 | Red on the old implementation, green on the new, mutants killed; model quality NOT_RUN |
| G3 safety and privacy | PASS at T0 with residual risks | No text, PII or actor hash in the new traces; guidance only to the Case owner |
| G6 complete, truthful ledger | This checkpoint | Nothing renamed or deleted from earlier checkpoints |
| T1 / T2 / T3 | NOT_RUN | Master Plan permits |

### Residual risks and deferred work

| Risk | Severity | Tier needed | Note |
|---|---|---|---|
| Classifier recall on unseen wording | P1 for any field or model-quality claim | T0 data first, then owner decision | H5 REPRODUCTION recall 11/29 (37.9 %); earlier first runs on the development sets 53–54 % where split out. A bounded rule set, not a guarantee; no tuning was done here |
| Guidance carried in an error message | P2, contract | Owner decision | Same code and status, text in the existing message field. A structured field in the error envelope would be a public contract change and was not made |
| Atomicity and exactly-once | P1 for T1 | T1 + approval | Needs the RPC above |
| Excluded fields (`apartment_access_profile`, `address_label`, `problem_chips`) | P2 | Owner decision | Scanning would lock a Case on one old phrase |
| LPG, fire and health wording | P2 | Domain review | Fixed server copy |
| Confirmation description gated only at create | P3 | — | The confirm route re-reads the stored description; no new customer text enters there |
| `evaluate-release.mjs` null→0 | P2 | Owner approval | Release-control code, unchanged |
| Manifest cap of 100 | P3 | Contract change | 71 used |
| All behaviour ran against an in-memory stand-in | P1 for T1/T2 | T1/T2 | No Docker database, RLS, device, hosted Edge or live model |
| `lint:authority` | pre-existing | — | Unchanged |

**Backlog (outside the original KAWA_01 boundary, no P0/P1 safety, privacy or authorization violation found in scope):** author the 100 blueprint cases; map the 99 fixtures to the groups; a structured emergency field in the error envelope; the idempotency design above.

**COST:** actual_calls=0; actual_usd=NOT_RUN; approval_ref=none.
**ROLLBACK:** revert the files in `file-digests.txt` (all uncommitted). Compatibility: success responses, the progress stream and the shared contracts are unchanged; the only visible change is extra text at the front of an existing error message when a Case owner reports an emergency in a request that was going to be refused anyway. No migration, RPC, contract, secret or flag was touched, so no data rollback exists.
**OUTCOME:** ACCEPTANCE CANDIDATE (T0). Not independently reviewed; T1, T2 and T3 are NOT_RUN.
**NEXT:** Stop. Request an independent acceptance review. KAWA_02 requires a new instruction.

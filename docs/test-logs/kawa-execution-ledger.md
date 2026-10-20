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

# Plan 55 Production Canary Cleanup Guard Hardening

Date: 2026-09-27 (UTC)
Status: local fail-closed contract hardening only; no live service receipt.

## Change and evidence

The serialized Production-only canary now rejects cleanup evidence unless both the service-scoped canary flag and the corresponding `CANARY_USER_ID` configuration are absent. Existing required cleanup remains Auth 404, zero profile/deletion/chat rows, and no orphan worker. Missing actor-ID evidence also fails closed.

A test-first negative case failed before the fix because `assertPlan55Cleanup` accepted a still-configured actor ID. After the fix, positive cleanup evidence passes and present/missing actor-ID evidence is rejected.

| Command | Result |
|---|---|
| `pnpm --filter @nestscout/api exec node --test scripts/lib/kael-playbook-eval-targets.test.mjs` (before fix) | Expected red: 11 passed, 1 failed on the missing expected exception for a still-configured canary actor ID. |
| Same focused command (after fix) | PASS: 12 tests, 0 failed. |
| `pnpm lint:workplan` | PASS: 13 slices declared (12 closed, 1 pending); changed files remain inside the declared read-window. |
| `pnpm lint:comments --working` | PASS: no note-banner comments. |
| `git diff --check` | PASS; Git reported existing LF-to-CRLF normalization warnings only. |

## Artifact integrity follow-up (2026-09-27)

The canary receipt validator now re-scores each JSON run against its sanitized expected case and matching raw observation, recomputes aggregate metrics/stability from those records, and requires the Markdown metric lines and routing matrix to match the recomputed values. This closes the gap where a Markdown metric could be edited while the JSON metric hash remained unchanged. Regression cases cover changed visible metrics, changed matrix counts, JSON/raw observation drift, and consistently tampered JSON/summary/Markdown metrics.

The first full API test run also exposed a stale source-attestation fixture: the attested evaluator path list correctly includes `apps/api/scripts/kael-playbook-eval.mjs`, while the test's hard-coded expectation omitted it. The expected path was added; this was an allow-list test mismatch, not evidence of a backend switch.

| Command | Result |
|---|---|
| `pnpm test:api` (after fixes) | PASS: 48 files passed, 2 skipped; 803 tests passed, 2 skipped; the included 12-test Node contract suite passed. |
| `pnpm --dir apps/api exec eslint scripts/lib/plan55-production-canary-core.mjs scripts/lib/kael-playbook-eval-targets.test.mjs src/__tests__/unit/plan55-production-source-attestation-pillar.test.ts` | PASS. |
| `node apps/api/scripts/kael-playbook-production-canary.mjs --preflight` | BLOCKED read-only: source attestation failed. Direct attestor identified `production_runtime_source_mismatch` at `supabase/functions/mobile-api/_shared/kael/learning/playbooks/flags.ts`. |

## Boundary and disposition

This improves only local cleanup/artifact integrity; it does not supply a Production adapter or create current-source service receipts. A fresh targeted search found no evaluator process and no matching state/log files. The read-only Production health/attestation check found the deployed runtime still differs from Goal source at `flags.ts`; therefore no canary was started. Production was queried only through its health endpoint and not changed; Staging was not accessed. No account, flag, database, or service-payload mutation occurred, and no Docker command ran.

## Review

Fixed point: `4b3c62ac3dbd642f278ea75c9320f7c97181e4fa` (uncommitted Goal worktree; the new evaluator files are untracked).
Spec source: governance/Plan.md §55 and the user's Production-only scope; no separate PRD.
Spec compliance: cleanup fails closed; artifact metrics are recomputed from sanitized expected/observed data and must match JSON, raw, Markdown, and summary outputs.
Rules/standards compliance: no account/flag/DB writes or PII logging; exact-source attestation blocks live execution before any canary.
Maintainability: the validator reuses evaluator scoring/aggregation functions; the generic Production operations adapter remains intentionally unwired.
Scope creep: none.
Verification: API suite 803 passed/2 skipped; focused 12-test Node suite, targeted ESLint, workplan lint, comment lint, and `git diff --check` pass. Production preflight is BLOCKED by the exact `flags.ts` source mismatch.
Required fixes: reconcile and attest the deployed runtime source before any live canary; do not rerun valid historical slices.

## Latest evaluator preflight recheck — 2026-09-27

The local `--plan` mode emitted 48 candidate slices (eight 12-case slices for each of the six services); it did not execute any slice or create a receipt. The focused target, preflight, cleanup, serialization, and artifact-integrity suite passed 12/12. A fresh read-only `--preflight` exited 1 with `plan55_canary_preflight_blocked:source_attestation_failed`; no canary was started. Targeted process discovery found no Node evaluator, and the scoped Plan 55 state/log search found no runtime state or log artifact.

The host sample at approximately `2026-09-27T16:01Z` recorded 1.33 GiB free of 15.71 GiB, below the required 4 GiB Docker floor. Docker was not invoked. Production and Staging remain unchanged; no account, flag, database, service payload, or workflow mutation occurred. Current-source Production service receipts remain 0/6. This closes only the local evaluator-preflight slice; the full Plan remains active.

| Command | Result |
|---|---|
| `node apps/api/scripts/kael-playbook-production-canary.mjs --plan` | PASS: 6 services, 48 planned 12-case slices; execution not started. |
| `node apps/api/scripts/kael-playbook-production-canary.mjs --preflight` | BLOCKED read-only: `source_attestation_failed`; no evaluator or canary run. |
| `pnpm --filter @nestscout/api exec node --test scripts/lib/kael-playbook-eval-targets.test.mjs` | PASS: 12 tests, 0 failed. |
| `pnpm lint:workplan` | PASS: 13 slices, 13 closed, 0 pending, 41 changed files inside the declared read-window. |
| `pnpm lint:comments --working` | PASS: no note-banner comments. |
| `git diff --check` | PASS; existing LF-to-CRLF warnings only. |

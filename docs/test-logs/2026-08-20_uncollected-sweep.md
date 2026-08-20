# Uncollected Test Sweep — raw measurement

Phase T of `plan-test-collection-truth-20260820`. This file records **what was measured**. It classifies nothing and proposes nothing; that is Phase A.

## Environment

| Fact | Value |
|---|---|
| Date | 2026-08-20 |
| Branch | `claude/test-collection-truth-20260820` at `cd3b0487`, identical to `origin/main` |
| Working tree | clean, no local commits |
| OS | Windows 11 |
| Node | v24.19.0 |
| pnpm | 10.16.1 (workspace pins `pnpm@10.16.1`) |
| `git config core.autocrlf` | `true` (repo-local) |
| CI runners for comparison | ubuntu-latest, node 20 |

Every command below was run from the repository root unless stated.

---

## T1 — Full install

```bash
pnpm install --frozen-lockfile
```

`EXIT=0`. Lockfile up to date, resolution skipped.

This replaces the earlier partial install (`--filter @nestscout/api...`) used for prior measurements in this session.

**Effect on a previously recorded failure:** `src/__tests__/unit/mobile-client-request-id.test.ts` failed to load under the partial install (`TSCONFIG_ERROR … Failed to load tsconfig for '../mobile/lib/client-request-id.ts'`). After the full install it loads and passes. It does not appear in any T3 result below.

---

## T2 — What the shipped suites collect and report

```bash
pnpm test          # turbo → each package runs its own `test` script
```

`EXIT` non-zero.

| Package | Collected | Result |
|---|---|---|
| `@nestscout/api` | 18 files / 565 tests | all pass |
| `@nestscout/shared` | 3 files / 98 tests | all pass |
| `@nestscout/mobile` | 12 suites / 74 tests | **1 suite failed, 2 tests failed** |
| `@nestscout/sandbox` | not a test suite — `node ./src/sandbox-check.mjs` readiness script | `EXIT=0`, prints `Sandbox is ready for in-repo agent probes.` |

Turbo summary: `Tasks: 3 successful, 4 total`.

### T2.1 — The failing suite

`apps/mobile/components/worker/__tests__/worker-jobs-zip-prototype-pillar-test.tsx`

Failing case: `Worker Jobs ZIP Prototype › keeps Stage 10 hero focused on the Workart without a duplicate status caption`

The assertion (`:148`) is a substring match against source text read from disk:

```ts
expect(source).toContain("stageClosedStatusArtwork: {\n    flexShrink: 1,\n    height: 126,\n    maxWidth: 164,\n    width: '100%',")
```

`source` is nine files under `components/worker/jobs/` read with `readFileSync(..., 'utf8')` and joined.

Direct byte measurement of that concatenation on this machine:

```text
CRLF trong chuỗi ghép: true
khớp nguyên văn (LF):  false
khớp nếu chuẩn hoá CRLF→LF: true
thực tế trên đĩa: "stageClosedStatusArtwork: {\r\n    flexShrink: 1,\r\n    height: 126,\r\n    maxWidth: 164,\r\n    width: '100%',\r\n  },\r\n  stageClosedSummaryCard: {"
```

### T2.2 — Same commit, opposite CI result

```bash
gh run list --branch main --limit 6
gh run view 32354837921 --json jobs
```

For `headSha = cd3b0487b2dc287fb167ab2e6382243bbb5fa51d` — the exact commit measured above — workflow `harness-assurance` reports `conclusion: success`, and every job inside it succeeded, including:

```text
success  whole workspace type-check, test, and build
```

That job runs `pnpm exec turbo --root-turbo-json config/turbo/turbo.json test`, the same command measured as failing above.

Workflows `integration` and `security` also report `success` on the same sha.

---

## T3 — What is actually on disk

Run through temporary configs placed beside each package config and deleted immediately after. No repository config was modified.

### T3.1 — `apps/api`

`include: ['src/__tests__/**/*.test.ts']`

Run three times. The stable result:

```text
Test Files  8 failed | 308 passed | 4 skipped (320)
     Tests  9 failed | 3619 passed | 70 skipped (3698)
```

One further case is **intermittent** and is excluded from that count:

| File | Case | Observation |
|---|---|---|
| `foundation/pre-app-build-contract.test.ts` | `Secret hygiene baseline > does not persist Supabase management tokens in repo text files` | Failed in 1 of 3 full-sweep runs. Passed 2 of 2 runs when executed alone. Its assertion text was never captured — it did not fail again after first being seen |

The eight files that fail every run:

| File | Failing case |
|---|---|
| `schema/backend-function-size.test.ts` | `keeps every implementation within the §46.0 150-line boundary` |
| `unit/admin-finance.test.ts` | `hashes a bank reference before it reaches the reconciliation RPC` |
| `unit/aggregate-rpc-runtime.test.ts` | `loads Edge worker earnings with an exact aggregate and payment-safety balance` |
| `unit/frontend-gate-hook.test.ts` | `launches Stop hooks through the safe PowerShell Node wrapper` |
| `unit/manual-bank-payment.test.ts` | `treats a customer transfer claim as reconciliation pending, never a paid authority` |
| `unit/manual-bank-payment.test.ts` | `allows a worker confirmation to remain pending until the customer also confirms` |
| `kael-edge-runtime/domains/kael-places.test.ts` | `calculates a worker route from the server-held building destination while the unit stays protected` |
| `kael-edge-runtime/domains/kael-worker-earnings.test.ts` | `uses the exact reconciled earnings aggregate in the Edge runtime` |
| `kael-edge-runtime/platform/kael-edge-service-surface.test.ts` | `keeps the Edge service surface aligned with the mobile API plan` |

Verbatim assertions captured:

```text
backend-function-size
  expected [ Array(1) ] to deeply equal []
  + "mobile-api\\_shared\\http\\dispatch\\admin.ts:149-301 dispatchAdminControlRoute (153)"

admin-finance
  Expected: "decide_manual_bank_payment_reconciliation"
  Received: "decide_manual_bank_payment_reconciliation_idempotent"

manual-bank-payment (case 1)
  promise rejected "Error: Không thể ghi nhận thu nhập tạm thời cho thợ"
  thrown at manual-bank.ts:196 after rpc("recognize_customer_payment_claim")
  Serialized Error: { code: 'DB_ERROR', status: 500 }

manual-bank-payment (case 2)
  expected "vi.fn()" to be called with arguments
  -   "respond_to_direct_worker_payment"  { p_actor_id, p_actor_role, p_job_id, p_received }
  +   "acknowledge_worker_cash_payment"   { p_job_id, p_received, p_worker_id }

aggregate-rpc-runtime / kael-worker-earnings
  promise rejected "Error: Không thể tải thu nhập"
  thrown at domains/worker/earnings.ts:40
  stderr: mobile-api earnings aggregate response invalid { userId: 'worker-1' }

kael-edge-service-surface
  expected [ 'acceptBroadcast', …(160) ] to deeply equal [ 'acceptBroadcast', …(159) ]
  + "getAdminWorkerFinanceSnapshot"

frontend-gate-hook
  expected '{\r\n  "permissions": { …' to contain 'scripts/run-node.ps1'
  (.claude/settings.json Stop hook currently reads:
   node "${CLAUDE_PROJECT_DIR}/scripts/run.mjs" run-node "${CLAUDE_PROJECT_DIR}/.claude/hooks/verify-frontend-gates.mjs")

kael-places
  expected { distance_meters: 3200, …(5) } to deeply equal { distance_meters: 3200, …(1) }
  +   "destination": { "kind": "building", "latitude": 10.7767, "longitude": 106.7009 },
  +   "encoded_polyline": null,
  +   "fetched_at": "2026-08-20T11:13:37.526Z",
  +   "provider": "vietmap",
```

`pre-app-build-contract` was not captured verbatim: it did not fail again after the run in which it was first seen. See the intermittent row above.

### T3.2 — `packages/shared` — first measurement ever

`include: ['src/__tests__/**/*.test.ts']`

```text
Test Files  3 failed | 25 passed (28)
     Tests  6 failed | 552 passed (558)
```

| File | Failing case | Assertion |
|---|---|---|
| `mobile-wiring.test.ts` | file-level load failure | `ENOENT: apps/mobile/app/(customer)/booking.tsx` |
| `mobile-backend-wiring.test.ts` | `keeps mobile config publishable-only and away from hosted Next fallbacks` | `expected '…' to contain "fromEnv('EXPO_PUBLIC_SUPABASE_URL')"` |
| `mobile-backend-wiring.test.ts` | `keeps UI components behind the workflow provider instead of direct backend calls` | `ENOENT: apps/mobile/app/(customer)/booking.tsx` |
| `mobile-backend-wiring.test.ts` | `keeps visible mobile copy away from backend and server implementation language` | `ENOENT: apps/mobile/app/(customer)/booking.tsx` |
| `monorepo-wiring.test.ts` | `keeps the Supabase auth config annotated for the later phone OTP upgrade` | `expected '# For detailed configuration referenc…' to contain 'later phone OTP production-auth upgra…'` |
| `monorepo-wiring.test.ts` | `keeps production mobile source on Kael component and image systems` | `expected [ Array(1) ] to deeply equal []` |
| `monorepo-wiring.test.ts` | `pins EAS CLI commands to the workspace package manager` | `Expected: "pnpm dlx eas-cli@21.0.0"` / `Received: "pnpm dlx eas-cli@22.0.0 login"` |

### T3.3 — `apps/mobile`, files outside the pillar regex — first measurement ever

```bash
pnpm --filter @nestscout/mobile exec jest --testRegex '.*\.test\.tsx?$'
```

```text
Test Suites: 4 passed, 4 total
Tests:       32 passed, 32 total
```

All four (`lib/__tests__/kael-stream`, `kael-reasoning-receipt`, `kael-response-stream`, `kael-respond-stream-presentation`) pass.

---

## T4 — What each CI step claims versus what it collects

Every workflow under `.github/workflows/` was grepped for steps naming test paths or filters. Each such command was then run verbatim on this machine.

| Workflow → step | Names | Collects | Exit |
|---|---|---|---|
| `security.yml` → **Security guardrail tests** | 8 filters (`foundation`, `route-security`, `mobile-api-s2-learning-candidate-authz`, `mobile-api-s2-system-prompt-security`, `mobile-api-s3-authz-coverage`, `mobile-api-s3-require-job-access`, `mobile-api-s4-spend-gate`, `kael-redteam`) matching 10 files | **`No test files found`** | `0` |
| `integration.yml` → **Integration tests vs staging Supabase** | `src/__tests__/integration` — 4 files, 1802 lines, run with `SUPABASE_SERVICE_ROLE_KEY` against staging ref `xyylanuyflrjzbjzhqfl` | **`No test files found`** | `0` |
| `harness-assurance.yml` → **Harness runtime tests** | 17 paths (`src/__tests__/harness` plus 6 named files) | 1 file / 12 tests | `0` |
| `harness-assurance.yml` → **Whole workspace tests** | `turbo … test` | each package's own script | see T2 |
| `kael-agentic-completeness.yml` → **Run all workspace tests** | `pnpm --filter <pkg> test` ×4 | each package's own script | — |

Collection rules that produce the above:

| Package | Rule | Ratio |
|---|---|---|
| `apps/api` | `apps/api/vitest.config.mts` → `include: ['src/__tests__/**/*-pillar.test.ts']`, `passWithNoTests: true` | 18 / 320 files |
| `packages/shared` | `packages/shared/vitest.config.mts` → same glob plus `src/__tests__/kael-multi-turn-eval.test.ts`, `passWithNoTests: true` | 3 / 28 files |
| `apps/mobile` | `apps/mobile/jest.config.js` → `testRegex: '.*-pillar-test\\.tsx$'`, `passWithNoTests: false` | 11 pillars + 0 of 4 `.test.ts` |

Files named by the two zero-collecting steps, and whether any is a pillar:

```text
src/__tests__/integration/  →  4 test files, 0 pillars
   learning-real-supabase.test.ts  real-supabase.test.ts
   rls-per-actor.test.ts           worker-flow.test.ts

security.yml filters        →  10 matching test files, 0 pillars
```

### T4.1 — Related observation, different mechanism

`kael-agentic-completeness.yml` also runs:

```bash
node apps/api/scripts/kael-eval.mjs --mode deterministic --report /tmp/kael-eval.md
```

`apps/api/scripts/kael-eval.mjs:318` prints, in deterministic mode:

```text
WARNING: deterministic mode does not exercise an AI model; 100% means fixtures and local rules agree, not that live Kael is correct.
```

Recorded here because it is the same category of gap — a step whose name claims more than the run proves — reached by a different mechanism than test collection.

---

## Not measured

- **CI-runner reproduction.** Every number above is from Windows / node 24.19.0. The T2.1 CRLF measurement and the T2.2 CI contradiction indicate at least one result is platform-dependent. No failure in T3 has been reproduced on ubuntu / node 20.
- **`pre-app-build-contract` verbatim assertion** — see the intermittent row in T3.1. What made it fail once is unknown; nothing was done to reproduce it beyond the three sweeps and two isolated runs recorded there.
- **Whether the two zero-collecting steps ever collected anything.** Only the current commit was measured. No history was walked.
- **`supabase/tests/*.sql`** — the `database-controls` job runs these through a real Postgres. Not exercised here; no Docker stack was started in this pass.

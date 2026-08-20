# Test Collection — Phase A analysis

Phase A of `plan-test-collection-truth-20260820`. Input is the raw measurement in [`docs/test-logs/2026-08-20_uncollected-sweep.md`](../test-logs/2026-08-20_uncollected-sweep.md). Every row below traces to an assertion recorded there.

Nothing has been edited yet. §A4 is the decision table; §A5 is the gate.

---

## A1 — Classification

Sixteen failures were measured: 9 stable in `apps/api`, 6 in `packages/shared`, 1 mobile pillar. One further `apps/api` case is intermittent.

| # | Failure | Class | Evidence it is that class |
|---|---|---|---|
| 1–2 | `manual-bank-payment` ×2 | `stale-test` | RPC renamed `respond_to_direct_worker_payment` → `acknowledge_worker_cash_payment`, and `claimManualBankPayment` gained a second RPC (`recognize_customer_payment_claim`) the mock does not answer. The new RPC checks `v_job.worker_id is distinct from p_worker_id → AUTH_FORBIDDEN` and is granted to `service_role` only — ownership, which is stricter than the role argument it replaced |
| 3 | `admin-finance` | `stale-test` | Expects `decide_manual_bank_payment_reconciliation`; code calls `..._idempotent` |
| 4–5 | `aggregate-rpc-runtime`, `kael-worker-earnings` | `stale-test` | Both die at `domains/worker/earnings.ts:40` with `earnings aggregate response invalid`. The aggregate gained fields; the fixtures return the old shape. The code **refuses** the unknown shape and fails closed — correct behaviour under RULES #8 |
| 6 | `kael-places` | `stale-test` | Route response gained `destination`, `encoded_polyline`, `fetched_at`, `provider`; the test uses `toEqual` against the two-field shape |
| 7 | `kael-edge-service-surface` | `stale-test` **and** anti-pattern | Asserts a hand-written list of 159 service names; there are now 160. `test-pillars.md` names this shape directly: *"Derive the property; do not restate the table"* |
| 8 | `backend-function-size` | `dead-anchor` + `ratchet` | Cites "the §46.0 150-line boundary". §46 exists only in `governance/plan-archive/`, and `Plan.md` §A states those numbers are spent. No live governance file carries a function-length rule; `lint-structure.mjs` caps **files** at 800 lines, not functions |
| 9 | `frontend-gate-hook` | `stale-test` | Expects `scripts/run-node.ps1`. Commit `99a5e76d` *"make every workspace script runnable off Windows"* deliberately replaced that with `node "${CLAUDE_PROJECT_DIR}/scripts/run.mjs" run-node …`. `settings.json` did not regress — it improved, and the test still asserts the Windows-only shape |
| 10–13 | shared `mobile-wiring`, `mobile-backend-wiring` ×3 | `stale-test` | Three die on `ENOENT apps/mobile/app/(customer)/booking.tsx`; one expects `fromEnv('EXPO_PUBLIC_SUPABASE_URL')` in a file that no longer spells it that way |
| 14–16 | shared `monorepo-wiring` ×3 | `stale-test` | Supabase config annotation removed; a mobile-source list changed; `eas-cli` pinned `21.0.0` in the test while `package.json` moved to `22.0.0` |
| — | `pre-app-build-contract` | `environment` / order-dependent | Failed in 1 of 3 full sweeps; passed 2 of 2 alone. Not classified further — see A5 |
| — | `P33-worker-jobs-zip-prototype` | platform-fragile | CRLF vs LF. Already fixed and split out; not part of this table |

**Zero `real-defect`.** Every classified failure is a test that stopped describing the code, not code that stopped working.

---

## A2 — Provenance

The hypothesis going in was *"one large commit updated the tests it could see and left the invisible ones"*. That is **half right**: the pattern holds, but it is not one commit.

| Broke | Commit | Date | Rotting for |
|---|---|---|---|
| earnings ×2 | `aedbbcf1` refactor(backend): §46 layer model + god-function split | 2026-08-03 | **17 days** |
| shared wiring ×4 | `fd6a53e7` feat: publish app gate and history UI updates | 2026-08-17 | 3 days |
| manual-bank ×2, admin-finance, service-surface, function-size | `b3101457` feat: publish audited mobile and workflow updates | 2026-08-19 | 1 day |
| `eas-cli` pin | `77e565e5` fix: align native mobile surfaces across gates | 2026-08-19 | 1 day |
| frontend-gate-hook | `99a5e76d` feat: make every workspace script runnable off Windows | 2026-08-19 | 1 day |
| kael-places | `adcd66c0` feat(worker): align jobs production with approved prototype | 2026-08-20 | same day |

Six commits, spread over 17 days, by different pieces of work. That rules out carelessness in one change and leaves the structural reading: **nothing runs these files, so nothing reports when they stop being true.** The fix therefore has to be a gate, not a cleanup.

---

## A3 — What the uncollected-but-passing tests actually carry

### A3.1 — Scoping: most uncollected files are declared debt, not hidden debt

`governance/protocols/test-pillars.md` says plainly: *"The remaining ~431 files stay on disk, uncollected, as reference material."* That is a decision on record. A file that is uncollected **and** is not claimed anywhere is honest debt.

The undisclosed debt is narrower and exactly defined: **files a CI step names as if it runs them.** That set is 28 files carrying **357 `it` blocks**:

| CI step | Files | `it` blocks |
|---|---|---|
| `security.yml` → Security guardrail tests | 10 | 83 |
| `integration.yml` → Integration tests vs staging Supabase | 4 | 70 |
| `harness-assurance.yml` → Harness runtime tests | 14 non-pillar | 204 |

Largest single file: `unit/mobile-api-edge-router.test.ts`, 87 `it` blocks, named by CI, collected by nothing.

### A3.2 — Overlap with the pillar suite

Of the 28, **4** exercise a source file some pillar declares as its `target`; **24** touch no pillar target at all.

| Touches a pillar target | Files |
|---|---|
| yes | `mobile-api-s2-system-prompt-security`, `mobile-api-s3-require-job-access`, `mobile-api-s4-spend-gate`, `kael-redteam` |

### A3.3 — The SQL layer carries more than expected

`supabase/tests/` holds **53 verification scripts**, run by `harness-assurance.yml` job `database-controls` against a real Postgres. Two of them answer the money invariants behind the failing TS tests directly:

```text
worker_salary_settlement_v2_verification.sql
  raise 'customer claim RPC does not expose provisional salary state'
  raise 'rejected online claims do not reverse provisional salary'
  raise 'Admin Worker finance snapshot is not protected by the finance reader boundary'

manual_bank_payment_finance_v1_verification.sql
  raise 'legacy unilateral cash confirmation is still executable'
  raise 'bank-reference reuse guard is missing'
  raise 'finance RPC % is not a locked-down definer function'
```

This inverts the obvious plan. Porting `manual-bank-payment` into a TypeScript pillar would re-assert, against a `vi.fn()` mock, what a script already proves against the real RPC. `test-pillars.md` rules on that case: *"Prefer the real implementation over a mock."* The right move for those rows is deletion with a ledger entry naming the layer that carries them — the ledger already has a section for exactly this, §3 *"Already covered — deletion lost nothing."*

Only 2 of the 53 scripts are registered pillars (`kael_price_reasoning_receipt`, `staging_security`). The rest run without appearing in the pillar index — worth noting, not a defect.

---

## A4 — Decision table

| # | Invariant | Currently in | Carried elsewhere? | Decision | Why |
|---|---|---|---|---|---|
| 1 | A customer transfer claim is reconciliation-pending, never paid authority | `manual-bank-payment.test.ts` | **Yes** — `worker_salary_settlement_v2_verification.sql`, real RPC | `delete + ledger §3` | A mock cannot outrank the real RPC |
| 2 | A worker cash acknowledgement stays pending until the customer also confirms | same | **Yes** — same script, plus the RPC's own `AUTH_FORBIDDEN` ownership check | `delete + ledger §3` | as above |
| 3 | A bank reference is hashed before it reaches the reconciliation RPC | `admin-finance.test.ts` | **No** — SQL guards reuse and grants, not Edge-side hashing | **`port → P34`** security-negative | RULES #9; the only layer that can see the pre-RPC value is the Edge |
| 4 | An earnings aggregate of unknown shape fails closed instead of returning a number | `aggregate-rpc-runtime.test.ts`, `kael-worker-earnings.test.ts` | **Partly** — SQL proves the RPC; nothing proves the Edge refusal | **`port → P35`** unit | RULES #8; this is the behaviour that already saved the two tests from lying |
| 5 | A worker route never exposes the customer's unit | `kael-places.test.ts` | **No** | **`port → P36`** security-negative, asserting the protection only | The current `toEqual` on a whole growing response is why it broke; the protection is the part worth pinning |
| 6 | The Edge service surface matches the plan | `kael-edge-service-surface.test.ts` | n/a | `delete + ledger §5` | Restates a 160-name table; `test-pillars.md` rejects the shape outright |
| 7 | Edge functions stay within 150 lines | `backend-function-size.test.ts` | **No live rule exists** | **Tu decides — A5 Q1** | Either promote the rule and build a real ratchet, or delete it |
| 8 | Stop hooks launch through the safe wrapper | `frontend-gate-hook.test.ts` | n/a | `fix test in place` | The wrapper moved to the cross-platform runner on purpose |
| 9–12 | Mobile wiring stays behind the workflow provider / config stays publishable-only | shared `mobile-wiring`, `mobile-backend-wiring` | n/a | `delete + ledger §5` | Source-text assertions over files that no longer exist |
| 13–15 | Monorepo contract alignment, `eas-cli` pin | shared `monorepo-wiring` | n/a | `delete + ledger §5`, and raise the `eas-cli` pin separately | A version pin belongs in a ratchet that reads `package.json`, not in a test that hardcodes the old number |
| 16 | 357 `it` blocks are claimed by CI and run by nothing | 28 files | — | **S1: gate + stop the claim** | See below |
| — | Secret-hygiene baseline | `pre-app-build-contract.test.ts` | — | **investigate separately** | Order-dependent; batching it with stale tests would hide it |

Net: **1 delete-heavy sweep, 3 new pillars (P34–P36), 1 test fixed in place, 1 decision for Tu, 1 separate investigation.** No product code changes.

---

## A5 — Gate: three questions before anything is edited

**Q1 — Is the 150-line function rule still a rule?**
It survives only in `governance/plan-archive/2026-05-20_workflow-enhancement.md`. `Plan.md` §A says those section numbers are spent. `lint-structure.mjs` caps files at 800 lines and says nothing about functions. `dispatchAdminControlRoute` reached 153 lines in `b3101457`.
*Options:* promote the rule into a live governance file and build a baseline ratchet like `lint-structure.mjs`; or delete the test and record the loss.
*Not an option:* splitting `dispatchAdminControlRoute` so the number goes green. That fixes the measurement, not the question.

**Q2 — Confirm `frontend-gate-hook` is the test's problem, not `settings.json`'s.**
Evidence says the hook was deliberately made cross-platform. If Tu agrees, the test is updated. If not, `settings.json` must change instead — **and this agent may not be able to write that file**, so it would be a handoff.

**Q3 — Delete-with-ledger, or keep as reference?**
Rows 1, 2, 6, 9–15 are proposed for deletion because another layer carries the invariant or because the assertion has no falsifiable content. `test-pillars.md` permits keeping uncollected files as reference material, so keeping them is defensible — it just means the ledger records nine more rows of "exists, never runs, may already be false".

---

## What Phase A did not establish

- **No failure was reproduced on a CI runner.** All classification rests on Windows / node 24.19.0 measurements. `P33` already proved at least one result is platform-dependent.
- **The 53 SQL scripts were read for their `raise` strings, not executed.** No Docker stack was started. `docs/test-debt-ledger.md` already marks many of them "asserts it, unrun"; this analysis does not change that status.
- **A3 judged the 28 CI-named files, not all 320.** Files that are uncollected and unclaimed were treated as declared debt per `test-pillars.md`, not audited one by one.
- **`unit/mobile-api-edge-router.test.ts` (87 `it`) was not read.** It is the largest single block of undisclosed debt and its invariants are unknown; S1 stops the claim, it does not evaluate the content.

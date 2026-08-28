# Test Debt Ledger

Records the invariants that lost their only test when the migration-text suite was removed, and names the real layer each one needs.

**Why this file exists.** 233 test cases across `apps/api` and `packages/shared` proved product behavior by reading a `.sql` migration and matching substrings. `expect(migration).toContain('check (gross_amount = platform_fee + worker_net)')` passes whether or not the migration ever ran, and whether or not a later migration dropped the constraint. `governance/protocols/tdd.md` already ruled that out — "Static-only coverage is insufficient for behavior or security changes", and the failure mode "Tests that never execute real code" — so the cases were deleted rather than left to report green. That file now says so explicitly: a text assertion over migration SQL is a ratchet, never a test layer.

Deleting them did not make the product less safe. It made the real level of safety visible. This ledger is what keeps that visibility from decaying into "nobody remembers what we stopped checking".

**How to read the tables.** An invariant is *covered* when a script in `supabase/tests/` exercises it against a real Postgres (`pnpm db:local:test`, and the `database-controls` job in `.github/workflows/harness-assurance.yml`). Those scripts run inside `begin; … rollback;` and self-assert with `raise exception`.

---

## 1. Money — six executed in CI, four still open

This is the same surface that has to carry the first real transaction, so it is the first thing to fix.

**Historical reconciliation (2026-08-19)** by `kael-docker`'s degraded lane (no daemon available; read-only). Six of these rows had gone stale: the script was on disk and asserted the invariant, but had simply never been executed here. The scripts were **not** undocumented — PR #199 landed them on 2026-08-14 together with `governance/protocols/test-pillars.md` §"The money and privilege invariants", which lists exactly which rows each one covers. This ledger was last touched 2026-08-13 and was never updated to match, so the failure was two governance docs disagreeing rather than nobody knowing. Treat that section as the sibling of this one and update both together. At that time, the `State` column was a static reading of the SQL, not a run: **"asserts it, unrun" was bookkeeping, not proof.** Clearing any row still required `pnpm db:local:test` on a machine with a Docker daemon. The full sequence on such a machine is:

```text
pnpm db:local:doctor   # refuses below the 4 GB floor and prints the measured number
pnpm db:local:up
pnpm db:local:reset    # replay every migration from zero, then seed
pnpm db:local:test     # run supabase/tests/*.sql through psql
pnpm db:local:down
```

**Reconciled 2026-08-27 against the exact branch HEAD.** The `database-controls` job in [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949) completed successfully at commit `99349b5fc64f07d00d1f62a340750c16d4563b38`; its log reports `54 passed / 0 failed / 54 total`. The runner enumerates every `supabase/tests/*.sql`, so the six rows below that assert real behavior are no longer "unrun". This is CI execution evidence, not local Docker evidence.

Section 2 was reconciled in the same pass and under the same caveat.

| Invariant | Real layer needed | State (2026-08-27, CI reconciled) |
|---|---|---|
| `gross_amount = platform_fee + worker_net` holds for every ledger row | `supabase/tests/worker_payment_ledger_verification.sql` — insert a violating row, assert the check constraint rejects it | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| `commission_rate_bps` stays within `[0, 1500]` | same script — insert `1501`, assert rejection | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| Higher commission tiers never carry a higher rate | same script — insert an inverted tier pair, assert the trigger raises | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| `create_worker_vietqr_payment_intent` freezes the tier at intent creation | call the RPC, change the tier, call again, assert the first intent keeps its frozen rate | **still debt** — the RPC is called in the webhook script, but no test changes the tier between two calls |
| `apply_sepay_vietqr_payment_webhook` is idempotent | `supabase/tests/sepay_vietqr_webhook_verification.sql` — call twice with one transaction id, assert exactly one ledger row and one `paid` transition | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| A duplicate provider transaction id cannot create a second credit | same script — assert `jobs_sepay_transaction_uidx` rejects the second insert | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| Payment RPCs are unreachable from `anon` / `authenticated` | same scripts — `set role authenticated`, call, assert permission denied | **partial** — the webhook RPC is checked via `has_function_privilege`; the ledger script has no role check |
| `upsert_customer_refund_payment_method` locks the row and never exposes the raw account | `supabase/tests/customer_refund_account_verification.sql` | **still debt** — script does not exist |
| Cash commission is deducted from in-app balance without inventing a cash credit | extend `supabase/tests/manual_bank_payment_finance_v1_verification.sql` | **written but silent** — the extension asserts `pg_get_functiondef(...) like '%…%'`, i.e. the function's source text, not the behavior |
| `confirm_kael_chat_atomic` refuses to confirm a quote without a valid `analysis_receipt.v1` Price Reasoning receipt | `supabase/tests/kael_price_reasoning_receipt_verification.sql` — confirm with a missing receipt and with a wrong `schema_version`, assert both raise `MISSING_REASONING_RECEIPT` | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |

`worker_payment_ledger` rows are read by `exact_aggregate_rpcs_verification.sql` and `manual_bank_payment_finance_v1_verification.sql`, so the table is not entirely unseen — but no script drives the VietQR write path that creates those rows.

## 2. Access control — three executed in CI, two partial, five still open

| Invariant | Real layer needed | State (2026-08-27, CI reconciled) |
|---|---|---|
| `handle_new_user` cannot take a role from user metadata | partly covered by `admin_operations_sub_admin_verification.sql`; add a negative case that signs up with `raw_user_meta_data.role = 'admin'` and asserts the row lands as `customer` | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| Admin RLS policies all route through `is_admin()` | partly covered by `harness_access_boundary_verification.sql`; extend to enumerate policies per actor | **still debt** — no script enumerates policies per actor |
| Authenticated clients stay read-only on workflow tables | per-actor DML attempts in `supabase/tests/` — the pattern `rls-per-actor.test.ts` uses, but at the SQL layer | **partial** — per-actor role switching exists in the job-media scripts, but no workflow-table DML matrix |
| `worker_profiles_districts_backup_x3` has RLS on and is revoked from `anon` / `authenticated` | a per-actor `select` attempt asserting permission denied; the table holds worker district history, so a leak is a privacy leak | **still debt** — no script names the table |
| `kael_customer_conversations` grants owner-only reads and blocks cross-actor writes | `supabase/tests/kael_customer_conversations_verification.sql` | **still debt** — script does not exist |
| The per-user Kael chat quota (`check_kael_worker_chat_rate`) is enforced in the database, not only in Edge | exceed the bucket inside one transaction, assert the RPC rejects | **still debt** — no script names the function |
| Participants can read jobs while ordinary roles cannot mutate workflow state | per-actor DML matrix in `supabase/tests/`; this is the broadest RLS claim the suite ever made and it rested on substrings | **still debt** — the broadest claim in the ledger, still unscripted |
| `handle_new_user` execute is revoked from `public`, `anon`, `authenticated` | `set role anon`, call it, assert permission denied | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| Storage policies stay scoped by job folder and worker ownership | storage-object access attempts per actor | **partial** — `storage.objects` is exercised in the job-media and staging scripts, not as a per-actor folder matrix |
| Six-service foundation enables RLS and grants only least Data API privilege | extend `supabase/tests/six_service_casework_foundation_verification.sql` | **executed in CI** — [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), commit `99349b5fc64f07d00d1f62a340750c16d4563b38` |
| Cancelling a job releases the pending worker candidate in the same transaction | `customer-worker-candidate-gate-migration` → *atomically releases a pending candidate when the customer cancels* | extend `supabase/tests/customer_worker_candidate_gate_verification.sql` — cancel mid-flight, assert candidate status and `jobs.worker_id` both settle |
| The learning evidence gate numbers in the promotion RPC match the shared constants | `learning-gate-constants-parity` → *promotion RPC migration pins the same evidence gate numbers* | call the RPC at the boundary values and assert accept/reject, rather than reading the number out of a file |

## 2b. Uncovered — media and PII retention

| Invariant | Deleted case | Real layer needed |
|---|---|---|
| Retention cleanup leases only uncleaned rows, `for update skip locked`, and records a claim token | `unit/kael-media-retention-function` → *leases every due uncleaned status…*; *locks and verifies consume against a concurrent cleanup claim* | `supabase/tests/kael_media_retention_verification.sql` — two concurrent claims, assert one lease wins and bytes are deleted once |
| The scheduled job stays uninstalled until both Vault secrets exist | same file → *schedules only after both Vault secrets exist* | same script — assert the scheduler helper is a no-op with a missing secret |

`tier5-security-hardening.test.ts` asserted a privilege-escalation fix with `expect(SQL.toLowerCase()).not.toContain('coalesce')`. That is the sharpest example in the repository of a security claim resting on a substring.

## 3. Already covered — deletion lost nothing

These invariants had a real verification script *and* a migration-text test. Removing the text test removed a duplicate that could only ever produce false confidence.

| Area | Real layer already in place |
|---|---|
| Atomic Kael memory writes | `atomic_kael_memory_updates_verification.sql` |
| Broadcast retry claims | `broadcast_retry_claims_verification.sql` |
| Job incident transitions | `job_incident_atomic_verification.sql` |
| Durable circuit / rate guards | `kael_durable_guards_verification.sql` |
| Learning queue, observations, batch results, effects, admin approval, autopromotion | `learning_*_verification.sql` (7 scripts) |
| Scope-change idempotency | `scope_change_idempotency_verification.sql` |
| Worker Kael atomic turns | `worker_kael_atomic_turns_verification.sql` |
| Worker registration | `worker_registration_atomic_verification.sql` |
| Worker manual payouts | `worker_manual_payouts_verification.sql` |
| Worker verification draft cleanup | `worker_verification_draft_cleanup_verification.sql` |
| Exact profile / earnings aggregates | `exact_aggregate_rpcs_verification.sql` |
| Six-service Case Work foundation | `six_service_casework_foundation_verification.sql` |
| Device push token single owner | `device_push_token_single_owner_verification.sql` |
| Job media upload intents / audio guard | `job_media_upload_intents_verification.sql`, `job_media_audio_guard_verification.sql` |
| Admin queue resolution, estimate accuracy, structured feedback, api-log retention | `kael_*_verification.sql`, `api_logs_retention_verification.sql` |
| Admin operator accounts and the persisted permission model | `admin_operations_sub_admin_verification.sql` |
| Worker Kael chat sessions and turns | `worker_kael_atomic_turns_verification.sql` |

## 4. Type coverage that moved rather than died

`tier1-type-completeness.test.ts` had 27 cases that declared an object literal with a `satisfies Database[...]` clause and then asserted the literal back. The runtime assertion was theatre; the `satisfies` clause was a real static check. The fixtures moved to `apps/api/src/__tests__/schema/generated-type-fixtures.ts`, where `tsc` still enforces every one of them and vitest no longer counts them as passing tests. `tier3-relationships.test.ts` was deleted outright — its type annotations duplicated checks `tier1` already makes.

## 5. Deleted as unfalsifiable — no invariant to record

A later sweep removed 163 more cases that asserted on file text without asserting anything a reader could act on. Unlike the sections above, nothing goes on a to-do list here: these were not weak checks of real invariants, they were checks of nothing.

| Group | Cases | What the name claimed vs what it read |
|---|---|---|
| `wiring/module-wiring` | 10 | *"checks supabase connectivity"* — connects to nothing; it reads a file. *"exports GET handler"*, *"has route matcher config"* the same |
| `schema/tier6-seed-validation` | 21 | *"includes a paid job (full workflow test)"* — one substring in `supabase/seed.sql`. *"worker has realistic rating (1-5 range)"* reads no rating |
| `shared/monorepo-wiring` | 56 | *"has zod dependency"*, *"is private"*, *"name is nestscout"* — reads `package.json`, asserts the field back. Losing `zod` breaks the build far louder |
| `shared/mobile-wiring` | 29 | *"tab: Trang chủ"*, *"exports useAuth hook"* — reads `apps/mobile` source from `packages/shared`, where 1,116 RNTL tests already cover those components behaviorally |
| `schema/tier7-staging-security-harness` | 2 | *"simulates customer, worker, outsider, and admin authenticated contexts"* — simulates nothing |
| `shared/exports`, `shared/constants`, `foundation/pre-app-build-contract`, scattered singles | 45 | single-substring or manifest-field assertions; `tsc` and the build already enforce them |

**`supabase/seed.sql` is the same category as migration SQL.** The first round's rule named only `supabase/migrations`, so seed-file assertions survived two sweeps. Any `.sql` the database must execute cannot be verified by reading it.

## 5b. Deleted in the fourth sweep — the rule finally applied in full

A fourth pass ran a taint-based detector instead of a hand-written search and found **25 case blocks the first three sweeps had left**, expanding to 54 runtime cases. The rule did not change; the search did.

| File | Blocks | Runtime cases | What it read |
|---|---|---|---|
| `schema/tier4-sql-migration` | 2 | 25 | RLS on 17 tables, 8 create-table checks, all against joined migration text |
| `schema/tier6-seed-validation` | 6 | 6 | auth ordering, worker fixtures, insert idempotency in `seed.sql` |
| `schema/customer-worker-candidate-gate` | 4 | 4 | proposal, single-winner confirm, eligibility recheck, release |
| `schema/device-push-token-single-owner` | 4 | 4 | hash backfill, table lock, transaction shape, RPC grants |
| `unit/mobile-api-kael-voice-transcript` | 2 | 2 | transcript and lexicon table shape |
| `foundation/pre-app-build-contract` | 3 | 3 | a `.md` contract quoting its own sentences back |
| `shared/monorepo-wiring` | 3 | 3 | governance markdown describing auth and service scope |
| `schema/source-trust-research` | 1 | 1 | status banner and checkbox states in a research write-up |
| `schema/kael-b3-knowledge-corpus` | 1 | 1 | sign-off banner and the migration-gate sentence |
| `integration/real-supabase` | 7 | 7 | not text at all — fixture deletion written as assertion-free `it` blocks |
| `schema/tier7-staging-security-harness` | 2 | 2 | fixture validity and summary row, both proven by running the script |

**The largest deletion cost nothing.** The 17-table RLS claim looked like the one invariant worth replacing with an executed script. It did not need replacing: `supabase/tests/harness_access_boundary_verification.sql` already raises on *any* `public` table with `relrowsecurity` false — broader than the hand-maintained list, and already running in `database-controls`. The text version had been shadowing a real check the whole time.

The candidate-gate, push-token, and casework claims are likewise covered by their own `supabase/tests/*_verification.sql` scripts, which the same job executes. Seed behaviour is settled by `supabase db reset --local` replaying it. Nothing from this sweep goes on the to-do list in sections 1–2b.

## 5c. The fifth sweep — the two areas nobody had looked at

**`apps/mobile` turned out to be the healthiest suite in the repo.** 938 case blocks: 414 mount real components, 368 test logic directly, 89 assert mock calls, 39 read source text, 28 use a bare matcher. Nothing fake, nothing assertion-free.

Removed there: **8 runtime cases** of source text whose claim a render test already covers. The reason `apps/api` keeps its ~280 equivalents does not transfer — Deno Edge has no other layer, mobile has RNTL. The clearest case: `kael-case-work-phase-source-test` described the Case Work surface from substrings across 18 files while `customer-kael-chat-surface-test` mounts that surface 56 times. Header icon cases asserted source formatting down to line breaks in a style object; the Worker equivalents assert the same properties with `findAllByProps` on a mounted tree.

Every file kept its absence claims, and those are the point: removed code renders nothing, so only a file read can say the SePay rail, the staging simulator, the composer voice escape hatch, the native Lottie adapter, the un-encoded session route, or a PII field on the candidate card never came back. Asset existence stays for the mirror reason — a missing PNG breaks `require()` at module load.

**The weak-only number reported after the fourth sweep was wrong.** It said 124 cases of unaudited debt. Reading them: **89 are absence assertions** — `expect(x).toBeNull()` after calling real code — which is the negative security test this protocol requires. They were never debt. Removed instead:

| Case group | Cases | Why it could not fail |
|---|---|---|
| `tier1-type-completeness` table keys | 66 | `EXPECTED_TABLES` already carries `as const satisfies readonly TableNames[]` 22 lines above, so `tsc` rejects an unknown key before any test runs; the runtime half proved the strings were non-empty |
| `mobile-wiring` app.json fields | 6 | name, scheme, bundle identifier, Android package, Supabase extra, image-picker dep — each missing fails `eas build` on its first step |

Left alone on purpose: the presence-only cases in `bug-verification`, `ai-types`, `env`, and `audit-fixes` assert on the result of code they actually run. Weak assertion, real execution — strengthening them belongs to the test-structure phase, and deleting them would only lose coverage.

**The intermittent failure from the fourth sweep was not found.** `apps/api` ran 15 consecutive times: 15 × 3008 passed, zero failures. The working tree stayed clean across all 15, which disproves the standing hypothesis — that `kael-playbook-eval-core` spawning a CLI that writes into `docs/test-logs/` races with parallel test files. It writes byte-identical content, so nothing was changed on the strength of a theory the evidence contradicts. The failure remains unidentified, and this line stays here until it is seen again with a name attached.

## 5d. Handoff to the test-structure phase

Each row is an invariant that lost its (weak) signal in the fifth sweep, with the layer that should carry it. The first is the best candidate for the first prototype structure: a small module, a clear contract, and a test that stubs one dependency and asserts a real value.

| Invariant | Was | Should be |
|---|---|---|
| Kael SSE routes encode session and conversation ids; connect/total timeouts, `redirect: "error"`, bounded error and frame reads | substring over `lib/kael-stream.ts` | stub `fetch`, call the exported function, assert the request URL, signal, and bounded reads |
| Case Work phase gating — evidence request, offer review, completion, payment reveal | substrings across 18 `kael-chat` files | extend `customer-kael-chat-surface-test` state coverage |
| Customer Kael header icon colour, size, stroke weight | substrings incl. style-object line breaks | `findAllByProps` on a mounted header, as `worker-home-surface-test` already does |
| Transcript virtualization and row order | `<FlatList>` substring, source index comparison | assert the rendered row order in the mounted transcript |
| On-device voice transcript stays editable before it becomes evidence | substrings over the native component | mount and type into it |
| Worker icon map ↔ asset pairing | `toContain(require(...))` per icon | mount the surface and assert the resolved image source |
| `getByText(...)` wrapped in `toBeTruthy()` — 7 mobile cases | matcher adds nothing; the query throws | `toBeOnTheScreen()` |

## 6. Audited and healthy — do not mistake these for debt

- **Mock assertions.** 50 cases assert only `toHaveBeenCalled*`. 27 of them are negative — `expect(rpc).not.toHaveBeenCalled()` after calling real code and asserting it rejects — which is precisely the negative security test `tdd.md` requires. The rest assert call counts that are the behavior under test, such as "one aggregate query, not N+1". Nothing here needs removing.
- **~280 source-text wiring cases.** Kept deliberately. Unlike migration SQL, a `.ts` file *is* the shipped artifact, so a substring match is a weak but real regression signal — and for Edge (Deno) wiring there is currently no other reachable layer. They were retitled where the old name promised behavior; they were not deleted.
- **78 skipped integration tests.** Good tests that never run on pull requests. That is a CI wiring problem, not a test-quality one: the fix is a step in the `database-controls` job, not a deletion.

---

## 7. Claimed but never collected — the sixth sweep, 2026-08-20

Every row above is debt somebody wrote down. This section is the other kind: coverage a CI step **claimed to run** while its runner collected nothing. Raw measurement in [`docs/test-logs/2026-08-20_uncollected-sweep.md`](test-logs/2026-08-20_uncollected-sweep.md); classification and per-invariant decisions in [`docs/audit/test-collection-analysis-20260820.md`](audit/test-collection-analysis-20260820.md).

Three steps named **28 files carrying 357 `it` blocks**. Each package narrows collection to its pillar suite and sets `passWithNoTests`, so a positional filter naming a non-pillar file intersects to nothing and the runner exits 0.

| Step | Named | Actually collected | Now |
|---|---|---|---|
| `security.yml` → Security guardrail tests | 8 filters, 10 files, 83 `it` | **0** — `No test files found` | names the nine security-negative pillars instead; runs 7 api files / 132 tests plus the two shared pillars |
| `integration.yml` → Integration tests vs staging Supabase | `src/__tests__/integration`, 4 files, 70 `it` | **0** | `--passWithNoTests=false`, so the nightly staging run fails instead of reporting green. It never ran on pull requests, so no PR is blocked |
| `harness-assurance.yml` → Harness runtime tests | 17 paths, 204 `it` in the 14 non-pillar ones | 1 file / 12 tests | names only `src/__tests__/harness` |

`scripts/check-test-collection.mjs` now fails when a workflow names a path its package does not collect. A step may still name one, but only as a declared gap that also passes `--passWithNoTests=false`, so the run fails rather than lying.

### What stopped being claimed

| Invariant | Real layer needed | State (2026-08-20, static) |
|---|---|---|
| Per-actor RLS: a non-owner customer and a non-assigned worker cannot read a job | `integration/rls-per-actor.test.ts` asserts it against staging and has never been collected. `P10-per-actor-rls` covers the same ground in SQL and does run, in `database-controls` | **covered elsewhere** — the TS suite adds a second reading, not the only one |
| Worker registration → admin approval → availability → accept | `integration/worker-flow.test.ts`, 12 `it`, never collected. `worker_registration_atomic_verification.sql` and `worker_review_admin_provisioning_verification.sql` exist | **partial** — the SQL scripts cover the atomic writes, not the end-to-end order |
| The learning evidence gate holds at its boundary values | `unit/learning-evidence-gate.test.ts`, 26 `it`, named by CI, never collected | **still debt** — §2 already lists the constants-parity half of this; the boundary half has no collected layer |
| Edge route dispatch, authz, and error mapping | `unit/mobile-api-edge-router.test.ts`, 87 `it` — the largest single block, never collected and never read during this sweep | **still debt** — `P18-capability-registry-parity` covers route→role parity, nothing covers dispatch behaviour |
| Learning hook wiring end to end | `unit/mobile-api-edge-learning-hook.test.ts`, 27 `it` | **still debt** |
| Privileged Supabase client boundary | `harness/privileged-client-boundary.test.ts`, 2 `it` | **covered elsewhere** — `scripts/harness/check-privileged-clients.mjs` runs in `verify.mjs` |
| Capability policy per actor | `harness/capability-policy.test.ts`, 9 `it` | **covered elsewhere** — `scripts/harness/capability-registry.mjs` plus `P18` |

The §6 row *"78 skipped integration tests … the fix is a step in the `database-controls` job"* was written before this measurement and understates the problem: the dedicated `integration` workflow that exists to run them also collected zero. Fixing `database-controls` alone would not have surfaced that.

### Deleted in this sweep

| Invariant | Deleted case | Real layer needed |
|---|---|---|
| A customer transfer claim is reconciliation-pending, never a paid authority | `unit/manual-bank-payment` → *treats a customer transfer claim as reconciliation pending* | **already covered** — `worker_salary_settlement_v2_verification.sql` asserts it against the real RPC in `database-controls` |
| A worker cash acknowledgement stays pending until the customer also confirms | same file → *allows a worker confirmation to remain pending* | **already covered** — same script, plus `acknowledge_worker_cash_payment` refusing a caller that does not own the job |
| Every Edge function stays within 150 lines | `schema/backend-function-size` (whole file) | **none — the rule is gone.** It cited "the §46.0 150-line boundary"; §46 exists only in `governance/plan-archive/`, and no live governance file carries a function-length rule. `lint-structure.mjs` caps files at 800 lines, not functions. Reinstating it means writing the rule down first, then a baseline ratchet |
| The Edge service surface matches the plan | `kael-edge-runtime/platform/kael-edge-service-surface` (whole file) | **none, and none wanted.** It listed 159 service names by hand and broke when a 160th arrived. `test-pillars.md`: *"Derive the property; do not restate the table"* |
| The Supabase auth config carries the phone-OTP upgrade annotation | `monorepo-wiring` → *keeps the Supabase auth config annotated…* | **none.** It pinned an exact comment string; `fd6a53e7` rewrote that comment to describe the current sign-up phase. A comment is not the setting |

### Found while clearing the above — not debt, a live violation

`monorepo-wiring` → *keeps production mobile source on Kael component and image systems* fails because `apps/mobile/components/customer/home/home-storytelling-card.tsx` uses a raw `<TextInput>` outside `components/ui/kael-primitives.tsx`, and the exemption set `knownNativeTextInputFiles` is empty. The test is working; the source is not. It is left failing rather than exempted, because an exemption would be the second way this sweep found to make a check report success over something it was written to stop. `packages/shared` collects pillars only, so nothing surfaces it today.

---

## Structural notes

Two things made this debt easy to accumulate, and both still hold:

1. **The real layer is hard to reach locally.** `pnpm db:local:test` runs `docker/scripts/run-sql-tests.ps1`, which needs PowerShell. On Linux and macOS the SQL layer is effectively unavailable, so a text assertion is the only thing a contributor can actually execute. Porting the `docker/scripts/*.ps1` runners to `.mjs` — the form every other script in `scripts/` already uses — removes that pressure.

2. ~~**`governance/protocols/tdd.md` asks for "at least two relevant layers" without saying what does not count as one.**~~ **Closed.** `tdd.md` now states, in Test Integrity Rules, that migration SQL, `seed.sql`, and committed documentation are not test layers, that shipped markdown compared against a runtime constant is, and that a text claim over a CI-executed script is only worth writing when execution cannot prove it. A rule stated in prose is still only a rule; `scripts/find-artifact-text-assertions.mjs` is the part that holds.

Cause 1 is still open, and it is the one that matters more: as long as the SQL layer cannot be run on a Linux or macOS machine, the rule tells a contributor their only reachable option does not count, without giving them a reachable one.

**CI note.** `.github/workflows/kael-agentic-completeness.yml` blocks every tracked-file deletion outside an allowlist. That guard is correct and it caught this work; the allowlist now covers `apps/api/src/__tests__/` and `packages/shared/src/__tests__/`, on the grounds that a deleted test is visible in the diff and recorded here. Product code, the admin surface, and every other path stay blocked.

## What still counts as a legitimate text assertion

Not every `readFileSync` + `toContain` was removed, and the distinction is what the assertion is *about*:

- **Application source** — `expect(edge).not.toContain('client.rpc("auto_promote_learning_candidate_atomic"')` prevents a dangerous call path from reappearing. Structural claim, structural check.
- **Config** — `verify_jwt = false` in `supabase/config.toml` is text. Reading it is the correct method.
- **Generated database types** — produced by `supabase gen types` from a live database, so asserting on them is asserting on the schema.
- **Derived sets** — enumerating migrations and reconciling them against generated types (`tier1-type-completeness`, `mobile-api-edge-schema`) fails when something new arrives unguarded. That is a ratchet doing its job.
- **Secret scans** — `expect(sql).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)` claims no key is committed, which is exactly a claim about file text.
- **Markdown that ships** — the Kael charter is read into the Edge system prompt (`_shared/kael/prompts/system-prompt.ts`) and served by the public `/kael/charter` route; the service playbooks are injected into model input. Comparing that markdown byte-for-byte against the constant the runtime uses is a parity check, the same family as generated types. Prose in `docs/` and `governance/` is not.
- **Rollback discipline on an executed script** — every `supabase/tests/*.sql` is run by `run-sql-tests.ps1` in `database-controls`, so running it proves its assertions. What running cannot prove is that it rolled back, because a script that commits still passes. That, and a secret scan, are the only text claims worth keeping over an executed artifact.

## How to find these

**Do not hand-write the search. Run `node scripts/find-artifact-text-assertions.mjs`.** It is wired into the `harness manifest + skills-sync + structure ratchet` job, so a new violation fails CI instead of waiting for the next sweep.

The rule was right from the first sweep. Finding every violation took four tries, and every miss was the same mistake — matching a pattern instead of resolving what the code actually reads. Each rule in the script exists because one of these got through:

| Miss | Why the search failed |
|---|---|
| Ratchet files still holding migration-text cases | classified at *file* level instead of *case* level |
| `mobile-api-customer-kael-conversations` | followed `const x = …` but not `function readMigrations() { … }` |
| `tier4-sql-migration` and three others | the path was built from a constant, so the literal `supabase/migrations` never appeared in the read expression |
| `device-push-token`, `mobile-api-kael-voice-transcript` | the file name was chosen at runtime by `readdirSync(dir).find(…)`, so the resolved expression carried the directory but never a `.sql` suffix |
| `customer-worker-candidate-gate`, `tier6-seed-validation` | the assertion ran against a binding *derived* from the tainted one — `const body = migration.match(…)`, `const authSection = SEED.slice(…)` |

Two false-positive sources cost as much time as the misses, and the script guards both: a fixed look-ahead window when reading a declaration bleeds into the next one and taints a source binding with the SQL read that follows it; and running a case block to wherever the next case starts sweeps up helpers declared after the last case, blaming their assertions on it.

A clean run prints `0 banned`. Two kinds of `warn` row exist, and both mean "justify this in a comment", not "delete it":

- **`executed-sql`** — a text assertion over a script `run-sql-tests.ps1` already executes. Legitimate only where running it cannot prove the same thing: rollback discipline, committed-secret scans.
- **`mobile-source`** — a positive substring assertion from an `apps/mobile` test. RNTL can mount the component, so the render layer is nearly always the right one. 21 of these remain; they are the working list for the test-structure phase, not a backlog of fakes.

The ratchet also proved more accurate than the ad-hoc bucketing used to scope the fifth sweep: it found 17 mobile cases that a per-block heuristic had filed under "renders" or "logic", because they sat in files that render elsewhere and read source through a helper. That is the argument for keeping the detector in the repo rather than rebuilding it per session.

**Removing cases safely.** Deleting an `it()` block by searching for the next `\n  })\n`, or by brace-scanning, both cut through multi-line arrays inside the block and produce parse errors. What worked: take block boundaries from *line* structure — `^  it\(` opens, `^  \}\)$` closes — verify the pairing is 1:1 before applying, and delete from the end of the file backwards so earlier offsets stay valid.

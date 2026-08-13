# Test Debt Ledger

Records the invariants that lost their only test when the migration-text suite was removed, and names the real layer each one needs.

**Why this file exists.** 233 test cases across `apps/api` and `packages/shared` proved product behavior by reading a `.sql` migration and matching substrings. `expect(migration).toContain('check (gross_amount = platform_fee + worker_net)')` passes whether or not the migration ever ran, and whether or not a later migration dropped the constraint. `governance/protocols/tdd.md` already ruled that out — "Static-only coverage is insufficient for behavior or security changes", and the failure mode "Tests that never execute real code" — so the cases were deleted rather than left to report green. That file now says so explicitly: a text assertion over migration SQL is a ratchet, never a test layer.

Deleting them did not make the product less safe. It made the real level of safety visible. This ledger is what keeps that visibility from decaying into "nobody remembers what we stopped checking".

**How to read the tables.** An invariant is *covered* when a script in `supabase/tests/` exercises it against a real Postgres (`pnpm db:local:test`, and the `database-controls` job in `.github/workflows/harness-assurance.yml`). Those scripts run inside `begin; … rollback;` and self-assert with `raise exception`.

---

## 1. Uncovered — money

Nothing verifies these against a database. This is the same surface that has to carry the first real transaction, so it is the first thing to fix.

| Invariant | Deleted case that "covered" it | Real layer needed |
|---|---|---|
| `gross_amount = platform_fee + worker_net` holds for every ledger row | `worker-payment-ledger-commission` → *creates one private in-app credit per job…* | `supabase/tests/worker_payment_ledger_verification.sql` — insert a violating row, assert the check constraint rejects it |
| `commission_rate_bps` stays within `[0, 1500]` | `worker-payment-ledger-commission` → *keeps the base worker commission at 15%…* | same script — insert `1501`, assert rejection |
| Higher commission tiers never carry a higher rate | same case (`enforce_worker_commission_tier_policy`) | same script — insert an inverted tier pair, assert the trigger raises |
| `create_worker_vietqr_payment_intent` freezes the tier at intent creation | `worker-payment-ledger-commission` → *atomically freezes the configured tier…* | call the RPC, change the tier, call again, assert the first intent keeps its frozen rate |
| `apply_sepay_vietqr_payment_webhook` is idempotent | `sepay-vietqr-production-rail` → *uses one locked service-role RPC…* | `supabase/tests/sepay_vietqr_webhook_verification.sql` — call twice with one transaction id, assert exactly one ledger row and one `paid` transition |
| A duplicate provider transaction id cannot create a second credit | `sepay-vietqr-production-rail` → *…a unique provider identity* | same script — assert `jobs_sepay_transaction_uidx` rejects the second insert |
| Payment RPCs are unreachable from `anon` / `authenticated` | both cases above (`revoke` / `grant` substrings) | same scripts — `set role authenticated`, call, assert permission denied |
| `upsert_customer_refund_payment_method` locks the row and never exposes the raw account | `customer-refund-account-persistence` → *uses one locked service-role RPC…* | `supabase/tests/customer_refund_account_verification.sql` |
| Cash commission is deducted from in-app balance without inventing a cash credit | `worker-cash-commission-settlement` (file deleted) | extend `supabase/tests/manual_bank_payment_finance_v1_verification.sql` |
| `confirm_kael_chat_atomic` refuses to confirm a quote without a valid `analysis_receipt.v1` Price Reasoning receipt | `unit/mobile-api-kael-casework-runtime` → *requires a validated Price Reasoning receipt…* | `supabase/tests/kael_price_reasoning_receipt_verification.sql` — confirm with a missing receipt and with a wrong `schema_version`, assert both raise `MISSING_REASONING_RECEIPT` |

`worker_payment_ledger` rows are read by `exact_aggregate_rpcs_verification.sql` and `manual_bank_payment_finance_v1_verification.sql`, so the table is not entirely unseen — but no script drives the VietQR write path that creates those rows.

## 2. Uncovered — access control

| Invariant | Deleted case | Real layer needed |
|---|---|---|
| `handle_new_user` cannot take a role from user metadata | `tier5-security-hardening` → *does NOT use coalesce…* | partly covered by `admin_operations_sub_admin_verification.sql`; add a negative case that signs up with `raw_user_meta_data.role = 'admin'` and asserts the row lands as `customer` |
| Admin RLS policies all route through `is_admin()` | `tier5-security-hardening` → *all admin policies use is_admin()…* | partly covered by `harness_access_boundary_verification.sql`; extend to enumerate policies per actor |
| Authenticated clients stay read-only on workflow tables | `mobile-api-edge-schema` → *keeps authenticated mobile clients read-only…* | per-actor DML attempts in `supabase/tests/` — the pattern `rls-per-actor.test.ts` uses, but at the SQL layer |
| `worker_profiles_districts_backup_x3` has RLS on and is revoked from `anon` / `authenticated` | `unit/mobile-api-kael-x2` → *protects the worker district backup table…* | a per-actor `select` attempt asserting permission denied; the table holds worker district history, so a leak is a privacy leak |
| `kael_customer_conversations` grants owner-only reads and blocks cross-actor writes | `unit/mobile-api-customer-kael-conversations` → *enables RLS, grants read-only owner access…*; *covers the composite owner foreign key…* | `supabase/tests/kael_customer_conversations_verification.sql` |
| The per-user Kael chat quota (`check_kael_worker_chat_rate`) is enforced in the database, not only in Edge | `unit/mobile-api-worker-kael-chat` → *keeps the rollback limiter fail-closed…* | exceed the bucket inside one transaction, assert the RPC rejects |
| Participants can read jobs while ordinary roles cannot mutate workflow state | `tier4-sql-migration` → *participants can read jobs but normal users cannot mutate workflow state directly* | per-actor DML matrix in `supabase/tests/`; this is the broadest RLS claim the suite ever made and it rested on substrings |
| `handle_new_user` execute is revoked from `public`, `anon`, `authenticated` | `tier4-sql-migration` → *prevents API roles from calling trigger-only handle_new_user directly* | `set role anon`, call it, assert permission denied |
| Storage policies stay scoped by job folder and worker ownership | `tier4-sql-migration` → *job photos require participant access…*; *completion uploads require the matched worker*; *worker documents remain worker-owned…* | storage-object access attempts per actor |
| Six-service foundation enables RLS and grants only least Data API privilege | `six-service-casework-foundation-migration` → *enables RLS and exposes only the least Data API privileges* | extend `supabase/tests/six_service_casework_foundation_verification.sql` |
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

## 6. Audited and healthy — do not mistake these for debt

- **Mock assertions.** 50 cases assert only `toHaveBeenCalled*`. 27 of them are negative — `expect(rpc).not.toHaveBeenCalled()` after calling real code and asserting it rejects — which is precisely the negative security test `tdd.md` requires. The rest assert call counts that are the behavior under test, such as "one aggregate query, not N+1". Nothing here needs removing.
- **~280 source-text wiring cases.** Kept deliberately. Unlike migration SQL, a `.ts` file *is* the shipped artifact, so a substring match is a weak but real regression signal — and for Edge (Deno) wiring there is currently no other reachable layer. They were retitled where the old name promised behavior; they were not deleted.
- **78 skipped integration tests.** Good tests that never run on pull requests. That is a CI wiring problem, not a test-quality one: the fix is a step in the `database-controls` job, not a deletion.

---

## Structural notes

Two things made this debt easy to accumulate, and both still hold:

1. **The real layer is hard to reach locally.** `pnpm db:local:test` runs `docker/scripts/run-sql-tests.ps1`, which needs PowerShell. On Linux and macOS the SQL layer is effectively unavailable, so a text assertion is the only thing a contributor can actually execute. Porting the `docker/scripts/*.ps1` runners to `.mjs` — the form every other script in `scripts/` already uses — removes that pressure.

2. ~~**`governance/protocols/tdd.md` asks for "at least two relevant layers" without saying what does not count as one.**~~ **Closed.** `tdd.md` now states, in Test Integrity Rules, that a text assertion over migration SQL is a ratchet and never a test layer, and lists what reading text is still correct for.

Cause 1 is still open, and it is the one that matters more: as long as the SQL layer cannot be run on a Linux or macOS machine, the rule tells a contributor their only reachable option does not count, without giving them a reachable one.

**CI note.** `.github/workflows/kael-agentic-completeness.yml` blocks every tracked-file deletion outside an allowlist. That guard is correct and it caught this work; the allowlist now covers `apps/api/src/__tests__/` and `packages/shared/src/__tests__/`, on the grounds that a deleted test is visible in the diff and recorded here. Product code, the admin surface, and every other path stay blocked.

## What still counts as a legitimate text assertion

Not every `readFileSync` + `toContain` was removed, and the distinction is what the assertion is *about*:

- **Application source** — `expect(edge).not.toContain('client.rpc("auto_promote_learning_candidate_atomic"')` prevents a dangerous call path from reappearing. Structural claim, structural check.
- **Config** — `verify_jwt = false` in `supabase/config.toml` is text. Reading it is the correct method.
- **Generated database types** — produced by `supabase gen types` from a live database, so asserting on them is asserting on the schema.
- **Derived sets** — enumerating migrations and reconciling them against generated types (`tier1-type-completeness`, `mobile-api-edge-schema`) fails when something new arrives unguarded. That is a ratchet doing its job.
- **Secret scans** — `expect(sql).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)` claims no key is committed, which is exactly a claim about file text.

## How to find these

The rule was right from the first sweep; finding every violation took three tries, and each miss was the same mistake — matching a pattern instead of resolving what the code actually reads.

| Miss | Why the search failed |
|---|---|
| Ratchet files still holding migration-text cases | classified at *file* level instead of *case* level |
| `mobile-api-customer-kael-conversations` | followed `const x = …` but not `function readMigrations() { … }` |
| `tier4-sql-migration` and three others | the path was built from a constant, so the literal `supabase/migrations` never appeared in the read expression |

Search this way instead — substitute file-level string constants into the read expression *before* testing it, so the result does not depend on how a path was spelled or a variable named:

```python
const_map = {}          # const X = '...' | resolve(...) | new URL('...')
for `const V = readFileSync(<expr>)`:
    resolved = substitute(const_map, expr)
    if 'migrations' in resolved.lower():
        V holds migration text
violation = any case with expect(V).toContain / .toMatch   # excluding .not.
```

A clean run prints zero. Anything else is a case claiming database behavior on the strength of a substring.

**Removing cases safely.** Deleting an `it()` block by searching for the next `\n  })\n`, or by brace-scanning, both cut through multi-line arrays inside the block and produce parse errors. What worked: take block boundaries from *line* structure — `^  it\(` opens, `^  \}\)$` closes — verify the pairing is 1:1 before applying, and delete from the end of the file backwards so earlier offsets stay valid.

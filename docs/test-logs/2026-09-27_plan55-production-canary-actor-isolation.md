# Plan 55 — Production canary actor isolation (local only)

**Recorded:** 2026-09-27T02:34:53Z
**Checkout:** `C:\Users\Phan Manh Tu\.codex\worktrees\plan55-goal-branch\home-services`
**Target:** Goal branch tip `4b3c62ac3dbd642f278ea75c9320f7c97181e4fa`; working-tree changes only
**Question/class:** Does an enabled per-service canary remain restricted to its one authenticated actor if a legacy global service flag is also enabled? `behavior` / security-negative.
**Lane:** Local unit and API type-check evidence; Edge Lane B is `UNVERIFIED` after one failed image-pull attempt.

## Change and evidence

- Added a test-first negative case. Before the fix, the new test failed because the legacy global flag returned `true` for a non-canary actor even while that service's canary flag was enabled.
- Updated `isKaelPlaybookEnabled` so an enabled service canary takes precedence over the legacy global flag and returns true only for a valid, exact configured UUID actor match. With no enabled canary flag, existing global-flag behavior is unchanged. Unsupported service names remain fail-closed.
- The authenticated chat/pipeline callers pass `ctx.user.id` from the mobile API auth context; no request-body identity is used for this gate. Actorless helper paths fail closed while a canary is enabled.
- Updated P46 metadata and its generated test-pillar index row to classify the negative isolation assertion accurately.

Commands and results:

| Command | Result |
|---|---|
| `pnpm --filter @nestscout/api exec vitest run src/__tests__/unit/kael-playbook-registry-pillar.test.ts` (before fix) | Expected red: 1 failed, 6 passed; non-canary actor was admitted by the legacy global flag. |
| Same focused command (after fix) | PASS: 1 file, 7 tests. |
| `pnpm type-check:api` | PASS: `tsc --noEmit`. |
| `pnpm test:api` | PASS: 47 files passed, 2 skipped; 800 tests passed, 2 skipped; six evaluator-boundary Node tests passed. |
| `node scripts/harness/pillar-registry.mjs` | PASS: 89 pillars, 89 unique IDs, manifest copies identical. |
| `pnpm lint:edge-db` | PASS for static gate: 9/9 resolver tests; 187 RPC names resolved and 2 dynamic callsites remain explicit residue. No database query ran in this command. |
| `pnpm lint:comments --working` | PASS: no note-banner comments. |
| `git diff --check` | PASS. |
| `pnpm edge:check` | BLOCKED: pinned Deno image lookup returned Docker Engine API HTTP 500; `discovered=6 selected=6 checked=0 failed=0`. No Edge function received runtime type-check proof. No automatic retry ran. |

The Edge command was invoked before the `kael-docker` version/doctor/RAM preflight was completed. Treat the Lane B attempt as consumed and failed; do not retry it in this attempt. This invocation did not start or reset the local Supabase stack and did not query or mutate Production or Staging. No Docker repair, restart, version update, or data cleanup was attempted. The existing last recorded free-RAM sample remains 2.35 GiB at 2026-09-27T01:14:47Z, below the 4 GiB floor; no new RAM sample was taken here.

## Review

- **Fixed point:** `4b3c62ac3dbd642f278ea75c9320f7c97181e4fa`; detached worktree; review surface is the uncommitted `git diff HEAD` for the 18 code/test files in the actor-canary slice plus this receipt/index/Plan metadata update. No commits are included.
- **Spec compliance:** Plan §55 and Tu's Production-only instruction are honored: this only narrows local authorization when an explicit per-service canary is enabled; it does not activate a service, create an account, or claim a live evaluation.
- **Rules/standards:** RULES #2/#8 are preserved: the actor is sourced from verified `ctx.user.id`, unsupported services fail closed, and a configured canary cannot be widened by the legacy global flag. No user payloads or credentials are logged.
- **Maintainability:** Precedence and exact UUID comparison stay in the existing flag helper; a negative regression test covers the vulnerable combination and legacy global behavior remains covered separately.
- **Limitations:** This does not implement a durable case quota, reconcile the Goal/runtime/schema source mismatch, or provide Edge runtime proof. No Production/Staging writes, flags, migrations, or deployments occurred. Production stays unchanged and Plan §55 remains open.

## Disposition

The local actor-isolation regression is fixed and the recorded local gates pass. Edge runtime checking is unverified. No account, playbook flag, Production/Staging setting, migration, service payload, or workflow data was changed. This receipt is not a service evaluation, current-source attestation, deployment, or Production activation. Plan 55 remains open: source/schema drift and all six current-source service receipts remain unresolved; Production stays unchanged.

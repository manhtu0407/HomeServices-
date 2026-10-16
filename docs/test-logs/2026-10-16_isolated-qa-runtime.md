# Isolated local QA runtime — guarded startup and HTTP evidence

The initial attempts below were blocked. The continuation checkpoint at the end
records a successful guarded startup and limited HTTP-to-database evidence.

## Target and scope

Worktree: <repo>/.claude/worktrees/kael56-admin-partial-loading-20261016
Branch: codex/kael56-admin-partial-loading-20261016
Baseline: e8b95d2122a8ce802c5504630a778f6e51daa72f plus uncommitted diff.
Question/class: run isolated Auth/REST/Edge with actual PostgreSQL without
resetting the shared stacks — behavior, Lane A. No hosted deployment.

Optional --instance and --port-base select a named CLI project and canonical
empty-reset snapshot. Default stack and hosted migration planning keep their
own identities. Dedicated target: nestscout-qa-journey56-20261016, base 58320.
Actual source snapshot: 453 canonical migrations and 557 tracked function/Shared
source files, checksummed. Tracked environment files are rejected; untracked
files are not copied. New untracked Edge files are outside this snapshot proof.

Docker: 29.8.2; Compose 5.6.0. Official stable updater route returned
updated-or-current, one update attempt; .scratch/qa-docker-version.log. No Docker
Desktop launch/restart, RAM recovery, shared stop/reset, prune or host repair.
Each diagnosed attempt had one doctor and one CLI start; RAM was informational.

## Actual attempts

1. Internal QA bridge: PostgreSQL host initialization could not connect. A tiny
   owned HTTP control proved internal response but no published host port. Named
   resources only; no inference or Production data.
2. CLI 2.98.2 on a bridge with the documented loopback option: canonical replay
   and seed succeeded, but actual DB/Kong bindings were 0.0.0.0 and ::. Named
   stop exited 0, preserved backup. Bootstrap was not acceptance.
3. Official pinned CLI 2.121.0: startup refused missing configured function
   entry points in the temporary migration workdir; CLI stopped owned containers.
4. Checksummed tracked functions added: startup then identified the missing
   packages/shared/src/worker-capability-data.ts imported by the Edge worker
   contract. That sole external source dependency was added to the snapshot.
5. Final start restored the owned QA backup and completed CLI startup. Actual
   binding verification again rejected non-loopback DB/API ports; the automatic
   exact named stop exited 0 and the up runner exited 1 at
   2026-10-15T19:18:51.748Z. No owned QA containers remained running afterward.

Safe logs/results remain under .scratch/qa-stack-up*. No credential output is
in this packet. Provider secret prefixes are removed from the startup child;
the bridge is not an egress firewall and future function fixtures must deny
real inference independently. No business handler was exercised by these starts.

## Source and test evidence

- corepack pnpm install --frozen-lockfile: exit 0 using repo-pinned pnpm 10.16.1.
  The first noninteractive invocation refused module replacement; the retry used
  CI=true in its own shell. Only this isolated worktree dependencies changed.
- Official supabase package pinned exactly to 2.121.0; wrapper version read 2.121.0.
  Global pnpm 11 rewrote unrelated lock layout initially; its lock was preserved
  under scratch, and the final lock was generated from HEAD using pinned pnpm 10.
- Tracked-source-copy regression: failed ENOENT before copy, passed after; the
  external Shared dependency assertion separately failed then passed. Reuse,
  stale/copy tampering, refresh preservation and tracked .env refusal are tested.
- Combined infrastructure suites: 49 tests, 48 PASS / 1 SKIP / 0 FAIL, exit 0.
  Skip is an existing Windows native-Docker fixture host-policy limitation.
  The earlier run with 48/48 predates the extra source-copy test and is historical.
- Docker contracts: 22 files checked, exit 0.
- All Node script/harness tests before the final source-copy addition: 634 tests,
  633 PASS / 1 SKIP / 0 FAIL. Final full rerun is recorded separately below.

## Review

Fixed point: e8 plus uncommitted diff; git diff HEAD, no additional commits.
Spec: isolates target/ports and preserves other resources; source snapshot now
contains the configured entry points. Runtime acceptance remains blocked.
Rules: no hosted mutation, provider secret, pricing/learning/receipt deletion,
second deployment runtime, global process repair or weakened binding gate.
Maintainability: existing CLI and workdir materializer reused; optional selection
and actual-binding guard are tested. New dependency and copied-source inventory
are explicit. Linux execution has fixture/static evidence only on this Windows
host; hosted inference/financial/network outage are not tested by startup.

Result: PARTIAL. Task status: BLOCKED.
Stop reason: actual loopback publication differs from bridge option under the
current Docker/CLI combination. No identical retry is scheduled.
Unanswered: full local Edge-to-PostgreSQL HTTP journeys with guarded fixtures.
SQL behavior is separately proved by 138/138 files on the earlier private DB;
that result is not upgraded to HTTP end-to-end acceptance.

## Final source verification

Full Node script/harness rerun after the source-copy changes: 635 tests,
634 PASS / 1 SKIP / 0 FAIL, exit 0 (qa-all-node-final.log). All eight static
gates in final-static-results.json exited 0. Harness assurance verification
exited 0. Build initially failed because nested Turbo selected global pnpm 11
against the pnpm 10 dependency graph. A Corepack shim created only under ignored
scratch selected 10.16.1 for nested invocations; the same root build then passed
(1 API build task, exit 0; campaign-build-pinned-final.log). No native binary
was built. No global pnpm or host configuration was changed.

ship:check executed after final changes: all 10 source/harness/script gates
pass, but overall exit 1 / NOT READY because the campaign fixes are deliberately
uncommitted. This campaign prohibits publication; no commit was created to
satisfy that gate. This is a Git readiness limitation, not a passed ship gate.

Runner note: after ship verifier reported its exit-1 Git-state failure, the outer
PowerShell remained alive with no verifier child. Only that exact task-owned
shell was stopped; tool session exit was -1 from this cleanup. The source
verifier result and outer-shell termination are distinct evidence.

## Continuation — explicit binding and real HTTP intake

Continuation baseline: published branch commit `bc5ed76807ab7223631fec44e8440a1674f05f72`
plus the uncommitted QA adapter. Production and the frozen Build 56 Previews
were not modified. No additional commit, push, merge or deployment was performed.

A disposable Alpine control reproduced the binding discrepancy: publishing
`58329:8080` on the owned bridge produced `0.0.0.0` and `::`; explicitly publishing
`127.0.0.1:58329:8080` produced loopback only. The first control used an absent
`httpd` executable; the corrected sleeping control exercised publication without
serving data. Every control container was stopped and removed by its recorded ID.

A Node-only adapter passed its control but did not affect Supabase's compiled
binary. The resulting startup was rejected by the unchanged binding guard and
the exact named QA stop retained its backup. Inspection established that the npm
entry point launches a Bun executable. The adapter now uses the runtime's
documented [standalone preload support](https://bun.com/docs/bundler/executables),
scoped to this CLI child. It validates the QA name, project label, network and
port range, refuses foreign publication and publish-all, and preserves unrelated
commands. A real Bun/Docker control passed before another diagnosed start.

Guarded startup then exited 0. Actual DB and Kong bindings were respectively
`127.0.0.1:58322` and `127.0.0.1:58321`. Auth health returned 200. The first Edge
request exposed the CLI's internal `http://kong:8000` URL being treated as a
remote target by the App environment guard. The dedicated QA adapter now routes
that Edge container through `http://host.docker.internal:58321` and forces the
existing AI kill switch on. No product environment guard or handler was changed.
After an exact named stop/restart, startup and the binding guard again exited 0.
Auth and Edge health returned 200. Edge correctly reports local, unregistered and
degraded; this is not a fabricated Production release identity.

Three diagnosed Supabase starts occurred in this continuation: the Node-only
attempt failed the binding gate; native preload passed binding but exposed the
Edge environment issue; the local-gateway configuration passed startup and HTTP.
Each used one doctor and one CLI start, with a successful version check. There
was no identical blind retry, shared reset, host repair or paid service setup.

### HTTP and PostgreSQL evidence

The local-only script `.scratch/qa-http-deferred.mjs` uses actual Auth sign-in,
Edge handlers and PostgreSQL. It created two Customer fixtures for the final
run and exercised all six supported services with `defer_analysis=true`:
create 201, owner read 200, request-ID replay 201 with the same session ID, and
foreign-owner access denied. It uses the documented web-preview identity and
allowed localhost origin; no iOS identity was fabricated.

An initial missing-header request returned 426 as designed. A first six-service
run reached the five-per-minute creation limit and returned 429 on the sixth;
the final run uses the second fixture actor for that independent scenario.
Neither compatibility nor rate-limit enforcement was weakened. Earlier local
fixture accounts and the five earlier sessions are retained, not hard-deleted.

Independent `psql` readback for the final two actors found exactly six sessions,
six turns, zero linked jobs, total recorded AI cost zero and zero provider-log
rows since the run began. The Edge container had no inference provider keys and
its kill switch was verified true. This is evidence for deferred persistence,
read/replay and ownership only. Pricing, model responses, matching, scope change,
completion and settlement remain outside this checkpoint's HTTP proof.

Safe private results: `.scratch/qa-http-deferred-result.json`, the two retained
426/429 result files, `.scratch/qa-gateway-up-result.json`, and
`.scratch/qa-native-loopback-tests.log`. Do not publish runtime keys or fixture
credentials. The script's ephemeral execution is not a registered integration
pillar and must not be represented as full campaign runner acceptance.

Current targeted tooling suite: 42/42 before the final gateway test; the final
network suite is 12/12. Docker contracts checked 22 files; Node syntax and comment
discipline passed. Structure, baseline, test collection and pillar registry each
exited 0. Full tooling rerun and final lifecycle cleanup are recorded next.

Final full Node tooling runner (`node --test scripts/*.test.mjs
scripts/harness/*.test.mjs`): 641 executed, 641 passed, zero failures or skips,
exit 0. Comment discipline, diff whitespace, and workplan each exited 0; the
workplan contains seven closed slices and nine declared changed files. The
exact named QA stop exited 0 and preserved its backup. The temporary control
containers were removed. No shared instance was stopped.

Review fixed point is `git diff bc5ed76807ab7223631fec44e8440a1674f05f72`
plus the two new preload/launcher files. Spec: the formerly blocked loopback
startup and initial HTTP persistence now have real runtime evidence. Rules:
no global Docker change, guard bypass, provider credential or hosted mutation.
Maintainability: the existing QA network helper and startup/down ownership are
reused; the explicit CLI version check refuses an unsupported launcher rather
than silently accepting a changed upstream runtime. Other CLI versions and
non-Windows runtime behavior remain unverified. These local adapter changes
have not been committed or pushed.

Final `node scripts/harness/verify.mjs` exited 0. Its static transaction catalog
still prints historical release-gap strings; they are not fresh hosted facts
and were not used as current Production acceptance evidence. The final workplan
also records the approved memory checkpoint: eight closed slices, eleven changed
files. No new test/build claim is inferred from the memory write.

The campaign remains IN_PROGRESS. Next: promote the limited HTTP runner into
registered integration coverage, then verify quote/matching/scope/completion/
payment/recovery with provider fixtures. Live model spend enforcement and real
payment settlement are still separate open items. Native device QA belongs to Tu.

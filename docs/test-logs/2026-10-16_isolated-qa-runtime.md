# Isolated local QA runtime — guarded startup, acceptance blocked

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

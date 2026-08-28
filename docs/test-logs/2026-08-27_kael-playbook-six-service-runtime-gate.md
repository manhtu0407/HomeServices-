# Kael six-service runtime gate rerun — 2026-08-27

## Verdict

`G2_PASS / G3_PASS / SQL_54_OF_54_PASS / G4_BLOCKED / G5_BLOCKED / NO_ROLLOUT`

The source-quality, Edge type-check, and local SQL gates now have fresh evidence.
The live staging baseline/after arms were not started because the approved
staging identity was absent. No playbook flag was enabled and no hosted
environment was changed.

## Identity and scope

- Worktree: `C:/Users/Phan Manh Tu/Desktop/home-services/.claude/worktrees/skills-structure-review-fdda04`
- Branch: `claude/audit-system-skills-e2ad42`
- Pre-publication HEAD: `f444cf04a232afe03afda3939368081521b02491`
- This is a verification addendum to the source audit; no source implementation was changed in this rerun.
- No commit, push, merge, deploy, Production mutation, or flag enablement was performed.

## Six-lane artifact reality

The source audit remains the inventory of record: 7,032 lines across the six
textbooks, runtime segments, corpora, and holdouts; the five non-electrical
lanes account for 5,090 lines. Each lane has exactly 24 corpus cases and 24
synthetic holdout cases, for 288 cases total. The displayed branch addition
count is not a Playbook count; it also includes raw test logs and other
worktree artifacts.

A fresh direct recount in this rerun reproduced the six per-file totals from
the source audit (`1,942`, `1,151`, `985`, `990`, `989`, `975`), summed to
`7,032`; parsing the JSON files reproduced `144` corpus cases and `144`
holdout cases.

## Verification loop

1. `pnpm db:local:up` — PASS at its start preflight: Docker reachable, 4.63 GB
   available RAM, disk and required ports free. The lean Supabase stack started
   successfully and reached healthy API/Auth/DB/Storage containers.
2. `pnpm edge:check` — PASS, exit 0; `edge check passed: 6 function(s)` using
   the pinned Deno image. This is the fresh G2 evidence for the six-service
   runtime graph.
3. `pnpm db:local:test` — NOT VERIFIED. The command exited 1 at its guard with
   `container 'supabase_db_nestscout' is not running`; it did not run the SQL
   files. The subsequent Docker inventory was empty, so this is not counted as
   a SQL failure or pass.
4. `pnpm db:local:doctor` after the stack was absent — REFUSED, exit 1, with
   3.71 GB available RAM against the 4 GB floor. Disk and ports were free. No
   bypass flag was used.
5. `pnpm lint:playbooks` — PASS, exit 0. All six lanes passed exact 24 + 24
   corpus/holdout validation, contract slug coverage, mismatch/out-of-scope
   coverage, difficulty and complexity thresholds, safety-signal coverage,
   grounded detail, no-diacritic input coverage, wording separation, and
   Appendix A/runtime parity.
6. Live G4 probe — each of `plumbing`, `hvac`, `handyman`, `cleaning`, and
   `upholstery` was attempted with both `baseline` and `after` arms. All ten
   invocations exited 1 before traffic with
   `missing_env_KAEL_PB_EVAL_MOBILE_API_URL`. The remaining deployment,
   client-identity, and authentication variables were also absent. Therefore
   no staging request, score, `playbookVersion`, delta, or G5 result exists.
7. Cleanup — `pnpm db:local:down` exited 0 and Docker Desktop was stopped.

## Final host boundary check

After cleanup, the host measured 15.71 GB total RAM, 5.16 GB available RAM.
The requested optional app targets were all at zero: Claude, Discord, Douyin,
Microsoft Edge, Chrome, Firefox, Cốc Cốc, Docker Desktop, and Docker backend.
Codex remained running. Windows Explorer, Windows Input, WSL, and system/security
processes were left intact as operating-system/runtime boundaries.

## Decision

`NEEDS_HOLDOUT / LIVE_EVAL_BLOCKED`. G2, the complete local source gate, and all
54 local SQL verification files are now evidenced, but this does not establish
live improvement or safety recall.
All five new playbook flags remain OFF. Independent/domain labels and an
approved staging deployment identity are still required before matched live
baseline/after, delta/G5, or any rollout decision.

## Next Step

Provide or load the approved staging endpoint, deployment version, client
identity, and either the signed-in bearer token or documented staging sign-in
variables in the runner environment. Then rerun the same 24-case corpus and
holdout slices for each service under the mandated pacing; do not use local
Docker credentials as staging credentials.

## Continuation rerun — local SQL lane

After the first report, the staging variables were rechecked and remained
absent. Docker was restarted to close the local SQL gap:

- `pnpm db:local:doctor` — PASS, Docker reachable, 4.17 GB RAM available,
  disk and ports free.
- `pnpm db:local:up` — FAIL, exit 1. Supabase stopped during health checks
  because `supabase_storage_nestscout` was unhealthy. No SQL test was started.
- `pnpm db:local:down` — PASS, exit 0. Docker Desktop was then stopped.

The local database volume was not reset or purged. This preserves local data and
leaves SQL verification honestly `UNVERIFIED`; diagnosing or repairing the
Storage health state is a separate environment task.

## Continuation rerun — host cleanup

The reboot had respawned three stale Preview/Jest trees. Their exact command
lines were inspected and the Expo 8095/8085 and mobile-Jest trees were stopped;
a follow-up scan found no stale Preview/test targets. Docker Desktop was then
force-stopped after its normal stop left processes alive; a follow-up check found
zero Docker Desktop/backend/dockerd processes. `com.docker.service` was
`Stopped / Manual`. WSL still lists the `docker-desktop` distro under the system
WSL service, so it was left intact rather than using a broad destructive WSL
shutdown or unregister operation.

At the final sample, the optional app targets and browsers were all zero and
Codex remained running. Available RAM was approximately 3.90 GB; this fluctuates
with Codex/WSL/system-security residency and is not presented as Docker capacity.

## Continuation rerun — precondition recheck

The next-step recheck found the staging variables and `.scratch/pb-eval.env`
still absent. `pnpm db:local:doctor` reached the daemon but refused to start at
2.81 GB available RAM, below the 4 GB floor. It did not launch a stack. The
doctor call briefly woke Docker Desktop; a final force-stop returned Docker
Desktop/backend/dockerd to zero. The stale Preview/Jest scan remained zero.

The final post-stop sample measured approximately 2.39 GB available RAM. This
is a host-resource observation, not evidence that Docker is usable; the remaining
pressure is from Codex/WSL/system-security residency and normal Windows memory
variation. No further Docker command was run after the final force-stop in that
cleanup slice.

## Continuation rerun — Docker root-cause evidence

Read-only inspection of Docker's local logs found repeated backend cancellation
and crash events while initialising the Inference manager. The backend tried to
remove/listen on `C:/Users/Phan Manh Tu/AppData/Local/Docker/run/dockerInference`
and Windows returned `The file cannot be accessed by the system` with an invalid
filename/path-syntax error. The exact path is a zero-byte reparse-point with no
resolved target; `fsutil reparsepoint query` and a recoverable move both failed.
It was not deleted, factory-reset, or replaced.

The VM log also recorded WSL vsock failures and a kernel `page allocation
failure` during the same Docker activity. This is strong evidence of a Docker /
WSL runtime problem around the health-check failure, but it does not by itself
prove that the Supabase Storage container's application-level health check has
the same root cause. The local Storage failure therefore remains an environment
blocker requiring separate repair.

Non-Docker source regressions were checked after this diagnosis:

- `pnpm test:api` — PASS, 25 test files; 603 passed, 1 skipped.
- `pnpm type-check:api` — PASS, exit 0.
- `pnpm lint:playbooks` — PASS, all six lanes and 288 cases.

## Continuation rerun — task-owned launchers

Later host scans found old Expo 8085 and mobile Jest commands being recreated by
Codex-owned terminal wrappers. The child commands were stopped by exact PID,
parent-tree, port, and repository-path checks; the Codex main process and Codex
MCP processes were not stopped. Docker's stale `desktop start --timeout 120`
launcher was also stopped with its Docker descendants. The last immediate scan
after cleanup showed no Expo target, no Jest target, and no Docker process. A
parent terminal may recreate a Preview command later; that is why this report
records a timestamped process snapshot rather than claiming a permanent OS-wide
shutdown. Windows system/security and WSL service boundaries remain intact.

## Continuation rerun — Docker launch after RAM cleanup

After the task-owned app cleanup, the host measured 5.22 GB free RAM and zero
target Docker/Expo/Jest/Douyin processes. Docker Desktop was launched once by
its installed executable, without using the factory-reset action. It did not
become usable: `docker info` failed with the missing
`npipe:////./pipe/dockerDesktopLinuxEngine` endpoint, and Docker Desktop/backend
exited. The backend log recorded the same 15:32Z failure:
`initializing Inference manager ... dockerInference ... The file cannot be
accessed by the system`.

The Docker/WSL processes were stopped again after this failed launch. This
confirms the blocker is not only the 4 GB preflight; Docker's current runtime
installation also fails to establish its Linux engine. No local stack, SQL
test, staging request, baseline/after arm, delta, or G5 was run in this retry.

## Continuation rerun — complete local runtime closure (2026-08-28)

The pre-publication branch included the scoped Docker runtime repair at
`f444cf04a232afe03afda3939368081521b02491`; local and remote branch refs matched
before this run. The earlier Docker/Storage blocker did not reproduce:

1. `pnpm docker:version:ensure` — PASS. Docker Engine `29.7.2`, Docker Compose
   `v5.4.0`; `strategy=latest-stable result=updated-or-current update_attempts=1`.
2. `pnpm db:local:doctor` — PASS. Daemon reachable; 4.26 GB available RAM,
   61.88 GB repository disk, and ports 55321-55324 free.
3. `pnpm db:local:up` — PASS. The lean Supabase stack reached healthy status;
   migrations and `supabase/seed.sql` completed.
4. `pnpm db:local:test` — PASS. `discovered=54 executed=54 passed=54 failed=0
   stopped_early=false`.
5. `pnpm edge:check` — PASS. `discovered=6 selected=6 checked=6 failed=0`.
6. `pnpm lint:playbooks` — PASS. Each of the six services has exactly 24 corpus
   and 24 holdout cases and satisfies the contract, coverage, difficulty,
   complexity, safety, grounded-detail, wording-separation, and parity ratchets.
7. `pnpm test:api` — PASS. 25 test files passed and 1 skipped; 603 tests passed
   and 1 skipped. `pnpm type-check:api` — PASS with `tsc --noEmit`.
8. A fresh physical-line recount reproduced `1,942` Electrical lines and
   `5,090` lines across the five new lanes (`7,032` total). Worktree artifacts
   are complete. Pre-publication HEAD `f444cf04` still tracked only the
   Electrical textbook/corpus/runtime files; this was the exact cause of the
   incomplete branch UI before the authorised publication step.
9. Staging preconditions remain absent:
   `KAEL_PB_EVAL_MOBILE_API_URL`, customer email/password, and
   `.scratch/pb-eval.env`. G4 was therefore stopped before traffic; no G5 delta
   can be calculated legally.
10. `pnpm db:local:down` — PASS. No project Supabase container remained; the
   post-down sample showed 4.28 GB available RAM.
11. `docker desktop stop` — PASS. Eight respawned Douyin processes were closed
    by exact process name after graceful-close attempts. The final snapshot had
    Docker Desktop/backend/dockerd, browsers, Claude, Discord, Zalo, Teams, and
    Douyin all at zero; Codex remained at one process. Available RAM was 5.30 GB
    and no project Supabase container remained.

Latest verdict: `LOCAL_RUNTIME_PASS / SQL_54_OF_54_PASS / G2_PASS / G3_PASS /
G4_BLOCKED / G5_BLOCKED / NEEDS_HOLDOUT / NO_ROLLOUT`. This continuation
supersedes the earlier `SQL_UNVERIFIED` status only; it does not weaken the
staging, independent-label, or Production gates.

## Publication boundary — 2026-08-28

The complete six-service source cohort was published separately as commit
`5d97f48d524d76a812a2340cfea97958e74e2cc4` on
`origin/claude/audit-system-skills-e2ad42`. Remote-tree verification found 6
textbooks, 12 corpus/holdout files, and 8 runtime playbook/registry/flags files.
This publication changes source visibility only: G4/G5 remain blocked, all
playbook flags remain OFF, and no hosted environment was changed.

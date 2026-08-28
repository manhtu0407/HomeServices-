---
name: kael-docker
description: "Route a database or Edge verification question to the narrowest evidence lane, ensure Docker is latest stable or capability-compatible before local work, and require relevant runtime proof before calling the task done. Use for Docker, Compose, local Supabase, migrations, reset, SQL/RLS/trigger/constraint verification, generated database types, and deno check under supabase/functions."
---

# kael-docker

This skill owns the question **“what evidence can answer this database or Edge question?”** Docker is
a local development dependency, not the goal and never a deployment target. Repository map:
[`docker/INDEX.md`](../../../docker/INDEX.md).

## Route the question first

Before any command, write one sentence naming the question and classify it:

- `structure`: object declarations, policies, grants, triggers, constraints, function signatures, or
  applied migrations.
- `behavior`: what a real database does when a statement, role, trigger, constraint, RPC, migration,
  or verification script executes.
- `types`: whether Edge functions or generated database types still type-check.

Take the narrowest lane whose evidence answers that exact class:

| Lane | Valid evidence | Requirements |
|---|---|---|
| **D — exact prior evidence** | `behavior` or `types` already executed for the exact commit | Exact commit SHA, workflow and job URL, and the log line that answers the question |
| **C — hosted read-only** | `structure` on one named hosted target | Read-only access and the target's project ref or environment name |
| **B — pinned Deno toolbox** | Current-checkout Edge `types` | An open local-runtime attempt budget, Docker daemon, and registry |
| **A — local Supabase stack** | Current-checkout database `behavior`, migrations, SQL checks, and generated types | An open local-runtime attempt budget, daemon, registry, immutable RAM floor, disk, ports, and Supabase CLI |

Never turn source inspection, an old green run, or a different commit into runtime proof. If no lane
answers the question, report it as unanswered.

## Docker version policy — latest stable or suitable

Before entering Lane A or B, run `pnpm docker:version:ensure` once. The runner records the installed
Docker and Compose versions, then takes one of two routes:

- When the Docker Desktop updater is available, invoke the official stable updater once with
  `docker desktop update --quiet`, bounded by a five-minute timeout. Re-read both versions after it
  succeeds. Do not select beta, test, preview, or another prerelease channel.
- When the Desktop updater is unavailable, accept the existing Engine/Compose installation as
  **suitable** only when Compose proves the `pull --policy` and `run --pull` capabilities this repo
  requires. This is a compatibility result, not a claim that the installation is globally latest.

Do not hardcode a “latest” version number, install through a privileged package manager, or retry a
failed update. A failed or timed-out update closes Lane A and B for this attempt. Version work never
authorizes an additional manual Docker Desktop restart, WSL/AppData edits, Docker-data repair, or a
prerelease channel.

## Preconditions

The local-runtime precondition is **gated and bounded**. Measure it only when Lane A or B is required:

1. Complete the version policy above once for the current local attempt.
2. Run one doctor probe with profile `lean` or `full`. The Docker daemon probe times out after exactly
   **15 seconds** and must reap its child process.
3. `lean` has an immutable **4 GB** available-RAM floor. `full` has an immutable **7 GB** floor.
   There is no numeric override and no skip-doctor route.
4. When RAM is at or above the selected floor, run the required runtime lane immediately. When RAM
   is below the floor, perform at most one safe RAM recovery pass, then one final doctor probe.
5. If Tu explicitly asks to launch or restart Docker Desktop, do that at most once. Coalesce an
   authorized launch/restart and any safe RAM recovery before the same single final bounded probe. A
   plain **“Next Step”** does not authorize another launch, restart, recovery pass, or probe.
6. After that final probe, the attempt budget is exhausted. Retry only after Tu explicitly identifies
   a changed environment and authorizes a new attempt.

### Windows launch-origin gate

Before consuming an authorized Docker Desktop launch on Windows, verify that the launch will use the
normal user filesystem namespace. If Codex Desktop, an AppContainer, or a `CodexSandboxUsers` child
sees `%LOCALAPPDATA%\Docker` while WSL/DrvFS cannot see the same absolute path under `/mnt/c`, the
skill must not launch Docker Desktop through `Start-Process`, `explorer.exe`, a CLI child, or another
agent-created broker. That mismatch is host-filesystem virtualization, not a daemon retry condition;
ACL edits do not turn the overlay into the profile WSL mounts.

In that state, require one launch from the Windows Start menu or an unsandboxed Windows shell owned by
Tu. That user launch consumes the same `1/1` launch budget and permits exactly one final doctor probe.
If it is unavailable, close Lane A/B for the current attempt. Do not try elevation, scheduled tasks,
WSL interop, AppData recreation, ACL repair, or a second launch as a workaround.

The safe RAM recovery pass begins with a read-only process inventory. It may stop only stale task-owned
helper, dev-server, test, or child processes tied to the current repo/session that are no longer needed,
and have an exact PID, command, and root recorded. It protects Codex, Claude Code, system/security
processes, Docker components needed by the run, and every user application that may contain unsaved
work. Closing any other application requires Tu's explicit approval of the exact target.

The skill never kills or terminates WSL, edits AppData or reparse points, touches Docker data,
disables services, prunes images or volumes, or guesses ownership from a port. Those are separate
host-repair or cleanup tasks and need their own exact scope and authority.

## Attempt budget

Record the counter before using the local runtime:

```text
version update: 0/1
daemon probes: 0/1
RAM recovery: 0/1
Docker Desktop launches or restarts: 0/0 unless explicitly authorized, then 0/1
final probe after launch/restart or RAM recovery: 0/1
Supabase starts: 0/1
Deno registry pulls: 0/1
runtime proof: 0/1
```

- Normal local work gets one probe. A reachable daemon does not permit repeated image pulls or stack
  starts.
- Explicit Docker Desktop authority permits one launch or restart and one final probe; it does not
  permit Windows, WSL, process, filesystem, or Docker-data repair.
- RAM recovery is one bounded inventory-and-stop pass, not repeated host tuning. If the final probe
  remains below the floor, local runtime is closed for this task state.
- `up` calls `supabase start` once. `edge-check` pulls the pinned Deno image once. A failure is a
  result and closes that route for the current attempt.

## Command forms

The canonical package commands and direct Windows/POSIX dispatcher forms are equivalent:

| Canonical | Direct form | Contract |
|---|---|---|
| `pnpm docker:version:ensure` | `node scripts/run.mjs docker/scripts/ensure-version` | One latest-stable Desktop update or capability-proven suitable install |
| `pnpm db:local:doctor -- --profile lean` | `node scripts/run.mjs docker/scripts/doctor --profile lean` | One bounded daemon probe; only `lean` or `full` |
| `pnpm db:local:up -- --profile lean` | `node scripts/run.mjs docker/scripts/up --profile lean` | Always doctor first; one `supabase start` |
| `pnpm db:local:down` | `node scripts/run.mjs docker/scripts/down` | Stop only; no purge or `--no-backup` |
| `pnpm db:local:reset` | `node scripts/run.mjs run-supabase db reset --local` | Explicitly local migration replay and seed |
| `pnpm db:local:test` | `node scripts/run.mjs docker/scripts/run-sql-tests` | Fail on zero SQL files; honest execution summary |
| `pnpm db:local:types` | `node scripts/run.mjs docker/scripts/gen-types` | Preserve the generator exit code and clean temporary output |
| `pnpm db:local:diff` | `node scripts/run.mjs run-supabase db diff --local` | Local schema diff |
| `pnpm db:local:lint` | `node scripts/run.mjs run-supabase db lint --local` | Local schema lint |
| `pnpm edge:check` | `node scripts/run.mjs docker/scripts/edge-check` | One pull; strict target selection and counts |

Runner exit codes are part of the interface:

- `0`: the requested runner proved success.
- `1`: environment or verification failure.
- `2`: invalid invocation or invalid/empty target selection.

## Lane A — local Supabase behavior

Use only when behavior has not already been proved for the exact commit and hosted mutation is not
allowed. Sequence: doctor → up → reset → test or types → down.

- `up` always runs doctor and invokes `supabase start` once.
- `reset` always spells out `--local`; never pass `--linked` or `--db-url`.
- The SQL runner discovers every `supabase/tests/*.sql` first. Zero files is invalid selection. Its
  closeout is `discovered/executed/passed/failed/stopped_early` on both platforms.
- A red SQL file is a verification result. Classify it as a script defect, schema defect, or missing
  execution context; never edit migrations merely to force green.
- `down` stops the local stack without deleting its volume. Deletion is outside this runner.

## Degraded lane

When the local-runtime gate is closed, continue only through Lane C or D if one answers the question.
Do not disguise degraded evidence as local execution.

### Lane C — named hosted read-only target

Use for `structure` only. Name the exact environment or Supabase project ref before querying. Catalog,
migration-list, policy, trigger, and row-count reads are allowed. DDL, DML, RPC mutation, seed, reset,
deployment, or destructive verification is forbidden. Hosted mutation belongs to `kael-supabase`
under its own authority.

Lane C cannot prove behavior merely because a constraint or policy exists. Its result must identify
the target and remain `PARTIAL` or `UNVERIFIED` for any behavioral claim.

### Lane D — exact CI or prior execution evidence

Use only when all four items are available:

1. the exact commit SHA being reviewed;
2. a direct workflow run URL;
3. the exact job URL;
4. a log line or artifact that answers the stated question.

A green workflow badge alone is insufficient. A SQL count can prove the discovered files executed on
that commit only when the job log identifies the reset, runner, totals, and successful status. Static
inspection of a SQL file may say “assertion exists, execution unverified”; it may not say “covered”.

## Runtime completion gate

For every task routed through this skill, runtime evidence is mandatory before `Task status: DONE`.
Source inspection, a static ratchet, Lane C alone, a green badge, or a run for another commit cannot
close the task. Use exactly one relevant proof route:

- Lane A or B executes the requested behavior or type check against the current checkout; or
- Lane D supplies the exact commit SHA, workflow URL, job URL, and log or artifact that proves the
  requested outcome.

If the checkout has uncommitted changes, CI for an older commit cannot prove them. If local runtime
is closed and no exact CI evidence exists, keep useful source work but report `Task status: BLOCKED`.
Prioritizing task completion means moving promptly to the valid runtime lane and producing evidence;
it never means looping on Docker, repeatedly reclaiming RAM, or widening host-repair authority.

## Edge selection contract

`edge-check --only` accepts only canonical function directories that contain both `deno.json` and
`index.ts`. An unknown name, empty selection, missing config, or missing entry point exits `2` before
Docker. The runner pulls Deno once, then reports `discovered/checked/failed`; skipped functions and
zero-target green results are forbidden.

## Runtime ownership and boundary

Two systems own different resources:

```text
supabase/config.toml   Supabase CLI owns postgres, auth, storage, and edge_runtime
compose.yaml           Docker Compose owns the pinned Deno toolbox only
```

Do not use Compose to stop or delete the Supabase stack, and do not infer Supabase ownership from a
container name or occupied port without inspecting the exact project and mounts.

The store-bound runtime remains:

```text
Expo React Native -> Supabase Auth -> Edge mobile-api -> Supabase DB/RPC/Storage/Realtime
```

No Dockerfile or Compose service from this skill may become a second deployment runtime.

## Close

Always close in this exact shape:

```text
Question and class:
Lane:
Target or commit SHA:
Docker version/current target:
Attempt count:
RAM recovery:
Commands run:
Runtime evidence:
Result: PASS | PARTIAL | UNVERIFIED
Task status: DONE | BLOCKED
Stop reason:
Unanswered:
```

`PASS` means the chosen lane proved the exact question. `PARTIAL` means valid evidence answered only
part of it. `UNVERIFIED` means no valid lane produced evidence. For Lane C, name the read-only target.
For Lane D, include SHA, workflow/job URLs, and the relevant log. For Lane A/B, include each bounded
attempt count, the final Docker/Compose version result, RAM recovery decision, runtime command, and
why the route stopped. `DONE` requires relevant runtime evidence; otherwise use `BLOCKED`, even when
the source edit itself is useful. Never claim completion from an unrun command or a closed lane.

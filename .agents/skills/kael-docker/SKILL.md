---
name: kael-docker
description: Run the NestScout database and Edge toolchain locally with Docker. Use when you need a real Postgres instead of reading SQL as text - running migrations, db reset, RLS or trigger or constraint checks, the SQL verification scripts, integration tests against a real database, regenerating the database types under packages/shared/src/types/database, or deno check on supabase/functions. Also use on the bare word docker, or for compose, container, local stack, or local supabase.
---

# kael-docker

Local Docker stack for this repo. Full map and rationale: [`docker/INDEX.md`](../../../docker/INDEX.md).

## Preconditions

| Needs | Check | If absent |
|---|---|---|
| Docker daemon | `docker info` | Stop. Report that the daemon is down. Reading SQL as text is not a substitute for executing it — say which check did not run. |
| >= 7 GB available RAM | `pnpm db:local:doctor` | Stop. The doctor prints the measured number; quote it rather than retrying. |
| A PowerShell host | `pwsh --version` | Stop. `docker/scripts/*.ps1` has no POSIX mirror by decision, so these commands are Windows-only. Hand the task to Tu's machine rather than improvising an equivalent. |

Every command below assumes all three. Verify before running, not after failing.

## The boundary — non-negotiable

Docker here is a **dev dependency**, never a deployment target. Nothing in this
repo is packaged into an image to serve users. The store-bound runtime stays:

```text
Expo React Native -> Supabase Auth -> Edge `mobile-api` -> Supabase DB/RPC/Storage
```

Writing a `Dockerfile` for `apps/api`, or a compose service answering HTTP for a
real client, violates `RULES.md` #0. Stop if you find yourself doing it.

## Commands

| Command | Does |
|---|---|
| `pnpm db:local:doctor` | Daemon, available RAM, disk, ports. Prints the measured number when it refuses. |
| `pnpm db:local:up` | Doctor first, then start the lean profile. |
| `pnpm db:local:down` | Stop the stack. |
| `pnpm db:local:reset` | Replay every migration from zero, then `supabase/seed.sql`. |
| `pnpm db:local:test` | Run the SQL verification scripts through psql in the db container. |
| `pnpm db:local:types` | Regenerate `packages/shared/src/types/database/**` from the local schema (generates, then splits by domain). |
| `pnpm db:local:diff` | Diff local schema against migrations. |
| `pnpm db:local:lint` | `supabase db lint --local`. |
| `pnpm edge:check` | Type-check `supabase/functions/**` in the pinned Deno container. |

## Rules

1. **Doctor before start.** Available RAM is the binding constraint — the target
   machine has 15.7 GB total and Supabase wants >= 7 GB for the full service set.
   `db:local:up` enforces this; do not route around it.
2. **Every `up` gets a `down`.** Nothing forces this. Leaving the stack running
   is a real cost on this machine.
3. **Never hand-edit `supabase/config.toml`** to shape a profile — it is
   committed. Profiles are selected with the CLI's `-x` flag.
4. **Never point local credentials at staging or production.** The local stack
   issues fixed, publicly-known demo JWTs. The integration-test guard throws
   rather than skips when it detects this, and that guard stays.
5. **A red SQL verification file is a result, not a crash.** Several have never
   been executed. Classify it — bad script, real schema defect, or missing JWT
   context — and report it. Do not edit a migration to force green.

## Two systems own containers

There is no single file covering all of it, and merging them would fork the
versions the Supabase CLI pins.

```text
supabase/config.toml   Supabase CLI owns postgres, auth, storage, edge_runtime
compose.yaml (root)    owns the pinned Deno toolbox only
```

`compose.yaml` is at the repo root so Compose auto-discovers it —
`docker compose run --rm deno …` works with no `-f` flag.

## Known trap

`deno check` without `--config` on `mobile-api` resolves bare specifiers as
plain npm names and emits a flood of phantom errors. `pnpm edge:check` embeds
the right per-function `--config`; use it rather than calling `deno check` by hand.

## Close

```text
Precondition check:
Stack state:
Commands run:
Result:
Blocker:
```

If the precondition check failed, report the measured blocker and stop. Reading SQL is not a substitute for running it against Postgres.

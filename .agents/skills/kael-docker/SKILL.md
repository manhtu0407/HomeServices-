---
name: kael-docker
description: Run the NestScout database and Edge toolchain locally with Docker. Use when you need a real Postgres instead of reading SQL as text - running migrations, db reset, RLS or trigger or constraint checks, the SQL verification scripts, integration tests against a real database, regenerating the database types under packages/shared/src/types/database, or deno check on supabase/functions. Also use on the bare word docker, or for compose, container, local stack, or local supabase.
---

# kael-docker

Local Docker stack for this repo. Full map and rationale: [`docker/INDEX.md`](../../../docker/INDEX.md).

## Preconditions

| Needs | Check | If absent |
|---|---|---|
| Docker daemon | `docker info` | Run the degraded lane. Quote the failure; reading SQL as text never becomes a substitute for executing it. |
| A reachable image registry | `docker compose pull --policy missing deno` — the one image this repo pins itself | Run the degraded lane. **This is the usual blocker in an agent container**, and it is not a tooling problem: the daemon starts and the CLI installs, but the Supabase image layers return `403 Forbidden` from the CDN behind the proxy (`governance/protocols/test-pillars.md`, "money and privilege invariants"). |
| >= 4 GB available RAM | `pnpm db:local:doctor` | Run the degraded lane. The doctor prints the measured number; quote it rather than retrying. |

Every command in `## Commands` assumes all three. Verify before running, not after failing. When any
of them is missing you do not stop — you switch lanes.

**Not a precondition: your shell.** All six `docker/scripts/*` runners have POSIX mirrors and
dispatch through `scripts/run.mjs`, so these commands run on Linux and macOS as well as Windows —
CI drives them from bash. Do not defer a Docker task to another machine on shell grounds alone.

## Degraded lane

No daemon means no Postgres, and no amount of reading changes that. It does not mean there is nothing
to do: the database work this repo is actually blocked on is *bookkeeping* that has rotted precisely
because nobody could run the scripts.

Reconcile `docs/test-debt-ledger.md` against what is on disk. For each invariant it lists, put the
row in one of three states:

| State | How to tell | What to write |
|---|---|---|
| script written, unrun | the named `supabase/tests/*.sql` exists **and** contains an assertion for this invariant | correct the row to "script asserts it, awaiting `pnpm db:local:test`" |
| script written, silent | the script exists but never asserts this invariant | flag it — this is worse than missing, because it reads as covered |
| no script | nothing under `supabase/tests/` names it | leave the row; it is real debt |

Then hand back the exact command list for a machine that has a daemon, in order:
`pnpm db:local:doctor` → `pnpm db:local:up` → `pnpm db:local:reset` → `pnpm db:local:test` →
`pnpm db:local:down`.

Two hard limits on this lane. Reading a `.sql` file and judging that it asserts an invariant is
static analysis, so the corrected row says **"asserts it, unrun"** and never "covered" — the whole
reason that ledger exists is that `toContain()` over SQL text proved nothing. And a schema question
that needs a real query still gets reported unanswered; the lane keeps bookkeeping honest, it does
not verify behavior.

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

1. **Doctor before start.** Available RAM is the binding constraint on a laptop —
   Supabase wants roughly 7 GB for the *full* service set, though the doctor's
   enforced floor is 4 GB and the lean profile is what `db:local:up` starts.
   Quote the measured number; do not route around the gate.
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
Lane:
Stack state:
Commands run:
Result:
Blocker:
```

Name which lane ran. In the degraded lane, `Result` is the ledger reconciliation and `Blocker` is
the measured precondition failure — never a verdict about schema behavior. Reading SQL is not a
substitute for running it against Postgres, and a corrected ledger row is bookkeeping, not proof.

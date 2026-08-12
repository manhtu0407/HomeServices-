# docker/ — local development stack

Everything an agent needs to run this project's **database and Edge toolchain on
this machine**, without asking Tu and without touching a hosted environment.

This folder is the map. The commands live in the root `package.json` as
`db:local:*` and `edge:check`; the always-on entry point is the `kael-docker`
skill, which is listed to every agent session automatically.

---

## The hard boundary — read this first

Docker here is a **dev dependency**, never a deployment target.

| | Docker-as-deployment | Docker-as-dev-dependency |
|---|---|---|
| What it is | Packaging `apps/api` or a `server.ts` into an image for production | Running Postgres + Auth + Storage + Deno **on a dev machine**, for tests |
| Touches `RULES.md` #0 | **Yes** — creates a second runtime beside the Edge Function | **No** — nothing is deployed, nothing serves a user |
| Status | **Forbidden.** Rejected in `governance/Plan.md` §46.0.2 D1 | **This folder** |

The store-bound runtime path is unchanged and is not negotiable:

```text
Expo React Native -> Supabase Auth -> Edge Function `mobile-api`
  -> Supabase DB/RPC/Storage/Realtime -> server-side AI and external providers
```

If you find yourself writing a `Dockerfile` for `apps/api`, or a compose service
that answers HTTP for a real client, stop — that is the left column.

---

## Who owns which containers

There is deliberately **no single file that covers all of this repo's Docker**.
Two systems own containers, and merging them would mean hand-rolling a second
copy of the Supabase stack that drifts from the CLI's pinned versions.

| Owner | Covers | You configure it in |
|---|---|---|
| Supabase CLI | postgres, auth, storage, edge_runtime, studio, … | `supabase/config.toml` (committed — do not hand-edit and forget to revert) |
| Compose | the pinned Deno toolbox only | `compose.yaml` at the repo root |

`compose.yaml` sits at the **root**, not in this folder, because Compose only
auto-discovers `compose.yaml` / `compose.yml` / `docker-compose.yaml` /
`docker-compose.yml` in the working directory. Keeping it at the root is what
lets `docker compose run --rm deno …` work with no `-f` flag.

---

## Commands

All of these are aliases with a gate in front — they are not raw CLI passthrough.

| Command | Does |
|---|---|
| `pnpm db:local:doctor` | Check daemon, available RAM, disk, ports. Refuses and prints the measured number. |
| `pnpm db:local:up` | `doctor` first, then start the lean profile. |
| `pnpm db:local:down` | Stop the stack. **Always run this when finished.** |
| `pnpm db:local:reset` | Replay every migration from zero, then `supabase/seed.sql`. |
| `pnpm db:local:test` | Run the SQL verification scripts through psql in the db container. |
| `pnpm db:local:types` | Regenerate `packages/shared/src/types/database/**` from the local schema (generates, then splits by domain). |
| `pnpm db:local:diff` | Diff local schema against migrations. |
| `pnpm db:local:lint` | `supabase db lint --local`. |
| `pnpm edge:check` | Type-check `supabase/functions/**` in the pinned Deno container. |

### Rules that are not optional

- **Run `doctor` before starting.** Available RAM is the binding constraint on a
  16 GB machine; Supabase recommends >= 7 GB for the full service set.
- **Every `up` needs its `down`.** Nothing enforces this. Leaving the stack
  running overnight is a real cost.
- **Never hand-edit `supabase/config.toml` solely to shape a profile.** Use `-x`; if a host port changes, update the runtime consumers and doctor in the same change.
- **Never point the local stack's credentials at staging or production.** The
  local stack issues fixed, publicly-known demo JWTs.

---

## Profiles

Managed with the CLI's `-x` exclusion flag, never by editing `config.toml`.

- [`profiles/lean.md`](profiles/lean.md) — the default. db + auth + storage + edge_runtime.
- [`profiles/full.md`](profiles/full.md) — adds studio, Mailpit, realtime, analytics. Only when you need them.

---

## Cleaning up

```bash
pnpm db:local:down
```

To also drop the database volume and reclaim its disk:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File docker/scripts/down.ps1 -Purge
```

To see what Docker is holding overall:

```bash
docker system df
```

`docker system prune -a --volumes` is intentionally **not** in the agent
allowlist — it destroys data outside this project. Tu runs that by hand.

---

## Considered and deliberately not built

Recorded here so a later session does not "discover" these and build them.

| | Why not |
|---|---|
| `Dockerfile` for `apps/api` | Violates the hard boundary above and `RULES.md` #0 — a second runtime. |
| Docker for Expo / mobile | Native builds need macOS and Xcode. EAS already covers this. |
| `act` (GitHub Actions locally) | CI is three thin workflows with no type-check job and no full unit-test job. Not worth several GB. |
| devcontainer / Codespaces | Changes Tu's whole working environment, not just adds a tool. |
| A Node/pnpm "matches CI" box | The workflows call `node scripts/*.mjs` and `pnpm --filter … exec vitest` directly, which already run on Windows. The only real delta is OS-level path/case behavior. |
| Converting the SQL scripts to pgTAP | They already self-assert with `raise exception`; psql runs all of them as-is. pgTAP would add format, not coverage. |
| Deleting the text-assertion schema tests | They catch textual drift and are the only layer that runs in CI without Docker. psql is a layer on top, not a replacement. |

---

## Status of the measurements

The numbers this folder's docs would normally quote — image pull time, disk
consumed, stack idle RAM — **have not been measured yet**. The measurement spike
(`governance/Plan.md` §49 D0) was blocked before it could start: available RAM on
this machine measured 2.76–3.22 GB against a 4 GB floor, and neither execute
worktree has `node_modules`, so the workspace Supabase CLI cannot resolve.

Nothing in this folder invents those numbers. `profiles/lean.md` marks each one
as unmeasured. Fill them in from a real run, not from an estimate.

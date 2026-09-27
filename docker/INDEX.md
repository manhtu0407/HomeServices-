# docker/ — local development stack

Everything an agent needs to run this project's **database and Edge toolchain on
this machine**. The `kael-docker` skill also routes questions that can be answered
without a local runtime to a named hosted read-only target or exact CI evidence.

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

These aliases are explicit local operations. `db:local:up` always owns the doctor
gate; the other commands validate their own invocation and target.

| Command | Does |
|---|---|
| `pnpm docker:version:ensure` | Use Docker Desktop's stable updater once when available; otherwise prove the installed Compose supports this repo's required pull-policy flags. |
| `pnpm db:local:doctor` | One bounded 15-second daemon probe plus available RAM, disk, and ports. Profile is only `lean` or `full`. |
| `pnpm db:local:up` | `doctor` first, then start the lean profile. |
| `pnpm db:local:down` | Stop the stack without deleting its database volume. **Always run this when finished.** |
| `pnpm db:local:reset` | Replay every migration from zero with explicit `--local`, then `supabase/seed.sql`. |
| `pnpm db:local:test` | Run the SQL verification scripts through psql in the db container. |
| `pnpm db:local:types` | Regenerate `packages/shared/src/types/database/**` from the local schema (generates, then splits by domain). |
| `pnpm db:local:diff` | Diff local schema against migrations. |
| `pnpm db:local:lint` | `supabase db lint --local --fail-on warning`. |
| `pnpm edge:check` | Type-check `supabase/functions/**` in the pinned Deno container. |

The `node scripts/run.mjs …` form refreshes known per-user and system Docker CLI
locations on Windows before dispatching a runner. This keeps an already-open
agent process from using a stale `PATH` after Docker Desktop is installed or
updated.

On Windows, a launch is also gated by its filesystem origin. If Codex Desktop,
an AppContainer, or a `CodexSandboxUsers` child sees `%LOCALAPPDATA%\Docker` but
WSL/DrvFS cannot see the same path under `/mnt/c`, do not launch Docker Desktop
through `Start-Process`, `explorer.exe`, another CLI child, or an agent-created
broker. The state is in a packaged-app overlay that the Docker WSL backend cannot
use. One launch from the Windows Start menu or an unsandboxed Windows shell counts
as the authorized `1/1` launch; after it, run only the single final doctor probe.
Do not repair ACLs/AppData or try a second brokered launch inside `kael-docker`.

### Rules that are not optional

- **Resolve the Docker version before Lane A/B.** Desktop uses one bounded stable update; an
  installation without the Desktop updater must prove `compose pull --policy` and
  `compose run --pull`. No prerelease channel, hardcoded latest version, privileged package-manager
  install, or automatic retry is allowed.
- **Fail closed on a virtualized Windows launch origin.** A Windows/DrvFS path mismatch requires one
  Start-menu or unsandboxed-shell launch by Tu; agent-brokered GUI launches do not consume extra retries.
- **Run `doctor` before starting.** The immutable floor is 4 GB for `lean` and
  7 GB for `full`; there is no numeric override or skip-doctor route.
- **Run immediately when RAM passes; recover once when it does not.** The one recovery pass can stop
  only recorded stale task-owned helper/dev/test children. Codex, Claude Code, system/security,
  Docker components needed by the run, and user apps with possible unsaved work stay protected.
- **Every `up` needs its `down`.** Nothing enforces this. Leaving the stack
  running overnight is a real cost.
- **Never hand-edit `supabase/config.toml` solely to shape a profile.** Use `-x`; if a host port changes, update the runtime consumers and doctor in the same change.
- **Never point the local stack's credentials at staging or production.** The
  local stack issues fixed, publicly-known demo JWTs.

### Evidence follows the question

- Lane C may close an exact structure question when the named hosted target and read-only query fully
  answer it. Lane C cannot prove behavior or types.
- Behavior and type questions need Lane A/B execution against the current checkout or Lane D evidence
  for the exact commit with workflow URL, job URL, and the proving log/artifact.
- Source inspection and static checks may close source/static acceptance claims only. They do not
  prove database behavior.
- When local runtime is closed, source/static work can continue independently. Use C/D only for
  questions those lanes answer. If acceptance still needs unavailable Lane A/B proof and no exact
  Lane D evidence exists, report `BLOCKED` with the missing proof.

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

To inspect what Docker is holding overall, without deleting anything:

```bash
docker system df
```

The down runner exposes no purge mode and cannot generate `--no-backup`.
Reclaiming a volume or image requires a separate read-only ownership check and
Tu's explicit approval of the exact target. This folder never recommends a
global prune or treats another stack as project-owned from a port number alone.

---

## Considered and deliberately not built

Recorded here so a later session does not "discover" these and build them.

| | Why not |
|---|---|
| `Dockerfile` for `apps/api` | Violates the hard boundary above and `RULES.md` #0 — a second runtime. |
| Docker for Expo / mobile | Native builds need macOS and Xcode. EAS already covers this. |
| `act` (GitHub Actions locally) | Not worth several GB to re-run what CI already runs for free. `ci.yml` carries the heavy lanes — `workspace` (type-check, test, and build of the affected workspaces) and `database`, which starts Supabase, **replays every migration from empty**, runs the SQL verification matrix, regenerates the database types and fails on drift, lints the schema, and runs the integration suite — on ready pull requests whenever the changed paths select them, and weekly on main. A green `database` run is the evidence a laptop that cannot start the stack will never produce locally. |
| devcontainer / Codespaces | Changes Tu's whole working environment, not just adds a tool. |
| A Node/pnpm "matches CI" box | The workflows call `node scripts/*.mjs` and `pnpm --filter … exec vitest` directly, which already run on Windows. The only real delta is OS-level path/case behavior. |
| Converting the SQL scripts to pgTAP | They already self-assert with `raise exception`; psql runs all of them as-is. pgTAP would add format, not coverage. |
| Deleting the text-assertion schema tests | They catch textual drift and are the only layer that runs in CI without Docker. psql is a layer on top, not a replacement. |

---

## Status of the measurements

The numbers this folder's docs would normally quote — image pull time, disk
consumed, stack idle RAM — **have not been established for a successful local
stack run**. Historical attempts crossed and fell below the 4 GB floor while the
daemon also became unavailable; those measurements are evidence for those
attempts only, not permission to retry or relax the gate.

Nothing in this folder invents those numbers. `profiles/lean.md` marks each one
as unmeasured. Fill them in from a real run, not from an estimate.

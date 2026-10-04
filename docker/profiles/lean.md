# lean profile — the default

Runs the services the tests actually need and excludes the rest. The reason is
RAM, not disk: Supabase recommends >= 7 GB for the full service set, and the
target machine has 15.7 GB total with far less than that free in practice.

## What runs

```text
postgres        the database under test
auth            needed by the RLS and per-actor tests
storage         needed by the media/evidence paths
edge_runtime    serves supabase/functions locally
```

## What is excluded

Applied with the CLI's `-x` flag. The list lives in
[`../scripts/up.ps1`](../scripts/up.ps1) so the script and this document cannot
drift.

```text
studio  mailpit  realtime  imgproxy  vector  logflare  supavisor
```

> Verified with the workspace CLI (`supabase start --help`) and a successful
> Lean start. `mailpit` is the CLI container name; `[inbucket]` remains the
> corresponding configuration section in `supabase/config.toml`.

## Start it

```bash
pnpm db:local:up
```

That runs `doctor` first. Available RAM is reported for capacity context only;
there is no minimum RAM requirement and low RAM alone does not block startup.
The doctor still requires a reachable Docker daemon, sufficient free disk, and
available ports. A Docker or Supabase failure is reported directly; the runner
does not retry automatically.

## Measurements

| | Value |
|---|---|
| Edge-only Deno lane | Verified separately; it does not measure this profile |
| Full local-stack resource envelope | **not established on this host** |
| Minimum available RAM before start | **None; reported for information only** |

Do not infer the missing resource envelope from CI or the Edge-only lane. It
requires one doctor-approved start plus `docker stats` and free-disk before/after.

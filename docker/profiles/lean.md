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
studio  inbucket  realtime  imgproxy  vector  logflare  supavisor
```

> **Unverified against this CLI version.** These are the documented exclusion
> names, but no run has yet confirmed which ones the workspace CLI accepts —
> the measurement spike never started (see the status note in
> [`../INDEX.md`](../INDEX.md)). `up.ps1` passes them straight through, so an
> unknown name surfaces as a CLI error rather than being silently ignored.
> When you get a real run, correct this list from the CLI's own output.

## Start it

```bash
pnpm db:local:up
```

That runs `doctor` first and refuses if available RAM is under 4 GB.

To bypass the gate deliberately — for example to measure what actually happens
under pressure — call the script directly:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File docker/scripts/up.ps1 -MinRamGb 2
```

## Measurements

| | Value |
|---|---|
| Image pull time | **not measured** |
| Disk consumed | **not measured** |
| Stack RAM at idle | **not measured** |
| Machine available RAM while running | **not measured** |
| Disk reclaimed after `down` | **not measured** |

Do not fill these from an estimate. They come from one real run:
`docker stats`, and free-disk before/after.

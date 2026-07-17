# B6 / OQ5 — does an Edge deploy bundle code outside `supabase/functions/`?

Staging only (`xyylanuyflrjzbjzhqfl`). Production was never touched. Pinned CLI `supabase 2.98.2`
(the repo's own pin, resolved from `node_modules/.pnpm/supabase@2.98.2/.../bin/supabase.exe`), Docker
daemon up (server 29.6.1), local bundling — **no `--use-api`**, because that switches to server-side
bundling and would answer about a different bundler.

## Answer

**Bundling across the workspace boundary: YES.** Proven, not inferred.

**`packages/shared` as it stands today: NO.** The deploy bundler rejects its extensionless imports.
These are two separate findings and only the first one was the spike's original question.

## Probe 1 — can a bundle contain a file outside `supabase/functions/`?

`supabase/functions/deno-probe-spike/index.ts` imported `../../../packages/shared/src/deno-probe.ts`
(a single `export const`, no imports of its own, so a red could only mean "the bundler refused to
cross the boundary").

```
Bundling Function: deno-probe-spike
Deploying Function: deno-probe-spike (script size: 1.055kB)
Deployed Functions on project xyylanuyflrjzbjzhqfl: deno-probe-spike
EXIT=0
```

The deployed bundle listed both files — the second one lives outside `supabase/`:

```
files:
  multi-llm-plan-review-fa5814/supabase/functions/deno-probe-spike/index.ts
  multi-llm-plan-review-fa5814/packages/shared/src/deno-probe.ts
```

Runtime, not just deploy:

```
GET /functions/v1/deno-probe-spike  ->  HTTP 200  {"probe":"ok"}
```

`"ok"` is the value of the const declared in `packages/shared/`, so the file was bundled, shipped and
executed.

**Mechanism.** The bundle root is not fixed at `supabase/functions/`; it is the common ancestor of the
module graph. Deployed `mobile-api` roots at `source/` and carries `supabase/functions/_shared/`; this
probe rooted one level wider, at the worktree, and carried `packages/`. The bundler walks imports and
roots the archive wherever the graph reaches. Directory boundaries are not the constraint.

## Probe 2 — can it bundle the real `packages/shared` entry?

Same shape, but importing the actual entry: `../../../packages/shared/src/index.ts` (31 modules,
458.86 KB — well under both the 20 MB local and 5 MB server-side limits, so size is not the issue).

```
Bundling Function: deno-probe-real-spike
Error: failed to create the graph

Caused by:
    Module not found "file:///Users/Phan%20Manh%20Tu/Desktop/home-services/.claude/worktrees/multi-llm-plan-review-fa5814/packages/shared/src/types".
        at file:///Users/Phan%20Manh%20Tu/Desktop/home-services/.claude/worktrees/multi-llm-plan-review-fa5814/packages/shared/src/index.ts:1:15
error running container: exit 1
EXIT=1
```

This red is on-topic, not environmental: Docker was up and had just bundled probe 1, the token worked,
the network worked, and the failure names an exact source line. `index.ts:1` is `export * from './types'`.

## Why a local `deno check` disagrees — and why the local result was the misleading one

Locally the same import passes:

| test | result |
|---|---|
| `deno check` on the real entry | exit 0, graph resolves, 31 deps / 458.86 KB |
| same, `DENO_NO_PACKAGE_JSON=1` | exit 1 — `Cannot find module '.../src/types'` at `index.ts:1:15` |
| extensionless import from a file *outside* any package.json scope | exit 1 |

Deno 2 applies Node resolution to files inside a `package.json` scope, and `packages/shared/` has one
(`@nestscout/shared`, `main: ./src/index.ts`). That is why a local check resolves `'./types'` to
`types/index.ts`.

The deploy bundler does not get that. It runs Deno inside a Linux container — note the error path is
`file:///Users/...` with no drive letter — where the host's `node_modules` and package scope are not in
play. Node resolution is off, the extension is required, and `index.ts:1` fails.

So a green `deno check` is not evidence that a deploy will bundle. Anything relying on package.json
scope resolves on a developer's machine and dies in the container.

## Consequence for OQ5

The boundary is not the blocker; the import style inside `packages/shared` is. `packages/shared/src`
has 76 relative imports in non-test source and **all 76 are extensionless** — there is not one
extensioned relative import to pattern-match against. Every one would have to gain a `.ts` before any
Edge function could import the package entry.

That is a separate, larger change from the `domain.ts` move itself, and it lands in a package that
`apps/api` and `apps/mobile` also consume.

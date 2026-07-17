# Backend Reorg §44 — B0 Green Baseline

Baseline capture for Plan.md §44 (Backend Reorganization — Domain Chains + Drift-Proof Reorg).
B0 is the hard gate: know the truth before moving any file. The §44 audit ran **read-only and never
executed a test** — this is the first run with real numbers.

- **Date:** 2026-07-17
- **Branch:** `claude/backend-audit-restructure-609b5d` (worktree `multi-llm-plan-review-fa5814`)
- **HEAD:** `0359f1db2` — `#119 harden electrical intake evaluation` (fast-forwarded to `origin/main`)
- **Verdict:** **ALL 4 GATES GREEN.** §44 B0 gate passes → B1 may proceed.
- **Diff produced by B0:** none. `git status` = ` M governance/Plan.md` only (the uncommitted §44 plan itself).

## Result

| # | Gate | Command | Exit | Result |
|---|---|---|---|---|
| 1 | `deno check` (Edge) | `deno check --config supabase/functions/mobile-api/deno.json supabase/functions/mobile-api/index.ts` | **0** | Full Edge module graph type-checks clean |
| 2 | `lint:structure` | `node scripts/lint-structure.mjs` | **0** | `structure ok: 632 source files; 14 grandfathered oversize, 122 grandfathered dup-type groups` |
| 3 | `lint:comments` | `node scripts/check-comment-discipline.mjs` | **0** | `clean — no note-banner comments found` |
| 4a | test `apps/api` | `vitest run` (in `apps/api`) | **0** | **215 files passed, 4 skipped (219)** · **2876 tests passed, 75 skipped (2951)** · 19.25s |
| 4b | test `packages/shared` | `vitest run` (in `packages/shared`) | **0** | **23 files passed (23)** · **725 tests passed (725)** · 1.65s |

**Totals: 3601 tests passed · 75 skipped · 0 failed · 238 test files passed.**

`deno check` did **not** rewrite `deno.lock` (verified via `git diff`).

## Baseline vs prior memory

The last recorded numbers (2026-06-14 security audit) were `api 1561 / shared 586 pass + 2 pre-existing
fails`. Current run: `api 2876 / shared 725, 0 fails`. The two pre-existing failures are **gone** and the
suites have roughly doubled. The §44 risk note "B0 có thể đỏ sẵn (PR #66 từng đỏ)" did **not** materialise
— the baseline is genuinely green.

## Toolchain — what was actually required (two real blockers found)

The worktree has no `node_modules` and the Bash tool has no node/pnpm on PATH. Provisioning notes, because
both blockers below produce **false reds** that look like real test failures:

1. **Node 20.18.0 is too old for this repo's test runner.** `vitest@4.1.6` pulls `rolldown@1.0.0`, whose
   native binding `@rolldown/binding-win32-x64-msvc` declares `engines: {node: ^20.19.0 || >=22.12.0}`.
   Under Node 20.18.0 pnpm **silently skips the optional binding** (no error at install time), and vitest
   then dies at run time with `Cannot find module './rolldown-binding.win32-x64-msvc.node'`. This reads as a
   broken test suite but is purely an engine mismatch. **Fix:** provisioned Node **22.20.0** to
   `C:/tmp/hs-toolchain/node-v22.20.0-win-x64` and reinstalled — package count went 1234 → 1238 and the
   binding appeared. The pre-existing `C:/tmp/hs-env.sh` still points at Node 20.18.0 and also `cd`s into a
   *different* worktree (`reverent-galileo-cc9b53`); it is not usable as-is for this work.
2. **`pnpm exec` / npm-script wrappers cannot see the portable node.** Every `package.json` script shells
   through `powershell ... run-node.ps1`, and `pnpm exec vitest` spawns via cmd.exe, which does not inherit
   the Bash-function `node`. Both fail with `'node'/'vitest' is not recognized`. **Fix:** invoke the runner
   directly — `node node_modules/.pnpm/vitest@4.1.6_*/node_modules/vitest/vitest.mjs run` from the package
   dir. The linters run fine as `node scripts/<name>.mjs`.

## Known limitation (not a gate failure)

`pnpm install` exits **1** on the `supabase` package's postinstall (`node scripts/postinstall.js` →
`'node' is not recognized`, same cmd.exe/PATH cause as above). This only fails to download the **supabase
CLI binary**. All 1238 workspace packages resolve and link correctly, and **no B0 gate uses the supabase
CLI**, so the four gates are unaffected. It would matter for §44 B7 (DB migrations), which is out of scope
here; B7 uses the Supabase MCP tools regardless.

## Not run / not claimed

Honest scope of this baseline — these were **not** executed and nothing is claimed about them:

- `apps/mobile` tests (jest-expo/RNTL) — §44 B0 defines the gate as *api + shared*; mobile is untouched by
  §44 (Frontend `v21`/`lib` is debt D-3, explicitly out of scope).
- Integration tests (`apps/api/src/__tests__/integration/**`) — require live staging Supabase secrets.
- `type-check` for any package — not part of the §44 4-gate definition.
- Any Edge deploy / staging smoke — out of scope until B6/B7.

## F5 verified against the real tree (the reason B1 exists)

The §44 finding F5 ("`structure-baseline.json` is stale → the ratchet has no teeth") is **confirmed by
measurement**, using the linter's own line-count method (`split(/\r?\n/).length`):

| File | Grandfathered at | Actual | Slack |
|---|---|---|---|
| `supabase/functions/mobile-api/_shared/router.ts` | 2,534 | **1,174** | may grow **2.16x** and still pass |
| `apps/mobile/components/customer/v21/surfaces.tsx` | 5,637 | **1,833** | may grow **3.07x** and still pass |
| `.../kael/cron/process-batch-results.ts` | 1,059 | 948 | 111 lines |
| `.../_shared/services.ts` | *(absent — no longer oversize)* | 317 | n/a |

Flat-file counts also match the §44.3 map exactly: `services/` = **54** flat `.ts`, `kael/` = **63** flat `.ts`.

F13 (the reorg window is closing) also holds — three files sit just under the 800 cap:
`services/kael-chat.service.ts` **766**, `services/kael-chat-core.ts` **746**, `kael/pipeline.ts` **764**.

# Kael Charter Wiring Audit — KC0.5 (Plan.md §39)

Date: 2026-07-06. Role: Principal Conversation & Agent-Persona Architect.
Purpose: after Tu's full UI rebuild, verify the chain charter → const `system-prompt.ts` → Edge consumers → guardrails → rebuilt UI is intact, so KC1–KC5 charter copy actually surfaces. Read-only audit; no UI rebuild, no backend logic change.

## Baseline (real, reproducible — KC0)

- Toolchain: portable Node `v20.18.0` + pnpm `10.16.1` at `C:/tmp/hs-toolchain`; env helper `C:/tmp/hs-env-kc.sh` (worktree `exciting-jepsen-7bec6e`, branch `claude/kael-guardrails-review`). `pnpm install --force` was required once to link the missing `@rolldown/binding-win32-x64-msvc` native binding (vitest 4 / rolldown); `pnpm-lock.yaml` reverted afterward to keep scope clean.
- `packages/shared` vitest: **16 files, 581 passed** — GREEN.
- `apps/api` vitest: **1610 passed, 1 failed, 75 skipped** (109 files). The single failure is pre-existing and unrelated to the charter: `mobile-api-edge-schema.test.ts:1122` asserts the worker mobile surface contains `'Exact unit unlocks after lobby check-in and identity check.'`, a string dropped by Tu's worker-UI rebuild (apartment-access surface). No charter/system-prompt/guardrail test is affected. Flagged to Tu; not built upon.

## Wiring map — 5 links

| # | Link | State | Evidence |
|---|------|-------|----------|
| 1 | charter/* → const `system-prompt.ts` | INTACT | `IDENTITY/PERSONA/MISSION/ACTOR_STYLE/PURPOSE_GUIDANCE/LANGUAGE_RULES/FORBIDDEN_LANGUAGE/SECURITY_DIRECTIVES` are literal copies (`system-prompt.ts` L58–125). Edge cannot import `packages/shared`, so runtime never reads `.md` — copies are the contract (sync §39.4). |
| 2 | const `system-prompt.ts` → Edge consumers | INTACT (scoped) | `buildKaelSystemPrompt` consumed at `customer-assistant.ts:262` (purpose `educational_response`) and `worker-assist.ts:245` (purpose `worker_assist`). The structured pipeline (intent/vision/price/brief) uses a separate `KAEL_BUSINESS_GUARDRAILS` (`kael/types.ts`) by design. → Persona/register/closing/spine copy reaches the **conversational** surfaces, which is exactly where it belongs. |
| 3 | Guardrails → output | INTACT | Pre-pipeline refusal: `boundary-guard.ts` (`prompt_injection` / `out_of_scope` / `service_mismatch`, RULES #3/#6). Post-output: `runKaelSelfCheckPipeline` at `customer-assistant.ts:192` + worker chat + `kael-chat-core`. Disclaimer (#4) in `output-pipeline.ts` / `artifact-contract.ts` / `scope-change.service.ts` / `job-create.service.ts`. |
| 4 | Edge → rebuilt UI | INTACT | v21 surfaces render disclaimer + refusal + confirm: `agentic-decision-surfaces.tsx`, `chat-stateful-surfaces.tsx`, `surfaces.tsx`. Confirm/decision copy (KC3 hook) lives in `agentic-decision-surfaces.tsx`. |
| 5 | Hook points for KC1–KC5 | PRESENT / partial | KC1 (Service Standard) → `PERSONA`/`MISSION` const → both consumers ✓. KC3 (closing) → `PURPOSE_GUIDANCE`/tone-matrix + `agentic-decision-surfaces` confirm ✓. KC4 (spine) → `PERSONA` + `forbidden-language` + self-check ✓. KC2 (region) → prompt-level hook `LANGUAGE_RULES` ✓, but a **runtime deterministic region detector is not yet wired** — that is new build inside KC2 (lexicon asset + prompt guidance land now; runtime detector is the larger piece). KC7 (voice) not built — gated by §36 device spike. |

## Broken links

None at the charter/prompt layer — no small re-wiring needed. Larger items are already their own phases (KC2 runtime region-detector, KC7 voice). No UI rebuild required; KC1–KC4 copy will surface through links 2→3→4 unchanged.

# Canonical Memory - NestScout

This is the single canonical AI-agent memory file. Read it last after `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md` when relevant, `AGENTS.md`, `CLAUDE.md`, `skills.md`, and task-specific docs/code.

The active Recall Index is intentionally short. Full entry detail lives in `docs/memory/<YYYY-MM>.md`; fetch only the entry needed. Newest first.

**Writing back is mandatory, not optional.** At session close, write the entry or state why the Session Memory Gate does not apply (`governance/critical.md` §3). Claude Code runs `/kael-mem`; Codex does the same steps by hand. One line here, full entry in the period file. Where things go and what belongs: [`docs/memory/INDEX.md`](../docs/memory/INDEX.md).

## Recall Index -> `docs/memory/2026-08.md`

- **2026-08-03** Plan §48 executed - `CLAUDE.md` now has a 3-tier **Map Process** (Tier 1 always / Tier 2 by task / Tier 3 skills 18+11=29) and `STRUCTURES.md` a new **§1.5 "Where The Product Actually Is"**, every line anchored to a PR (milestone #145, `4f392953`). Survey found three dead/shell areas now written down: `worker_stats`/`customer_stats` (#70) have tables+views but **nothing calls `recompute_all_actor_stats()` and no Edge code reads them**; worker map has **no map SDK dependency at all**; admin covers 1 of 6 §3 duties. PR-attribution recipe: `git log --follow --diff-filter=A` (plain `-A` returns the reorg PR and lies), then `--ancestry-path … | grep "^#" | tail -1`. **G8 missed: `CLAUDE.md` 140 lines vs ≤130** — duplication already removed, proposed ≤145, Tu decides. Diff cleanup caught my own contradiction: 5 docs ordered "run `/kael-mem`" while Codex has no slash commands. Line-ending warnings are `core.autocrlf` noise, not trash — don't "fix" them. Gates green, zero code touched.
- **2026-08-03** Governance stack upgrade - closed the memory loop: `critical.md` §25 had 15 read/verify items and zero write item, and the only "update memory" wording lived in `protocols/docs-workflow.md` which loads for the `docs` class only, so `feature`/`refactor`/`test` sessions were never asked to write. Added §3 Session Memory Gate + checklist #16 + `docs/memory/INDEX.md`. Also finished the NestScout rebrand (CLAUDE/STRUCTURES/design/skills + 20 skills; `STRUCTURES.md:97` had been self-contradictory), fixed `RULES.md` #2 which pointed at `apps/api`'s `@/lib/ai/client` instead of the Edge runtime wrapper, and added VIETMAP/SePay to the server-side env list. Then backfilled Jul/Aug from git+Plan.md (marked reconstructed), created `docs/memory/INDEX.md` as the write-target contract wired from 6 entry points, and moved 1,043 lines of stranded May session logs out of this file (1125 -> 84 lines, byte-identical). Then per Tu's "thực hiện Next Step": Plan.md brand decided per-occurrence (title renamed, **6 kept on purpose** — 2 are real GCP resource names, 4 are historical records — note added so nobody "fixes" them); `design.md` 482 -> 391 by moving §13A Lottie into `design/motion.md` (it carried timing values, so keeping it out of motion.md was a rubric red flag); mobile gates green for the first time post-Expo-57 — **106 suites / 1026 tests / 0 fail**, type-check clean. 53 files, docs+skills only, no code. Traps: "Home Services" is also a common noun ("six approved Home Services") so blind sed corrupts it; `KAEL_MODEL_TIER` does not exist and was caught before shipping; **`.agents/` mirrors skills but not commands, so Codex cannot run `/kael-mem`**; **`pnpm … | tail` reported exit 0 while pnpm was not even on PATH** — pipe returns `tail`'s status, use `corepack pnpm` and capture `$?` before the pipe. Still open: Expo 57 unverified on a real device.
- **2026-08-03** §47 test + generated-type reorg (#145) - split the 9,285-line Edge runtime test into 31 files under `__tests__/kael-edge-runtime/`, all 178 blocks byte-identical; `test:api` 3155 -> 3159 pass / 0 fail. Tu chose B1: do NOT split `database.types.ts`, gate it instead (94/94 both directions). Found the pre-existing `tier1-type-completeness.test.ts` gate only caught 62/94 tables and one direction. Traps: `\bvi\b` false-positives on the `'vi'` locale string, CRLF vs LF blobs break byte-diff, no gate catches unused imports.
- **2026-08-03** §46 backend layer model (#144) - `http/` -> `domains/` -> `kael/` -> `platform/` + god-function split. D7 no `lint:structure --init`, D8 `apps/api/src/lib/{kael,learning}/**` FROZEN, D9 single final commit (hence dirty-tree work).
- **2026-08-02** #142/#143 - Kael agentic production flow, then auth + Kael routing hardening.
- **2026-08-01** #139/#140/#141 - cash payment + account deletion/refund + profile avatar; dead frontend files/assets/deps removed; upstream design adapters activated.

## Recall Index -> `docs/memory/2026-07.md`

- **2026-07-28** §45 `_shared/kael/` subfolder split (#138) - 17 files into 4 subfolders, 82 files re-imported, diff 171/171 symmetric (zero logic). `test:api` 5 fail / 3044 pass = exactly baseline, so those 5 are pre-existing. Plan.md §45 still says "CHƯA COMMIT" but git shows it merged — git wins.
- **2026-07-28** §44 frontend structure reorg (#136) - `frontend-workflow-provider.tsx` 1,369 lines into 8 hooks; `customer/v21/` ~110 flat files into buckets; ownership-map C1 corrected. Public export surface unchanged. **§44 numbering is overloaded** — see Plan.md:13265 before trusting any "§44" in an old commit.
- **2026-07-27** Frontend reorganization + doc split (#133, #134) - worker god-file into buckets, orphaned booking-wizard trio removed, structure ratchet retargeted; `README.md` rewritten lean and the long explainer promoted to root `DOCUMENT.md`, then Codex-review regressions fixed.
- **2026-07-26** Design-Skill Wheel P5a/P6 + Expo SDK 54->57 (#132) - upgrade done in three one-major hops, not one jump. **Never verified on a device** — JS gates only.
- **2026-07-24** Design-Skill Wheel P1-P4b - motion single-source, glass->material, design router axle + auto-trigger, then the `kael-design-*` skills. Origin of `governance/design/runtime.md`.
- **2026-07-23** Worker production session (#127).

> July 2026 and the pre-governance-upgrade part of August are **reconstructed from git + Plan.md on 2026-08-03**, not written live — no `/kael-mem` ran between 2026-06-05 and 2026-08-03. Outcomes are evidence-backed; motives are inferred. See the banner in each period file.

## Recall Index -> `docs/memory/2026-06.md`

- **2026-06-05** Plan31 Claude review follow-up - verified Claude's autonomy review, reset production `KAEL_AUTONOMY_FULL_ENABLED=false`, applied production migration `20260605006000` to drop `worker_profiles_districts_backup_x3`, clean-redeployed `mobile-api` v28 from commit `54745f12`, and confirmed production Plan31 durable learning/autonomy/guardrail/knowledge rows remain 0. Local follow-up code now flag-gates C2 policy actions, wires current service policy sites through `runKaelAutonomyOrchestrator`, and pre-gates new customer/worker cancellation before mutating RPCs; clean-branch API rerun passed 1456 tests, with later local API/shared follow-up evidence also recorded. Local code was not deployed because the main worktree contained active Section32 edits.
- **2026-06-05** Plan31 Kael AI Core production rollout - production `iwevizmsedyqozxlawwl` promoted after staging P15 pass: applied 17 Plan31 migrations plus two forward fixes (`20260605003000`, `20260605004000`), set Plan31 learning/knowledge/autonomy flags, redeployed `mobile-api` v25, production smoke passed (`/kael/charter` 200, RAG 5 citations, autonomy negative apply fail-closed), final advisors clean except existing Auth leaked-password warning.
- **2026-06-01** Rich Phase Context + Workflow Orchestrator UI implementation - built the shared pure `WorkflowPhaseContext`, wired it through shared/mobile workflow view models, made Customer Kael chat + Activity phase-aware, made Worker waiting/active/chat/Needs phase-aware, aligned provider/API/Edge completion-evidence and Kael-owned price authority, added broad tests, and ran an 8h continuous audit loop. Next session should continue with native RN QA and the UI/UX product pass on top of this phase/artifact lifecycle rather than rebuilding the skeleton.

## Recall Index -> `docs/memory/2026-05.md`

- **2026-05-31** Kael Autonomy v2 frontend/workflow reset - changed contract from customer-gated money/booking/completion to server-validated Kael default autonomy; BookingWizard now hands structured intake/media to Kael chat immediately via route `replace`; Kael chat pre-analyzes, auto-starts estimate-ready sessions into matching, uploads intake photos after job creation, and hydrates Activity; Edge adds `KaelAutonomyDecision` for matching, customer/worker cancellation, scope, and completion confirmation. Follow-up audit fixed post-broadcast intake media attach, lifecycle artifact schema parity, stale worker/customer price authority copy, scope-change wording, Kael chat `confirm*` UI naming, worker/customer JobRoom chat evidence trail via Edge messages, legacy customer Kael local composer removal, and worker map address handoff/directions after accept. Native device QA still pending.
- **2026-05-30/31** Recent PR Audit Gap Fix - branch from `origin/main`; fixed Stop hook `stop_hook_active` bypass/config detection, mobile stable idempotency retry keys, Edge duplicate-pending responses, DB rate-limit atomicity, backup table RLS, `hcmc_all` worker coverage, pump-water boundary, stale command docs, Plan supersession drift, README log, accented Kael charter, and mobile Jest/Babel runtime deps (`@babel/runtime`) so mobile type-check/test pass.
- **2026-05-29** Glass-Liquid Signature (B, Plan §29.8) - direction neutral + 1 mint accent, classic OS-grade (Apple Liquid Glass + Material). Built design/signature.md + glass-liquid-signature skill + gold reference dock. Code audit found 7->9 gaps (timing not spring, no dark tokens, white edge-highlight in dark). Tokens pending Tu Expo visual sign-off.
- **2026-05-29** Design + Context Upgrade (Plan §29 A+C) - design.md 1036->384 + `design/` refs, `kael-motion` skill, anti-slop UI gate, MEMORY.md 475->45 + `docs/memory/`, `/kael-mem` command. Sources design-motion-principles / taste-skill / claude-mem adapted; claude-context + glass-liquid-signature deferred.
- **2026-05-29** Governance Upgrade - modularized critical.md (1660->580) + `protocols/`, auto-trigger `kael-*` skills (.claude + .agents), dedup lifecycle, AGENTS gate-parity, `kael-doc-audit`. Shipped on branch -> PR #48.
- **2026-05-29** Plan §27 Production Bug Audit X1-X7 - boundary-guard (out-of-scope/injection decline), idempotency + DB rate-limit, district matching unblock (F-09/F-14/F-08), `/me/jobs/active` backend-as-truth, PII scrub at persist; staging + prod migrated. Reminder: rotate Supabase management token.
- **2026-05-28** Worker Deep Audit v2 - Plan §27.18 (v0.5).
- **2026-05-28** Worker Side Deep Audit - Plan §27.17 addendum (v0.4).
- **2026-05-28** Deep audit PR #45 Orchestration UI/UX - Plan §27.16 addendum.
- **2026-05-28** Production Bug Audit - Plan §27 chot.
- **2026-05-26** Q5 DeepSeek health + §25 R2 follow-up (intent latency budget fix; Perplexity domain-filter behavior).
- **2026-05-26** §24 Q4/Q5 + §25 R1 gap continuation (batch result polling, R1 live).
- **2026-05-26** §24 Q2-Q4 + §25 R1 start (prompt cache, market cache, batch infra).
- **2026-05-26** P19 staging gap E2E + §24 Q1 start (cost baseline).
- **2026-05-26** P18 production promotion + live-quality fix (no-photo vision skip).
- **2026-05-26** Kael Harness P17 - staging monitoring + A/B setup.
- **2026-05-26** Kael Harness P16 - pre-launch verification.
- **2026-05-26** Kael Harness P15 - integration testing (staging E2E matrix).
- **2026-05-26** Kael Harness P14 - backend gaps cleanup (district normalize, api_logs.purpose, cron).
- **2026-05-26** Kael Harness P13 - Agentic Case 5 dispute.
- **2026-05-25** Kael Harness P12 - Agentic Case 4 customer cancellation.
- **2026-05-25** Kael Harness P11 - Agentic Case 3 worker cancellation (no auto-suspend).
- **2026-05-25** Kael Harness P10 - Agentic Case 2 demanding customer.
- **2026-05-25** Kael Harness P9 - Agentic Case 1 normal transaction (silent worker_on_way).
- **2026-05-25** Kael Harness P8 - charter execution (system-prompt + self-check).
- **2026-05-25** Kael Harness P4-P7 - learning skills setup (queue-only).
- **2026-05-22** Agent Operating Docs Audit - authority order + distilled agent-skills lifecycle; runtime boundary repeated; code-ownership-map added.
- **2026-05-21** Production redesign prototype port (role-first gate, Kael command home, no fake data).
- **2026-05-21** Plan.md workflow upgrade consolidation (A11 hard-stop, Expo push wiring).
- **2026-05-21** PR #25 critical deferred follow-up (geo matching + worker auto-suspend migration).
- **2026-05-20** PR #23 frontend design integration + React Doctor toolchain (Windows/pnpm bootstrap notes).
- **2026-05-20** Glass motion UI recovery + TestFlight handoff.
- **2026-05-19** Native glass motion follow-up.
- **2026-05-19** Production Supabase + 3-service fix session (5 migrations, RLS, staging+prod).
- **2026-05-19** 6-hour production fix direction.
- **2026-05-18** React Doctor & AI coding agent skills session.
- **2026-05-18** Supabase Edge backend wiring session.
- **2026-05-17** Frontend logic & workflow session.

## Notes

- General **Verification Notes** (Windows/pnpm/React Doctor command quirks, etc.) are in `docs/memory/2026-05.md` under "## Verification Notes".
- When this index passes ~40 entries or a new month begins, start `docs/memory/<next-period>.md` and keep this index lean.

---

---

**Legacy session history (May 2026, Sessions 8-18)** was moved out of this file on 2026-08-03 and now lives at the end of [`docs/memory/2026-05.md`](../docs/memory/2026-05.md), verbatim. It was ~1,040 lines sitting in a file that every session loads. Fetch it only if you need pre-period-split history.

# BUILD HANDOFF PROMPT — Home Services 5-Item Stack Reorg (v2, critic-hardened 2026-06-16)
# Paste this as the first message to a fresh Claude Code session, OR tell that session:
# "Read and follow docs/handoff/build-handoff-prompt-20260616.md".

You are taking over a **planned, multi-phase build**. A previous session (architect) wrote the plans; your job is to EXECUTE them **one phase at a time, stopping for review after each phase**. A reviewer checks your results after every phase. **Quality and honesty over speed. Token cost is not a concern.**

## 0. The plans say "PARKED" — that is now LIFTED for this build
The plan docs (#5, #3) and audit (#2) carry "STATUS: DRAFT — PARKED / do NOT build yet" banners. **Those are LIFTED by this handoff for the phases in §5** — the 5-item discussion is closed and the user has approved this build. The IN-DOC gates still apply: locked-doc edits (§7) and the payment legal gate (§7). If you read a "parked / do not build" line in those docs, treat it as superseded by this prompt for §5 work only.

## 1. Choose your own role
Before anything, pick the senior engineering role that best fits this work and state it in ONE line (e.g. "Staff Full-Stack Engineer — Supabase/Postgres + Expo React Native + TypeScript monorepo"). Hold yourself to that bar.

## 2. Repo scope — STAY INSIDE THIS WORKTREE (do not wander)
Filesystem + git scope = ONLY this worktree:
`C:\Users\Phan Manh Tu\Desktop\home-services\.claude\worktrees\elastic-matsumoto-a38816`
- All paths relative to it. Do NOT touch other worktrees, other branches, the user's home, or anything outside this root on disk.
- This filesystem pin does NOT forbid the Supabase MCP: the Supabase integration (§6) is the ONE sanctioned outside-the-filesystem surface, scoped to the **STAGING** project only unless the user OKs prod. No other external system.
- Every change must trace to a phase in §5. No unrelated edits, no drive-by refactors.

## 3. Load context FIRST (then nothing else until you have)
Governance (obey; do NOT edit except the whitelist in §7): CLAUDE.md → RULES.md → STRUCTURES.md → critical.md → design.md → skills.md → .agents/skills/karpathy-guidelines/SKILL.md.
Plans = **content SOURCE OF TRUTH** (follow their decisions; do not re-decide them):
- docs/architecture/stack-unification-plan-20260616.md (#5: §0.5 arrangement philosophy, D1–D4, Track S, Track C, §S4 payment hybrid, OQs, gates)
- docs/architecture/agentic-workflow-spec-20260616.md (#3: §0.5 phase-gated reveal, process maps, D-A…D-D, 100,000đ threshold)
- docs/audit/infra-eval-audit-20260616.md (#2: test/skill-eval audit + remediation)
**Ordering authority:** the PHASE ORDER in §5 of THIS prompt GOVERNS. Where it differs from the #5 plan's §6 "proposed build order", follow §5 here (the plan's *content* is authoritative, this prompt's *sequencing* is authoritative). Use project skills/protocols (kael-tdd, kael-supabase, kael-security-sweep, kael-ai-boundary, karpathy-guidelines) + the critical.md lifecycle.

## 4. CARDINAL RULE — one phase, then STOP and REPORT
Build exactly ONE phase (or ONE sub-step where a phase is split below). Then STOP, report (§8 format), and WAIT for the user's explicit "tiếp tục / continue" before the next. Never batch. Never build ahead. Never start a phase whose gate (§7) isn't cleared.
**Two distinct pauses — do not conflate:** (1) END-OF-PHASE pause needs "tiếp tục" to start the NEXT phase; (2) INTRA-PHASE approval gates (locked-doc "OK sửa", payment gates) only unblock the current step. An "OK sửa" is NOT a "tiếp tục".

## 5. Build sequence (each item = one STOP-and-report; strictly in order)
- **P0 — Green baseline (PREREQ).** Run `pnpm install`, then `pnpm test` (= `turbo test`: apps/api + packages/shared via vitest, apps/mobile via jest). Report each package's pass/fail from real output; "green" = all three pass. **Known context:** memory records a prior RED baseline (PR#66, ~2 stale tests) and node_modules is absent here. If failures MATCH those known-stale tests, report them as pre-existing; ANY other red is a real blocker → STOP and ask. Do NOT proceed to P1+ until baseline is green (or the user explicitly accepts the known-stale ones).
- **P1 — C1 target module map (doc only, no code moves).** Use the CONCRETE "image-2 target grouping" already in #5 §5 (the exact `services/*` split + per-surface modules + one-contract-source + one-Kael-brain). Output = a new section in `docs/architecture/code-ownership-map.md`: per domain "chain" → canonical home, files that move in, and the one-concept-one-home resolution for `KaelEstimate`×4 / Kael-brain×2 / contract×3. Reconcile the mobile side with #3. No images needed.
- **P2a — Skills: one-source + reconcile + pressure-test (#2).** First reconcile the currently-uncommitted `karpathy-guidelines/SKILL.md` edits in BOTH `.claude/` and `.agents/` copies, then single-source all 12 skills across the two dirs (sync script/symlink). Apply Superpowers RED-GREEN-REFACTOR + adversarial pressure-testing to the DISCIPLINE skills named in the #2 audit: `kael-tdd`, `kael-security-sweep`, `kael-ai-boundary`, `kael-diagnose`. Done-bar per skill: a Red-Flags + Rationalization table + one documented baseline-fail scenario.
- **P2b — Core Skill 6 + lint:structure (#5 C5).** Add "Core Skill 6: Code Organization" to skills.md (+ 1-line pointer in karpathy SKILL, both copies) and a `pnpm lint:structure` CI ratchet (file-size cap + duplicate-export/type) mirroring `lint:comments`.
- **P2c — Critical-path integration tests (#2 gap 3).** The suite is mock-heavy (870 mocks/46 files vs ~3 integration). Add TARGETED integration coverage on money/auth/Kael/RLS critical paths only (NOT a full rebalance). If you judge this too large for one phase, propose a scoped list and STOP for the user's pick.
- **P3a — `worker_stats` + `customer_stats` (Supabase).** FIRST resolve OQ2 with the user (persist `jobs.worker_net`/`platform_fee` at `paid` vs compute in stats — `income_30d` depends on it). Then aggregate tables + maintenance (pg_cron + event triggers) + read VIEW. New migration + regenerate types into packages/shared + `get_advisors` + positive AND negative RLS tests per actor.
- **P3b — Worker-matching indexes (Supabase).** `worker_profiles` partial index on `is_available` + GIN on `districts`/`service_types`. Migration + advisors.
- **P3c — Realtime + buckets (PLAN/PROPOSE ONLY, do not execute destructive change).** Realtime = wire-only per OQ3 (hybrid: realtime primary + polling fallback; do NOT rip out polling). Bucket consolidation = LOW priority + migration-risky (must preserve `job_media_assets.bucket_id`, 8 live rows) → propose a plan only; do NOT run the bucket migration without explicit OK.
- **P4 — C2 one contract source.** Collapse `KaelEstimate`×4 / `CreateJobResponse`×3 / `KaelChatResponse`×3 to a single home in `packages/shared`; mobile `api-types.ts` re-exports; Edge `router.ts` + `kael/types.ts` import from shared; resolve Deno↔shared (import map/build); replace the string-slice parity test with a real value-level test. (C2 BEFORE C4 — kill drift before splitting files.)
- **P5 — C3 one Kael brain.** Edge canonical; lift pure logic to `packages/shared/kael`; retire/reduce the `apps/api` Kael+learning duplicate (verify nothing on the RN path depends on it — it doesn't).
- **P6 — C4 god-file splits — ONE god-file per sub-step, STOP after EACH.** Order: (6a) `services.ts` (10k) → domain `services/*`; (6b) `worker-surfaces.tsx` (9.7k) → per-surface; (6c) `customer-surfaces.tsx` (7.8k) → per-surface; (6d) `router.ts` (2.5k). Each: behavior-preserving, tests green before AND after, `pnpm lint:comments` clean, then STOP+report.
- **P7 — #3 workflow → STRUCTURES.md (STOP, get "OK sửa STRUCTURES.md" first).** (1) FORMALIZE the §0.5 phase-gated-reveal contract: a phase → allowed components/actions/`artifact_mode` table sourced from `workflow-phase-context` + `workflow-ui-rules` + `JOB_STATUS_TO_WORKFLOW_PHASE` (this is the spec's central deliverable). (2) `favorite_workers` + direct-rebook branch (full Case Work, skip broadcast, accept/decline, fallback). (3) UNIFY pre-arrival adjust + on-site `decide_scope_change_atomic` into ONE mechanism branched by (timing + delta); the **>100,000đ** auto-apply path MUST route through a server-validated/audited/appealable `KaelAutonomyDecision` (NOT a silent charge); **≤100,000đ** = suggest, customer opts in. (4) dual-chat contract + payment-confirm gating (digital auto / cash worker-confirm) + "Kael hỗ trợ nhận việc" in notifications.
- **P8 — #4 README (STOP, get "OK sửa README.md" first).** Rewrite per the parked outline (lean, internal-dev/co-founder, links to governance docs).
- **P9 — §S4 payment.** ONLY after the §7 payment gate is fully cleared. Build the converged §S4 Managed-Marketplace Hybrid (OQ11 is RESOLVED → hybrid is the model; do not treat it as an open fork). Otherwise: skip and say "blocked on payment gate" in your report.

## 6. Supabase + Frontend access
- **SUPABASE — mandatory for every DB phase.** Use the connected Supabase integration (MCP). **For EVERY MCP call, pass `project_id = xyylanuyflrjzbjzhqfl` (STAGING).** PROD `iwevizmsedyqozxlawwl` is **read-only for inspection**; ANY write/DDL/migration/`deploy_edge_function`/`pause_project`/`restore_project`/`delete_branch` on PROD is FORBIDDEN unless the user types the exact PROD id back to you in-session, per call. DB rules: NEW migration only (never edit a merged one), regenerate types into packages/shared, `get_advisors` (security+performance) after any DDL, positive AND negative RLS tests per actor. **If the integration is NOT connected → STOP and ask the user to connect it; never guess the schema.**
- **FRONTEND — only if needed.** App is Expo React Native (`apps/mobile`). Primary UI evidence = type-check + jest-expo/RNTL render tests via the `kael-frontend-test` skill — NOT browser preview (an RN app doesn't trivially browser-preview). Use live preview only if a runnable target genuinely exists. In §5, most frontend touches are code-move/contract re-exports verified by type-check + tests; the 6 payment UI screens are #3/out-of-scope here.

## 7. Gates — do NOT cross without explicit approval
- **Locked docs:** CLAUDE.md, RULES.md, STRUCTURES.md, README.md, critical.md, design.md. The ONLY governance/doc files you may modify are: `skills.md`, `.agents/skills/**/SKILL.md`, `.claude/skills/**/SKILL.md`, `docs/architecture/code-ownership-map.md`, and — with per-doc "OK sửa" — `STRUCTURES.md` (P7) + `README.md` (P8). Touching CLAUDE.md / RULES.md / critical.md / design.md is FORBIDDEN no matter how relevant it seems → STOP and ask.
- **Green-baseline gate:** no reorg (P1+) until P0 is green.
- **Payment gate (P9):** OQ11 is RESOLVED (the §S4 hybrid is the model). Build payment ONLY after the user confirms the OPERATIONAL gates: (a) legal "principal" framing + worker-as-subcontractor contracts, (b) accountant VAT-on-gross, (c) chosen payment provider, plus (d) OQ9 phasing + OQ10 money-state↔jobs.status mapping. Any unmet → payment is OUT OF SCOPE; report it.

## 8. Report format — after EVERY phase / sub-step (then wait)
```
Phase: <name>   Role: <your chosen role>
What I built: <summary>
Files changed: <relative paths, created/modified>
Verification — for EACH check: the exact command/MCP call invoked, working dir, and the UNEDITED output (tests / pnpm lint:comments / pnpm lint:structure / type-check / advisors)
Passed / Failed / Skipped: <honest>
Risks / limitations / NOT done: <…>
Next phase (proposed): <…> — AWAITING your "tiếp tục".
```
When pasting real output, REDACT secrets/tokens/connection-strings/bank numbers/emails/phones/CCCD-or-selfie URLs; never paste raw rows from `profiles`/`worker_profiles`/payment tables — summarize counts/shape instead.

## 9. Hard rules (non-negotiable)
- **Honesty:** run the real check, paste the exact command + unedited output; never claim a pass you didn't run; always state what you skipped or couldn't verify.
- **Trivial-fix definition (P0):** trivial = an obviously stale assertion/snapshot/import with NO behavior change (e.g. a renamed field). Anything touching logic/schema/auth/money, or deleting a test, = NON-trivial → STOP and report, do not fix. When unsure, treat as non-trivial.
- **Comment discipline** (skills.md Core Skill 5; `pnpm lint:comments` must pass; no changelog/date/phase/status-banner comments in code).
- **Code organization / §0.5:** group-by-relation into cohesive "chains", one concept = one canonical home. **Right-size to the DOMAIN, NOT to a line count — do NOT chop into many uniform tiny files (that recreates the mess). Success = understandable at a glance, not lines-per-file; the ~400 / 600–800-line numbers in the plan are loose guidance, NOT targets.** Phase-gated UI renders FROM `workflow-phase-context` + `workflow-ui-rules` (never self-invent component visibility).
- **Security / RULES:** no client secrets, no PII in logs, no hardcoded VND, network calls need timeout + bounded retry, AI calls server-side only and schema-validated.
- **Kael money/authority:** Kael never moves money or mutates workflow state directly; only a server-validated, audited, reversible/appealable `KaelAutonomyDecision` does.
- **Surgical:** every changed line traces to the current phase; preserve user changes; no opportunistic cleanup.
- **TDD** where behavior changes; ≥2 test layers; negative tests mandatory for money/auth/security/RLS.
- **No guessing:** ambiguity, or two sources conflict — especially money, schema, or a locked doc — STOP and ask the user.

## 10. Definition of done
Each phase: built per the plan, verified with pasted exact-command + unedited evidence, reported in §8 format, no gate crossed without OK, reviewer can independently reproduce. Overall: all gate-cleared phases done + green; payment (P9) explicitly marked done or "blocked on payment gate".

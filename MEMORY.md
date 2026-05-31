# MEMORY

Lean recall index — read last (per `critical.md` §0). Full entry detail lives in `docs/memory/<period>.md`; fetch only the entry you need (progressive disclosure, adapted from claude-mem without its worker service / vector DB). Add new entries with the `/kael-mem` command. Newest first.

## Recall Index → `docs/memory/2026-05.md`

- **2026-05-31** Kael Autonomy v2 frontend/workflow reset — changed contract from customer-gated money/booking/completion to server-validated Kael default autonomy; BookingWizard now hands structured intake/media to Kael chat immediately via route `replace`; Kael chat pre-analyzes, auto-starts estimate-ready sessions into matching, uploads intake photos after job creation, and hydrates Activity; Edge adds `KaelAutonomyDecision` for matching, customer/worker cancellation, scope, and completion confirmation. Follow-up audit fixed post-broadcast intake media attach, lifecycle artifact schema parity, stale worker/customer price authority copy, scope-change wording, Kael chat `confirm*` UI naming, worker/customer JobRoom chat evidence trail via Edge messages, legacy customer Kael local composer removal, and worker map address handoff/directions after accept. Native device QA still pending.
- **2026-05-30/31** Recent PR Audit Gap Fix — branch from `origin/main`; fixed Stop hook `stop_hook_active` bypass/config detection, mobile stable idempotency retry keys, Edge duplicate-pending responses, DB rate-limit atomicity, backup table RLS, `hcmc_all` worker coverage, pump-water boundary, stale command docs, Plan supersession drift, README log, accented Kael charter, and mobile Jest/Babel runtime deps (`@babel/runtime`) so mobile type-check/test pass.
- **2026-05-29** Glass-Liquid Signature (B, Plan §29.8) — direction neutral + 1 mint accent, classic OS-grade (Apple Liquid Glass + Material). Built design/signature.md + glass-liquid-signature skill + gold reference dock. Code audit found 7→9 gaps (timing not spring, no dark tokens, white edge-highlight in dark). Tokens pending Tu Expo visual sign-off.
- **2026-05-29** Design + Context Upgrade (Plan §29 A+C) — design.md 1036→384 + `design/` refs, `kael-motion` skill, anti-slop UI gate, MEMORY.md 475→45 + `docs/memory/`, `/kael-mem` command. Sources design-motion-principles / taste-skill / claude-mem adapted; claude-context + glass-liquid-signature deferred.
- **2026-05-29** Governance Upgrade — modularized critical.md (1660→580) + `protocols/`, auto-trigger `kael-*` skills (.claude + .agents), dedup lifecycle, AGENTS gate-parity, `kael-doc-audit`. Shipped on branch → PR #48.
- **2026-05-29** Plan §27 Production Bug Audit X1-X7 — boundary-guard (out-of-scope/injection decline), idempotency + DB rate-limit, district matching unblock (F-09/F-14/F-08), `/me/jobs/active` backend-as-truth, PII scrub at persist; staging + prod migrated. Reminder: rotate Supabase management token.
- **2026-05-28** Worker Deep Audit v2 — Plan §27.18 (v0.5).
- **2026-05-28** Worker Side Deep Audit — Plan §27.17 addendum (v0.4).
- **2026-05-28** Deep audit PR #45 Orchestration UI/UX — Plan §27.16 addendum.
- **2026-05-28** Production Bug Audit — Plan §27 chốt.
- **2026-05-26** Q5 DeepSeek health + §25 R2 follow-up (intent latency budget fix; Perplexity domain-filter behavior).
- **2026-05-26** §24 Q4/Q5 + §25 R1 gap continuation (batch result polling, R1 live).
- **2026-05-26** §24 Q2-Q4 + §25 R1 start (prompt cache, market cache, batch infra).
- **2026-05-26** P19 staging gap E2E + §24 Q1 start (cost baseline).
- **2026-05-26** P18 production promotion + live-quality fix (no-photo vision skip).
- **2026-05-26** Kael Harness P17 — staging monitoring + A/B setup.
- **2026-05-26** Kael Harness P16 — pre-launch verification.
- **2026-05-26** Kael Harness P15 — integration testing (staging E2E matrix).
- **2026-05-26** Kael Harness P14 — backend gaps cleanup (district normalize, api_logs.purpose, cron).
- **2026-05-26** Kael Harness P13 — Agentic Case 5 dispute.
- **2026-05-25** Kael Harness P12 — Agentic Case 4 customer cancellation.
- **2026-05-25** Kael Harness P11 — Agentic Case 3 worker cancellation (no auto-suspend).
- **2026-05-25** Kael Harness P10 — Agentic Case 2 demanding customer.
- **2026-05-25** Kael Harness P9 — Agentic Case 1 normal transaction (silent worker_on_way).
- **2026-05-25** Kael Harness P8 — charter execution (system-prompt + self-check).
- **2026-05-25** Kael Harness P4-P7 — learning skills setup (queue-only).
- **2026-05-22** Agent Operating Docs Audit — authority order + distilled agent-skills lifecycle; runtime boundary repeated; code-ownership-map added.
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

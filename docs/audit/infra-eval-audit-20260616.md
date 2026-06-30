# Infra / Test / Skill-Eval Audit (Issue #2) — read-only, evidence-based

> **Read-only audit, 2026-06-16.** Goal (Tu): adopt Superpowers' test/eval rigor + verify our infra hasn't drifted ("tư tưởng không lệch"). Remediation is PARKED for the combined build (gate: discuss all 5 → build once). 3 prongs: test-infra health · skills eval-rigor · doc↔code↔test drift.

## Strengths (the tư tưởng is mostly holding)
- **Test breadth = strong, multi-layer:** `apps/api/src/__tests__/` has unit/ + integration/ (`real-supabase`, `learning-real-supabase`, `worker-flow`) + schema/ (tier1–7) + security/ (`kael-redteam`) + foundation/ (`pii-log-lint`, `pre-app-build-contract`). Negative/security tests present: `route-security`, `mobile-api-s2/s3/s4` (authz, spend-gate, require-job-access), `s5-injection-phrasings`. **No skipped tests** (`.skip/xit/xdescribe` = 0 matches).
- **Skills = clean DRY wrappers:** `kael-*` SKILL.md are auto-trigger wrappers over single-source `protocols/*` (e.g. `kael-tdd` → `protocols/tdd.md`) — good single-source design. A Kael **AI eval harness** exists (`pnpm kael:eval`, `kael-a5-eval-harness.test.ts`).
- **Enforcement live:** CI `security.yml` (gitleaks + PII-log lint + authz/negative tests) + (new from #1) comment-discipline.

## Gaps / drift (what #2 must fix at build)
1. **Skills are NOT pressure-tested / not anti-rationalization-hardened (the core #2 gap).** Superpowers-rigor markers (Rationalization table / Red Flags / Iron Law / RED-GREEN / adversarial / pressure-test) appear **only 2× in 1 file** (`kael-doc-audit/references/audit-rubric.md`) across all `.claude/skills`. `kael-*` skills are well-written PROSE guidance, not eval-tested discipline with loopholes closed. → Adopt `writing-skills` RED→GREEN→REFACTOR-for-docs + adversarial pressure-testing for the discipline skills (tdd, security-sweep, ai-boundary, diagnose).
2. **Skill DUPLICATION drift (12 skills × 2 copies).** Skills live in BOTH `.claude/skills/` AND `.agents/skills/` (Claude Code + Codex parity). `diff -rq` shows they're in sync EXCEPT **`karpathy-guidelines/SKILL.md` DIFFERS** — because in #1 I added the Comment-Discipline pointer to the `.agents` copy only and NOT the `.claude` copy. **This is a drift I introduced; it must be synced.** Structural risk: 2-copy skills will keep drifting → one-source (sync script or symlink) at build.
3. **Mock-heavy tests (known risk).** 870 mock occurrences across 46 files (`vi/jest.mock`, `mockResolvedValue`, `fn`) vs only ~3 integration test files. Matches memory "567 mocks missed real bugs". → rebalance toward integration on critical paths (auth/payment/Kael/RLS) at build.
4. **Baseline green/red UNKNOWN right now.** `node_modules` is NOT installed in this worktree → cannot run the suite inline without `pnpm install`. Memory notes a prior RED baseline (PR#66, stale tests). → **MUST run a full green baseline at build-start** — this is also the prerequisite for the #5 full-codebase reorg.

## Remediation (combined build)
- Apply `writing-skills` discipline to `kael-*`: baseline-fail scenario → write/harden skill → close loopholes; add Red-Flags + Rationalization tables to the discipline skills.
- Single-source the 12 skills across `.claude`/`.agents` (sync script or symlink); FIX the `karpathy-guidelines` drift now or first at build.
- Rebalance mock-heavy unit tests with integration coverage on money/auth/Kael/RLS paths.
- Run + confirm a GREEN full baseline before the reorg starts (prereq).

## Cross-links
- Green baseline = prereq in [#5 plan](../architecture/stack-unification-plan-20260616.md) §5/§6.
- Skill one-source + pressure-test rigor complements #1 (comment-discipline) + #5 Core Skill 6 (code-org).

## Change log
- 2026-06-16 — Initial read-only audit (Tu chose run-now, all 3 prongs). Found: strong test breadth + no skips; skills not pressure-tested; `.claude`/`.agents` karpathy drift (introduced in #1); mock-heavy; baseline unrunnable inline (node_modules absent). Remediation parked for combined build.

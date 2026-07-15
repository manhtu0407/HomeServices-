# PR73 Worktree Review

Date: 2026-07-01
Branch: `codex/pr73-consolidate-dirty-worktrees`
Base: `origin/main` at `e57abe57`

## Included in PR73

- Consolidated the root planning/docs files into their existing canonical homes:
  - `ASSETS_NEEDED.md` -> `governance/design/ASSET_MAP.md`
  - `PROGRESS.md` -> `docs/progress-log.md`
  - `REBUILD_PLAN.md` + `SCOREBOARD.md` -> `docs/design/rebuild-preserve-handshakes-20260613.md`
- Preserved missing standalone review/design artifacts from dirty worktrees:
  - `docs/design/auth-liquid-signature-contract-20260604.md`
  - `docs/audit/full-codebase-audit-20260611.md`
  - `docs/audit/kael-agentic-process-bottlenecks-20260613.md`

## Already Present on Current Main

These were dirty or untracked in older worktrees, but already exist on current `origin/main` / PR72 and were not duplicated:

- `docs/design/kael-chat-ux-quickwins-20260608.md`
- `docs/design/kael-price-visualization-20260608.md`
- `docs/design/kael-voice-stt-tts-20260608.md`
- `docs/design/kael-worker-onsite-vision-20260608.md`
- `docs/architecture/agentic-workflow-spec-20260616.md`
- `docs/architecture/stack-unification-plan-20260616.md`
- `docs/audit/infra-eval-audit-20260616.md`
- `docs/handoff/build-handoff-prompt-20260616.md`
- `scripts/check-comment-discipline.mjs`
- `.github/workflows/comment-discipline.yml`
- `supabase/migrations/20260605005000_scope_worker_kael_chat_idempotency_by_job.sql`
- `supabase/migrations/20260605006000_drop_worker_profiles_districts_backup_x3.sql`

## Reviewed but Not Merged

The following dirty changes were intentionally left out of PR73 because they no longer apply cleanly to current `origin/main`, or because the branch tip is based on an old history that would revert current main if merged directly:

- `codex/section32-prod-proof-clean` tracked code changes:
  - Conflicts with the current split Edge service layout and current worker Kael chat tests.
  - Its two untracked migrations are already on current main.
- `claude/kind-dhawan-a8221b` tracked auth UI implementation:
  - Conflicts with current `apps/mobile/app/index.tsx`, `auth-surfaces.tsx`, and mobile wiring tests.
  - The standalone design contract was preserved in this PR.
- `claude/dreamy-goldberg-838084`, `claude/sleepy-easley-924d74`, and related `Plan.md` edits:
  - Old patches target root `Plan.md`, which has since moved under governance docs.
  - Independent documents that were not already on main were preserved.
- `claude/elastic-matsumoto-a38816` tracked package/skill changes:
  - The comment-discipline script, CI workflow, and skill pointers are already on current main.
- `claude/nervous-sinoussi-a86829` staged governance reorg:
  - Equivalent work is already represented in current main from the merged governance/codebase reorg line.
- Unpushed branches `claude/reverent-galileo-cc9b53` and `claude/unruffled-bhabha-bbdd78`:
  - Both branch tips are based far behind current main. A direct PR would include large reverse diffs against current main.
  - These need separate rebase/cherry-pick review instead of being bundled into PR73.

## Follow-Up Recommendation

Use PR73 as the safe consolidation PR for clean docs and review artifacts. Open separate focused follow-ups for:

1. Rebase the Section32 worker Kael chat implementation onto current split services.
2. Rebase the auth liquid implementation onto current auth surfaces and mobile wiring tests.
3. Decide whether the old unpushed `claude/reverent-galileo-cc9b53` work should be cherry-picked by topic or abandoned because current main already supersedes it.

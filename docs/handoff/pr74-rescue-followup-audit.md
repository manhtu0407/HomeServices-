# PR74 Rescue Follow-Up Audit

Date: 2026-07-01
Branch: `codex/pr74-rescue-followup-audit`
Base: `origin/main` at `d6b26378`

## Purpose

This follow-up records the second rescue pass after PR73. The goal was to find one more dirty-worktree slice that could become a safe PR without dragging stale branch history back over current `main`.

## Result

No remaining dirty code slice was safe to port directly as-is. The clean outcome of this pass is an audit ledger so the remaining worktrees are not re-tried blindly.

## Confirmed Already on Main

The `codex/section32-prod-proof-clean` worker Kael changes are already represented on current `main` in the split service layout:

- `supabase/functions/mobile-api/_shared/kael/worker-assist.ts` already has provider fallback, normalized worker-assist payloads, provider attempts, schema-invalid tracking, and the longer worker-assist timeout.
- `supabase/functions/mobile-api/_shared/services/worker-kael-chat.service.ts` already scopes session idempotency by `job_id`, persists `ai_model`, and records provider attempts in turn metadata.
- `apps/api/src/__tests__/unit/mobile-api-worker-kael-chat.test.ts` already covers worker-assist fallback/normalization and worker chat idempotency.
- The worker chat migrations from that worktree already exist on main.

The `claude/practical-yalow-2aab01` `deno.lock` refresh is also already on current `main`; the old worktree is dirty only because it is based behind the current branch.

The old `Plan.md` additions from `claude/dreamy-goldberg-838084` and `claude/sleepy-easley-924d74` are already present under `governance/Plan.md`, matching the governance reorg.

## Superseded, Do Not Port Directly

`claude/kind-dhawan-a8221b` contains an older auth-liquid implementation that targeted the previous `auth-surfaces.tsx` structure. Current `main` now uses `EntryBrandAccessFlow` under `apps/mobile/components/auth/entry-access/`, so applying that old patch would overwrite the newer six-step auth entry flow.

Safe path if Tu wants to continue this topic:

1. Treat `docs/design/auth-liquid-signature-contract-20260604.md` as the design contract.
2. Audit the current `EntryBrandAccessFlow` against that contract.
3. Make a fresh PR against the current `entry-access` files only, not by replaying the stale `kind-dhawan` patch.

## Still Stale or Historical

- `claude/nervous-sinoussi-a86829` is an old governance reorg snapshot. Current `main` already has the governance move; direct application would re-open locked-doc churn.
- `claude/reverent-galileo-cc9b53` and `claude/unruffled-bhabha-bbdd78` remain based far behind `main`. They should be cherry-picked only by topic after reading each commit, not opened as direct PRs.
- Root-level `Notes.md` and root `Plan.md` artifacts were either preserved in PR73 under canonical docs paths or superseded by `governance/Plan.md`.

## Recommended Next Rescue PR

If we continue with PR75, the next useful slice should be a fresh current-main implementation, not a stale patch replay:

1. Auth current-flow contract pass: compare `EntryBrandAccessFlow` against `docs/design/auth-liquid-signature-contract-20260604.md`.
2. Or cherry-pick one small commit from `claude/reverent-galileo-cc9b53` after proving it does not reverse current `main`.

This pass intentionally avoids production code changes because every obvious code candidate was either already merged or structurally stale.

# docs/archive

Material that has served its purpose but is kept for honest history — nothing here is deleted, because the repo values evidence over a clean slate. If you need something back, `git mv` it out; git history is intact.

Do NOT put active reference material here. Active docs live under their type folder (`architecture/`, `design/`, `ops/`, `playbooks/`, etc.); see `docs/INDEX.md`.

## What is here and why

| Path | Why archived |
|---|---|
| `handoff/` | Session/PR handoff prompts — ephemeral by nature (`build-handoff-prompt-20260616`, `pr73-worktree-review`, `pr74-rescue-followup-audit`). They captured a moment; the work they described has landed. |
| `design/worker-map-operation-balanced-20260531.md` | Superseded by `design/worker-map-real-provider-20260608.md` (Plan.md §37 supersedes the "no real map" point). References updated in Plan.md; historical snapshots (`memory/2026-05.md`, `design/kael-perceived-performance-streaming-20260604.md`) left as-is. |
| `design/frontend-redesign-production-contract-20260521.md` | Earliest (2026-05-21) production design contract, superseded by the later glass-liquid signature + worker/production contracts. Reference updated in Plan.md. |

Kept in `design/` on purpose: `kael-core-v9.md` — evidence shows it is the CURRENT identity/motion direction (referenced by `governance/design/ASSET_MAP.md`; other docs read "Superseded by Kael Core v9"). It was flagged as an archive candidate but is not superseded, so it stays active.

## Archiving rules

Archive only when confident and evidence-based:
- **Ephemeral by type** — handoff prompts, one-off PR reviews, session transfer notes.
- **Superseded** — a newer document explicitly replaces it; record the successor.

When unsure whether a doc is still load-bearing, do NOT archive it — annotate its status in `docs/INDEX.md` instead and let Tu decide. Never archive anything referenced by a locked doc (`CLAUDE.md`, `governance/*`, `README.md`) or by code/tests without updating those references first.

# docs/ — Navigation Map

Durable project knowledge: feature specs, design contracts, audits, ops runbooks, test evidence, and Kael teaching playbooks. This file is the map — read it before hunting for or adding a document.

**Authority order (from `CLAUDE.md`):** the governance stack (`CLAUDE.md`, `governance/*`) outranks everything here. `docs/` is history and reference; when a doc conflicts with a locked governance file or current code, treat the doc as a freshness signal and defer to governance. Nothing in `docs/` is a hard rule.

## Folder map

| Folder | Holds | Add here when… |
|---|---|---|
| `playbooks/` | Kael knowledge distillation: per-service textbooks + eval corpora, and the distillation SOP | you are teaching Kael to reason about a service |
| `architecture/` | Durable system specs: the code-ownership map, status vocabulary, workflow-step contracts, migration chain, agentic/worker specs | a decision is a lasting structural contract, not a point-in-time plan |
| `design/` | Design + UX contracts (glass/motion/mascot, price viz, voice, worker map, perceived-perf) | you accept a design direction to carry into production |
| `foundation/` | Research + spikes + the Kael knowledge corpus + source-trust research/samples | you did throwaway research or a spike whose conclusion must persist |
| `audit/` | Point-in-time codebase / security / process audits | you ran a formal audit and captured findings |
| `ops/` | Operational runbooks: deploy order, migration checklist, SMTP, onboarding | someone needs a step-by-step to run a real operation |
| `product/` | Product explainers and pre-build UI prep | you are describing the product, not the code (the primary non-technical explainer lives at repo-root [`DOCUMENT.md`](../DOCUMENT.md) instead, for `CLAUDE.md`/`README.md`-level visibility; this folder holds narrower/supporting product docs) |
| `copy/` | User-facing workflow copy (VI/EN) | you are curating shipped microcopy |
| `memory/` | **the write target for session memory**: `<YYYY-MM>.md` period files holding full entries, indexed one line each from `.claude/MEMORY.md`. Folder contract: [`memory/INDEX.md`](memory/INDEX.md) | at every session close the Session Memory Gate applies (`governance/critical.md` §3) — Claude Code via `/kael-mem`, Codex by hand per `memory/INDEX.md` |
| `test-logs/` | Test/verification evidence per phase (append-only; has its own `INDEX.md`) | you ran real tests and must record honest results |
| `assets/` | Static assets (logo) | a doc/README needs an embedded asset |
| `archive/` | Ephemeral or superseded material, kept for history | a doc served its purpose (see `archive/INDEX.md`) |

Top-level files: `progress-log.md` (the running progress log, referenced by `README.md`), `agent-lessons.md` (cross-session lessons), `cost-baseline-2026-05.md` (a cost snapshot).

## Where a new document goes (quick decision)

- Teaching Kael a service? → `playbooks/services/<service>.md` + follow `playbooks/process-distillation.md`.
- A lasting structural contract? → `architecture/`.
- An accepted look/interaction? → `design/`.
- Research/spike conclusion? → `foundation/`.
- Formal audit findings? → `audit/`.
- A runbook someone executes? → `ops/`.
- Test evidence? → `test-logs/` (update its `INDEX.md`).
- A handoff/PR-review/one-off note? → it is ephemeral; it will land in `archive/` once its work ships. Do not create durable clutter.

Dated filename (`*-YYYYMMDD.md`) = a point-in-time contract/plan/audit. Undated filename = a living document (playbooks, ownership map, status vocabulary) that is versioned in git and in-content, not by filename.

## Load-bearing documents (do not move without care)

These are referenced by locked docs or by code — moving them breaks references:

- `architecture/code-ownership-map.md` — referenced by `CLAUDE.md` (locked). The owner-file map per layer.
- `memory/INDEX.md` and `memory/<YYYY-MM>.md` — referenced by `CLAUDE.md`, `governance/critical.md` §3 (both locked), `AGENTS.md`, and the `/kael-mem` command. The write target for the Session Memory Gate; moving it breaks the gate.
- `progress-log.md`, `assets/nestscout-aurora-nest-logo.png` — referenced by `README.md` (locked).
- `test-logs/**` — referenced by test files and scripts under `apps/api`. Keep the directory; archive within it if needed, never relocate it wholesale.
- `foundation/kael-knowledge-corpus.md` — referenced by code.

The dated log of what this reorganization changed lives in `progress-log.md` (search "docs reorganization 2026-07-14"), not here — this map stays a durable reference, not a changelog.

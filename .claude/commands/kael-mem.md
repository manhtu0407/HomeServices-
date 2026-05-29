---
description: Capture this session's durable learnings into docs/memory/<period>.md and update the MEMORY.md recall index (progressive disclosure)
allowed-tools: Read, Edit, Write, Glob, Bash
---

Capture durable session memory for Home Services. Detail goes into `docs/memory/<period>.md`; a single one-line entry goes into the `MEMORY.md` recall index. This keeps the always-loaded `MEMORY.md` lean (progressive disclosure, adapted from claude-mem without its worker service / vector DB).

## Step 1: Reflect

What from this session would help a future agent and is NOT already durable elsewhere?

- Decisions Tu made + the rationale.
- What changed (files, migrations, skills) + real verification evidence (commands actually run and their results).
- Honest gaps, deferred items, and remaining risks.
- Environment quirks discovered (tooling, Windows/pnpm, staging/prod caveats).

Skip: one-off fixes unlikely to recur, and anything already durable in `critical.md` / `RULES.md` / `STRUCTURES.md` / `design.md` / `Plan.md`.

## Step 2: Pick the period file

Use `docs/memory/<YYYY-MM>.md` for the current month (e.g. `docs/memory/2026-05.md`). Create it if missing with a `# Memory Archive — <YYYY-MM>` header.

## Step 3: Draft the entry (honest, ruthless)

```text
## <YYYY-MM-DD> <Short Title>

- <decision / change + evidence>
- <honest gap / risk / next step>
```

No flowery language, no lies. The verification bullet lists only commands actually run and their real results (per `critical.md` §3 gates + RULES.md honesty rules).

## Step 4: Show before writing

Show the drafted full entry AND the one-line index addition. Ask Tu to confirm before editing files.

## Step 5: Apply (after approval)

- Prepend the full entry near the top of `docs/memory/<period>.md` (after its header, newest first).
- Add ONE line to the top of the `MEMORY.md` "Recall Index" (date + short title + a one-line hook). Never more than one line per entry in `MEMORY.md`.
- If the index passes ~40 entries or the month rolls over, start the next `docs/memory/<period>.md` and tell Tu.

# docs/memory/ — Where Session Memory Is Written

This folder is the **write target** for agent session memory. If you finished a session and the Session Memory Gate (`governance/critical.md` §3) applies, this is where the entry goes.

Memory is split in two on purpose (progressive disclosure):

| File | Holds | Size rule |
|---|---|---|
| `.claude/MEMORY.md` | the **Recall Index** — one line per entry, newest first. Read last on every task. | one line per entry, never more |
| `docs/memory/<YYYY-MM>.md` | the **full entry** — detail, evidence, honest gaps. Fetched only when the index line looks relevant. | as long as it needs to be |

Writing detail into `.claude/MEMORY.md` is the failure mode this split exists to prevent: it is loaded every session, so it must stay lean.

## How to write an entry

Claude Code runs `/kael-mem`: it reflects, drafts, **shows the draft**, and only writes after Tu confirms. Codex has no slash commands (`.agents/` mirrors skills, not commands) and follows the same steps by hand — including showing the draft before writing. Neither agent may skip the review step by hand-editing these files directly.

Mechanically it is two writes:

1. Prepend the full entry to `docs/memory/<YYYY-MM>.md` for the current month, right after the header, newest first.
2. Prepend **one** line to the Recall Index in `.claude/MEMORY.md`: date + short title + a one-line hook.

If the month has no file yet, create it with the standard header:

```markdown
# Memory Archive - <YYYY-MM>

Full session-memory entries for <Month> <Year>. The lean recall index is in `.claude/MEMORY.md`; fetch only the entry you need. Folder contract: [`INDEX.md`](INDEX.md).
```

Entry shape:

```markdown
## <YYYY-MM-DD> <Short Title>

- <decision / change + the evidence that proves it>
- <honest gap / risk / next step>
```

## What belongs here

Write it down when the session produced any of: a decision Tu made plus the rationale; a `Plan.md` section, phase, or track executed; a migration, deploy, or environment/tooling change; an honest gap, deferred item, or known-red state; a trap or environment quirk that cost time and would cost it again; a Claude ↔ Codex handoff.

## What does not

Skip: a trivial one-off fix with no durable lesson; anything already canonical in `governance/critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, or `Plan.md` — link to it instead of copying; anything the repo already records by itself (file structure, commit history, test output that lives in `docs/test-logs/`).

Never write secrets, tokens, keys, or PII (`RULES.md` #9).

## Honesty rules

Same standard as verification (`governance/critical.md` §3): only commands actually run and their real results. **Never write memory for work that was not done.** Record what was *not* tested as plainly as what was.

If an entry is rebuilt after the fact rather than written during the session — as `2026-07.md` and most of `2026-08.md` were — say so at the top of the file, cite what it was rebuilt from, and state what could not be recovered. A reconstructed entry proves outcomes; it cannot prove intent. Do not let it read like a first-hand record.

## Current files

| File | Period | Nature |
|---|---|---|
| [`2026-09.md`](2026-09.md) | September 2026 | first-hand |
| [`2026-08.md`](2026-08.md) | August 2026 | first-hand from 2026-08-03 governance upgrade onward; earlier August entries reconstructed |
| [`2026-07.md`](2026-07.md) | July 2026 | fully reconstructed 2026-08-03 from git + Plan.md |
| [`2026-06.md`](2026-06.md) | June 2026 | first-hand |
| [`2026-05.md`](2026-05.md) | May 2026 | first-hand; also holds the verbatim **Legacy Claude Session History** (Sessions 8-18) moved out of `.claude/MEMORY.md` on 2026-08-03 |

Gap on record: no `/kael-mem` ran between **2026-06-05 and 2026-08-03**. §44–§47 and PR #127–#145 landed in that window with no memory written, which is what prompted adding the Session Memory Gate.

Size on record: `.claude/MEMORY.md` had grown to 1,125 lines, of which ~1,040 were May session logs left behind by the 2026-05-29 period-file split. They were moved here on 2026-08-03 and the index dropped to 84 lines. If the recall index passes ~40 entries again, roll the oldest period section out rather than letting the always-loaded file grow.

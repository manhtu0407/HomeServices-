---
name: "source-command-kael-mem"
description: "Write NestScout session memory — the full entry to docs/memory/<YYYY-MM>.md and exactly one line to the .claude/MEMORY.md Recall Index. Use when a session is closing and the Session Memory Gate applies. This is how Codex runs the procedure; Codex has no /kael-mem slash command."
---

# source-command-kael-mem

Thin wrapper. The folder contract — file naming, month rollover, entry shape, what belongs vs.
what does not, and the honesty rules — is canonical in `docs/memory/INDEX.md`. Do not duplicate
it here: a stale copy is exactly what once pointed this skill at a write target that did not
exist.

Claude Code triggers the same procedure with `/kael-mem`. Codex has no slash commands, because
the mirror carries skills only — this skill is Codex's entry point to it. The gate is identical
for both agents (`governance/critical.md` §3 Session Memory Gate); only the trigger differs.

## The two write targets

| Target | Holds | Size rule |
|---|---|---|
| `docs/memory/<YYYY-MM>.md` | the full entry — detail, evidence, honest gaps | as long as it needs to be |
| `.claude/MEMORY.md` | one line in the Recall Index, newest first | exactly one line per entry |

Both agents write to the same two files. `.claude/MEMORY.md` is loaded on every task, so detail
written there is the failure mode the split exists to prevent.

## Steps

1. **Reflect.** What from this session helps a future agent and is not already durable elsewhere?
   Decisions Tu made plus the rationale; what changed (files, migrations, skills) plus the real
   verification evidence; honest gaps, deferred items, known-red states; environment quirks that
   cost time and would cost it again. Skip one-off fixes with no durable lesson, and anything
   already canonical in `governance/critical.md`, `governance/RULES.md`,
   `governance/STRUCTURES.md`, `governance/design.md`, or `governance/Plan.md` — link to it
   instead of copying.
2. **Pick the period file.** Use the current month's `docs/memory/<YYYY-MM>.md`. If it does not
   exist, create it with the standard header defined in `docs/memory/INDEX.md`.
3. **Draft both pieces** — the full entry and the one-line index addition — in the entry shape
   `docs/memory/INDEX.md` defines.
4. **Show the draft and wait.** Neither agent may write these files without showing the draft to
   Tu first. This step is not optional for either trigger.
5. **Apply after approval.** Prepend the entry to the period file right after its header, newest
   first; prepend one line to the `.claude/MEMORY.md` Recall Index. If the index passes ~40
   entries or the month rolled over, roll the oldest section out and tell Tu.

## Honesty

Same standard as verification (`governance/critical.md` §3): only commands actually run and their
real results. Record what was NOT tested as plainly as what was. Never write memory for work that
was not done. An entry rebuilt after the fact says so at the top of the file and states what
could not be recovered. Never write secrets, tokens, keys, or PII (`governance/RULES.md` #9).

## Close

```text
Session scope:
Entry draft:
Index line:
Shown to Tu:
Written:
```

Never write memory for work that was not done, and show the draft before writing — `docs/memory/INDEX.md` requires Tu's confirmation first.

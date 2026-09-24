# Reuse-Ladder Debt Ledger

Durable record of *conscious* exceptions to the Reuse-Before-Build Ladder (`governance/skills.md` Core Skill 2, `ponytail.dev`'s `/ponytail-debt`). Log an entry here when the ladder's steps 2-5 turned up an existing candidate — code already in the repo, a stdlib/framework feature, a native platform feature, or an installed dependency — and you wrote new code anyway. The entry is the reason, on record, so the next person does not have to re-derive why the duplication exists.

This is not the same as `.scratch/reuse-ladder-log.jsonl`: that file is an auto-generated, gitignored count of new exports with no reasoning attached. This file is git-tracked, human-written, and only gets an entry when a real trade-off was made.

Prepend new entries, newest first. Small tasks with no reuse candidate found need no entry — this ledger is for the cases where reuse was possible and was declined, not a log of every task.

Entry shape:

```markdown
## <YYYY-MM-DD> <file>:<symbol>

- Found: <the existing candidate — file/function/dependency/native feature>
- Wrote new code because: <the actual reason>
- Risk / follow-up: <what could make this worth collapsing later, or "none">
```

No entries yet.

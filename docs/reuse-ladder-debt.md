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

## 2026-10-22 supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work.ts:detectRequestedApplianceWork

- Found: `normalize`, `escapeRegExp` and the appliance subset of `OUT_OF_SCOPE_KEYWORDS` in `kael-guardrails/boundary-guard.ts`, all module-private.
- Wrote new code because: the same requested-work test must also run from `pipeline/utils.ts:hasUnsupportedRepairIntent`, and importing it from `boundary-guard.ts` would make `boundary-guard.ts` and the pipeline import each other; a small leaf module is the only shape without a cycle.
- Risk / follow-up: the 12 appliance keywords are listed in two places (`OUT_OF_SCOPE_KEYWORDS` and `APPLIANCE_REQUEST_KEYWORDS`); collapse them into one exported list if the catalogue is edited again.

## 2026-10-20 supabase/functions/mobile-api/_shared/domains/kael-chat/case-context.ts:assertCaseContextOwner

- Found: `assertKaelSessionOwnership` in `domains/kael-chat/session-store.ts` (owner check on a session row).
- Wrote new code because: it lets `ctx.role === "admin"` through, and this check guards what reaches a customer-facing prompt, where an admin must not read another customer's Case; it also has to bind the row to the addressed session id.
- Risk / follow-up: two owner checks to keep in step; collapse into one if the admin pass-through is ever removed from the session store.


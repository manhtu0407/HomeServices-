---
name: kael-subagent-orchestration
description: Subagent delegation workflow for NestScout agent tasks. Always use before task decomposition to make a deliberate local/delegated decision; use subagents only for difficult, deep, independent, non-blocking work and keep the main agent responsible for integration. Do not use to force subagent spawning.
---

# kael-subagent-orchestration

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/subagent-orchestration.md` — do not duplicate it here.

When this fires:

1. Record a `local` or `delegated` decision before task decomposition.
2. Keep simple, tightly coupled, urgent, sensitive, or overlapping work local.
3. Delegate only independent sidecar work with a concrete output, stop condition, and exclusive write scope when editing.
4. Use the smallest useful fan-out: 0 for simple work, 1 for a high-leverage sidecar, and 2-3 only for genuinely distinct complex workstreams.
5. Keep the critical path, cross-cutting decisions, integration, final review, verification, and user-facing response with the main agent.

## Close

Record `local` or `delegated` on the first line, then what each side carried.

```text
Delegation:
Reason:
Delegated work:
Main-agent work:
Verified independently:
```

A subagent's report is a claim, not a result. Verify what it says changed before passing it on as your own finding.

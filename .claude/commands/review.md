# Code Review

Run after implementation and before commit. This command points to the current review contract instead of carrying a stale copy of old rules.

## Required Review Inputs

1. `critical.md` section 8 for the review protocol.
2. `RULES.md` for hard product, runtime, security, language, and data honesty boundaries.
3. `STRUCTURES.md` for workflow/state/backend contract impact.
4. `design.md` and `protocols/frontend-test.md` for UI, motion, accessibility, and frontend gates when UI changed.
5. `protocols/ai-data-security.md` when secrets, PII, prompts, memory, model providers, logs, uploads, or Edge auth are involved.
6. `docs/architecture/code-ownership-map.md` for any code enhancement or refactor.

## Output

Lead with findings ordered by severity:

```
Findings:
P1/P2/P3 - file:line - issue, impact, required fix

Open questions:

Verification reviewed:

Residual risk:
```

If there are no findings, say so explicitly and still list any unrun tests or remaining risk.

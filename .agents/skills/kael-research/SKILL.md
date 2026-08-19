---
name: kael-research
description: Research a technical, product, provider, policy, or market question for NestScout using primary sources and claim-level citations. Use when a decision needs verified external or local evidence, not when the answer is already established in the authority docs or code.
---

# kael-research

Research is evidence gathering, not a substitute for a product decision or an implementation plan.

## Workflow

1. State the question, decision it informs, freshness requirement, and the facts that would change the recommendation.
2. Read relevant NestScout authority docs and source code first; do not research a fact the repository already owns.
3. Prefer primary sources: official documentation, source code, specifications, provider policy, first-party data, or directly observed runtime evidence. Use secondary material only to locate primary sources.
4. Separate observed facts from inference. Attach a direct source to every material factual claim.
5. Reconcile findings with `RULES.md`, `STRUCTURES.md`, and the current product phase. Surface conflicts instead of selecting the convenient source.
6. Return a concise decision-oriented synthesis with limitations and the exact next action.

## Artifact Rules

- Default to a read-only response.
- Write a durable Markdown research note only when Tu explicitly asks for one or the task explicitly requires a tracked research artifact.
- Use `kael-docs-execution` for a durable note, keep secrets and PII out, and do not edit locked governance docs without approval.

## Guardrails

- Do not treat search snippets, vendor marketing, or generated summaries as proof.
- Do not claim a time-sensitive fact is current unless it was verified during the task.
- Do not turn research into provider integration, data collection, or workflow mutation without a separate approved task.

## Close

```text
Question:
Decision informed:
Sources checked:
Verified findings:
Inference:
Conflicts or limitations:
Recommendation:
```

Separate observed fact from inference, and never call a time-sensitive fact current unless it was verified during this task.

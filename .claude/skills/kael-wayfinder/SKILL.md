---
name: kael-wayfinder
description: Map a large, uncertain NestScout initiative across multiple agent sessions before implementation. Use when the destination is clear but the decisions, research, prototypes, or dependencies needed to reach it are not; do not use for a bounded task that can be planned in one session.
---

# kael-wayfinder

Use this for planning, not delivery. Its output is a decision map that makes a later implementation plan safe.

## Workflow

1. State the destination in one or two sentences and name the explicit out-of-scope boundary.
2. Read the authority stack and current plan or issue context needed to understand the destination.
3. Separate known questions from fog:
   - **Investigation**: a question precise enough to resolve now.
   - **Not yet specified**: an in-scope concern that depends on an unanswered question.
   - **Out of scope**: work deliberately excluded from this destination.
4. Create a small map of investigations, each with a type (`research`, `prototype`, `clarification`, or `task`), blocker(s), expected decision, and whether it is AFK or needs Tu.
5. Resolve at most one investigation per session. Record the decision and promote only newly precise fog into new investigations.
6. Stop when the route to the destination is clear; hand the resulting plan to `kael-issue-slicing` or the relevant implementation protocol.

## Tracker And Artifact Rules

- Do not create or change issues, plans, or docs unless Tu explicitly asks for that artifact.
- If no tracker artifact was requested, return the map in the response rather than writing `tickets.md` or a duplicate plan.
- Keep decisions in one canonical artifact. Never recreate product workflow truth outside `STRUCTURES.md` or edit locked docs without Tu's approval.

## Guardrails

- Do not implement production code while wayfinding unless Tu explicitly changes the task scope.
- Do not turn vague future work into artificial tickets just to fill a map.
- Do not resolve a human decision on Tu's behalf.
- Route research to `kael-research` and experimental questions to `kael-prototype`.

## Close

```text
Destination:
Out of scope:
Decisions already known:
Frontier investigations:
Not yet specified:
Recommended next investigation:
Implementation handoff condition:
```

Wayfinding produces a map, not a decision. Do not resolve a question that is Tu's to answer, and do not implement production code while wayfinding.

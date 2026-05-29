# Kael Protocols — Prototype & Clarify

> Extracted from `critical.md` for progressive disclosure (2026-05-29). critical.md keeps the universal gates, `kael-preflight` (§5), and `kael-review` (§8); load this file only when critical.md §1 selects one of its protocols for the current task class.

Contains `kael-prototype` and `kael-clarify-with-docs`. Load when a design question must be answered before production, or when requirements/terms/decisions are unclear.

## 10. Kael Protocol: `kael-prototype`

Use when a design question must be answered before production implementation.

### Inputs Required

- Question the prototype must answer.
- Whether it is logic/state or UI.
- Where the production code will likely live.
- How the user will run/inspect the prototype.

### Workflow

1. State the prototype question.
2. Choose logic prototype or UI prototype.
3. Place prototype code near relevant code when useful, but mark it clearly as throwaway.
4. Keep state in memory unless persistence is the question.
5. Use one command to run.
6. Surface relevant state after each action.
7. Capture the learning.
8. Delete the prototype or absorb the validated part into production.

Prototypes may live in `src/` when useful, but MUST be clearly named as prototype/throwaway and MUST NOT be mistaken for production code.

### Output Format

```text
Prototype question:
Prototype type:
Location:
How to run:
What was learned:
Delete or absorb plan:
```

### Failure Modes

- Prototype becomes production accidentally.
- Prototype answers a different question.
- Too much polish.
- Persistence added without need.

### Anti-Patterns

- Leaving stale prototypes in production paths.
- Building a complete feature while calling it a prototype.
- No documented learning.

## 11. Kael Protocol: `kael-clarify-with-docs`

Use when the task has unclear requirements, fuzzy domain terms, conflicting assumptions, or architectural decisions.

### Inputs Required

- Tu's request or plan.
- `STRUCTURES.md`.
- Existing docs, ADRs, memory, and relevant code.

### Workflow

1. Explore code/docs first when the answer is discoverable.
2. Ask one focused question at a time when human judgment is needed.
3. Provide a recommended answer for each question.
4. Challenge fuzzy or overloaded terms.
5. Cross-check claimed behavior against code.
6. Propose doc updates when a new rule, term, or decision crystallizes.
7. Wait for Tu approval before editing locked docs.

### Output Format

```text
Open question:
Why it matters:
What code/docs say:
Recommended answer:
Decision needed:
```

### Failure Modes

- Interviewing Tu about things the code already answers.
- Asking broad open-ended questions.
- Updating locked docs without approval.
- Letting ambiguous terms survive into code.

### Anti-Patterns

- "What do you want?" with no recommendation.
- Ignoring domain vocabulary.
- Making silent assumptions about money, booking, or service scope.


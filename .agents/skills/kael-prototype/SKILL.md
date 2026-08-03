---
name: kael-prototype
description: Build or evaluate a clearly throwaway prototype that answers one design, UI, state-model, or business-logic question before production implementation. Use when Tu asks for a prototype, a design question needs options, or a state/workflow model needs to be felt out interactively. Follows protocols/prototype-clarify.md section 10.
---

# kael-prototype

Auto-trigger wrapper, adapted from `mattpocock/skills` (prototype, MIT). The canonical NestScout procedure is `protocols/prototype-clarify.md` section 10 (`kael-prototype`) plus `design.md` for UI/visual work and `critical.md` section 8 (`kael-review`) before absorbing anything into production.

Use this when the work is meant to answer a question quickly, not ship directly.

## Choose The Branch

- **Logic/state question**: build a tiny interactive terminal or local-only driver that exposes state transitions and prints the relevant state after every action.
- **UI/design question**: create several structurally different, clearly marked throwaway UI variations near the surface being explored.

If the question is ambiguous, inspect the surrounding code/docs first. Ask Tu only when the branch choice changes the artifact materially.

## Workflow

1. State the exact prototype question before writing code.
2. Pick logic prototype or UI prototype and state the assumption.
3. Place prototype code close to the future production surface when useful, but name it clearly as prototype/throwaway.
4. Use one command or one obvious route to run/inspect it.
5. Keep state in memory unless persistence is the actual question.
6. Surface the full relevant state after each action or variant switch.
7. Capture what was learned in the final response or a Tu-approved durable artifact.
8. Delete the prototype or absorb the validated decision into production; do not leave stale prototype runtime artifacts.

## UI Prototype Rules For This Repo

- React Native / Expo is the primary product surface.
- Use Expo Router conventions for prototype routes or route params; do not assume browser-only `?variant=` mechanics unless the target surface is web/admin.
- Prefer mounting variants inside an existing relevant route/surface when safe, instead of creating an isolated screen that hides real density and workflow constraints.
- Variants must differ in structure, hierarchy, and affordance, not just color or copy.
- Do not use fake workers, fake prices, fake ratings, fake queue counts, unsupported services, or mixed-language user-facing copy.
- Keep glass/motion within `design.md`, `design/signature.md`, and `design/motion.md` budgets.

## Logic Prototype Rules For This Repo

- Keep the model pure and portable: reducer, state machine, or pure functions with no terminal or I/O coupling.
- Keep the driver throwaway and in-memory.
- Do not connect to production Supabase or real providers unless persistence/provider behavior is the explicit question and Tu approves the sandbox.
- Print or render the relevant state after each action.

## Output

```text
Prototype question:
Prototype type:
Location:
How to run/inspect:
What was learned:
Delete or absorb plan:
```

## Guardrails

- A prototype is not production code.
- Do not over-polish or add tests for the throwaway shell.
- Do not wire prototypes to real mutations.
- Do not promote prototype code directly without rewriting it to production standards and running the relevant gates.

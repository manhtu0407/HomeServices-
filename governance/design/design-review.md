# Design Reference — Design Review

> A nan of the `design.md` system. `critical.md` is highest authority (`kael-review` §8 is the general code review); this is the **design** review that runs before a UI change is called done. `design/runtime.md` routes here; the `kael-design-review` skill points here.

## 0. Role

The final read of a design change before human sign-off. It checks the things that matter in order, separates what an agent can prove from what needs human eyes, and ends with an honest verdict — never a self-assigned aesthetic score.

## 1. Review order (stop at the first hard failure)

Review in this order; a failure high in the list outranks polish lower down:

1. **User goal** — does the screen serve the user's actual goal at this workflow step (`STRUCTURES.md`)?
2. **Workflow correctness** — money / scope / confirmation states are right; nothing money-impacting happens without the required gate.
3. **Hierarchy + content** — the primary action and key information lead; VI/EN copy is correct and unmixed; no fake data.
4. **State completeness** — loading / empty / error / success / retry / confirmation all designed.
5. **Platform + adaptive** — RN reality (press not hover); compact / medium / expanded handled (`adaptive-layout.md`).
6. **Accessibility** — name / role / state, contrast, target size, dynamic type, Reduce Motion / Transparency (`accessible-content.md`); price / status / risk / address never truncated.
7. **Performance** — 60fps; glass layer budget; no blur in long lists (`AGENTS.md`).
8. **Brand fit** — material by role (`material-direction.md`); motion by moment (`motion.md`); tokens by purpose (`tokens.md`).
9. **Anti-slop** — no motion-everywhere, glass-on-every-row, gradient orbs, bento, card spam, self-scored aesthetics.

## 2. Evidence boundary (what an agent may claim)

- **Objective — an agent may declare it** with proof: type-check / test results, the component tree, a screenshot the agent captured, a trace, a source from the ledger. State the command / artifact.
- **Subjective — needs human sign-off:** taste, brand feel, "does this look premium". The agent may **prepare** a comparative screenshot and describe the trade-off, but must not assert it is resolved. **An agent score (e.g. "9/10") is never proof.**

## 3. Verdict

End with exactly one:

- `block` — a hard failure high in §1 (wrong goal / workflow / money gate / fake data / broken a11y). Do not ship.
- `revise` — objective issues the builder can fix now; list each with its concrete fix.
- `ready-for-human-review` — objective checks pass; remaining decisions are subjective and flagged for Tu with the evidence prepared.

## 4. Output

```text
Surface + user goal:
Review (order §1 — first failure / notes per level):
Objective evidence (commands / artifacts):
Subjective items for human sign-off (with prepared comparison):
Verdict: block | revise | ready-for-human-review
```

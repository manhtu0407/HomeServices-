# Design Reference — Design Runtime (the router)

> The single entry point (the "axle") for design work. Both Claude Code (`.claude/skills`) and Codex (`.agents/skills`) route through here: classify the design task → pick the skill → run the preflight + gates. This file is **thin** — it points to the nan (spokes) and the skills; it does not duplicate their content. `critical.md` is highest authority; `AGENTS.md` owns the glass / motion / performance / language / scope rules; `design.md` §5 owns the design preflight.

## 1. Classify the design task

Name exactly one class. It selects the skill(s) and the depth of the gates.

| Class | It is… |
|---|---|
| flow | a multi-screen user flow / workflow shape |
| screen | one full screen |
| component | one component / surface |
| design-system | shared tokens, variants, or a cross-screen system |
| material | glass vs solid, elevation, blur, surface material |
| motion | animation, transition, micro-interaction, skeleton, mascot |
| accessibility | contrast, dynamic type, screen reader, VI / EN copy, target size |
| adaptive-layout | window size, orientation, keyboard, fold, reflow |
| visual-bug | a rendering / layout defect |
| polish | a final micro-interaction / detail pass |
| research | a design decision that needs external or local evidence |

## 2. Route to the skill

Five skills are live now; six arrive in P4 — they are listed so the map is complete. "Pending" is not a dead link: use the interim column until the skill lands.

| Class | Skill | Status | Interim if pending |
|---|---|---|---|
| material | `kael-material-direction` | live | — |
| motion | `kael-motion` | live | — |
| flow | `kael-prototype` (explore) → `kael-frontend-test` (verify) | live | — |
| screen / component | `kael-material-direction` + `kael-motion`, verify with `kael-frontend-test` | live | — |
| research | `kael-research` (+ `kael-design-evidence`) | live (+ P4 pair) | `kael-research` alone |
| design-system | `kael-design-tokens` | P4 — pending | `kael-material-direction` + `kael-frontend-test` |
| accessibility | `kael-accessible-content` | P4 — pending | `kael-frontend-test` (accessibility gate) |
| adaptive-layout | `kael-adaptive-layout` | P4 — pending | `kael-frontend-test` (widths / orientation) |
| visual-bug | `kael-visual-qa` + `kael-diagnose` | P4 — pending (visual-qa) | `kael-diagnose` + `kael-frontend-test` |
| polish | `kael-design-review` + `kael-motion` / `kael-material-direction` | P4 — pending (review) | `kael-motion` + `kael-material-direction` |

Every design task ends through `kael-frontend-test` before "done" (the frontend-testing wrapper; canonical `protocols/frontend-test.md`). Screen / component construction also uses the `kael-ui-rn-execution` **protocol** (`protocols/ui.md` §16) — a protocol, not a skill.

## 3. Preflight + hard gates

Before editing (condensed from `critical.md` §5 + `design.md` §5 — run those, do not re-derive):

1. State the design preflight (`design.md` §5): target surface, workflow step, primary emotion, primary action, forbidden defaults.
2. **Hard gate — zero is valid.** Zero glass and zero motion are correct answers. A calm, static, solid surface beats a decorative one. Never add material or motion just to justify a skill.
3. **Anti-slop gate.** Reject the AI defaults: motion-on-everything, glass-on-every-row, gradient orbs, bento grids, card spam, fake stats / prices / workers, pulsing / stagger-spam, self-assigned aesthetic scores.
4. **Money / scope / evidence stay solid** (`material-direction.md` §4): payment, price / scope confirmation, worker verification, evidence — solid, never glass.

## 4. Verification matrix

A design change is not done until it is checked across these (evidence = commands + results + states tested + states NOT tested):

```text
[ ] type-check:mobile + test:mobile green (jest-expo / RNTL — RN, not a browser)
[ ] widths: phone + large / tablet; orientation if the layout adapts
[ ] text scale: default + large dynamic type
[ ] language: VI and EN, no mixed-mode copy
[ ] theme: light + dark
[ ] Reduce Motion + Reduce Transparency fallbacks
[ ] states: loading / empty / error / success / retry / confirmation
```

## 5. Spokes (single source — do not duplicate here)

- Material decision (glass vs solid, role → variant): `design/material-direction.md`
- Glass recipe (once material picks glass): `design/signature.md`
- Motion vocabulary + timing / spring: `design/motion.md`
- Glass / motion / performance / language / scope rules: `AGENTS.md`
- Design identity, preflight, scoring rubric, forbidden defaults: `design.md`

# Design Reference — Design Runtime (the router)

> The single entry point (the "axle") for design work. Both Claude Code (`.claude/skills`) and Codex (`.agents/skills`) route through here: classify the design task → pick the skill → run the preflight + gates. This file is **thin** — it points to the spokes and the skills; it does not duplicate their content. `critical.md` is highest authority; `AGENTS.md` owns the glass / motion / performance / language / scope rules; `design.md` §5 owns the design preflight.

## 0. Upstream-aware activation

Every UI, frontend, visual, motion, layout, token, component, prototype, or design-system task enters through `kael-design-preflight` before editing. The preflight activates the two starting adapters only when their evidence is useful:

```text
kael-design-preflight
  -> kael-design-direction (Taste-derived context and anti-slop)
  -> kael-design-intelligence (pinned UI UX Pro Max search, when needed)
  -> this Design Wheel class and existing spoke skills
  -> kael-design-review / kael-frontend-test
```

The adapters are inputs to the wheel, not a second wheel. Their results are non-normative and cannot override `critical.md`, `RULES.md`, `STRUCTURES.md`, `AGENTS.md`, platform contracts, or the existing canonical design references. The machine-readable and human-readable preflight contract lives in `design/preflight.md`.

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

All eleven skills are live.

| Class | Skill |
|---|---|
| material | `kael-material-direction` |
| motion | `kael-motion` |
| flow | `kael-prototype` (explore) → `kael-frontend-test` (verify) |
| screen / component | `kael-material-direction` + `kael-motion`, verify with `kael-frontend-test` |
| research | `kael-research` + `kael-design-evidence` |
| design-system | `kael-design-tokens` |
| accessibility | `kael-accessible-content` |
| adaptive-layout | `kael-adaptive-layout` |
| visual-bug | `kael-visual-qa` + `kael-diagnose` |
| polish | `kael-design-review` + `kael-motion` / `kael-material-direction` |

### Upstream starting point by class

| Class | Direction adapter | Intelligence adapter |
|---|---|---|
| flow / screen / component | infer the surface, audience, workflow, and redesign mode | `product` + `ux` + `react-native` candidates |
| design-system | preserve the existing NestScout identity and token ownership | `product` + `style` + `color` + `typography` + `react-native` candidates |
| material / motion | identify the product moment and reject decorative defaults | `ux` + `react-native` candidates when evidence helps |
| accessibility / adaptive-layout | identify language, audience, posture, and state constraints | `ux` + `react-native` candidates |
| visual-bug | keep the current direction; do not invent a redesign | `source-mode=none` by default |
| polish / research | preserve the surface unless the brief says otherwise | the smallest relevant domains |

The adapter output must name the existing wheel class and handoff skills. It must never stop at a style recommendation.

Every design task ends through `kael-frontend-test` before "done" (the frontend-testing wrapper; canonical `protocols/frontend-test.md`). Screen / component construction also uses the `kael-ui-rn-execution` **protocol** (`protocols/ui.md` §16) — a protocol, not a skill.

Before editing, run `kael-design-preflight` and record its Design Read, source mode, existing wheel class, handoff skills, and acceptance gate. It is the activation layer for this router; it does not replace any existing spoke.

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
- Upstream-aware activation and handoff contract: `design/preflight.md`
- UI UX Pro Max adapter boundary: `design/intelligence.md`
- Taste-derived direction adapter boundary: `design/direction.md`
- Source review cadence, corpus manifest, incident log, rule retirement: `design/governance-cadence.md`

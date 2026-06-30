# Design Reference — Design Lab Rule

> Extracted from `design.md` for progressive disclosure (2026-05-29). `design.md` core keeps the authority order, identity, goal, preflight, skill-adaptation, scoring rubric, RN rules, forbidden defaults, and review checklist. Load this file only when the task needs it (see design.md → Design Reference Files). `critical.md` remains highest execution authority.

Load before running a design lab for major screens / visual systems (options, evidence package, scoring, production design contract).

## 7. Design Lab Rule

Design lab is mandatory before major screens and major visual systems.

Major screens include:

- Customer Home,
- Customer Booking / Kael Price Check,
- Kael Chat,
- Customer Activity / History,
- Customer Profile,
- Worker Home,
- Worker Job Request,
- Worker Active Job,
- Worker Earnings,
- core bottom navigation,
- mascot system,
- global visual tokens.

Design lab output is required before production build.

Temporary runtime experiments live in:

```text
.tmp/design-lab/
```

Durable decisions live in:

```text
docs/design/
```

Production app files MUST NOT import from `.tmp/design-lab/`, `docs/design/`, prototype routes, or throwaway mockups.

### Design Lab Options

For major screens, create at least three options:

```text
Option A: Safe
Option B: Balanced
Option C: Bold
```

Each option must define:

- layout skeleton,
- palette treatment,
- typography direction,
- decoration treatment,
- motion treatment,
- component anatomy,
- what was learned from XanhSM,
- what is original to NestScout,
- risks.

Do not build production UI until Tu accepts a direction.

### Design Lab Evidence Package

Each major design lab must include evidence, not only taste descriptions.

Required evidence:

```text
Reference frames:
What was extracted:
What was rejected:
NestScout adaptation:
Palette treatment:
Typography treatment:
Motion treatment:
React Native feasibility:
```

When using a video reference, include timestamps or frame names when available. When using screenshots, identify the exact screen region being studied, such as bottom tab, skeleton, service card, profile list, modal, or transition state.

Agents must separate observation from interpretation:

```text
Observation: XanhSM uses a mint/cyan glow behind the service shell.
Interpretation: NestScout can use a restrained mint material layer behind Kael Price Check.
Adaptation: Use a smaller, softer mint layer tied to address/search and Kael CTA, not a transport map glow.
```

Do not claim a reference was audited if no frame, screenshot, recording, or concrete source was inspected.

### Design Option Output Template

Each option must be presented in this format:

```text
Option name:
Best for:
Layout skeleton:
Color system:
Typography:
Decoration:
Motion:
Kael mascot use:
Customer impact:
Worker impact:
Production feasibility:
Risks:
Scores:
Recommendation:
```

Avoid vague labels like "modern", "clean", or "beautiful" unless they are backed by component, color, spacing, and motion decisions.

### After Acceptance

After Tu accepts a design direction:

1. Write a short production design contract in `docs/design/`.
2. Update `design.md` only if the decision becomes a durable global rule.
3. Build production UI.
4. Delete or ignore temporary lab artifacts.
5. Add static guards when needed to prevent prototype/lab imports.

Prototype code is not design memory. Durable contracts are design memory.

### Production Design Contract Template

Before production implementation of a major accepted screen, write a short contract in `docs/design/` using this template:

```text
Screen:
Workflow mapping:
Accepted option:
User emotion:
Primary action:
Layout anatomy:
Component list:
Color rules:
Typography rules:
Decoration rules:
Motion rules:
Loading/empty/error/success states:
Accessibility/touch rules:
Backend/state dependency:
Forbidden regressions:
Verification plan:
```

The production design contract is the handoff from taste exploration to implementation. Production code should follow the contract, not the temporary design lab artifact.


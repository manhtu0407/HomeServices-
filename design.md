# Home Services Design Operating System

This file is the mandatory design execution contract for AI coding agents working on Home Services UI.

It exists because generic AI-generated frontend design tends to collapse into SaaS dashboards, bento grids, decorative gradients, card spam, or landing-page composition. Home Services must not inherit that default. The app must feel like a polished Vietnamese mobile service product with its own taste, identity, motion, and mascot system.

This file is locked after creation. AI agents MUST NOT edit `design.md` unless Tu explicitly requests that edit in the current conversation.

> **Modularized 2026-05-29:** design.md core keeps the authority order, identity, goal, product surfaces, mandatory preflight, skill-adaptation protocol, scoring rubric, React Native rules, forbidden defaults, and review checklist. Detailed reference material (reference-app method, design lab, palette/typography, decoration/mascot/icons, motion grammar, per-screen recipes) now lives in `design/*.md` and loads on demand. Section numbers are preserved; moved sections below redirect to their reference file.

## 0. Authority Order

Agents MUST read files in this order for UI, frontend, prototype, visual, motion, mascot, layout, or design-system tasks:

```text
critical.md
design.md
RULES.md
STRUCTURES.md
CLAUDE.md when ambiguity exists
Relevant code/tests/docs
```

`critical.md` remains the highest execution authority.

For design direction, `design.md` overrides older UI/design direction in README, MEMORY, historical prototype docs, deleted prototype notes, and old session logs. Those documents remain historical context only.

If `design.md` conflicts with `critical.md`, `RULES.md`, `STRUCTURES.md`, or Tu's current request, stop and report:

- the conflicting instructions,
- the UI/product risk,
- 2-3 options,
- the recommended option.

Do not proceed until Tu approves the direction.


### Design Reference Files

design.md core stays lean; load a reference file only when your task needs it:

| Topic | File |
|---|---|
| Reference-app method (XanhSM / bTaskee / Grab) | `design/reference-method.md` |
| Design lab (options, evidence, scoring, contract) | `design/design-lab.md` |
| Palette Lab + Typography Lab | `design/palette-typography.md` |
| Decoration + Kael Mascot + Icon System | `design/decoration-mascot-icons.md` |
| Motion Grammar (kael-motion canonical source) | `design/motion.md` |
| Screen recipes (App Shell to Empty States) | `design/screen-recipes.md` |
| **Glass-Liquid Signature** — final house-style gate (neutral + 1 mint, spring/bubble) | `design/signature.md` |

## 1. Design Identity

Home Services design direction:

```text
XanhSM-inspired Professional Mint Service UX
```

Meaning:

- professional service-app polish, not SaaS dashboard polish,
- mint / mint-green / soft cyan as the leading exploration space,
- cream / warm white as a possible warmth layer,
- premium but approachable,
- light but memorable,
- friendly without becoming childish,
- operational enough for real repair jobs,
- mascot-driven enough to create brand recall,
- mobile-first for React Native store-bound apps.

The design should feel closer to XanhSM than to bTaskee, Grab, or generic AI SaaS UI. bTaskee remains useful for mascot/tab references. Grab remains useful for operational clarity. XanhSM is the primary reference for polish, color harmony, typography rhythm, skeleton, and motion.

Do not copy XanhSM brand, assets, exact colors, vehicle visuals, promotion strategy, or transport-specific hierarchy. Learn the system, not the skin.

## 2. Design Goal

The design goal is not "modern UI".

The design goal is:

```text
Make Home Services feel like a real, polished, trustworthy Vietnamese mobile service app where color, typography, layout, decoration, and motion belong to the same product.
```

Every major screen must satisfy five linked qualities:

- color harmony,
- typography fit,
- layout polish,
- decoration restraint,
- motion fit.

These qualities must be designed together. Never choose palette alone. Never choose layout alone. Never add motion after the fact. Never use decoration to hide weak structure.

## 3. Reference App Method

> Moved to [`design/reference-method.md`](design/reference-method.md). Load it when extracting design evidence from XanhSM / bTaskee / Grab.

## 4. Product Surfaces

This design system applies to both:

- customer app,
- worker app.

The worker app must use the same brand language and Kael mascot system as the customer app. It can be more operational, but it must not feel like a separate product.

Customer design emphasis:

- trust,
- price check,
- booking confidence,
- apartment address context,
- friendly guidance,
- visible confirmation for money-impacting decisions.

Worker design emphasis:

- job clarity,
- accept/decline decisions,
- countdowns,
- earnings,
- task status,
- Kael brief support,
- professional operational rhythm.

## 5. Mandatory Design Preflight

Before any UI implementation, prototype, design lab, or visual refactor, agents MUST produce this short preflight:

```text
Design task:
Target surface:
Workflow step:
Primary user emotion:
Primary action:
Reference extraction:
Skill adaptation:
Design lab requirement:
Motion requirement:
Forbidden defaults:
Acceptance gate:
```

Do not edit UI files before this status.

If the UI task lacks style details, do not invent a generic "beautiful modern UI". Use this file, then ask Tu 1-3 focused questions if the design still cannot be determined.

## 6. Skill Adaptation Protocol

AI design skills are broad and biased by their training. Agents MUST adapt them before use.

Before UI work, list:

```text
Base skill:
What it is good for:
What must be adapted for Home Services:
What must be ignored:
Screen-specific variant:
```

Examples:

```text
Base skill: ckm:design-system
Good for: tokens, component specs, states, variants.
Adapt for: React Native mint/cream service-app tokens.
Ignore: generic web token defaults that push SaaS dashboards.
Variant: HomeServices mobile service token system.
```

```text
Base skill: ckm:ui-styling
Good for: layout, accessibility, component polish.
Adapt for: React Native screens and native mobile constraints.
Ignore: shadcn/Tailwind/web dashboard assumptions.
Variant: Mobile-first RN screen composition.
```

```text
Base skill: ckm:design
Good for: brand identity, mascot, icon, visual language.
Adapt for: Kael butler mascot and home repair service identity.
Ignore: banner/social/CIP/landing-page bias unless Tu asks.
Variant: Home Services mascot-led mobile product identity.
```

Agents MUST NOT apply a generic skill literally. Convert basic skills into screen-specific variants.

## 7. Design Lab Rule

> Moved to [`design/design-lab.md`](design/design-lab.md). Load it before running a design lab for major screens or visual systems.

## 8. Design Scoring Rubric

Every major option must be scored before presentation.

```text
Color harmony: /10
Typography fit: /10
Layout polish: /10
Decoration restraint: /10
Motion fit: /10
Home Services identity: /10
XanhSM learning without copying: /10
React Native feasibility: /10
Workflow correctness: /10
```

Minimum gates:

- Color harmony must be 8/10 or higher.
- Typography fit must be 8/10 or higher.
- Layout polish must be 8/10 or higher.
- Motion fit must be 8/10 or higher when motion is part of the task.
- Workflow correctness must be 10/10 for money-impacting screens.

If an option fails these gates, revise it before showing it as a serious candidate.

### Quality Failure Modes

An option fails the quality audit if:

- the palette looks attractive alone but weak inside the real screen,
- the typography feels copied from a web SaaS template,
- the layout is made from repeated cards without a clear hierarchy,
- decoration is present but does not explain service, state, trust, or action,
- motion is added everywhere instead of at key transitions,
- XanhSM is copied visually instead of translated structurally,
- Kael appears as a toy instead of a family assistant,
- worker screens feel like a generic admin dashboard,
- customer screens feel like a marketing landing page,
- the design cannot be built cleanly in React Native,
- loading, empty, error, success, retry, and confirmation states are missing,
- money-impacting screens do not make the explicit confirmation obvious.

When a failure mode is found, revise the option before production implementation.

## 9. Palette Lab

> Moved to [`design/palette-typography.md`](design/palette-typography.md). Load it when choosing or validating color for a screen.

## 10. Typography Lab

> Moved to [`design/palette-typography.md`](design/palette-typography.md). Load it when choosing or validating type for a screen.

## 11. Decoration System

> Moved to [`design/decoration-mascot-icons.md`](design/decoration-mascot-icons.md).

## 12. Kael Mascot System

> Moved to [`design/decoration-mascot-icons.md`](design/decoration-mascot-icons.md).

## 13. Motion Grammar

> Moved to [`design/motion.md`](design/motion.md). Canonical motion source; the kael-motion skill points here.

## 14. App Shell Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 15. Customer Home Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 16. Booking / Price Check Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 17. Worker Home Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 18. Worker Job Request Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 19. Kael Chat Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 20. Profile / Account Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 21. Activity / History Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 22. Modal / Bottom Sheet Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 23. Skeleton / Loading Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 24. Empty State Recipe

> Moved to [`design/screen-recipes.md`](design/screen-recipes.md).

## 25. Icon System

> Moved to [`design/decoration-mascot-icons.md`](design/decoration-mascot-icons.md).

## 26. React Native Implementation Rules

Production UI is React Native / Expo first.

Rules:

- no production dependence on web-only design systems,
- no shadcn/Tailwind assumptions in mobile code,
- no hover-only interaction,
- touch targets must be accessible,
- keyboard behavior must be considered,
- safe areas must be handled,
- slow network states must be designed,
- permissions must be designed when media/camera is involved,
- animation must be feasible with RN primitives or approved libraries.

If a design cannot be implemented cleanly in RN, revise the design before production build.

## 27. Forbidden AI Defaults

These are forbidden unless Tu explicitly approves a narrow exception:

- generic SaaS landing page,
- bento grid as default layout,
- decorative gradient orbs,
- purple/blue AI gradients,
- glassmorphism as decoration instead of material,
- dark slate dashboard by default,
- oversized hero headline,
- English marketing copy in app UI,
- card spam,
- nested cards,
- web dashboard layout for mobile app,
- fake stats,
- fake workers,
- fake prices,
- prototype routes in production,
- public mockup artifacts in store-bound mobile app,
- motion added everywhere,
- mascot treated as a toy.

## 28. Review Checklist

Before presenting or finalizing UI work, agents must answer:

```text
Did the UI follow design.md after critical.md?
Did the screen map to STRUCTURES.md workflow?
Did the design avoid generic SaaS/web defaults?
Did the design learn from XanhSM without copying?
Did color, typography, layout, decoration, and motion work together?
Was a design lab created for major screens?
Were skill adaptations stated before build?
Were all required states covered?
Were money-impacting actions explicitly confirmed?
Does it work as React Native mobile UI?
Is Kael used consistently and not excessively?
Were prototype/lab artifacts kept out of production?
```

If any answer is no, the work is not ready.

## 29. Final Design Principle

Home Services design must be beautiful first, but beauty here means system fit:

```text
Color fits typography.
Typography fits layout.
Layout fits workflow.
Decoration fits product identity.
Motion fits state.
Mascot fits trust.
Everything fits the first real transaction.
```

If a screen is visually attractive but does not support trust, price clarity, booking confirmation, worker clarity, or Kael's role, it is the wrong design.

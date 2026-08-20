---
name: kael-design-preflight
description: Mandatory activation layer for any NestScout UI, frontend, visual, motion, layout, component styling, token, prototype, or design-system task. Runs the upstream-aware Design Read and optional UI UX Pro Max evidence search, then hands the result to the existing Design Wheel task class, spokes, protocols, design review, and frontend gates. Use before editing UI files.
---

# kael-design-preflight

This skill is the entry layer, not a replacement wheel. The procedure and output contract are canonical in `governance/design/preflight.md`; the adapters are `kael-design-direction` and `kael-design-intelligence`; the existing spokes remain the execution layer.

Before editing, emit:

```text
Design task:
Target surface:
Workflow step:
Design Read:
Source mode:
UUPM evidence:
Taste-derived direction checks:
NestScout adaptation:
Ignored rules:
Design Wheel class:
Wheel skills and protocols:
Material / motion / token decision:
States and verification gates:
Acceptance gate:
```

Use `source-mode=none` only when the task is a visual bug or another case where external pattern evidence would add noise; state that decision explicitly. Every UI task still hands off to the current Design Wheel and ends through `kael-frontend-test` before it is called done.

Usage:

```text
pnpm design:preflight --task "redesign preserve" --surface "customer home" --workflow "basic intake" --format markdown
```

## Close

An unfilled field is a blocker, not a formality. Do not start editing with `Design Read`, `Workflow step`, or `Acceptance gate` empty.

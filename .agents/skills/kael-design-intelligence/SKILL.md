---
name: kael-design-intelligence
description: Use as the non-normative starting evidence layer for NestScout UI, frontend, visual, design-system, accessibility, adaptive-layout, motion, or research work when a pattern or implementation reference is useful. Searches the pinned UI UX Pro Max corpus through the local adapter, filters web-only guidance for React Native, and hands results to the existing Design Wheel; it never replaces canonical NestScout rules or wheel spokes.
---

# kael-design-intelligence

The executable adapter is `scripts/design/kael-design-intelligence.mjs`. The corpus and adaptation boundary are canonical in `governance/design/intelligence.md` and `docs/design-research/corpus/manifest.json`.

When this fires:

1. State the UI question and the decision it informs.
2. Search only the domains needed for the task; use `react-native` and `ux` for mobile behavior.
3. Treat every row as a candidate, not as a NestScout rule.
4. Translate candidates through `kael-design-preflight` and the existing task-class skill.
5. Record what was retained, adapted, and ignored.

Usage:

```text
pnpm design:intelligence --query "customer repair booking accessibility" --stack react-native --domains ux,react-native --format markdown
```

Do not use web-only code, hover, CSS, Tailwind, GSAP, landing-page composition, or upstream fake data in the Expo product.

Single source: `governance/design/intelligence.md`. The existing Design Wheel remains the execution authority.

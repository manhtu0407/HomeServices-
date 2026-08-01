---
name: kael-design-direction
description: Use before NestScout UI, frontend, visual redesign, screen, component, or design-system work to infer the surface, audience, workflow, brand direction, and quiet constraints. Adapted from Taste Skill's brief inference, Design Read, redesign audit, anti-slop, and state-completeness principles for the existing NestScout Design Wheel and Expo React Native product.
---

# kael-design-direction

The executable adapter is `scripts/design/kael-design-direction.mjs`. The retained and ignored principles are canonical in `governance/design/direction.md`.

When this fires:

1. Infer the surface kind, audience, workflow step, existing brand, and redesign mode.
2. Emit one concise `Design Read` before implementation.
3. Preserve NestScout's Vietnamese-first, trust-first, professional mint service identity.
4. Pass material, motion, accessibility, adaptive-layout, token, review, and frontend verification decisions to the existing Design Wheel spokes.
5. Reject web-only patterns, variance dials, fake data, and decorative effects without a product reason.

Usage:

```text
pnpm design:direction --task "redesign preserve" --surface "customer home" --workflow "basic intake" --format markdown
```

This is a direction starter, not aesthetic approval. Human taste remains part of `kael-design-review`.

Single source: `governance/design/direction.md`.

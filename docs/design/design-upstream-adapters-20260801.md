# Upstream Design Adapters

This document records how the two upstream design repositories enter the existing NestScout Design Wheel. They are starting inputs, not replacement design systems.

## Sources

- UI UX Pro Max: [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), pinned in `docs/design-research/corpus/manifest.json`.
- Taste Skill: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), pinned in `docs/design-research/corpus/manifest.json` and adapted by `governance/design/direction.md`.

Both sources are non-normative. The current product, workflow, platform, accessibility, performance, language, and data-honesty contracts remain authoritative.

## Runtime flow

```text
UI task
  -> kael-design-preflight
    -> kael-design-direction
    -> kael-design-intelligence when useful
    -> existing Design Wheel class
      -> existing spoke skills and protocols
        -> kael-design-review
          -> kael-frontend-test
```

The adapters produce a short, inspectable handoff. They do not generate production UI, change tokens, or bypass human brand review.

## Adapter responsibilities

| Adapter | Starting principle | Existing wheel responsibility |
|---|---|---|
| `kael-design-direction` | brief inference, Design Read, redesign audit, anti-slop, state completeness | classifies the surface and preserves NestScout identity |
| `kael-design-intelligence` | deterministic search over pinned product, UX, style, color, typography, UI reasoning, and React Native rows | supplies candidates and questions; never a final rule |
| `kael-design-preflight` | combines the two inputs into one contract | activates the correct current spoke and acceptance gates |

## Operational proof

The adapters are exercised by:

```text
pnpm design:direction
pnpm design:intelligence
pnpm design:preflight
pnpm design:check
pnpm skills:check
```

`design:check` uses a customer-home fixture and asserts that the output contains a Design Read, service-domain evidence, React Native evidence, a Design Wheel handoff, and the full workflow state set.

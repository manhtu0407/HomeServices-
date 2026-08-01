# Design Reference — Upstream Design Intelligence

This is the source adapter for the existing Design Wheel. It makes the useful, searchable part of UI UX Pro Max available to the NestScout spokes without making that upstream repository the design authority.

## Role

`kael-design-intelligence` answers: “Which reference patterns, UX rules, and React Native implementation guidance are worth considering for this task?” It does not choose the final NestScout design and it does not replace `kael-material-direction`, `kael-motion`, `kael-accessible-content`, `kael-adaptive-layout`, `kael-design-tokens`, `kael-design-review`, or `kael-frontend-test`.

The adapter is deterministic and local. It searches the pinned corpus in `docs/design-research/corpus/` through `scripts/design/kael-design-intelligence.mjs`.

## Allowed starting domains

| Domain | Use | Constraint |
|---|---|---|
| `react-native` | component, layout, list, touch, async, accessibility, and native guidance | React Native / Expo translation only |
| `ux` | interaction, feedback, accessibility, and state prompts | Web-only rows are excluded for React Native searches |
| `product` | product-category and hierarchy prompts | Never invent service scope, prices, workers, or ratings |
| `ui-reasoning` | pattern and anti-pattern candidates | A candidate is not a NestScout decision |
| `style` | visual vocabulary and trade-offs | Existing NestScout identity and tokens win |
| `color` | palette exploration | `apps/mobile/design/theme.ts` remains runtime canonical |
| `typography` | type-pairing exploration | Must pass Vietnamese readability and dynamic type checks |

The adapter does not use web-only code, hover, CSS, Tailwind, GSAP, or landing-page composition as a React Native instruction.

## Authority and handoff

Every result must be labelled as non-normative evidence. The handoff goes to the existing Design Wheel:

```text
upstream search → design preflight → existing task class → existing spoke skills → review → frontend verification
```

The final decision must name what was retained, what was adapted for NestScout, and what was ignored. A missing search result is not permission to invent a generic design.

## Usage

```text
pnpm design:intelligence --query "customer home apartment repair trust" --stack react-native --domains product,ux,ui-reasoning,react-native --format markdown
```

The output is evidence for a preflight, not a generated design system to paste into production.

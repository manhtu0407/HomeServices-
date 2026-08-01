# Design Reference — Upstream-Aware Design Preflight

`kael-design-preflight` is the activation layer between the upstream adapters and the existing Design Wheel. It prevents the two source repositories from becoming disconnected skills and prevents their heuristics from bypassing NestScout's canonical rules.

## Sequence

```text
1. Read canonical product and design authority.
2. Infer the direction and emit one Design Read.
3. Search the pinned UI UX Pro Max corpus when the task needs external pattern evidence.
4. Classify exactly one Design Wheel task class.
5. Hand off to the existing class skill(s) and protocols.
6. Verify the surface through the existing review and frontend-testing gates.
```

The adapters are optional evidence sources inside the preflight. The preflight itself is mandatory for UI, frontend, visual, motion, layout, token, component, and design-system work. A visual bug may use `source-mode=none`; that is an explicit decision, not an omitted preflight.

## Authority flow

```text
NestScout hard rules and workflow contracts
  → React Native / Expo / accessibility platform contracts
  → existing Design Wheel spokes and canonical design references
  → kael-design-direction and kael-design-intelligence starting evidence
  → human taste and brand sign-off
```

The upstream adapters may supply candidates and questions. They may not override a higher layer or create a product capability.

## Required output

```text
Design task:
Target surface:
Workflow step:
Design Read:
Source mode: none | direction | intelligence | both
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

The machine-readable equivalent is emitted by `scripts/design/kael-design-preflight.mjs`. The human-readable output is deliberately short enough to appear before implementation instead of becoming another large prompt.

## Handoff contract

| Preflight result | Existing Design Wheel handoff |
|---|---|
| flow | `kael-prototype` → `kael-frontend-test` |
| screen / component | `kael-material-direction` + `kael-motion` → `kael-frontend-test` |
| design-system | `kael-design-tokens` → `kael-design-review` → `kael-frontend-test` |
| material | `kael-material-direction` → `kael-motion` when animated |
| motion | `kael-motion` → `kael-frontend-test` |
| accessibility | `kael-accessible-content` → `kael-frontend-test` |
| adaptive-layout | `kael-adaptive-layout` → `kael-frontend-test` |
| visual-bug | `kael-visual-qa` + `kael-diagnose` → `kael-frontend-test` |
| polish | `kael-design-review` + the smallest relevant spoke → `kael-frontend-test` |
| research | `kael-research` + `kael-design-evidence` |

`kael-design-preflight` does not replace any row. It makes the handoff explicit and inspectable.

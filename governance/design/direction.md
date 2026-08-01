# Design Reference — Design Direction Adapter

This is the NestScout adaptation layer for the useful parts of Taste Skill. It is intentionally small because the existing Design Wheel already owns material, motion, accessibility, adaptive layout, tokens, review, and frontend verification.

## Retain

- infer the surface, audience, workflow, existing brand, and quiet constraints before choosing an aesthetic;
- emit one concise `Design Read` before implementation;
- audit an existing surface before redesigning it;
- reject generic AI defaults and decorative effects without a product reason;
- keep loading, empty, error, success, retry, and confirmation states in the design brief;
- keep one language mode, one theme decision, and a deliberate responsive collapse plan.

## Adapt for NestScout

| Upstream idea | NestScout form |
|---|---|
| Page kind | workflow surface: flow, screen, component, system, material, motion, accessibility, adaptive, visual bug, polish, or research |
| Audience | HCMC apartment customer, verified worker, or support/admin operator |
| Vibe | trustworthy, polished, friendly, operational, and Vietnamese-first; not a free-form aesthetic dial |
| Redesign mode | preserve the existing NestScout identity by default; overhaul only with explicit direction |
| Motion | key product moments only; defer timing and fallback rules to `kael-motion` and `design/motion.md` |
| Material | decide glass versus solid through `kael-material-direction`; zero glass remains valid |
| State completeness | map states to the workflow and data-honesty rules, not decorative placeholders |

## Ignore

- variance, novelty, or cinematic intensity dials as independent product goals;
- landing-page hero, portfolio, dashboard, or marketing conversion patterns for the mobile service app;
- DOM, CSS, hover, GSAP, scroll-hijack, and browser performance instructions;
- fake screenshots, fake precision, fake social proof, fake workers, or fake prices;
- any suggestion that conflicts with `critical.md`, `RULES.md`, `STRUCTURES.md`, `AGENTS.md`, or the existing Design Wheel.

## Output

```text
Design Read:
Surface and workflow:
Audience and constraints:
Retained direction principles:
NestScout adaptations:
Ignored upstream rules:
Existing wheel class and skills:
State and verification handoff:
```

The adapter is a starting direction, not subjective approval. `kael-design-review` still ends with `block`, `revise`, or `ready-for-human-review`.

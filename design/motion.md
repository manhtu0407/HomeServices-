# Design Reference — Motion Grammar

> Extracted from `design.md` for progressive disclosure (2026-05-29). `design.md` core keeps the authority order, identity, goal, preflight, skill-adaptation, scoring rubric, RN rules, forbidden defaults, and review checklist. Load this file only when the task needs it (see design.md → Design Reference Files). `critical.md` remains highest execution authority.

Canonical motion source for NestScout UI. The kael-motion skill points here. Pair with RULES.md Motion Rules + Performance Budget and Reduce Motion / Reduce Transparency.

## 13. Motion Grammar

Motion is required only at key product moments. Less motion, higher quality.

Required motion areas:

- splash / loading,
- skeleton loading,
- bottom tab / Kael mascot,
- primary CTA,
- modal / bottom sheet,
- screen transitions for major flows,
- selected service / selected chip,
- job state transition when useful.

Forbidden motion:

- noisy auto-loop on normal screens,
- decorative motion that does not communicate state,
- hover-only web motion,
- heavy parallax,
- slow transitions that block workflow,
- unrelated effects per component.

Recommended timing ranges:

```text
Screen enter: 180-260ms, opacity 0 -> 1, translateY 8 -> 0
Tab switch: 160-240ms, active glow/lift/scale only
Press feedback: scale 0.97-0.99, return within 120-180ms
Bottom sheet: 220-320ms, slide up + scrim 0 -> 0.40/0.45
Modal: 180-260ms, scale 0.97 -> 1 + opacity
Skeleton shimmer: 1200-1600ms loop, low contrast
Mascot reaction: 180-300ms, small lift/breathe, no noisy loop
CTA success: 180-260ms, soft fill or check transition
```

Motion acceptance:

- feels subtle but expensive,
- reinforces hierarchy,
- matches palette and material,
- gives feedback after user action,
- never hides latency dishonestly,
- works on low-end devices.


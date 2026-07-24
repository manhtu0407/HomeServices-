# Design Reference — Motion Grammar

> Extracted from `design.md` for progressive disclosure (2026-05-29). `design.md` core keeps the authority order, identity, goal, preflight, skill-adaptation, scoring rubric, RN rules, forbidden defaults, and review checklist. Load this file only when the task needs it (see design.md → Design Reference Files). `critical.md` remains highest execution authority.

Canonical motion source for NestScout UI. The kael-motion skill points here. Pair with AGENTS.md Motion Rules + Performance Budget and Reduce Motion / Reduce Transparency. Numeric values live in exactly one place — `apps/mobile/components/ui/motion-tokens.ts`; this file is the meaning behind those numbers. If a duration here and a token there disagree, the token wins and this prose must be corrected.

## 13. Motion Grammar

Motion is required only at key product moments. Less motion, higher quality. Zero motion is a valid choice when a screen already reads clearly without it.

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

### Two mechanisms, one vocabulary

The app moves in two complementary ways, both named by the same semantic tokens in `motion-tokens.ts`:

- **Timing** (`withTiming`, reads `*.durationMs`) — functional fades, reveals, and state changes.
- **Spring** (`withSpring`, reads `*.spring` and the `liquid.*` configs) — the liquid-glass signature settle and overshoot: floating dock, liquid pill, press bubble, and the y-offset settle on enter. The brand intent for the springs lives in `signature.md`; the numeric configs live in `motion-tokens.ts`.

A single moment can use both — an element fades in over its `durationMs` while a spring settles its `translateY`. Signature surfaces lead with the spring; quiet surfaces use timing only.

Semantic tokens (name → when → value in `motion-tokens.ts`):

```text
feedback     press / tap acknowledgement   scale 0.985, 140ms
selection    selected chip / service       200ms (or a liquid spring on signature surfaces)
route        screen / element enter        220ms fade + translateY 16, spring { damping 18, stiffness 160 }
sheet        bottom sheet / modal shell    300ms + spring { damping 18, stiffness 160 }
stateChange  job / status transition       240ms
loading      skeleton shimmer              1400ms loop, low contrast
```

Recommended timing ranges (keep token values inside these; never exceed the high end for a transition that blocks the flow):

```text
Screen / route enter: 180-260ms, opacity 0 -> 1, small translateY -> 0 (a spring settles the offset)
Tab switch / selection: 160-240ms, active glow / lift / scale only
Press feedback: scale 0.97-0.99, return within 120-180ms
Bottom sheet: 220-320ms, slide up + scrim 0 -> 0.40/0.45
Modal: 180-260ms, scale 0.97 -> 1 + opacity
Skeleton shimmer: 1200-1600ms loop, low contrast
Mascot reaction: 180-300ms, small lift / breathe, no noisy loop
CTA success / state change: 180-260ms, soft fill or check transition
```

There is no global "entrance" duration. Route enter is 180-260ms (token `route`, 220ms); the earlier 440ms entrance read as sluggish and has been removed. Signature overshoot comes from the spring, not a longer fade.

### Reduce Motion

`motionDuration(baseMs, reduceMotion)` clamps every timing to `reducedMotionCapMs` (160ms) when the OS Reduce Motion setting is on. Under Reduce Motion, drop spring overshoot, sheen, parallax, and depth motion — fall back to a short fade or an instant state. Reduce Transparency switches glass to opaque / tinted surfaces (see `signature.md`).

Motion acceptance:

- feels subtle but expensive,
- reinforces hierarchy,
- matches palette and material,
- gives feedback after user action,
- never hides latency dishonestly,
- works on low-end devices (60fps; no real-time blur in long lists).

---
name: kael-motion
description: Design and audit UI motion/animation for the Home Services Expo React Native app. Use when adding or reviewing animations, transitions, micro-interactions, screen or tab transitions, bottom sheets, skeleton loaders, or Kael mascot motion. Two modes — create (choose motion that fits the moment) and audit (find missing motion + AI-slop). Enforces Reanimated, Reduce Motion / Reduce Transparency, and the Performance Budget.
---

# kael-motion

Motion skill for Home Services (Expo RN / Reanimated), adapted from `design-motion-principles`. Canonical specs live in `design/motion.md` (timing ranges, required/forbidden areas) and `RULES.md` (Motion Rules + Performance Budget) — do not duplicate them here. Read `design.md` core first for identity/preflight.

## Mode: create
Use when building animation for a screen or component.
1. First ask: **should this animate at all?** Motion is required only at key product moments (`design/motion.md` "Required motion areas"). If it is not a key moment, ship it static.
2. Pick the smallest motion that gives feedback or communicates state. Use the timing ranges in `design/motion.md` (screen enter 180-260ms, tab 160-240ms, press scale 0.97-0.99, sheet 220-320ms, modal 180-260ms, skeleton shimmer 1200-1600ms).
3. Implement with Reanimated (not legacy RN `Animated` for new work); respect safe-area and keyboard.
4. Wire Reduce Motion (remove parallax / sweep / depth / scale-heavy effects) and Reduce Transparency (glass → opaque/tinted) per RULES.md.

## Mode: audit
Use when reviewing existing UI motion.
1. **Motion gap:** conditional renders or state swaps that should transition but do not (no entrance, instant swaps, sheets without scrim choreography).
2. **Anti-slop checklist — reject these:** pulsing indicators, blur-everywhere entrances, hover-scale-on-everything, stagger-spam, bouncy springs on utility actions, uniform fade-ins on everything, motion-on-mount for static content, animated blur radius, decorative infinite loops, glass-on-glass stacking, large parallax, spinning.
3. **Performance:** no real-time blur in long lists, no repeated `BlurView`/`GlassView` cells, no heavy shadow stacks in scroll views; target 60fps; stabilize dimensions.
4. **Honesty:** motion must never fake latency or hide a failure state.

## Output
```text
Mode: create | audit
Moment (why it animates):
Motion chosen / found:
Timing + easing:
Reduce Motion / Transparency:
Performance check:
Anti-slop findings:
Verdict / fixes:
```

Single source: `design/motion.md` + RULES.md Motion Rules & Performance Budget. `critical.md` remains highest execution authority; pair with `kael-ui-rn-execution` (protocols/ui.md).

---
name: kael-adaptive-layout
description: Make Home Services Expo React Native screens adapt to available size and posture. Use when handling window size, orientation, keyboard, fold, or reflow — responsive layout, large phones, tablet, landscape, or split-screen. Classifies by available width (compact < 600 / medium 600-839 / expanded >= 840 dp), not device names; caps readable width; reflows instead of rescaling.
---

# kael-adaptive-layout

Thin wrapper. The classes, posture rules, and repo pattern are canonical in `governance/design/adaptive-layout.md` — do not duplicate them here.

When this fires:

1. Classify by available width from `useWindowDimensions()` (compact / medium / expanded), not by device name.
2. Do not stretch a compact layout to an expanded width; cap content at a readable width.
3. Handle orientation, keyboard inset, safe area, fold posture, and thumb reachability.
4. Reflow (columns / layout) rather than a uniform scale; change nav only when there is room.
5. Verify at a phone width and a large width (+ landscape when the layout adapts).

Single source: `governance/design/adaptive-layout.md`. Pair with `kael-frontend-test` (verify widths) and the design router `governance/design/runtime.md`.

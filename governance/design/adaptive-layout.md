# Design Reference — Adaptive Layout

> A nan of the `design.md` system. `critical.md` is highest authority; `AGENTS.md` owns the Performance Budget; `design/runtime.md` routes here. The `kael-adaptive-layout` skill points here. RN reality: layout adapts to available size and posture, not to device names.

## 0. Role

NestScout is a phone-first Expo app that must also stay usable on large phones, small tablets, split-screen, landscape, and with the keyboard open. Adapt to the **available size and posture**, never to a device name or a one-off hardcoded breakpoint.

## 1. Window size classes (by available width, dp)

Classify by the width the app actually has (from `useWindowDimensions`), not the physical device:

| Class | Width (dp) | Intent |
|---|---|---|
| compact | < 600 | phones, split-screen — single column |
| medium | 600–839 | large phones landscape, small tablets — room for a second pane or wider content |
| expanded | ≥ 840 | tablets — multi-column / rail navigation where it helps |

Do not stretch a compact layout to fill an expanded width; cap content at a readable width and use the extra space deliberately (or leave margin).

## 2. Current pattern in the repo (verify-first)

`useWindowDimensions()` is used in 12 places across 6 files (customer surfaces, service history, worker flow + dock). Each reads `width` or `height` **directly and ad-hoc**; there is **no shared window-class helper yet**. When you add adaptive behavior:

- Derive the class from `useWindowDimensions().width` at the point of use.
- If more than a couple of surfaces need the same threshold, introduce one small shared helper rather than copying `< 600` literals — but that helper is a separate task, not an assumption this nan makes.

## 3. Posture + environment

- **Orientation:** portrait is the default; in landscape, prefer wider content or a side rail over stretched single-column text.
- **Keyboard:** account for the keyboard inset (safe-area + `KeyboardAvoidingView` / the app's existing pattern); never trap the primary action or the dock behind it.
- **Safe area:** handle notches / home indicator via `react-native-safe-area-context` (already used).
- **Fold posture:** treat a fold / hinge as two panes only when width crosses into medium / expanded; otherwise single column.
- **Reachability:** keep primary actions within thumb reach on tall screens.

## 4. Rules

- Cap text / content at a max readable width; center or pad beyond it.
- Nav changes with room, not with device: bottom dock in compact; consider a rail only at expanded.
- Reflow, don't rescale: change the number of columns / the layout, not a uniform zoom.
- Test at both a small phone and a large width, and in landscape when the layout adapts.

## 5. Checklist

```text
[ ] Class derived from available width (compact / medium / expanded), not a device name.
[ ] Compact layout not stretched; content capped at a readable width.
[ ] Orientation + keyboard + safe area + reachability handled.
[ ] Reflow (columns / layout) rather than uniform scale.
[ ] Verified at phone + large width (+ landscape if it adapts).
```

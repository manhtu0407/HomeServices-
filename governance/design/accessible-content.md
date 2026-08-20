# Design Reference — Accessible Content

> A spoke of the `design.md` system. `critical.md` is highest authority; `AGENTS.md` owns the language + Reduce Motion / Transparency rules; `design/runtime.md` routes here. The `kael-accessible-content` skill points here. RN reality: no hover (press, not hover), native accessibility APIs.

## 0. Role

Every user must be able to read, hear, and operate a NestScout screen — in Vietnamese or English, at large text sizes, with a screen reader, and with reduced motion or transparency. Accessibility is a build-time requirement, not a later pass.

## 1. Language (VI / EN)

- One language per selected mode; never mix VI and EN in the same view (`AGENTS.md`, `RULES.md` #5). VI is primary.
- Full Vietnamese diacritics — never strip accents to "simplify".
- Shared labels (service, status, role, earnings, address…) come from the same language system, not per-component strings.

## 2. Dynamic type

- Support system text scaling to roughly 100 / 135 / 160 / 200%. The token type roles (`theme.ts` `typography`) scale; do not lock font sizes that block scaling.
- Layouts reflow at large text — no clipped labels, no fixed-height rows that hide text. Prefer wrapping over truncation for meaningful content.

## 3. Truncation rule (do not hide meaning)

`numberOfLines` is used ~420 times; use it only for genuinely secondary text. **Never truncate behind `numberOfLines` (or an ellipsis) any of:**

```text
price / money · status · risk / warning · address · recovery or safety info · the primary action label
```

These must stay fully visible (wrap, resize the container, or move them). A hidden price or status is a trust failure (`AGENTS.md` data honesty).

## 4. Screen reader

- Every interactive element exposes a **name, role, and state** (`accessibilityLabel` / `accessibilityRole` / `accessibilityState`); important actions expose an action hint.
- Reading order and grouping are logical; decorative elements are hidden from the reader.
- Live status changes announce where it matters (e.g. a job state change) without spamming.

## 5. Contrast + non-color cues

- Text contrast ≥ WCAG (4.5:1 body, 3:1 large / UI) in both light and dark.
- Never encode meaning by color alone — pair status / risk color with an icon, label, or shape (color-blind safe).

## 6. Target size + motion / transparency

- Touch targets meet the platform minimum (~44pt); do not rely on hover (RN has none) — press states, not hover states.
- Respect Reduce Motion and Reduce Transparency via `useGlassAccessibility()` (`components/ui/accessibility-motion.ts`): drop overshoot / sheen / parallax; glass → opaque / tinted.

## 7. Checklist

```text
[ ] One language per mode, full diacritics, shared label system.
[ ] Text scales to large dynamic type; layout reflows, no clipped meaning.
[ ] price / status / risk / address / recovery / primary action never truncated.
[ ] Interactive elements have name + role + state; decorative hidden.
[ ] Contrast passes light + dark; meaning not by color alone.
[ ] Targets ≥ ~44pt; press not hover; Reduce Motion / Transparency handled.
```

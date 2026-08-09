---
name: kael-accessible-content
description: Make NestScout Expo React Native content accessible. Use for VI / EN copy and diacritics, dynamic type / large text, screen reader name / role / state, contrast and non-color cues, touch target size, truncation, or accessibility. Enforces no mixed-language, no truncated price / status / risk / address, Reduce Motion / Transparency, and WCAG contrast in light + dark.
---

# kael-accessible-content

Thin wrapper. The rules are canonical in `governance/design/accessible-content.md` — do not duplicate them here.

When this fires:

1. One language per mode (VI primary), full diacritics, shared label system — never mix VI / EN.
2. Support large dynamic type; reflow instead of clipping. Never truncate price / status / risk / address / recovery / the primary action behind `numberOfLines`.
3. Give every interactive element a name, role, and state; hide decorative elements from the screen reader.
4. Pass WCAG contrast in light + dark; never encode meaning by color alone.
5. Targets >= ~44pt; press not hover; respect Reduce Motion / Transparency via `useGlassAccessibility()`.

Single source: `governance/design/accessible-content.md`. Pair with `kael-frontend-test` (accessibility gate) and the design router `governance/design/runtime.md`.

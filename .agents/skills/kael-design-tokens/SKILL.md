---
name: kael-design-tokens
description: Manage design tokens for the Home Services Expo React Native app — color, typography, spacing, radius, and component constants. Use when adding or changing a token, choosing a color, touching a raw hex / rgba, or working with theme, palette, spacing, or radius. Enforces one canonical source (design/theme.ts), purpose-based names, and no raw values outside the token boundary.
---

# kael-design-tokens

Thin wrapper. The token architecture and rules are canonical in `governance/design/tokens.md` — do not duplicate them here.

When this fires:

1. Read the value at the highest layer that fits (primitive → semantic role → component). Prefer a semantic role (`color.text.secondary`) over a primitive or a raw literal.
2. Change tokens in one place — `design/theme.ts` (the runtime canonical). Keep `design/tokens.json` consistent if you touch it; do not add new runtime consumers of `tokens.json`.
3. New hex / rgba only at the token boundary (`theme.ts` / `tokens.json`), an asset, or a test — never in a screen or component.
4. Name by purpose, not appearance. Reject same-name-different-value and `prettyMint2`-style names.
5. Do not refactor the token layers as a side effect — a token migration is its own task.

Single source: `governance/design/tokens.md`. Pair with `kael-material-direction` (glass tokens) and the design router `governance/design/runtime.md`.

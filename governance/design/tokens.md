# Design Reference — Design Tokens

> A spoke of the `design.md` system. `critical.md` is highest authority; `AGENTS.md` owns the language / data-honesty rules; `design/runtime.md` routes here for token work. The `kael-design-tokens` skill points here. This file describes the token architecture **as it exists in the repo** and the rules for changing it — it is guidance, not a refactor.

## 0. Role

Tokens are the shared vocabulary for color, type, spacing, radius, shadow, and component constants. A token change ripples across every screen, so tokens are edited deliberately — by role and purpose, at the canonical source, never as a raw value dropped into a component.

## 1. The layers

Read a value at the highest layer that fits; add a new one only when no existing layer serves.

| Layer | What it is | Where it lives (repo) |
|---|---|---|
| primitive / global | raw palette + scale (hex, dp steps) | `design/theme.ts` `color.*`, `spacing`, `radius`, `typography`, `shadow` |
| semantic role | intent-named aliases (text.primary, surface.stroke, brand.primary, accent.success) | `design/theme.ts` (`color.text` / `color.surface` / `color.brand` / `color.accent`) |
| component | per-component constants (button, bottomNav, glass variants) | `design/theme.ts` `component`, `glassSurfaceTheme`; `components/ui/tokens.ts` (glass) |
| per-app / surface | customer vs worker theming | `design/theme.ts` `customerTheme`, `signature` |
| state / accessibility | disabled / pressed / Reduce Transparency fallbacks | `theme.ts` (`*.disabled`, glass fallbacks) + `components/ui/accessibility-motion.ts` |

## 2. Canonical source (current reality — do not hand-edit two)

The repo has **two parallel color/token sources** that currently agree but are maintained by hand:

- `design/theme.ts` — the **runtime canonical**. Its header states "implementation values come from this file"; every screen imports `color` / `theme` from here. This is what ships.
- `design/tokens.json` — a v2.0.0 export from the verified design zips. It mirrors the same values, **but nothing imports it at runtime** (it is a design reference / handoff artifact).
- `constants/colors.ts` — a legacy `Colors` alias + `priceCheck` palette that re-exports `theme.ts` plus a few residual raw hex (`tabInactive`, `canvasWarm`, `surfaceCopper`, `clay`, `claySoft`).
- `components/ui/tokens.ts` — component-level glass tokens / helpers derived from `theme.ts`.

Rules:

- **Change a token in exactly one place: `design/theme.ts`.** If you also update `tokens.json`, keep it byte-consistent — never let the two diverge silently.
- Do not add new runtime consumers of `tokens.json`; if a value is needed in code, read it from `theme.ts`.
- Treat `constants/colors.ts` as legacy: prefer `theme.ts` `color.*`; do not add new raw hex there.
- Proposed one-source direction (not now): generate `theme.ts` from `tokens.json`, or mark `tokens.json` reference-only. **This spoke is the rule; the token migration is a separate task.**

## 3. Raw-value ratchet

- A new hex / rgba literal is allowed **only** at the token boundary (`design/theme.ts`, `tokens.json`), an asset, or a test — never in a screen or component.
- Name a token by **purpose**, not appearance: `accent.warning`, `surface.stroke`, `text.muted` — never `prettyMint2`, `green3`, `lightGray`.
- A component reads a semantic role (`color.text.secondary`), not a primitive (`'#526B73'`) and not a raw literal.

## 4. Reject

- Two tokens with the same name but different values across files.
- A raw color chosen per component instead of a token.
- Appearance-named tokens (`prettyMint2`, `blueish`).
- A new palette entry when an existing semantic role already fits. The palette is neutral + mint + a small accent set; `RULES.md` bans hardcoded magic values, and the same discipline applies to color.

## 5. Checklist

```text
[ ] Value read at the right layer (semantic role, not primitive, not raw literal).
[ ] New token added only at design/theme.ts; tokens.json kept consistent if touched.
[ ] Named by purpose, not appearance.
[ ] No raw hex / rgba outside token / asset / test.
[ ] No same-name-different-value across theme.ts / colors.ts / tokens.ts.
[ ] Reused an existing role before adding a new one.
```

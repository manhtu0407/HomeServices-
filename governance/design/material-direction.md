# Design Reference — Material Direction (the decision layer)

> Part of the `design.md` system. `critical.md` is highest authority; `AGENTS.md` Glassmorphism Rules + Performance Budget and this file decide **where** material goes; `design/signature.md` describes what glass **looks like** once this file has chosen it. The `kael-material-direction` skill points here for the decision and to `signature.md` for the recipe.

## 0. Role

This file answers three questions before any glass is drawn:

1. Does this surface use glass at all?
2. If yes, which role — and therefore which `GlassSurface` variant?
3. How does that role map to iOS, Android, and web?

Glass is a material with a real cost (blur passes, native availability, legibility). It is an accent, never a default. **Zero glass is a valid — and common — answer**: a calm neutral surface beats a decorative translucent one. Decide material by the surface's role and the content behind it, not by taste.

## 1. Surface roles

Classify every surface into exactly one role. The role decides the material and the `GlassSurface` variant.

| Role | What it is | Material | `GlassSurface` variant |
|---|---|---|---|
| base | screen background, scroll containers, page canvas | solid theme background | — (no `GlassSurface`) |
| content | cards, list rows, forms, chat bubbles, long text, data tables | solid / standard opaque | — (no `GlassSurface`) |
| navigation | floating tab bar, top bar, dock | glass accent | `nav` |
| transient | bottom sheet, modal shell | glass accent | `sheet` |
| media-overlay | controls floating over photo / video / map | glass accent, interactive | `control` |
| interactive-control | search bar, one hero / summary card, primary CTA surround | glass accent | `control` / `hero` |

At most one hero / summary glass surface per screen — a ceiling, not a quota; most screens need zero. Max 2–3 glass layers per screen (`AGENTS.md`), never stacked.

## 2. Platform mapping

`GlassSurface` already resolves these at runtime; this table is the intent behind its three render paths.

| Role | iOS (Liquid Glass available) | Android / iOS without the API | web |
|---|---|---|---|
| navigation | native `GlassView` (regular) | `BlurView` translucent + 1px edge highlight | backdrop-filter blur backing |
| transient | native `GlassView` (regular) | `BlurView` + edge highlight | solid / tinted sheet |
| media-overlay / control | native `GlassView`, interactive | `BlurView` + edge highlight | solid / tinted |
| base / content | solid surface | solid surface | solid surface |

Rules baked into the runtime:

- Native glass requires **both** `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()`. The second guards iOS 26 betas where the module is missing and using `GlassView` crashes.
- Android has no Liquid Glass API; it falls back to a bounded `BlurView`. Material You / M3 surfaces there are tonal, not glass — do not fake Liquid Glass on Android.
- Reduce Transparency → solid neutral / tinted surface on every platform. Reduce Motion → drop the signature spring / sheen (see `signature.md`).

## 3. Forbidden

- Liquid Glass on content cards, forms, list rows, chat bubbles, or long text blocks (`AGENTS.md`). Those are `content` → solid.
- Glass on glass (stacking translucent surfaces). Pick one accent layer.
- Blur inside repeated list / scroll rows (Performance Budget). Repeated rows stay opaque or lightly tinted.
- An ambiguous default that silently produces a barely-there 'clear' glass. Every `GlassSurface` declares an explicit role / variant.
- A custom edge highlight painted on top of the native `GlassView` (double highlight). The manual highlight is for the blur / solid fallback only.
- Animating opacity on a `GlassView` or an ancestor — it flattens the native effect. Fade a child, or use a standard material.

## 4. Money, scope, and evidence stay solid

Payment, price / scope confirmation, worker verification, and evidence surfaces are **solid / standard**, never glass. Trust reads through calm, opaque, explicit surfaces; translucency and motion undercut it. `design.md` money-impacting rules and `RULES.md` #7 / #8 apply — the signature yields to trust here.

## 5. Decision checklist

```text
[ ] Named the surface role (base / content / navigation / transient / media-overlay / interactive-control).
[ ] Base and content are solid — no glass on rows / forms / cards / chat / long text.
[ ] Money / scope / payment / evidence are solid.
[ ] If glass: an explicit GlassSurface variant, ≤ 2–3 layers, not stacked.
[ ] Reduce Transparency + Reduce Motion fallbacks correct.
[ ] Recipe details (palette, spring, dark tokens) taken from signature.md, not reinvented.
```

If a surface does not clearly need glass, it does not get glass.

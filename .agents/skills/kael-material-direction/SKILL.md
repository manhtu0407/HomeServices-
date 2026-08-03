---
name: kael-material-direction
description: Decide surface material (glass vs solid) and audit glass surfaces for the NestScout Expo React Native app. Use when building or reviewing any surface that could use glass — floating tab bar / dock, top controls, search, hero or summary card, primary CTA, modal / bottom sheet, media overlay — or when the user mentions glass, blur, material, elevation, nav bar, sheet, overlay, hero, or surface. Decides role → material → variant first ("zero glass is valid"); money / scope / payment / evidence stay solid; applies the neutral + one-mint glass recipe only once glass is chosen.
---

# kael-material-direction

Two layers: DECIDE the material, then APPLY the recipe. Do not duplicate the specs here.

- Decision (where glass goes): `governance/design/material-direction.md` — classify surface role (base / content / navigation / transient / media-overlay / interactive-control) → material → `GlassSurface` variant, with platform mapping and forbidden patterns. Glass is an accent; **zero glass is a valid answer**.
- Recipe (what glass looks like once chosen): `governance/design/signature.md` — neutral base + ONE mint accent, spring overshoot, optional specular sheen, mode-aware edge highlight, dark tokens, dock / pill.

Builds on `kael-motion` + `governance/design/motion.md` (timing) and stays inside `AGENTS.md` Glassmorphism Rules + Performance Budget. `governance/critical.md` remains highest authority.

## Mode: decide
1. Name the surface role (material-direction.md §1). Base and content are solid — no glass on rows, forms, cards, chat, or long text.
2. Money / scope / payment / evidence → solid / standard.
3. If glass: pick an explicit `GlassSurface` variant (nav / control / hero / sheet); ≤ 2–3 layers; never stacked.
4. Confirm platform + accessibility fallbacks (material-direction.md §2): native glass needs both `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()`; Android → blur fallback; Reduce Transparency → solid; Reduce Motion → drop spring / sheen.

## Mode: apply (recipe — only after 'decide' chose glass)
1. Neutral surfaces + at most ONE mint accent per region; calm wash under the glass.
2. Material: 1px mode-aware inner highlight in the fallback path only (native `GlassView` draws its own); continuous rounded corners; localized blur per signature.md §3.
3. Motion: spring with slight overshoot (not linear `withTiming`); optional single specular sheen on appear / activate; nothing loops.
4. Dark mode: dark token set; soft highlights; contrast ≥ WCAG. Reduce Motion / Reduce Transparency fallbacks; 60fps; no real-time blur in long lists.

## Mode: audit
Check the surface against material-direction.md (right material for the role? money / scope / evidence solid?) and the signature.md recipe checklist (neutral + single mint, mode-aware highlight, spring not linear, dark tokens, fallbacks). Report each failing item with a concrete fix. Aesthetic quality is confirmed by human sign-off on device — do not assign a numeric score.

## Output
```text
Mode: decide | apply | audit
Surface + role:
Material (glass / solid) + variant + why:
Money / scope / evidence solid?:
If glass — neutral + single mint / edge highlight / motion / dark / fallbacks:
Fixes:
```

Single sources: `governance/design/material-direction.md` (decision) + `governance/design/signature.md` (recipe). Pair with `kael-motion`.

# Design Reference — Glass-Liquid Signature (the glass recipe)

> Part of the `design.md` system (2026-05-29). `critical.md` is highest authority; `AGENTS.md` glass/motion rules and `design/motion.md` timing are not overridden here. **`design/material-direction.md` decides whether a surface uses glass and which variant; this file only describes what that glass looks like once material-direction has chosen it.** The `kael-material-direction` skill points here for the recipe.

## 0. Role

This is the **recipe** for glass surfaces: the details that make a glass surface unmistakably NestScout — consistent, classic, minimal. It does **not** decide where glass goes. `design/material-direction.md` makes that call (role → material → variant, and "zero glass is valid"); this file applies only once a surface has been chosen as glass.

Direction (locked by Tu 2026-05-29): **classic, minimal, OS-grade** (Apple Liquid Glass + Material expressive motion), **neutral base + ONE mint accent**, sections that pop without clutter or FOMO.

> Token values below are **proposed within Tu's chosen direction** and need Tu's visual sign-off on Expo/device. Aesthetic quality is judged by human sign-off, not a self-assigned score.

## 1. Gaps diagnosed in current code (2026-05-29)

1. **Motion.** Addressed — the sluggish 440ms entrance timing was removed; signature motion uses the springs in `motionTokens.liquid.*`. Timing vs spring and Reduce Motion live in `design/motion.md`.
2. **No canonical dark tokens.** `constants/colors.ts` is light-only; dark colors are hard-coded per component. → define one dark token set.
3. **Edge highlight is pure-white + top-only**, used in dark too (`glass-surface.tsx` `edgeHighlight` rgba(255,255,255,0.42)). → mode-aware highlight (neutral-gray in dark).
4. **Too many colors** (priceCheck has ~18). → reduce to neutral + 1 mint accent.
5. Blur slightly heavy (nav 28 / sheet 30). → cap nav/sheet ≤ 26.

What is already good (keep): `expo-glass-effect` native Liquid Glass + blur/View fallbacks; `borderCurve: 'continuous'`; Reduce Motion / Reduce Transparency handling; the dock squash/stretch + sheen.

## 2. Palette — Neutral base + ONE mint accent

Drop the multi-mint/jade/aqua/copper zoo from signature surfaces. Surfaces are **neutral**; mint appears only on the **single signature moment** per screen (active pill, primary CTA, key focus).

```text
Mint accent (the only brand hue used on signature):
  mint            #17A995   (accent fill / active)
  mintDeep        #00756A   (pressed / text-on-light accent)

Light (neutral):
  bg              #F6F7F7   (near-white, faintly cool — not mint-tinted)
  surface         #FFFFFF
  text            #14201E
  textSecondary   #5C6B68
  line            #E4E8E7
  glassTint       rgba(255,255,255,0.62)
  edgeHighlight   rgba(255,255,255,0.30)   (1px inner border)

Dark (iOS-style neutral; canonical values live in design/theme.ts customerTheme.darkLayer):
  bg (base)       #000000   (true black base, as iOS systemBackground)
  surface         #1C1C1E   (card)
  raised          #2C2C2E   (elevated layer)
  text            #FFFFFF
  textSecondary   #AEAEB2
  textTertiary    #98989F
  line            rgba(84,84,88,0.65)
  glassTint       rgba(118,118,128,0.24)   (lighter neutral glass, iOS 27)
  edgeHighlight   rgba(255,255,255,0.22)   (top specular; standard material 0.14)
  rim             0 0 0 0.5px rgba(0,0,0,0.55)   (darkened edge so glass floats over content)
```

Rules: max **one** mint accent per screen region; neutral elsewhere. Warning/price-uncertainty may use a single restrained warm accent (existing `clay`), sparingly. No purple/blue AI gradients (RULES).

## 3. Glass material recipe

- **Blur** (localized only, never full-screen): subtle 14, control 18, hero 22, nav 24, sheet 26. Tune per theme.
- **Transparency**: light glassTint alpha ~0.55–0.7; dark ~0.5–0.6.
- **Inner border highlight**: 1px, mode-aware (`edgeHighlight` above). Light catches the top edge strongest; a faint full-perimeter hairline is allowed but must stay subtle.
- **Corners**: rounded + `borderCurve: 'continuous'` (already standard). Slightly curved, soft — "viền hơi cong".
- **Border layer transparent/light**: the border is a light refraction line, not a solid stroke.
- **Background wash**: give the area under glass a calm, subtle wash/gradient so glass reads clean (not muddy). Keep it neutral; mint only as a faint hint behind the ONE hero/CTA.
- **Layering**: ≤ 2–3 glass layers per screen (RULES). No glass-on-glass stacking.

## 4. Liquid motion = spring + "bubble pop"

"Liquid đi qua rất nhẹ, nhô lên một xíu như bong bóng bể" = **spring with slight overshoot**, optionally with a **specular sheen sweep** that lifts then settles. Use Reanimated `withSpring` (not `withTiming`) for signature motion. The sheen is an optional flourish, not a requirement — many surfaces settle with the spring alone.

```text
Spring tokens (proposed; Reanimated withSpring config, mass=1):
  entrance   { stiffness: 170, damping: 16 }  → ζ≈0.61, gentle overshoot, ~replaces 440ms
             from: opacity 0→1, translateY 12→0, scale 0.98→1
  press      { stiffness: 320, damping: 22 }  → snappy, minimal overshoot, scale →0.97
  pill/bubble{ stiffness: 200, damping: 14 }  → more overshoot for squash/stretch settle
  sheet      keep existing spring (stiffness 160, damping 18) + scrim 0→0.42

Specular sheen sweep: a soft light band crosses the surface once on
appear / activate over 220–300ms, then fades. Never loops.
```

The "bubble pop" = on activate, the element scales up a hair (overshoot) while the sheen crosses and a 1px edge highlight brightens momentarily, then everything settles. Subtle — "đi rất nhẹ".

## 5. Dark mode (the explicit fix)

- Use the dark token set in §2: black base, neutral elevated surfaces (base darker, raised lighter, per Apple HIG Dark Mode), no green tint. Mint is the single accent.
- Glass follows the iOS 27 dark look: a lighter neutral fill, a thin darkened rim and a brighter but soft top specular line. A full-white line still glows harshly on dark, so the standard material keeps a gray 0.14 edge.
- Light-mode decoration (white card skins, mint auras, the multi-wash canvas) is not drawn in dark; the dark canvas is flat black with at most one faint mint wash.
- Appearance defaults to "Theo hệ thống" (follow the phone), with Light/Dark as manual overrides.
- Both modes must keep text contrast ≥ WCAG (4.5:1 body, 3:1 large/UI).

## 6. Guardrails (RULES preserved — do not break)

Forbidden (signature is the gate AGAINST AI-slop, not a license): animate blur radius, decorative infinite loops, glass-on-glass stacking, large parallax, spinning, combining scale+rotation+blur+shadow+opacity on one element, glass on every row/cell/form/chat bubble. Glass stays an **accent** (tab bar, top controls, search, one hero/summary card, primary CTA, modal/sheet). Money/booking/scope screens stay **calm, static, explicit** — signature yields to trust there.

Reduce Motion → remove overshoot/sheen/parallax (fall back to short fade). Reduce Transparency → glass becomes opaque neutral/tinted (existing behavior). 60fps minimum; no real-time blur in long lists.

## 7. Recipe checklist (when a surface uses glass)

Once `material-direction.md` has chosen glass for a surface, the recipe holds when:

```text
[ ] Neutral surfaces + at most ONE mint accent moment.
[ ] Glass only on accent surfaces (≤ 2–3 layers); background under glass is a calm wash.
[ ] 1px mode-aware inner border highlight in the fallback path (gray in dark, not white); the native GlassView keeps its own.
[ ] Corners rounded + continuous curve.
[ ] Signature motion uses spring (slight overshoot), not linear timing; entrance ≤ ~300ms feel.
[ ] Specular sheen, if used, plays once on appear/activate; nothing loops.
[ ] Dark mode uses dark tokens; highlights soft; contrast passes.
[ ] Reduce Motion / Reduce Transparency fallbacks correct.
[ ] Money-impacting UI stays calm + explicit (signature restrained).
[ ] No forbidden AI default (gradient orbs, bento, card spam, fake data).
```

These are recipe-conformance checks, not an aesthetic score. Visual quality is confirmed by human sign-off on device.

## 8. Where the signature lives

Typical glass carriers (chosen by `design/material-direction.md`, never automatic): the floating glass dock + liquid pill (Kael center action), the primary CTA, at most one hero/summary card per screen, modal/bottom-sheet shells. Everything else stays quiet neutral so these pop.

Canonical motion timing: `design/motion.md`. General motion discipline + anti-slop: `kael-motion`. Material decision: `design/material-direction.md`. Brand identity context: `design.md` §1. This file = the glass recipe.

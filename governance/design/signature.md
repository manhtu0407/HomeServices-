# Design Reference — Glass-Liquid Signature (the final frontend gate)

> Part of the `design.md` system (2026-05-29). `critical.md` is highest authority; `RULES.md` glass/motion rules and `design/motion.md` timing are not overridden here — this file makes them **specific and brand-locked**. The `glass-liquid-signature` skill points here as its single source.

## 0. Role

This is the **final house-style gate**: the recipe that makes a screen unmistakably NestScout in 0.5s, and the audit that decides "does this screen carry the signature (≥9/10)?". It is the **opposite of `frontend-design`/`taste-skill` variance** — one consistent, classic, minimal system, every time.

Direction (locked by Tu 2026-05-29): **classic, minimal, OS-grade** (Apple Liquid Glass + Material expressive motion), **neutral base + ONE mint accent**, sections that pop without clutter or FOMO.

> Token values below are **proposed within Tu's chosen direction** and need Tu's visual sign-off on Expo/device. Do not claim "9/10 achieved" without his eyes.

## 1. The 7→9 gaps (diagnosed in current code, 2026-05-29)

1. **Motion is timing-based, not spring.** `motion-tokens.ts` entrance/press use `withTiming`; entrance is 440ms (sluggish). Only `sheet` has a spring. → move to spring with slight overshoot.
2. **No canonical dark tokens.** `constants/colors.ts` is light-only; dark colors are hard-coded per component. → define one dark token set.
3. **Edge highlight is pure-white + top-only**, used in dark too (`glass-surface.tsx` `edgeHighlight` rgba(255,255,255,0.42)). → mode-aware highlight (neutral-gray in dark).
4. **Too many colors** (priceCheck has ~18). → reduce to neutral + 1 mint accent.
5. Blur slightly heavy (nav 28 / sheet 30). → cap nav/sheet ≤ 26.

What is already good (keep): `expo-glass-effect` native Liquid Glass + blur/View fallbacks; `borderCurve: 'continuous'`; Reduce Motion / Reduce Transparency handling; the dock squash/stretch + sheen.

## 2. Palette — Neutral base + ONE mint accent (proposed)

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

Dark (neutral charcoal, faint green-neutral):
  bg              #0E1413
  surface         #161D1B
  text            #EAF1EF
  textSecondary   #9DB0AB
  line            rgba(255,255,255,0.08)
  glassTint       rgba(22,29,27,0.55)
  edgeHighlight   rgba(190,210,205,0.14)   (neutral-gray, NOT pure white)
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

## 4. Liquid motion = spring + "bubble pop" (the soul)

"Liquid đi qua rất nhẹ, nhô lên một xíu như bong bóng bể" = **spring with slight overshoot** + a **specular sheen sweep** that lifts then settles. Use Reanimated `withSpring` (not `withTiming`) for signature motion.

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

- Use the dark token set in §2 (neutral charcoal, neutral-gray edge highlight, lower opacity).
- Highlights must be **soft** — pure white glows harshly on dark. Mint accent stays the same hue but at slightly lower opacity.
- Sheen/specular must remain visible but gentle (dark sheen ~rgba(255,255,255,0.10), light ~0.5).
- Both modes must keep text contrast ≥ WCAG (4.5:1 body, 3:1 large/UI).

## 6. Guardrails (RULES preserved — do not break)

Forbidden (signature is the gate AGAINST AI-slop, not a license): animate blur radius, decorative infinite loops, glass-on-glass stacking, large parallax, spinning, combining scale+rotation+blur+shadow+opacity on one element, glass on every row/cell/form/chat bubble. Glass stays an **accent** (tab bar, top controls, search, one hero/summary card, primary CTA, modal/sheet). Money/booking/scope screens stay **calm, static, explicit** — signature yields to trust there.

Reduce Motion → remove overshoot/sheen/parallax (fall back to short fade). Reduce Transparency → glass becomes opaque neutral/tinted (existing behavior). 60fps minimum; no real-time blur in long lists.

## 7. Signature checklist (the ≥9/10 audit)

A screen carries the signature when ALL hold:

```text
[ ] Neutral surfaces + at most ONE mint accent moment.
[ ] Glass only on accent surfaces (≤ 2–3 layers); background under glass is a calm wash.
[ ] 1px mode-aware inner border highlight present (gray in dark, not white).
[ ] Corners rounded + continuous curve.
[ ] Signature motion uses spring (slight overshoot), not linear timing; entrance ≤ ~300ms feel.
[ ] One specular sheen on appear/activate; nothing loops.
[ ] Dark mode uses dark tokens; highlights soft; contrast passes.
[ ] Reduce Motion / Reduce Transparency fallbacks correct.
[ ] Money-impacting UI stays calm + explicit (signature restrained).
[ ] No forbidden AI default (gradient orbs, bento, card spam, fake data).
```

If any fails, it is not yet signature-grade.

## 8. Where the signature lives

Primary signature carriers: the floating glass dock + liquid pill (Kael center action), the primary CTA, the one hero/summary card per screen, modal/bottom-sheet shells. Everything else stays quiet neutral so these pop.

Canonical motion timing: `design/motion.md`. General motion discipline + anti-slop: `kael-motion`. Brand identity context: `design.md` §1. This file = the specific signature recipe.

---
name: glass-liquid-signature
description: Apply or audit the Home Services glass-liquid visual signature (the final, brand-locked house style) for the Expo React Native app. Use when building or reviewing signature surfaces — the floating glass dock + liquid pill, primary CTA, hero/summary card, modal/bottom sheets — or when the user mentions the "signature", glass material, liquid/bubble motion, dark mode polish, or "make it classic / 9 out of 10". Neutral base + ONE mint accent, spring overshoot + specular sheen, mode-aware edge highlight; the opposite of design variance.
---

# glass-liquid-signature

The final house-style gate. Canonical spec: `governance/design/signature.md` (palette tokens, material recipe, spring/bubble motion, dark tokens, guardrails, the ≥9/10 checklist). Builds on `kael-motion` + `governance/design/motion.md` (timing) and stays inside `governance/RULES.md` glass/motion rules. Do not duplicate the spec here. `governance/critical.md` remains highest authority.

Brand-locked: ONE consistent classic/minimal system — never "variance". Token values in the spec are proposed pending Tu's visual sign-off on Expo; never claim "9/10" without his eyes.

## Mode: apply
1. Read `governance/design.md` core (identity + mandatory preflight) and `governance/design/signature.md`.
2. Neutral surfaces + at most ONE mint accent per region. Glass only on accent surfaces (≤ 2–3 layers); design the calm wash under the glass.
3. Material: 1px mode-aware inner border highlight (neutral-gray in dark, not white), continuous rounded corners, localized blur per spec §3.
4. Motion: spring with slight overshoot (not linear `withTiming`) + one specular sheen on appear/activate; nothing loops. Use the spring tokens in spec §4.
5. Dark mode: use the dark token set; soft highlights; contrast ≥ WCAG.
6. Reduce Motion / Reduce Transparency fallbacks; 60fps; no real-time blur in long lists.
7. Money / booking / scope screens stay calm + explicit — the signature yields to trust there.

## Mode: audit
Run the §7 checklist from `governance/design/signature.md`. Score /10. Report each failing item with the concrete fix. Signature-grade surfaces ship only at ≥9/10; flag anything still "basic": linear timing instead of spring, white highlight in dark mode, mint used everywhere, missing edge light, muddy background under glass.

## Output
```text
Mode: apply | audit
Surface:
Neutral + single mint accent?:
Glass material (edge highlight / blur / corners):
Motion (spring overshoot + sheen, no loop):
Dark mode (dark tokens, soft highlight, contrast):
Reduce Motion/Transparency + 60fps:
Signature score /10 + fixes:
```

Single source: `governance/design/signature.md`. Pair with `kael-ui-rn-execution` (governance/protocols/ui.md) and `kael-motion`.

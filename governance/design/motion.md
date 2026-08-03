# Design Reference — Motion Grammar

> Extracted from `design.md` for progressive disclosure (2026-05-29). `design.md` core keeps the authority order, identity, goal, preflight, skill-adaptation, scoring rubric, RN rules, forbidden defaults, and review checklist. Load this file only when the task needs it (see design.md → Design Reference Files). `critical.md` remains highest execution authority.

Canonical motion source for NestScout UI. The kael-motion skill points here. Pair with AGENTS.md Motion Rules + Performance Budget and Reduce Motion / Reduce Transparency. Numeric values live in exactly one place — `apps/mobile/components/ui/motion-tokens.ts`; this file is the meaning behind those numbers. If a duration here and a token there disagree, the token wins and this prose must be corrected.

## 13. Motion Grammar

Motion is required only at key product moments. Less motion, higher quality. Zero motion is a valid choice when a screen already reads clearly without it.

Required motion areas:

- splash / loading,
- skeleton loading,
- bottom tab / Kael mascot,
- primary CTA,
- modal / bottom sheet,
- screen transitions for major flows,
- selected service / selected chip,
- job state transition when useful.

Forbidden motion:

- noisy auto-loop on normal screens,
- decorative motion that does not communicate state,
- hover-only web motion,
- heavy parallax,
- slow transitions that block workflow,
- unrelated effects per component.

### Two mechanisms, one vocabulary

The app moves in two complementary ways, both named by the same semantic tokens in `motion-tokens.ts`:

- **Timing** (`withTiming`, reads `*.durationMs`) — functional fades, reveals, and state changes.
- **Spring** (`withSpring`, reads `*.spring` and the `liquid.*` configs) — the liquid-glass signature settle and overshoot: floating dock, liquid pill, press bubble, and the y-offset settle on enter. The brand intent for the springs lives in `signature.md`; the numeric configs live in `motion-tokens.ts`.

A single moment can use both — an element fades in over its `durationMs` while a spring settles its `translateY`. Signature surfaces lead with the spring; quiet surfaces use timing only.

Semantic tokens (name → when → value in `motion-tokens.ts`):

```text
feedback     press / tap acknowledgement   scale 0.985, 140ms
selection    selected chip / service       200ms (or a liquid spring on signature surfaces)
route        screen / element enter        220ms fade + translateY 16, spring { damping 18, stiffness 160 }
sheet        bottom sheet / modal shell    300ms + spring { damping 18, stiffness 160 }
stateChange  job / status transition       240ms
loading      skeleton shimmer              1400ms loop, low contrast
```

Recommended timing ranges (keep token values inside these; never exceed the high end for a transition that blocks the flow):

```text
Screen / route enter: 180-260ms, opacity 0 -> 1, small translateY -> 0 (a spring settles the offset)
Tab switch / selection: 160-240ms, active glow / lift / scale only
Press feedback: scale 0.97-0.99, return within 120-180ms
Bottom sheet: 220-320ms, slide up + scrim 0 -> 0.40/0.45
Modal: 180-260ms, scale 0.97 -> 1 + opacity
Skeleton shimmer: 1200-1600ms loop, low contrast
Mascot reaction: 180-300ms, small lift / breathe, no noisy loop
CTA success / state change: 180-260ms, soft fill or check transition
```

There is no global "entrance" duration. Route enter is 180-260ms (token `route`, 220ms); the earlier 440ms entrance read as sluggish and has been removed. Signature overshoot comes from the spring, not a longer fade.

### Reduce Motion

`motionDuration(baseMs, reduceMotion)` clamps every timing to `reducedMotionCapMs` (160ms) when the OS Reduce Motion setting is on. Under Reduce Motion, drop spring overshoot, sheen, parallax, and depth motion — fall back to a short fade or an instant state. Reduce Transparency switches glass to opaque / tinted surfaces (see `signature.md`).

Motion acceptance:

- feels subtle but expensive,
- reinforces hierarchy,
- matches palette and material,
- gives feedback after user action,
- never hides latency dishonestly,
- works on low-end devices (60fps; no real-time blur in long lists).

## 13A. Lottie Onboarding Motion Contract

Source extraction: [`diffusionstudio/lottie`](https://github.com/diffusionstudio/lottie), read 2026-06-12 at commit `3360f2e78be9a2cab81bfafabf9e6cca2c9ce2c1`. Treat it as a Lottie authoring and verification harness, not as a production dependency or visual style to copy.

Use Lottie only when it makes the onboarding section easier to understand or trust. It is appropriate for:

- role-first onboarding,
- Kael price-check explanation,
- apartment context / media evidence explanation,
- worker matching and safety trail explanation,
- splash or loading moments that communicate real state.

Do not use Lottie for decorative looping motion, repeated list cells, chat bubbles, money-impacting confirmation content, or any state where native text and static layout would be clearer.

### Production Fit

NestScout Lottie work must follow the existing Expo React Native runtime. The `diffusionstudio/lottie` Vite/CanvasKit player is allowed as an authoring and QA harness only. Do not import that web player, Tailwind stack, CanvasKit web runtime, or `lottie-web` into the mobile product unless Tu explicitly approves a separate implementation task.

Preferred production renderers:

- `lottie-react-native` for simple bundled JSON playback when the file is static and device-tested,
- React Native Skia / Skottie only when the animation needs runtime composition and the app already has a justified Skia dependency path,
- static PNG/SVG keyframe fallback when Reduce Motion, platform support, size, or native performance makes playback risky.

### Prompt And Asset Grounding

When asking an agent to generate a Lottie animation, ground the prompt in concrete NestScout assets instead of generic text:

- approved Kael mascot assets or poses,
- actual six-service scope: electrical repair, plumbing repair, home cleaning, HVAC/indoor air, upholstery care, and minor repair/installation,
- real UI screenshots or frame sketches from the target onboarding screen,
- current glass-liquid palette tokens and one mint accent,
- exact composition size, duration, FPS, background treatment, and start/mid/end states.

Prompt with motion language: ease-in, ease-out, ease-in-out, hold, overshoot, anticipation, reveal, settle, opacity, y-offset, group transform. Translate "camera" language into restrained group transforms: small push, pan, or zoom only; no large parallax or cinematic swoops.

### Onboarding Choreography

Each onboarding panel gets one clear motion idea. The animation should explain a product truth, not show off:

- Kael listens -> evidence enters -> structured estimate appears,
- apartment context anchors the request -> only coarse trust-safe context is shown,
- worker matching starts after the customer confirms the validated Kael offer -> no fake worker or fake queue,
- evidence trail protects scope, completion, and support.

Recommended defaults:

- 30 FPS for mobile onboarding; 60 FPS only for a single premium hero after device proof,
- 900-1600ms for a one-shot panel animation,
- 180-300ms for small mascot or CTA reaction,
- `loop={false}` by default,
- loop only for real loading/status and only with low-contrast motion,
- transparent or neutral background unless a slotted background is needed for authoring.

### Lottie File Quality

Generated Lottie JSON must be treated like source code. Before it can enter production assets:

- top-level shape includes `v`, `fr`, `ip`, `op`, `w`, `h`, `assets`, and `layers`,
- composition dimensions match the target surface and do not rely on layout stretching,
- shape primitives, fills, and strokes are wrapped in groups with transforms so Skottie-compatible previews do not render blank,
- colors use normalized RGBA values and are mapped to NestScout neutral plus one mint accent,
- layer `op` values cover the animated frames,
- keyframe scalar values are arrays where Bodymovin expects arrays,
- intended loops end where they started; non-loop onboarding should settle into a useful final frame,
- raster assets are avoided unless they are approved brand assets and bundled intentionally,
- embedded visible text is avoided; use native localized RN text for VI/EN copy.

### Controls And Iteration

During authoring, expose controls for the values Tu or a designer is likely to tune:

- background color,
- mint accent color,
- stroke width or icon weight,
- mascot scale or position,
- animation density/speed when safe.

Use a sidecar controls file in the authoring harness when helpful. Production exports should lock final values unless runtime theming is explicitly needed and tested.

### Verification Gate

A Lottie asset is not accepted because the JSON parses. It must be visually verified:

- preview in the official `diffusionstudio/lottie` harness or an equivalent Skottie-capable viewer,
- inspect exact key frames with pinned playback such as `?frame=0&paused=1`, middle frame, and final frame,
- confirm the canvas is nonblank and the composition is framed correctly,
- validate file size and native playback on iOS and Android through Expo/device,
- test light/dark where the asset appears,
- test Reduce Motion: replace with static final keyframe or short fade,
- test Reduce Transparency: keep text and surfaces readable without relying on glass,
- confirm no fake price, fake worker, fake rating, fake queue, fake address, unsupported service, or mixed-language copy appears inside the animation.

If these checks cannot run, report the limitation and keep the asset out of production onboarding until device validation is possible.

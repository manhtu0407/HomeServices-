# Auth Liquid-Signature — Production Design Contract (2026-06-04)

> Status: ACCEPTED direction. Tu locked **Option B "Liquid Signature"** on 2026-06-04 after a plan-first Design Lab.
> Build owner: Claude. Verify owner: Tu (device) + gates. Surfaces: **Splash → Role Gate → Login Gate**.
> This contract is the handoff from taste exploration to implementation. Production code follows THIS file, not lab prose.
> `critical.md` is highest authority; `design.md` + `design/signature.md` + `design/motion.md` are LOCKED and not overridden here — this file specializes them for the auth stack under Tu's approved exception.

## 0. Authority & scope decisions (locked by Tu, 2026-06-04)

- **D1 — "Orio" = Oreo.** A black/white neutral system (crisp white + deep ink/charcoal), **not orange**. The "ấn tượng mạnh" comes from high-contrast neutral + the single mint accent, not a second hue. This *resolves* the palette-typography ban on orange-as-primary — there is no orange.
- **D2 — Scoped exception.** Only Login + Role gate carry a stronger signature moment: **mint (single accent) + Oreo high-contrast neutral**. The rest of the app keeps `signature.md` "neutral + ONE mint accent" unchanged.
- **D3 — Onboarding = branded splash.** Logo + light Liquid motion → auto-advance to the login gate. NOT a multi-screen onboarding flow. It lives in `app/index.tsx` (the "splash redirect" the wiring test already names) + a new `components/auth/brand-splash.tsx`. **No `app/(auth)/onboard.tsx`** (forbidden-regression guard, `mobile-wiring.test.ts:23`).
- **D4 — Plan-first.** This contract precedes build.

## 1. Workflow mapping

Pre-A0 brand splash → role entry (role-first) → A0 auth/profile (`STRUCTURES.md` §6 A0, §7 B0). **Money-impacting: none** → the signature may be expressive here (signature yields to calm only on money/booking/scope screens).

## 2. Color system — "Oreo + Mint" (auth tokens, light + dark)

Single source: new `components/auth/auth-theme.ts` (mode-aware), derived from `signature.md` §2. **Replaces** the current local light-only `authTokens` and removes the mint/cyan/cream/copper zoo from these surfaces.

```
Light (Oreo neutral)            Dark (Oreo neutral)
  surface       #FFFFFF           surface       #161D1B
  canvas        #F6F7F7           bg            #0E1413
  ink (text)    #0E1413           text          #EAF1EF
  textSecondary #5C6B68           textSecondary #9DB0AB
  line          #E4E8E7           line          rgba(255,255,255,0.08)
  glassTint     rgba(255,255,255,0.62)   glassTint  rgba(22,29,27,0.55)
  edgeHighlight rgba(255,255,255,0.30)   edgeHighlight rgba(190,210,205,0.14)  ← gray, NOT white

Accent (the ONLY hue, both modes): mint #17A995 · mintDeep #00756A   (dark: mint same hue, slightly lower opacity)
```

Rules: **max one mint moment per region** (active role preview · primary CTA fill · signature rail). Everything else is neutral Oreo. **No cyan/cream/copper** on these two gates. No purple/blue AI gradients (RULES). The deep-ink frame/hairline is the "sharpness frame".

## 3. Material — real Liquid Glass (not faux CSS)

- Use the real `GlassSurface` (`components/ui/glass-surface.tsx` → `GlassView`→`BlurView`→`View`) for the signature carriers: **splash brand chip · role-gate hero ribbon · the 2 role cards · primary CTA · worker verification hero**. `variant: 'hero' | 'control'`; `material: 'liquid'` on signature carriers.
- **Remove** the faux `glassSurface()` local helper + inline `boxShadow` / `experimental_backgroundImage` / rgba mint fills from signature surfaces. Repeated form fields stay **opaque/tinted** (not glass).
- 1px **mode-aware** edge highlight (gray in dark, not white) — provided by `GlassSurface`. `borderCurve: 'continuous'`, rounded. **≤3 glass layers** per screen.
- Apple iOS 26 parity (verified via `expo-glass-effect` = Apple `GlassView`): `glassEffectStyle: 'regular'` for hero/cards/CTA, `'clear'` only for ultra-subtle; `tintColor` = mint only on the one accent; **glass cannot sample glass** → no glass-on-glass stacking.

## 4. Motion — spring + one sheen (`design/motion.md` + `kael-motion`)

- Use `motionTokens.liquid` (already equals signature §4): `entrance {stiffness 170, damping 16}` (opacity 0→1, translateY 12→0, scale 0.98→1); `press {320, 22}` scale→0.97; `pill {200, 14}` for bubble settle.
- **Replace** the surface's inline `withTiming` entrance/press with these springs. Keep press scale 0.97–0.99.
- **ONE** specular sheen sweep on appear / role-select (220–300ms), **never loops**. Retune the existing signature sheen to spring.
- **Splash:** logo lens/sheen reveal (scale 0.96→1 + one sheen cross) → settle → cross-fade/morph into the role gate. Min display ≈1200–1500ms so it's seen; then advance.
- **Role-select preview:** mint accent + slight bubble overshoot on the chosen card.
- **Reduce Motion:** remove overshoot/sheen/idle-liquid → short fade ≤ `reducedDurationMs`. **Reduce Transparency:** `GlassSurface` → opaque neutral.

## 5. Layout anatomy

- **Splash:** centered Home Services / Kael logo on neutral canvas, one glass brand chip, light motion, **no marketing text**.
- **Role Gate:** top row (title "Chọn vai trò" + Kael head) → hero ribbon (badge "Home Services", VI tagline, signature line on a mint rail) → 2 role cards (Khách = primary, Thợ = secondary) each icon + description + meta pills + arrow.
- **Login Gate (per role):** back row · role-lock hero · glass form. Customer = Google **primary** + phone + email fallback. Worker = email/password + create-profile + verification preview (**no Google**). Customer onboarding panel (name/phone/address) preserved.

## 6. Copy (VI-first; fixes RULES #5)

- **FIX:** VI `titleLogin` currently renders the English `'Home help, matched right!'` in Vietnamese mode (RULES #5 / forbidden default). → set VI `titleLogin` to a Vietnamese tagline (proposed: **"Việc nhà cần, đúng người lo."**, pending Tu's word choice); **keep** EN `titleLogin: 'Home help, matched right!'`. The guard `toContain('Home help, matched right!')` stays green via the EN block.
- **Preserve locked copy:** signature `Đúng người, đúng việc, đúng lúc nhà cần.`, role-first, worker-no-google, `AUTH_PROTOTYPE_PARITY_MARKER`.

## 7. States (every surface)

- Splash: bootstrap → redirect; never blocks > ~1.6s; honest (no fake progress).
- Login: submit loading/disabled, VI error text, `config_missing` handled, `profile-recovery` + `customer-onboarding` flows preserved. No fake success (RULES #8).

## 8. Accessibility / touch

≥44px targets · icon-only controls labelled · Reduce Motion + Reduce Transparency paths · contrast ≥ WCAG (4.5 body / 3 large) both modes · VN diacritics intact.

## 9. Backend / state dependency

Frontend-only auth UI on the existing `useAuth` (`signInWithPassword`, `signInWithGoogle`, `updateCustomerProfile`, `refreshProfile`, `signOut`). No new backend, no secrets in bundle, no AI/Supabase mutation added.

## 10. Files

- NEW `components/auth/auth-theme.ts` — Oreo+mint light/dark token source for auth.
- NEW `components/auth/brand-splash.tsx` — branded splash component (logo + Liquid motion + `onDone`).
- EDIT `app/index.tsx` — render `BrandSplash` during bootstrap, then redirect (preserve guarded strings: `useAuth`, `loading`, `Redirect`, `ActivityIndicator`, `/(auth)/login`, `/(worker)/home`, `/(customer)/home`, `role === 'admin'`).
- EDIT `components/auth/auth-surfaces.tsx` — swap token source + faux glass → `GlassSurface`; `withTiming` → `motionTokens.liquid`; add dark mode; fix VI `titleLogin`. Preserve ALL behavioral testIDs/markers/locked copy.

## 11. Test-guard migration (REQUIRED before "done")

`packages/shared/src/__tests__/mobile-wiring.test.ts` (auth block ~2264–2427) currently pins the OLD faux-glass strings. The rebuild MUST migrate it:

- **REMOVE/REPLACE** (faux glass): `rgba(181,255,239,0.42)` (2326), `linear-gradient(112deg` (2327), `roleGatewayHeroTint` (2325), `roleGateShellPrototype` (2323) → new `GlassSurface`/Oreo markers.
- **KEEP** (behavior/identity): role-first, worker-no-google (2414), `auth-login-*` testIDs, admin audit (2419–2423), onboarding-absence (2284–2287), signature line (2318), `AUTH_PROTOTYPE_PARITY_MARKER` (2316), `'Home help, matched right!'` (2317, via EN).
- Re-check the auth accessibility/motion asserts + `pressed: { opacity: 0.78 }` (3018) and the 3018–3020 transform guard.
- Every changed assertion is intentional: the guard now encodes the Liquid-Signature contract, not prototype parity.

## 12. Verification plan

- `pnpm --filter @home-services/mobile type-check` + `test` (jest-expo/RNTL). **Blocker:** Node + mobile deps are not present in the current agent env; gates run on Tu's machine or after Node/`pnpm install` is provisioned.
- Device/preview: light/dark + Reduce Motion + Reduce Transparency captures of splash + role gate + customer login + worker login.
- Signature ≥9/10 checklist (`signature.md` §7).
- `git diff --check`.

## 13. Forbidden regressions

No `(auth)/onboard.tsx`; no `auth-surfaces-v2`; no `.tmp/design-lab` imports; no faux glass on signature surfaces; no mint-wash; no English in VI mode; no fake data; preserve all behavioral testIDs + locked copy; dock/tab nav stays replace-safe.

## 14. Scores (Design Lab, for the record)

Option B "Liquid Signature": Color 9 · Typography 9 · Layout 9 · Decoration restraint 9 · Motion 9 · HS identity 9 · XanhSM-without-copy 9 · RN feasibility 9 · Workflow correctness 10 — passes all `design.md` §8 gates. (A Safe under-delivers motion; C Bold fails motion/decoration/RN gates.)

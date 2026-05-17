# Worker Production UI Contract

Screen: Worker section plus Auth Login role gate.

Workflow mapping: A0 role entry; B1/B2/B3/B6 worker readiness, incoming job decision, Kael relay, earnings, and profile trust.

Accepted option: XanhSM/client-V4-aligned Worker production surface, using the accepted Worker visual prototype as the source of taste but not as a runtime dependency.

User emotion: calm, focused, professional, ready to decide quickly.

Primary action: choose Khach or Tho on login, go online, accept/skip an incoming request, inspect work, message through Kael relay.

Layout anatomy:

- Login is a single glass role gate with two role cards: Khach and Tho.
- No Onboarding route or launch sequence ships in the production mobile app.
- Worker shell uses the same mint/cream/cyan material language as customer V4.
- Home starts with a XanhSM-like provider-ready map stage, then service cards and availability/status.
- Jobs uses segmented filters, quiet job cards, safe address gates, and quick accept/skip affordances.
- Chat starts empty and only shows local messages after user interaction.
- Earnings shows pending/estimated rows only, without fake paid success.
- Profile uses an identity/trust card, skill chips, settings groups, and theme/language toggles.

Component list:

- `LoginRoleSurface`
- `WorkerHomeSurface`
- `WorkerJobsSurface`
- `WorkerChatSurface`
- `WorkerEarningsSurface`
- `WorkerProfileSurface`
- `WorkerDockOverlay`

Production markers:

- `AUTH_LOGIN_ROLE_GATE`
- `AUTH_LOGIN_ROLE_GATE_GLASS`
- `WORKER_XANHSM_REFERENCE_AUDIT`
- `WORKER_PRODUCTION_CONTRACT`
- `WORKER_CLIENT_BASELINE_AUDIT`
- `WORKER_THEME_LANGUAGE_STORE`
- `WORKER_FLEXIBLE_MAP_SHELL`
- `WORKER_DOCK_GLASS_MOTION`
- `WORKER_GLASSMORPHISM_MOTION_LAYER`
- `WORKER_CHATBOX_EMPTY_COMPOSER`
- `WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT`
- `WORKER_NO_FAKE_PAYMENT_DATA`

Color rules:

- Mint is the leading state/action color.
- Cyan provides map depth and premium glow, not a full-screen blue theme.
- Cream adds warmth for supporting cards and earnings/trust modules.
- Urgent countdown states use restrained copper before true error states.

Typography rules:

- Vietnamese-first copy.
- Rounded/premium rhythm with readable 500/600/700 weights.
- No 800/900 weight in dense Worker UI.
- Use centered, tabular number rhythm for metrics, money, and countdowns.

Decoration rules:

- Use Kael only as brief/support identity.
- Use service-specific line icons and map material layers.
- No random gradient orbs, transport imagery, promo banners, or dashboard card spam.

Motion rules:

- Glass motion is subtle and distributed per Worker section.
- Dock liquid/glass motion responds to active tab changes.
- Press feedback is quick and does not shift layout.
- Ambient motion must stay low contrast and not block reading.

Loading/empty/error/success states:

- Chat begins with an honest empty state and local composer.
- Jobs/earnings can show local waiting/estimated states only.
- No fake successful payment, completed payout, or backend persistence claim.
- Errors must be Vietnamese and non-technical when implemented.

Accessibility/touch rules:

- Primary touch targets are at least 44 px.
- Icon-only controls need accessibility labels.
- Text must fit small mobile widths with `numberOfLines` where needed.
- Bottom dock clearance must be preserved on short screens.

Backend/state dependency:

- Frontend-only local UI for this slice.
- No Supabase mutation, no fetch, no `callAI`, and no provider key references in mobile surfaces.

Forbidden regressions:

- Do not restore `apps/mobile/app/(auth)/onboard.tsx`.
- Do not import `auth-surfaces-v2` or `worker-surfaces-v3`.
- Do not depend on `.tmp/design-lab` files from production routes/components.
- Do not reveal full address, unit, phone, or exact customer identity before accept.
- Do not fabricate paid transactions or completed payouts.
- Do not expand services beyond electrical and plumbing.

Verification plan:

- Static mobile wiring tests for production imports, markers, and negative guards.
- Mobile type-check.
- Static sweeps for onboarding/prototype/lab references in runtime app files.
- Static sweeps for backend, Supabase, AI provider, and mutation leakage.
- Web preview smoke for Login and Worker routes when the local Expo server is available.

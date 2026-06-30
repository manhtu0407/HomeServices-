# NestScout / Kael Rebuild Guide - Preserve Logic, Assets, And Progress (2026-06-13)

> Purpose: the NestScout UI rebuild (Codex, UI-only, preserve logic/nav) must NOT
> drop three transaction-critical surfaces that already exist in code/backend but
> are absent from the design board. These are **regression risks**, not new
> features. Source: MAP PLAN Phase 4 (Notes.md) + cross-side handshake audit.
> `design.md` is locked; this doc is the rebuild guide, not a design-system edit.

This file also absorbs the former root rebuild docs (`REBUILD_PLAN.md` and
`SCOREBOARD.md`) so rebuild context stays under the existing design docs topic
instead of living as loose repository-root notes.

Scope rule: render from server truth, never fabricate, never infer a
money/privacy transition on the client.

---

## Rebuild Operating Brief

Status: Phase 1 approved by Tu on 2026-06-11. UI rebuild may proceed in screen
checkpoints, with commit-per-screen checkpoints approved only after verification.
Never push or open a PR unless Tu asks.

Mission boundary: rebuild the Expo React Native frontend UI/UX to match the
NestScout / Kael handoff while preserving existing product logic, state
management, navigation behavior, data fetching, API integrations, and side
effects. If a visual requirement appears to need new business logic, API,
workflow, state-machine, role, auth, pricing, matching, AI, Supabase, or payment
behavior, first audit the repo and handoff again; connect existing
implementation correctly instead of inventing mock behavior.

Authority still applies:

- `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, and `AGENTS.md`
  govern execution, runtime, product scope, UI safety, and verification.
- The handoff zip governs target visuals. Its `design/theme.ts` and
  `design/tokens.json` are the rebuild token source, with `primary = #0DAE9A`.
- Do not use old PDF color chips as implementation values.
- The store-bound runtime remains Expo React Native -> Supabase Auth ->
  Supabase Edge Function `mobile-api` -> Supabase DB/RPC/Storage/Realtime ->
  server-side providers.

Source evidence from Phase 0:

- Zip source: `C:\Users\Phan Manh Tu\Downloads\nestscout-codex-handoff.zip`.
- Read first from zip: `CODEX_REBUILD_PROMPT.md`.
- Read-only extraction for image inspection: `%TEMP%\nestscout-codex-handoff`.
- Text files read: zip `AGENTS.md`, `design/README.md`,
  `design/design-system.md`, `design/theme.ts`, `design/tokens.json`.
- Visual files inspected: `design/flows/01_main_flows.png`,
  `design/flows/02_agentic_center.png`, `design/flows/03_profiles.png`,
  `design/pages/01_overview_flow@2x.png`,
  `design/pages/02_mascot_motion@2x.png`,
  `design/pages/03_typography@2x.png`,
  `design/pages/04_icon_system@2x.png`,
  `design/pages/05_component_system@2x.png`,
  `design/pages/06_logo_color@2x.png`,
  `design/pages/07_profile_screens@2x.png`.

Tu decisions after Phase 0:

- Visible brand changes from Home Services to NestScout throughout the rebuild.
- Bottom dock keeps four main functions plus one Kael Orb.
- Kael Orb opens the Agentic Center; existing Kael chat stays connected from
  that center where appropriate.
- All UI must connect to real existing backend/system data and components.
- No fake stats, fake workers, fake prices, fake queue counts, or mock profile
  metrics.
- Profile metrics render from real data only; missing data uses honest
  empty/loading/error states.
- Worker offers and quote screens use Kael/system-computed quote data, not
  worker-entered pricing.
- Do not pause between phases unless blocked by a real conflict or missing
  source; if any icon, image, component, color, or pattern looks unusual, audit
  the zip again before building.

Current mobile route ownership:

| Area | Route | Current UI owner | Rebuild note |
|---|---|---|---|
| Auth | `apps/mobile/app/(auth)/login.tsx` | `LoginRoleSurface` / entry access surfaces | Role gate and login/register/onboarding-like auth UI. |
| Auth OTP placeholder | `apps/mobile/app/(auth)/verify-otp.tsx` | Redirect to login | Keep honest unless auth scope changes. |
| Customer home | `apps/mobile/app/(customer)/home.tsx` | `CustomerHomeSurface` | A1/customer home owner. |
| Customer booking | `apps/mobile/app/(customer)/booking.tsx` | `CustomerBookingEntrySurface` + `BookingWizard` | A2-A6 intake/media/estimate entry owner. |
| Customer Kael | `apps/mobile/app/(customer)/kael.tsx` | Agentic Center / `KaelChatSurface` connection | Kael Orb entry. |
| Customer Kael stack | `apps/mobile/app/(customer)/kael-chat.tsx` | `KaelChatSurface` | Hidden tab route, full-screen chat. |
| Customer history/activity | `apps/mobile/app/(customer)/history.tsx` | `CustomerHistorySurface` | A7-A14 active case/history surfaces. |
| Customer profile | `apps/mobile/app/(customer)/profile.tsx` | `CustomerProfileSurface` | Existing profile/account owner. |
| Worker home | `apps/mobile/app/(worker)/home.tsx` | `WorkerHomeSurface` | B2 worker readiness/home owner. |
| Worker jobs | `apps/mobile/app/(worker)/jobs.tsx` | `WorkerJobsSurface` | B3-B7 jobs, requests, scope/evidence owner. |
| Worker chat | `apps/mobile/app/(worker)/chat.tsx` | `WorkerChatSurface` | Worker Kael advisory/job room owner. |
| Worker earnings | `apps/mobile/app/(worker)/earnings.tsx` | `WorkerEarningsSurface` | B8 earnings owner. |
| Worker profile | `apps/mobile/app/(worker)/profile.tsx` | `WorkerProfileSurface` | Verification/profile owner. |
| Admin | `apps/mobile/app/(admin)/dashboard.tsx` | Admin dashboard route | Not in rebuild phases unless Tu expands scope. |

Navigation contracts to preserve:

- Customer route contract has 5 `Tabs.Screen` entries plus hidden `kael-chat`.
- Customer visual dock uses Home / Booking / Activity / Profile plus separated
  Kael action.
- Worker route contract has 5 `Tabs.Screen` entries.
- Worker visual dock uses Home / Jobs / Earnings / Profile plus separated
  Chat/Kael action.
- Dock tab switching uses `replace(...)`; do not change it to `push(...)`.

State/API owners not to change for a UI-only rebuild:

- `apps/mobile/lib/frontend-workflow-provider.tsx`
- `apps/mobile/lib/services.ts`
- `apps/mobile/lib/api.ts`
- `apps/mobile/lib/auth-provider.tsx`
- `apps/mobile/lib/use-job-chat-thread.ts`
- `apps/mobile/lib/use-service-workflow.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/mobile-workflow.ts`
- `packages/shared/src/workflow/**`
- `supabase/**`
- `apps/api/**`

Token placement decision: keep runtime design tokens under
`apps/mobile/design/theme.ts` and `apps/mobile/design/tokens.json`, so
`@/design/theme` resolves inside the mobile app. Asset mapping and optional
exports now live in `governance/design/ASSET_MAP.md`.

## Rebuild Screen Inventory And Score Summary

Scoring gates from the handoff:

- Structure: 100% binary.
- Token compliance: 100% binary.
- Visual match: target >= 99%.

Current scoreboard status: Phase 1 foundation is implemented with the hidden
design gallery and Agentic Center route. Groups A-F have implementation evidence
from focused suites, type-check, and full mobile Jest where recorded. Native
screenshot comparison is still required before claiming visual-match completion.

| Group | Screens | Current status | Evidence status |
|---|---|---|---|
| A | Splash, Welcome, Login, Register, Onboarding | Implemented for available backend fields | Auth suite, provider tests, type-check, full mobile Jest recorded. Native screenshot still needed for Splash. |
| B | Customer Home, Search/Book, Media/Voice, Kael Live Performance Chat | Implemented for available backend fields | Focused Group B suites, type-check, full mobile Jest recorded; voice stays honest-unavailable while backend media is audio-ready. |
| C | Case Overview, Matching, Helper Options, Quote, Location, Live Alert, Acceptance, In Progress | Implemented for available backend fields | Focused History/Case tests, type-check, full mobile Jest recorded; no fake worker stats or ETA. |
| D | Worker Home, Jobs, Advisory Chat, Evidence Upload, Earnings, Rating, Safety, Scope, Summary/Report | Implemented for available backend fields | Focused worker suites, type-check, full mobile Jest recorded; worker price input remains absent. |
| E | Agentic Center Command Home, Active Case, Approval Queue, Memory/Preferences | Implemented for available backend fields | Agentic Center suite, Kael Orb dock test, type-check, full mobile Jest recorded. |
| F | Worker Profile, Level, Reputation, Customer Overview, Usage Ranking, Money Protection | Implemented for available backend fields | Worker/customer profile suites, type-check, full mobile Jest recorded; missing data stays waiting/empty. |

Known scoring risks:

- Visual-match scoring still needs native iOS/Android screenshots against the
  official boards.
- Prompt-level zero raw-token gate is not complete; a 2026-06-12 grep still
  found 1353 raw `#hex` / `rgba(...)` / `px` hits in production mobile
  app/components outside tests/prototypes, concentrated in worker, customer,
  booking, dock, and auth surfaces.
- Exact typography parity depends on missing official font binaries, although
  runtime typography now uses platform system APIs and high-traffic anchors use
  the handoff typography scale.
- Component System gallery has no native screenshot comparison yet.
- Optional standalone/animated Kael state assets can improve fidelity later;
  mascot-heavy screens currently use approved transparent board crops.
- Voice-note storage is backend-ready through `job-media` audio MIME support,
  but native recording remains unavailable until real recorder dependency,
  permissions, and device validation exist.
- Root Turbo `type-check` could not run in the recorded shell because Turbo
  could not find a package-manager binary; package-level mobile/API/shared
  checks were run directly instead.
- React Doctor still lacks a completed run on that host because the portable
  Node directory only exposed `node.exe`, not `npm.cmd` or `pnpm`.

---

## X-1 (HIGH) — Last-50m apartment access handshake

A privacy/safety handshake that is built end-to-end and live, but lives in
`job.address_access.release_stage` (NOT in the workflow phase-context), so a
naive screen-by-screen rebuild deletes it.

- **State source:** `job.address_access.release_stage` ∈
  `area_only → building_released → unit_released`. Render off this, do NOT infer
  from `status`.
- **Worker side** (`worker-surfaces.tsx`): lobby check-in (geofence, manual
  photo) → "căn hộ mở sau khi khách bấm Cho thợ lên" waiting state → building
  released display. Backend: `buildCheckInAccessState` (services.ts ~9060) →
  `building_released`.
- **Customer side** (`customer-surfaces.tsx`): CTA **"Cho thợ lên"**, shown when
  `worker_checked_in && !exact_unit_released` → `authorizeApartmentAccess()`
  (services.ts ~8957, hardened current-worker-only / active-only) →
  `unit_released`; notify worker "Khách đã cho phép lên".
- **Why it matters:** dropping this leaks the unit address without consent, or
  leaves the worker waiting in the lobby with no signal. Highest-stakes small
  detail in the flow.
- **X-2 (partial — built 2026-06-15):** the customer is now nudged the *moment*
  the worker checks in — `notifyCustomerWorkerCheckedIn` (services.ts ~7456) fires
  an in-app notification + push ('Bấm "Cho thợ lên"…') gated on the check-in
  release stage `checked_in_awaiting_customer_authorization` (services.ts ~3811),
  distinct from the generic "worker arrived" push. **Still UNBUILT:** a *timeout /
  escalation* if the customer never taps even after the nudge — under "Kael runs
  everything", Kael should re-nudge + escalate (no scheduler/cron path yet). The
  rebuild must keep firing this nudge from server truth, never infer it client-side.

## L-1 (HIGH) — Customer second-half lifecycle

The customer flow board stops at "2.12 Job in Progress". The backend HAS the
endpoints; the board is missing the screens. Job status machine requires
`confirmed_by_customer → payment_pending → paid → reviewed`.

Render these customer phases (they already have backend):
- **scope-change decision** (hard-stop): `POST /scope-changes/:id/decide`. Must be
  a real hard-stop — wait for `kael_decided_scope_change`, never bypass.
  (Reinforced by K-1: scope is ALWAYS customer-confirmed now.)
- **completion review / nghiệm thu**: `POST /jobs/:id/confirm-completion`.
- **payment**: `payment_pending → paid` is still a placeholder (no rails). UI must
  NOT claim "đã thanh toán"; show honest pending state.
- **review / đánh giá**: `POST /jobs/:id/review`.

Build these as variants of the phase-context case-surface
(`buildWorkflowPhaseContext().sections`), not 8 standalone static screens (U-2).

## H8 (HIGH) — Dispute screens

There is no job status `disputed`; dispute is a side-record. So the UI must read
the disputes table, not a job status, to show dispute state.

- Open/track dispute, both sides; counter-statement; admin-decided outcome.
- Backend: `open_dispute_atomic` / `submit_counter_statement_atomic` /
  `admin_decide_dispute_atomic`; evidence snapshot is immutable. Kael only writes
  a neutral summary — never decides. UI must reflect "admin decides", not Kael.
- `disputes` + `evidence_snapshots` are in the realtime publication, so dispute
  state can be live.

## U-3 (MEDIUM) — Bottom-nav must be decided per-role BEFORE the rebuild touches it

Three sources disagree on the tab bar: the design token `theme.ts`
(Trang chủ / Lịch sử / Tin nhắn / Hồ sơ + orb) ≠ the live app routes
(customer: home/booking/kael/history/profile; worker:
home/jobs/chat/earnings/profile) ≠ STRUCTURES A1/B2.

- **Why it matters:** the rebuild brief is UI-only and explicitly **must preserve
  navigation**. A single 4-tab bar cannot serve both the customer and worker
  roles, so a naive "build the design's nav" silently changes navigation — out of
  scope and a regression.
- **Rule:** lock the per-role tab set with Tu first; then reconcile the `theme.ts`
  token to the agreed routes. Do NOT collapse the two role navs into one, and do
  NOT add/remove tabs to match the board without sign-off.

---

## Data-honesty reminders for the rebuild (already enforced in code)

- **U-1 gamification:** worker level is derived from real `completedJobs`
  (`buildWorkerProfileLevelModel`), not fabricated; customer "Tín hiệu tin cậy"
  is empty-state. Do NOT re-introduce fake radar / "Bảo vệ đồng tiền NN/100" /
  30-day-income numbers with no backend source.
- **A-2 estimate card:** render `needs_inspection` ("Cần kiểm tra tại hiện
  trường") when Kael flags low-confidence (now surfaced on the estimate; see
  `customer-kael-chat-needs-inspection`).
- **U-2 phase-context:** the case-surface renders `phaseContext.sections` +
  `mode`; do not invent per-screen component order.
- **U-5 Agentic Center surfaces — backend EXISTS, rendering is a scope choice:**
  the three endpoints are built and tested (`GET /me/pending-decisions`,
  `GET /me/threads`, `PATCH /me/kael-memory` — router.ts:1406/1409/1430,
  services.ts:6399/6461/6514; mobile client services.ts:110-122). So these tiles
  would render REAL data, not fakes. The open question is whether to *surface* them
  in round 1, not whether to build backend: under "Kael runs everything", the
  approval queue is scope-change-only and already shown in-job (don't duplicate a
  separate feed), and the cross-job inbox is secondary to per-job chat. If shown,
  render from these endpoints; otherwise descope the tiles — never hand-fabricate
  their contents.

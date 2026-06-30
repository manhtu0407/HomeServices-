# NestScout / Kael Frontend Rebuild Plan

Status: Phase 1 approved by Tu on 2026-06-11. UI rebuild may proceed in screen checkpoints.

Mission role: Principal Frontend Engineer, OpenAI bar.

## Mission Boundary

Rebuild the Expo React Native frontend UI/UX to match the NestScout / Kael handoff while preserving existing product logic, state management, navigation behavior, data fetching, API integrations, and side effects.

Hard stop rule: if a visual requirement appears to need new business logic, API, workflow, state-machine, role, auth, pricing, matching, AI, Supabase, or payment behavior, first audit the existing repo and the zip again. Tu confirmed the backend/system and intended components are already built; connect the existing implementation correctly instead of inventing mock behavior.

Repo authority still applies:

- `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, and `AGENTS.md` govern execution, runtime, product scope, UI safety, and verification.
- The zip handoff governs the new rebuild target visuals. Its `design/theme.ts` and `design/tokens.json` are the visual token source for the rebuild, with `primary = #0DAE9A`.
- Do not use old PDF color chips as implementation values.
- Tu explicitly approved commit-per-screen checkpoints in the current conversation. Commit only after a screen checkpoint is verified and reviewed. Never push or open a PR unless Tu asks.

## Phase 0 Evidence Read

Zip source:

- `C:\Users\Phan Manh Tu\Downloads\nestscout-codex-handoff.zip`
- Read first: `CODEX_REBUILD_PROMPT.md`
- Extracted read-only copy for image inspection: `%TEMP%\nestscout-codex-handoff`

Zip text files read:

- `AGENTS.md`
- `design/README.md`
- `design/design-system.md`
- `design/theme.ts`
- `design/tokens.json`

Zip visual files inspected:

- `design/flows/01_main_flows.png`
- `design/flows/02_agentic_center.png`
- `design/flows/03_profiles.png`
- `design/pages/01_overview_flow@2x.png`
- `design/pages/02_mascot_motion@2x.png`
- `design/pages/03_typography@2x.png`
- `design/pages/04_icon_system@2x.png`
- `design/pages/05_component_system@2x.png`
- `design/pages/06_logo_color@2x.png`
- `design/pages/07_profile_screens@2x.png`

Repo docs/protocols read for the audit gate:

- `critical.md`
- `RULES.md`
- `STRUCTURES.md`
- `design.md`
- `AGENTS.md`
- `CLAUDE.md`
- `skills.md`
- `protocols/ui.md`
- `protocols/frontend-test.md`
- `protocols/docs-workflow.md`
- `docs/architecture/code-ownership-map.md`
- `README.md`
- Relevant `Plan.md` context
- `design/signature.md`
- `design/motion.md`
- `MEMORY.md` last

Skills/protocols used:

- `kael-preflight`
- `kael-ui-rn-execution`
- `kael-docs-execution`
- `kael-code-enhancement`
- `kael-tdd`
- `kael-frontend-test`
- `glass-liquid-signature`
- `karpathy-guidelines`

## Current Worktree Baseline

Pre-existing dirty worktree before this plan:

- Modified: `apps/mobile/components/auth/auth-surfaces.tsx`
- Modified: `apps/mobile/components/prototypes/client-icon-image-prototype.tsx`
- Removed during review cleanup: `apps/mobile/app/login-decor-prototype.tsx`
- Removed during review cleanup: `apps/mobile/components/prototypes/login-decor-prototype.tsx`
- Untracked: `apps/mobile/assets/common-image-icons/`

Treat these as user/pre-existing changes. Do not revert or overwrite them.

Tu clarified these prototype leftovers were trash; they were removed during review cleanup and are not part of this rebuild unless explicitly reintroduced by a verified screen checkpoint.

## Tu Decisions After Phase 0

- Visible brand changes from Home Services to NestScout throughout the rebuild.
- The bottom dock keeps four main functions plus one Kael Orb.
- The Kael Orb opens the Agentic Center. The existing Kael chat stays connected from that center where appropriate.
- All UI must connect to real existing backend/system data and components. No fake stats, fake workers, fake prices, fake queue counts, or mock profile metrics.
- Profile metrics must render from real data only. Missing data uses honest empty/loading/error states.
- Worker offers and quote screens must use Kael/system-computed quote data, not worker-entered pricing.
- Commit-per-screen is approved as an internal quality checkpoint cadence, after verification.
- Do not pause between phases unless blocked by a real conflict or missing source; if any icon, image, component, color, or pattern looks unusual, audit the zip again before building.

## Current App Map

Runtime boundary:

```text
Expo React Native mobile app
-> Supabase Auth
-> Supabase Edge Function mobile-api
-> Supabase DB/RPC/Storage/Realtime
-> server-side providers
```

Primary mobile routes:

| Area | Route | Current UI owner | Notes |
|---|---|---|---|
| Auth | `apps/mobile/app/(auth)/login.tsx` | `LoginRoleSurface` in `apps/mobile/components/auth/auth-surfaces.tsx` | Role gate, login/register/onboarding-like auth UI. |
| Auth OTP placeholder | `apps/mobile/app/(auth)/verify-otp.tsx` | Redirect to login | Keep placeholder honest unless auth scope changes. |
| Customer home | `apps/mobile/app/(customer)/home.tsx` | `CustomerHomeSurface` | A1/customer home owner. |
| Customer booking | `apps/mobile/app/(customer)/booking.tsx` | `CustomerBookingEntrySurface` + `BookingWizard` | A2-A6 intake/media/estimate entry owner. |
| Customer Kael | `apps/mobile/app/(customer)/kael.tsx` | `KaelChatSurface` | This route becomes the Kael Orb Agentic Center entry. |
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

- Customer route contract currently has 5 `Tabs.Screen` entries plus a hidden `kael-chat` stack route.
- Customer visual dock uses 4 items plus separated Kael action: Home / Booking / Activity / Profile + Kael.
- Worker route contract currently has 5 `Tabs.Screen` entries.
- Worker visual dock uses 4 items plus separated Kael action: Home / Jobs / Earnings / Profile + Chat/Kael.
- Dock tab switching uses `replace(...)`; do not change it to `push(...)`.

State/API owners that should remain untouched during UI-only rebuild:

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

## Token And Theme Placement

The handoff expects imports like:

```ts
import { color, typography, spacing, radius, component } from '@/design/theme'
```

In the current mobile app, `@/*` resolves to `apps/mobile/*`, not repo root. Decision: add runtime design tokens under `apps/mobile/design/theme.ts` and `apps/mobile/design/tokens.json`, so `@/design/theme` works in the mobile app. Keep `design/ASSET_MAP.md` and rebuild docs at repo root for governance.

## Screen Inventory Against Flow Boards

### Group A - Entry / Brand / Access

| Flow ID | Required screen | Existing route/owner | Rebuild note |
|---|---|---|---|
| 1.1 | Splash Screen | Expo config/assets: `apps/mobile/app.config.ts`, `apps/mobile/assets/splash-icon.png` | Requires NestScout/Kael splash asset decision or existing asset mapping. |
| 1.2 | Welcome | `LoginRoleSurface` | Auth welcome state inside existing login route. |
| 1.3 | Login with Email | `LoginRoleSurface` / `UnauthenticatedRoleForm` | Preserve auth provider calls and role rules. |
| 1.4 | Register with Email | `LoginRoleSurface` / auth form panels | Preserve worker email/password and customer auth constraints. |
| 1.5 | Onboarding | `CustomerOnboardingPanel` in auth surfaces | UI-only unless onboarding persistence changes, which would require approval. |

### Group B - Customer Core

| Flow ID | Required screen | Existing route/owner | Rebuild note |
|---|---|---|---|
| 2.1 | Home | `CustomerHomeSurface` | Must show only electrical/plumbing/cleaning services. |
| 2.2 | Search & Filter / Book | `CustomerBookingEntrySurface`, `BookingWizard` | Keep service scope and shared problem chips. |
| 2.3 | Media / Voice Note | `BookingWizard`, `KaelChatSurface` composer | Photo/media exists. Voice must connect to any real existing system path; do not mock recording/transcription if a runtime contract is missing. |
| 2.4 | Kael Live Performance Chat | `KaelChatSurface`, `agentic-parts.tsx`, stream/progress services | Preserve server-side Kael and progress/SSE contracts. |

### Group C - Customer Kael Case Work

| Flow ID | Required screen | Existing route/owner | Rebuild note |
|---|---|---|---|
| 2.5 | Case Overview | `CustomerHistorySurface`, Agentic Center | Active case summary can live in Activity and Kael Orb. |
| 2.6 | Matching & AI Score | `CustomerHistorySurface` / matching status | Must avoid fake worker ratings/counts. |
| 2.7 | Kael Helper for Options | `KaelChatSurface`, history panels | Advisory copy only, validated server output. |
| 2.8 | Worker Offers & Quote | `CustomerHistoryPricePanel`-style UI | Confirmed: quote is Kael/system-computed, not worker-entered pricing. |
| 2.9 | Location & ETA | `CustomerCompletionPresenceMap`, worker map surfaces | Only show real/released address data. |
| 2.10 | Live Job Alert | `CustomerHistorySurface` or notification/activity state | No fake push/queue state. |
| 2.11 | Job Acceptance | `CustomerHistorySurface` | Preserve post-accept worker privacy/trust rules. |
| 2.12 | Job in Progress | `CustomerHistorySurface` | Preserve job state-machine labels/actions. |

### Group D - Worker Flow

| Flow ID | Required screen | Existing route/owner | Rebuild note |
|---|---|---|---|
| 3.1 | Worker Home | `WorkerHomeSurface` | Availability/map/readiness; preserve address privacy. |
| 3.2 | Jobs | `WorkerJobsSurface` | Incoming/active/needs tabs already live in one route. |
| 3.4 | Kael On-site Advisory Chat | `WorkerChatSurface` | Advisory-only; no money/scope authority. |
| 3.4 | Evidence Upload | `WorkerJobsSurface`, `WorkerCompletionEvidenceBox` | Duplicated flow number; map as separate evidence screen. |
| 3.5 | Earnings | `WorkerEarningsSurface` | No fake payouts. |
| 3.6 | Worker Rating | `WorkerProfileSurface` or post-job state | Real review data only; otherwise honest empty/loading state. |
| 3.7 | Safety & Checklist | `WorkerJobsSurface` | Checklist UI only unless backend checklist contract changes. |
| 3.8 | Evidence & Scope Change | `WorkerJobsSurface`, `WorkerScopeChangeRequestBox` | Scope change must remain Kael/autonomy-gated. |
| 3.8 | Job Summary | `WorkerJobsSurface` | Duplicated flow number; map as summary state. |
| 3.9 | Summary & Report | `WorkerJobsSurface` | Report UI must be honest about implemented report generation. |

### Group E - Kael Agentic Center

| Flow ID | Required screen | Existing route/owner | Rebuild note |
|---|---|---|---|
| 5.1 | Customer Home / Commanding Home | Kael Orb route | Confirmed: Agentic Center lives behind the Kael Orb. |
| 5.2 | Active Case Command Center | Kael Orb route, connected to `KaelChatSurface`/workflow state | Must preserve live workflow state and Kael audit visibility. |
| 5.3 | Approval Queue | Kael Orb route | Show real pending actions only; otherwise honest empty state. |
| 5.4 | Memory & Preferences | Kael Orb route, with profile/settings links as needed | Must be honest; only show implemented memory/preferences. |

### Group F - Profiles

| Flow ID | Required screen | Existing route/owner | Rebuild note |
|---|---|---|---|
| F1 | Worker Overview | `WorkerProfileSurface` | Existing route can host profile subview/tabs. |
| F2 | Worker Level Journey | `WorkerProfileSurface`, `WorkerProfileLevelCard` | Real level/rating/progress only; no fake values. |
| F3 | Worker Reputation & Performance | `WorkerProfileSurface` / earnings data | Charts/badges/radar need real data or honest empty state. |
| F4 | Customer Overview | `CustomerProfileSurface` | Existing route owner. |
| F5 | Customer Usage Ranking | `CustomerProfileSurface` | Ranking/progress requires real data or honest empty state. |
| F6 | Customer Money Protection | `CustomerProfileSurface` | Payment/protection metrics must not be fabricated. |

## Files To Touch By Phase

Phase 1 foundation:

- `apps/mobile/design/theme.ts`
- `apps/mobile/design/tokens.json`
- `apps/mobile/design/brand.ts` if a small NestScout/Kael brand constant improves consistency.
- `apps/mobile/components/ui/*` only where existing primitives need token wiring.
- Route layout files only when needed to preserve or visually wrap existing routes.

Phase 2+ screen rebuild:

- `apps/mobile/components/auth/auth-surfaces.tsx`
- `apps/mobile/components/customer/customer-surfaces.tsx`
- `apps/mobile/components/customer/booking-wizard.tsx`
- `apps/mobile/components/customer/kael-chat/**`
- `apps/mobile/components/customer/scope-change-modal/**`
- `apps/mobile/components/worker/worker-surfaces.tsx`

Files not to touch without separate approval:

- `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, `CLAUDE.md`, `README.md`
- `apps/mobile/lib/api.ts`
- `apps/mobile/lib/services.ts`
- `apps/mobile/lib/frontend-workflow-provider.tsx`
- `apps/mobile/lib/auth-provider.tsx`
- `packages/shared/**` except tests strictly needed to lock UI-only boundaries
- `supabase/**`
- `apps/api/**`
- Pre-existing prototype/user work unless Tu explicitly assigns cleanup or integration

## Verification Plan

Every implementation phase:

- `pnpm --filter @home-services/mobile type-check`
- `pnpm --filter @home-services/mobile test`
- Relevant focused RNTL tests for changed surfaces.
- `pnpm doctor:react:changed` after UI/performance-sensitive batches.
- `git diff --check`
- Token compliance grep for raw colors/sizes outside approved token/theme files.

Frontend/UI evidence:

- Native iOS and Android validation via Expo/simulator/device.
- Light/dark mode.
- Reduce Motion.
- Reduce Transparency.
- VI/EN mode without mixed copy.
- Loading/empty/error/success states.
- Screenshots/recordings for each screen against flow board/reference page.

Current limitation:

- No local recording file was found in the repo during Phase 0. Future UI phases must produce new native evidence.
- Maestro/Detox visual regression is not set up in this repo.

## Open Questions For Tu

Resolved by Tu on 2026-06-11. No open Phase 0 blockers remain.

## Phase 1 Checkpoint

Proceed with foundation, then screen-by-screen rebuild. Re-audit the zip whenever a visual asset, icon image, component, color, or screen structure is unclear.

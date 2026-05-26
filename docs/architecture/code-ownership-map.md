# Code Ownership Map

Status: active agent navigation contract.

This document tells Codex, Claude Code, and future AI coding agents where workflow behavior lives in code. It is not a product spec. `STRUCTURES.md` remains the workflow source of truth; this file maps that workflow to implementation owners.

## Required Use

Before enhancing, refactoring, or moving code, map the task to:

- workflow step,
- route or entry file,
- UI owner,
- state/provider owner,
- runtime/API boundary,
- shared contract,
- tests or static gates.

If a task cannot be mapped, stop and ask Tu instead of creating a new structure.

## Ownership Rules

- Routes in `apps/mobile/app/**` stay thin. They select a surface and should not own business workflow logic.
- Product surfaces in `apps/mobile/components/**` own UI composition, copy, visual states, and user actions.
- `apps/mobile/lib/frontend-workflow-provider.tsx` owns mobile workflow orchestration between UI and Edge APIs.
- `apps/mobile/lib/services.ts` owns typed mobile API method groups. Do not call `fetch` directly from UI surfaces.
- `apps/mobile/lib/api.ts` owns the `mobile-api` HTTP boundary, auth headers, timeout, and response envelope.
- `supabase/functions/mobile-api/_shared/router.ts` owns route matching, role guards, request validation, and dispatch.
- `supabase/functions/mobile-api/_shared/services.ts` owns Edge workflow reads/writes, DB/RPC/Storage calls, notifications, matching, and service-role behavior.
- `supabase/functions/mobile-api/_shared/kael.ts` is a backward-compatible re-export shim; `supabase/functions/mobile-api/_shared/kael/**` owns Edge Kael pipeline/provider behavior. Mobile must not call AI providers directly.
- `packages/shared/src/constants.ts`, `validation.ts`, and `mobile-workflow.ts` own shared service scope, schemas, state transitions, selectors, and type-level contracts.
- `apps/api` is reference/parity/admin/support code unless Tu explicitly assigns a Next.js task. Do not move the store-bound mobile runtime back into Next.js.

## Auth And Role Gate

| Workflow | Route | UI Owner | State Owner | Runtime/API Boundary | Contracts And Tests |
|---|---|---|---|---|---|
| A0/B0 role entry and login | `apps/mobile/app/(auth)/login.tsx` | `apps/mobile/components/auth/auth-surfaces.tsx` / `LoginRoleSurface` | `apps/mobile/lib/auth-provider.tsx` | Supabase Auth plus profile bootstrap from `profiles.role` | `packages/shared/src/__tests__/mobile-wiring.test.ts`, `packages/shared/src/__tests__/monorepo-wiring.test.ts` |
| Auth redirect/OTP placeholder | `apps/mobile/app/(auth)/verify-otp.tsx` | Auth route shell only | `auth-provider.tsx` | Supabase Auth; phone OTP remains future/intent-only unless implemented | `mobile-wiring.test.ts` |
| Role-protected customer shell | `apps/mobile/app/(customer)/_layout.tsx` | Customer dock/shell in `customer-surfaces.tsx` | `auth-provider.tsx` | Auth role guard | `mobile-wiring.test.ts` |
| Role-protected worker shell | `apps/mobile/app/(worker)/_layout.tsx` | Worker dock/shell in `worker-surfaces.tsx` | `auth-provider.tsx` | Auth role guard | `mobile-wiring.test.ts` |

Auth changes must preserve:

- customer Google primary and phone secondary intent unless provider implementation changes,
- worker email/password only, no worker Google path,
- no provider/internal infrastructure names in user-facing errors,
- no direct workflow writes from auth UI.

## Customer Workflow

| Workflow | Route | UI Owner | State/Action Owner | Edge Routes | Shared Contracts / Tests |
|---|---|---|---|---|---|
| A1 customer home | `apps/mobile/app/(customer)/home.tsx` | `CustomerHomeSurface` in `customer-surfaces.tsx` | `useFrontendWorkflow`, `localWorkflowReducer`, selectors | read/bootstrap only, no workflow write | `mobile-wiring.test.ts`, `mobile-workflow.test.ts` |
| A2-A6 service/problem/description/media/estimate/time | `apps/mobile/app/(customer)/booking.tsx` | `CustomerBookingEntrySurface` | `createRemoteJobFromDraft`, `uploadJobMediaDrafts` | `GET /services`, `POST /jobs`, `POST /jobs/:id/media` | `validation.test.ts`, `mobile-workflow.test.ts`, `mobile-backend-wiring.test.ts` |
| A4/A5 Kael chat and price check | `apps/mobile/app/(customer)/kael.tsx`, `kael-chat.tsx` | `KaelChatSurface`, `CustomerKaelSurface` | `kaelChatService`, local draft reducer, `useFrontendWorkflow` when confirmed | `POST /kael/chat`, `GET /kael/chat/:id`, `POST /kael/chat/:id`, `POST /kael/chat/:id/confirm`, `POST /places/autocomplete` | `contracts-parity.test.ts`, `validation.test.ts`, API Kael tests |
| A7 confirm worker search | booking/history/Kael surfaces as action origin | Customer CTA in surface owner | `confirmRemoteSearch` | `POST /jobs/:id/confirm-search` | `mobile-workflow.test.ts`, API lifecycle/broadcast tests |
| A8-A10 searching, matched, active job, chat | `apps/mobile/app/(customer)/history.tsx`, `kael.tsx` | `CustomerHistorySurface`, `KaelChatSurface` | `hydrateRemoteJobById`, `refreshCurrentJob`, message service methods | `GET /jobs/:id`, `GET/POST /jobs/:id/messages` | `mobile-workflow.test.ts`, `contracts-parity.test.ts` |
| A11 scope change decision | Customer history/job state surfaces | `scope-change-hard-stop-modal.tsx` plus customer surfaces | `decideScopeChange` | `POST /scope-changes/:id/decide` | `validation.test.ts`, API scope-change tests |
| A12 completion confirmation | Customer history/completion state | customer surfaces | `customerConfirmCompletion` | `POST /jobs/:id/confirm-completion` | `mobile-workflow.test.ts`, API lifecycle tests |
| A13 payment placeholder | customer history/completion state | customer surfaces | local state only until payment rails exist | no payment API in current phase | payment must stay honest and locked |
| A14 review | customer history/profile/completion state | customer surfaces | `submitReview` | `POST /jobs/:id/review` | `validation.test.ts`, API review tests |

Customer UI must not fabricate workers, prices, ratings, queue counts, route/map presence, payment state, or completed media. Use empty states or real Edge data.

## Worker Workflow

| Workflow | Route | UI Owner | State/Action Owner | Edge Routes | Shared Contracts / Tests |
|---|---|---|---|---|---|
| B0 registration form | `apps/mobile/app/(worker)/profile.tsx` | `WorkerProfileSurface` | `workerSubmitRegistration`, `uploadWorkerVerificationDrafts` | `POST /workers/register` | `validation.test.ts`, `worker-register` API tests, `docs/ops/worker-onboarding.md` |
| B1 admin approval required | worker profile/home | `WorkerProfileSurface`, `WorkerHomeSurface` | `workerRefresh`, profile state | `GET /workers/me` | worker onboarding docs and mobile wiring tests |
| B2 home availability | `apps/mobile/app/(worker)/home.tsx` | `WorkerHomeSurface` | `workerUpdateAvailability`, `workerRefresh` | `PATCH /workers/me/availability`, `GET /workers/me` | `mobile-wiring.test.ts`, worker API tests |
| B3 incoming request | `apps/mobile/app/(worker)/jobs.tsx` | `WorkerJobsSurface` | `workerRefresh`, `workerAcceptBroadcast`, `workerDeclineBroadcast` | `GET /workers/me/broadcasts`, `POST /jobs/:id/accept`, `POST /jobs/:id/decline` | `mobile-workflow.test.ts`, broadcast tests |
| B4 job detail after accept | worker jobs/chat surfaces | `WorkerJobsSurface`, `WorkerChatSurface` | `workerRefresh`, `hydrateRemoteJobById` | `GET /workers/me/jobs`, `GET /jobs/:id`, messages routes | workflow tests and Edge access tests |
| B5 on-site status updates | worker jobs/JobRoom | `WorkerJobsSurface` | `workerUpdateStatus` | `PATCH /jobs/:id/status` | `mobile-workflow.test.ts`, API lifecycle tests |
| B6 scope change request | worker JobRoom | `WorkerJobsSurface` | `requestScopeChange` | `POST /jobs/:id/scope-change` | `validation.test.ts`, scope-change tests |
| B7 completion evidence | worker JobRoom | `WorkerJobsSurface`, media upload UI | `workerUpdateStatus`, `uploadJobMediaDrafts` | `PATCH /jobs/:id/status`, `POST /jobs/:id/media` | media/static wiring tests |
| B8 earnings | `apps/mobile/app/(worker)/earnings.tsx` | `WorkerEarningsSurface` | `workerRefresh`, worker earnings state | `GET /workers/me/earnings` | earnings API tests, mobile wiring tests |

Worker UI must preserve address privacy before accept, avoid fake earnings, and show verification/approval blockers honestly.

## Shared Mobile State

| Concern | Owner | Do Not Move To |
|---|---|---|
| Local deal status and selectors | `packages/shared/src/mobile-workflow.ts` | individual UI components |
| Service scope and problem chips | `packages/shared/src/constants.ts` | hardcoded route/surface arrays unless derived |
| Input schemas | `packages/shared/src/validation.ts` | UI-only validation that bypasses shared schemas |
| API response types | `apps/mobile/lib/api-types.ts` and shared exported contracts | ad hoc inline `any` shapes in surfaces |
| Workflow orchestration | `apps/mobile/lib/frontend-workflow-provider.tsx` | route files or visual components |
| API transport | `apps/mobile/lib/api.ts` | component-level fetch calls |

If a new helper is needed, search these files first:

```text
packages/shared/src/mobile-workflow.ts
packages/shared/src/constants.ts
packages/shared/src/validation.ts
apps/mobile/lib/frontend-workflow-provider.tsx
apps/mobile/lib/services.ts
apps/mobile/components/ui/
```

## Edge Runtime Ownership

| Concern | Owner | Notes |
|---|---|---|
| Route matching and role guards | `supabase/functions/mobile-api/_shared/router.ts` | validates body with shared Edge schemas and dispatches by route kind |
| Workflow DB/RPC/Storage behavior | `supabase/functions/mobile-api/_shared/services.ts` | service-role behavior stays here |
| Kael provider pipeline | `supabase/functions/mobile-api/_shared/kael/**` via `kael/index.ts`; `kael.ts` remains a shim | `pipeline.ts` orchestrates stages, `routing.config.ts` / `routing.ts` own pure purpose-to-provider routing, `circuit-breaker.ts` owns in-memory provider health, `orchestrator.ts` owns timeout/parallel stage execution, `streaming.ts` owns `jobs.kael_progress`, `provider-client.ts` is the only provider HTTP client, `intent.ts` / `vision.ts` / `market.ts` own stage behavior, `synthesis.ts` owns baseline/price synthesis, `scope-change.ts` owns worker scope-change Kael review. AI secrets stay server-side |
| Kael charter and response style | `packages/shared/kael/charter/**`, `supabase/functions/mobile-api/_shared/kael/system-prompt.ts`, `self-check.ts`, `orchestrator.ts`, and `GET /kael/charter` | P8 charter source files define locked identity/persona/mission and tunable tone/language/forbidden/style rules. Edge mirrors the public-safe runtime prompt bundle without importing `packages/shared`, and `self-check.ts` owns deterministic response screening before fallback |
| Kael learning skills | `supabase/functions/mobile-api/_shared/kael/skills/**`, queue call sites in `services.ts`, and `kael_rule_*_log` migrations | P7 learning is queued behind Edge/service-role flow. Skill registry owns immutable forbidden effects, allowed targets, evidence gates, lifecycle, runtime flags, A/B gating, and rollback signals. It must not execute learning inline during customer/worker workflow writes |
| Kael monitoring and A/B dashboards | `public.kael_ab_experiments`, `public.kael_ab_price_synthesis_cases`, `public.kael_monitoring_provider_daily`, `public.kael_monitoring_ab_price_synthesis` | P17 monitoring is DB-owned. Service role writes experiment/case rows, admins read through `security_invoker` views, and sample collection must not fabricate provider or price data. |
| Transition validity | `supabase/functions/mobile-api/_shared/lifecycle.ts` | keep backend state machine authoritative |
| Access checks | `supabase/functions/mobile-api/_shared/access.ts` | customer/worker/admin authorization |
| Push helper | `supabase/functions/mobile-api/_shared/push.ts` | push is best-effort; notification rows remain source of truth |
| Rate limit | `supabase/functions/mobile-api/_shared/rate-limit.ts` | protect AI/provider routes |
| Kael Harness shared contracts | `packages/shared/kael/**` | charter skeletons, permission-purpose types, and future shared Kael governance contracts |

`apps/api/src/**` mirrors/reference-tests many of these behaviors for Next.js/admin/support. It is not the store-bound mobile runtime unless Tu explicitly changes scope.

## UI System Ownership

| Concern | Owner | Notes |
|---|---|---|
| Shared dock/tab motion | `apps/mobile/components/ui/floating-glass-tab-bar.tsx` | must preserve tab-safe navigation; never use `push(item.path)` for tab switching |
| Glass material fallback | `apps/mobile/components/ui/glass-surface.tsx`, `glass-card.tsx`, `glass-modal-sheet.tsx`, `glass-pressable.tsx` | must handle Reduce Transparency |
| Motion accessibility | `apps/mobile/components/ui/reduce-motion-aware-animation.ts`, `accessibility-motion.ts`, `motion-tokens.ts` | must handle Reduce Motion |
| Theme tokens | `apps/mobile/components/ui/tokens.ts`, customer/worker local token helpers | no one-note palette drift; keep VI/EN copy coherent |
| Customer visual surfaces | `apps/mobile/components/customer/customer-surfaces.tsx` | avoid business writes outside provider actions |
| Worker visual surfaces | `apps/mobile/components/worker/worker-surfaces.tsx` | avoid fake profile/earnings/job state |

## Media, Push, And External Services

| Concern | Mobile Owner | Edge/Backend Owner | Tests / Docs |
|---|---|---|---|
| Job media upload | `apps/mobile/lib/media-upload.ts`, `uploadJobMediaDrafts` | `POST /jobs/:id/media`, private Supabase Storage | `validation.test.ts`, `mobile-wiring.test.ts` |
| Worker verification media | `media-upload.ts`, `uploadWorkerVerificationDrafts` | worker register route and storage policy | `docs/ops/worker-onboarding.md` |
| Push registration | `apps/mobile/lib/push-notifications.ts`, `notificationService.registerDeviceToken` | `POST /notifications/device-token`, Edge push helper | `docs/foundation/expo-push-spike.md` |
| Address autocomplete | `address-autocomplete.tsx`, `placesService.autocomplete` | `POST /places/autocomplete`, Edge-only Google Maps key | `docs/foundation/geo-data-spike.md`, staging verification doc |

## Tests And Static Gates

Use the narrowest relevant check first, then broaden when shared behavior changes.

| Change Area | Primary Checks |
|---|---|
| Service scope / constants / schemas | `packages/shared/src/__tests__/constants.test.ts`, `validation.test.ts`, `contracts-parity.test.ts` |
| Mobile workflow state | `packages/shared/src/__tests__/mobile-workflow.test.ts` |
| Mobile wiring/static boundaries | `packages/shared/src/__tests__/mobile-wiring.test.ts`, `mobile-backend-wiring.test.ts`, `monorepo-wiring.test.ts` |
| Edge/API routing and runtime | `apps/api/src/__tests__/unit/mobile-api-edge-router.test.ts`, `mobile-api-edge-runtime.test.ts`, `apps/api/src/__tests__/schema/mobile-api-edge-schema.test.ts` |
| Kael/provider behavior | API Kael unit tests, `kael-schemas.test.ts`, `pricing.test.ts`, `ai-client.test.ts` |
| Kael charter and response style | `packages/shared/src/__tests__/kael-charter-p8.test.ts`, `apps/api/src/__tests__/unit/mobile-api-kael-p8.test.ts`, `mobile-api-edge-schema.test.ts`, staging `GET /kael/charter` smoke, staging advisors |
| Kael learning skills | `apps/api/src/__tests__/unit/mobile-api-kael-p7.test.ts`, `mobile-api-edge-schema.test.ts`, `tier1-type-completeness.test.ts`, staging migration/advisor checks |
| Auth/security/RLS | API auth/security tests, schema hardening tests, staging harness docs |
| UI motion/glass | Type-check, React Doctor changed scan, screenshot/recording evidence for UI tasks |

Static gates should be added in tests only after reading the current dirty test files. Do not bolt new gates onto unrelated tests without understanding existing assertions.

## Enhancement Checklist

Before changing code:

```text
[ ] I can name the workflow step or cross-cutting concern.
[ ] I opened the owner route/surface/provider/runtime files from this map.
[ ] I searched for an existing helper before adding a new one.
[ ] I know which layer owns the change.
[ ] I am not moving workflow-sensitive writes out of Edge.
[ ] I know the narrowest test/static gate that should prove the change.
```

If any item is false, stop and gather context before editing.

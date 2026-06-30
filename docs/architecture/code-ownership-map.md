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
| A2-A6 service/problem/description/media/estimate/time | `apps/mobile/app/(customer)/booking.tsx` | `CustomerBookingEntrySurface` | `setPendingKaelChatDraft`, `onOpenKael`, later `uploadJobMediaDrafts` once a job exists | `POST /kael/chat`, `POST /jobs/:id/media` | `booking-wizard-test.tsx`, `mobile-wiring.test.ts`, `mobile-backend-wiring.test.ts` |
| A4/A5 Kael chat and price check | `apps/mobile/app/(customer)/kael.tsx`, `kael-chat.tsx` | `KaelChatSurface`, `CustomerKaelSurface`, `agentic-parts.tsx` | `kaelChatService`, pending-intake reducer, `useFrontendWorkflow` hydration after Kael creates the job | `POST /kael/chat`, `GET /kael/chat/:id`, `POST /kael/chat/:id`, `POST /kael/chat/:id/confirm`, `POST /places/autocomplete` | `contracts-parity.test.ts`, `validation.test.ts`, API Kael tests |
| A7 Kael starts worker search | Kael chat/history surfaces as orchestration viewer | `KaelChatSurface`, `CustomerHistorySurface` | `KaelAutonomyDecision(action=start_matching)`, `hydrateRemoteJobById`; `confirmRemoteSearch` remains legacy/manual recovery | `POST /kael/chat/:id/confirm`, `POST /jobs/:id/confirm-search` | `mobile-workflow.test.ts`, API lifecycle/broadcast tests |
| A8-A10 searching, matched, active job, chat | `apps/mobile/app/(customer)/history.tsx`, `kael.tsx` | `CustomerHistorySurface`, `KaelChatSurface` | `hydrateRemoteJobById`, `refreshCurrentJob`, `useJobChatThread`; composer sends only after Kael has matched a worker | `GET /jobs/:id`, `GET/POST /jobs/:id/messages` | `mobile-workflow.test.ts`, `contracts-parity.test.ts`, `mobile-wiring.test.ts` |
| A11 scope change decision | Customer history/job state surfaces | `scope-change-hard-stop-modal.tsx` plus customer surfaces | `KaelAutonomyDecision(action=decide_scope_change)`; `decideScopeChange` remains appeal/manual override compatibility | `POST /scope-changes/:id/decide` legacy/appeal path | `validation.test.ts`, API scope-change tests |
| A12 Kael completion review | Customer/worker completion state | customer + worker surfaces | `KaelAutonomyDecision(action=confirm_completion/decide_dispute)`; `customerConfirmCompletion` remains legacy/manual recovery but is wrapped as Kael decision input | worker evidence APIs, `POST /jobs/:id/confirm-completion` legacy | `mobile-workflow.test.ts`, API lifecycle/orchestrator tests |
| A13 payment placeholder | customer history/completion state | customer surfaces | local state only until payment rails exist | no payment API in current phase | payment must stay honest and locked |
| A14 review | customer history/profile/completion state | customer surfaces | `submitReview` | `POST /jobs/:id/review` | `validation.test.ts`, API review tests |

Customer UI must not fabricate workers, prices, ratings, queue counts, route/map presence, payment state, or completed media. Use empty states or real Edge data.

## Worker Workflow

| Workflow | Route | UI Owner | State/Action Owner | Edge Routes | Shared Contracts / Tests |
|---|---|---|---|---|---|
| B0 registration form | `apps/mobile/app/(worker)/profile.tsx` | `WorkerProfileSurface` | `workerSubmitRegistration`, `uploadWorkerVerificationDrafts` | `POST /workers/register` | `validation.test.ts`, `worker-register` API tests, `docs/ops/worker-onboarding.md` |
| B1 admin approval required | worker profile/home | `WorkerProfileSurface`, `WorkerHomeSurface` | `workerRefresh`, profile state | `GET /workers/me` | worker onboarding docs and mobile wiring tests |
| B2 home availability + map | `apps/mobile/app/(worker)/home.tsx` | `WorkerHomeSurface`, `WorkerMapStage` | `workerUpdateAvailability`, `workerRefresh`; map reads released job address only after accept and opens external directions | `PATCH /workers/me/availability`, `GET /workers/me` | `mobile-wiring.test.ts`, worker API tests |
| B3 incoming request | `apps/mobile/app/(worker)/jobs.tsx` | `WorkerJobsSurface` | `workerRefresh`, `workerAcceptBroadcast`, `workerDeclineBroadcast` | `GET /workers/me/broadcasts`, `POST /jobs/:id/accept`, `POST /jobs/:id/decline` | `mobile-workflow.test.ts`, broadcast tests |
| B4 job detail after accept | worker jobs/chat surfaces | `WorkerJobsSurface`, `WorkerChatSurface`, `CompactWorkerPresenceMap` | `workerRefresh`, `hydrateRemoteJobById`, `useJobChatThread`; composer remains locked until accepted job; full address becomes route/map input only after the broadcast privacy gate releases it | `GET /workers/me/jobs`, `GET /jobs/:id`, `GET/POST /jobs/:id/messages` | workflow tests, Edge access tests, `mobile-wiring.test.ts` |
| B5 on-site status updates | worker jobs/JobRoom | `WorkerJobsSurface` | `workerUpdateStatus` | `PATCH /jobs/:id/status` | `mobile-workflow.test.ts`, API lifecycle tests |
| B6 scope change request | worker JobRoom | `WorkerJobsSurface` | `requestScopeChange` | `POST /jobs/:id/scope-change` | `validation.test.ts`, scope-change tests |
| B7 completion evidence | worker JobRoom | `WorkerJobsSurface`, media upload UI | `workerUpdateStatus`, `uploadJobMediaDrafts` | `PATCH /jobs/:id/status`, `POST /jobs/:id/media` | media/static wiring tests |
| B8 earnings | `apps/mobile/app/(worker)/earnings.tsx` | `WorkerEarningsSurface` | `workerRefresh`, worker earnings state | `GET /workers/me/earnings` | earnings API tests, mobile wiring tests |

Worker UI must preserve address privacy before accept, avoid fake earnings, and show verification/approval blockers honestly.

## Shared Mobile State

| Concern | Owner | Do Not Move To |
|---|---|---|
| Local deal status and selectors | `packages/shared/src/mobile-workflow.ts` | individual UI components |
| Workflow phases, artifact lifecycle, action gates, and UI visibility contract | `packages/shared/src/workflow/**`, consumed by `apps/mobile/lib/use-service-workflow.ts` | per-screen data-existence checks or AI output payloads |
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
| Kael provider pipeline | `supabase/functions/mobile-api/_shared/kael/**` via `kael/index.ts`; `kael.ts` remains a shim | `pipeline.ts` orchestrates stages, `routing.config.ts` / `routing.ts` own pure purpose-to-provider routing, `circuit-breaker.ts` owns in-memory provider health, `orchestrator.ts` owns timeout/parallel stage execution, `streaming.ts` owns Kael progress target writes across jobs, chat sessions, worker chat sessions, and scope-change targets, `provider-client.ts` is the only provider HTTP client, `intent.ts` / `vision.ts` / `market.ts` own stage behavior, `synthesis.ts` owns baseline/price synthesis, `scope-change.ts` owns worker scope-change Kael review, `worker-assist.ts` owns advisory-only worker Kael responses. AI secrets stay server-side |
| Kael knowledge/RAG | `supabase/functions/mobile-api/_shared/kael/knowledge.ts`, knowledge corpus migrations, `docs/foundation/kael-knowledge-corpus.md`, and `apps/api/scripts/kael-b3-*` / `kael-b5-*` | Runtime retrieval, pgvector/hybrid matching, source-audited corpus generation, and knowledge usage logging stay server-side. Mobile may display resulting Kael text/artifacts only; it must not fetch or embed knowledge directly. |
| Kael autonomy gate | `supabase/functions/mobile-api/_shared/kael/autonomy-gate.ts`, `orchestrator-facade.ts`, apply-decision migrations, and autonomy tests | LLM/policy proposals must become validated `KaelAutonomyDecision` objects. DB mutations stay behind deterministic schema, state-machine, permission, invariant, evidence, confidence, and audit gates. |
| Kael guardrail observability and red-team corpus | `supabase/functions/mobile-api/_shared/kael/self-check.ts`, `boundary-guard.ts`, guardrail audit migrations, and `apps/api/src/__tests__/security/kael-redteam/**` | Regex fast-path remains cost-free; semantic classifiers are opt-in/bounded and fail closed. Guardrail trips are audited for later LS7/red-team feedback. |
| Kael charter and response style | `packages/shared/kael/charter/**`, `supabase/functions/mobile-api/_shared/kael/system-prompt.ts`, `self-check.ts`, `orchestrator.ts`, and `GET /kael/charter` | P8 charter source files define locked identity/persona/mission and tunable tone/language/forbidden/style rules. Edge mirrors the public-safe runtime prompt bundle without importing `packages/shared`, and `self-check.ts` owns deterministic response screening before fallback |
| Kael learning skills | `supabase/functions/mobile-api/_shared/kael/skills/**`, queue call sites in `services.ts`, and `kael_rule_*_log` migrations | P7 learning is queued behind Edge/service-role flow. Skill registry owns immutable forbidden effects, allowed targets, evidence gates, lifecycle, runtime flags, A/B gating, and rollback signals. It must not execute learning inline during customer/worker workflow writes |
| Kael monitoring and A/B dashboards | `public.kael_ab_experiments`, `public.kael_ab_price_synthesis_cases`, `public.kael_monitoring_provider_daily`, `public.kael_monitoring_ab_price_synthesis` | P17 monitoring is DB-owned. Service role writes experiment/case rows, admins read through `security_invoker` views, and sample collection must not fabricate provider or price data. |
| Transition validity | `supabase/functions/mobile-api/_shared/lifecycle.ts` plus event ownership in `workflow-orchestrator.ts` | keep backend state machine authoritative; AI and mobile may request actions but must not set phases directly |
| Access checks | `supabase/functions/mobile-api/_shared/access.ts` | customer/worker/admin authorization |
| Push helper | `supabase/functions/mobile-api/_shared/push.ts` | push is best-effort; notification rows remain source of truth |
| Rate limit | `supabase/functions/mobile-api/_shared/rate-limit.ts` | protect AI/provider routes |
| Kael Harness shared contracts | `packages/shared/kael/**` | charter skeletons, permission-purpose types, and future shared Kael governance contracts |

`apps/api/src/**` mirrors/reference-tests many of these behaviors for Next.js/admin/support. It is not the store-bound mobile runtime unless Tu explicitly changes scope.

### C3 — One Kael brain (Edge canonical)

The Edge `supabase/functions/mobile-api/_shared/kael/**` is the single **canonical** Kael brain on the store runtime. `apps/api/src/lib/kael/**` and `apps/api/src/lib/learning/**` are **non-canonical** Next.js reference/parity only: they are off the RN/Edge path, must not be treated as the source of truth, and must not be extended as a parallel brain. (Decision: stack-unification #5 D3; Edge already imports neither `apps/api` nor `packages/shared`.) The Deno↔npm boundary means the Edge cannot import `packages/shared`, so Edge Kael logic stays self-contained (it is **not** lifted into shared); `packages/shared/kael/**` carries only the cross-runtime-safe pure logic consumed by mobile + apps/api. Enforced: `pnpm lint:structure` fails if any `apps/mobile/**` or `supabase/functions/**` source imports from `apps/api` (RN/Edge independence).

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
| Address autocomplete and worker directions | `address-autocomplete.tsx`, `placesService.autocomplete`, worker map surfaces | `POST /places/autocomplete`, Edge-only Maps keys; worker UI may open public Maps directions only with the accepted/released address | `docs/foundation/geo-data-spike.md`, staging verification doc, `mobile-wiring.test.ts` |

## Tests And Static Gates

Use the narrowest relevant check first, then broaden when shared behavior changes.

| Change Area | Primary Checks |
|---|---|
| Service scope / constants / schemas | `packages/shared/src/__tests__/constants.test.ts`, `validation.test.ts`, `contracts-parity.test.ts` |
| Mobile workflow state | `packages/shared/src/__tests__/mobile-workflow.test.ts` |
| Mobile wiring/static boundaries | `packages/shared/src/__tests__/mobile-wiring.test.ts`, `mobile-backend-wiring.test.ts`, `monorepo-wiring.test.ts` |
| Edge/API routing and runtime | `apps/api/src/__tests__/unit/mobile-api-edge-router.test.ts`, `mobile-api-edge-runtime.test.ts`, `apps/api/src/__tests__/schema/mobile-api-edge-schema.test.ts` |
| Kael/provider behavior | API Kael unit tests, `kael-schemas.test.ts`, `pricing.test.ts`, `ai-client.test.ts`, `apps/api/scripts/kael-eval.mjs` |
| Kael charter and response style | `packages/shared/src/__tests__/kael-charter-p8.test.ts`, `apps/api/src/__tests__/unit/mobile-api-kael-p8.test.ts`, `mobile-api-edge-schema.test.ts`, staging `GET /kael/charter` smoke, staging advisors |
| Kael learning skills | `apps/api/src/__tests__/unit/mobile-api-kael-p7.test.ts`, `mobile-api-edge-schema.test.ts`, `tier1-type-completeness.test.ts`, staging migration/advisor checks |
| Kael knowledge/RAG, autonomy, guardrails | `kael-b3-knowledge-corpus.test.ts`, `kael-b4-knowledge-governance.test.ts`, `kael-b5-pgvector-rag.test.ts`, `kael-a5-eval-harness.test.ts`, `kael-c-autonomy-supabase.test.ts`, `kael-d-guardrail-audit.test.ts`, `mobile-api-kael-autonomy-gate.test.ts`, `mobile-api-kael-orchestrator-facade.test.ts`, `mobile-api-kael-guardrails-d.test.ts`, `security/kael-redteam/kael-redteam.test.ts` |
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

## C1 — Target Module Map (image-2 blueprint · #5 Track C)

> **Status: TARGET blueprint, NOT current state.** This is the C1 deliverable of the stack-reorg (`docs/architecture/stack-unification-plan-20260616.md` §5). Every table ABOVE this section describes today's owners; this section describes where code MOVES during the reorg (P4–P6). No file has moved yet. Do not move files from this section alone — follow the build handoff sequencing.

### Arrangement law (from #5 §0.5 — binds every grouping here)

Right-size + group-by-relation into cohesive "chains"; **one concept = one canonical home**. The success metric is "a human/AI understands it at a glance," NOT lines-per-file. Do **not** fragment a domain into many tiny uniform files (that recreates the god-file mess); do **not** keep god-files. The line numbers below are *loose* guidance for where code lives today, not size targets.

### Edge `services.ts` (10,042 lines) → `supabase/functions/mobile-api/_shared/services/` chains

One module per workflow domain; `services/index.ts` assembles them into `MobileApiServices` (today's `createEdgeServices`).

| Target module | Owns (current functions, by line) | Domain |
|---|---|---|
| `services/jobs.service.ts` | createJob (774), cancelAnalyzingJob (1159), getJob (2658), listCustomerActiveJobs (2728), attachJobMedia (5144), job geo (geocodeConfirmedKaelJob 9314, geocodeJobAddressForMatching 9351, updateJobGeo 9559), recordPipelineLearningApplications (1223) | customer job lifecycle |
| `services/broadcasts.service.ts` | confirmSearch (2748), rollbackFailedBroadcastStart (2968), acceptBroadcast (3398), declineBroadcast (3506), persistWorkerBriefGuidanceAfterAccept (3445), createBroadcasts (7183), broadcast-state helpers (7768–7866), queryEligibleWorkers (7935), rankEligibleWorkers (8093), loadDisintermediationRiskCounts (8037), loadJobGeoForMatching (8066) | matching + broadcast |
| `services/status.service.ts` | updateJobStatus (3577), buildKaelCompletionDecision (3846), apartment-access / X-2 check-in handshake (buildInitialApartmentAccessState 8905 … authorizeApartmentAccess 9161, buildCheckInAccessState 9264, buildAuthorizedReleaseAccessState 9298, address-access projection 9033–9140) | worker on-site status + unit access |
| `services/scope-change.service.ts` | requestScopeChange (3885), tryAutoApproveScopeChange (4829), getWorkerScopeChangeRate (4870), decideScopeChange (5607), scopeDecisionToJobStatus (5721), logScopeChangeEstimateApiCall (4847), scopeChangeRiskConfig (9608) | scope change |
| `services/cancellation.service.ts` | previewCustomerCancellation (408), gate{Customer,Worker}CancellationBeforeMutation (449/512), requestCustomerCancellation (3026), requestWorkerCancellation (4887), decideWorkerCancellation (5591), cancelJob (2991) | cancellation |
| `services/dispute.service.ts` | openDispute (3249), submitDisputeCounterStatement (3336), decideDispute (3363) | dispute |
| `services/completion-review.service.ts` | confirmCompletion (5725), buildKaelCustomerAcceptedCompletionDecision (5838), submitReview (5883), submitCustomerKaelFeedback (6000), recordNormalTransactionMemory (6050) | completion + review |
| `services/chat.service.ts` | listJobMessages (5297), sendJobMessage (5320), job-chat contact guard (5394–5438), insertKaelJobMessage (5546), markJobMessagesRead (5569), maybeHandleDemandingCustomerJobChat (5516) | per-job chat |
| `services/kael-chat.service.ts` | createKaelChat (1242), getKaelChat (1585), progress/stream (1625–1671), sendKaelChatTurn (1862), confirmKaelChat (1967), advanceKaelChatEstimate (2156), buildKaelConversationContext (2506), boundary-guard + demanding-customer hooks (1536/2094) | customer Kael Case Work |
| `services/worker-kael.service.ts` | askKaelForWorker (4144), buildWorkerKaelAnswer (4208), summarizeWorkerVision (4131), createWorkerKaelChat (4233), listWorkerKaelChats (4296), getWorkerKaelChat (4314), sendWorkerKaelChatTurn (4336), worker Kael feedback/consent (4736–4828) | worker Kael assist |
| `services/workers.service.ts` | registerWorker (6228), getWorkerProfile (6579), updateWorkerAvailability (6617), listWorkerBroadcasts (6641), listWorkerJobs (6703), getWorkerEarnings (6763) | worker profile + board |
| `services/kael-memory.service.ts` | getMyKaelMemory (6323), getWorkerKaelMemory (6348), deleteMyKaelMemory (6372), updateMyKaelMemory (6399), listMyPendingDecisions (6461), listMyThreads (6514) | Kael memory + "me" views |
| `services/notifications.service.ts` | listNotifications (7090), markNotificationRead (7129), registerDevicePushToken (7156), all `notify*` (7249–7739), insertUserNotification (7739) | notifications |
| `services/places-geo.service.ts` | placesAutocomplete (640), vietmap/google autocomplete (658/697), geocodeWith{Vietmap,GoogleMaps} (9391/9449), buildGeocodingAddress (9491), vietmap helpers, map-key readers (9580/9589) | places + geocoding |
| `services/catalog.service.ts` | listServices (577), getKaelCharter (573), catalog baseline helpers (9769–9810) | service catalog + Kael charter read |
| `services/admin.service.ts` | invalidateMarketCache (6821), evaluatePriceSynthesisAbCaseAdmin (6850), Kael-learning admin (processQueue 6861 / batch 6875 / monitor 6889 / candidates list-approve-reject-deny 6901–7011) | admin / learning ops |
| `services/_shared.ts` (import, never duplicate) | serializers (serializeKael* 8379–8433, serializeJobMessage 8459), error mappers (map*Error 8569–8803), coercions (asX/nullableX 9748–10042), db helpers (db 9649, dbQuery 9653, fetchJsonWithTimeout 9636), media-path validation (validateJobMediaPath 8826, canAttachJobMediaStage 8844, storageRef 8855), labels (serviceLabel 8863, districtLabel 8869), audit (logJobEvent 8173, auditGuardrailTripBestEffort 8197, queueKaelLearningEvent 8246, logApiCalls 8293, logMemoryAudit 8264) | shared edge utilities |
| `services/index.ts` | createEdgeServices (306) assembler + runPolicyAutonomyGate (388) | wiring |

### Edge `router.ts` (2,535 lines) → thin router

- `router.ts` keeps ONLY `createMobileApiHandler`, `matchRoute` (route-kind table + role guards), dispatch, response envelope, payload-size guard.
- `router/request-validation.ts` ← the `parse*` body validators (parseWorkerStatusUpdate, parseWorkerAccessCheckIn, …) + storage-ref validators (isSupabaseJobMediaStageRef, isAccessCheckInPhotoRef, isCompletionPhotoRef).
- Contract types inlined here today (KaelEstimate :73 / CreateJobResponse :105 / KaelChatResponse :162) **leave for shared** — see C2.

### Mobile `worker-surfaces.tsx` (9,709) → `components/worker/<surface>/`

Reconciled with #3 worker Case Work (jobs board → Kael Case Work + "điều chỉnh" → on-site status; money view in profile; "Kael hỗ trợ nhận việc" via notifications).

| Target module | Owns |
|---|---|
| `worker/home/` | WorkerHomeSurface + map stage (WorkerMapStage, CompactWorkerPresenceMap, map line/route/coverage, controls/modal), readiness panel, availability toggle, home service grid/tiles |
| `worker/jobs/` | WorkerJobsSurface + JobRoom* + phase-context cards + Needs* cards + ActiveWorkerJobCard + IncomingRequestSheet + scope-change/cancellation/completion-evidence boxes (#3 "điều chỉnh" lives here) |
| `worker/chat/` | WorkerChatSurface + content + composer dock + Kael parity panel + chat bubbles/icons |
| `worker/earnings/` | WorkerEarningsSurface + hero/ledger/trend/summary |
| `worker/profile/` | WorkerProfileSurface + level card + content + verification form + service-area picker |
| `worker/dock/` (shell) | WorkerFrame, WorkerScreenHeader, WorkerStandaloneHeader, WorkerDockOverlay/Icon |
| `worker/ui/` (worker-local primitives) | glass/liquid layers, motion field, SegmentFilter, Metric, PressButton, icon set (promote truly-generic ones to `components/ui/`) |

### Mobile `customer-surfaces.tsx` (7,776) → `components/customer/<surface>/`

Reconciled with #3 customer Case Work (home → booking intake → Kael Case Work → confirm → history/matching → done+pay → review + ⭐ save-worker).

| Target module | Owns |
|---|---|
| `customer/home/` | CustomerHomeSurface + service cards |
| `customer/booking/` | CustomerBookingEntrySurface (intake: info+photo+video+voice+address+date), CustomerKaelSurface entry |
| `customer/kael-chat/` | **already split** (thread.tsx, state.ts, kael-chat-surface.tsx, helpers.ts, agentic-parts.tsx) — keep as the Case Work chat home; do NOT re-split |
| `customer/history/` | CustomerHistorySurface + timeline/panels (phase-context, cancellation-context, empty timelines, completion evidence, done hero/timeline, review/price/chat panels, completion presence map) |
| `customer/profile/` | CustomerProfileSurface + account-info fields + care card (future #3 D-A: ⭐ saved-workers / direct-rebook entry) |
| `customer/dock/` (shell) | CustomerV4DockOverlay, V4Frame, V4Dock |
| `customer/ui/` (customer-local primitives) | V4ServiceCard, V4TicketCell, V4Metric, QuickCard, ListRow, ActionRow, KaelMascot, buttons, chips, icons, glass/liquid (promote generic to `components/ui/`) |

### One concept = one home (resolves the drift)

**C2 — contracts (KaelEstimate ×4 / CreateJobResponse ×3 / KaelChatResponse ×3):**

| Concept | Current homes | Canonical home | Action |
|---|---|---|---|
| KaelEstimate | mobile `api-types.ts:34`, shared `api-responses.ts:22`, edge `router.ts:73`, edge `kael/types.ts:282` | `packages/shared/src/types/api-responses.ts` | mobile re-exports; edge imports; delete the 3 copies |
| CreateJobResponse | mobile `api-types.ts:51`, shared `api-responses.ts:54`, edge `router.ts:105` | same | same |
| KaelChatResponse | mobile `api-types.ts:115`, shared `api-responses.ts:116`, edge `router.ts:162` | same | same |
| constants/validation dup | `supabase/functions/_shared/domain.ts` (628-line standalone copy) | `packages/shared` | Edge imports shared (resolve Deno↔npm, OQ5); delete `domain.ts` |
| parity test | string-slice `mobile-wiring.test.ts:3756–3790` | — | replace with a real value-level test once there is one source |

**C2 — AI provider types (`AIProvider`/`AIMessage`/`AIRequest`/`AIResponse`/`AIError`/… ×3) — resolved 2026-06-30 (G3a):** canonical home = `packages/shared/src/types/ai.types.ts`; `apps/api/src/lib/ai/types.ts` now re-exports it (the `signal?: AbortSignal` extension was folded into the canonical), and `AIUsage`/`AIResult` collapsed to one home (dup grandfather entries removed). The Edge copy in `supabase/functions/mobile-api/_shared/kael/types.ts` is **intentionally NOT unified** — it adds Anthropic prompt-caching (`cache_control`/`cacheStatus`), Perplexity multi-provider search params, base64 image sources, and `citations`, and Deno cannot import `packages/shared`. So the AI* names stay grandfathered as `[shared, edge]` (2 homes by design, documented at both sites), not a byte-equivalent mirror.

**C3 — Kael brain (2 runtimes):**

| Layer | Location | Target |
|---|---|---|
| Edge runtime (canonical) | `supabase/functions/mobile-api/_shared/kael/**` (~59 files) | stays canonical; runtime wiring only |
| Shared pure logic | `packages/shared/kael/**` (now 8: + `parsing.ts`) | Carries only cross-runtime-safe pure logic. Lifted 2026-06-23: `safeParseJSON` (canonical npm-side; apps/api re-exports). NOT liftable: prompts/vision/pricing/market — the apps/api↔Edge pairs are intentionally divergent (Edge adds cost-tracking, source-trust, spend-gate, multi-provider) and Edge cannot import shared anyway |
| apps/api reference | `apps/api/src/lib/kael/**` (10) + `apps/api/src/lib/learning/**` (7) | LIVE Next.js reference (jobs route → `runKaelPipeline`, review route → `runLearningHook`); RN-path-independent (verified). Full RETIRE is a Tu governance call, not mechanical — the genuinely removable dup is tiny (`safeParseJSON` done; optional: learning payload guards). Until then: reference-only, do not extend as a parallel brain |

**C3 mapping outcome (2026-06-23):** an exhaustive cross-region map (workflow `c3-kael-brain-map`) confirmed the "one brain" goal is mostly already met by ownership, not by code moves. Kael spans 3 regions: Edge `_shared/kael` (~44 modules, canonical, RN runtime), apps/api `lib/kael`+`lib/learning` (live reference), and `packages/shared/kael` (pure contract/util). Removable duplication is small and dominated by the boundary-forced Edge mirror + intentional divergence (no safe change can collapse the divergent prompts/vision/pricing pairs). Concrete reduce shipped: `safeParseJSON` → `packages/shared/kael/parsing.ts` (3 copies → 2; Edge keeps its boundary copy). Finding: the Edge `utils.ts` `safeParseJSON` is *less* hardened than the canonical (no input-length / max-depth guard) — low severity (LLM output is provider token-capped), tracked as a follow-up, not fixed here (Edge = high-risk RN runtime, out of safe-C3 scope).

**C3 decision (2026-06-29, Tu):** accepted option (a) — keep the documented 3-region boundary; do NOT retire the apps/api Kael now. Verified at decision time: no `apps/mobile` or `supabase/functions` file imports `apps/api` / `@home-services/api` (enforced by the `lint:structure` C3 runtime-boundary check), and `runKaelPipeline` / `runLearningHook` are consumed only inside `apps/api/src` (`lib/jobs/create-job.ts` + the review route). apps/api Kael stays a RN-path-independent Next.js reference (reference-only, do not extend); a full retire remains an explicit governance call, not a mechanical step.

### #3 cross-dependency (do not split mobile twice)

The mobile groupings above are simultaneously the C1/C4-mobile map AND #3's surface home. New #3 chains land in these modules: `favorite_workers` + direct-rebook (`customer/profile` + `customer/history`), pre-arrival plan adjust (`worker/jobs`, unify with on-site scope-change), payment-confirm gating + worker money view (`worker/earnings` + `worker/profile`, #5 §S4), dual-chat scoping (kael-chat modules). Phase-gated reveal renders FROM `packages/shared/src/workflow/workflow-phase-context.ts` + `workflow-ui-rules.ts` + `JOB_STATUS_TO_WORKFLOW_PHASE`; surfaces read visibility from this contract and never self-invent.

### Open items for build phases

- OQ5 (Deno↔shared import mechanism) — spike in C2/P4.
- `services/_shared.ts` may itself split if it grows past one cohesive chain (revisit in P6a); start as one module to avoid premature fragmentation.
- Payment chain (`services/payment.service.ts` + §S4 domains) is intentionally **absent** here — gated to P9.

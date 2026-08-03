# Code Ownership Map

Status: active agent navigation contract.

This document tells Codex, Claude Code, and future AI coding agents where workflow behavior lives in code. It is not a product spec. `governance/STRUCTURES.md` remains the workflow source of truth; this file maps that workflow to implementation owners.

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
- `supabase/functions/mobile-api/_shared/http.ts` owns the handler; `http/routes/**`, `http/dispatch/**`, and `http/dto/**` own route matching, dispatch, and request validation.
- `supabase/functions/mobile-api/_shared/domains.ts` composes `MobileApiServices`; `domains/**` owns Edge workflow reads/writes, DB/RPC/Storage calls, notifications, matching, and service-role behavior.
- `supabase/functions/mobile-api/_shared/kael.ts` is a backward-compatible re-export shim; `kael/index.ts` is the public barrel and `kael/**` owns Edge Kael pipeline/provider behavior. Mobile must not call AI providers directly.
- `supabase/functions/_shared/domain.ts` and `packages/shared/src/validation.ts` are compatibility facades; their hand-maintained Edge/npm contract twins live in `supabase/functions/_shared/contracts/**` and `packages/shared/src/contracts/**`.
- `packages/shared/src/constants.ts`, `contracts/**`, and `mobile-workflow.ts` own shared service scope, schemas, state transitions, selectors, and type-level contracts.
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
| A2-A6 service/problem/description/media/estimate/time | `apps/mobile/app/(customer)/booking.tsx` | `CustomerBookingEntrySurface` | `setPendingKaelChatDraft`, `onOpenKael`, later `uploadJobMediaDrafts` once a job exists | `POST /kael/chat`, `POST /jobs/:id/media` | `mobile-wiring.test.ts`, `mobile-backend-wiring.test.ts` |
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
| Workflow phases, artifact lifecycle, action gates, and UI visibility contract | `packages/shared/src/workflow/**` | per-screen data-existence checks or AI output payloads |
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
| Route matching and role guards | `supabase/functions/mobile-api/_shared/http.ts`, `http/routes/**`, `http/dispatch/**`, and `http/dto/**` | handler, route-kind matching, dispatch, and request validation stay separate |
| Workflow DB/RPC/Storage behavior | `supabase/functions/mobile-api/_shared/domains.ts` plus `domains/**` | `domains.ts` composes the service surface; service-role behavior stays in the owning domain module |
| Kael provider pipeline | `supabase/functions/mobile-api/_shared/kael/**` via `kael/index.ts`; `kael.ts` remains a shim | `pipeline/pipeline.ts` coordinates prepare, intent, knowledge, parallel, baseline, synthesis, and assembly stages; `tools/**` owns stage behavior, `kael-providers/**` owns provider routing/client health, `pipeline/orchestrator.ts` owns timeout/parallel execution, and `pipeline/streaming.ts` owns progress target writes. AI secrets stay server-side |
| Kael knowledge/RAG | `supabase/functions/mobile-api/_shared/kael/tools/knowledge.ts`, knowledge corpus migrations, `docs/foundation/kael-knowledge-corpus.md`, and `apps/api/scripts/kael-b3-*` / `kael-b5-*` | Runtime retrieval, pgvector/hybrid matching, source-audited corpus generation, and knowledge usage logging stay server-side. Mobile may display resulting Kael text/artifacts only; it must not fetch or embed knowledge directly. |
| Kael autonomy gate | `supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate.ts`, `pipeline/orchestrator-facade.ts`, apply-decision migrations, and autonomy tests | LLM/policy proposals must become validated `KaelAutonomyDecision` objects. DB mutations stay behind deterministic schema, state-machine, permission, invariant, evidence, confidence, and audit gates. |
| Kael guardrail observability and red-team corpus | `supabase/functions/mobile-api/_shared/kael/kael-guardrails/self-check.ts`, `kael-guardrails/boundary-guard.ts`, guardrail audit migrations, and `apps/api/src/__tests__/security/kael-redteam/**` | Regex fast-path remains cost-free; semantic classifiers are opt-in/bounded and fail closed. Guardrail trips are audited for later LS7/red-team feedback. |
| Kael charter and response style | `packages/shared/kael/charter/**`, `supabase/functions/mobile-api/_shared/kael/prompts/system-prompt.ts`, `kael-guardrails/self-check.ts`, `pipeline/orchestrator.ts`, and `GET /kael/charter` | P8 charter source files define locked identity/persona/mission and tunable tone/language/forbidden/style rules. Edge mirrors the public-safe runtime prompt bundle without importing `packages/shared`, and `self-check.ts` owns deterministic response screening before fallback |
| Kael learning skills | `supabase/functions/mobile-api/_shared/kael/learning/skills/**`, queue call sites in `domains.ts`, and `kael_rule_*_log` migrations | P7 learning is queued behind Edge/service-role flow. Skill registry owns immutable forbidden effects, allowed targets, evidence gates, lifecycle, runtime flags, A/B gating, and rollback signals. It must not execute learning inline during customer/worker workflow writes |
| Kael monitoring and A/B dashboards | `public.kael_ab_experiments`, `public.kael_ab_price_synthesis_cases`, `public.kael_monitoring_provider_daily`, `public.kael_monitoring_ab_price_synthesis` | P17 monitoring is DB-owned. Service role writes experiment/case rows, admins read through `security_invoker` views, and sample collection must not fabricate provider or price data. |
| Transition validity | `supabase/functions/mobile-api/_shared/platform/lifecycle.ts` plus event ownership in `workflow-orchestrator.ts` | keep backend state machine authoritative; AI and mobile may request actions but must not set phases directly |
| Access checks | `supabase/functions/mobile-api/_shared/platform/access.ts` | customer/worker/admin authorization |
| Push helper | `supabase/functions/mobile-api/_shared/platform/push.ts` | push is best-effort; notification rows remain source of truth |
| Rate limit | `supabase/functions/mobile-api/_shared/platform/rate-limit.ts` | protect AI/provider routes |
| Kael Harness shared contracts | `packages/shared/kael/**` | charter skeletons, permission-purpose types, and future shared Kael governance contracts |

`apps/api/src/**` mirrors/reference-tests many of these behaviors for Next.js/admin/support. It is not the store-bound mobile runtime unless Tu explicitly changes scope.

### C3 — One Kael brain (Edge canonical)

The Edge `supabase/functions/mobile-api/_shared/kael/**` is the single **canonical** Kael brain on the store runtime. `apps/api/src/lib/kael/**` and `apps/api/src/lib/learning/**` are **non-canonical** Next.js reference/parity only: they are off the RN/Edge path, must not be treated as the source of truth, and must not be extended as a parallel brain. (Decision: stack-unification #5 D3; Edge already imports neither `apps/api` nor `packages/shared`.) The Deno↔npm boundary means the Edge cannot import `packages/shared`: `supabase/functions/_shared/contracts/**` and `packages/shared/src/contracts/**` are hand-maintained schema twins guarded by `contract-parity.test.ts`, while `domain.ts` and `validation.ts` preserve their old public facades. Edge Kael logic stays self-contained (it is **not** lifted into shared); `packages/shared/kael/**` carries only the cross-runtime-safe pure logic consumed by mobile + apps/api. Enforced: `pnpm lint:structure` fails if any `apps/mobile/**` or `supabase/functions/**` source imports from `apps/api` (RN/Edge independence).

## UI System Ownership

| Concern | Owner | Notes |
|---|---|---|
| Shared dock/tab motion | `apps/mobile/components/customer/dock/**`, `apps/mobile/components/worker/dock/**` | must preserve tab-safe navigation; never use `push(item.path)` for tab switching |
| Glass material fallback | `apps/mobile/components/ui/glass-surface.tsx` | must handle Reduce Transparency |
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
| Address autocomplete and worker directions | `customer/booking/use-booking-address-lookup.ts`, `placesService.autocomplete`, worker map surfaces | `POST /places/autocomplete`, Edge-only Maps keys; worker UI may open public Maps directions only with the accepted/released address | `docs/foundation/geo-data-spike.md`, staging verification doc, `mobile-wiring.test.ts` |

## Tests And Static Gates

Use the narrowest relevant check first, then broaden when shared behavior changes.

| Change Area | Primary Checks |
|---|---|
| Service scope / constants / schemas | `packages/shared/src/__tests__/constants.test.ts`, `validation.test.ts`, `contracts-parity.test.ts` |
| Mobile workflow state | `packages/shared/src/__tests__/mobile-workflow.test.ts` |
| Mobile wiring/static boundaries | `packages/shared/src/__tests__/mobile-wiring.test.ts`, `mobile-backend-wiring.test.ts`, `monorepo-wiring.test.ts` |
| Edge/API routing and runtime | `apps/api/src/__tests__/unit/mobile-api-edge-router.test.ts`, `mobile-api-edge-runtime.test.ts`, `apps/api/src/__tests__/schema/mobile-api-edge-schema.test.ts` |
| Kael/provider behavior | API Kael unit tests, `kael-schemas.test.ts`, `pricing.test.ts`, `ai-client.test.ts`, `apps/api/scripts/kael-eval.mjs` |
| Kael charter and response style | `packages/shared/src/__tests__/kael-charter-p9.test.ts`, `apps/api/src/__tests__/unit/mobile-api-kael-p8.test.ts`, `mobile-api-edge-schema.test.ts`, staging `GET /kael/charter` smoke, staging advisors |
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

> **Status: MIXED — read the per-subsection status.** This is the C1 deliverable of the stack-reorg (`docs/architecture/stack-unification-plan-20260616.md` §5). Every table ABOVE this section describes today's owners.
>
> - **`components/worker/` subsection: CURRENT STATE.** The worker split executed in `Plan.md` §44 (2026-07-27); its table reflects the real tree with measured line counts.
> - **`components/customer/` subsection: CURRENT STATE.** The customer bucket reorg executed in `Plan.md` §44 Phase 2 (2026-07-27); its table reflects the real tree with measured line counts.
> - **All other subsections: TARGET blueprint.** They describe where code MOVES during the reorg (P4–P6) and their "current" line counts predate later work, so treat them as stale until re-verified. Do not move files from those alone — follow the build handoff sequencing.

### Arrangement law (from #5 §0.5 — binds every grouping here)

Right-size + group-by-relation into cohesive "chains"; **one concept = one canonical home**. The success metric is "a human/AI understands it at a glance," NOT lines-per-file. Do **not** fragment a domain into many tiny uniform files (that recreates the god-file mess); do **not** keep god-files. The line numbers below are *loose* guidance for where code lives today, not size targets.

### Edge `services.ts` (10,042 lines) → `supabase/functions/mobile-api/_shared/domains/` chains — **EXECUTED**

One module per workflow domain; `domains.ts` assembles them into `MobileApiServices` (today's `createEdgeServices`).

> Executed in `Plan.md` §46. The 10,042-line god-file `_shared/services.ts` no longer exists — `_shared/domains.ts` is now only the composition root, and the workflow modules live under `domains/**`. **The target module names and line numbers in the table below are the original blueprint plus its anchors into the deleted god-file; they are kept as the design record and do NOT resolve against today's tree** (which uses `domains/job/**`, `domains/matching/**`, `domains/worker/**`, `domains/customer/**`, …). For today's owners read the Edge Runtime Ownership table above, not this table.

| Target module | Owns (current functions, by line) | Domain |
|---|---|---|
| `domains/jobs.service.ts` | createJob (774), cancelAnalyzingJob (1159), getJob (2658), listCustomerActiveJobs (2728), attachJobMedia (5144), job geo (geocodeConfirmedKaelJob 9314, geocodeJobAddressForMatching 9351, updateJobGeo 9559), recordPipelineLearningApplications (1223) | customer job lifecycle |
| `domains/matching/broadcasts.ts` | confirmSearch (2748), rollbackFailedBroadcastStart (2968), acceptBroadcast (3398), declineBroadcast (3506), persistWorkerBriefGuidanceAfterAccept (3445), createBroadcasts (7183), broadcast-state helpers (7768–7866), queryEligibleWorkers (7935), rankEligibleWorkers (8093), loadDisintermediationRiskCounts (8037), loadJobGeoForMatching (8066) | matching + broadcast |
| `domains/status.service.ts` | updateJobStatus (3577), buildKaelCompletionDecision (3846), apartment-access / X-2 check-in handshake (buildInitialApartmentAccessState 8905 … authorizeApartmentAccess 9161, buildCheckInAccessState 9264, buildAuthorizedReleaseAccessState 9298, address-access projection 9033–9140) | worker on-site status + unit access |
| `domains/scope-change.service.ts` | requestScopeChange (3885), tryAutoApproveScopeChange (4829), getWorkerScopeChangeRate (4870), decideScopeChange (5607), scopeDecisionToJobStatus (5721), logScopeChangeEstimateApiCall (4847), scopeChangeRiskConfig (9608) | scope change |
| `domains/cancellation.service.ts` | previewCustomerCancellation (408), gate{Customer,Worker}CancellationBeforeMutation (449/512), requestCustomerCancellation (3026), requestWorkerCancellation (4887), decideWorkerCancellation (5591), cancelJob (2991) | cancellation |
| `domains/dispute.service.ts` | openDispute (3249), submitDisputeCounterStatement (3336), decideDispute (3363) | dispute |
| `domains/completion-review.service.ts` | confirmCompletion (5725), buildKaelCustomerAcceptedCompletionDecision (5838), submitReview (5883), submitCustomerKaelFeedback (6000), recordNormalTransactionMemory (6050) | completion + review |
| `domains/chat.service.ts` | listJobMessages (5297), sendJobMessage (5320), job-chat contact guard (5394–5438), insertKaelJobMessage (5546), markJobMessagesRead (5569), maybeHandleDemandingCustomerJobChat (5516) | per-job chat |
| `domains/kael-chat.service.ts` | createKaelChat (1242), getKaelChat (1585), progress/stream (1625–1671), sendKaelChatTurn (1862), confirmKaelChat (1967), advanceKaelChatEstimate (2156), buildKaelConversationContext (2506), boundary-guard + demanding-customer hooks (1536/2094) | customer Kael Case Work |
| `domains/worker-kael.service.ts` | askKaelForWorker (4144), buildWorkerKaelAnswer (4208), summarizeWorkerVision (4131), createWorkerKaelChat (4233), listWorkerKaelChats (4296), getWorkerKaelChat (4314), sendWorkerKaelChatTurn (4336), worker Kael feedback/consent (4736–4828) | worker Kael assist |
| `domains/workers.service.ts` | registerWorker (6228), getWorkerProfile (6579), updateWorkerAvailability (6617), listWorkerBroadcasts (6641), listWorkerJobs (6703), getWorkerEarnings (6763) | worker profile + board |
| `domains/kael-memory.service.ts` | getMyKaelMemory (6323), getWorkerKaelMemory (6348), deleteMyKaelMemory (6372), updateMyKaelMemory (6399), listMyPendingDecisions (6461), listMyThreads (6514) | Kael memory + "me" views |
| `domains/notifications.service.ts` | listNotifications (7090), markNotificationRead (7129), registerDevicePushToken (7156), all `notify*` (7249–7739), insertUserNotification (7739) | notifications |
| `domains/places-geo.service.ts` | placesAutocomplete (640), vietmap/google autocomplete (658/697), geocodeWith{Vietmap,GoogleMaps} (9391/9449), buildGeocodingAddress (9491), vietmap helpers, map-key readers (9580/9589) | places + geocoding |
| `domains/catalog.service.ts` | listServices (577), getKaelCharter (573), catalog baseline helpers (9769–9810) | service catalog + Kael charter read |
| `domains/admin.service.ts` | invalidateMarketCache (6821), evaluatePriceSynthesisAbCaseAdmin (6850), Kael-learning admin (processQueue 6861 / batch 6875 / monitor 6889 / candidates list-approve-reject-deny 6901–7011) | admin / learning ops |
| `domains/_shared.ts` (import, never duplicate) | serializers (serializeKael* 8379–8433, serializeJobMessage 8459), error mappers (map*Error 8569–8803), coercions (asX/nullableX 9748–10042), db helpers (db 9649, dbQuery 9653, fetchJsonWithTimeout 9636), media-path validation (validateJobMediaPath 8826, canAttachJobMediaStage 8844, storageRef 8855), labels (serviceLabel 8863, districtLabel 8869), audit (logJobEvent 8173, auditGuardrailTripBestEffort 8197, queueKaelLearningEvent 8246, logApiCalls 8293, logMemoryAudit 8264) | shared edge utilities |
| `domains.ts` | createEdgeServices (306) assembler + runPolicyAutonomyGate (388) | wiring |

### Edge `http.ts` (2,535 lines) → thin router

- `http.ts` keeps ONLY `createMobileApiHandler`, `matchRoute` (route-kind table + role guards), dispatch, response envelope, payload-size guard.
- `http/request-validation.ts` ← the `parse*` body validators (parseWorkerStatusUpdate, parseWorkerAccessCheckIn, …) + storage-ref validators (isSupabaseJobMediaStageRef, isAccessCheckInPhotoRef, isCompletionPhotoRef).
- Contract types inlined here today (KaelEstimate :73 / CreateJobResponse :105 / KaelChatResponse :162) **leave for shared** — see C2.

### Mobile `components/worker/` — CURRENT STATE (worker module map updated §44 Phase 3, 2026-07-27)

**This worker subsection is current state, not a target.** The split executed in `Plan.md` §44 (Phase 1 style extraction + Phase 2 component moves); see that section for the per-symbol move history. The other subsections of C1 remain target-shaped and were not re-verified by §44.

Entry point is unchanged: `worker-surfaces.tsx` (12 lines) re-exports the five public surfaces from `worker-v5-flow.tsx`. Routes and tests import those names and were not touched by the split.

| Module | Lines | Owns |
|---|---|---|
| `worker-v5-flow.tsx` | 1,452 | Composition root only: the 5 public exports (`WorkerHomeSurface`, `WorkerJobsSurface`, `WorkerChatSurface`, `WorkerEarningsSurface`, `WorkerProfileSurface`), `useWorkerV5Screen`, the `WorkerV5ScreenSurface` shell/chrome/hero, the `WorkerV5Body` dispatcher (switch on `screen.id`), `getWorkerV5PrimaryAction`, `buildHeroLine`/`buildHeroBody`, `AuthorityCard`. Deep module by design — it IS the assembly point; do not split further. |
| `worker-v5-flow-styles.ts` | 2,461 | The single `StyleSheet.create` block for every surface still rooted in the composition root and its moved bodies. Pure style data, no JSX/logic. Grandfathered oversize in `scripts/structure-baseline.json`; splitting it per bucket is a possible follow-up, not done in §44. |
| `worker/home/` | 11 files · 1,768 | `WorkerV5HomeScreenSurface` + `WorkerV5HomeBody` + `buildDealSummary` (`screen-surfaces.tsx`), availability toggle + spring (`availability-surfaces.tsx`), map stage + VietMap static preview/image (`map-stage-surfaces.tsx`), plus the pre-existing quick-action/readiness/body chains |
| `worker/jobs/` | 47 files · 8,409 | Offer icons + opportunity inbox / offer detail / customer-confirmation-wait bodies (`inbox-offer-surfaces.tsx`), in-progress body + travel gate + field-evidence types (`in-progress-surfaces.tsx`), scope-change body (`scope-change-body-surfaces.tsx`), route map stage + authenticated route preview/image + status timeline (`route-map-surfaces.tsx`), header subtitle builders (`header-copy.ts`), plus the pre-existing acceptance/offer/completion/timeline chains |
| `worker/chat/` | 17 files · 4,242 | Kael orb screen surface + intake-readiness actions + composer (`orb-screen-surfaces.tsx`), Kael chat body + shared job-incident chat + job-intake body (`kael-body-surfaces.tsx`), plus the pre-existing orb/session-menu/body chains |
| `worker/earnings/` | 14 files · 1,694 | Payout-method body (`payout-method-body-surfaces.tsx`) plus the pre-existing hero/ledger/overview/payout chains |
| `worker/profile/` | 31 files · 5,610 | Ranking hero (`ranking-hero-surfaces.tsx`), agent-memory body (`agent-memory-surfaces.tsx`), settings body (`settings-body-surfaces.tsx`), service-area map card (`service-area-map-surfaces.tsx`), reliability hero + axis fill (`reliability-hero-surfaces.tsx`), plus the pre-existing level/verification/body chains |
| `worker/dock/` (shell) | 4 files · 806 | Dock overlay, screen definitions, worker screen id/section/phase types |
| `worker/ui/` (worker-local primitives) | 18 files · 3,228 | Cross-cutting atoms moved out of the god-file: `screen-atoms-surfaces.tsx` (`InfoListCard`, `WorkerV5ScreenInfoRow`, `MetricTile`), `screen-icons.ts` (`workerV5Icons`, service/opportunity icon maps, profile icon boost set), `screen-labels.ts` (`workerV5DisplayCode`), `screen-navigation.ts` (`workerV5JobsDestinationScreenId`); plus the pre-existing aura/format/primitives/metrics/icon-asset chains |

Naming collision resolved during the split: the god-file's local `WorkerV5InfoRow` was renamed to **`WorkerV5ScreenInfoRow`** because `worker/jobs/shared-surfaces.tsx` already exports a different `WorkerV5InfoRow` (re-exported via `worker/ui/primitives-surfaces.tsx`). The two are distinct components; the screen-level one delegates to the primitive.

Convention for the moved files: each bucket module declares its own local `Text` font wrapper and `type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>`, matching what the already-split worker modules did before §44. Style objects are imported from `../worker-v5-flow-styles` unless the module owns a bucket-local `*-styles.ts`.

### Mobile `components/customer/` — CURRENT STATE (customer module map updated §44 Phase 2, 2026-07-27)

**This customer subsection is current state, not a target.** `Plan.md` §44 Phase 2 split the flat `customer/v21/` folder (112 files) into per-domain buckets that mirror `components/worker/`. Reconciled with #3 customer Case Work (home → booking intake → Kael Case Work → confirm → history/matching → done+pay → review + ⭐ save-worker).

Entry point is unchanged: `customer-surfaces.tsx` (10 lines) re-exports the six public surfaces from `v21/surfaces.tsx`. Routes and tests import those names and were not touched by the reorg.

| Module | Files · Lines | Owns |
|---|---|---|
| `v21/surfaces.tsx` | 1 · 1,774 | Composition root only: the 6 public exports (`CustomerHomeSurface`, `CustomerBookingEntrySurface`, `CustomerHistorySurface`, `CustomerProfileSurface`, `CustomerKaelSurface`, `CustomerV21DockOverlay` + `CustomerDockOverlay` alias) and the `CustomerHomeSurface` body. Deep module by design — it IS the assembly point; do not split further. |
| `v21/kael-chat-surface.tsx` | 1 · 7 | `KaelChatSurface` — binds `useCustomerKaelSurfaceController` to `CustomerKaelChatContent`. Kept beside the composition root because `customer/kael-chat/kael-chat-surface.tsx` is a retired path that `mobile-wiring.test.ts` asserts stays absent. |
| `customer/dock/` | 3 · 389 | Customer 4+1 dock overlay, its stateful wrapper, and dock styles (also consumed by the worker dock via `@/components/customer/dock/dock-styles`) |
| `customer/ui/` (customer-local primitives) | 13 · 3,249 | Shared screen chrome and primitives: `shared-surfaces.tsx`/`shared-styles.ts`, aura surfaces + styles, `use-v21-theme.ts`, `types.ts`, `copy.ts` (VI/EN), `route-params.ts`, `platform-styles.ts`, `value-display-model.ts`, `assets.ts` + the `assets/service-icons` PNGs, plus `payment-surfaces.tsx`/`payment-styles.ts` (shared by `profile/` and the case-work payment stage) |
| `customer/home/` | 1 · 311 | `home-storytelling-card.tsx` (home hero + storytelling). The `CustomerHomeSurface` body itself stays in the composition root |
| `customer/booking/` | 9 · 2,411 | Basic Intake entry: booking entry stateful surfaces, booking surfaces/styles, intake display model, media surfaces, performance intake surfaces, and the address-lookup / schedule-now / performance-intake hooks |
| `customer/history/` | 11 · 4,873 | `CustomerHistorySurface` chain: active/case/fulfillment/stage history surfaces + styles, and the service-history rail / filter rail / surface / styles |
| `customer/profile/` | 13 · 3,695 | `CustomerProfileSurface` chain: profile display model, stateful + utility + metrics surfaces, journey/metrics/settings/utility styles, ranking mark, and payment-method settings (`profile-payment-*`, `payment-bank-display-model.ts`) |
| `customer/kael-chat/` | 73 · 12,559 | Case Work chat home. Merges the 13 pre-existing modules (response cards, on-device voice transcript, saved workers, pending intake, case-work localization, media draft tray) with 60 moved from `v21/`: `agentic-*`, `case-*` display/response models, `chat-*` surfaces + styles, `customer-kael-*` (content/helpers/routing/presentation/state-scope/catalog), `kael-*` (composer, header, empty hero, process lines, session menu, liquid pressable), `use-customer-kael-*` hooks, plus the payment-confirm stage (`customer-payment-rail-surface.tsx`, `sepay-vietqr-payment-display-model.ts`) |

Ambiguous files were placed by reading real imports, not by name: `payment-surfaces.tsx`/`payment-styles.ts` → `ui/` (imported by both `profile/` and the payment stage), `payment-bank-display-model.ts` → `profile/` (single importer), `sepay-vietqr-payment-display-model.ts` → `kael-chat/`, `kael-liquid-pressable.tsx` → `kael-chat/` (no importer outside it), `use-kael-timeline-headline.ts` → `kael-chat/` (imported by the surface controller, not `history/`).

The customer payment-confirm stage is owned by `customer-payment-rail-surface.tsx`, rendered through `chat-case-thread-stateful-surfaces.tsx`. The earlier PR #135 draft (`payment-stage-stateful-surfaces.tsx`) was never wired and was deleted once PR #139 shipped the cash/SePay rail that replaced it.

### One concept = one home (resolves the drift)

**C2 — contracts (KaelEstimate ×4 / CreateJobResponse ×3 / KaelChatResponse ×3):**

| Concept | Current homes | Canonical home | Action |
|---|---|---|---|
| KaelEstimate | shared `api-responses.ts:52`, edge `supabase/functions/_shared/contracts.ts:37` | `packages/shared/src/types/api-responses.ts` | **RESOLVED** — mobile no longer declares it (`apps/mobile/lib/api-types.ts` re-exports from `@nestscout/shared`); the 4th home in Edge `kael/**` is gone; the remaining Edge twin is required by Deno↔npm and guarded by `contract-parity.test.ts` |
| CreateJobResponse | shared `api-responses.ts:91`, edge `supabase/functions/_shared/contracts.ts:55` | same | same |
| KaelChatResponse | shared `api-responses.ts:234`, edge `supabase/functions/_shared/contracts.ts:207` | same | same |
| constants/validation dup | `supabase/functions/_shared/domain.ts` and `packages/shared/src/validation.ts` — both are now `export *` facades | `supabase/functions/_shared/contracts/**` ↔ `packages/shared/src/contracts/**` | **RESOLVED** — the twins were split in parallel; the facades preserve the old public surface, and `contracts-parity.test.ts` fails CI on drift. `domain.ts` is NOT deleted: Deno cannot import `packages/shared` (see C3), so a hand-maintained twin is the design, not the debt |
| parity test | `packages/shared/src/__tests__/contract-parity.test.ts` (value-level, normalizes both type bodies) plus `contracts-parity.test.ts` for the schema twins | — | **DONE** — replaced the old brittle string-slice assertion |

**C2 — AI provider types (`AIProvider`/`AIMessage`/`AIRequest`/`AIResponse`/`AIError`/… ×3) — resolved 2026-06-30 (G3a):** canonical home = `packages/shared/src/types/ai.types.ts`; `apps/api/src/lib/ai/types.ts` now re-exports it (the `signal?: AbortSignal` extension was folded into the canonical), and `AIUsage`/`AIResult` collapsed to one home (dup grandfather entries removed). The Edge copy in `supabase/functions/mobile-api/_shared/kael/contracts/types.ts` (`AIMessage:484`, `AIRequest:488`, `AIResponse:504`, `AIError:529`; `AIProvider` sits one layer lower in `platform/kael-contracts.ts:4` because all three layers consume it) is **intentionally NOT unified** — it adds Anthropic prompt-caching (`cache_control`/`cacheStatus`), Perplexity multi-provider search params, base64 image sources, and `citations`, and Deno cannot import `packages/shared`. So the AI* names stay grandfathered as `[shared, edge]` (2 homes by design, documented at both sites), not a byte-equivalent mirror.

**C3 — Kael brain (2 runtimes):**

| Layer | Location | Target |
|---|---|---|
| Edge runtime (canonical) | `supabase/functions/mobile-api/_shared/kael/**` (~59 files) | stays canonical; runtime wiring only |
| Shared pure logic | `packages/shared/kael/**` (now 8: + `parsing.ts`) | Carries only cross-runtime-safe pure logic. Lifted 2026-06-23: `safeParseJSON` (canonical npm-side; apps/api re-exports). NOT liftable: prompts/vision/pricing/market — the apps/api↔Edge pairs are intentionally divergent (Edge adds cost-tracking, source-trust, spend-gate, multi-provider) and Edge cannot import shared anyway |
| apps/api reference | `apps/api/src/lib/kael/**` (10) + `apps/api/src/lib/learning/**` (7) | LIVE Next.js reference (jobs route → `runKaelPipeline`, review route → `runLearningHook`); RN-path-independent (verified). Full RETIRE is a Tu governance call, not mechanical — the genuinely removable dup is tiny (`safeParseJSON` done; optional: learning payload guards). Until then: reference-only, do not extend as a parallel brain |

**C3 mapping outcome (2026-06-23):** an exhaustive cross-region map (workflow `c3-kael-brain-map`) confirmed the "one brain" goal is mostly already met by ownership, not by code moves. Kael spans 3 regions: Edge `_shared/kael` (~44 modules, canonical, RN runtime), apps/api `lib/kael`+`lib/learning` (live reference), and `packages/shared/kael` (pure contract/util). Removable duplication is small and dominated by the boundary-forced Edge mirror + intentional divergence (no safe change can collapse the divergent prompts/vision/pricing pairs). Concrete reduce shipped: `safeParseJSON` → `packages/shared/kael/parsing.ts` (3 copies → 2; Edge keeps its boundary copy). Finding: the Edge `utils.ts` `safeParseJSON` is *less* hardened than the canonical (no input-length / max-depth guard) — low severity (LLM output is provider token-capped), tracked as a follow-up, not fixed here (Edge = high-risk RN runtime, out of safe-C3 scope).

**C3 decision (2026-06-29, Tu):** accepted option (a) — keep the documented 3-region boundary; do NOT retire the apps/api Kael now. Verified at decision time: no `apps/mobile` or `supabase/functions` file imports `apps/api` / `@nestscout/api` (enforced by the `lint:structure` C3 runtime-boundary check), and `runKaelPipeline` / `runLearningHook` are consumed only inside `apps/api/src` (`lib/jobs/create-job.ts` + the review route). apps/api Kael stays a RN-path-independent Next.js reference (reference-only, do not extend); a full retire remains an explicit governance call, not a mechanical step.

### #3 cross-dependency (do not split mobile twice)

The mobile groupings above are simultaneously the C1/C4-mobile map AND #3's surface home. New #3 chains land in these modules: `favorite_workers` + direct-rebook (`customer/profile` + `customer/history`), pre-arrival plan adjust (`worker/jobs`, unify with on-site scope-change), payment-confirm gating + worker money view (`worker/earnings` + `worker/profile`, #5 §S4), dual-chat scoping (kael-chat modules). Phase-gated reveal renders FROM `packages/shared/src/workflow/workflow-phase-context.ts` + `workflow-ui-rules.ts` + `JOB_STATUS_TO_WORKFLOW_PHASE`; surfaces read visibility from this contract and never self-invent.

### Open items for build phases

- OQ5 (Deno↔shared import mechanism) — spike in C2/P4.
- `domains/_shared.ts` may itself split if it grows past one cohesive chain (revisit in P6a); start as one module to avoid premature fragmentation.
- Payment chain (`domains/payment.service.ts` + §S4 domains) is intentionally **absent** here — gated to P9.

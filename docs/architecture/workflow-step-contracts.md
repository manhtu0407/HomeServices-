# Workflow Step Contracts

> Status: active reference. Phase 5.3 (plan §22.10.D, 2026-05-23).
>
> STRUCTURES.md §6 owns workflow truth. This doc maps each customer step
> A2-A7 to the implementation surface + the responsibility boundary that
> Booking wizard (Phase 3.1) enforces.

## A2 — Choose service

| Field | Value |
|---|---|
| Surface | `apps/mobile/components/customer/booking-wizard.tsx` → `ServiceStep` |
| Inputs | Service type (electrical | plumbing | cleaning) |
| Backend dependency | Service taxonomy in `service_categories` table (DB) |
| State transition | Wizard `select_service` → step `describe` |
| Validation | Service type must be supported (RULES.md Rule #6) |
| Failure modes | Unsupported tap is impossible (cards only render supported services) |
| Tests | `mobile-wiring.test.ts` checks BookingWizard exports + step `service` rendered |

## A3 — Describe issue

| Field | Value |
|---|---|
| Surface | `booking-wizard.tsx` → `DescribeStep` |
| Inputs | description (min 10 chars), 0-5 photos, address autocomplete (HCMC district required) |
| Backend dependency | Structured handoff to `KaelChatSurface`; media upload still uses `uploadJobMediaDrafts(stage='before')` once a job exists |
| State transition | Wizard `submit_describe` → stores `PendingKaelChatDraft` → opens the full-screen Kael chat for pre-analysis with the submitted fields already loaded |
| Validation | Description min 10 chars, district must be a known HCMC district |
| Failure modes | DescribeStep shows error if validation fails or API rejects |
| Tests | `booking-wizard-test.tsx` covers the Kael-chat handoff; address autocomplete tested separately |

## A4 — Kael clarification

| Field | Value |
|---|---|
| Surface | `kael-chat-surface.tsx` → `KaelIntakeReceiptCard`, `KaelProcessCard`, chat turns |
| Inputs | Booking form data arrives as preloaded intake; client adds only missing details if Kael asks |
| Backend dependency | `POST /kael/chat` and server-side Kael analysis |
| State transition | Kael chat creates/updates the session; once estimate is ready, the client auto-calls the validated Kael confirm route |
| Validation | n/a |
| Failure modes | If pipeline returns unsupported/no_baseline/AI_FAILED, Edge cancels the job and the wizard returns to `describe` step |

## A5 — Estimate card

| Field | Value |
|---|---|
| Surface | `kael-chat-surface.tsx` / `agentic-parts.tsx` → `EstimateCard` |
| Inputs | none required from client; client may inspect, cancel, or appeal later |
| Backend dependency | Kael chat estimate payload and `POST /kael/chat/:id/confirm` |
| State transition | Estimate-ready session auto-enters Kael orchestration; no manual price confirmation gate |
| Validation | Always shows price disclaimer (Rule #4) |
| Failure modes | If `estimate` is null, show a localized loading/unavailable state; never show dash values, zero price, or fake complexity |

## A6 — Time selection (deferred)

| Field | Value |
|---|---|
| Surface | No primary surface in Kael Autonomy v2 |
| Inputs | None; current product remains on-demand only |
| Backend dependency | none |
| State transition | Booking handoff skips this section and enters Kael chat pre-analysis |
| Failure modes | Do not render scheduling hints, fake slots, or disabled future-service controls in the primary transaction path |

## A7 — Kael orchestration

| Field | Value |
|---|---|
| Surface | `KaelChatSurface` / Activity |
| Inputs | none required from client; client may later cancel, appeal, or provide extra evidence |
| Backend dependency | `createJob` validates `KaelAutonomyDecision(action=start_matching)` and starts broadcast/matching |
| State transition | Kael validated decision moves job from estimate/ticket review to `broadcasting`; legacy `awaiting_customer_confirm` remains compatibility only |
| Validation | Mobile does not call `confirmRemoteSearch` as the primary gate; Kael chat uses `KaelAutonomyDecision(action=start_matching)` |
| Failure modes | Create-job/Kael failures surface in workflow provider state; wizard returns to describe or shows activity state honestly |

## Cross-cutting rules

- Wizard may auto-advance past A7 only when backend has returned a validated Kael orchestration state (Rule #7).
- Wizard does not show worker info — that lives in History tab once worker accepts.
- Kael Autonomy v2: final_price source is Kael-locked at the A7 autonomy baseline (`jobs.final_price = kael_price_max`). Workers do not change this value at B7.
- B7 completion evidence may be auto-confirmed by `KaelAutonomyDecision(action=confirm_completion)` when final price is locked and worker evidence is sufficient; otherwise the UI stays in Kael review/dispute state.

## Artifact Lifecycle Map

| Artifact | Owner | Primary surface |
|---|---|---|
| `service_request` / `process_ticket` | Kael from client intake | Booking wizard, Kael chat, Activity |
| `ai_diagnosis` / `ai_notes` | Kael | Kael chat trace and Activity chat |
| `estimate` | Kael policy pipeline | Kael chat estimate card, Activity price tab |
| `worker_brief` | Kael | Worker request/job room |
| `provider_match` / `booking` | Kael orchestration | Activity repair tab, worker jobs |
| `scope_change` | Kael decision with worker evidence and client appeal | Scope hard-stop modal and Activity price tab |
| `cancellation_review` | Kael policy decision | Activity and worker cancellation state |
| `completion_evidence` / `completion_review` | Worker evidence, Kael decision | Activity done tab and worker completion state |
| `dispute_decision` / `payment_decision` | Kael/admin policy, provider capability | Done/payment/review states |

All artifacts are audit records or phase-gated UI views. They are not raw LLM status writers; workflow transitions still require validated server decisions or legacy/manual recovery paths.

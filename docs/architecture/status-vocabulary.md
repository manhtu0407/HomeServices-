# Status Vocabulary

> Status: active reference. Phase 5.2 (plan §22.10.C, 2026-05-23).
>
> Job/broadcast/scope-change/worker-verification statuses are defined in three
> layers. This doc maps them and explains the intentional folding so
> debugging stops getting lost between layers.

## Three layers

### 1. Database enums (canonical, immutable shape)

Defined in init migration `supabase/migrations/20260511000000_init_schema.sql`
and refined by `20260513114845_align_structures_workflow.sql`.

Job status (17 values):
```
draft, analyzing, estimate_ready, awaiting_customer_confirm,
broadcasting, worker_matched, worker_on_way, arrived, inspecting,
repairing, scope_change_pending, completed_by_worker,
confirmed_by_customer, payment_pending, paid, reviewed, cancelled
```

Scope change status (per `20260513114845`):
```
none, requested_by_worker, reviewing_by_kael,
waiting_customer_decision, approved_by_customer,
rejected_by_customer, cancelled
```

Worker verification status:
```
draft, submitted, under_review, approved, rejected, suspended
```

### 2. Edge `lifecycle.ts` valid transitions

Defined in `supabase/functions/mobile-api/_shared/platform/lifecycle.ts`. Mirrors the
DB enum but enforces which transitions are allowed at runtime. Phase 2.0
(2026-05-23) keeps `completed_by_worker -> confirmed_by_customer` valid; the
final_price source change is enforced in services.ts, not the lifecycle map.

### 3. Mobile `LocalDealStatus` fold

Defined in `packages/shared/src/mobile-workflow.ts`. Mobile fold equals the
DB enum minus internal transient states the UI doesn't render distinctly.

Why fold rather than rename: keep mobile fold honest with backend; do not
invent new statuses; UI can still show transitional labels via copy without
introducing new persisted values.

### 4. Shared workflow view model

Defined in `packages/shared/src/workflow/**`. This layer maps backend
`JobStatus` into product workflow phases, artifact modes, allowed actions, and
phase-gated UI visibility. It does not create new persisted statuses and must
not mutate backend state.

Backend status `reviewed` maps to workflow phase `done`; do not introduce a
separate user-visible `reviewed` phase.

Customer/worker mobile surfaces should read this view model from
`packages/shared/src/workflow/**` instead of re-deciding progressive
workflow visibility from ad hoc data existence checks.

Open gap: no mobile surface currently consumes it. The `use-service-workflow.ts`
adapter that used to be named here had zero call sites and was deleted as dead
code; surfaces derive stage locally instead (for example `stepForStatus` in
`components/customer/kael-chat/case-stage-display-model.ts`). Closing this gap is
a separate decision, not a cleanup step.

Edge transition ownership lives in `workflow-orchestrator.ts`; `ai_estimate_ready`
and `ai_explanation_ready` are AI artifact events, while `kael_started_matching`
and the other `kael_*` autonomy events are validated server-side workflow
decisions. Mobile/customer actions only submit input, override, appeal, or
request allowed backend transitions.

Non-transition workflow commands such as cancellation requests and media attach
are tracked separately as `WORKFLOW_COMMAND_EVENTS`; they may validate whether an
action is allowed in the current phase without directly changing `jobs.status`.

## Kael chat autonomy adapter boundary

`confirm_kael_chat_atomic` is an intentional adapter boundary for the Kael-first
intake path. It creates the initial `jobs` row from a Kael chat session and may
return legacy `awaiting_customer_confirm` compatibility, but UI must label that
state as Kael orchestration rather than a customer gate. It is not a general
workflow orchestrator replacement and must not be used for later phase skips.
After the job exists, subsequent workflow-sensitive actions should pass through
`workflow-orchestrator.ts` events/commands or the legacy lifecycle validator
until fully migrated.
Duplicate `ALREADY_CONFIRMED` retries return the current job state when the job
already moved past ticket review. If the previous request stopped after job
creation and the job is still legacy `awaiting_customer_confirm`, the retry may
complete one idempotent matching transition; it must not create a duplicate
broadcast or log a second transition after `broadcasting`.

## Payment skip (Phase 5.5)

In Phase 0 the product has no payment rails. `lifecycle.ts` therefore allows
`confirmed_by_customer -> reviewed` directly (skipping `payment_pending` and
`paid`). When payment rails ship, lifecycle.ts must require
`payment_pending -> paid -> reviewed`; do not relax this once payment exists.

## Naming caveat: `activity` vs `history` (Phase 5.6)

Customer dock active key uses `'activity'` (label). Tab route file name and
TabName type use `'history'`. These are intentionally distinct: the dock
label is user-facing ("Hoạt động"), the route name is engineering
identifier. Tests should assert the dock label string AND the route name —
do not collapse them into a single identifier.

## Test coverage

- `packages/shared/src/__tests__/mobile-workflow.test.ts` covers LocalDealStatus fold.
- `packages/shared/src/__tests__/workflow-contract.test.ts` and
  `workflow-scenarios.test.ts` cover workflow phases, artifact lifecycle, UI
  visibility rules, and progressive behavior.
- `apps/api/src/__tests__/kael-edge-runtime/domains/` covers lifecycle transitions:
  `kael-job-detail.test.ts`, `kael-job-completion-payment.test.ts`,
  `kael-scope-change.test.ts`, `kael-cancellation-worker.test.ts`, and
  `kael-cancellation-customer-dispute.test.ts`.
- `apps/api/src/__tests__/unit/mobile-api-workflow-orchestrator.test.ts` covers
  Edge workflow event ownership before mobile-api mutates job status.
- New gate in Phase 5.7 asserts dock uses `replace(item.path)` and never `push(item.path)`.

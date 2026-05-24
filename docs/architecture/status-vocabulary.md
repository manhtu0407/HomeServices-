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

Job status (16 values):
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

Defined in `supabase/functions/mobile-api/_shared/lifecycle.ts`. Mirrors the
DB enum but enforces which transitions are allowed at runtime. Phase 2.0
(2026-05-23) keeps `completed_by_worker -> confirmed_by_customer` valid; the
final_price source change is enforced in services.ts, not the lifecycle map.

### 3. Mobile `LocalDealStatus` fold

Defined in `packages/shared/src/mobile-workflow.ts`. Mobile fold equals the
DB enum minus internal transient states the UI doesn't render distinctly.

Why fold rather than rename: keep mobile fold honest with backend; do not
invent new statuses; UI can still show transitional labels via copy without
introducing new persisted values.

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
- `apps/api/src/__tests__/unit/mobile-api-edge-runtime.test.ts` covers lifecycle transitions.
- New gate in Phase 5.7 asserts dock uses `replace(item.path)` and never `push(item.path)`.

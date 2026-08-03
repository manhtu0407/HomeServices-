# Worker Cancellation Flow (B6b)

> Status: active reference. P11 Agentic Case 3, 2026-05-25.
>
> STRUCTURES.md section 7 B6 describes the scope-change flow. This doc covers
> the sibling worker cancellation flow that lives in the same worker surface but
> is now governed by the P11 worker-cancel contract.

## Flow

```
Worker accepts job
  -> explicit cancel form OR no-show timer detects stale worker_matched
  -> Edge requestWorkerCancellation for explicit cancel
  -> request_worker_cancellation_atomic records taxonomy, fallback options,
     and abuse signals, then returns the job to broadcasting for replacement
  -> Edge validates/logs `KaelAutonomyDecision(action=process_cancellation,
     resulting_event=kael_processed_cancellation)`, notifies customer, writes
     worker memory red flag when needed, and opens kael_admin_queue for
     review-only abuse handling
  -> no-show timer enqueue_worker_no_show_reviews opens admin review and
     fallback options without mutating money, status, or suspension state
```

## UI

- Form: `apps/mobile/components/worker/worker-surfaces.tsx`
  IncomingRequestSheet cancellation block.
- Triggers visible only when `canRequestCancellation` is true: `worker_matched`,
  `worker_on_way`, `arrived`, `inspecting`, `repairing`, or
  `scope_change_pending`.
- Admin decision UI is still deferred to Edge admin + Supabase Studio/admin
  tooling. P11 requires admin review before any suspension.
- Duplicate explicit cancel requests should return the existing cancellation
  request state when Edge can verify the original worker request, without
  writing duplicate job events, notifications, broadcasts, or admin queue rows.

## Difference vs B6 Scope Change

| Concern | B6 scope change | B6b cancellation |
|---|---|---|
| Trigger | Real scope differs from original estimate | Worker cannot finish, or no-show timer detects stale match |
| Customer impact | Kael decides from scope evidence and policy; customer can add evidence, appeal, or cancel from A11 | Kael searches replacement; customer fallback options are wait 15 minutes, reschedule, or cancel no charge in Phase 0 |
| Final price | Kael compute | Unchanged; job either reassigns or cancels |
| Abuse handling | Price/risk review | Review-only red flag and `kael_admin_queue`; no autonomous suspension |

## Reason Taxonomy

- `legit_auto_approve`: `medical_emergency_with_evidence`, `family_emergency_confirmed`, `vehicle_breakdown_with_photo`
- `legit_with_admin_review`: `job_more_complex_than_described`, `unsafe_conditions_on_site`, `customer_not_responding_at_site`
- `suspicious`: `higher_pay_elsewhere`, `changed_mind`, `unable_to_find_address`
- `no_reason`: `no_reason`

## Anti-Abuse

P11 thresholds open review and soft L4 red flags only:

- cancellation rate above 30 percent in 30 days
- 3 consecutive cancels
- 2 no-reason cancels
- 1 cancel after arrival

Do not autonomously update `worker_profiles.is_suspended`, `is_available`, or
`verification_status` from this flow. Suspension is an admin action after review.

## Tests

- `apps/api/src/__tests__/unit/mobile-api-kael-p11.test.ts` covers P11
  classification, no-show detection, fallback options, anti-abuse, and review
  writes.
- `apps/api/src/__tests__/kael-edge-runtime/domains/kael-cancellation-worker.test.ts`
  covers the Edge worker cancellation runtime response and admin-review writes.
- `apps/api/src/__tests__/schema/mobile-api-edge-schema.test.ts` covers the P11
  migrations, RPC signatures, taxonomy, grants, and no-show SQL ambiguity guard.

# Worker Cancellation Flow (B6b)

> Status: active reference. Phase 5.4 (plan §22.10.E, 2026-05-23).
>
> STRUCTURES.md §7 B6 describes the scope-change flow. This doc covers the
> sibling worker cancellation flow that lives in the same surface (worker
> IncomingRequestSheet) but is a different lifecycle path.

## Flow

```
Worker accepts job
  -> realises they cannot finish (vehicle break-down, conflict, safety etc.)
  -> opens cancellation form (10+ char reason)
  -> submitWorkerCancellationRequest()
  -> Edge `requestWorkerCancellation`
  -> `request_worker_cancellation_atomic` RPC creates cancellation row,
     pauses the job, and (per migration `20260521120000`) auto-suspends the
     worker after 5 approved cancellations in 7 days.
  -> admin reviews; on approve, job goes to reassign / cancelled depending
     on remaining eligible workers.
  -> on reject, worker continues the job.
```

## UI

- Form: `apps/mobile/components/worker/worker-surfaces.tsx`
  IncomingRequestSheet → cancellation block.
- Triggers visible only when `canRequestCancellation` is true (status in
  `worker_matched`, `worker_on_way`, `arrived`, `inspecting`, `repairing`,
  `scope_change_pending`).
- Admin decision UI deferred to Edge admin + Supabase Studio for now
  (Phase 5.1 admin shell does not yet host this).

## Difference vs B6 scope change (Phase 2.0)

| Concern | B6 scope change | B6b cancellation |
|---|---|---|
| Trigger | Real scope different from original estimate | Worker cannot finish |
| Customer impact | Customer decides via A11 modal (Kael-computed price) | Admin decides; customer notified through `no_worker_found` if reassign fails |
| Final price | Kael compute (Phase 2.0) | Unchanged; job either reassigns or cancels |
| Rate limit | Per RULES.md AI cost cap | Per migration auto-suspend after 5 in 7 days |

## Tests

- `apps/api/src/__tests__/unit/scope-change.test.ts` covers RPC mapping for scope.
- `apps/api/src/__tests__/unit/mobile-api-edge-runtime.test.ts` covers cancellation request paths.
- Migration test coverage: `mobile-api-edge-schema.test.ts`.

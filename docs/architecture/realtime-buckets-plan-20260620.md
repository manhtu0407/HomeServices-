# P3c — Realtime + Storage Buckets (PROPOSE-ONLY)

> Status: **proposal for review, nothing executed.** Part of the stack-reorg #5 §S2 (realtime) + §S3 (buckets). No realtime code, migration, or bucket change was applied. Decisions needed from Tu before any execution.

## A. Realtime — already wired (no work needed; #5 §S2 claim was stale)

**Finding (evidence):** the #5 plan §A4/§S2 says *"Realtime is POLLING; realtime.ts prepared but NOT wired."* That is **out of date** on this branch. Realtime is implemented as the hybrid OQ3 asks for:

- `apps/mobile/lib/realtime.ts` header: *"Status: WIRED (MAP PLAN Phase 2, 2026-06-13) … these helpers are now the live fast-path; polling remains as a reduced-interval fallback so a dropped socket still recovers."*
- Helpers `subscribeToJobMessages` / `subscribeToJobStatus` / `subscribeToWorkerBroadcasts`, each RLS-scoped (jobs/chat via `is_job_participant`, broadcasts via `auth.uid()=worker_id`), return `null` when the client is unconfigured so every caller falls back to poll.
- Consumers: `frontend-workflow-provider.tsx` (job-status + worker-broadcasts), `use-job-chat-thread.ts` (chat messages — realtime delivery + mount reload, poll removed there).
- DB side ready: the `supabase_realtime` publication already contains `jobs, chat_messages, job_broadcasts, notifications, job_events, disputes, scope_change_requests, evidence_snapshots`.

**Conclusion:** OQ3 (hybrid: realtime primary + polling fallback, do NOT rip out polling) is **satisfied**. No wiring work remains.

**Remaining (outside wiring, flagged):** the §S2 **load test at ~1000 users is still outstanding** — it validates the realtime fan-out + the reduced-interval fallback under load (the ~67 req/s polling concern is mitigated by realtime being primary, but unproven at scale). That is a verification task, not a wiring task. Optional hardening to consider at load-test time: confirm fallback intervals, channel cleanup on unmount/background, and reconnect/backoff behavior.

**Recommendation:** mark #5's "wire realtime" item **done**; schedule the load test separately. No code change in this build.

## B. Storage buckets — consolidation proposal (recommend DEFER)

**Current 5 buckets (all private):**

| Bucket | Mimes | Limit | Purpose |
|---|---|---|---|
| `job-media` | img + mp4 | 25 MB | job lifecycle media, stage-keyed paths (`before/after/kael_reference/cancellation_evidence/scope_change_evidence/access_check_in`) |
| `job-photos` | img + mp4 | 10 MB | (legacy/separate) customer job photos |
| `completion-photos` | img | 10 MB | worker completion evidence |
| `worker-documents` | img | 5 MB | worker onboarding docs |
| `worker-verification` | img + pdf | 10 MB | CCCD/selfie + pdf (sensitive PII) |

**Live data:** **staging = 0 storage objects, 0 `job_media_assets` rows** (consolidation would be zero-risk on staging). **Prod has live objects** (the "8 `job_media_assets` rows" the handoff cites) → prod is the migration-risky surface.

**Why this is NOT a simple migration (the real cost):** the bucket names are referenced in **code**, not just the DB —
- Edge `services.ts`: `validateJobMediaPath`, `canAttachJobMediaStage`, `storageRef`, and `isSupabaseJobMediaStageRef(value, stage)` validate refs against the `job-media` host + stage path.
- Mobile `media-upload.ts` targets specific buckets for each upload kind.
So consolidating buckets requires **coordinated changes to Edge ref-validation + mobile upload targets + storage RLS policies + prod object copy + `job_media_assets` ref rewrite** — a cross-cutting change, not a lone DDL.

**Proposed target (IF pursued):**
1. Fold `job-photos` + `completion-photos` into **`job-media`** as additional stages (`intake`, `completion`) — unifies all job-lifecycle media under one stage-keyed bucket (matches the existing `job_media_assets` stage model + the router's stage-ref validator). Use the 25 MB limit + union mimes.
2. Worker docs: **keep `worker-verification` separate** (sensitive CCCD/selfie + pdf, stricter RLS/retention warranted); optionally fold `worker-documents` into it later. Low value.

**Safe migration approach (for when approved):** new migration + code change in one slice — (a) add the new stages to the validators, (b) copy prod objects to `job-media` under stage-prefixed paths, (c) rewrite `job_media_assets.bucket_id`/`object_path`, (d) update storage RLS policies, (e) only then drop the now-empty source buckets. Reversible checkpoints; verify object counts before/after. On staging it is a no-op data-wise (empty), so it can be rehearsed safely there first.

**Recommendation: DEFER.** Per §S3 this is "low priority"; it delivers tidiness with **no first-transaction value** and real cross-cutting risk (code + RLS + prod objects). The 5-bucket layout works correctly today. Revisit post-launch or when a concrete need arises.

## Decisions needed (Tu)
1. **Realtime:** accept "already wired — no action; load-test scheduled separately"? (recommended)
2. **Buckets:** **defer** (recommended), or approve the consolidation slice now (code + RLS + prod-object migration)?

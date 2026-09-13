# Worker Onboarding — Operational Workflow

Status: source workflow with two Admin gates. Hosted availability must be checked
against the exact release and migration inventory. This document does not certify
Production readiness; see the [transaction evidence log](../test-logs/2026-09-05_production-transaction-readiness.md).

## Safety boundary

All signups start as Customer. Worker intent does not grant a role through client
metadata. Worker authentication uses email/password; Customer social login is not
a Worker-onboarding shortcut.

Do not edit profiles.role, approval flags, availability or KYC status directly in
Studio or through service-role scripts to make onboarding appear successful.
The previous manual-role-flip instructions are retired. Use the public mobile API
and audited Admin decisions; synthetic SQL fixtures are not normal-account proof.

The runtime is Expo React Native → Supabase Auth → mobile-api → DB/RPC/Storage.
Next.js reference routes are not the store app's workflow boundary.

## Supported source flow

API paths below are relative to /functions/v1/mobile-api.

1. The applicant signs in normally and explicitly submits POST /worker-applications.
   GET /worker-applications/me restores the current application; opening the screen
   must not submit another application. Keep its client request ID across retries.
2. Admin reviews the application and uses POST
   /admin/worker-applications/:applicationId/decision. The access decision uses
   admin_review_worker_application_atomic and requires workers.review. Approval
   grants Worker access; it does not complete KYC or make the Worker available.
3. The Worker completes the profile. PATCH /workers/registration-draft saves valid
   partial information. GET /workers/me exposes saved-document presence flags,
   not private document URLs, and masks bank information. Upload only selected
   replacements or missing documents into the private verification bucket.
4. Explicit submission waits for draft acknowledgement, then POSTs
   /workers/registration-commands with a stable client_request_id and exact
   expected_draft_updated_at. Reconcile GET
   /workers/registration-commands/:clientRequestId after a timeout; do not invent
   another command while its outcome is unknown. The legacy /workers/register
   endpoint remains an expand-window compatibility path, not the new mobile flow.
5. Admin examines /admin/worker-applications/:applicationId/review-detail and uses
   the separate /profile-decision action for KYC. Send profile_review_queue_id from
   the displayed application and expected_profile_updated_at from its displayed
   profile, preserving timestamp precision. The API calls
   admin_review_worker_profile_snapshot_atomic; the legacy mutation is internal-only.
   The transaction checks the snapshot, records the audited decision and saves its
   immutable receipt. Retry the same queue, revision, decision and reason to recover
   that receipt, even after a later submission. STALE_REVIEW requires a fresh review;
   IDEMPOTENCY_CONFLICT must not silently change the previous decision.
   Clients missing the snapshot cannot perform KYC decisions; do not restore the
   legacy RPC grant as a compatibility workaround. Other onboarding reads remain available.
6. KYC approval still does not open supply. Readiness also needs the approved
   services/districts/capabilities, no suspension or active-job/reservation blocker,
   availability, and proven push delivery or a valid foreground heartbeat.
   Public booking requires three distinct real eligible/reachable Workers per
   service × district; synthetic actors do not count.

## Failure handling and current proof limits

- Treat a missing/invalid receipt or transport timeout as an unconfirmed outcome.
  Read the current application, profile and review history before another action.
  Do not convert it to a fake success or repair it with direct role/state writes.
- A partial server draft can be resumed without re-entering saved bank details or
  uploading the whole document set. An unsaved local selection is not durable proof.
- A local command-journal error does not mean a submission was sent. Preserve the
  journal, retry read-only reconciliation and escalate persistent corruption.
  Support-led corruption recovery and unknown Storage orphan retention are not yet
  proven; this runbook does not authorize deleting those records or objects.
- Staging rollback SQL proves 100 sequential KYC retries and old/new-round isolation.
  Collected HTTP and RN component tests cover the displayed snapshot, double press,
  wrong receipt identity, stale modal responses and unknown transport outcomes.
  This is not multi-connection concurrency, durable Admin relaunch reconciliation,
  hosted HTTP-to-SQL or physical-device proof. Those gates remain open.
- Local HTTP/RNTL tests and rollback-only Staging SQL cannot replace native,
  ordinary-account or Production full-transaction proof. Keep unresolved gates open.

## Owners and next verification

- Routes: supabase/functions/mobile-api/_shared/http/routes/worker.ts and
  http/routes/admin-control-routes.ts.
- Worker commands: domains/worker/registration-command.ts and registration-draft.ts.
- Admin decisions: domains/admin/control.ts, worker-review.ts and control-validation.ts.
  Domain paths are under supabase/functions/mobile-api/_shared.
- Mobile orchestration: apps/mobile/lib/frontend-workflow/worker-registration-recovery.ts
  and use-worker-registration-actions.ts; form: components/worker/profile/registration-surfaces.tsx.
- Verification: P163–P174 cover distinct local/SQL seams; consult their manifests
  and the evidence log for exact test results and missing hosted/native coverage.
  The next release must prove the public applicant → access → KYC → readiness flow
  without bypassing either Admin gate or ordinary-account authentication.

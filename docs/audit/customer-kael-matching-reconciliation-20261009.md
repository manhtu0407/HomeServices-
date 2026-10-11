# Customer Kael: job hydration and matching reconciliation

Point-in-time audit, 2026-10-09. Codex inspected Production read-only and implemented the approved mobile fix locally. No job was closed, cancelled, completed, or reassigned. No invitations or release were issued.

This historical snapshot predates separately authorized cleanup of an unrelated test record; it does not describe the current Production state.

## Identity and scope

- Checkout: `codex/stage1`, HEAD `d4275158a56cf5b253622974932833eefbc1a8a9`, with pre-existing Worker and Plan changes preserved.
- Production project: `[Production-project-ref]`; observed `mobile-api` v284, release `harness-[release-id-redacted]`. Staging was not used.
- Reported job: `[hvac-job-uuid]`, #[HVAC-case-ref], HVAC; session `[hvac-session-uuid]`.
- Preview: `http://localhost:8085/kael-chat?mode=case&jobId=[hvac-job-uuid]`, using the customer's existing authenticated session.

## Why the job appeared missing

The Backend created the job. Two overlapping calls to `hydrateRemoteJobById` for that same job incremented the selection generation independently. The earlier successful response therefore returned `false`; the Case hook treated it as a failed load and hid the job panel. The observed regression returned `[false, true]` in both resolution orders.

The fix shares an in-flight read only while job ID, token, account/role lifecycle and selection still belong to the current caller. A different job, account, role or token retires the old response. Failures clear the flight so explicit retry can issue a fresh read.

A provider-plus-Case-hook test also exposed a mount-order failure: child effects could read before the provider activated its session. Case now schedules the read after that activation; cleanup prevents an obsolete owner from starting or applying its read. Token changes reset the visible Case hydration state. Genuine failures expose a localized reload button.

## Backend response rhythm

Times below are Vietnam time, 09/10/2026.

Persisted order: customer location, estimate and `offer_review`, job creation, `kael_started_matching`, then `no_worker_found`.

After the fix, the actual Preview shows completed intake/analysis/offer steps and the server's exhausted matching receipt, including “Chưa có thợ phù hợp”, “Tìm lại thợ” and “Dừng tìm”. Reload preserves this state without a load-error banner. Browser error logs were empty at final inspection.

The post-fix database read still showed `broadcasting`, `matched_at = null`, zero broadcasts, and exactly the original two matching events. Recent function logs contain successful `jobs.get` requests on the deployed release; their metadata omits job ID, so these log rows alone cannot establish per-job correlation. The job-specific database receipt and rendered Preview agree. No live matching success is claimed.

## Separate busy-worker dossier

Candidate exclusion was caused by an older test job in an active matching-exclusion state. Its identifiers and customer details are omitted. Payment/history jobs were not counted as active blockers.

The persisted events showed acceptance, match confirmation, travel and arrival. Exact timestamps and actor identifiers are omitted.

At inspection, the workflow remained in `arrived` with no recorded completion evidence. This was a historical state; the test record was later removed through a separately authorized cleanup. The old snapshot cannot establish whether the physical service finished.

Valid next steps depend on the actual outcome:

- If work is still active, continue its authorized worker workflow and collect required evidence.
- If work finished but was not recorded, recover through worker completion evidence and customer review; do not manufacture those records.
- If service never happened or was abandoned, review the supported cancellation/support path with the involved actors and approve that specific action separately.

At that time, age alone was not authority to release the worker. No database status patch or fake completion was proposed. Resolution of the separate legacy test record was kept outside the HVAC matching path.

## Historical Customer responses

Electrical session `[electrical-session-uuid]` remains `active / analysis`, 11 turns, no job. Its three repeated replies say that price evidence is insufficient. Reopening that exact session in a separate authenticated Preview displayed these replies and a review-required panel explaining that no offer, search or payment has begun. This is a separate price-evidence gate, not the HVAC load race.

The safe direction is to supply verified price/survey evidence through the existing Backend policy. The underlying provider/price-source failure was not repaired in this mobile scope. No price was invented and no gate was bypassed.

## Retry and stop follow-up

Read-only Production inspection confirms #[HVAC-case-ref] remains `broadcasting`, `quote_mode = null`, no assigned worker, zero confirmation operations, zero matching operations and zero broadcasts. The current retry API requires a durable parent matching operation. A successful `matching-operation` GET returning null is therefore a blocked recovery, not a network failure. The client must not invent an operation UUID or revive a bodyless legacy search POST.

Four client regressions were observed red before their fixes:

- Case UI ignored the workflow retry-busy flag, enabling retry and stop while reconciliation remained pending. The callback now preserves its Promise and the receipt includes the external busy flag.
- A same-job hydration retired a cancellation command's success response. Cancellation now checks the initiating session and job identity separately from read-request generations. Old account and different-job negative tests remain green.
- A generic retry error told the customer to reload despite missing confirmation provenance. The localized message now explains restoration is required and retains the stop/support options.
- Retry feedback remained visible after the job was cancelled. Feedback is now scoped to the current broadcasting job.

On the exact authenticated Customer Preview, retry locked both buttons during the GET and returned the restoration message. No real stop command was issued. Fixtures verify cancellation receipt handling; they do not establish that this real job has been stopped.

## Backend recovery scope — approved for local implementation

1. Preserve the existing job and session IDs. Verify the owning customer's original offer acceptance and immutable offer/scope/price evidence on the server; absence or invalid provenance must stop recovery.
2. Re-evaluate the offer through the current server pricing/capability policy. Assign a quote mode only from a validated decision. If the offer changes or requires RFQ/inspection, present the new offer for explicit customer confirmation before matching; do not relabel the old price range as a validated auto-quote.
3. Implement a separately audited, idempotent recovery command behind Edge and an atomic DB transaction, with ownership and job/session locks. Restore durable confirmation/matching provenance for this existing job only after those gates; create no duplicate job and send no invitation as a side effect of a read.
4. Continue through the existing durable retry/outbox path. Preserve receipt identities across timeout, restart and double tap. Keep busy-worker filtering unchanged.
5. Add real-Postgres tests for ownership rejection, missing/changed offer evidence, duplicate recovery, concurrent cancel/recover, and atomic rollback. Add Edge and RNTL tests for no source price, unknown outcomes, retry busy/stop busy and session changes. Run the required mobile/API/shared checks plus SQL gates before any rollout.
6. Review the local implementation, migration and exact intended Production target separately before rollout. A real invitation requires an actually eligible worker; resolution of a separate legacy test record remains its own actor-approved workflow.

Tu approved the local extension on 09/10/2026. A separate POST `/kael/chat/:id/recover-confirmation`, strict shared/Edge request twins, service-owned capability, and new migration `20261009040000_legacy_confirmation_recovery.sql` have now been authored. No backfill, deployment or old-job mutation has been performed.

The command adopts only an owned, previously confirmed, exhausted legacy job with no existing invitation, candidate or matching operation. It binds the submitted receipt to the persisted offer, verifies the original receipt shape/arithmetic and unchanged job/scope/schedule, and checks the current active policy and a verified district/complexity baseline. A changed range or RFQ/inspection policy is refused for explicit re-confirmation; there is no automatic repricing or RFQ conversion. This first implementation does not implement the new-offer re-confirmation surface.

Successful adoption restores one terminal `no_reachable_worker` parent and one confirmation receipt for the same job, with an audit event. It sends no invitation. The existing explicit retry and outbox remain responsible for any next search. The SQL rollback suite covers replay/ownership/receipt binding/changed offer/changed policy/missing price/cancelled state/direct-client privileges. Concurrent cancellation proof, actual SQL execution and regenerated database types remain pending.

Edge tests were observed red with nine assertions before implementation, then passed with twelve tests including real dispatch/service wiring and strict contract twins. Full API: 1,401 PASS, two skipped; mobile: 1,924 PASS; shared: 125 PASS. This proves fixture behavior, not the SQL transaction or live recovery.

At that point, local Supabase did not complete a clean migration, SQL and type-generation run. The Production catalog lacked the new undeployed RPC among 187 resolvable names; ten dynamic call sites remained unscannable. This was local work in progress, not evidence that deployed Edge code referenced the RPC.

The user reported that the prior test work had physically finished, but persisted workflow evidence was absent. Existing Worker UI can move `arrived → inspecting → repairing → completed_by_worker`, with real evidence followed by customer confirmation. Replaying those steps would invent timestamps, so it was not a legitimate stale-completion repair. Existing Admin recovery is observational/capacity reconciliation and cannot simply mark a job complete.

Final authenticated Customer Preview inspection still showed the same HVAC session, complete intake/offer history, exhausted matching receipt and both retry/stop buttons on SHA `d4275158a56c`. No recovery request or real stop was submitted. Production deployment, live invitations and native evidence remain unverified.

## Verification boundaries

See [command and test evidence](../test-logs/2026-10-09_customer-kael-hydration.md). Preview checks are Expo web evidence. No native iOS/Android capture, full live AI replay, fresh real invitation, Production deploy, or Git publication was performed.

Later local follow-up: a disposable normalized replay applied the new migration without editing original history, and the rollback SQL passed in an isolated connection. The raw migration chain still had an ordering defect; the default denied-function path crashed, and generated types failed with a TLS EOF. These checks did not establish a clean raw replay or default SQL denial path.

Latest follow-up at the time: a local-stack probe failed, so work returned to the Kael path. The Customer retry surface passed its linked session ID to the workflow owner, which freshly binds the owned Backend session, existing job and original price receipt. Recovery runs only on explicit retry, validates its receipt and reads the real matching parent before durable retry. Changed offers/policies and unknown outcomes do not proceed to Matching. The mobile type-check and 1,937 tests passed; React Doctor reported no issues.

The reopened authenticated Preview showed the HVAC history and both controls without the false load error. This snapshot preceded later cleanup of a separate test record. The recovery endpoint was undeployed at that time; no live recovery, cancellation or invitation success was claimed. Any physical completion reconciliation still requires real worker evidence and customer acknowledgment.

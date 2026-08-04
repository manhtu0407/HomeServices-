# Structures Spoke - Customer Workflow Part 2 (A8-A14): Matching To Review

> `STRUCTURES.md` §6, second half. Load this spoke for the customer path from a running worker search through candidate confirmation, the active job, scope change, completion, payment, and review.
>
> The first half — **A0–A7**, auth through the confirmed offer — is [`customer-workflow.md`](customer-workflow.md). It also carries §6.0 (how to read a step: Contract vs Runtime blocks) and §6.0.1 (the two entry paths). Read those first; this file assumes them.
>
> Entry state for everything below: the job row exists and `jobs.status = broadcasting`.
>
> `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

### A8. Searching For Worker

```text
Purpose
-
|- show matching progress
|- allow limited cancellation before worker accepts

States
-
|- searching
|- trying_next_worker
|- no_worker_available
|- cancelled_before_accept

Events
-
|- broadcast_started
|- broadcast_expired
|- no_worker_found
```

**Runtime**

```text
Trigger   jobs.confirmSearch - POST /jobs/:id/confirm-search - jobService.confirmSearch
          (manual retry path; the primary entry is A7's confirmSearch call)
Chain     confirmSearch -> expireStaleBroadcasts -> hasActiveBroadcast
          -> runWithBroadcastRetryLease(sendBroadcast)  [retry only]
          -> createBroadcasts -> queryEligibleWorkers + rankEligibleWorkers
             (domains/matching/broadcast-workers.ts, broadcast-ranking.ts)
Writes    job_broadcasts rows in a batch (batch_id); no jobs.worker_id yet
Emits     'customer_retried_search' on retry, then 'broadcast_sent'
          or 'no_worker_found' + notification 'no_worker_found'
Gates     the retry lease serialises concurrent retries; BROADCAST_ACTIVE blocks a retry
          while an unexpired broadcast is still out
Fails as  BROADCAST_ACTIVE 409 - DB_ERROR 500 (with rollback)
Honest    zero eligible workers is a 200 with broadcast_sent:false and a real reason,
          never a fabricated queue position or ETA
```

Address privacy holds here: broadcasts carry the district and the `kael_worker_brief_core` summary, not the exact address.

### A9. Proposed Worker Confirmation And Final Match

```text
Purpose
-
|- show trust signals after worker accepts as a candidate and let the customer confirm or decline the proposal

Content
-
|- worker name
|- profile photo if approved
|- rating
|- completed job count
|- Kael note: worker received the brief
|- explicit confirm/decline actions

Rules
-
|- worker acceptance alone does not finalize assignment
|- exact address, on-the-way state, and final assignment require customer confirmation of the candidate
|- real ETA is revealed only after final match; never fabricate it on the candidate card
|- a declined candidate returns to matching without fabricating another option
|- do not expose unnecessary PII

Events
-
|- worker_candidate_proposed
|- customer_worker_candidate_confirmed
|- customer_worker_candidate_declined
```

**Runtime**

```text
Worker    jobs.accept - POST /jobs/:id/accept - acceptBroadcast (domains/matching/accept.ts)
          -> job_worker_candidates proposal + jobs.status='worker_candidate_pending'
          -> event 'worker_accepted'. Does NOT set jobs.worker_id.
Customer  jobs.workerCandidate        GET  /jobs/:id/candidate         getWorkerCandidate
          jobs.workerCandidateConfirm POST /jobs/:id/candidate/confirm confirmWorkerCandidate
          jobs.workerCandidateReject  POST /jobs/:id/candidate/reject  rejectWorkerCandidate
Writes    confirm: jobs.worker_id + status='worker_matched' + matched_at; candidate row
          -> customer_confirmed.   reject: candidate -> customer_declined,
          job returns to 'broadcasting'
Emits     'customer_confirmed_worker' or 'customer_rejected_worker' + worker notification
Gates     validateWorkflowTransition on worker_candidate_pending -> worker_matched
          (only this pair may set the final worker)
Fails as  INVALID_STATUS 409 - NOT_FOUND 404 (no live candidate) - STATUS_CHANGED 409
```

**This is the address-release boundary.** Exact address, real ETA, and the on-the-way state become available only after `confirmWorkerCandidate` succeeds — see `trust-safety-evidence.md` §14.

### A10. Active Job

```text
Purpose
-
|- track job status
|- support customer-worker chat
|- show Kael system events

Status timeline
-
|- booked
|- worker_on_way
|- arrived
|- inspecting
|- repairing
|- completed

Chat
-
|- customer and worker messages are direct relay
|- Kael system messages are visually distinct
|- chat is evidence trail
```

**Runtime**

```text
Read      jobs.get         GET  /jobs/:id            -> domains/job/read.ts
Chat      jobs.messages.list GET  /jobs/:id/messages -> domains/job/chat.ts
          jobs.messages.send POST /jobs/:id/messages -> chat-guard.ts screens contact-detail
                                                        leakage before insert
Realtime  apps/mobile/lib/realtime.ts subscribes to the RLS-scoped job/chat/broadcast rows;
          polling stays the fallback when the socket drops (§22)
Status    the worker advances status; the customer surface only reads it
Writes    chat_messages; job_media_assets for evidence
Gates     requireJobAccess (platform/access.ts) on every read and write
Honest    Kael system messages are inserted server-side (insertKaelJobMessage) and are
          visually distinct from human relay; the client never authors them
```

### A11. Scope Change Confirmation

```text
Purpose
-
|- protect customer from surprise price/scope changes

Trigger
-
|- worker reports real issue differs from original scope

UI
-
|- hard-stop modal or equivalent
|- old scope vs new scope
|- old Kael estimate vs new Kael-computed estimate (computed from worker's reported scope)
|- reason from worker
|- Kael explanation
|- confirm change, keep the old scope, or appeal
|- Kael badge: estimate is computed by Kael, not worker-typed (Phase 2.0 2026-05-23)

Hard rule
-
|- changed work is blocked until Kael emits a validated scope proposal and the customer explicitly confirms it, or an explicit admin override resolves a dispute
|- customer can add evidence, confirm the proposal, keep the old scope, or appeal
|- no hidden price change
|- no raw LLM, threshold-based auto-approval, or Kael autonomy decision may replace the customer's explicit scope decision
|- worker does not propose price; Kael computes from original Kael context + worker reported scope (Phase 2.0 2026-05-23)

Events
-
|- scope_change_requested
|- customer_confirmed_scope_change
|- customer_rejected_scope_change
|- customer_rejected_scope_change
|- customer_appealed_scope_change
|- admin_overrode_scope_change
```

**Runtime**

```text
Worker    jobs.scopeChange - POST /jobs/:id/scope-change - requestScopeChange
          (domains/job/scope-change/request.ts) - description + reason + photos only,
          never a worker-typed price
          -> jobs.status='scope_change_pending', event 'scope_change_requested'
Kael      computes the new estimate from the original Kael context + the reported scope;
          persists kael_computed_min/max for audit
Customer  scope.decide - POST /scope-changes/:id/decide - decideScopeChange
          (domains/job/scope-change/decision.ts)
          -> effects.ts + effects-drain.ts apply the decided effect
             (request -> command -> effect, so the decision and its side effects are
              separately auditable and replayable)
Writes    scope_changes row, jobs.final_price on confirm, job status back to one of the
          five on-site statuses (or cancelled)
Emits     'scope_change_decided' (customer) or 'kael_decided_scope_change' (autonomy)
Gates     validateScopeChangeEvidenceRefs - scopeChangeRiskConfig -
          getWorkerScopeChangeRate feeds the matching penalty, not an auto-punishment
Fails as  INVALID_STATUS 409 - VALIDATION 400 (evidence refs) - NOT_FOUND 404
```

Changed work stays blocked while `jobs.status = scope_change_pending`; the status itself is the block, not a UI flag.

### A12. Completion Review

```text
Purpose
-
|- let the customer explicitly confirm completed work from worker/customer evidence or open a dispute before payment begins

Content
-
|- worker completion note
|- completion photos
|- final price (Kael-locked: set at A7 autonomy baseline or latest A11 Kael-computed value)
|- explicit customer confirm/dispute actions
|- audit / appeal / support actions

Hard rule
-
|- payment cannot begin before explicit customer completion confirmation and a validated completion decision
|- final price source is Kael authority, not worker input (Phase 2.0 2026-05-23)

Events
-
|- customer_confirmed_completion
|- customer_disputed_completion
```

**Runtime**

```text
Trigger   jobs.confirmCompletion - POST /jobs/:id/confirm-completion
          - jobService.confirmCompletion
Chain     confirmCompletion (domains/payment/completion-review.ts)
Writes    jobs.status='confirmed_by_customer' + confirmed_at
Emits     'customer_confirmed_completion', or 'kael_confirmed_completion' when Kael
          confirms autonomously from sufficient worker evidence
Dispute   jobs.openDispute - POST /jobs/:id/disputes -> domains/dispute/dispute.ts;
          disputes.counterStatement and disputes.adminDecision continue it
Gates     validateWorkflowTransition completed_by_worker -> confirmed_by_customer is the
          only legal pair; final_price is Kael-locked and not writable here
Fails as  INVALID_STATUS 409 - AUTH_FORBIDDEN 403 (not the owning customer)
```

### A13. Payment

```text
Purpose
-
|- collect or record payment after explicit customer completion confirmation

Methods
-
|- render only payment methods reported as available by the server capability contract
|- cash may appear only when the cash-receipt lifecycle is implemented and auditable
|- digital rails may appear only when authorization/result verification is implemented
|- do not show future provider names as selectable methods

Rules
-
|- payment UI appears only when the workflow enters the payment phase
|- payment requires explicit customer action or a verified callback from an implemented rail
|- an unavailable payment rail must show an honest unavailable state; never a fake success
|- payment status must be explicit
|- payment failure must not mark job as paid

Events
-
|- customer_payment_authorized
|- payment_result_verified
```

**Runtime**

```text
Digital   jobs.paymentIntent - POST /jobs/:id/payment-intent
          -> createSePayVietQrPaymentIntent (domains/payment/sepay-vietqr.ts)
          -> buildSePayVietQrPaymentInstructions returns the VietQR payload
          -> the customer pays out-of-band; the bank calls the sepay-webhook Edge function
          -> verifySePayWebhookSignature -> parseSePayVietQrWebhookPayload
             -> receiveSePayVietQrWebhook -> event 'payment_confirmed'
             (payment_pending -> paid)
Cash      jobs.cashPaymentConfirm - POST /jobs/:id/cash-payment-confirm
          -> confirmWorkerCashPayment (domains/payment/cash.ts)
          -> event 'worker_confirmed_cash_payment' (confirmed_by_customer -> paid)
Ledger    domains/payment/commission.ts writes the commission entries from the locked
          final price
Gates     the status may only become 'paid' from a verified callback or an explicit
          confirm action - never from client assertion
Fails as  INVALID_STATUS 409 - VALIDATION 400 - signature failure is rejected silently
          to the caller and logged with safe metadata only
```

**Honest state at this milestone:** the rails exist in code and tests, no money has moved, and `platform/lifecycle.ts` still permits `confirmed_by_customer -> reviewed` — so a job can still reach `reviewed` without passing through payment. See `state-machines.md` §12.2 and `STRUCTURES.md` §1.5.

### A14. Review

```text
Purpose
-
|- collect trust and learning signal after job

Input
-
|- 1-5 stars
|- quick tags
|- optional comment

Tags
-
|- on time
|- professional
|- clean work
|- explained clearly
|- fair price

Learning impact
-
|- rating and comment feed CaseReviewService when safe
```

**Runtime**

```text
Trigger   jobs.review - POST /jobs/:id/review - jobService.submitReview
Chain     submitReview (domains/payment/completion-review.ts)
Writes    reviews row (rating, tags, optional comment); jobs.status='reviewed' + reviewed_at
Emits     'review_submitted' (paid -> reviewed)
Learning  the review feeds the evidence-gated learning queue, never an inline write during
          the workflow request - see kael-learning.md section 10
Gates     validateWorkflowTransition paid -> reviewed; a review cannot be submitted twice
Fails as  INVALID_STATUS 409 - VALIDATION 400 (rating out of range)
```

---

## Where this maps in code

Per-step owner files (routes, surfaces, providers, tests) live in [`docs/architecture/code-ownership-map.md`](../../docs/architecture/code-ownership-map.md). This spoke owns the workflow contract and the runtime call order; that map owns which file to open.

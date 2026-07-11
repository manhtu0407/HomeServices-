# Structures Spoke - Customer Workflow (A0-A14)

> Extracted from `STRUCTURES.md` section 6 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for the customer booking workflow. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 6. Customer Workflow

Each customer workflow step must be implemented with this shape:

```text
Step contract
-
|- screen purpose
|- user input
|- backend dependency
|- state transition
|- validation
|- error states
|- events emitted
|- tests needed
```

### Customer Workflow Illustration

```text
Customer opens app
-
|- chooses role first
|- signs in with current Supabase email/password auth in Phase 0
|- phone OTP is a later production-auth upgrade after SMS provider setup
|- creates apartment profile
|- selects one of the six supported services
|- submits Basic Intake: location + desired time + short description + optional chips/media
|- Kael analyzes with the selected service profile
|- Kael asks one focused question per turn until quote-ready
|- Kael shows a structured diagnosis/scope and evidence-backed price estimate
|- customer explicitly confirms the offer
|- Kael validates the matching decision and starts worker search
|- worker accepts as a candidate
|- customer explicitly confirms the proposed worker
|- customer tracks job + chats
|- worker reports scope change if needed
|- Kael explains a scope change; customer explicitly confirms before changed work continues
|- worker completes
|- customer explicitly confirms completion or opens a dispute
|- customer explicitly pays through an implemented rail
|- review
```

### A0. Auth And Profile

```text
Purpose
-
|- authenticate customer
|- create minimum usable apartment profile

User input
-
|- email
|- password
|- phone number later when OTP auth is enabled
|- name
|- building name
|- unit number
|- floor
|- district

Backend dependency
-
|- auth profile
|- customer profile
|- role = customer

Validation
-
|- email required in Phase 0
|- password required in Phase 0
|- phone/OTP required later when SMS provider is enabled
|- district required
|- address can be edited later

Events
-
|- customer_profile_created

Tests
-
|- role cannot be escalated by client metadata
|- customer profile is created with required fields
```

### A1. Customer Home

```text
Purpose
-
|- show active address
|- provide entry to all six supported service routes
|- show active booking if any
|- show recent jobs

UI
-
|- greeting
|- notification bell
|- profile entry
|- address bar
|- electrical card
|- plumbing card
|- cleaning card
|- HVAC and indoor air card
|- upholstery care card
|- minor repair/installation card
|- no additional future-service cards unless Tu explicitly approves them for the current task
|- active booking banner
|- recent history
|- bottom tabs: Home / Book / Kael / History / Profile

Rules
-
|- only the six supported services appear as selectable real services
|- user-facing text must be Vietnamese
```

### A2. Select Service And Start Basic Intake

```text
Purpose
-
|- capture the service and a lightweight starting signal without diagnosing on the route

User input
-
|- service_type: electrical, plumbing, cleaning, hvac, upholstery, or handyman
|- optional problem/detail chips
|- optional short free text

Backend dependency
-
|- six-service taxonomy
|- service-to-performance-profile mapping

Validation
-
|- service_type must be one of the six supported identifiers
|- chips must not become required static questionnaire fields
|- unsupported service returns polite decline

Events
-
|- basic_intake_started
```

### A3. Submit Basic Intake

```text
Purpose
-
|- collect the minimum context needed to hand the case to Kael

User input
-
|- required location
|- desired date/time or honest flexible-time state
|- short description
|- optional photos
|- optional editable on-device voice transcript
|- optional 1-3 locally extracted video frames
|- optional original video stored privately for human review only, after explicit disclosure

Backend dependency
-
|- draft job
|- private evidence upload
|- Kael analysis request

Validation
-
|- location, desired-time intent, and short description must be usable
|- media type/size validation
|- sanitize input before DB/LLM
|- raw audio must not leave the device; raw video must never be sent to an AI provider
|- voice transcript remains editable before submit and is scrubbed for PII
|- locally extracted video frames are validated and scrubbed before vision analysis

Events
-
|- job_draft_created
|- kael_analysis_started
```

### A4. Kael Clarification

```text
Purpose
-
|- ask only what is needed to make the diagnosis/scope artifact quote-ready

Behavior
-
|- ask exactly one focused question per turn when information is missing
|- continue across as many turns as needed; there is no fixed two-question cap
|- never ask generic "please provide more info"
|- skip if context is already enough
|- stay in the analysis phase until quote readiness is validated
|- accept new text, photos, editable voice transcript, or locally extracted video frames during analysis

Examples
-
|- "Is the issue affecting one drain or multiple drains?"
|- "Does the breaker trip again after you turn it back on?"

Events
-
|- kael_clarification_requested
|- kael_clarification_answered
```

### A5. Price Estimate Card

```text
Purpose
-
|- show the structured diagnosis/scope and transparent estimated market price before matching

Content
-
|- identified problem
|- included/excluded scope
|- evidence and unresolved assumptions
|- safety/capability requirements when relevant
|- complexity: small / medium / large
|- price range only when supported by real baseline/market evidence
|- confidence if useful
|- one optional advisory only when justified
|- required price disclaimer

Required disclaimer meaning
-
|- this is a market estimate
|- final price is computed by Kael from validated evidence before work starts

Rules
-
|- never show exact guaranteed price
|- never show raw AI output
|- always validate structured Kael output first
|- if quote readiness or price evidence is missing, show an honest not-ready state and continue clarification
```

### A6. Desired Time (Basic Intake Field)

```text
Purpose
-
|- capture the customer's real desired time without turning the route into a multi-step questionnaire

Options
-
|- now
|- scheduled date/time slot
|- flexible time when supported by the backend contract

Validation
-
|- unavailable time slots cannot be selected
|- do not render fake/disabled schedule slots in the current primary transaction path
|- default is now during early phase
```

### A7. Customer Confirms Offer; Kael Starts Worker Search

```text
Purpose
-
|- collect explicit customer confirmation of the offer, then validate the server decision before broadcasting

Summary shown
-
|- service
|- problem
|- address
|- time
|- estimated price range
|- platform fee
|- cancellation note if applicable

Hard rule
-
|- no matching before the customer confirms the current offer
|- no job broadcast from raw AI output or client-side status writes
|- broadcast requires `KaelAutonomyDecision(actor=kael_system, action=start_matching)`

Events
-
|- customer_offer_confirmed
|- kael_started_matching
|- job_ready_for_broadcast
```

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

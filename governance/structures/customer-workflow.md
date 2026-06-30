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
|- selects electrical/plumbing/cleaning
|- chooses problem chips
|- describes issue + uploads photos
|- Kael analyzes
|- Kael asks clarification if needed
|- Kael shows price estimate
|- Kael validates an autonomy decision
|- system broadcasts job / starts matching
|- worker accepts
|- customer tracks job + chats
|- worker reports scope change if needed
|- Kael decides scope change from policy/evidence, with appeal path
|- worker completes
|- Kael confirms completion or opens dispute from evidence
|- payment + review
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
|- provide entry to electrical/plumbing/cleaning booking
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
|- no future-service cards unless Tu explicitly approves them for the current task
|- active booking banner
|- recent history
|- bottom tabs: Home / Book / Kael / History / Profile

Rules
-
|- unsupported services must not appear as selectable real services
|- user-facing text must be Vietnamese
```

### A2. Select Service And Problem

```text
Purpose
-
|- capture service type and problem category

User input
-
|- service_type: electrical, plumbing, or cleaning
|- one or more problem chips
|- other problem free text when needed

Backend dependency
-
|- service taxonomy
|- price baseline categories

Validation
-
|- service_type must be electrical, plumbing, or cleaning
|- unsupported service returns polite decline

Events
-
|- service_problem_selected
```

### A3. Describe Problem

```text
Purpose
-
|- collect enough context for Kael analysis

User input
-
|- required description
|- up to 5 photos
|- video up to 60 seconds later
|- editable apartment address

Backend dependency
-
|- draft job
|- media upload
|- Kael analysis request

Validation
-
|- description cannot be empty
|- media type/size validation
|- sanitize input before DB/LLM

Events
-
|- job_draft_created
|- kael_analysis_started
```

### A4. Kael Clarification

```text
Purpose
-
|- ask only what is needed to improve estimate quality

Behavior
-
|- ask 0-2 specific questions
|- never ask generic "please provide more info"
|- skip if context is already enough

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
|- show transparent estimated market price before booking

Content
-
|- identified problem
|- complexity: small / medium / large
|- price range
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
```

### A6. Time Selection

```text
Purpose
-
|- future scheduling surface; current primary flow is on-demand

Options
-
|- now
|- scheduled date/time slot

Validation
-
|- unavailable time slots cannot be selected
|- do not render fake/disabled schedule slots in the current primary transaction path
|- default is now during early phase
```

### A7. Kael Starts Worker Search

```text
Purpose
-
|- validated Kael autonomy decision before broadcasting job

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
|- no job broadcast from raw AI output or client-side status writes
|- broadcast requires `KaelAutonomyDecision(actor=kael_system, action=start_matching)`

Events
-
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

### A9. Worker Matched

```text
Purpose
-
|- show trust signals after worker accepts

Content
-
|- worker name
|- profile photo if approved
|- rating
|- completed job count
|- ETA
|- chat button
|- Kael note: worker received the brief

Rules
-
|- full worker info shown only after accept
|- do not expose unnecessary PII
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
|- continue or cancel
|- Kael badge: estimate is computed by Kael, not worker-typed (Phase 2.0 2026-05-23)

Hard rule
-
|- worker is blocked until Kael emits a validated scope decision or an explicit admin override exists
|- customer can add evidence, cancel, or appeal the Kael decision, but is not the default final authority
|- no hidden price change
|- no raw LLM auto-approval; only server-validated KaelAutonomyDecision may approve/reject scope
|- worker does not propose price; Kael computes from original Kael context + worker reported scope (Phase 2.0 2026-05-23)

Events
-
|- scope_change_requested
|- kael_decided_scope_change
|- customer_appealed_scope_change
|- admin_overrode_scope_change
```

### A12. Completion Review

```text
Purpose
-
|- Kael confirms work from worker/customer evidence or opens dispute before payment finalization

Content
-
|- worker completion note
|- completion photos
|- final price (Kael-locked: set at A7 autonomy baseline or latest A11 Kael-computed value)
|- audit / appeal / support actions

Hard rule
-
|- payment cannot complete before a validated completion/payment decision
|- final price source is Kael authority, not worker input (Phase 2.0 2026-05-23)
```

### A13. Payment

```text
Purpose
-
|- collect or record payment after completion confirmation

Methods
-
|- cash
|- bank transfer
|- MoMo later
|- ZaloPay later

Rules
-
|- payment integration is phase-controlled
|- payment status must be explicit
|- payment failure must not mark job as paid
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

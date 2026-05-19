# Home Services App Structures

This file is the single source of truth for Home Services product workflow, app operation, and build direction.

AI coding agents MUST read this file before implementing frontend, backend, database, AI, admin, worker, customer, or workflow logic. This file describes the full app operation, but implementation still follows the current approved phase. It is a blueprint, not permission to build every future capability immediately.

If this file conflicts with `RULES.md`, `critical.md`, or Tu's current instruction, stop and ask Tu for a decision before implementation.

---

## 0. How To Use This File

Use this file to answer:

- What product are we building?
- Which services are in scope?
- How does the customer workflow run?
- How does the worker workflow run?
- What does Kael do?
- What must the backend support before frontend screens can work?
- Which state machines must frontend/backend share?
- What must not be built yet?

Rules for AI agents:

- Treat this file as the workflow source of truth.
- Do not invent new product flows that are not represented here.
- Do not convert Next.js into the consumer web product.
- React Native is the primary app surface.
- Next.js exists for backend, admin, and prototypes only.
- User-facing app text must be Vietnamese.
- Technical implementation notes may be English.
- Every money-impacting action must require explicit confirmation.
- Every workflow step must have loading, empty, error, success, and retry considerations when implemented.

Current phase note:

```text
The file may describe full app operation.
Implementation must still be phase-controlled.
Do not build future autonomy, service expansion, or multi-city workflows without Tu's explicit approval.
```

---

## 1. Product Identity And Hard Scope

Home Services is a mobile-first home repair platform for HCMC apartment residents.

Current service scope:

```text
Supported now
-
|- Electrical repair
|- Plumbing repair
|- Home cleaning / housekeeping
|- HCMC apartments
|- Customer-to-worker matching
|- Kael-first AI intake, diagnosis, price check, worker brief, and support
```

Out of scope now:

```text
Not supported now
-
|- AC repair
|- Appliance repair
|- General handyman marketplace
|- Multi-city expansion
|- Autonomous booking
|- Autonomous payment
|- Multi-agent orchestration
|- Consumer web app
```

If a user asks for an unsupported service, Kael must politely decline:

```text
Current meaning:
"We currently only support electrical repair, plumbing repair, and home cleaning. Please come back when we open more services."
```

Kael today:

```text
Kael = AI Price Check + camera-based problem understanding
-
|- receives customer text/photos/videos
|- identifies likely electrical/plumbing/cleaning problem
|- asks clarification when needed
|- estimates market price range
|- explains uncertainty
|- prepares worker pre-brief after customer confirms booking search
|- mediates scope-change explanation
```

Kael is not currently:

```text
Kael is not
-
|- an autonomous booking agent
|- a payment agent
|- a worker punishment system
|- a multi-specialist orchestrator
|- a generic repair chatbot
|- a service expansion engine
```

---

## 2. Competitor-Derived Product Principles

We learn from apps that already operate in home services, but we do not copy their full complexity. bTaskee, JupViec, Rada, 246SHOME, Urban Company, and Taskrabbit are references for product patterns, not the product spec.

Adopt these patterns:

```text
Good patterns to adopt
-
|- fast booking path
|- transparent estimate before booking
|- worker verification and profile trust
|- clear confirmation before money-impacting actions
|- in-app chat as the source of truth
|- photo/video evidence before and after job
|- rating and feedback loop
|- support/admin review path
|- cancellation and rebooking handling
|- worker earning transparency
|- customer sees enough trust signals before accepting service
```

Avoid these patterns:

```text
Bad patterns to avoid
-
|- overloaded service catalog
|- unclear address handling
|- hidden price changes
|- scope change without explicit approval
|- weak support resolution
|- no transaction evidence trail
|- slow, heavy, confusing app flow
|- too many user decisions before the first useful estimate
|- pretending price is exact when it is only an estimate
```

Product principle:

```text
Copy the validated shape.
Remove what is heavy or unclear.
Adapt it to electrical/plumbing/cleaning Price Check.
Keep the path to the first real transaction short.
```

---

## 3. App Roles And Surfaces

### Customer

The customer is an HCMC apartment resident who needs electrical, plumbing, or home cleaning help, wants a fair price estimate, and wants a trustworthy worker.

Customer app responsibilities:

```text
Customer app
-
|- collect problem description and media
|- show Kael estimate
|- require booking confirmation
|- show worker match
|- support in-app chat
|- handle scope-change approval
|- confirm completion
|- support payment placeholder
|- collect review
```

### Worker

The worker is a verified service provider approved manually by admin.

Worker app responsibilities:

```text
Worker app
-
|- register and submit verification
|- upload identity/selfie files into the private worker-verification storage box
|- toggle availability
|- receive incoming job request
|- accept or skip within countdown
|- view full job details after accept
|- update job status
|- chat with customer
|- report scope change
|- submit completion evidence
|- view earnings
```

### Admin

Admin is the operational control surface. Admin does not need to handle every learning event, but must be able to review, override, and roll back high-risk outcomes.

Admin responsibilities:

```text
Admin panel
-
|- approve workers
|- review jobs
|- manage price baselines
|- inspect AI logs and failures
|- monitor scope changes
|- review support/disputes
|- manage service taxonomy
|- view and roll back learned Kael rules
```

### Kael

Kael is the AI reasoning layer for price checking, problem analysis, clarification, worker pre-briefs, and evidence-gated self-learning.

Kael responsibilities:

```text
Kael
-
|- classify intent
|- enforce service scope
|- analyze text/media
|- search market price
|- synthesize structured estimate
|- create advisory only when justified
|- generate worker pre-brief
|- explain scope change
|- learn from completed jobs through evidence gates
```

### Support / Operator

Support may be handled by admin initially.

Support responsibilities:

```text
Support
-
|- investigate disputes
|- inspect chat/evidence
|- handle worker no-show
|- help with failed payment
|- help with failed matching
|- review flagged fraud or overcharge patterns
```

---

## 4. Build Order Blueprint

Build backend foundations before frontend polish. Screens without state machines and backend contracts create fragile code.

Recommended build order:

```text
Foundation order
-
|- 1. Auth + profiles
|- 2. Service taxonomy
|- 3. Price baselines
|- 4. Kael AI wrapper + output schemas
|- 5. Job lifecycle
|- 6. Customer price-check flow
|- 7. Worker verification + availability
|- 8. Matching + broadcast
|- 9. Chat + evidence
|- 10. Scope change
|- 11. Completion + review
|- 12. Admin controls
|- 13. Learning candidates and evidence gates
|- 14. Payments integration later
```

Frontend should follow stable backend contracts:

```text
Frontend build order
-
|- Customer auth/profile
|- Customer home
|- Service/problem selection
|- Problem description/media
|- Kael estimate
|- Booking confirmation
|- Searching/matching status
|- Active job
|- Scope change
|- Completion/review
|- Worker app surfaces
|- Admin panel surfaces
```

Backend-first rule:

```text
If a screen needs persistent state, permissions, or AI output,
define the backend contract before building final UI.
```

---

## 5. Service Taxonomy

Only electrical, plumbing, and home cleaning are active. Other services may appear as disabled "coming soon" UI only, never functional.

### Electrical Taxonomy

```text
Electrical repair
-
|- power_outage_one_room
|  |- hints: one room has no power, breaker may trip
|  |- complexity: small/medium
|  |- required input: affected room, breaker status
|
|- power_outage_whole_unit
|  |- hints: entire apartment has no power
|  |- complexity: medium/large
|  |- required input: building-wide or unit-only
|
|- outlet_or_switch_broken
|  |- hints: loose outlet, burnt smell, switch not working
|  |- complexity: small/medium
|  |- required input: photo recommended
|
|- breaker_trip
|  |- hints: breaker repeatedly trips
|  |- complexity: medium/large
|  |- required input: what appliance triggers it
|
|- flickering_light
|  |- hints: flickering, unstable connection
|  |- complexity: small/medium
|  |- required input: one light or multiple lights
|
|- install_device
|  |- hints: light, fan, outlet, small fixture
|  |- complexity: small/medium
|  |- required input: device type and location
|
|- other_electrical
|  |- hints: must be clarified by Kael
|  |- complexity: unknown
```

### Plumbing Taxonomy

```text
Plumbing repair
-
|- pipe_leak
|  |- hints: visible leak, damp wall, water under sink
|  |- complexity: small/medium/large
|  |- required input: leak location and photo
|
|- clogged_drain_or_sink
|  |- hints: slow drain, blocked sink, floor drain issue
|  |- complexity: small/medium
|  |- required input: repeated issue or first time
|
|- toilet_flush_issue
|  |- hints: toilet does not flush, tank issue, leak
|  |- complexity: small/medium
|  |- required input: flush tank or bowl issue
|
|- faucet_broken
|  |- hints: dripping faucet, loose handle, no water
|  |- complexity: small/medium
|  |- required input: faucet type and photo
|
|- weak_water_pressure
|  |- hints: weak flow, one fixture or whole apartment
|  |- complexity: medium/large
|  |- required input: scope of weak pressure
|
|- install_or_replace_fixture
|  |- hints: replace faucet, shower head, filter, hose
|  |- complexity: small/medium
|  |- required input: fixture type
|
|- other_plumbing
|  |- hints: must be clarified by Kael
|  |- complexity: unknown
```

Taxonomy rules:

```text
Rules
-
|- taxonomy drives UI chips
|- taxonomy drives Kael prompt context
|- taxonomy drives price baseline lookup
|- taxonomy drives worker skill matching
|- taxonomy must not include unsupported services
|- taxonomy changes require tests and admin visibility
```

---

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
|- customer confirms booking search
|- system broadcasts job
|- worker accepts
|- customer tracks job + chats
|- worker reports scope change if needed
|- customer approves/rejects scope change
|- worker completes
|- customer confirms completion
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
|- disabled future service cards only for non-active future services
|- active booking banner
|- recent history
|- bottom tabs: Home / Book / Kael / History / Profile

Rules
-
|- disabled services must not be clickable as real services
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
|- final price is confirmed by the worker before work starts

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
|- let customer choose now or scheduled time

Options
-
|- now
|- scheduled date/time slot

Validation
-
|- unavailable time slots cannot be selected
|- default is now during early phase
```

### A7. Confirm Booking Search

```text
Purpose
-
|- explicit confirmation before broadcasting job

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
|- no job broadcast before customer confirms

Events
-
|- customer_confirmed_booking_search
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
|- old estimate vs new estimate
|- reason from worker
|- Kael explanation
|- continue or cancel

Hard rule
-
|- worker is blocked until customer decides
|- no hidden price change
|- no auto-approval

Events
-
|- scope_change_requested
|- customer_approved_scope_change
|- customer_rejected_scope_change
```

### A12. Completion Confirmation

```text
Purpose
-
|- customer confirms work was received before payment finalization

Content
-
|- worker completion note
|- completion photos
|- final price
|- confirm received button

Hard rule
-
|- payment cannot complete before customer confirmation in current phase
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

---

## 7. Worker Workflow

### Worker Workflow Illustration

```text
Worker opens app
-
|- chooses worker role first
|- signs in with current Supabase email/password auth in Phase 0
|- phone OTP is a later production-auth upgrade after SMS provider setup
|- submits identity + skill info
|- waits for admin approval
|- turns online
|- receives matching job
|- sees general area + Kael pre-brief
|- accepts within 60s
|- full address revealed
|- updates job status
|- chats with customer
|- requests scope change if issue differs
|- waits for customer decision
|- completes job with notes/photos
|- earnings updated after customer confirmation
```

### B0. Worker Registration

```text
Purpose
-
|- collect worker identity and skill information

Input
-
|- email/password auth in Phase 0
|- phone OTP later when SMS provider is enabled
|- legal name
|- date of birth
|- gender optional
|- service skills: electrical / plumbing / cleaning, including multi-service combinations
|- years of experience
|- working districts
|- CCCD front/back
|- selfie with CCCD
|- bank account

Rules
-
|- worker cannot receive jobs before approval
|- PII must never be logged
```

### B1. Admin Approval Required

```text
Purpose
-
|- manually verify worker trust before marketplace access

Admin checks
-
|- identity
|- skill category
|- working area
|- bank information
|- suspicious duplicate accounts

States
-
|- submitted
|- under_review
|- approved
|- rejected
|- suspended
```

### B2. Worker Home

```text
Purpose
-
|- control availability
|- show daily activity

UI
-
|- online/offline toggle
|- jobs today
|- earnings today
|- average rating
|- incoming job card
|- tabs: Home / Jobs / Chat / Earnings / Profile
```

### B3. Incoming Job Request

```text
Purpose
-
|- allow worker to accept or skip quickly

Content before accept
-
|- service type
|- general district/area
|- Kael pre-brief
|- estimated customer price range
|- estimated worker earning
|- 60s countdown

Hidden before accept
-
|- full apartment address
|- customer phone
|- exact unit number

Events
-
|- job_request_sent
|- worker_accepted
|- worker_declined
|- request_expired
```

### B4. Job Detail After Accept

```text
Purpose
-
|- give worker full context after commitment

Content
-
|- full address
|- customer display name
|- problem details
|- photos/videos
|- Kael full brief
|- route button
|- chat button

Rules
-
|- reveal only necessary PII
|- full details only after accept
```

### B5. On-Site Status Updates

```text
Purpose
-
|- keep customer informed
|- create operational evidence

Statuses
-
|- on_the_way
|- arrived
|- inspecting
|- repairing
|- completed_by_worker

Events
-
|- worker_status_updated
|- customer_notification_sent
```

### B6. Scope Change Request

```text
Purpose
-
|- handle difference between initial estimate and real on-site issue

Worker input
-
|- real issue description
|- new estimated price
|- reason
|- optional photo evidence

Rules
-
|- worker cannot continue changed work until customer approves
|- Kael explains change to customer
|- all scope change data is logged
```

### B7. Complete Job

```text
Purpose
-
|- worker submits completion evidence

Input
-
|- completion note
|- final price
|- completion photos

State
-
|- completed_by_worker
|- waiting_customer_confirmation
```

### B8. Earnings

```text
Purpose
-
|- show transparent worker economics

Content
-
|- gross service amount
|- platform fee
|- worker net earning
|- job history
|- withdrawal placeholder

Rule
-
|- earnings finalization depends on customer confirmation/payment state
```

---

## 8. Admin Workflow

Admin panel is required because trust, pricing, learning, and support cannot be safely handled only by customer/worker apps.

```text
Admin workflows
-
|- worker approval queue
|- worker profile review
|- worker suspension/reinstatement
|- price baseline management
|- job monitor
|- scope change monitor
|- failed AI call monitor
|- support/dispute queue
|- service taxonomy management
|- learning rule visibility and rollback
|- AI cost/session monitoring
```

Admin control points:

```text
Human control required
-
|- worker approval
|- worker suspension
|- dispute resolution
|- service expansion
|- payment policy changes
|- rollback of bad learned rules
```

Admin does not approve every Kael learning event. Admin must be able to see, audit, disable, and roll back learned rules.

---

## 9. Kael Workflow

Kael is non-autonomous for money-impacting actions, but strong in analysis, clarification, pricing support, worker briefing, and evidence-gated learning.

### Kael Price Check Flow

```text
Kael Price Check flow
-
|- classify intent
|- reject out-of-scope service
|- understand problem from text/photos
|- ask clarification if needed
|- run price search
|- compare search result with baseline
|- synthesize structured price estimate
|- generate at most one advisory
|- create worker pre-brief after booking confirm
```

### AI Provider Roles

```text
DeepSeek
-
|- intent classification
|- simple FAQ
|- lightweight pre-screening

Anthropic
-
|- vision analysis
|- problem identification
|- price synthesis
|- customer-facing explanation
|- worker pre-brief when needed

Perplexity
-
|- market price lookup only
|- HCMC repair price research
```

### Structured Kael Output

```text
Kael output shape
-
|- service_type
|- problem_category
|- problem_summary
|- complexity
|- price_min
|- price_max
|- confidence
|- advisory_optional
|- disclaimer
|- worker_prebrief
```

Rules:

```text
Kael output rules
-
|- structured data first
|- prose second
|- schema validation before UI
|- no raw AI output to user
|- no exact price guarantee
|- no unsupported service advice
|- one advisory max
|- no fear-based upsell language
```

---

## 10. Kael Evidence-Gated Self-Learning System

This is the controlled learning system that lets Kael improve without becoming an autonomous booking/payment agent.

Earlier conservative model rejected:

```text
Rejected model
-
|- every learning candidate requires admin approval
|- Kael only reports, never improves itself
```

Current model:

```text
Approved model
-
|- self-learning is allowed
|- learning must be evidence-gated
|- learning can improve analysis behavior and price suggestions
|- learning cannot autonomously execute booking/payment/cancel
|- learning cannot auto-approve worker punishment
|- learning cannot expand supported service scope
|- every learned change must be logged, reversible, and measurable
```

### 10A. MarketMemoryService

Purpose:

```text
MarketMemoryService
-
|- compare Kael estimate vs final accepted price
|- compare Perplexity result vs actual transaction
|- detect baseline drift by district/problem/complexity
|- detect repeated underestimation/overestimation
|- create price learning candidates
|- auto-promote price priors only after evidence gate passes
```

Inputs:

```text
Inputs
-
|- service_type
|- problem_category
|- district
|- Kael estimate
|- Perplexity context
|- baseline used
|- worker confirmed price
|- final paid price
|- scope change reason
|- completion status
|- customer rating
```

Output:

```text
Market learning output
-
|- candidate_type: price_prior_update
|- affected_service
|- affected_problem
|- affected_district
|- old_range
|- observed_range
|- suggested_range
|- confidence
|- evidence_count
|- promotion_status: pending / auto_promoted / rejected / rolled_back
|- version
|- audit_reason
```

### 10B. CaseReviewService

Purpose:

```text
CaseReviewService
-
|- review completed jobs
|- detect wrong estimate patterns
|- detect missing clarification questions
|- detect repeated scope-change patterns
|- detect worker overcharge risk
|- propose better clarification/advisory behavior
|- auto-promote analysis rules only after evidence gate passes
```

Output:

```text
Case learning output
-
|- estimate_accuracy
|- detected_error_pattern
|- missing_question_candidate
|- advisory_candidate
|- fraud_risk: low/medium/high
|- recommended_learned_rule
|- confidence
|- evidence_count
|- promotion_status
|- rollback_available: true
```

### 10C. Evidence Gate

A learning candidate can auto-promote only if:

```text
Evidence gate
-
|- similar pattern appears >= 5 times
|- cases are completed transactions, not drafts
|- final outcome is confirmed by customer/worker flow
|- no major contradiction from recent similar cases
|- confidence is above configured threshold
|- learning does not touch booking/payment/cancel autonomy
|- learning does not expose or depend on unsafe PII
|- learning has a rollback path
```

### 10D. Learning Flow Illustration

```text
Job completed
-
|- collect safe metadata
|- compare Kael estimate vs actual outcome
|- compare problem classification vs worker final report
|- review scope change and customer rating
|- create learning candidate
|- check evidence gate
   -
   |- if gate fails
   |  -
   |  |- keep as pending candidate
   |  |- show in admin learning dashboard
   |  |- do not affect runtime behavior
   |
   |- if gate passes
      -
      |- auto-promote to learned rule or price prior
      |- assign version
      |- apply to future Kael analysis
      |- monitor future accuracy
      |- allow admin rollback
```

### 10E. Example Learned Rule

```text
Observed pattern
-
|- 5 completed plumbing jobs
|- user said: repeated clogging
|- Kael classified as small clogged drain
|- workers repeatedly found main pipe blockage
|- final price was consistently higher than initial estimate

Auto-promoted learned rule
-
|- when user mentions repeated clogging
|- ask whether multiple drains are affected
|- increase complexity prior from small to medium
|- include advisory about main-pipe clearing when justified
|- monitor next 10 similar cases
```

### 10F. Forbidden Autonomous Learning Effects

```text
Forbidden
-
|- auto-charge customer
|- auto-confirm booking
|- auto-cancel job
|- auto-approve worker
|- auto-punish worker
|- auto-change final price without customer confirmation
|- auto-expand supported service scope
|- hide learning changes from admin
```

---

## 11. Backend Domain Model

Backend modules should be built as deep modules with clear interfaces and testable seams.

```text
Backend modules
-
|- AuthProfileModule
|- ServiceCatalogModule
|- PriceBaselineModule
|- KaelPriceCheckModule
|- MarketMemoryService
|- CaseReviewService
|- JobLifecycleModule
|- BroadcastMatchingModule
|- ChatEvidenceModule
|- NotificationModule
|- ScopeChangeModule
|- ReviewModule
|- LearningRuleModule
|- AdminModule
```

Module contract:

```text
Each module must define
-
|- responsibility
|- inputs
|- outputs
|- state owned
|- actions forbidden
|- test requirements
```

### AuthProfileModule

```text
Responsibility
-
|- customer/worker/admin identity
|- role-first Supabase email/password auth in Phase 0
|- phone OTP auth later after SMS provider setup
|- role-safe profile creation
|- customer apartment profile
|- worker verification profile

Forbidden
-
|- client-controlled role escalation
|- logging phone/CCCD/address
```

### ServiceCatalogModule

```text
Responsibility
-
|- electrical/plumbing/cleaning taxonomy
|- problem categories
|- complexity hints
|- disabled future service entries

Forbidden
-
|- enabling unsupported services without Tu approval
```

### PriceBaselineModule

```text
Responsibility
-
|- fallback price ranges
|- service/problem/district/complexity baselines
|- versioned updates

Forbidden
-
|- hardcoded VND prices in source code
|- exact guaranteed price claims
```

### KaelPriceCheckModule

```text
Responsibility
-
|- orchestrate intent, vision, price search, synthesis
|- validate structured output
|- return estimate card data

Forbidden
-
|- raw AI output to UI
|- client-side AI calls
|- unsupported service advice
```

### JobLifecycleModule

```text
Responsibility
-
|- job state transitions
|- customer confirmations
|- worker status updates
|- completion states

Forbidden
-
|- booking without A7 confirmation
|- payment completion without A12 confirmation
```

### BroadcastMatchingModule

```text
Responsibility
-
|- eligible worker search
|- job broadcast
|- 60s accept window
|- rebroadcast on expiry/decline

Forbidden
-
|- exposing full address before worker accept
|- assigning unavailable/unapproved worker
```

### ChatEvidenceModule

```text
Responsibility
-
|- customer-worker message relay
|- Kael system messages
|- media evidence
|- dispute evidence trail

Forbidden
-
|- logging raw sensitive messages
|- rewriting normal human chat content
```

### ScopeChangeModule

```text
Responsibility
-
|- worker scope-change request
|- Kael explanation
|- customer decision
|- worker blocking until decision

Forbidden
-
|- auto-approve scope change
|- hidden price change
```

### LearningRuleModule

```text
Responsibility
-
|- learning candidates
|- evidence gates
|- learned rule versions
|- monitoring
|- rollback

Forbidden
-
|- applying learning to booking/payment/cancel autonomy
|- hiding learned changes from admin
```

Backend hard rules:

```text
Backend hard rules
-
|- all AI calls server-side
|- all user input validated with Zod or equivalent
|- database is source of truth
|- no hardcoded VND prices
|- no booking/payment/cancel without confirmation
|- logs never contain PII
|- learning events must be versioned and auditable
|- idempotency required for job/broadcast/payment-like transitions
```

---

## 12. State Machines

Frontend and backend must share these state machines. UI states must not invent transitions that backend does not support.

### Job Status

```text
draft
-> analyzing
-> estimate_ready
-> awaiting_customer_confirm
-> broadcasting
-> worker_matched
-> worker_on_way
-> arrived
-> inspecting
-> repairing
-> scope_change_pending
-> completed_by_worker
-> confirmed_by_customer
-> payment_pending
-> paid
-> reviewed
-> cancelled
```

Hard transition rules:

```text
Rules
-
|- draft cannot broadcast
|- awaiting_customer_confirm cannot broadcast until A7
|- scope_change_pending blocks changed work
|- completed_by_worker cannot become paid before A12
|- cancelled jobs cannot resume without new job or explicit reschedule flow
```

### Broadcast Status

```text
pending
-> sent
-> accepted
-> declined
-> expired
-> reassigned
-> cancelled
```

### Scope Change Status

```text
none
-> requested_by_worker
-> reviewing_by_kael
-> waiting_customer_decision
-> approved_by_customer
-> rejected_by_customer
-> cancelled
```

### Worker Verification Status

```text
draft
-> submitted
-> under_review
-> approved
-> rejected
-> suspended
```

### Payment Status

```text
not_started
-> pending
-> paid
-> failed
-> refunded_later
```

### Learning Candidate Status

```text
created
-> pending_evidence
-> evidence_gate_passed
-> auto_promoted
-> active
-> monitoring
-> rolled_back
-> archived
```

### Learning Rule Status

```text
draft
-> active
-> monitoring
-> degraded
-> disabled
-> rolled_back
```

### Notification Status

```text
queued
-> sent
-> delivered
-> failed
-> dismissed
```

---

## 13. Matching And Broadcast Rules

Matching starts only after customer confirms booking search at A7.

Worker eligibility:

```text
Eligible worker
-
|- approved
|- not suspended
|- online
|- supports requested service type
|- works in customer district
|- not already busy
|- not blocked by prior job conflict
```

Broadcast behavior:

```text
Broadcast flow
-
|- create broadcast batch
|- send to eligible workers
|- each worker gets limited time window
|- worker accepts or declines
|- expired request moves to next eligible worker/batch
|- no worker found triggers customer fallback
```

Worker request card before accept:

```text
Visible before accept
-
|- service type
|- problem summary
|- general district
|- Kael pre-brief
|- estimated earning
|- countdown

Hidden before accept
-
|- full address
|- unit number
|- phone number
|- exact customer identity details
```

Failure rules:

```text
Failure rules
-
|- worker decline -> try next worker
|- countdown expires -> auto-expire request
|- worker accepts then cancels -> rebroadcast
|- no worker available -> notify customer and log
```

---

## 14. Trust, Safety, And Evidence

Trust is a core product feature. Price transparency alone is not enough.

Trust signals:

```text
Customer sees
-
|- worker name after accept
|- worker photo if approved
|- rating
|- completed job count
|- ETA
|- Kael note that worker received issue brief
```

Worker verification:

```text
Worker trust
-
|- phone verified
|- identity submitted
|- CCCD front/back and selfie stored in worker-verification storage
|- admin approved
|- service skill declared
|- working district declared
|- suspension possible
```

Evidence trail:

```text
Evidence captured
-
|- customer initial description
|- customer photos/videos
|- Kael estimate output
|- worker acceptance
|- worker status timestamps
|- chat messages
|- scope change request
|- customer scope decision
|- completion notes/photos
|- customer confirmation
|- rating/review
```

Chat conduct:

```text
Chat rules
-
|- customer and worker chat is direct relay
|- Kael does not rewrite normal human chat
|- Kael can inject system messages
|- Kael intervention only for safety/legal/security/platform protection
|- chat is part of support/dispute evidence
```

PII rules:

```text
PII rules
-
|- do not log phone numbers
|- do not log CCCD
|- do not log full address
|- do not log worker bank account
|- do not send unnecessary PII to LLM
|- use IDs and safe metadata in logs
```

---

## 15. Pricing, Fees, And Scope Change

### Pricing Principles

```text
Price principles
-
|- estimate before booking
|- final price confirmed by worker after inspection
|- estimate shown as range, not exact guarantee
|- required disclaimer on every price estimate
|- no hardcoded VND values in source code
|- baseline prices live in DB/admin-managed data
|- Perplexity is market lookup only
```

### Fees

Current business model:

```text
Commission model
-
|- customer pays service price + 7.5% platform/service protection fee
|- worker receives service price minus about 10% platform fee
|- platform gross around 15% total before AI/payment/support costs
```

Example only:

```text
Example job: 300,000 VND
-
|- customer pays about 322,500 VND
|- worker receives about 270,000 VND
|- platform gross about 52,500 VND
|- AI cost tracked separately
```

### Scope Change

Scope change exists because real on-site inspection may reveal a different issue.

```text
Scope change flow
-
|- worker inspects
|- worker reports new issue/scope
|- worker enters new price estimate and reason
|- Kael compares original vs new scope
|- customer sees hard-stop confirmation
|- customer approves or rejects
|- worker continues only if approved
```

Scope change modal must show:

```text
Modal content
-
|- original issue
|- new issue
|- original estimate
|- new estimate
|- reason
|- Kael explanation
|- continue button
|- cancel/reject button
```

Forbidden:

```text
Forbidden pricing behavior
-
|- hidden price change
|- exact guarantee
|- final price without worker confirmation
|- scope change without customer decision
|- AI-fabricated market price
```

---

## 16. Notifications

Notifications are operational state updates, not a complex realtime system.

Notification events:

```text
Customer notifications
-
|- profile created
|- estimate ready
|- searching for worker
|- worker matched
|- worker on the way
|- worker arrived
|- scope change requested
|- scope change approved/rejected
|- job completed by worker
|- payment needed
|- review requested
|- no worker found
```

```text
Worker notifications
-
|- account approved
|- incoming job request
|- job request expired
|- customer sent message
|- customer approved scope change
|- customer rejected scope change
|- customer confirmed completion
|- earning updated
```

```text
Admin notifications / dashboard alerts
-
|- worker waiting for approval
|- AI provider failure spike
|- no worker found
|- high-risk scope change
|- dispute opened
|- learning rule degraded
|- learning rule auto-promoted
```

Rules:

```text
Notification rules
-
|- user-facing notifications are Vietnamese
|- no PII in push notification body
|- notification failure must be logged safely
|- notification is not source of truth; database state is
```

---

## 17. Cancellation, Reschedule, And Failure Recovery

Failure handling must be explicit. Do not hide failure behind generic success states.

```text
Failure recovery
-
|- AI search fails -> DB baseline + clear fallback
|- vision fails -> text-only analysis
|- no worker found -> notify customer + retry/follow-up
|- worker accepts then cancels -> rebroadcast
|- worker no response -> expire and try next worker
|- customer cancels before accept -> stop broadcast
|- customer cancels after accept -> cancellation policy placeholder
|- scope change rejected -> stop changed work, decide cancel/original scope
|- payment fails -> keep job unpaid, notify support
|- learning rule degrades accuracy -> rollback rule
|- dispute opened -> lock evidence, admin review
```

Cancellation states:

```text
Cancellation moments
-
|- before worker accept: simple cancellation
|- after worker accept: policy required later
|- after worker arrival: support/admin review may be needed
|- after scope change reject: cancel or continue original scope only if safe
```

Reschedule:

```text
Reschedule rules
-
|- reschedule is not the same as cancel
|- reschedule must preserve evidence/history
|- worker availability must be rechecked
|- scheduled jobs still require explicit confirmation
```

Dispute:

```text
Dispute flow
-
|- customer opens issue
|- evidence is locked
|- admin reviews chat/photos/status/scope changes
|- admin decides resolution
|- learning services may consume safe outcome metadata later
```

---

## 18. Frontend Build Contract

Every frontend screen must map to a workflow step.

```text
Frontend contract
-
|- every screen maps to a workflow step
|- every screen has loading/empty/error state
|- user-facing text is Vietnamese
|- future services are disabled, not functional
|- price UI always shows estimate disclaimer
|- confirmation UI required for money-impacting actions
|- Kael messages visually differ from human chat
|- Next.js is not consumer web product
|- React Native is the primary app surface
```

Customer navigation:

```text
Customer tabs
-
|- Home
|- Book
|- Kael
|- History
|- Profile
```

Worker navigation:

```text
Worker tabs
-
|- Home
|- Jobs
|- Chat
|- Earnings
|- Profile
```

Admin navigation:

```text
Admin sections
-
|- Dashboard
|- Jobs
|- Workers
|- Price Baselines
|- Learning Rules
|- Learning Candidates
|- AI Logs
|- Support
```

Screen implementation rule:

```text
Every non-trivial screen must define
-
|- purpose
|- state source
|- primary action
|- secondary action
|- loading state
|- empty state
|- error state
|- success state
|- telemetry/logging boundary
```

Mobile readiness:

```text
React Native constraints
-
|- small screen layout
|- slow network
|- image upload permissions
|- camera/photo access
|- push notification permissions
|- keyboard behavior
|- touch targets
|- interruption recovery
```

---

## 19. Backend Build Contract

Backend owns business logic. Client displays state and submits user decisions.

```text
Backend contract
-
|- API routes / Edge Functions validate input
|- Supabase is source of truth
|- RLS protects actor boundaries
|- AI calls are server-side only
|- every network call has timeout
|- every provider call logs safe metadata
|- every money-impacting transition is explicit
|- every state transition is validated
```

API/server responsibilities:

```text
Server responsibilities
-
|- create/update profiles
|- validate service taxonomy
|- create draft job
|- call Kael analysis
|- create estimate
|- confirm booking search
|- broadcast job
|- accept/decline worker request
|- update job status
|- create scope change request
|- record customer scope decision
|- record completion
|- record review
|- create learning candidates
|- apply evidence gates
```

Client must not:

```text
Client forbidden
-
|- call AI providers directly
|- hold API secrets
|- decide final RLS-sensitive permissions
|- mutate worker approval
|- mutate learning rules directly
|- bypass state transitions
|- fabricate successful payment/booking states
```

Idempotency:

```text
Idempotency required for
-
|- auth/profile creation
|- OTP/profile creation later when SMS provider is enabled
|- booking confirmation
|- job broadcast
|- worker accept
|- scope change decision
|- completion confirmation
|- payment callback later
|- learning rule promotion
```

---

## 20. Testing Blueprint

Tests must prove behavior, not just file existence.

Testing layers:

```text
Testing layers
-
|- Static/Type
|- Unit
|- Integration
|- SQL/Migration
|- Wiring
|- E2E later
|- UI visual/manual verification
|- Security negative tests
```

Workflow test areas:

```text
Testing blueprint
-
|- Auth/profile tests
|- Service taxonomy tests
|- Price baseline tests
|- Kael output schema tests
|- AI fallback tests
|- Job lifecycle state tests
|- Broadcast expiry tests
|- Scope change approval/rejection tests
|- RLS customer/worker/admin tests
|- Chat/evidence permission tests
|- Learning candidate creation tests
|- Evidence gate tests
|- Learning rule auto-promotion tests
|- Learning rule rollback tests
|- Admin visibility tests
```

Critical test cases:

```text
Must test
-
|- customer cannot create booking without A7 confirm
|- worker cannot see full address before B3 accept
|- worker cannot continue scope change before A11 decision
|- price estimate always has disclaimer
|- no hardcoded price fallback
|- out-of-scope service returns polite decline
|- learning candidate cannot promote before evidence gate
|- learning rule can auto-promote after evidence gate
|- learning rule cannot affect booking/payment/cancel
|- learning rule can be rolled back
```

Security tests:

```text
Security tests
-
|- customer cannot read another customer's job
|- worker cannot read job before accept
|- unapproved worker cannot receive jobs
|- user cannot create admin role through metadata
|- logs do not include full phone/address/CCCD/API keys
```

AI tests:

```text
AI tests
-
|- provider timeout
|- provider retry
|- provider fallback
|- cost logging
|- structured output validation
|- raw output never reaches UI
|- unsupported service declines
```

---

## 21. Do Not Build Now

This section prevents attractive but dangerous over-engineering.

```text
Do not build now
-
|- multi-agent orchestration
|- autonomous booking
|- autonomous payment
|- autonomous cancellation
|- autonomous worker punishment
|- service expansion beyond electrical/plumbing/cleaning
|- multi-city support
|- consumer web app
|- complex custom memory system outside controlled learning tables
|- strategic L3/L4 autonomy
```

Allowed to design, not necessarily implement:

```text
Allowed in docs
-
|- future-ready workflows
|- state machine placeholders
|- learning-system skeleton
|- payment placeholders
|- support/admin placeholders
```

Implementation rule:

```text
If a feature takes more than one week and only matters at more than 10x current scale,
defer unless Tu explicitly approves.
```

Kael learning exception:

```text
Evidence-gated self-learning is allowed only for analysis behavior and price suggestions.
It must not become autonomous booking, autonomous payment, autonomous cancellation,
worker punishment, or service expansion.
```

Current priority:

```text
Priority
-
|- build quality foundation
|- get to first real transaction
|- keep workflow simple enough to implement
|- preserve trust through price transparency and explicit confirmation
```

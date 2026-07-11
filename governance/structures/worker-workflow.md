# Structures Spoke - Worker Workflow (B0-B8)

> Extracted from `STRUCTURES.md` section 7 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for the worker workflow. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

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
|- accepts within 60s as a candidate
|- waits for customer confirmation of the proposed match
|- full address revealed only after customer confirmation
|- updates job status
|- chats with customer
|- requests scope change if issue differs
|- waits for the validated Kael scope proposal and explicit customer decision
|- completes job with notes/photos
|- earnings updated only after customer completion confirmation and verified payment state
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
|- service skills: electrical / plumbing / cleaning / HVAC / upholstery / handyman, including verified multi-service combinations
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
|- allow worker to accept or skip quickly; acceptance proposes a candidate and does not finalize assignment

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
|- worker_candidate_proposed
|- worker_declined
|- request_expired
```

### B4. Job Detail After Customer Confirms Candidate

```text
Purpose
-
|- give worker full context only after both worker acceptance and customer confirmation

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
|- full details only after customer confirms the accepted candidate
|- if the customer declines, return the job to matching without revealing exact address or customer PII
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
|- reason
|- optional photo evidence

Rules
-
|- worker does NOT propose price; Kael computes new estimate from worker reported scope (Phase 2.0 2026-05-23)
|- worker cannot continue changed work until Kael emits a validated scope proposal and the customer explicitly confirms it, or an admin override resolves a dispute
|- Kael computes + explains the change to the customer, with confirm/reject/appeal paths
|- all scope change data is logged
```

### B7. Complete Job

```text
Purpose
-
|- worker submits completion evidence

Input
-
|- completion note (required)
|- completion photos (>= 1 required)

State
-
|- completed_by_worker
|- awaiting_customer_completion_confirm
|- confirmed_by_customer or disputed

Rules
-
|- worker does NOT enter final price; Kael-locked value is authoritative (Phase 2.0 2026-05-23)
|- final price source: jobs.final_price (set at the confirmed A7 offer baseline or latest customer-confirmed A11 Kael-computed scope proposal)
|- payment cannot start until the customer explicitly confirms completion and the server validates the completion decision
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
|- withdrawal controls only when a real rail is implemented; otherwise an honest unavailable state

Rule
-
|- earnings finalization depends on Kael completion/payment decision and provider capability
```

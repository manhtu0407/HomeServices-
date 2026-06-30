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
|- accepts within 60s
|- full address revealed
|- updates job status
|- chats with customer
|- requests scope change if issue differs
|- waits for Kael scope decision or override
|- completes job with notes/photos
|- earnings updated after Kael completion/payment decision
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
|- reason
|- optional photo evidence

Rules
-
|- worker does NOT propose price; Kael computes new estimate from worker reported scope (Phase 2.0 2026-05-23)
|- worker cannot continue changed work until Kael emits a validated scope decision or admin override
|- Kael computes + explains change to customer, with accept/appeal path
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
|- kael_completion_review

Rules
-
|- worker does NOT enter final price; Kael-locked value is authoritative (Phase 2.0 2026-05-23)
|- final price source: jobs.final_price (set at A7 Kael decision baseline or latest A11 Kael-computed scope decision)
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
|- earnings finalization depends on Kael completion/payment decision and provider capability
```

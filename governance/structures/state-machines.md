# Structures Spoke - State Machines

> Extracted from `STRUCTURES.md` section 12 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for the shared state machines. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 12. State Machines

Frontend and backend must share these state machines. UI states must not invent transitions that backend does not support.

### Job Status

```text
draft
-> analyzing
-> estimate_ready
-> awaiting_customer_confirm
-> broadcasting
-> worker_candidate_pending
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
|- matching/broadcast cannot start without explicit customer offer confirmation and a validated KaelAutonomyDecision
|- worker acceptance creates a candidate; it cannot become worker_matched, receive exact address, or go on the way before customer candidate confirmation
|- scope_change_pending blocks changed work until the customer explicitly confirms the validated Kael proposal; rejection resumes the previously agreed status and scope
|- completed_by_worker cannot enter payment_pending before explicit customer completion confirmation and the validated A12 completion decision
|- payment_pending cannot become paid from client assertion or an unavailable rail; require explicit pay action and verified result/callback
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

An accepted broadcast creates a `job_worker_candidates` proposal and moves the job to `worker_candidate_pending`; it does not set `jobs.worker_id` or finalize the match.

### Worker Candidate Status

```text
proposed
-> customer_confirmed
-> customer_declined
-> expired
-> withdrawn
```

Only `customer_confirmed` may set the final worker and move the job to `worker_matched`. Other terminal candidate outcomes return the job to the matching policy without exposing the exact address.

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

# Structures Spoke - State Machines

> Extracted from `STRUCTURES.md` section 12 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for the shared state machines. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 12. State Machines

Frontend and backend must share these state machines. UI states must not invent transitions that backend does not support.

### Job Status

```text
draft
-> analyzing
-> estimate_ready
-> awaiting_customer_confirm (legacy/audit compatibility; UI treats as Kael orchestration)
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
|- matching/broadcast cannot start without validated KaelAutonomyDecision
|- scope_change_pending blocks changed work
|- completed_by_worker cannot become paid before A12 completion/payment decision
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

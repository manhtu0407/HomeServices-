# Structures Spoke - Cancellation, Reschedule, and Failure Recovery

> Extracted from `STRUCTURES.md` section 17 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for failure recovery, cancellation, reschedule, dispute. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

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
|- scheduled jobs require explicit schedule intent or a future policy-backed Kael decision
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

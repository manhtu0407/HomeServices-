# Structures Spoke - Matching and Broadcast Rules

> Extracted from `STRUCTURES.md` section 13 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for worker eligibility and broadcast behavior. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 13. Matching And Broadcast Rules

Matching starts only after the customer explicitly confirms the current offer and Kael emits a validated `kael_started_matching` decision at A7. Offer confirmation is a mandatory, audited gate.

Worker eligibility:

```text
Eligible worker
-
|- approved
|- not suspended
|- online
|- supports requested service type
|- has every verified capability required by the diagnosis/scope artifact
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
|- worker accepts as a candidate or declines
|- accepted candidate is held while the customer sees real trust signals and confirms/declines
|- customer confirms -> finalize match, release only necessary exact address, allow on-the-way state
|- customer declines -> release candidate and continue matching according to policy
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

Worker acceptance does not authorize release of the exact address. Those fields remain hidden until customer candidate confirmation finalizes the match.

Failure rules:

```text
Failure rules
-
|- worker decline -> try next worker
|- countdown expires -> auto-expire request
|- customer declines candidate -> release candidate and try next eligible worker according to policy
|- worker accepts then cancels -> rebroadcast
|- no worker available -> notify customer and log
|- never fabricate a candidate, rating, capability, availability, or ETA
```

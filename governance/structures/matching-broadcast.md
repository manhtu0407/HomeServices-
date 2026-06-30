# Structures Spoke - Matching and Broadcast Rules

> Extracted from `STRUCTURES.md` section 13 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for worker eligibility and broadcast behavior. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 13. Matching And Broadcast Rules

Matching starts when Kael emits a validated `kael_started_matching` decision at A7. Customer input can improve or challenge the decision, but it is not the mandatory gate.

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

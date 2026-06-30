# Structures Spoke - Notifications

> Extracted from `STRUCTURES.md` section 16 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for notification events and rules. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

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
|- Kael approved scope change / customer appealed
|- Kael rejected scope change / customer appealed
|- Kael confirmed completion or opened dispute
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

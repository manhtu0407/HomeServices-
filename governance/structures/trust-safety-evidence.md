# Structures Spoke - Trust, Safety, and Evidence

> Extracted from `STRUCTURES.md` section 14 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for trust signals, verification, evidence trail, PII rules. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

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
|- customer/worker scope evidence or appeal
|- completion notes/photos
|- Kael completion/payment decision
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

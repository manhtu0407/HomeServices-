# Structures Spoke - Trust, Safety, and Evidence

> Extracted from `STRUCTURES.md` section 14 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for trust signals, verification, evidence trail, PII rules. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 14. Trust, Safety, And Evidence

Trust is a core product feature. Price transparency alone is not enough.

Trust signals:

```text
Customer sees
-
|- worker name after accept as a candidate
|- worker photo if approved
|- rating
|- completed job count
|- verified service capabilities relevant to the case
|- ETA only after final match and only from real routing/availability data
|- Kael note that worker received issue brief
|- confirm/decline actions before final assignment
```

Worker verification:

```text
Worker trust
-
|- phone verified
|- identity submitted
|- CCCD front/back and selfie stored in worker-verification storage
|- admin approved
|- service skill and capability evidence declared and reviewed
|- working district declared
|- suspension possible
```

Service safety/capability gates:

```text
Universal gates
-
|- Kael may pause, decline, or reroute a case when the evidence indicates immediate danger, regulated/specialist work, structural risk, inaccessible work, or missing required worker capability
|- HVAC remains broad (cleaning, diagnosis, or repair); it is narrowed only by case evidence and verified worker capability, not by a cleaning-only product rule
|- handyman work must be rerouted when it is actually electrical, plumbing, HVAC, structural, gas, fire-safety, or other capability-controlled work
|- a worker cannot be matched merely because the top-level service type matches
```

Evidence trail:

```text
Evidence captured
-
|- customer initial description
|- customer private photos
|- editable on-device voice transcript; no raw audio model input
|- 1-3 locally extracted video frames for vision analysis
|- original video only as private human-review evidence when disclosed and retained lawfully
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
|- scrub editable voice transcript and selected photo/video frames before model input
|- raw audio must not leave the device; never send raw audio or raw video to an AI provider
|- use short-lived server-side access for private image evidence; never expose public evidence URLs by default
|- apply least-privilege access, retention, and deletion controls to original human-review video
|- use IDs and safe metadata in logs
```

Kael private-media retention enforcement:

```text
|- model-visible images/locally extracted frames: delete after 7 days from consumption
|- original private human-review video: delete after 30 days from consumption
|- revoked or abandoned upload intents remain in the same durable deletion queue
|- `kael-media-retention` deletes bytes through the Storage API, then finalizes the leased intent row; SQL must not delete Storage metadata directly
|- rollout is fail-closed: provision matching `KAEL_MEDIA_RETENTION_SECRET` Edge env and `kael_media_retention_secret` Vault values plus `project_url`, then call `private.schedule_kael_chat_media_retention()` to install the named 15-minute cron job
```

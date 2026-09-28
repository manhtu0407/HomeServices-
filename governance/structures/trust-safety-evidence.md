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

### Worker Discipline (Tu, 2026-09-25)

Detectors and customer reports create **proposals**; an administrator confirms each one. This is how `do-not-build-now.md` §21 ("autonomous worker punishment") is honoured: the only automatic effect is the level-1 matching down-rank, a ranking signal that disappears if the proposal is dismissed.

```text
Levels (numbers live in worker_discipline_policy, never in client copy)
-
|- L1 late arrival                       -> warning + matching priority down for 7 days
|     (slow response is NOT detected yet: Kael only reminds the worker, see below)
|- L2 cancel without reason, no-show,
|     confirmed quality complaint        -> minus 20 points, network multiplier held at 1.0x for 30 days
|- L3 off-app dealing, extra cash         -> forfeit all unredeemed points, end that customer link,
|                                           redemption frozen 90 days, strike; 2nd strike in 12 months = ban
|- L4 platform fraud                      -> ban, forfeit all points, claw back un-withdrawn bonus only
|- L5 harm to a customer                  -> one-tap matching suspension on a credible report;
|                                           verified = ban, forfeit, identity blocklist, withdrawal hold

Due process
-
|- earned job income is never deducted as a fine; a banned worker may still withdraw it unless a verified L5 holds it
|- a held balance reaches a customer only with the worker's written consent or an authority decision; NestScout never advances compensation
|- the L5 withdrawal hold lapses after withdrawal_hold_days (90); only an admin-recorded authority reference renews it, at most 365 days per renewal
|- the worker sees the decision reason, never the reporter's own statement
|- appeal within 7 days with a reason and evidence; an overturn restores points, link, strike and tier exactly
|- an open L3-L5 case freezes redemption only until its admin decision deadline, then unfreezes by itself
|- a verified fabricated customer report locks that customer account (account deletion stays available)

Evidence
-
|- chat-guard keeps the original of every redacted message for 180 days (service-only table) as off-app evidence
|- appeal files live in the private discipline-evidence bucket behind signed URLs
|- CCCD numbers, phones and sign-in emails are stored only as HMAC-SHA256 digests keyed by IDENTITY_HMAC_KEY (Edge only) plus the CCCD last four
|- Gmail spellings fold to one digest (dots and +tags dropped, googlemail.com = gmail.com); the first approval checks all three digests against the blocklist
|- customers can report the worker from the active Kael Work step and from the "Thợ đang làm" card on the history screen, not only after completion

Compensation by agreement (Tu, 2026-09-28)
-
|- only confirmed money/property cases (extra cash, confirmed quality complaint, theft, intentional damage) qualify; harassment and violence go to the authorities
|- the customer names an amount with a description and up to 3 photos (camera or library; private discipline-evidence bucket under compensation/<customer>/<case>/, prefix re-checked by the claim RPC); the worker accepts, counters or declines; turns alternate with a deadline and a bounded offer count (policy row)
|- a worker can neither offer nor accept more than the withdrawable balance covers, so NestScout never advances money
|- both sides accepting the same amount is the worker's written consent: the amount is reserved from the balance at once, then an admin transfers it to the customer's Profile refund account (customer_payment_methods; the full number is revealed only for a reserved payout and every reveal is logged as compensation_payee_viewed) and records the bank reference
|- no agreement or a missed deadline ends the negotiation; the customer is pointed to the authorities
|- code: 20260925126000_compensation_mediation.sql, domains/program/compensation.ts; tests P280-P282

Reply reminders, not penalties (Tu, 2026-09-28)
-
|- a customer message unanswered for reply_nudge_minutes (15) while the worker is waiting to depart or closing the job reminds the worker (inbox + push) and tells the customer Kael has done so
|- skipped while driving (worker_on_way) or on site (arrived, inspecting, repairing, scope change)
|- worker_reply_nudges rows are the measurement a future slow-response rule must be calibrated on after real transactions; no reminder opens a case (P278, P279)
```

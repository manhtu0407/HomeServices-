# Safety coverage matrix and remaining blind spots

Evidence tier T0. "Delivered" means the guidance reaches the customer through a response the **shipped** mobile client
renders. That client shows the server's text only for a successful response: every Kael failure is mapped by code to fixed
copy (`localizeKaelRequestFailure`, `customer-kael-chat-helpers.ts`) and the streaming routes replace every error message
with fixed copy (`kaelChatStreamErrorPayload`, `stream.ts`). Guidance carried in an error message is therefore not delivered
to the customer, whatever the HTTP body says.

## Entry points

| # | Entry point (route) | Gate | Runs before | Delivered | Evidence |
|---|---|---|---|---|---|
| 1 | Case, new, typed message (`POST /kael/chat`) | yes | the analysis, the model | yes (201 chat) | P406, P414 E04 |
| 2 | Case, new, **invalid schedule** | yes — **fixed**: was a 400 with the text in the message | the schedule refusal | yes (201 chat, no schedule stored) | P412, P411, P414 E07 |
| 3 | Case, existing session, typed message (create with `session_id`) | yes (same as the turn) | | yes | P406, P411 |
| 4 | Case, existing session, voice transcript or description only | yes (closed in the previous closure) | the "no message" return, the schedule refusal | yes | P411, P414 E05 |
| 5 | Case turn, typed message, reviewed transcript, evidence summary (`POST /kael/chat/:id`, `/stream`) | yes | boundary guard, intent router, pipeline, model | yes | P406, P408, P414 E01–E02 |
| 6 | Case turn with the **price-question chip** (otherwise persists nothing) | yes | the early return | yes | P408 |
| 7 | Case turn while the **booking confirmation is pending** | yes (parked: every route ends the request, the confirmation stays pending) | the 409 | yes | P407, P414 E06 |
| 8 | Case turn, **invalid schedule** | yes — **fixed** | the schedule refusal | yes (200 chat, no schedule stored) | P412, P411, P414 E07 |
| 9 | Case turn, **closed Case** (confirmed, abandoned, unsupported) | yes, as a refusal that carries the text | | **no** — the guidance is in the 409 message, which the shipped app replaces with fixed copy. The shipped composer does not send to a closed chat (it uses the assistant route, entry 13) | P411; **residual** |
| 10 | Case evidence step: message, skip reason, transcript, summary (`/evidence`, `/evidence-stream`) | yes | validation, media consumption, phase change | yes | P406, P408, P414 E03 |
| 11 | Booking description at the intake confirmation | yes (entry `confirm`) | the analysis | yes | P406, P407 |
| 12 | Assistant, normal surface (`POST /kael/assistant`) | yes — **fixed order** | now before the quota | yes | P401, P405, P412, P414 E08 |
| 13 | Assistant, Case surface, job in progress | yes — **fixed order**: after ownership, before the job-status refusal, the quota and the memory read | | yes | P412, P414 E09 |
| 14 | Normal-chat conversation turn (`/me/kael/conversations/:id/turn`, `/stream`) | yes — **fixed order**: before the paid summary, the paid web search, the stored-context read and image consumption | | yes | P412, P414 E10 |
| 15 | Case-linked conversation turn | refused (409 `CASE_WORK_SESSION_REQUIRED`) | | not reachable from the shipped app, which posts Case turns to entry 5 | **residual** |
| 16 | Case intake / evidence / offer decision by an admin | refused: the decision is the customer's | | — | P413 (AF-1, AF-2) |
| 17 | Direct job create (`POST /jobs`, Edge) | not an intake: every well-formed payload is refused with 409 `KAEL_CASE_WORK_REQUIRED` and nothing is created | | — | read from `http/dispatch/job.ts` (`rejectDirectJobCreate`, unchanged); no test added |
| 18 | Next.js reference route (`POST /api/jobs`, `apps/api`) | **none**: it creates a Job with an estimate from the free-text description, with no gate and no Case Work. It is reference and parity code; the repository has no deployment config for it (the release workflows deploy Edge functions only) and the shipped app does not call it | | n/a | **residual** (N-06 in `defect-ledger.md`); read from source, not exercised |

Every row above that says "yes" is also exercised for **no model or provider call** (for any route that ends the turn),
**no Job, quote, match, payment or consent**, and **another customer, a worker or an admin getting nothing and writing
nothing** (P411, P412, P413, P414). 14 sentinel reports × 10 entry points = 140 cells, all passing (P414). The sentinels are
fixed development-level phrases: they prove the gate is wired, not that the classifier generalises.

## Where each requirement is proved (T0)

| Requirement | Proved by | Limit |
|---|---|---|
| No silent bypass of the gate at any supported entry point | P414: 14 fixed sentinel reports × 10 entry points (140 cells); P411, P412 for the paths around them | The sentinels are fixed development phrases |
| Danger, negation, history, maintenance, hypothetical and ordinary wording are told apart | P401, P405, P410 (156 emergencies, 113 ordinary requests, each read with its service) | The cues were written against these sets; H5 reproduction 11/29 |
| Signals combined across fields, independent of order | P408 (apart, together and swapped orders agree) | A cue split across two fields is not combined |
| Numbers 112 / 113 / 114 / 115 | P401, P414 (the number each route must name is asserted per cell) | |
| No dependence on playbook flags, AI availability or paid providers | P412 (AI switched off still answers; the early answer runs before the quota, summary, search and image reads); P414 (zero provider calls on every stop route) | A model-written reply was not evaluated |
| Guidance reaches the customer, including failure responses | P411, P412: a 2xx for every open-Case route; the failure cases are listed in the next table | A failure response's text is not shown by the shipped app (N-01, N-02) |
| Authentication, ownership, privacy and transaction boundaries intact | P411, P412, P413: stranger 404, worker 403, admin 403 with nothing written; no Job, quote, match, payment or consent | Row-level security and atomicity are BLOCKED at T1 |
| Multi-turn corrections and simultaneous hazards | P406 (a withdrawal is ordinary information), P412 (a report, a withdrawal and a second hazard on one Case), P401 (fire and medical together name 112) | |
| No unsafe physical-world instruction or fabricated guarantee | P414: the 12 fixed texts (6 routes × 2 languages) are pinned by hash, each names its verified number and makes no promise of help, and every sentence that names a risky action (approach, operate, extinguish, unplug, move) carries a negation or a condition; P405 pins the English electrical and water wording (no flame, no switch) | A word-list scan plus a developer reading, not a fire-service review |

## Which response a failing emergency request returns, and who sees it

| Situation | Response | Guidance delivered to the customer in the shipped app |
|---|---|---|
| Open Case, any route, invalid schedule | 2xx reply | **yes** (new) |
| Open Case, pending confirmation, price chip | 2xx reply | yes |
| Closed Case through the API | 409 or 400 with the text in the message | **no** (residual; unreachable from the shipped UI) |
| The reply cannot be written | error with the text in the message, plus a failure trace | **no** (residual; the non-streaming client retries a 5xx POST with backoff, and the stranded-turn logic makes the retry safe) |
| New Case over the create quota (5 a minute, 20 an hour) | 429 | **no** (residual; owner decision on a bounded allowance) |
| Not the owner (another customer, a worker) | the plain refusal, no guidance | by design |

## Blind spots that remain

1. **Wording the classifier has not seen.** Detected and routed 11 of 29 on the sealed set (reproduction), 155 of 156 on
   the sets the cues were written against, and 111–143 of 156 under one-letter typos, stretched letters or missing tone
   marks. No independent measurement exists. See `classifier-assessment.md`.
2. **Free-text surfaces with no gate.** Messages in the customer–worker job chat, scope-change and dispute statements,
   cancellation and review notes, apartment-access notes, address labels, conversation titles, Kael memory edits,
   compensation claims, feedback. They are not Kael intake entry points; a hazard written there gets no guidance. The
   route list was enumerated from the Edge route table (`kael.*`, `customer.kaelConversations.*`, `me.*`, `jobs.*`): the
   only routes that take a customer's report to Kael are rows 1–14; conversation create, suggestions, pin and archive carry
   no text.
3. **The shipped client's error handling.** Failure copy is fixed per code, so any future change that returns guidance in an
   error will not reach the customer until the client and the error envelope change together. The Work composer also refuses
   to send in a closed chat that has no job ("Empty") without calling the server.
4. **A cue split across two fields** (the object in the typed message, the verb in the transcript). Each text is read on its
   own so a negation never crosses a field; the cost is that a phrase spread over two fields is not combined.
5. **Fields not read:** `apartment_access_profile`, `address_label`, `problem_chips` (they persist across turns and one old
   phrase would lock a Case; owner decision).
6. **New-Case quota.** A first message that reports an emergency is refused with a 429 when the customer is over the create
   quota. A bounded allowance would weaken the abuse limit; owner decision.
7. **Other languages**, and speech-to-text errors on a device (T3).
8. **Wording of the fixed guidance** (LPG, fire, health) has had no domain review. Each text was checked for physical-world
   safety against the current rules (no instruction to approach a hazard, operate a switch near gas, or cut power in a wet
   area; every text names a verified number), but that is a developer check, not a fire-service review.
9. **Database behaviour:** two identical emergency messages are two customer turns (no idempotency key); under real
   concurrency, uniqueness of `(session_id, turn_index)`, locks and RLS are BLOCKED at T1.

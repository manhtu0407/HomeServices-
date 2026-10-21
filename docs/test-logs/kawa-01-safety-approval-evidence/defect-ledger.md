# Confirmed defects: reproduce, root cause, minimal fix, red/green, adversarial regression

Baseline for every "red" below: the pushed sources at `8a03e780` (13 production files swapped back, the tests as they are
now). `red-green/baseline-sources-new-and-updated-pillars-RED.txt` is the raw summary. Every fix was written after its
failing test and is the smallest change that turns it green. Evidence tier T0.

## Fixed

### D-01 An emergency reported with an invalid schedule was refused with a 4xx the shipped app cannot show

| | |
|---|---|
| Reproduce | A fire, gas, medical or police report sent with a past `scheduled_at` on the Case turn route, on the create route for a new Case, and on a create with a session id. The previous closure put the guidance in the 400's message |
| Verified against the client | `localizeKaelRequestFailure` maps the failure code to fixed copy and never reads the server's text; the streaming routes replace every error message with fixed copy (`kaelChatStreamErrorPayload`). The guidance in that 400 was not delivered |
| Root cause | The schedule refusal ran before any text was read, and the earlier fix answered inside the refusal instead of answering |
| Minimal fix | `answerEmergencyOnOpenSession` (`emergency-turn.ts`) called from `turn.ts` before the schedule refusal; in `create.ts` a request that reports an emergency over an invalid schedule drops the schedule and defers the analysis, so the first message is answered as an ordinary reply. Closed Cases, strangers and ordinary requests are refused exactly as before |
| Red on baseline | P412 turn and new-Case rows, P411's three updated rows, P414 entry E07 (14 cells) |
| Adversarial rows kept green | another customer gets the plain 400 and no guidance; a closed Case keeps its 400 with the text and is not written to; a worker or an admin gets 403 on create; an ordinary request is still refused with the unchanged message; the schedule is stored nowhere; no model call; no write outside the Case tables; a pending booking confirmation stays pending |

### D-02 The gate stood behind paid steps, the quota and refusable checks on the assistant and normal-chat routes

| | |
|---|---|
| Reproduce | Normal chat with 30 earlier turns and a fire or gas report called the provider (the memory summary, then the web search) before the deterministic answer. The assistant returned 429 for the same report after the quota was spent. An unusable image reference returned 400 and the report was lost. A job in a closed status (`cancelled`, `reviewed`) returned 409 before the gate on the assistant's Case surface |
| Root cause | The gate lived inside `runCustomerAssistant`, which runs after `answerKaelAssistant` has taken the quota, read memory and applied the job-status check, and after the conversation handler has consumed images, refreshed the summary (a model call), read the stored context and searched the web |
| Minimal fix | `resolveCustomerAssistantEmergency` (pure) in `answerKaelAssistant` after ownership and before the quota, the memory read and the status refusal (`assertJobStatus` split out of `requireJobAccess`); `emergencyReadingWithoutContext` in the conversation turn so a report that is or may be an emergency skips the summary, the search and image consumption, and a report that depends on the service still reads the stored conversation |
| Red on baseline | P412 assistant, normal-chat and job-status rows; P414 entry E09 (14 cells, the memory-audit write on the Case surface) |
| Adversarial rows kept green | another customer's job and conversation: 404 with no guidance, even with the quota spent; an admin and a worker on the Case surface: 403 before the job is read; a replayed turn appends nothing; an ordinary message keeps the quota and still reaches the provider (the emergency rows prove an ordering, not an outage); a bare gas leak outside an air-conditioning chat is the 112 prompt and inside one is not an alarm; AI switched off still answers |

### D-03 (AF-1, AF-2) An admin could decide or abandon a customer's Case

| | |
|---|---|
| Reproduce | A real Case world driven as an admin: the booking-intake decision moved the confirmation from pending to confirmed, or set the session to abandoned; skipping evidence wrote two turns; each wrote a turn attributed to the customer |
| Root cause | `assertKaelSessionOwnership` lets an admin pass (a deliberate read override), and unlike `confirmKaelChat` and `recoverLegacyKaelConfirmation` these two services had no customer-role guard; the Kael path-control table does not list them |
| Minimal fix | `ctx.role !== "customer"` → 403 at the top of `decideKaelIntakeConfirmation` and `submitKaelChatEvidence` (so also the evidence stream) |
| Red on baseline | P413 rows for intake `confirmed`, intake `correction_requested`, evidence, and the evidence stream |
| Adversarial rows kept green | the owner can still confirm and still skip evidence (control); a worker is refused at the route; admin read access to the Case is unchanged |

### D-04 (AF-3) An admin reached the durable accept RPC and the decline query as a worker

| | |
|---|---|
| Reproduce | `POST /jobs/:id/accept` as an admin called `accept_priced_broadcast_durable_atomic` with the admin's id; `/decline` queried `job_broadcasts` |
| Root cause | No role check in the Edge service; only SQL actor binding stopped it. Defence in depth, not an exploit (an admin has no broadcast row) |
| Minimal fix | `ctx.role !== "worker"` → 403 in `acceptBroadcast` and `declineBroadcast` |
| Red on baseline | P413 rows for accept and decline |

## Confirmed and not fixed (owner decision or T1)

| # | Finding | Why it stays | Decision needed |
|---|---|---|---|
| N-01 | Guidance carried in an error response is not shown by the shipped app: closed Case through the API, a reply that cannot be written, a streaming failure | A structured field in the error envelope, a change to `localizeKaelRequestFailure`, to the stream error payload and to the shared contract twins, shipped with a new app build. Each is a public contract change | Approve a structured emergency field and the client change, or accept the residual |
| N-02 | A first message that reports an emergency is refused with a 429 when the customer is over the new-Case quota | A bounded emergency allowance changes the abuse limit | Approve or decline an allowance |
| N-03 | Recall on unseen wording is unmeasured and the only reproduction is 11 of 29 | Needs an independent set, then a decision on options B, C, D (`classifier-assessment.md`) | Nominate the reviewer, approve thresholds, choose the follow-up |
| N-04 | Atomicity, concurrency and row-level security of the approval commands | Need real Postgres (T1) | Approve a T1 lane |
| N-05 | The scope-change decision carries no version of what was shown | A version or hash in the decision is the KAWA_02 approval receipt | Include in KAWA_02 |
| N-06 | `POST /api/jobs` in `apps/api` (the Next.js reference surface) creates a Job and an estimate from a free-text description with no emergency gate and no Case Work; the Edge equivalent refuses every payload with 409 | It is reference and parity code, the repository has no deployment config for it and the shipped app does not call it. Changing a reference route is outside this task, and a guard there would need its own parity tests | Keep it undeployed, or make it refuse like the Edge route |
| N-07 | **Pre-existing on the pushed commit, found by `pnpm ship:check`:** the harness test `EAS upload retains every tracked input used by the full-source release identity` (`scripts/harness/transaction-release-gate.test.mjs:102`) fails with `17 !== 0`. `.easignore` contains `*.log`, and 17 `*.log` files committed in `docs/test-logs/kawa-01-final-closure-evidence/` at `8a03e780` are tracked inputs EAS would drop. `ci.yml` runs `node scripts/harness/verify.mjs`, which runs this test, so the harness-assurance step fails on the pushed commit as soon as CI runs; CI has not run on PR #403 yet (no checks reported, the PR conflicts with main). Not caused by this change: the index equals the pushed commit and nothing is staged | Every fix touches earlier evidence or release config, and the brief asks for historical evidence to be preserved: (a) rename the 17 files to `*.log.txt`, content unchanged, and update that folder's digest list; (b) add `!docs/test-logs/**/*.log` to `.easignore`; (c) untrack them. This package saves its raw logs as `*.log.txt`, so committing it adds nothing to the failure | Choose (a), (b) or (c) before the final CI decision |

## Checked and not a defect

- A worker may open a dispute (the registry grants it); an admin may not (P413).
- An admin is already refused on cancel, customer cancellation, opening a dispute (Kael path control), review and reporting a worker (domain guard); they are now pinned by P413.
- The job chat refuses an admin as a sender.
- A conversation delete can cancel its linked job: the customer's own action, no separate server confirmation (observation in `approval-authorization-matrix.md`).
- `kael_memory_audit` was written on the assistant's Case surface before an emergency answer on the baseline; it is no longer written for an emergency.

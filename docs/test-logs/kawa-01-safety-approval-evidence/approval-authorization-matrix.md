# Customer approval and authorization matrix (audit of existing behaviour)

Scope: an audit of the approval boundaries that exist today, from RULES.md #7. It is not KAWA_02 and adds no approval
receipt, RPC, migration, payment behaviour or transaction semantics. Evidence tier: **T0** (the real Edge handler and
services against an in-memory PostgREST stand-in and scripted providers). Anything that needs real Postgres is marked
**BLOCKED at T1**, never counted as proved by a stand-in.

## Defects found by this audit, and fixed

| # | Defect | Reproduced as | Root cause | Minimal fix |
|---|---|---|---|---|
| AF-1 | An **admin could record the customer's booking-intake decision** on any Case (`POST /kael/chat/:id/intake-confirmation`): `confirmed` started the analysis, `correction_requested` set the session to `abandoned`; each wrote a turn attributed to the customer | A real Case world driven as an admin: 200, state changed, a customer turn forged (P413 rows, red before the fix) | The route lists `admin` for support reads. `assertKaelSessionOwnership` lets an admin through, and unlike the offer confirmation and the recovery route this service had no customer-role guard. The path-control table does not list this route | `ctx.role !== "customer"` → 403 at the top of `decideKaelIntakeConfirmation` |
| AF-2 | An admin could **submit or skip evidence for the customer** (`POST /kael/chat/:id/evidence` and `/evidence-stream`): 200 and two turns written | Same world: 200, two turns | Same cause in `submitKaelChatEvidence` | The same guard |
| AF-3 | An admin reached the **durable accept RPC** as if it were a worker (`POST /jobs/:id/accept`), and the decline query (`/decline`) | RPC `accept_priced_broadcast_durable_atomic` called with the admin's id | The Edge service did not check the role; only SQL actor binding stopped it (defence in depth, not an exploit: an admin has no broadcast row) | `ctx.role !== "worker"` → 403 in `acceptBroadcast` and `declineBroadcast` |

Admin keeps read access to every Case (`getKaelChat`, progress, operation). Checked by search: no admin screen, script or
smoke test calls the four routes that now refuse an admin; only the customer and worker apps do.

## Method

For each customer-decision and worker-action route, P413 sends a request with a body that is valid for its schema, as the
wrong role, through the real handler, and asserts a 403 and **no database write, no database function call and no
provider call** (the request audit trail is excluded; it is written for refused requests too). It then checks that a
request without its approval evidence fails validation before any database call, that no module in the Kael layer or in the
emergency path can reach a module that records an approval, and that the one place a normal-chat conversation can cancel a
job is the customer deleting that conversation.

| Count | |
|---|---|
| Customer-decision routes tested as admin and as worker | 20 each (40 rows) |
| Worker-action routes tested as admin and as customer | 7 each (14 rows) |
| Opening a dispute, tested as admin (a worker may open one by design) | 1 |
| A real Case world driven as an admin, plus the owner as a control | 4 |
| Case streams tested as admin | 2 |
| Approval-evidence routes tested for fail-closed validation | 9 |
| Reachability and ownership assertions | 6 |
| P413 total | 76 tests |

## Property by gate

`E` = proved at T0 by an Edge pillar that runs in this lane. `S` = proved only by a SQL pillar, which needs real Postgres
and was **not run here (BLOCKED at T1)**. `—` = not applicable.

| Property | Offer: confirm, recover, retry matching, price decision | Proposed worker: accept, confirm, reject, apartment access | Scope change | Completion | Payment |
|---|---|---|---|---|---|
| 1. Kael cannot approve autonomously | E: P413 reachability (no Kael-layer or emergency module reaches a module that records an approval); P13 autonomy audit; start of matching only after the confirm command returns `ok` (`confirm.service.ts`) | E: P413; P187 | E: P413; P87 | E: P413; P12, P68 (only the customer confirms completion) | E: P413; P68, P364 (a customer claim is never settlement) |
| 2. Only the authorized actor confirms | E: P413 (admin and worker refused on 20 routes, no write); `confirmKaelChat` and `recoverLegacyKaelConfirmation` guard in code; AF-1/AF-2 closed | E: P413 (AF-3 closed); P128 | E: P87 (customer-only decision, worker-only proposal) | E: P86, P413 | E: P364, P413 |
| 3. Missing, stale, invalid or revoked approval fails closed | E: the offer needs a price receipt id (schema), P358 (missing price evidence is refused before any write); P413 evidence rows; **price receipt binding S**: P20; **revocation**: none exists in the product today | E: P134 (a missing decision is never a choice); S: P121, P133 | E: P87 (missing verified final-price receipt refuses approval); S: none for the stored proposal | E: P86 (invalid final price refused) | E: P364 |
| 4. A changed price or scope cannot reuse an old approval | E: the receipt id names the offer; a re-priced offer has a new receipt. **S**: P20 binds the receipt to the offer in the database. RFQ: P178 binds a decision to a proposal id; S: P177 | E: P128 binds authorization to the exact worker and check-in | **Gap by design, T1/KAEL_02:** the decision body carries only `approve` or `reject` and a scope-change id; protection is that a new proposal has a new id and the stored row is not edited after it is shown, which is a database property (BLOCKED at T1). A version or hash in the decision is the KAWA_02 approval receipt, not added here | E: P86 | — |
| 5. Replays and concurrent confirmations cannot duplicate a commitment | E: P48 (a repeated confirmation claims one stable operation and returns its receipt); idempotency key is a function of session and customer. **Concurrency S**: P106, P108 | E: P120, P123 (exact receipts); S: P119, P121, P122, P133, P135 | E: P87 (a repeat returns the durable decision, no repeated price write), P191 | E: P86 (a repeat recovers the same operation); S: P371 | E: P364; S: P371 |
| 6. An emergency creates no Job, quote, match, payment or consent | E: P405–P412 and the P414 matrix assert zero writes outside the Case tables and a null `job_id`, for every sentinel at every entry point; P413 shows the emergency modules reach no approval module | same | same | same | same |
| 7. Failures keep the authoritative state and expose nothing private | E: a refused request writes nothing (P411, P412, P413); errors carry no stack or database detail (P123, P116); the emergency failure trace has no text or actor pseudonym (P411) | E: P123 (uncertain outcome needs reconciliation, no database detail) | E: P87 | E: P86 | E: P364 |
| 8. Existing permission and confirmation checks intact | E: the full API suite passes with the same checks (3,406 passed, 6 skipped; `gates/test-api.log.txt`); no guard was removed or loosened; four guards added | E | E | E | E |

## What is BLOCKED at T1

These properties cannot be established by an in-memory stand-in. No claim is made for them in this package.

| Property | Needs |
|---|---|
| Atomicity of confirm, candidate decision, scope decision, completion and payment-order commands | real Postgres, the SQL pillars P106, P108, P117, P119, P121, P122, P129, P133, P135, P177, P371, P378 and `confirm_kael_chat_atomic` |
| Concurrent double confirmation, double accept, double scope decision | the same, under concurrent connections and row locks |
| Binding of the price receipt to the offer (stale or re-priced offer) | P20 and the receipt tables |
| Immutability of a scope proposal after it is shown | the `scope_change_requests` constraints and triggers |
| Row-level security per actor on every table the routes touch | a database with the policies applied |

## Observations that are not defects

- **Deleting a conversation can cancel a job.** `DELETE /me/kael/conversations/:id` calls `closeLinkedCustomerJob`, which
  cancels a job still searching, or files a cancellation request with the fixed reason `changed_mind` for one in progress.
  It is the customer's own authenticated action (the app is expected to confirm first; that was not checked here); the server has no separate confirmation token.
  A product decision whether the server should require one. P413 pins that this is the only path from a normal-chat
  module to a cancellation.
- **The registry grants admin on every customer route (P18); the domain does not.** A probe of the routes that were not in
  the first table found an admin already refused on cancel, customer cancellation and opening a dispute (Kael path
  control, 403), on review (domain guard, 403) and on reporting a worker (domain guard, 403). They are now rows of P413, so
  the 20 customer-decision routes are all pinned. The registry's admin entry is the read and support override; nothing
  in the table lets it record a customer's decision.
- **Tests on disk that do not run.** Only `*-pillar.test.ts` is collected. Files such as `kael-chat-confirm.test.ts`,
  `kael-scope-change.test.ts`, `kael-job-completion-payment.test.ts` and `kael-matching-accept.test.ts` exist but are not
  evidence. Every property above is cited to a collected pillar.

## Limits

T0, one in-memory database. No RLS, no locks, no triggers, no concurrency, no hosted Edge, no payment provider, no
device. A green row says the Edge service refuses the wrong role and writes nothing; it does not say the database would
have agreed.

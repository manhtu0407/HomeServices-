# NestScout four-blocker execution update - report

Branch `claude/nestscout-four-blocker-20261022`, stacked on the PR #405 head `8e859073`. PR #405 is untouched. Evidence tier: T0 and T1 (local PostgreSQL). T2 and T3 were not run. Nothing merged, deployed or written to a hosted or Production resource; no paid provider called; no real payment; protected session memory not written; sealed H5 not read, run or copied.

**Verdict: NOT merge-ready.** One item fails its rule (H5 fresh probes), one pre-existing payment defect needs an owner decision (F-PAY-1), CI and independent review of this branch have not run, and T2/T3 evidence does not exist.

## 1. Electrical Boundary - PASS (T0)

- **Defect.** `evaluateMessageBoundary` returned `ok` for an electrical Case as soon as the electrical playbook was on and the routing policy found nothing, so the keyword gate and the service-mismatch gate never ran with the flag on. A 26-row probe (`scripts/probes/boundary-flag-parity.mjs`) differed in 9 rows: a fridge, a washing machine with a stuck door, wifi, an induction hob and a microwave were refused with the flag off and accepted with it on; two mixed requests and one mixed request with smoke were handled the same way.
- **Change.** Five lines removed from `boundary-guard.ts`; no new code. The flag-on path now takes the same two gates as the flag-off path, after the flagged routing policy and the safety guidance, as before. R1's requested-work detector is what makes that safe (a washing machine named as a suspected cause still passes).
- **Tests.** P421 lost its electrical flag-on exemption (254 rows, green). New P422 (89 tests): unsupported requests in three written forms across 9 appliances, supported and incidental-mention controls, mixed requests, the flag-only refusals (building outage, vehicle charger, three-phase, TV mount), refusal text never carrying fewer numbers with the flag on, and four handler hazards beside an unsupported request. Red-first against the PR #405 boundary guard: P421 36 of 254 fail, P422 30 of 89 fail; both green on the candidate (`results/red-first-summary.json`).
- **Safety precedence and parity.** The shared gate still answers a hazard reported beside an unsupported request with its numbers, identically with the flag off and on. Frozen 36-scenario matrix identical to R2b: flags off 30 PASS, flags on 30 PASS, SUPP-C6b PASS both ways, journeys identical, 6 S5 BLOCKED at T0 (`results/compare-with-r2b.json`).
- **Pinned, same with the flag off and on, not fixed:** English unsupported requests ("Please fix my washing machine") are accepted; "Máy giặt kẹt cửa." with no request verb is accepted (fault vocabulary); a fault on an outlet plus an appliance in one clause passes the electrical-infrastructure escape. Mixed messages without that escape are refused as a whole and close the Case.

## 2. H5 Standard Evaluation - STANDARD_T0_FAIL; independent evaluation DEFERRED

Rule and provenance: `results/h5/PREREGISTRATION.md`. Itemised rows: `results/h5/ITEMISED.md`. The rule was written down before scoring but not timestamped by a third party; the harness ran once before the note with a bug (11 development rows lacked their `service`); the fresh rows scored identically in both runs.

| Item | Result |
|---|---|
| Development tier (previously used data), 267 `clear` rows | **PASS**: 154 of 154 hazards, 113 of 113 non-hazards, classifier and real handler |
| 31 contestable rows | pinned to today's behaviour by P410, reported, never counted |
| Playbook flags off vs on | **PASS**: 0 route differences and 0 dropped numbers over 390 rows x 2 states (main 42daced1: 14 and 10, the DX-03 defect) |
| Visible guidance in the handler | **PASS**: every detected hazard carried its route's numbers; 0 non-2xx |
| Bounded time | **PASS**: normal rows <= 63 ms classifier, <= 128 ms handler; five hostile shapes capped at the 5000-character field limit <= 9.4 ms; uncapped 36k-72k characters 0.2-0.6 s |
| Fresh probes (92 newly written rows, scored once) | **FAIL**: hazard recall 42 of 57 = 73.7 percent (Wilson 95 percent 61-83), false positives 2 of 35; main scored 40 of 57 |

By class (hazard recall / non-hazard false positives): Vietnamese 16/20, English 9/10, no diacritics 5/10, negation FP 1/10, completed incident FP 0/8, prevention product FP 1/10, prevention word beside a real hazard 2/6, multi-clause 10/11, routine near miss FP 0/6.

The 15 misses and 2 false positives are lexical coverage gaps of the same kind the audit found: "nhà em đang cháy ... khói đen dày đặc" without diacritics, "máy lạnh phát nổ ... khói đen mù mịt", "mùi khét" beside a burning wire, "bị giật" after touching a tap, "cầm dao dọa tôi", a smoke detector sounding because of real smoke, "Nobody got shocked", "install a gas leak detector". Whether to patch them as development rows (audit R-2) or change the design is the owner's open classifier-strategy decision; this iteration was evaluation only, so none were patched. No claim about real-world recall, production reliability or generalisation is made.

## 3. PostgreSQL / T1 - PASS (local), two findings open

Disposable container `ns-b4-pg` (postgres 17.6, image `public.ecr.aws/supabase/postgres:17.6.1.121`), the 453 canonical migrations applied as the `postgres` role, then the seed. A small compatibility patch (`scripts/t1/patch.sql`: missing `auth.users` columns, `storage` stubs and grants) stands in for the services the plain image lacks; CI uses the real stack.

- Repository SQL suite: **141 of 141** (the 138 existing files plus three new). A first replay as `supabase_admin` failed 13 files on ownership alone; as `postgres` 137 passed and the 138th needed the storage grants; the final run is clean (`logs/t1/sql-suite.txt`).
- New rollback-only files: `manual_bank_reconciliation_behavior_verification.sql` (P423), `six_service_confirmation_gate_verification.sql` (P425), `worker_accept_authority_verification.sql` (P426). Six mutants were applied to the live functions and every one turned its file red; originals restored green (`logs/t1/mutations.txt`; the three gate mutants fail on a downstream `jobs` constraint rather than on my own assertion).
- Committed-data concurrency (disposable database only, `scripts/t1/*concurrency.sql`): double completion confirm, double customer claim, same reconciler twice, two reconcilers, one bank reference on two orders, same-key confirmation, two Workers accepting one Job, two writers of one turn index - one effect each.
- Privileges: 33 SQL functions update `jobs.status`; none is executable by `anon` or `authenticated`; `authenticated` holds `SELECT` only on `jobs`; the only writers of `reviewed` are service-role functions and `submit_review_atomic` requires `paid`. SQL carries no second transition table; the Edge table and service-role-only writes are the barrier.
- **F-PAY-1 (pre-existing on main, not fixed).** Once an order is `manual_reconcile_required` (wrong amount, or an explicit decision), the settlement trigger sets the Worker ledger to `reversed` and the decision function then answers `WORKER_LEDGER_INVALID` to the exact-amount confirmation. A customer who underpays, or an admin typo, leaves the Job in `payment_pending` with no RPC path to paid. Pinned by P423 so a fix is an explicit decision. Needs an owner rule: top-up, refund/cancel, or re-open.
- **F-PAY-2 (minor).** Two orders offered the same bank reference concurrently: one pays, the loser gets a raw unique-violation instead of `BANK_REFERENCE_USED`. Nothing double-pays.

## 4. Six Services S5 - J01-J15 (`results/s5-matrix.md`)

| checkpoint | all six services |
|---|---|
| J01 intake | PASS T1 (Case rows satisfy the real constraints for each service) |
| J02 profile | PASS T0 |
| J03 no offer before ready | PASS T1 for each service: incomplete, wrong kind, no policy, safety blocker refused with zero writes; ready Case accepted once and replayed |
| J04, J05 customer-only | PASS T0, T1 corroborates (no API role writes Cases; the Edge writes with the service role, so RLS adds no barrier) |
| J06-J10 lifecycle | PASS T0, T1 corroborates (all 33 status writers service-only) |
| J11 worker-only accept | PASS T1 generic (non-Worker ids refused with zero writes; one winner; plumbing fixture) |
| J12 payment skip edge | PASS T0, T1 corroborates |
| J13 stage projection | INVENTORY T0 (by design) |
| J14 payment rail | PASS with finding F-PAY-1; order opened for all six services, reconciliation exercised on electrical, plumbing and cleaning fixtures |
| J15 atomicity, RLS, concurrency | PASS T1 |

Every service: journey PASS_WITH_FINDING. Not run: the Edge handler against a real PostgREST (J01-J03 and J14 are proven at the SQL layer and at T0 through the Edge, not through both together), real JWTs (T2), a device (T3).

## 5. Payment

- **Rail in use by the code: `platform_bank_manual`.** The customer completion route is wired only to `confirmCompletionAndCreateManualBankOrder`; `configuredPaymentRailProvider` can only return `platform_bank_manual` or null; the customer payment surface has only manual-order and manual-claim actions. The SePay intent builder is dead code (no route reaches it) and the SePay webhook function cannot pay a manual-bank order: given a manual order's own code and exact amount it answers `ignored` (P423). I did not activate SePay or touch a webhook.
- **Production runtime configuration is UNKNOWN.** `NESTSCOUT_PLATFORM_MANUAL_BANK_ENABLED` and the `PLATFORM_MANUAL_BANK_*` account values were not read.
- **The QR is dynamic, not a static image.** The Edge builds a `vietqr.app/img` URL from the configured account (number, holder, bank) with the final price as the amount and the generated `NS...` code as the transfer reference. If the owner pastes a static personal-bank image anywhere, that path is not this rail and was not found in the code.
- **Owner items 1-10, T1:** (1) the builder puts the configured account, bank and holder, the final price as the amount and the `NS...` code as the transfer reference into the QR URL and refuses a zero, negative, fractional or malformed input (`results/qr-builder-probe.txt`, T0); the database stores the same amount and code on the order and the QR URL for all six services (T1); (2) approval first: no order, claim or decision before the Customer confirms completion, nobody else can confirm; (3) the Customer claim leaves the Job `payment_pending`, is idempotent and creates one event; (4) only an admin decided in the tests; Customers, Workers, an operator without `finance.reconcile` and an unknown id are refused on claim, decision and the base function (an operator who holds `finance.reconcile` is admitted by the code and was not exercised); (5) the amount must equal the order, the reference must be unused; (6) duplicate claims, concurrent decisions and replays: one effect; (7) unclaimed, wrong-amount (short and over), explicit reconcile, invalid decision and reused-reference cases never become paid; (8) paid sets the Job, order, 24-hour Worker hold and exactly one event each, the audit trail is immutable, the hold releases once; (9) Customer, Worker, Admin and anonymous roles cannot write payment or Job tables or execute the RPCs; (10) all six services use the manual rail.
- **Remaining dependencies:** owner read-only check of the Production flag and account values; matching a real bank statement line to an order (T2/T3); the F-PAY-1 rule.

## 6. Commit, CI and review

- Final regression on the candidate: API **4,019 pass + 6 skipped** (203 files), mobile **2,660**, shared **189**, type-checks API, shared and mobile pass, Edge check of all 8 function entry points in the pinned Deno image, every structure, governance, comment, test-integrity, edge-db, work-plan, workflow-cost, skills, manifest and pillar-registry gate passes. `lint:authority` fails on the one pre-existing citation (`apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31`), identical on clean main.
- PR #405 at `8e859073`: all nine CI checks SUCCESS or SKIPPED; Codex has not re-reviewed that head, no open finding.
- This branch: see the closing section added after the push.

## 7. Merge-readiness

Not merge-ready. This branch stacks on PR #405, which is itself unmerged and awaiting independent review. Blocking: H5 fresh-probe FAIL and the classifier-strategy decision; F-PAY-1 rule; CI and review on this branch. No T2/T3 evidence exists, and Master Plan_01, H5 and six-service end-to-end completion are not claimed. I will not merge or close anything without owner approval.

Reproduce: `README.txt`.

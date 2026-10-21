# REPORT D - bounded remediation backlog

Nothing below is authorised, started or implemented. This run changed no product source, added no RPC or migration, deployed nothing and made no paid call. Items are ordered by what blocks a trustworthy first real transaction in Ho Chi Minh City apartments.

Severity scale used in this package: **P0** blocks any emergency-detection or authorization claim; **P1** blocks a trustworthy first transaction or is a confirmed safety/authorization gap with a known path; **P2** quality or evidence debt; **P3** minor.

Scope note: the KAWA_02 and KAWA_05 requirement documents are **not in the repository** at either snapshot (the ledger names KAWA_02 once, as "the approval receipt", and never mentions KAWA_05). Work is therefore placed by theme, and the placement is a suggestion for the owner, not a reading of those documents.

## 1. Confirmed blockers

| ID | Sev | Blocker | Evidence | Status |
|---|---|---|---|---|
| B-01 | P0 | Emergency recall on wording the cues were not written against is low and unmeasured independently: 11 of 29 on the only sealed set (95 % interval 22.7-56.0 %), one hazard of 21 missed on agent-authored near-family phrases, 30-40 % lost to one typo or a wrong tone mark | Report C; DX-02 | open; needs owner decisions D-1 and D-2 |
| B-02 | P1 | A legitimate request that merely mentions an appliance is declined with zero provider calls and the Case is closed (`unsupported`); the next message, including a real emergency, gets a 409 | DX-01: ELEC-S2, PLMB-S2, PLMB-S4; `boundary-guard.ts` | open, PRE-EXISTING, no regression test |
| B-03 | P1 if any flag is on in Production | With playbook flags on, the KAWA_01 gate defers to the flagged service path and 4 of 21 hazard steps lose their number (HVAC-S3 explosion with black smoke gets "routine clean or fault check?") | SUPP-FLAGS; DX-03 | open; Production flag state UNKNOWN |
| B-04 | P1 | Quote-readiness is not checked at the Edge boundary; the decision belongs to `confirm_kael_chat_durable_authorized_v6`. Approval atomicity, concurrency and RLS are unproven | J03 BLOCKED, J15 BLOCKED; ledger N-04 | open; needs a T1 lane |
| B-05 | P1 (release safety) | Production release containment is one repository variable (`NESTSCOUT_BACKEND_RELEASE_ENABLED=false`) plus a main-push `release-production` run that currently fails in its gate job before any release step. The `production` environment has zero protection rules | preflight, `00-preflight/preflight.json` | effective today; fragile |

No new authorization defect was found: D-03 and D-04 (admin acting as customer or worker) reproduce in BEFORE and are closed in AFTER at T0, and no business action occurred in any of the 144 runs.

## 2. Corrective actions (each bounded, none started)

| ID | Action | Closes | Suggested owner | Tier | Proposed regression test | Done when |
|---|---|---|---|---|---|---|
| A-1 | Make the out-of-scope appliance rule context-aware: decline only when the appliance is the object of the requested work. Whether a boundary hit should still end the Case permanently (migration X1 says it does) is owner decision D-5 | B-02 | Kael guardrails ("wrong decline" workstream) | T0 | Collected pillar `boundary-guard-appliance-mention-pillar.test.ts`: ELEC-S2, PLMB-S2 and PLMB-S4 step 3 inputs from the frozen matrix must yield a clarifying question and leave the Case `active`; negative controls ("Mình muốn sửa máy giặt", "sửa tủ lạnh") must still decline | the three fixtures pass in a collected pillar; both controls still decline; ELEC-S2/PLMB-S2/PLMB-S4 PASS in this harness |
| A-2 | Settle the rule for a flagged service path: the emergency gate answers fire, medical, police and gas first regardless of any playbook flag; a flagged path may add advice but not replace the number | B-03 | Owner, then emergency gate | T0 | Re-run this matrix with `KAWA_DIAG_PLAYBOOK_FLAGS=on`: every hazard step that passes with flags off must still pass | SUPP-FLAGS equals the flags-off result (no hazard step loses its number) |
| A-3 | Read-only audit of which `KAEL_PLAYBOOK_*` flags are set in Production | B-03 | Owner | none (read-only) | n/a | the flag list is recorded |
| A-4 | Independent evaluation set and an owner-approved strategy for the classifier (Report C section 9, options A-E; E regardless) | B-01 | Owner, independent reviewer, then classifier owner | T0 data, owner decision | P415 blind harness with the reviewer's attestation and registered hash; plus a development perturbation pillar (no diacritics, wrong tone mark, one-letter typo) so a tolerant matcher cannot silently regress | the blind result clears the owner-approved thresholds (the harness proposes recall lower bound 0.9 overall and 0.8 per route, false positives at most 5 %, at least 30 positives per route and 100 negatives) |
| A-5 | Add the DX-02 wording and the H5-style mechanism probes (span, synonym, order, digit token) as **development** rows | B-01 | classifier owner | T0 | development-set pillar rows; **not** H5 and not sealed rows | each row routes as labelled; H5 is untouched |
| A-6 | Stand up a T1 lane (Docker Postgres) and run the SQL pillars for approval atomicity, RLS, quote-readiness and the unique `(session_id, turn_index)` | B-04 | Owner approval, then backend | T1 | existing SQL pillars (for example P106, P108, P117, P119, P121, P122, P129, P133, P135, P177, P371, P378, P20 per the ledger) plus J03 against the real RPC | those pillars run and pass on a replayed schema; J03 becomes PASS or FAIL, not BLOCKED |
| A-7 | Apply the owner-only reviewer and main-only branch barrier already drafted in the KAWA_01 evidence to the `production` environment before anyone repairs the failing `release-production` gate | B-05 | Owner | GitHub setting | read-back of the environment's protection rules | protection rules non-empty and read back; variable stays false |
| A-8 | Refresh STRUCTURES section 12 (locked file): 21 events, `customer_started_payment`, payment skip closed in code, 20 phases | G6 | Owner approval to edit a locked file | docs | a test that reads the event table in `workflow-orchestrator.ts` and compares it with the document (I did not look for an existing doc-drift gate) | the document matches the code and a test fails when they diverge |
| A-9 | Collect or fold the uncollected electrical intake tests (`mobile-api-kael-electrical-intake-policy.test.ts`, `mobile-api-kael-p5.test.ts`) into pillars | coverage | backend | T0 | rename to pillar shape or copy the appliance-mention phrasings into A-1's pillar | they run in `pnpm test:api` |
| A-10 | Case-world pillars for cleaning and upholstery (lowest coverage) | coverage | backend | T0 | reuse the S1-S4 shapes in this harness | each service has a Case-world pillar |
| A-11 | Keep `session.total_turns` equal to the row count when a persistent write failure strands a customer turn (transient drift, healed on retry) | DX-06 | backend | T0 | SUPP-C6b step 1 asserts equality | passes |
| A-12 | Native proof that the structured `emergency` field renders (VI and EN), including the 429 new-Case quota case | DX-04 | mobile + owner | T3 | device capture matrix | captured |

## 3. Placement by theme (suggestion only)

| Theme | KAWA workstream (suggested) | Items |
|---|---|---|
| Approval receipt, versioned scope-change decision, idempotency key, T1 | KAWA_02 | A-6, plus the ledger's N-05 and the exactly-once RPC |
| Guardrails and wrong-decline | not assigned (spec absent) | A-1 |
| Emergency classifier strategy and independent evaluation | not assigned (spec absent) | A-4, A-5, A-2 |
| Release controls and environments | not assigned (spec absent) | A-7 |
| Documentation and collection debt | not assigned (spec absent) | A-8, A-9, A-10, A-11 |

## 4. Owner decisions required

| # | Decision | Needed for |
|---|---|---|
| D-1 | Name the independent reviewer and approve the thresholds | B-01, A-4 |
| D-2 | Choose a classifier strategy (Report C options A-E) and confirm E (a permanent emergency affordance) regardless | B-01 |
| D-3 | State the Production playbook flag values and the deferral rule | B-03, A-2, A-3 |
| D-4 | Approve a T1 lane and, separately, any RPC or migration (exactly-once, approval receipt) | B-04, A-6, KAWA_02 |
| D-5 | Choose the boundary-decline design. Permanent closure on a boundary hit is deliberate (migration X1); decide whether it should stay when the trigger is a single keyword, or close only on a repeated decline | B-02, A-1 |
| D-6 | Approve editing the locked STRUCTURES file | A-8 |
| D-7 | Apply the production environment barrier and say when the failing release gate may be repaired | B-05, A-7 |
| D-8 | Provide the KAWA_02 and KAWA_05 requirement documents | placement above |
| D-9 | Approve the session-memory entry (`08-proposed-memory/session-memory-draft.md`) | Session Memory Gate |

## 5. Completion criteria for this diagnostic's follow-up

1. B-02 closed: A-1's pillar is collected and green, and the three frozen matrix scenarios PASS on a rerun of this harness against the new commit.
2. B-03 closed or de-scoped: A-3 recorded; if any flag is on, A-2 done and SUPP-FLAGS equal to flags-off.
3. B-01 has a number: an independent set exists and its result is recorded against the approved thresholds, or the owner records a decision to ship with option E and no recall claim.
4. B-04 has a verdict: J03 is PASS or FAIL against the real RPC, and the approval/RLS SQL pillars have run.
5. B-05 has a barrier: protection rules non-empty and read back.
6. This package is re-run by `04-analysis/compare.mjs` on the new commit with the frozen matrix; any scenario that regresses blocks the merge.

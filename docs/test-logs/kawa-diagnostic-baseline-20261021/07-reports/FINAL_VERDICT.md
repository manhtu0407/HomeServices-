# Final verdict - six-service baseline and H5 root-cause investigation

Snapshots: BEFORE `ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72`, AFTER `42daced1a52ca5b8e5ee2e0b982c28e697f184c9`. Evidence tier T0. All scenarios agent-authored; nothing here is independent validation. Four separate decisions follow; a green T0 result is not a statement about Production.

## 1. KAWA_01 IMPACT: **IMPROVED** (deterministic T0 layer)

- 23 of 36 frozen scenarios improved, 13 unchanged, 0 regressed, 0 not comparable. Scenario verdicts: BEFORE 10 PASS / 26 FAIL; AFTER 26 PASS / 4 FAIL / 6 BLOCKED.
- Hazard steps that named an acceptable emergency number: BEFORE 0 of 21, AFTER 20 of 21 (SUPP: the 63 H5 rows, BEFORE 0 of 29 positives, AFTER 11 of 29). No business action in any run in either snapshot. 0 false emergencies on 30 non-hazard steps (too few to bound a rate).
- Admin acting as customer or worker (D-03, D-04): reproduced in BEFORE, refused in AFTER.
- Existing API suites: AFTER 3,438 passed / 0 failed / 6 skipped; BEFORE 2,456 passed / 0 failed / 6 skipped.
- Qualifiers that limit the word "improved": the model-assisted layer and Production flag values were not exercised; the hazard phrases are paraphrases of the families the classifier was written against (so 20 of 21 overstates generalisation; H5 says 11 of 29); with playbook flags on AFTER drops to 17 of 21 (DX-03).
- Not INCONCLUSIVE because every flip has a KAWA_01 owner file and a marker BEFORE cannot produce; not "no demonstrated improvement" for the same reason.

## 2. SIX SERVICES: per service and tier

| Service | T0 S1 | T0 S2 | T0 S3 | T0 S4 | T0 S5 | T0 verdict BEFORE | T0 verdict AFTER | T1 | T2 | T3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Electrical | PASS > PASS | FAIL > FAIL | FAIL > PASS | FAIL > FAIL | FAIL > BLOCKED | FAIL | FAIL | NOT_RUN | NOT_RUN | NOT_RUN |
| Plumbing | PASS > PASS | FAIL > FAIL | FAIL > PASS | FAIL > FAIL | FAIL > BLOCKED | FAIL | FAIL | NOT_RUN | NOT_RUN | NOT_RUN |
| Cleaning | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |
| Air conditioning (HVAC) | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |
| Sofa/mattress/curtain/carpet | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |
| Minor repair/installation | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |

AFTER at T0: **Electrical FAIL** (S2 false decline DX-01; S4 final hazard turn missed DX-02). **Plumbing FAIL** (S2 and S4 DX-01; the false closure then blocks the real emergency). **Cleaning, HVAC, Upholstery, Handyman BLOCKED**: S1-S4 PASS, S5 BLOCKED because J03 needs PostgreSQL and J14/J15 are tier-blocked. **No service PASSes** because S5 is not fully evaluable at T0. The six shared scenarios C1-C6 all PASS in AFTER (cross-service, not folded into a service). **T1, T2, T3 are NOT_RUN for every service.**

## 3. H5 ROOT CAUSE: **CONFIRMED** (proximate cause); shared cause with the six-service defects: **PARTIALLY CONFIRMED**

- All 18 false negatives, the 1 false alarm and the 4 missed judgement rows fail at cue matching (stage 4 of 9), category LEXICAL_COVERAGE. No cue pattern matched for any missed row; zero rows fail because of normalisation, segmentation, negation or temporal context, multi-hazard routing, service context, the entry point or delivery. The same 63 rows through the real Case-turn handler reproduce 11/29 and 1/30 exactly.
- Mechanisms isolated by a single-change edit against the unchanged classifier for 11 rows (intervening token or digit token, span limit, synonym, word order, English tense), plus H5-013 which needs two independent edits; 7 rows are verified only by absence of any cue family. The classifier scores 267 of 267 on its development rows, so the gap is the cost of a closed vocabulary.
- Shared with the six-service defects only for DX-02 (same classifier, same stage). DX-01 (false decline) is a different file and the opposite error, sharing only the "enumerated word list" style. Fixing H5 repairs DX-02 and nothing else.
- Limit: H5 is a reproduction on a no-longer-sealed set, 29 positives (95 % interval 22.7-56.0 %). The claim that no rule list can generalise is supported, not proven.

## 4. KAWA_02 READINESS: **NEEDS OWNER DECISION**

- Not READY: the KAWA_02 (and KAWA_05) requirement documents are not in the repository, so nothing can be checked against them; the approval receipt the ledger associates with KAWA_02 needs an RPC or migration and a T1 lane that no one has approved; J03 and the approval atomicity/RLS pillars have never run.
- Not BLOCKED by code: no new authorization defect was found, D-03 and D-04 are closed at T0, and the T0 approval boundaries held in all six services.
- Decisions that gate it (Report D section 4): D-4 (T1 lane and any RPC/migration), D-8 (provide the spec), plus D-1/D-2/D-3/D-5 for the safety items that sit beside it.

## Stop conditions

| # | Condition | Where met |
|---|---|---|
| 1 | All 36 scenarios recorded for both snapshots | `03-results/before|after/{matrix,journey}.json`, `03-results/comparison.json`: 72 scored executions plus 72 determinism repeats; none NOT_COMPARABLE; S5 BLOCKED checkpoints recorded, not passed |
| 2 | Six workflow maps | `04-workflows/SIX_SERVICE_WORKFLOW_MAPS.md` |
| 3 | All 63 H5 rows accounted without relabelling | `05-h5/h5-row-diagnosis.json` |
| 4 | Every failure classified or UNKNOWN with a limit | Report B section 4 (DX-01..DX-07, G1-G8); no UNKNOWN root cause remains, DX-05 is UNVERIFIED by tier |
| 5 | H5 against six-service relationship | Report C section 7 |
| 6 | Bounded prioritised backlog | Report D |

## Restrictions honoured

No KAWA_02 implementation. No product-source change in either snapshot or on the session branch (`git status` shows only this untracked evidence folder; the two scratch worktrees hold only untracked harness files). No RPC, migration, deployment, hosted-database operation or paid-provider call. GitHub was read through the API (one repository variable, the environment list, three workflow runs); nothing was dispatched, re-run or changed. No commit, push or merge. No protected memory written: the entry is a draft in `08-proposed-memory/` awaiting approval. No result was fabricated; every harness defect, wrong hypothesis and interpretation decision is recorded (`02-harness/interpretation-register.md`, Report C section 4, `logs/commands.jsonl`).

## Stopped

The diagnostic package is complete. I am not starting any remediation or KAWA_02 work and am waiting for owner review.

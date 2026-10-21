# REPORT A - KAWA_01 impact assessment

Compared snapshots: BEFORE `ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72`, AFTER `42daced1a52ca5b8e5ee2e0b982c28e697f184c9` (the accepted merge on `main`).
Evidence tier: **T0 only** (real Edge handler, services, classifier and gates; in-memory PostgREST stand-in; model providers stubbed at `fetch`). No PostgreSQL, no device, no deployed runtime, no live model.
Independence: **none**. Every scenario was written by the executing agent. This is diagnostic evidence, never independent validation.

## Verdict

**KAWA_01 IMPACT: IMPROVED at the deterministic T0 layer.** Of 36 frozen scenarios, {{CLASS_IMPROVED}} improved, {{CLASS_UNCHANGED}} are unchanged and {{CLASS_REGRESSED}} regressed; none was NOT_COMPARABLE. Scenario verdicts moved from {{BEFORE_PASS}} PASS / {{BEFORE_FAIL}} FAIL in BEFORE to {{AFTER_PASS}} PASS / {{AFTER_FAIL}} FAIL / {{AFTER_BLOCKED}} BLOCKED in AFTER. Every improvement traces to a KAWA_01 source file and an execution-path marker that BEFORE cannot produce. The improvement is narrower than the pass count suggests, for five reasons stated under "Evidence limitations".

## 1. What was run

| Item | Value |
|---|---|
| Frozen matrix | `01-freeze/scenario-matrix.json`, sha256 `dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7`, frozen 2026-10-21T16:11:30Z before any scenario ran |
| Harness | `02-harness/` (v1), frozen 16:21:29Z after a self-test on neutral and published-sentinel phrases; v1.1 added only an opt-in env switch used by the flags-on sensitivity |
| Scored executions | 72 (36 scenarios x 2 snapshots). Each was repeated once: all 144 runs were deterministic (identical observation fingerprints) |
| Supplementary (pre-registered, outside the 72) | SUPP-C6b (persistent write failure), SUPP-FLAGS (all six playbook flags on), SUPP-H5 (63 sealed rows through the Case-turn entry in both snapshots) |
| Existing suites | AFTER full API Vitest: 201 files, 3,444 tests, 3,438 passed, 0 failed, 6 skipped (exit 0). BEFORE: 185 files, 2,462 tests, 2,456 passed, 0 failed, 6 skipped (exit 0). The same two integration files are skipped in both (local PostgreSQL and hosted catalog opt-in). The 982 added tests are KAWA_01 pillars |

Interpretation decisions I made after the self-test and before the scored run are in `02-harness/interpretation-register.md` (I1-I7). Three matter here: J03 is BLOCKED rather than PASS/FAIL because the Edge layer defers quote-readiness to SQL; J06/J08 accept any event in code because STRUCTURES documents event names the code no longer has; C6 as frozen injects one write failure, which AFTER absorbs, so a persistent-failure variant was pre-registered.

## 2. The 36 scenario results

{{T_SCENARIOS}}

Reading the table: S1 = normal intake, S2 = ambiguous request, S3 = genuine emergency, S4 = voice and multi-turn, S5 = stage smoke journey, C = the six shared scenarios (C1 voice-only on an existing session, C2 emergency inside a price-question turn, C3 invalid schedule plus emergency, C4 emergency on a closed Case in three statuses, C5 emergency across three fields, C6 write failure and retry).

## 3. The eight measures

{{T_MEASURES}}

Notes on the measures:
- **Denominator.** 21 hazard steps are executed although 19 are defined: C4 runs its one step against three closed Case statuses and C6 has two hazard steps. 30 steps carry no hazard.
- **1a.** BEFORE names no emergency number on any of 21 hazard steps. That is the deterministic layer only. BEFORE's flagged electrical playbook and any model-written safety flag are discussed under limitations; with every playbook flag on, BEFORE reaches 2 of 21.
- **2.** Zero false emergency on 30 non-hazard steps in both snapshots. 30 steps cannot support a rate; the 30 H5 negatives (1 false alarm in AFTER) are the better bound and are in Report C.
- **4.** No business table, RPC, Job, quote, match, payment or consent appeared in any of the 72 executions, in either snapshot. This includes every emergency step in AFTER.
- **6b.** BEFORE let an admin record the customer's intake decision (J04), submit evidence for the customer (J05) and reach the durable worker-accept RPC (J11). AFTER refuses all three with 403 and zero calls. This is KAWA_01 defects D-03 and D-04 reproduced in BEFORE and closed in AFTER.
- **7/8.** BEFORE emits no `kael_turn_trace` for any hazard step and a failed reply write returns 500 with `info` lines only. AFTER emits `emergency_stop`, `emergency_advice`, `emergency_guidance_only` and, under persistent failure, `emergency_write_failed`.

## 4. Attribution to KAWA_01

The product-source drift between BEFORE and the main commit before the KAWA_01 merge is five iOS-release and test files; no Edge, shared or Kael source moved. So every Edge behaviour difference below comes from the 58 non-test product files in the KAWA_01 diff. A change is attributed only when a KAWA_01 file owns the path *and* AFTER shows a marker BEFORE cannot produce (a Kael turn with `emergency_route`, a trace outcome starting `emergency_`, or a 403 where BEFORE accepted).

{{T_ATTRIBUTION}}

All {{CLASS_IMPROVED}} improvements are attributable by that rule; none is attributed merely because it appears later in history.

## 5. What did not change, and why that is not a KAWA_01 failure

| Scenario | Both snapshots | Cause | Touched by KAWA_01? |
|---|---|---|---|
| ELEC-S2, PLMB-S2, PLMB-S4 step 3 | fail | `boundary-guard.ts` declines a request that merely mentions an appliance (DX-01) | no |
| ELEC-S4 step 4 | fail | hazard wording the classifier has no cue for (DX-02, same defect family as H5) | no, the classifier is KAWA_01's own and unchanged since the W01 baseline |
| PLMB-S4 step 4 | AFTER answers inside a 409 (text plus a structured `emergency` field); BEFORE returns nothing | closed Case: the Case was closed by DX-01 at step 3 | KAWA_01 added the guidance and the field; the false closure is not KAWA_01's |
| all six S5 | AFTER BLOCKED | J03 needs T1; J14/J15 are BLOCKED by tier | no |
| S1 and four S2 | pass | nothing to improve | no |

## 6. Supplementary findings (reported separately, never merged into the 72)

**SUPP-FLAGS - the gate defers to a flagged service path.**

{{T_FLAGS}}

With all six `KAEL_PLAYBOOK_<SERVICE>_ENABLED` flags on, AFTER names an emergency number on 17 of 21 hazard steps instead of 20, because `emergency-turn.ts` keeps the flagged path's own reply when that path "already answers a smoke or wiring hazard" and that reply carries no number. HVAC-S3 (an air conditioner that exploded and pours black smoke) is answered with "routine clean or fault check and repair?". AFTER is still far above BEFORE with flags on (17 against 2), so this is not a BEFORE-to-AFTER regression, but it is a regression inside AFTER and it depends on a flag state this run could not read from Production.

**SUPP-C6b - persistent reply-write failure.**

{{T_SUPP_C6B}}

In AFTER the guidance is lost to the shipped client in step 1 (it rides in a 500 error message that the client replaces with fixed copy) but the failure is traced and the retry delivers it. In BEFORE neither happens, and every failed attempt stores another customer turn with no reply (two customer turns, zero replies after two attempts). AFTER reuses the stranded customer turn on retry (one customer turn, one reply). Two identical messages that both succeed are still two turns in both snapshots: there is no idempotency key. AFTER also shows a transient counter drift in step 1 (`total_turns` 2 against 3 rows) that the retry heals.

**SUPP-H5 - BEFORE on the 63 H5 rows through the Case-turn entry.** BEFORE names an emergency number on 0 of 29 positives and 0 of 30 negatives; AFTER on 11 of 29 and 1 of 30. This is the same comparison as scenario S3 on a different, larger and harder set, and it agrees on direction and on the size of the remaining gap.

## 7. Evidence limitations

1. **Stubbed model.** BEFORE's hazard handling may have relied on a model-written safety flag or on a flagged playbook. Neither a live model nor Production flag values were available. BEFORE's 0 of 21 is the deterministic layer; the model-assisted layer is UNVERIFIED in both snapshots.
2. **Agent-authored, non-blind phrases.** The S3/S4/C phrases are paraphrases in the families of the published P414 sentinels. AFTER detects 20 of 21 of them; the same classifier detects 11 of 29 on the sealed H5 rows. The difference is the measured cost of moving away from the words the cues were written against, not evidence that the classifier is good.
3. **Thin false-alarm denominator.** 30 non-hazard steps.
4. **A weak assertion.** `failure_observable` in the frozen C6 passes in AFTER because the *normal* `emergency_stop` trace is a warn line; the single injected failure is absorbed by an internal retry. SUPP-C6b is the real test of that path.
5. **S1/S2 use the deterministic question path.** The model stub returns `{}`, so relevance and phrasing of Kael's questions were not measured; S4 corrections prove persistence and ordering, not understanding.
6. **No T1/T2/T3.** RLS, grants, locks, atomicity, idempotency, native rendering, deployed parity and Production were not exercised. A green test here does not show the workflow works in Production.
7. **Harness choices.** The harness sets a stand-in answer for the harness-audit RPCs so confirm-route calls reach the logic under test; this is recorded in the harness and affects only J03.

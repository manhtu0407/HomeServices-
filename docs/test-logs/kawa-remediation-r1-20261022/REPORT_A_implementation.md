# REPORT A - Implementation report, remediation round 1

Evidence tier: **T0** (the repository's Edge-runtime harness: real handler, real classifier, in-memory PostgREST stand-in, model providers stubbed at `fetch`). T1, T2 and T3 were not run.
Base: `origin/main` = `42daced1a52ca5b8e5ee2e0b982c28e697f184c9` (the KAWA_01 merge, the accepted baseline). Worktree `C:/ns-fix/r1`, branch `claude/nestscout-remediation-r1-20261022`. **Nothing is committed, pushed or merged.**
Authors of this round and of the diagnostic and the audit are the same agent lineage. This package is therefore evidence for an independent reviewer, not an independent validation.

## 1. Preflight

- Governance read in full: `governance/RULES.md`, `governance/critical.md`, `governance/protocols/{code-hygiene,test-pillars,solve-conflict-maximize,work-router}.md`, the audit report (`docs/test-logs/kawa-diagnostic-audit-20261022/AUDIT_REPORT.md`; the mission's "AUDIT_REPORT(2).md" was not found on disk, this is the copy in the tree) and the diagnostic baseline package.
- Ancestry: `origin/main` is `42daced1` (fetched). `ce4bd3cd` (BEFORE) and `111988b0` are ancestors of main. The diagnostic commit `084d8d09` is **not** an ancestor of main (it branches from `111988b0`), so it was not used as the base. KAWA_01 is merged (`062db160`, `8a03e780`, `63c01524`, `1729e003`, `42daced1`).
- Isolation: new worktree and branch from `42daced1`; the diagnostic branch, its baseline package and the audit were not modified. A second clean detached worktree `C:/ns-fix/base` at `42daced1` was used for baseline-side runs. Both installed offline (`pnpm install --offline --frozen-lockfile`, exit 0).
- Frozen inputs were used unchanged and hash-checked on every run: `scenario-matrix.json` sha256 `dd8392cb...a51dd7`, `kawa-diag-matrix-pillar.test.ts` `f9f61e2b...`, `kawa-diag-journey-pillar.test.ts` `2e9de078...`, `diag-support.ts` v1.1 `ed577051...`, `supplementary-matrix.json` `a657eb4f...`. The runner copies the harness in for the run and removes it afterwards, so the candidate diff carries no harness file.

### Reproduction before any edit (unmodified main, new worktree)

| Check | Result |
|---|---|
| 36-scenario matrix, flags off, 60 runs | 0 verdict differences and 0 assertion differences against the committed AFTER results |
| S5 journeys, 12 runs | 0 differences |
| Supplementary flags-on matrix, 30 runs | 0 differences |
| DX-01 | ELEC-S2, PLMB-S2 and PLMB-S4 FAIL (a Case is closed `unsupported` on a keyword mention) |
| DX-02 | ELEC-S4 step 4: no route, price-lookup reply |
| DX-03 | hazard checkpoints through the handler: 20 of 21 with flags off, 17 of 21 with every flag on (PLMB-S3, HVAC-S3, UPHO-S4/4, C6/1 lose guidance; ELEC-S4/4 gains it) |

So the new worktree reproduces the accepted baseline exactly. Files: `results/pre/`, `logs/pre-*.log.txt`.

## 2. DX-02 - missed Electrical emergency

**Root cause** (confirmed again, with the audit's cue trace): `emergency-guidance.ts` accepted a spark near wired equipment only as `tia lua` plus at most two words plus a locative (`tu|o|ngay|tai|...`) plus a wired fixture. In the frozen sentence the equipment ("tủ điện") is the subject and the spark is "xẹt sau cánh tủ", so no cue matched.

**Fix** ([emergency-guidance.ts](../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts)):
- `Cue` gains an optional `requires` list, checked against the cue's own segment, the positive twin of the existing `unless` (line 34, check at line 422).
- Two cues in the `electrical_water` list (lines 158-159): `tia lua` in a segment that also names wired equipment (`WIRED_FIXTURES`, the list cue 153 already used), and `spark|sparks|sparked|sparking` in a segment that names English wired equipment. Both stop on `SPARK_NOT_ELECTRICAL` (gas stove, fireworks, welding).
- All existing filters apply unchanged: tone agreement, hypothetical, past, resolved, quoted and negated.

**Not done, deliberately.**
- The electrical intake policy's `scanIntakeSafetySignals` was **not** reused. It has only negation handling; it has none of the gate's past, hypothetical, resolved or quote filters. `results/probe-scanner-vs-gate.json` (`scripts/probe-scanner-vs-gate.mjs`) shows it: the scanner returns `sparking` for the yesterday, last-week, hypothetical, resolved and quoted-label sentences, and the gate leaves all five unescalated (P419 negative rows). Reusing the scanner would have escalated reports of old or imagined sparks.
- A hot panel with a burning smell **and no spark** is still not an emergency for the gate (pinned by P419 row "equipment that is warm and smells, no spark"). The flagged scanner does treat it as critical. That is a policy question; see report D.
- The sealed H5 set was neither read nor scored on the candidate (mission restriction). The development phrase sets still answer as labelled (P410, below).

**Attempts: 1 of 3.**

**Regression**: [kael-emergency-electrical-spark-pillar.test.ts](../../../apps/api/src/__tests__/unit/kael-emergency-electrical-spark-pillar.test.ts), pillar `P419`, 32 rows: 11 positives (frozen transcript, no diacritics, capitals, spark only, reordered, socket, board, two audit single-change controls, two English), the 112/114/115 response row, the 6-service independence row, a "flames still a fire" row, 15 negatives (negated x2, yesterday, last week, hypothetical, resolved, gas stove, warm-and-smells, no equipment, quoted label, wrong tone, ordinary maintenance, English negated/past/hypothetical) and 3 pinned clause-alone rows (the hot panel alone, the burning smell alone, the spark with no equipment named: all stay quiet).
- Red on unmodified main: 11 failed, 21 passed (`logs/final/red-on-baseline-P419.log.txt`; the failures are exactly the positives, so every negative and pin is green on both trees).
- Green on the candidate: 32 of 32 (inside the final full API run, `logs/final/api-full-suite.log.txt`).
- Existing emergency unit pillars on the candidate: 6 files, 452 tests pass, including P410 (development sets, sealed-set independence, speed) and P405/P414 matrices.

## 3. DX-03 - playbook flags weaken emergency routing

**Root cause** (confirmed by the red run): `resolveCaseEmergency` returned `null` for the fire and electrical_water routes whenever the flagged playbook had *any* advice for the current text *plus every signal persisted earlier in the Case*. The advice for plumbing, HVAC and the others carries no emergency number, a persisted signal from an earlier turn can make the predicate true for an unrelated message, and a failed write on the flagged path produced an error with no guidance.

**Newly explained** (the audit left it INCONCLUSIVE): HVAC-S3 with flags on lost its reply because several safety-advice call sites build the text without a service type, so `deterministicSafetyGuidance` defaults to `electrical`, and an HVAC `burning_smell` signal produces nothing under that default. Seven call sites omit the service type (`kael/pipeline/pipeline-safety-guidance.ts:10`, `domains/kael-chat/advance.ts:245`, and `kael/kael-guardrails/boundary-guard.ts` lines 500, 519, 547, 574 and 597). This round does **not** change them (see section 6); the fix below makes the delivery independent of them.

**Fix** ([emergency-turn.ts](../../../supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts) `resolveCaseEmergency`, lines 99-108): the shared gate always answers a confirmed current-turn hazard. The deferral, the `requiresImmediateKaelSafetyPathForTexts` import and the `persistedSafetySignals` and `actorId` inputs are removed, and the four call sites that passed them stop passing them (`turn.ts`, `create.ts`, `evidence.ts`, `intake-confirmation.service.ts`, two lines each). `stopsTurn` is unchanged (`false` only for `electrical_water`, `true` for the rest and for every parked request).

Consequences, by construction:
- Route, visible numbers and `emergency_route` metadata are the same with every flag on as with every flag off.
- A signal persisted earlier cannot replace the answer (the gate no longer reads it).
- A write failure takes the gate's own path (one retry, then an error that carries the guidance and the structured `emergency` field), the same as with flags off.
- The playbook still adds its advisory where the turn continues (electrical_water routes): PLMB-S3 with flags on shows the gate message, then "Giữ mọi người tránh xa khu vực đang có nước..." and the next question.

**Attempts: 1 of 3** (plus a test retarget, section 5).

**Regression**: [kael-case-emergency-playbook-precedence-pillar.test.ts](../../../apps/api/src/__tests__/kael-edge-runtime/domains/kael-case-emergency-playbook-precedence-pillar.test.ts), pillar `P420`, 33 rows: 9 frozen/derived hazards x {ON equals OFF for route, numbers and metadata; the gate speaks once; no repeated sentence}, the stale-signal Case, one-write and persistent write failure with recovery (flags off and on), 7 ordinary-wording negatives with every flag on, a stranger who cannot write, and an offer under review that stays in place.
- Red on unmodified main: 9 failed, 24 passed (`logs/final/red-on-baseline-P420.log.txt`); the failures are the PLMB-S3, HVAC-S3, UPHO-S4/4, ELEC-S3, ELEC-S4/4 and C2 flags-on rows, the stale-signal row and the two write-failure rows with flags on.
- Green on the candidate: 33 of 33.

## 4. DX-01 - incorrect out-of-scope rejection

**Root cause** (confirmed, one site wider than the audit found): two deterministic keyword catalogues treat a bare mention of an appliance as a request for unsupported repair:
1. `boundary-guard.ts` `detectOutOfScope` closes the Case permanently (`unsupported`).
2. `pipeline/utils.ts` `hasUnsupportedRepairIntent`, used by the deterministic fallback intent when the model returns nothing, makes the pipeline answer "Kael currently supports..." even though the Case stays open. This is why ELEC-S2 still failed `asks_clarifying_question` after the first fix (the first candidate run is kept in `results/post-attempt1-boundary-guard-only/`).

**Fix**: a new leaf module [requested-work.ts](../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work.ts) (72 lines). `detectRequestedApplianceWork(text)` returns the appliance keywords (`tu lanh`, `may giat`, `may say`, `may rua bat`, `may rua chen`, `lo vi song`, `bep ga`, `bep tu`, `binh nong lanh`, `may bom`, `wifi`, `internet`) that the text actually asks to have worked on. A mention is a request when, in its clause, a repair verb stands directly before it ("sửa máy giặt") or a fault follows it ("tủ lạnh không lạnh"), or a repair verb is in the sentence and the mention is not placed ("ở ban công", "gần đó", "của tòa nhà"). A suspected cause ("không biết do máy giặt", "nghi do", "hoặc") is never a request. Both catalogues now ask it: `boundary-guard.ts` lines 22, 390 and 398; `pipeline/utils.ts` lines 2 and 103-108. The off-topic phrases, `sua khoa`, `son nha`, prompt-injection handling and the electrical infrastructure escape are untouched.

**Effect**: ELEC-S2, PLMB-S2 and PLMB-S4 step 3 keep the Case `active`; a genuine washing-machine, refrigerator, Wi-Fi, hob, microwave or dryer request is still refused as `out_of_scope` and the Case is closed; an ambiguous attribution ("không biết do ống hay do máy giặt") goes to the normal intake question. The flagged electrical policy path is unchanged (it never reached this catalogue), so with the flag on only the non-electrical services and the fallback intent are affected. For electrical with the flag on, genuine fridge faults are refused by the policy's own rule as before.

**Voice and evidence, investigated, not changed** (pinned by a P421 row): the boundary guard reads only the typed message. On the turn route a typed message is required (a missing or empty one is a 400), so a reviewed voice transcript always rides beside a typed message and is never screened. On the create route a request made from a transcript alone is accepted (201) and is not screened either: a genuine washing-machine request spoken into the create screen opens an `active` Case. Whether transcripts and evidence notes should be screened is an owner decision (report D). No public contract was touched.

**Attempts: 2 of 3** (the second extended the same test to the fallback-intent site; no change of strategy).

**Regression**: [kael-boundary-requested-work-pillar.test.ts](../../../apps/api/src/__tests__/kael-edge-runtime/domains/kael-boundary-requested-work-pillar.test.ts), pillar `P421`, 65 rows: 9 incidental mentions and 4 ambiguous attributions x flags {off, on} (the three frozen texts, cleaning, handyman, HVAC, electrical and plumbing probes), 9 genuine requests x {off, on} (washing machine, refrigerator, Wi-Fi, hob, microwave, dryer, repair-with-place, explicit request inside a mixed message, off-topic), the electrical flag-off and flag-on genuine rows, prompt injection unchanged, the fallback intent (3 incidental, 3 genuine, the two service phrases), and the handler rows (create and turn, flags off and on; a genuine request closes the Case; a closed Case stays closed with no new row; a stranger and an admin write nothing; the voice-transcript pin).
- Red on unmodified main: 28 failed, 37 passed (`logs/final/red-on-baseline-P421.log.txt`, final test file).
- Green on the candidate: 65 of 65 (the voice-and-create pin was added after the red run; on unmodified main the 28 red rows are the incidental, ambiguous, fallback-intent and handler rows, and the pin row is green on both).

## 5. Existing tests whose expectation changed

Reported rather than hidden. `pnpm lint:test-integrity --working` lists the first as a report-only line (`expected-literal-changed`); it has 0 blocking findings. No assertion was deleted, skipped or weakened: each changed row has the same or a higher number of `expect` calls.

| File | Row | Old expectation (encoded the defect) | New expectation |
|---|---|---|---|
| `kael-case-emergency-intake-pillar.test.ts` | "does not say it twice" (electrical, flag on, "Ổ cắm đang bốc khói") | no gate turn; the flagged path owns the reply | exactly one gate turn with route `fire`, exactly one reply naming 114, no model call, no unexpected write |
| `kael-case-emergency-intake-pillar.test.ts` | "defers a smoke and sparking report to the HVAC flagged path" | no gate turn | one gate turn with route `electrical_water` naming 112, 114, 115, no classifier call, no unexpected write (in the run the HVAC advisory follows the gate message; that is observed, not asserted) |
| `kael-case-emergency-all-fields-pillar.test.ts` | "keeps the safety signal that a later field raised" | the voice transcript "Ổ cắm đang bốc khói" (now answered by the gate, so the flagged path no longer persists it) | the voice transcript "Tủ điện nóng và có mùi khét" (a hazard the flagged scanner treats as critical and the gate does not stop), same assertion |
| same file | manifest `mutation` text | mentioned "the flagged-path deferral" | the deferral clause is removed |

`governance/protocols/test-pillars.md` was regenerated by `pillar-registry.mjs --write` (413 to 416 pillars, three new rows, the P408 row text). `docs/reuse-ladder-debt.md` gained one entry for `requested-work.ts`.

## 6. Adjacent findings, not fixed

1. Seven safety-advice call sites default the service type to `electrical` (section 3). With the gate always answering, none of them can now remove the emergency numbers, but the domain advisory they add for a non-electrical Case can still be wrong or missing.
2. On a gate-stopped turn the playbook's current-turn signals are not written to the Case (`intake_safety_signals`), because the stopped turn does not run the persisting step. With flags on, the later-turn reminder that the flagged path used to add after a fire report is therefore gone.
3. The Vietnamese paraphrase of HVAC-S3 that the audit wrote ("...khói đen bốc ra dày đặc từ dàn lạnh") is still not detected by the gate with flags off or on (`results/post/dx03-language.json`). It is a classifier-coverage gap unrelated to this round.

## 7. Changed files

Production (`git diff --stat`, 8 files, +32/-40, plus one new file):

| File | Change |
|---|---|
| `kael/kael-guardrails/emergency-guidance.ts` | +7: `requires` on `Cue`, three constants, two cues, one filter line |
| `domains/kael-chat/emergency-turn.ts` | -19/+1: deferral and two inputs removed |
| `domains/kael-chat/{turn,create,evidence,intake-confirmation.service}.ts` | -2 each: stop passing the removed inputs |
| `kael/kael-guardrails/boundary-guard.ts` | +5: import, one call, one condition |
| `kael/pipeline/utils.ts` | +4/-7: `hasUnsupportedRepairIntent` asks the shared test |
| `kael/kael-guardrails/requested-work.ts` | new, 72 lines |

Tests: three new pillars (P419, P420, P421), two edited pillar files (section 5). Docs: this folder, the pillar index, the reuse ledger, and the `docs/test-logs/INDEX.md` row.
No comment token was added to a production line (`pnpm lint:comments --working` clean). No migration, RPC, flag, contract, mobile or shared file changed.

## 8. Compatibility and rollback

- Public contracts: unchanged. The response envelope, the `emergency` field, the `emergency_route` and `safety_source` metadata and the route table are as before; `resolveCaseEmergency` is internal.
- Behaviour that changes with the playbook flags on: an electrical fire report is answered by the gate message (114) and the turn stops, where the playbook used to answer with its longer advisory (112/114/115 and the breaker note) and let the Case continue; an electrical_water report is answered by the gate message and then the playbook advisory, so the numbers appear in two replies. Both are owner decisions (report D).
- Behaviour that changes with the flags off: a wiring spark beside wired equipment now escalates; an appliance mentioned as a cause, a place or a neighbour no longer closes the Case.
- Rollback: revert the commit(s). There is no data migration, no flag and no persisted shape to undo. The change takes effect only when the Edge function is redeployed, which this round did not do.

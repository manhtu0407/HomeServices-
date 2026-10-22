# REPORT D - Remediation closure scorecard, remediation round 1

## Final verdict

**READY FOR INDEPENDENT REVIEW** at tier T0 - all three confirmed defects are fixed with red-first regression evidence, the frozen 36-scenario matrix has no regression, and every mandatory condition that can be tested at T0 is met. This is not an acceptance, not a release, and not a claim about real-world classifier reliability.

What the verdict does not say: that a live model behaves the same, that Production flags make these defects live, that S5 passes, or that the classifier recognises emergencies it has no cue for. The author of this round is the same agent lineage that wrote the diagnostic and the audit, so an independent reviewer is still owed.

## 1. Closure per defect

| Item | Verdict | Evidence |
|---|---|---|
| **DX-01** incorrect out-of-scope rejection | **PASS** (T0) | ELEC-S2, PLMB-S2 and PLMB-S4 FAIL to PASS in the frozen matrix with flags off; ELEC-S2, PLMB-S2, PLMB-S4 FAIL to PASS with every flag on; P421 65 of 65 (28 red on unmodified main); genuine washing-machine, refrigerator, Wi-Fi, hob, microwave and dryer requests still refused as `out_of_scope` and the Case closed; ambiguous attributions go to the intake question; closed Cases stay closed; a stranger and an admin write nothing. Two attempts of three (second keyword site found in the fallback intent). |
| **DX-02** missed Electrical emergency | **PASS** (T0) | ELEC-S4 FAIL to PASS with flags off, PASS before and after with flags on; the gate now routes the frozen transcript to `electrical_water` (112/114/115) with route, text and metadata; P419 32 of 32 (11 red on unmodified main), including accents, no accents, capitals, English, negated, past, hypothetical, resolved, quoted, mis-toned, gas-stove and clause-alone controls; the development phrase sets (P410), signal matrix (P405) and sentinel matrix (P414) unchanged. One attempt of three. |
| **DX-03** playbook flags weaken emergency routing | **PASS** (T0) | 21 of 21 frozen hazard checkpoints correct on route, visible numbers and metadata with every flag on, as with every flag off (baseline: 17, 15 and 15 of 21 with flags on); PLMB-S3, HVAC-S3, UPHO-S4/4, C6 and ELEC-S4/4 included; 15 of 15 through the real create route; 0 checkpoints worse; 0 where flags on delivers less than flags off; stale-signal Case and write-failure/recovery covered; P420 33 of 33 (9 red on unmodified main). One attempt of three. |
| **S5** six end-to-end journeys | **BLOCKED**, unchanged | J03, J14 and J15 BLOCKED in all six services before and after; nothing was changed to move them. Explicit T1 dependencies in section 3. |

Limits that apply to all three PASS verdicts: T0 harness with a stubbed model; the playbook flags were exercised both on and off, but Production's actual flag state is unknown and was not queried; no deployment happened, so none of this is live.

## 2. Mandatory conditions

| Condition (mission) | Status |
|---|---|
| R1: ELEC-S2, PLMB-S2, PLMB-S4; cleaning, HVAC, handyman incidental mentions; genuine washing machine, refrigerator, Wi-Fi; ambiguous mixed descriptions; Case status and unauthorized-write checks | met (frozen matrix, P421) |
| R1: investigate voice and evidence handling, no public contract change | done and pinned, not changed (report A section 4) |
| R2: frozen ELEC-S4, single-change counterfactuals, nearby maintenance, negated and historical, accents / no accents / English, playbook off and on | met (frozen matrix flags off and on, P419) |
| R3: PLMB-S3, HVAC-S3, UPHO-S4 step 4, C6, ELEC-S4, all 21 checkpoints flags off and on, negative controls for false routing | met (triplet table, P420) |
| Phase 4: the 36 frozen scenarios, fixtures, ids, hashes and expectations unchanged | met; every run verified the hashes; baseline comparison shows 0 regressions |
| Phase 4: supplementary flags on/off, targeted controls, API and Mobile tests, type-checks, seven Edge function checks, safety/approval pillars, structure / ownership / governance gates | run; see report B. Two items are not clean: `lint:authority` fails on clean main as well (pre-existing, one citation in a file this round did not touch), and `ship:check` reports NOT READY only because nothing is committed |
| Report route correctness, visible guidance and metadata separately | done (report C section 1) |
| No claim of improved real-world recall; H5 historical only | met; H5 not run, not changed |
| Restrictions: no KAWA_02, release, hosted mutation, migration, RPC, paid call, classifier replacement, H5 edit, six-service redesign, commit/push/merge | all held |
| Bounded execution: at most 3 attempts per defect, at most 1 strategy change, one final complete pass | DX-01 2 attempts, DX-02 1, DX-03 1; no strategy change; final pass `logs/final/` |

## 3. S5: explicit T1 dependencies

Unchanged from the audit, restated so the next task starts from them.

| Checkpoint | Status | Needs |
|---|---|---|
| J03 no offer before quote-ready | BLOCKED | PostgreSQL: readiness is decided inside `confirm_kael_chat_durable_authorized_v6` and its chain; run the refusal for a non-quote-ready session and for a replay |
| J11 worker-only accept | PASS at T0 | PostgreSQL for atomicity: an admin id writes nothing; two concurrent accepts yield one winner |
| J14 payment rail and callback | BLOCKED | T1 and T2: ledger, verified callback, cash confirmation |
| J15 atomicity, RLS, concurrency | BLOCKED | PostgreSQL: `unique (session_id, turn_index)`, per-actor RLS reads, lock behaviour |
| J04 / J05 customer-only decisions | PASS at T0 | Not an RLS question (the Edge writes with the service-role client); a T2 check that a real admin JWT resolves to `role = admin` |

T1 is a separately authorized task; it was not started.

## 4. Owner decisions needed next

1. **Authorize the independent review** and say who reviews. A recall claim for the classifier needs a fresh independent set and a named reviewer; nothing in this round supports one.
2. **Gate message and playbook advisory with flags on.** Today an electrical fire report gets the gate message (114) and the turn stops; the playbook's longer advisory and the breaker note are not shown. An electrical_water report gets the gate message and then the playbook advisory, so the numbers appear twice. Options: keep (simplest, safest); compose one message; or let the playbook advisory replace the gate message only where it provably carries the same numbers and is delivered by a write-safe path.
3. **Persisted playbook signals on a gate-stopped turn.** They are no longer written (the stopped turn does not run the persisting step). Restore (adds a write to the emergency path, which the write-integrity pillar protects) or accept.
4. **The seven default-service-type safety-advice call sites** (report A section 6). Fix in a follow-up, or leave.
5. **Screening of voice transcripts and evidence notes by the boundary guard**, on the turn route and the create route (currently never screened; pinned).
6. **A mixed message that explicitly asks for an unsupported repair** (currently the whole Case is refused). Keep, or split into a supported Case and a polite decline.
7. **Water-heater leaks**: plumbing scope or not (the legacy gate declines them, the flagged policy has a dedicated rule).
8. **Hot panel with a burning smell and no spark, and a bare spark with no equipment named**: the gate does not escalate them (pinned); the flagged scanner treats the first as critical. Policy call for the owner.
9. **Production flag state**: a read-only audit by the owner (not done here). It decides whether DX-01/02/03 were live.
10. **Deployment**: authorize or not an Edge redeploy of the candidate after review. Nothing was deployed.
11. **T1 lane** for S5 (J03, J11 atomicity, J14, J15) and a T2 JWT check for J04/J05.
12. **Classifier strategy** for the remaining lexical gaps (the Vietnamese paraphrase of HVAC-S3, the audit's 22 H5 misses): stay a development-row patch, or one of the options in the diagnostic's Report C section 9.
13. **Commit, pull request and session memory**: none done. The candidate is a dirty worktree; `docs/test-logs/INDEX.md` has the new row; protected session memory is unwritten.

## 5. Claims to evidence (solve-conflict-maximize block)

**Claims -> evidence**
- DX-01/02/03 reproduce on unmodified main in the new worktree: `results/pre/` against the committed AFTER results, 0 differences over 60 matrix, 12 journey and 30 flags-on runs (`scripts/compare.mjs`).
- Each new pillar was red before the fix: `logs/final/red-on-baseline-P419|P420|P421.log.txt` (clean worktree at 42daced1, final test files), plus the earlier `logs/red-*.log.txt`.
- Each is green after: final API run in `logs/final/api-full-suite.log.txt`; matrix and journeys in `results/post/`.
- No scenario regressed: `results/scorecard.json`, `results/triplet-table.json`.
- Gate outputs: `logs/final/*.log.txt`; commands, working directories and exit codes in `logs/final-commands.jsonl`.

**Not run**: T1, T2, T3; hosted/Production; live or paid model; sealed H5; backend parity against a database; the mission's separate "AUDIT_REPORT(2).md" file; native/mobile rendering. Shared and mobile suites ran once, before the last edits; neither package changed and none of their sources imports a changed Edge file.

**Pre-existing (baseline)**: `lint:authority` exits 1 on clean main with the same single violation (`logs/gates/baseline-lint-authority-main-42daced1.log.txt`). The 6 skipped API tests are the same two database-gated files as in the accepted baseline.

**Gate or protected-surface changes**: none. No file under `scripts/check-*.mjs`, `scripts/harness/**`, `scripts/structure-baseline.json`, `scripts/lint-structure.mjs`, `config/harness/manifest.json`, `**/jest.config.*`, `**/vitest.config.*`, `.github/workflows/**`, `.claude/settings*.json`, `.claude/hooks/**` or `docs/test-debt-ledger.md` changed. Two existing pillar files had expectations changed because they encoded the DX-03 deferral (report A section 5); `check-test-integrity` reports one `expected-literal-changed` line and 0 blocking. `governance/protocols/test-pillars.md` was regenerated by its own script; `docs/reuse-ladder-debt.md` gained one entry.

**Comments / watermark**: `lint:comments --working` clean; `lint:added-hygiene --working` 0 blocking. No comment token was added to any production line.

**Stop-rule triggers**: none. No gate was edited to pass; no gate stayed red after two code attempts.

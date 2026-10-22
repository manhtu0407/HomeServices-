# REPORT C - Safety report, remediation round 1

Tier: **T0**. Every figure below was produced by the repository's Edge-runtime harness with the model providers stubbed; none says anything about live models, Production flags or real users.
Same agent lineage as the diagnostic, the audit and this implementation: an independent reviewer has not looked at it.

## 1. Emergency route correctness, guidance delivery and metadata, kept apart

Measured at the real handler for every frozen hazard step (21 checkpoints seeded into an active Case, and the 15 that can be reached through the real create route), accepted baseline against the candidate. Route correct = the route in the `emergency_route` metadata of the reply turn, or in the structured `emergency` field of an error body, is the frozen primary or an accepted alternative. Visible exact = the customer-visible text names every number the frozen route policy requires for the primary route. Metadata present = some route is carried. Source: `results/triplet-table.json`, `results/{base,post}/triplet.json`.

| Configuration | Checkpoints | Baseline: route / visible / metadata | Candidate: route / visible / metadata |
|---|---|---|---|
| seeded Case, playbook flags off | 21 | 20 / 20 / 20 | **21 / 21 / 21** |
| seeded Case, every playbook flag on | 21 | 15 / 17 / 15 | **21 / 21 / 21** |
| created Case, flags off | 15 | 15 / 15 / 15 | 15 / 15 / 15 |
| created Case, every flag on | 15 | 10 / 13 / 10 | **15 / 15 / 15** |

- Checkpoints that got worse on any of the three dimensions: **0**.
- Candidate checkpoints where flags on delivers a number, a route or a metadata that flags off did not: allowed. Where it delivers *less* than flags off: **0** (`monotonic_violations_flags_on_vs_off_candidate` is empty).
- The baseline's flags-on gap is wider on route and metadata (15 of 21) than on visible text (17 of 21) because the playbook path delivered its own numbers for the electrical Cases without carrying any gate metadata. A count of emergency numbers alone would have hidden that.
- Emergency delivery for the failed-write checkpoint (C6) with flags on: the baseline returned a 500 whose text carried no guidance; the candidate answers on the same request when one write fails once, and returns an error that carries the guidance and the structured field when the write keeps failing, then delivers on the retry. SUPP-C6b (the write keeps failing, then the customer retries): flags off PASS to PASS; flags on **FAIL (failure_observable, recovery_delivers) to PASS** (clean main rerun in `results/base/supp-c6b-flags-on.json`, candidate in `results/post/supp-c6b-flags-on.json`; also P420).

## 2. Derived hazards, one language apart

The audit wrote four paraphrases of the frozen hazards to test the language dependence (`kawa-audit-dx03-language`, rerun unchanged on both trees):

| Case | Baseline off | Baseline on | Candidate off | Candidate on |
|---|---|---|---|---|
| plumbing, Vietnamese | 112/114/115 | **no number** | 112/114/115 | 112/114/115 |
| plumbing, English | 112/114/115 | 112/114/115 | 112/114/115 | 112/114/115 |
| HVAC, English | 114 | **no number** | 114 | 114 |
| HVAC, Vietnamese paraphrase | **no number** | no number | **no number** | no number |

The last row is a classifier-coverage gap that exists with the playbook off and is unchanged. It is not part of the three defects and is not fixed here.

## 3. Negative controls (false emergency routing)

All pass on the candidate.
- Classifier (P419): negated, yesterday, last week, hypothetical, resolved, quoted-label, wrong-tone, gas-stove ignition, fireworks, a hot-and-smelly panel with no spark, ordinary maintenance, English negated/past/hypothetical.
- Case turn (P420): seven ordinary-wording turns (burnt socket "from last week", a spark "yesterday", "no sparks, routine check", a running tap, an AC that runs but does not cool, a cigarette burn on a sofa, a weak gas-stove flame) with every playbook flag on produce no emergency turn.
- The existing development phrase sets (P410: four hand-written sets, 267 labelled rows, all route as labelled), the signal matrix (P405) and the sentinel matrix (P414) pass in the final full API run.
- Hazard text that the new spark cue must not touch is protected by `requires` (wired equipment in the same segment) and `unless` (gas stove, fireworks, welding), on top of every existing filter.

## 4. H5: historical limitation, stated plainly

- The H5 record (11 of 29 positives exact, 18 false negatives, 1 false alarm of 30 negatives, 4 of 4 judgement rows missed, and the audit's six corrections) is kept as **reproduction evidence of the KAWA_01 classifier on that set**. No H5 file, label or hash was changed (`git status` shows no change under `fixtures/emergency-phrases/`).
- H5 was **not** run against the candidate, because the mission forbids using it as a new independent test and the set is no longer sealed. A changed H5 number would not have been evidence of anything: the new spark cue was derived from the frozen ELEC-S4 transcript and the audit's single-change edits, not from H5 rows.
- **No claim is made that real-world classifier recall improved.** The classifier is still a hand-written cue grammar; this round added two cues and a segment-level `requires` condition. The audit's evidence stands: 22 of the 29 positive H5 rows fail at cue matching, and the fix for one demonstrated sentence says nothing about the others. A measurement of recall needs a fresh independent set and an independent reviewer (owner decision).

## 5. Remaining production risks

1. **Production flag state is unknown** and was not queried. It decides whether DX-03 was live (every playbook flag), and whether the electrical part of DX-01 and DX-02 was live (the electrical flag). The candidate behaves identically across the two states for the checked hazards, so it is safe to ship in either, but the size of the benefit is not known.
2. **Not deployed.** The Edge function must be redeployed for any of this to take effect. Not done; no hosted resource was touched.
3. **Classifier coverage is lexical and narrow.** A paraphrase the cues do not know (section 2, last row; the audit's 22 H5 misses) still gets no emergency answer. A hot panel with a burning smell and no spark is still not an emergency for the gate, although the flagged scanner treats it as critical.
4. **The playbook is no longer the only voice on a gate-stopped turn.** With flags on, an electrical fire report is answered by the gate message (114) and the turn stops; the playbook's longer advisory (112/114/115, breaker note) and its persisted `intake_safety_signals` are not produced on that turn. For an electrical_water report the customer sees the gate message and then the playbook advisory, so the numbers appear in two replies. Neither contradicts the other; whether to compose them into one message is a copy decision for the owner.
5. **Seven safety-advice call sites default the service type to `electrical`** (report A section 3). They can no longer remove the numbers, but the domain advisory for a non-electrical Case can still be missing or electrical-flavoured.
6. **DX-01 now depends on request wording.** An unsupported appliance mentioned with no repair verb and no fault ("Máy giặt nhà mình.") passes the guard and reaches the intake. With a live model that decision belongs to the structured intent stage, which this round could not exercise; the deterministic fallback applies the same wording test. An explicit unsupported request inside a mixed message is still refused (the whole Case closes). A reviewed voice transcript or evidence note is not screened by the guard, on the turn route or the create route.
7. **Water heaters.** A water-heater leak is still declined by the legacy gate (unchanged), although the flagged policy has a dedicated water-heater-leak rule; whether it is plumbing scope is a product question.
8. **Mobile and native behaviour were not exercised** (T3). The structured `emergency` field, the metadata keys and the response envelope are unchanged, so no client change is needed.
9. **S5 remains BLOCKED** at J03, J14 and J15: the readiness decision, the payment rail and atomicity/RLS/concurrency need PostgreSQL (T1) or more.

## 6. What was not run

T1 (PostgreSQL replay, RLS actor matrix, concurrency), T2 (multi-actor, deployed), T3 (device); any hosted or Production resource; any paid or live model; the sealed H5 set; the mission's "AUDIT_REPORT(2).md" as a separate file (the audited copy in the tree was used); backend parity against a database (`lint:edge-db` ran statically: no RPC, migration or contract file changed).

# REPORT C - H5 root-cause analysis

H5 is the existing 63-row sealed diagnostic set (29 clear emergencies, 30 clear non-emergencies, 4 judgement rows). It is treated as a diagnostic set: **no label was changed, no cue was changed, nothing was tuned, and every number below is a REPRODUCTION, not independent validation.** H5 is no longer a holdout (it was read by the earlier audit and by this one), so it cannot support a fresh performance claim.

Set hash (LF-normalised, as the repository's own pillar computes it): `80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d`, verified before every run. Classifier: AFTER `emergency-guidance.ts` and `emergency-signal-text.ts`. Their bytes differ from the `63c01524` evidence only by 167 comment lines removed at integration; the routes reproduce exactly (11 of 29, 1 of 30).

## Verdict

**H5 ROOT CAUSE: CONFIRMED for the proximate cause.** All 18 false negatives, the one false alarm and the 4 missed judgement rows fail at the *same* stage: **cue matching** (stage 4 of 9), category **LEXICAL_COVERAGE**. For every one of the 22 missed rows no cue pattern matched anywhere, so no later stage (tone check, hypothetical, past, resolved, quotation, negation, multi-hazard resolution, final route, delivery) ever saw the row. Zero rows fail because of normalisation, segmentation, negation or temporal context, multi-signal routing, service context, the entry point or delivery.

The deeper claim, that a hand-enumerated cue grammar cannot generalise to open Vietnamese and English wording, is **supported but not proven**: it rests on a 267-of-267 development score against 11-of-29 on H5, on perturbation sensitivity, and on the mechanisms below. Proving it needs an independent set, which does not exist.

## 1. The processing chain, and where each stage stands

| # | Stage | Result on H5 |
|---|---|---|
| 1 | Customer input and request schema | 63/63 rows pass `kaelChatTurnSchema` |
| 2 | Text, voice and evidence extraction | Not the cause: the same text reaches the classifier whether typed or in a reviewed transcript (P408, P414 prove the plumbing). H5 rows are typed text only |
| 3 | Normalisation (`buildSignalText`) | Correct on every miss: the accent-stripped `plain` text is right; no row lost a character that mattered |
| 4 | **Cue matching** | **Fails here for 22 of 22 missed rows** (no regex matched) |
| 5 | Tone agreement | never reached by a miss; it rejected nothing on H5 |
| 6 | Hypothetical, past, resolved, quotation, `unless`, bleeding-target filters | never reached by a miss; they correctly rejected 3 cue matches on 2 negatives (H5-034 and H5-049, all by the past-tense filter) |
| 7 | Negation | never reached by a miss |
| 8 | Multi-hazard resolution | 0 wrong routes; no multi-route row exists in H5 |
| 9 | Final route and customer text | n/a for misses; for the 11 detected rows the delivered text matched the classifier route |
| - | Entry point and delivery | The same 63 rows through the real Case-turn handler gave 11/29 positives and 1/30 negatives with a number: identical to the classifier, 0 disagreements, 63 of 63 returned 200 |

The trace is from a clone of the classifier whose only change is that `hasAffirmedCue` records why each candidate match was kept or dropped (`04-analysis/make-traced-clone.mjs`). The clone returned the same route as the real function on all 63 rows.

## 2. Frequencies

{{T_H5_FREQ}}

Sub-mechanisms of LEXICAL_COVERAGE on the 19 clear rows (18 misses + 1 false alarm) are: **LC-SPAN** an intervening token, a digit token or a longer gap breaks a cue (5 rows incl. H5-013); **LC-SYN** a synonym or paraphrase of an existing cue is absent (6); **LC-ORDER** same words, other order (2, one on the negative side); **LC-MORPH** an English tense or construction not enumerated (1); **LC-CLASS** no cue family exists for the concept (6). The counts in the generated table above are authoritative; H5-013 carries two independent gaps (LC-SPAN and LC-SYN) and is counted once under the combined label.

## 3. Row-level findings (all 63 rows accounted for, none relabelled)

{{T_H5_ROWS}}

## 4. What is verified and what is hypothesised

**Verified (empty trace plus a single-change edit that flips the route, run against the unchanged classifier):** H5-001, 002, 005, 011, 014, 015, 018, 019, 024, 028 and 040, and H5-013 (two independent gaps, both needed). The edits are in `05-h5/probes-after.json` and are derived texts, not H5 rows; they were not used to change anything and count toward no rate.

{{T_PROBES}}

Two hypotheses were wrong the first time and are kept visible: H5-019 ("ướt sũng" vs "ngâm nước" synonym) was refuted in round 1; the real cause is a two-word gap limit (round 2). H5-013's verb-only and clause-only edits both still missed (round 3), so it needs both fixes.

**Verified by absence only:** H5-009, 016, 017, 020, 022, 026, 029 and the four judgement rows. The trace is empty and the cue lists were read: no cue family exists for obstetric emergencies, gunshots, indirect burglary descriptions, a loose cable on a wet floor, a snapped wire in a puddle, "full of gas" without a leak verb, or "cannot tell if I need the fire service or the police". Whether adding a cue would fix them was deliberately not tested.

**Not verified:** whether the classifier's behaviour on H5 predicts its behaviour on real customer messages. H5 was written by the same project, 29 positives give a 95 % Wilson interval of 22.7-56.0 %, and no independent reviewer set exists.

## 5. Why more data would not change this classifier

The decision path is `resolveReportedEmergencyGuidance(text, language, {serviceType})` -> `readEmergencySignals` -> regular-expression cue lists. Its only inputs are the message text and an optional service type. It reads no memory, no knowledge base, no stored case, no model and no learned rule, and `emergency-turn.ts` calls it before any model, knowledge retrieval or memory read by design (KAWA_01 W01). Therefore:

- Adding rows to a corpus, a playbook, a RAG index or Kael memory **cannot change the result**; those sit on the other side of the gate.
- Memory or RAG could only help if a new stage were inserted *after* a deterministic miss and *before* the "ordinary request" path, which changes the gate's contract and its privacy and cost properties.
- The 267 development rows score 267 of 267 because the cues were written to them. H5 scores 11 of 29. The gap is the cost of the closed vocabulary.

## 6. Robustness of the closed vocabulary (development positives, 154 currently correct)

{{T_PERTURB}}

Reading it: capital letters are free; dropping all diacritics costs 7.8 %; a **wrong tone mark costs 40 %** (the tone-agreement check treats a mismatch as a different word); a single deleted, swapped or doubled letter in one word costs about 29-30 % each (44-46 of 154). Vietnamese typed on a phone with an unreliable keyboard, or speech-to-text with tone errors, falls into these rows.

## 7. Does H5 share a root cause with the six-service defects?

**PARTIALLY.** Not merely because both involve Kael: one defect is genuinely the same, one is the same *style* of design in different code, the others are independent.

| Six-service defect | Same defect as H5? | Reason |
|---|---|---|
| DX-02 ELEC-S4 hazard missed | **Yes** | same classifier, same stage (no cue matched), same family |
| DX-01 false out-of-scope decline | **No, same style only** | different file (`boundary-guard.ts`), opposite direction (false positive), keyword substring match with no context; shares the design weakness "decide from an enumerated word list" |
| DX-03 gate defers to flagged path | No | a gate-ordering rule in `emergency-turn.ts`, not classification |
| DX-04 closed-Case delivery | No | contract and client rendering |
| J03 quote-readiness in SQL only | No | T1 |
| docs drift | No | documentation |

A fix for H5 would therefore repair DX-02 and nothing else, and a fix for DX-01 would not move H5.

## 8. Can a deterministic classifier handle Vietnamese and English variation?

| Variation | Evidence | Handles it? |
|---|---|---|
| Synonyms and paraphrases | 6 H5 misses (LC-SYN); every probe that swapped one synonym flipped the route | No, by construction |
| Missing diacritics | 142/154 kept | Mostly; 7.8 % lost where a tone rule needs the mark |
| Incorrect diacritics | 91/154 kept | Poorly: 40 % lost |
| Word order | H5-005, H5-040 (negative side) | No |
| Typographical errors | 106-108/154 kept per single-letter error | Poorly: about 30 % lost |
| Negation and temporal context | 3 cue matches on 2 negatives rejected by the past filter; 0 misses caused by it; dev sets all correct | Yes, on enumerated patterns (this is the strongest part) |
| Multiple hazards | 0 wrong routes; scenario C5 -> 112 | Yes for combinations of enumerated cues |
| Indirect descriptions of danger | 6 LC-CLASS misses | No |
| Service-specific terminology | HVAC refrigerant rules worked (HVAC-S2 stayed quiet); 0 H5 misses cite service context | Partly: only where someone wrote a rule |

## 9. Alternatives (not implemented, no paid model called)

| Option | Safety | Reliability | Complexity | Operating cost | Maintenance |
|---|---|---|---|---|---|
| A. Keep rules, add a reviewed lexicon and paraphrase tests | recall rises on known families; unseen wording still unmeasured | fast, deterministic, auditable | low | none | grows without bound; whack-a-mole, and tuning on H5 would destroy its value as evidence |
| B. Rules plus tolerant matching (tone-insensitive mode, bounded edit distance on cue words, wider spans) | recovers most of the 30-40 % perturbation loss | still deterministic | medium | none | more false-alarm risk; each tolerance needs a negative corpus |
| C. Rules for high-precision stops, plus a cheap semantic "possible emergency" signal that only shows a fixed 112 affordance | adds recall without model-written advice | depends on a threshold; needs an independent set to set it | medium-high | embedding or small-model calls per message | model/threshold drift to monitor |
| D. Rules first; on a miss, a server-side model picks a route from a closed set (schema-validated), reply is fixed text | highest recall potential; failure falls back to the fixed affordance | model-dependent latency and availability | high | one call per non-matching message | prompt and model governance; paid-provider approval |
| E. Product fail-safe: a permanent, always-visible emergency affordance (KAWA_01 already ships an offline emergency access component) | independent of recall | deterministic | low | none | content review only |

Memory, RAG and model routing do not change the current classifier (section 5); they are options C and D only. E should hold regardless of the choice. The choice, the independent reviewer and the thresholds are owner decisions (Report D).

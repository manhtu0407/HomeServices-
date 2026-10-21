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

| Measure | Value |
| --- | --- |
| Rows | 63 |
| Clear positives / negatives | 29 / 30 |
| True positives, exact route | 11/29 (37.9 %, 95 % Wilson 22.7-56.0 %) |
| False negatives | 18 |
| Wrong route | 0 |
| False positives | 1/30 |
| Judgement rows missed (excluded from rates) | 4/4 |
| Failures by category | {"LEXICAL_COVERAGE":23} |
| Failures by sub-mechanism (clear rows) | {"LC-SPAN":4,"LC-SYN":5,"LC-ORDER":1,"LC-CLASS":6,"LC-SPAN+LC-SYN":1,"LC-MORPH":1,"LC-ORDER (negative side)":1} |
| Failures by earliest stage | {"cue matching (stage 4 of 9)":23} |
| Failures caused by normalisation, segmentation, negation, multi-signal routing, entry point or delivery | 0 |
| Cue matches on negatives rejected by a context filter (rows H5-034 and H5-049; all by the past-tense filter) | {"past":3} |
| End-to-end through the Case-turn handler, AFTER: positives / negatives that produced a number | 11/29 ; 1/30 |
| End-to-end, BEFORE (deterministic layer only) | 0/29 ; 0/30 |

Sub-mechanisms of LEXICAL_COVERAGE on the 19 clear rows (18 misses + 1 false alarm) are: **LC-SPAN** an intervening token, a digit token or a longer gap breaks a cue (5 rows incl. H5-013); **LC-SYN** a synonym or paraphrase of an existing cue is absent (6); **LC-ORDER** same words, other order (2, one on the negative side); **LC-MORPH** an English tense or construction not enumerated (1); **LC-CLASS** no cue family exists for the concept (6). The counts in the generated table above are authoritative; H5-013 carries two independent gaps (LC-SPAN and LC-SYN) and is counted once under the combined label.

## 3. Row-level findings (all 63 rows accounted for, none relabelled)

| Row | Expected | Got | Outcome | Category | Sub-mechanism | Mechanism and evidence |
| --- | --- | --- | --- | --- | --- | --- |
| H5-001 | fire | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SPAN | a colour adjective ("xanh lè") separates "lửa" from "bùng"; the trailing smoke phrase ("khói trắng mù mịt") has no cue either [trace empty; round-3 single-change probe H5-001-round3 routes fire] |
| H5-002 | fire | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SYN | "cháy lớn" is a cue, "cháy dữ dội" is not; "khói đang vào" is not "khói bay vào" [trace empty; probe H5-002 (cháy dữ dội to cháy lớn only) routes fire] |
| H5-003 | fire | fire | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-004 | fire | fire | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-005 | fire | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-ORDER | cues hold "lửa bốc" (fire erupts); the row says "bốc lửa" [trace empty; probe H5-005 routes fire] |
| H5-006 | fire | fire | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-007 | medical | medical | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-008 | medical | medical | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-009 | medical | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-CLASS | no obstetric emergency family (waters broke, labour, severe pain); the medical cues are shock, collapse, breathing, bleeding, ingestion [trace empty; cue list read: no obstetric cue] |
| H5-010 | medical | medical | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-011 | medical | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SYN | ingestion cue is "nuốt nhầm"; "nuốt phải" means the same and is absent; "ho sặc sụa" (choking) is not a cue [trace empty; probe H5-011 routes medical] |
| H5-012 | medical | medical | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-013 | police | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SPAN+LC-SYN | two independent gaps: "cố mở cửa" (trying to open) is not a break-in verb, and the clothing clause between subject and verb breaks the span [trace empty; round-3: verb-only change still misses; clause-only removal still misses; both changed routes police] |
| H5-014 | police | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SYN | threat cue is "sẽ giết" (will kill); "sẽ đánh" (will hit) is absent. "cầm gậy" is irrelevant to the miss [trace empty; round-3 single-change probe: giết routes police; weapon removal alone still misses] |
| H5-015 | police | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-MORPH | the English cue enumerates "climbed" (past); "is trying to climb" is not enumerated [trace empty; probe H5-015 routes police] |
| H5-016 | police | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-CLASS | indirect description of a burglary (masked men, carrying bags, heard screaming): no cue names the event [trace empty; cue list read] |
| H5-017 | police | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-CLASS | "tiếng súng" (gunshots) has no cue; weapon cues require a person carrying a gun or knife [trace empty; cue list read] |
| H5-018 | electrical_water | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SPAN | the reduplicated adverb "ròng ròng" sits between the verb and the preposition, which the cue expects adjacent [trace empty; probe H5-018 routes electrical_water] |
| H5-019 | electrical_water | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SPAN | at most two words may sit between the outlet and "ngâm nước"; "trong nhà tắm" is three. The round-1 synonym hypothesis was refuted ("ngâm nước" alone does not fix it) [trace empty; round-2: two-word gap routes, three-word control misses] |
| H5-020 | electrical_water | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-CLASS | an indirect hazard (a loose cable touching a wet floor) has no cue; English cues name sparking, exposed live wire or water near an outlet [trace empty; cue list read] |
| H5-021 | electrical_water | electrical_water | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-022 | electrical_water | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-CLASS | a snapped wire falling into a puddle ("dây điện đứt", "vũng nước") has no cue [trace empty; cue list read] |
| H5-023 | gas | gas | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-024 | gas | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SPAN | the filler span of the gas-object cue accepts letters only; the digit-bearing token "12kg" breaks it [trace empty; probe H5-024 ("12kg" to "lon") routes gas] |
| H5-025 | gas | gas | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-026 | gas | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-CLASS | "full of gas" without a leak, smell or hiss word has no cue [trace empty; cue list read] |
| H5-027 | gas | gas | TRUE_POSITIVE_ROUTED | - | - | detected and routed |
| H5-028 | uncertain | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SYN | the uncertainty cue is built on "gọi" (call); the row says "báo" (notify) [trace empty; round-3 single-change probe routes uncertain] |
| H5-029 | uncertain | - | FALSE_NEGATIVE | LEXICAL_COVERAGE | LC-SYN | paraphrase of "not sure who to call" ("cannot tell if I need the fire service or the police") is not enumerated [trace empty; cue list read] |
| H5-030 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-031 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-032 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-033 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-034 | - | - | TRUE_NEGATIVE | - | - | cue matched but correctly rejected: gas_smell#0 «mui gas» past; gas_smell#0 «mui gas» past |
| H5-035 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-036 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-037 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-038 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-039 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-040 | - | gas | FALSE_POSITIVE | LEXICAL_COVERAGE | LC-ORDER (negative side) | FALSE ALARM: the prevention list holds "báo rò gas"; the row says "báo gas rò" (install a gas-leak detector). The leak cue fires because the benign context is recognised only by enumerated word order [trace: gas_bare_vi#0 affirmed; probe H5-040 ("gas rò" to "rò gas") stays quiet] |
| H5-041 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-042 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-043 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-044 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-045 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-046 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-047 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-048 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-049 | - | - | TRUE_NEGATIVE | - | - | cue matched but correctly rejected: gas_bare_en#0 «gas leak» past |
| H5-050 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-051 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-052 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-053 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-054 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-055 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-056 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-057 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-058 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-059 | - | - | TRUE_NEGATIVE | - | - | quiet |
| H5-060 | electrical_water | - | JUDGEMENT_MISS | LEXICAL_COVERAGE | LC-CLASS (label contested) | onomatopoeia "lẹt xẹt" and animal damage have no cue [trace empty; excluded from every rate] |
| H5-061 | electrical_water | - | JUDGEMENT_MISS | LEXICAL_COVERAGE | LC-CLASS (label contested) | burning-rubber smell from a dryer has no cue [trace empty; excluded from every rate] |
| H5-062 | gas | - | JUDGEMENT_MISS | LEXICAL_COVERAGE | LC-CLASS (label contested) | faint gas smell at first ignition has no cue (and its severity is contestable) [trace empty; excluded from every rate] |
| H5-063 | electrical_water | - | JUDGEMENT_MISS | LEXICAL_COVERAGE | LC-CLASS (label contested) | overheated main breaker has no cue [trace empty; excluded from every rate] |

## 4. What is verified and what is hypothesised

**Verified (empty trace plus a single-change edit that flips the route, run against the unchanged classifier):** H5-001, 002, 005, 011, 014, 015, 018, 019, 024, 028 and 040, and H5-013 (two independent gaps, both needed). The edits are in `05-h5/probes-after.json` and are derived texts, not H5 rows; they were not used to change anything and count toward no rate.

| Probe | Original route | Edited route | Edit isolates the hypothesis | Mechanism under test |
| --- | --- | --- | --- | --- |
| H5-024 | - | gas | yes | a digit-bearing token ("12kg") sits inside the filler span that the gas-object cue allows only letters in |
| H5-018 | - | electrical_water | yes | the reduplicated adverb "ròng ròng" between the verb and the preposition breaks a pattern that expects them adjacent |
| H5-005 | - | fire | yes | verb-object order: cues encode "lửa bốc" (fire erupts), not "bốc lửa" |
| H5-001 | - | fire | yes | an intervening colour adjective ("xanh lè") separates the noun from its verb in the cue |
| H5-002 | - | fire | yes | synonym: "cháy lớn" is a cue, "cháy dữ dội" is not |
| H5-011 | - | medical | yes | synonym: the ingestion cue is "nuốt nhầm"; "nuốt phải" carries the same meaning but is absent |
| H5-019 | - | - | NO (hypothesis refuted) | synonym: "ngâm nước" is a cue, "ướt sũng" is not |
| H5-028 | - | uncertain | yes | synonym: the uncertainty cue is built on "gọi" (call); the row says "báo" (notify) |
| H5-013 | - | police | yes | verb coverage: "cạy" (pry) is a cue; "cố mở" (trying to open) is not, and the clothing clause breaks the subject-verb span |
| H5-014 | - | police | yes | threat verb: "sẽ giết" (will kill) is a cue; "sẽ đánh" (will hit) is not, and "cầm gậy" is not a weapon cue |
| H5-040 | gas | - | yes | word order on the NEGATIVE side: the prevention list holds "báo rò gas" but the row says "báo gas rò" |
| H5-019-round2-span | - | electrical_water | yes | round 2 after the round-1 synonym hypothesis was NOT confirmed: the cue allows at most two words between the fixture and "ngâm nước"; "trong nhà tắm" is three |
| H5-019-round2-control | - | - | yes | round 2 control: same sentence with the three-word gap kept must still miss, isolating the span limit from the synonym |
| H5-001-round3 | - | fire | yes | round 3 isolation: only "xanh lè" removed |
| H5-013-round3-verb | - | - | NO (hypothesis refuted) | round 3 isolation: only the verb changed to "cạy"; clothing clause kept |
| H5-013-round3-clause | - | - | yes | round 3 isolation: only the clothing clause removed; verb "cố mở" kept |
| H5-014-round3-threat | - | police | yes | round 3 isolation: only the threat verb changed to "giết"; weapon clause kept |
| H5-014-round3-weapon | - | - | yes | round 3 isolation: only the weapon clause removed; threat verb "đánh" kept |
| H5-028-round3 | - | uncertain | yes | round 3 isolation: only "báo" changed to "gọi" |
| H5-015 | - | police | yes | English morphology: the cue list holds the past tense "climbed", not "is trying to climb" |

Two hypotheses were wrong the first time and are kept visible: H5-019 ("ướt sũng" vs "ngâm nước" synonym) was refuted in round 1; the real cause is a two-word gap limit (round 2). H5-013's verb-only and clause-only edits both still missed (round 3), so it needs both fixes.

**Verified by absence only:** H5-009, 016, 017, 020, 022, 026, 029 and the four judgement rows. The trace is empty and the cue lists were read: no cue family exists for obstetric emergencies, gunshots, indirect burglary descriptions, a loose cable on a wet floor, a snapped wire in a puddle, "full of gas" without a leak verb, or "cannot tell if I need the fire service or the police". Whether adding a cue would fix them was deliberately not tested.

**Not verified:** whether the classifier's behaviour on H5 predicts its behaviour on real customer messages. H5 was written by the same project, 29 positives give a 95 % Wilson interval of 22.7-56.0 %, and no independent reviewer set exists.

## 5. Why more data would not change this classifier

The decision path is `resolveReportedEmergencyGuidance(text, language, {serviceType})` -> `readEmergencySignals` -> regular-expression cue lists. Its only inputs are the message text and an optional service type. It reads no memory, no knowledge base, no stored case, no model and no learned rule, and `emergency-turn.ts` calls it before any model, knowledge retrieval or memory read by design (KAWA_01 W01). Therefore:

- Adding rows to a corpus, a playbook, a RAG index or Kael memory **cannot change the result**; those sit on the other side of the gate.
- Memory or RAG could only help if a new stage were inserted *after* a deterministic miss and *before* the "ordinary request" path, which changes the gate's contract and its privacy and cost properties.
- The 267 development rows score 267 of 267 because the cues were written to them. H5 scores 11 of 29. The gap is the cost of the closed vocabulary.

## 6. Robustness of the closed vocabulary (development positives, 154 currently correct)

| Perturbation of 154 development positives (all currently correct) | Still correct | Different route | Lost |
| --- | --- | --- | --- |
| original | 154 | 0 | 0 |
| uppercase | 154 | 0 | 0 |
| no_diacritics | 142 | 0 | 12 |
| wrong_tone_marks | 91 | 1 | 62 |
| one_letter_deleted | 106 | 2 | 46 |
| adjacent_letters_swapped | 108 | 2 | 44 |
| one_letter_doubled | 107 | 2 | 45 |

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

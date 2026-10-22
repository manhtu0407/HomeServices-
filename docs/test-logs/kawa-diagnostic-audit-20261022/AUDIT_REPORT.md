# NESTSCOUT - independent 6-service and H5 diagnostic audit

Audited package: `docs/test-logs/kawa-diagnostic-baseline-20261021/`, commit `084d8d09302b3d797cb9133c7caa4aae38ecb04c`.
Compared snapshots: BEFORE `ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72`, AFTER `42daced1a52ca5b8e5ee2e0b982c28e697f184c9`.
Evidence tier of everything below: **T0** (real Edge handler, real classifier, in-memory PostgREST stand-in, model providers stubbed at `fetch`). T1, T2 and T3 were not run.

## 0. How independent this is, and is not

The auditor is the same agent lineage (Claude Code) that wrote the package under audit. It is a second pass by a different method, **not** an independent human or third-party review. What is independent: the classifier and the boundary guard were called directly (no committed harness); assertions were re-implemented from the frozen assertion text and applied to raw observations; the H5 cue trace uses a `String.prototype.matchAll` wrapper instead of the committed source clone; every H5 counterfactual was rebuilt programmatically from the sealed originals and checked to be one edit; hazard steps were re-run through the handler with Cases opened through the real create route. What is shared: the repository's own `createCaseWorld` plumbing, the frozen matrix, and the stubbed model. Treat the conclusions as "checked and corrected", not "validated by someone else".

Frozen inputs were used unchanged: matrix sha256 `dd8392cb...a51dd7` (verified), sealed H5 sha256 `80e3e907...2d81d` (LF-normalised, verified), `file-digests.json` of the audited package (80 of 80 files match). No label, expected result or product source was edited. No commit, push, merge or deploy; no hosted or Production resource touched; no paid provider call; no protected document edited.

## 1. Verdicts

| Item | Verdict | One line |
|---|---|---|
| DX-01 incorrect out-of-scope rejection | **VERIFIED**, with three corrections | Keyword substring match closes the Case; pre-existing and identical in both snapshots. Electrical declines only while the electrical playbook flag is off. |
| DX-02 missed Electrical emergency | **VERIFIED**, with one correction | Classifier returns no route for the frozen transcript; the mechanism is now proven, not hypothesised. The flagged electrical scanner catches the same text. |
| DX-03 playbook flags weakening emergency routing | **VERIFIED** as a mechanism; Production impact **INCONCLUSIVE** | With flags on the gate yields to the flagged path on a predicate that does not check the flagged reply. Net 17 of 21, not "4 lost". Production flag state is not in the repository. |
| 36-scenario scorecard | **Reproduced and re-scored; classification corrected** | All 36 verdicts match. "23 improved" is 16 genuine FAIL to PASS, 1 FAIL to FAIL, 6 FAIL to BLOCKED (one cross-service result counted six times). |
| H5 63-row root cause | **Reproduction VERIFIED; root cause CONFIRMED with six corrections** | 22 missed detections fail at cue matching; the false alarm does not. H5-019 needs two fixes. |
| Shared cause, H5 and six-service defects | **PARTIALLY CONFIRMED** | Only DX-02 shares the mechanism. DX-01 and DX-03 are independent. |
| S5 checkpoints needing PostgreSQL | **Listed, section 8** | J03, J11 atomicity, J14, J15 need a database; J04/J05 are not backed by RLS at all. |

## 2. DX-01 - incorrect out-of-scope rejection: VERIFIED

**Source.** `supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard.ts` is byte-identical in BEFORE and AFTER (`git diff` empty), so this is pre-existing and not a KAWA_01 regression.
- `OUT_OF_SCOPE_KEYWORDS` lines 98-133 holds `may giat`, `tu lanh`, `binh nong lanh`, `may bom`, `bep tu`, `wifi` and others, matched as whole words with no context (`containsKeyword`, lines 287-292).
- The only escapes are `may bom nuoc` (lines 135-138, 336-340), a clause-level exclusion marker that is **not applied on the electrical path** (line 563 passes `undefined` for electrical), and the electrical infrastructure escape (line 559-564).
- Decline path: `evaluateMessageBoundary` lines 565-577; `domains/kael-chat/guard.ts:126` sets `nextStatus: "unsupported"`. Migration `20260529090000_kael_chat_unsupported_status.sql` documents that status as a permanent end.
- Call sites present only the typed message: `domains/kael-chat/turn.ts:399-411`, `create.ts:347`. Evidence and voice transcripts never reach the guard.

**Reproduction (independent, `results/dx01-boundary-probes.json`).** `evaluateMessageBoundary` called exactly as `guard.ts` builds the options, on all 63 frozen texts:
| Frozen text | BEFORE | AFTER flags off | AFTER flags on |
|---|---|---|---|
| ELEC-S2 step 1 ("...tủ điện hay do máy giặt...") | decline `oos:may giat` | decline | **ok** |
| PLMB-S2 step 1 ("...do máy bơm của tòa nhà...") | decline `oos:may bom` | decline | decline |
| PLMB-S4 step 3 ("...bình nóng lạnh đặt ở ban công...") | decline `oos:binh nong lanh` | decline | decline |
| PLMB-S4 step 2 voice transcript (same appliance noun) | not presented to the guard | not presented | not presented |

Single-change controls: removing only "do máy giặt" gives ok; "máy bơm" to "máy bơm nước" gives ok; true out-of-scope controls (fix a washing machine, fridge, wifi) still decline. Handler level: ELEC-S2 and PLMB-S2 end with `session.status = unsupported` and zero provider calls in both snapshots (`results/repro/*-matrix.json`).

**Corrections to the package.**
1. "Electrical, plumbing (any)" is too broad. Electrical declines only when `KAEL_PLAYBOOK_ELECTRICAL_ENABLED` is off for that actor: with all six flags on, ELEC-S2 passes the guard (the flagged path returns `ok` at line 553). Plumbing declines in both flag states.
2. The footprint is wider than the three frozen cases. Derived probes (not frozen, not scenarios): a cleaning request that lists the fridge and induction hob, a cleaning request that mentions the washing-machine area, a handyman shelf for a wifi modem, and an air-conditioning request that mentions a washing machine nearby are all declined. A request that only mentions a TV as a location word is not.
3. "Unrecoverable" is overstated; the Case is terminal, and whether the client offers a fresh Case is T3/unverified. And FINAL_VERDICT's "the false closure then blocks the real emergency" is overstated: in AFTER the next hazard message on the closed Case is answered inside the 409 body with the right number and a structured `emergency` field (PLMB-S4 step 4: "call 115", independent re-run `results/handler-after.json`). What the closure blocks is the normal Case turn, not the guidance.
4. Whether a water-heater leak is in the plumbing scope is a product question the code answers inconsistently (the legacy keyword gate declines it; the flagged policy has a dedicated water-heater-leak rule). Not claimed as a defect here.

## 3. DX-02 - missed Electrical emergency: VERIFIED

**Frozen input.** ELEC-S4 step 4, transcript: "Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt sau cánh tủ." delivered as a reviewed voice transcript beside the typed "Mình gửi thêm giọng nói."

**Reproduction.** `resolveReportedEmergencyGuidance` returns `null` for the transcript, alone and with the typed part (`results/dx02-classifier-probes.json`). A `matchAll` wrapper records **zero** raw cue matches, so no later stage ever ran (`results/dx02-trace.json`). At handler level AFTER answers with the price-lookup text "Kael đã tìm giá cho vấn đề này cách đây không lâu..." and no number (`results/dx03-persisted-after.json`, ELEC-S4 flags off).

**Mechanism, proven by single-change edits** (classifier route after one edit):
| Edit | Route |
|---|---|
| "sau cánh tủ" to "từ tủ điện" | electrical_water |
| insert "điện" after "tia lửa" | electrical_water |
| "tia ... xẹt" to "lửa" | fire |
| add a smoke phrase | fire |
| each clause alone | null |

`emergency-guidance.ts:153` accepts a spark near a fixture only as `tia lua` plus at most two words plus one of `tu|o|ngay|tai|phat ra tu|bat ra tu` plus a wired fixture; "sau" and "cánh tủ" fit neither. Line 145 lists fixed phrases ("tia lửa điện", "phát tia lửa", "tóe lửa", ...), none of which is in the text. Line 99 needs "có/thấy lửa" with the two words adjacent, so "thấy tia lửa" does not match. The classifier contains **no** burning-smell cue (`grep -c khet` returns 0). The package called the exact cue "a hypothesis"; it is now verified.

**New fact the package missed.** The flagged electrical scanner (`electrical-intake-policy.ts`, `scanIntakeSafetySignals`) classifies the same transcript as `smoke_or_burning`, `sparking`, `distribution_board` and its advice names 112, 114, 115. With playbook flags on, AFTER delivers it (independent handler run: ELEC-S4 step 4, flags on, text carries 112/114/115). So DX-02 exists only while the electrical flag is off, and the repository holds two hand-written cue sets with different coverage.

**Limit.** One frozen agent-authored sentence. It says nothing about the real miss rate. A Vietnamese paraphrase I wrote of the HVAC-S3 hazard ("...khói đen bốc ra dày đặc từ dàn lạnh") is also missed with flags off, in a Case opened through the real create route (`results/dx03-language-after.json`); that is one more data point that 20 of 21 overstates generalisation, nothing more.

## 4. DX-03 - playbook flags weaken emergency routing: VERIFIED (mechanism); impact INCONCLUSIVE

**Source.** `domains/kael-chat/emergency-turn.ts:110-121`: for the fire and electrical_water routes, `resolveCaseEmergency` returns `null` (the gate steps aside) when `requiresImmediateKaelSafetyPathForTexts` is true. That predicate (`domains/kael-chat/intake-safety.ts:50-64`) is true when the service's playbook flag is on and the flagged path has **any** deterministic advice for the current text **plus every safety signal persisted earlier in the Case**, checked in Vietnamese regardless of the request language. It does not check that the flagged reply carries the route's number. Medical, police and gas are never deferred.

**Independent counts** (`results/handler-*.json`, 21 hazard steps, harness-seeded Cases): BEFORE 0 of 21 flags off, 2 of 21 flags on. AFTER 20 of 21 flags off, **17 of 21 flags on**. Losses: PLMB-S3, HVAC-S3, UPHO-S4/4, C6/1. Gain: ELEC-S4/4. In Cases opened through the real create route (15 hazards): 15 of 15 flags off, 13 of 15 flags on (PLMB-S3, HVAC-S3), so the seeded HVAC history is not a confound.

**Why each step is lost** (`results/dx03-gate-deferral-probes.json`, `results/dx03-persisted-after.json`):
- PLMB-S3: predicate true on `flooding`, `concealed_pipe`; flagged advice is "Giữ mọi người tránh xa khu vực đang có nước và chờ thợ cấp thoát nước đủ chuyên môn kiểm tra." - no number, no electrical-contact warning.
- UPHO-S4/4: **stale signal.** After steps 1-3 the session persisted `bio_contamination`; at step 4 the gate returns a fire route without it and `null` with it. The reply is a price lookup to a message about a smoking cable beside the carpet. This is worse than "advice without a number": nothing answers the new hazard.
- HVAC-S3 (English): predicate true on `burning_smell`; the reply contains neither the gate text nor the flagged advice. Why the advice is missing from the reply was not traced (INCONCLUSIVE for that sub-point).
- C6/1: the single injected write failure now falls on the flagged path (500); the response carries the structured `emergency` field but no number in text. The retry delivers 112/114/115.

**Corrections.** "4 of 21 lose their number" becomes 3 in text plus 1 carried only by the structured field, offset by 1 gain. It is wording- and language-dependent: the same plumbing hazard in English keeps its numbers with flags on (`plumbing-en`), because the flagged scanner does not recognise it and the gate answers.

**Production.** Not determinable here. The repository shows `KAEL_PLAYBOOK_*` default off, per-service canary tooling (`plan55-*`), and one dated **staging** note (2026-07-14) of the electrical flag set; staging is retired. Production was not queried.

## 5. The 36-scenario scorecard

`results/rescore.json`. Fresh runs of the committed harness on both snapshots are identical to the committed results (0 observation-vector differences in matrix and journey, 144 runs). My own assertion code, applied to the raw observations of the 30 conversational scenarios, disagrees with the committed gating verdicts in **0** cases. Five assertions (`evidence_handled`, `no_schedule_stored`, `closed_case_unchanged`, `failure_observable`, `recovery_delivers`) need persisted-table state not present in the raw observations; those verdicts are the harness's.

| Class | Count | Scenarios |
|---|---|---|
| PASS to PASS | 10 | S1 and S2 of cleaning, HVAC, upholstery, handyman; S1 of electrical, plumbing |
| FAIL to FAIL, unchanged | 3 | ELEC-S2, PLMB-S2 (DX-01); ELEC-S4 (DX-02) |
| **FAIL to PASS** | **16** | S3 x6, S4 x4 (cleaning, HVAC, upholstery, handyman), C1 to C6 |
| FAIL to FAIL, one assertion improved | 1 | PLMB-S4 (emergency number now delivered; `http_ok`, `evidence_handled` still fail because DX-01 closed the Case) |
| **FAIL to BLOCKED** | **6** | S5 x6 |
| REGRESSED | 0 | |

The package counts the last three rows as "IMPROVED" (23). That follows the frozen classification rule literally, but it hides three things:
1. **PLMB-S4** is not a PASS and never became one.
2. **The six S5 results are one result.** After normalising the service name, all 15 checkpoints are identical across the six services in each snapshot (J01/J02 only vary the profile id). The J04, J05, J11 improvement is one cross-service finding counted six times. No S5 scenario reached PASS and none can at T0, because J03 is BLOCKED in both snapshots.
3. **C6's PASS is partly vacuous.** `failure_observable` passes because every emergency stop logs a warn-level trace; the single injected write fault is absorbed by the gate's own retry (step 1 returns 200 with 114). The genuine improvement (BEFORE: 500, no guidance, no warn line; AFTER: guidance delivered) is real, but the assertion would pass without the fault. The persistent-failure variant (SUPP-C6b) is the real test.

Per-service AFTER at T0 stands as published (electrical FAIL, plumbing FAIL, the other four BLOCKED, none PASS) and I reproduce it. FINAL_VERDICT's "0 of 21 to 20 of 21" is reproduced exactly (handler driver) and so is 16 of 21 delivered in a 2xx.

Other validity notes: the harness's "active Case" worlds are seeded with HVAC chat turns for every service (`harness/case-world.ts` seed block); Cases opened through the real create route give 15 of 15 flags-off, so the verdict is not a seeding artefact. The model is stubbed to `{}` (except the turn-intent classifier) and the harness sets `KAEL_AUTONOMY_FULL_ENABLED=true`; both remain T0 limits. The two snapshots' test harness differs only by an optional `uniqueTurnIndex` option and a generalised `request` method (`git diff` of `harness/case-world.ts`, `memory-db.ts`), neither used by the diagnostic.

## 6. H5 - 63 rows

**Reproduction** (`results/h5-verify.json`, `results/h5-e2e-*.json`). 29 positives, 30 negatives, 4 judgement rows. Classifier: 11 of 29 exact, 18 false negatives, 0 wrong route, 1 false positive of 30 (H5-040), 4 of 4 judgement rows missed. Through the real Case-turn handler: AFTER 11 of 29, 1 of 30, 0 of 4, 63 of 63 returned 2xx, 0 disagreements with the classifier; BEFORE 0 of 29, 0 of 30, 0 of 4. The 11/29 is kept as **reproduction evidence** on a set that is no longer sealed; no claim about real-world reliability follows.

**Distinguishing the two kinds of failure.**
- **22 missed detections** (18 clear + 4 judgement): a `matchAll` wrapper over the unmodified classifier records **zero raw cue matches for all 22**. They fail at cue matching; no later stage saw them.
- **1 false alarm (H5-040):** a cue **did** match ("gas ro") and was affirmed. It fails because the benign-context list `PREVENTION_PHRASES` contains "báo rò gas" but not "báo gas rò"; a single reorder silences it. That is an exclusion-list gap, not a cue-matching failure.

**Corrections to Report C / FINAL_VERDICT section 3.**
1. "All 18 false negatives, the one false alarm and the 4 missed judgement rows fail at the same stage: cue matching" is wrong for the false alarm (above). The "earliest stage" tally of 23 becomes 22 plus 1.
2. **H5-019 needs two independent fixes**, not one. Removing "trong" alone: still null. "ướt sũng" to "ngâm nước" alone: still null. Both: electrical_water. The package's round-2 "span" probe changed both at once and was read as proving the span limit alone. H5-019 joins H5-013 as LC-SPAN+LC-SYN.
3. **H5-002 has two independent sufficient fixes** ("cháy dữ dội" to "cháy lớn", or "khói đang vào" to "khói bay vào", each alone flips to fire). The report names only the first.
4. **H5-005**: the committed probe both reordered and added "lên"; a pure reorder ("bốc lửa" to "lửa bốc") is sufficient. Conclusion unchanged.
5. Four of the committed round-1 edits were compound (H5-001, 013, 014, 028, acknowledged) and H5-019 round 2 was compound (not acknowledged). My single-change set: 10 rows isolated by one edit (001, 002, 005, 011, 014, 015, 018, 024, 028, 040), 2 rows needing two edits (013, 019), 7 rows verified by absence only (009, 016, 017, 020, 022, 026, 029), plus the 4 judgement rows. The package's "11 single-change plus H5-013" becomes 10 plus two.
6. "A wrong tone mark costs 40 %" is a misreading of its own perturbation: it rotates **every** tone mark in the text. Re-derived: 91 of 154 kept, 1 different route, 62 lost (40.3 %). One wrong mark was not measured. The single-letter figures (about 30 %) use seeded random edits that I did not re-derive.

Confirmed unchanged: 267 of 267 development rows route as labelled (154 positives); no-diacritics 142 of 154; every one of the 22 misses has an empty trace; no row fails because of normalisation, segmentation, negation, temporal context or routing; the classifier reads only text and an optional service type, so memory, RAG or more corpus rows cannot change it without a new stage.

Corrected sub-mechanism counts for the 19 clear failing rows: LC-SPAN 3 (001, 018, 024), LC-SPAN+LC-SYN 2 (013, 019), LC-SYN 5 (002, 011, 014, 028, 029), LC-ORDER 1 plus 1 negative-side (005; 040), LC-MORPH 1 (015), LC-CLASS 6 (009, 016, 017, 020, 022, 026). Types: 013 and 019 are AND (both fixes needed); 002 is OR (either fix suffices).

## 7. Shared root cause between H5 and the six-service defects

| Defect | Same cause as H5? | Evidence |
|---|---|---|
| DX-02 | **Yes** | Same function, zero raw cue matches, single-change edits flip it (section 3). The same hand-written-cue design, so the same class: lexical coverage. |
| DX-01 | No | Different file (`boundary-guard.ts`), opposite error (false positive), a substring catalogue. It shares only the style "decide from a word list with no context". An edit to `emergency-guidance.ts` cannot move it. |
| DX-03 | No | An ordering and predicate rule in `emergency-turn.ts` and `intake-safety.ts`, not classification. It interacts with DX-02: the flagged scanner covers a case the gate misses. |
| H5-040 false alarm | Same class, different stage | Exclusion list, not cue list. |

Fixing H5-style coverage would repair DX-02 only. The evidence supports "same design weakness", not "one root cause".

## 8. S5 checkpoints that need PostgreSQL, RLS or real transaction behaviour

Fresh journey runs (`results/repro/*-journey.json`): BEFORE J04, J05, J11 FAIL; AFTER all PASS except J03, J14, J15 BLOCKED; J13 INVENTORY. Facts that bound what T1 can prove: Edge `db(ctx)` is the **service-role** client in production (`platform/auth.ts:107` builds it from the secret key), so RLS does not stand behind any Edge write; `kael_chat_sessions` writes are revoked from `authenticated` (`20260520130514_kael_chat_sessions.sql:87-91`); route tables list `admin` as an allowed role on the Case and accept/decline routes in both snapshots (`http/routes/kael-chat-session-routes.ts:29`, `http/routes/job.ts:228,231`) and KAWA_01 refuses at the domain layer instead; there is **no generic SQL job-status transition guard** (no trigger or function enforces the TypeScript table).

| Checkpoint | T0 result | Needs PostgreSQL / RLS / real transaction? | What T1 must prove |
|---|---|---|---|
| J01 intake accepted | PASS | Not for the verdict | Optional: `kael_chat_sessions` status check constraint, `client_request_id` handling |
| J02 profile resolved | PASS | No | none |
| **J03 no offer before quote-ready** | BLOCKED | **Yes, required** | Readiness is decided inside `confirm_kael_chat_durable_authorized_v6` to `..._atomic_v4` to `v3/v2` (`20260905162000_confirmation_matching_intent.sql:3-197`): `FOR UPDATE` session lock, ownership, `profiles.role = 'customer'`, receipts, idempotency, trace finalisation (errcode 55000). Run the refusal for a non-quote-ready session and for a replay |
| J04 customer-only intake decision | PASS (BEFORE FAIL) | Edge guard is T0-complete; RLS **cannot** add a barrier (service role) | T2: that a real admin JWT resolves to `role = admin` through `auth.ts:115-131`. T0 injects the role |
| J05 customer-only evidence | PASS (BEFORE FAIL) | same | same |
| J06 legal lifecycle path | PASS | TypeScript table only | Enumerate every SQL path that updates `jobs.status` and check each carries a from-status guard consistent with the table (no global trigger exists) |
| J07 illegal refused | PASS | same | same, negative cases per RPC |
| J08 customer gates hold | PASS | Partly | SQL customer-only guard (`p_actor_role` distinct from `customer` raises 42501) and the matching-intent RPCs |
| J09 scope-change gate | PASS | Atomicity | `20260516143403_atomic_rpc_functions.sql` single-transaction transitions with optimistic concurrency |
| J10 cancel and rematch | PASS | Atomicity | cancellation and re-broadcast RPCs |
| **J11 worker-only accept/decline** | PASS (BEFORE FAIL) | **Yes for atomicity** | Edge refusal is T0-complete. `accept_priced_broadcast_durable_atomic` (`20260823110000_durable_confirmation_matching.sql:791`) has no role check but rejects an id with no `worker_profiles` row as `WORKER_NOT_ELIGIBLE`; prove an admin id writes nothing, and that two workers accepting concurrently yield one winner (`FOR UPDATE`) |
| J12 payment skip edge | PASS | TypeScript only | confirm no SQL path moves `confirmed_by_customer` to `reviewed` |
| J13 stage inventory | INVENTORY | No | none |
| **J14 payment rail and callback** | BLOCKED | **Yes, T1 and T2** | ledger, verified callback, cash confirmation |
| **J15 atomicity, RLS, concurrency** | BLOCKED | **Yes, required** | `unique (session_id, turn_index)` (`20260520130514_kael_chat_sessions.sql:53`), RLS read policies per actor, lock behaviour |

Correction: BEFORE J11 "accepted" means the Edge did not refuse before calling the RPC; at T1 the RPC's own eligibility check would likely have rejected an admin id. Not proven.
Incidental, outside the audit items: admin `turn` and `confirm` return 403 `KAEL_PATH_CONTROL_DENIED` in both snapshots; my three other admin payloads were invalid (400) and prove nothing.

## 9. Remediation scope, confirmed defects only (not authorised, not started)

| ID | Defect | Where | Bounded change | Regression pillar (collected) | Done when |
|---|---|---|---|---|---|
| R-1 | DX-01 | `boundary-guard.ts` 98-133, 380-402, 559-577 | Decide an appliance keyword only when it is the object of the requested work; apply the exclusion/context rules on every service; align the legacy gate with the flagged policy; decide the channel rule (typed only today) | frozen ELEC-S2, PLMB-S2, PLMB-S4 step 3 yield a question and `active`; controls (fix a washing machine, fridge, wifi) still decline; cleaning/handyman/HVAC mention probes from section 2 | the three frozen scenarios PASS on re-run |
| R-2 | DX-02 | `emergency-guidance.ts` 145, 153, plus a burning-smell family | Add the missing spark grammar and the hot-panel plus burning-smell family as **development** rows; consider one cue source shared with `electrical-intake-policy.ts` | development-set rows for the frozen transcript and the single-change edits in section 3; **not** sealed H5 rows | ELEC-S4 PASS flags off; H5 untouched |
| R-3 | DX-03 | `emergency-turn.ts` 110-121, `intake-safety.ts` 50-64 | Owner rule first. Candidate: the gate always answers fire and electrical_water; the flagged path may add advice. If deferral stays: current-turn signals only, language of the request, and only when the flagged reply is proven to carry the route's number | re-run the matrix with all six flags on: no hazard step that passes with flags off may fail; UPHO-S4/4, PLMB-S3, HVAC-S3, C6/1 | flags-on result equals flags-off |
| R-4 | evidence debt from this audit | tests | Add the corrections of sections 5 and 6 to the package's reports (the package is committed; editing it is the owner's call) | n/a | owner sign-off |

No migration, RPC, deploy or flag change is needed for R-1 to R-3.

## 10. Owner decisions needed before any implementation

1. **DX-01 policy.** Should one keyword hit still close the Case permanently (migration `20260529090000`)? Should voice transcripts and evidence notes be screened like typed text? Is a water-heater leak in the plumbing scope?
2. **Production flag state.** Read-only audit of which `KAEL_PLAYBOOK_*` flags are set in Production, by the owner (not done here). It decides whether DX-01 (electrical) and DX-02 are live and whether DX-03 is live.
3. **DX-03 rule.** Gate always answers, or defer under what proof?
4. **Classifier strategy.** Whether R-2 stays a development-row patch or moves to one of the options in Report C section 9; who the independent reviewer is and what thresholds apply. H5 must stay untouched.
5. **T1 lane.** Approve the local PostgreSQL replay for J03, J11 atomicity, J15, and say whether J04/J05 get a T2 JWT check.
6. **Restating the package headline.** Whether to correct "23 improved / 13 unchanged" in the committed reports (section 5) and the H5 statements (section 6), or leave the committed package as a frozen record and attach this audit.
7. **Session memory.** Still unwritten; the draft in the audited package predates these corrections.

## 11. What this audit did not do, and what went wrong in it

Not run: T1, T2, T3, mobile suites, `deno check`, any hosted or Production resource, any paid provider, the model-assisted safety layer. The seven-item scope was followed; the two extra probes (created-Case worlds, admin surface) are labelled and change no verdict.

My own errors, kept visible: my first handler driver read the error message from `error.message` instead of the envelope's `error` string, which made closed-Case guidance look absent; I caught it by cross-checking against the committed harness and fixed the driver before using any number. My first admin-surface payloads were invalid. Scratch worktrees `C:/ns-diag/before` and `C:/ns-diag/after` gained untracked audit test files under `apps/api/src/__tests__/kael-edge-runtime/audit/`; no tracked file in either changed.

## 12. Reproduce

Needs the two worktrees at `C:/ns-diag/before` and `C:/ns-diag/after` (installed offline). From `scripts/`:
```
node --experimental-transform-types dx02-classifier-probes.mjs
node --experimental-transform-types dx02-trace.mjs
node --experimental-transform-types dx01-boundary-probes.mjs
node --experimental-transform-types dx03-gate-deferral-probes.mjs
node --experimental-transform-types h5-verify.mjs
node --experimental-transform-types dev-set-check.mjs
node run-vitest.mjs <before|after> <worktree test path> <label> KEY=VALUE ...   # worktree/*.test.ts
node rescore.mjs
```
`results/` holds every output; `logs/` holds the raw runs and `commands.jsonl`.

# Kael Playbook Eval — electrical BASELINE (no playbook injected)

Document type: playbook eval report (consolidated)
Run mode: LIVE (staging intake-diagnosis, real providers), 2026-07-14
Corpus: docs/playbooks/eval/electrical-cases.json
Coverage: **20/24 cases** live. 4 cases (el_21–el_24) deferred — hit the per-user Kael-chat cap (5/min + **20/hour**); run them in the next hour window to complete.
Windows: el_01–el_05 (first burst) + el_06–el_20 (paced 16s to beat the 5/min cap, 0 errored).

## Headline

- **Overall pass rate: 8/20 (40%)** — but see the methodology caveat: only `scope_signal` is cleanly measurable in this single-turn harness.
- **Turn-1 routing (`scope_signal`): 14/20 = 70%** — this is the trustworthy baseline number.
- **`safety_signals` recall: 0/4**, **`problem_slug`: 0/…** — NOT trustworthy here (see caveat); Kael is multi-turn and gathers info before emitting these.

## Methodology caveat (important — read before trusting slug/safety)

The harness sends ONE turn (the customer's opening message) and reads the response. But the real Kael flow is **multi-turn**: on turn 1 it typically asks a focused clarification or requests photo evidence, and only produces the estimate (`problem_category`) + populates `diagnosis_scope.facts.safety_signals` on a LATER turn once the customer answers. Evidence: **every one of the 20 cases returned `observed problem_slug = "-"` (no estimate on turn 1).**

Consequence:
- `scope_signal` (the routing/decline decision, made on turn 1) IS measured fairly → **70% is a real baseline**.
- `problem_slug` and `safety_signals` are NOT measured fairly (they need a turn-2 answer). Their 0% here is a harness limitation, not a proven Kael-quality number. **Fix the harness to be multi-turn before comparing an "after" delta on these fields.**

## Real, trustworthy baseline gaps (scope_signal errors — 6/20)

These are genuine turn-1 routing mistakes the playbook is designed to fix:

| case | input (paraphrase) | expected | observed | gap |
|---|---|---|---|---|
| el_04 | cả tầng chung cư đều cúp điện | out_of_scope (BQL/building) | in_scope | did not recognize building-wide outage as out-of-scope |
| el_12 | lắp bình nóng lạnh mới | in_scope (electrical install) | **out_of_scope** | wrongly declined a valid electrical install |
| el_15 | sờ vỏ tủ lạnh thấy tê (rò điện) | in_scope (other_electrical) | **out_of_scope** | wrongly declined a valid leakage case |
| el_18 | bình nóng lạnh rò nước | service_mismatch → plumbing | out_of_scope | declined instead of routing to plumbing |
| el_19 | khoan tường treo TV | service_mismatch → handyman | in_scope | treated a mounting job as electrical |
| el_20 | lắp trạm sạc ô tô điện | out_of_scope | in_scope | did not decline an EV-charger request |

Correct on routing (14/20): all in-scope electrical faults stayed in_scope; el_17 (máy lạnh) correctly → service_mismatch.

## Per-case (20 live)

| id | diff | overall | expected slug/scope | observed slug/scope | needs_clar e/o | safety miss |
|---|---|---|---|---|---|---|
| el_01 | medium | FAIL | breaker_trip / in_scope | - / in_scope | false/true | fixed_wiring,protective_device |
| el_02 | easy | FAIL | breaker_trip / in_scope | - / in_scope | false/true | protective_device |
| el_03 | easy | PASS | power_outage_whole_unit / in_scope | - / in_scope | true/true |  |
| el_04 | easy | FAIL | power_outage_whole_unit / out_of_scope | - / in_scope | false/true |  |
| el_05 | easy | PASS | power_outage_one_room / in_scope | - / in_scope | true/true |  |
| el_06 | medium | PASS | power_outage_one_room / in_scope | - / in_scope | true/true |  |
| el_07 | easy | FAIL | flickering_light / in_scope | - / in_scope | false/true |  |
| el_08 | medium | FAIL | flickering_light / in_scope | - / in_scope | false/true |  |
| el_09 | easy | FAIL | outlet_or_switch_broken / in_scope | - / in_scope | false/true |  |
| el_10 | medium | PASS | outlet_or_switch_broken / in_scope | - / in_scope | true/true |  |
| el_11 | easy | PASS | install_device / in_scope | - / in_scope | true/true |  |
| el_12 | medium | FAIL | install_device / in_scope | - / out_of_scope | true/false | new_circuit,distribution_board |
| el_13 | easy | FAIL | electrical-general / in_scope | - / in_scope | false/true |  |
| el_14 | hard | PASS | other_electrical / in_scope | - / in_scope | true/true |  |
| el_15 | medium | FAIL | other_electrical / in_scope | - / out_of_scope | false/false | exposed_live_parts |
| el_16 | easy | PASS | other_electrical / in_scope | - / in_scope | true/true |  |
| el_17 | easy | PASS | - / service_mismatch | - / service_mismatch | false/false |  |
| el_18 | medium | FAIL | - / service_mismatch | - / out_of_scope | false/false |  |
| el_19 | easy | FAIL | - / service_mismatch | - / in_scope | false/true |  |
| el_20 | easy | FAIL | - / out_of_scope | - / in_scope | false/true |  |
| el_21 | — | PENDING | — | — | — | 20/hour cap — next window |
| el_22 | — | PENDING | — | — | — | 20/hour cap — next window |
| el_23 | — | PENDING | — | — | — | 20/hour cap — next window |
| el_24 | — | PENDING | — | — | — | 20/hour cap — next window |

## Verification / honesty

- Real staging run, real providers, real auth (throwaway staging user). Auth via GoTrue password-grant (no supabase-js/WebSocket dependency).
- 0 fabricated results. The 4 PENDING rows are honestly not-yet-run (rate cap), not failures.
- Cost: not surfaced by the current runner (the runner does not read per-stage cost from the chat response); treat as "small, real provider spend for ~20 estimate/clarify turns."

## Update — multi-turn run finding (2026-07-14, later)

Ran a paced multi-turn version (answer Kael's turn-1 clarification with the case `detail`, up to 3 turns). Two findings:

1. **Estimates are evidence-gated.** Across every case that reached ≥2 turns, `problem_slug` stayed null and Kael kept asking to clarify / request photo evidence — a text-only conversation does not reach an estimate within 3 turns. So `problem_slug` and `safety_signals` are **NOT measurable through the text API** without supplying real photo evidence (or reverse-engineering an evidence-skip). This is a product-behavior fact, not a Kael-quality gap.
2. **Runner token-expiry bug (fixed).** The user JWT expires (~1h); a long paced run outlived it and the tail failed with HTTP 401. Fixed: the runner now re-signs-in on a mid-run 401.

**Conclusion — the honest, measurable metric is `scope_signal` (turn-1 routing), ~70–73% consistent across runs.** The playbook's routing/disambiguation section directly targets the 6 routing gaps above, so the before/after should be measured on `scope_signal`. Measuring slug/safety needs a future harness that uploads test images (or a provider-level unit test with mocked AI).

## Next steps

1. **Fix the harness to multi-turn** (answer Kael's turn-1 clarification, then read the estimate) so `problem_slug` and `safety_signals` become measurable — or restrict the scored metric to `scope_signal` for the before/after comparison. Without this, only the 70% routing number is a fair baseline.
2. Run el_21–el_24 next hour to reach 24/24.
3. Wire the compressed playbook (Appendix A) into `buildIntakeDiagnosisMessages` behind `KAEL_PLAYBOOK_ELECTRICAL_ENABLED`, deploy to staging, re-run with `--label after`.
4. Report the delta — expected to move the six routing errors above.

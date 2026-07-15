# Kael Playbook Eval — electrical (baseline-w2)

Document type: playbook eval report
Run mode: LIVE (staging intake-diagnosis)
Corpus: C:/Users/Phan Manh Tu/Desktop/home-services/.claude/worktrees/exciting-jepsen-7bec6e/docs/playbooks/eval/electrical-cases.json
Cases: 15 (errored: 0)

## Metrics

| Metric | Value |
| --- | ---: |
| overall pass rate | 40% (6/15) |
| scope_signal | 66.7% (10/15) |
| needs_clarification | 53.3% (8/15) |
| problem_slug | 0% (0/5) |
| safety_signals (recall) | 0% (0/2) |

By difficulty — easy 3/8, medium 2/6, hard 1/1

## Per-case

| id | diff | pass | expected slug/scope | observed slug/scope | needs_clar e/o | safety miss |
| --- | --- | --- | --- | --- | --- | --- |
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

## Notes

- `suggested_service` is NOT gated: the serialized API response does not expose it, so it cannot be scored here; the mismatch decline is scored via `scope_signal` only.
- `problem_slug` is gated only for in_scope cases that expect no clarification first; when the flow legitimately asks for clarification/evidence, the slug is not yet produced and is not penalized.
- `safety_signals` scoring is recall (expected ⊆ observed); extra grounded signals do not fail a case.
- LIVE run: numbers reflect the staging intake-diagnosis path with NO playbook injected (baseline) unless the label says otherwise.


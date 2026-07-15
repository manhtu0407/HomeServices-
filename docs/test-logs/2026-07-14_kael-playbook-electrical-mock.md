# Kael Playbook Eval — electrical (mock)

Document type: playbook eval report
Run mode: MOCK (dry-run — scoring logic only, NOT a live baseline)
Corpus: C:/Users/Phan Manh Tu/Desktop/home-services/.claude/worktrees/exciting-jepsen-7bec6e/docs/playbooks/eval/electrical-cases.json
Cases: 24 (errored: 0)

## Metrics

| Metric | Value |
| --- | ---: |
| overall pass rate | 87.5% (21/24) |
| scope_signal | 100% (24/24) |
| needs_clarification | 91.7% (22/24) |
| problem_slug | 90% (9/10) |
| safety_signals (recall) | 85.7% (6/7) |

By difficulty — easy 14/14, medium 5/8, hard 2/2

## Per-case

| id | diff | pass | expected slug/scope | observed slug/scope | needs_clar e/o | safety miss |
| --- | --- | --- | --- | --- | --- | --- |
| el_01 | medium | PASS | breaker_trip / in_scope | breaker_trip / in_scope | false/false |  |
| el_02 | easy | PASS | breaker_trip / in_scope | breaker_trip / in_scope | false/false |  |
| el_03 | easy | PASS | power_outage_whole_unit / in_scope | - / in_scope | true/true |  |
| el_04 | easy | PASS | power_outage_whole_unit / out_of_scope | - / out_of_scope | false/false |  |
| el_05 | easy | PASS | power_outage_one_room / in_scope | - / in_scope | true/true |  |
| el_06 | medium | FAIL | power_outage_one_room / in_scope | outlet_or_switch_broken / in_scope | true/false |  |
| el_07 | easy | PASS | flickering_light / in_scope | flickering_light / in_scope | false/false |  |
| el_08 | medium | FAIL | flickering_light / in_scope | - / in_scope | false/true |  |
| el_09 | easy | PASS | outlet_or_switch_broken / in_scope | outlet_or_switch_broken / in_scope | false/false |  |
| el_10 | medium | PASS | outlet_or_switch_broken / in_scope | - / in_scope | true/true |  |
| el_11 | easy | PASS | install_device / in_scope | - / in_scope | true/true |  |
| el_12 | medium | PASS | install_device / in_scope | - / in_scope | true/true |  |
| el_13 | easy | PASS | electrical-general / in_scope | electrical-general / in_scope | false/false |  |
| el_14 | hard | PASS | other_electrical / in_scope | - / in_scope | true/true |  |
| el_15 | medium | PASS | other_electrical / in_scope | other_electrical / in_scope | false/false |  |
| el_16 | easy | PASS | other_electrical / in_scope | - / in_scope | true/true |  |
| el_17 | easy | PASS | - / service_mismatch | - / service_mismatch | false/false |  |
| el_18 | medium | PASS | - / service_mismatch | - / service_mismatch | false/false |  |
| el_19 | easy | PASS | - / service_mismatch | - / service_mismatch | false/false |  |
| el_20 | easy | PASS | - / out_of_scope | - / out_of_scope | false/false |  |
| el_21 | easy | PASS | - / out_of_scope | - / out_of_scope | false/false |  |
| el_22 | easy | PASS | outlet_or_switch_broken / in_scope | outlet_or_switch_broken / in_scope | false/false |  |
| el_23 | hard | PASS | other_electrical / in_scope | other_electrical / in_scope | false/false |  |
| el_24 | medium | FAIL | breaker_trip / in_scope | breaker_trip / in_scope | false/false | water_near_power |

## Notes

- `suggested_service` is NOT gated: the serialized API response does not expose it, so it cannot be scored here; the mismatch decline is scored via `scope_signal` only.
- `problem_slug` is gated only for in_scope cases that expect no clarification first; when the flow legitimately asks for clarification/evidence, the slug is not yet produced and is not penalized.
- `safety_signals` scoring is recall (expected ⊆ observed); extra grounded signals do not fail a case.
- MOCK run: proves the runner + scoring wiring only. Replace with a live run for a real baseline.


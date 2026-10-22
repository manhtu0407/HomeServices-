### Table 1. The 36 frozen scenarios, accepted baseline (main 42daced1) against the candidate

| # | Scenario | Service | Class | Flags off: baseline | Flags off: candidate | Flags off: change | Flags on: baseline | Flags on: candidate | Flags on: change |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ELEC-S1 | electrical | S1 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 2 | ELEC-S2 | electrical | S2 | FAIL | PASS | FAIL to PASS (main/asks_clarifying_question: false -> true) | FAIL | PASS | FAIL to PASS (main/asks_clarifying_question: false -> true) |
| 3 | ELEC-S3 | electrical | S3 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 4 | ELEC-S4 | electrical | S4 | FAIL | PASS | FAIL to PASS (main/emergency_escalated_acceptable: false -> true) | PASS | PASS | PASS to PASS unchanged |
| 5 | PLMB-S1 | plumbing | S1 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 6 | PLMB-S2 | plumbing | S2 | FAIL | PASS | FAIL to PASS (main/asks_clarifying_question: false -> true) | FAIL | PASS | FAIL to PASS (main/asks_clarifying_question: false -> true) |
| 7 | PLMB-S3 | plumbing | S3 | PASS | PASS | PASS to PASS unchanged | FAIL | PASS | FAIL to PASS (main/emergency_escalated_acceptable: false -> true) |
| 8 | PLMB-S4 | plumbing | S4 | FAIL | PASS | FAIL to PASS (main/http_ok: false -> true; main/evidence_handled: false -> true) | FAIL | PASS | FAIL to PASS (main/http_ok: false -> true; main/evidence_handled: false -> true) |
| 9 | CLEN-S1 | cleaning | S1 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 10 | CLEN-S2 | cleaning | S2 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 11 | CLEN-S3 | cleaning | S3 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 12 | CLEN-S4 | cleaning | S4 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 13 | HVAC-S1 | hvac | S1 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 14 | HVAC-S2 | hvac | S2 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 15 | HVAC-S3 | hvac | S3 | PASS | PASS | PASS to PASS unchanged | FAIL | PASS | FAIL to PASS (main/emergency_escalated_acceptable: false -> true) |
| 16 | HVAC-S4 | hvac | S4 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 17 | UPHO-S1 | upholstery | S1 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 18 | UPHO-S2 | upholstery | S2 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 19 | UPHO-S3 | upholstery | S3 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 20 | UPHO-S4 | upholstery | S4 | PASS | PASS | PASS to PASS unchanged | FAIL | PASS | FAIL to PASS (main/emergency_escalated_acceptable: false -> true) |
| 21 | HAND-S1 | handyman | S1 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 22 | HAND-S2 | handyman | S2 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 23 | HAND-S3 | handyman | S3 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 24 | HAND-S4 | handyman | S4 | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 25 | ELEC-S5 | electrical | S5 | BLOCKED | BLOCKED | BLOCKED to BLOCKED unchanged | BLOCKED | BLOCKED | unchanged |
| 26 | PLMB-S5 | plumbing | S5 | BLOCKED | BLOCKED | BLOCKED to BLOCKED unchanged | BLOCKED | BLOCKED | unchanged |
| 27 | CLEN-S5 | cleaning | S5 | BLOCKED | BLOCKED | BLOCKED to BLOCKED unchanged | BLOCKED | BLOCKED | unchanged |
| 28 | HVAC-S5 | hvac | S5 | BLOCKED | BLOCKED | BLOCKED to BLOCKED unchanged | BLOCKED | BLOCKED | unchanged |
| 29 | UPHO-S5 | upholstery | S5 | BLOCKED | BLOCKED | BLOCKED to BLOCKED unchanged | BLOCKED | BLOCKED | unchanged |
| 30 | HAND-S5 | handyman | S5 | BLOCKED | BLOCKED | BLOCKED to BLOCKED unchanged | BLOCKED | BLOCKED | unchanged |
| 31 | C1 | plumbing | C | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 32 | C2 | electrical | C | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 33 | C3 | plumbing | C | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 34 | C4 | plumbing | C | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 35 | C5 | plumbing | C | PASS | PASS | PASS to PASS unchanged | PASS | PASS | PASS to PASS unchanged |
| 36 | C6 | electrical | C | PASS | PASS | PASS to PASS unchanged | FAIL | PASS | FAIL to PASS (main/failure_observable: false -> true) |

Flags off, 30 conversational scenarios: 26 x PASS->PASS unchanged, 4 x FAIL->PASS. S5 journeys: 6 x BLOCKED->BLOCKED unchanged.
Flags on, 30 conversational scenarios: 23 x PASS->PASS unchanged, 7 x FAIL->PASS. S5 journeys (pre-fix main against the candidate): 6 x BLOCKED->BLOCKED unchanged.

### Table 2. S5 journey checkpoints on the candidate (identical for all six services)

| Checkpoint | Name | Result | Needs |
|---|---|---|---|
| J01 | basic_intake_accepted | PASS | none at T0 |
| J02 | service_profile_resolved | PASS | none at T0 |
| J03 | no_offer_before_quote_ready | BLOCKED | PostgreSQL / real transaction (T1 or higher) |
| J04 | offer_decision_is_customer_only | PASS | none at T0 |
| J05 | evidence_decision_is_customer_only | PASS | none at T0 |
| J06 | job_lifecycle_legal_path | PASS | none at T0 |
| J07 | job_lifecycle_illegal_refused | PASS | none at T0 |
| J08 | customer_gates_hold | PASS | none at T0 |
| J09 | scope_change_gate | PASS | none at T0 |
| J10 | cancel_and_rematch | PASS | none at T0 |
| J11 | worker_accept_is_worker_only | PASS | none at T0 |
| J12 | payment_skip_edge | PASS | none at T0 |
| J13 | worker_ui_stage_projection | INVENTORY | none (inventory) |
| J14 | payment_rail_and_callback | BLOCKED | PostgreSQL / real transaction (T1 or higher) |
| J15 | atomicity_rls_concurrency | BLOCKED | PostgreSQL / real transaction (T1 or higher) |

Distinct checkpoint vectors across the 12 journey runs: 1.

### Table 3. Hazard checkpoints, route / visible guidance / metadata kept apart

| Configuration | Checkpoints | Baseline: route correct | Baseline: visible exact | Baseline: metadata present | Candidate: route correct | Candidate: visible exact | Candidate: metadata present |
|---|---|---|---|---|---|---|---|
| frozen/flags-off | 21 | 20 | 20 | 20 | 21 | 21 | 21 |
| created/flags-off | 15 | 15 | 15 | 15 | 15 | 15 | 15 |
| frozen/flags-on | 21 | 15 | 17 | 15 | 21 | 21 | 21 |
| created/flags-on | 15 | 10 | 13 | 10 | 15 | 15 | 15 |

Checkpoints that changed between the accepted baseline and the candidate:

| Mode | Flags | Checkpoint | Change |
|---|---|---|---|
| frozen | off | ELEC-S4/main/4 | route_correct: false -> true; visible_acceptable: false -> true; visible_exact: false -> true; metadata_present: false -> true |
| frozen | on | ELEC-S3/main/1 | route_correct: false -> true; metadata_present: false -> true |
| frozen | on | ELEC-S4/main/4 | route_correct: false -> true; metadata_present: false -> true |
| frozen | on | PLMB-S3/main/1 | route_correct: false -> true; visible_acceptable: false -> true; visible_exact: false -> true; metadata_present: false -> true |
| frozen | on | HVAC-S3/main/1 | route_correct: false -> true; visible_acceptable: false -> true; visible_exact: false -> true; metadata_present: false -> true |
| frozen | on | UPHO-S4/main/4 | route_correct: false -> true; visible_acceptable: false -> true; visible_exact: false -> true; metadata_present: false -> true |
| frozen | on | C6/main/1 | visible_acceptable: false -> true; visible_exact: false -> true |
| frozen | on | C6/main/2 | route_correct: false -> true; metadata_present: false -> true |
| created | on | ELEC-S3/main/1 | route_correct: false -> true; metadata_present: false -> true |
| created | on | PLMB-S3/main/1 | route_correct: false -> true; visible_acceptable: false -> true; visible_exact: false -> true; metadata_present: false -> true |
| created | on | HVAC-S3/main/1 | route_correct: false -> true; visible_acceptable: false -> true; visible_exact: false -> true; metadata_present: false -> true |
| created | on | C6/main/1 | route_correct: false -> true; metadata_present: false -> true |
| created | on | C6/main/2 | route_correct: false -> true; metadata_present: false -> true |

Checkpoints that got worse (any dimension true to false): 0. Candidate checkpoints where flags on delivers fewer numbers or a weaker dimension than flags off: 0.

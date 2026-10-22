| checkpoint | electrical | plumbing | cleaning | hvac | upholstery | handyman |
|---|---|---|---|---|---|---|
| J01 basic_intake_accepted | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) |
| J02 service_profile_resolved | PASS (T0) | PASS (T0) | PASS (T0) | PASS (T0) | PASS (T0) | PASS (T0) |
| J03 no_offer_before_quote_ready | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) |
| J04 offer_decision_is_customer_only | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J05 evidence_decision_is_customer_only | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J06 job_lifecycle_legal_path | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J07 job_lifecycle_illegal_refused | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J08 customer_gates_hold | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J09 scope_change_gate | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J10 cancel_and_rematch | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J11 worker_accept_is_worker_only | PASS (T1g) | PASS (T1g) | PASS (T1g) | PASS (T1g) | PASS (T1g) | PASS (T1g) |
| J12 payment_skip_edge | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) | PASS (T0+T1c) |
| J13 worker_ui_stage_projection | INV (T0) | INV (T0) | INV (T0) | INV (T0) | INV (T0) | INV (T0) |
| J14 payment_rail_and_callback | PASS* (T1g) | PASS* (T1g) | PASS* (T1g) | PASS* (T1g) | PASS* (T1g) | PASS* (T1g) |
| J15 atomicity_rls_concurrency | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) | PASS (T1) |
| journey verdict | PASS_WITH_FINDING | PASS_WITH_FINDING | PASS_WITH_FINDING | PASS_WITH_FINDING | PASS_WITH_FINDING | PASS_WITH_FINDING |

T1 = the database decided the cell for that service. T0+T1c = the T0 Edge or state-machine result decides and T1 corroborates (no API role can write Jobs or Cases). T1g = generic service-independent RPC verified at T1 on a subset of services (J11 on a plumbing fixture; J14 order creation on all six, reconciliation on electrical, plumbing and cleaning). PASS* = passes the checks asked for with minor finding F-PAY-2 open.

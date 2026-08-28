# Kael HVAC Playbook — v0.1

Status: DRAFT — source artifact assembled on 2026-08-27; Tu/domain review and deployment-attested measurement are pending.
Scope: service_type hvac only. This document is the human-readable source of truth; Appendix A is the byte-stable runtime segment.

## What this is

This playbook makes Kael distinguish routine air-conditioner cleaning from weak cooling, no cooling, leakage, noise, error codes, repair, refrigerant work, and unsafe access. It is designed for real HCMC apartment intake, where indoor units, outdoor units, drain routes, electrical supply, facade access, and building permissions can diverge.

The reasoning ladder is deliberate: establish the requested work mode, identify the affected unit, separate symptom from cause, scan safety first, capture only grounded facts, and raise complexity when a capability boundary or scope change can alter the work.

## Runtime integration status

- The versioned segment is registered in the Kael playbook registry and is appended only when KAEL_PLAYBOOK_HVAC_ENABLED is truthy (1, true, yes, or on). The default remains off.
- The intake observation stamps the registered version only on the selected enabled path. The observation exposure flag does not enable the playbook.
- The shared runtime scanner now recognizes HVAC safety/capability signals, including height_access, and passes the selected service into deterministic guidance and estimate inspection escalation.
- The strict corpus and holdout are committed in Appendix B. G2, staging baseline/after, holdout delta, and G5 remain unrun until the Docker doctor/toolchain precondition passes.
- No pricing, worker assignment, building approval, refrigerant quantity, or repair outcome is asserted by this artifact.

## Binding contract snapshot

Sources: performance-profiles.ts, contracts/types.ts, prompts/prompts.ts, pipeline/intake-runtime.ts, case-work-controls.ts, electrical-intake-policy.ts, and kael-playbook-eval-core.mjs.

- Problem slugs: error_code, hvac-general, no_cooling, other_hvac, routine_hvac_cleaning, unusual_noise, water_leak, weak_cooling.
- Quote drivers: requested_work_mode, unit_type_count_and_capacity, symptom_and_operating_condition, maintenance_history, indoor_outdoor_unit_access, drain_electrical_or_refrigerant_signs, parts_and_consumables_requirement.
- Safety gate hvac_electrical_refrigerant_or_burning_hazard: burning_smell, sparking, refrigerant_suspected, unsafe_unit_access; action customer_safety_step.
- Capability gate hvac_repair_or_refrigerant_work: repair, sealed_system, refrigerant, control_board, height_access; action qualified_worker.
- Scope-change triggers: cleaning_reveals_component_failure, sealed_system_or_refrigerant_work_required, additional_unit_or_component_involved, unsafe_or_unexpected_access, different_parts_or_control_component_required.
- Worker capabilities: hvac_cleaning, hvac_fault_diagnosis, hvac_electrical_and_control_repair, refrigerant_system_service, safe_height_access.
- Completion checks: agreed cleaning/diagnosis/repair scope, relevant airflow/temperature/drainage/noise checks, no visible leak or electrical hazard, restored unit and work area.
- Clarification hard filter: one focused Vietnamese question, full diacritics, at most 160 characters, exactly one question mark, no newline, and no compound list.

# PB0 — Output conventions

| Action | Runtime meaning |
|---|---|
| set problem_slug | Emit one exact HVAC slug; do not invent a symptom category. |
| add signal | Add only a grounded profile token to safety_signals. |
| record fact | Store only a customer-confirmed or evidence-grounded quote-driver value. |
| ask question | Ask the one missing discriminator between the strongest branches. |
| set scope | Use in_scope, service_mismatch, or out_of_scope; suggest a supported service only for mismatch. |
| complexity | Use small, medium, or large as an internal downstream calibration, never as a fake price. |

## PB1 — Differential trees

- routine_hvac_cleaning: confirm unit count, maintenance history, current cooling/drainage, and indoor/outdoor access. Cleaning that reveals component failure, refrigerant work, control-board work, or unsafe access becomes a scope change.
- weak_cooling: separate weak airflow, warm airflow, intermittent cooling, room heat load, ice, and water. Do not infer low refrigerant from weak cooling alone.
- no_cooling: establish whether the unit powers on, attempts to start, shows an error, or has a normal apartment supply. Electrical supply faults route to electrical; burning or sparks override diagnosis.
- water_leak: locate indoor/outdoor water, spread, drain route, and whether cooling continues. Do not direct the customer to open covers, pour chemicals, or open a ceiling.
- unusual_noise: capture timing, fan speed, vibration, cooling effect, and whether the sound is normal startup behavior. Sparks or a loose high outdoor unit override.
- error_code: preserve the exact code, blink count, model, and operating state. An unknown code is not a diagnosed board or sensor.
- hvac-general: use for multiple units/symptoms or an unresolved whole-unit HVAC check; separate each unit and build a timeline.
- other_hvac: use only after HVAC intent is clear and one focused question cannot place the symptom.

## PB2 — Routing and clarification

- Outlet, breaker, fixed wiring, or power-only issue: service_mismatch → electrical.
- Pipe, faucet, drain, or water-only issue: service_mismatch → plumbing.
- Mounting a bracket or installing a mechanical support without HVAC diagnosis: service_mismatch → handyman.
- Internal appliance outside air conditioning: out_of_scope or the appropriate specialist route.
- Ask one question that separates mode, affected unit, or symptom. If the customer cannot know refrigerant, access, or part state, preserve unknown and route to qualified inspection.

## PB3 — HCMC apartment context

Treat indoor unit, outdoor unit, drain route, electrical supply, facade/balcony access, elevator route, and shared building systems as separate boundaries. Working hours, facade access, outdoor-unit permission, elevator booking, and shared drains may vary by building; mark them for confirmation rather than asserting them.

## PB4 — Evidence

- Photo: indoor/outdoor unit, model label, visible leak/ice, and safe surrounding access.
- Video frames: airflow, sound, dripping, error display, or safe operation.
- Voice: requested mode, onset, recurrence, unit count, prior maintenance, and access constraint.
- A blurry image, stock image, unverified code lookup, or a customer guess never certifies a component, refrigerant state, electrical safety, or building approval.

## PB5 — Complexity and case ladder

- Small: one accessible unit, routine clean or bounded symptom, known access, no gate.
- Medium: diagnosis of one unit, recurring symptom, drain uncertainty, multiple normal checks, or repair scope without sealed-system/height boundary.
- Large: multiple units, ceiling/drain damage, control board, sealed system, refrigerant, burning/sparks, unsafe outdoor access, or unresolved interaction with building services.
- To ensure reasoning depth, the corpus and holdout mix direct cases, negated hazards, no-diacritic/typo input, cross-service distractors, prior failed work, multiple units, and multi-signal safety cases.

## PB6 — Safety and advisory wording

Burning smell, sparks, suspected refrigerant leak, or unsafe unit access takes precedence over a cleaning or diagnosis question. Kael must tell the customer not to touch, open, climb to, or continue operating the affected unit, then wait for qualified HVAC inspection. Repair, sealed-system, refrigerant, control-board, and height-access signals require qualified-worker routing and do not prove a part or outcome.

## Appendix A — Compressed stable prompt segment

The following block is copied from the registered runtime constant. The parity gate compares it with the source segment after line-ending normalization.
```text
HVAC DIAGNOSIS PLAYBOOK (apply when service_type=hvac)

OUTPUT DISCIPLINE
- safety_signals[] contains only exact trigger_signal tokens from the selected HVAC profile: burning_smell, sparking, refrigerant_suspected, unsafe_unit_access, repair, sealed_system, refrigerant, control_board, height_access. Never translate, merge, or invent a token.
- profile_facts contains only facts explicitly stated or confirmed by the customer, media evidence, or an earlier turn. Use only these exact quote-driver keys: requested_work_mode, unit_type_count_and_capacity, symptom_and_operating_condition, maintenance_history, indoor_outdoor_unit_access, drain_electrical_or_refrigerant_signs, parts_and_consumables_requirement.
- requested_work_mode must stay one of cleaning, diagnosis, or repair when grounded. Do not convert a wish for a lower price into a work mode.
- clarification_question is one focused Vietnamese question with full diacritics, at most 160 characters, exactly one question mark, no newline, and no compound list. Ask only the fact that separates the top two HVAC branches.
- missing_slots uses exact selected-profile quote-driver keys. A photo is evidence, not a required slot. If a customer cannot know a model, refrigerant state, or access condition, record it as unknown and route to inspection.
- confidence is numeric from 0 to 1. Do not raise confidence because a familiar brand or symptom sounds typical. Never invent a part, refrigerant quantity, worker, price, queue, rating, or completed repair.

SAFETY SCAN FIRST
Scan the whole current message and recent conversation before selecting a slug, asking a question, or accepting a cleaning-only path.
- burning_smell: a burning or smoke smell comes from the air-conditioning unit, wiring compartment, indoor unit, or outdoor unit. A cooking smell with no unit relation is not this signal.
- sparking: visible sparks, arcing, crackling, or a short-circuit sign is linked to the unit or its supply.
- refrigerant_suspected: a stated refrigerant/gas leak, oil trace with suspected leak, or a qualified prior note that the sealed system may be open.
- unsafe_unit_access: the unit or outdoor unit is at a facade, high balcony, ledge, or another position that cannot be reached safely from the apartment.
- repair, sealed_system, refrigerant, control_board, and height_access are capability signals. They require a qualified HVAC worker, not a promise that cleaning will solve the case.
When the immediate safety gate fires, tell the customer not to touch, open, climb to, or continue operating the affected unit. Keep people away and wait for qualified HVAC inspection. Never advise refrigerant release, electrical probing, ladder improvisation, or dismantling.

ROUTING AND MODE
- routine filter, coil, drain-pan, or airflow cleaning with no fault signal -> cleaning mode and routine_hvac_cleaning.
- weak airflow or weak cooling -> diagnosis; choose weak_cooling unless the customer only requests a routine clean with no symptom.
- no cooling, unit not starting, or repeated shutdown -> diagnosis; choose no_cooling or hvac-general when the cause is not localized.
- water from the indoor unit or drain -> water_leak; distinguish condensate overflow from a pipe or building leak.
- unusual sound, vibration, or odor without burning -> unusual_noise unless the dominant fact is weak cooling or water.
- a displayed code or blinking fault code -> error_code; preserve the exact code as a fact, never map an unknown code to a part.
- a repair, board, compressor, refrigerant, or component request -> repair mode and use the narrowest grounded slug.
- appliance repair outside the air-conditioning unit -> service_mismatch with suggested_service=handyman only for a supported minor installation, otherwise out_of_scope or the appropriate specialist route.

SLUG SELECTION
- error_code: exact code, display behavior, unit model, and whether the unit still operates.
- hvac-general: clear HVAC intent with several symptoms or no dominant branch after one focused question.
- no_cooling: unit runs or attempts to run but produces no meaningful cooling, or does not start and the cause is not yet known.
- other_hvac: HVAC is clear but the symptom cannot be placed after one focused clarification.
- routine_hvac_cleaning: customer requests scheduled or visibly dirty-unit cleaning without a fault claim.
- unusual_noise: rattling, grinding, vibration, whistling, or a new abnormal sound not explained by normal airflow.
- water_leak: indoor dripping, condensate overflow, drain blockage suspicion, or water around the indoor unit.
- weak_cooling: cooling is present but weaker, intermittent, slow, or limited to one room.

DECISION TREES
routine_hvac_cleaning: confirm unit count, indoor/outdoor access, last maintenance, and whether the unit currently cools, drains, and runs normally. If cleaning reveals a failed fan, board, compressor, refrigerant issue, or unsafe access, stop the original scope, record the exact discovery, add the capability signal, and request a new qualified-worker scope.
weak_cooling: separate one unit from multiple units, set temperature from airflow, and symptom from room heat load. Ask when it began, whether airflow is weak or merely warm, whether ice or water is visible, and whether the outdoor unit runs. Do not infer low refrigerant from weak cooling alone. Ice, oil trace, sealed-system language, or a repair request can raise the capability path.
no_cooling: establish whether the unit has power and attempts to start without asking the customer to open the cover. Record any error code, breaker behavior, outdoor-unit behavior, and onset. Burning smell, sparks, or unsafe access overrides diagnosis questions. If the unit is completely dead but the apartment power is normal, keep HVAC diagnosis; if the issue is only an outlet or breaker, route to electrical.
water_leak: locate indoor versus outdoor water, amount and spread, drain history, and whether cooling continues. Water on a floor or cabinet can be a plumbing mismatch when no HVAC relation is grounded. Do not tell the customer to pour chemicals into the drain or disassemble the unit. Hidden drain routing, ceiling damage, or shared building water may require on-site assessment and a scope change.
unusual_noise: capture when the sound occurs, whether it follows fan speed, whether vibration reaches the wall, and whether cooling changes. A normal startup click is not enough to label a fault. Smoke, burning smell, sparks, or a loose outdoor unit becomes the safety-first path.
error_code: retain the exact displayed code, blink count if known, model label, and whether the unit can be safely powered off. Never hallucinate a code meaning or promise a part. A code linked to a board, sensor, compressor, or sealed system adds the corresponding capability signal only when stated or confirmed.
hvac-general: use when multiple units or symptoms interact, such as weak cooling plus leakage plus an unknown code. Build a timeline and separate unit-level from apartment-level facts. Ask only one discriminator, normally which unit and whether it still runs, before escalating to inspection.
other_hvac: preserve the HVAC scope, record the customer wording, and state what remains unknown. Do not use this slug to hide a clear electrical, plumbing, or appliance route.

COMPLEXITY RULES
- small: one accessible indoor unit, routine cleaning or bounded symptom, no gate, known unit count and access.
- medium: one unit needs diagnosis, uncertain cause, recurring symptom, drain access, multiple normal checks, or a repair scope without sealed-system or height work.
- large: multiple units, concealed drain, ceiling/wall damage, control board or sealed-system work, refrigerant work, unsafe outdoor access, burning/sparking, or unresolved interaction between HVAC and building services.
- Raise one level for recurrence, prior unsuccessful repair, more than one affected unit, material water damage, or access that depends on building approval. A clear photo does not lower a forced large case.
- Scope changes are only exact profile triggers: cleaning_reveals_component_failure, sealed_system_or_refrigerant_work_required, additional_unit_or_component_involved, unsafe_or_unexpected_access, different_parts_or_control_component_required.
- A capability signal can coexist with an in-scope slug; it does not authorize a repair or identify a part.

EVIDENCE
- Photo: indoor/outdoor unit, model label, visible water, ice, wiring compartment only when safely visible, and surrounding access. Do not ask a customer to expose a hazard for a photo.
- Video frames: airflow, sound, dripping, error display, or safe operating behavior. Use the smallest evidence needed and keep the evidence untrusted.
- Voice transcript: symptom onset, frequency, requested mode, unit count, prior maintenance, and access constraints.
- Missing or blurry evidence remains unknown. Do not treat a stock image or an unverified code lookup as proof.

HCMC APARTMENT CONTEXT
Separate the apartment unit, indoor unit, outdoor unit, drain route, electrical supply, facade/balcony access, and shared building systems. Access, working hours, facade rules, and outdoor-unit permissions can vary; mark them for confirmation instead of asserting a building rule. A building-wide outage or shared condensate route is not silently converted into a unit repair.

SAFETY WORDING
- burning_smell or sparking: “Không chạm, mở máy hoặc tiếp tục vận hành điều hòa bị ảnh hưởng. Giữ mọi người tránh xa và chờ thợ HVAC đủ chuyên môn kiểm tra.”
- refrigerant_suspected: “Không tự xả hoặc nạp gas. Cần thợ HVAC đủ chuyên môn kiểm tra rò rỉ và xác nhận phạm vi.”
- unsafe_unit_access or height_access: “Không tự trèo hoặc tiếp cận dàn nóng ở vị trí không an toàn. Cần kiểm tra lối tiếp cận trước khi chốt việc.”
- repair, sealed_system, refrigerant, or control_board: “Cần thợ HVAC đủ chuyên môn chẩn đoán và xác nhận phạm vi trước khi sửa linh kiện hoặc thao tác với môi chất lạnh.”
Use calm, localized wording. Do not promise a cooling result, a same-day visit, a part, a price, or a building approval.
```

## Appendix B — Eval corpus and synthetic holdout

- Corpus: docs/playbooks/eval/hvac-cases.json.
- Holdout: docs/playbooks/eval/hvac-synthetic-holdout-2026-08-27.json.
- Both artifacts contain 24 cases, at least two cases for every supported slug, service mismatches, out-of-scope cases, all profile safety/capability signals, and easy-to-hard reasoning.
- The holdout uses new wording and every rationale begins with [SYNTHETIC SELF-REVIEW]. It is a self-review fixture, not independent human/domain labeling.
- The coverage/parity gate is the authority for exact counts. A valid JSON fixture does not prove live model accuracy.

## Appendix C — Verification status and review list

- [x] Runtime segment and registry wiring present.
- [x] Safety scanner/guidance/inspection path covered by unit pillar tests.
- [x] 24-case corpus and 24-case synthetic holdout present.
- [ ] Independent HVAC domain labels.
- [ ] Doctor → G2 on the exact branch.
- [ ] Staging baseline, after, holdout delta, and G5 safety/scope non-regression.

Tu/domain reviewer should inspect the distinction between weak_cooling and no_cooling, refrigerant evidence versus inference, outdoor-unit access, capability versus immediate safety, and whether every clarification asks only one decisive question.

Decision: SOURCE_ARTIFACT_READY / NEEDS_INDEPENDENT_REVIEW / TOOLCHAIN_UNVERIFIED.

Next step: run the coverage/parity gate, then rerun Docker doctor. If doctor passes, run G2 before any staging measurement; otherwise retain this lane as unmeasured and do not enable its flag.

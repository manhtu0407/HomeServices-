# Kael Upholstery Care Playbook — v0.1

Status: DRAFT — source artifact assembled on 2026-08-27; Tu/domain review and deployment-attested measurement are pending.
Scope: service_type upholstery only. This document is the human-readable source of truth; Appendix A is the byte-stable runtime segment.

## What this is

This playbook makes Kael distinguish sofa, mattress, curtain, carpet, stain, odor/mold, broad upholstery care, and unresolved fabric-care requests. It treats material, care label, prior treatment, colorfastness, contamination, pests, sensitive occupants, access, and drying as first-class reasoning facts.

The reasoning ladder is: identify the item, establish material and condition, separate stain/odor from source, scan contamination and treatment hazards, confirm movement/drying, and raise complexity when method or outcome cannot be safely promised.

## Runtime integration status

- The versioned segment is registered and injected only when KAEL_PLAYBOOK_UPHOLSTERY_ENABLED is truthy (1, true, yes, or on). The default remains off.
- The selected enabled path can stamp upholstery-playbook-2026-08-27.v1. The observation exposure flag is separate from playbook enablement.
- The shared runtime scanner now recognizes the upholstery safety/capability profile and deterministic guidance blocks unsafe handling or unverified chemical treatment.
- The strict corpus and synthetic holdout are committed below. G2, staging baseline/after, holdout delta, and G5 remain unrun until Docker doctor/toolchain preconditions pass.
- No complete stain removal, color restoration, drying duration, worker, price, or treatment success is invented.

## Binding contract snapshot

Sources: performance-profiles.ts, contracts/types.ts, prompts/prompts.ts, pipeline/intake-runtime.ts, case-work-controls.ts, electrical-intake-policy.ts, and kael-playbook-eval-core.mjs.

- Problem slugs: carpet_cleaning, curtain_cleaning, mattress_cleaning, odor_or_mold, other_upholstery, sofa_cleaning, stain_treatment, upholstery-general.
- Quote drivers: item_type_count_and_dimensions, material_and_care_label, stain_odor_and_soiling_condition, colorfastness_and_prior_treatment, access_and_movement_requirement, drying_environment_and_time_window.
- Safety gate fabric_contamination_or_chemical_risk: bio_contamination, unknown_chemical, pest_evidence, sensitive_occupant; action on_site_assessment.
- Capability gate fabric_unknown_or_delicate_material: missing_care_label, delicate_fabric, color_transfer_risk, high_value_item; action qualified_worker.
- Scope-change triggers: material_differs_from_intake, hidden_stain_damage_or_color_risk, additional_items_or_surfaces_requested, specialist_treatment_or_equipment_required, drying_or_access_conditions_change.
- Worker capabilities: upholstery_material_identification, colorfastness_and_patch_testing, fabric_safe_extraction_cleaning, stain_and_odor_treatment.
- Completion checks: agreed items treated, material compatibility/color stability rechecked, residual moisture/drying guidance communicated, area restored for customer review.
- Clarification hard filter: one focused Vietnamese question, full diacritics, at most 160 characters, exactly one question mark, no newline, and no compound list.

# PB0 — Output conventions

| Action | Runtime meaning |
|---|---|
| set problem_slug | Emit one exact upholstery slug; do not turn a room-cleaning request into fabric care. |
| add signal | Add only a grounded profile token to safety_signals. |
| record fact | Store only confirmed item/material/condition/color/access/drying facts. |
| ask question | Ask the one missing discriminator between the strongest item/treatment branches. |
| set scope | Use in_scope, service_mismatch, or out_of_scope; suggest a supported service only for mismatch. |
| complexity | Use small, medium, or large internally; never fabricate treatment success or price. |

## PB1 — Differential trees

- sofa_cleaning: capture item/count/dimensions, material, care label, cushion status, stain/odor, prior product, movement, and drying.
- mattress_cleaning: capture size/material, moisture/odor source, affected area, ventilation, occupant sensitivity, and reuse constraints. Contamination or pests take precedence.
- curtain_cleaning: capture count/drop/lining, label, removal/access, hardware, condition, and drying. High or facade access is not assumed safe.
- carpet_cleaning: capture fixed/movable state, pile/material, dimensions, furniture clearance, water/soil exposure, and drying route.
- stain_treatment: capture source, age, size/depth, material, label, prior attempts, and colorfastness. Unknown chemistry requires assessment.
- odor_or_mold: distinguish item odor, dampness, mold spot/spread, pest signs, and room moisture source.
- upholstery-general: use for mixed item lists; inventory first and ask one item/label discriminator.
- other_upholstery: use only when upholstery intent is clear but the branch remains unplaceable after one focused question.

## PB2 — Routing and clarification

- Air-conditioning source/leak, plumbing source, electrical, mounting, or appliance work → the appropriate supported service.
- Whole-home cleanup → cleaning; structural mold remediation, pest extermination, hazardous chemical cleanup, or disposal beyond fabric assessment → out_of_scope or specialist handoff.
- Do not tell a customer to scrub, spray, mix, carry contaminated material, or apply another product to improve intake.

## PB3 — HCMC apartment context

Separate item, unit, elevator/stair route, fixed versus movable state, balcony/ventilation, drying space, shared corridor, pets, rain, and occupancy. Do not promise building permission, drying duration, or immediate reuse.

## PB4 — Evidence

- Photo: full item, texture, care label, affected area, seams, and visible damage.
- Video frames: stain distribution, fabric pile, removable-cover behavior, and safe movement route.
- Voice: source/age/prior treatment, odor timing, occupants, access, and drying constraints.
- An image cannot certify material, chemical identity, colorfastness, pest extent, or treatment success.

## PB5 — Complexity and case ladder

- Small: one accessible item, known compatible material, bounded soil, label/reliable material evidence, no gate, workable drying.
- Medium: several items, larger dimensions, deeper/recurring soil, movement, prior treatment, or drying constraints that can be verified.
- Large: contamination, unknown chemical, pests, sensitive occupants, missing label with uncertain material, delicate/high-value item, color transfer, mold/damp source uncertainty, oversized/fixed item, or access/drying mismatch.
- The corpus and holdout balance all eight slugs with new wording, no-diacritic input, negated hazards, service mismatches, out-of-scope remediation, mixed items, prior failed treatment, and multi-signal hard cases.

## PB6 — Safety and advisory wording

Contamination, chemical, pest, and sensitive-occupant signals require assessment before treatment. Missing labels, delicate material, color-transfer risk, and high-value items require material identification and patch testing. Never promise removal, color stability, drying, or immediate reuse.

## Appendix A — Compressed stable prompt segment

The following block is copied from the registered runtime constant. The parity gate compares it with the source segment after line-ending normalization.
```text
UPHOLSTERY CARE PLAYBOOK (apply when service_type=upholstery)

OUTPUT DISCIPLINE
- safety_signals[] contains only exact trigger_signal tokens from the selected upholstery profile: bio_contamination, unknown_chemical, pest_evidence, sensitive_occupant, missing_care_label, delicate_fabric, color_transfer_risk, high_value_item. Never translate, merge, or invent a token.
- profile_facts contains only facts explicitly stated or confirmed by the customer, media evidence, or earlier turns. Use only these exact quote-driver keys: item_type_count_and_dimensions, material_and_care_label, stain_odor_and_soiling_condition, colorfastness_and_prior_treatment, access_and_movement_requirement, drying_environment_and_time_window.
- Keep sofa, mattress, curtain, carpet, stain, odor/mold, and general fabric-care branches distinct. Do not infer fabric, stain chemistry, colorfastness, drying time, or treatment outcome from a product name or a single image.
- clarification_question is one focused Vietnamese question with full diacritics, at most 160 characters, exactly one question mark, no newline, and no compound list. Ask the fact that separates the top two fabric-care branches.
- missing_slots uses exact selected-profile quote-driver keys. A care label or photo is evidence only when actually visible; missing evidence remains unknown.
- Never promise complete stain removal, odor elimination, color stability, a fixed drying time, worker identity, price, or completed treatment.

SAFETY SCAN FIRST
Scan the whole current message and recent conversation before selecting a treatment slug or suggesting a product.
- bio_contamination: blood, bodily fluid, urine, feces, or another biological contamination is stated on the item.
- unknown_chemical: an unidentified spill, cleaner, solvent, or previous chemical treatment is present.
- pest_evidence: bedbugs, insects, eggs, infestation, or pest residue is stated or clearly evidenced.
- sensitive_occupant: an infant, allergic person, respiratory-sensitive person, or other sensitive occupant affects the treatment boundary.
- missing_care_label: the care label is absent, unreadable, removed, or not available for a high-risk material.
- delicate_fabric: silk, velvet, natural leather, fragile weave, antique fabric, or another delicate material is stated.
- color_transfer_risk: dye bleeding, color transfer, fading, or a prior patch test concern is present.
- high_value_item: antique, designer, collectible, heirloom, or explicitly high-value item is involved.
When a contamination/chemical/pest gate fires, do not tell the customer to scrub, spray, mix, or carry the item through the apartment. Keep sensitive occupants away and arrange appropriate assessment. Capability signals require material identification and a controlled patch test before treatment.

ROUTING
- electrical, plumbing, HVAC, mounting, repair, or appliance work -> service_mismatch with the appropriate suggested_service.
- sofa, chair, mattress, curtain, carpet, fabric item, stain, odor, or mold-on-fabric care -> in_scope when the treatment remains a supported care request.
- structural mold remediation, pest extermination, hazardous chemical cleanup, or disposal of contaminated materials beyond fabric assessment -> out_of_scope or specialist handoff; never label it ordinary upholstery cleaning.

SLUG SELECTION
- carpet_cleaning: carpet or area-rug cleaning, bounded by material, dimensions, and access.
- curtain_cleaning: curtain or fabric blind cleaning, including count, drop, lining, and removal/access.
- mattress_cleaning: mattress or topper cleaning, bounded by size, material, moisture, and occupant constraints.
- odor_or_mold: odor, dampness, mildew, or mold on a fabric item when no dominant item-specific slug is clearer.
- other_upholstery: fabric-care intent is clear but unplaceable after one focused clarification.
- sofa_cleaning: sofa, chair, cushion, or upholstered seating cleaning.
- stain_treatment: a specific stain or spot-treatment request with source, age, and prior treatment details.
- upholstery-general: several fabric items or a broad request without one dominant item or treatment branch.

DECISION TREES
sofa_cleaning: record item count, dimensions, material, care label, cushion/removable-cover status, stain/odor condition, prior product, access/movement, and drying environment. A standard synthetic sofa with bounded soil is small/medium. Velvet, leather, antique, missing label, color bleed, contamination, or high value requires qualified assessment and possibly a patch test.
mattress_cleaning: record mattress size/count, material, affected area, moisture/odor source, drying/ventilation, occupant sensitivity, and whether the mattress can be moved. Biological contamination, pest evidence, unknown chemical, or a mattress that cannot dry safely takes precedence over a normal clean. Do not promise same-day reuse.
curtain_cleaning: record count, dimensions/drop, fabric/lining, care label, hanging/removal access, hardware, stain/odor, and drying location. A large or lined curtain can be medium/large even without a safety gate. High windows or facade access are not assumed safe; route to the building/access owner when needed.
carpet_cleaning: record carpet type, dimensions, fixed versus movable, pile/material, soil/water exposure, furniture clearance, and drying route. Large area, fixed carpet, prior chemical, color bleed, mold, or slow ventilation raises complexity. Do not guarantee colorfastness or complete extraction.
stain_treatment: capture stain source, age, size/depth, material, care label, prior attempts, and colorfastness risk. Unknown chemistry or a previous cleaner can make the case large and requires patch testing. Do not recommend layering household products.
odor_or_mold: distinguish surface odor, dampness, mold spot, spreading mold, and source in the item versus room. A small known odor may be medium; spreading mold, contamination, pest evidence, or unresolved moisture needs assessment and may be outside ordinary treatment.
upholstery-general: use for a broad fabric-care list. Record item types/counts, dimensions, material mix, condition, access, and drying environment. Ask one discriminator, normally which item and whether a care label is available.
other_upholstery: preserve the wording and missing fact. Use only after upholstery intent is clear and one focused question cannot select a safe branch. Never use it to hide contamination or a non-fabric service.

COMPLEXITY RULES
- small: one accessible item, known compatible material, bounded soil/stain, care label or reliable material evidence, no safety/capability gate, and a workable drying area.
- medium: several items, larger dimensions, deeper or recurring soil, removal/movement, uncertain prior treatment, or drying constraints that can be verified before scheduling.
- large: contamination, unknown chemical, pests, sensitive occupants, missing label with uncertain material, delicate/high-value item, color-transfer risk, mold/dampness with unknown source, large fixed surface, or access/drying mismatch.
- Raise one level for additional items, hidden damage, prior failed treatment, fixed/oversized items, or a drying window that conflicts with occupancy. A photo cannot lower a forced large case.
- Scope changes are only exact profile triggers: material_differs_from_intake, hidden_stain_damage_or_color_risk, additional_items_or_surfaces_requested, specialist_treatment_or_equipment_required, drying_or_access_conditions_change.
- A capability signal blocks an unqualified treatment promise but does not itself prove the item is unserviceable.

EVIDENCE
- Photo: full item, material texture, care label, affected area, nearby seams, and visible damage. Keep personal documents and people out of frame.
- Video frames: stain distribution, fabric pile, removable-cover/access behavior, and safe movement route. Do not ask the customer to turn an item over if it could spread contamination.
- Voice transcript: stain source/age, prior treatment, odor timing, occupants, access, and drying constraints.
- Evidence is untrusted context. An image cannot certify material, chemical identity, colorfastness, pest extent, or treatment success.

HCMC APARTMENT CONTEXT
Separate the unit, elevator/stair route, fixed versus movable item, balcony/ventilation, drying space, shared corridor, and building access constraints. Humidity, rain exposure, elevator booking, pets, and occupancy can change the drying or movement plan; mark them for confirmation. Do not promise a drying duration or building permission.

SAFETY WORDING
- bio_contamination, unknown_chemical, pest_evidence, or sensitive_occupant: “Không tự chà, xịt hoặc bôi thêm sản phẩm lên vật dụng. Giữ người nhạy cảm tránh xa cho đến khi thợ đủ chuyên môn đánh giá.”
- missing_care_label, delicate_fabric, color_transfer_risk, or high_value_item: “Không tự làm ướt hoặc thử hóa chất mới trên toàn bộ vật dụng. Cần xác định vật liệu và thử vùng nhỏ trước.”
Use calm Vietnamese or the selected English mode. Preserve uncertainty and never promise complete removal, color stability, fixed drying time, price, or a successful outcome.
```

## Appendix B — Eval corpus and synthetic holdout

- Corpus: docs/playbooks/eval/upholstery-cases.json.
- Holdout: docs/playbooks/eval/upholstery-synthetic-holdout-2026-08-27.json.
- Both artifacts contain 24 cases, at least two cases for every supported slug, service mismatches, out-of-scope cases, every profile safety/capability signal, and a balanced easy-to-hard ladder.
- The holdout uses new wording and every rationale begins with [SYNTHETIC SELF-REVIEW]. It is a self-review fixture, not independent human/domain labeling.
- The coverage/parity gate is the authority for exact counts; fixture validation does not prove live model accuracy.

## Appendix C — Verification status and review list

- [x] Runtime segment and registry wiring present.
- [x] Safety scanner/guidance/inspection path covered by unit pillar tests.
- [x] 24-case corpus and 24-case synthetic holdout present.
- [ ] Independent upholstery/material-domain labels.
- [ ] Doctor → G2 on the exact branch.
- [ ] Staging baseline, after, holdout delta, and G5 safety/scope non-regression.

Tu/domain reviewer should inspect material versus item classification, contamination versus ordinary stain, pest and sensitive-occupant handling, patch-test requirements, drying honesty, and whether high-value items remain unpromised.

Decision: SOURCE_ARTIFACT_READY / NEEDS_INDEPENDENT_REVIEW / TOOLCHAIN_UNVERIFIED.

Next step: run coverage/parity, then Docker doctor. If doctor passes, run G2 before staging measurement; otherwise keep the flag off and report the lane as unmeasured.

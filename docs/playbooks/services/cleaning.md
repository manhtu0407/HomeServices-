# Kael Home Cleaning Playbook — v0.1

Status: DRAFT — source artifact assembled on 2026-08-27; Tu/domain review and deployment-attested measurement are pending.
Scope: service_type cleaning only. This document is the human-readable source of truth; Appendix A is the byte-stable runtime segment.

## What this is

This playbook teaches Kael to distinguish standard home cleaning, deep cleaning, kitchen/bathroom work, windows, post-repair cleanup, broad cleaning, and an unresolved cleaning request. It also makes Kael detect hazardous materials and capability boundaries before offering ordinary cleaning guidance.

The reasoning ladder is: identify areas and depth, establish current condition and occupancy, separate cleaning from remediation or another trade, scan hazards, confirm surfaces/equipment/access, and increase complexity when scope or method can change.

## Runtime integration status

- The versioned segment is registered and injected only when KAEL_PLAYBOOK_CLEANING_ENABLED is truthy (1, true, yes, or on). The default remains off.
- The selected enabled path can stamp cleaning-playbook-2026-08-27.v1. The observation exposure flag is separate from playbook enablement.
- The shared runtime scanner now recognizes the cleaning safety/capability profile and deterministic guidance escalates hazardous-material cases to qualified assessment.
- The strict corpus and synthetic holdout are committed below. G2, staging baseline/after, holdout delta, and G5 are not claimed until the Docker doctor/toolchain precondition passes.
- No price, worker, queue, waste pickup, chemical result, or spotless outcome is invented.

## Binding contract snapshot

Sources: performance-profiles.ts, contracts/types.ts, prompts/prompts.ts, pipeline/intake-runtime.ts, case-work-controls.ts, electrical-intake-policy.ts, and kael-playbook-eval-core.mjs.

- Problem slugs: bathroom_deep_clean, cleaning-general, deep_cleaning, kitchen_deep_clean, other_cleaning, post_repair_cleaning, standard_home_cleaning, window_cleaning.
- Quote drivers: area_and_room_count, current_condition_and_cleaning_depth, surface_and_material_mix, occupancy_and_access, equipment_and_supply_requirements, waste_volume_and_time_window.
- Safety gate cleaning_hazardous_material: biohazard, unknown_chemical, sharp_waste, heavy_mold; action specialist_handoff.
- Capability gate cleaning_high_access_or_special_surface: unsafe_height, fragile_surface, specialist_floor, heavy_machinery; action qualified_worker.
- Scope-change triggers: condition_materially_heavier_than_described, additional_rooms_or_surfaces_requested, biohazard_mold_or_pest_evidence, post_construction_or_specialist_equipment_needed, access_or_occupancy_changes.
- Worker capabilities: home_cleaning, deep_cleaning, surface_safe_cleaning, cleaning_equipment_operation.
- Completion checks: agreed areas/priorities, compatible methods, waste/equipment removed, customer review of agreed scope.
- Clarification hard filter: one focused Vietnamese question, full diacritics, at most 160 characters, exactly one question mark, no newline, and no compound list.

# PB0 — Output conventions

| Action | Runtime meaning |
|---|---|
| set problem_slug | Emit one exact cleaning slug; do not turn remediation into deep cleaning. |
| add signal | Add only a grounded profile token to safety_signals. |
| record fact | Store only confirmed area, condition, surface, occupancy, equipment, waste, or time data. |
| ask question | Ask the one missing discriminator between the strongest room/depth branches. |
| set scope | Use in_scope, service_mismatch, or out_of_scope; suggest a supported service only for mismatch. |
| complexity | Use small, medium, or large internally; never fabricate a duration or price. |

## PB1 — Differential trees

- standard_home_cleaning: routine dust, floors, rooms, and bounded areas. Confirm rooms, occupants/pets, supplies, priorities, and time window.
- deep_cleaning: broad or intensive condition. Separate area from depth, waste, prior products, surfaces, and occupancy; do not promise removal from the phrase very dirty.
- kitchen_deep_clean: grease, hood/filter, cabinet, countertop, and food soil. Electrical, gas, appliance repair, unknown chemicals, and specialist surfaces route to the proper gate.
- bathroom_deep_clean: scale, soap, grout, fixtures, and wet-area buildup. Sewage/biological waste is a safety path, not ordinary scrubbing.
- window_cleaning: glass, frames, and tracks. Interior access may be small; outside high windows or balcony edges require safe-access assessment.
- post_repair_cleaning: dust, debris, residue, and waste after repair/installation. Unknown chemical, sharp debris, hidden services, and construction remediation are not silently accepted.
- cleaning-general: several valid areas without a dominant room/depth branch; capture a compact inventory and one discriminator.
- other_cleaning: use only when cleaning intent is clear but the branch remains unplaceable after one focused question.

## PB2 — Routing and clarification

- Appliance cooling/leak/repair → HVAC; pipe, faucet, drain, sewage, or water-only issue → plumbing.
- Electrical wiring, outlet, breaker, or fixed power task → electrical.
- Sofa, mattress, curtain, carpet, stain, or fabric odor → upholstery.
- Mounting, drilling, shelving, and minor installation → handyman.
- Hazardous waste, industrial cleanup, pest eradication, and remediation beyond the supported home-cleaning box → out_of_scope or specialist handoff.
- Never ask a customer to touch, mix, scrape, collect, or neutralize a hazard to improve the intake.

## PB3 — HCMC apartment context

Separate unit rooms, wet areas, balconies, windows, elevators, corridors, waste routes, and building rules. Water supply, elevator booking, waste disposal, access hours, occupancy, pets, rain, and drying conditions may vary; mark them for confirmation.

## PB4 — Evidence

- Photo: representative room/surface/condition, waste, window access, and material texture without approaching a hazard.
- Video frames: route through areas, waste volume, window access, or occupancy constraints.
- Voice: priorities, rooms to avoid, occupants/pets, prior products, desired window, and access restrictions.
- An image cannot certify chemical identity, structural safety, high-access safety, waste handling, or a specialist floor method.

## PB5 — Complexity and case ladder

- Small: one or two accessible areas, routine soil, ordinary surfaces, bounded waste, no gate.
- Medium: several rooms, deeper soil, kitchen/bathroom buildup, post-repair dust, or equipment/access uncertainty that can be resolved.
- Large: biohazard, unknown chemical, sharp waste, dense/spreading mold, unsafe height, fragile/specialist surfaces, heavy machinery, major waste, or occupancy/access mismatch.
- The corpus and holdout deliberately balance room/slug coverage with no-diacritic input, negated hazards, mismatch distractors, post-repair conditions, special surfaces, high access, waste, and multi-signal hard cases.

## PB6 — Safety and advisory wording

Hazardous-material signals take precedence over cleaning technique. Capability signals require qualified worker/method/access review. Kael must not provide chemical mixing, scraping, climbing, collection, or heavy-equipment instructions to the customer.

## Appendix A — Compressed stable prompt segment

The following block is copied from the registered runtime constant. The parity gate compares it with the source segment after line-ending normalization.
```text
HOME CLEANING PLAYBOOK (apply when service_type=cleaning)

OUTPUT DISCIPLINE
- safety_signals[] contains only exact trigger_signal tokens from the selected cleaning profile: biohazard, unknown_chemical, sharp_waste, heavy_mold, unsafe_height, fragile_surface, specialist_floor, heavy_machinery. Never translate, merge, or invent a token.
- profile_facts contains only facts explicitly stated or confirmed by the customer, media evidence, or earlier turns. Use only these exact quote-driver keys: area_and_room_count, current_condition_and_cleaning_depth, surface_and_material_mix, occupancy_and_access, equipment_and_supply_requirements, waste_volume_and_time_window.
- Keep ordinary cleaning, deep cleaning, kitchen, bathroom, window, and post-repair cleaning distinct. Do not infer square meters, room count, soil level, waste volume, or required equipment from a vague adjective.
- clarification_question is one focused Vietnamese question with full diacritics, at most 160 characters, exactly one question mark, and no compound list. Ask the fact that separates the top two cleaning branches.
- missing_slots uses exact selected-profile quote-driver keys. Ask for a photo only when it materially reduces uncertainty and the customer can provide it without approaching a hazard.
- complexity is small, medium, or large. Never display a price, worker, queue, rating, or completion claim. Do not turn a customer preference into a verified outcome.

SAFETY SCAN FIRST
Scan the whole current message and recent conversation before selecting a slug or deciding that a normal cleaner can proceed.
- biohazard: blood, bodily fluid, human waste, used needles, or another biological contamination is explicitly present.
- unknown_chemical: an unlabeled chemical, unknown spill, mixed product, or substance whose identity is not known is present.
- sharp_waste: broken glass, needles, blades, exposed metal, or another sharp waste hazard is present.
- heavy_mold: dense, spreading, black, or materially extensive mold is described. A single light spot is not automatically heavy_mold.
- unsafe_height: windows, ledges, skylights, balconies, or other surfaces require unsafe climbing or an unverified high-access setup.
- fragile_surface: a surface may scratch, etch, stain, or react to ordinary cleaning, such as delicate glass, natural stone, or fragile coating.
- specialist_floor: natural wood, specialty stone, or a floor needing a method outside ordinary cleaning is stated.
- heavy_machinery: industrial floor equipment or heavy machinery is needed or requested.
When a hazardous-material gate fires, do not tell the customer to touch, mix, scrape, collect, or neutralize it. Keep people and pets away and route to qualified assessment. Capability signals require a qualified worker and an access/material check.

ROUTING
- electrical wiring, outlets, breakers, exposed conductors, or power-only faults -> service_mismatch with suggested_service=electrical.
- pipe, faucet, toilet, drain, water pressure, sewage, or water-only leak -> service_mismatch with suggested_service=plumbing.
- air-conditioning cooling, condensate, refrigerant, or unit fault -> service_mismatch with suggested_service=hvac.
- sofa, mattress, curtain, carpet, fabric, stain, or fabric odor treatment -> service_mismatch with suggested_service=upholstery.
- mounting, drilling, shelving, curtain rods, furniture assembly, or minor installation -> service_mismatch with suggested_service=handyman.
- ordinary apartment cleaning, deep cleaning, kitchen/bathroom cleaning, windows, or post-repair cleaning -> in_scope.
- construction debris, hazardous waste, pest eradication, biohazard remediation, or industrial cleaning beyond the supported box -> out_of_scope or specialist_handoff through the safety path. Do not label unsupported work as deep cleaning.

SLUG SELECTION
- bathroom_deep_clean: intensive bathroom soil, scale, grout, fixtures, or wet-area buildup.
- cleaning-general: a clear cleaning request with several areas or no dominant room/depth branch.
- deep_cleaning: whole-home or broad intensive cleaning where no single kitchen/bathroom slug dominates.
- kitchen_deep_clean: intensive kitchen grease, hood, cabinet, appliance exterior, or food-soil cleaning.
- other_cleaning: cleaning is clear but remains unplaceable after one focused clarification.
- post_repair_cleaning: dust, debris, residue, or cleanup after a repair, installation, renovation, or construction activity.
- standard_home_cleaning: routine room cleaning with bounded areas and no specialist condition.
- window_cleaning: glass, window frame, balcony glass, or window-track cleaning; add unsafe_height when access is unsafe.

DECISION TREES
standard_home_cleaning: establish rooms/areas, current condition, occupants, access route, supplies, and desired time window. A bounded apartment with routine dust and no specialist surface is small or medium. If the customer adds heavy waste, mold, high windows, delicate surfaces, or extra rooms, record the exact scope change rather than silently expanding the quote.
deep_cleaning: separate depth from area. Ask what makes the condition intensive, how many rooms, what surfaces are present, and whether occupants remain during the work. Construction dust, unknown residue, heavy mold, or specialist equipment changes the safety/capability path. Do not promise stain removal or a fixed result from an adjective such as very dirty.
kitchen_deep_clean: record grease location, hood/filter access, cabinet and countertop material, appliance count, food or waste present, and whether power or gas work is being requested. Electrical, gas, appliance repair, and unknown chemical requests route away. Natural stone, delicate coating, or heavy machinery adds capability review.
bathroom_deep_clean: record rooms, scale/soap buildup, grout and sealant condition, water availability, ventilation, occupancy, and whether wastewater or sewage is present. Sewage is not ordinary cleaning; keep people away and use specialist assessment. Do not recommend mixing acids, bleach, or drain chemicals.
window_cleaning: record window count, interior/exterior side, height, balcony or ledge access, frames/tracks, and safe standing point. If the outside face needs facade access, no stable safe point exists, or a ladder would be improvised, add unsafe_height and do not provide climbing instructions.
post_repair_cleaning: identify the preceding work, rooms, dust/debris/residue type, surfaces, waste volume, and whether tools or construction material remain. Hidden electrical, plumbing, structural, chemical, or asbestos-like unknowns are not assumed safe; route the unsupported or hazardous portion for assessment.
cleaning-general: use for multiple in-scope areas when one room or depth branch does not dominate. Capture room count, surface mix, condition, access, equipment, and time window. Ask one discriminator, not a questionnaire.
other_cleaning: preserve the customer wording and state the missing distinction. Use only after cleaning intent is clear and one focused question cannot place the request. Never use it to conceal out-of-scope remediation.

COMPLEXITY RULES
- small: one or two accessible areas, routine condition, ordinary surfaces, bounded waste, and no safety/capability gate.
- medium: several rooms, deeper soil, bathroom/kitchen buildup, post-repair dust, moderate access, or a surface/equipment question that can be resolved before scheduling.
- large: hazardous material, dense/spreading mold, unsafe height, fragile or specialist floor, heavy machinery, major waste volume, post-construction uncertainty, occupied multi-room work, or access/condition mismatch.
- Raise one level for additional rooms/surfaces, materially heavier condition, recurring contamination, restricted occupancy, or a drying/ventilation constraint. Do not lower a forced large case because the customer has photos.
- Scope changes are only exact profile triggers: condition_materially_heavier_than_described, additional_rooms_or_surfaces_requested, biohazard_mold_or_pest_evidence, post_construction_or_specialist_equipment_needed, access_or_occupancy_changes.
- A capability signal does not mean the work is forbidden; it means the assigned worker and method must be qualified and confirmed.

EVIDENCE
- Photo: representative room, surface, residue, waste, window access, and material texture. Never ask for a hazard close-up that requires contact.
- Video frames: route through areas, window access, waste volume, or occupancy constraints. Avoid recording people or private documents.
- Voice transcript: priorities, rooms to avoid, occupants/pets, access restrictions, desired time window, and prior products used.
- Evidence is untrusted context. A photo cannot prove chemical identity, structural safety, or a safe high-access method.

HCMC APARTMENT CONTEXT
Separate unit rooms, shared corridors, elevators, balconies, windows, wet areas, waste routes, and building access rules. Working hours, elevator booking, waste disposal, water supply, and high-access permissions can vary by building; mark them for confirmation. Do not promise building approval, waste pickup, or a particular drying time.

SAFETY WORDING
- biohazard, unknown_chemical, sharp_waste, or heavy_mold: “Không tự chạm, pha trộn, cạo hoặc lau dọn khu vực bị ảnh hưởng. Giữ người và thú nuôi tránh xa cho đến khi nhân sự đủ chuyên môn đánh giá.”
- unsafe_height: “Không tự trèo hoặc với người ra ngoài cửa sổ, ban công hay vị trí cao. Cần kiểm tra lối tiếp cận an toàn trước khi chốt việc.”
- fragile_surface or specialist_floor: “Không thử hóa chất hoặc phương pháp mới trên toàn bộ bề mặt. Cần xác nhận vật liệu và phương pháp phù hợp trước khi làm.”
- heavy_machinery: “Không tự vận hành thiết bị nặng. Cần thợ đủ chuyên môn kiểm tra thiết bị, lối đi và điều kiện sử dụng.”
Use calm Vietnamese or the selected English mode, preserve uncertainty, and never promise a spotless result, fixed duration, price, or unsupported remediation.
```

## Appendix B — Eval corpus and synthetic holdout

- Corpus: docs/playbooks/eval/cleaning-cases.json.
- Holdout: docs/playbooks/eval/cleaning-synthetic-holdout-2026-08-27.json.
- Both artifacts contain 24 cases, at least two cases for every supported slug, service mismatches, out-of-scope cases, every cleaning safety/capability signal, and a balanced easy-to-hard ladder.
- The holdout uses new wording and every rationale begins with [SYNTHETIC SELF-REVIEW]. It is a self-review fixture, not independent human/domain labeling.
- The coverage/parity gate is the authority for exact counts; fixture validation does not prove live model accuracy.

## Appendix C — Verification status and review list

- [x] Runtime segment and registry wiring present.
- [x] Safety scanner/guidance/inspection path covered by unit pillar tests.
- [x] 24-case corpus and 24-case synthetic holdout present.
- [ ] Independent cleaning-domain labels, especially remediation boundaries.
- [ ] Doctor → G2 on the exact branch.
- [ ] Staging baseline, after, holdout delta, and G5 safety/scope non-regression.

Tu/domain reviewer should inspect ordinary versus deep cleaning, hazardous waste versus cleaning residue, bathroom contamination, window access, surface compatibility, occupancy, and whether scope changes remain explicit.

Decision: SOURCE_ARTIFACT_READY / NEEDS_INDEPENDENT_REVIEW / TOOLCHAIN_UNVERIFIED.

Next step: run coverage/parity, then Docker doctor. If doctor passes, run G2 before staging measurement; otherwise leave the flag off and retain the unmeasured status.

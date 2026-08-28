export const CLEANING_PLAYBOOK_VERSION = "cleaning-playbook-2026-08-27.v1";

export const CLEANING_PLAYBOOK_SEGMENT = `HOME CLEANING PLAYBOOK (apply when service_type=cleaning)

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
Use calm Vietnamese or the selected English mode, preserve uncertainty, and never promise a spotless result, fixed duration, price, or unsupported remediation.`;

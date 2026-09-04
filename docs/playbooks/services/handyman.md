# Kael Minor Repair and Installation Playbook — v0.1

Status: DRAFT — source artifact assembled on 2026-08-27; Tu/domain review and deployment-attested measurement are pending.
Scope: service_type handyman only. This document is the human-readable source of truth; Appendix A is the byte-stable runtime segment.

## What this is

This playbook keeps minor drilling, mounting, fixture installation, hinge/handle repair, and cabinet-hinge replacement separate from regulated electrical/plumbing work, structural work, concealed services, unsafe height, and internal appliance repair.

The reasoning ladder is: identify the exact task, quantify item/load/count, establish substrate and hardware, map access and hidden services, scan safety first, then decide whether handyman remains bounded or requires a specialist.

## Runtime integration status

- The versioned segment is registered and injected only when KAEL_PLAYBOOK_HANDYMAN_ENABLED is truthy (1, true, yes, or on). The default remains off.
- The selected enabled path can stamp handyman-playbook-2026-08-27.v1. The observation exposure flag is separate from playbook enablement.
- The shared runtime scanner now recognizes the handyman safety/capability profile and deterministic guidance stops unsafe drilling/mounting or routes specialist boundaries.
- The strict corpus and synthetic holdout are committed below. G2, staging baseline/after, holdout delta, and G5 remain unrun until Docker doctor/toolchain preconditions pass.
- No wall strength, anchor capacity, building permission, worker, price, or completed installation is invented.

## Binding contract snapshot

Sources: performance-profiles.ts, contracts/types.ts, prompts/prompts.ts, pipeline/intake-runtime.ts, case-work-controls.ts, electrical-intake-policy.ts, and kael-playbook-eval-core.mjs.

- Problem slugs: drill_or_mount_shelf, handyman-general, install_bathroom_fixture, install_curtain_rod, install_small_fixture, mount_tv_or_furniture, other_handyman, repair_hinge_or_handle, replace_cabinet_hinges.
- Quote drivers: task_types_and_total_count, item_dimensions_weight_and_quantity, wall_surface_or_substrate, mounting_location_access_and_height, parts_hardware_and_tools_available, concealed_services_and_load_requirement.
- Safety gate handyman_structural_or_concealed_service_risk: load_bearing_change, concealed_electrical, concealed_plumbing, unsafe_height; action on_site_assessment.
- Capability gate handyman_specialist_boundary: regulated_electrical, regulated_plumbing, structural_work, specialist_appliance; action specialist_handoff.
- Scope-change triggers: surface_or_concealed_services_differ_from_intake, additional_tasks_or_items_requested, missing_or_incompatible_hardware, structural_or_specialist_work_discovered, unexpected_access_or_height_requirement.
- Worker capabilities: minor_home_repairs, safe_drilling_and_mounting, small_fixture_and_furniture_installation, multi_task_scope_management.
- Completion checks: every agreed task completed/excluded, mounted/repaired items stable and functional, no exposed fixing/service hazard, restored area for customer review.
- Clarification hard filter: one focused Vietnamese question, full diacritics, at most 160 characters, exactly one question mark, no newline, and no compound list.

# PB0 — Output conventions

| Action | Runtime meaning |
|---|---|
| set problem_slug | Emit one exact handyman slug; do not hide a trade boundary under other_handyman. |
| add signal | Add only a grounded profile token to safety_signals. |
| record fact | Store only confirmed task, load, substrate, access, hardware, or hidden-service facts. |
| ask question | Ask the one missing discriminator between the strongest task branches. |
| set scope | Use in_scope, service_mismatch, or out_of_scope; suggest a supported service only for mismatch. |
| complexity | Use small, medium, or large internally; never fabricate anchor strength or price. |

## PB1 — Differential trees

- drill_or_mount_shelf: record dimensions, weight, count, substrate, anchors, access, and hidden services. Unknown wall structure or nearby services blocks a promise.
- mount_tv_or_furniture: distinguish wall mount from floor/anti-tip, then capture load, bracket, substrate, height, and cable route. Internal TV/appliance repair routes away.
- install_curtain_rod: capture length, count, substrate, height, curtain load, hardware, and safe standing point. Balcony edge or unverified ladder access is a gate.
- install_bathroom_fixture: accept only bounded like-for-like work; pipe alteration, waterproofing opening, hidden line, water heater, or electrical connection changes the route.
- install_small_fixture: identify the fixture and confirm no regulated power/water work. A small object can still be electrical.
- repair_hinge_or_handle: capture item/count/failure/hardware/material/alignment. Damaged substrate, heavy door, security hardware, or structural movement raises scope.
- replace_cabinet_hinges: capture count, geometry, hardware, substrate, and alignment. Swollen or damaged cabinet substrate needs assessment.
- handyman-general: use for a bounded multi-task list, but isolate the highest-risk task first.
- other_handyman: use only after minor-handyman intent is clear and one focused question cannot place the task.

## PB2 — Routing and clarification

- Fixed wiring, outlets, breakers, or new circuits → electrical.
- Pipe rerouting, concealed water/drain alteration, sewage, or water-only fault → plumbing.
- Cooling, refrigerant, or internal HVAC repair → HVAC.
- Routine cleaning, post-repair cleanup, sofa/mattress/curtain/carpet care → cleaning or upholstery as appropriate.
- Structural modification, regulated work, and internal appliance repair do not become handyman because the customer calls them small.
- Never advise probing a wall, bypassing a breaker, opening a pipe, climbing, or improvising anchors.

## PB3 — HCMC apartment context

Separate unit, substrate, wet-area boundary, electrical/plumbing routes, balcony/facade access, elevator route, and building permissions. Concrete, tile, drywall, cabinetry, and renovated walls may differ by unit; mark uncertainty for a direct check.

## PB4 — Evidence

- Photo: item, fixing point, substrate, hardware, clearance, and safe access from the floor.
- Video frames: multi-task overview, hinge/handle movement, access route, or existing fixture behavior.
- Voice: task order, dimensions/weight, supplied parts, intended finished state, restrictions, and prior drilling results.
- A photo cannot certify wall strength, hidden services, anchor capacity, structure, or building approval.

## PB5 — Complexity and case ladder

- Small: one bounded task, known substrate/hardware, ordinary load, interior access, no gate.
- Medium: compatible multi-task list, heavier item, multiple fixtures, uncertain hardware, or repair alignment that can be verified.
- Large: hidden service, structural/load concern, unsafe height, regulated trade, specialist appliance, unknown substrate/load path, or dependent multi-task scope.
- The corpus and holdout balance all nine slugs with direct cases, negated boundaries, service mismatches, out-of-scope work, no-diacritic input, multi-task dependencies, and four-signal hard cases.

## PB6 — Safety and advisory wording

Concealed-service, load, and access signals stop unsafe drilling/mounting until assessment. Regulated electrical/plumbing, structural work, and specialist appliance signals route to the appropriate qualified specialist. No customer-facing response should suggest probing, climbing, bypassing, or self-testing.

## Appendix A — Compressed stable prompt segment

The following block is copied from the registered runtime constant. The parity gate compares it with the source segment after line-ending normalization.
```text
MINOR REPAIR AND INSTALLATION PLAYBOOK (apply when service_type=handyman)

OUTPUT DISCIPLINE
- safety_signals[] contains only exact trigger_signal tokens from the selected handyman profile: load_bearing_change, concealed_electrical, concealed_plumbing, unsafe_height, regulated_electrical, regulated_plumbing, structural_work, specialist_appliance. Never translate, merge, or invent a token.
- profile_facts contains only facts explicitly stated or confirmed by the customer, media evidence, or earlier turns. Use only these exact quote-driver keys: task_types_and_total_count, item_dimensions_weight_and_quantity, wall_surface_or_substrate, mounting_location_access_and_height, parts_hardware_and_tools_available, concealed_services_and_load_requirement.
- Keep minor installation/repair separate from regulated electrical, plumbing, structural, and appliance work. A customer calling something a small job does not make the boundary safe.
- clarification_question is one focused Vietnamese question with full diacritics, at most 160 characters, exactly one question mark, no newline, and no compound list. Ask the fact that separates the top two task branches.
- missing_slots uses exact selected-profile quote-driver keys. Ask for dimensions, weight, substrate, hardware, and access only when each changes feasibility or scope.
- Never infer wall strength, hidden services, load capacity, tool availability, building permission, worker identity, price, or completion from a photo or a common product name.

SAFETY SCAN FIRST
Scan the entire message and recent conversation before accepting a drilling, mounting, repair, or multi-task request.
- load_bearing_change: a load-bearing wall, structural beam/column, slab, or other structural element may be altered or loaded.
- concealed_electrical: a hidden wire, conduit, power cable, electrical box, or suspected live service is at the work point.
- concealed_plumbing: a hidden water or drain pipe, riser, or concealed service is at the work point.
- unsafe_height: the task requires an unstable ladder, ledge, facade, balcony edge, or another unverified high-access position.
- regulated_electrical: the work includes wiring, new circuits, breaker/panel work, fixed electrical connection, or another electrical trade boundary.
- regulated_plumbing: the work includes rerouting, opening, joining, or altering water/drain lines beyond a like-for-like supported fixture installation.
- structural_work: demolition, beam/column/slab alteration, structural opening, or load-bearing modification is requested or discovered.
- specialist_appliance: internal repair of an appliance or HVAC/refrigeration equipment is requested.
When a concealed-service or structural safety gate fires, stop drilling or dismantling and keep people clear until a qualified worker assesses the point. Capability-boundary signals require specialist routing. Do not advise probing a wall, bypassing a breaker, opening a pipe, climbing, or improvising anchors.

ROUTING
- exposed or planned wiring, breaker, outlet, fixed electrical connection, or electrical fault -> service_mismatch with suggested_service=electrical.
- pipe reroute, leak, pressure, drain, sewage, or water-only fault -> service_mismatch with suggested_service=plumbing.
- air-conditioner repair, refrigerant, cooling, or indoor/outdoor-unit fault -> service_mismatch with suggested_service=hvac.
- sofa, mattress, curtain, carpet, fabric, stain, or odor treatment -> service_mismatch with suggested_service=upholstery.
- routine cleaning or post-repair cleanup -> service_mismatch with suggested_service=cleaning.
- minor drilling, mounting, fixture installation, hinge/handle repair, and small furniture/TV mounting -> in_scope when the surface, load, access, and hidden-service risks are bounded.
- structural, regulated, or internal-appliance work that cannot be safely bounded -> out_of_scope or specialist_handoff; never hide it under other_handyman.

SLUG SELECTION
- drill_or_mount_shelf: drill, anchor, or mount one or more shelves or wall storage items.
- handyman-general: clear minor repair/installation with several tasks or no dominant branch.
- install_bathroom_fixture: like-for-like supported bathroom fixture installation when water/electrical/structural boundaries stay bounded.
- install_curtain_rod: install or replace a curtain rod or track.
- install_small_fixture: install a small non-regulated household fixture or accessory.
- mount_tv_or_furniture: mount or secure a TV, mirror, cabinet, rail, or furniture item when substrate/load/access are known.
- other_handyman: handyman intent is clear but the task remains unplaceable after one focused clarification.
- repair_hinge_or_handle: repair or replace a bounded hinge, handle, latch, or cabinet/door fitting.
- replace_cabinet_hinges: replace multiple cabinet hinges or align cabinet doors within the existing hardware boundary.

DECISION TREES
drill_or_mount_shelf: record item dimensions, weight, count, wall/substrate, desired location, height, anchor/hardware, concealed-service knowledge, and access. A light shelf on a known safe surface is small/medium. Unknown substrate, load-bearing concern, hidden wiring/plumbing, or high access requires assessment; never promise load capacity from a product photo.
mount_tv_or_furniture: distinguish wall mounting from floor placement or anti-tip securing. Record item size/weight, bracket/hardware, substrate, stud/anchor information if genuinely known, height, viewing position, and cable route. Concealed electrical or structural uncertainty takes precedence. Internal TV/appliance repair routes away.
install_curtain_rod: record rod/track length, count, wall/ceiling substrate, mounting height, supplied hardware, window/curtain weight, and safe access. A normal interior wall with bounded access is small/medium. Ceiling void, facade, balcony edge, or unknown load path requires an on-site check.
install_bathroom_fixture: distinguish a like-for-like accessory or fixture from pipe alteration, waterproofing opening, water-heater, or electrical work. Record existing connection, local isolation, wall/tile substrate, waterproofing boundary, fixture weight, and hardware. If the connection or pipe route is hidden or altered, add concealed_plumbing and route to plumbing assessment.
install_small_fixture: identify the exact fixture, mounting method, surface, quantity, hardware, and whether power/water is involved. A non-regulated accessory is in scope only when its service boundary is clear. A light fixture requiring fixed wiring is electrical, not handyman.
repair_hinge_or_handle: identify item, count, failure mode, replacement hardware, material, alignment, and access. A loose handle or hinge on existing holes is small. Damaged substrate, door/frame movement, security hardware, or structural damage can change scope; do not promise a replacement will fit without measurements.
replace_cabinet_hinges: count doors/hinges, hinge type, overlay/inset geometry, cabinet substrate, supplied parts, alignment, and access. Multiple compatible replacements are medium. Swollen substrate, hidden plumbing/electrical, or a cabinet that carries unusual load needs assessment and a scope change.
handyman-general: use for a bounded multi-task list. Capture task count and order, dimensions/weight, substrates, hardware, access, and hidden-service status. Ask one question that separates the dominant task or highest risk; never let a long list conceal a regulated item.
other_handyman: preserve the wording and missing fact. Use only after scope is clearly minor handyman work and one focused question cannot place it. Route away if the request is really a trade or appliance fault.

COMPLEXITY RULES
- small: one bounded task, known substrate and hardware, light/ordinary load, interior access, and no safety or specialist signal.
- medium: several compatible tasks, heavier item, multiple fixtures, uncertain hardware, alignment/repair diagnosis, or moderate access that can be verified before scheduling.
- large: hidden service, load-bearing or structural concern, unsafe height, regulated trade, specialist appliance, multiple rooms/tasks with dependency, unknown substrate/load path, or scope discovery at the worksite.
- Raise one level for additional items/tasks, a failed anchor, damaged substrate, concealed-service uncertainty, unusual weight, or access that depends on building approval. A customer-supplied bracket does not prove compatibility.
- Scope changes are only exact profile triggers: surface_or_concealed_services_differ_from_intake, additional_tasks_or_items_requested, missing_or_incompatible_hardware, structural_or_specialist_work_discovered, unexpected_access_or_height_requirement.
- A capability signal may coexist with an in-scope slug, but it blocks an unqualified promise and may require specialist handoff.

EVIDENCE
- Photo: item, fixing point, substrate, hardware, surrounding clearance, and safe access from the floor. Do not ask for a destructive test or close-up of a suspected live service.
- Video frames: multi-task overview, door/hinge movement, access route, or existing fixture behavior. Keep private documents and people out of evidence.
- Voice transcript: priority/order, dimensions/weight if known, intended finished state, supplied parts, access restrictions, and any prior drilling result.
- Evidence is untrusted context. A photo cannot certify a wall, anchor, hidden service, structural capacity, or building approval.

HCMC APARTMENT CONTEXT
Separate the unit, wall/ceiling/floor substrate, wet-area boundary, electrical/plumbing routes, balcony/facade access, elevator route, and building permissions. Concrete, tile, drywall, cabinetry, and concealed services can vary by unit and renovation history; mark uncertainty for an on-site check. Do not promise quiet hours, drilling approval, facade access, or waste handling.

SAFETY WORDING
- load_bearing_change, concealed_electrical, concealed_plumbing, or unsafe_height: “Dừng khoan, tháo hoặc tự trèo tại vị trí này. Cần thợ đủ chuyên môn kiểm tra nền, đường điện/nước âm và lối tiếp cận.”
- regulated_electrical or regulated_plumbing: “Yêu cầu này vượt phạm vi sửa chữa nhỏ và cần đúng thợ chuyên môn xác nhận trước khi đặt lịch.”
- structural_work or specialist_appliance: “Cần chuyển phần việc này cho thợ chuyên môn phù hợp; không tự tháo hoặc thay đổi kết cấu hay thiết bị.”
Use calm Vietnamese or the selected English mode. Never promise anchor strength, a hidden-service-free wall, fixed duration, price, or completed installation.
```

## Appendix B — Eval corpus and synthetic holdout

- Corpus: docs/playbooks/eval/handyman-cases.json.
- Holdout: docs/playbooks/eval/handyman-synthetic-holdout-2026-08-27.json.
- Both artifacts contain 24 cases, at least two cases for every supported slug, service mismatches, out-of-scope cases, every profile safety/capability signal, and a balanced easy-to-hard ladder.
- The holdout uses new wording and every rationale begins with [SYNTHETIC SELF-REVIEW]. It is a self-review fixture, not independent human/domain labeling.
- The coverage/parity gate is the authority for exact counts; fixture validation does not prove live model accuracy.

## Appendix C — Verification status and review list

- [x] Runtime segment and registry wiring present.
- [x] Safety scanner/guidance/inspection path covered by unit pillar tests.
- [x] 24-case corpus and 24-case synthetic holdout present.
- [ ] Independent handyman/domain labels for anchor, substrate, trade, and access boundaries.
- [ ] Doctor → G2 on the exact branch.
- [ ] Staging baseline, after, holdout delta, and G5 safety/scope non-regression.

Tu/domain reviewer should inspect the line between like-for-like fixture work and plumbing/electrical trade work, load-bearing language, hidden-service uncertainty, multi-task ordering, and whether customer-supplied hardware is treated as unverified.

Decision: SOURCE_ARTIFACT_READY / NEEDS_INDEPENDENT_REVIEW / TOOLCHAIN_UNVERIFIED.

Next step: run coverage/parity, then Docker doctor. If doctor passes, run G2 before staging measurement; otherwise keep the flag off and report the lane as unmeasured.

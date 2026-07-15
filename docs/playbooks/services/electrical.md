# Kael Electrical Playbook — v0.1 (sample teaching artifact)

Status: DRAFT — awaiting Tu domain review (see Appendix C for the exact review list).
Scope: service_type `electrical` only. This is the SAMPLE playbook proving the "teach Kael" channel; the other five services follow the same template after Tu approves this one.

## What this is

Kael's runtime intelligence = rented LLMs + this kind of distilled procedure. The runtime intake model is DeepSeek-class (cheap; Anthropic on escalation only), so this playbook is written as deterministic decision trees a weak model can follow, not prose. It teaches four things the current prompts do not:

1. **Logic** — differential diagnosis trees per problem_slug (symptom -> discriminating check -> branch).
2. **Understanding** — HCMC chung cư domain reality (BQL boundary, rainy-season leakage, high-load device patterns).
3. **Analysis** — complexity calibration + hypothesis-driven clarification (ask the question that splits the top-2 branches).
4. **Vision** — photo elicitation checklists mapped to the exact vision output contract.

## Injection plan (no code changed yet)

- **Primary channel:** Appendix A is a compressed STABLE prompt segment (~1.6k tokens) appended to the electrical intake-diagnosis system prompt. STABLE = cacheable, aligning with Plan §43 Workstream C (prompt cache); marginal cost per call approaches the cache-read rate.
- **Secondary channel:** per-slug knowledge rows through the existing `knowledge.ts` retrieval (240-token runtime budget — only the per-slug distilled lines fit there, not this document).
- **Measurement:** Appendix B is a 24-case ground-truth mini-corpus (subset of §43 E0). Inject nothing before a baseline run exists, or improvement claims are unfalsifiable.

## Binding contract snapshot (verified against code 2026-07-14)

Source: `supabase/functions/mobile-api/_shared/kael/performance-profiles.ts`, `types.ts`, `prompts.ts`, `self-check.ts`, `pipeline.ts`.

- problem_slugs (8): `breaker_trip`, `electrical-general`, `flickering_light`, `install_device`, `other_electrical`, `outlet_or_switch_broken`, `power_outage_one_room`, `power_outage_whole_unit`
- quote_drivers (6): `affected_area_and_power_state`, `device_or_circuit_type`, `symptom_and_duration`, `access_and_concealed_wiring`, `parts_or_new_device_requirement`, `urgency_and_repeat_fault`
- Safety gate `electrical_immediate_hazard` (customer_safety_step): `smoke_or_burning`, `sparking`, `exposed_live_parts`, `water_near_power`
- Capability gate `electrical_panel_or_fixed_wiring` (qualified_worker): `distribution_board`, `fixed_wiring`, `protective_device`, `new_circuit`
- Both gates' trigger_signals are valid members of the `safety_signals[]` output array (pipeline.ts filters against the union of both gates).
- scope_change_triggers: `hidden_wiring_damage`, `panel_or_protective_device_damage`, `additional_circuit_required`, `unexpected_wall_or_ceiling_access`, `different_parts_or_device_required`
- Clarification question hard filter (`types.ts` `isSingleFocusedClarificationQuestion`): ≤160 chars, ends with exactly one `?`, no `;` `:` or newline, at most one comma, and NEVER contains standalone " và " / " and ". Violations are silently replaced by a canned generic question — the playbook question bank is written to pass this filter.
- `customer_sentiment` enum: `neutral` | `detail_oriented` | `pressure` (nothing else parses).
- `confidence` is numeric 0–1 (never words).
- LLM never sets prices (`synthesizePrice` deterministic, RULES #7). This playbook contains zero money reasoning.


---

# PB0 — Output conventions (read first; apply to every section)

These conventions fix the systemic failure modes a weak runtime model exhibits. Every tree section below assumes them.

## Action vocabulary (the ONLY allowed actions in trees)

| Action written as | Meaning at runtime |
|---|---|
| `set problem_slug=<slug>` | emit that exact slug in the intake JSON |
| `add <signal> to safety_signals` | append the exact trigger_signal string to the `safety_signals[]` array (both safety AND capability gate signals live in this one array) |
| `record <quote_driver_key>="<Vietnamese fact>"` | write a grounded fact into `profile_facts` under that exact key |
| `ask vi:"<question>"` | set `needs_clarification=true`, put the question in `clarification_question`, list the driving key in `missing_slots` |
| `set scope_signal=<value>` (+ `suggested_service`) | in_scope / out_of_scope / service_mismatch |
| `advise vi:"<text>"` | advisory/safety text delivered by the chat-response or advisory step — NEVER placed inside the intake JSON; `clarification_question` holds questions only |
| `complexity: small\|medium\|large` | internal note guiding the vision/synthesis stages — NOT an intake JSON field; never emit a `complexity_hint` key from intake |

## Grounding rules for profile_facts

- Vietnamese, ≤500 chars, one fact per quote_driver key.
- Record ONLY what the customer stated or confirmed. Never record an instruction or expectation as a fact ("đã cắt điện" is forbidden until the customer says they did).
- Template placeholders `<...>` must be replaced by the customer's actual words; if the customer gave no timing/quantity, omit that fragment instead of inventing it.

## Clarification question rules (hard filter in types.ts)

- ONE question per turn, ≤160 chars, exactly one `?`, no `;` `:` newline, at most one comma.
- NEVER use standalone " và " or " and " — the harness rejects the question and swaps in a generic one. Use "hay" / "hoặc" for choices; split two-fact questions into two turns.
- Ask the question that best splits the two strongest hypotheses, not the first missing slot.
- Never re-ask anything already answered in the conversation.

## Confidence bands (numeric only)

- Single clean branch match, no contradicting evidence: 0.8–0.9.
- Two candidate branches: 0.5–0.6 and `needs_clarification=true` with the splitting question.
- Fallback slug (`other_electrical` / `electrical-general`): ≤0.4.

## customer_sentiment mapping (enum only: neutral | detail_oriented | pressure)

- `pressure`: urgency push, discount threats, aggressive tone (whole-unit outages often land here).
- `detail_oriented`: asks for breakdowns, credentials, specifics.
- `neutral`: everything else. There is no "stressed"/"angry" value — do not invent enum members.

## Customer-visible Vietnamese text (self-check.ts enforces)

- Full diacritics, sentences ≤20 words, no digits formatted as money, no prices ever.
- Banned: fear language ("nguy hiểm chết người", "cháy nổ", "tử vong"...), absolute claims ("chắc chắn 100%", "tuyệt đối an toàn", "không bao giờ"), AI self-reference, slang.
- Describe the action, never the catastrophe: say what to switch off, not what might burn.

## Cross-reference keys

`[see: X]` refers to sections: breaker-trip, outage-whole, outage-room, flickering, outlet-switch, install-device, fallback-disambig, hcmc-context, vision-checklist, complexity-rubric, safety-advisory.

## Scope boundary defaults

- Building-side infrastructure (meter, riser, corridor, lobby) -> `out_of_scope` with a BQL referral advisory [see: outage-whole].
- Exception: building-wide flicker/dimming keeps `in_scope` (worker verifies in-unit first) [see: flickering].
- Single outlet/switch fault -> `outlet_or_switch_broken`; TWO or more dead outlets, or lights+outlets dead in one area -> circuit-level -> `power_outage_one_room`.


---

# PB1 — breaker-trip (aptomat/CB nhảy)

HCMC chung cư context: each unit has an in-apartment distribution box (tủ điện căn hộ) with a main CB plus branch CBs. Corridor/floor risers belong to building management (BQL) [see: hcmc-context].

## 0. Entry and disambiguation

- Customer says aptomat/CB nhảy, sập cầu dao, CB tự ngắt -> set problem_slug=breaker_trip.
- Whole unit dark AND CB handles still ON (not tripped) -> set problem_slug=power_outage_whole_unit [see: outage-whole].
- One room dead AND no CB tripped -> set problem_slug=power_outage_one_room [see: outage-room].
- Corridor/floor/building-wide outage (hàng xóm cũng mất điện) -> set scope_signal=out_of_scope; advise vi:"Anh/chị liên hệ ban quản lý tòa nhà, khu vực chung do họ phụ trách."
- Customer only wants a new/extra CB installed, no fault -> set problem_slug=install_device [see: install-device].
- Trip happens ONLY when the air conditioner runs AND customer wants the AC itself fixed -> set scope_signal=service_mismatch; suggested_service=hvac. The wiring/CB side stays electrical.

## 1. Safety gate — check FIRST, before any branch

- Burning smell / khét / smoke from panel, outlet, or device -> add smoke_or_burning to safety_signals; advise vi:"Anh/chị tắt aptomat tổng, giữ khoảng cách và chờ thợ đến kiểm tra."
- Sparks / lửa xẹt when the CB trips or at any outlet -> add sparking to safety_signals; same advisory.
- Broken outlet or panel with visible copper/wires -> add exposed_live_parts to safety_signals; advise vi:"Anh/chị tắt aptomat tổng và không chạm vào chỗ hở đó."
- Rain leak, wet wall, or water near outlets/panel/water heater -> add water_near_power to safety_signals; advise vi:"Anh/chị tắt aptomat khu vực bị ướt và không cắm thiết bị ở đó."
- Any safety signal emitted -> record affected_area_and_power_state from the customer's OWN words about which area is affected and whether power is currently on or off (never assert they already cut power); skip the reset test entirely; complexity: medium at minimum.

## 2. Reset-once rule (customer-safe actions only)

- Allowed once: unplug appliances -> switch the tripped CB fully OFF -> switch ON one time.
- Advise vi:"Anh/chị chỉ bật lại aptomat một lần sau khi rút hết thiết bị." Then vi:"Nếu aptomat nhảy tiếp, anh/chị để nguyên và chờ thợ kiểm tra."
- Never instruct: opening the panel cover, removing or swapping a CB, touching any wire, or holding/taping the handle ON. If the customer proposes it, advise vi:"Anh/chị không dùng băng keo hay vật gì giữ cần aptomat ở vị trí bật." and vi:"Anh/chị không mở nắp tủ điện và không chạm vào dây bên trong."

## 3. Differential branches

Best single discriminator when the pattern is unknown -> ask vi:"Anh/chị rút hết thiết bị ra rồi bật lại aptomat, nó có nhảy ngay không?"

### A. Trips again immediately on reset, loads unplugged -> dead short in fixed wiring
- record affected_area_and_power_state="aptomat nhảy ngay khi bật lại dù đã rút hết thiết bị"
- record access_and_concealed_wiring="nghi chạm chập dây âm tường, cần dò tuyến dây"
- record symptom_and_duration only from the customer's words about when it started; omit if unstated.
- Add fixed_wiring and protective_device to safety_signals (qualified_worker gate). Expect scope_change hidden_wiring_damage or unexpected_wall_or_ceiling_access on site.
- complexity: large. Advise vi:"Anh/chị giữ aptomat đó ở vị trí tắt cho tới khi thợ đến."

### B. Holds when unplugged, trips under combined load -> overload
- ask vi:"Aptomat thường nhảy khi anh/chị bật cùng lúc những thiết bị nào?"
- record device_or_circuit_type="quá tải khi chạy đồng thời nhiều thiết bị công suất lớn"
- record urgency_and_repeat_fault only if the customer states the trips repeat; use their timing words.
- Typical HCMC combo: bếp từ + máy lạnh + bình nóng lạnh on one branch [see: hcmc-context].
- Fix usually means CB/circuit rework at the panel -> add protective_device and distribution_board to safety_signals. If a dedicated circuit is likely needed, also add new_circuit; expect scope_change additional_circuit_required.
- complexity: medium (large if new concealed circuit routing is likely).
- Interim advice vi:"Anh/chị tạm dùng lệch giờ các thiết bị công suất lớn để đỡ nhảy aptomat."

### C. Trips only when ONE specific device runs -> device fault
- ask vi:"Aptomat có nhảy đúng lúc một thiết bị cụ thể chạy không, ví dụ bình nóng lạnh?"
- record device_or_circuit_type="lỗi theo một thiết bị cụ thể" plus the device name the customer gave.
- record parts_or_new_device_requirement="có thể cần sửa hoặc thay thiết bị đó"
- Advise vi:"Anh/chị rút hoặc tắt thiết bị đó và không dùng lại cho tới khi kiểm tra."
- Deterministic scope split:
  - Device is an air conditioner with an internal fault -> set scope_signal=service_mismatch; suggested_service=hvac.
  - Customer wants a portable plug-in appliance (quạt, nồi cơm) itself repaired -> set scope_signal=out_of_scope.
  - Customer wants the outlet/circuit side checked -> set scope_signal=in_scope; complexity: small.
  - Device is a fixed installation (bình nóng lạnh, bếp từ) -> set scope_signal=in_scope; complexity: medium.

### D. RCBO/ELCB (CB chống giật) trips -> leakage / rò điện
- ask vi:"Aptomat chống giật có hay nhảy khi bật bình nóng lạnh hoặc lúc trời mưa không?"
- Trips on rainy days / mùa mưa -> record symptom_and_duration using the customer's words about rain-day timing; moisture ingress at outdoor-facing outlets or damp walls is the common HCMC pattern [see: hcmc-context].
- Trips when the water heater runs -> record device_or_circuit_type="nghi rò điện bình nóng lạnh"; advise vi:"Anh/chị tắt aptomat bình nóng lạnh và ngưng dùng cho tới khi kiểm tra."
- Visible water near any outlet/panel -> add water_near_power to safety_signals.
- record affected_area_and_power_state="chỉ nhánh chống giật bị ngắt, khu vực còn lại vẫn có điện" (only if the customer confirms this state).
- Add protective_device to safety_signals. If leakage traces into walls, also add fixed_wiring; expect scope_change hidden_wiring_damage.
- complexity: medium.

### E. Aging / nuisance breaker
- ask vi:"Aptomat có nhảy lúc nhà dùng rất ít thiết bị, không theo quy luật nào không?"
- Signs: random trips at low load, loose or hot handle, buzzing at the panel, CB cũ nhiều năm.
- Buzzing or hot smell at the panel -> re-run section 1 first (smoke_or_burning if khét).
- record symptom_and_duration="nhảy ngẫu nhiên khi tải thấp, không theo quy luật"
- record parts_or_new_device_requirement="có thể cần thay aptomat cùng thông số"
- Replacement happens inside the panel -> add protective_device and distribution_board to safety_signals. Expect scope_change panel_or_protective_device_damage if the board itself is degraded.
- complexity: small.

## 4. Slot map and fallback

| Branch | Primary quote_driver facts | complexity |
|---|---|---|
| A short | affected_area_and_power_state, access_and_concealed_wiring | large |
| B overload | device_or_circuit_type, urgency_and_repeat_fault | medium |
| C device | device_or_circuit_type, parts_or_new_device_requirement | small (medium if fixed installation) |
| D leakage | symptom_and_duration, device_or_circuit_type, affected_area_and_power_state | medium |
| E aging CB | symptom_and_duration, parts_or_new_device_requirement | small |

- Confidence: single clean branch match -> 0.8–0.9; two candidate branches -> 0.5–0.6, needs_clarification=true with the one question that splits them; report unfilled keys in missing_slots (exact quote_driver keys only).
- Customer confirms trips but no pattern fits after one clarification -> keep problem_slug=breaker_trip, needs_clarification=true. Only if breaker involvement itself is unclear -> fall back per [see: fallback-disambig].
- Repeat visits for the same trip -> record urgency_and_repeat_fault="sự cố tái diễn sau lần sửa trước"; raise complexity one level.


---

# PB2 — outage-whole (power_outage_whole_unit, cúp điện cả căn hộ)

The unit has one main aptomat (CB tổng) plus branch CBs. The meter, riser, and corridor equipment belong to the building (BQL/EVN), never to a NestScout worker [see: hcmc-context].

## 0. Entry disambiguation

- Customer reports no power anywhere in the unit -> set problem_slug=power_outage_whole_unit; continue at 1.
- Unclear whether whole unit or partial -> ask vi:"Điện mất ở toàn bộ căn hộ hay chỉ ở một vài phòng?"
  - Only some rooms or devices dead -> set problem_slug=power_outage_one_room [see: outage-room].
- Outage caused by a visible water leak -> stay in this tree; add water_near_power to safety_signals; scope_signal stays in_scope.

## 1. Zero-cost external check (always first)

- ask vi:"Đèn hành lang hoặc nhà hàng xóm cùng tầng có còn điện không?"
- Corridor dark OR neighbors also out -> building / floor / EVN outage:
  - record affected_area_and_power_state="cả tầng hoặc tòa nhà mất điện, không riêng căn hộ"
  - set scope_signal=out_of_scope (meter, riser, corridor equipment are building property; no worker dispatch)
  - advise A1 [see: safety-advisory]. No complexity note needed.
- Corridor and neighbors have power -> the fault is at or inside the unit:
  - record affected_area_and_power_state="chỉ căn hộ mất điện, hành lang vẫn có điện"
  - go to 2.

## 2. Main aptomat (CB tổng) state

- ask vi:"Aptomat tổng trong căn hộ đang bật hay đã sập xuống vị trí tắt?"
- CB tổng DOWN / tripped:
  - record device_or_circuit_type="aptomat tổng bị sập"
  - Follow [see: breaker-trip] for the reset-once test and overload-vs-short logic.
  - Reset holds after unplugging heavy devices -> set problem_slug=breaker_trip; complexity: small.
  - Re-trips immediately or will not stay on -> set problem_slug=breaker_trip; add protective_device to safety_signals; complexity: medium [see: breaker-trip].
- CB tổng ON but the unit is still dead -> go to 3.
- Customer cannot find or reach the panel:
  - record access_and_concealed_wiring="khách chưa xác định được vị trí aptomat tổng"
  - needs_clarification=true; missing_slots=[device_or_circuit_type]; keep problem_slug=power_outage_whole_unit; complexity: medium.

## 3. Meter / billing / supply branch (CB ON, unit dead, neighbors fine)

- ask vi:"Anh/chị có nhận thông báo cắt điện hoặc nhắc thanh toán tiền điện gần đây không?"
- Cutoff notice, unpaid bill, or a sub-meter/prepaid arrangement possibly out of credit (thường gặp ở căn hộ dịch vụ, đồng hồ phụ với chủ nhà):
  - record symptom_and_duration="mất điện sau thông báo cắt điện hoặc vấn đề tiền điện"
  - set scope_signal=out_of_scope (reconnection and meter work belong to EVN/BQL/chủ nhà) -> advise A2 [see: safety-advisory].
- No billing issue:
  - Suspect the supply path: meter output, riser tap, or the main line into the unit.
  - Meter/riser side is BQL boundary -> advise A1; a worker may still verify the unit panel downstream.
  - record urgency_and_repeat_fault only from the customer's stated urgency.
  - go to 4.

## 4. Main CB / main wiring fault (in worker scope)

- keep problem_slug=power_outage_whole_unit.
- Add distribution_board and protective_device to safety_signals (work sits at the unit panel; the main CB may have failed).
- ask vi:"Điện mất đột ngột hay ngay sau khi bật thiết bị công suất lớn?"
- Sudden loss, no trigger event, CB still ON:
  - Suspect a failed main CB or a loose main connection at the unit panel.
  - record parts_or_new_device_requirement="có thể cần thay aptomat tổng"
  - complexity: medium. Scope may grow via panel_or_protective_device_damage.
- Loss right after a high-power device (bình nóng lạnh, bếp điện) or after an earlier burning smell:
  - Possible damaged upstream conductor -> add fixed_wiring to safety_signals.
  - record access_and_concealed_wiring="nghi ngờ dây nguồn chính âm tường bị hỏng"
  - complexity: large. Scope may grow via hidden_wiring_damage or unexpected_wall_or_ceiling_access.

## Safety overlay (evaluate in every branch)

- Burning smell or smoke now -> add smoke_or_burning to safety_signals; advise A3.
- Sparks at panel, meter box, or outlet -> add sparking to safety_signals; advise A3.
- Exposed wires or a missing panel cover -> add exposed_live_parts to safety_signals; advise A4.
- Water near panel, meter, or outlets -> add water_near_power to safety_signals; advise A3.
- Never instruct opening the panel cover, touching wiring, or repeated resets. Allowed customer actions only: one CB off/on, unplugging devices, keeping distance, cutting power at the aptomat.

## Advisory strings (delivered by the advisory step, never inside intake JSON)

- A1 vi:"Anh/chị vui lòng liên hệ ban quản lý tòa nhà để kiểm tra nguồn điện chung."
- A2 vi:"Anh/chị vui lòng kiểm tra với điện lực hoặc ban quản lý về việc cấp điện lại."
- A3 vi:"Anh/chị hãy tắt aptomat tổng, rút bớt thiết bị và tránh xa khu vực đó."
- A4 vi:"Anh/chị vui lòng giữ khoảng cách với dây hở và không chạm vào tủ điện."

## Output guidance

- confidence ≥0.8 only when both the corridor check (1) and the CB state (2) are answered; otherwise ≤0.6.
- needs_clarification=true while branch 1 or 2 is unresolved; missing_slots lists the unanswered quote_driver keys, e.g. [affected_area_and_power_state, device_or_circuit_type].
- One question per turn, in tree order 1 -> 2 -> 3 -> 4; never re-ask an answered branch.
- scope_signal defaults to in_scope; out_of_scope only on the building/EVN branches above. service_mismatch is not expected here (a tripped water-heater CB story is still electrical).
- customer_sentiment: use only neutral | detail_oriented | pressure. Whole-unit outages often read as pressure (urgency, push for speed); default neutral; detail_oriented if the customer asks for specifics.


---

# PB3 — outage-room (power_outage_one_room, mất điện một khu vực)

One room or one group of points is dead while the rest of the unit has power. Circuit-level fault by definition [see: PB0 scope boundary: ≥2 dead outlets or lights+outlets dead in one area routes HERE, not to outlet-switch].

## 0. Entry and disambiguation

- One room/area dead (đèn, ổ cắm hoặc cả hai trong một khu vực) -> set problem_slug=power_outage_one_room.
- Whole unit dead -> set problem_slug=power_outage_whole_unit [see: outage-whole].
- Exactly ONE outlet or ONE switch misbehaving -> set problem_slug=outlet_or_switch_broken [see: outlet-switch].
- One light fixture dead or flickering, outlets fine -> set problem_slug=flickering_light [see: flickering].
- Customer leads with "aptomat nhảy" -> set problem_slug=breaker_trip [see: breaker-trip].

## 1. Safety overlay (always first)

Same four checks as [see: breaker-trip] section 1: khét/khói -> smoke_or_burning; lửa xẹt -> sparking; dây hở -> exposed_live_parts; ẩm ướt gần điểm điện -> water_near_power. Any hit -> advise the matching template [see: safety-advisory]; complexity: medium at minimum.

## 2. Branch CB check (the cheapest decisive test)

- ask vi:"Trong tủ điện căn hộ có aptomat nhánh nào đang sập xuống vị trí tắt không?"
- A branch CB is DOWN:
  - record device_or_circuit_type="aptomat nhánh của khu vực bị sập"
  - Apply the reset-once rule [see: breaker-trip section 2].
  - Reset holds -> transient event; complexity: small; record symptom_and_duration from the customer's words about when it happened.
  - Re-trips -> set problem_slug=breaker_trip and continue in [see: breaker-trip] branch A/B/C with facts carried over.
- No CB is down (or the customer cannot tell) -> go to 3.
  - Customer cannot check the panel -> record access_and_concealed_wiring="khách chưa kiểm tra được tủ điện"; needs_clarification=true; missing_slots=[device_or_circuit_type].

## 3. What exactly is dead (splits outlet-circuit vs lighting-circuit vs shared feed)

- ask vi:"Khu vực đó mất cả đèn lẫn ổ cắm hay chỉ một trong hai?"
- Only OUTLETS dead in the area:
  - record device_or_circuit_type="mạch ổ cắm của khu vực bị mất điện"
  - record affected_area_and_power_state="ổ cắm khu vực mất điện, đèn vẫn sáng"
  - Suspect a failed connection at the first dead outlet upstream (common: burnt termination in one outlet box feeding the rest).
  - complexity: medium.
- Only LIGHTS dead in the area:
  - record device_or_circuit_type="mạch đèn của khu vực bị mất điện"
  - Suspect switch feed or a lighting junction above the false ceiling (trần thạch cao) [see: hcmc-context].
  - complexity: medium.
- BOTH dead, branch CB confirmed ON:
  - Suspect a shared feed/junction fault, usually concealed.
  - record access_and_concealed_wiring="nghi mối nối âm tường hoặc trên trần thạch cao của khu vực"
  - Add fixed_wiring to safety_signals (qualified_worker gate); expect scope_change unexpected_wall_or_ceiling_access or hidden_wiring_damage.
  - complexity: large.

## 4. Weak/partial power variant (đèn sáng yếu, thiết bị chập chờn trong khu vực)

- Symptoms: lights glow dim in that area, devices restart, some outlets "half work".
- Suspect a deteriorating (loose/burnt) connection on the circuit — a genuine fire-risk precursor handled with calm wording.
- record symptom_and_duration using the customer's words; record affected_area_and_power_state="khu vực có điện yếu hoặc chập chờn".
- Add fixed_wiring to safety_signals. If any burning smell is mentioned, also add smoke_or_burning and advise its template [see: safety-advisory].
- Advise vi:"Anh/chị tạm rút các thiết bị trong khu vực đó và hạn chế dùng cho tới khi thợ kiểm tra."
- complexity: medium (large if concealed access is implied).

## 5. Slot-filling order (one question per turn, only for missing_slots)

1. device_or_circuit_type — branch CB question (section 2).
2. affected_area_and_power_state — what-is-dead question (section 3).
3. symptom_and_duration -> ask vi:"Khu vực đó mất điện từ khi nào ạ?"
4. access_and_concealed_wiring -> ask vi:"Trần khu vực đó là thạch cao hay bê tông ạ?"
5. urgency_and_repeat_fault -> ask vi:"Khu vực này từng bị mất điện tương tự trước đây chưa ạ?"
6. parts_or_new_device_requirement — usually determined on site; do not ask the customer for parts here.

## 6. Output guidance

- Confidence: branch CB answered + what-is-dead answered -> 0.8–0.9; only one of the two answered -> 0.5–0.6 with needs_clarification=true.
- scope_signal stays in_scope for all branches here (in-unit circuits are worker territory).
- complexity defaults: CB reset resolves = small; single-circuit tracing = medium; concealed junction / both-dead = large [see: complexity-rubric].


---

# PB4 — flickering (flickering_light, đèn chớp nháy)

Customer words that route here: "đèn chớp", "đèn nháy", "đèn mờ", "đèn lúc sáng lúc tối", "đèn không sáng" (single fixture).

## 0. Route-in disambiguation (run BEFORE setting the slug)

- One light fully DEAD, outlets and other lights fine -> stay here as a fixture fault (bulb/driver/holder family). [VERIFY: catalog intent — dead single fixture has no dedicated slug; nearest family is flickering_light.]
- Whole area (lights + outlets) dead -> set problem_slug=power_outage_one_room [see: outage-room].
- Complaint is the switch itself (kẹt, gãy, lỏng) -> set problem_slug=outlet_or_switch_broken [see: outlet-switch].
- Customer wants a NEW light installed, no fault -> set problem_slug=install_device [see: install-device].
- The "flickering" thing is the air conditioner unit or its display -> set scope_signal=service_mismatch; suggested_service=hvac.
- Otherwise -> set problem_slug=flickering_light; scope_signal=in_scope.

## 1. Safety scan (always first, every turn)

- Burning smell at fixture, switch, or ceiling -> add smoke_or_burning to safety_signals; advise vi:"Anh/chị vui lòng tắt aptomat khu vực đèn và giữ khoảng cách với vị trí có mùi khét."
- Visible sparks at lampholder or switch -> add sparking to safety_signals; advise vi:"Anh/chị vui lòng tắt công tắc và không chạm vào đèn cho tới khi thợ kiểm tra."
- Exposed wires at fixture or a hanging lampholder -> add exposed_live_parts to safety_signals; advise vi:"Anh/chị vui lòng không chạm vào dây hở và tắt aptomat khu vực đèn."
- Water dripping near the light (ceiling leak from the unit above is common in chung cư) -> add water_near_power to safety_signals; advise vi:"Anh/chị tắt aptomat khu vực đó và tránh chạm vào đèn bị dính nước."
- Never ask the customer to inspect closer, climb, or open the fixture.

## 2. Primary fork — how many fixtures

- IF affected_area_and_power_state unknown -> ask vi:"Đèn chớp nháy ở một bóng hay nhiều bóng cùng lúc ạ?"
- ONE fixture -> Branch A. SEVERAL fixtures, same room/circuit -> Branch B. ALL or most lights in the unit -> Branch C.

## Branch A — single fixture (most common; default complexity small)

- record affected_area_and_power_state="một bóng đèn chớp nháy, khu vực còn điện bình thường"
- IF fixture type unknown -> ask vi:"Bóng bị chớp là LED âm trần hay đèn tuýp dài ạ?"
- LED downlight/panel (âm trần thạch cao, very common in HCMC chung cư):
  - Flicker after warm-up or random blink -> LED driver (nguồn LED) end-of-life; record device_or_circuit_type="đèn LED âm trần, nghi hỏng driver nguồn"; complexity: small.
  - Faint glow or blink when the switch is OFF -> switch with an indicator lamp leaking a small current; record device_or_circuit_type="đèn LED nháy mờ khi tắt, nghi công tắc có đèn báo"; complexity: small.
- Fluorescent tube (đèn huỳnh quang chấn lưu, older blocks): flicker at startup, dark ends -> tube or starter end-of-life; record device_or_circuit_type="đèn huỳnh quang, nghi hết tuổi thọ bóng hoặc tắc te"; complexity: small.
- A spare bulb fixes it or re-seating changes the flicker -> loose lampholder/contact; record device_or_circuit_type="đui đèn hoặc tiếp xúc lỏng"; complexity: small.
- Flicker follows the wall switch -> ask vi:"Anh/chị lay nhẹ công tắc thì đèn có nháy theo không ạ?" Yes -> record device_or_circuit_type="công tắc tiếp xúc kém, đèn nháy theo công tắc"; complexity: small.
- Single fixture + type known + no safety signals -> confidence 0.8–0.9, needs_clarification=false.

## Branch B — several fixtures on one circuit

- record affected_area_and_power_state="nhiều đèn cùng khu vực chớp nháy"
- IF timing unknown -> ask vi:"Đèn nháy liên tục hay chỉ nháy khi máy lạnh, bình nóng lạnh khởi động ạ?"
- Flicker ONLY when a high-power device starts -> voltage dip on a shared circuit:
  - record symptom_and_duration="đèn sụt sáng khi thiết bị công suất lớn khởi động"
  - complexity: medium (check circuit loading and connections).
- Random flicker, several fixtures, NO device correlation -> shared connection/junction fault:
  - Add fixed_wiring to safety_signals (concealed wiring is standard: âm tường, âm trần).
  - record access_and_concealed_wiring="dây âm tường hoặc âm trần, nghi mối nối chung có vấn đề"
  - complexity: medium.
- Escalation rule (EXACT): several fixtures AND (burning smell OR the aptomat has tripped at least once):
  - Add smoke_or_burning to safety_signals if a smell is reported; add fixed_wiring and protective_device if the aptomat tripped.
  - record urgency_and_repeat_fault="nhiều đèn nháy kèm mùi khét hoặc aptomat nhảy"
  - complexity: large; if repeated tripping dominates the complaint -> set problem_slug=breaker_trip [see: breaker-trip].
  - Advise vi:"Anh/chị nên tắt aptomat khu vực đèn và chờ thợ kiểm tra đường dây."

## Branch C — whole unit dims or flickers

- ask vi:"Đèn nhà hàng xóm cùng tầng có bị chớp nháy giống nhà mình không ạ?"
- Neighbors ALSO affected -> building supply fluctuation; BQL owns the riser:
  - record affected_area_and_power_state="cả căn hộ và hàng xóm cùng bị, nghi nguồn tòa nhà"
  - keep scope_signal=in_scope (worker verifies in-unit first — deliberate exception to the outage rule, see PB0); complexity: medium.
  - Advise vi:"Anh/chị nên báo thêm ban quản lý tòa nhà để kiểm tra nguồn điện chung."
- Only THIS unit affected -> suspect the main connection at the unit distribution board:
  - Add distribution_board and fixed_wiring to safety_signals.
  - record device_or_circuit_type="toàn căn hộ nháy, nghi điểm đấu tại tủ điện căn hộ"
  - complexity: large. Never ask the customer to open the panel or tighten anything.

## Slot-filling order (one question per turn, only for missing_slots)

1. affected_area_and_power_state — fork question (section 2).
2. device_or_circuit_type — fixture type question (Branch A).
3. symptom_and_duration -> ask vi:"Tình trạng nháy đèn bắt đầu từ khi nào ạ?"
4. access_and_concealed_wiring -> ask vi:"Trần khu vực đèn là thạch cao hay bê tông ạ?"
5. parts_or_new_device_requirement -> ask vi:"Anh/chị muốn thợ mang bóng thay thế hay nhà đã có sẵn ạ?"
6. urgency_and_repeat_fault -> ask vi:"Nhà mình từng sửa hoặc thay đèn này trước đây chưa ạ?"

## Complexity and scope summary

- small: one fixture — bulb, tube, starter, LED driver, lampholder, or switch contact.
- medium: multi-fixture voltage dip, shared connection fault, or building-supply suspicion needing in-unit verification.
- large: whole-unit flicker at the distribution board, or multi-fixture + smoke_or_burning/protective_device signals.
- Likely mid-job triggers from this tree: hidden_wiring_damage, panel_or_protective_device_damage, unexpected_wall_or_ceiling_access, different_parts_or_device_required.


---

# PB5 — outlet-switch (outlet_or_switch_broken, ổ cắm / công tắc hỏng)

Flush-mounted outlets/switches on concealed conduit in brick/concrete walls; older blocks may use surface trunking (nẹp nổi) [see: hcmc-context]. Every `ask` implies needs_clarification=true and adds that branch's quote_driver key to missing_slots.

## 0. Entry and disambiguation (run first)

- Customer names ONE outlet (ổ cắm), switch (công tắc), or plug point misbehaving -> set problem_slug=outlet_or_switch_broken.
- TWO or more outlets dead, or a whole area (lights + outlets) dead -> set problem_slug=power_outage_one_room [see: outage-room].
- Whole apartment dead -> set problem_slug=power_outage_whole_unit [see: outage-whole].
- Aptomat/CB trips whenever that outlet is used -> set problem_slug=breaker_trip [see: breaker-trip].
- Light dims or flickers, switch and outlet themselves fine -> set problem_slug=flickering_light [see: flickering].
- Customer wants a NEW outlet/switch where none exists -> set problem_slug=install_device [see: install-device].
- Pure mounting job, no electrical connection (shelf, hook, TV bracket) -> set scope_signal=service_mismatch; suggested_service=handyman.
- Cannot tell which of the above -> ask vi:"Ổ cắm đó mất điện riêng hay cả phòng cũng mất điện ạ?"

## 1. Safety triage (ALWAYS before symptom questions)

- Burn smell (mùi khét), scorch marks, melted/deformed faceplate:
  - Add smoke_or_burning to safety_signals.
  - Advise vi:"Anh/chị vui lòng ngắt aptomat khu vực đó ngay." then vi:"Sau khi ngắt điện, anh/chị rút phích cắm ra và không chạm vào ổ."
- Sparks (đánh lửa) when plugging in or flipping the switch:
  - Add sparking to safety_signals; advise vi:"Anh/chị tạm ngưng dùng ổ cắm đó cho tới khi thợ kiểm tra."
  - Exception: a single small flash only when plugging a high-load device (bàn ủi, ấm siêu tốc), no marks -> normal contact arcing; do NOT add the signal; ask vi:"Ổ cắm đánh lửa mỗi lần cắm hay chỉ khi cắm thiết bị công suất lớn ạ?"
- Cover cracked/broken with metal parts or copper visible:
  - Add exposed_live_parts to safety_signals; advise vi:"Anh/chị không chạm vào phần hở và ngắt aptomat khu vực đó giúp em."
- Outlet/switch in a bathroom, near a sink or washing machine, or on a visibly damp wall:
  - Add water_near_power to safety_signals; advise vi:"Anh/chị giữ tay khô và tạm ngưng dùng ổ cắm ở khu vực ướt đó."
  - Dampness from a pipe leak -> record affected_area_and_power_state="tường ẩm gần ổ cắm, nghi rò rỉ nước" (worker flags plumbing follow-up on site).
- Water proximity unknown for any bathroom/kitchen mention -> ask vi:"Ổ cắm đó có nằm trong nhà tắm hoặc gần bồn rửa không ạ?"

## 2. Symptom branches

### A. Dead outlet (ổ cắm không có điện) — single point only
- ask vi:"Anh/chị cắm thử sạc điện thoại vào ổ đó thì có điện không ạ?" (rules out a dead device)
- Only that ONE outlet dead, room otherwise powered:
  - record affected_area_and_power_state="một ổ cắm mất điện, khu vực còn lại bình thường"
  - record device_or_circuit_type="ổ cắm đơn trên mạch chung của phòng"
  - complexity: small (worn contact or loose termination at that point).
- More than one point dead -> reroute to [see: outage-room] (circuit-level).

### B. Loose plug retention (ổ lỏng, phích tự rơi)
- ask vi:"Phích cắm vào có bị lỏng, tự rơi ra hay phải giữ mới có điện không ạ?"
- Plug falls out or needs holding -> worn spring contacts; like-for-like swap.
  - record parts_or_new_device_requirement="thay ổ cắm mới cùng loại tại vị trí cũ"
  - complexity: small.
- Loose AND warm faceplate or intermittent flashes -> treat as the sparking branch in section 1.

### C. Sparking on plug-in
- Handled in section 1. After the safety step:
  - record symptom_and_duration="đánh lửa khi cắm phích" plus the customer's own timing words.
  - record urgency_and_repeat_fault only if the customer states it repeats or pushes for a fast visit.
  - complexity: small if isolated to one outlet; medium if scorch marks are present (conductor ends must be cut back and re-terminated).

### D. Burn marks / melted faceplate
- Handled in section 1 (smoke_or_burning). Then:
  - If the customer only reported a smell -> ask vi:"Mặt ổ cắm có vết cháy sém hoặc nhựa bị chảy không ạ?"
  - record parts_or_new_device_requirement="thay ổ cắm bị cháy, cắt lại đầu dây"
  - Melting deep into the wall box or discolored wall paint -> add fixed_wiring to safety_signals; record access_and_concealed_wiring="hư hỏng nhiệt có thể lan vào ống âm tường"; complexity: medium.
  - Faceplate-only scorch, wall clean -> complexity: small.

### E. Physically broken cover (bể mặt ổ / công tắc)
- Internals or metal visible -> section 1 exposed_live_parts branch first.
- Cover cracked only, internals intact, power still works:
  - record parts_or_new_device_requirement="thay mặt ổ hoặc cả cụm cùng kích thước"
  - complexity: small.

### F. Switch not controlling its fixture (bật công tắc không lên)
- ask vi:"Công tắc đó điều khiển đèn, quạt hay bình nóng lạnh ạ?"
- Then ask vi:"Bật công tắc thì đèn hoàn toàn không sáng hay thỉnh thoảng vẫn sáng ạ?" (intermittent -> consider flickering_light [see: flickering])
- Lamp fixture, never lights, switch loose or no click -> worn switch, like-for-like.
  - record device_or_circuit_type="công tắc đèn, một điểm đèn"; complexity: small.
- Bình nóng lạnh (water heater) switch dead or heat-discolored:
  - record device_or_circuit_type="công tắc bình nóng lạnh, tải lớn, đường riêng"
  - complexity: medium; bathroom location -> also run the water_near_power check in section 1.
- Customer wants the switch MOVED, or a second switch for the same light added:
  - Add new_circuit to safety_signals; record access_and_concealed_wiring="cần đi dây mới, nhiều khả năng đục tường"; complexity: large.

## 3. Complexity split: like-for-like vs rewiring

- small: same position, existing box, conductors intact -> swap the unit only.
- medium: burnt/brittle conductor ends or damage reaching into the box -> re-terminate or pull new conductor through existing conduit; add fixed_wiring to safety_signals.
- large: new run, relocated point, or work at the distribution board -> add new_circuit (and distribution_board if panel work is named) to safety_signals; confirm intent: ask vi:"Anh/chị muốn thay ổ mới ngay vị trí cũ hay dời sang vị trí khác ạ?"

## 4. Quote-driver fact checklist (fill before quote-ready)

- affected_area_and_power_state: which room, which point, what still has power.
- device_or_circuit_type: outlet vs switch, load served (đèn / quạt / bình nóng lạnh).
- symptom_and_duration: dead / loose / sparking / burnt, plus the customer's timing words.
- access_and_concealed_wiring: surface trunking vs concealed conduit, signs damage extends into the wall.
- parts_or_new_device_requirement: like-for-like unit vs new parts vs relocation materials.
- urgency_and_repeat_fault: recurring fault, safety signal present, customer timing pressure.


---

# PB6 — install-device (install_device, lắp đặt thiết bị điện)

No fault exists; the customer wants something installed, replaced, or moved. The decisive complexity question is always the WIRING PATH, not the device.

## 0. Entry and disambiguation

- Install/replace/move an electrical device (đèn, quạt trần, ổ cắm thêm, công tắc, bình nóng lạnh, chuông cửa) -> set problem_slug=install_device.
- Air conditioner install/relocate/gas refill -> set scope_signal=service_mismatch; suggested_service=hvac.
- Pure mounting with NO electrical connection work (treo tivi, khoan kệ, rèm cửa, lắp đèn cắm phích sẵn) -> set scope_signal=service_mismatch; suggested_service=handyman.
- Device exists and is BROKEN -> route to the matching fault tree instead ([see: outlet-switch], [see: flickering], [see: breaker-trip]).
- Industrial/3-phase, EV charger, generator, solar system -> set scope_signal=out_of_scope [see: fallback-disambig].

## 1. Identify the device and location

- IF device unknown -> ask vi:"Anh/chị cần lắp thiết bị điện nào ạ?"
- record device_or_circuit_type with the device named plus its load class:
  - Light class (đèn, quạt hút, chuông cửa): low load.
  - Fan class (quạt trần): low load + mounting strength matters.
  - High-load class (bình nóng lạnh, bếp từ, máy nước nóng trực tiếp): dedicated circuit expected.
- IF location unknown -> ask vi:"Vị trí lắp nằm ở phòng nào trong căn hộ ạ?"
- record affected_area_and_power_state="lắp mới tại <vị trí khách nêu>, khu vực đang có điện bình thường" (only as the customer states it).

## 2. The decisive fork — existing point vs new wiring

- ask vi:"Vị trí lắp đã có sẵn điểm điện hay cần đi dây mới ạ?"
- EXISTING point, like-for-like or same-position swap (thay đèn cũ, thay quạt trần cũ, thêm ổ vào đế có sẵn):
  - record access_and_concealed_wiring="đã có điểm điện sẵn tại vị trí lắp"
  - complexity: small.
- NEW point in the same room, wiring can run in surface trunking (nẹp nổi):
  - record access_and_concealed_wiring="cần đi dây mới nổi trong nẹp"
  - Add fixed_wiring to safety_signals (new fixed wiring is qualified_worker work).
  - complexity: medium.
- NEW point needing concealed chase (âm tường) or ceiling run:
  - record access_and_concealed_wiring="cần đục tường hoặc đi dây âm trần cho điểm mới"
  - Add fixed_wiring to safety_signals; expect scope_change unexpected_wall_or_ceiling_access.
  - complexity: large. Note: BQL work-hour rules for drilling apply [see: hcmc-context].
- HIGH-LOAD device (bình nóng lạnh, bếp từ) being installed where no dedicated line is confirmed:
  - Default assumption: a dedicated circuit from the panel is required.
  - Add new_circuit and distribution_board to safety_signals; expect scope_change additional_circuit_required.
  - record device_or_circuit_type="thiết bị công suất lớn, nhiều khả năng cần đường dây riêng từ tủ điện"
  - complexity: large.
  - Only downgrade if the customer confirms an existing dedicated line for that device.

## 3. Parts and device availability

- ask vi:"Thiết bị cần lắp anh/chị đã mua sẵn chưa ạ?"
- Customer has the device -> record parts_or_new_device_requirement="khách đã có thiết bị, thợ mang vật tư đấu nối".
- Customer wants the worker to supply -> record parts_or_new_device_requirement="cần thợ tư vấn và chuẩn bị thiết bị phù hợp"; needs_clarification stays true until the device class is known (spec unknown raises complexity one level [see: complexity-rubric]).
- Advise vi:"Anh/chị chuẩn bị sẵn thiết bị mới và hướng dẫn kèm theo nếu có." [see: safety-advisory 5.4]

## 4. Mounting and access notes (fan/ceiling specifics)

- Quạt trần on a false ceiling (trần thạch cao): the fan must anchor to the structural slab above, not the plasterboard — extra access work. record access_and_concealed_wiring="trần thạch cao, cần điểm treo vào sàn bê tông"; complexity: at least medium. [VERIFY: standard practice claim]
- High ceilings or over-stairwell positions -> record access_and_concealed_wiring with the customer's description; may raise complexity one level.
- Bathroom water heater install: recommend leakage protection as part of the job — if an ELCB/RCBO is to be added at the panel, add protective_device to safety_signals. Never present the current setup as dangerous; wording per [see: safety-advisory] section 3.

## 5. Timing and urgency

- ask vi:"Anh/chị muốn lắp trong tuần này hay lúc nào tiện ạ?" (only if urgency unknown and other slots are filled)
- record urgency_and_repeat_fault with the customer's stated timing; installs are rarely urgent — do not inflate urgency.

## 6. Output guidance

- Confidence: device + wiring-path fork answered -> 0.8–0.9; device known but wiring path unknown -> 0.5–0.6 with the section-2 question.
- scope_signal=in_scope for all electrical installs; mismatches per section 0.
- The wiring-path fork dominates complexity; parts availability only ever moves it one level [see: complexity-rubric].


---

# PB7 — fallback-disambig (electrical-general, other_electrical + service routing)

Two jobs: (1) when to use the two fallback slugs; (2) how to route confusable requests across the six services.

## 1. Fallback slug rules

- Specific slug ALWAYS wins when a tree matches. Fallbacks are last resorts, confidence ≤0.4.
- `other_electrical` — the symptom is clearly electrical but too vague to place after one clarification (per prompts.ts: unclear problem -> the service's other_* fallback slug). Example: "điện nhà em có vấn đề" with no usable detail after asking once.
- `electrical-general` — the request is clear but GENERAL: multi-point inspection, whole-unit check, several small unrelated electrical items in one visit. Example: "kiểm tra lại toàn bộ hệ thống điện căn hộ mới nhận".
- [VERIFY: catalog intent — the electrical-general vs other_electrical split above is my inference from prompts.ts's other_* rule plus the baseline catalog structure; confirm the intended pricing-row semantics.]
- Leakage/rò điện complaints with a body-sensation report ("sờ vào thấy tê") -> `other_electrical`; add exposed_live_parts to safety_signals; advise the matching template [see: safety-advisory]; complexity: medium.

## 2. Service routing table (customer phrasing -> route)

| Customer says (typical VN) | Route | Why |
|---|---|---|
| "máy lạnh không chạy / chảy nước / kêu to / hết gas" | scope_signal=service_mismatch; suggested_service=hvac | AC device internals are hvac |
| "lắp máy lạnh / dời máy lạnh" | service_mismatch -> hvac | AC install is hvac end-to-end |
| "aptomat nhảy khi bật máy lạnh" (fix the circuit) | electrical, breaker_trip | wiring/CB side is electrical [see: breaker-trip] |
| "bình nóng lạnh không nóng / không lên nguồn" | electrical (device fault branch) | power/element side is electrical |
| "bình nóng lạnh rò nước, nhỏ giọt" | service_mismatch -> plumbing | water side is plumbing |
| "máy nước nóng trực tiếp nước yếu" | service_mismatch -> plumbing | flow issue, not electrical |
| "treo tivi, khoan tường, lắp kệ, lắp rèm" | service_mismatch -> handyman | mounting, no electrical connection |
| "lắp đèn cắm phích sẵn, ráp đèn trang trí để bàn" | service_mismatch -> handyman | plug-in assembly, no wiring work |
| "lắp đèn âm trần, câu thêm ổ cắm, thay công tắc" | electrical, install_device | wiring connection involved |
| "lắp quạt trần" | electrical, install_device | wiring + structural anchor |
| "lắp camera, thiết bị wifi" | service_mismatch -> handyman [VERIFY: taxonomy ruling] | low-voltage mounting, not power wiring |
| "chuông cửa hỏng / lắp chuông cửa" | electrical | powered fixture on unit wiring |
| "đèn cầu thang bộ của tòa nhà hỏng" | out_of_scope | building common area (BQL) |
| "lắp trạm sạc xe điện" | out_of_scope | beyond apartment service scope |
| "kéo điện 3 pha, điện xưởng" | out_of_scope | industrial, not apartment |
| "lắp điện mặt trời, pin lưu trữ" | out_of_scope | specialist system |
| "sửa quạt bàn, nồi cơm điện" (the appliance itself) | out_of_scope | portable appliance repair is no service box |
| anything not about the six service boxes | classify unsupported per guardrails | business scope rule |

## 3. Routing output rules

- `service_mismatch` REQUIRES suggested_service set to one of: electrical, plumbing, cleaning, hvac, upholstery, handyman.
- `out_of_scope` -> no suggested_service; the pipeline returns the honest unsupported message.
- Mixed jobs (electrical + another service in one request): classify by the PRIMARY ask; note the secondary in the summary; never split into two slugs yourself.
- When routing away, keep the wording neutral: advise vi:"Phần việc này thuộc nhóm dịch vụ khác, Kael sẽ hướng anh/chị chọn đúng mục nhé."

## 4. Clarify-once rule for vague inputs

- Vague but plausibly electrical ("điện đóm chập chờn", "nhà có mùi lạ gần ổ điện") -> ask ONE splitting question first:
  - ask vi:"Vấn đề anh/chị gặp nằm ở đèn, ổ cắm hay aptomat ạ?"
- Answer places it -> route to the specific tree. Still vague -> set problem_slug=other_electrical; needs_clarification=true; confidence ≤0.4.
- Never burn two turns on classification; after one clarification, commit to the best fallback and let the worker verify on site.


---

# PB8 — hcmc-context (background knowledge the trees reference)

Facts a good HCMC apartment electrician holds in their head. Claims marked [VERIFY] need Tu's field confirmation before this playbook is injected.

## 1. Electrical supply basics

- Residential supply: 220V/50Hz single phase. Three-phase exists only in commercial/industrial contexts -> out_of_scope.
- Grounding quality varies widely; many older units have no effective earth, so leakage shows up as tingling casings (rò điện) instead of an instant RCD trip [see: fallback-disambig section 1].

## 2. Typical unit electrical layout (newer chung cư, ~2010s onward)

- In-unit distribution box (tủ điện căn hộ) near the entrance: one main CB + branch CBs commonly split by lighting / outlets / air conditioners / water heater.
- Wet-area or water-heater branches often have an RCBO/ELCB (aptomat chống giật) in newer builds. [VERIFY: prevalence claim]
- Wiring is concealed (âm tường, âm trần) in conduit; junctions frequently sit above false ceilings (trần thạch cao).
- The electric meter sits OUTSIDE the unit (corridor riser / kỹ thuật shaft), managed by BQL or EVN. Everything beyond the unit door — corridor, riser, lobby, meter — is building territory: `out_of_scope` for a NestScout worker [see: outage-whole].

## 3. Older blocks (chung cư cũ, pre-2000s)

- Surface wiring in trunking (nẹp nổi) or stapled cable; conduit may be absent.
- Aluminum conductors possible in the oldest stock — joints loosen over time, causing warm points and flicker. [VERIFY: prevalence in HCMC blocks]
- Few branch circuits; heavy sharing means overload trips are the default hypothesis for breaker complaints [see: breaker-trip branch B].
- No RCD protection at all in many units -> leakage symptoms surface as tingling, not trips.

## 4. Climate patterns that shape diagnosis

- Rainy season (roughly May–November): moisture ingress at balcony/outdoor-facing outlets, damp walls after prolonged rain -> RCBO nuisance trips and leakage complaints spike [see: breaker-trip branch D].
- Ceiling leaks from the unit above (thấm trần) commonly reach light fixtures first -> water_near_power at lights [see: flickering section 1].
- High year-round humidity corrodes outlet contacts near kitchens/bathrooms.

## 5. High-load device reality

- Common combo in one unit: bình nóng lạnh (~2.5kW), bếp từ (2kW+ per zone), máy lạnh (1–2 per unit), máy giặt.
- Peak-hour overlap (evening cooking + showers + AC) is the classic overload trip window [see: breaker-trip branch B].
- Correct practice: each high-load device on its own dedicated circuit; older or budget builds often share -> the install tree assumes new_circuit for high-load installs unless a dedicated line is confirmed [see: install-device section 2].

## 6. Building management (BQL) operational rules

- Workers register at reception (đăng ký ra vào, leave CCCD or a pass) in most managed blocks -> arrival friction worth reflecting in scheduling advisories. [VERIFY: wording for advisory use]
- Drilling/chiseling (khoan đục) is usually restricted to fixed daytime windows set by BQL -> affects concealed-chase installs and wall-opening repairs [see: install-device section 2].
- Anything touching shared risers or the meter requires BQL involvement — a NestScout worker must not open building equipment.

## 7. Language the customer actually uses (route-in vocabulary)

- aptomat / át / CB / cầu dao = breaker; "sập cầu dao", "nhảy át" = trip.
- cúp điện / mất điện = outage; "điện chập chờn" = unstable power/flicker family.
- ổ cắm = outlet; công tắc = switch; "ổ điện bị xẹt lửa" = sparking outlet.
- rò điện / giật tê tê = leakage; bình nóng lạnh = storage water heater; máy nước nóng trực tiếp = instant water heater.
- No-diacritics and typo'd variants of ALL the above are common in chat ("aptomat nhay", "o cam bi chay") — match on the normalized form, never require diacritics.


---

# PB9 — vision-checklist (photo evidence elicitation)

Binds to the EXACT vision output contract (prompts.ts `buildVisionMessages`): `problem_identified` (Vietnamese), `severity_indicators[]` (Vietnamese), `complexity_hint` (small|medium|large). Nothing else exists on this output.

## 0. Hard rules

- NEVER ask the customer to open the panel cover, dismantle a fixture, or get close to a hazard for a photo. Photos are outside-visible shots only (matches the profile's evidence_suggestions: "breaker state without opening the panel").
- severity_indicators are calm observations, not warnings: state what is visible, never what might happen.
- No money, no digits-as-money, sentences ≤20 words [see: PB0].

## 1. Breaker panel photo (cover ON, door open at most)

Look for:
- Lever positions: which CB sits OFF or in the middle (tripped) position; note the main vs a branch.
- An RCBO/ELCB present (test button visible) vs plain MCBs.
- Soot/scorch marks or browning around the board or a specific CB.
- Crowded taps: multiple conductors squeezed into one terminal, tape-wrapped joints visible at the board edge.
- Legible labels (circuit names, ampere marking) — read them if sharp.

Mapping:
- Tripped branch visible -> problem_identified names the circuit family; complexity_hint=small–medium.
- Scorch/soot at the board -> severity_indicators += "có vết ám khói quanh tủ điện"; complexity_hint=large (panel work implied; the intake side should carry smoke_or_burning if the customer also reports smell).
- Taped joints / crowded terminals -> severity_indicators += "mối nối băng keo tại tủ điện"; complexity_hint at least medium.

## 2. Outlet / switch close-up

Look for:
- Melted or deformed faceplate, browning around pin holes, soot streaks.
- Cracked cover with metal visible.
- Moisture traces, corrosion on pins, damp wall around the plate.
- A multi-way adapter tower (ổ chia nhiều tầng) feeding heavy loads.

Mapping:
- Melt/browning -> severity_indicators += "mặt ổ cắm có vết cháy sém hoặc biến dạng"; complexity_hint=medium (re-termination likely).
- Metal visible -> severity_indicators += "phần kim loại bên trong bị lộ ra ngoài"; intake side carries exposed_live_parts.
- Damp wall/corrosion -> severity_indicators += "khu vực quanh ổ cắm có dấu hiệu ẩm ướt"; intake side carries water_near_power.
- Adapter tower -> severity_indicators += "ổ cắm đang chia tải cho nhiều thiết bị"; supports the overload hypothesis [see: breaker-trip branch B].

## 3. Light fixture photo

Look for:
- Fixture family: LED downlight/panel (âm trần), tube (tuýp), chandelier/pendant.
- Ceiling type: plasterboard (thạch cao) vs bare concrete; approximate height if furniture gives scale.
- Discoloration or melt at the lampholder; a hanging/loose fixture.

Mapping:
- LED downlight + no damage -> problem_identified="đèn LED âm trần nghi hỏng nguồn"; complexity_hint=small.
- Plasterboard ceiling -> supports concealed-junction hypotheses; complexity_hint at least medium when multiple fixtures are affected [see: outage-room section 3].
- Loose/hanging fixture -> severity_indicators += "đèn có dấu hiệu lỏng khỏi trần".

## 4. Device + nameplate photo

Look for: brand/model text, power rating (W/kW), and for water heaters the capacity plate.
Mapping: readable rating -> feeds parts_or_new_device_requirement on the intake side ("thiết bị có nhãn công suất rõ"); unreadable -> keep spec-unknown (raises complexity one level [see: complexity-rubric]).

## 5. Wiring / trunking photo

Look for:
- Surface trunking (nẹp nổi) vs conduit stubs vs bare stapled cable.
- Insulation condition: brittleness, discoloration, rodent damage (vết chuột cắn).
- Tape-wrapped mid-run joints.

Mapping:
- Bare/damaged insulation -> severity_indicators += "vỏ dây có đoạn bị hư hỏng"; intake side carries exposed_live_parts.
- Surface trunking present -> supports medium (not large) rewiring complexity [see: complexity-rubric].

## 6. Output composition rules

- problem_identified: ONE short Vietnamese sentence naming the most likely fault family, hedged ("nghi", "nhiều khả năng").
- severity_indicators: 0–4 items, each a single observed fact from the photos; empty array when photos show nothing notable — never pad.
- complexity_hint: take the HIGHEST level any mapping above produced; default medium when photos are inconclusive.
- Photos contradict the text description -> trust the photo for physical state, the text for history/timing; note the mismatch in problem_identified ("ảnh cho thấy khác với mô tả").


---

# PB10 — complexity-rubric (small / medium / large calibration)

Complexity is qualitative scope reasoning; deterministic synthesizePrice owns all money. Never mention price, cost, or amounts. `complexity:` notes are internal [see: PB0].

## 1. Operational definitions

| Level | Definition |
|---|---|
| small | ONE accessible device (ổ cắm, công tắc, đèn). Like-for-like swap or a single reset. No concealed wiring, no panel internals, no wall/ceiling opening, parts spec known. |
| medium | ONE branch circuit OR fault tracing required (trip cause, dead area). Surface-run wiring (nẹp nổi) only. Standard parts, spec identifiable from photo or label. |
| large | Concealed in-wall/in-ceiling wiring (âm tường — standard in HCMC chung cư), panel or protective-device replacement, new circuit, multiple circuits affected, unknown parts spec, or repeat fault after a prior repair. |

Rule order: start from the slug default (section 2) -> apply escalators (section 3) -> apply de-escalators (section 4). Escalators always beat de-escalators.

## 2. Default complexity by slug — graded examples

| problem_slug | Concrete example | complexity | Notes |
|---|---|---|---|
| outlet_or_switch_broken | One loose ổ cắm, customer has the new outlet | small | record parts_or_new_device_requirement="khách đã có ổ cắm thay thế" |
| outlet_or_switch_broken | Scorched ổ cắm, wall box possibly damaged | medium | melting/heat reported now -> add smoke_or_burning to safety_signals [see: safety-advisory] |
| breaker_trip | CB trips only when bình nóng lạnh runs | medium | record device_or_circuit_type="nghi lỗi theo bình nóng lạnh" |
| breaker_trip | CB trips instantly on every reset, already repaired before | large | record urgency_and_repeat_fault="lỗi tái diễn sau lần sửa trước" |
| flickering_light | One ceiling light flickers, like-for-like lamp/driver swap | small | de-escalated single device |
| flickering_light | Lights flicker in several ROOMS at once | large | multi-circuit/supply-side -> add distribution_board to safety_signals. Same-room multi-fixture stays medium [see: flickering branch B] |
| power_outage_one_room | One room dead, CB stays on, cause unknown | medium | circuit tracing |
| power_outage_one_room | One room dead, suspected in-wall junction fault | large | add fixed_wiring to safety_signals |
| power_outage_whole_unit | Main aptomat tripped under load; resets and holds | small | slug flips to breaker_trip per [see: outage-whole section 2] |
| power_outage_whole_unit | Whole unit dead, building fine, main CB will not hold | large | add distribution_board and protective_device to safety_signals |
| install_device | Replace a light fixture at an existing point, device on hand | small | like-for-like at existing point |
| install_device | New bình nóng lạnh needing its own line from the panel | large | add new_circuit to safety_signals [see: install-device] |
| electrical-general | Whole-unit inspection request for a newly received apartment | medium | multi-point check, no single fault |
| other_electrical | Mild tingling from an appliance casing (rò điện suspected) | medium | add exposed_live_parts to safety_signals; escalate if multiple circuits implicated |

Building-wide outage (neighbors also out) -> set scope_signal=out_of_scope; no complexity applies [see: outage-whole].

## 3. Escalator checklist

Any hit in group A forces large. Each hit in group B raises one level (cap at large).

- Group A (force large):
  - Concealed in-wall/in-ceiling wiring must be opened or traced -> add fixed_wiring to safety_signals; record access_and_concealed_wiring="liên quan dây âm tường"
  - Panel work or protective-device replacement (aptomat/CB, ELCB) -> add distribution_board and protective_device to safety_signals
  - A new circuit is required -> add new_circuit to safety_signals
  - Multiple circuits affected at once -> record affected_area_and_power_state="nhiều mạch cùng bị ảnh hưởng"
- Group B (raise one level):
  - Ceiling or wall access needed beyond a faceplate -> record access_and_concealed_wiring="cần mở tường hoặc trần"
  - Parts spec unknown (no label, no photo) -> record parts_or_new_device_requirement="chưa rõ thông số vật tư"
  - Repeat fault after a prior repair -> record urgency_and_repeat_fault="lỗi tái diễn sau lần sửa trước"

All group A signals also fire the electrical_panel_or_fixed_wiring capability gate (required_action=qualified_worker).

## 4. De-escalators

Apply only if NO group A escalator hit. Floor is small.

- Exactly one device, freely accessible, nothing else affected -> cap at small.
- Like-for-like swap with spec confirmed (photo or label) -> lower one level.
- Customer already has the correct part -> lower one level; record parts_or_new_device_requirement="khách tự cung cấp vật tư".

## 5. Probing questions when complexity is ambiguous (one per turn)

- Concealed vs surface wiring unknown -> ask vi:"Đường dây tới điểm hỏng đi nổi trong nẹp hay âm trong tường?"
- Repeat-fault history unknown -> ask vi:"Sau lần sửa trước, lỗi này có lặp lại không ạ?"
- Single vs multi-room flicker unknown -> ask vi:"Đèn nhấp nháy chỉ ở một phòng hay nhiều phòng cùng lúc?"
- Whole-unit outage, building status unknown -> ask vi:"Căn hộ mất điện toàn bộ hay các nhà hàng xóm cũng đang mất điện?"
- Install part availability unknown -> ask vi:"Thiết bị cần lắp anh/chị đã mua sẵn chưa ạ?"
- Parts spec unknown -> ask vi:"Anh/chị có biết mã hoặc công suất của thiết bị cần thay không?"
- Outlet wiring path unknown -> ask vi:"Ổ cắm cần thay đi dây nổi trong nẹp hay âm tường ạ?"

## 6. Mid-job discovery -> scope_change_triggers (exact keys)

| Discovery on site | scope_change_trigger key | Typical complexity move |
|---|---|---|
| Damaged conductor found inside wall/ceiling while tracing | hidden_wiring_damage | any -> large |
| Aptomat/ELCB or panel internals found damaged | panel_or_protective_device_damage | any -> large |
| Load needs its own dedicated line | additional_circuit_required | any -> large |
| Wall/ceiling opening the intake did not predict | unexpected_wall_or_ceiling_access | raise one level |
| On-site part differs from intake spec | different_parts_or_device_required | raise one level |

Any scope_change trigger pauses work at the confirmation gate; Kael re-scopes before continuing (STRUCTURES.md workflow gates).

## 7. Boundaries

- Never instruct the customer to open the panel or touch wiring [see: safety-advisory].
- Drilling-only mounting belongs to handyman; AC internals belong to hvac [see: fallback-disambig].


---

# PB11 — safety-advisory (wording bank, self-check-safe Vietnamese)

Every vi:"..." string below is pre-checked against self-check.ts: no fear language, no absolute claims, no digits, no money, no sentence over 20 words. Copy templates verbatim; do not paraphrase at runtime.

## 1. Output wiring rules

- `safety_signals[]` holds exact trigger_signal strings from BOTH gates: safety (`smoke_or_burning`, `sparking`, `exposed_live_parts`, `water_near_power`) AND capability (`distribution_board`, `fixed_wiring`, `protective_device`, `new_circuit`). pipeline.ts accepts the union; never invent other strings, never translate them.
- The two gates differ only in required_action: safety signals -> customer_safety_step (section 2 templates, delivered immediately); capability signals -> qualified_worker (section 3 wording, routine tone).
- Multiple safety signals -> add ALL; deliver templates in priority order: water_near_power > smoke_or_burning > sparking > exposed_live_parts.
- Safety template goes FIRST in the reply, before any clarification_question. With an active hazard, ask at most ONE follow-up.
- Advisory strings are delivered by the chat/advisory step — never inside the intake JSON [see: PB0].

## 2. Immediate-hazard templates (gate: electrical_immediate_hazard -> customer_safety_step)

### 2.1 smoke_or_burning
- Detect: "mùi khét", "mùi cháy", "khói", "nóng chảy", "ổ cắm bị đen".
- Add smoke_or_burning to safety_signals.
- vi:"Anh/chị vui lòng ngắt aptomat tổng nếu thao tác được an toàn. Rút phích các thiết bị quanh khu vực có mùi khét. Mở cửa sổ cho thoáng khí. Thợ sẽ kiểm tra kỹ trước khi cấp điện lại."

### 2.2 sparking
- Detect: "tóe lửa", "tia lửa", "đánh lửa", "nổ lẹt đẹt", "chập điện".
- Add sparking to safety_signals.
- vi:"Anh/chị ngắt aptomat của khu vực đang có tia lửa. Không chạm vào ổ cắm hay công tắc đang có tia lửa. Giữ trẻ nhỏ và vật nuôi tránh xa vị trí này. Thợ sẽ xử lý phần còn lại khi đến nơi."

### 2.3 exposed_live_parts
- Detect: "dây hở", "dây trần", "dây đứt lòi ra", "ổ cắm bung", "bị giật tê tay".
- Add exposed_live_parts to safety_signals.
- vi:"Anh/chị không chạm vào dây điện hoặc phần kim loại hở. Ngắt aptomat tổng nếu bảng aptomat khô ráo và dễ với tới. Nhắc người trong nhà tránh xa khu vực đó. Thợ sẽ kiểm tra trực tiếp khi đến."

### 2.4 water_near_power
- Detect: "nước vào ổ cắm", "thấm nước gần điện", "dột lên đèn", "bình nóng lạnh rò nước" kèm dấu hiệu điện, "rò điện" khi có nước.
- Add water_near_power to safety_signals.
- vi:"Anh/chị ngắt aptomat tổng trước khi lại gần khu vực ướt. Không chạm vào ổ cắm hoặc thiết bị đang dính nước. Chưa ngắt điện thì chưa lau nước. Thợ sẽ kiểm tra xong mới cấp điện lại."

## 3. Capability gate wording (electrical_panel_or_fixed_wiring -> qualified_worker)

- Trigger: the job touches distribution_board, fixed_wiring, protective_device, or new_circuit (tủ điện, dây âm tường, thay aptomat/CB, đi đường điện mới). Add the matching signals to safety_signals.
- Tone: routine assignment, not alarm. Never imply the current state is dangerous; only that this work type needs a qualified electrician.
- vi:"Phần tủ điện và dây âm tường cần thợ điện có chuyên môn xử lý. Anh/chị không cần tự thao tác thêm. Bên em sẽ sắp xếp thợ phù hợp cho phần việc này."
- Complexity: at least medium; large when combined with concealed access [see: complexity-rubric].

## 4. NEVER-advise list (hard ban, all cases)

Never tell the customer to:
- Open the distribution board / tủ điện or remove any panel cover.
- Touch, tape, separate, or "test" any wire or terminal, even if it looks dead.
- Replace an aptomat/CB, outlet, or switch themselves.
- Do any DIY rewiring, extend circuits, or bypass a tripping breaker (holding the CB closed, oversizing the fuse).
- Reset a breaker more than once, or reset at all while smoke_or_burning or water_near_power is active.
- Use water on anything electrical.

Allowed customer actions ONLY: switch a breaker off (or on once, no active hazard), unplug devices, keep distance, ventilate, wait for the worker.

## 5. Generic advisory patterns (non-hazard cases)

### 5.1 Breaker trips repeatedly (breaker_trip)
- Condition: no hazard signal, breaker trips again after one reset.
- record urgency_and_repeat_fault="aptomat nhảy lặp lại sau khi bật lại"
- vi:"Anh/chị rút bớt thiết bị công suất lớn trước khi bật lại aptomat. Chỉ bật lại một lần, nếu vẫn cúp thì để nguyên chờ thợ."

### 5.2 Prepare information before the worker arrives (outage slugs)
- Condition: outage confirmed, no hazard signal, worker being arranged.
- vi:"Anh/chị ghi lại phòng nào mất điện và thiết bị nào đang dùng lúc đó. Thông tin này giúp thợ tìm nguyên nhân nhanh hơn."

### 5.3 Isolate a suspect device (outlet_or_switch_broken / breaker_trip)
- Condition: one device suspected, outlet itself intact, no hazard signal.
- vi:"Anh/chị rút phích thiết bị nghi lỗi và tạm dùng ổ cắm khác. Nếu ổ khác hoạt động bình thường, nhiều khả năng lỗi ở thiết bị."
- Suspect confirmed -> record device_or_circuit_type="nghi lỗi ở một thiết bị cắm rời"

### 5.4 Installation preparation (install_device)
- Condition: work_mode=installation, customer supplies the device.
- vi:"Anh/chị chuẩn bị sẵn thiết bị mới và hướng dẫn kèm theo nếu có. Thợ sẽ xem vị trí lắp và tư vấn phương án khi đến."
- record parts_or_new_device_requirement="khách cung cấp thiết bị mới"

## 6. Register rules for all advisory text

- Address the customer as "Anh/chị"; the service side is "bên em". No slang, no emoji.
- Hedge uncertain statements with "nhiều khả năng" / "có thể"; never "chắc chắn", "tuyệt đối", "không bao giờ".
- Describe the action, not the danger: say what to switch off, never what could happen if they do not.
- Mention the worker ("thợ") as the resolver in every safety template so the customer knows the next step is covered.
- Zero digits and zero money words in customer text; complexity talk stays qualitative.


---

# Appendix A — Compressed STABLE prompt segment (the runtime artifact)

Ready to append to the electrical intake-diagnosis system prompt (after the service profile contract). STABLE content — no per-request data — so it is prompt-cacheable (Plan §43 Workstream C). Estimated ~1.6k tokens. Everything below the line is the artifact, verbatim.

---

```text
ELECTRICAL DIAGNOSIS PLAYBOOK (apply when service_type=electrical)

OUTPUT DISCIPLINE
- safety_signals[]: exact strings only, from BOTH gates: smoke_or_burning, sparking, exposed_live_parts, water_near_power (hazard -> customer safety step) and distribution_board, fixed_wiring, protective_device, new_circuit (work type -> qualified worker). Collect across the whole conversation.
- profile_facts: Vietnamese, only what the customer stated or confirmed. Never record advice or assumptions as facts. No timing/quantity the customer did not give.
- clarification_question: ONE Vietnamese question, <=160 chars, exactly one "?", no ";" ":" , at most one comma, and NEVER the word "và" — use "hay"/"hoặc". Ask the question that best splits your top-2 hypotheses. Never re-ask answered facts.
- confidence: 0.8-0.9 single clean branch; 0.5-0.6 two candidate branches (then needs_clarification=true); <=0.4 fallback slugs.
- customer_sentiment: only neutral | detail_oriented | pressure.
- Never mention money or amounts. Never tell the customer to open the panel cover, touch wiring, or reset a breaker more than once.

SAFETY SCAN FIRST (every turn, before any question)
khét/khói/nóng chảy -> smoke_or_burning. tóe lửa/đánh lửa/chập điện -> sparking. dây hở/lòi lõi đồng/giật tê tay -> exposed_live_parts. nước or ẩm near ổ cắm/tủ điện/đèn (dột, mưa tạt, bình nóng lạnh rò) -> water_near_power. Any hit: safety guidance precedes questions; at most one follow-up question that turn.

ROUTING (first match wins)
- máy lạnh/AC device itself (fault, install, gas) -> scope_signal=service_mismatch, suggested_service=hvac. The wiring/CB feeding it stays electrical.
- bình nóng lạnh rò NƯỚC -> service_mismatch: plumbing. Its POWER fault (không lên nguồn, CB nhảy) -> electrical.
- Mounting with no electrical connection (treo tivi, kệ, rèm, đèn cắm phích sẵn) -> service_mismatch: handyman.
- EV charger, 3-phase/industrial, solar, building common areas (hành lang, đồng hồ tổng) -> out_of_scope.
- Portable appliance internal repair (quạt bàn, nồi cơm) -> out_of_scope; the outlet feeding it -> in_scope.

SLUG SELECTION
- aptomat/CB/cầu dao nhảy -> breaker_trip.
- Whole unit dead, CB not tripped -> power_outage_whole_unit.
- One area dead (>=2 outlets, or lights+outlets in one zone) -> power_outage_one_room.
- Exactly ONE outlet/switch faulty -> outlet_or_switch_broken.
- Light flickers/dim/single dead fixture -> flickering_light.
- New install/replacement, no fault -> install_device.
- Clearly electrical but unplaceable after one clarification -> other_electrical. General multi-point inspection request -> electrical-general.

DECISION TREES (condition -> facts, signals, complexity note for downstream)
breaker_trip: key test = unplug all, reset once. (A) re-trips instantly unplugged -> short in fixed wiring; facts: affected_area_and_power_state, access_and_concealed_wiring="nghi chạm chập dây âm tường"; +fixed_wiring +protective_device; large. (B) holds unplugged, trips on combined load -> overload (classic: bếp từ + máy lạnh + bình nóng lạnh); facts: device_or_circuit_type; +protective_device +distribution_board (+new_circuit if dedicated line likely); medium. (C) trips with ONE device -> device fault; if AC -> hvac mismatch; fixed device (bình nóng lạnh, bếp từ) in_scope medium; outlet-side check small. (D) RCBO chống giật trips on rain days or water heater -> leakage; +protective_device (+water_near_power if water visible); medium. (E) random low-load trips, old CB -> aging breaker; +protective_device +distribution_board; small.
power_outage_whole_unit: order: 1) corridor/neighbors check ("Đèn hành lang hoặc nhà hàng xóm cùng tầng có còn điện không?") — building also out -> out_of_scope, refer BQL. 2) main CB state — tripped -> breaker_trip tree. 3) billing/cutoff notice -> out_of_scope (EVN/BQL/chủ nhà). 4) CB on, unit dead, neighbors fine -> failed main CB or main feed; +distribution_board +protective_device; medium (large if damaged concealed feed suspected).
power_outage_one_room: 1) branch CB check — tripped -> reset-once -> holds = transient small, re-trips = breaker_trip. 2) what is dead: outlets-only -> outlet circuit, medium; lights-only -> lighting circuit/junction above trần thạch cao, medium; both -> shared concealed junction; +fixed_wiring; large. Weak/partial power in one area -> deteriorating connection; +fixed_wiring; medium.
flickering_light: single fixture -> bulb/tube end-of-life, LED driver (very common), loose lampholder, or worn switch; small. Several fixtures one circuit: only when high-power device starts -> voltage dip, medium; random -> shared junction fault; +fixed_wiring; medium. Multi-room or whole unit -> supply/panel side; +distribution_board +fixed_wiring; large; if neighbors flicker too, keep in_scope but advise BQL check. Several fixtures + (khét OR CB tripped) -> +smoke_or_burning/+protective_device; large.
outlet_or_switch_broken: one dead outlet (room powered) -> worn contact/termination; small. >=2 dead -> reroute power_outage_one_room. Loose plug retention -> worn springs, like-for-like; small. Sparks on plug-in -> sparking branch (exception: one small flash only with high-load plug, no marks = normal arcing, ask before flagging). Burn/melt -> +smoke_or_burning; medium if heat reaches the wall box (+fixed_wiring). Switch dead: lamp switch small; bình nóng lạnh switch medium + bathroom water check. Move/add switch or outlet position -> +new_circuit; large.
install_device: decisive fork = wiring path. Existing point like-for-like -> small. New surface run (nẹp nổi) -> +fixed_wiring; medium. Concealed chase/ceiling run -> +fixed_wiring; large. High-load install (bình nóng lạnh, bếp từ) -> assume dedicated line needed: +new_circuit +distribution_board; large, unless existing dedicated line confirmed. Quạt trần on trần thạch cao needs anchor to concrete slab -> at least medium. Ask device -> wiring path -> parts ("Thiết bị cần lắp anh/chị đã mua sẵn chưa ạ?").
rò điện/tingling casing -> other_electrical; +exposed_live_parts; medium.

COMPLEXITY RULES
small = one accessible device, like-for-like, spec known. medium = one circuit traced, surface wiring, standard parts. large (forced by any of): concealed wiring opened/traced, panel or protective-device replacement, new circuit, multiple circuits affected. Raise one level: wall/ceiling access, unknown parts spec, repeat fault after prior repair. Lower one level (only if nothing forced large): like-for-like with confirmed spec, customer has the part.

HCMC CONTEXT
220V single phase. Unit panel: main CB + branch CBs; meter/riser/corridor = BQL territory (out_of_scope). Newer blocks: concealed conduit, RCBO on wet circuits. Older blocks: surface wiring, shared overloaded circuits, weak grounding -> leakage shows as tingling. Rainy season -> moisture leakage trips at balcony outlets and water heaters. BQL restricts drilling hours; workers register at reception.

SAFETY WORDING (verbatim when the signal fires; calm, action-only, <=20 words/sentence)
smoke_or_burning: "Anh/chị vui lòng ngắt aptomat tổng nếu thao tác được an toàn. Rút phích các thiết bị quanh khu vực có mùi khét. Mở cửa sổ cho thoáng khí. Thợ sẽ kiểm tra kỹ trước khi cấp điện lại."
sparking: "Anh/chị ngắt aptomat của khu vực đang có tia lửa. Không chạm vào ổ cắm hay công tắc đang có tia lửa. Giữ trẻ nhỏ và vật nuôi tránh xa vị trí này. Thợ sẽ xử lý phần còn lại khi đến nơi."
exposed_live_parts: "Anh/chị không chạm vào dây điện hoặc phần kim loại hở. Ngắt aptomat tổng nếu bảng aptomat khô ráo và dễ với tới. Nhắc người trong nhà tránh xa khu vực đó. Thợ sẽ kiểm tra trực tiếp khi đến."
water_near_power: "Anh/chị ngắt aptomat tổng trước khi lại gần khu vực ướt. Không chạm vào ổ cắm hoặc thiết bị đang dính nước. Chưa ngắt điện thì chưa lau nước. Thợ sẽ kiểm tra xong mới cấp điện lại."
capability gate (panel/fixed wiring/new circuit): "Phần tủ điện và dây âm tường cần thợ điện có chuyên môn xử lý. Anh/chị không cần tự thao tác thêm. Bên em sẽ sắp xếp thợ phù hợp cho phần việc này."
```

---

## Wiring notes (for the implementing PR, not part of the segment)

- Injection point: `buildIntakeDiagnosisMessages()` in prompts.ts — append after `SUPPORTED_SERVICE_PROFILE_CONTRACT`, gated to electrical (or emitted per-service once other playbooks exist). Keep it in the system message so Anthropic-routed calls hit `cache_control`.
- The segment must stay BYTE-STABLE across requests (no interpolation) or the prompt cache never hits.
- A/B safely: env flag `KAEL_PLAYBOOK_ELECTRICAL_ENABLED` following the two-flag pattern already used for learning (read/write split unnecessary here — read-only prompt content).
- Do not inject before the Appendix B baseline run exists.


---

# Appendix B — Eval mini-corpus (24 ground-truth cases)

Subset of the §43 E0 corpus format. `expected` follows THIS playbook's trees. Inputs mimic real chat: some without diacritics, some with typos. Run against staging BEFORE and AFTER injecting Appendix A; the delta is the honest measure of this playbook.

```json
[
  {"id":"el_01","input_text_vi":"aptomat nha em cu bat len la sap lien, rut het do ra van vay","expected":{"problem_slug":"breaker_trip","scope_signal":"in_scope","suggested_service":null,"safety_signals":["fixed_wiring","protective_device"],"needs_clarification":false,"complexity":"large"},"difficulty":"medium","rationale":"Branch A: re-trips instantly with loads unplugged = short in fixed wiring"},
  {"id":"el_02","input_text_vi":"cầu dao chống giật nhà em hay nhảy mỗi khi trời mưa to","expected":{"problem_slug":"breaker_trip","scope_signal":"in_scope","suggested_service":null,"safety_signals":["protective_device"],"needs_clarification":false,"complexity":"medium"},"difficulty":"easy","rationale":"Branch D: RCBO rain-day leakage pattern"},
  {"id":"el_03","input_text_vi":"nhà em mất điện toàn bộ mà đèn hành lang vẫn sáng","expected":{"problem_slug":"power_outage_whole_unit","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":true,"complexity":null},"difficulty":"easy","rationale":"Corridor check answered; main CB state unknown -> ask branch 2 question"},
  {"id":"el_04","input_text_vi":"ca tang chung cu deu bi cup dien roi","expected":{"problem_slug":"power_outage_whole_unit","scope_signal":"out_of_scope","suggested_service":null,"safety_signals":[],"needs_clarification":false,"complexity":null},"difficulty":"easy","rationale":"Building-wide outage = BQL/EVN territory"},
  {"id":"el_05","input_text_vi":"phòng ngủ mất điện cả đèn lẫn ổ cắm, các phòng khác vẫn bình thường","expected":{"problem_slug":"power_outage_one_room","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":true,"complexity":null},"difficulty":"easy","rationale":"One area, both dead; branch CB state unknown -> ask section-2 question"},
  {"id":"el_06","input_text_vi":"o cam phong khach het dien het ca day luon, den van sang","expected":{"problem_slug":"power_outage_one_room","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":true,"complexity":"medium"},"difficulty":"medium","rationale":"PB0 boundary: >=2 dead outlets = circuit-level, NOT outlet_or_switch_broken"},
  {"id":"el_07","input_text_vi":"đèn phòng khách nhấp nháy liên tục, thay bóng mới rồi mà vẫn bị","expected":{"problem_slug":"flickering_light","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":false,"complexity":"small"},"difficulty":"easy","rationale":"Branch A: new bulb did not fix -> driver or holder, still single-fixture small"},
  {"id":"el_08","input_text_vi":"den nha em cu sang roi toi moi khi may lanh chay","expected":{"problem_slug":"flickering_light","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":false,"complexity":"medium"},"difficulty":"medium","rationale":"Branch B: voltage dip when high-power device starts"},
  {"id":"el_09","input_text_vi":"ổ cắm chỗ tivi bị lỏng, cắm sạc cứ bị rớt ra","expected":{"problem_slug":"outlet_or_switch_broken","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":false,"complexity":"small"},"difficulty":"easy","rationale":"Branch B: worn spring contacts, like-for-like swap"},
  {"id":"el_10","input_text_vi":"công tắc đèn nhà tắm bấm hoài không lên","expected":{"problem_slug":"outlet_or_switch_broken","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":true,"complexity":null},"difficulty":"medium","rationale":"Branch F + bathroom -> water-proximity check question expected before closing"},
  {"id":"el_11","input_text_vi":"muốn lắp thêm một ổ cắm ngoài ban công","expected":{"problem_slug":"install_device","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":true,"complexity":null},"difficulty":"easy","rationale":"Install; wiring-path fork unanswered -> section-2 question"},
  {"id":"el_12","input_text_vi":"lap binh nong lanh moi cho nha tam giup em","expected":{"problem_slug":"install_device","scope_signal":"in_scope","suggested_service":null,"safety_signals":["new_circuit","distribution_board"],"needs_clarification":true,"complexity":"large"},"difficulty":"medium","rationale":"High-load install defaults to dedicated-circuit assumption"},
  {"id":"el_13","input_text_vi":"em mới nhận nhà, nhờ thợ kiểm tra lại toàn bộ hệ thống điện căn hộ","expected":{"problem_slug":"electrical-general","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":false,"complexity":"medium"},"difficulty":"easy","rationale":"Clear but general multi-point request -> electrical-general"},
  {"id":"el_14","input_text_vi":"dien nha em dao nay chap chon lam, nhieu thu ky lam","expected":{"problem_slug":"other_electrical","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":true,"complexity":null},"difficulty":"hard","rationale":"Vague symptom -> one splitting question first; commits to other_electrical if still vague"},
  {"id":"el_15","input_text_vi":"sờ vào vỏ tủ lạnh thấy tê tê như bị giật nhẹ","expected":{"problem_slug":"other_electrical","scope_signal":"in_scope","suggested_service":null,"safety_signals":["exposed_live_parts"],"needs_clarification":false,"complexity":"medium"},"difficulty":"medium","rationale":"Leakage/tingling casing -> other_electrical + exposed_live_parts per PB7"},
  {"id":"el_16","input_text_vi":"dien nha minh co van de, khong biet mo ta sao nua","expected":{"problem_slug":"other_electrical","scope_signal":"in_scope","suggested_service":null,"safety_signals":[],"needs_clarification":true,"complexity":null},"difficulty":"easy","rationale":"Too vague -> clarify once, fallback slug, confidence <=0.4"},
  {"id":"el_17","input_text_vi":"máy lạnh nhà em chảy nước quá trời, sửa giúp em","expected":{"problem_slug":null,"scope_signal":"service_mismatch","suggested_service":"hvac","safety_signals":[],"needs_clarification":false,"complexity":null},"difficulty":"easy","rationale":"AC device internals -> hvac"},
  {"id":"el_18","input_text_vi":"bình nóng lạnh bị rò nước nhỏ giọt dưới đáy bình","expected":{"problem_slug":null,"scope_signal":"service_mismatch","suggested_service":"plumbing","safety_signals":[],"needs_clarification":false,"complexity":null},"difficulty":"medium","rationale":"Water heater WATER side -> plumbing (power side would stay electrical)"},
  {"id":"el_19","input_text_vi":"nhờ thợ qua khoan tường treo cái tivi 55 inch","expected":{"problem_slug":null,"scope_signal":"service_mismatch","suggested_service":"handyman","safety_signals":[],"needs_clarification":false,"complexity":null},"difficulty":"easy","rationale":"Pure mounting, no electrical connection -> handyman"},
  {"id":"el_20","input_text_vi":"lắp trạm sạc ô tô điện dưới hầm xe chung cư được không","expected":{"problem_slug":null,"scope_signal":"out_of_scope","suggested_service":null,"safety_signals":[],"needs_clarification":false,"complexity":null},"difficulty":"easy","rationale":"EV charging + building common area -> out_of_scope"},
  {"id":"el_21","input_text_vi":"em cần kéo điện 3 pha cho xưởng may nhỏ","expected":{"problem_slug":null,"scope_signal":"out_of_scope","suggested_service":null,"safety_signals":[],"needs_clarification":false,"complexity":null},"difficulty":"easy","rationale":"Industrial 3-phase -> out_of_scope"},
  {"id":"el_22","input_text_vi":"ổ cắm trong bếp có khói bốc ra kèm mùi khét","expected":{"problem_slug":"outlet_or_switch_broken","scope_signal":"in_scope","suggested_service":null,"safety_signals":["smoke_or_burning"],"needs_clarification":false,"complexity":"medium"},"difficulty":"easy","rationale":"Safety signal + safety template must precede any question"},
  {"id":"el_23","input_text_vi":"day dien may giat bi chuot can lo ca loi dong ra","expected":{"problem_slug":"other_electrical","scope_signal":"in_scope","suggested_service":null,"safety_signals":["exposed_live_parts"],"needs_clarification":false,"complexity":"medium"},"difficulty":"hard","rationale":"Exposed copper on an appliance cord; electrician-replaceable, hazard signal fires"},
  {"id":"el_24","input_text_vi":"nuoc mua tat vao o dien ngoai ban cong, gio bat cau dao len la nhay lien","expected":{"problem_slug":"breaker_trip","scope_signal":"in_scope","suggested_service":null,"safety_signals":["water_near_power","protective_device"],"needs_clarification":false,"complexity":"medium"},"difficulty":"medium","rationale":"Rain ingress + RCBO trip: branch D with water hazard"}
]
```

Distribution: 16 slug cases (2× each of 8 slugs), 3 service_mismatch, 2 out_of_scope, 3 safety-signal-critical (el_22/23/24 double as slug cases for their slugs). Difficulty: 13 easy / 9 medium / 2 hard.

Scoring guide: `problem_slug` exact match; `scope_signal`/`suggested_service` exact; `safety_signals` = expected set must be a subset of emitted (extra grounded signals do not fail the case); `needs_clarification` exact; `complexity` informative only in v0 (not an intake field).


---

# Appendix C — Verification status (honest) + Tu's review list

## How this document was actually produced and checked

- Multi-agent workflow: 11 specialist drafts + 3 adversarial review lenses per section + repair + eval generation. It hit the session usage cap twice; what genuinely ran:
  - **Drafted by agents:** breaker-trip, outage-whole, flickering, outlet-switch, complexity-rubric, safety-advisory (6/11).
  - **Contract lens (agent, independent):** ran on breaker-trip and outage-whole only — 11 findings, all verified against source and applied. Two were systemic (the "và" question filter; the customer_sentiment enum) and were propagated to every section via PB0.
  - **Drafted by Claude directly (no independent draft agent):** outage-room, install-device, fallback-disambig, hcmc-context, vision-checklist, PB0 conventions, both appendices.
  - **Domain lens / exec lens:** did NOT run as independent agents. Claude self-reviewed every section against the failure modes the contract lens exposed, and all uncertain field claims are tagged [VERIFY] instead of asserted.
- Contract facts (slugs, quote_driver keys, trigger signals, question filter, sentiment enum, schema field names, gate-signal union) were verified by reading `performance-profiles.ts`, `types.ts`, `prompts.ts`, `self-check.ts`, `pipeline.ts` directly on 2026-07-14.
- No runtime code was changed. Nothing is injected. No tests were run (nothing executable changed).

## The 1% — what needs Tu's eyes (in priority order)

1. **Field-truth the [VERIFY] tags** (all enumerated here):
   - PB4: a dead single fixture routed to `flickering_light` (no dedicated slug exists — is that the catalog's intent?).
   - PB6: ceiling fan on trần thạch cao must anchor to the concrete slab (standard practice claim).
   - PB7: `electrical-general` vs `other_electrical` split (general-inspection vs unclear-symptom) — my inference from the other_* fallback rule; confirm pricing-row semantics.
   - PB7: camera/wifi mounting routed to handyman (taxonomy ruling needed).
   - PB8: RCBO prevalence in newer blocks; aluminum wiring prevalence in the oldest stock; BQL reception/drilling-hour norms as advisory-worthy facts.
2. **Three policy decisions I made that are product calls, not engineering calls:**
   - Building-wide outage -> `out_of_scope` hard exit (pipeline returns the unsupported message) instead of a softer advisory path. Consistent with the code today, but it ends the conversation — acceptable UX?
   - ≥2 dead outlets -> `power_outage_one_room` (circuit-level), single point -> `outlet_or_switch_broken`. This boundary affects baseline price-row selection.
   - High-load installs default to `new_circuit` (large) unless a dedicated line is confirmed — conservative, may over-scope some jobs.
3. **Register check:** all customer-visible strings use "Anh/chị ... bên em". Confirm this matches the Kael charter register (§39) before these templates become canonical.
4. **Sequencing sign-off:** inject nothing until the Appendix B baseline runs once on staging (pre-injection), then once after. Without the before/after pair, improvement claims are unfalsifiable.

## Known limitations

- The eval corpus is 24 cases — enough to detect gross regressions and playbook-vs-no-playbook deltas, not fine-grained drift (that is §43 E0's 250-case job).
- The compressed segment (Appendix A) is my distillation; token count (~1.6k) is estimated, not measured — measure at injection time.
- The five remaining services (plumbing, cleaning, hvac, upholstery, handyman) have no playbook yet; this document is the template they follow.

## Suggested next steps (after Tu review)

1. Tu resolves the [VERIFY] tags + 3 policy calls (30–45 min of review).
2. Baseline eval run on staging (24 cases, no injection).
3. Inject Appendix A behind `KAEL_PLAYBOOK_ELECTRICAL_ENABLED`, re-run eval, compare.
4. If the delta is positive: replicate the template for plumbing (next-highest volume), and fold these 24 cases into §43 E0's corpus.


---


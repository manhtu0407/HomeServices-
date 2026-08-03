// Distilled electrical diagnosis playbook — the compressed STABLE prompt segment
// from docs/playbooks/services/electrical.md (Appendix A). Appended to the
// electrical intake-diagnosis system prompt when the flag is on, so the runtime
// model follows the decision trees instead of classifying cold. STABLE content
// (no per-request data) keeps it prompt-cacheable.
//
// Source of truth for the reasoning is the textbook doc; regenerate this constant
// from its Appendix A, do not hand-edit the trees here in isolation.
export const ELECTRICAL_PLAYBOOK_VERSION = "electrical-playbook-2026-07-16.v2";

export const ELECTRICAL_PLAYBOOK_SEGMENT =
  `ELECTRICAL DIAGNOSIS PLAYBOOK (apply when service_type=electrical)

OUTPUT DISCIPLINE
- safety_signals[]: exact strings only, from BOTH gates: smoke_or_burning, sparking, exposed_live_parts, water_near_power (hazard -> customer safety step) and distribution_board, fixed_wiring, protective_device, new_circuit (work type -> qualified worker). Collect across the whole conversation.
- profile_facts: Vietnamese, only what the customer stated or confirmed. Never record advice or assumptions as facts. No timing/quantity the customer did not give.
- clarification_question: ONE Vietnamese question, <=160 chars, exactly one "?", no ";" ":" , at most one comma, and NEVER the word "và" — use "hay"/"hoặc". Ask the question that best splits your top-2 hypotheses. Never re-ask answered facts.
- missing_slots[]: use breaker_state for the required current/re-trip CB-state fork. Use safety_water_proximity or safety_spark_marks only when that exact branch-specific safety check is unresolved; never use an optional quote driver to force another question.
- confidence: 0.8-0.9 single clean branch; 0.5-0.6 two candidate branches (then needs_clarification=true); <=0.4 fallback slugs.
- customer_sentiment: only neutral | detail_oriented | pressure.
- Never mention money or amounts. Never tell the customer to open the panel cover, touch wiring, or reset a breaker more than once.

SAFETY SCAN FIRST (every turn, before any question)
khét/khói/nóng chảy -> smoke_or_burning. tóe lửa/đánh lửa/chập điện -> sparking. dây hở/lòi lõi đồng/giật tê tay -> exposed_live_parts. nước or ẩm near ổ cắm/tủ điện/đèn (dột, mưa tạt) -> water_near_power; a leaking bình nóng lạnh triggers it only when water reaches an electrical part. Any hit: safety guidance precedes questions; at most one follow-up question that turn.

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
breaker_trip: key evidence = whether it re-trips with loads already disconnected; never ask the customer to approach or unplug anything for this test. A reset may be attempted once only with NO immediate-critical signal and a dry, safely reachable panel. (A) re-trips with loads already disconnected -> short in fixed wiring; facts: affected_area_and_power_state, access_and_concealed_wiring="nghi chạm chập dây âm tường"; +fixed_wiring +protective_device; large. (B) holds with loads already disconnected, trips on combined load -> overload (classic: bếp từ + máy lạnh + bình nóng lạnh); facts: device_or_circuit_type; +protective_device +distribution_board (+new_circuit if dedicated line likely); medium. (C) trips with ONE device -> device fault; if AC -> hvac mismatch; fixed device (bình nóng lạnh, bếp từ) in_scope medium; outlet-side check small. (D) RCBO chống giật trips on rain days or water heater -> leakage; +protective_device (+water_near_power if water visible); medium. (E) random low-load trips, old CB -> aging breaker; +protective_device +distribution_board; small.
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
smoke_or_burning: "Anh/chị chỉ ngắt aptomat tổng nếu bảng điện khô ráo và dễ tiếp cận. Không làm vậy nếu phải lại gần chỗ nguy hiểm. Không chạm, rút phích, lau dọn hoặc lại gần khu vực bị ảnh hưởng. Giữ mọi người tránh xa cho đến khi thợ điện đủ chuyên môn kiểm tra. Nếu vẫn còn khói hoặc lửa, hãy rời khu vực và gọi cứu hỏa 114."
sparking: "Anh/chị chỉ ngắt aptomat tổng nếu bảng điện khô ráo và dễ tiếp cận. Không làm vậy nếu phải lại gần chỗ nguy hiểm. Không chạm, rút phích, lau dọn hoặc lại gần khu vực bị ảnh hưởng. Giữ mọi người tránh xa cho đến khi thợ điện đủ chuyên môn kiểm tra. Nếu vẫn còn khói hoặc lửa, hãy rời khu vực và gọi cứu hỏa 114."
exposed_live_parts: "Anh/chị chỉ ngắt aptomat tổng nếu bảng điện khô ráo và dễ tiếp cận. Không làm vậy nếu phải lại gần chỗ nguy hiểm. Không chạm, rút phích, lau dọn hoặc lại gần khu vực bị ảnh hưởng. Giữ mọi người tránh xa cho đến khi thợ điện đủ chuyên môn kiểm tra. Nếu vẫn còn khói hoặc lửa, hãy rời khu vực và gọi cứu hỏa 114."
water_near_power: "Anh/chị chỉ ngắt aptomat tổng nếu bảng điện khô ráo và dễ tiếp cận. Không làm vậy nếu phải lại gần chỗ nguy hiểm. Không chạm, rút phích, lau dọn hoặc lại gần khu vực bị ảnh hưởng. Giữ mọi người tránh xa cho đến khi thợ điện đủ chuyên môn kiểm tra. Nếu vẫn còn khói hoặc lửa, hãy rời khu vực và gọi cứu hỏa 114."
capability gate (panel/fixed wiring/new circuit): "Phần tủ điện và dây âm tường cần thợ điện có chuyên môn xử lý. Anh/chị không cần tự thao tác thêm. Bên em sẽ sắp xếp thợ phù hợp cho phần việc này."`;

export function isElectricalPlaybookEnabled(): boolean {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  const value = deno?.env?.get?.("KAEL_PLAYBOOK_ELECTRICAL_ENABLED");
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

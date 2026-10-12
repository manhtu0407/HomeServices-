// One focused question per intake field, each saying why Kael needs it, with a sample answer the app
// can drop into the composer. Replaces the generic placeholder policies were published with and the
// raw field names that otherwise reached customers.

type Localized = { readonly label: string; readonly question: string; readonly example: string };
export type IntakeSlotQuestion = { readonly vi: Localized; readonly en: Localized };

const q = (vi: Localized, en: Localized): IntakeSlotQuestion => ({ vi, en });

export const INTAKE_SLOT_QUESTIONS: Readonly<Record<string, IntakeSlotQuestion>> = {
  // Tier A — required before any request can be sent.
  service_type: q(
    { label: "Chọn dịch vụ", question: "Bạn cần nhóm dịch vụ nào để Kael tìm đúng thợ?", example: "Mình cần sửa điện." },
    { label: "Choose a service", question: "Which service do you need, so Kael finds the right worker?", example: "I need an electrician." },
  ),
  problem_slug: q(
    { label: "Mô tả vấn đề", question: "Vấn đề cụ thể là gì để Kael xếp đúng loại việc?", example: "Ổ cắm phòng ngủ bị lỏng và có tia lửa." },
    { label: "Describe the problem", question: "What exactly is the problem, so Kael files the right kind of job?", example: "The bedroom socket is loose and sparks." },
  ),
  address_district: q(
    { label: "Thêm quận", question: "Căn hộ ở quận nào tại TP.HCM? Kael cần quận để kiểm tra khu vực phục vụ.", example: "Thành phố Thủ Đức." },
    { label: "Add the district", question: "Which HCMC district is the apartment in? Kael checks the service area with it.", example: "Thu Duc City." },
  ),
  address_label: q(
    { label: "Thêm địa chỉ", question: "Tên tòa hoặc khu căn hộ là gì? Thợ chỉ thấy địa chỉ đầy đủ sau khi bạn xác nhận.", example: "Tòa S1.07, Vinhomes Grand Park." },
    { label: "Add the address", question: "What is the building or block name? The worker sees the full address only after you confirm.", example: "Block S1.07, Vinhomes Grand Park." },
  ),
  scheduled_at: q(
    { label: "Chọn giờ hẹn", question: "Bạn muốn thợ đến ngày nào, khoảng mấy giờ?", example: "Sáng thứ Ba, khoảng 9 giờ." },
    { label: "Pick a time", question: "Which day and roughly what time should the worker come?", example: "Tuesday morning, around 9." },
  ),
  description_min: q(
    { label: "Mô tả thêm", question: "Bạn mô tả rõ hơn một chút: chuyện gì xảy ra, ở đâu, từ khi nào?", example: "Vòi bếp rỉ nước từ hôm qua, chảy liên tục." },
    { label: "Describe more", question: "Tell Kael a bit more: what happens, where, and since when?", example: "The kitchen tap has dripped since yesterday." },
  ),
  description: q(
    { label: "Mô tả thêm", question: "Bạn mô tả rõ hơn một chút: chuyện gì xảy ra, ở đâu, từ khi nào?", example: "Vòi bếp rỉ nước từ hôm qua, chảy liên tục." },
    { label: "Describe more", question: "Tell Kael a bit more: what happens, where, and since when?", example: "The kitchen tap has dripped since yesterday." },
  ),

  // Electrical.
  symptom_and_duration: q(
    { label: "Hiện tượng điện", question: "Hiện tượng là gì và kéo dài bao lâu? Điều này giúp Kael đoán nguyên nhân.", example: "Đèn chập chờn 2 ngày nay, nhất là buổi tối." },
    { label: "What happens", question: "What happens and for how long? It helps Kael narrow the cause.", example: "The light has flickered for two days, mostly at night." },
  ),
  affected_area_and_power_state: q(
    { label: "Khu vực mất điện", question: "Mất điện một phòng hay cả căn? Cầu dao tổng có đang bật không?", example: "Chỉ phòng khách mất điện, cầu dao tổng vẫn bật." },
    { label: "Affected area", question: "Is power out in one room or the whole flat? Is the main breaker on?", example: "Only the living room; the main breaker is on." },
  ),
  device_or_circuit_type: q(
    { label: "Loại thiết bị", question: "Thiết bị hay mạch nào gặp vấn đề (ổ cắm, công tắc, đèn, máy nước nóng...)?", example: "Ổ cắm đôi gần bếp." },
    { label: "Device or circuit", question: "Which device or circuit is affected (socket, switch, light, water heater...)?", example: "The double socket by the stove." },
  ),
  parts_or_new_device_requirement: q(
    { label: "Thiết bị mới?", question: "Bạn đã có thiết bị mới để lắp chưa, hay cần thợ mang theo?", example: "Mình đã mua đèn, chỉ cần thợ lắp." },
    { label: "New parts?", question: "Do you already have the new device, or should the worker bring one?", example: "I bought the light; it only needs installing." },
  ),
  access_and_concealed_wiring: q(
    { label: "Dây âm tường?", question: "Dây điện đi âm tường hay nổi? Thợ có tiếp cận được vị trí không?", example: "Dây âm tường, vị trí cao khoảng 2m." },
    { label: "Concealed wiring?", question: "Is the wiring inside the wall or surface-run? Can the worker reach the spot?", example: "In the wall, about 2 m high." },
  ),
  urgency_and_repeat_fault: q(
    { label: "Mức khẩn cấp", question: "Sự cố đã lặp lại chưa, có mùi khét hay tia lửa không?", example: "Lần thứ hai trong tuần, có mùi khét nhẹ." },
    { label: "Urgency", question: "Has it happened before? Any burning smell or sparks?", example: "Second time this week, a slight burning smell." },
  ),

  // Plumbing.
  fixture_pipe_or_drain_type: q(
    { label: "Vị trí ống/thiết bị", question: "Vấn đề ở thiết bị nào: vòi, bồn cầu, ống dưới bồn rửa hay cống thoát?", example: "Ống dưới bồn rửa chén." },
    { label: "Fixture or pipe", question: "Which fixture: tap, toilet, the pipe under the sink, or a drain?", example: "The pipe under the kitchen sink." },
  ),
  leak_or_blockage_severity: q(
    { label: "Mức rò/tắc", question: "Rò nhỏ giọt hay chảy thành dòng? Tắc hoàn toàn hay thoát chậm?", example: "Nhỏ giọt liên tục, chưa thành dòng." },
    { label: "How bad", question: "A drip or a stream? Fully blocked or draining slowly?", example: "A steady drip, not a stream yet." },
  ),
  water_isolation_availability: q(
    { label: "Khóa nước", question: "Bạn đã khóa được van nước tổng hoặc van nhánh chưa?", example: "Đã khóa van dưới bồn rửa." },
    { label: "Water shut-off", question: "Have you been able to close the main or local water valve?", example: "I closed the valve under the sink." },
  ),
  pipe_or_fixture_material: q(
    { label: "Vật liệu ống", question: "Ống bằng nhựa, kẽm hay đồng (nếu bạn biết)?", example: "Ống nhựa trắng." },
    { label: "Pipe material", question: "Is the pipe plastic, galvanised or copper (if you know)?", example: "White plastic pipe." },
  ),
  water_damage_and_urgency: q(
    { label: "Thấm nước", question: "Nước đã thấm sàn, tủ hay xuống căn dưới chưa?", example: "Có thấm vào tủ bếp, chưa xuống tầng dưới." },
    { label: "Water damage", question: "Has water reached the floor, cabinets or the flat below?", example: "Into the kitchen cabinet, not downstairs yet." },
  ),
  access_and_concealed_pipework: q(
    { label: "Ống âm tường?", question: "Ống đi âm tường/sàn hay lộ ra ngoài?", example: "Ống lộ dưới bồn, dễ tiếp cận." },
    { label: "Concealed pipes?", question: "Are the pipes inside the wall or floor, or exposed?", example: "Exposed under the sink, easy to reach." },
  ),

  // Cleaning.
  area_and_room_count: q(
    { label: "Diện tích", question: "Căn hộ khoảng bao nhiêu m² và mấy phòng cần dọn?", example: "70m², 2 phòng ngủ, 2 WC." },
    { label: "Size", question: "Roughly how many m² and how many rooms need cleaning?", example: "70 m², 2 bedrooms, 2 bathrooms." },
  ),
  current_condition_and_cleaning_depth: q(
    { label: "Mức độ dọn", question: "Dọn định kỳ hay tổng vệ sinh? Hiện trạng bụi bẩn thế nào?", example: "Tổng vệ sinh sau 3 tháng chưa dọn kỹ." },
    { label: "Cleaning depth", question: "Routine or deep clean? How dirty is it now?", example: "A deep clean after three months." },
  ),
  surface_and_material_mix: q(
    { label: "Bề mặt", question: "Có bề mặt cần cẩn thận không (gỗ, đá, kính lớn)?", example: "Sàn gỗ và mặt bếp đá." },
    { label: "Surfaces", question: "Any delicate surfaces (wood, stone, large glass)?", example: "Wood floor and a stone counter." },
  ),
  occupancy_and_access: q(
    { label: "Người ở nhà", question: "Lúc dọn có người ở nhà, thú cưng hay đồ cần tránh không?", example: "Có mèo, mình ở nhà lúc dọn." },
    { label: "Occupancy", question: "Will anyone, pets or fragile items be around during cleaning?", example: "A cat; I'll be home." },
  ),
  equipment_and_supply_requirements: q(
    { label: "Dụng cụ", question: "Bạn có sẵn dụng cụ/hóa chất hay cần thợ mang theo?", example: "Cần thợ mang đủ dụng cụ." },
    { label: "Supplies", question: "Do you have cleaning supplies, or should the worker bring them?", example: "Please bring everything." },
  ),
  waste_volume_and_time_window: q(
    { label: "Rác & thời gian", question: "Có nhiều rác cần mang đi không, và bạn cần xong trong khung giờ nào?", example: "Ít rác, cần xong trước 17h." },
    { label: "Waste & timing", question: "Much rubbish to remove, and by when must it be done?", example: "Little rubbish, done by 5 pm." },
  ),

  // HVAC.
  unit_type_count_and_capacity: q(
    { label: "Loại máy lạnh", question: "Máy treo tường hay âm trần, mấy bộ, công suất khoảng bao nhiêu HP?", example: "2 máy treo tường 1HP." },
    { label: "Unit type", question: "Wall or ceiling units, how many, and roughly what capacity (HP)?", example: "Two 1 HP wall units." },
  ),
  symptom_and_operating_condition: q(
    { label: "Hiện tượng máy", question: "Máy đang bị gì: không mát, chảy nước, kêu to hay báo lỗi?", example: "Chạy nhưng không mát, gió yếu." },
    { label: "What happens", question: "What is wrong: not cooling, leaking, noisy, or an error code?", example: "Runs but doesn't cool; weak airflow." },
  ),
  requested_work_mode: q(
    { label: "Vệ sinh hay sửa", question: "Bạn cần vệ sinh định kỳ hay kiểm tra sửa lỗi?", example: "Kiểm tra và sửa vì không mát." },
    { label: "Clean or repair", question: "Do you need a routine clean or a fault check and repair?", example: "Check and repair; it isn't cooling." },
  ),
  maintenance_history: q(
    { label: "Lần vệ sinh trước", question: "Máy được vệ sinh hoặc bơm gas lần gần nhất khi nào?", example: "Vệ sinh cách đây khoảng 1 năm." },
    { label: "Last service", question: "When was it last cleaned or regassed?", example: "Cleaned about a year ago." },
  ),
  indoor_outdoor_unit_access: q(
    { label: "Vị trí cục nóng", question: "Cục nóng đặt ở đâu, thợ có tiếp cận an toàn không?", example: "Cục nóng ngoài ban công, dễ tiếp cận." },
    { label: "Outdoor unit", question: "Where is the outdoor unit, and can the worker reach it safely?", example: "On the balcony, easy to reach." },
  ),
  drain_electrical_or_refrigerant_signs: q(
    { label: "Dấu hiệu khác", question: "Có thấy chảy nước, đóng tuyết, mùi khét hay nhảy aptomat không?", example: "Dàn lạnh đóng tuyết nhẹ." },
    { label: "Other signs", question: "Any dripping, ice on the coil, burning smell or tripping breaker?", example: "A little ice on the indoor coil." },
  ),
  parts_and_consumables_requirement: q(
    { label: "Linh kiện", question: "Bạn có sẵn linh kiện/ống đồng hay cần thợ chuẩn bị?", example: "Chưa có, nhờ thợ báo nếu cần thay." },
    { label: "Parts", question: "Do you have parts or piping, or should the worker prepare them?", example: "None; tell me if anything needs replacing." },
  ),

  // Upholstery.
  item_type_count_and_dimensions: q(
    { label: "Loại & kích thước", question: "Món nào cần làm (sofa, nệm, rèm, thảm), bao nhiêu món và kích thước khoảng bao nhiêu?", example: "1 sofa 3 chỗ dài khoảng 2m." },
    { label: "Items & size", question: "Which items (sofa, mattress, curtain, carpet), how many, and roughly how big?", example: "One 3-seat sofa, about 2 m long." },
  ),
  material_and_care_label: q(
    { label: "Chất liệu", question: "Chất liệu là vải, da hay nỉ? Nếu có nhãn hướng dẫn giặt, bạn chụp giúp Kael.", example: "Sofa vải nỉ, có nhãn ở mặt dưới." },
    { label: "Material", question: "Fabric, leather or felt? If there is a care label, a photo helps.", example: "Felt fabric; the label is underneath." },
  ),
  stain_odor_and_soiling_condition: q(
    { label: "Vết bẩn", question: "Có vết bẩn, mùi hay ẩm mốc cụ thể nào không?", example: "Vài vết cà phê và mùi hơi ẩm." },
    { label: "Stains", question: "Any particular stains, odour or mould?", example: "A few coffee stains and a damp smell." },
  ),
  colorfastness_and_prior_treatment: q(
    { label: "Đã xử lý trước?", question: "Món này đã từng giặt hoặc dùng hóa chất tẩy chưa?", example: "Chưa từng giặt." },
    { label: "Treated before?", question: "Has it been washed or treated with a cleaner before?", example: "Never washed." },
  ),
  drying_environment_and_time_window: q(
    { label: "Thời gian khô", question: "Nhà có thoáng gió không, và bạn cần dùng lại sau bao lâu?", example: "Thoáng, cần dùng lại buổi tối." },
    { label: "Drying time", question: "Is the room well ventilated, and when do you need to use it again?", example: "Airy; I need it by evening." },
  ),
  access_and_movement_requirement: q(
    { label: "Di chuyển đồ", question: "Đồ có cần tháo, di chuyển hay làm tại chỗ được?", example: "Làm tại chỗ, không cần di chuyển." },
    { label: "Moving items", question: "Does anything need dismantling or moving, or can it be done in place?", example: "In place, nothing to move." },
  ),

  // Handyman.
  task_types_and_total_count: q(
    { label: "Đầu việc", question: "Có mấy đầu việc cần làm và mỗi việc là gì?", example: "Khoan 1 kệ và lắp 1 móc treo." },
    { label: "Tasks", question: "How many tasks are there, and what is each one?", example: "Mount one shelf and one hook." },
  ),
  item_dimensions_weight_and_quantity: q(
    { label: "Kích thước & nặng", question: "Vật cần lắp kích thước và nặng khoảng bao nhiêu? Kael dùng để chọn tắc kê phù hợp.", example: "Kệ gỗ 30x20cm, nặng khoảng 1kg." },
    { label: "Size & weight", question: "How big and heavy is the item? Kael uses it to pick the right fixings.", example: "Wooden shelf 30x20 cm, about 1 kg." },
  ),
  wall_surface_or_substrate: q(
    { label: "Loại tường", question: "Tường gạch, bê tông hay thạch cao?", example: "Tường gạch." },
    { label: "Wall type", question: "Is the wall brick, concrete or plasterboard?", example: "Brick wall." },
  ),
  mounting_location_access_and_height: q(
    { label: "Vị trí lắp", question: "Lắp ở đâu và cao khoảng bao nhiêu? Có cần thang không?", example: "Phòng khách, cao khoảng 1m6." },
    { label: "Where & height", question: "Where does it go and how high? Is a ladder needed?", example: "Living room, about 1.6 m high." },
  ),
  parts_hardware_and_tools_available: q(
    { label: "Phụ kiện", question: "Bạn đã có ốc, tắc kê, giá đỡ chưa hay cần thợ mang theo?", example: "Có sẵn giá đỡ, thiếu tắc kê." },
    { label: "Hardware", question: "Do you have screws, plugs and brackets, or should the worker bring them?", example: "I have brackets but no wall plugs." },
  ),
  concealed_services_and_load_requirement: q(
    { label: "Đường ống/điện âm", question: "Chỗ khoan có thể có dây điện hay ống nước âm tường không?", example: "Không chắc, gần ổ cắm." },
    { label: "Hidden services", question: "Could there be wiring or pipes inside the wall where it is drilled?", example: "Not sure; it's near a socket." },
  ),
};

const PLACEHOLDER_QUESTIONS = new Set([
  "Anh/chị có thể bổ sung chi tiết này không?",
  "Can you add this detail?",
]);

export function isPlaceholderQuestion(value: string | null | undefined): boolean {
  return !value || PLACEHOLDER_QUESTIONS.has(value.trim());
}

export function intakeSlotQuestion(field: string, language: "vi" | "en"): Localized | null {
  return INTAKE_SLOT_QUESTIONS[field]?.[language] ?? null;
}

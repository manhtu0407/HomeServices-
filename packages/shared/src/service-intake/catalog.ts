import type { LaunchServiceLineId, ServicePerformancePlaybook } from './types.ts'

export const SERVICE_PERFORMANCE_PLAYBOOKS: Readonly<Record<LaunchServiceLineId, ServicePerformancePlaybook>> = Object.freeze({
  home_cleaning: {
    serviceLineId: 'home_cleaning',
    productionServiceType: 'cleaning',
    labelVi: 'Vệ sinh nhà cửa',
    labelEn: 'Home cleaning',
    professionalName: 'Home Cleaning Scope Planning',
    kaelScopeName: 'Kael CleanScope',
    mode: 'clean_scope',
    performanceGoalVi: 'Làm rõ diện tích, hiện trạng, khu vực ưu tiên và kết quả cần hoàn tất.',
    performanceGoalEn: 'Clarify size, current condition, priority areas, and the expected cleaning outcome.',
    quoteDriverSlots: ['cleaning_type', 'property_layout', 'area_sqm', 'bathroom_count', 'condition_level', 'priority_zones', 'addons', 'home_context'],
    defaultProblemChips: ['Dọn dẹp nhà'],
    questions: [
      {
        id: 'cleaning_type', type: 'single_select', required: true,
        labelVi: 'Bạn muốn kiểu dọn nào?', labelEn: 'What type of cleaning do you need?',
        helperVi: 'Kael dùng lựa chọn này để xác định phạm vi cơ bản.', helperEn: 'Kael uses this to set the base scope.',
        options: [
          { value: 'quick', labelVi: 'Dọn nhanh', labelEn: 'Quick clean' },
          { value: 'standard', labelVi: 'Dọn tiêu chuẩn', labelEn: 'Standard clean' },
          { value: 'deep', labelVi: 'Tổng vệ sinh', labelEn: 'Deep clean' },
          { value: 'post_repair', labelVi: 'Dọn sau sửa chữa', labelEn: 'Post-renovation clean' },
          { value: 'move_in_out', labelVi: 'Trước/sau chuyển nhà', labelEn: 'Move-in or move-out' },
          { value: 'recurring', labelVi: 'Dọn định kỳ', labelEn: 'Recurring clean' },
        ],
      },
      {
        id: 'property_layout', type: 'single_select', required: true,
        labelVi: 'Nhà hoặc căn hộ thuộc loại nào?', labelEn: 'What is the home layout?',
        options: [
          { value: 'studio', labelVi: 'Studio', labelEn: 'Studio' },
          { value: 'one_bedroom', labelVi: '1 phòng ngủ', labelEn: '1 bedroom' },
          { value: 'two_bedroom', labelVi: '2 phòng ngủ', labelEn: '2 bedrooms' },
          { value: 'three_bedroom', labelVi: '3 phòng ngủ', labelEn: '3 bedrooms' },
          { value: 'house', labelVi: 'Nhà phố', labelEn: 'Townhouse' },
        ],
      },
      { id: 'area_sqm', type: 'number', required: false, labelVi: 'Diện tích khoảng bao nhiêu m²?', labelEn: 'Approximate area in m²?', min: 15, max: 300 },
      { id: 'bathroom_count', type: 'number', required: true, labelVi: 'Có mấy toilet hoặc phòng tắm?', labelEn: 'How many bathrooms?', integer: true, min: 0, max: 8 },
      {
        id: 'condition_level', type: 'single_select', required: true,
        labelVi: 'Hiện trạng hiện tại ở mức nào?', labelEn: 'What is the current condition?',
        options: [
          { value: 'level_1', labelVi: 'Khá sạch, chỉ cần dọn nhẹ', labelEn: 'Mostly clean, light work' },
          { value: 'level_2', labelVi: 'Bình thường, cần dọn kỹ vài khu', labelEn: 'Normal, a few areas need care' },
          { value: 'level_3', labelVi: 'Bụi hoặc bẩn nhiều', labelEn: 'Dusty or heavily used' },
          { value: 'level_4', labelVi: 'Rất nặng hoặc sau sửa chữa', labelEn: 'Very heavy or post-renovation' },
        ],
      },
      {
        id: 'priority_zones', type: 'multi_select', required: false, maxSelections: 3,
        labelVi: 'Khu vực nào cần ưu tiên?', labelEn: 'Which areas are the priority?',
        options: [
          { value: 'kitchen', labelVi: 'Bếp', labelEn: 'Kitchen' },
          { value: 'bathroom', labelVi: 'Phòng tắm', labelEn: 'Bathroom' },
          { value: 'living_room', labelVi: 'Phòng khách', labelEn: 'Living room' },
          { value: 'bedroom', labelVi: 'Phòng ngủ', labelEn: 'Bedroom' },
          { value: 'balcony', labelVi: 'Ban công', labelEn: 'Balcony' },
          { value: 'glass_windows', labelVi: 'Kính hoặc cửa sổ', labelEn: 'Glass or windows' },
          { value: 'floor', labelVi: 'Sàn', labelEn: 'Floors' },
          { value: 'post_repair_dust', labelVi: 'Bụi sau sửa chữa', labelEn: 'Renovation dust' },
        ],
      },
      {
        id: 'addons', type: 'multi_select', required: false,
        labelVi: 'Có yêu cầu thêm nào không?', labelEn: 'Any add-ons?',
        options: [
          { value: 'interior_window_cleaning', labelVi: 'Lau kính trong nhà', labelEn: 'Interior windows' },
          { value: 'fridge_cleaning', labelVi: 'Dọn tủ lạnh', labelEn: 'Fridge cleaning' },
          { value: 'oven_microwave_cleaning', labelVi: 'Vệ sinh lò', labelEn: 'Oven or microwave' },
          { value: 'hood_degreasing', labelVi: 'Vệ sinh máy hút mùi', labelEn: 'Range hood degreasing' },
          { value: 'laundry_bedding', labelVi: 'Giặt chăn ga', labelEn: 'Bedding laundry' },
          { value: 'dish_washing', labelVi: 'Rửa chén', labelEn: 'Dish washing' },
          { value: 'organizing', labelVi: 'Sắp xếp đồ', labelEn: 'Organizing' },
          { value: 'balcony_deep_cleaning', labelVi: 'Vệ sinh ban công kỹ', labelEn: 'Deep balcony clean' },
          { value: 'bring_supplies', labelVi: 'Mang dụng cụ và hóa chất', labelEn: 'Bring supplies' },
        ],
      },
      {
        id: 'home_context', type: 'multi_select', required: false,
        labelVi: 'Có lưu ý nào trong nhà không?', labelEn: 'Any home considerations?',
        options: [
          { value: 'children', labelVi: 'Có trẻ nhỏ', labelEn: 'Children' },
          { value: 'pets', labelVi: 'Có thú cưng', labelEn: 'Pets' },
          { value: 'allergy_sensitive', labelVi: 'Nhạy cảm hoặc dị ứng', labelEn: 'Allergy-sensitive' },
          { value: 'fragile_items', labelVi: 'Có đồ dễ vỡ', labelEn: 'Fragile items' },
        ],
      },
    ],
    requiredToolsVi: ['Bộ dụng cụ vệ sinh cơ bản', 'Khăn lau sạch', 'Dung dịch phù hợp', 'Bao rác'],
    requiredToolsEn: ['Basic cleaning kit', 'Clean cloths', 'Suitable cleaning products', 'Trash bags'],
    customerPrepVi: ['Cất đồ cá nhân và đồ giá trị', 'Báo trước khu vực không muốn chạm vào'],
    customerPrepEn: ['Store personal items and valuables', 'Identify any no-touch areas'],
    completionChecklistVi: ['Ảnh trước và sau khu vực ưu tiên', 'Checklist khu vực đã dọn', 'Ghi chú phần không thể xử lý'],
    completionChecklistEn: ['Before and after photos of priority areas', 'Completed-area checklist', 'Notes for anything that could not be handled'],
    scopeChangeTriggersVi: ['Diện tích hoặc số phòng lớn hơn khai báo', 'Hiện trạng nặng hơn đã chọn', 'Khách thêm hạng mục tại chỗ'],
    scopeChangeTriggersEn: ['Actual size or room count is larger', 'Condition is heavier than selected', 'Customer adds tasks on site'],
    unsupportedBoundariesVi: ['Chất thải nguy hại', 'Hiện trường sinh học nguy hiểm', 'Kính ngoài trời ở độ cao nguy hiểm'],
    unsupportedBoundariesEn: ['Hazardous waste', 'Biohazard scenes', 'Exterior glass at unsafe height'],
    mediaRequirement: { required: false, recommended: true, minPhotos: 2, promptsVi: ['Chụp khu vực ưu tiên', 'Chụp khu vực bẩn nhất'], promptsEn: ['Photograph priority areas', 'Photograph the heaviest area'] },
    riskRules: [
      { id: 'cleaning_level_4_review', labelVi: 'Hiện trạng rất nặng, cần duyệt lại thời lượng và số người', labelEn: 'Very heavy condition needs time and crew review', severity: 'review', when: { slot: 'condition_level', operator: 'equals', value: 'level_4' } },
      { id: 'cleaning_large_area_review', labelVi: 'Diện tích lớn, cần kiểm tra số người', labelEn: 'Large area needs crew review', severity: 'review', when: { slot: 'area_sqm', operator: 'number_gte', value: 120 } },
    ],
  },

  hvac_basic_maintenance: {
    serviceLineId: 'hvac_basic_maintenance', productionServiceType: 'hvac',
    labelVi: 'Điều hòa & Không khí', labelEn: 'Air conditioning & air care',
    professionalName: 'HVAC Cleaning & Basic Maintenance Scope Planning', kaelScopeName: 'Kael AirScope', mode: 'air_scope',
    performanceGoalVi: 'Làm rõ số lượng máy, mục tiêu, khả năng tiếp cận và dấu hiệu cần kiểm tra chuyên môn.',
    performanceGoalEn: 'Clarify unit count, goal, access, and signs that require specialist review.',
    quoteDriverSlots: ['hvac_goal', 'unit_count', 'unit_type', 'last_cleaned', 'access_level', 'hvac_safety_notes'],
    defaultProblemChips: ['Vệ sinh/bảo trì điều hòa'],
    questions: [
      {
        id: 'hvac_goal', type: 'single_select', required: true, labelVi: 'Bạn cần xử lý vấn đề gì?', labelEn: 'What do you need help with?',
        options: [
          { value: 'routine_cleaning', labelVi: 'Vệ sinh định kỳ', labelEn: 'Routine cleaning' },
          { value: 'weak_cooling', labelVi: 'Lạnh yếu', labelEn: 'Weak cooling' },
          { value: 'water_leak', labelVi: 'Chảy nước dàn lạnh', labelEn: 'Indoor-unit leak' },
          { value: 'odor', labelVi: 'Có mùi', labelEn: 'Odor' },
          { value: 'basic_check', labelVi: 'Kiểm tra cơ bản', labelEn: 'Basic check' },
        ],
      },
      { id: 'unit_count', type: 'number', required: true, labelVi: 'Có bao nhiêu máy?', labelEn: 'How many units?', integer: true, min: 1, max: 10 },
      {
        id: 'unit_type', type: 'single_select', required: false, labelVi: 'Loại máy điều hòa?', labelEn: 'What type of unit?',
        options: [
          { value: 'wall_mounted', labelVi: 'Treo tường', labelEn: 'Wall-mounted' },
          { value: 'standing', labelVi: 'Tủ đứng', labelEn: 'Standing' },
          { value: 'cassette', labelVi: 'Máy âm trần', labelEn: 'Cassette' },
          { value: 'unknown', labelVi: 'Không chắc', labelEn: 'Not sure' },
        ],
      },
      {
        id: 'last_cleaned', type: 'single_select', required: false, labelVi: 'Lần gần nhất vệ sinh?', labelEn: 'When was it last cleaned?',
        options: [
          { value: 'under_3_months', labelVi: 'Dưới 3 tháng', labelEn: 'Under 3 months' },
          { value: '3_to_6_months', labelVi: '3–6 tháng', labelEn: '3–6 months' },
          { value: 'over_6_months', labelVi: 'Trên 6 tháng', labelEn: 'Over 6 months' },
          { value: 'unknown', labelVi: 'Không nhớ', labelEn: 'Not sure' },
        ],
      },
      {
        id: 'access_level', type: 'single_select', required: true, labelVi: 'Vị trí máy có dễ tiếp cận?', labelEn: 'How accessible is the unit?',
        options: [
          { value: 'easy', labelVi: 'Dễ tiếp cận', labelEn: 'Easy access' },
          { value: 'high_or_tight', labelVi: 'Cao hoặc hẹp', labelEn: 'High or tight' },
          { value: 'difficult', labelVi: 'Khó tiếp cận', labelEn: 'Difficult access' },
          { value: 'unknown', labelVi: 'Không chắc', labelEn: 'Not sure' },
        ],
      },
      {
        id: 'hvac_safety_notes', type: 'multi_select', required: false, labelVi: 'Có dấu hiệu nào cần lưu ý?', labelEn: 'Any warning signs?',
        options: [
          { value: 'electric_smell', labelVi: 'Mùi khét hoặc điện', labelEn: 'Electrical or burning smell' },
          { value: 'breaker_trip', labelVi: 'CB từng nhảy', labelEn: 'Breaker trips' },
          { value: 'heavy_water_leak', labelVi: 'Chảy nước nhiều', labelEn: 'Heavy water leak' },
          { value: 'error_code', labelVi: 'Có mã lỗi', labelEn: 'Error code' },
          { value: 'none', labelVi: 'Không có', labelEn: 'None' },
        ],
      },
    ],
    requiredToolsVi: ['Bộ vệ sinh điều hòa', 'Bạt che nước', 'Thang nếu cần'], requiredToolsEn: ['AC cleaning kit', 'Water cover', 'Ladder if needed'],
    customerPrepVi: ['Dọn khu vực dưới dàn lạnh', 'Chuẩn bị lối tiếp cận'], customerPrepEn: ['Clear below the indoor unit', 'Prepare access to the unit'],
    completionChecklistVi: ['Ảnh trước và sau dàn lạnh', 'Ghi chú triệu chứng sau vệ sinh', 'Lau khô khu vực làm việc'], completionChecklistEn: ['Before and after unit photos', 'Post-cleaning symptom notes', 'Work area left dry'],
    scopeChangeTriggersVi: ['Phát hiện lỗi linh kiện hoặc board', 'Vị trí khó hơn khai báo', 'Cần xử lý gas hoặc tháo lắp sâu'], scopeChangeTriggersEn: ['Component or board fault found', 'Access is harder than reported', 'Gas or deep disassembly is needed'],
    unsupportedBoundariesVi: ['Sửa board hoặc block', 'Nạp gas phức tạp', 'Dấu hiệu điện nguy hiểm chưa kiểm tra'], unsupportedBoundariesEn: ['Board or compressor repair', 'Complex refrigerant work', 'Unchecked electrical danger'],
    mediaRequirement: { required: false, recommended: true, minPhotos: 2, promptsVi: ['Chụp toàn bộ dàn lạnh', 'Chụp vị trí rò hoặc mã lỗi'], promptsEn: ['Photograph the full indoor unit', 'Photograph any leak or error code'] },
    riskRules: [
      { id: 'hvac_electric_smell', labelVi: 'Có mùi khét hoặc điện', labelEn: 'Electrical or burning smell', severity: 'review', when: { slot: 'hvac_safety_notes', operator: 'includes_any', value: ['electric_smell'] } },
      { id: 'hvac_breaker_trip', labelVi: 'CB từng nhảy', labelEn: 'Breaker trip reported', severity: 'review', when: { slot: 'hvac_safety_notes', operator: 'includes_any', value: ['breaker_trip'] } },
      { id: 'hvac_heavy_leak', labelVi: 'Chảy nước nhiều', labelEn: 'Heavy water leak', severity: 'review', when: { slot: 'hvac_safety_notes', operator: 'includes_any', value: ['heavy_water_leak'] } },
      { id: 'hvac_error_code', labelVi: 'Máy có mã lỗi', labelEn: 'Unit has an error code', severity: 'review', when: { slot: 'hvac_safety_notes', operator: 'includes_any', value: ['error_code'] } },
      { id: 'hvac_difficult_access', labelVi: 'Vị trí khó tiếp cận', labelEn: 'Difficult access', severity: 'review', when: { slot: 'access_level', operator: 'equals', value: 'difficult' } },
    ],
    bookingBlockerVi: 'Dịch vụ đang ở chế độ xem trước phạm vi và cần được duyệt trước khi điều phối.',
    bookingBlockerEn: 'This service is in scope-preview mode and requires review before dispatch.',
  },

  upholstery_care: {
    serviceLineId: 'upholstery_care', productionServiceType: 'upholstery',
    labelVi: 'Sofa, nệm, rèm, thảm', labelEn: 'Sofa, mattress, curtain & carpet care',
    professionalName: 'Soft Furnishing & Upholstery Care Scope Planning', kaelScopeName: 'Kael FabricScope', mode: 'fabric_scope',
    performanceGoalVi: 'Làm rõ loại món, kích thước, chất liệu, vết bẩn, mùi và kỳ vọng xử lý.',
    performanceGoalEn: 'Clarify items, size, material, stains, odor, and treatment expectations.',
    quoteDriverSlots: ['fabric_items', 'fabric_quantity_size', 'fabric_material', 'fabric_issue', 'fabric_home_context'],
    defaultProblemChips: ['Vệ sinh sofa/nệm/rèm/thảm'],
    questions: [
      {
        id: 'fabric_items', type: 'multi_select', required: true, labelVi: 'Bạn cần vệ sinh món nào?', labelEn: 'Which items need cleaning?',
        options: [
          { value: 'sofa', labelVi: 'Sofa', labelEn: 'Sofa' }, { value: 'mattress', labelVi: 'Nệm', labelEn: 'Mattress' },
          { value: 'curtain', labelVi: 'Rèm', labelEn: 'Curtain' }, { value: 'carpet', labelVi: 'Thảm', labelEn: 'Carpet' },
          { value: 'dining_chair', labelVi: 'Ghế ăn', labelEn: 'Dining chair' }, { value: 'office_chair', labelVi: 'Ghế văn phòng', labelEn: 'Office chair' },
        ],
      },
      { id: 'fabric_quantity_size', type: 'text', required: true, labelVi: 'Số lượng và kích thước khoảng bao nhiêu?', labelEn: 'Approximate quantity and size?', maxLength: 200, placeholderVi: 'Ví dụ: sofa chữ L 3 chỗ', placeholderEn: 'Example: three-seat L-shaped sofa' },
      {
        id: 'fabric_material', type: 'single_select', required: false, labelVi: 'Chất liệu chính là gì?', labelEn: 'What is the main material?',
        options: [
          { value: 'fabric', labelVi: 'Vải', labelEn: 'Fabric' }, { value: 'leather', labelVi: 'Da', labelEn: 'Leather' },
          { value: 'faux_leather', labelVi: 'Giả da', labelEn: 'Faux leather' }, { value: 'velvet_or_felt', labelVi: 'Nhung hoặc nỉ', labelEn: 'Velvet or felt' },
          { value: 'unknown', labelVi: 'Không biết', labelEn: 'Not sure' },
        ],
      },
      {
        id: 'fabric_issue', type: 'multi_select', required: true, labelVi: 'Vấn đề chính là gì?', labelEn: 'What is the main issue?',
        options: [
          { value: 'dust', labelVi: 'Bụi', labelEn: 'Dust' }, { value: 'odor', labelVi: 'Mùi hôi', labelEn: 'Odor' },
          { value: 'stain', labelVi: 'Vết bẩn', labelEn: 'Stain' }, { value: 'sweat_yellowing', labelVi: 'Mồ hôi hoặc ố vàng', labelEn: 'Sweat or yellowing' },
          { value: 'pet_hair', labelVi: 'Lông thú cưng', labelEn: 'Pet hair' }, { value: 'child_accident', labelVi: 'Sự cố của trẻ nhỏ', labelEn: 'Child accident' },
          { value: 'light_mold', labelVi: 'Mốc nhẹ', labelEn: 'Light mold' }, { value: 'routine', labelVi: 'Làm sạch định kỳ', labelEn: 'Routine cleaning' },
        ],
      },
      {
        id: 'fabric_home_context', type: 'multi_select', required: false, labelVi: 'Có yêu cầu an toàn hoặc mùi nào?', labelEn: 'Any safety or odor preferences?',
        options: [
          { value: 'children', labelVi: 'Có trẻ nhỏ', labelEn: 'Children' }, { value: 'pets', labelVi: 'Có thú cưng', labelEn: 'Pets' },
          { value: 'allergy_sensitive', labelVi: 'Nhạy cảm hô hấp', labelEn: 'Respiratory sensitivity' }, { value: 'low_odor', labelVi: 'Ưu tiên ít mùi', labelEn: 'Low-odor products' },
          { value: 'quick_dry', labelVi: 'Cần khô nhanh', labelEn: 'Quick drying' },
        ],
      },
    ],
    requiredToolsVi: ['Máy hút hoặc giặt phù hợp', 'Dung dịch theo chất liệu', 'Khăn sạch'], requiredToolsEn: ['Suitable extraction or washing machine', 'Material-safe solution', 'Clean cloths'],
    customerPrepVi: ['Dọn đồ trên bề mặt', 'Báo trước chất liệu đặc biệt'], customerPrepEn: ['Clear items from the surface', 'Identify special materials'],
    completionChecklistVi: ['Ảnh tổng thể trước và sau', 'Ảnh cận vết bẩn', 'Ghi chú phương pháp và thời gian khô'], completionChecklistEn: ['Overall before and after photos', 'Close-up stain photos', 'Method and drying-time notes'],
    scopeChangeTriggersVi: ['Số lượng lớn hơn khai báo', 'Chất liệu nhạy cảm hơn dự kiến', 'Mốc hoặc mùi nặng hơn intake'], scopeChangeTriggersEn: ['More items than reported', 'Material is more sensitive than expected', 'Mold or odor is heavier than intake'],
    unsupportedBoundariesVi: ['Cam kết sạch 100% vết cũ', 'Đồ da cao cấp chưa kiểm tra', 'Mốc nặng hoặc chất thải sinh học'], unsupportedBoundariesEn: ['Guaranteeing full removal of old stains', 'Unchecked premium leather', 'Heavy mold or biohazards'],
    mediaRequirement: { required: false, recommended: true, minPhotos: 2, promptsVi: ['Chụp toàn bộ món', 'Chụp cận vết bẩn và chất liệu'], promptsEn: ['Photograph the full item', 'Photograph stains and material close up'] },
    riskRules: [
      { id: 'fabric_mold_review', labelVi: 'Có mốc cần duyệt mức độ', labelEn: 'Mold requires severity review', severity: 'review', when: { slot: 'fabric_issue', operator: 'includes_any', value: ['light_mold'] } },
      { id: 'fabric_leather_review', labelVi: 'Đồ da cần xác nhận phương pháp', labelEn: 'Leather requires method review', severity: 'review', when: { slot: 'fabric_material', operator: 'equals', value: 'leather' } },
    ],
    bookingBlockerVi: 'Dịch vụ đang ở chế độ xem trước phạm vi và cần được duyệt trước khi điều phối.',
    bookingBlockerEn: 'This service is in scope-preview mode and requires review before dispatch.',
  },

  handyman_minor_installation: {
    serviceLineId: 'handyman_minor_installation', productionServiceType: 'handyman',
    labelVi: 'Sửa vặt & Lắp đặt nhỏ', labelEn: 'Minor repairs & installation',
    professionalName: 'Multi-Skill Handyman & Minor Installation Scope Planning', kaelScopeName: 'Kael TaskScope', mode: 'task_scope',
    performanceGoalVi: 'Gom các việc nhỏ thành nhóm công việc có vật tư, dụng cụ và ranh giới rõ ràng.',
    performanceGoalEn: 'Turn small jobs into a clear task bundle with materials, tools, and boundaries.',
    quoteDriverSlots: ['task_bundle_type', 'task_types', 'task_count', 'materials_ready', 'wall_surface', 'requires_drilling', 'task_risk_flags'],
    defaultProblemChips: ['Sửa vặt/lắp đặt nhỏ'],
    questions: [
      {
        id: 'task_bundle_type', type: 'single_select', required: true, labelVi: 'Một việc hay nhiều việc nhỏ?', labelEn: 'One task or several small tasks?',
        options: [
          { value: 'single', labelVi: 'Một việc', labelEn: 'One task' }, { value: 'multiple', labelVi: 'Nhiều việc nhỏ', labelEn: 'Several tasks' },
          { value: 'need_help_grouping', labelVi: 'Để Kael giúp gom việc', labelEn: 'Let Kael group them' },
        ],
      },
      {
        id: 'task_types', type: 'multi_select', required: true, labelVi: 'Những việc nào cần xử lý?', labelEn: 'Which tasks are needed?',
        options: [
          { value: 'drill_shelf', labelVi: 'Khoan hoặc lắp kệ', labelEn: 'Drill or mount shelf' }, { value: 'curtain_rod', labelVi: 'Lắp thanh rèm', labelEn: 'Install curtain rod' },
          { value: 'light_or_small_fixture', labelVi: 'Lắp đèn hoặc thiết bị nhỏ', labelEn: 'Install light or small fixture' }, { value: 'cabinet_hinge_handle', labelVi: 'Sửa bản lề hoặc tay nắm', labelEn: 'Fix hinge or handle' },
          { value: 'bathroom_fixture', labelVi: 'Lắp thiết bị phòng tắm nhỏ', labelEn: 'Install small bathroom fixture' }, { value: 'drying_rack_screen', labelVi: 'Giàn phơi hoặc lưới', labelEn: 'Drying rack or screen' },
          { value: 'tv_mount', labelVi: 'Lắp TV treo tường', labelEn: 'Wall-mount TV' }, { value: 'furniture_assembly', labelVi: 'Lắp ráp nội thất', labelEn: 'Assemble furniture' },
          { value: 'other', labelVi: 'Việc nhỏ khác', labelEn: 'Other small task' },
        ],
      },
      { id: 'task_count', type: 'number', required: true, labelVi: 'Tổng cộng khoảng bao nhiêu việc?', labelEn: 'How many tasks in total?', integer: true, min: 1, max: 12 },
      {
        id: 'materials_ready', type: 'single_select', required: true, labelVi: 'Vật tư hoặc phụ kiện đã sẵn sàng?', labelEn: 'Are materials and fixtures ready?',
        options: [
          { value: 'yes', labelVi: 'Đã có đủ', labelEn: 'All ready' }, { value: 'partial', labelVi: 'Có một phần', labelEn: 'Partly ready' },
          { value: 'no', labelVi: 'Chưa có', labelEn: 'Not ready' }, { value: 'unknown', labelVi: 'Không chắc', labelEn: 'Not sure' },
        ],
      },
      {
        id: 'wall_surface', type: 'single_select', required: false, labelVi: 'Bề mặt tường là gì?', labelEn: 'What is the wall surface?',
        options: [
          { value: 'concrete', labelVi: 'Bê tông', labelEn: 'Concrete' }, { value: 'brick', labelVi: 'Gạch', labelEn: 'Brick' },
          { value: 'drywall', labelVi: 'Thạch cao', labelEn: 'Drywall' }, { value: 'wood', labelVi: 'Gỗ', labelEn: 'Wood' },
          { value: 'unknown', labelVi: 'Không chắc', labelEn: 'Not sure' }, { value: 'not_applicable', labelVi: 'Không liên quan', labelEn: 'Not applicable' },
        ],
      },
      {
        id: 'requires_drilling', type: 'single_select', required: true, labelVi: 'Có cần khoan tường?', labelEn: 'Is wall drilling required?',
        options: [
          { value: 'yes', labelVi: 'Có', labelEn: 'Yes' }, { value: 'no', labelVi: 'Không', labelEn: 'No' }, { value: 'unknown', labelVi: 'Không chắc', labelEn: 'Not sure' },
        ],
      },
      {
        id: 'task_risk_flags', type: 'multi_select', required: false, labelVi: 'Có rủi ro hoặc lưu ý nào?', labelEn: 'Any risks or constraints?',
        options: [
          { value: 'heavy_item', labelVi: 'Vật nặng', labelEn: 'Heavy item' }, { value: 'high_wall', labelVi: 'Vị trí cao', labelEn: 'High position' },
          { value: 'hidden_wire_pipe', labelVi: 'Lo ngại dây hoặc ống âm tường', labelEn: 'Hidden wire or pipe concern' }, { value: 'building_permission', labelVi: 'Cần phép ban quản lý', labelEn: 'Building permission needed' },
          { value: 'none', labelVi: 'Không có', labelEn: 'None' },
        ],
      },
    ],
    requiredToolsVi: ['Khoan và mũi khoan cơ bản', 'Bộ tua vít', 'Thước hoặc nivo'], requiredToolsEn: ['Basic drill and bits', 'Screwdriver set', 'Level or measuring tools'],
    customerPrepVi: ['Chuẩn bị vật tư chính', 'Xác nhận quyền khoan với ban quản lý', 'Dọn khu vực thao tác'], customerPrepEn: ['Prepare main fixtures', 'Confirm drilling permission', 'Clear the work area'],
    completionChecklistVi: ['Ảnh trước và sau từng việc', 'Trạng thái từng việc rõ ràng', 'Ghi lại vật tư phát sinh'], completionChecklistEn: ['Before and after photos for every task', 'Clear status for every task', 'Record additional materials'],
    scopeChangeTriggersVi: ['Thiếu vật tư chính', 'Có rủi ro dây hoặc ống âm tường', 'Task vượt sửa vặt và cần chuyên gia'], scopeChangeTriggersEn: ['Main materials are missing', 'Hidden wire or pipe risk exists', 'Task exceeds minor handyman scope'],
    unsupportedBoundariesVi: ['Khoan cắt kết cấu lớn', 'Giấu dây âm tường', 'Điện hoặc nước chuyên sâu'], unsupportedBoundariesEn: ['Major structural drilling or cutting', 'Concealed wiring work', 'Specialist electrical or plumbing work'],
    mediaRequirement: { required: true, recommended: true, minPhotos: 1, promptsVi: ['Chụp vị trí của từng việc', 'Chụp vật cần lắp và phụ kiện'], promptsEn: ['Photograph each task location', 'Photograph the item and available fixtures'] },
    riskRules: [
      { id: 'handyman_hidden_wire_pipe', labelVi: 'Có rủi ro dây hoặc ống âm tường', labelEn: 'Hidden wire or pipe concern', severity: 'review', when: { slot: 'task_risk_flags', operator: 'includes_any', value: ['hidden_wire_pipe'] } },
      { id: 'handyman_heavy_item', labelVi: 'Vật nặng cần duyệt tải trọng', labelEn: 'Heavy item needs load review', severity: 'review', when: { slot: 'task_risk_flags', operator: 'includes_any', value: ['heavy_item'] } },
      { id: 'handyman_tv_mount', labelVi: 'TV treo tường cần kiểm tra bề mặt', labelEn: 'TV mounting needs wall review', severity: 'review', when: { slot: 'task_types', operator: 'includes_any', value: ['tv_mount'] } },
      { id: 'handyman_unknown_wall_drill', labelVi: 'Cần khoan nhưng chưa rõ loại tường', labelEn: 'Drilling requested with unknown wall type', severity: 'review', when: { slot: 'wall_surface', operator: 'equals', value: 'unknown' } },
      { id: 'handyman_photo_required', labelVi: 'Cần ảnh trước khi tạo phạm vi tin cậy', labelEn: 'Photos are required for a reliable scope', severity: 'block', when: { slot: '__media_count', operator: 'media_lt', value: 1 } },
    ],
    bookingBlockerVi: 'Dịch vụ đang ở chế độ xem trước phạm vi và cần được duyệt trước khi điều phối.',
    bookingBlockerEn: 'This service is in scope-preview mode and requires review before dispatch.',
  },
})

export function getServicePerformancePlaybook(serviceLineId: LaunchServiceLineId): ServicePerformancePlaybook {
  const playbook = SERVICE_PERFORMANCE_PLAYBOOKS[serviceLineId]
  if (!playbook) throw new RangeError(`Unknown service performance playbook: ${serviceLineId}`)
  return playbook
}

export function listServicePerformancePlaybooks(): readonly ServicePerformancePlaybook[] {
  return LAUNCH_SERVICE_LINE_ORDER.map((serviceLineId) => SERVICE_PERFORMANCE_PLAYBOOKS[serviceLineId])
}

const LAUNCH_SERVICE_LINE_ORDER: readonly LaunchServiceLineId[] = [
  'home_cleaning',
  'hvac_basic_maintenance',
  'upholstery_care',
  'handyman_minor_installation',
]

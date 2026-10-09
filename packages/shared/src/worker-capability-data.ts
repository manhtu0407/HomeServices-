export const WORKER_SERVICE_CAPABILITY_DATA = {
  electrical: {
    electrical_fault_isolation: ['Chẩn đoán lỗi điện', 'Electrical fault diagnosis'],
    fixed_wiring_and_panel_safety: ['An toàn dây điện và tủ điện', 'Fixed wiring and panel safety'],
    device_repair_or_replacement: ['Sửa và thay thiết bị điện', 'Device repair and replacement'],
    electrical_installation: ['Lắp đặt điện', 'Electrical installation'],
  },
  plumbing: {
    leak_and_flow_diagnosis: ['Chẩn đoán rò rỉ và dòng nước', 'Leak and flow diagnosis'],
    pipe_and_fixture_repair: ['Sửa đường ống và thiết bị nước', 'Pipe and fixture repair'],
    drain_clearing: ['Thông tắc đường thoát nước', 'Drain clearing'],
    fixture_installation: ['Lắp thiết bị nước', 'Plumbing fixture installation'],
  },
  cleaning: {
    home_cleaning: ['Vệ sinh nhà ở', 'Home cleaning'],
    deep_cleaning: ['Vệ sinh chuyên sâu', 'Deep cleaning'],
    surface_safe_cleaning: ['Vệ sinh an toàn theo bề mặt', 'Surface-safe cleaning'],
    cleaning_equipment_operation: ['Sử dụng thiết bị vệ sinh', 'Cleaning equipment operation'],
  },
  hvac: {
    hvac_cleaning: ['Vệ sinh máy lạnh', 'Air conditioner cleaning'],
    hvac_fault_diagnosis: ['Chẩn đoán lỗi máy lạnh', 'Air conditioner fault diagnosis'],
    hvac_electrical_and_control_repair: ['Sửa điện và điều khiển máy lạnh', 'HVAC electrical and control repair'],
    refrigerant_system_service: ['Xử lý hệ thống gas máy lạnh', 'Refrigerant system service'],
    safe_height_access: ['Làm việc trên cao an toàn', 'Safe work at height'],
  },
  upholstery: {
    upholstery_material_identification: ['Nhận biết chất liệu vải', 'Upholstery material identification'],
    colorfastness_and_patch_testing: ['Kiểm tra bền màu và thử trên vùng nhỏ', 'Colorfastness and patch testing'],
    fabric_safe_extraction_cleaning: ['Giặt hút an toàn theo chất liệu', 'Fabric-safe extraction cleaning'],
    stain_and_odor_treatment: ['Xử lý vết bẩn và mùi', 'Stain and odor treatment'],
  },
  handyman: {
    minor_home_repairs: ['Sửa chữa nhỏ trong nhà', 'Minor home repairs'],
    safe_drilling_and_mounting: ['Khoan và cố định an toàn', 'Safe drilling and mounting'],
    small_fixture_and_furniture_installation: ['Lắp thiết bị nhỏ và nội thất', 'Small fixture and furniture installation'],
    multi_task_scope_management: ['Quản lý phạm vi nhiều hạng mục', 'Multi-task scope management'],
  },
} as const

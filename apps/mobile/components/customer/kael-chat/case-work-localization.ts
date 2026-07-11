import type { AppLanguage } from '@/lib/app-language'

const customerSafetyStepCodes = new Set([
  'electrical_immediate_hazard',
  'plumbing_active_damage_or_contamination',
  'hvac_electrical_refrigerant_or_burning_hazard',
])
const onSiteAssessmentCodes = new Set([
  'plumbing_concealed_or_building_system',
  'fabric_contamination_or_chemical_risk',
  'handyman_structural_or_concealed_service_risk',
])
const specialistHandoffCodes = new Set([
  'cleaning_hazardous_material',
  'handyman_specialist_boundary',
])

export function localizedCaseWorkSafetyMessage(code: string, language: AppLanguage) {
  if (customerSafetyStepCodes.has(code)) {
    return language === 'vi'
      ? 'Tạm dừng sử dụng khu vực hoặc thiết bị có dấu hiệu nguy hiểm và chờ người đủ chuyên môn kiểm tra.'
      : 'Stop using the area or device that may be unsafe and wait for a qualified professional to inspect it.'
  }
  if (onSiteAssessmentCodes.has(code)) {
    return language === 'vi'
      ? 'Ca này cần đánh giá trực tiếp trước khi Kael có thể chốt phạm vi hoặc giá.'
      : 'This case needs an on-site assessment before Kael can finalize the scope or price.'
  }
  if (specialistHandoffCodes.has(code)) {
    return language === 'vi'
      ? 'Dấu hiệu hiện tại cần chuyển cho thợ chuyên môn phù hợp; Kael chưa mở báo giá tự động.'
      : 'The current signs require a suitably qualified specialist; Kael has not opened an automatic offer.'
  }
  return language === 'vi'
    ? 'Kael chỉ tìm thợ có năng lực đã xác minh phù hợp với dấu hiệu này.'
    : 'Kael will only look for a worker whose verified capabilities match these signs.'
}

export function localizedCaseWorkEvidencePrompt(input: {
  blockers: readonly string[]
  evidenceKind?: 'photo' | 'video_frame' | 'voice_transcript'
  language: AppLanguage
}) {
  if (input.blockers.includes('handyman_visual_evidence')) {
    return input.language === 'vi'
      ? 'Bạn gửi một ảnh thấy rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước và dụng cụ cần chuẩn bị.'
      : 'Send one clear photo of the item and the installation area so Kael can check the surface, size, and tools needed.'
  }
  if (input.blockers.includes('upholstery_condition_visual_evidence')) {
    return input.language === 'vi'
      ? 'Bạn gửi một ảnh toàn bộ món đồ và một ảnh cận chất liệu hoặc vết cần xử lý để Kael không báo sai phạm vi vệ sinh.'
      : 'Send one photo of the whole item and one close-up of the material or stain so Kael does not misstate the cleaning scope.'
  }
  if (input.evidenceKind === 'voice_transcript') {
    return input.language === 'vi'
      ? 'Bạn đọc lại bản chép lời trên thiết bị, chỉnh nếu cần rồi xác nhận gửi cho Kael.'
      : 'Review the on-device transcript, edit it if needed, then confirm it for Kael.'
  }
  return input.language === 'vi'
    ? 'Bạn thêm bằng chứng hiện trạng được yêu cầu để Kael tiếp tục phân tích.'
    : 'Add the requested current-condition evidence so Kael can continue the analysis.'
}

export function localizedQuoteReviewReason(reason: string | undefined, language: AppLanguage) {
  if (reason === 'case_work_turn_safety_limit') {
    return language === 'vi'
      ? 'Kael chưa đủ chắc chắn sau các lượt thu thập hiện tại. Yêu cầu cần người hỗ trợ rà soát trước khi mở báo giá.'
      : 'Kael is not confident enough after the current intake turns. A support specialist must review the case before an offer opens.'
  }
  return language === 'vi'
    ? 'Kael chưa có đủ dữ liệu phạm vi hoặc nguồn giá đã kiểm chứng để mở đề xuất. Yêu cầu vẫn ở bước phân tích; hệ thống chưa tìm thợ và chưa tạo khoản thanh toán.'
    : 'Kael does not yet have enough grounded scope or validated price evidence to open an offer. It stays in analysis; no worker search or payment has started.'
}

import type { DeclineTemplateKey } from './permissions'

export const DECLINE_TEMPLATES: Record<DeclineTemplateKey, string> = {
  out_of_scope_service:
    'Hiện Kael chỉ hỗ trợ sửa điện, sửa nước và dọn dẹp tại các căn hộ HCMC. Bạn vui lòng quay lại khi Kael mở thêm dịch vụ.',
  out_of_domain_question:
    'Câu hỏi này nằm ngoài phạm vi của Kael. Bạn vui lòng liên hệ hỗ trợ tại tab hồ sơ để được giúp.',
  cannot_do_action:
    'Kael không có thẩm quyền thực hiện điều này. {alternative}',
  unsafe_or_sensitive:
    'Kael không thể trả lời câu hỏi này. Nếu bạn cần hỗ trợ khẩn cấp, vui lòng gọi số 113.',
  rate_limit_hit:
    'Bạn đã hỏi Kael quá nhiều lần trong thời gian ngắn. Vui lòng đợi {seconds} giây.',
  cost_cap_hit:
    'Bạn đã đạt giới hạn yêu cầu Kael cho tháng này. Vui lòng liên hệ hỗ trợ.',
  legal_advice_redirect:
    'Câu hỏi này cần tư vấn pháp lý chuyên môn. Kael có thể cảnh báo về an toàn nhưng không tư vấn pháp lý. Vui lòng tham vấn luật sư.',
  emergency_redirect:
    'Kael nhận thấy tình huống này có vẻ khẩn cấp. Vui lòng gọi 113 hoặc 115 ngay lập tức.',
}

export function renderDeclineTemplate(
  key: DeclineTemplateKey,
  values: { alternative?: string; seconds?: number } = {},
): string {
  return DECLINE_TEMPLATES[key]
    .replace('{alternative}', values.alternative ?? 'Bạn có thể tiếp tục trong luồng hỗ trợ phù hợp.')
    .replace('{seconds}', String(values.seconds ?? 60))
}

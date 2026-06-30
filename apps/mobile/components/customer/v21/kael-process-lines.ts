import type { AppLanguage } from '@/lib/app-language'

export type KaelProcessScenarioId =
  | 'normal_chat'
  | 'service_price_advice'
  | 'job_match'
  | 'work_plan'
  | 'evidence_check'
  | 'scope_change'
  | 'route_eta'
  | 'checkin_ready'
  | 'ranking_explain'
  | 'payout_review'
  | 'memory_update'
  | 'support_escalation'
  | 'blocked_action'

type KaelProcessStage =
  | 'observe'
  | 'context'
  | 'retrieve'
  | 'match'
  | 'compare'
  | 'analyze'
  | 'verify'
  | 'risk'
  | 'tone'
  | 'compose'
  | 'waiting'
  | 'policy'

type KaelProcessCatalogLine = {
  durationMs: number
  stage: KaelProcessStage
  text: string
}

type KaelProcessCatalogScenario = {
  collapse: string
  lines: KaelProcessCatalogLine[]
}

export type KaelProcessLine = KaelProcessCatalogLine & {
  key: string
}

export type KaelProcessSequence = {
  collapse: string
  lines: KaelProcessLine[]
  scenarioId: KaelProcessScenarioId
}

export type BuildKaelProcessSequenceInput = {
  caseId?: string | null
  complexity?: string | null
  distance?: string | null
  hasRealCase?: boolean
  jobType?: string | null
  language: AppLanguage
  mediaCount?: number
  message: string
  mode: 'normal' | 'case'
}

const fallbackContext = {
  caseId: 'công việc này',
  distance: 'khu vực hiện tại',
  jobType: 'công việc này',
}

const viScenarios: Record<KaelProcessScenarioId, KaelProcessCatalogScenario> = {
  normal_chat: {
    collapse: 'Kael đã xem ngữ cảnh và chuẩn bị câu trả lời ngắn gọn.',
    lines: [
      line('observe', 'Kael đang hiểu mục tiêu bạn vừa hỏi…', 1260),
      line('context', 'Kael đang xem ngữ cảnh trò chuyện gần nhất…', 1420),
      line('retrieve', 'Kael đang lọc thông tin liên quan trong hệ thống…', 1520),
      line('analyze', 'Kael đang cân bằng mức khẩn cấp và dữ liệu còn thiếu…', 1380),
      line('compose', 'Kael đang chuẩn bị câu trả lời ngắn gọn cho bạn…', 1480),
    ],
  },
  service_price_advice: {
    collapse: 'Kael đã chuẩn bị thị trường giá và điều kiện còn thiếu.',
    lines: [
      line('observe', 'Kael đang xác định loại dịch vụ bạn hỏi...', 1480),
      line('context', 'Kael đang kiểm tra khu vực và phạm vi cần ước tính...', 1660),
      line('retrieve', 'Kael đang lọc thông tin giá tham khảo phù hợp...', 1720),
      line('risk', 'Kael đang tách phần chưa đủ dữ liệu để tránh báo giá cứng...', 1680),
      line('compose', 'Kael đang chuẩn bị câu trả lời kèm lưu ý an toàn...', 1640),
    ],
  },
  job_match: {
    collapse: 'Kael đã kiểm tra các bước trước khi đề xuất.',
    lines: [
      line('observe', 'Kael đang đọc mô tả {{caseId}}…', 1280),
      line('context', 'Kael đang kiểm tra khu vực và thời điểm phù hợp…', 1450),
      line('match', 'Kael đang so khớp kỹ năng {{jobType}}…', 1560),
      line('verify', 'Kael đang đối chiếu lịch, trạng thái và bước tiếp theo…', 1420),
      line('risk', 'Kael đang đánh giá rủi ro trễ hẹn và phạm vi…', 1500),
      line('compose', 'Kael đang chuẩn bị đề xuất an toàn cho bạn…', 1560),
    ],
  },
  work_plan: {
    collapse: 'Kael đã dựng checklist theo loại việc và yêu cầu của bạn.',
    lines: [
      line('observe', 'Kael đang đọc yêu cầu chính của bạn…', 1260),
      line('retrieve', 'Kael đang lấy checklist chuẩn cho {{jobType}}…', 1460),
      line('context', 'Kael đang kiểm tra ghi chú và ảnh/video đính kèm…', 1580),
      line('analyze', 'Kael đang chia việc thành các bước dễ xác nhận…', 1440),
      line('compose', 'Kael đang chuẩn bị hướng xử lý phù hợp…', 1500),
    ],
  },
  evidence_check: {
    collapse: 'Kael đã kiểm tra bằng chứng và phần còn thiếu.',
    lines: [
      line('observe', 'Kael đang kiểm tra ảnh/video bạn vừa gửi…', 1300),
      line('verify', 'Kael đang đối chiếu bằng chứng với {{jobType}}…', 1500),
      line('risk', 'Kael đang tìm điểm còn thiếu trước khi kết luận…', 1600),
      line('context', 'Kael đang kiểm tra ghi chú và mô tả đi kèm…', 1420),
      line('compose', 'Kael đang soạn tóm tắt để bạn xác nhận…', 1520),
    ],
  },
  scope_change: {
    collapse: 'Kael đã so sánh phạm vi, thời gian và rủi ro.',
    lines: [
      line('observe', 'Kael đang đọc yêu cầu phát sinh…', 1260),
      line('compare', 'Kael đang so sánh với phạm vi ban đầu…', 1480),
      line('analyze', 'Kael đang ước tính thời gian và phần bổ sung…', 1640),
      line('risk', 'Kael đang kiểm tra ảnh hưởng tới thanh toán và đánh giá…', 1480),
      line('compose', 'Kael đang chuẩn bị đề xuất cần bạn xác nhận trước…', 1540),
    ],
  },
  route_eta: {
    collapse: 'Kael đã kiểm tra vị trí, tuyến đường và mốc thời gian.',
    lines: [
      line('observe', 'Kael đang xác định điểm đến của {{caseId}}…', 1260),
      line('context', 'Kael đang kiểm tra vị trí và khu vực hiện tại…', 1460),
      line('analyze', 'Kael đang tính thời gian đến và thời gian đệm…', 1620),
      line('verify', 'Kael đang xem mốc xác nhận đến nơi bắt buộc…', 1400),
      line('compose', 'Kael đang chuẩn bị lộ trình nên đi…', 1480),
    ],
  },
  checkin_ready: {
    collapse: 'Kael đã kiểm tra điều kiện xác nhận đến nơi.',
    lines: [
      line('observe', 'Kael đang kiểm tra bạn đã ở đúng địa điểm…', 1260),
      line('context', 'Kael đang đối chiếu địa chỉ với {{caseId}}…', 1440),
      line('verify', 'Kael đang kiểm tra khoảng cách xác nhận đến nơi hợp lệ…', 1600),
      line('analyze', 'Kael đang xem ghi chú trước khi vào việc…', 1400),
      line('compose', 'Kael đang chuẩn bị bước xác nhận đến nơi an toàn…', 1500),
    ],
  },
  ranking_explain: {
    collapse: 'Kael đã kiểm tra đúng hẹn, đánh giá và hoàn tất.',
    lines: [
      line('observe', 'Kael đang đọc dữ liệu sử dụng gần đây…', 1260),
      line('context', 'Kael đang kiểm tra tỷ lệ đúng hẹn và hoàn tất…', 1460),
      line('analyze', 'Kael đang xem phản hồi sau mỗi công việc…', 1560),
      line('risk', 'Kael đang tìm yếu tố làm điểm tin cậy thay đổi…', 1440),
      line('compose', 'Kael đang chuẩn bị gợi ý cải thiện xếp hạng…', 1500),
    ],
  },
  payout_review: {
    collapse: 'Kael đã đối chiếu trạng thái thanh toán.',
    lines: [
      line('observe', 'Kael đang kiểm tra công việc đã hoàn tất hay chưa…', 1260),
      line('verify', 'Kael đang đối chiếu xác nhận từ các bên…', 1460),
      line('analyze', 'Kael đang kiểm tra phí nền tảng và phụ phí…', 1560),
      line('context', 'Kael đang xem trạng thái ví và thanh toán…', 1440),
      line('compose', 'Kael đang chuẩn bị tóm tắt thanh toán cho bạn…', 1500),
    ],
  },
  memory_update: {
    collapse: 'Kael đã chuẩn bị cập nhật ưu tiên của bạn.',
    lines: [
      line('observe', 'Kael đang nhận ưu tiên mới của bạn…', 1260),
      line('context', 'Kael đang kiểm tra các bộ lọc đang bật…', 1440),
      line('verify', 'Kael đang xem thay đổi này ảnh hưởng ra sao…', 1560),
      line('compose', 'Kael đang chuẩn bị tóm tắt trước khi lưu…', 1400),
      line('waiting', 'Kael sẽ chờ bạn xác nhận rồi mới cập nhật…', 1500),
    ],
  },
  support_escalation: {
    collapse: 'Kael đã chuẩn bị thông tin cần gửi hỗ trợ.',
    lines: [
      line('observe', 'Kael đang đọc vấn đề bạn mô tả…', 1260),
      line('context', 'Kael đang lấy mã công việc và mốc thời gian liên quan…', 1460),
      line('retrieve', 'Kael đang gom ảnh, ghi chú và đoạn chat cần thiết…', 1640),
      line('risk', 'Kael đang kiểm tra mức độ khẩn cấp của tình huống…', 1460),
      line('compose', 'Kael đang soạn báo cáo hỗ trợ để bạn gửi…', 1520),
    ],
  },
  blocked_action: {
    collapse: 'Kael cần bạn xác nhận trước khi thực hiện.',
    lines: [
      line('observe', 'Kael đang kiểm tra hành động bạn yêu cầu…', 1260),
      line('policy', 'Kael đang xác định bước nào cần bạn duyệt…', 1460),
      line('verify', 'Kael đang kiểm tra tác động tới lịch và thanh toán…', 1580),
      line('waiting', 'Kael cần bạn xác nhận trước khi tiếp tục…', 1480),
    ],
  },
}

const enScenarios: Record<KaelProcessScenarioId, KaelProcessCatalogScenario> = {
  normal_chat: {
    collapse: 'Kael checked the context and prepared a short answer.',
    lines: [
      line('observe', 'Kael is reading your latest question…', 1260),
      line('context', 'Kael is checking the recent chat context…', 1420),
      line('retrieve', 'Kael is filtering relevant system information…', 1520),
      line('analyze', 'Kael is balancing urgency and missing data…', 1380),
      line('compose', 'Kael is preparing a concise reply…', 1480),
    ],
  },
  service_price_advice: {
    collapse: 'Kael checked price context and missing details.',
    lines: [
      line('observe', 'Kael is identifying the service you asked about...', 1480),
      line('context', 'Kael is checking the area and scope needed for an estimate...', 1660),
      line('retrieve', 'Kael is filtering relevant reference pricing context...', 1720),
      line('risk', 'Kael is separating missing details to avoid a fixed quote...', 1680),
      line('compose', 'Kael is preparing a safe answer with the right caveat...', 1640),
    ],
  },
  job_match: {
    collapse: 'Kael checked the steps before proposing a safe next action.',
    lines: [
      line('observe', 'Kael is reading {{caseId}}…', 1280),
      line('context', 'Kael is checking area and timing fit…', 1450),
      line('match', 'Kael is matching the {{jobType}} skill…', 1560),
      line('verify', 'Kael is checking schedule, status, and next step…', 1420),
      line('risk', 'Kael is reviewing delay and scope risk…', 1500),
      line('compose', 'Kael is preparing a safe suggestion…', 1560),
    ],
  },
  work_plan: {
    collapse: 'Kael drafted a checklist from the work type and your request.',
    lines: [
      line('observe', 'Kael is reading the main request…', 1260),
      line('retrieve', 'Kael is loading the checklist for {{jobType}}…', 1460),
      line('context', 'Kael is checking notes and attached media…', 1580),
      line('analyze', 'Kael is splitting the work into confirmable steps…', 1440),
      line('compose', 'Kael is preparing a fitting response…', 1500),
    ],
  },
  evidence_check: {
    collapse: 'Kael checked evidence and missing pieces.',
    lines: [
      line('observe', 'Kael is checking the photo/video you sent…', 1300),
      line('verify', 'Kael is comparing evidence with {{jobType}}…', 1500),
      line('risk', 'Kael is looking for missing evidence…', 1600),
      line('context', 'Kael is checking the attached notes…', 1420),
      line('compose', 'Kael is drafting a short confirmation summary…', 1520),
    ],
  },
  scope_change: {
    collapse: 'Kael compared scope, time, and risk.',
    lines: [
      line('observe', 'Kael is reading the new scope request…', 1260),
      line('compare', 'Kael is comparing it with the original scope…', 1480),
      line('analyze', 'Kael is estimating added time and work…', 1640),
      line('risk', 'Kael is checking payment and review impact…', 1480),
      line('compose', 'Kael is preparing a proposal for confirmation…', 1540),
    ],
  },
  route_eta: {
    collapse: 'Kael checked location, route, and timing.',
    lines: [
      line('observe', 'Kael is identifying the destination for {{caseId}}…', 1260),
      line('context', 'Kael is checking current area and location context…', 1460),
      line('analyze', 'Kael is calculating ETA and buffer time…', 1620),
      line('verify', 'Kael is checking required check-in timing…', 1400),
      line('compose', 'Kael is preparing the route suggestion…', 1480),
    ],
  },
  checkin_ready: {
    collapse: 'Kael checked check-in readiness.',
    lines: [
      line('observe', 'Kael is checking whether you are at the right place…', 1260),
      line('context', 'Kael is matching the address with {{caseId}}…', 1440),
      line('verify', 'Kael is checking the valid check-in range…', 1600),
      line('analyze', 'Kael is reviewing notes before work starts…', 1400),
      line('compose', 'Kael is preparing a safe check-in step…', 1500),
    ],
  },
  ranking_explain: {
    collapse: 'Kael checked punctuality, reviews, and completion.',
    lines: [
      line('observe', 'Kael is reading recent usage data…', 1260),
      line('context', 'Kael is checking punctuality and completion…', 1460),
      line('analyze', 'Kael is reviewing feedback after jobs…', 1560),
      line('risk', 'Kael is finding what changed your trust score…', 1440),
      line('compose', 'Kael is preparing ranking improvement tips…', 1500),
    ],
  },
  payout_review: {
    collapse: 'Kael checked the payment status.',
    lines: [
      line('observe', 'Kael is checking whether the work is complete…', 1260),
      line('verify', 'Kael is matching confirmations from both sides…', 1460),
      line('analyze', 'Kael is checking platform fees and add-ons…', 1560),
      line('context', 'Kael is reviewing wallet and payment state…', 1440),
      line('compose', 'Kael is preparing a payment summary…', 1500),
    ],
  },
  memory_update: {
    collapse: 'Kael prepared your preference update.',
    lines: [
      line('observe', 'Kael is reading your new preference…', 1260),
      line('context', 'Kael is checking active filters…', 1440),
      line('verify', 'Kael is reviewing how this change affects options…', 1560),
      line('compose', 'Kael is preparing a summary before saving…', 1400),
      line('waiting', 'Kael will wait for your confirmation before updating…', 1500),
    ],
  },
  support_escalation: {
    collapse: 'Kael prepared the support handoff details.',
    lines: [
      line('observe', 'Kael is reading the issue you described…', 1260),
      line('context', 'Kael is gathering job code and related timing…', 1460),
      line('retrieve', 'Kael is collecting needed photos, notes, and chat…', 1640),
      line('risk', 'Kael is checking urgency level…', 1460),
      line('compose', 'Kael is drafting the support report…', 1520),
    ],
  },
  blocked_action: {
    collapse: 'Kael needs your confirmation before continuing.',
    lines: [
      line('observe', 'Kael is checking the action you requested…', 1260),
      line('policy', 'Kael is identifying what needs approval…', 1460),
      line('verify', 'Kael is checking schedule and payment impact…', 1580),
      line('waiting', 'Kael needs your confirmation before continuing…', 1480),
    ],
  },
}

export function buildKaelProcessSequence(input: BuildKaelProcessSequenceInput): KaelProcessSequence {
  const scenarioId = selectScenario(input)
  const catalog = input.language === 'vi' ? viScenarios : enScenarios
  const scenario = catalog[scenarioId]
  const scale = durationScale(input, scenarioId)
  return {
    collapse: fillTemplate(scenario.collapse, input),
    scenarioId,
    lines: scenario.lines.map((item, index) => ({
      ...item,
      durationMs: Math.round(item.durationMs * scale),
      key: `${scenarioId}-${item.stage}-${index}`,
      text: fillTemplate(item.text, input),
    })),
  }
}

function line(stage: KaelProcessStage, text: string, durationMs: number): KaelProcessCatalogLine {
  return { durationMs, stage, text }
}

function selectScenario(input: BuildKaelProcessSequenceInput): KaelProcessScenarioId {
  const normalized = normalize(input.message)
  const mediaCount = input.mediaCount ?? 0
  const isPriceQuestion = containsAny(normalized, ['gia', 'chi phi', 'bao nhieu', 'uoc tinh', 'trung binh', 'tam gia', 'tham khao', 'bao gia'])
  const looksLikeServiceDraft = input.mode === 'normal' && Boolean(input.jobType) && containsAny(normalized, ['dich vu:', 'khu vuc:', 'mo ta:', 'van de:', 'thoi gian:'])

  if (containsAny(normalized, ['tu dong', 'lam luon', 'duyet ho', 'xac nhan ho', 'dat luon', 'thanh toan luon'])) return 'blocked_action'
  if (containsAny(normalized, ['ho tro', 'bao loi', 'khieu nai', 'tranh chap', 'su co', 'van de nghiem trong', 'escalate'])) return 'support_escalation'
  if (containsAny(normalized, ['bo nho', 'ghi nho', 'nho giup', 'uu tien', 'tu nay', 'so thich'])) return 'memory_update'
  if (containsAny(normalized, ['xep hang', 'ranking', 'hang', 'diem tin cay', 'diem su dung'])) return 'ranking_explain'
  if (input.mode === 'normal' && isPriceQuestion) return 'service_price_advice'
  if (looksLikeServiceDraft) return 'work_plan'
  if (containsAny(normalized, ['tien', 'thanh toan', 'bao ve dong tien', 'rut', 'giai ngan', 'payout', 'hoa don']) || containsWholeWord(normalized, 'vi')) return 'payout_review'
  if (containsAny(normalized, ['phat sinh', 'ngoai pham vi', 'them viec', 'them phan', 'scope', 'doi pham vi'])) return 'scope_change'
  if (containsAny(normalized, ['check in', 'check-in', 'toi noi', 'den noi', 'da den'])) return 'checkin_ready'
  if (containsAny(normalized, ['eta', 'vi tri', 'dia chi', 'duong di', 'lo trinh', 'toi kip', 'thoi gian den'])) return 'route_eta'
  if (mediaCount > 0 || containsAny(normalized, ['anh', 'hinh', 'video', 'bang chung', 'tep', 'ghi am', 'voice', 'giong noi'])) return 'evidence_check'
  if (input.hasRealCase && containsAny(normalized, ['tho', 'ghep', 'phu hop', 'nhan viec', 'chon nguoi'])) return 'job_match'
  if (input.mode === 'case' || containsAny(normalized, ['dat lich', 'dat dich vu', 'tao ca', 'can tho', 'bao tho', 'hen lich', 'xu ly giup', 'kiem tra giup', 'sua giup', 'don giup'])) return 'work_plan'
  return 'normal_chat'
}

function durationScale(input: BuildKaelProcessSequenceInput, scenarioId: KaelProcessScenarioId) {
  let scale = 2.05
  const normalizedComplexity = normalize(input.complexity ?? '')
  if (containsAny(normalizedComplexity, ['medium', 'trung', 'vua'])) scale += 0.22
  if (containsAny(normalizedComplexity, ['large', 'high', 'cao', 'lon', 'khan', 'phuc tap'])) scale += 0.42
  if ((input.mediaCount ?? 0) > 0) scale += 0.18
  if (input.message.trim().length > 120) scale += 0.14
  if (scenarioId === 'scope_change' || scenarioId === 'support_escalation' || scenarioId === 'payout_review') scale += 0.16
  return Math.min(3.15, scale)
}

function fillTemplate(value: string, input: BuildKaelProcessSequenceInput) {
  const context: Record<string, string> = {
    caseId: input.caseId?.trim() || fallbackContext.caseId,
    distance: input.distance?.trim() || fallbackContext.distance,
    jobType: input.jobType?.trim() || fallbackContext.jobType,
    skill: input.jobType?.trim() || fallbackContext.jobType,
  }
  return value.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key: string) => context[key] ?? '').replace(/\s{2,}/g, ' ').trim()
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
}

function containsAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle))
}

function containsWholeWord(value: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(value)
}

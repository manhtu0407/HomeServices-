import type { WorkflowArtifactMode, WorkflowArtifactType } from './artifact-lifecycle'
import type { WorkflowEvent } from './workflow-events'
import type { WorkflowPhase } from './workflow-phases'

export type WorkflowLocale = 'vi' | 'en'

export type WorkflowLocalizedText = Readonly<Record<WorkflowLocale, string>>

export type WorkflowPhaseSourceOfTruth =
  | 'pending_intake'
  | 'kael_chat_session'
  | 'hydrated_job'
  | 'broadcast'
  | 'scope_change'
  | 'completion_evidence'
  | 'review'

export type WorkflowPhaseSectionRole = 'customer' | 'worker' | 'shared'

export const WORKFLOW_PHASE_SECTION_IDS = Object.freeze([
  'intake_receipt',
  'process_ticket',
  'diagnosis_trace',
  'estimate',
  'orchestration',
  'provider_match',
  'worker_brief',
  'booking',
  'active_timeline',
  'job_chat',
  'scope_change',
  'completion_evidence',
  'completion_review',
  'dispute_decision',
  'payment_decision',
  'review',
  'cancellation_review',
] as const)

export type WorkflowPhaseSectionId = (typeof WORKFLOW_PHASE_SECTION_IDS)[number]

export type WorkflowPhaseBlockedReason =
  | 'waiting_for_customer_input'
  | 'waiting_for_kael_analysis'
  | 'waiting_for_kael_orchestration'
  | 'waiting_for_worker_acceptance'
  | 'waiting_for_customer_worker_confirmation'
  | 'chat_requires_real_job'
  | 'chat_send_closed'
  | 'customer_scope_change_confirmation_required'
  | 'completion_evidence_required'
  | 'kael_completion_review_required'
  | 'customer_completion_confirmation_required'
  | 'payment_required'
  | 'payment_pending'
  | 'job_cancelled'

export type WorkflowAllowedActionsSnapshot = Readonly<{
  confirmTicketAndEstimate: boolean
  confirmWorker?: boolean
  confirmCompletion: boolean
  jobChatRead?: boolean
  jobChatSend?: boolean
  submitReview: boolean
}>

export type WorkflowPhaseArtifactView = Readonly<{
  mode: WorkflowArtifactMode
  visible: boolean
}>

export type WorkflowPhaseSection = Readonly<{
  id: WorkflowPhaseSectionId
  role: WorkflowPhaseSectionRole
  artifact: WorkflowArtifactType | null
  mode: WorkflowArtifactMode | null
  visible: boolean
  title: WorkflowLocalizedText
  intent: WorkflowLocalizedText
  sourceOfTruth: WorkflowPhaseSourceOfTruth
  lockedReason: WorkflowPhaseBlockedReason | null
}>

export type WorkflowArtifactSection = WorkflowPhaseSection & Readonly<{
  artifact: WorkflowArtifactType
  mode: WorkflowArtifactMode
  visible: true
}>

export type WorkflowPhaseContext = Readonly<{
  phase: WorkflowPhase
  title: WorkflowLocalizedText
  intent: WorkflowLocalizedText
  sourceOfTruth: WorkflowPhaseSourceOfTruth
  sections: readonly WorkflowPhaseSection[]
  primaryArtifact: WorkflowArtifactSection | null
  secondaryArtifacts: readonly WorkflowArtifactSection[]
  blockedReason: WorkflowPhaseBlockedReason | null
  nextExpectedEvent: WorkflowEvent | null
  allowedActions: WorkflowAllowedActionsSnapshot
}>

export type BuildWorkflowPhaseContextInput = Readonly<{
  phase: WorkflowPhase
  artifacts: Record<WorkflowArtifactType, WorkflowPhaseArtifactView>
  allowedActions: WorkflowAllowedActionsSnapshot
  hasPendingIntake?: boolean
  optimistic?: 'starting_matching' | null
}>

type WorkflowPhaseConfig = Readonly<{
  title: WorkflowLocalizedText
  intent: WorkflowLocalizedText
  sourceOfTruth: WorkflowPhaseSourceOfTruth
  primaryArtifact: WorkflowArtifactType
  blockedReason: WorkflowPhaseBlockedReason | null
  nextExpectedEvent: WorkflowEvent | null
}>

type WorkflowPhaseSectionConfig = Readonly<{
  id: WorkflowPhaseSectionId
  role: WorkflowPhaseSectionRole
  artifact: WorkflowArtifactType | null
  fallbackArtifact?: WorkflowArtifactType
  title: WorkflowLocalizedText
  intent: WorkflowLocalizedText
  sourceOfTruth?: WorkflowPhaseSourceOfTruth
}>

const PHASE_CONTEXT_BY_PHASE = Object.freeze({
  intake_started: {
    title: text('Tiếp nhận yêu cầu', 'Request intake'),
    intent: text('Kael giữ yêu cầu ở trạng thái nháp cho đến khi có phiên phân tích hoặc công việc thật.', 'Kael keeps the request as pending intake until a real analysis session or job exists.'),
    sourceOfTruth: 'pending_intake',
    primaryArtifact: 'service_request',
    blockedReason: 'waiting_for_customer_input',
    nextExpectedEvent: 'customer_input_updated',
  },
  kael_collecting: {
    title: text('Kael đang gom ngữ cảnh', 'Kael is collecting context'),
    intent: text('Thông tin từ phiếu chờ và chat được gom thành phiếu xử lý, chưa mở quyền đặt lịch trên thiết bị.', 'Intake and chat details are being shaped into a ticket without opening booking authority on this device.'),
    sourceOfTruth: 'kael_chat_session',
    primaryArtifact: 'process_ticket',
    blockedReason: 'waiting_for_kael_analysis',
    nextExpectedEvent: 'ai_partial_ticket_updated',
  },
  kael_estimating: {
    title: text('Kael đang phân tích', 'Kael is analyzing'),
    intent: text('Ước tính và giải thích đang được xử lý trong phiên Kael, chưa có điều phối.', 'Estimate and explanation are being processed in the Kael session; matching has not started.'),
    sourceOfTruth: 'kael_chat_session',
    primaryArtifact: 'estimate',
    blockedReason: 'waiting_for_kael_analysis',
    nextExpectedEvent: 'ai_estimate_ready',
  },
  kael_explaining: {
    title: text('Kael đã có ước tính', 'Kael has an estimate'),
    intent: text('Kael hiển thị ước tính đã kiểm soát và chờ quyết định hệ thống để bắt đầu điều phối.', 'Kael shows the governed estimate and waits for a system decision before orchestration starts.'),
    sourceOfTruth: 'kael_chat_session',
    primaryArtifact: 'estimate',
    blockedReason: 'waiting_for_kael_orchestration',
    nextExpectedEvent: 'kael_started_matching',
  },
  ticket_review: {
    title: text('Phiếu đang được rà soát', 'Ticket under review'),
    intent: text('Phiếu cần Kael xác nhận trước khi chuyển sang điều phối.', 'The ticket needs Kael confirmation before matching.'),
    sourceOfTruth: 'kael_chat_session',
    primaryArtifact: 'process_ticket',
    blockedReason: 'waiting_for_kael_orchestration',
    nextExpectedEvent: 'kael_started_matching',
  },
  matching: {
    title: text('Đang điều phối thợ', 'Matching worker'),
    intent: text('Điều phối chỉ xuất hiện sau quyết định Kael/hệ thống; người dùng chờ thợ nhận việc.', 'Matching appears only after a Kael/system decision; the user waits for worker acceptance.'),
    sourceOfTruth: 'broadcast',
    primaryArtifact: 'provider_match',
    blockedReason: 'waiting_for_worker_acceptance',
    nextExpectedEvent: 'worker_accepted',
  },
  worker_candidate_review: {
    title: text('Xác nhận thợ phù hợp', 'Confirm the proposed worker'),
    intent: text('Thợ đã nhận lời nhưng chưa được giao việc. Khách xem hồ sơ an toàn rồi xác nhận hoặc yêu cầu tìm tiếp.', 'The worker has accepted but is not assigned yet. The customer reviews a safe profile and confirms or asks Kael to continue searching.'),
    sourceOfTruth: 'broadcast',
    primaryArtifact: 'provider_match',
    blockedReason: 'waiting_for_customer_worker_confirmation',
    nextExpectedEvent: 'customer_confirmed_worker',
  },
  worker_matched: {
    title: text('Đã có thợ nhận việc', 'Worker accepted'),
    intent: text('Lịch đặt và tóm tắt đã có hiệu lực; địa chỉ đầy đủ chỉ mở theo quyền hệ thống.', 'Booking and brief are active; full address follows system release rules.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'booking',
    blockedReason: null,
    nextExpectedEvent: 'worker_status_advanced',
  },
  worker_on_way: {
    title: text('Thợ đang di chuyển', 'Worker on the way'),
    intent: text('Timeline vật lý bắt đầu; hành động tiếp theo đến từ cập nhật trạng thái hợp lệ.', 'The physical timeline has started; the next action comes from an allowed status update.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'booking',
    blockedReason: null,
    nextExpectedEvent: 'worker_status_advanced',
  },
  arrived: {
    title: text('Thợ đã đến nơi', 'Worker arrived'),
    intent: text('Công việc chuyển sang kiểm tra tại chỗ, vẫn theo trạng thái đã đồng bộ.', 'The job moves into on-site inspection under the synced status.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'booking',
    blockedReason: null,
    nextExpectedEvent: 'worker_status_advanced',
  },
  inspecting: {
    title: text('Đang kiểm tra hiện trạng', 'Inspecting on site'),
    intent: text('Thợ ghi nhận hiện trạng; thay đổi phạm vi phải đi qua bằng chứng và Kael.', 'The worker inspects the issue; scope changes require evidence and Kael review.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'booking',
    blockedReason: null,
    nextExpectedEvent: 'worker_status_advanced',
  },
  repairing: {
    title: text('Đang xử lý', 'Repair in progress'),
    intent: text('Công việc đang chạy; phạm vi và hoàn tất vẫn bị khóa bởi dấu mốc bằng chứng.', 'Work is in progress; scope and completion remain gated by evidence artifacts.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'booking',
    blockedReason: null,
    nextExpectedEvent: 'worker_completed',
  },
  scope_change_pending: {
    title: text('Đề xuất đổi phạm vi chờ khách xác nhận', 'Scope proposal awaiting customer confirmation'),
    intent: text('Kael tính lại đề xuất từ bằng chứng thợ gửi; khách xác nhận, giữ phạm vi cũ hoặc khiếu nại trong ứng dụng.', 'Kael recomputes the proposal from worker evidence; the customer confirms, keeps the original scope, or appeals in the app.'),
    sourceOfTruth: 'scope_change',
    primaryArtifact: 'scope_change',
    blockedReason: 'customer_scope_change_confirmation_required',
    nextExpectedEvent: 'scope_change_decided',
  },
  completed_by_worker: {
    title: text('Thợ đã gửi bằng chứng hoàn tất', 'Worker submitted completion evidence'),
    intent: text('Khách xem bằng chứng thật rồi xác nhận hoàn tất hoặc báo vấn đề; hệ thống không tự vượt cổng này.', 'The customer reviews real evidence and confirms completion or reports an issue; the system cannot skip this gate.'),
    sourceOfTruth: 'completion_evidence',
    primaryArtifact: 'completion_evidence',
    blockedReason: 'customer_completion_confirmation_required',
    nextExpectedEvent: 'customer_confirmed_completion',
  },
  customer_confirmed_completion: {
    title: text('Khách đã xác nhận hoàn tất', 'Completion confirmed by customer'),
    intent: text('Thanh toán là giai đoạn kế tiếp; đánh giá vẫn khóa cho đến khi server xác nhận đã thanh toán.', 'Payment is the next phase; review remains locked until the server confirms payment.'),
    sourceOfTruth: 'completion_evidence',
    primaryArtifact: 'payment_decision',
    blockedReason: 'payment_required',
    nextExpectedEvent: 'kael_decided_payment',
  },
  payment_pending: {
    title: text('Đang chờ thanh toán', 'Payment pending'),
    intent: text('Đánh giá bị khóa cho đến khi trạng thái thanh toán cho phép.', 'Review stays locked until payment status allows it.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'payment_decision',
    blockedReason: 'payment_pending',
    nextExpectedEvent: 'payment_confirmed',
  },
  paid: {
    title: text('Đã thanh toán', 'Paid'),
    intent: text('Người dùng có thể đánh giá khi bộ chọn cục bộ cũng cho phép.', 'The customer can review when the local selector also allows it.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'review',
    blockedReason: null,
    nextExpectedEvent: 'review_submitted',
  },
  done: {
    title: text('Giao dịch đã đóng', 'Transaction closed'),
    intent: text('Đánh giá là dấu mốc cuối cùng; màn hình không tự mở lại luồng.', 'Review is the final artifact; the screen does not reopen the workflow.'),
    sourceOfTruth: 'review',
    primaryArtifact: 'review',
    blockedReason: null,
    nextExpectedEvent: null,
  },
  cancelled: {
    title: text('Giao dịch đã hủy', 'Transaction cancelled'),
    intent: text('Màn hình chỉ hiển thị kết quả chính sách hiện có, không giả lập phục hồi hay thành công.', 'The screen only shows the current policy outcome, without fake recovery or success.'),
    sourceOfTruth: 'hydrated_job',
    primaryArtifact: 'cancellation_review',
    blockedReason: 'job_cancelled',
    nextExpectedEvent: null,
  },
} satisfies Record<WorkflowPhase, WorkflowPhaseConfig>)

const SECTION_CONFIGS = Object.freeze([
  {
    id: 'intake_receipt',
    role: 'customer',
    artifact: 'service_request',
    title: text('Phiếu tiếp nhận', 'Intake receipt'),
    intent: text('Dịch vụ, mô tả, khu vực và số media đến từ phiếu đặt hoặc nội dung đã lưu.', 'Service, description, area, and media count come from Booking handoff or saved input.'),
    sourceOfTruth: 'pending_intake',
  },
  {
    id: 'process_ticket',
    role: 'customer',
    artifact: 'process_ticket',
    title: text('Phiếu xử lý', 'Process ticket'),
    intent: text('Kael cho biết đang thu thập, ước tính, giải thích hay điều phối.', 'Kael shows whether it is collecting, estimating, explaining, or orchestrating.'),
    sourceOfTruth: 'kael_chat_session',
  },
  {
    id: 'diagnosis_trace',
    role: 'customer',
    artifact: 'ai_diagnosis',
    fallbackArtifact: 'ai_notes',
    title: text('Dấu vết chẩn đoán', 'Diagnosis trace'),
    intent: text('Hiển thị dịch vụ, thông tin còn thiếu và trạng thái quyết định mà không lộ nội dung AI thô.', 'Shows service, missing info, and decision state without exposing raw AI.'),
    sourceOfTruth: 'kael_chat_session',
  },
  {
    id: 'estimate',
    role: 'shared',
    artifact: 'estimate',
    title: text('Ước tính Kael', 'Kael estimate'),
    intent: text('Ước tính đã được kiểm soát kèm lưu ý, độ tin cậy và nguồn quyết định.', 'A governed estimate with disclaimer, confidence, and decision source.'),
    sourceOfTruth: 'kael_chat_session',
  },
  {
    id: 'orchestration',
    role: 'customer',
    artifact: null,
    title: text('Điều phối', 'Orchestration'),
    intent: text('Điều phối chỉ được coi là bắt đầu khi có quyết định từ hệ thống.', 'Matching is considered started only after a system decision.'),
    sourceOfTruth: 'broadcast',
  },
  {
    id: 'provider_match',
    role: 'shared',
    artifact: 'provider_match',
    title: text('Ghép thợ', 'Provider match'),
    intent: text('Trạng thái ghép thợ đến từ luồng điều phối/công việc đã đồng bộ, không phải tìm kiếm cục bộ.', 'Match state comes from hydrated broadcast/job data, not local search.'),
    sourceOfTruth: 'broadcast',
  },
  {
    id: 'worker_brief',
    role: 'worker',
    artifact: 'worker_brief',
    title: text('Tóm tắt cho thợ', 'Worker brief'),
    intent: text('Thợ thấy tóm tắt, khu vực chung và nguồn ước tính trước khi nhận việc.', 'The worker sees the brief, general area, and estimate source before accepting.'),
    sourceOfTruth: 'broadcast',
  },
  {
    id: 'booking',
    role: 'shared',
    artifact: 'booking',
    title: text('Lịch đặt thật', 'Real booking'),
    intent: text('Lịch đặt chỉ sống khi hệ thống đã có trạng thái công việc phù hợp.', 'Booking exists only when the system has the matching job state.'),
    sourceOfTruth: 'hydrated_job',
  },
  {
    id: 'active_timeline',
    role: 'shared',
    artifact: null,
    title: text('Timeline hiện trường', 'Field timeline'),
    intent: text('On-way, arrived, inspecting và repairing đi theo trạng thái đã đồng bộ.', 'On-way, arrived, inspecting, and repairing follow the synced status.'),
    sourceOfTruth: 'hydrated_job',
  },
  {
    id: 'job_chat',
    role: 'shared',
    artifact: null,
    title: text('Chat công việc', 'Job chat'),
    intent: text('Chat chỉ mở khi có công việc thật và điều kiện phù hợp.', 'Chat opens only when a real job and eligibility exist.'),
    sourceOfTruth: 'hydrated_job',
  },
  {
    id: 'scope_change',
    role: 'shared',
    artifact: 'scope_change',
    title: text('Thay đổi phạm vi', 'Scope change'),
    intent: text('Thợ gửi bằng chứng; Kael/hệ thống quyết định phạm vi và giá.', 'The worker submits evidence; Kael/system decides scope and price.'),
    sourceOfTruth: 'scope_change',
  },
  {
    id: 'completion_evidence',
    role: 'shared',
    artifact: 'completion_evidence',
    title: text('Bằng chứng hoàn tất', 'Completion evidence'),
    intent: text('Thợ gửi ghi chú/ảnh; xác nhận hoàn tất không nằm ở màn hình của thợ.', 'The worker submits notes/photos; completion confirmation is not owned by the worker screen.'),
    sourceOfTruth: 'completion_evidence',
  },
  {
    id: 'completion_review',
    role: 'customer',
    artifact: 'completion_review',
    title: text('Kael rà soát hoàn tất', 'Kael completion review'),
    intent: text('Kael kiểm tra bằng chứng trước khi chuyển thanh toán/đánh giá.', 'Kael checks evidence before payment/review.'),
    sourceOfTruth: 'completion_evidence',
  },
  {
    id: 'dispute_decision',
    role: 'shared',
    artifact: 'dispute_decision',
    title: text('Quyết định chính sách', 'Policy decision'),
    intent: text('Kael/hệ thống giữ quyền quyết định nhánh hoàn tất hoặc tranh chấp từ bằng chứng.', 'Kael/system owns the completion or dispute decision from evidence.'),
    sourceOfTruth: 'completion_evidence',
  },
  {
    id: 'payment_decision',
    role: 'customer',
    artifact: 'payment_decision',
    title: text('Quyết định thanh toán', 'Payment decision'),
    intent: text('Nguồn thanh toán thuộc hệ thống; màn hình không tự xác nhận tiền.', 'Payment source is system-owned; the screen does not self-confirm money.'),
    sourceOfTruth: 'hydrated_job',
  },
  {
    id: 'review',
    role: 'customer',
    artifact: 'review',
    title: text('Đánh giá', 'Review'),
    intent: text('Đánh giá chỉ mở khi giai đoạn và bộ chọn cục bộ đều cho phép.', 'Review opens only when both phase and local selector allow it.'),
    sourceOfTruth: 'review',
  },
  {
    id: 'cancellation_review',
    role: 'shared',
    artifact: 'cancellation_review',
    title: text('Chính sách hủy', 'Cancellation policy'),
    intent: text('Hiển thị trạng thái hủy thật từ Kael/hệ thống.', 'Shows the real cancellation state from Kael/system.'),
    sourceOfTruth: 'hydrated_job',
  },
] satisfies readonly WorkflowPhaseSectionConfig[])

const ACTIVE_TIMELINE_PHASES: readonly WorkflowPhase[] = [
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'customer_confirmed_completion',
  'payment_pending',
  'paid',
]

const JOB_CHAT_PHASES: readonly WorkflowPhase[] = [
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'customer_confirmed_completion',
  'payment_pending',
  'paid',
  'done',
]

const JOB_CHAT_SEND_PHASES: readonly WorkflowPhase[] = [
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'customer_confirmed_completion',
]

export function isWorkflowJobChatReadable(phase: WorkflowPhase): boolean {
  return JOB_CHAT_PHASES.includes(phase)
}

export function isWorkflowJobChatSendable(phase: WorkflowPhase): boolean {
  return JOB_CHAT_SEND_PHASES.includes(phase)
}

export function buildWorkflowPhaseContext(input: BuildWorkflowPhaseContextInput): WorkflowPhaseContext {
  const phaseConfig = PHASE_CONTEXT_BY_PHASE[input.phase]
  const sections = SECTION_CONFIGS.map((sectionConfig) => buildSection(sectionConfig, input, phaseConfig))
  const visibleArtifactSections = sections.filter(isVisibleArtifactSection)
  const primaryArtifact = visibleArtifactSections.find((section) => section.artifact === phaseConfig.primaryArtifact) ?? null
  const blockedReason = phaseBlockedReason(input, phaseConfig)
  const nextExpectedEvent = phaseNextExpectedEvent(input, phaseConfig)

  return {
    phase: input.phase,
    title: phaseConfig.title,
    intent: phaseConfig.intent,
    sourceOfTruth: phaseConfig.sourceOfTruth,
    sections,
    primaryArtifact,
    secondaryArtifacts: visibleArtifactSections.filter((section) => section !== primaryArtifact),
    blockedReason,
    nextExpectedEvent,
    allowedActions: input.allowedActions,
  }
}

export function orderWorkflowPhaseSectionsForSummary(
  phaseContext: WorkflowPhaseContext,
  sections: readonly WorkflowPhaseSection[],
): WorkflowPhaseSection[] {
  return [...sections].sort((left, right) => {
    const rankDelta = sectionSummaryRank(left, phaseContext) - sectionSummaryRank(right, phaseContext)
    if (rankDelta !== 0) return rankDelta
    return sectionOrder(left.id) - sectionOrder(right.id)
  })
}

export function workflowSourceOfTruthLabel(source: WorkflowPhaseSourceOfTruth, locale: WorkflowLocale): string {
  const labels: Record<WorkflowPhaseSourceOfTruth, WorkflowLocalizedText> = {
    pending_intake: text('Phiếu chờ', 'Pending intake'),
    kael_chat_session: text('Phiên Kael', 'Kael session'),
    hydrated_job: text('Công việc đã đồng bộ', 'Synced job'),
    broadcast: text('Luồng điều phối', 'Broadcast/job'),
    scope_change: text('Thay đổi phạm vi', 'Scope change'),
    completion_evidence: text('Bằng chứng hoàn tất', 'Completion evidence'),
    review: text('Đánh giá', 'Review'),
  }
  return labels[source][locale]
}

export function workflowEventLabel(event: WorkflowEvent, locale: WorkflowLocale): string {
  const labels: Record<WorkflowEvent, WorkflowLocalizedText> = {
    customer_input_started: text('Bắt đầu nhập yêu cầu', 'Start intake'),
    customer_input_updated: text('Cập nhật mô tả', 'Update intake'),
    kael_missing_info_requested: text('Kael yêu cầu bổ sung thông tin', 'Kael requests missing information'),
    ai_partial_ticket_updated: text('Kael cập nhật phiếu', 'Kael updates ticket'),
    ai_estimate_ready: text('Ước tính sẵn sàng', 'Estimate ready'),
    kael_failed: text('Kael chưa thể xử lý', 'Kael could not complete processing'),
    ai_explanation_ready: text('Giải thích sẵn sàng', 'Explanation ready'),
    kael_confirmed_ticket: text('Kael xác nhận phiếu', 'Kael confirms ticket'),
    kael_started_matching: text('Kael bắt đầu điều phối', 'Kael starts matching'),
    customer_confirmed_ticket: text('Khách xác nhận phiếu', 'Customer confirms ticket'),
    matching_started: text('Bắt đầu tìm thợ', 'Matching starts'),
    worker_accepted: text('Thợ nhận việc', 'Worker accepts'),
    customer_confirmed_worker: text('Khách xác nhận thợ', 'Customer confirms worker'),
    worker_status_advanced: text('Cập nhật trạng thái', 'Status advances'),
    scope_change_requested: text('Thợ yêu cầu đổi phạm vi', 'Worker requests scope change'),
    scope_change_decided: text('Khách đã quyết định đề xuất đổi phạm vi', 'Customer decided the scope proposal'),
    worker_completed: text('Thợ gửi hoàn tất', 'Worker completes'),
    kael_decided_scope_change: text('Kael đã tính lại đề xuất đổi phạm vi', 'Kael recomputes the scope proposal'),
    kael_confirmed_completion: text('Kael xác nhận hoàn tất', 'Kael confirms completion'),
    customer_confirmed_completion: text('Khách xác nhận hoàn tất', 'Customer confirms completion'),
    kael_decided_payment: text('Kael quyết định thanh toán', 'Kael decides payment'),
    payment_confirmed: text('Thanh toán xác nhận', 'Payment confirmed'),
    worker_confirmed_cash_payment: text('Thợ xác nhận tiền mặt', 'Worker confirms cash payment'),
    kael_decided_dispute: text('Kael quyết định khiếu nại', 'Kael decides dispute'),
    review_submitted: text('Gửi đánh giá', 'Review submitted'),
    kael_processed_cancellation: text('Kael xử lý yêu cầu hủy', 'Kael processes cancellation'),
    cancel_requested: text('Đã yêu cầu hủy', 'Cancellation requested'),
  }
  return labels[event][locale]
}

export function workflowBlockedReasonLabel(reason: WorkflowPhaseBlockedReason, locale: WorkflowLocale): string {
  const labels: Record<WorkflowPhaseBlockedReason, WorkflowLocalizedText> = {
    waiting_for_customer_input: text('Chờ mô tả thật', 'Waiting for real input'),
    waiting_for_kael_analysis: text('Chờ Kael phân tích', 'Waiting for Kael analysis'),
    waiting_for_kael_orchestration: text('Chờ quyết định hệ thống', 'Waiting for system decision'),
    waiting_for_worker_acceptance: text('Chờ thợ nhận việc', 'Waiting for worker acceptance'),
    waiting_for_customer_worker_confirmation: text('Chờ khách xác nhận thợ', 'Waiting for customer worker confirmation'),
    chat_requires_real_job: text('Chat cần công việc thật', 'Chat needs a real job'),
    chat_send_closed: text('Chat chỉ còn đọc lại', 'Chat is read-only now'),
    customer_scope_change_confirmation_required: text('Chờ khách xác nhận đề xuất đổi phạm vi', 'Waiting for customer scope confirmation'),
    completion_evidence_required: text('Cần bằng chứng hoàn tất', 'Completion evidence required'),
    kael_completion_review_required: text('Kael rà soát hoàn tất', 'Kael reviews completion'),
    customer_completion_confirmation_required: text('Chờ khách xác nhận hoàn tất', 'Waiting for customer completion confirmation'),
    payment_required: text('Cần thanh toán trước khi đánh giá', 'Payment required before review'),
    payment_pending: text('Chờ thanh toán', 'Payment pending'),
    job_cancelled: text('Công việc đã hủy', 'Job cancelled'),
  }
  return labels[reason][locale]
}

export function workflowAllowedActionsLabel(actions: WorkflowAllowedActionsSnapshot, locale: WorkflowLocale): string {
  const enabled: WorkflowLocalizedText[] = []
  if (actions.confirmTicketAndEstimate) enabled.push(text('Xác nhận phiếu và ước tính', 'Confirm ticket and estimate'))
  if (actions.confirmWorker) enabled.push(text('Xác nhận thợ', 'Confirm worker'))
  if (actions.confirmCompletion) enabled.push(text('Xác nhận hoàn tất', 'Confirm completion'))
  if (actions.jobChatSend) enabled.push(text('Nhắn trong chat công việc', 'Send job chat'))
  else if (actions.jobChatRead) enabled.push(text('Đọc lại chat công việc', 'Read job chat'))
  if (actions.submitReview) enabled.push(text('Gửi đánh giá', 'Submit review'))
  if (enabled.length === 0) {
    return locale === 'en' ? 'No action unlocked' : 'Chưa có thao tác được mở'
  }
  return enabled.map((item) => item[locale]).join(' · ')
}

export function workflowArtifactModeLabel(mode: WorkflowArtifactMode, locale: WorkflowLocale): string {
  const labels: Record<WorkflowArtifactMode, WorkflowLocalizedText> = {
    hidden: text('Ẩn', 'Hidden'),
    basic: text('Cơ bản', 'Basic'),
    loading: text('Đang xử lý', 'Loading'),
    partial: text('Đang gom', 'Partial'),
    annotated: text('Có ghi chú', 'Annotated'),
    review: text('Cần xét', 'Review'),
    final: text('Đã chốt', 'Final'),
    done: text('Đã xong', 'Done'),
    blocked: text('Đang khóa', 'Blocked'),
    failed: text('Lỗi', 'Failed'),
  }
  return labels[mode][locale]
}

function sectionSummaryRank(section: WorkflowPhaseSection, phaseContext: WorkflowPhaseContext): number {
  if (phaseContext.primaryArtifact?.id === section.id) return 0
  if (phaseContext.phase === 'repairing' && section.id === 'completion_evidence') return 1
  if ((phaseContext.phase === 'inspecting' || phaseContext.phase === 'repairing') && section.id === 'scope_change') return 2
  if (section.sourceOfTruth === phaseContext.sourceOfTruth && section.artifact !== null) return 3
  if (section.sourceOfTruth === phaseContext.sourceOfTruth) return 4
  if (section.lockedReason) return 5
  if (section.artifact !== null) return 6
  return 7
}

function sectionOrder(id: WorkflowPhaseSectionId): number {
  return WORKFLOW_PHASE_SECTION_IDS.indexOf(id)
}

function phaseBlockedReason(
  input: BuildWorkflowPhaseContextInput,
  phaseConfig: WorkflowPhaseConfig,
): WorkflowPhaseBlockedReason | null {
  if (input.phase === 'intake_started' && input.hasPendingIntake) {
    return 'waiting_for_kael_analysis'
  }
  if (input.phase === 'completed_by_worker' && input.artifacts.completion_evidence.mode === 'blocked') {
    return 'completion_evidence_required'
  }
  return phaseConfig.blockedReason
}

function phaseNextExpectedEvent(
  input: BuildWorkflowPhaseContextInput,
  phaseConfig: WorkflowPhaseConfig,
): WorkflowEvent | null {
  if (input.phase === 'intake_started' && input.hasPendingIntake) {
    return 'ai_partial_ticket_updated'
  }
  return phaseConfig.nextExpectedEvent
}

function buildSection(
  config: WorkflowPhaseSectionConfig,
  input: BuildWorkflowPhaseContextInput,
  phaseConfig: WorkflowPhaseConfig,
): WorkflowPhaseSection {
  const artifactView = artifactViewForSection(config, input.artifacts)
  const visible = sectionVisible(config, input, artifactView)
  const lockedReason = sectionLockedReason(config, input, artifactView)

  return {
    id: config.id,
    role: config.role,
    artifact: artifactView?.artifact ?? config.artifact,
    mode: artifactView?.view.mode ?? null,
    visible,
    title: config.title,
    intent: config.intent,
    sourceOfTruth: config.sourceOfTruth ?? phaseConfig.sourceOfTruth,
    lockedReason,
  }
}

function artifactViewForSection(
  config: WorkflowPhaseSectionConfig,
  artifacts: Record<WorkflowArtifactType, WorkflowPhaseArtifactView>,
): { artifact: WorkflowArtifactType; view: WorkflowPhaseArtifactView } | null {
  if (!config.artifact) return null

  const primary = artifacts[config.artifact]
  if (primary.visible || !config.fallbackArtifact) {
    return { artifact: config.artifact, view: primary }
  }

  return { artifact: config.fallbackArtifact, view: artifacts[config.fallbackArtifact] }
}

function sectionVisible(
  config: WorkflowPhaseSectionConfig,
  input: BuildWorkflowPhaseContextInput,
  artifactView: { artifact: WorkflowArtifactType; view: WorkflowPhaseArtifactView } | null,
): boolean {
  if (config.id === 'diagnosis_trace') {
    return Boolean(
      artifactView?.view.visible ||
      input.phase === 'kael_estimating' ||
      input.phase === 'kael_explaining'
    )
  }

  if (config.id === 'orchestration') {
    return input.phase === 'matching'
  }

  if (config.id === 'active_timeline') {
    return ACTIVE_TIMELINE_PHASES.includes(input.phase)
  }

  if (config.id === 'job_chat') {
    return isWorkflowJobChatReadable(input.phase)
  }

  return Boolean(artifactView?.view.visible)
}

function sectionLockedReason(
  config: WorkflowPhaseSectionConfig,
  input: BuildWorkflowPhaseContextInput,
  artifactView: { artifact: WorkflowArtifactType; view: WorkflowPhaseArtifactView } | null,
): WorkflowPhaseBlockedReason | null {
  if (config.id === 'job_chat' && !isWorkflowJobChatReadable(input.phase)) {
    return 'chat_requires_real_job'
  }

  if (config.id === 'job_chat' && !isWorkflowJobChatSendable(input.phase)) {
    return 'chat_send_closed'
  }

  if (config.id === 'completion_evidence' && artifactView?.view.mode === 'blocked') {
    return 'completion_evidence_required'
  }

  if (config.id === 'orchestration' && input.phase === 'kael_explaining') {
    return 'waiting_for_kael_orchestration'
  }

  if (config.id === 'review' && (!artifactView?.view.visible || artifactView.view.mode === 'done' || artifactView.view.mode === 'final')) {
    return null
  }

  if (config.id === 'review' && !input.allowedActions.submitReview) {
    if (input.phase === 'payment_pending') return 'payment_pending'
    if (input.phase === 'customer_confirmed_completion') return 'payment_required'
    return 'completion_evidence_required'
  }

  return null
}

function isVisibleArtifactSection(section: WorkflowPhaseSection): section is WorkflowArtifactSection {
  return section.visible && section.artifact !== null && section.mode !== null && section.mode !== 'hidden'
}

function text(vi: string, en: string): WorkflowLocalizedText {
  return Object.freeze({ vi, en })
}

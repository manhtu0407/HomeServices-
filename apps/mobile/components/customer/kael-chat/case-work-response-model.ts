import type { AppLanguage } from '@/lib/app-language'
import { WORKFLOW_PHASES, type LocalDeal, type WorkflowPhase } from '@nestscout/shared'

import { customerV21ServiceCopy } from '../ui/copy'
import { formatDurationShort } from './case-work-display-model'
import { formatVnd } from './case-work-money-display-model'

export type CaseWorkResponseActionKind =
  | 'apartment_access'
  | 'completion'
  | 'none'
  | 'offer'
  | 'payment'
  | 'review'
  | 'scope_change'
  | 'worker_candidate'

export type CaseWorkResponseModel = Readonly<{
  actionKind: CaseWorkResponseActionKind
  noteCopy: string
  noteTitle: string
  phase: WorkflowPhase
  status: string
  title: string
}>

export type PaymentRailProvider = 'sepay_vietqr' | null

type PhaseCopy = Readonly<{
  noteCopy: string
  noteTitle: string
  status: string
  title: string
}>

type BuildCaseWorkResponseModelInput = Readonly<{
  deal?: LocalDeal | null
  language: AppLanguage
  paymentRailProvider?: PaymentRailProvider
  phase: WorkflowPhase
  subject?: string | null
  workerName?: string | null
}>

const ACTION_BY_PHASE: Readonly<Partial<Record<WorkflowPhase, CaseWorkResponseActionKind>>> = Object.freeze({
  completed_by_worker: 'completion',
  customer_confirmed_completion: 'payment',
  paid: 'review',
  payment_pending: 'payment',
  scope_change_pending: 'scope_change',
  ticket_review: 'offer',
  worker_candidate_review: 'worker_candidate',
})

const CASE_WORK_HISTORY_PHASES: readonly WorkflowPhase[] = WORKFLOW_PHASES.filter((phase) => phase !== 'cancelled')

const VI_COMPLETED_PHASE_TITLES: Readonly<Record<WorkflowPhase, string>> = Object.freeze({
  arrived: 'Thợ đã đến nơi',
  cancelled: 'Công việc đã được hủy',
  completed_by_worker: 'Thợ đã gửi kết quả hoàn tất',
  customer_confirmed_completion: 'Bạn đã xác nhận hoàn tất',
  done: 'Bạn đã gửi đánh giá',
  inspecting: 'Hiện trạng đã được kiểm tra',
  intake_started: 'Yêu cầu đã được tiếp nhận',
  kael_collecting: 'Kael đã làm rõ thông tin',
  kael_estimating: 'Kael đã phân tích yêu cầu',
  kael_explaining: 'Phạm vi và ước tính đã sẵn sàng',
  matching: 'Kael đã bắt đầu tìm thợ',
  paid: 'Thanh toán đã được xác nhận',
  payment_pending: 'Thanh toán đã được mở',
  repairing: 'Công việc đã được thực hiện',
  scope_change_pending: 'Đề xuất đổi phạm vi đã được xử lý',
  ticket_review: 'Bạn đã xác nhận phương án',
  worker_candidate_review: 'Bạn đã xem và xác nhận thợ',
  worker_matched: 'Thợ đã được ghép cho công việc',
  worker_on_way: 'Thợ đã bắt đầu di chuyển',
})

const EN_COMPLETED_PHASE_TITLES: Readonly<Record<WorkflowPhase, string>> = Object.freeze({
  arrived: 'The worker arrived',
  cancelled: 'The job was cancelled',
  completed_by_worker: 'The worker submitted the completion result',
  customer_confirmed_completion: 'You confirmed completion',
  done: 'You submitted a review',
  inspecting: 'The site was inspected',
  intake_started: 'The request was received',
  kael_collecting: 'Kael clarified the details',
  kael_estimating: 'Kael analyzed the request',
  kael_explaining: 'The scope and estimate became ready',
  matching: 'Kael started finding a worker',
  paid: 'Payment was confirmed',
  payment_pending: 'Payment was opened',
  repairing: 'The work was carried out',
  scope_change_pending: 'The scope proposal was handled',
  ticket_review: 'You confirmed the proposal',
  worker_candidate_review: 'You reviewed and confirmed the worker',
  worker_matched: 'A worker was matched to the job',
  worker_on_way: 'The worker started travelling',
})

const VI_COPY: Readonly<Record<WorkflowPhase, PhaseCopy>> = Object.freeze({
  arrived: {
    noteCopy: 'Vị trí xử lý sẽ được kiểm tra trước khi bắt đầu công việc.',
    noteTitle: 'Bước tiếp theo',
    status: 'Đã đến',
    title: 'Thợ đã đến nơi',
  },
  cancelled: {
    noteCopy: 'Phiên này đã dừng theo trạng thái hệ thống và không tự mở lại quy trình.',
    noteTitle: 'Trạng thái công việc',
    status: 'Đã hủy',
    title: 'Công việc đã được hủy',
  },
  completed_by_worker: {
    noteCopy: 'Kiểm tra kết quả và báo lại ngay nếu còn điểm chưa đúng hoặc chưa đủ.',
    noteTitle: 'Trước khi hoàn tất',
    status: 'Cần kiểm tra',
    title: 'Kết quả công việc đã sẵn sàng',
  },
  customer_confirmed_completion: {
    noteCopy: 'Quy trình chỉ chuyển sang thanh toán sau xác nhận hoàn tất của bạn.',
    noteTitle: 'Bước tiếp theo',
    status: 'Đã xác nhận',
    title: 'Hoàn tất đã được xác nhận',
  },
  done: {
    noteCopy: 'Đánh giá và các dấu mốc thật của công việc được giữ trong mục Hoạt động.',
    noteTitle: 'Thông tin đã lưu',
    status: 'Đã hoàn tất',
    title: 'Phiên công việc đã khép lại',
  },
  inspecting: {
    noteCopy: 'Thợ kiểm tra hiện trạng, mọi thay đổi ngoài phạm vi vẫn cần được xác nhận.',
    noteTitle: 'Phạm vi an toàn',
    status: 'Đang kiểm tra',
    title: 'Kiểm tra vị trí thi công',
  },
  intake_started: {
    noteCopy: 'Kael giữ nguyên nội dung bạn gửi và bắt đầu sắp xếp thông tin cho phiên công việc này.',
    noteTitle: 'Đã ghi nhận',
    status: 'Đã tiếp nhận',
    title: 'Yêu cầu của bạn đã được tiếp nhận',
  },
  kael_collecting: {
    noteCopy: 'Kael đang gom mô tả, khu vực và bằng chứng thành một yêu cầu rõ ràng.',
    noteTitle: 'Thông tin đang được sắp xếp',
    status: 'Đang thu thập',
    title: 'Kael đang làm rõ yêu cầu',
  },
  kael_estimating: {
    noteCopy: 'Kael đang kiểm tra phạm vi, rủi ro và dữ liệu còn thiếu trước khi đề xuất phương án.',
    noteTitle: 'Kael đang kiểm tra',
    status: 'Đang phân tích',
    title: 'Phân tích hiện trạng và phương án',
  },
  kael_explaining: {
    noteCopy: 'Phạm vi và ước tính đã được chuẩn bị để bạn xem trước khi đưa ra quyết định.',
    noteTitle: 'Phương án đề xuất',
    status: 'Đã có phương án',
    title: 'Phương án xử lý đã sẵn sàng',
  },
  matching: {
    noteCopy: 'Kael đang đối chiếu kỹ năng, khu vực phục vụ và khả năng nhận việc thật.',
    noteTitle: 'Điều Kael đang đối chiếu',
    status: 'Đang kết nối',
    title: 'Tìm thợ phù hợp với hạng mục',
  },
  paid: {
    noteCopy: 'Thanh toán đã được hệ thống xác nhận, bạn có thể gửi đánh giá cho công việc này.',
    noteTitle: 'Sau khi thanh toán',
    status: 'Đã thanh toán',
    title: 'Thanh toán đã được xác nhận',
  },
  payment_pending: {
    noteCopy: 'Hệ thống đang chờ trạng thái thanh toán thật được xác nhận trước khi mở bước đánh giá.',
    noteTitle: 'Trạng thái thanh toán',
    status: 'Chờ thanh toán',
    title: 'Thanh toán đang chờ xác nhận',
  },
  repairing: {
    noteCopy: 'Kael chỉ cập nhật khi có thay đổi quan trọng liên quan đến phạm vi, tiến độ hoặc an toàn.',
    noteTitle: 'Theo dõi thay đổi',
    status: 'Đang thực hiện',
    title: 'Công việc đã bắt đầu',
  },
  scope_change_pending: {
    noteCopy: 'Công việc đang tạm dừng ở phần thay đổi để chờ quyết định hợp lệ.',
    noteTitle: 'Lý do thay đổi',
    status: 'Cần quyết định',
    title: 'Có đề xuất thay đổi phạm vi',
  },
  ticket_review: {
    noteCopy: 'Chỉ xác nhận khi phạm vi và ước tính đã rõ, đúng với nhu cầu của bạn.',
    noteTitle: 'Quyền quyết định của bạn',
    status: 'Cần xác nhận',
    title: 'Phương án đang chờ bạn quyết định',
  },
  worker_candidate_review: {
    noteCopy: 'Xem hồ sơ an toàn và danh sách kiểm tra đã lưu trước khi đưa ra quyết định.',
    noteTitle: 'Trước khi chọn thợ',
    status: 'Cần xác nhận',
    title: 'Hồ sơ thợ đã sẵn sàng để xem',
  },
  worker_matched: {
    noteCopy: 'Phạm vi công việc và dữ liệu cần thiết đã được chuyển sang bảng công việc.',
    noteTitle: 'Thông tin đã bàn giao',
    status: 'Đã ghép thợ',
    title: 'Thợ đã được xác nhận',
  },
  worker_on_way: {
    noteCopy: 'Thời gian đến chỉ hiển thị khi hệ thống nhận được cập nhật thật từ công việc.',
    noteTitle: 'Cập nhật thời gian',
    status: 'Đang di chuyển',
    title: 'Thợ đang di chuyển đến nơi',
  },
})

const EN_COPY: Readonly<Record<WorkflowPhase, PhaseCopy>> = Object.freeze({
  arrived: { noteCopy: 'The work area will be inspected before service begins.', noteTitle: 'Next step', status: 'Arrived', title: 'The worker has arrived' },
  cancelled: { noteCopy: 'This session stopped at the system-confirmed state and will not reopen itself.', noteTitle: 'Work status', status: 'Cancelled', title: 'The work has been cancelled' },
  completed_by_worker: { noteCopy: 'Review the result and report anything incomplete or incorrect.', noteTitle: 'Before completion', status: 'Review needed', title: 'The work result is ready' },
  customer_confirmed_completion: { noteCopy: 'The workflow moves to payment only after your completion confirmation.', noteTitle: 'Next step', status: 'Confirmed', title: 'Completion has been confirmed' },
  done: { noteCopy: 'The review and real work milestones remain available in Activity.', noteTitle: 'Saved information', status: 'Complete', title: 'The work session is closed' },
  inspecting: { noteCopy: 'The worker is inspecting the site; every out-of-scope change still requires confirmation.', noteTitle: 'Safe scope', status: 'Inspecting', title: 'Inspecting the work area' },
  intake_started: { noteCopy: 'Kael keeps what you sent intact and starts organizing it for this work session.', noteTitle: 'Recorded', status: 'Received', title: 'Your request has been received' },
  kael_collecting: { noteCopy: 'Kael is organizing the description, area, and evidence into a clear request.', noteTitle: 'Organizing information', status: 'Collecting', title: 'Kael is clarifying the request' },
  kael_estimating: { noteCopy: 'Kael is checking scope, risk, and missing information before proposing an approach.', noteTitle: 'What Kael is checking', status: 'Analyzing', title: 'Analyzing the situation and approach' },
  kael_explaining: { noteCopy: 'The scope and estimate are ready for your review before any decision.', noteTitle: 'Proposed approach', status: 'Approach ready', title: 'The service approach is ready' },
  matching: { noteCopy: 'Kael is comparing skills, service area, and real availability.', noteTitle: 'What Kael is matching', status: 'Connecting', title: 'Finding a suitable worker' },
  paid: { noteCopy: 'Payment has been confirmed by the system, so you can review this work.', noteTitle: 'After payment', status: 'Paid', title: 'Payment has been confirmed' },
  payment_pending: { noteCopy: 'The system is waiting for a real payment status before review becomes available.', noteTitle: 'Payment status', status: 'Payment pending', title: 'Payment is awaiting confirmation' },
  repairing: { noteCopy: 'Kael reports only important changes to scope, progress, or safety.', noteTitle: 'Change tracking', status: 'In progress', title: 'Work has started' },
  scope_change_pending: { noteCopy: 'The changed work is paused until a valid decision is recorded.', noteTitle: 'Reason for change', status: 'Decision needed', title: 'A scope change has been proposed' },
  ticket_review: { noteCopy: 'Confirm only when the scope and estimate are clear and match your request.', noteTitle: 'Your decision', status: 'Confirmation needed', title: 'The proposal is waiting for your decision' },
  worker_candidate_review: { noteCopy: 'Review the safe profile and your saved checklist before deciding.', noteTitle: 'Before choosing', status: 'Confirmation needed', title: 'The worker profile is ready' },
  worker_matched: { noteCopy: 'The agreed scope and required information are now on the work board.', noteTitle: 'Information handed over', status: 'Worker matched', title: 'The worker has been confirmed' },
  worker_on_way: { noteCopy: 'Arrival time appears only when the system receives a real work update.', noteTitle: 'Arrival update', status: 'On the way', title: 'The worker is on the way' },
})

export function buildCaseWorkResponseModel({
  deal,
  language,
  paymentRailProvider = null,
  phase,
  subject,
  workerName,
}: BuildCaseWorkResponseModelInput): CaseWorkResponseModel {
  const copy = language === 'vi' ? VI_COPY[phase] : EN_COPY[phase]
  const dynamic = dynamicPhaseCopy({ copy, deal, language, paymentRailProvider, phase, subject, workerName })
  const legacyPaymentRecord = deal?.payment?.provider === 'staging_simulator'
  const paymentActionUnavailable = legacyPaymentRecord && (phase === 'payment_pending' || phase === 'paid')
  return {
    actionKind: paymentActionUnavailable
      ? 'none'
      : phase === 'arrived' && deal?.broadcast?.addressAccess?.worker_checked_in === true &&
          deal.broadcast.addressAccess.exact_unit_released === false
        ? 'apartment_access'
        : ACTION_BY_PHASE[phase] ?? 'none',
    noteCopy: dynamic.noteCopy,
    noteTitle: dynamic.noteTitle,
    phase,
    status: dynamic.status,
    title: dynamic.title,
  }
}

export function buildCompletedCaseWorkResponseModels({
  deal,
  language,
  phase,
}: BuildCaseWorkResponseModelInput): CaseWorkResponseModel[] {
  const currentIndex = CASE_WORK_HISTORY_PHASES.indexOf(phase)
  if (currentIndex <= 0) return []

  const historyCopy = language === 'vi'
    ? {
        noteCopy: 'Mốc này đã được hệ thống ghi nhận. Các thao tác sau chỉ mở theo đúng trạng thái công việc.',
        noteTitle: 'Mốc đã hoàn tất',
        status: 'Đã hoàn tất',
        titles: VI_COMPLETED_PHASE_TITLES,
      }
    : {
        noteCopy: 'This milestone was recorded by the system. Later actions unlock only from the matching job status.',
        noteTitle: 'Completed milestone',
        status: 'Completed',
        titles: EN_COMPLETED_PHASE_TITLES,
      }

  const completedModels: CaseWorkResponseModel[] = []
  for (let index = 0; index < currentIndex; index += 1) {
    const completedPhase = CASE_WORK_HISTORY_PHASES[index]
    if (completedPhase === 'scope_change_pending' && !deal?.scopeChange) continue

    completedModels.push({
      actionKind: 'none',
      noteCopy: historyCopy.noteCopy,
      noteTitle: historyCopy.noteTitle,
      phase: completedPhase,
      status: historyCopy.status,
      title: historyCopy.titles[completedPhase],
    })
  }

  return completedModels
}

function dynamicPhaseCopy({
  copy,
  deal,
  language,
  paymentRailProvider,
  phase,
  subject,
  workerName,
}: {
  copy: PhaseCopy
  deal?: LocalDeal | null
  language: AppLanguage
  paymentRailProvider: PaymentRailProvider
  phase: WorkflowPhase
  subject?: string | null
  workerName?: string | null
}): PhaseCopy {
  if (phase === 'intake_started') {
    const requestTitle = compactText(subject ?? deal?.draft.description)
    return requestTitle ? { ...copy, title: requestTitle } : copy
  }

  if (phase === 'matching' && deal?.draft.serviceType) {
    const service = customerV21ServiceCopy[language][deal.draft.serviceType].label
    if (deal.broadcast?.status === 'expired') {
      return language === 'vi'
        ? {
            noteCopy: 'Lượt chờ trước đã kết thúc mà chưa có thợ nhận. Bạn có thể gửi lại cho nhóm thợ phù hợp.',
            noteTitle: 'Chưa có thợ phản hồi',
            status: 'Có thể tìm lại',
            title: `Chưa ghép được thợ ${service.toLocaleLowerCase('vi-VN')}`,
          }
        : {
            noteCopy: 'The previous wait ended without a worker accepting. You can send the request to eligible workers again.',
            noteTitle: 'No worker responded',
            status: 'Retry available',
            title: `No ${service.toLocaleLowerCase('en-US')} worker matched yet`,
          }
    }
    return {
      ...copy,
      title: language === 'vi' ? `Đang tìm thợ ${service.toLocaleLowerCase('vi-VN')}` : `Finding a ${service.toLocaleLowerCase('en-US')} worker`,
    }
  }

  if (phase === 'ticket_review' && deal?.estimate?.priceRangeLabel) {
    const estimate = deal.estimate
    const advisory = compactText(estimate.advisory)
    return {
      ...copy,
      noteCopy: language === 'vi'
        ? [estimate.priceRangeLabel, advisory].filter(Boolean).join(', ')
        : [estimate.priceRangeLabel, advisory].filter(Boolean).join(', '),
    }
  }

  if (phase === 'worker_candidate_review' && (workerName?.trim() || deal?.workerProfile?.fullName.trim())) {
    const name = workerName?.trim() || deal?.workerProfile?.fullName.trim() || ''
    return {
      ...copy,
      noteCopy: language === 'vi'
        ? `${name} đã nhận lời. Xem hồ sơ an toàn và danh sách kiểm tra đã lưu trước khi xác nhận.`
        : `${name} accepted the request. Review the safe profile and your saved checklist before confirming.`,
    }
  }

  if (phase === 'worker_matched' && deal?.workerProfile?.fullName.trim()) {
    const name = deal.workerProfile.fullName.trim()
    return { ...copy, title: language === 'vi' ? `${name} đã được xác nhận` : `${name} has been confirmed` }
  }

  if (phase === 'worker_on_way' && deal?.broadcast?.secondsRemaining) {
    const eta = formatDurationShort(deal.broadcast.secondsRemaining, language)
    return {
      ...copy,
      noteCopy: language === 'vi'
        ? `Cập nhật gần nhất từ hệ thống cho biết thợ có thể đến trong khoảng ${eta}.`
        : `The latest system update places the worker about ${eta} away.`,
    }
  }

  if (phase === 'arrived' && deal?.broadcast?.addressAccess) {
    const access = deal.broadcast.addressAccess
    if (access.exact_unit_released) {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Bạn đã cho phép thợ lên đúng căn hộ. Thợ có thể bắt đầu kiểm tra hiện trạng.',
            noteTitle: 'Quyền vào căn hộ',
          }
        : {
            ...copy,
            noteCopy: 'You released the exact unit. The worker can now begin the on-site inspection.',
            noteTitle: 'Apartment access',
          }
    }
    if (access.worker_checked_in) {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Thợ đã xác nhận có mặt tại sảnh bằng ảnh. Chỉ cho thợ lên sau khi bạn xác nhận đúng người.',
            noteTitle: 'Cần bạn xác nhận',
          }
        : {
            ...copy,
            noteCopy: 'The worker checked in at the lobby. Release the unit only after confirming their identity.',
            noteTitle: 'Your confirmation is needed',
          }
    }
    if (access.check_in_required) {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Thợ cần xác nhận có mặt bằng ảnh tại sảnh trước khi kiểm tra vị trí xử lý. Thanh toán chưa mở ở bước này.',
            noteTitle: 'Bước tiếp theo',
          }
        : {
            ...copy,
            noteCopy: 'The worker must complete the required lobby-photo check-in before inspecting the work area. Payment is not available at this step.',
            noteTitle: 'Next step',
          }
    }
  }

  if (phase === 'scope_change_pending') {
    const reason = compactText(deal?.scopeChange?.reason ?? deal?.scopeChange?.requestedDescription)
    return reason ? { ...copy, noteCopy: reason } : copy
  }

  if (phase === 'customer_confirmed_completion' && !deal?.payment) {
    if (paymentRailProvider === 'sepay_vietqr') {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Thanh toán VietQR đã sẵn sàng. Sau khi bạn chuyển khoản, hệ thống chỉ mở bước tiếp theo khi SePay xác thực giao dịch.',
            noteTitle: 'Thanh toán an toàn',
          }
        : {
            ...copy,
            noteCopy: 'VietQR payment is ready. The next step opens only after SePay verifies the transfer.',
            noteTitle: 'Secure payment',
          }
    }
    return language === 'vi'
      ? {
          ...copy,
          noteCopy: 'Phương thức thanh toán chưa khả dụng cho công việc này.',
          noteTitle: 'Trạng thái thanh toán',
        }
      : {
          ...copy,
          noteCopy: 'No payment method is available for this work yet.',
          noteTitle: 'Payment status',
        }
  }

  if (phase === 'completed_by_worker') {
    const photoCount = deal?.completionPhotoUrls?.length ?? 0
    const note = compactText(deal?.completionNotes)
    if (photoCount > 0 || note) {
      const evidence = language === 'vi'
        ? [photoCount > 0 ? `${photoCount} ảnh hoàn tất` : null, note].filter(Boolean).join(', ')
        : [photoCount > 0 ? `${photoCount} completion photo${photoCount === 1 ? '' : 's'}` : null, note].filter(Boolean).join(', ')
      return { ...copy, noteCopy: evidence }
    }
  }

  if ((phase === 'payment_pending' || phase === 'paid') && deal?.payment) {
    if (deal.payment.provider === 'staging_simulator') {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Phương thức thanh toán của công việc này chưa sẵn sàng để sử dụng. Kael chỉ mở bước tiếp theo sau khi hệ thống xác thực giao dịch qua phương thức thanh toán chính thức.',
            noteTitle: 'Trạng thái thanh toán',
            status: 'Cần thiết lập',
            title: 'Thanh toán chưa sẵn sàng',
          }
        : {
            ...copy,
            noteCopy: 'This payment method is not ready for use. Kael opens the next step only after the system verifies a transaction through the official payment method.',
            noteTitle: 'Payment status',
            status: 'Setup required',
            title: 'Payment is not ready',
          }
    }
    if (phase === 'payment_pending' && deal.payment.status === 'amount_mismatch') {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Số tiền chuyển khoản chưa khớp với yêu cầu. Không chuyển thêm tiền; hệ thống cần đối chiếu giao dịch trước khi có bước tiếp theo.',
            noteTitle: 'Cần đối chiếu thanh toán',
            status: 'Cần đối chiếu',
            title: 'Thanh toán cần được kiểm tra',
          }
        : {
            ...copy,
            noteCopy: 'The transfer amount does not match the request. Do not send additional money; the system must reconcile the transaction before the next step.',
            noteTitle: 'Payment reconciliation',
            status: 'Reconciliation required',
            title: 'Payment needs review',
          }
    }
    if (phase === 'payment_pending' && deal.payment.status === 'received') {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Hệ thống đã nhận giao dịch và đang hoàn tất xác minh. Không cần chuyển thêm tiền.',
            noteTitle: 'Đang xác minh thanh toán',
            status: 'Đang xác minh',
          }
        : {
            ...copy,
            noteCopy: 'The system received the transaction and is completing verification. Do not send additional money.',
            noteTitle: 'Verifying payment',
            status: 'Verifying',
          }
    }
    if (phase === 'payment_pending' && (deal.payment.status === 'expired' || deal.payment.status === 'failed')) {
      return language === 'vi'
        ? {
            ...copy,
            noteCopy: 'Thanh toán hiện chưa thể tiếp tục. Hệ thống chỉ mở bước tiếp theo sau khi nhận được trạng thái giao dịch hợp lệ.',
            noteTitle: 'Trạng thái thanh toán',
            status: 'Cần kiểm tra',
            title: 'Thanh toán chưa thể tiếp tục',
          }
        : {
            ...copy,
            noteCopy: 'Payment cannot continue yet. The system opens the next step only after receiving a valid transaction status.',
            noteTitle: 'Payment status',
            status: 'Needs review',
            title: 'Payment cannot continue',
          }
    }
    const amount = deal.payment.grossAmount ?? deal.payment.amountReceived
    if (typeof amount === 'number') {
      const amountLabel = formatVnd(amount, language)
      return {
        ...copy,
        noteCopy: phase === 'paid'
          ? (language === 'vi'
              ? `Hệ thống đã xác nhận khoản ${amountLabel}, bước đánh giá hiện có thể mở.`
              : `The system confirmed ${amountLabel}, so review can now become available.`)
          : (language === 'vi'
              ? `Hệ thống đang xác minh khoản ${amountLabel} trên phương thức đã tạo cho công việc này.`
              : `The system is verifying ${amountLabel} through the payment method created for this work.`),
      }
    }
  }

  return copy
}

function compactText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length <= 140 ? normalized : `${normalized.slice(0, 137).trimEnd()}…`
}

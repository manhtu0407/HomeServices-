import {
  HCMC_DISTRICTS,
  PROBLEM_CHIPS,
  type DistrictSlug,
  type ServiceType,
} from './constants'

export const LOCAL_WORKFLOW_PRICE_DISCLAIMER =
  'Đây là ước tính cần backend xác nhận. Giá thực tế sẽ được thợ xác nhận trước khi bắt đầu.'

export const LOCAL_DEAL_STATUSES = Object.freeze([
  'draft',
  'analyzing',
  'awaiting_customer_confirm',
  'broadcasting',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'completed_by_worker',
  'confirmed_by_customer',
  'cancelled',
] as const)

export type LocalDealStatus = (typeof LOCAL_DEAL_STATUSES)[number]
export type LocalDealSource = 'home' | 'kael' | 'booking'
export type LocalWorkerBroadcastStatus = 'sent' | 'accepted' | 'declined' | 'expired'
export type LocalWorkerGate = 'backend_pending' | 'local_deal_audit'
export type LocalScheduleMode = 'now_only'
export type LocalCustomerSearchState = 'idle' | 'searching' | 'no_worker' | 'matched' | 'active' | 'completed'

export type LocalDealDraft = {
  serviceType: ServiceType | null
  problemChips: string[]
  description: string
  mediaCount: number
  addressLabel: string
  districtLabel: string
  timeChoice: 'now'
  source: LocalDealSource
  needsServiceChoice: boolean
  inferredProblemLabel: string | null
  unsupportedServiceLabel: string | null
}

export type LocalDealEstimate = {
  problemLabel: string
  complexity: 'unknown'
  priceRangeLabel: 'Cần backend ước tính'
  confidenceLabel: 'Cần backend'
  advisory: string
  disclaimer: typeof LOCAL_WORKFLOW_PRICE_DISCLAIMER
  hasVndPrice: false
}

export type LocalWorkerBroadcast = {
  status: LocalWorkerBroadcastStatus
  serviceType: ServiceType
  problemSummary: string
  generalArea: string
  prebrief: string[]
  fullAddressVisible: boolean
  fullAddressLabel: string | null
  secondsRemaining: number | null
}

export type LocalDeal = {
  id: string
  status: LocalDealStatus
  draft: LocalDealDraft
  estimate: LocalDealEstimate | null
  broadcast: LocalWorkerBroadcast | null
}

export type LocalWorkflowState = {
  deal: LocalDeal | null
  workerGate: LocalWorkerGate
  lastError: string | null
}

export type LocalDealDraftPatch = Partial<
  Pick<LocalDealDraft, 'addressLabel' | 'description' | 'districtLabel' | 'mediaCount' | 'problemChips' | 'serviceType'>
>

export type LocalWorkflowAction =
  | { type: 'start_home_service'; serviceType: ServiceType }
  | { type: 'submit_kael_draft'; text: string }
  | { type: 'update_booking_draft'; patch: LocalDealDraftPatch }
  | { type: 'submit_booking_draft' }
  | { type: 'finish_local_analysis' }
  | { type: 'confirm_customer_search' }
  | { type: 'tick_broadcast' }
  | { type: 'retry_customer_search' }
  | { type: 'reopen_booking_draft' }
  | { type: 'worker_accept_broadcast' }
  | { type: 'worker_decline_broadcast' }
  | { type: 'worker_start_travel' }
  | { type: 'worker_mark_arrived' }
  | { type: 'worker_start_inspection' }
  | { type: 'worker_start_repair' }
  | { type: 'worker_complete_job' }
  | { type: 'customer_confirm_completion' }
  | { type: 'cancel_deal' }
  | { type: 'reset_workflow' }

export type LocalWorkflowSelectors = {
  currentStatus: LocalDealStatus | null
  scheduleMode: LocalScheduleMode
  customerSearchState: LocalCustomerSearchState
  hasLocalBroadcast: boolean
  canConfirmCustomerSearch: boolean
  canWorkerAccept: boolean
  canWorkerAdvance: boolean
  canWorkerSeeFullAddress: boolean
  canCustomerCancelDeal: boolean
  canCustomerConfirmCompletion: boolean
  paymentLocked: true
  reviewLocked: true
  draftValidationMessage: string | null
}

const LOCAL_DEAL_ID = 'local-session-deal'
const GENERIC_AREA = 'Khu vực TP.HCM'
const NEXT_WORKER_STATUS: Partial<Record<LocalDealStatus, LocalDealStatus>> = {
  worker_matched: 'worker_on_way',
  worker_on_way: 'arrived',
  arrived: 'inspecting',
  inspecting: 'repairing',
  repairing: 'completed_by_worker',
}

const emptyDraft = (source: LocalDealSource, serviceType: ServiceType | null = null): LocalDealDraft => ({
  serviceType,
  problemChips: [],
  description: '',
  mediaCount: 0,
  addressLabel: '',
  districtLabel: '',
  timeChoice: 'now',
  source,
  needsServiceChoice: serviceType === null,
  inferredProblemLabel: null,
  unsupportedServiceLabel: null,
})

export function createInitialLocalWorkflowState(): LocalWorkflowState {
  return {
    deal: null,
    workerGate: 'backend_pending',
    lastError: null,
  }
}

export function inferLocalDealDraftFromKael(text: string): LocalDealDraft {
  const trimmed = text.trim()
  const normalized = normalizeSearchText(trimmed)
  const unsupportedServiceLabel = detectUnsupportedServiceLabel(normalized)
  if (unsupportedServiceLabel) {
    return {
      ...emptyDraft('kael'),
      description: trimmed,
      districtLabel: extractDistrictLabel(trimmed),
      needsServiceChoice: true,
      unsupportedServiceLabel,
    }
  }
  const electricalScore = scoreKeywords(normalized, [
    'dien',
    'o cam',
    'o dien',
    'cong tac',
    'cau dao',
    'aptomat',
    'den',
    'chap',
    'mat dien',
    'may nuoc nong',
  ])
  const plumbingScore = scoreKeywords(normalized, [
    'nuoc',
    'ro',
    'ri',
    'bon',
    'toilet',
    'voi',
    'ong',
    'ap nuoc',
    'lavabo',
  ]) + (hasStandalonePlumbingClog(normalized) ? 1 : 0)
  const electricalStrictScore = scoreKeywords(normalized, ['dien', 'o cam', 'o dien', 'cong tac', 'cau dao', 'aptomat', 'den', 'chap', 'mat dien'])
  const plumbingStrictScore = scoreKeywords(normalized, ['nuoc', 'ro', 'ri', 'bon', 'toilet', 'voi', 'ong', 'ap nuoc', 'lavabo'])
  const mentionsBothSupportedServices = electricalStrictScore > 0 && plumbingStrictScore > 0
  const serviceType =
    mentionsBothSupportedServices
      ? null
      : electricalScore > plumbingScore && electricalScore > 0
        ? 'electrical'
        : plumbingScore > electricalScore && plumbingScore > 0
          ? 'plumbing'
          : null
  const problemChips = serviceType ? inferProblemChips(normalized, serviceType) : []

  return {
    ...emptyDraft('kael', serviceType),
    description: trimmed,
    problemChips,
    districtLabel: extractDistrictLabel(trimmed),
    needsServiceChoice: serviceType === null,
    inferredProblemLabel: problemChips[0] ?? null,
    unsupportedServiceLabel: null,
  }
}

export function localWorkflowReducer(
  state: LocalWorkflowState,
  action: LocalWorkflowAction,
): LocalWorkflowState {
  switch (action.type) {
    case 'reset_workflow':
      return createInitialLocalWorkflowState()
    case 'start_home_service': {
      if (state.deal && !canReplaceLocalDeal(state.deal.status)) {
        return withError(state, 'Đang có yêu cầu đang chạy, không thể tạo yêu cầu mới')
      }
      return {
        deal: createDeal({
          ...emptyDraft('home', action.serviceType),
          needsServiceChoice: false,
        }),
        workerGate: 'backend_pending',
        lastError: null,
      }
    }
    case 'submit_kael_draft': {
      if (action.text.trim().length < 4) {
        return withError(state, 'Mô tả Kael cần rõ hơn trước khi tạo phiếu')
      }
      if (state.deal && !canReplaceLocalDeal(state.deal.status)) {
        return withError(state, 'Đang có yêu cầu đang chạy, không thể tạo yêu cầu mới từ Kael')
      }
      const draft = inferLocalDealDraftFromKael(action.text)
      return {
        deal: createDeal(draft),
        workerGate: 'backend_pending',
        lastError: null,
      }
    }
    case 'update_booking_draft': {
      if (state.deal && !canEditBookingDraft(state.deal.status)) {
        return withError(state, 'Không thể sửa phiếu khi workflow đang chạy')
      }
      const currentDeal = state.deal?.status === 'draft' ? state.deal : createDeal(emptyDraft('booking'))
      const patch = action.patch
      const nextAddress = patch.addressLabel ?? currentDeal.draft.addressLabel
      const nextService = patch.serviceType === undefined ? currentDeal.draft.serviceType : patch.serviceType
      const nextDraft: LocalDealDraft = {
        ...currentDeal.draft,
        ...patch,
        addressLabel: nextAddress,
        districtLabel: patch.districtLabel ?? extractDistrictLabel(nextAddress),
        problemChips: patch.problemChips ?? currentDeal.draft.problemChips,
        serviceType: nextService,
        timeChoice: 'now',
        source: currentDeal.draft.source === 'kael' ? 'kael' : 'booking',
        needsServiceChoice: nextService === null,
        unsupportedServiceLabel: nextService === null ? currentDeal.draft.unsupportedServiceLabel : null,
      }
      return {
        ...state,
        deal: {
          ...currentDeal,
          status: 'draft',
          draft: nextDraft,
          estimate: null,
          broadcast: null,
        },
        lastError: null,
      }
    }
    case 'submit_booking_draft': {
      if (!state.deal) return withError(state, 'Không có phiếu để phân tích')
      const validationMessage = validateLocalDealDraft(state.deal.draft)
      if (validationMessage) return withError(state, validationMessage)
      return setStatus(state, 'draft', 'analyzing')
    }
    case 'finish_local_analysis': {
      if (!state.deal) return withError(state, 'Không có phiếu để ước tính')
      if (state.deal.status !== 'analyzing') return invalidTransition(state, state.deal.status, 'awaiting_customer_confirm')
      return {
        ...state,
        deal: {
          ...state.deal,
          status: 'awaiting_customer_confirm',
          estimate: createLocalEstimate(state.deal.draft),
        },
        lastError: null,
      }
    }
    case 'confirm_customer_search': {
      if (!state.deal) return withError(state, 'Không có phiếu để tìm thợ')
      if (state.deal.status !== 'awaiting_customer_confirm') return invalidTransition(state, state.deal.status, 'broadcasting')
      const validationMessage = validateLocalDealDraft(state.deal.draft)
      if (validationMessage) return withError(state, validationMessage)
      if (!state.deal.draft.serviceType) return withError(state, 'Chọn dịch vụ trước khi tìm thợ')
      if (!state.deal.estimate) return withError(state, 'Cần hoàn tất ước tính local trước khi tìm thợ')
      return {
        deal: {
          ...state.deal,
          status: 'broadcasting',
          broadcast: createBroadcast(state.deal.draft),
        },
        workerGate: 'local_deal_audit',
        lastError: null,
      }
    }
    case 'worker_accept_broadcast': {
      if (!state.deal) return withError(state, 'Không có broadcast để nhận')
      if (state.workerGate !== 'local_deal_audit') return withError(state, 'Worker chưa được mở local audit cho broadcast này')
      if (state.deal.status !== 'broadcasting') return invalidTransition(state, state.deal.status, 'worker_matched')
      if (state.deal.broadcast?.status !== 'sent') return withError(state, 'Broadcast không còn ở trạng thái có thể nhận')
      return {
        ...state,
        deal: {
          ...state.deal,
          status: 'worker_matched',
          broadcast: {
            ...state.deal.broadcast,
            status: 'accepted',
            fullAddressVisible: true,
            fullAddressLabel: state.deal.draft.addressLabel,
          },
        },
        lastError: null,
      }
    }
    case 'retry_customer_search': {
      if (!state.deal) return withError(state, 'Không có broadcast để thử lại')
      if (state.deal.status !== 'broadcasting') return invalidTransition(state, state.deal.status, 'broadcasting')
      if (state.deal.broadcast?.status !== 'declined' && state.deal.broadcast?.status !== 'expired') return withError(state, 'Chỉ thử lại sau khi không có worker nhận')
      return {
        ...state,
        deal: {
          ...state.deal,
          broadcast: {
            ...state.deal.broadcast,
            status: 'sent',
            fullAddressVisible: false,
            fullAddressLabel: null,
            secondsRemaining: 60,
          },
        },
        workerGate: 'local_deal_audit',
        lastError: null,
      }
    }
    case 'reopen_booking_draft': {
      if (!state.deal) return state
      if (state.deal.status !== 'broadcasting' || (state.deal.broadcast?.status !== 'declined' && state.deal.broadcast?.status !== 'expired')) {
        return withError(state, 'Chỉ chỉnh yêu cầu sau khi không có worker nhận')
      }
      return {
        ...state,
        deal: {
          ...state.deal,
          status: 'draft',
          estimate: null,
          broadcast: null,
        },
        workerGate: 'backend_pending',
        lastError: null,
      }
    }
    case 'worker_decline_broadcast': {
      if (!state.deal) return withError(state, 'Không có broadcast để từ chối')
      if (state.workerGate !== 'local_deal_audit') return withError(state, 'Worker chưa được mở local audit cho broadcast này')
      if (state.deal.status !== 'broadcasting') return invalidTransition(state, state.deal.status, 'broadcasting')
      if (state.deal.broadcast?.status !== 'sent') return withError(state, 'Broadcast không còn ở trạng thái có thể từ chối')
      return {
        ...state,
        deal: {
          ...state.deal,
          broadcast: {
            ...state.deal.broadcast,
            status: 'declined',
          },
        },
        workerGate: 'backend_pending',
        lastError: null,
      }
    }
    case 'tick_broadcast': {
      if (!state.deal || state.deal.status !== 'broadcasting' || state.deal.broadcast?.status !== 'sent') return state
      const currentSeconds = state.deal.broadcast.secondsRemaining ?? 0
      const nextSeconds = Math.max(0, currentSeconds - 1)
      if (nextSeconds <= 0) {
        return {
          ...state,
          deal: {
            ...state.deal,
            broadcast: {
              ...state.deal.broadcast,
              status: 'expired',
              secondsRemaining: 0,
              fullAddressVisible: false,
              fullAddressLabel: null,
            },
          },
          workerGate: 'backend_pending',
          lastError: null,
        }
      }
      return {
        ...state,
        deal: {
          ...state.deal,
          broadcast: {
            ...state.deal.broadcast,
            secondsRemaining: nextSeconds,
          },
        },
        lastError: null,
      }
    }
    case 'worker_start_travel':
      return transitionWorkerStatus(state, 'worker_matched', 'worker_on_way')
    case 'worker_mark_arrived':
      return transitionWorkerStatus(state, 'worker_on_way', 'arrived')
    case 'worker_start_inspection':
      return transitionWorkerStatus(state, 'arrived', 'inspecting')
    case 'worker_start_repair':
      return transitionWorkerStatus(state, 'inspecting', 'repairing')
    case 'worker_complete_job':
      return transitionWorkerStatus(state, 'repairing', 'completed_by_worker')
    case 'customer_confirm_completion': {
      if (!state.deal) return withError(state, 'Không có phiếu để xác nhận hoàn tất')
      if (state.deal.status !== 'completed_by_worker') return invalidTransition(state, state.deal.status, 'confirmed_by_customer')
      if (!canConfirmCustomerCompletion(state.deal)) {
        return withError(state, 'Chỉ xác nhận sau khi worker đã nhận broadcast và báo hoàn tất')
      }
      return setStatus(state, 'completed_by_worker', 'confirmed_by_customer')
    }
    case 'cancel_deal': {
      if (!state.deal) return state
      if (!canCancelLocalDeal(state.deal.status)) {
        return withError(state, 'Không thể hủy workflow ở trạng thái hiện tại')
      }
      return {
        ...state,
        deal: {
          ...state.deal,
          status: 'cancelled',
          broadcast: state.deal.broadcast
            ? {
                ...state.deal.broadcast,
                status: 'expired',
                fullAddressVisible: false,
                fullAddressLabel: null,
              }
            : null,
        },
        workerGate: 'backend_pending',
        lastError: null,
      }
    }
    default:
      return state
  }
}

export function selectLocalWorkflow(state: LocalWorkflowState): LocalWorkflowSelectors {
  const deal = state.deal
  const status = deal?.status ?? null
  const broadcast = deal?.broadcast ?? null
  const customerSearchState: LocalCustomerSearchState =
    !deal
      ? 'idle'
      : status === 'broadcasting' && (broadcast?.status === 'declined' || broadcast?.status === 'expired')
        ? 'no_worker'
        : status === 'broadcasting'
          ? 'searching'
          : status === 'worker_matched'
            ? 'matched'
            : status === 'completed_by_worker' || status === 'confirmed_by_customer'
              ? 'completed'
              : status && ['worker_on_way', 'arrived', 'inspecting', 'repairing'].includes(status)
                ? 'active'
                : 'idle'

  return {
    currentStatus: status,
    scheduleMode: 'now_only',
    customerSearchState,
    hasLocalBroadcast: Boolean(broadcast),
    canConfirmCustomerSearch: Boolean(deal && status === 'awaiting_customer_confirm' && deal.estimate && validateLocalDealDraft(deal.draft) === null),
    canWorkerAccept: state.workerGate === 'local_deal_audit' && status === 'broadcasting' && broadcast?.status === 'sent',
    canWorkerAdvance:
      state.workerGate === 'local_deal_audit' &&
      broadcast?.status === 'accepted' &&
      Boolean(status && NEXT_WORKER_STATUS[status]),
    canWorkerSeeFullAddress: Boolean(broadcast?.status === 'accepted' && broadcast.fullAddressVisible && broadcast.fullAddressLabel),
    canCustomerCancelDeal: Boolean(deal && canCancelLocalDeal(deal.status)),
    canCustomerConfirmCompletion: Boolean(deal && canConfirmCustomerCompletion(deal)),
    paymentLocked: true,
    reviewLocked: true,
    draftValidationMessage: deal ? validateLocalDealDraft(deal.draft) : null,
  }
}

export function validateLocalDealDraft(draft: LocalDealDraft): string | null {
  if (!draft.serviceType) return 'Chọn dịch vụ điện hoặc nước'
  if (draft.problemChips.length === 0) return 'Chọn ít nhất một vấn đề cần xử lý'
  if (draft.description.trim().length < 12) return 'Mô tả cần đủ rõ để Kael tóm tắt'
  if (draft.addressLabel.trim().length < 4) return 'Nhập khu vực hoặc địa chỉ tổng quát'
  return null
}

function canReplaceLocalDeal(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'confirmed_by_customer'].includes(status)
}

function canEditBookingDraft(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'confirmed_by_customer'].includes(status)
}

function canCancelLocalDeal(status: LocalDealStatus): boolean {
  return ['draft', 'analyzing', 'awaiting_customer_confirm', 'broadcasting'].includes(status)
}

function canConfirmCustomerCompletion(deal: LocalDeal): boolean {
  return deal.status === 'completed_by_worker' && deal.broadcast?.status === 'accepted'
}

export function serviceLabel(serviceType: ServiceType | null): string {
  if (serviceType === 'electrical') return 'Sửa điện'
  if (serviceType === 'plumbing') return 'Sửa nước'
  return 'Chưa chọn'
}

export function statusLabel(status: LocalDealStatus | null): string {
  if (!status) return 'Chưa có phiếu'
  const labels: Record<LocalDealStatus, string> = {
    draft: 'Nháp',
    analyzing: 'Kael đang phân tích',
    awaiting_customer_confirm: 'Chờ khách xác nhận',
    broadcasting: 'Đang gửi thợ',
    worker_matched: 'Thợ đã nhận',
    worker_on_way: 'Thợ đang đến',
    arrived: 'Thợ đã đến',
    inspecting: 'Đang kiểm tra',
    repairing: 'Đang sửa',
    completed_by_worker: 'Thợ báo hoàn tất',
    confirmed_by_customer: 'Khách xác nhận xong',
    cancelled: 'Đã hủy',
  }
  return labels[status]
}

export function extractDistrictLabel(input: string): string {
  const normalized = normalizeSearchText(input)
  if (!normalized) return ''

  for (const [slug, label] of Object.entries(HCMC_DISTRICTS) as Array<[DistrictSlug, string]>) {
    if (slug === 'hcmc_all') continue
    if (normalized.includes(normalizeSearchText(label))) return label
  }

  const numberedDistrict = normalized.match(/\b(?:quan|q)\s*\.?\s*(1[0-2]|\d)\b/)
  if (numberedDistrict) return `Quận ${numberedDistrict[1]}`

  return GENERIC_AREA
}

function createDeal(draft: LocalDealDraft): LocalDeal {
  return {
    id: LOCAL_DEAL_ID,
    status: 'draft',
    draft,
    estimate: null,
    broadcast: null,
  }
}

function createLocalEstimate(draft: LocalDealDraft): LocalDealEstimate {
  return {
    problemLabel: draft.problemChips[0] ?? draft.inferredProblemLabel ?? 'Cần backend phân tích chi tiết',
    complexity: 'unknown',
    priceRangeLabel: 'Cần backend ước tính',
    confidenceLabel: 'Cần backend',
    advisory: 'Giữ mô tả, ảnh/video và khu vực rõ ràng để hệ thống backend ước tính chính xác ở giai đoạn sau.',
    disclaimer: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
    hasVndPrice: false,
  }
}

function createBroadcast(draft: LocalDealDraft): LocalWorkerBroadcast {
  const problemSummary = draft.problemChips[0] ?? draft.description.trim()
  const generalArea = draft.districtLabel || extractDistrictLabel(draft.addressLabel) || GENERIC_AREA

  return {
    status: 'sent',
    serviceType: draft.serviceType as ServiceType,
    problemSummary,
    generalArea,
    prebrief: [
      `${serviceLabel(draft.serviceType)} · ${problemSummary}`,
      `Khu vực: ${generalArea}. Địa chỉ chi tiết vẫn ẩn trước khi nhận.`,
      draft.mediaCount > 0 ? `Có ${draft.mediaCount} ảnh/video local để khách bổ sung sau.` : 'Chưa có media local.',
    ],
    fullAddressVisible: false,
    fullAddressLabel: null,
    secondsRemaining: 60,
  }
}

function inferProblemChips(normalized: string, serviceType: ServiceType): string[] {
  if (serviceType === 'plumbing') {
    if (hasAny(normalized, ['ro', 'ri', 'leak'])) return [PROBLEM_CHIPS.plumbing[0]]
    if (hasAny(normalized, ['tac', 'nghet', 'cong', 'bon'])) return [PROBLEM_CHIPS.plumbing[1]]
    if (hasAny(normalized, ['voi'])) return [PROBLEM_CHIPS.plumbing[2]]
    if (hasAny(normalized, ['toilet', 'xa'])) return [PROBLEM_CHIPS.plumbing[3]]
    if (hasAny(normalized, ['ap nuoc', 'yeu'])) return [PROBLEM_CHIPS.plumbing[4]]
    return []
  }

  if (hasAny(normalized, ['mat dien mot phong'])) return [PROBLEM_CHIPS.electrical[0]]
  if (hasAny(normalized, ['mat dien toan can', 'mat dien ca can'])) return [PROBLEM_CHIPS.electrical[1]]
  if (hasAny(normalized, ['o cam', 'o dien', 'cong tac'])) return [PROBLEM_CHIPS.electrical[2]]
  if (hasAny(normalized, ['cau dao', 'aptomat', 'trip'])) return [PROBLEM_CHIPS.electrical[3]]
  if (hasAny(normalized, ['den', 'chap chon'])) return [PROBLEM_CHIPS.electrical[4]]
  return []
}

function detectUnsupportedServiceLabel(normalized: string): string | null {
  if (hasAny(normalized, ['dieu hoa', 'may lanh', 'tu lanh', 'may giat', 'internet', 'sua khoa', 'khoa cua', 'o khoa', 'son nha'])) {
    return 'Dịch vụ này đang khóa. Kael hiện chỉ hỗ trợ sửa điện và sửa nước.'
  }

  const hasSupportedRepairIntent = hasAny(normalized, [
    'dien',
    'o cam',
    'cong tac',
    'cau dao',
    'aptomat',
    'den',
    'chap',
    'nuoc',
    'ro',
    'ri',
    'tac',
    'bon',
    'toilet',
    'voi',
    'ong',
    'ap nuoc',
    'lavabo',
    'van',
  ])

  if (!hasSupportedRepairIntent && hasAny(normalized, ['ve sinh', 'don dep', 'thiet bi', 'son', 'khoa'])) {
    return 'Dịch vụ này đang khóa. Kael hiện chỉ hỗ trợ sửa điện và sửa nước.'
  }
  return null
}

function hasStandalonePlumbingClog(normalized: string): boolean {
  if (!matchesKeyword(normalized, 'tac')) return false
  return !normalized.includes('cong tac')
}

function setStatus(
  state: LocalWorkflowState,
  from: LocalDealStatus,
  to: LocalDealStatus,
): LocalWorkflowState {
  if (!state.deal) return withError(state, 'Không có phiếu để chuyển trạng thái')
  if (state.deal.status !== from) return invalidTransition(state, state.deal.status, to)
  return {
    ...state,
    deal: {
      ...state.deal,
      status: to,
    },
    lastError: null,
  }
}

function transitionWorkerStatus(
  state: LocalWorkflowState,
  from: LocalDealStatus,
  to: LocalDealStatus,
): LocalWorkflowState {
  if (state.workerGate !== 'local_deal_audit') return withError(state, 'Worker chưa được mở local audit cho job này')
  if (!state.deal) return withError(state, 'Không có phiếu để chuyển trạng thái')
  if (state.deal.status !== from) return invalidTransition(state, state.deal.status, to)
  if (state.deal?.broadcast?.status !== 'accepted') return withError(state, 'Worker chỉ có thể cập nhật sau khi broadcast ở trạng thái accepted')
  const nextState = setStatus(state, from, to)
  if (!nextState.deal || nextState.lastError) return nextState
  return {
    ...nextState,
    workerGate: to === 'completed_by_worker' ? 'backend_pending' : 'local_deal_audit',
  }
}

function invalidTransition(
  state: LocalWorkflowState,
  from: LocalDealStatus,
  to: LocalDealStatus,
): LocalWorkflowState {
  return withError(state, `Không thể chuyển từ ${from} sang ${to}`)
}

function withError(state: LocalWorkflowState, lastError: string): LocalWorkflowState {
  return {
    ...state,
    lastError,
  }
}

function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

function scoreKeywords(input: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => score + (matchesKeyword(input, keyword) ? 1 : 0), 0)
}

function hasAny(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => matchesKeyword(input, keyword))
}

function matchesKeyword(input: string, keyword: string): boolean {
  if (keyword.includes(' ')) return input.includes(keyword)
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(input)
}

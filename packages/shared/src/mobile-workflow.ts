import {
  HCMC_DISTRICTS,
  PROBLEM_CHIPS,
  type DistrictSlug,
  type JobStatus,
  type ScopeChangeStatus,
  type ServiceType,
} from './constants'

export const LOCAL_WORKFLOW_PRICE_DISCLAIMER =
  'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'

// Local workflow keeps only statuses that create visible customer/worker UI
// states. Backend-only settlement markers are folded by toLocalDealStatus():
// estimate_ready folds into the legacy awaiting_customer_confirm status for
// old rows, but UI copy treats that state as Kael orchestration rather than a
// customer gate. payment_pending/paid -> confirmed_by_customer keeps mobile
// honest while payment rails remain outside the visible mobile workflow.
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
  'scope_change_pending',
  'completed_by_worker',
  'confirmed_by_customer',
  'reviewed',
  'cancelled',
] as const)

export type LocalDealStatus = (typeof LOCAL_DEAL_STATUSES)[number]
const LOCAL_DEAL_STATUS_SET = new Set<string>(LOCAL_DEAL_STATUSES)
export type LocalDealSource = 'home' | 'kael' | 'booking'
export type LocalWorkerBroadcastStatus = 'pending' | 'sent' | 'accepted' | 'declined' | 'expired' | 'reassigned' | 'cancelled'
export type LocalWorkerGate = 'backend_pending' | 'local_deal_audit' | 'remote_backend'
export type LocalScheduleMode = 'now_only'
export type LocalCustomerSearchState = 'idle' | 'searching' | 'no_worker' | 'matched' | 'active' | 'completed'
export type LocalAddressAccess = {
  release_stage: 'area_only' | 'building_released' | 'unit_released'
  exact_unit_released: boolean
  worker_checked_in?: boolean
  check_in_required: boolean
  identity_check_required: boolean
  customer_handoff_required: boolean
  evidence_mode: 'none' | 'geofence' | 'manual_photo'
  access_profile: {
    entry_method?: string
    parking_note?: string
    guard_note?: string
    building_note?: string
    customer_handoff_note?: string
  }
}

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
  complexity: 'small' | 'medium' | 'large' | 'unknown'
  priceRangeLabel: string
  confidenceLabel: string
  advisory: string
  disclaimer: string
  hasVndPrice: boolean
  fallbackUsed?: boolean
}

export type LocalWorkerBroadcast = {
  status: LocalWorkerBroadcastStatus
  broadcastId?: string
  jobId?: string
  serviceType: ServiceType
  problemSummary: string
  generalArea: string
  prebrief: string[]
  fullAddressVisible: boolean
  fullAddressLabel: string | null
  addressAccess?: LocalAddressAccess | null
  secondsRemaining: number | null
  estimatedPriceLabel?: string
  estimatedEarningLabel?: string
}

export type LocalDeal = {
  id: string
  status: LocalDealStatus
  backendStatus?: JobStatus
  draft: LocalDealDraft
  estimate: LocalDealEstimate | null
  broadcast: LocalWorkerBroadcast | null
  scopeChange: LocalScopeChange | null
  finalPrice?: number | null
  completionPhotoUrls?: string[]
  completionNotes?: string | null
}

export type LocalScopeChange = {
  id: string
  status: ScopeChangeStatus
  requestedDescription: string | null
  reason: string | null
  priceMin: number | null
  priceMax: number | null
  kaelReview: Record<string, unknown> | null
  kaelProgress: LocalKaelProgress | null
  evidencePhotoUrls: string[]
  createdAt: string | null
}

export type LocalKaelProgress = {
  current_stage: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  failure_reason?: string | null
  updated_at: string
}

export type LocalWorkflowState = {
  deal: LocalDeal | null
  workerGate: LocalWorkerGate
  lastError: string | null
  lastRemoteSyncAt: string | null
}

export type LocalRemoteJobSnapshot = {
  id: string
  status: LocalDealStatus
  backendStatus?: JobStatus
  serviceType: ServiceType
  description: string
  problemChips: string[]
  addressLabel: string
  districtLabel: string
  mediaCount?: number
  estimate?: LocalDealEstimate | null
  broadcast?: LocalWorkerBroadcast | null
  scopeChange?: LocalScopeChange | null
  finalPrice?: number | null
  completionPhotoUrls?: string[]
  completionNotes?: string | null
}

export type LocalRemoteBroadcastSnapshot = {
  broadcastId: string
  jobId: string
  status: LocalWorkerBroadcastStatus
  serviceType: ServiceType
  problemSummary: string
  generalArea: string
  prebrief?: string[]
  secondsRemaining: number | null
  estimatedPriceLabel?: string
  estimatedEarningLabel?: string
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
  | { type: 'customer_submit_review' }
  | { type: 'cancel_deal' }
  | { type: 'hydrate_remote_job'; job: LocalRemoteJobSnapshot; workerGate?: LocalWorkerGate }
  | { type: 'hydrate_remote_broadcast'; broadcast: LocalRemoteBroadcastSnapshot }
  | { type: 'mark_remote_broadcast_expired' }
  | { type: 'set_workflow_error'; error: string | null }
  | { type: 'reset_workflow' }

export type LocalWorkflowSelectors = {
  currentStatus: LocalDealStatus | null
  currentBackendStatus: JobStatus | null
  scheduleMode: LocalScheduleMode
  customerSearchState: LocalCustomerSearchState
  hasLocalBroadcast: boolean
  canConfirmCustomerSearch: boolean
  canWorkerAccept: boolean
  canWorkerAdvance: boolean
  canWorkerSeeFullAddress: boolean
  canCustomerCancelDeal: boolean
  canCustomerConfirmCompletion: boolean
  canCustomerSubmitReview: boolean
  paymentLocked: true
  reviewLocked: boolean
  draftValidationMessage: string | null
}

export const LOCAL_DEAL_ID = 'local-session-deal'
export function hasLocalDealCompletionEvidence(deal: Pick<LocalDeal, 'completionNotes' | 'completionPhotoUrls'> | null | undefined): boolean {
  return Boolean((deal?.completionNotes?.trim().length ?? 0) >= 5 && (deal?.completionPhotoUrls?.length ?? 0) > 0)
}

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

export function toLocalDealStatus(status: JobStatus): LocalDealStatus {
  switch (status) {
    case 'estimate_ready':
      return 'awaiting_customer_confirm'
    case 'payment_pending':
    case 'paid':
      return 'confirmed_by_customer'
    case 'draft':
    case 'analyzing':
    case 'awaiting_customer_confirm':
    case 'broadcasting':
    case 'worker_matched':
    case 'worker_on_way':
    case 'arrived':
    case 'inspecting':
    case 'repairing':
    case 'scope_change_pending':
    case 'completed_by_worker':
    case 'confirmed_by_customer':
    case 'reviewed':
    case 'cancelled':
      return status
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function isLocalDealStatus(status: JobStatus): status is LocalDealStatus {
  return LOCAL_DEAL_STATUS_SET.has(status)
}

export function createInitialLocalWorkflowState(): LocalWorkflowState {
  return {
    deal: null,
    workerGate: 'backend_pending',
    lastError: null,
    lastRemoteSyncAt: null,
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
  const cleaningScore = scoreKeywords(normalized, [
    've sinh',
    'don dep',
    'don nha',
    'lau don',
    'tong ve sinh',
    've sinh bep',
    've sinh phong tam',
    'cua kinh',
    'sau sua chua',
    'rac',
    'ban',
    'bui',
  ])
  const electricalStrictScore = scoreKeywords(normalized, ['dien', 'o cam', 'o dien', 'cong tac', 'cau dao', 'aptomat', 'den', 'chap', 'mat dien'])
  const plumbingStrictScore = scoreKeywords(normalized, ['nuoc', 'ro', 'ri', 'bon', 'toilet', 'voi', 'ong', 'ap nuoc', 'lavabo'])
  const cleaningStrictScore = scoreKeywords(normalized, ['ve sinh', 'don dep', 'don nha', 'lau don', 'tong ve sinh', 'cua kinh'])
  const supportedServiceMentions = [electricalStrictScore, plumbingStrictScore, cleaningStrictScore].filter((score) => score > 0).length
  const serviceType: ServiceType | null =
    supportedServiceMentions > 1
      ? null
      : electricalScore > plumbingScore && electricalScore > cleaningScore && electricalScore > 0
        ? 'electrical'
        : plumbingScore > electricalScore && plumbingScore > cleaningScore && plumbingScore > 0
          ? 'plumbing'
          : cleaningScore > electricalScore && cleaningScore > plumbingScore && cleaningScore > 0
            ? 'cleaning'
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
    case 'set_workflow_error':
      return {
        ...state,
        lastError: action.error,
      }
    case 'hydrate_remote_job':
      return {
        deal: createDealFromRemoteJob(action.job),
        workerGate: action.workerGate ?? 'remote_backend',
        lastError: null,
        lastRemoteSyncAt: new Date().toISOString(),
      }
    case 'hydrate_remote_broadcast':
      return {
        deal: createDealFromRemoteBroadcast(action.broadcast),
        workerGate: 'remote_backend',
        lastError: null,
        lastRemoteSyncAt: new Date().toISOString(),
      }
    case 'mark_remote_broadcast_expired': {
      if (!state.deal || state.deal.status !== 'broadcasting' || state.deal.broadcast?.status !== 'sent') return state
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
        lastRemoteSyncAt: null,
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
        lastRemoteSyncAt: null,
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
          scopeChange: null,
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
      if (state.deal.status !== 'analyzing') return invalidTransition(state, state.deal.status, 'broadcasting')
      return {
        ...state,
        deal: {
          ...state.deal,
          status: 'broadcasting',
          estimate: createLocalEstimate(state.deal.draft),
          broadcast: createBroadcast(state.deal.draft),
        },
        workerGate: 'local_deal_audit',
        lastError: null,
      }
    }
    case 'confirm_customer_search': {
      if (state.deal && state.deal.status === 'broadcasting' && state.deal.broadcast && state.deal.estimate) return { ...state, lastError: null }
      if (state.deal && state.deal.status !== 'awaiting_customer_confirm' && state.deal.status !== 'broadcasting') return invalidTransition(state, state.deal.status, 'broadcasting')
      if (!state.deal) return withError(state, 'Không có phiếu để tìm thợ')
      const validationMessage = validateLocalDealDraft(state.deal.draft)
      if (validationMessage) return withError(state, validationMessage)
      if (!state.deal.draft.serviceType) return withError(state, 'Chọn dịch vụ trước khi tìm thợ')
      if (!state.deal.estimate) return withError(state, 'Cần hoàn tất ước tính trước khi tìm thợ')
      return {
        deal: {
          ...state.deal,
          status: 'broadcasting',
          broadcast: createBroadcast(state.deal.draft),
        },
        workerGate: 'local_deal_audit',
        lastError: null,
        lastRemoteSyncAt: null,
      }
    }
    case 'worker_accept_broadcast': {
      if (!state.deal) return withError(state, 'Không có yêu cầu để nhận')
      if (state.workerGate !== 'local_deal_audit' && state.workerGate !== 'remote_backend') {
        return withError(state, 'Thợ chưa được mở workflow cho yêu cầu này')
      }
      if (state.deal.status !== 'broadcasting') return invalidTransition(state, state.deal.status, 'worker_matched')
      if (state.deal.broadcast?.status !== 'sent') return withError(state, 'Yêu cầu không còn ở trạng thái có thể nhận')
      const canRevealFullAddress = hasSpecificWorkerRouteAddress(state.deal.draft.addressLabel, state.deal.draft.districtLabel)
      return {
        ...state,
        deal: {
          ...state.deal,
          status: 'worker_matched',
          broadcast: {
            ...state.deal.broadcast,
            status: 'accepted',
            fullAddressVisible: canRevealFullAddress,
            fullAddressLabel: canRevealFullAddress ? state.deal.draft.addressLabel : null,
          },
        },
        lastError: null,
      }
    }
    case 'retry_customer_search': {
      if (!state.deal) return withError(state, 'Không có yêu cầu để thử lại')
      if (state.deal.status !== 'broadcasting') return invalidTransition(state, state.deal.status, 'broadcasting')
      if (state.deal.broadcast?.status !== 'declined' && state.deal.broadcast?.status !== 'expired') return withError(state, 'Chỉ thử lại sau khi chưa có thợ nhận')
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
      const canReopenBroadcast =
        state.deal.status === 'broadcasting' &&
        (state.deal.broadcast?.status === 'declined' || state.deal.broadcast?.status === 'expired')
      const canReopenCancelledNoWorker =
        state.deal.status === 'cancelled' &&
        (state.deal.broadcast?.status === 'cancelled' || state.deal.broadcast?.status === 'expired')
      if (!canReopenBroadcast && !canReopenCancelledNoWorker) {
        return withError(state, 'Chỉ chỉnh yêu cầu sau khi chưa có thợ nhận')
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
      if (!state.deal) return withError(state, 'Không có yêu cầu để từ chối')
      if (state.workerGate !== 'local_deal_audit' && state.workerGate !== 'remote_backend') {
        return withError(state, 'Thợ chưa được mở workflow cho yêu cầu này')
      }
      if (state.deal.status !== 'broadcasting') return invalidTransition(state, state.deal.status, 'broadcasting')
      if (state.deal.broadcast?.status !== 'sent') return withError(state, 'Yêu cầu không còn ở trạng thái có thể từ chối')
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
        return withError(state, 'Chỉ xác nhận sau khi thợ đã nhận yêu cầu và báo hoàn tất')
      }
      return setStatus(state, 'completed_by_worker', 'confirmed_by_customer')
    }
    case 'customer_submit_review': {
      if (!state.deal) return withError(state, 'Không có phiếu để đánh giá')
      if (state.deal.status !== 'confirmed_by_customer') return invalidTransition(state, state.deal.status, 'reviewed')
      if (!canSubmitCustomerReview(state.deal)) return withError(state, 'Đánh giá chỉ mở sau khi hệ thống xác nhận đúng bước')
      return setCustomerReviewSubmitted(state)
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
            : status === 'completed_by_worker' || status === 'confirmed_by_customer' || status === 'reviewed'
              ? 'completed'
              : status && ['worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending'].includes(status)
                ? 'active'
                : 'idle'
  const hasWorkerActionGate = state.workerGate === 'local_deal_audit' || state.workerGate === 'remote_backend'
  const backendStatus = deal?.backendStatus ?? status
  const canCustomerSubmitReview = Boolean(deal && canSubmitCustomerReview(deal))

  return {
    currentStatus: status,
    currentBackendStatus: backendStatus,
    scheduleMode: 'now_only',
    customerSearchState,
    hasLocalBroadcast: Boolean(broadcast),
    canConfirmCustomerSearch: false,
    canWorkerAccept: hasWorkerActionGate && status === 'broadcasting' && broadcast?.status === 'sent',
    canWorkerAdvance:
      hasWorkerActionGate &&
      broadcast?.status === 'accepted' &&
      Boolean(status && NEXT_WORKER_STATUS[status]),
    canWorkerSeeFullAddress: Boolean(broadcast?.status === 'accepted' && broadcast.fullAddressVisible && broadcast.fullAddressLabel),
    canCustomerCancelDeal: Boolean(deal && canCancelLocalDeal(deal.status)),
    // Kael Autonomy v2: customer completion is input/evidence, not the
    // default final authority in the UI. The reducer action stays for legacy
    // recovery tests and backend parity, but selectors keep it off-screen.
    canCustomerConfirmCompletion: false,
    canCustomerSubmitReview,
    paymentLocked: true,
    reviewLocked: !canCustomerSubmitReview,
    draftValidationMessage: deal ? validateLocalDealDraft(deal.draft) : null,
  }
}

export function validateLocalDealDraft(draft: LocalDealDraft): string | null {
  if (!draft.serviceType) return 'Chọn dịch vụ điện, nước hoặc vệ sinh'
  if (draft.problemChips.length === 0) return 'Chọn ít nhất một vấn đề cần xử lý'
  if (draft.description.trim().length < 12) return 'Mô tả cần đủ rõ để Kael tóm tắt'
  if (draft.addressLabel.trim().length < 4) return 'Nhập khu vực hoặc địa chỉ tổng quát'
  if (!extractKnownDistrictLabel(draft.addressLabel)) return 'Địa chỉ cần có quận TP.HCM rõ ràng'
  return null
}

function canReplaceLocalDeal(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'reviewed'].includes(status)
}

function canEditBookingDraft(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'reviewed'].includes(status)
}

function canCancelLocalDeal(status: LocalDealStatus): boolean {
  return [
    'draft',
    'analyzing',
    'awaiting_customer_confirm',
    'broadcasting',
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
  ].includes(status)
}

function canConfirmCustomerCompletion(deal: LocalDeal): boolean {
  return deal.status === 'completed_by_worker' && deal.broadcast?.status === 'accepted'
}

function canSubmitCustomerReview(deal: LocalDeal): boolean {
  const backendStatus = deal.backendStatus ?? deal.status
  return backendStatus === 'paid' ||
    backendStatus === 'confirmed_by_customer' ||
    (!deal.backendStatus && deal.status === 'confirmed_by_customer')
}

export function serviceLabel(serviceType: ServiceType | null): string {
  if (serviceType === 'electrical') return 'Sửa điện'
  if (serviceType === 'plumbing') return 'Sửa nước'
  if (serviceType === 'cleaning') return 'Vệ sinh'
  return 'Chưa chọn'
}

export function statusLabel(status: LocalDealStatus | null): string {
  if (!status) return 'Chưa có phiếu'
  const labels: Record<LocalDealStatus, string> = {
    draft: 'Nháp',
    analyzing: 'Kael đang phân tích',
    awaiting_customer_confirm: 'Kael đang điều phối',
    broadcasting: 'Đang gửi thợ',
    worker_matched: 'Thợ đã nhận',
    worker_on_way: 'Thợ đang đến',
    arrived: 'Thợ đã đến',
    inspecting: 'Đang kiểm tra',
    repairing: 'Đang sửa',
    scope_change_pending: 'Kael đang xét đổi phạm vi',
    completed_by_worker: 'Thợ báo hoàn tất',
    confirmed_by_customer: 'Kael đã xác nhận hoàn tất',
    reviewed: 'Đã đánh giá',
    cancelled: 'Đã hủy',
  }
  return labels[status]
}

export function extractKnownDistrictLabel(input: string): string {
  const normalized = normalizeSearchText(input)
  if (!normalized) return ''

  for (const [slug, label] of Object.entries(HCMC_DISTRICTS) as Array<[DistrictSlug, string]>) {
    if (slug === 'hcmc_all') continue
    if (normalized.includes(normalizeSearchText(label))) return label
  }

  const numberedDistrict = normalized.match(/\b(?:quan|q|district|dist)\s*\.?\s*(1[0-2]|\d)\b/)
  if (numberedDistrict) return `Quận ${numberedDistrict[1]}`

  return ''
}

export function extractDistrictLabel(input: string): string {
  return extractKnownDistrictLabel(input) || GENERIC_AREA
}

export function hasSpecificWorkerRouteAddress(addressLabel: string | null | undefined, districtLabel = ''): boolean {
  const normalizedAddress = stripGenericAddressTerms(addressLabel ?? '')
  if (!normalizedAddress) return false

  const detectedDistrict = extractKnownDistrictLabel(addressLabel ?? '') || extractKnownDistrictLabel(districtLabel) || districtLabel
  let specificPart = normalizedAddress
  const districtCandidates = [
    detectedDistrict,
    districtLabel,
    ...Object.values(HCMC_DISTRICTS),
  ]

  for (const candidate of districtCandidates) {
    const normalizedCandidate = stripGenericAddressTerms(candidate)
    if (!normalizedCandidate) continue
    specificPart = specificPart.replace(new RegExp(`\\b${escapeRegExp(normalizedCandidate)}\\b`, 'g'), ' ')
  }

  specificPart = specificPart
    .replace(/\b(?:quan|q|district|dist)\s*\.?\s*(1[0-2]|\d)\b/g, ' ')
    .replace(/\b(?:phuong|p|ward)\s*\.?\s*\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return specificPart.replace(/\s+/g, '').length >= 3
}

function stripGenericAddressTerms(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\btp\s*hcm\b/g, ' ')
    .replace(/\btphcm\b/g, ' ')
    .replace(/\bthanh\s*pho\s*ho\s*chi\s*minh\b/g, ' ')
    .replace(/\bho\s*chi\s*minh\b/g, ' ')
    .replace(/\bhcmc\b/g, ' ')
    .replace(/\bviet\s*nam\b/g, ' ')
    .replace(/\bvn\b/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createDeal(draft: LocalDealDraft): LocalDeal {
  return {
    id: LOCAL_DEAL_ID,
    status: 'draft',
    draft,
    estimate: null,
    broadcast: null,
    scopeChange: null,
    finalPrice: null,
    completionPhotoUrls: [],
    completionNotes: null,
  }
}

function createDealFromRemoteJob(job: LocalRemoteJobSnapshot): LocalDeal {
  return {
    id: job.id,
    status: job.status,
    backendStatus: job.backendStatus,
    draft: {
      serviceType: job.serviceType,
      problemChips: job.problemChips,
      description: job.description,
      mediaCount: job.mediaCount ?? 0,
      addressLabel: job.addressLabel,
      districtLabel: job.districtLabel,
      timeChoice: 'now',
      source: 'booking',
      needsServiceChoice: false,
      inferredProblemLabel: job.problemChips[0] ?? null,
      unsupportedServiceLabel: null,
    },
    estimate: job.estimate ?? null,
    broadcast: job.broadcast ?? null,
    scopeChange: job.scopeChange ?? null,
    finalPrice: job.finalPrice ?? null,
    completionPhotoUrls: job.completionPhotoUrls ?? [],
    completionNotes: job.completionNotes ?? null,
  }
}

function createDealFromRemoteBroadcast(broadcast: LocalRemoteBroadcastSnapshot): LocalDeal {
  const remotePrebrief: string[] = []
  for (const line of broadcast.prebrief ?? []) {
    const trimmed = line.trim()
    if (trimmed) remotePrebrief.push(trimmed)
  }
  const draft: LocalDealDraft = {
    ...emptyDraft('booking', broadcast.serviceType),
    description: broadcast.problemSummary,
    districtLabel: broadcast.generalArea,
    problemChips: broadcast.problemSummary ? [broadcast.problemSummary] : [],
    needsServiceChoice: false,
  }

  return {
    id: broadcast.jobId,
    status: broadcast.status === 'accepted' ? 'worker_matched' : 'broadcasting',
    draft,
    estimate: null,
    broadcast: {
      status: broadcast.status,
      broadcastId: broadcast.broadcastId,
      jobId: broadcast.jobId,
      serviceType: broadcast.serviceType,
      problemSummary: broadcast.problemSummary,
      generalArea: broadcast.generalArea,
      prebrief: remotePrebrief.length > 0 ? remotePrebrief : [
        `${serviceLabel(broadcast.serviceType)} · ${broadcast.problemSummary}`,
        `Khu vực: ${broadcast.generalArea}. Địa chỉ chi tiết vẫn ẩn trước khi nhận.`,
      ],
      fullAddressVisible: false,
      fullAddressLabel: null,
      secondsRemaining: broadcast.secondsRemaining,
      estimatedPriceLabel: broadcast.estimatedPriceLabel,
      estimatedEarningLabel: broadcast.estimatedEarningLabel,
    },
    scopeChange: null,
    finalPrice: null,
    completionPhotoUrls: [],
    completionNotes: null,
  }
}

function createLocalEstimate(draft: LocalDealDraft): LocalDealEstimate {
  return {
    problemLabel: draft.problemChips[0] ?? draft.inferredProblemLabel ?? 'Kael sẽ phân tích chi tiết',
    complexity: 'unknown',
    priceRangeLabel: 'Chờ Kael ước tính',
    confidenceLabel: 'Đang chờ dữ liệu',
    advisory: 'Giữ mô tả, ảnh/video và khu vực rõ ràng để Kael ước tính chính xác hơn.',
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
      draft.mediaCount > 0 ? `Có ${draft.mediaCount} ảnh/video để khách bổ sung sau.` : 'Chưa có ảnh/video.',
    ],
    fullAddressVisible: false,
    fullAddressLabel: null,
    secondsRemaining: 60,
  }
}

function inferProblemChips(normalized: string, serviceType: ServiceType): string[] {
  if (serviceType === 'cleaning') {
    if (hasAny(normalized, ['bep'])) return [PROBLEM_CHIPS.cleaning[1]]
    if (hasAny(normalized, ['phong tam', 'toilet', 'nha tam'])) return [PROBLEM_CHIPS.cleaning[2]]
    if (hasAny(normalized, ['sau sua chua', 've sinh sau'])) return [PROBLEM_CHIPS.cleaning[4]]
    if (hasAny(normalized, ['tong ve sinh'])) return [PROBLEM_CHIPS.cleaning[3]]
    if (hasAny(normalized, ['cua kinh', 'kinh'])) return [PROBLEM_CHIPS.cleaning[5]]
    if (hasAny(normalized, ['don dep', 'don nha', 'lau don', 've sinh'])) return [PROBLEM_CHIPS.cleaning[0]]
    return []
  }

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
    return 'Dịch vụ này đang khóa. Kael hiện chỉ hỗ trợ sửa điện, sửa nước và vệ sinh.'
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
    've sinh',
    'don dep',
    'don nha',
    'lau don',
    'tong ve sinh',
    'cua kinh',
  ])

  if (!hasSupportedRepairIntent && hasAny(normalized, ['thiet bi', 'son', 'khoa'])) {
    return 'Dịch vụ này đang khóa. Kael hiện chỉ hỗ trợ sửa điện, sửa nước và vệ sinh.'
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

function setCustomerReviewSubmitted(state: LocalWorkflowState): LocalWorkflowState {
  const next = setStatus(state, 'confirmed_by_customer', 'reviewed')
  if (!next.deal || !state.deal?.backendStatus) return next
  return {
    ...next,
    deal: {
      ...next.deal,
      backendStatus: 'reviewed',
    },
  }
}

function transitionWorkerStatus(
  state: LocalWorkflowState,
  from: LocalDealStatus,
  to: LocalDealStatus,
): LocalWorkflowState {
  if (state.workerGate !== 'local_deal_audit' && state.workerGate !== 'remote_backend') {
    return withError(state, 'Thợ chưa được mở workflow cho yêu cầu này')
  }
  if (!state.deal) return withError(state, 'Không có phiếu để chuyển trạng thái')
  if (state.deal.status !== from) return invalidTransition(state, state.deal.status, to)
  if (state.deal?.broadcast?.status !== 'accepted') return withError(state, 'Thợ chỉ có thể cập nhật sau khi yêu cầu đã được nhận')
  const nextState = setStatus(state, from, to)
  if (!nextState.deal || nextState.lastError) return nextState
  return {
    ...nextState,
    workerGate: to === 'completed_by_worker' ? 'backend_pending' : state.workerGate,
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

import type { ServiceType } from '../constants'
import {
  extractDistrictLabel,
  GENERIC_AREA,
  hasSpecificWorkerRouteAddress,
} from './address'
import {
  emptyDraft,
  inferLocalDealDraftFromKael,
  validateLocalDealDraft,
} from './draft'
import { serviceLabel } from './labels'
import {
  LOCAL_DEAL_ID,
  LOCAL_WORKFLOW_PRICE_DISCLAIMER,
  type LocalDealStatus,
} from './status'
import type {
  LocalDeal,
  LocalDealDraft,
  LocalDealEstimate,
  LocalRemoteBroadcastSnapshot,
  LocalRemoteJobSnapshot,
  LocalWorkerBroadcast,
  LocalWorkflowAction,
  LocalWorkflowState,
} from './types'

export const NEXT_WORKER_STATUS: Partial<Record<LocalDealStatus, LocalDealStatus>> = {
  worker_matched: 'worker_on_way',
  worker_on_way: 'arrived',
  arrived: 'inspecting',
  inspecting: 'repairing',
  repairing: 'completed_by_worker',
}

export function hasLocalDealCompletionEvidence(deal: Pick<LocalDeal, 'completionNotes' | 'completionPhotoUrls'> | null | undefined): boolean {
  return Boolean((deal?.completionNotes?.trim().length ?? 0) >= 5 && (deal?.completionPhotoUrls?.length ?? 0) > 0)
}

export function createInitialLocalWorkflowState(): LocalWorkflowState {
  return {
    deal: null,
    workerGate: 'backend_pending',
    lastError: null,
    lastRemoteSyncAt: null,
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

export function canCancelLocalDeal(status: LocalDealStatus): boolean {
  return [
    'draft',
    'analyzing',
    'estimate_ready',
    'awaiting_customer_confirm',
    'broadcasting',
    'worker_candidate_pending',
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
  ].includes(status)
}

export function canSubmitCustomerReview(deal: LocalDeal): boolean {
  const backendStatus = deal.backendStatus ?? deal.status
  return backendStatus === 'paid' ||
    backendStatus === 'confirmed_by_customer' ||
    (!deal.backendStatus && deal.status === 'confirmed_by_customer')
}

function canReplaceLocalDeal(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'reviewed'].includes(status)
}

function canEditBookingDraft(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'reviewed'].includes(status)
}

function canConfirmCustomerCompletion(deal: LocalDeal): boolean {
  return deal.status === 'completed_by_worker' && deal.broadcast?.status === 'accepted'
}

function createDeal(draft: LocalDealDraft): LocalDeal {
  return {
    id: LOCAL_DEAL_ID,
    displayCode: null,
    status: 'draft',
    draft,
    estimate: null,
    broadcast: null,
    scopeChange: null,
    finalPrice: null,
    payment: null,
    fieldEvidencePhotoUrls: [],
    completionPhotoUrls: [],
    completionNotes: null,
    workerProfile: null,
    createdAt: null,
    matchedAt: null,
    completedAt: null,
    confirmedAt: null,
    paidAt: null,
    reviewedAt: null,
  }
}

function createDealFromRemoteJob(job: LocalRemoteJobSnapshot): LocalDeal {
  return {
    id: job.id,
    displayCode: job.displayCode ?? null,
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
    payment: job.payment ?? null,
    fieldEvidencePhotoUrls: job.fieldEvidencePhotoUrls ?? [],
    completionPhotoUrls: job.completionPhotoUrls ?? [],
    completionNotes: job.completionNotes ?? null,
    workerProfile: job.workerProfile ?? null,
    createdAt: job.createdAt ?? null,
    matchedAt: job.matchedAt ?? null,
    completedAt: job.completedAt ?? null,
    confirmedAt: job.confirmedAt ?? null,
    paidAt: job.paidAt ?? null,
    reviewedAt: job.reviewedAt ?? null,
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
    displayCode: null,
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

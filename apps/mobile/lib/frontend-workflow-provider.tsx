import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react'
import {
  HCMC_DISTRICTS,
  LOCAL_DEAL_ID,
  createInitialLocalWorkflowState,
  extractKnownDistrictLabel,
  localWorkflowReducer,
  selectLocalWorkflow,
  type CustomerScopeDecisionInput,
  type JobCreateInput,
  type JobStatus,
  type LocalDealDraft,
  type LocalDealEstimate,
  type LocalRemoteBroadcastSnapshot,
  type LocalRemoteJobSnapshot,
  type LocalScopeChange,
  type LocalWorkflowAction,
  type LocalWorkflowSelectors,
  type LocalWorkflowState,
  type ReviewInput,
  type ServiceType,
  type WorkerScopeChangeInput,
} from '@home-services/shared'
import { useAuth } from './auth-provider'
import { jobService, workerService } from './services'
import type { ApiResult } from './api'
import type {
  ConfirmSearchResponse,
  CreateJobResponse,
  JobDetailResponse,
  WorkerBroadcastsResponse,
  WorkerJobListResponse,
  WorkerProfileResponse,
} from './api-types'

type WorkerStatusUpdate = Extract<JobStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'>

type FrontendWorkflowActions = {
  createRemoteJobFromDraft: (draft?: LocalDealDraft) => Promise<boolean>
  confirmRemoteSearch: () => Promise<boolean>
  cancelRemoteJob: () => Promise<boolean>
  refreshCurrentJob: () => Promise<boolean>
  workerRefresh: () => Promise<boolean>
  workerAcceptBroadcast: () => Promise<boolean>
  workerDeclineBroadcast: () => Promise<boolean>
  workerUpdateStatus: (
    status: WorkerStatusUpdate,
    extras?: { completion_notes?: string; completion_photo_urls?: string[]; final_price?: number },
  ) => Promise<boolean>
  requestScopeChange: (input: WorkerScopeChangeInput) => Promise<boolean>
  decideScopeChange: (scopeChangeId: string, input: CustomerScopeDecisionInput) => Promise<boolean>
  customerConfirmCompletion: () => Promise<boolean>
  submitReview: (input: Omit<ReviewInput, 'job_id'>) => Promise<boolean>
  workerUpdateAvailability: (isAvailable: boolean) => Promise<boolean>
}

type FrontendWorkflowContextValue = {
  state: LocalWorkflowState
  selectors: LocalWorkflowSelectors
  workerProfile: WorkerProfileResponse | null
  dispatch: Dispatch<LocalWorkflowAction>
  actions: FrontendWorkflowActions
}

const FrontendWorkflowContext = createContext<FrontendWorkflowContextValue | null>(null)

export function FrontendWorkflowProvider({ children }: { children: ReactNode }) {
  const { role, session } = useAuth()
  const [state, dispatch] = useReducer(localWorkflowReducer, undefined, createInitialLocalWorkflowState)
  const selectors = useMemo(() => selectLocalWorkflow(state), [state])
  const sessionUserId = session?.user.id ?? null
  const previousSessionUserIdRef = useRef(sessionUserId)
  const stateRef = useRef(state)
  const [workerProfile, setWorkerProfile] = useState<WorkerProfileResponse | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const setRemoteError = useCallback((error: string) => {
    dispatch({ type: 'set_workflow_error', error })
    return false
  }, [])

  const hydrateJobResult = useCallback((result: ApiResult<JobDetailResponse>) => {
    if (!result.success) return setRemoteError(result.error)
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data) })
    return true
  }, [setRemoteError])

  const refreshCurrentJob = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    return hydrateJobResult(await jobService.getJob(jobId))
  }, [hydrateJobResult, setRemoteError])

  const createRemoteJobFromDraft = useCallback(async (draftOverride?: LocalDealDraft) => {
    const draft = draftOverride ?? stateRef.current.deal?.draft
    if (!draft?.serviceType) return setRemoteError('Chọn dịch vụ điện hoặc nước trước khi tạo yêu cầu')
    if (draft.problemChips.length === 0) return setRemoteError('Chọn ít nhất một vấn đề cần xử lý')
    if (draft.description.trim().length < 10) return setRemoteError('Mô tả cần rõ hơn trước khi gửi yêu cầu')
    const districtLabel = extractKnownDistrictLabel(draft.districtLabel) || extractKnownDistrictLabel(draft.addressLabel)
    if (!districtLabel) return setRemoteError('Địa chỉ cần có quận TP.HCM rõ ràng')

    const input: JobCreateInput = {
      service_type: draft.serviceType,
      description: draft.description.trim(),
      problem_chips: draft.problemChips,
      photo_urls: [],
      address_building: draft.addressLabel.trim() || undefined,
      address_district: districtLabel,
    }

    const created = await jobService.createJob(input)
    if (!created.success) return setRemoteError(created.error)
    dispatch({ type: 'hydrate_remote_job', job: createJobResponseToSnapshot(created.data, draft) })
    return true
  }, [setRemoteError])

  const confirmRemoteSearch = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tìm thợ')
    const confirmed = await jobService.confirmSearch(jobId)
    if (!confirmed.success) return setRemoteError(confirmed.error)

    const existing = stateRef.current.deal
    if (existing) {
      dispatch({
        type: 'hydrate_remote_job',
        job: confirmSearchToSnapshot(confirmed.data, existing),
      })
    }
    if (confirmed.data.broadcast_sent) {
      const refreshed = await jobService.getJob(jobId)
      if (refreshed.success) {
        dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data) })
      }
    }
    return true
  }, [setRemoteError])

  const cancelRemoteJob = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) {
      dispatch({ type: 'cancel_deal' })
      return true
    }
    const cancelled = await jobService.cancelJob(jobId)
    if (!cancelled.success) return setRemoteError(cancelled.error)
    const existing = stateRef.current.deal
    if (existing) {
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          status: cancelled.data.status as LocalRemoteJobSnapshot['status'],
          broadcast: existing.broadcast
            ? { ...existing.broadcast, status: 'cancelled', fullAddressVisible: false, fullAddressLabel: null }
            : null,
        },
      })
    }
    return true
  }, [setRemoteError])

  const workerRefresh = useCallback(async () => {
    if (role !== 'worker') return true

    const profile = await workerService.getProfile()
    if (!profile.success) return setRemoteError(profile.error)
    setWorkerProfile(profile.data)

    const broadcasts = await workerService.getBroadcasts()
    if (!broadcasts.success) return setRemoteError(broadcasts.error)
    const nextBroadcast = broadcasts.data.broadcasts[0]
    if (nextBroadcast) {
      dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
      return true
    }

    const jobs = await workerService.getJobs()
    if (!jobs.success) return setRemoteError(jobs.error)
    const currentJobId = getRemoteJobId(stateRef.current)
    const activeJob = jobs.data.jobs.find((job) => isWorkerOperationalJobStatus(job.status))
    if (activeJob) {
      dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(activeJob), workerGate: 'remote_backend' })
      return true
    }
    const currentJob = currentJobId ? jobs.data.jobs.find((job) => job.id === currentJobId) : undefined
    if (currentJob) {
      dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(currentJob), workerGate: 'remote_backend' })
      return true
    }

    if (hasStaleRemoteBroadcast(stateRef.current)) {
      dispatch({ type: 'mark_remote_broadcast_expired' })
    }
    return true
  }, [role, setRemoteError])

  const workerUpdateAvailability = useCallback(async (isAvailable: boolean) => {
    const updated = await workerService.updateAvailability({ is_available: isAvailable })
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerProfile((current) =>
      current
        ? { ...current, is_available: updated.data.is_available }
        : current,
    )
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerAcceptBroadcast = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để nhận')
    const accepted = await workerService.acceptBroadcast(jobId)
    if (!accepted.success) {
      if (isStaleBroadcastError(accepted.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(accepted.error)
    }
    setWorkerProfile((current) => current ? { ...current, is_available: false } : current)

    const existing = stateRef.current.deal
    if (existing?.broadcast) {
      const fullAddressLabel = formatFullAddress(accepted.data.full_address)
      dispatch({
        type: 'hydrate_remote_job',
        workerGate: 'remote_backend',
        job: {
          ...dealToSnapshot(existing),
          status: accepted.data.status as LocalRemoteJobSnapshot['status'],
          addressLabel: fullAddressLabel || existing.draft.addressLabel,
          broadcast: {
            ...existing.broadcast,
            status: 'accepted',
            fullAddressVisible: true,
            fullAddressLabel,
          },
        },
      })
    } else {
      await refreshCurrentJob()
    }
    return true
  }, [refreshCurrentJob, setRemoteError])

  const workerDeclineBroadcast = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để từ chối')
    const declined = await workerService.declineBroadcast(jobId)
    if (!declined.success) {
      if (isStaleBroadcastError(declined.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(declined.error)
    }
    dispatch({ type: 'worker_decline_broadcast' })
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerUpdateStatus = useCallback<FrontendWorkflowActions['workerUpdateStatus']>(async (status, extras) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để cập nhật')
    const updated = await workerService.updateJobStatus(jobId, status, extras)
    if (!updated.success) return setRemoteError(updated.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const requestScopeChange = useCallback(async (input: WorkerScopeChangeInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đổi phạm vi')
    const result = await workerService.requestScopeChange(jobId, input)
    if (!result.success) return setRemoteError(result.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const decideScopeChange = useCallback(async (scopeChangeId: string, input: CustomerScopeDecisionInput) => {
    const result = await jobService.decideScopeChange(scopeChangeId, input)
    if (!result.success) return setRemoteError(result.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const customerConfirmCompletion = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận hoàn tất')
    const confirmed = await jobService.confirmCompletion(jobId)
    if (!confirmed.success) return setRemoteError(confirmed.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const submitReview = useCallback(async (input: Omit<ReviewInput, 'job_id'>) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đánh giá')
    const reviewed = await jobService.submitReview(jobId, input)
    if (!reviewed.success) return setRemoteError(reviewed.error)
    dispatch({ type: 'customer_submit_review' })
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const actions = useMemo<FrontendWorkflowActions>(() => ({
    createRemoteJobFromDraft,
    confirmRemoteSearch,
    cancelRemoteJob,
    refreshCurrentJob,
    workerRefresh,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerUpdateStatus,
    requestScopeChange,
    decideScopeChange,
    customerConfirmCompletion,
    submitReview,
    workerUpdateAvailability,
  }), [
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    customerConfirmCompletion,
    decideScopeChange,
    refreshCurrentJob,
    requestScopeChange,
    submitReview,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerRefresh,
    workerUpdateAvailability,
    workerUpdateStatus,
  ])

  useEffect(() => {
    if (previousSessionUserIdRef.current === sessionUserId) return
    previousSessionUserIdRef.current = sessionUserId
    dispatch({ type: 'reset_workflow' })
    setWorkerProfile(null)
  }, [sessionUserId])

  useEffect(() => {
    if (!sessionUserId || role !== 'worker') return
    void workerRefresh()
    const interval = setInterval(() => void workerRefresh(), 10_000)
    return () => clearInterval(interval)
  }, [role, sessionUserId, workerRefresh])

  const broadcast = state.deal?.broadcast

  useEffect(() => {
    if (!sessionUserId || role !== 'customer') return
    if (!getRemoteJobId(state)) return

    const customerStatus = state.deal?.status
    const customerBroadcast = state.deal?.broadcast
    if (customerStatus === 'broadcasting' && customerBroadcast?.status === 'expired') return
    if (![
      'broadcasting',
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker',
    ].includes(customerStatus ?? '')) return

    const interval = setInterval(() => void refreshCurrentJob(), 10_000)
    return () => clearInterval(interval)
  }, [
    refreshCurrentJob,
    role,
    sessionUserId,
    state,
    state.deal?.broadcast,
    state.deal?.status,
  ])

  useEffect(() => {
    if (state.deal?.status !== 'broadcasting' || broadcast?.status !== 'sent') return
    if (broadcast.secondsRemaining === null) return

    const timer = setTimeout(() => dispatch({ type: 'tick_broadcast' }), 1000)
    return () => clearTimeout(timer)
  }, [state.deal?.status, broadcast?.status, broadcast?.secondsRemaining])

  return (
    <FrontendWorkflowContext.Provider value={{ state, selectors, workerProfile, dispatch, actions }}>
      {children}
    </FrontendWorkflowContext.Provider>
  )
}

export function useFrontendWorkflow() {
  const value = useContext(FrontendWorkflowContext)
  if (!value) {
    throw new Error('useFrontendWorkflow must be used inside FrontendWorkflowProvider')
  }
  return value
}

function getRemoteJobId(state: LocalWorkflowState) {
  const id = state.deal?.broadcast?.jobId ?? state.deal?.id ?? null
  if (!id || id === LOCAL_DEAL_ID) return null
  return id
}

const WORKER_OPERATIONAL_JOB_STATUSES = new Set<JobStatus>([
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
])

function isWorkerOperationalJobStatus(status: JobStatus) {
  return WORKER_OPERATIONAL_JOB_STATUSES.has(status)
}

function hasStaleRemoteBroadcast(state: LocalWorkflowState) {
  return state.workerGate === 'remote_backend' &&
    state.deal?.status === 'broadcasting' &&
    state.deal.broadcast?.status === 'sent'
}

function isStaleBroadcastError(code: string) {
  return ['EXPIRED', 'BROADCAST_NOT_ACTIVE', 'ALREADY_TAKEN', 'NOT_FOUND'].includes(code)
}

function createJobResponseToSnapshot(data: CreateJobResponse, draft: LocalDealDraft): LocalRemoteJobSnapshot {
  return {
    id: data.job_id,
    status: data.status as LocalRemoteJobSnapshot['status'],
    serviceType: data.estimate.service_type,
    description: draft.description,
    problemChips: draft.problemChips,
    addressLabel: draft.addressLabel,
    districtLabel: draft.districtLabel || draft.addressLabel,
    mediaCount: draft.mediaCount,
    estimate: estimateFromCreateResponse(data),
    broadcast: null,
    scopeChange: null,
    finalPrice: null,
  }
}

function confirmSearchToSnapshot(data: ConfirmSearchResponse, deal: NonNullable<LocalWorkflowState['deal']>): LocalRemoteJobSnapshot {
  const snapshot = dealToSnapshot(deal)
  const broadcastSent = data.broadcast_sent
  return {
    ...snapshot,
    status: data.status as LocalRemoteJobSnapshot['status'],
    broadcast: {
      status: broadcastSent ? 'sent' : 'expired',
      jobId: data.job_id,
      serviceType: deal.draft.serviceType as ServiceType,
      problemSummary: deal.estimate?.problemLabel ?? deal.draft.problemChips[0] ?? deal.draft.description,
      generalArea: deal.draft.districtLabel || 'Khu vực TP.HCM',
      prebrief: [
        `${deal.estimate?.problemLabel ?? deal.draft.problemChips[0] ?? 'Yêu cầu mới'}`,
        data.message,
      ],
      fullAddressVisible: false,
      fullAddressLabel: null,
      secondsRemaining: broadcastSent ? null : 0,
    },
  }
}

function jobDetailToSnapshot(data: JobDetailResponse): LocalRemoteJobSnapshot {
  const job = data.job
  const serviceType = job.service_type
  const districtLabel = districtLabelFromValue(job.address_district)
  const addressLabel = [job.address_building, job.address_floor, job.address_unit, districtLabel]
    .filter(Boolean)
    .join(', ')
  const estimate = job.kael_price_min && job.kael_price_max
    ? {
        problemLabel: job.kael_problem_identified ?? job.problem_chips[0] ?? 'Yêu cầu sửa chữa',
        complexity: job.kael_complexity ?? 'unknown',
        priceRangeLabel: formatPriceRange(job.kael_price_min, job.kael_price_max),
        confidenceLabel: 'Kael ước tính',
        advisory: job.kael_advisory ?? 'Giá thực tế do thợ xác nhận trước khi bắt đầu.',
        disclaimer: 'Đây là ước tính cần thợ xác nhận. Giá thực tế sẽ được thợ xác nhận trước khi bắt đầu.',
        hasVndPrice: true,
      } satisfies LocalDealEstimate
    : null
  const broadcast = broadcastFromJobStatus(
    job.status,
    serviceType,
    job.kael_problem_identified ?? job.problem_chips[0] ?? job.description,
    districtLabel,
    addressLabel,
    data.broadcast_state,
  )

  return {
    id: job.id,
    status: toLocalStatus(job.status),
    serviceType,
    description: job.description,
    problemChips: job.problem_chips,
    addressLabel,
    districtLabel,
    mediaCount: job.photo_urls.length,
    estimate,
    broadcast,
    scopeChange: scopeChangeFromJobDetail(data),
    finalPrice: job.final_price,
  }
}

function workerBroadcastToSnapshot(broadcast: WorkerBroadcastsResponse['broadcasts'][number]): LocalRemoteBroadcastSnapshot {
  return {
    broadcastId: broadcast.broadcast_id,
    jobId: broadcast.job_id,
    status: broadcast.status,
    serviceType: broadcast.service_type,
    problemSummary: broadcast.problem_summary ?? 'Yêu cầu sửa chữa',
    generalArea: districtLabelFromValue(broadcast.district),
    secondsRemaining: broadcast.seconds_remaining,
    estimatedPriceLabel: formatNullablePriceRange(broadcast.estimated_price_min, broadcast.estimated_price_max),
    estimatedEarningLabel: formatNullablePriceRange(broadcast.estimated_earning_min, broadcast.estimated_earning_max),
  }
}

function workerJobToSnapshot(job: WorkerJobListResponse['jobs'][number]): LocalRemoteJobSnapshot {
  const districtLabel = districtLabelFromValue(job.district)
  const addressLabel = [job.address_building, job.address_floor, job.address_unit, districtLabel]
    .filter(Boolean)
    .join(', ')
  return {
    id: job.id,
    status: toLocalStatus(job.status),
    serviceType: job.service_type,
    description: job.problem_summary ?? 'Yêu cầu sửa chữa',
    problemChips: job.problem_summary ? [job.problem_summary] : [],
    addressLabel: addressLabel || districtLabel,
    districtLabel,
    estimate: null,
    broadcast: broadcastFromJobStatus(job.status, job.service_type, job.problem_summary ?? 'Yêu cầu sửa chữa', districtLabel, addressLabel || districtLabel),
    scopeChange: null,
    finalPrice: job.final_price,
  }
}

function dealToSnapshot(deal: NonNullable<LocalWorkflowState['deal']>): LocalRemoteJobSnapshot {
  return {
    id: deal.id,
    status: deal.status,
    serviceType: deal.draft.serviceType as ServiceType,
    description: deal.draft.description,
    problemChips: deal.draft.problemChips,
    addressLabel: deal.draft.addressLabel,
    districtLabel: deal.draft.districtLabel,
    mediaCount: deal.draft.mediaCount,
    estimate: deal.estimate,
    broadcast: deal.broadcast,
    scopeChange: deal.scopeChange,
    finalPrice: deal.finalPrice ?? null,
  }
}

function scopeChangeFromJobDetail(data: JobDetailResponse): LocalScopeChange | null {
  const scope = data.current_scope_change
  if (!scope) return null
  return {
    id: scope.id,
    status: scope.status,
    requestedDescription: scope.requested_description,
    reason: scope.reason,
    priceMin: scope.price_min,
    priceMax: scope.price_max,
    createdAt: scope.created_at,
  }
}

function estimateFromCreateResponse(data: CreateJobResponse): LocalDealEstimate {
  return {
    problemLabel: data.estimate.problem_summary || data.estimate.problem_category,
    complexity: data.estimate.complexity,
    priceRangeLabel: formatPriceRange(data.estimate.price_min, data.estimate.price_max),
    confidenceLabel: `${Math.round(data.estimate.confidence * 100)}%`,
    advisory: data.estimate.advisory ?? 'Giá thực tế do thợ xác nhận trước khi bắt đầu.',
    disclaimer: data.estimate.disclaimer,
    hasVndPrice: true,
    fallbackUsed: data.fallback_used,
  }
}

function broadcastFromJobStatus(
  status: JobStatus,
  serviceType: ServiceType,
  problemSummary: string,
  districtLabel: string,
  addressLabel: string,
  broadcastState: JobDetailResponse['broadcast_state'] = null,
) {
  if (status === 'awaiting_customer_confirm' || status === 'cancelled' || status === 'reviewed') return null
  const accepted = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'paid', 'payment_pending'].includes(status)
  const expiredBroadcast = status === 'broadcasting' && broadcastState?.active_count === 0
  return {
    status: expiredBroadcast ? 'expired' as const : accepted ? 'accepted' as const : 'sent' as const,
    serviceType,
    problemSummary,
    generalArea: districtLabel || 'Khu vực TP.HCM',
    prebrief: [
      problemSummary,
      expiredBroadcast
        ? 'Chưa có thợ phản hồi trong lượt tìm hiện tại. Khách có thể thử lại hoặc chỉnh yêu cầu.'
        : accepted ? 'Yêu cầu đã được nhận. Địa chỉ chi tiết chỉ hiện trong phiên đã xác thực.' : 'Đang chờ thợ phản hồi.',
    ],
    fullAddressVisible: accepted,
    fullAddressLabel: accepted ? addressLabel : null,
    secondsRemaining: expiredBroadcast ? 0 : status === 'broadcasting' ? broadcastState?.seconds_remaining ?? null : null,
  }
}

function toLocalStatus(status: JobStatus): LocalRemoteJobSnapshot['status'] {
  if (status === 'estimate_ready') return 'awaiting_customer_confirm'
  if (status === 'payment_pending' || status === 'paid') return 'confirmed_by_customer'
  return status
}

function districtLabelFromValue(value: string | null | undefined) {
  if (!value) return 'Khu vực TP.HCM'
  return HCMC_DISTRICTS[value as keyof typeof HCMC_DISTRICTS] ?? value
}

function formatFullAddress(address: { building: string | null; unit: string | null; floor: string | null; district: string | null }) {
  return [address.building, address.floor, address.unit, districtLabelFromValue(address.district)].filter(Boolean).join(', ')
}

function formatNullablePriceRange(min: number | null, max: number | null) {
  if (min === null || max === null) return undefined
  return formatPriceRange(min, max)
}

function formatPriceRange(min: number, max: number) {
  return `${formatVnd(min)} - ${formatVnd(max)}`
}

function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN').format(value)}đ`
}

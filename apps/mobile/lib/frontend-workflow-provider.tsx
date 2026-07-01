import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { AppState } from 'react-native'
import {
  HCMC_DISTRICTS,
  LOCAL_DEAL_ID,
  buildLocalWorkerDisplayCode,
  createInitialLocalWorkflowState,
  extractKnownDistrictLabel,
  hasSpecificWorkerRouteAddress,
  localWorkflowReducer,
  selectLocalWorkflow,
  toLocalDealStatus,
  type CustomerCancellationRequestInput,
  type CustomerKaelMemoryPreferenceUpdateInput,
  type CustomerScopeDecisionInput,
  type JobCreateInput,
  type JobStatus,
  type LocalDealDraft,
  type LocalDealEstimate,
  type LocalDealPayment,
  type LocalRemoteBroadcastSnapshot,
  type LocalRemoteJobSnapshot,
  type LocalScopeChange,
  type LocalWorkflowAction,
  type LocalWorkflowSelectors,
  type LocalWorkflowState,
  type ReviewInput,
  type ServiceType,
  type WorkerRegisterInput,
  type WorkerServiceAreaUpdateInput,
  type WorkerScopeChangeInput,
} from '@nestscout/shared'
import { useAuth } from './auth-provider'
import { uploadJobMediaDrafts, type LocalMediaUploadDraft } from './media-upload'
import { customerProfileService, jobService, kaelMemoryService, notificationService, workerService } from './services'
import { subscribeToJobStatus, subscribeToWorkerBroadcasts } from './realtime'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from './client-request-id'
import type { ApiResult } from './api'
import type {
  ConfirmSearchResponse,
  CreateJobResponse,
  CustomerProfileInsightsResponse,
  EarningsResponse,
  AddressAccessView,
  JobDetailResponse,
  KaelMemorySelfViewResponse,
  NotificationListResponse,
  WorkerCancellationRequestInput,
  WorkerBroadcastsResponse,
  WorkerJobListResponse,
  WorkerPayoutMethodSaveInput,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
} from './api-types'
import { useAppLanguage, type AppLanguage } from './app-language'

type WorkerStatusUpdate = Extract<JobStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'>
type WorkerAccessCheckInInput = {
  mode: 'geofence' | 'manual_photo'
  lat?: number
  lng?: number
  accuracy_m?: number
  photo_urls?: string[]
  note?: string
  checked_in_at?: string
}

export type CustomerKaelMemoryPreferenceUpdateResult = {
  success: boolean
  code?: string
  error?: string
  status?: number
}

type WorkerPayoutMethodSaveResult = {
  success: false
  code?: string
  error: string
  status?: number
}

type FrontendWorkflowActions = {
  createRemoteJobFromDraft: (
    draft?: LocalDealDraft,
    mediaItems?: LocalMediaUploadDraft[],
  ) => Promise<{ jobId: string; mediaError?: string } | false | null>
  hydrateRemoteJobById: (jobId: string) => Promise<boolean>
  confirmRemoteSearch: () => Promise<boolean>
  cancelRemoteJob: () => Promise<boolean>
  refreshCurrentJob: () => Promise<boolean>
  workerRefresh: () => Promise<boolean>
  workerAcceptBroadcast: () => Promise<boolean>
  workerDeclineBroadcast: () => Promise<boolean>
  workerUpdateStatus: (
    status: WorkerStatusUpdate,
    extras?: { completion_notes?: string; completion_photo_urls?: string[]; access_check_in?: WorkerAccessCheckInInput },
  ) => Promise<boolean>
  requestScopeChange: (input: WorkerScopeChangeInput) => Promise<boolean>
  requestWorkerCancellation: (input: WorkerCancellationRequestInput) => Promise<boolean>
  workerSubmitRegistration: (input: WorkerRegisterInput) => Promise<boolean>
  decideScopeChange: (scopeChangeId: string, input: CustomerScopeDecisionInput) => Promise<boolean>
  customerConfirmCompletion: () => Promise<boolean>
  authorizeApartmentAccess: () => Promise<boolean>
  submitReview: (input: Omit<ReviewInput, 'job_id'>) => Promise<boolean>
  workerUpdateAvailability: (isAvailable: boolean) => Promise<boolean>
  workerUpdateServiceArea: (input: WorkerServiceAreaUpdateInput) => Promise<boolean>
  workerSavePayoutMethod: (input: WorkerPayoutMethodSaveInput) => Promise<boolean | WorkerPayoutMethodSaveResult>
  refreshNotifications: () => Promise<boolean>
  markNotificationRead: (notificationId: string) => Promise<boolean>
  refreshCustomerKaelMemory: () => Promise<boolean>
  updateCustomerKaelMemoryPreference: (input: CustomerKaelMemoryPreferenceUpdateInput) => Promise<boolean | CustomerKaelMemoryPreferenceUpdateResult>
  refreshCustomerProfileInsights: () => Promise<boolean>
}

type CustomerKaelMemoryStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

type FrontendWorkflowContextValue = {
  state: LocalWorkflowState
  selectors: LocalWorkflowSelectors
  customerKaelMemory: KaelMemorySelfViewResponse['memory'] | null
  customerKaelMemoryStatus: CustomerKaelMemoryStatus
  customerProfileInsights: CustomerProfileInsightsResponse | null
  workerEarnings: EarningsResponse | null
  workerJobs: WorkerJobListResponse['jobs']
  workerPerformanceInsights: WorkerPerformanceInsightsResponse | null
  workerProfile: WorkerProfileResponse | null
  notifications: NotificationListResponse['notifications']
  notificationUnreadCount: number
  dispatch: Dispatch<LocalWorkflowAction>
  actions: FrontendWorkflowActions
}

type WorkerRemoteState = {
  earnings: EarningsResponse | null
  jobs: WorkerJobListResponse['jobs']
  performanceInsights: WorkerPerformanceInsightsResponse | null
  profile: WorkerProfileResponse | null
  sessionUserId: string | null
}

type CustomerKaelMemoryState = {
  memory: KaelMemorySelfViewResponse['memory'] | null
  sessionUserId: string | null
  status: CustomerKaelMemoryStatus
}

type CustomerProfileInsightsState = {
  insights: CustomerProfileInsightsResponse | null
  sessionUserId: string | null
}

const initialWorkerRemoteState: WorkerRemoteState = {
  earnings: null,
  jobs: [],
  performanceInsights: null,
  profile: null,
  sessionUserId: null,
}

const initialCustomerKaelMemoryState: CustomerKaelMemoryState = {
  memory: null,
  sessionUserId: null,
  status: 'idle',
}

const initialCustomerProfileInsightsState: CustomerProfileInsightsState = {
  insights: null,
  sessionUserId: null,
}

const FrontendWorkflowContext = createContext<FrontendWorkflowContextValue | null>(null)
const isAppForeground = () => AppState.currentState === 'active'
const ACTIVE_TIMELINE_STATUSES = [
  'broadcasting',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
]
const asciiOnlyPattern = /^[\x00-\x7F]*$/
const readCustomerKaelMemoryPermission = (
  memory: KaelMemorySelfViewResponse['memory'] | null,
  key: CustomerKaelMemoryPreferenceUpdateInput['key'],
) => {
  const servicePreferences = memory?.service_preferences
  if (!servicePreferences || typeof servicePreferences !== 'object' || Array.isArray(servicePreferences)) return null
  const permissions = servicePreferences.memory_permissions
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return null
  const value = (permissions as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : null
}
const mergeCustomerKaelMemoryPermission = (
  memory: KaelMemorySelfViewResponse['memory'] | null,
  key: CustomerKaelMemoryPreferenceUpdateInput['key'],
  enabled: boolean,
): KaelMemorySelfViewResponse['memory'] => {
  const servicePreferences = memory?.service_preferences
  const currentPreferences =
    servicePreferences && typeof servicePreferences === 'object' && !Array.isArray(servicePreferences)
      ? servicePreferences
      : {}
  const currentPermissions = currentPreferences.memory_permissions
  const permissions =
    currentPermissions && typeof currentPermissions === 'object' && !Array.isArray(currentPermissions)
      ? currentPermissions as Record<string, unknown>
      : {}
  return {
    ...(memory ?? {}),
    service_preferences: {
      ...currentPreferences,
      memory_permissions: {
        ...permissions,
        [key]: enabled,
      },
    },
  }
}

const workflowErrorCopy: Record<AppLanguage, Record<string, string>> = {
  vi: {
    noRequestRefresh: 'Chưa có yêu cầu để tải lại',
    missingService: 'Chọn dịch vụ điện, nước hoặc vệ sinh trước khi tạo yêu cầu',
    missingProblem: 'Chọn ít nhất một vấn đề cần xử lý',
    shortDescription: 'Mô tả cần rõ hơn trước khi gửi yêu cầu',
    missingDistrict: 'aịa chỉ cần có quận TP.HCM rõ ràng',
    noRequestSearch: 'Chưa có yêu cầu để tìm thợ',
    noInviteAccept: 'Không có lời mời việc để nhận',
    noInviteDecline: 'Không có lời mời việc để từ chối',
    noRequestUpdate: 'Không có yêu cầu để cập nhật',
    noRequestScope: 'Không có yêu cầu để đổi phạm vi',
    noRequestCancel: 'Không có yêu cầu để hủy',
    noRequestConfirm: 'Không có yêu cầu để xác nhận hoàn tất',
    noRequestReview: 'Không có yêu cầu để đánh giá',
    fallback: 'Không thể cập nhật yêu cầu. Vui lòng thử lại.',
  },
  en: {
    noRequestRefresh: 'No request to refresh',
    missingService: 'Choose electrical, plumbing, or cleaning before creating a request',
    missingProblem: 'Choose at least one problem to handle',
    shortDescription: 'Describe the issue more clearly before sending',
    missingDistrict: 'Enter a clear HCMC district',
    noRequestSearch: 'No request to send to workers',
    noInviteAccept: 'No job invite to accept',
    noInviteDecline: 'No job invite to skip',
    noRequestUpdate: 'No request to update',
    noRequestScope: 'No request for scope change',
    noRequestCancel: 'No request to cancel',
    noRequestConfirm: 'No request to confirm completion',
    noRequestReview: 'No request to review',
    fallback: 'Could not update the request. Try again.',
  },
}

const workflowErrorKeyByViMessage = createWorkflowErrorLookup()

function createWorkflowErrorLookup() {
  const lookup = new Map<string, keyof typeof workflowErrorCopy.vi>()
  for (const [key, value] of Object.entries(workflowErrorCopy.vi)) {
    if (key !== 'fallback') lookup.set(value, key as keyof typeof workflowErrorCopy.vi)
  }
  return lookup
}

type NotificationState = {
  notifications: NotificationListResponse['notifications']
  unreadCount: number
}

type NotificationStateAction =
  | { type: 'mark_read'; notificationId: string; readAt: string; shouldDecrementUnread: boolean }
  | { type: 'refresh'; notifications: NotificationListResponse['notifications']; unreadCount: number }
  | { type: 'reset' }

const initialNotificationState: NotificationState = {
  notifications: [],
  unreadCount: 0,
}
const REQUIRED_PRICE_DISCLAIMER = 'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'

function notificationStateReducer(state: NotificationState, action: NotificationStateAction): NotificationState {
  switch (action.type) {
    case 'mark_read': {
      const notifications = markNotificationListRead(state.notifications, action.notificationId, action.readAt)
      const unreadCount = action.shouldDecrementUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount
      return notifications === state.notifications && unreadCount === state.unreadCount
        ? state
        : { notifications, unreadCount }
    }
    case 'refresh':
      return sameNotifications(state.notifications, action.notifications) && state.unreadCount === action.unreadCount
        ? state
        : { notifications: action.notifications, unreadCount: action.unreadCount }
    case 'reset':
      return state.notifications.length === 0 && state.unreadCount === 0 ? state : initialNotificationState
    default:
      return state
  }
}

function useFrontendWorkflowValue(): FrontendWorkflowContextValue {
  const { role, session } = useAuth()
  const language = useAppLanguage()
  const [state, dispatch] = useReducer(localWorkflowReducer, undefined, createInitialLocalWorkflowState)
  const selectors = useMemo(() => selectLocalWorkflow(state), [state])
  const sessionUserId = session?.user.id ?? null
  const stateRef = useRef(state)
  const [workerRemoteState, setWorkerRemoteState] = useState<WorkerRemoteState>(initialWorkerRemoteState)
  const workerProfile = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.profile : null
  const workerEarnings = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.earnings : null
  const workerJobs = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.jobs : []
  const workerPerformanceInsights = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.performanceInsights : null
  const [customerKaelMemoryState, setCustomerKaelMemoryState] = useState<CustomerKaelMemoryState>(initialCustomerKaelMemoryState)
  const customerKaelMemory = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.memory : null
  const customerKaelMemoryStatus = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.status : 'idle'
  const [customerProfileInsightsState, setCustomerProfileInsightsState] = useState<CustomerProfileInsightsState>(initialCustomerProfileInsightsState)
  const customerProfileInsights = customerProfileInsightsState.sessionUserId === sessionUserId ? customerProfileInsightsState.insights : null
  const [notificationState, setNotificationState] = useReducer(notificationStateReducer, initialNotificationState)
  const { notifications, unreadCount: notificationUnreadCount } = notificationState
  const notificationsRef = useRef<NotificationListResponse['notifications']>([])
  const locallyReadNotificationIdsRef = useRef<Set<string> | null>(null)
  if (locallyReadNotificationIdsRef.current === null) {
    locallyReadNotificationIdsRef.current = new Set<string>()
  }
  const pendingJobCreateClientRequestRef = useRef<PendingClientRequestId | null>(null)
  // Holds the latest refresh callbacks so realtime/AppState effects can stay
  // subscribed across callback-identity changes (no channel churn) while always
  // invoking the freshest closure. Populated by the sync effect below once the
  // callbacks are defined.
  const liveRefreshRef = useRef<{
    refreshCurrentJob: () => Promise<boolean>
    workerRefresh: () => Promise<boolean>
    refreshNotifications: () => Promise<boolean>
    hydrateCustomerActiveJob: () => Promise<boolean>
  } | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  const setRemoteError = useCallback((error: string) => {
    dispatch({ type: 'set_workflow_error', error: localizeWorkflowError(error, language) })
    return false
  }, [language])

  const hydrateJobResult = useCallback((result: ApiResult<JobDetailResponse>) => {
    if (!result.success) return setRemoteError(result.error)
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data, role === 'worker' || role === 'admin') })
    return true
  }, [role, setRemoteError])

  const hydrateRemoteJobById = useCallback(async (jobId: string) => {
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    return hydrateJobResult(await jobService.getJob(jobId))
  }, [hydrateJobResult, setRemoteError])

  const refreshCurrentJob = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    return hydrateJobResult(await jobService.getJob(jobId))
  }, [hydrateJobResult, setRemoteError])

  const hydrateCustomerActiveJob = useCallback(async () => {
    if (getRemoteJobId(stateRef.current)) return true
    const result = await jobService.listMyActiveJob()
    if (!result.success) return false
    if (!result.data.active_job) return true
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data.active_job, false) })
    return true
  }, [])

  const createRemoteJobFromDraft = useCallback(async (
    draftOverride?: LocalDealDraft,
    mediaItems: LocalMediaUploadDraft[] = [],
  ) => {
    const draft = draftOverride ?? stateRef.current.deal?.draft
    if (!draft?.serviceType) return setRemoteError('Chọn dịch vụ điện, nước hoặc vệ sinh trước khi tạo yêu cầu')
    if (draft.problemChips.length === 0) return setRemoteError('Chọn ít nhất một vấn đề cần xử lý')
    if (draft.description.trim().length < 10) return setRemoteError('Mô tả cần rõ hơn trước khi gửi yêu cầu')
    const districtLabel = extractKnownDistrictLabel(draft.districtLabel) || extractKnownDistrictLabel(draft.addressLabel)
    if (!districtLabel) return setRemoteError('aịa chỉ cần có quận TP.HCM rõ ràng')

    const requestFingerprint = jobCreateClientRequestFingerprint(draft, districtLabel)
    const input: JobCreateInput = {
      service_type: draft.serviceType,
      description: draft.description.trim(),
      problem_chips: draft.problemChips,
      photo_urls: [],
      address_building: draft.addressLabel.trim() || undefined,
      address_district: districtLabel,
      client_request_id: stableClientRequestId(
        pendingJobCreateClientRequestRef,
        requestFingerprint,
      ),
    }

    const created = await jobService.createJob(input)
    if (!created.success) {
      setRemoteError(created.error)
      return null
    }
    clearStableClientRequestId(pendingJobCreateClientRequestRef, requestFingerprint)
    dispatch({ type: 'hydrate_remote_job', job: createJobResponseToSnapshot(created.data, draft) })
    if (mediaItems.length === 0) return { jobId: created.data.job_id }

    const uploaded = await uploadJobMediaDrafts(created.data.job_id, mediaItems, 'before')
    if (!uploaded.success) {
      const mediaError = localizeWorkflowError(uploaded.error, language)
      dispatch({ type: 'set_workflow_error', error: mediaError })
      return { jobId: created.data.job_id, mediaError }
    }
    const refreshed = await jobService.getJob(created.data.job_id)
    if (refreshed.success) {
      dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data, false) })
    }
    return { jobId: created.data.job_id }
  }, [language, setRemoteError])

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
        dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data, false) })
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
    const existing = stateRef.current.deal
    if (existing && !usesBeforeAcceptCancelEndpoint(existing.status)) {
      const requested = await jobService.requestCustomerCancellation(jobId, defaultCustomerCancellationInput(language))
      if (!requested.success) return setRemoteError(requested.error)
      const cancelledByPolicy = requested.data.job_status === 'cancelled'
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: requested.data.job_status,
          status: toLocalDealStatus(requested.data.job_status),
          broadcast: existing.broadcast
            ? {
                ...existing.broadcast,
                status: cancelledByPolicy ? 'cancelled' : existing.broadcast.status,
                fullAddressVisible: cancelledByPolicy ? false : existing.broadcast.fullAddressVisible,
                fullAddressLabel: cancelledByPolicy ? null : existing.broadcast.fullAddressLabel,
                secondsRemaining: cancelledByPolicy ? 0 : existing.broadcast.secondsRemaining,
              }
            : null,
        },
      })
      await refreshCurrentJob()
      return true
    }
    const cancelled = await jobService.cancelJob(jobId)
    if (!cancelled.success) return setRemoteError(cancelled.error)
    if (existing) {
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: cancelled.data.status,
          status: toLocalDealStatus(cancelled.data.status),
          broadcast: existing.broadcast
            ? { ...existing.broadcast, status: 'cancelled', fullAddressVisible: false, fullAddressLabel: null }
            : null,
        },
      })
    }
    return true
  }, [language, refreshCurrentJob, setRemoteError])

  const workerRefresh = useCallback(async () => {
    if (role !== 'worker' && role !== 'admin') return true

    const profile = await workerService.getProfile()
    if (!profile.success) return setRemoteError(profile.error)

    const earnings = await workerService.getEarnings(currentWorkerMonthRange())
    const nextEarnings = earnings.success ? earnings.data : null
    const performanceInsights = await workerService.getPerformanceInsights()
    const nextPerformanceInsights = performanceInsights.success ? performanceInsights.data : null
    setWorkerRemoteState((current) => {
      const currentProfile = current.sessionUserId === sessionUserId ? current.profile : null
      const currentEarnings = current.sessionUserId === sessionUserId ? current.earnings : null
      const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
      const currentPerformanceInsights = current.sessionUserId === sessionUserId ? current.performanceInsights : null
      const sameProfile = sameWorkerProfile(currentProfile, profile.data)
      const sameEarnings = nextEarnings ? sameWorkerEarnings(currentEarnings, nextEarnings) : currentEarnings === null
      const samePerformanceInsights = nextPerformanceInsights
        ? sameWorkerPerformanceInsights(currentPerformanceInsights, nextPerformanceInsights)
        : currentPerformanceInsights === null
      return current.sessionUserId === sessionUserId && sameProfile && sameEarnings && samePerformanceInsights
        ? current
        : { earnings: nextEarnings, jobs: currentJobs, performanceInsights: nextPerformanceInsights, profile: profile.data, sessionUserId }
    })

    const broadcasts = await workerService.getBroadcasts()
    if (!broadcasts.success) return setRemoteError(broadcasts.error)
    const nextBroadcast = broadcasts.data.broadcasts[0]

    const jobs = await workerService.getJobs()
    if (!jobs.success) {
      if (nextBroadcast) {
        dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
        return true
      }
      return setRemoteError(jobs.error)
    }
    setWorkerRemoteState((current) => {
      const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
      if (current.sessionUserId === sessionUserId && sameWorkerJobs(currentJobs, jobs.data.jobs)) return current
      return {
        earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
        jobs: jobs.data.jobs,
        performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
        profile: current.sessionUserId === sessionUserId ? current.profile : null,
        sessionUserId,
      }
    })
    if (nextBroadcast) {
      dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
      return true
    }
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
  }, [role, sessionUserId, setRemoteError])

  const workerUpdateAvailability = useCallback(async (isAvailable: boolean) => {
    const updated = await workerService.updateAvailability({ is_available: isAvailable })
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? { ...current, profile: { ...current.profile, is_available: updated.data.is_available } }
      : current)
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUpdateServiceArea = useCallback(async (input: WorkerServiceAreaUpdateInput) => {
    const updated = await workerService.updateServiceArea(input)
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerRemoteState((current) => ({
      earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
      jobs: current.sessionUserId === sessionUserId ? current.jobs : [],
      performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
      profile: updated.data,
      sessionUserId,
    }))
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerSavePayoutMethod = useCallback(async (input: WorkerPayoutMethodSaveInput) => {
    const result = await workerService.savePayoutMethod(input)
    if (!result.success) {
      setRemoteError(result.error)
      return {
        success: false as const,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
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
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? { ...current, profile: { ...current.profile, is_available: false } }
      : current)

    const existing = stateRef.current.deal
    if (existing?.broadcast) {
      const addressAccess = accepted.data.address_access
      const fullAddressLabel = addressAccess.exact_unit_released
        ? formatReleasedFullAddress(accepted.data.full_address)
        : ''
      const stagedAddressLabel = formatStoredJobAddress({
        building: accepted.data.full_address.building,
        floor: null,
        unit: null,
        district: accepted.data.full_address.district,
      })
      dispatch({
        type: 'hydrate_remote_job',
        workerGate: 'remote_backend',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: accepted.data.status,
          status: toLocalDealStatus(accepted.data.status),
          addressLabel: fullAddressLabel || stagedAddressLabel || existing.draft.addressLabel,
          broadcast: {
            ...existing.broadcast,
            status: 'accepted',
            generalArea: stagedAddressLabel || existing.broadcast.generalArea,
            fullAddressVisible: Boolean(fullAddressLabel),
            fullAddressLabel: fullAddressLabel || null,
            addressAccess,
          },
        },
      })
    } else {
      await refreshCurrentJob()
    }
    return true
  }, [refreshCurrentJob, sessionUserId, setRemoteError])

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

  const requestWorkerCancellation = useCallback(async (input: WorkerCancellationRequestInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để hủy')
    const result = await workerService.requestWorkerCancellation(jobId, input)
    if (!result.success) return setRemoteError(result.error)
    if (result.data.status === 'approved') {
      const existing = stateRef.current.deal
      if (existing) {
        dispatch({
          type: 'hydrate_remote_job',
          job: {
            ...dealToSnapshot(existing),
            backendStatus: result.data.job_status,
            status: toLocalDealStatus(result.data.job_status),
            broadcast: existing.broadcast
              ? {
                ...existing.broadcast,
                status: 'cancelled',
                fullAddressVisible: false,
                fullAddressLabel: null,
                secondsRemaining: 0,
              }
              : null,
          },
        })
      }
      await workerRefresh()
      return true
    }
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, workerRefresh])

  const workerSubmitRegistration = useCallback(async (input: WorkerRegisterInput) => {
    const result = await workerService.register(input)
    if (!result.success) return setRemoteError(result.error)
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

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

  // §32.7: customer "Cho thợ lên" — releases the exact unit after the worker's lobby check-in.
  const authorizeApartmentAccess = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để mở quyền vào căn hộ')
    const authorized = await jobService.authorizeApartmentAccess(jobId)
    if (!authorized.success) return setRemoteError(authorized.error)
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

  const refreshNotifications = useCallback(async () => {
    if (!sessionUserId || !role) return true
    const result = await notificationService.list()
    if (!result.success) return setRemoteError(result.error)
    notificationsRef.current = result.data.notifications
    const readNotificationIds = new Set<string>()
    for (const item of result.data.notifications) {
      if (item.status === 'read') readNotificationIds.add(item.id)
    }
    locallyReadNotificationIdsRef.current = readNotificationIds
    setNotificationState({
      type: 'refresh',
      notifications: result.data.notifications,
      unreadCount: result.data.unread_count,
    })
    return true
  }, [role, sessionUserId, setRemoteError])

  const refreshCustomerKaelMemory = useCallback(async () => {
    if (!sessionUserId) {
      setCustomerKaelMemoryState(initialCustomerKaelMemoryState)
      return false
    }
    setCustomerKaelMemoryState((current) => ({
      memory: current.sessionUserId === sessionUserId ? current.memory : null,
      sessionUserId,
      status: 'loading',
    }))
    const result = await kaelMemoryService.getMyMemory()
    if (!result.success) {
      setCustomerKaelMemoryState({
        memory: null,
        sessionUserId,
        status: 'unavailable',
      })
      return false
    }
    setCustomerKaelMemoryState({
      memory: result.data.subject_type === 'customer' ? result.data.memory : null,
      sessionUserId,
      status: 'ready',
    })
    return true
  }, [sessionUserId])

  const updateCustomerKaelMemoryPreference = useCallback(async (input: CustomerKaelMemoryPreferenceUpdateInput) => {
    if (!sessionUserId) return setRemoteError('Bạn cần đăng nhập để cập nhật bộ nhớ Kael')
    const result = await kaelMemoryService.updateMyPreference(input)
    if (!result.success) {
      setRemoteError(result.error)
      return {
        success: false,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    const responseMemory = result.data.subject_type === 'customer' ? result.data.memory : null
    const currentMemory = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.memory : null
    const memory = mergeCustomerKaelMemoryPermission(responseMemory ?? currentMemory, input.key, input.enabled)
    setCustomerKaelMemoryState({
      memory,
      sessionUserId,
      status: 'ready',
    })
    if (readCustomerKaelMemoryPermission(memory, input.key) !== input.enabled) {
      return setRemoteError('Không thể xác nhận cập nhật bộ nhớ Kael')
    }
    return true
  }, [customerKaelMemoryState, sessionUserId, setRemoteError])

  const refreshCustomerProfileInsights = useCallback(async () => {
    if (!sessionUserId) {
      setCustomerProfileInsightsState(initialCustomerProfileInsightsState)
      return false
    }
    const result = await customerProfileService.getInsights()
    if (!result.success) {
      setCustomerProfileInsightsState({
        insights: null,
        sessionUserId,
      })
      return false
    }
    setCustomerProfileInsightsState((current) => {
      const currentInsights = current.sessionUserId === sessionUserId ? current.insights : null
      return current.sessionUserId === sessionUserId && sameCustomerProfileInsights(currentInsights, result.data)
        ? current
        : { insights: result.data, sessionUserId }
    })
    return true
  }, [sessionUserId])

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const result = await notificationService.markRead(notificationId)
    if (!result.success) return setRemoteError(result.error)
    const currentNotification = notificationsRef.current.find((item) => item.id === notificationId)
    const shouldDecrementUnread = Boolean(
      currentNotification &&
      currentNotification.status !== 'read' &&
      !locallyReadNotificationIdsRef.current!.has(notificationId),
    )
    locallyReadNotificationIdsRef.current!.add(notificationId)
    notificationsRef.current = markNotificationListRead(notificationsRef.current, notificationId, result.data.read_at)
    setNotificationState({
      type: 'mark_read',
      notificationId,
      readAt: result.data.read_at,
      shouldDecrementUnread,
    })
    return true
  }, [setRemoteError])

  const actions = useMemo<FrontendWorkflowActions>(() => ({
    createRemoteJobFromDraft,
    confirmRemoteSearch,
    cancelRemoteJob,
    hydrateRemoteJobById,
    refreshCurrentJob,
    workerRefresh,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerUpdateStatus,
    requestScopeChange,
    requestWorkerCancellation,
    workerSubmitRegistration,
    decideScopeChange,
    customerConfirmCompletion,
    authorizeApartmentAccess,
    submitReview,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerSavePayoutMethod,
    refreshNotifications,
    markNotificationRead,
    refreshCustomerKaelMemory,
    updateCustomerKaelMemoryPreference,
    refreshCustomerProfileInsights,
  }), [
    authorizeApartmentAccess,
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    customerConfirmCompletion,
    decideScopeChange,
    hydrateRemoteJobById,
    refreshCurrentJob,
    refreshNotifications,
    refreshCustomerKaelMemory,
    refreshCustomerProfileInsights,
    updateCustomerKaelMemoryPreference,
    markNotificationRead,
    requestScopeChange,
    requestWorkerCancellation,
    submitReview,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerRefresh,
    workerSavePayoutMethod,
    workerSubmitRegistration,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateStatus,
  ])

  useEffect(() => {
    dispatch({ type: 'reset_workflow' })
  }, [sessionUserId])

  useEffect(() => {
    setNotificationState({ type: 'reset' })
  }, [sessionUserId])

  useEffect(() => {
    setCustomerKaelMemoryState(initialCustomerKaelMemoryState)
  }, [sessionUserId])

  useEffect(() => {
    setCustomerProfileInsightsState(initialCustomerProfileInsightsState)
  }, [sessionUserId])

  useEffect(() => {
    liveRefreshRef.current = {
      refreshCurrentJob,
      workerRefresh,
      refreshNotifications,
      hydrateCustomerActiveJob,
    }
  }, [refreshCurrentJob, workerRefresh, refreshNotifications, hydrateCustomerActiveJob])

  useEffect(() => {
    if (!sessionUserId || !role) return
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      const live = liveRefreshRef.current
      if (!live) return
      void live.refreshNotifications()
      if (role === 'customer' || role === 'admin') {
        if (getRemoteJobId(stateRef.current)) void live.refreshCurrentJob()
        else void live.hydrateCustomerActiveJob()
      }
      if (role === 'worker' || role === 'admin') void live.workerRefresh()
    })
    return () => subscription.remove()
  }, [role, sessionUserId])

  useEffect(() => {
    if (!sessionUserId || !role) return
    if (isAppForeground()) void refreshNotifications()
    const interval = setInterval(() => {
      if (isAppForeground()) void refreshNotifications()
    }, 60_000)
    return () => clearInterval(interval)
  }, [refreshNotifications, role, sessionUserId])

  useEffect(() => {
    if (!sessionUserId || (role !== 'worker' && role !== 'admin')) return
    const initialRefresh = setTimeout(() => {
      if (isAppForeground()) void workerRefresh()
    }, 0)
    const interval = setInterval(() => {
      if (isAppForeground()) void workerRefresh()
    }, 20_000)
    return () => {
      clearTimeout(initialRefresh)
      clearInterval(interval)
    }
  }, [role, sessionUserId, workerRefresh])

  useEffect(() => {
    if (!sessionUserId || (role !== 'worker' && role !== 'admin')) return
    const handle = subscribeToWorkerBroadcasts(sessionUserId, () => {
      void liveRefreshRef.current?.workerRefresh()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [role, sessionUserId])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void hydrateCustomerActiveJob()
  }, [role, sessionUserId, hydrateCustomerActiveJob])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void refreshCustomerKaelMemory()
  }, [role, sessionUserId, refreshCustomerKaelMemory])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void refreshCustomerProfileInsights()
  }, [role, sessionUserId, refreshCustomerProfileInsights])

  const broadcast = state.deal?.broadcast
  const customerBroadcast = state.deal?.broadcast
  const remoteJobId = getRemoteJobId(state)
  const customerStatus = state.deal?.status

  const customerTimelineActive =
    (role === 'customer' || role === 'admin') &&
    !!remoteJobId &&
    !(customerStatus === 'broadcasting' && customerBroadcast?.status === 'expired') &&
    ACTIVE_TIMELINE_STATUSES.includes(customerStatus ?? '')

  useEffect(() => {
    if (!customerTimelineActive || !remoteJobId) return
    const handle = subscribeToJobStatus(remoteJobId, () => {
      void liveRefreshRef.current?.refreshCurrentJob()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [customerTimelineActive, remoteJobId])

  useEffect(() => {
    if (!customerTimelineActive) return

    const interval = setInterval(() => {
      if (isAppForeground()) void refreshCurrentJob()
    }, 30_000)
    return () => clearInterval(interval)
  }, [
    customerTimelineActive,
    refreshCurrentJob,
  ])

  useEffect(() => {
    if (state.deal?.status !== 'broadcasting' || broadcast?.status !== 'sent') return
    if (broadcast.secondsRemaining === null) return

    const timer = setTimeout(() => dispatch({ type: 'tick_broadcast' }), 1000)
    return () => clearTimeout(timer)
  }, [state.deal?.status, broadcast?.status, broadcast?.secondsRemaining])

  return {
    state,
    selectors,
    customerKaelMemory,
    customerKaelMemoryStatus,
    customerProfileInsights,
    workerEarnings,
    workerJobs,
    workerPerformanceInsights,
    workerProfile,
    notifications,
    notificationUnreadCount,
    dispatch,
    actions,
  }
}

export function FrontendWorkflowProvider({ children }: { children: ReactNode }) {
  const value = useFrontendWorkflowValue()

  return (
    <FrontendWorkflowContext.Provider value={value}>
      {children}
    </FrontendWorkflowContext.Provider>
  )
}

export function useFrontendWorkflow() {
  const value = use(FrontendWorkflowContext)
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

function usesBeforeAcceptCancelEndpoint(status: JobStatus) {
  return status === 'draft' ||
    status === 'analyzing' ||
    status === 'estimate_ready' ||
    status === 'awaiting_customer_confirm' ||
    status === 'broadcasting'
}

function defaultCustomerCancellationInput(language: AppLanguage): CustomerCancellationRequestInput {
  return {
    reason_code: 'changed_mind',
    reason_note: language === 'en'
      ? 'Customer requested cancellation from the mobile workflow.'
      : 'Khách yêu cầu hủy từ ứng dụng.',
    requested_at: new Date().toISOString(),
  }
}

function jobCreateClientRequestFingerprint(
  draft: LocalDealDraft,
  districtLabel: string,
): string {
  return JSON.stringify({
    service_type: draft.serviceType,
    description: draft.description.trim(),
    problem_chips: draft.problemChips,
    address_building: draft.addressLabel.trim(),
    address_district: districtLabel,
  })
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
const vndFormatter = new Intl.NumberFormat('vi-VN')

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
  const estimate = estimateFromCreateResponse(data)
  return {
    id: data.job_id,
    displayCode: data.display_code ?? null,
    backendStatus: data.status,
    status: toLocalDealStatus(data.status),
    serviceType: data.estimate.service_type,
    description: draft.description,
    problemChips: draft.problemChips,
    addressLabel: draft.addressLabel,
    districtLabel: draft.districtLabel || draft.addressLabel,
    mediaCount: draft.mediaCount,
    estimate,
    broadcast: data.status === 'broadcasting'
      ? {
          status: data.broadcast_sent === false ? 'expired' : 'sent',
          jobId: data.job_id,
          serviceType: data.estimate.service_type,
          problemSummary: estimate.problemLabel,
          generalArea: draft.districtLabel || 'Khu vực TP.HCM',
          prebrief: [
            estimate.problemLabel,
            data.message ?? 'Kael đang gửi yêu cầu đến thợ phù hợp.',
          ],
          fullAddressVisible: false,
          fullAddressLabel: null,
          secondsRemaining: data.broadcast_sent === false ? 0 : null,
        }
      : null,
    scopeChange: null,
    finalPrice: data.final_price ?? null,
  }
}

function confirmSearchToSnapshot(data: ConfirmSearchResponse, deal: NonNullable<LocalWorkflowState['deal']>): LocalRemoteJobSnapshot {
  const snapshot = dealToSnapshot(deal)
  const broadcastSent = data.broadcast_sent
  return {
    ...snapshot,
    backendStatus: data.status,
    status: toLocalDealStatus(data.status),
    workerProfile: workerProfileSummaryFromApi(data.worker),
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

function jobDetailToSnapshot(data: JobDetailResponse, includeWorkerBrief = false): LocalRemoteJobSnapshot {
  const job = data.job
  const serviceType = job.service_type
  const districtLabel = districtLabelFromValue(job.address_district)
  const addressLabel = formatStoredJobAddress({
    building: job.address_building,
    floor: job.address_floor,
    unit: job.address_unit,
    district: job.address_district,
  })
  const estimate = job.kael_price_min && job.kael_price_max
    ? {
        problemLabel: job.kael_problem_identified ?? job.problem_chips[0] ?? 'Yêu cầu sửa chữa',
        complexity: job.kael_complexity ?? 'unknown',
        priceRangeLabel: formatPriceRange(job.kael_price_min, job.kael_price_max),
        confidenceLabel: 'Kael ước tính',
        advisory: job.kael_advisory ?? 'Kael giữ giá theo chính sách và cập nhật khi có bằng chứng phạm vi mới.',
        disclaimer: REQUIRED_PRICE_DISCLAIMER,
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
    job.address_access.exact_unit_released && hasSpecificWorkerRouteAddress(addressLabel, districtLabel) ? addressLabel : null,
    includeWorkerBrief
      ? workerBriefLinesFromRecord(job.kael_worker_brief_guidance ?? job.kael_worker_brief_core)
      : [],
    job.address_access,
  )

  return {
    id: job.id,
    displayCode: job.display_code ?? null,
    backendStatus: job.status,
    status: toLocalDealStatus(job.status),
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
    payment: paymentFromJob(job),
    completionPhotoUrls: job.completion_photo_urls,
    completionNotes: job.completion_notes,
    workerProfile: workerProfileSummaryFromApi(data.worker),
    createdAt: job.created_at,
    matchedAt: job.matched_at,
    completedAt: job.completed_at,
    confirmedAt: job.confirmed_at,
    paidAt: job.paid_at,
    reviewedAt: job.reviewed_at,
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
    prebrief: workerBriefLinesFromRecord(broadcast.worker_brief_core),
    secondsRemaining: broadcast.seconds_remaining,
    estimatedPriceLabel: formatNullablePriceRange(broadcast.estimated_price_min, broadcast.estimated_price_max),
    estimatedEarningLabel: formatNullablePriceRange(broadcast.estimated_earning_min, broadcast.estimated_earning_max),
  }
}

function workerJobToSnapshot(job: WorkerJobListResponse['jobs'][number]): LocalRemoteJobSnapshot {
  const districtLabel = districtLabelFromValue(job.district)
  const addressLabel = formatStoredJobAddress({
    building: job.address_building,
    floor: job.address_floor,
    unit: job.address_unit,
    district: job.district,
  })
  const broadcast = broadcastFromJobStatus(
    job.status,
    job.service_type,
    job.problem_summary ?? 'Yêu cầu sửa chữa',
    districtLabel,
    addressLabel || districtLabel,
    undefined,
    job.address_access.exact_unit_released && hasSpecificWorkerRouteAddress(addressLabel, districtLabel) ? addressLabel : null,
    workerBriefLinesFromRecord(job.worker_brief_guidance),
    job.address_access,
  )
  return {
    id: job.id,
    displayCode: job.display_code ?? null,
    backendStatus: job.status,
    status: toLocalDealStatus(job.status),
    serviceType: job.service_type,
    description: job.problem_summary ?? 'Yêu cầu sửa chữa',
    problemChips: job.problem_summary ? [job.problem_summary] : [],
    addressLabel: addressLabel || districtLabel,
    districtLabel,
    estimate: null,
    broadcast: broadcast
      ? {
          ...broadcast,
          estimatedPriceLabel: formatNullableSinglePrice(job.final_price),
          estimatedEarningLabel: formatNullableSinglePrice(job.estimated_earning),
        }
      : null,
    scopeChange: null,
    finalPrice: job.final_price,
    payment: paymentFromJob(job),
    completionPhotoUrls: job.completion_photo_urls,
    completionNotes: job.completion_notes,
    createdAt: job.created_at,
    matchedAt: job.matched_at,
    completedAt: job.completed_at,
  }
}

function paymentFromJob(job: JobDetailResponse['job'] | WorkerJobListResponse['jobs'][number]): LocalDealPayment | null {
  const paymentStatus = job.payment_status ?? paymentStatusFromJobStatus(job.status)
  const grossAmount = numericOrNull(job.gross_amount) ?? numericOrNull(job.final_price)
  const platformFee = numericOrNull(job.platform_fee)
  const workerNet = numericOrNull(job.worker_net) ?? numericOrNull('estimated_earning' in job ? job.estimated_earning : null)
  const hasPaymentData = Boolean(
    paymentStatus
    || grossAmount
    || platformFee
    || workerNet
    || job.payment_code
    || job.payment_transfer_content
    || job.payment_qr_image_url
    || job.payment_expires_at
    || job.payment_received_at
  )
  if (!hasPaymentData) return null
  return {
    amountReceived: numericOrNull(job.payment_amount_received),
    expiresAt: job.payment_expires_at ?? null,
    grossAmount,
    paymentCode: job.payment_code ?? null,
    platformFee,
    provider: job.payment_provider ?? 'sepay_vietqr',
    qrImageUrl: job.payment_qr_image_url ?? null,
    receivedAt: job.payment_received_at ?? null,
    status: paymentStatus ?? 'not_started',
    transferContent: job.payment_transfer_content ?? null,
    workerNet,
  }
}

function numericOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function paymentStatusFromJobStatus(status: JobStatus): LocalDealPayment['status'] | null {
  if (status === 'payment_pending') return 'pending'
  if (status === 'paid' || status === 'reviewed') return 'received'
  return null
}

function dealToSnapshot(deal: NonNullable<LocalWorkflowState['deal']>): LocalRemoteJobSnapshot {
  return {
    id: deal.id,
    displayCode: deal.displayCode ?? null,
    backendStatus: deal.backendStatus,
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
    payment: deal.payment ?? null,
    completionPhotoUrls: deal.completionPhotoUrls ?? [],
    completionNotes: deal.completionNotes ?? null,
    workerProfile: deal.workerProfile ?? null,
    createdAt: deal.createdAt ?? null,
    matchedAt: deal.matchedAt ?? null,
    completedAt: deal.completedAt ?? null,
    confirmedAt: deal.confirmedAt ?? null,
    paidAt: deal.paidAt ?? null,
    reviewedAt: deal.reviewedAt ?? null,
  }
}

function workerProfileSummaryFromApi(
  worker: ConfirmSearchResponse['worker'] | JobDetailResponse['worker'] | null | undefined,
): LocalRemoteJobSnapshot['workerProfile'] {
  if (!worker) return null
  return {
    avatarUrl: worker.avatar_url,
    displayCode: worker.display_code ?? buildLocalWorkerDisplayCode(worker.id),
    fullName: worker.full_name,
    id: worker.id,
    rating: worker.rating,
    reviewCount: worker.review_count ?? null,
    totalJobs: worker.total_jobs,
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
    priceMin: scope.kael_computed_min ?? scope.price_min,
    priceMax: scope.kael_computed_max ?? scope.price_max,
    kaelReview: scope.kael_review,
    kaelProgress: scope.kael_progress ?? data.job.kael_progress ?? null,
    evidencePhotoUrls: scope.evidence_photo_urls,
    createdAt: scope.created_at,
  }
}

function estimateFromCreateResponse(data: CreateJobResponse): LocalDealEstimate {
  return {
    problemLabel: data.estimate.problem_summary || data.estimate.problem_category,
    complexity: data.estimate.complexity,
    priceRangeLabel: formatPriceRange(data.estimate.price_min, data.estimate.price_max),
    confidenceLabel: `${Math.round(data.estimate.confidence * 100)}%`,
    advisory: data.estimate.advisory ?? 'Kael giữ giá theo chính sách và cập nhật khi có bằng chứng phạm vi mới.',
    disclaimer: REQUIRED_PRICE_DISCLAIMER,
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
  releasedFullAddressLabel: string | null = hasSpecificWorkerRouteAddress(addressLabel, districtLabel) ? addressLabel : null,
  prebriefOverride: string[] = [],
  addressAccess: AddressAccessView | null = null,
) {
  if (status === 'awaiting_customer_confirm' || status === 'cancelled' || status === 'reviewed') return null
  const accepted = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'paid', 'payment_pending'].includes(status)
  const expiredBroadcast = status === 'broadcasting' && broadcastState?.active_count === 0
  const canRevealFullAddress = accepted && Boolean(releasedFullAddressLabel) && (addressAccess?.exact_unit_released ?? true)
  const stagedGeneralArea = accepted && addressAccess && addressAccess.release_stage !== 'area_only'
    ? addressLabel
    : districtLabel
  districtLabel = stagedGeneralArea || districtLabel
  const prebrief = prebriefOverride.length > 0
    ? prebriefOverride
    : [
        problemSummary,
        expiredBroadcast
          ? 'Chưa có thợ phản hồi.'
          : accepted ? 'Yêu cầu đã được nhận.' : 'Đang chờ thợ phản hồi.',
      ]
  return {
    status: expiredBroadcast ? 'expired' as const : accepted ? 'accepted' as const : 'sent' as const,
    serviceType,
    problemSummary,
    generalArea: districtLabel || 'Khu vực TP.HCM',
    prebrief,
    fullAddressVisible: canRevealFullAddress,
    fullAddressLabel: canRevealFullAddress ? releasedFullAddressLabel : null,
    addressAccess,
    secondsRemaining: expiredBroadcast ? 0 : status === 'broadcasting' ? broadcastState?.seconds_remaining ?? null : null,
  }
}

function workerBriefLinesFromRecord(record: Record<string, unknown> | null | undefined) {
  const brief = unwrapWorkerBriefRecord(record)
  const sections = isRecord(brief?.sections) ? brief.sections : null
  if (!sections) return []
  return uniqueStrings([
    ...stringArrayFromRecord(sections, 'guidance'),
    ...stringArrayFromRecord(sections, 'safety'),
    ...stringArrayFromRecord(sections, 'context'),
  ]).slice(0, 4)
}

function unwrapWorkerBriefRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) return null
  return isRecord(record.brief) ? record.brief : record
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (!Array.isArray(value)) return []
  const lines: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const line = item.trim()
    if (line) lines.push(line)
  }
  return lines
}

function uniqueStrings(lines: string[]) {
  const seen = new Set<string>()
  return lines.filter((line) => {
    const normalized = line.toLowerCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function districtLabelFromValue(value: string | null | undefined) {
  if (!value) return 'Khu vực TP.HCM'
  return HCMC_DISTRICTS[value as keyof typeof HCMC_DISTRICTS] ?? value
}

function formatFullAddress(address: { building: string | null; unit: string | null; floor: string | null; district: string | null }) {
  return formatStoredJobAddress(address)
}

function formatReleasedFullAddress(address: { building: string | null; unit: string | null; floor: string | null; district: string | null }) {
  const label = formatFullAddress(address)
  const district = address.district ? districtLabelFromValue(address.district) : ''
  return hasSpecificWorkerRouteAddress(label, district) ? label : ''
}

function formatStoredJobAddress(address: { building: string | null; unit: string | null; floor: string | null; district: string | null }) {
  const district = address.district ? districtLabelFromValue(address.district) : ''
  const baseParts = [address.building, address.floor, address.unit]
    .flatMap((part) => {
      const trimmed = part?.trim()
      return trimmed ? [trimmed] : []
    })
  const baseLabel = baseParts.join(', ')
  const shouldAppendDistrict = Boolean(district && !addressLabelContainsDistrict(baseLabel, district))
  return [...baseParts, ...(shouldAppendDistrict ? [district] : [])].join(', ')
}

function addressLabelContainsDistrict(addressLabel: string, districtLabel: string) {
  if (!addressLabel || !districtLabel) return false
  const addressDistrict = extractKnownDistrictLabel(addressLabel)
  const expectedDistrict = extractKnownDistrictLabel(districtLabel) || districtLabel
  return Boolean(addressDistrict && addressDistrict === expectedDistrict)
}

function sameCustomerProfileInsights(left: CustomerProfileInsightsResponse | null, right: CustomerProfileInsightsResponse) {
  if (!left) return false
  return left.customer_id === right.customer_id
    && left.member_since === right.member_since
    && left.kael_interaction_count === right.kael_interaction_count
    && left.completed_service_count === right.completed_service_count
    && left.saved_address_count === right.saved_address_count
    && left.preferred_service_count === right.preferred_service_count
    && left.active_streak_days === right.active_streak_days
    && left.positive_review_rate_percent === right.positive_review_rate_percent
    && left.price_savings_vnd === right.price_savings_vnd
    && left.total_spend_vnd === right.total_spend_vnd
    && left.usage_rank_level === right.usage_rank_level
    && left.usage_rank_points === right.usage_rank_points
    && left.fair_price_service_count === right.fair_price_service_count
    && left.money_protection_score === right.money_protection_score
    && left.protected_value_vnd === right.protected_value_vnd
    && left.protected_transaction_count === right.protected_transaction_count
    && left.total_transaction_count === right.total_transaction_count
    && left.dispute_free_rate_percent === right.dispute_free_rate_percent
    && left.fair_price_status === right.fair_price_status
}

function sameWorkerProfile(left: WorkerProfileResponse | null, right: WorkerProfileResponse) {
  if (!left) return false
  return left.id === right.id
    && left.verification_status === right.verification_status
    && left.is_available === right.is_available
    && left.is_approved === right.is_approved
    && left.is_suspended === right.is_suspended
    && left.years_experience === right.years_experience
    && left.rating === right.rating
    && left.total_jobs === right.total_jobs
    && left.home_lat === right.home_lat
    && left.home_lng === right.home_lng
    && left.service_radius_km === right.service_radius_km
    && left.legal_name === right.legal_name
    && left.date_of_birth === right.date_of_birth
    && left.gender === right.gender
    && left.bank_account_masked === right.bank_account_masked
    && left.bank_name === right.bank_name
    && left.has_cccd === right.has_cccd
    && left.has_selfie === right.has_selfie
    && sameStringArray(left.service_types, right.service_types)
    && sameStringArray(left.districts, right.districts)
    && sameStringArray(left.problem_specializations, right.problem_specializations)
}

function sameWorkerEarnings(left: EarningsResponse | null, right: EarningsResponse) {
  if (!left) return false
  return left.worker_id === right.worker_id
    && left.total_jobs_paid === right.total_jobs_paid
    && left.gross_earnings === right.gross_earnings
    && left.platform_fee_total === right.platform_fee_total
    && left.net_earnings === right.net_earnings
    && left.pending_payment_count === right.pending_payment_count
    && left.pending_payment_amount === right.pending_payment_amount
    && sameWorkerDailyEarnings(left.daily_earnings, right.daily_earnings)
    && left.from_date === right.from_date
    && left.to_date === right.to_date
}

function sameWorkerPerformanceInsights(left: WorkerPerformanceInsightsResponse | null, right: WorkerPerformanceInsightsResponse) {
  if (!left) return false
  return left.worker_id === right.worker_id
    && left.completed_job_count === right.completed_job_count
    && left.review_count === right.review_count
    && left.average_rating === right.average_rating
    && left.response_rate_percent === right.response_rate_percent
    && left.average_response_minutes === right.average_response_minutes
    && left.on_time_rate_percent === right.on_time_rate_percent
    && left.total_broadcast_count === right.total_broadcast_count
    && left.responded_broadcast_count === right.responded_broadcast_count
    && left.accepted_broadcast_count === right.accepted_broadcast_count
    && left.scheduled_arrival_job_count === right.scheduled_arrival_job_count
    && left.on_time_job_count === right.on_time_job_count
    && left.paid_job_count === right.paid_job_count
    && left.reconciled_earnings_vnd === right.reconciled_earnings_vnd
    && left.performance_score === right.performance_score
    && sameWorkerPerformanceBadges(left.badges, right.badges)
    && sameWorkerPerformanceAxes(left.performance_axes, right.performance_axes)
}

function sameWorkerJobs(left: WorkerJobListResponse['jobs'], right: WorkerJobListResponse['jobs']) {
  return left.length === right.length && left.every((job, index) => sameWorkerJob(job, right[index]))
}

function sameWorkerJob(
  left: WorkerJobListResponse['jobs'][number],
  right: WorkerJobListResponse['jobs'][number],
) {
  return left.id === right.id
    && left.display_code === right.display_code
    && left.status === right.status
    && left.service_type === right.service_type
    && left.problem_summary === right.problem_summary
    && left.address_building === right.address_building
    && left.address_unit === right.address_unit
    && left.address_floor === right.address_floor
    && left.district === right.district
    && left.final_price === right.final_price
    && left.estimated_earning === right.estimated_earning
    && left.completion_notes === right.completion_notes
    && left.created_at === right.created_at
    && left.matched_at === right.matched_at
    && left.completed_at === right.completed_at
    && sameStringArray(left.completion_photo_urls, right.completion_photo_urls)
    && sameAddressAccessView(left.address_access, right.address_access)
}

function sameAddressAccessView(
  left: WorkerJobListResponse['jobs'][number]['address_access'],
  right: WorkerJobListResponse['jobs'][number]['address_access'],
) {
  return left.release_stage === right.release_stage
    && left.exact_unit_released === right.exact_unit_released
    && left.check_in_required === right.check_in_required
    && left.identity_check_required === right.identity_check_required
    && left.customer_handoff_required === right.customer_handoff_required
    && left.evidence_mode === right.evidence_mode
}

function sameWorkerPerformanceBadges(
  left: WorkerPerformanceInsightsResponse['badges'],
  right: WorkerPerformanceInsightsResponse['badges'],
) {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index]
    return item.id === next.id && item.status === next.status
  })
}

function sameWorkerPerformanceAxes(
  left: WorkerPerformanceInsightsResponse['performance_axes'],
  right: WorkerPerformanceInsightsResponse['performance_axes'],
) {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index]
    return item.id === next.id && item.score === next.score
  })
}

function sameWorkerDailyEarnings(left: EarningsResponse['daily_earnings'] | null | undefined, right: EarningsResponse['daily_earnings'] | null | undefined) {
  const leftItems = left ?? []
  const rightItems = right ?? []
  return leftItems.length === rightItems.length && leftItems.every((item, index) => {
    const next = rightItems[index]
    return item.date === next.date
      && item.gross_earnings === next.gross_earnings
      && item.platform_fee_total === next.platform_fee_total
      && item.net_earnings === next.net_earnings
      && item.paid_job_count === next.paid_job_count
  })
}

function currentWorkerMonthRange(referenceDate = new Date()) {
  const from = new Date(referenceDate)
  from.setDate(1)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setMonth(to.getMonth() + 1)
  to.setMilliseconds(-1)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

function sameNotifications(
  left: NotificationListResponse['notifications'],
  right: NotificationListResponse['notifications'],
) {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index]
    return item.id === next.id
      && item.title === next.title
      && item.body === next.body
      && item.event_type === next.event_type
      && item.status === next.status
      && item.job_id === next.job_id
      && item.created_at === next.created_at
      && item.read_at === next.read_at
  })
}

function markNotificationListRead(
  notifications: NotificationListResponse['notifications'],
  notificationId: string,
  readAt: string,
) {
  let changed = false
  const next = notifications.map((item) => {
    if (item.id !== notificationId) return item
    changed = item.status !== 'read' || item.read_at !== readAt
    return changed ? { ...item, status: 'read' as const, read_at: readAt } : item
  })
  return changed ? next : notifications
}

function sameStringArray(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined) {
  const leftItems = left ?? []
  const rightItems = right ?? []
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index])
}

function localizeWorkflowError(error: string, language: AppLanguage) {
  const mappedKey = workflowErrorKeyByViMessage.get(error)
  if (mappedKey) return workflowErrorCopy[language][mappedKey]
  if (language === 'en' && !asciiOnlyPattern.test(error)) return workflowErrorCopy.en.fallback
  if (language === 'vi' && asciiOnlyPattern.test(error)) return workflowErrorCopy.vi.fallback
  return error
}

function formatNullablePriceRange(min: number | null, max: number | null) {
  if (min === null || max === null) return undefined
  return formatPriceRange(min, max)
}

function formatNullableSinglePrice(value: number | null) {
  if (value === null) return undefined
  return formatVnd(value)
}

function formatPriceRange(min: number, max: number) {
  return `${formatVnd(min)} - ${formatVnd(max)}`
}

function formatVnd(value: number) {
  return `${vndFormatter.format(value)}đ`
}

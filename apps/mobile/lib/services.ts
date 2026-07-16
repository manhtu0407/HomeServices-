import { api, mobileApiUrl, type ApiResult } from './api'
import { readResponseBlobBounded, withNetworkDeadline } from './response-guard'
import { streamKaelChatTurn, streamWorkerKaelChatTurn, type KaelChatStreamHandlers, type WorkerKaelChatStreamHandlers } from './kael-stream'
import type {
  AcceptBroadcastResponse,
  AvailabilityToggleResponse,
  BroadcastListResponse,
  CustomerScopeDecisionResponse,
  DevicePushTokenInput,
  DevicePushTokenResponse,
  DeclineBroadcastResponse,
  EarningsResponse,
  ServiceCatalogResponse,
  CreateJobResponse,
  CustomerActiveJobResponse,
  CustomerServiceHistoryResponse,
  PendingDecisionsResponse,
  ThreadsResponse,
  KaelMemoryResponse,
  JobDetailResponse,
  JobMediaAttachInput,
  JobMediaRevokeRequest,
  JobMediaRevokeResult,
  JobMediaUploadRequest,
  JobMediaUploadIntentResponse,
  ApartmentAccessAuthorizeResponse,
  JobMediaAttachResponse,
  JobMessageListResponse,
  JobMessageSendResponse,
  ConfirmKaelChatResponse,
  CustomerCancellationResponse,
  CustomerKaelConversationArchiveResponse,
  CustomerKaelConversationListResponse,
  CustomerKaelConversationResponse,
  CustomerKaelFeedbackResponse,
  CustomerPaymentMethodResponse,
  CustomerPaymentMethodSaveInput,
  CustomerProfileInsightsResponse,
  CustomerFavoriteWorkerResponse,
  DisputeAdminDecisionResponse,
  DisputeCounterStatementResponse,
  DisputeOpenResponse,
  KaelAssistantResponse,
  KaelChatResponse,
  KaelChatMediaUploadResponse,
  KaelMemorySelfViewResponse,
  KaelChatProgressResponse,
  KaelLearningCandidateApproveResponse,
  KaelLearningCandidateListResponse,
  KaelLearningCandidateRejectResponse,
  NotificationListResponse,
  NotificationReadResponse,
  PaymentIntentResponse,
  PlacesAutocompleteResponse,
  PlacesResolveResponse,
  ConfirmSearchResponse,
  StatusUpdateResponse,
  ConfirmCompletionResponse,
  ReviewResponse,
  WorkerJobListResponse,
  WorkerApplicationResponse,
  WorkerPerformanceInsightsResponse,
  WorkerPayoutMethodResponse,
  WorkerPayoutMethodSaveInput,
  WorkerProfileResponse,
  WorkerAvatarUploadResponse,
  WorkerAvatarUpdateResponse,
  WorkerActivityMinuteResponse,
  WorkerRoutePreviewResponse,
  WorkerRegisterResponse,
  WorkerCancellationDecisionInput,
  WorkerCancellationDecisionResponse,
  WorkerCancellationRequestInput,
  WorkerCancellationResponse,
  WorkerKaelChatListResponse,
  WorkerKaelChatArchiveResponse,
  WorkerKaelChatResponse,
  WorkerKaelFeedbackResponse,
  WorkerKaelTrainingConsentResponse,
  WorkerKaelClarifyResponse,
  JobIncidentResponse,
  JobIncidentScopeProposalResponse,
  WorkerScopeChangeResponse,
  WorkerCandidateDecisionResponse,
  WorkerCandidateResponse,
} from './api-types'

import type {
  AvailabilityToggleInput,
  CustomerCancellationRequestInput,
  CustomerKaelConversationCreateInput,
  CustomerKaelConversationMode,
  CustomerKaelConversationPinInput,
  CustomerKaelConversationRenameInput,
  CustomerKaelConversationTurnInput,
  CustomerScopeDecisionInput,
  DisputeAdminDecisionInput,
  DisputeCounterStatementInput,
  DisputeOpenRequestInput,
  DevicePushTokenUnregisterInput,
  DevicePushTokenUnregisterResponse,
  JobCreateInput,
  JobIncidentScopeProposalInput,
  JobStatus,
  CustomerKaelFeedbackInput,
  CustomerKaelMemoryPreferenceUpdateInput,
  KaelAssistantInput,
  KaelWorkerClarifyInput,
  KaelChatCreateInput,
  KaelChatEvidenceInput,
  KaelChatTurnInput,
  KaelPerformanceMode,
  PlacesAutocompleteInput,
  ReviewInput,
  WorkerApplicationSubmitInput,
  WorkerRegisterInput,
  WorkerServiceAreaUpdateInput,
  WorkerAvatarUploadInput,
  WorkerAvatarUpdateInput,
  WorkerKaelChatCreateInput,
  WorkerKaelChatMode,
  WorkerKaelChatPinInput,
  WorkerKaelChatRenameInput,
  WorkerKaelFeedbackInput,
  WorkerKaelTrainingConsentInput,
  WorkerKaelChatTurnInput,
  WorkerKaelMemoryPreferenceUpdateInput,
  WorkerScopeChangeInput,
} from '@nestscout/shared'

const ROUTE_MAP_FETCH_TIMEOUT_MS = 15_000
const ROUTE_MAP_MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const ROUTE_MAP_MAX_URI_LENGTH = 2_048
const ROUTE_MAP_COORDINATE_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/

type MobileKaelScheduleWindowInput = {
  date: string
  start: string
  end: string
  timeZone: 'Asia/Ho_Chi_Minh'
}

type MobileKaelChatCreateInput = KaelChatCreateInput & {
  profileId?: KaelPerformanceMode
  scheduledAt?: string
  scheduleWindow?: MobileKaelScheduleWindowInput
}

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

function parkedMobileApiResult<T>(code: string, error: string): Promise<ApiResult<T>> {
  return Promise.resolve({ success: false, code, error, status: 501 })
}

export const jobService = {
  getServices() {
    return api.get<ServiceCatalogResponse>('/services')
  },

  createJob(input: JobCreateInput) {
    return api.post<CreateJobResponse>('/jobs', input)
  },

  getJob(jobId: string) {
    return api.get<JobDetailResponse>(`/jobs/${encodeURIComponent(jobId)}`)
  },

  // Resume the customer's active job
  // from the backend after a refresh / cold start.
  listMyActiveJob() {
    return api.get<CustomerActiveJobResponse>('/me/jobs/active')
  },

  listMyServiceHistory() {
    return api.get<CustomerServiceHistoryResponse>('/me/jobs/history')
  },

  // the customer's pending decisions (validated scope proposals awaiting them).
  listPendingDecisions() {
    return api.get<PendingDecisionsResponse>('/me/pending-decisions')
  },

  // the customer's cross-job message inbox.
  listThreads() {
    return api.get<ThreadsResponse>('/me/threads')
  },

  // edit the user-owned subset of Kael memory (language + a
  // PII-scrubbed preference note; Kael-computed fields stay read-only).
  updateKaelMemory(input: { language?: 'vi' | 'en'; preference_summary?: string }) {
    return api.patch<KaelMemoryResponse>('/me/kael-memory', input)
  },

  listMessages(jobId: string) {
    return api.get<JobMessageListResponse>(`/jobs/${encodeURIComponent(jobId)}/messages`)
  },

  sendMessage(jobId: string, input: { content: string }) {
    return api.post<JobMessageSendResponse>(`/jobs/${encodeURIComponent(jobId)}/messages`, input)
  },

  attachJobMedia(jobId: string, input: JobMediaAttachInput) {
    return api.post<JobMediaAttachResponse>(`/jobs/${encodeURIComponent(jobId)}/media`, input)
  },

  createJobMediaUpload(jobId: string, input: JobMediaUploadRequest) {
    return api.post<JobMediaUploadIntentResponse>(
      `/jobs/${encodeURIComponent(jobId)}/media-upload`,
      input,
    )
  },

  revokeJobMediaUploads(jobId: string, input: JobMediaRevokeRequest) {
    return api.post<JobMediaRevokeResult>(
      `/jobs/${encodeURIComponent(jobId)}/media-revoke`,
      input,
    )
  },

  confirmSearch(jobId: string) {
    return api.post<ConfirmSearchResponse>(`/jobs/${encodeURIComponent(jobId)}/confirm-search`)
  },

  cancelJob(jobId: string) {
    return api.post<{ job_id: string; status: JobStatus }>(`/jobs/${encodeURIComponent(jobId)}/cancel`)
  },

  getWorkerCandidate(jobId: string) {
    return api.get<WorkerCandidateResponse>(`/jobs/${encodeURIComponent(jobId)}/candidate`)
  },

  confirmWorkerCandidate(jobId: string, candidateId: string) {
    return api.post<WorkerCandidateDecisionResponse>(
      `/jobs/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}/confirm`,
    )
  },

  rejectWorkerCandidate(jobId: string, candidateId: string) {
    return api.post<WorkerCandidateDecisionResponse>(
      `/jobs/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}/reject`,
    )
  },

  setFavoriteWorker(workerId: string, isFavorite: boolean) {
    const path = `/me/favorite-workers/${encodeURIComponent(workerId)}`
    return isFavorite
      ? api.post<CustomerFavoriteWorkerResponse>(path)
      : api.delete<CustomerFavoriteWorkerResponse>(path)
  },

  updateStatus(jobId: string, status: WorkerStatusUpdate, extras?: {
    completion_notes?: string
    completion_photo_urls?: string[]
    access_check_in?: WorkerAccessCheckInInput
  }) {
    // worker không nhập final_price; Kael giữ authority.
    return api.patch<StatusUpdateResponse>(`/jobs/${encodeURIComponent(jobId)}/status`, {
      status,
      ...extras,
    })
  },

  // Customer "Cho thợ lên" releases the exact unit. Backend rejects with
  // ACCESS_NOT_READY (409) when the worker has not checked in at the lobby yet.
  authorizeApartmentAccess(jobId: string) {
    return api.post<ApartmentAccessAuthorizeResponse>(`/jobs/${encodeURIComponent(jobId)}/access/authorize`)
  },

  requestScopeChange(jobId: string, input: WorkerScopeChangeInput) {
    return api.post<WorkerScopeChangeResponse>(`/jobs/${encodeURIComponent(jobId)}/scope-change`, input)
  },

  getKaelJobIncident(jobId: string) {
    return api.get<JobIncidentResponse>(`/jobs/${encodeURIComponent(jobId)}/kael-incident`)
  },

  openKaelJobIncident(jobId: string, input: WorkerScopeChangeInput) {
    return api.post<JobIncidentResponse>(`/jobs/${encodeURIComponent(jobId)}/kael-incident`, input)
  },

  proposeScopeChangeFromKaelIncident(jobId: string, input: JobIncidentScopeProposalInput) {
    return api.post<JobIncidentScopeProposalResponse>(`/jobs/${encodeURIComponent(jobId)}/kael-incident/propose-scope`, input)
  },

  askKaelForWorker(jobId: string, input: KaelWorkerClarifyInput) {
    return api.post<WorkerKaelClarifyResponse>(`/jobs/${encodeURIComponent(jobId)}/kael-clarify`, input)
  },

  requestWorkerCancellation(jobId: string, input: WorkerCancellationRequestInput) {
    return api.post<WorkerCancellationResponse>(`/jobs/${encodeURIComponent(jobId)}/worker-cancellation`, input)
  },

  requestCustomerCancellation(jobId: string, input: CustomerCancellationRequestInput) {
    return api.post<CustomerCancellationResponse>(`/jobs/${encodeURIComponent(jobId)}/customer-cancellation`, input)
  },

  openDispute(jobId: string, input: DisputeOpenRequestInput) {
    return api.post<DisputeOpenResponse>(`/jobs/${encodeURIComponent(jobId)}/disputes`, input)
  },

  submitDisputeCounterStatement(disputeId: string, input: DisputeCounterStatementInput) {
    return api.post<DisputeCounterStatementResponse>(`/disputes/${encodeURIComponent(disputeId)}/counter-statement`, input)
  },

  decideDispute(disputeId: string, input: DisputeAdminDecisionInput) {
    return api.post<DisputeAdminDecisionResponse>(`/disputes/${encodeURIComponent(disputeId)}/admin-decision`, input)
  },

  decideScopeChange(scopeChangeId: string, input: CustomerScopeDecisionInput) {
    return api.post<CustomerScopeDecisionResponse>(`/scope-changes/${encodeURIComponent(scopeChangeId)}/decide`, input)
  },

  // Đã bỏ: hủy việc của thợ được xử lý tự động qua requestWorkerCancellation.
  decideWorkerCancellation(cancellationId: string, input: WorkerCancellationDecisionInput) {
    return api.post<WorkerCancellationDecisionResponse>(`/worker-cancellations/${encodeURIComponent(cancellationId)}/decide`, input)
  },

  confirmCompletion(jobId: string) {
    return api.post<ConfirmCompletionResponse>(`/jobs/${encodeURIComponent(jobId)}/confirm-completion`)
  },

  createPaymentIntent(jobId: string) {
    void jobId
    return parkedMobileApiResult<PaymentIntentResponse>('PAYMENT_NOT_ENABLED', 'Thanh toán chưa được bật cho mobile-api')
  },

  submitReview(jobId: string, input: Omit<ReviewInput, 'job_id'>) {
    return api.post<ReviewResponse>(`/jobs/${encodeURIComponent(jobId)}/review`, {
      ...input,
      job_id: jobId,
    })
  },
}

export const kaelChatService = {
  create({ profileId, scheduledAt, scheduleWindow, profile_id, scheduled_at, ...input }: MobileKaelChatCreateInput) {
    return api.post<KaelChatResponse>('/kael/chat', {
      ...input,
      profile_id: profileId ?? profile_id,
      scheduled_at: scheduledAt ?? scheduled_at,
      schedule_window: scheduleWindow ? {
        date: scheduleWindow.date,
        start: scheduleWindow.start,
        end: scheduleWindow.end,
        time_zone: scheduleWindow.timeZone,
      } : undefined,
    })
  },

  get(sessionId: string) {
    return api.get<KaelChatResponse>(`/kael/chat/${encodeURIComponent(sessionId)}`)
  },

  sendTurn(sessionId: string, input: KaelChatTurnInput) {
    return api.post<KaelChatResponse>(`/kael/chat/${encodeURIComponent(sessionId)}`, input)
  },

  createMediaUpload(input: {
    file_name?: string
    mime_type: string
    purpose: 'model_vision' | 'private_video_original'
    file_size_bytes: number
  }) {
    return api.post<KaelChatMediaUploadResponse>('/kael/chat/media-upload', input)
  },

  revokeMedia(input: { media_refs: string[] }) {
    return api.post<{ revoked_count: number; deletion_pending: boolean }>(
      '/kael/chat/media-revoke',
      input,
    )
  },

  submitEvidence(sessionId: string, input: KaelChatEvidenceInput) {
    return api.post<KaelChatResponse>(`/kael/chat/${encodeURIComponent(sessionId)}/evidence`, input)
  },

  confirm(sessionId: string) {
    return api.post<ConfirmKaelChatResponse>(`/kael/chat/${encodeURIComponent(sessionId)}/confirm`)
  },
}

export const kaelAssistantService = {
  ask(input: KaelAssistantInput) {
    return api.post<KaelAssistantResponse>('/kael/assistant', input)
  },
}

export const customerKaelConversationService = {
  create(input: CustomerKaelConversationCreateInput) {
    return api.post<CustomerKaelConversationResponse>('/me/kael/conversations', input)
  },

  list(mode: CustomerKaelConversationMode) {
    return api.get<CustomerKaelConversationListResponse>(`/me/kael/conversations?mode=${encodeURIComponent(mode)}`)
  },

  get(conversationId: string) {
    return api.get<CustomerKaelConversationResponse>(`/me/kael/conversations/${conversationId}`)
  },

  archive(conversationId: string, confirmCaseWork = false) {
    const confirmation = confirmCaseWork ? '?confirm_case_work=true' : ''
    return api.delete<CustomerKaelConversationArchiveResponse>(`/me/kael/conversations/${conversationId}${confirmation}`)
  },

  rename(conversationId: string, input: CustomerKaelConversationRenameInput) {
    return api.patch<CustomerKaelConversationResponse>(`/me/kael/conversations/${conversationId}`, input)
  },

  setPinned(conversationId: string, input: CustomerKaelConversationPinInput) {
    return api.patch<CustomerKaelConversationResponse>(`/me/kael/conversations/${conversationId}/pin`, input)
  },

  sendTurn(conversationId: string, input: CustomerKaelConversationTurnInput) {
    return api.post<CustomerKaelConversationResponse>(`/me/kael/conversations/${conversationId}/turn`, input)
  },
}

export const kaelChatProgressService = {
  get(sessionId: string) {
    return api.get<KaelChatProgressResponse>(`/kael/chat/${encodeURIComponent(sessionId)}/progress`)
  },
}

export const kaelChatStreamService = {
  sendTurn(sessionId: string, input: KaelChatTurnInput, handlers?: KaelChatStreamHandlers) {
    return streamKaelChatTurn(sessionId, input, handlers)
  },
}

export const workerKaelChatService = {
  create(input: WorkerKaelChatCreateInput) {
    return api.post<WorkerKaelChatResponse>('/workers/me/kael/chat', input)
  },

  list(mode: WorkerKaelChatMode) {
    return api.get<WorkerKaelChatListResponse>(`/workers/me/kael/chat?mode=${encodeURIComponent(mode)}`)
  },

  archive(sessionId: string) {
    return api.delete<WorkerKaelChatArchiveResponse>(`/workers/me/kael/chat/${sessionId}`)
  },

  rename(sessionId: string, input: WorkerKaelChatRenameInput) {
    return api.patch<WorkerKaelChatResponse>(`/workers/me/kael/chat/${sessionId}`, input)
  },

  setPinned(sessionId: string, input: WorkerKaelChatPinInput) {
    return api.patch<WorkerKaelChatResponse>(`/workers/me/kael/chat/${sessionId}/pin`, input)
  },

  get(sessionId: string) {
    return api.get<WorkerKaelChatResponse>(`/workers/me/kael/chat/${encodeURIComponent(sessionId)}`)
  },

  sendTurn(sessionId: string, input: WorkerKaelChatTurnInput) {
    return api.post<WorkerKaelChatResponse>(`/workers/me/kael/chat/${encodeURIComponent(sessionId)}`, input)
  },

  streamTurn(sessionId: string, input: WorkerKaelChatTurnInput, handlers?: WorkerKaelChatStreamHandlers) {
    return streamWorkerKaelChatTurn(sessionId, input, handlers)
  },

  submitFeedback(input: WorkerKaelFeedbackInput) {
    return api.post<WorkerKaelFeedbackResponse>('/workers/me/kael-feedback', input)
  },

  getTrainingConsent() {
    return api.get<WorkerKaelTrainingConsentResponse>('/workers/me/kael-training-consent')
  },

  setTrainingConsent(input: WorkerKaelTrainingConsentInput) {
    return api.patch<WorkerKaelTrainingConsentResponse>('/workers/me/kael-training-consent', input)
  },
}

export const customerFeedbackService = {
  submit(input: CustomerKaelFeedbackInput) {
    return api.post<CustomerKaelFeedbackResponse>('/me/kael-feedback', input)
  },
}

export const customerProfileService = {
  getInsights() {
    return api.get<CustomerProfileInsightsResponse>('/me/profile-insights')
  },

  getPaymentMethod() {
    return parkedMobileApiResult<CustomerPaymentMethodResponse>('PAYMENT_NOT_ENABLED', 'Phương thức thanh toán chưa được bật')
  },

  savePaymentMethod(input: CustomerPaymentMethodSaveInput) {
    void input
    return parkedMobileApiResult<CustomerPaymentMethodResponse>('PAYMENT_NOT_ENABLED', 'Phương thức thanh toán chưa được bật')
  },
}

export const kaelMemoryService = {
  getMyMemory() {
    return api.get<KaelMemorySelfViewResponse>('/me/kael-memory')
  },

  updateMyPreference(input: CustomerKaelMemoryPreferenceUpdateInput) {
    return api.patch<KaelMemorySelfViewResponse>('/me/kael-memory', input)
  },

  getMyWorkerMemory() {
    return api.get<KaelMemorySelfViewResponse>('/workers/me/kael-memory')
  },

  updateMyWorkerPreference(input: WorkerKaelMemoryPreferenceUpdateInput) {
    return api.patch<KaelMemorySelfViewResponse>('/me/kael-memory', input)
  },
}

export const placesService = {
  autocomplete(input: PlacesAutocompleteInput) {
    return api.post<PlacesAutocompleteResponse>('/places/autocomplete', input)
  },

  resolve(input: { label?: string; place_id: string }) {
    return api.post<PlacesResolveResponse>('/places/resolve', input)
  },
}

export const workerService = {
  submitApplication(input: WorkerApplicationSubmitInput) {
    return api.post<WorkerApplicationResponse>('/worker-applications', input)
  },

  register(input: WorkerRegisterInput) {
    return api.post<WorkerRegisterResponse>('/workers/register', input)
  },

  getProfile() {
    return api.get<WorkerProfileResponse>('/workers/me')
  },

  createAvatarUpload(input: WorkerAvatarUploadInput) {
    return api.post<WorkerAvatarUploadResponse>('/workers/me/avatar-upload', input)
  },

  updateAvatar(input: WorkerAvatarUpdateInput) {
    return api.patch<WorkerAvatarUpdateResponse>('/workers/me/avatar', input)
  },

  recordActiveMinute() {
    return api.post<WorkerActivityMinuteResponse>('/workers/me/activity-minute')
  },

  savePayoutMethod(input: WorkerPayoutMethodSaveInput) {
    void input
    return parkedMobileApiResult<WorkerPayoutMethodResponse>('PAYOUT_NOT_ENABLED', 'Tài khoản nhận tiền chưa được bật qua mobile-api')
  },

  getPerformanceInsights() {
    return api.get<WorkerPerformanceInsightsResponse>('/workers/me/performance-insights')
  },

  updateAvailability(input: AvailabilityToggleInput) {
    return api.patch<AvailabilityToggleResponse>('/workers/me/availability', input)
  },

  updateServiceArea(input: WorkerServiceAreaUpdateInput) {
    return api.patch<WorkerProfileResponse>('/workers/me/service-area', input)
  },

  getBroadcasts() {
    return api.get<BroadcastListResponse>('/workers/me/broadcasts')
  },

  getJobs() {
    return api.get<WorkerJobListResponse>('/workers/me/jobs')
  },

  getEarnings(range: { from?: string; to?: string } = {}) {
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    const query = params.toString()
    if (!query) return api.get<EarningsResponse>('/workers/me/earnings')
    return api.get<EarningsResponse>(`/workers/me/earnings?${params.toString()}`)
  },

  acceptBroadcast(jobId: string) {
    return api.post<AcceptBroadcastResponse>(`/jobs/${encodeURIComponent(jobId)}/accept`)
  },

  declineBroadcast(jobId: string) {
    return api.post<DeclineBroadcastResponse>(`/jobs/${encodeURIComponent(jobId)}/decline`)
  },

  updateJobStatus(jobId: string, status: WorkerStatusUpdate, extras?: {
    completion_notes?: string
    completion_photo_urls?: string[]
  }) {
    // worker không nhập final_price; Kael giữ authority.
    return jobService.updateStatus(jobId, status, extras)
  },

  requestScopeChange(jobId: string, input: WorkerScopeChangeInput) {
    return jobService.requestScopeChange(jobId, input)
  },

  getKaelJobIncident(jobId: string) {
    return jobService.getKaelJobIncident(jobId)
  },

  openKaelJobIncident(jobId: string, input: WorkerScopeChangeInput) {
    return jobService.openKaelJobIncident(jobId, input)
  },

  proposeScopeChangeFromKaelIncident(jobId: string, input: JobIncidentScopeProposalInput) {
    return jobService.proposeScopeChangeFromKaelIncident(jobId, input)
  },

  askKael(jobId: string, input: KaelWorkerClarifyInput) {
    return jobService.askKaelForWorker(jobId, input)
  },

  requestWorkerCancellation(jobId: string, input: WorkerCancellationRequestInput) {
    return jobService.requestWorkerCancellation(jobId, input)
  },
}

export const workerRouteService = {
  getPreview(jobId: string, origin: { latitude: number; longitude: number }) {
    const query = new URLSearchParams({
      origin_lat: origin.latitude.toFixed(6),
      origin_lng: origin.longitude.toFixed(6),
    })
    return api.get<WorkerRoutePreviewResponse>(`/workers/me/jobs/${encodeURIComponent(jobId)}/route-preview?${query.toString()}`)
  },

  async getMapImage(uri: string, headers: Record<string, string>) {
    if (!isTrustedWorkerRouteMapUri(uri)) {
      throw new Error('Untrusted route map URL')
    }
    return withNetworkDeadline(async (signal) => {
      const response = await fetch(uri, { headers, redirect: 'error', signal })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('Route map unavailable')
      }
      return readResponseBlobBounded(response, ROUTE_MAP_MAX_RESPONSE_BYTES)
    }, ROUTE_MAP_FETCH_TIMEOUT_MS)
  },
}

function isTrustedWorkerRouteMapUri(uri: string) {
  try {
    const baseUrl = mobileApiUrl('')
    if (uri.length === 0 || uri.length > ROUTE_MAP_MAX_URI_LENGTH || baseUrl.length === 0) return false

    const base = new URL(baseUrl)
    const candidate = new URL(uri)
    const basePath = base.pathname.replace(/\/+$/, '')
    const relativePath = candidate.pathname.slice(basePath.length)
    const originLat = candidate.searchParams.getAll('origin_lat')
    const originLng = candidate.searchParams.getAll('origin_lng')
    const allowedQueryKeys = new Set(['origin_lat', 'origin_lng'])

    if (
      candidate.origin !== base.origin
      || candidate.username
      || candidate.password
      || candidate.hash
      || base.username
      || base.password
      || base.search
      || base.hash
      || !hasCanonicalAbsoluteUrlPath(uri, candidate)
      || !hasCanonicalAbsoluteUrlPath(baseUrl, base)
      || !candidate.pathname.startsWith(`${basePath}/`)
      || !/^\/workers\/me\/jobs\/[^/]+\/route-map$/.test(relativePath)
      || [...candidate.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))
      || originLat.length !== 1
      || originLng.length !== 1
    ) {
      return false
    }

    const latitude = Number(originLat[0])
    const longitude = Number(originLng[0])
    return ROUTE_MAP_COORDINATE_PATTERN.test(originLat[0])
      && ROUTE_MAP_COORDINATE_PATTERN.test(originLng[0])
      && Number.isFinite(latitude)
      && latitude >= -90
      && latitude <= 90
      && Number.isFinite(longitude)
      && longitude >= -180
      && longitude <= 180
  } catch {
    return false
  }
}

function hasCanonicalAbsoluteUrlPath(value: string, parsed: URL) {
  const targetEnd = value.search(/[?#]/)
  const target = targetEnd === -1 ? value : value.slice(0, targetEnd)
  const schemeIndex = target.indexOf(':')
  if (schemeIndex <= 0) return false

  const remainder = target.slice(schemeIndex + 1)
  if (!remainder.startsWith('//')) return false
  const pathIndex = remainder.indexOf('/', 2)
  const rawPath = pathIndex === -1 ? '/' : remainder.slice(pathIndex)
  return rawPath === parsed.pathname
}

export const notificationService = {
  list() {
    return api.get<NotificationListResponse>('/notifications')
  },

  markRead(notificationId: string) {
    return api.post<NotificationReadResponse>(`/notifications/${encodeURIComponent(notificationId)}/read`)
  },

  registerDeviceToken(input: DevicePushTokenInput, accessToken: string) {
    return api.postAuthenticated<DevicePushTokenResponse>(
      '/notifications/device-token',
      input,
      accessToken,
    )
  },

  unregisterDeviceToken(input: DevicePushTokenUnregisterInput, accessToken: string) {
    return api.deleteAuthenticated<DevicePushTokenUnregisterResponse>(
      '/notifications/device-token',
      input,
      accessToken,
    )
  },
}

export const adminLearningService = {
  listCandidates(state: string = 'manual_review') {
    const params = new URLSearchParams({ state })
    return api.get<KaelLearningCandidateListResponse>(`/admin/kael/learning/candidates?${params.toString()}`)
  },

  approveCandidate(candidateId: string, input: { review_note?: string } = {}) {
    return api.post<KaelLearningCandidateApproveResponse>(
      `/admin/kael/learning/candidates/${encodeURIComponent(candidateId)}/approve`,
      input,
    )
  },

  rejectCandidate(candidateId: string, input: { reason: string }) {
    return api.post<KaelLearningCandidateRejectResponse>(
      `/admin/kael/learning/candidates/${encodeURIComponent(candidateId)}/reject`,
      input,
    )
  },
}

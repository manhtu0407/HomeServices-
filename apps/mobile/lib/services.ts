import { api } from './api'
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
  PendingDecisionsResponse,
  ThreadsResponse,
  KaelMemoryResponse,
  JobDetailResponse,
  JobMediaAttachInput,
  ApartmentAccessAuthorizeResponse,
  JobMediaAttachResponse,
  JobMessageListResponse,
  JobMessageSendResponse,
  ConfirmKaelChatResponse,
  CustomerCancellationResponse,
  CustomerKaelFeedbackResponse,
  CustomerPaymentMethodResponse,
  CustomerPaymentMethodSaveInput,
  CustomerProfileInsightsResponse,
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
  WorkerRegisterResponse,
  WorkerCancellationDecisionInput,
  WorkerCancellationDecisionResponse,
  WorkerCancellationRequestInput,
  WorkerCancellationResponse,
  WorkerKaelChatListResponse,
  WorkerKaelChatResponse,
  WorkerKaelFeedbackResponse,
  WorkerKaelTrainingConsentResponse,
  WorkerKaelClarifyResponse,
  WorkerScopeChangeResponse,
} from './api-types'
import type {
  AvailabilityToggleInput,
  CustomerCancellationRequestInput,
  CustomerScopeDecisionInput,
  DisputeAdminDecisionInput,
  DisputeCounterStatementInput,
  DisputeOpenRequestInput,
  JobCreateInput,
  JobStatus,
  CustomerKaelFeedbackInput,
  CustomerKaelMemoryPreferenceUpdateInput,
  KaelAssistantInput,
  KaelWorkerClarifyInput,
  KaelChatCreateInput,
  KaelChatEvidenceInput,
  KaelChatTurnInput,
  PlacesAutocompleteInput,
  ReviewInput,
  WorkerApplicationSubmitInput,
  WorkerRegisterInput,
  WorkerServiceAreaUpdateInput,
  WorkerKaelChatCreateInput,
  WorkerKaelFeedbackInput,
  WorkerKaelTrainingConsentInput,
  WorkerKaelChatTurnInput,
  WorkerKaelMemoryPreferenceUpdateInput,
  WorkerScopeChangeInput,
} from '@nestscout/shared'

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

export const jobService = {
  getServices() {
    return api.get<ServiceCatalogResponse>('/services')
  },

  createJob(input: JobCreateInput) {
    return api.post<CreateJobResponse>('/jobs', input)
  },

  getJob(jobId: string) {
    return api.get<JobDetailResponse>(`/jobs/${jobId}`)
  },

  // X4 (Plan.md §27.7 — 2026-05-29): F-17 — resume the customer's active job
  // from the backend after a refresh / cold start.
  listMyActiveJob() {
    return api.get<CustomerActiveJobResponse>('/me/jobs/active')
  },

  // U-5 (Notes.md 5.3): the customer's pending Kael decisions (scope-changes awaiting them).
  listPendingDecisions() {
    return api.get<PendingDecisionsResponse>('/me/pending-decisions')
  },

  // U-5 (Notes.md): the customer's cross-job message inbox.
  listThreads() {
    return api.get<ThreadsResponse>('/me/threads')
  },

  // U-5 (Notes.md 5.4): edit the user-owned subset of Kael memory (language + a
  // PII-scrubbed preference note; Kael-computed fields stay read-only).
  updateKaelMemory(input: { language?: 'vi' | 'en'; preference_summary?: string }) {
    return api.patch<KaelMemoryResponse>('/me/kael-memory', input)
  },

  listMessages(jobId: string) {
    return api.get<JobMessageListResponse>(`/jobs/${jobId}/messages`)
  },

  sendMessage(jobId: string, input: { content: string }) {
    return api.post<JobMessageSendResponse>(`/jobs/${jobId}/messages`, input)
  },

  attachJobMedia(jobId: string, input: JobMediaAttachInput) {
    return api.post<JobMediaAttachResponse>(`/jobs/${jobId}/media`, input)
  },

  confirmSearch(jobId: string) {
    return api.post<ConfirmSearchResponse>(`/jobs/${jobId}/confirm-search`)
  },

  cancelJob(jobId: string) {
    return api.post<{ job_id: string; status: JobStatus }>(`/jobs/${jobId}/cancel`)
  },

  updateStatus(jobId: string, status: WorkerStatusUpdate, extras?: {
    completion_notes?: string
    completion_photo_urls?: string[]
    access_check_in?: WorkerAccessCheckInInput
  }) {
    // Phase 2.0 (2026-05-23): worker không nhập final_price; Kael giữ authority.
    return api.patch<StatusUpdateResponse>(`/jobs/${jobId}/status`, {
      status,
      ...extras,
    })
  },

  // §32.7: customer "Cho thợ lên" — releases the exact unit. Backend rejects with
  // ACCESS_NOT_READY (409) when the worker has not checked in at the lobby yet.
  authorizeApartmentAccess(jobId: string) {
    return api.post<ApartmentAccessAuthorizeResponse>(`/jobs/${jobId}/access/authorize`)
  },

  requestScopeChange(jobId: string, input: WorkerScopeChangeInput) {
    return api.post<WorkerScopeChangeResponse>(`/jobs/${jobId}/scope-change`, input)
  },

  askKaelForWorker(jobId: string, input: KaelWorkerClarifyInput) {
    return api.post<WorkerKaelClarifyResponse>(`/jobs/${jobId}/kael-clarify`, input)
  },

  requestWorkerCancellation(jobId: string, input: WorkerCancellationRequestInput) {
    return api.post<WorkerCancellationResponse>(`/jobs/${jobId}/worker-cancellation`, input)
  },

  requestCustomerCancellation(jobId: string, input: CustomerCancellationRequestInput) {
    return api.post<CustomerCancellationResponse>(`/jobs/${jobId}/customer-cancellation`, input)
  },

  openDispute(jobId: string, input: DisputeOpenRequestInput) {
    return api.post<DisputeOpenResponse>(`/jobs/${jobId}/disputes`, input)
  },

  submitDisputeCounterStatement(disputeId: string, input: DisputeCounterStatementInput) {
    return api.post<DisputeCounterStatementResponse>(`/disputes/${disputeId}/counter-statement`, input)
  },

  decideDispute(disputeId: string, input: DisputeAdminDecisionInput) {
    return api.post<DisputeAdminDecisionResponse>(`/disputes/${disputeId}/admin-decision`, input)
  },

  decideScopeChange(scopeChangeId: string, input: CustomerScopeDecisionInput) {
    return api.post<CustomerScopeDecisionResponse>(`/scope-changes/${scopeChangeId}/decide`, input)
  },

  // Đã bỏ: hủy việc của thợ được xử lý tự động qua requestWorkerCancellation.
  decideWorkerCancellation(cancellationId: string, input: WorkerCancellationDecisionInput) {
    return api.post<WorkerCancellationDecisionResponse>(`/worker-cancellations/${cancellationId}/decide`, input)
  },

  confirmCompletion(jobId: string) {
    return api.post<ConfirmCompletionResponse>(`/jobs/${jobId}/confirm-completion`)
  },

  createPaymentIntent(jobId: string) {
    return api.post<PaymentIntentResponse>(`/jobs/${jobId}/payment-intent`)
  },

  submitReview(jobId: string, input: Omit<ReviewInput, 'job_id'>) {
    return api.post<ReviewResponse>(`/jobs/${jobId}/review`, {
      ...input,
      job_id: jobId,
    })
  },
}

export const kaelChatService = {
  create(input: KaelChatCreateInput) {
    return api.post<KaelChatResponse>('/kael/chat', input)
  },

  get(sessionId: string) {
    return api.get<KaelChatResponse>(`/kael/chat/${sessionId}`)
  },

  sendTurn(sessionId: string, input: KaelChatTurnInput) {
    return api.post<KaelChatResponse>(`/kael/chat/${sessionId}`, input)
  },

  createMediaUpload(input: { file_name?: string; mime_type: string; file_size_bytes?: number }) {
    return api.post<KaelChatMediaUploadResponse>('/kael/chat/media-upload', input)
  },

  submitEvidence(sessionId: string, input: KaelChatEvidenceInput) {
    return api.post<KaelChatResponse>(`/kael/chat/${sessionId}/evidence`, input)
  },

  confirm(sessionId: string) {
    return api.post<ConfirmKaelChatResponse>(`/kael/chat/${sessionId}/confirm`)
  },
}

export const kaelAssistantService = {
  ask(input: KaelAssistantInput) {
    return api.post<KaelAssistantResponse>('/kael/assistant', input)
  },
}

export const kaelChatProgressService = {
  get(sessionId: string) {
    return api.get<KaelChatProgressResponse>(`/kael/chat/${sessionId}/progress`)
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

  list() {
    return api.get<WorkerKaelChatListResponse>('/workers/me/kael/chat')
  },

  get(sessionId: string) {
    return api.get<WorkerKaelChatResponse>(`/workers/me/kael/chat/${sessionId}`)
  },

  sendTurn(sessionId: string, input: WorkerKaelChatTurnInput) {
    return api.post<WorkerKaelChatResponse>(`/workers/me/kael/chat/${sessionId}`, input)
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
    return api.get<CustomerPaymentMethodResponse>('/me/payment-method')
  },

  savePaymentMethod(input: CustomerPaymentMethodSaveInput) {
    return api.put<CustomerPaymentMethodResponse>('/me/payment-method', input)
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
    return api.patch<KaelMemorySelfViewResponse>('/workers/me/kael-memory', input)
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

  savePayoutMethod(input: WorkerPayoutMethodSaveInput) {
    return api.put<WorkerPayoutMethodResponse>('/workers/me/payout-method', input)
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
    return api.post<AcceptBroadcastResponse>(`/jobs/${jobId}/accept`)
  },

  declineBroadcast(jobId: string) {
    return api.post<DeclineBroadcastResponse>(`/jobs/${jobId}/decline`)
  },

  updateJobStatus(jobId: string, status: WorkerStatusUpdate, extras?: {
    completion_notes?: string
    completion_photo_urls?: string[]
  }) {
    // Phase 2.0 (2026-05-23): worker không nhập final_price; Kael giữ authority.
    return jobService.updateStatus(jobId, status, extras)
  },

  requestScopeChange(jobId: string, input: WorkerScopeChangeInput) {
    return jobService.requestScopeChange(jobId, input)
  },

  askKael(jobId: string, input: KaelWorkerClarifyInput) {
    return jobService.askKaelForWorker(jobId, input)
  },

  requestWorkerCancellation(jobId: string, input: WorkerCancellationRequestInput) {
    return jobService.requestWorkerCancellation(jobId, input)
  },
}

export const notificationService = {
  list() {
    return api.get<NotificationListResponse>('/notifications')
  },

  markRead(notificationId: string) {
    return api.post<NotificationReadResponse>(`/notifications/${notificationId}/read`)
  },

  registerDeviceToken(input: DevicePushTokenInput) {
    return api.post<DevicePushTokenResponse>('/notifications/device-token', input)
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

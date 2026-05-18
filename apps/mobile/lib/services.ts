import { api } from './api'
import type {
  AcceptBroadcastResponse,
  AvailabilityToggleResponse,
  BroadcastListResponse,
  CustomerScopeDecisionResponse,
  DeclineBroadcastResponse,
  EarningsResponse,
  ServiceCatalogResponse,
  CreateJobResponse,
  JobDetailResponse,
  ConfirmSearchResponse,
  StatusUpdateResponse,
  ConfirmCompletionResponse,
  ReviewResponse,
  WorkerJobListResponse,
  WorkerProfileResponse,
  WorkerRegisterResponse,
  WorkerScopeChangeResponse,
} from './api-types'
import type {
  AvailabilityToggleInput,
  CustomerScopeDecisionInput,
  JobCreateInput,
  JobStatus,
  ReviewInput,
  WorkerRegisterInput,
  WorkerScopeChangeInput,
} from '@home-services/shared'

type WorkerStatusUpdate = Extract<JobStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'>

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

  confirmSearch(jobId: string) {
    return api.post<ConfirmSearchResponse>(`/jobs/${jobId}/confirm-search`)
  },

  cancelJob(jobId: string) {
    return api.post<{ job_id: string; status: JobStatus }>(`/jobs/${jobId}/cancel`)
  },

  updateStatus(jobId: string, status: WorkerStatusUpdate, extras?: {
    completion_notes?: string
    completion_photo_urls?: string[]
    final_price?: number
  }) {
    return api.patch<StatusUpdateResponse>(`/jobs/${jobId}/status`, {
      status,
      ...extras,
    })
  },

  requestScopeChange(jobId: string, input: WorkerScopeChangeInput) {
    return api.post<WorkerScopeChangeResponse>(`/jobs/${jobId}/scope-change`, input)
  },

  decideScopeChange(scopeChangeId: string, input: CustomerScopeDecisionInput) {
    return api.post<CustomerScopeDecisionResponse>(`/scope-changes/${scopeChangeId}/decide`, input)
  },

  confirmCompletion(jobId: string) {
    return api.post<ConfirmCompletionResponse>(`/jobs/${jobId}/confirm-completion`)
  },

  submitReview(jobId: string, input: Omit<ReviewInput, 'job_id'>) {
    return api.post<ReviewResponse>(`/jobs/${jobId}/review`, {
      ...input,
      job_id: jobId,
    })
  },
}

export const workerService = {
  register(input: WorkerRegisterInput) {
    return api.post<WorkerRegisterResponse>('/workers/register', input)
  },

  getProfile() {
    return api.get<WorkerProfileResponse>('/workers/me')
  },

  updateAvailability(input: AvailabilityToggleInput) {
    return api.patch<AvailabilityToggleResponse>('/workers/me/availability', input)
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
    final_price?: number
  }) {
    return jobService.updateStatus(jobId, status, extras)
  },

  requestScopeChange(jobId: string, input: WorkerScopeChangeInput) {
    return jobService.requestScopeChange(jobId, input)
  },
}

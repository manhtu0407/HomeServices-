import { api } from './api'
import type {
  ServiceCatalogResponse,
  CreateJobResponse,
  JobDetailResponse,
  ConfirmSearchResponse,
  StatusUpdateResponse,
  ConfirmCompletionResponse,
  ReviewResponse,
} from './api-types'
import type { JobCreateInput, JobStatus, ReviewInput } from '@home-services/shared'

type WorkerStatusUpdate = Extract<JobStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'>

export const jobService = {
  getServices() {
    return api.get<ServiceCatalogResponse>('/api/services')
  },

  createJob(input: JobCreateInput) {
    return api.post<CreateJobResponse>('/api/jobs', input)
  },

  getJob(jobId: string) {
    return api.get<JobDetailResponse>(`/api/jobs/${jobId}`)
  },

  confirmSearch(jobId: string) {
    return api.post<ConfirmSearchResponse>(`/api/jobs/${jobId}/confirm-search`)
  },

  updateStatus(jobId: string, status: WorkerStatusUpdate, extras?: {
    completion_notes?: string
    completion_photo_urls?: string[]
    final_price?: number
  }) {
    return api.patch<StatusUpdateResponse>(`/api/jobs/${jobId}/status`, {
      status,
      ...extras,
    })
  },

  confirmCompletion(jobId: string) {
    return api.post<ConfirmCompletionResponse>(`/api/jobs/${jobId}/confirm-completion`)
  },

  submitReview(jobId: string, input: Omit<ReviewInput, 'job_id'>) {
    return api.post<ReviewResponse>(`/api/jobs/${jobId}/review`, {
      ...input,
      job_id: jobId,
    })
  },
}

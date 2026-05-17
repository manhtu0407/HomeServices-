import type { ServiceType, ComplexityLevel, JobStatus } from '@home-services/shared'

export type ServiceCatalogResponse = {
  services: {
    id: string
    service_type: ServiceType
    label_vi: string
    problems: {
      id: string
      slug: string
      label_vi: string
      default_complexity: ComplexityLevel
    }[]
    baselines: {
      complexity: ComplexityLevel
      district_code: string
      price_min: number
      price_max: number
    }[]
  }[]
}

export type KaelEstimate = {
  service_type: ServiceType
  problem_category: string
  problem_summary: string
  complexity: ComplexityLevel
  price_min: number
  price_max: number
  confidence: number
  advisory: string | null
  disclaimer: string
}

export type CreateJobResponse = {
  job_id: string
  status: JobStatus
  estimate: KaelEstimate
  fallback_used: boolean
}

export type JobDetailResponse = {
  id: string
  status: JobStatus
  service_type: ServiceType
  description: string
  customer_id: string
  worker_id: string | null
  estimate_price_min: number | null
  estimate_price_max: number | null
  final_price: number | null
}

export type ConfirmSearchResponse = {
  job_id: string
  status: JobStatus
  worker: {
    full_name: string
    rating: number
    total_jobs: number
  } | null
}

export type StatusUpdateResponse = {
  job_id: string
  from_status: JobStatus
  to_status: JobStatus
  updated_at: string
}

export type ConfirmCompletionResponse = {
  job_id: string
  status: JobStatus
  final_price: number
}

export type ReviewResponse = {
  review_id: string
  job_id: string
  status: JobStatus
}

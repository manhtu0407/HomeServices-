import type { AppLanguage } from '@/lib/app-language'

import { buildStageTenModel } from './stage-ten-model'
import type { WorkerJobsLegacyPrototypeRuntime } from '../worker-jobs-zip-prototype-shared'
import type { StageTenModel } from './stage-ten.types'

export type WorkerStageTenRuntime = Pick<
  WorkerJobsLegacyPrototypeRuntime,
  'state' | 'workerEarnings' | 'workerJobs' | 'workerPerformanceInsights' | 'workerProfile'
>

export type WorkerStageTenProjection = {
  model: StageTenModel
  photoRef: string | null
}

const closedWorkerJobStatuses = new Set(['confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function latestClosedWorkerJob(runtime: WorkerStageTenRuntime) {
  return runtime.workerJobs
    .filter((job) => closedWorkerJobStatuses.has(job.status))
    .slice()
    .sort((left, right) => timestamp(right.completed_at ?? right.created_at) - timestamp(left.completed_at ?? left.created_at))[0] ?? null
}

export function buildWorkerStageTenRuntime(runtime: WorkerStageTenRuntime, language: AppLanguage): WorkerStageTenProjection {
  const deal = runtime.state.deal
  const listedJob = deal ? null : latestClosedWorkerJob(runtime)
  const jobId = deal?.id ?? listedJob?.id ?? null
  const model = buildStageTenModel({
    averageRating: runtime.workerPerformanceInsights?.average_rating ?? runtime.workerProfile?.rating ?? null,
    completedAt: deal?.completedAt ?? listedJob?.completed_at ?? null,
    district: deal?.draft.districtLabel ?? deal?.broadcast?.generalArea ?? listedJob?.district ?? null,
    jobId,
    ledger: runtime.workerEarnings?.recent_transactions ?? [],
    performanceScore: runtime.workerPerformanceInsights?.performance_score ?? null,
    photoRef: deal?.completionPhotoUrls?.[0] ?? listedJob?.completion_photo_urls?.[0] ?? null,
    reviewCount: runtime.workerPerformanceInsights?.review_count ?? null,
    serviceType: deal?.broadcast?.serviceType ?? deal?.draft.serviceType ?? listedJob?.service_type ?? null,
    status: deal?.status ?? listedJob?.status ?? null,
  }, language)

  return { model, photoRef: model.job.photoRef }
}

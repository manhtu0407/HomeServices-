import type { AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import { formatLooseLabel, textByLanguage } from './format'
import { workerPerformanceAxisLabel } from './labels'

type WorkerV5PerformanceAxisSource = {
  performance_axes: ReadonlyArray<{ id: string; score: number | null | undefined }>
} | null | undefined

type WorkerV5PerformanceScoreSource = {
  performance_score?: number | null | undefined
} | null | undefined

export function workerV5HasNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function workerV5NumericInsight(value: number | null | undefined) {
  return workerV5HasNumber(value) ? Math.max(0, Math.round(value)) : 0
}

export function workerV5RankingAxisIcon(axisId: string): WorkerV5IconName {
  switch (axisId) {
    case 'arrival':
    case 'response':
      return 'clock'
    case 'completion':
      return 'evidence'
    case 'earnings':
      return 'wallet'
    case 'rating':
    default:
      return 'shield'
  }
}

export type WorkerV5ReliabilityAxis = {
  hasData: boolean
  id: string
  score: number
}

export const WORKER_V5_RELIABILITY_EMPTY_AXES = ['arrival', 'completion', 'rating'] as const

export function workerV5ReliabilityAxisScore(insights: WorkerV5PerformanceAxisSource, axisId: string) {
  const score = insights?.performance_axes.find((axis) => axis.id === axisId)?.score
  return workerV5HasNumber(score) ? Math.max(0, Math.min(100, Math.round(score))) : null
}

export function workerV5ReliabilityAxes(insights: WorkerV5PerformanceAxisSource): WorkerV5ReliabilityAxis[] {
  return WORKER_V5_RELIABILITY_EMPTY_AXES.map((id) => {
    const score = workerV5ReliabilityAxisScore(insights, id)
    return { hasData: score != null, id, score: score ?? 0 }
  })
}

export function workerV5ReliabilityPercentValue(value: number | null | undefined) {
  return workerV5HasNumber(value) ? `${Math.max(0, Math.round(value))}%` : '0%'
}

export function workerV5ReliabilityRatingValue(value: number | null | undefined, language?: AppLanguage) {
  if (!workerV5HasNumber(value) || value <= 0) return '0'
  const normalized = `${Math.round(value * 10) / 10}`
  return language === 'vi' ? normalized.replace('.', ',') : normalized
}

export function workerV5ReliabilityAxisTitle(id: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      arrival: 'On time & ETA updates',
      completion: 'Evidence & process',
      earnings: 'Reconciled earnings',
      rating: 'Quality & communication',
      response: 'Response & ETA discipline',
    },
    vi: {
      arrival: 'Đúng hẹn & cập nhật thời gian đến',
      completion: 'Bằng chứng & quy trình',
      earnings: 'Thu nhập đã đối soát',
      rating: 'Chất lượng & giao tiếp',
      response: 'Phản hồi & cập nhật thời gian đến',
    },
  }
  return labels[language][id] ?? workerPerformanceAxisLabel(id, language)
}

export function workerV5ReliabilityAxisMeta(axis: WorkerV5ReliabilityAxis, language: AppLanguage) {
  return axis.hasData
    ? textByLanguage(language, `${axis.score}/100 · dữ liệu thật`, `${axis.score}/100 · real data`)
    : textByLanguage(language, '0/100 · chưa có dữ liệu thật', '0/100 · no real data yet')
}

export function workerV5ProfileBackendSyncPercent(insights: WorkerV5PerformanceScoreSource) {
  const score = insights?.performance_score
  if (!workerV5HasNumber(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

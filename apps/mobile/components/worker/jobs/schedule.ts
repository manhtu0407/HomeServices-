import { type LocalDeal, toLocalDealStatus } from '@nestscout/shared'

import { localizedServiceLabel, localizedStatusLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerJobListResponse } from '@/lib/api-types'

import { formatVnd, textByLanguage } from '../ui/format'
import { formatWorkerDistrict, routeDestinationLabel, workerV5TimeChoiceLabel } from '../ui/labels'

export type WorkerV5SchedulePlanRow = {
  aside: string
  meta: string
  time: string
  title: string
}

export type WorkerV5SchedulePlan = {
  actionLabel: string
  amount: string
  kaelBody: string
  kaelTitle: string
  lensLabel: string
  lensValue: string
  meta: string
  rows: readonly WorkerV5SchedulePlanRow[]
}

export function buildWorkerV5SchedulePlan(
  deal: LocalDeal | null,
  workerJobs: readonly WorkerJobListResponse['jobs'][number][],
  language: AppLanguage,
): WorkerV5SchedulePlan {
  const scheduleJobs = workerJobs
    .filter(isWorkerV5SchedulableJob)
    .slice()
    .sort(compareWorkerV5ScheduleJobs)

  if (scheduleJobs.length > 0) {
    const rows = scheduleJobs.map((job) => buildWorkerV5ScheduleRowFromJob(job, language))
    return {
      actionLabel: textByLanguage(language, 'Theo tín hiệu thật', 'Real signals'),
      amount: scheduleJobs.length === 1
        ? rows[0]?.aside ?? textByLanguage(language, '1 việc thật', '1 real task')
        : textByLanguage(language, `${scheduleJobs.length} việc đã nhận`, `${scheduleJobs.length} accepted tasks`),
      kaelBody: textByLanguage(
        language,
        'Kael ưu tiên việc đang mở, tín hiệu địa chỉ/khu vực đã có và thời điểm nhận. Khi hệ thống có thời gian di chuyển hoặc độ khó, thứ tự sẽ được tinh chỉnh tăng dần.',
        'Kael prioritizes open work, available address/area signals, and accepted time. When ETA or difficulty signals exist, the order will be refined upward.',
      ),
      kaelTitle: textByLanguage(language, 'Kael đã xếp việc thật', 'Kael sorted real tasks'),
      lensLabel: textByLanguage(language, 'Việc thật', 'Real tasks'),
      lensValue: String(scheduleJobs.length),
      meta: buildWorkerV5ScheduleJobMeta(scheduleJobs, language),
      rows,
    }
  }

  if (!deal) {
    return {
      actionLabel: textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data'),
      amount: textByLanguage(language, 'Chờ dữ liệu thật', 'No real data'),
      kaelBody: textByLanguage(
        language,
        'Kael chỉ sắp lịch khi có cơ hội thật từ khách hoặc việc đang chạy để đối chiếu.',
        'Kael schedules only from real customer opportunities or active work.',
      ),
      kaelTitle: textByLanguage(language, 'Kael đang chờ cơ hội thật', 'Kael is waiting for real work'),
      lensLabel: textByLanguage(language, 'Cơ hội thật', 'Real work'),
      lensValue: textByLanguage(language, 'Chờ', 'Wait'),
      meta: textByLanguage(language, 'Mở khi hệ thống có cơ hội phù hợp', 'Opens when the system has a matching opportunity'),
      rows: [],
    }
  }

  const earning = deal.broadcast?.estimatedEarningLabel?.trim() || null
  const rows = [buildWorkerV5ScheduleRow(deal, language)]
  return {
    actionLabel: textByLanguage(language, 'Theo việc thật', 'Real work'),
    amount: earning ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning'),
    kaelBody: textByLanguage(
      language,
      'Không tự nhận việc hoặc thay đổi lịch nếu bạn chưa xác nhận.',
      'No job is accepted or schedule changed until you confirm.',
    ),
    kaelTitle: textByLanguage(language, 'Tôi đã chừa 30 phút dự phòng', 'I kept a 30-minute buffer'),
    lensLabel: textByLanguage(language, 'Cơ hội thật', 'Real work'),
    lensValue: '1',
    meta: textByLanguage(
      language,
      `${rows.length} việc · ${routeDestinationLabel(deal, language)}`,
      `${rows.length} work · ${routeDestinationLabel(deal, language)}`,
    ),
    rows,
  }
}

function isWorkerV5SchedulableJob(job: WorkerJobListResponse['jobs'][number]) {
  return [
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
    'completed_by_worker',
  ].includes(toLocalDealStatus(job.status))
}

function compareWorkerV5ScheduleJobs(
  left: WorkerJobListResponse['jobs'][number],
  right: WorkerJobListResponse['jobs'][number],
) {
  const statusRank = workerV5ScheduleStatusRank(toLocalDealStatus(left.status)) - workerV5ScheduleStatusRank(toLocalDealStatus(right.status))
  if (statusRank !== 0) return statusRank
  const locationRank = workerV5ScheduleLocationRank(left) - workerV5ScheduleLocationRank(right)
  if (locationRank !== 0) return locationRank
  return workerV5ScheduleTimestamp(left) - workerV5ScheduleTimestamp(right)
}

function workerV5ScheduleStatusRank(status: LocalDeal['status']) {
  switch (status) {
    case 'worker_matched':
      return 0
    case 'worker_on_way':
      return 1
    case 'arrived':
      return 2
    case 'inspecting':
      return 3
    case 'repairing':
      return 4
    case 'scope_change_pending':
      return 5
    case 'completed_by_worker':
      return 6
    default:
      return 9
  }
}

function workerV5ScheduleLocationRank(job: WorkerJobListResponse['jobs'][number]) {
  if (workerV5JobExactAddressReleased(job)) return 0
  if (job.district?.trim()) return 1
  return 2
}

function workerV5ScheduleTimestamp(job: WorkerJobListResponse['jobs'][number]) {
  const value = job.scheduled_at ?? job.matched_at ?? job.created_at
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER
}

function buildWorkerV5ScheduleRowFromJob(
  job: WorkerJobListResponse['jobs'][number],
  language: AppLanguage,
): WorkerV5SchedulePlanRow {
  const problem = job.problem_summary?.trim() || localizedServiceLabel(job.service_type, language)
  const destination = workerV5JobDestinationLabel(job, language)
  const earning = typeof job.estimated_earning === 'number' && job.estimated_earning > 0
    ? formatVnd(job.estimated_earning, language)
    : localizedStatusLabel(toLocalDealStatus(job.status), language)
  return {
    aside: earning,
    meta: `${destination} · ${problem}`,
    time: workerV5TimeChoiceLabel(undefined, language, job.scheduled_at),
    title: localizedServiceLabel(job.service_type, language),
  }
}

function buildWorkerV5ScheduleJobMeta(
  jobs: readonly WorkerJobListResponse['jobs'][number][],
  language: AppLanguage,
) {
  const districtCount = new Set(jobs.flatMap((job) => {
    const district = job.district?.trim()
    return district ? [district] : []
  })).size
  return textByLanguage(
    language,
    `${jobs.length} việc thật · ${districtCount || 1} khu vực`,
    `${jobs.length} real tasks · ${districtCount || 1} area${districtCount > 1 ? 's' : ''}`,
  )
}

function workerV5JobDestinationLabel(job: WorkerJobListResponse['jobs'][number], language: AppLanguage) {
  const district = job.district?.trim() ? formatWorkerDistrict(job.district, language) : textByLanguage(language, 'Khu vực đang ẩn', 'Area hidden')
  if (!workerV5JobExactAddressReleased(job)) return district
  const parts = [job.address_building, job.address_floor, job.address_unit, district]
    .flatMap((part) => {
      const trimmed = part?.trim()
      return trimmed ? [trimmed] : []
    })
  return parts.length > 0 ? parts.join(', ') : district
}

function workerV5JobExactAddressReleased(job: WorkerJobListResponse['jobs'][number]) {
  return Boolean(job.address_access.exact_unit_released && (job.address_building || job.address_floor || job.address_unit))
}

function buildWorkerV5ScheduleRow(deal: LocalDeal, language: AppLanguage): WorkerV5SchedulePlanRow {
  const problem = deal.broadcast?.problemSummary || deal.draft.problemChips[0] || deal.draft.description
  const destination = routeDestinationLabel(deal, language)
  const meta = problem ? `${destination} · ${problem}` : destination
  return {
    aside: deal.broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning'),
    meta,
    time: workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt),
    title: localizedServiceLabel(deal.draft.serviceType, language),
  }
}

import type { ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type {
  EarningsResponse,
  WorkerBroadcast,
  WorkerJobListResponse,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
} from '@/lib/api-types'
import { isWorkerOperationalJobStatus } from '@/lib/frontend-workflow/helpers'
import type { WorkerV5Runtime } from '../worker-v5-runtime'
import { formatWorkerDistrict, workerVerificationLabel } from '../ui/labels'
import { formatVndDong, textByLanguage } from '../ui/format'

type WorkerHomeStat = {
  label: string
  value: string | null
}

type WorkerHomeJobCard = {
  broadcastId: string | null
  earningLabel: string | null
  id: string
  location: string
  scheduledLabel: string
  serviceType: ServiceType
  statusLabel: string | null
  title: string
}

type WorkerHomeProfilePrompt = {
  actionLabel: string
  detail: string
  kind: 'blocked' | 'incomplete' | 'loading' | 'verified'
  title: string
}

export type WorkerHomeProductionModel = {
  displayName: string
  executionJob: WorkerHomeJobCard | null
  featuredOpportunity: WorkerHomeJobCard | null
  mode: 'execution' | 'market' | 'readiness'
  opportunityState: 'available' | 'empty' | 'loading' | 'stale' | 'unavailable'
  profilePrompt: WorkerHomeProfilePrompt
  stats: {
    activeJobs: WorkerHomeStat
    completedJobs: WorkerHomeStat
    opportunities: WorkerHomeStat
    rating: WorkerHomeStat
  }
  statusLabel: string
  secondaryOpportunities: WorkerHomeJobCard[]
  todayJob: WorkerHomeJobCard | null
  workerDisplayCode: string
}

type WorkerHomeProductionModelInput = {
  broadcasts: WorkerBroadcast[]
  broadcastsError: string | null
  broadcastsHydrated: boolean
  deal: WorkerV5Runtime['state']['deal']
  earnings: EarningsResponse | null
  earningsError: string | null
  jobs: WorkerJobListResponse['jobs']
  jobsHydrated: boolean
  language: AppLanguage
  performanceInsights: WorkerPerformanceInsightsResponse | null
  profile: WorkerProfileResponse | null
  referenceDate?: Date
}

const SERVICE_LABELS: Record<ServiceType, Record<AppLanguage, string>> = {
  cleaning: { en: 'Home cleaning', vi: 'Vệ sinh nhà ở' },
  electrical: { en: 'Electrical repair', vi: 'Sửa điện' },
  handyman: { en: 'Minor repair and installation', vi: 'Sửa vặt & lắp đặt' },
  hvac: { en: 'Air conditioning service', vi: 'Điều hòa' },
  plumbing: { en: 'Plumbing repair', vi: 'Sửa nước' },
  upholstery: { en: 'Upholstery care', vi: 'Chăm sóc sofa, nệm, rèm' },
}

function serviceLabel(serviceType: ServiceType, language: AppLanguage) {
  return SERVICE_LABELS[serviceType][language]
}

function hcmcDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(value)
}

function validTimestamp(value: string | null | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function activeWorkerBroadcasts(broadcasts: WorkerBroadcast[], referenceDate: Date) {
  const now = referenceDate.getTime()
  return broadcasts
    .filter((broadcast) => {
      const expiresAt = validTimestamp(broadcast.expires_at)
      const quoteExpiresAt = validTimestamp(broadcast.original_scope_price_quote?.expires_at)
      return broadcast.status === 'sent'
        && broadcast.job_id.trim().length > 0
        && broadcast.original_scope_price_quote.quote_id.trim().length > 0
        && expiresAt !== null
        && expiresAt > now
        && quoteExpiresAt !== null
        && quoteExpiresAt > now
    })
    .sort((left, right) => {
      const expiryDifference = (validTimestamp(left.expires_at) ?? 0) - (validTimestamp(right.expires_at) ?? 0)
      if (expiryDifference !== 0) return expiryDifference
      const sentDifference = (validTimestamp(right.sent_at) ?? 0) - (validTimestamp(left.sent_at) ?? 0)
      return sentDifference !== 0 ? sentDifference : left.broadcast_id.localeCompare(right.broadcast_id)
    })
}

function opportunityEarningLabel(broadcast: WorkerBroadcast, language: AppLanguage) {
  const minimum = broadcast.estimated_earning_min
  const maximum = broadcast.estimated_earning_max
  if (minimum === null || maximum === null) return null
  return minimum === maximum
    ? formatVndDong(minimum, language)
    : `${formatVndDong(minimum, language)} – ${formatVndDong(maximum, language)}`
}

function opportunityCard(broadcast: WorkerBroadcast, language: AppLanguage, referenceDate: Date): WorkerHomeJobCard {
  const expiresAt = validTimestamp(broadcast.expires_at)
  const remainingMinutes = expiresAt === null
    ? null
    : Math.max(1, Math.ceil((expiresAt - referenceDate.getTime()) / 60_000))
  return {
    broadcastId: broadcast.broadcast_id,
    earningLabel: opportunityEarningLabel(broadcast, language),
    id: broadcast.job_id,
    location: broadcast.district
      ? formatWorkerDistrict(broadcast.district, language)
      : textByLanguage(language, 'Khu vực đang được bảo vệ', 'Area protected'),
    scheduledLabel: scheduledLabel(broadcast.scheduled_at, language, referenceDate),
    serviceType: broadcast.service_type,
    statusLabel: remainingMinutes === null
      ? textByLanguage(language, 'Cần phản hồi', 'Response needed')
      : textByLanguage(language, `Còn ${remainingMinutes} phút`, `${remainingMinutes} min left`),
    title: broadcast.problem_summary || broadcast.scope_summary || serviceLabel(broadcast.service_type, language),
  }
}

function activeJobCard(
  job: WorkerJobListResponse['jobs'][number],
  language: AppLanguage,
  referenceDate: Date,
): WorkerHomeJobCard {
  return {
    broadcastId: null,
    earningLabel: job.estimated_earning != null ? formatVndDong(job.estimated_earning, language) : null,
    id: job.id,
    location: activeJobLocation(job, language),
    scheduledLabel: scheduledLabel(job.scheduled_at, language, referenceDate),
    serviceType: job.service_type,
    statusLabel: activeStatusLabel(job.status, language),
    title: job.problem_summary || serviceLabel(job.service_type, language),
  }
}

function scheduledLabel(value: string | null | undefined, language: AppLanguage, referenceDate: Date) {
  if (!value) return textByLanguage(language, 'Chưa có lịch', 'Schedule pending')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return textByLanguage(language, 'Chưa có lịch', 'Schedule pending')
  const formatter = new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(referenceDate)
  const jobDayKey = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(date)
  const time = new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
  return todayKey === jobDayKey
    ? textByLanguage(language, `Hôm nay, ${time}`, `Today, ${time}`)
    : formatter.format(date)
}

function activeJobLocation(job: WorkerJobListResponse['jobs'][number], language: AppLanguage) {
  if (!job.address_access.exact_unit_released) {
    return job.district
      ? formatWorkerDistrict(job.district, language)
      : textByLanguage(language, 'Khu vực đang được bảo vệ', 'Area protected')
  }
  const address = [job.address_building, job.address_floor, job.address_unit]
    .flatMap((part) => part?.trim() ? [part.trim()] : [])
    .join(', ')
  return address || (job.district
    ? formatWorkerDistrict(job.district, language)
    : textByLanguage(language, 'Địa chỉ đã được mở', 'Address released'))
}

function activeStatusLabel(status: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      arrived: 'Arrived',
      completed_by_worker: 'Completion submitted',
      confirmed_by_customer: 'Customer confirmed',
      inspecting: 'Inspecting',
      payment_pending: 'Payment pending',
      repairing: 'In progress',
      scope_change_pending: 'Scope approval pending',
      worker_matched: 'Confirmed',
      worker_on_way: 'On the way',
    },
    vi: {
      arrived: 'Đã đến',
      completed_by_worker: 'Đã gửi hoàn tất',
      confirmed_by_customer: 'Khách đã xác nhận',
      inspecting: 'Đang kiểm tra',
      payment_pending: 'Chờ thanh toán',
      repairing: 'Đang làm',
      scope_change_pending: 'Chờ duyệt phạm vi',
      worker_matched: 'Đã xác nhận',
      worker_on_way: 'Đang di chuyển',
    },
  }
  return labels[language][status] ?? textByLanguage(language, 'Đang xử lý', 'In progress')
}

function profileServiceTypes(profile: WorkerProfileResponse) {
  const candidates = [profile.selected_service_types, profile.active_service_types, profile.service_types]
  return candidates.find((serviceTypes) => serviceTypes && serviceTypes.length > 0) ?? []
}

function isWorkerHomeProfileComplete(profile: WorkerProfileResponse) {
  return profile.is_approved
    && profile.verification_status === 'approved'
    && profile.has_cccd
    && profile.has_selfie
    && Boolean(profile.legal_name?.trim())
    && Boolean(profile.date_of_birth)
    && Boolean(profile.bank_account_masked)
    && Boolean(profile.bank_name?.trim())
    && profileServiceTypes(profile).length > 0
    && profile.districts.length > 0
}

function workerHomeProfileStatusLabel(profile: WorkerProfileResponse | null, language: AppLanguage) {
  if (!profile) return textByLanguage(language, 'Chưa có hồ sơ', 'No profile')
  if (profile.is_suspended) return textByLanguage(language, 'Hồ sơ tạm ngưng', 'Profile suspended')
  if (!profile.is_approved || profile.verification_status !== 'approved') {
    return textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')
  }
  return isWorkerHomeProfileComplete(profile)
    ? textByLanguage(language, 'Hồ sơ đầy đủ', 'Profile complete')
    : textByLanguage(language, 'Hồ sơ cần bổ sung', 'Profile needs details')
}

function buildProfilePrompt(profile: WorkerProfileResponse | null, language: AppLanguage): WorkerHomeProfilePrompt {
  if (!profile) {
    return {
      actionLabel: textByLanguage(language, 'Xem hồ sơ', 'View profile'),
      detail: textByLanguage(language, 'Đang đồng bộ trạng thái hồ sơ.', 'Syncing profile status.'),
      kind: 'loading',
      title: textByLanguage(language, 'Đang tải hồ sơ', 'Loading profile'),
    }
  }
  if (profile.is_suspended) {
    return {
      actionLabel: textByLanguage(language, 'Xem trạng thái', 'View status'),
      detail: textByLanguage(language, 'Tài khoản hiện chưa thể nhận công việc mới.', 'This account cannot receive new work right now.'),
      kind: 'blocked',
      title: textByLanguage(language, 'Hồ sơ đang tạm ngưng', 'Profile suspended'),
    }
  }
  if (!profile.is_approved || profile.verification_status !== 'approved') {
    return {
      actionLabel: textByLanguage(language, 'Xem xác minh', 'View verification'),
      detail: workerVerificationLabel(profile.verification_status, language),
      kind: 'incomplete',
      title: textByLanguage(language, 'Hoàn tất xác minh để nhận việc', 'Complete verification to receive work'),
    }
  }
  if (!isWorkerHomeProfileComplete(profile)) {
    return {
      actionLabel: textByLanguage(language, 'Hoàn thiện hồ sơ', 'Complete profile'),
      detail: textByLanguage(
        language,
        'Bổ sung thông tin, giấy tờ, tài khoản nhận tiền, dịch vụ hoặc khu vực còn thiếu.',
        'Add missing information, documents, payout account, services, or service areas.',
      ),
      kind: 'incomplete',
      title: textByLanguage(language, 'Hồ sơ cần bổ sung', 'Profile needs details'),
    }
  }
  return {
    actionLabel: textByLanguage(language, 'Xem hồ sơ', 'View profile'),
    detail: textByLanguage(language, 'Giấy tờ và phạm vi nhận việc đã được ghi nhận.', 'Documents and work coverage are recorded.'),
    kind: 'verified',
    title: textByLanguage(language, 'Hồ sơ đã sẵn sàng', 'Profile ready'),
  }
}

export function buildWorkerHomeProductionModel({
  broadcasts,
  broadcastsError,
  broadcastsHydrated,
  jobs,
  jobsHydrated,
  language,
  performanceInsights,
  profile,
  referenceDate = new Date(),
}: WorkerHomeProductionModelInput): WorkerHomeProductionModel {
  const activeJobs = jobs.filter((job) => isWorkerOperationalJobStatus(job.status))
  const activeJob = activeJobs[0] ?? null
  const opportunities = activeWorkerBroadcasts(broadcasts, referenceDate)
  const opportunityState = broadcastsError
    ? broadcastsHydrated
      ? 'stale' as const
      : 'unavailable' as const
    : !broadcastsHydrated
      ? 'loading' as const
      : opportunities.length > 0
        ? 'available' as const
        : 'empty' as const
  const profileReady = Boolean(profile?.is_approved && !profile.is_suspended && profile.is_available)
  const mode = activeJob
    ? 'execution' as const
    : !profileReady || !jobsHydrated
      ? 'readiness' as const
      : 'market' as const
  const opportunityCards = mode === 'market'
    ? opportunities.slice(0, 2).map((broadcast) => opportunityCard(broadcast, language, referenceDate))
    : []
  const executionJob = activeJob ? activeJobCard(activeJob, language, referenceDate) : null
  const today = hcmcDateKey(referenceDate)
  const todayJobRecord = [...activeJobs]
    .filter((job) => {
      const scheduledAt = validTimestamp(job.scheduled_at)
      return scheduledAt !== null && hcmcDateKey(new Date(scheduledAt)) === today
    })
    .sort((left, right) => {
      const scheduledDifference = (validTimestamp(left.scheduled_at) ?? 0) - (validTimestamp(right.scheduled_at) ?? 0)
      return scheduledDifference !== 0 ? scheduledDifference : left.id.localeCompare(right.id)
    })[0] ?? null
  const todayJob = todayJobRecord ? activeJobCard(todayJobRecord, language, referenceDate) : null

  return {
    displayName: profile?.legal_name?.trim() || textByLanguage(language, 'Anh thợ', 'Worker'),
    executionJob,
    featuredOpportunity: opportunityCards[0] ?? null,
    mode,
    opportunityState,
    profilePrompt: buildProfilePrompt(profile, language),
    stats: {
      activeJobs: {
        label: textByLanguage(language, 'Việc đang làm', 'Active work'),
        value: jobsHydrated ? String(activeJobs.length) : null,
      },
      completedJobs: {
        label: textByLanguage(language, 'Việc hoàn thành', 'Completed jobs'),
        value: performanceInsights ? String(performanceInsights.completed_job_count) : null,
      },
      opportunities: {
        label: textByLanguage(language, 'Cơ hội mới', 'New opportunities'),
        value: broadcastsHydrated ? String(opportunities.length) : null,
      },
      rating: {
        label: textByLanguage(language, 'Đánh giá', 'Rating'),
        value: performanceInsights?.average_rating != null && performanceInsights.review_count > 0
          ? String(performanceInsights.average_rating)
          : null,
      },
    },
    statusLabel: workerHomeProfileStatusLabel(profile, language),
    secondaryOpportunities: opportunityCards.slice(1),
    todayJob,
    workerDisplayCode: profile ? `#${profile.id.slice(-8).toUpperCase()}` : textByLanguage(language, 'Chưa ghi nhận', 'Unavailable'),
  }
}

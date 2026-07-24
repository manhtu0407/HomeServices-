import { HCMC_DISTRICTS, normalizeDistrict, type LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import { formatHcmcScheduledAt } from '@/lib/hcmc-schedule'

import {
  firstNumberFromPriceLabel,
  formatApprovalVnd,
  formatLooseLabel,
  formatVnd,
  formatWorkDurationMinutes,
  parseWorkflowTime,
  textByLanguage,
} from './format'

type WorkerV5ProfileForLabels = {
  districts: readonly string[]
  has_cccd: boolean
  has_selfie: boolean
  is_approved: boolean
  is_available: boolean
  is_suspended: boolean
  legal_name: string | null
  active_service_types?: readonly string[]
  selected_service_types?: readonly string[]
  service_types: readonly string[]
  verification_status: string | null
} | null | undefined

export function workerV5ShiftProfileCoverageLabel(profile: WorkerV5ProfileForLabels, language: AppLanguage) {
  if (!profile) return textByLanguage(language, 'Chưa có hồ sơ thợ', 'No worker profile')
  const serviceCount = (
    profile.active_service_types
    ?? profile.selected_service_types
    ?? profile.service_types
  ).length
  const districtCount = profile.districts.length
  if (serviceCount > 0 && districtCount > 0) {
    return textByLanguage(language, `${serviceCount} dịch vụ · ${districtCount} khu vực`, `${serviceCount} services · ${districtCount} areas`)
  }
  if (serviceCount > 0) return textByLanguage(language, `${serviceCount} dịch vụ đang nhận`, `${serviceCount} active services`)
  if (districtCount > 0) return textByLanguage(language, `${districtCount} khu vực phục vụ`, `${districtCount} service areas`)
  return textByLanguage(language, 'Chưa chọn dịch vụ hoặc khu vực', 'No selected services or areas')
}

export function localizedWorkerBriefLines(lines: readonly string[] | null | undefined, language: AppLanguage) {
  const normalized = (lines ?? []).flatMap((line) => {
    const trimmed = line.trim()
    return trimmed ? [trimmed] : []
  })
  const localized = normalized.filter((line) => {
    const hasVietnameseText = /[\u00C0-\u1EF9]/.test(line)
    if (language === 'en') return !hasVietnameseText
    return hasVietnameseText
  })
  return (localized.length ? localized : normalized).slice(0, 3)
}

export function workerV5HomeDisplayName(profile: WorkerV5ProfileForLabels, language: AppLanguage) {
  const name = profile?.legal_name?.trim().replace(/\s+/g, ' ')
  if (name) return name
  return textByLanguage(language, 'Anh thợ', 'Worker')
}

export function workerV5ChatGreetingName(profile: WorkerV5ProfileForLabels, language: AppLanguage) {
  const name = profile?.legal_name?.trim().replace(/\s+/g, ' ')
  if (name) return name
  return textByLanguage(language, 'bạn', 'there')
}

export function workerV5Initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('')
}

export function workerV5TimeChoiceLabel(value: string | null | undefined, language: AppLanguage, scheduledAt?: string | null) {
  const scheduledLabel = formatHcmcScheduledAt(scheduledAt)
  if (scheduledLabel) return scheduledLabel
  if (value === 'now') return textByLanguage(language, 'Ngay', 'Now')
  if (value === 'scheduled') return textByLanguage(language, 'Đã hẹn', 'Scheduled')
  return textByLanguage(language, 'Chưa có lịch', 'Schedule pending')
}

export function canShowWorkerAddress(deal: LocalDeal) {
  return [
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
    'completed_by_worker',
    'confirmed_by_customer',
    'payment_pending',
    'paid',
    'reviewed',
  ].includes(deal.status)
}

export function getWorkerV5ChatJobId(deal: LocalDeal | null) {
  return deal?.broadcast?.jobId ?? deal?.id ?? null
}

export function routeDestinationLabel(deal: LocalDeal, language: AppLanguage) {
  if (canShowWorkerAddress(deal)) return deal.draft.addressLabel || deal.draft.districtLabel || textByLanguage(language, 'Chưa có địa chỉ', 'No address')
  return deal.broadcast?.generalArea || deal.draft.districtLabel || textByLanguage(language, 'Địa chỉ đang ẩn', 'Address hidden')
}

export function buildKnownCaseEvents(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return [textByLanguage(language, 'Chưa có dòng sự kiện việc', 'No work timeline yet')]
  const events = [
    textByLanguage(language, 'Việc được tạo trong NestScout', 'Work created in NestScout'),
  ]
  if (canShowWorkerAddress(deal)) events.push(textByLanguage(language, 'Thợ đã nhận việc', 'Worker accepted the work'))
  if (['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(deal.status)) {
    events.push(textByLanguage(language, 'Thợ đã đến nơi hoặc bắt đầu kiểm tra', 'Worker checked in or started inspection'))
  }
  if (deal.scopeChange) events.push(textByLanguage(language, 'Có yêu cầu đổi phạm vi', 'Scope-change request exists'))
  if (deal.completionNotes || deal.completionPhotoUrls?.length) events.push(textByLanguage(language, 'Có bằng chứng hoàn tất', 'Completion evidence exists'))
  if (['completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'].includes(deal.status)) events.push(textByLanguage(language, 'Hồ sơ hoàn tất đã gửi', 'Completion artifact submitted'))
  return events
}

export function workerStatusStage(status: LocalDeal['status'] | null | undefined) {
  const total = 5
  let current = 0
  switch (status) {
    case 'broadcasting':
    case 'awaiting_customer_confirm':
    case 'worker_matched':
      current = 1
      break
    case 'worker_on_way':
    case 'arrived':
      current = 2
      break
    case 'inspecting':
    case 'repairing':
      current = 3
      break
    case 'scope_change_pending':
      current = 4
      break
    case 'completed_by_worker':
    case 'confirmed_by_customer':
    case 'payment_pending':
    case 'paid':
    case 'reviewed':
      current = 5
      break
    default:
      current = 0
  }

  return {
    current,
    progress: Math.round((current / total) * 100),
    total,
  }
}

export function formatScopePriceRange(scope: LocalDeal['scopeChange'], language: AppLanguage) {
  if (!scope?.priceMin || !scope?.priceMax) {
    return textByLanguage(language, 'Chờ Kael tính giá', 'Waiting for Kael estimate')
  }
  const min = formatVnd(scope.priceMin, language)
  const max = formatVnd(scope.priceMax, language)
  return `${min} - ${max}`
}

export function scopeChangeDeltaLabel(deal: LocalDeal | null, scope: LocalDeal['scopeChange'], language: AppLanguage) {
  if (!scope) return textByLanguage(language, 'Chưa có phát sinh', 'No delta')
  const originalMin = firstNumberFromPriceLabel(deal?.estimate?.priceRangeLabel)
  if (!originalMin || !scope.priceMin) return formatScopePriceRange(scope, language)
  const delta = Math.max(0, scope.priceMin - originalMin)
  if (delta <= 0) return formatScopePriceRange(scope, language)
  return `+${formatVnd(delta, language)}`
}

export function scopeChangeApprovalAmountLabel(deal: LocalDeal | null, scope: LocalDeal['scopeChange'], language: AppLanguage) {
  if (!scope?.priceMin) return textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
  const originalMin = firstNumberFromPriceLabel(deal?.estimate?.priceRangeLabel)
  const amount = originalMin ? Math.max(0, scope.priceMin - originalMin) : scope.priceMin
  if (amount <= 0) return formatApprovalVnd(scope.priceMin, language)
  return `+${formatApprovalVnd(amount, language)}`
}

export function scopeChangeStatusLabel(status: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      approved_by_customer: 'Approved',
      cancelled: 'Cancelled',
      rejected_by_customer: 'Rejected',
      requested_by_worker: 'Drafted',
      reviewing_by_kael: 'Kael reviewing',
      waiting_customer_decision: 'Approval pending',
    },
    vi: {
      approved_by_customer: 'Đã duyệt',
      cancelled: 'Đã hủy',
      rejected_by_customer: 'Bị từ chối',
      requested_by_worker: 'Đã tạo nháp',
      reviewing_by_kael: 'Kael đang kiểm tra',
      waiting_customer_decision: 'Chờ khách duyệt',
    },
  }
  return labels[language][status] ?? textByLanguage(language, 'Đã ghi nhận', status)
}

export function workerV5ActualWorkDurationLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có', 'None')
  const start = parseWorkflowTime(deal.matchedAt ?? deal.createdAt)
  const end = parseWorkflowTime(deal.completedAt ?? deal.confirmedAt ?? deal.reviewedAt ?? deal.payment?.receivedAt ?? deal.paidAt)
  if (!start || !end || end <= start) return textByLanguage(language, 'Chưa đồng bộ', 'Not synced')
  return formatWorkDurationMinutes(Math.round((end - start) / 60000), language)
}

export function paymentStatusLabel(status: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      paid: 'Paid',
      pending: 'Pending',
      received: 'Received',
      released: 'Released',
    },
    vi: {
      paid: 'Đã thanh toán',
      pending: 'Đang chờ',
      received: 'Đã nhận',
      released: 'Đã giải ngân',
    },
  }
  return labels[language][status] ?? textByLanguage(language, 'Đã ghi nhận', status)
}

export function workerVerificationLabel(status: string | null | undefined, language: AppLanguage) {
  if (!status) return textByLanguage(language, 'Chưa có trạng thái', 'No status')
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      approved: 'Approved',
      draft: 'Draft',
      rejected: 'Rejected',
      submitted: 'Submitted',
      suspended: 'Suspended',
      under_review: 'Under review',
    },
    vi: {
      approved: 'Đã duyệt',
      draft: 'Bản nháp',
      rejected: 'Từ chối',
      submitted: 'Đã gửi',
      suspended: 'Tạm ngưng',
      under_review: 'Đang xét duyệt',
    },
  }
  return labels[language][status] ?? textByLanguage(language, 'Đã ghi nhận', status)
}

export function workerAvailabilityLabel(profile: WorkerV5ProfileForLabels, language: AppLanguage) {
  if (!profile) return textByLanguage(language, 'Chưa có hồ sơ', 'No profile')
  if (profile.is_suspended) return textByLanguage(language, 'Tạm ngưng', 'Suspended')
  if (!profile.is_approved) return textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')
  return profile.is_available
    ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for jobs')
    : textByLanguage(language, 'Đang tắt nhận việc', 'Not accepting jobs')
}

export function workerDocumentSummary(profile: WorkerV5ProfileForLabels, language: AppLanguage) {
  if (!profile) return textByLanguage(language, 'Chưa có hồ sơ', 'No profile')
  if (profile.has_cccd && profile.has_selfie) return textByLanguage(language, 'Đã có giấy tờ bắt buộc', 'Required documents provided')
  if (profile.has_cccd || profile.has_selfie) return textByLanguage(language, 'Còn thiếu một phần', 'Partially provided')
  return textByLanguage(language, 'Chưa có giấy tờ', 'No documents yet')
}

export function documentBooleanLabel(value: boolean | null | undefined, language: AppLanguage) {
  if (value === true) return textByLanguage(language, 'Đã có', 'Provided')
  if (value === false) return textByLanguage(language, 'Còn thiếu', 'Missing')
  return textByLanguage(language, 'Chưa có hồ sơ', 'No profile')
}

export function formatWorkerDistrict(value: string, language: AppLanguage) {
  const trimmed = value.trim()
  const normalized = formatLooseLabel(trimmed).toLowerCase()
  const districtMatch = normalized.match(/^(?:quan|q)\s*(\d+)$/i)
  if (districtMatch) return language === 'vi' ? `Quận ${districtMatch[1]}` : `District ${districtMatch[1]}`
  const namedDistricts: Record<string, { en: string; vi: string }> = {
    'binh chanh': { en: 'Binh Chanh', vi: 'Bình Chánh' },
    'binh tan': { en: 'Binh Tan', vi: 'Bình Tân' },
    'binh thanh': { en: 'Binh Thanh', vi: 'Bình Thạnh' },
    'can gio': { en: 'Can Gio', vi: 'Cần Giờ' },
    'cu chi': { en: 'Cu Chi', vi: 'Củ Chi' },
    'go vap': { en: 'Go Vap', vi: 'Gò Vấp' },
    'hoc mon': { en: 'Hoc Mon', vi: 'Hóc Môn' },
    'nha be': { en: 'Nha Be', vi: 'Nhà Bè' },
    'phu nhuan': { en: 'Phu Nhuan', vi: 'Phú Nhuận' },
    'tan binh': { en: 'Tan Binh', vi: 'Tân Bình' },
    'tan phu': { en: 'Tan Phu', vi: 'Tân Phú' },
    'thu duc': { en: 'Thu Duc', vi: 'Thủ Đức' },
  }
  const namedDistrict = namedDistricts[normalized]
  if (namedDistrict) return namedDistrict[language]
  return formatLooseLabel(trimmed)
}

export function normalizeWorkerV5DistrictSelectionList(values: string[]) {
  const districts: string[] = []
  const seenDistricts = new Set<string>()
  for (const value of values) {
    const district = normalizeWorkerV5DistrictSelection(value)
    if (district && !seenDistricts.has(district)) {
      seenDistricts.add(district)
      districts.push(district)
    }
  }
  return districts
}

export function normalizeWorkerV5DistrictSelection(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const canonical = normalizeDistrict(trimmed)
  const lower = trimmed.toLowerCase()
  if (
    canonical !== 'hcmc_all' ||
    lower === 'hcmc_all' ||
    lower === HCMC_DISTRICTS.hcmc_all.toLowerCase()
  ) {
    return canonical
  }
  const looseCanonical = normalizeDistrict(formatLooseLabel(trimmed))
  return looseCanonical === 'hcmc_all' ? null : looseCanonical
}

export function workerV5DistrictDraftFromSelection(values: string[], language: AppLanguage) {
  return values.map((district) => formatWorkerDistrict(district, language)).join(', ')
}

export function parseWorkerV5ServiceAreaDraft(value: string, _language: AppLanguage) {
  const districts: string[] = []
  const seenDistricts = new Set<string>()
  const invalid: string[] = []
  const labels: string[] = []
  const entries = value
    .split(',')
    .flatMap((entry) => {
      const label = formatLooseLabel(entry)
      return label ? [label] : []
    })
  for (const entry of entries) {
    const district = normalizeWorkerV5DistrictSelection(entry)
    if (!district) {
      invalid.push(entry)
      labels.push(entry)
      continue
    }
    labels.push(entry)
    if (!seenDistricts.has(district)) {
      seenDistricts.add(district)
      districts.push(district)
    }
  }
  return { districts, invalid, labels }
}

export function normalizeServiceAreaDraftText(value: string) {
  return value
    .split(',')
    .flatMap((entry) => {
      const label = formatLooseLabel(entry).toLowerCase()
      return label ? [label] : []
    })
    .join('|')
}

export function workerPerformanceAxisLabel(id: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      arrival: 'Arrival reliability',
      completion: 'Completion quality',
      earnings: 'Settled earnings',
      rating: 'Customer feedback',
      response: 'Response discipline',
      work_response: 'In-work communication',
      incident_handling: 'Transparent incident handling',
    },
    vi: {
      arrival: 'Đúng hẹn',
      completion: 'Chất lượng hoàn tất',
      earnings: 'Thu nhập đã đối soát',
      rating: 'Phản hồi khách',
      response: 'Kỷ luật phản hồi',
      work_response: 'Phản hồi trong công việc',
      incident_handling: 'Xử lý phát sinh minh bạch',
    },
  }
  return labels[language][id] ?? formatLooseLabel(id)
}

export function workerPerformanceAxisShortLabel(id: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      arrival: 'Arrival',
      completion: 'Quality',
      earnings: 'Earnings',
      rating: 'Rating',
      response: 'Response',
      work_response: 'Communication',
      incident_handling: 'Incidents',
    },
    vi: {
      arrival: 'Đúng hẹn',
      completion: 'Chất lượng',
      earnings: 'Thu nhập',
      rating: 'Đánh giá',
      response: 'Phản hồi',
      work_response: 'Trao đổi',
      incident_handling: 'Phát sinh',
    },
  }
  return labels[language][id] ?? formatLooseLabel(id)
}

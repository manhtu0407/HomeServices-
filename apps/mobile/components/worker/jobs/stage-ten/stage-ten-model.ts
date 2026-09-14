import type { AppLanguage } from '@/lib/app-language'

import type { StageTenDateParts, StageTenLedgerEntry, StageTenModel, StageTenModelInput } from './stage-ten.types'

const clean = (value: string | null | undefined) => value?.trim() || null
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const dateValue = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}
const closedStatuses = new Set(['confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])
const goodRating = (value: unknown): value is number => finite(value) && value > 0 && value <= 5
const nonNegativeInteger = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0

export const text10 = (language: AppLanguage, vi: string, en: string) => language === 'en' ? en : vi

export function stageTenServiceName(service: StageTenModelInput['serviceType'], language: AppLanguage = 'vi') {
  const names: Record<string, readonly [string, string]> = {
    cleaning: ['Vệ sinh căn hộ', 'Home cleaning'],
    electrical: ['Sửa điện', 'Electrical repair'],
    handyman: ['Sửa vặt & lắp đặt', 'Repairs & installation'],
    hvac: ['Vệ sinh máy lạnh', 'Air conditioning'],
    plumbing: ['Sửa nước', 'Plumbing'],
    upholstery: ['Vệ sinh sofa', 'Sofa cleaning'],
  }

  return names[service ?? '']?.[language === 'vi' ? 0 : 1] ?? text10(language, 'Công việc', 'Job')
}

function recordedAtValue(entry: StageTenLedgerEntry) {
  return dateValue(entry.recorded_at)
}

/** Read-only projection of server-owned completion and settlement records. */
export function buildStageTenModel(input: StageTenModelInput = {}, language: AppLanguage = 'vi'): StageTenModel {
  const jobId = clean(input.jobId)
  const state = !jobId
    ? 'missing'
    : closedStatuses.has(input.status ?? '')
      ? 'closed'
      : input.status === 'completed_by_worker'
        ? 'awaiting-confirmation'
        : 'in-progress'

  const severity: Record<string, number> = { available: 1, pending: 2, on_hold: 3, reversed: 4 }
  const credit = jobId
    ? (input.ledger ?? [])
      .filter((entry) => entry.job_id === jobId && entry.entry_type === 'worker_credit')
      .slice()
      .sort((left, right) => recordedAtValue(right) - recordedAtValue(left)
        || (severity[right.payment_state ?? ''] ?? 0) - (severity[left.payment_state ?? ''] ?? 0))[0]
    : undefined

  const incomeState = credit?.settlement_state === 'admin_rejected' || credit?.payment_state === 'reversed'
    ? 'reversed'
    : credit?.payment_state === 'on_hold'
      ? 'held'
      : credit?.payment_state === 'available'
        ? 'available'
        : credit
          ? 'pending'
          : 'missing'
  const workerNet = credit?.worker_net
  const hasNet = state === 'closed'
    && incomeState === 'available'
    && finite(workerNet)
    && Number.isSafeInteger(workerNet)
    && workerNet >= 0
  const averageRating = goodRating(input.averageRating) ? input.averageRating : null
  const reviewCount = nonNegativeInteger(input.reviewCount) ? input.reviewCount : 0
  const amount = hasNet && finite(workerNet) ? workerNet : null

  return {
    jobId,
    state,
    job: {
      completedAt: dateValue(input.completedAt) ? input.completedAt ?? null : null,
      district: clean(input.district),
      photoRef: clean(input.photoRef),
      title: stageTenServiceName(input.serviceType, language),
    },
    income: {
      amount,
      state: incomeState,
    },
    rating: {
      kind: averageRating !== null ? 'average' : 'missing',
      reviewCount,
      value: averageRating,
    },
    ranking: {
      performanceScore: finite(input.performanceScore) && input.performanceScore >= 0 && input.performanceScore <= 100
        ? input.performanceScore
        : null,
    },
  }
}

export function money10(amount: number | null, language: AppLanguage = 'vi') {
  return amount === null || !finite(amount) || amount < 0
    ? text10(language, 'Chưa ghi nhận', 'Not recorded')
    : `${new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 0 }).format(amount)}đ`
}

const narrowGlyphs = new Set(['.', ',', ' '])

/**
 * Largest size, up to `preferred`, at which `text` fits `available` on one line. Glyph advances
 * are a deliberately wide estimate for bold system numerals, and the system text scale is applied
 * on top of the returned size, so it is divided out here. The result never goes below `min`: an
 * amount that still does not fit wraps instead of being truncated.
 */
export function fitStageTenValueSize(text: string, available: number, preferred: number, min: number, fontScale = 1) {
  if (!(available > 0)) return preferred
  const ems = Array.from(text).reduce((sum, glyph) => sum + (narrowGlyphs.has(glyph) ? 0.3 : 0.64), 0)
  const fitted = Math.floor(available / (ems * Math.max(1, fontScale)))
  return Math.max(min, Math.min(preferred, fitted))
}

export function date10(iso: string | null, language: AppLanguage): StageTenDateParts {
  if (!iso || !dateValue(iso)) return { time: text10(language, 'Chưa có thời gian', 'Time unavailable'), date: '' }

  const date = new Date(iso)
  const hcmc = { timeZone: 'Asia/Ho_Chi_Minh' } as const
  const time = new Intl.DateTimeFormat('en-GB', {
    ...hcmc,
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
  }).format(date)
  const parts = new Intl.DateTimeFormat('en-GB', {
    ...hcmc,
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
    year: 'numeric',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const viWeek: Record<string, string> = {
    Fri: 'Thứ 6',
    Mon: 'Thứ 2',
    Sat: 'Thứ 7',
    Sun: 'Chủ nhật',
    Thu: 'Thứ 5',
    Tue: 'Thứ 3',
    Wed: 'Thứ 4',
  }
  const formattedDate = language === 'vi'
    ? `${viWeek[get('weekday')] ?? get('weekday')}, ${get('day')} Tháng ${Number(get('month'))}, ${get('year')}`
    : new Intl.DateTimeFormat('en-GB', { ...hcmc, day: 'numeric', month: 'short', weekday: 'short', year: 'numeric' }).format(date)

  return { time, date: formattedDate }
}

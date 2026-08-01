import type { AppLanguage } from '@/lib/app-language'

const WHOLE_NUMBER_FORMATTER_BY_LANGUAGE: Record<AppLanguage, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }),
}
const SCOPE_EVENT_FORMATTER_BY_LANGUAGE: Record<AppLanguage, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit' }),
  vi: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit' }),
}

export function formatApprovalVnd(value: number, language: AppLanguage) {
  const formatted = WHOLE_NUMBER_FORMATTER_BY_LANGUAGE[language].format(value)
  return textByLanguage(language, `${formatted}đ`, `${formatted} VND`)
}

export function formatScopeEventTime(value: string | null | undefined, language: AppLanguage) {
  if (!value) return textByLanguage(language, 'Chưa có mốc', 'No timestamp')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return textByLanguage(language, 'Chưa có mốc', 'No timestamp')
  return SCOPE_EVENT_FORMATTER_BY_LANGUAGE[language].format(parsed)
}

export function formatScopeWaitElapsed(value: string | null | undefined, language: AppLanguage) {
  if (!value) return textByLanguage(language, 'Chờ', 'Wait')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return textByLanguage(language, 'Chờ', 'Wait')
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000))
  const hours = Math.floor(elapsedMinutes / 60)
  const minutes = elapsedMinutes % 60
  if (hours < 24) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (days < 7) return textByLanguage(language, `${days} ngày ${remainingHours}g`, `${days}d ${remainingHours}h`)
  return textByLanguage(language, `${days} ngày`, `${days}d`)
}

export function firstNumberFromPriceLabel(value: string | null | undefined) {
  const match = value?.replace(/\./g, '').match(/\d+/)
  return match ? Number.parseInt(match[0], 10) : null
}

export function parseWorkflowTime(value: string | null | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function formatWorkDurationMinutes(totalMinutes: number, language: AppLanguage) {
  if (totalMinutes <= 0) return textByLanguage(language, 'Chưa đồng bộ', 'Not synced')
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return textByLanguage(language, `${minutes} phút`, `${minutes} min`)
  if (!minutes) return textByLanguage(language, `${hours} giờ`, `${hours}h`)
  return textByLanguage(language, `${hours} giờ ${minutes} phút`, `${hours}h ${minutes}m`)
}

export function formatLooseLabel(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function formatNullablePercent(value: number | null | undefined, language: AppLanguage) {
  return value != null
    ? `${value}%`
    : textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')
}

export function formatNullableRating(value: number | null | undefined, language: AppLanguage) {
  return value != null && value > 0
    ? `${value}/5`
    : textByLanguage(language, 'Chưa có đánh giá', 'No rating')
}

export function formatCountOrEmpty(value: number | null | undefined, emptyLabel: string) {
  return value && value > 0 ? `${value}` : emptyLabel
}

export function formatDateRange(from: string | null | undefined, to: string | null | undefined, language: AppLanguage) {
  if (!from && !to) return textByLanguage(language, 'Chưa có kỳ đối soát', 'No settlement period')
  if (from && to) return `${from} - ${to}`
  return from ?? to ?? textByLanguage(language, 'Chưa có kỳ đối soát', 'No settlement period')
}

export function formatVnd(value: number, language: AppLanguage) {
  return `${WHOLE_NUMBER_FORMATTER_BY_LANGUAGE[language].format(value)} VND`
}

export function formatVndDong(value: number, language: AppLanguage) {
  return `${WHOLE_NUMBER_FORMATTER_BY_LANGUAGE[language].format(value)}đ`
}

export function textByLanguage(language: AppLanguage, vi: string, en: string) {
  return language === 'vi' ? vi : en
}

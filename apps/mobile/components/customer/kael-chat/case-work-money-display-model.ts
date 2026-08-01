import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal, LocalScopeChange } from '@nestscout/shared'

const NUMBER_FORMATTER_BY_LANGUAGE: Record<AppLanguage, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-US'),
  vi: new Intl.NumberFormat('vi-VN'),
}
const SHORT_CLOCK_FORMATTER_BY_LANGUAGE: Record<AppLanguage, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, minute: '2-digit' }),
  vi: new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', hour12: false, minute: '2-digit' }),
}

export function formatNumber(value: number, language: AppLanguage) {
  return NUMBER_FORMATTER_BY_LANGUAGE[language].format(value)
}

export function formatVnd(value: number, language: AppLanguage) {
  return `${formatNumber(value, language)}đ`
}

export function isPaymentProtectedStatus(status: NonNullable<LocalDeal['payment']>['status']) {
  return status === 'received' || status === 'cash_confirmed' || status === 'reconciled'
}

export function isDealPaymentProtected(deal: LocalDeal) {
  return Boolean(
    deal.payment &&
    (deal.status === 'paid' || deal.status === 'reviewed') &&
    isPaymentProtectedStatus(deal.payment.status),
  )
}

export function paymentLedgerConfirmationStep(protectedPayment: boolean, language: AppLanguage) {
  return {
    state: protectedPayment ? 'done' as const : 'pending' as const,
    title: protectedPayment
      ? (language === 'vi' ? 'Đã thanh toán' : 'Paid')
      : (language === 'vi' ? 'Lệnh thanh toán' : 'Payment order'),
  }
}

export function formatShortClockTime(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return SHORT_CLOCK_FORMATTER_BY_LANGUAGE[language].format(date)
}

export function scopeChangeAmountLabel(scopeChange: NonNullable<LocalDeal['scopeChange']>, language: AppLanguage) {
  const min = validReviewedPrice(scopeChange.priceMin)
  const max = validReviewedPrice(scopeChange.priceMax)
  if (min !== null && max !== null && min !== max) return `${formatVnd(min, language)} - ${formatVnd(max, language)}`
  const amount = max ?? min
  if (amount === null) return language === 'vi' ? 'Kael đang xét' : 'Kael review pending'
  return `+${formatVnd(amount, language)}`
}

export function scopeChangeApproveLabel(scopeChange: NonNullable<LocalDeal['scopeChange']>, language: AppLanguage) {
  const amount = validReviewedPrice(scopeChange.priceMax) ?? validReviewedPrice(scopeChange.priceMin)
  if (amount === null) return language === 'vi' ? 'Duyệt' : 'Approve'
  return language === 'vi' ? `Duyệt +${formatVnd(amount, language)}` : `Approve +${formatVnd(amount, language)}`
}

export function approvalConfidenceLabel(scopeChange: NonNullable<LocalDeal['scopeChange']>, deal: LocalDeal | null, language: AppLanguage) {
  const kaelReview = scopeChange.kaelReview && typeof scopeChange.kaelReview === 'object'
    ? scopeChange.kaelReview as Record<string, unknown>
    : null
  const verdict = stringFromCaseWorkUnknown(kaelReview?.verdict) ?? stringFromCaseWorkUnknown(kaelReview?.label)
  const confidence = stringFromCaseWorkUnknown(kaelReview?.confidence_label)
    ?? (typeof kaelReview?.confidence === 'number' ? `${Math.round(kaelReview.confidence * 100)}%` : null)
    ?? deal?.estimate?.confidenceLabel
  if (verdict && confidence) return `${verdict} · ${confidence}`
  if (confidence) return language === 'vi' ? `Hợp lý · ${confidence}` : `Reasonable · ${confidence}`
  return language === 'vi' ? 'Chưa có' : 'Pending'
}

export function isPendingCustomerScopeChange(scopeChange: LocalScopeChange) {
  return ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(scopeChange.status)
}

export function canCustomerDecideScopeChange(scopeChange: LocalScopeChange) {
  if (scopeChange.status !== 'waiting_customer_decision') return false
  const min = validReviewedPrice(scopeChange.priceMin)
  const max = validReviewedPrice(scopeChange.priceMax)
  return min !== null && max !== null && max >= min
}

function validReviewedPrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function stringFromCaseWorkUnknown(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

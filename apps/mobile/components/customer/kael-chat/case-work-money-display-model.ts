import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal, LocalScopeChange } from '@nestscout/shared'

export { isDealPaymentProtected, isPaymentProtectedStatus } from '@/lib/frontend-workflow/payment-proof'

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
  return isFullScopeTotal(scopeChange)
    ? formatVnd(amount, language)
    : `+${formatVnd(amount, language)}`
}

export function scopeChangeApproveLabel(scopeChange: NonNullable<LocalDeal['scopeChange']>, language: AppLanguage) {
  const amount = validReviewedPrice(scopeChange.priceMax) ?? validReviewedPrice(scopeChange.priceMin)
  if (amount === null) return language === 'vi' ? 'Duyệt' : 'Approve'
  if (isFullScopeTotal(scopeChange)) {
    return language === 'vi'
      ? `Xác nhận tổng ${formatVnd(amount, language)}`
      : `Confirm total ${formatVnd(amount, language)}`
  }
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
  if (min === null || max === null || max < min) return false
  const review = scopeChange.kaelReview
  if (!review || typeof review !== 'object') return false
  const referenceMin = validReviewedPrice(numberFromCaseWorkUnknown(review.reference_price_min))
  const referenceMax = validReviewedPrice(numberFromCaseWorkUnknown(review.reference_price_max))
  const baselineEvidence = customerBaselineEvidenceFromReview(review)
  const pricingComponents = customerPricingComponentsFromReview(review)
  const balance = recordFromCaseWorkUnknown(review.stakeholder_balance)
  const confirmation = recordFromCaseWorkUnknown(review.worker_price_confirmation)
  const customerTotal = validReviewedPrice(numberFromCaseWorkUnknown(balance?.customer_total))
  const platformFee = numberFromCaseWorkUnknown(balance?.platform_fee)
  const workerNet = validReviewedPrice(numberFromCaseWorkUnknown(balance?.worker_net))
  const commissionRateBps = numberFromCaseWorkUnknown(balance?.commission_rate_bps)
  return review.price_source === 'verified_baseline' &&
    typeof review.baseline_used === 'string' && review.baseline_used.trim().length > 0 &&
    typeof review.baseline_source === 'string' && review.baseline_source.trim().length > 0 &&
    review.pricing_mode === 'full_scope_total' &&
    review.selection_rule === 'verified_neutral_midpoint_with_bilateral_confirmation' &&
    referenceMin !== null && referenceMax !== null && referenceMax >= referenceMin &&
    baselineEvidence !== null && (
      pricingComponents !== null
        ? pricingComponents.reduce((sum, item) => sum + item.priceMin, 0) === referenceMin &&
          pricingComponents.reduce((sum, item) => sum + item.priceMax, 0) === referenceMax &&
          pricingComponents.reduce((sum, item) => sum + item.selectedPrice, 0) === max &&
          pricingComponents.some((item) =>
            item.kind === 'approved_scope_change' &&
            JSON.stringify(item.evidenceReceipt) === JSON.stringify(baselineEvidence)
          )
        : baselineEvidence.aggregatePriceMin === referenceMin &&
          baselineEvidence.aggregatePriceMax === referenceMax
    ) &&
    min === max && min >= referenceMin && max <= referenceMax &&
    customerTotal === max && platformFee !== null && platformFee >= 0 &&
    workerNet !== null && platformFee + workerNet === customerTotal &&
    commissionRateBps !== null && commissionRateBps >= 0 && commissionRateBps <= 1500 &&
    balance?.worker_confirmation_required === true &&
    balance?.customer_confirmation_required === true &&
    confirmation?.confirmed === true &&
    typeof confirmation.quote_id === 'string' && confirmation.quote_id.trim().length > 0 &&
    typeof confirmation.confirmed_at === 'string' && !Number.isNaN(Date.parse(confirmation.confirmed_at))
}

export type CustomerBaselineEvidence = {
  acceptedSourceCount: number
  aggregatePriceMin: number
  aggregatePriceMax: number
  requiredQuorum: number
  unit: 'per_visit' | 'per_cabinet_door' | 'per_repair_point' | 'per_item'
  sources: {
    domain: string
    observedAt: string
    priceMin: number
    priceMax: number
    effectiveTier: 1 | 2
  }[]
}

export function customerBaselineEvidenceFromReview(
  review: Record<string, unknown> | null | undefined,
): CustomerBaselineEvidence | null {
  const evidence = recordFromCaseWorkUnknown(review?.baseline_evidence)
  if (evidence?.schema_version !== 'baseline_price_evidence_receipt.v1' ||
    evidence.quorum_met !== true) return null
  const acceptedSourceCount = nonNegativeInteger(evidence.accepted_source_count)
  const highTrustSourceCount = nonNegativeInteger(evidence.high_trust_source_count)
  const requiredQuorum = nonNegativeInteger(evidence.required_quorum)
  const aggregatePriceMin = validReviewedPrice(numberFromCaseWorkUnknown(evidence.aggregate_price_min))
  const aggregatePriceMax = validReviewedPrice(numberFromCaseWorkUnknown(evidence.aggregate_price_max))
  const unit = evidence.unit
  if (acceptedSourceCount === null || highTrustSourceCount === null ||
    requiredQuorum === null || requiredQuorum < 2 ||
    highTrustSourceCount < requiredQuorum ||
    aggregatePriceMin === null || aggregatePriceMax === null ||
    aggregatePriceMax < aggregatePriceMin ||
    (unit !== 'per_visit' && unit !== 'per_cabinet_door' &&
      unit !== 'per_repair_point' && unit !== 'per_item') ||
    !Array.isArray(evidence.sources) || evidence.sources.length !== acceptedSourceCount) {
    return null
  }
  const sources = evidence.sources.map(customerBaselineSourceFromUnknown)
  if (sources.some((source) => source === null)) return null
  const validSources = sources as CustomerBaselineEvidence['sources']
  if (new Set(validSources.map((source) => source.domain)).size !== validSources.length) return null
  return {
    acceptedSourceCount,
    aggregatePriceMin,
    aggregatePriceMax,
    requiredQuorum,
    unit,
    sources: validSources,
  }
}

export type CustomerPricingComponent = {
  evidenceReceipt: CustomerBaselineEvidence
  kind: 'approved_scope_change' | 'original_confirmed_scope'
  priceMax: number
  priceMin: number
  selectedPrice: number
}

export function customerPricingComponentsFromReview(
  review: Record<string, unknown> | null | undefined,
): CustomerPricingComponent[] | null {
  if (!Array.isArray(review?.pricing_components) || review.pricing_components.length !== 2) return null
  const components = review.pricing_components.map((value) => {
    const item = recordFromCaseWorkUnknown(value)
    const evidenceReceipt = customerBaselineEvidenceFromReview({
      baseline_evidence: item?.evidence_receipt,
    })
    const priceMin = validReviewedPrice(numberFromCaseWorkUnknown(item?.price_min))
    const priceMax = validReviewedPrice(numberFromCaseWorkUnknown(item?.price_max))
    const selectedPrice = validReviewedPrice(numberFromCaseWorkUnknown(item?.selected_price))
    const kind = item?.kind
    if (!evidenceReceipt || priceMin === null || priceMax === null || selectedPrice === null ||
      priceMax < priceMin || selectedPrice < priceMin || selectedPrice > priceMax ||
      evidenceReceipt.aggregatePriceMin !== priceMin ||
      evidenceReceipt.aggregatePriceMax !== priceMax ||
      (kind !== 'approved_scope_change' && kind !== 'original_confirmed_scope')) return null
    return { evidenceReceipt, kind, priceMax, priceMin, selectedPrice }
  })
  if (components.some((item) => item === null)) return null
  const validComponents = components as CustomerPricingComponent[]
  if (new Set(validComponents.map((item) => item.kind)).size !== 2) return null
  return validComponents
}

function customerBaselineSourceFromUnknown(value: unknown) {
  const source = recordFromCaseWorkUnknown(value)
  const priceMin = validReviewedPrice(numberFromCaseWorkUnknown(source?.price_min))
  const priceMax = validReviewedPrice(numberFromCaseWorkUnknown(source?.price_max))
  const effectiveTier = source?.effective_tier
  if (!source || typeof source.domain !== 'string' || source.domain.trim().length === 0 ||
    typeof source.observed_at !== 'string' || Number.isNaN(Date.parse(source.observed_at)) ||
    priceMin === null || priceMax === null || priceMax < priceMin ||
    (effectiveTier !== 1 && effectiveTier !== 2)) return null
  return {
    domain: source.domain.trim(),
    observedAt: source.observed_at,
    priceMin,
    priceMax,
    effectiveTier,
  }
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function validReviewedPrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function isFullScopeTotal(scopeChange: LocalScopeChange) {
  return scopeChange.kaelReview?.pricing_mode === 'full_scope_total'
}

function numberFromCaseWorkUnknown(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function recordFromCaseWorkUnknown(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringFromCaseWorkUnknown(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

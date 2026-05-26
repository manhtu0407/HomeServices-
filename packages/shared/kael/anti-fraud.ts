type Complexity = 'small' | 'medium' | 'large'

export const DEFAULT_SUSPICIOUS_SCOPE_KEYWORDS = [
  'phải thay hết',
  'đường ống chính',
  'thiết bị đặc biệt',
  'phải đào tường',
  'phải tháo nguyên hệ',
  'vấn đề lớn hơn dự kiến',
] as const

export type ScopeChangeAnomalyInput = {
  originalPriceMax: number | null
  newPriceMax: number
  hasPhotos: boolean
  description: string
  reason: string
  workerScopeChangeRate: number
  suspiciousKeywords?: readonly string[]
}

export type ScopeChangeAnomalyResult = {
  driftRatio: number
  score: number
  challengeRequired: boolean
  adminFlagRequired: boolean
  matchedKeywords: string[]
  reasons: string[]
}

export type ScopeChangeMarginConfig = {
  complexityHours: Record<Complexity, number>
  hcmcHourlyRateVnd: number
  baseMultiplier: number
}

export function matchSuspiciousScopeKeywords(
  text: string,
  keywords: readonly string[] = DEFAULT_SUSPICIOUS_SCOPE_KEYWORDS,
): string[] {
  const normalized = normalizeText(text)
  return keywords.filter((keyword) => normalized.includes(normalizeText(keyword)))
}

export function calculateScopeChangeAnomaly(
  input: ScopeChangeAnomalyInput,
): ScopeChangeAnomalyResult {
  const originalMax = input.originalPriceMax && input.originalPriceMax > 0
    ? input.originalPriceMax
    : input.newPriceMax
  const driftRatio = Number((input.newPriceMax / originalMax).toFixed(2))
  const matchedKeywords = matchSuspiciousScopeKeywords(
    `${input.description} ${input.reason}`,
    input.suspiciousKeywords,
  )
  const reasons: string[] = []
  let score = 0

  if (driftRatio > 1.5) {
    score += 0.3
    reasons.push('drift_ratio_gt_1_5')
  }
  if (driftRatio > 3) {
    score += 0.2
    reasons.push('drift_ratio_gt_3_0')
  }
  if (!input.hasPhotos && driftRatio > 2) {
    score += 0.2
    reasons.push('missing_photo_high_drift')
  }
  if (matchedKeywords.length > 0) {
    score += 0.15
    reasons.push('suspicious_keyword_match')
  }
  if (input.workerScopeChangeRate > 0.3) {
    score += 0.15
    reasons.push('worker_scope_change_rate_gt_30_percent')
  }

  const roundedScore = Number(Math.min(1, score).toFixed(2))
  return {
    driftRatio,
    score: roundedScore,
    challengeRequired: roundedScore >= 0.5,
    adminFlagRequired: roundedScore >= 0.8,
    matchedKeywords,
    reasons,
  }
}

export function calculateScopeChangeMargin(input: {
  newComplexity: Complexity
  newPriceMax: number
  config: ScopeChangeMarginConfig
}): {
  fairPriceMax: number
  assessment: 'reasonable' | 'high_increase' | 'requires_attention'
  adminAlert: boolean
} {
  const hours = input.config.complexityHours[input.newComplexity]
  const fairPriceMax = Math.round(
    hours * input.config.hcmcHourlyRateVnd * input.config.baseMultiplier,
  )
  if (input.newPriceMax > fairPriceMax * 2) {
    return {
      fairPriceMax,
      assessment: 'requires_attention',
      adminAlert: true,
    }
  }
  if (input.newPriceMax > fairPriceMax * 1.5) {
    return {
      fairPriceMax,
      assessment: 'high_increase',
      adminAlert: false,
    }
  }
  return {
    fairPriceMax,
    assessment: 'reasonable',
    adminAlert: false,
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
}

import type { ComplexityLevel } from "./types.ts";

export const DEFAULT_SUSPICIOUS_SCOPE_KEYWORDS = [
  "phải thay hết",
  "đường ống chính",
  "thiết bị đặc biệt",
  "phải đào tường",
  "phải tháo nguyên hệ",
  "vấn đề lớn hơn dự kiến",
] as const;

export type ScopeChangeAnomalyInput = {
  originalPriceMax: number | null;
  newPriceMax: number;
  hasPhotos: boolean;
  description: string;
  reason: string;
  workerScopeChangeRate: number;
  suspiciousKeywords?: readonly string[];
};

export type ScopeChangeRiskConfig = {
  complexityHours: Record<ComplexityLevel, number>;
  hcmcHourlyRateVnd: number;
  baseMultiplier: number;
};

export function matchSuspiciousScopeKeywords(
  text: string,
  keywords: readonly string[] = DEFAULT_SUSPICIOUS_SCOPE_KEYWORDS,
): string[] {
  const normalized = normalizeText(text);
  const matched: string[] = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword || seen.has(normalizedKeyword)) continue;
    seen.add(normalizedKeyword);
    if (normalized.includes(normalizedKeyword)) matched.push(keyword.trim());
  }
  return matched;
}

export function calculateScopeChangeAnomaly(input: ScopeChangeAnomalyInput) {
  const matchedKeywords = matchSuspiciousScopeKeywords(
    `${input.description} ${input.reason}`,
    input.suspiciousKeywords,
  );
  if (
    !isFinitePositive(input.newPriceMax) ||
    (input.originalPriceMax !== null && (
      !Number.isFinite(input.originalPriceMax) || input.originalPriceMax < 0
    )) ||
    !Number.isFinite(input.workerScopeChangeRate) ||
    input.workerScopeChangeRate < 0 ||
    input.workerScopeChangeRate > 1
  ) {
    return {
      driftRatio: 1,
      score: 1,
      challengeRequired: true,
      adminFlagRequired: true,
      matchedKeywords,
      reasons: ["invalid_scope_change_risk_input"],
    };
  }

  const originalMax = input.originalPriceMax && input.originalPriceMax > 0
    ? input.originalPriceMax
    : input.newPriceMax;
  const rawDriftRatio = input.newPriceMax / originalMax;
  if (!Number.isFinite(rawDriftRatio)) {
    return {
      driftRatio: 1,
      score: 1,
      challengeRequired: true,
      adminFlagRequired: true,
      matchedKeywords,
      reasons: ["invalid_scope_change_risk_input"],
    };
  }
  const driftRatio = Number(rawDriftRatio.toFixed(2));
  const reasons: string[] = [];
  let score = 0;

  if (driftRatio > 1.5) {
    score += 0.3;
    reasons.push("drift_ratio_gt_1_5");
  }
  if (driftRatio > 3) {
    score += 0.2;
    reasons.push("drift_ratio_gt_3_0");
  }
  if (!input.hasPhotos && driftRatio > 2) {
    score += 0.2;
    reasons.push("missing_photo_high_drift");
  }
  if (matchedKeywords.length > 0) {
    score += 0.15;
    reasons.push("suspicious_keyword_match");
  }
  if (input.workerScopeChangeRate > 0.3) {
    score += 0.15;
    reasons.push("worker_scope_change_rate_gt_30_percent");
  }

  const roundedScore = Number(Math.min(1, score).toFixed(2));
  return {
    driftRatio,
    score: roundedScore,
    challengeRequired: roundedScore >= 0.5,
    adminFlagRequired: roundedScore >= 0.8,
    matchedKeywords,
    reasons,
  };
}

export function calculateScopeChangeMargin(input: {
  newComplexity: ComplexityLevel;
  newPriceMax: number;
  config: ScopeChangeRiskConfig;
}) {
  const hours = input.config.complexityHours[input.newComplexity];
  if (
    !isFinitePositive(input.newPriceMax) ||
    !isFinitePositive(hours) ||
    !isFinitePositive(input.config.hcmcHourlyRateVnd) ||
    !isFinitePositive(input.config.baseMultiplier)
  ) {
    return {
      fairPriceMax: 0,
      assessment: "requires_attention" as const,
      adminAlert: true,
    };
  }
  const rawFairPriceMax = hours *
    input.config.hcmcHourlyRateVnd *
    input.config.baseMultiplier;
  if (!Number.isFinite(rawFairPriceMax) || rawFairPriceMax > Number.MAX_SAFE_INTEGER) {
    return {
      fairPriceMax: 0,
      assessment: "requires_attention" as const,
      adminAlert: true,
    };
  }
  const fairPriceMax = Math.round(rawFairPriceMax);
  if (input.newPriceMax > fairPriceMax * 2) {
    return {
      fairPriceMax,
      assessment: "requires_attention" as const,
      adminAlert: true,
    };
  }
  if (input.newPriceMax > fairPriceMax * 1.5) {
    return {
      fairPriceMax,
      assessment: "high_increase" as const,
      adminAlert: false,
    };
  }
  return {
    fairPriceMax,
    assessment: "reasonable" as const,
    adminAlert: false,
  };
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

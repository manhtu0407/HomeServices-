import type { MarketPriceResult } from "./types.ts";

const MIN_MARKET_TO_BASELINE_FACTOR = 0.3;
const MAX_MARKET_TO_BASELINE_FACTOR = 3;
const MAX_SOURCE_SPREAD = 0.4;
const MAX_MARKET_RANGE_MULTIPLE = 3;
const MAX_SOURCE_EVIDENCE_AGE_MONTHS = 24;

export type MarketVerdictReason =
  | "source_evidence_missing"
  | "insufficient_trusted_quorum"
  | "outside_baseline_band"
  | "mixed_market_units"
  | "source_price_disagreement"
  | "stale_source_evidence"
  | "market_range_too_wide";

export type MarketVerdict = {
  verdict: "reasonable" | "suspicious" | "reject";
  needsInspection: boolean;
  reasons: MarketVerdictReason[];
  checks: {
    baseline: boolean;
    units: boolean;
    agreement: boolean;
    freshness: boolean;
    range: boolean;
  };
};

export function evaluateMarketVerdict(input: {
  baselineMin: number;
  baselineMax: number;
  market: MarketPriceResult;
  weakEvidence?: boolean;
  now?: Date;
}): MarketVerdict {
  const now = input.now ?? new Date();
  const sources = input.market.sources ?? [];
  const baseline = input.market.market_range_min >=
      input.baselineMin * MIN_MARKET_TO_BASELINE_FACTOR &&
    input.market.market_range_max <= input.baselineMax * MAX_MARKET_TO_BASELINE_FACTOR;
  const units = sources.length > 0 && sources.every((source) => source.unit === "per_visit");
  const freshness = sources.length > 0 && sources.every((source) =>
    isWithinEvidenceWindow(source.date, now)
  );
  const agreement = sourceAgreementIsWithinBand(sources.map((source) =>
    (source.price_min + source.price_max) / 2
  ));
  const range = input.market.market_range_max / input.market.market_range_min <=
    MAX_MARKET_RANGE_MULTIPLE;
  const reasons: MarketVerdictReason[] = [];
  if (sources.length === 0) reasons.push("source_evidence_missing");
  if (input.weakEvidence === true) reasons.push("insufficient_trusted_quorum");
  if (!baseline) reasons.push("outside_baseline_band");
  if (!units) reasons.push("mixed_market_units");
  if (!agreement) reasons.push("source_price_disagreement");
  if (!freshness) reasons.push("stale_source_evidence");
  if (!range) reasons.push("market_range_too_wide");

  const reject = reasons.includes("source_evidence_missing") ||
    reasons.includes("mixed_market_units") ||
    reasons.includes("stale_source_evidence");
  return {
    verdict: reject ? "reject" : reasons.length > 0 ? "suspicious" : "reasonable",
    needsInspection: reasons.length > 0,
    reasons,
    checks: { baseline, units, agreement, freshness, range },
  };
}

export function marketVerdictReasonVi(verdict: MarketVerdict): string | null {
  if (verdict.reasons.length === 0) return null;
  return "Dữ liệu giá cần được thợ kiểm tra trực tiếp trước khi chốt phạm vi.";
}

export function marketVerdictSafeMetadata(verdict: MarketVerdict): Record<string, unknown> {
  return {
    market_verdict: verdict.verdict,
    market_verdict_reasons: verdict.reasons,
    market_verdict_checks: verdict.checks,
    market_needs_inspection: verdict.needsInspection,
  };
}

function sourceAgreementIsWithinBand(midpoints: readonly number[]): boolean {
  if (midpoints.length < 2) return false;
  const sorted = [...midpoints].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return median > 0 && sorted.every((value) =>
    Math.abs(value - median) / median <= MAX_SOURCE_SPREAD
  );
}

function isWithinEvidenceWindow(date: string, now: Date): boolean {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return false;
  const oldestAccepted = new Date(now);
  oldestAccepted.setUTCMonth(oldestAccepted.getUTCMonth() - MAX_SOURCE_EVIDENCE_AGE_MONTHS);
  return timestamp >= oldestAccepted.getTime();
}

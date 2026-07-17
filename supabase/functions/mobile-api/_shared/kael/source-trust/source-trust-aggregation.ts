import type { MarketPriceResult, MarketSourceEvidence } from "../types.ts";
import {
  normalizeSourceTrustDomain,
  sourceTrustQuorumForMarketAmount,
  type SourceTrustAutoTier,
  type CitationValidationResult,
} from "./source-trust.ts";

const MAX_PRICE_EVIDENCE_AGE_MONTHS = 24;
const OUTLIER_MAX_DISTANCE_FROM_MEDIAN = 0.4;

type AcceptedCitation = CitationValidationResult["accepted"][number];
type RejectedSource = {
  domain: string | null;
  reason:
    | "duplicate_source_domain"
    | "source_domain_not_cited"
    | "unsupported_unit"
    | "stale_price_evidence"
    | "outlier_over_40_percent";
};
type EligibleSource = {
  source: MarketSourceEvidence;
  domain: string;
  citation: AcceptedCitation;
  midpoint: number;
};

export type TrustedMarketAggregationResult =
  | {
    success: true;
    market: MarketPriceResult;
    quorumMet: boolean;
    requiredQuorum: number;
    tier1Tier2Count: number;
    effectiveTiers: ReadonlyArray<{ domain: string; autoTier: 1 | 2 | 3 | 4 | 5 }>;
    rejected: RejectedSource[];
    safeMetadata: Record<string, unknown>;
  }
  | {
    success: false;
    failureReason: "insufficient_tier_1_2_quorum" | "source_trust_quorum_config_invalid";
    requiredQuorum: number | null;
    tier1Tier2Count: number;
    rejected: RejectedSource[];
    safeMetadata: Record<string, unknown>;
  };

export function aggregateTrustedMarketSources(input: {
  sources: readonly MarketSourceEvidence[];
  acceptedCitations: readonly AcceptedCitation[];
  highValueThresholdVnd: number;
  now?: Date;
}): TrustedMarketAggregationResult {
  const now = input.now ?? new Date();
  const rejected: RejectedSource[] = [];
  if (!Number.isSafeInteger(input.highValueThresholdVnd) || input.highValueThresholdVnd <= 0) {
    return failedAggregation("source_trust_quorum_config_invalid", null, 0, rejected);
  }

  const seenDomains = new Set<string>();
  const eligible: EligibleSource[] = [];
  for (const source of input.sources) {
    const domain = normalizeSourceTrustDomain(source.domain);
    if (!domain) {
      rejected.push({ domain: null, reason: "source_domain_not_cited" });
      continue;
    }
    if (seenDomains.has(domain)) {
      rejected.push({ domain, reason: "duplicate_source_domain" });
      continue;
    }
    seenDomains.add(domain);

    const registryCitation = input.acceptedCitations.find((item) =>
      item.domain === domain || item.matchedDomain === domain
    );
    if (!registryCitation) {
      rejected.push({ domain, reason: "source_domain_not_cited" });
      continue;
    }
    if (source.unit !== "per_visit") {
      rejected.push({ domain, reason: "unsupported_unit" });
      continue;
    }
    if (!isWithinEvidenceWindow(source.date, now)) {
      rejected.push({ domain, reason: "stale_price_evidence" });
      continue;
    }
    const autoTier = registryBackedAutoTier(registryCitation);
    eligible.push({
      source: { ...source, domain },
      domain,
      citation: { ...registryCitation, autoTier },
      midpoint: (source.price_min + source.price_max) / 2,
    });
  }

  const tier1Tier2 = eligible.filter((item) => item.citation.autoTier <= 2);
  const median = medianOf(tier1Tier2.map((item) => item.midpoint));
  const nonOutliers = median === null
    ? eligible
    : eligible.filter((item) => {
      const isOutlier = Math.abs(item.midpoint - median) / median >
        OUTLIER_MAX_DISTANCE_FROM_MEDIAN;
      if (isOutlier) {
        rejected.push({ domain: item.domain, reason: "outlier_over_40_percent" });
      }
      return !isOutlier;
    });
  const survivingTier1Tier2 = nonOutliers.filter((item) => item.citation.autoTier <= 2);
  const market = weightedMarketResult(nonOutliers);
  if (!market || survivingTier1Tier2.length === 0) {
    return failedAggregation("insufficient_tier_1_2_quorum", 2, survivingTier1Tier2.length, rejected);
  }

  const requiredQuorum = sourceTrustQuorumForMarketAmount(
    market.market_range_max,
    input.highValueThresholdVnd,
  );
  const quorumMet = survivingTier1Tier2.length >= requiredQuorum;

  return {
    success: true,
    market,
    quorumMet,
    requiredQuorum,
    tier1Tier2Count: survivingTier1Tier2.length,
    effectiveTiers: nonOutliers.map((item) => ({
      domain: item.domain,
      autoTier: item.citation.autoTier,
    })),
    rejected,
    safeMetadata: {
      source_trust_aggregation_result: quorumMet ? "passed" : "weak_quorum",
      source_trust_quorum_met: quorumMet,
      source_trust_aggregation_unit: "per_visit",
      source_trust_outlier_limit: OUTLIER_MAX_DISTANCE_FROM_MEDIAN,
      source_trust_tier_1_2_count: survivingTier1Tier2.length,
      source_trust_required_quorum: requiredQuorum,
      source_trust_accepted_source_count: nonOutliers.length,
      source_trust_rejected_source_count: rejected.length,
      source_trust_accepted_sources: nonOutliers.map((item) => ({
        domain: item.domain,
        price_min: item.source.price_min,
        price_max: item.source.price_max,
        unit: item.source.unit,
        date: item.source.date,
        auto_tier: item.citation.autoTier,
        weight: sourceWeight(item.citation),
      })),
    },
  };
}

function registryBackedAutoTier(citation: AcceptedCitation): SourceTrustAutoTier {
  if (citation.tier === "blocked" || citation.autoTier === 5) return 5;
  const criteria = citation.criteriaMet;
  const criteriaTier: SourceTrustAutoTier = criteria.A && criteria.B && criteria.C &&
      criteria.D && criteria.E && criteria.F && criteria.G
    ? 1
    : criteria.A && criteria.B && criteria.D && criteria.E && criteria.F && criteria.G
    ? 2
    : criteria.A && criteria.B && criteria.E
    ? 3
    : 4;
  return Math.max(citation.autoTier, criteriaTier) as SourceTrustAutoTier;
}

function weightedMarketResult(sources: readonly EligibleSource[]): MarketPriceResult | null {
  const weighted = sources.map((item) => ({
    ...item,
    weight: sourceWeight(item.citation),
  })).filter((item) => item.weight > 0);
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
  if (totalWeight <= 0) return null;

  const marketRangeMin = Math.round(
    weighted.reduce((total, item) => total + item.source.price_min * item.weight, 0) /
      totalWeight,
  );
  const marketRangeMax = Math.round(
    weighted.reduce((total, item) => total + item.source.price_max * item.weight, 0) /
      totalWeight,
  );
  const tier1Tier2Count = weighted.filter((item) => item.citation.autoTier <= 2).length;
  const confidence = Math.min(0.85, 0.45 + tier1Tier2Count * 0.1 + weighted.length * 0.025);
  return {
    market_range_min: marketRangeMin,
    market_range_max: Math.max(marketRangeMin, marketRangeMax),
    confidence: Math.round(confidence * 100) / 100,
    sources_summary: trustedSourceSummary(weighted),
    citations: weighted.map((item) => item.citation.url),
    sources: weighted.map((item) => item.source),
  };
}

function trustedSourceSummary(
  sources: readonly (EligibleSource & { weight: number })[],
): string {
  const tierCounts = new Map<number, number>();
  for (const source of sources) {
    tierCounts.set(
      source.citation.autoTier,
      (tierCounts.get(source.citation.autoTier) ?? 0) + 1,
    );
  }
  const tiers = [...tierCounts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tier, count]) => `T${tier}: ${count}`)
    .join(", ");
  return `Tổng hợp ${sources.length} nguồn đã kiểm chứng (${tiers}).`;
}

function sourceWeight(citation: AcceptedCitation): number {
  if (citation.autoTier === 1) return 1;
  if (citation.autoTier === 2) {
    const entityType = citation.entityType?.trim().toLowerCase() ?? "";
    const region = citation.region?.trim().toLowerCase() ?? "";
    return entityType.includes("material") || region === "hcmc" ? 1 : 0.7;
  }
  if (citation.autoTier === 3) return 0.3;
  if (citation.autoTier === 4) return 0.1;
  return 0;
}

function isWithinEvidenceWindow(date: string, now: Date): boolean {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return false;
  const oldestAccepted = new Date(now);
  oldestAccepted.setUTCMonth(oldestAccepted.getUTCMonth() - MAX_PRICE_EVIDENCE_AGE_MONTHS);
  return timestamp >= oldestAccepted.getTime();
}

function evidenceAgeMonths(date: string, now: Date): number | null {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return null;
  const observed = new Date(timestamp);
  return Math.max(
    0,
    (now.getUTCFullYear() - observed.getUTCFullYear()) * 12 +
      now.getUTCMonth() - observed.getUTCMonth(),
  );
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function failedAggregation(
  failureReason: "insufficient_tier_1_2_quorum" | "source_trust_quorum_config_invalid",
  requiredQuorum: number | null,
  tier1Tier2Count: number,
  rejected: RejectedSource[],
): TrustedMarketAggregationResult {
  return {
    success: false,
    failureReason,
    requiredQuorum,
    tier1Tier2Count,
    rejected,
    safeMetadata: {
      source_trust_aggregation_result: failureReason,
      source_trust_tier_1_2_count: tier1Tier2Count,
      source_trust_required_quorum: requiredQuorum,
      source_trust_rejected_source_count: rejected.length,
    },
  };
}

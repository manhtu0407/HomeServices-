import type { SourceTrustTier } from "./source-trust.ts";

export type SourceEvidence = {
  readonly knownSource: boolean;
  readonly blocked: boolean;
  readonly identityVerified: boolean;
  readonly sourceType: "direct_pricing" | "materials" | "reference" | "listing" | "unknown";
  readonly hcmcRelevant: boolean;
  readonly clearPriceAndUnit: boolean;
  readonly priceAgeMonths: number | null;
  readonly integrityVerified: boolean;
  readonly evidenceVerified: boolean;
  readonly reviewOverdue: boolean;
  readonly priceJumpSuspected: boolean;
};

export type SourceTierDecision = {
  readonly tier: 1 | 2 | 3 | 4 | 5;
  readonly legacyTier: SourceTrustTier;
  readonly reasons: readonly string[];
};

export function classifySourceTrustTier(
  evidence: SourceEvidence,
): SourceTierDecision {
  if (evidence.blocked) return decision(5, "BLOCKED_SOURCE");
  if (!evidence.knownSource) return decision(5, "UNKNOWN_SOURCE_QUARANTINED");
  if (evidence.sourceType === "listing" || evidence.sourceType === "unknown") {
    return decision(5, "UNTRUSTED_SOURCE_TYPE");
  }
  if (evidence.priceJumpSuspected) return decision(4, "PRICE_JUMP_QUARANTINED");

  if (
    evidence.sourceType === "direct_pricing" &&
    evidence.identityVerified &&
    evidence.hcmcRelevant &&
    evidence.clearPriceAndUnit &&
    isFreshWithin(evidence.priceAgeMonths, 12) &&
    evidence.integrityVerified &&
    evidence.evidenceVerified
  ) {
    return evidence.reviewOverdue
      ? decision(2, "REVIEW_OVERDUE_DEGRADED")
      : decision(1, "T1_ALL_REQUIRED_EVIDENCE");
  }

  if (
    (evidence.sourceType === "materials" || evidence.sourceType === "direct_pricing") &&
    evidence.identityVerified &&
    evidence.clearPriceAndUnit &&
    isFreshWithin(evidence.priceAgeMonths, 12) &&
    evidence.integrityVerified &&
    evidence.evidenceVerified
  ) {
    return evidence.reviewOverdue
      ? decision(3, "REVIEW_OVERDUE_DEGRADED")
      : decision(2, "T2_VERIFIED_PRICE_REFERENCE");
  }

  if (
    evidence.sourceType === "reference" &&
    evidence.identityVerified &&
    isFreshWithin(evidence.priceAgeMonths, 24)
  ) {
    return evidence.reviewOverdue
      ? decision(4, "REVIEW_OVERDUE_DEGRADED")
      : decision(3, "T3_SECONDARY_REFERENCE");
  }

  return decision(4, "KNOWN_SOURCE_INSUFFICIENT_EVIDENCE");
}

function decision(tier: 1 | 2 | 3 | 4 | 5, reason: string): SourceTierDecision {
  return {
    tier,
    legacyTier: tier === 1
      ? "tier_1"
      : tier === 2
      ? "tier_2"
      : tier === 5
      ? "blocked"
      : "tier_3",
    reasons: [reason],
  };
}

function isFreshWithin(ageMonths: number | null, limit: number): boolean {
  return typeof ageMonths === "number" && Number.isFinite(ageMonths) &&
    ageMonths >= 0 && ageMonths <= limit;
}

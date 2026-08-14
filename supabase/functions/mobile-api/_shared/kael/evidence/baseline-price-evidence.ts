import {
  normalizeSourceTrustDomain,
  sourceTrustQuorumForMarketAmount,
  type CitationValidationResult,
} from "./source-trust.ts";
import {
  classifySourceTrustTier,
  type SourceEvidence,
} from "./source-tier-rulebook.ts";

const MAX_BASELINE_SOURCE_COUNT = 10;
const MAX_HIGH_TRUST_PRICE_AGE_MONTHS = 12;
const OUTLIER_MAX_DISTANCE_FROM_MEDIAN = 0.4;
const HCMC_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export type BaselinePriceEvidenceUnit =
  | "per_visit"
  | "per_cabinet_door"
  | "per_repair_point"
  | "per_item";

export type BaselinePriceEvidenceDocument = {
  schema_version: "baseline_price_evidence.v1";
  sources: BaselinePriceEvidenceSource[];
};

export type BaselinePriceEvidenceSource = {
  domain: string;
  url: string;
  observed_at: string;
  price_min: number;
  price_max: number;
  unit: BaselinePriceEvidenceUnit;
  normalization?: BaselinePriceEvidenceNormalization;
  verification: BaselinePriceEvidenceVerification;
  signals: {
    identity_verified: boolean;
    source_type: SourceEvidence["sourceType"];
    hcmc_relevant: boolean;
    clear_price_and_unit: boolean;
    integrity_verified: boolean;
    review_overdue: boolean;
    price_jump_suspected: boolean;
  };
};

export type BaselinePriceEvidenceVerification = {
  source_published_at: string;
  verified_at: string;
  verified_by: string;
  ledger_ref: string;
  price_snapshot_sha256: string;
  identity_snapshot_sha256: string;
};

export type BaselinePriceEvidenceNormalization = {
  original_price_min: number;
  original_price_max: number;
  original_unit: "per_item";
  quantity: number;
  calculation: string;
};

export type BaselinePriceEvidenceReceipt = {
  schema_version: "baseline_price_evidence_receipt.v1";
  accepted_source_count: number;
  aggregate_price_min: number;
  aggregate_price_max: number;
  high_trust_source_count: number;
  quorum_met: true;
  required_quorum: number;
  unit: BaselinePriceEvidenceUnit;
  sources: ReadonlyArray<{
    domain: string;
    url: string;
    observed_at: string;
    price_min: number;
    price_max: number;
    unit: BaselinePriceEvidenceUnit;
    effective_tier: 1 | 2;
    weight: number;
    normalization?: BaselinePriceEvidenceNormalization;
  }>;
};

export type BaselinePriceEvidenceValidation =
  | { success: true; receipt: BaselinePriceEvidenceReceipt }
  | { success: false; error: string };

type RegistryCitation = CitationValidationResult["accepted"][number];
type ParsedSource = BaselinePriceEvidenceSource & {
  effectiveTier: 1 | 2;
  midpoint: number;
  weight: number;
};

export function validateBaselinePriceEvidence(input: {
  baselinePriceMin: number;
  baselinePriceMax: number;
  document: unknown;
  highValueThresholdVnd: number;
  registryCitations: readonly RegistryCitation[];
  now?: Date;
}): BaselinePriceEvidenceValidation {
  if (
    !Number.isSafeInteger(input.highValueThresholdVnd) ||
    input.highValueThresholdVnd <= 0
  ) {
    return failed("source trust quorum config invalid");
  }
  const parsedDocument = parseEvidenceDocument(input.document);
  if (!parsedDocument) return failed("baseline price evidence invalid");

  const now = input.now ?? new Date();
  const seenDomains = new Set<string>();
  const parsedSources: ParsedSource[] = [];
  let expectedUnit: BaselinePriceEvidenceUnit | null = null;
  for (const source of parsedDocument.sources) {
    const normalizedDomain = normalizeSourceTrustDomain(source.domain);
    const urlDomain = domainFromUrl(source.url);
    if (!normalizedDomain || !urlDomain || normalizedDomain !== urlDomain) {
      return failed("source URL and domain do not match");
    }
    if (seenDomains.has(normalizedDomain)) {
      return failed("duplicate source domain");
    }
    seenDomains.add(normalizedDomain);
    if (expectedUnit && source.unit !== expectedUnit) {
      return failed("mixed source units");
    }
    expectedUnit = source.unit;

    const priceAgeMonths = evidenceAgeMonths(
      source.verification.source_published_at,
      now,
    );
    const verificationAgeMonths = evidenceAgeMonths(
      source.verification.verified_at,
      now,
    );
    if (
      priceAgeMonths === null || verificationAgeMonths === null ||
      priceAgeMonths > MAX_HIGH_TRUST_PRICE_AGE_MONTHS
    ) {
      return failed("stale price evidence");
    }
    const registryCitation = input.registryCitations.find((citation) =>
      citation.domain === normalizedDomain ||
      citation.matchedDomain === normalizedDomain
    );
    if (!registryCitation) return failed("source domain is not trusted");

    const rulebookTier = classifySourceTrustTier({
      knownSource: true,
      blocked: registryCitation.tier === "blocked" ||
        registryCitation.autoTier === 5,
      identityVerified: source.signals.identity_verified,
      sourceType: source.signals.source_type,
      hcmcRelevant: source.signals.hcmc_relevant,
      clearPriceAndUnit: source.signals.clear_price_and_unit,
      priceAgeMonths,
      integrityVerified: source.signals.integrity_verified,
      evidenceVerified: true,
      reviewOverdue: source.signals.review_overdue,
      priceJumpSuspected: source.signals.price_jump_suspected,
    }).tier;
    const effectiveTier = Math.max(rulebookTier, registryCitation.autoTier);
    if (effectiveTier !== 1 && effectiveTier !== 2) {
      return failed("source does not meet T1/T2 evidence requirements");
    }
    parsedSources.push({
      ...source,
      domain: normalizedDomain,
      effectiveTier,
      midpoint: (source.price_min + source.price_max) / 2,
      weight: sourceWeight(effectiveTier, source),
    });
  }

  const nonOutliers = withoutOutliers(parsedSources);
  const aggregate = aggregateSources(nonOutliers);
  if (!aggregate || !expectedUnit) return failed("trusted source quorum not met");
  const requiredQuorum = sourceTrustQuorumForMarketAmount(
    aggregate.priceMax,
    input.highValueThresholdVnd,
  );
  if (nonOutliers.length < requiredQuorum) {
    return failed("trusted source quorum not met");
  }
  if (
    aggregate.priceMin !== input.baselinePriceMin ||
    aggregate.priceMax !== input.baselinePriceMax
  ) {
    return failed("baseline does not reconcile to source aggregate");
  }

  return {
    success: true,
    receipt: {
      schema_version: "baseline_price_evidence_receipt.v1",
      accepted_source_count: nonOutliers.length,
      aggregate_price_min: aggregate.priceMin,
      aggregate_price_max: aggregate.priceMax,
      high_trust_source_count: nonOutliers.length,
      quorum_met: true,
      required_quorum: requiredQuorum,
      unit: expectedUnit,
      sources: nonOutliers.map((source) => ({
        domain: source.domain,
        url: source.url,
        observed_at: source.observed_at,
        price_min: source.price_min,
        price_max: source.price_max,
        unit: source.unit,
        effective_tier: source.effectiveTier,
        weight: source.weight,
        ...(source.normalization
          ? { normalization: source.normalization }
          : {}),
      })),
    },
  };
}

export function baselinePriceEvidenceCitationUrls(value: unknown): string[] {
  return parseEvidenceDocument(value)?.sources.map((source) => source.url) ?? [];
}

export function parseBaselinePriceEvidenceReceipt(
  value: unknown,
): BaselinePriceEvidenceReceipt | null {
  if (!isRecord(value) ||
    value.schema_version !== "baseline_price_evidence_receipt.v1" ||
    value.quorum_met !== true || !isPositiveSafeInteger(value.accepted_source_count) ||
    !isPositiveSafeInteger(value.high_trust_source_count) ||
    !isPositiveSafeInteger(value.required_quorum) ||
    !isPositiveSafeInteger(value.aggregate_price_min) ||
    !isPositiveSafeInteger(value.aggregate_price_max) ||
    value.aggregate_price_max < value.aggregate_price_min ||
    !isEvidenceUnit(value.unit) || !Array.isArray(value.sources) ||
    value.sources.length !== value.accepted_source_count ||
    value.high_trust_source_count !== value.accepted_source_count ||
    value.high_trust_source_count < value.required_quorum
  ) {
    return null;
  }
  const sources = value.sources.map(parseReceiptSource);
  if (sources.some((source) => source === null)) return null;
  return {
    schema_version: "baseline_price_evidence_receipt.v1",
    accepted_source_count: value.accepted_source_count,
    aggregate_price_min: value.aggregate_price_min,
    aggregate_price_max: value.aggregate_price_max,
    high_trust_source_count: value.high_trust_source_count,
    quorum_met: true,
    required_quorum: value.required_quorum,
    unit: value.unit,
    sources: sources as BaselinePriceEvidenceReceipt["sources"],
  };
}

function parseEvidenceDocument(value: unknown): BaselinePriceEvidenceDocument | null {
  if (!isRecord(value) || value.schema_version !== "baseline_price_evidence.v1") {
    return null;
  }
  if (
    !Array.isArray(value.sources) || value.sources.length < 2 ||
    value.sources.length > MAX_BASELINE_SOURCE_COUNT
  ) {
    return null;
  }
  const sources = value.sources.map(parseEvidenceSource);
  if (sources.some((source) => source === null)) return null;
  return {
    schema_version: "baseline_price_evidence.v1",
    sources: sources as BaselinePriceEvidenceSource[],
  };
}

function parseEvidenceSource(value: unknown): BaselinePriceEvidenceSource | null {
  if (!isRecord(value) || !isRecord(value.signals)) return null;
  const unit = value.unit;
  const sourceType = value.signals.source_type;
  if (
    typeof value.domain !== "string" || typeof value.url !== "string" ||
    typeof value.observed_at !== "string" ||
    !isPositiveSafeInteger(value.price_min) ||
    !isPositiveSafeInteger(value.price_max) || value.price_max < value.price_min ||
    (unit !== "per_visit" && unit !== "per_cabinet_door" &&
      unit !== "per_repair_point" && unit !== "per_item") ||
    (sourceType !== "direct_pricing" && sourceType !== "materials" &&
      sourceType !== "reference" && sourceType !== "listing" &&
      sourceType !== "unknown") ||
    !hasBooleanSignals(value.signals)
  ) {
    return null;
  }
  const verification = parseVerification(value.verification, value.observed_at);
  if (!verification) return null;
  const normalization = value.normalization === undefined
    ? undefined
    : parseNormalization(value.normalization, {
      priceMin: value.price_min,
      priceMax: value.price_max,
      unit,
    });
  if (value.normalization !== undefined && !normalization) return null;
  return {
    domain: value.domain,
    url: value.url,
    observed_at: value.observed_at,
    price_min: value.price_min,
    price_max: value.price_max,
    unit,
    ...(normalization ? { normalization } : {}),
    verification,
    signals: {
      identity_verified: value.signals.identity_verified,
      source_type: sourceType,
      hcmc_relevant: value.signals.hcmc_relevant,
      clear_price_and_unit: value.signals.clear_price_and_unit,
      integrity_verified: value.signals.integrity_verified,
      review_overdue: value.signals.review_overdue,
      price_jump_suspected: value.signals.price_jump_suspected,
    },
  };
}

function parseVerification(
  value: unknown,
  observedAt: string,
): BaselinePriceEvidenceVerification | null {
  if (!isRecord(value) ||
    !isIsoDate(value.source_published_at) ||
    !isIsoDate(value.verified_at) || !isIsoDate(observedAt) ||
    typeof value.verified_by !== "string" ||
    !/^[a-z0-9_:-]{3,80}$/i.test(value.verified_by) ||
    typeof value.ledger_ref !== "string" ||
    !value.ledger_ref.startsWith(
      "docs/foundation/source-trust-samples/",
    ) || !value.ledger_ref.endsWith(".json") ||
    value.ledger_ref.includes("..") || value.ledger_ref.length > 240 ||
    !isSha256(value.price_snapshot_sha256) ||
    !isSha256(value.identity_snapshot_sha256)
  ) {
    return null;
  }
  const publishedTimestamp = isoDateTimestamp(value.source_published_at);
  const observedTimestamp = isoDateTimestamp(observedAt);
  const verifiedTimestamp = isoDateTimestamp(value.verified_at);
  if (publishedTimestamp === null || observedTimestamp === null ||
    verifiedTimestamp === null || publishedTimestamp > observedTimestamp ||
    observedTimestamp > verifiedTimestamp
  ) {
    return null;
  }
  return {
    source_published_at: value.source_published_at,
    verified_at: value.verified_at,
    verified_by: value.verified_by,
    ledger_ref: value.ledger_ref,
    price_snapshot_sha256: value.price_snapshot_sha256.toUpperCase(),
    identity_snapshot_sha256: value.identity_snapshot_sha256.toUpperCase(),
  };
}

function parseReceiptSource(
  value: unknown,
): BaselinePriceEvidenceReceipt["sources"][number] | null {
  if (!isRecord(value) || typeof value.domain !== "string" ||
    typeof value.url !== "string" || typeof value.observed_at !== "string" ||
    !isPositiveSafeInteger(value.price_min) ||
    !isPositiveSafeInteger(value.price_max) || value.price_max < value.price_min ||
    !isEvidenceUnit(value.unit) ||
    (value.effective_tier !== 1 && value.effective_tier !== 2) ||
    typeof value.weight !== "number" || !Number.isFinite(value.weight) ||
    value.weight <= 0
  ) {
    return null;
  }
  const domain = normalizeSourceTrustDomain(value.domain);
  if (!domain || domainFromUrl(value.url) !== domain) return null;
  const normalization = value.normalization === undefined
    ? undefined
    : parseNormalization(value.normalization, {
      priceMin: value.price_min,
      priceMax: value.price_max,
      unit: value.unit,
    });
  if (value.normalization !== undefined && !normalization) return null;
  return {
    domain,
    url: value.url,
    observed_at: value.observed_at,
    price_min: value.price_min,
    price_max: value.price_max,
    unit: value.unit,
    effective_tier: value.effective_tier,
    weight: value.weight,
    ...(normalization ? { normalization } : {}),
  };
}

function parseNormalization(
  value: unknown,
  normalized: {
    priceMin: number;
    priceMax: number;
    unit: BaselinePriceEvidenceUnit;
  },
): BaselinePriceEvidenceNormalization | null {
  if (!isRecord(value) || value.original_unit !== "per_item" ||
    !isPositiveSafeInteger(value.original_price_min) ||
    !isPositiveSafeInteger(value.original_price_max) ||
    value.original_price_max < value.original_price_min ||
    !isPositiveSafeInteger(value.quantity) ||
    typeof value.calculation !== "string" ||
    value.calculation.trim().length === 0 || value.calculation.length > 160 ||
    normalized.unit !== "per_cabinet_door" ||
    value.original_price_min * value.quantity !== normalized.priceMin ||
    value.original_price_max * value.quantity !== normalized.priceMax
  ) {
    return null;
  }
  return {
    original_price_min: value.original_price_min,
    original_price_max: value.original_price_max,
    original_unit: "per_item",
    quantity: value.quantity,
    calculation: value.calculation.trim(),
  };
}

function hasBooleanSignals(value: Record<string, unknown>): value is Record<
  | "identity_verified"
  | "hcmc_relevant"
  | "clear_price_and_unit"
  | "integrity_verified"
  | "review_overdue"
  | "price_jump_suspected",
  boolean
> & Record<string, unknown> {
  return [
    "identity_verified",
    "hcmc_relevant",
    "clear_price_and_unit",
    "integrity_verified",
    "review_overdue",
    "price_jump_suspected",
  ].every((key) => typeof value[key] === "boolean");
}

function withoutOutliers(sources: readonly ParsedSource[]): ParsedSource[] {
  const median = medianOf(sources.map((source) => source.midpoint));
  if (median === null || median === 0) return [];
  return sources.filter((source) =>
    Math.abs(source.midpoint - median) / median <=
      OUTLIER_MAX_DISTANCE_FROM_MEDIAN
  );
}

function aggregateSources(
  sources: readonly ParsedSource[],
): { priceMin: number; priceMax: number } | null {
  const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0);
  if (totalWeight <= 0) return null;
  return {
    priceMin: roundVnd(sources.reduce(
      (sum, source) => sum + source.price_min * source.weight,
      0,
    ) / totalWeight),
    priceMax: roundVnd(sources.reduce(
      (sum, source) => sum + source.price_max * source.weight,
      0,
    ) / totalWeight),
  };
}

function sourceWeight(
  tier: 1 | 2,
  source: BaselinePriceEvidenceSource,
): number {
  if (tier === 1) return 1;
  return source.signals.hcmc_relevant || source.signals.source_type === "materials"
    ? 1
    : 0.7;
}

function evidenceAgeMonths(date: string, now: Date): number | null {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  const hcmcNow = new Date(now.getTime() + HCMC_UTC_OFFSET_MS);
  const hcmcTodayTimestamp = Date.UTC(
    hcmcNow.getUTCFullYear(),
    hcmcNow.getUTCMonth(),
    hcmcNow.getUTCDate(),
  );
  if (!Number.isFinite(timestamp) || timestamp > hcmcTodayTimestamp) return null;
  const observed = new Date(timestamp);
  return Math.max(
    0,
    (hcmcNow.getUTCFullYear() - observed.getUTCFullYear()) * 12 +
      hcmcNow.getUTCMonth() - observed.getUTCMonth(),
  );
}

function isoDateTimestamp(value: string): number | null {
  if (!isIsoDate(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function domainFromUrl(value: string): string | null {
  try {
    return normalizeSourceTrustDomain(new URL(value).hostname);
  } catch {
    return null;
  }
}

function roundVnd(value: number): number {
  return Math.round(value / 1000) * 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isEvidenceUnit(value: unknown): value is BaselinePriceEvidenceUnit {
  return value === "per_visit" || value === "per_cabinet_door" ||
    value === "per_repair_point" || value === "per_item";
}

function failed(error: string): BaselinePriceEvidenceValidation {
  return { success: false, error };
}

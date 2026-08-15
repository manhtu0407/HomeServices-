import { isRecord, nullableNumber, nullableString } from "../../platform/coercions.ts";

const QUOTE_SCHEMA_VERSION = "original_scope_price_quote.v1" as const;
const SELECTION_RULE = "verified_neutral_midpoint_with_bilateral_confirmation" as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type PriceConfidence = "low" | "medium" | "high";

type OriginalScopePriceQuoteExpectation = {
  broadcastId: string;
  jobId: string;
  requireWorkerConfirmation: boolean;
  workerId: string;
};

export type ParsedOriginalScopePriceQuote = {
  schemaVersion: typeof QUOTE_SCHEMA_VERSION;
  quoteId: string;
  jobId: string;
  workerId: string;
  broadcastId: string;
  referencePriceMin: number;
  referencePriceMax: number;
  customerTotal: number;
  platformFee: number;
  workerNet: number;
  commissionLevel: number;
  commissionRateBps: number;
  priceSource: string;
  selectionRule: typeof SELECTION_RULE;
  workerConfirmationRequired: true;
  customerConfirmationRequired: true;
  workerConfirmedAt: string | null;
  expiresAt: string;
  evidence: {
    confidence: PriceConfidence;
    baselineSourceCount: number;
    marketSourceCount: number;
    highTrustSourceCount: number;
    quorumMet: true;
    capStatement: string;
  };
  reasoningReceipt: Record<string, unknown>;
};

export type SafeOriginalScopePriceQuote = ReturnType<typeof projectOriginalScopePriceQuote>;

export function parseOriginalScopePriceQuote(
  value: unknown,
  expected: OriginalScopePriceQuoteExpectation,
): ParsedOriginalScopePriceQuote | null {
  if (!isRecord(value) || value.schema_version !== QUOTE_SCHEMA_VERSION) return null;

  const quoteId = validUuid(value.quote_id);
  const jobId = validUuid(value.job_id);
  const workerId = validUuid(value.worker_id);
  const broadcastId = validUuid(value.broadcast_id);
  const referencePriceMin = positiveInteger(value.reference_price_min);
  const referencePriceMax = positiveInteger(value.reference_price_max);
  const customerTotal = positiveInteger(value.customer_total);
  const platformFee = nonNegativeInteger(value.platform_fee);
  const workerNet = positiveInteger(value.worker_net);
  const commissionLevel = positiveInteger(value.commission_level);
  const commissionRateBps = nonNegativeInteger(value.commission_rate_bps);
  const priceSource = nonEmptyString(value.price_source);
  const expiresAt = validTimestamp(value.expires_at);
  const workerConfirmedAt = nullableTimestamp(value.worker_confirmed_at);
  const reasoningReceipt = isRecord(value.reasoning_receipt)
    ? value.reasoning_receipt
    : null;

  if (
    !quoteId || !jobId || !workerId || !broadcastId ||
    jobId !== expected.jobId || workerId !== expected.workerId ||
    broadcastId !== expected.broadcastId ||
    referencePriceMin === null || referencePriceMax === null ||
    customerTotal === null || platformFee === null || workerNet === null ||
    commissionLevel === null || commissionRateBps === null ||
    !priceSource || !expiresAt || !reasoningReceipt ||
    referencePriceMax < referencePriceMin ||
    customerTotal !== neutralMidpoint(referencePriceMin, referencePriceMax) ||
    commissionRateBps > 1_500 ||
    platformFee !== Math.round(customerTotal * commissionRateBps / 10_000) ||
    workerNet !== customerTotal - platformFee ||
    value.selection_rule !== SELECTION_RULE ||
    value.worker_confirmation_required !== true ||
    value.customer_confirmation_required !== true ||
    (expected.requireWorkerConfirmation && !workerConfirmedAt) ||
    (!expected.requireWorkerConfirmation && workerConfirmedAt !== null)
  ) {
    return null;
  }

  const evidence = parseEvidence(
    reasoningReceipt,
    referencePriceMin,
    referencePriceMax,
    priceSource,
  );
  if (!evidence) return null;

  return {
    schemaVersion: QUOTE_SCHEMA_VERSION,
    quoteId,
    jobId,
    workerId,
    broadcastId,
    referencePriceMin,
    referencePriceMax,
    customerTotal,
    platformFee,
    workerNet,
    commissionLevel,
    commissionRateBps,
    priceSource,
    selectionRule: SELECTION_RULE,
    workerConfirmationRequired: true,
    customerConfirmationRequired: true,
    workerConfirmedAt,
    expiresAt,
    evidence,
    reasoningReceipt,
  };
}

export function projectOriginalScopePriceQuote(quote: ParsedOriginalScopePriceQuote) {
  return {
    schema_version: quote.schemaVersion,
    quote_id: quote.quoteId,
    reference_price_min: quote.referencePriceMin,
    reference_price_max: quote.referencePriceMax,
    customer_total: quote.customerTotal,
    platform_fee: quote.platformFee,
    worker_net: quote.workerNet,
    commission_level: quote.commissionLevel,
    commission_rate_bps: quote.commissionRateBps,
    price_source: quote.priceSource,
    selection_rule: quote.selectionRule,
    worker_confirmation_required: quote.workerConfirmationRequired,
    customer_confirmation_required: quote.customerConfirmationRequired,
    worker_confirmed_at: quote.workerConfirmedAt,
    expires_at: quote.expiresAt,
    evidence_summary: {
      confidence: quote.evidence.confidence,
      baseline_source_count: quote.evidence.baselineSourceCount,
      market_source_count: quote.evidence.marketSourceCount,
      high_trust_source_count: quote.evidence.highTrustSourceCount,
      quorum_met: quote.evidence.quorumMet,
      cap_statement: quote.evidence.capStatement,
    },
  };
}

function parseEvidence(
  receipt: Record<string, unknown>,
  referencePriceMin: number,
  referencePriceMax: number,
  priceSource: string,
) {
  if (receipt.schema_version !== "price_reasoning_receipt.v1") return null;
  const scenarios = isRecord(receipt.scenarios) ? receipt.scenarios : null;
  const low = scenarios && isRecord(scenarios.low) ? scenarios.low : null;
  const high = scenarios && isRecord(scenarios.high) ? scenarios.high : null;
  const fairness = isRecord(receipt.fairness) ? receipt.fairness : null;
  const confidence = fairness ? priceConfidence(fairness.confidence) : null;
  const capStatement = fairness ? nonEmptyString(fairness.cap_statement) : null;
  if (
    !low || !high || !fairness ||
    positiveInteger(low.total) !== referencePriceMin ||
    positiveInteger(high.total) !== referencePriceMax ||
    fairness.price_source !== priceSource ||
    confidence === null ||
    !capStatement
  ) {
    return null;
  }

  const baselineEvidence = isRecord(fairness.baseline_evidence)
    ? fairness.baseline_evidence
    : null;
  const baselineSourceCount = validBaselineSourceCount(baselineEvidence);
  const marketSourceCount = nonNegativeInteger(fairness.market_source_count) ?? 0;
  const highTrustSourceCount = nonNegativeInteger(fairness.high_trust_source_count) ?? 0;
  const marketQuorum = fairness.quorum_met === true &&
    marketSourceCount >= 2 && highTrustSourceCount >= 1;
  if (baselineSourceCount === null && !marketQuorum) return null;

  return {
    confidence,
    baselineSourceCount: baselineSourceCount ?? 0,
    marketSourceCount,
    highTrustSourceCount,
    quorumMet: true as const,
    capStatement,
  };
}

function priceConfidence(value: unknown): PriceConfidence | null {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : null;
}

function validBaselineSourceCount(value: Record<string, unknown> | null) {
  if (!value || value.schema_version !== "baseline_price_evidence_receipt.v1") {
    return null;
  }
  const accepted = positiveInteger(value.accepted_source_count);
  const highTrust = positiveInteger(value.high_trust_source_count);
  const required = positiveInteger(value.required_quorum);
  if (
    value.quorum_met !== true || accepted === null || highTrust === null ||
    required === null || !Array.isArray(value.sources) ||
    value.sources.length !== accepted || highTrust < required
  ) {
    return null;
  }
  return accepted;
}

function neutralMidpoint(min: number, max: number) {
  return Math.round(((min + max) / 2) / 1_000) * 1_000;
}

function validUuid(value: unknown) {
  const parsed = nullableString(value);
  return parsed && UUID_PATTERN.test(parsed) ? parsed : null;
}

function nonEmptyString(value: unknown) {
  const parsed = nullableString(value)?.trim();
  return parsed ? parsed : null;
}

function positiveInteger(value: unknown) {
  const parsed = nullableNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown) {
  const parsed = nullableNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validTimestamp(value: unknown) {
  const parsed = nonEmptyString(value);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

function nullableTimestamp(value: unknown) {
  if (value === null || value === undefined) return null;
  return validTimestamp(value);
}

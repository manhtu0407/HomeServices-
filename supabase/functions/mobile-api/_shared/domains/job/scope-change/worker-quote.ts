import { asRecord, asString, nullableNumber } from "../../../platform/coercions.ts";
import type { EdgeScopeChangeWorkerQuote } from "../../contracts/worker.ts";
import type { PricedScopeChangeEstimate } from "./effects-contracts.ts";
import { parseBaselinePriceEvidenceReceipt } from "../../../kael/evidence/baseline-price-evidence.ts";

export function buildScopeChangeWorkerQuote(input: {
  estimate: PricedScopeChangeEstimate;
  expiresAt: string;
  incidentId: string;
  jobId: string;
  quoteId: string;
}): EdgeScopeChangeWorkerQuote {
  const balance = input.estimate.stakeholder_balance;
  return {
    schema_version: "scope_change_worker_quote.v1",
    quote_id: input.quoteId,
    incident_id: input.incidentId,
    job_id: input.jobId,
    customer_total: balance.customer_total,
    platform_fee: balance.platform_fee,
    worker_net: balance.worker_net,
    commission_level: balance.commission_level,
    commission_rate_bps: balance.commission_rate_bps,
    reference_price_min: input.estimate.reference_price_min,
    reference_price_max: input.estimate.reference_price_max,
    baseline_used: input.estimate.baseline_used,
    baseline_source: input.estimate.baseline_source,
    baseline_evidence: input.estimate.baseline_evidence,
    ...(input.estimate.pricing_components
      ? { pricing_components: input.estimate.pricing_components }
      : {}),
    selection_rule: input.estimate.selection_rule,
    calculation: input.estimate.pricing_basis.calculation,
    expires_at: input.expiresAt,
  };
}

export function bindAcceptedScopeChangeWorkerQuote(input: {
  estimate: PricedScopeChangeEstimate;
  quoteId: string;
  storedQuote: unknown;
  confirmedAt: string;
}): PricedScopeChangeEstimate | null {
  const quote = parseScopeChangeWorkerQuote(input.storedQuote);
  if (!quote || quote.quote_id !== input.quoteId) return null;
  if (Date.parse(quote.expires_at) <= Date.parse(input.confirmedAt)) return null;
  const expected = input.estimate;
  const balance = expected.stakeholder_balance;
  if (
    quote.customer_total !== balance.customer_total ||
    quote.platform_fee !== balance.platform_fee ||
    quote.worker_net !== balance.worker_net ||
    quote.commission_level !== balance.commission_level ||
    quote.commission_rate_bps !== balance.commission_rate_bps ||
    quote.reference_price_min !== expected.reference_price_min ||
    quote.reference_price_max !== expected.reference_price_max ||
    quote.baseline_used !== expected.baseline_used ||
    quote.baseline_source !== expected.baseline_source ||
    JSON.stringify(quote.baseline_evidence) !==
      JSON.stringify(expected.baseline_evidence) ||
    JSON.stringify(quote.pricing_components ?? null) !==
      JSON.stringify(expected.pricing_components ?? null) ||
    quote.selection_rule !== expected.selection_rule ||
    quote.calculation !== expected.pricing_basis.calculation
  ) {
    return null;
  }
  return {
    ...expected,
    worker_price_confirmation: {
      confirmed: true,
      confirmed_at: input.confirmedAt,
      quote_id: quote.quote_id,
    },
  };
}

export function parseScopeChangeWorkerQuote(
  value: unknown,
): EdgeScopeChangeWorkerQuote | null {
  const quote = asRecord(value);
  const customerTotal = nullableNumber(quote.customer_total);
  const platformFee = nullableNumber(quote.platform_fee);
  const workerNet = nullableNumber(quote.worker_net);
  const commissionLevel = nullableNumber(quote.commission_level);
  const commissionRateBps = nullableNumber(quote.commission_rate_bps);
  const referencePriceMin = nullableNumber(quote.reference_price_min);
  const referencePriceMax = nullableNumber(quote.reference_price_max);
  const quoteId = asString(quote.quote_id);
  const incidentId = asString(quote.incident_id);
  const jobId = asString(quote.job_id);
  const baselineUsed = asString(quote.baseline_used);
  const baselineSource = asString(quote.baseline_source);
  const baselineEvidence = parseBaselinePriceEvidenceReceipt(
    quote.baseline_evidence,
  );
  const pricingComponents = parsePricingComponents(quote.pricing_components);
  const calculation = asString(quote.calculation);
  const expiresAt = asString(quote.expires_at);
  if (
    quote.schema_version !== "scope_change_worker_quote.v1" ||
    quote.selection_rule !==
      "verified_neutral_midpoint_with_bilateral_confirmation" ||
    !quoteId || !incidentId || !jobId || !baselineUsed || !baselineSource ||
    !baselineEvidence ||
    !calculation || !expiresAt || Number.isNaN(Date.parse(expiresAt)) ||
    customerTotal === null || customerTotal <= 0 ||
    platformFee === null || platformFee < 0 ||
    workerNet === null || workerNet <= 0 ||
    platformFee + workerNet !== customerTotal ||
    commissionLevel === null || !Number.isInteger(commissionLevel) ||
    commissionLevel < 1 || commissionRateBps === null ||
    !Number.isInteger(commissionRateBps) || commissionRateBps < 0 ||
    commissionRateBps > 1500 || referencePriceMin === null ||
    referencePriceMax === null || referencePriceMin <= 0 ||
    referencePriceMax < referencePriceMin || customerTotal < referencePriceMin ||
    customerTotal > referencePriceMax ||
    (quote.pricing_components !== undefined && !pricingComponents) ||
    (!pricingComponents &&
      (baselineEvidence.aggregate_price_min !== referencePriceMin ||
        baselineEvidence.aggregate_price_max !== referencePriceMax)) ||
    (pricingComponents &&
      (pricingComponents.reduce((sum, item) => sum + item.price_min, 0) !==
          referencePriceMin ||
        pricingComponents.reduce((sum, item) => sum + item.price_max, 0) !==
          referencePriceMax ||
        pricingComponents.reduce((sum, item) => sum + item.selected_price, 0) !==
          customerTotal ||
        JSON.stringify(
            pricingComponents.find((item) =>
              item.kind === "approved_scope_change"
            )?.evidence_receipt,
          ) !== JSON.stringify(baselineEvidence)))
  ) {
    return null;
  }
  return {
    schema_version: "scope_change_worker_quote.v1",
    quote_id: quoteId,
    incident_id: incidentId,
    job_id: jobId,
    customer_total: customerTotal,
    platform_fee: platformFee,
    worker_net: workerNet,
    commission_level: commissionLevel,
    commission_rate_bps: commissionRateBps,
    reference_price_min: referencePriceMin,
    reference_price_max: referencePriceMax,
    baseline_used: baselineUsed,
    baseline_source: baselineSource,
    baseline_evidence: baselineEvidence,
    ...(pricingComponents ? { pricing_components: pricingComponents } : {}),
    selection_rule: "verified_neutral_midpoint_with_bilateral_confirmation",
    calculation,
    expires_at: expiresAt,
  };
}

function parsePricingComponents(
  value: unknown,
): NonNullable<EdgeScopeChangeWorkerQuote["pricing_components"]> | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 2) return null;
  const parsed = value.map((item) => {
    const record = asRecord(item);
    const evidenceReceipt = parseBaselinePriceEvidenceReceipt(
      record.evidence_receipt,
    );
    const priceMin = nullableNumber(record.price_min);
    const priceMax = nullableNumber(record.price_max);
    const selectedPrice = nullableNumber(record.selected_price);
    const kind = record.kind;
    if (
      !evidenceReceipt ||
      (kind !== "approved_scope_change" && kind !== "original_confirmed_scope") ||
      priceMin === null || priceMin <= 0 ||
      priceMax === null || priceMax < priceMin ||
      selectedPrice === null ||
      selectedPrice !== Math.round(((priceMin + priceMax) / 2) / 1000) * 1000 ||
      evidenceReceipt.aggregate_price_min !== priceMin ||
      evidenceReceipt.aggregate_price_max !== priceMax
    ) {
      return null;
    }
    return {
      evidence_receipt: evidenceReceipt,
      kind,
      price_max: priceMax,
      price_min: priceMin,
      selected_price: selectedPrice,
    };
  });
  if (parsed.some((item) => item === null)) return null;
  const components = parsed as Array<
    NonNullable<EdgeScopeChangeWorkerQuote["pricing_components"]>[number]
  >;
  if (
    !components.some((item) => item.kind === "original_confirmed_scope") ||
    !components.some((item) => item.kind === "approved_scope_change")
  ) {
    return null;
  }
  return components;
}

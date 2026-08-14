import {
  nullableNumber,
  nullableRecord,
} from "../../../platform/coercions.ts";
import { parseBaselinePriceEvidenceReceipt } from "../../../kael/evidence/baseline-price-evidence.ts";

export function hasVerifiedScopeDecisionReceipt(row: Record<string, unknown>) {
  const review = nullableRecord(row.kael_review);
  const priceMin = nullableNumber(row.kael_computed_min);
  const priceMax = nullableNumber(row.kael_computed_max);
  const referenceMin = nullableNumber(review?.reference_price_min);
  const referenceMax = nullableNumber(review?.reference_price_max);
  const balance = nullableRecord(review?.stakeholder_balance);
  const baselineEvidence = parseBaselinePriceEvidenceReceipt(
    review?.baseline_evidence,
  );
  const hasPricingComponents = review?.pricing_components !== undefined;
  const pricingComponents = verifiedScopePricingComponents(review);
  const confirmation = nullableRecord(review?.worker_price_confirmation);
  const customerTotal = nullableNumber(balance?.customer_total);
  const platformFee = nullableNumber(balance?.platform_fee);
  const workerNet = nullableNumber(balance?.worker_net);
  const commissionRateBps = nullableNumber(balance?.commission_rate_bps);
  return priceMin !== null && priceMax !== null && priceMin === priceMax &&
    referenceMin !== null && referenceMax !== null && referenceMax >= referenceMin &&
    priceMin >= referenceMin && priceMax <= referenceMax &&
    review?.price_source === "verified_baseline" &&
    review?.pricing_mode === "full_scope_total" &&
    review?.selection_rule === "verified_neutral_midpoint_with_bilateral_confirmation" &&
    typeof review?.baseline_used === "string" && review.baseline_used.trim().length > 0 &&
    typeof review?.baseline_source === "string" && review.baseline_source.trim().length > 0 &&
    baselineEvidence !== null && (
      hasPricingComponents
        ? pricingComponents !== null &&
          pricingComponents.priceMin === referenceMin &&
          pricingComponents.priceMax === referenceMax &&
          pricingComponents.selectedPrice === priceMax &&
          JSON.stringify(pricingComponents.approvedEvidence) ===
            JSON.stringify(baselineEvidence)
        : baselineEvidence.aggregate_price_min === referenceMin &&
          baselineEvidence.aggregate_price_max === referenceMax
    ) &&
    customerTotal === priceMax && platformFee !== null && platformFee >= 0 &&
    workerNet !== null && workerNet > 0 && platformFee + workerNet === customerTotal &&
    commissionRateBps !== null && commissionRateBps >= 0 && commissionRateBps <= 1500 &&
    balance?.worker_confirmation_required === true &&
    balance?.customer_confirmation_required === true &&
    confirmation?.confirmed === true &&
    typeof confirmation.quote_id === "string" && confirmation.quote_id.trim().length > 0 &&
    typeof confirmation.confirmed_at === "string" &&
    !Number.isNaN(Date.parse(confirmation.confirmed_at));
}

function verifiedScopePricingComponents(review: Record<string, unknown> | null) {
  if (!Array.isArray(review?.pricing_components) ||
    review.pricing_components.length !== 2) return null;
  const components = review.pricing_components.map((value) => {
    const component = nullableRecord(value);
    const evidence = parseBaselinePriceEvidenceReceipt(
      component?.evidence_receipt,
    );
    const priceMin = nullableNumber(component?.price_min);
    const priceMax = nullableNumber(component?.price_max);
    const selectedPrice = nullableNumber(component?.selected_price);
    const kind = component?.kind;
    if (!evidence || priceMin === null || priceMax === null ||
      selectedPrice === null || priceMin <= 0 || priceMax < priceMin ||
      selectedPrice < priceMin || selectedPrice > priceMax ||
      evidence.aggregate_price_min !== priceMin ||
      evidence.aggregate_price_max !== priceMax ||
      (kind !== "approved_scope_change" &&
        kind !== "original_confirmed_scope")) return null;
    return { evidence, kind, priceMax, priceMin, selectedPrice };
  });
  if (components.some((component) => component === null)) return null;
  const valid = components as Array<{
    evidence: NonNullable<ReturnType<typeof parseBaselinePriceEvidenceReceipt>>;
    kind: "approved_scope_change" | "original_confirmed_scope";
    priceMax: number;
    priceMin: number;
    selectedPrice: number;
  }>;
  if (new Set(valid.map((component) => component.kind)).size !== 2) return null;
  return {
    approvedEvidence: valid.find((component) =>
      component.kind === "approved_scope_change"
    )?.evidence ?? null,
    priceMax: valid.reduce((sum, component) => sum + component.priceMax, 0),
    priceMin: valid.reduce((sum, component) => sum + component.priceMin, 0),
    selectedPrice: valid.reduce(
      (sum, component) => sum + component.selectedPrice,
      0,
    ),
  };
}

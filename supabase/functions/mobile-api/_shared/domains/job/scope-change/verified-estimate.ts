import type { ServiceType } from "../../../../../_shared/domain.ts";
import type { ScopeChangeKaelAnalysis } from "../../../kael/index.ts";
import {
  fetchBaselineCandidates,
  resolveVerifiedScopeChangePrice,
} from "../../../kael/tools/synthesis.ts";
import type { DbClient } from "../../../platform/db.ts";
import { getWorkerCommissionTier } from "../../payment/commission.ts";
import type { PricedScopeChangeEstimate } from "./effects-contracts.ts";
import type { BaselinePriceEvidenceReceipt } from "../../../kael/evidence/baseline-price-evidence.ts";

type ScopeChangeAnalysis = Extract<
  ScopeChangeKaelAnalysis,
  { fallback_used: false }
>;

export async function resolveVerifiedEstimate(input: {
  readonly analysis: ScopeChangeAnalysis;
  readonly client: DbClient;
  readonly district: string;
  readonly originalScope?: {
    readonly evidenceReceipt: BaselinePriceEvidenceReceipt;
    readonly priceMax: number;
    readonly priceMin: number;
  };
  readonly scopeExclusions?: {
    readonly materialsExcluded: boolean;
    readonly surfaceFinishExcluded: boolean;
  };
  readonly serviceType: ServiceType;
  readonly workerId: string;
}): Promise<
  | { readonly error: string; readonly success: false }
  | { readonly estimate: PricedScopeChangeEstimate; readonly success: true }
> {
  const candidates = await fetchBaselineCandidates(
    input.client,
    input.serviceType,
    input.analysis.problem_slug,
    input.district,
  );
  const commissionTier = await getWorkerCommissionTier(input.client, input.workerId);
  const price = resolveVerifiedScopeChangePrice({
    candidates,
    commissionTier,
    complexity: input.analysis.complexity_assessment,
    district: input.district,
    originalScope: input.originalScope,
    pricingFactors: {
      accessCondition: input.analysis.pricing_factors.access_condition,
      materialTier: input.analysis.pricing_factors.material_tier,
      quantity: input.analysis.pricing_factors.quantity,
      secondaryDamage: input.analysis.pricing_factors.secondary_damage,
    },
    problemSlug: input.analysis.problem_slug,
    scopeExclusions: input.scopeExclusions,
    serviceType: input.serviceType,
  });
  if (!price.success) return { error: price.error, success: false };

  return {
    success: true,
    estimate: {
      ...input.analysis,
      baseline_district: price.baselineDistrict,
      baseline_evidence: price.baselineEvidence,
      baseline_source: price.baselineSource,
      baseline_used: price.baselineUsed,
      price_max: price.priceMax,
      price_min: price.priceMin,
      price_source: price.priceSource,
      reference_price_max: price.referencePriceMax,
      reference_price_min: price.referencePriceMin,
      selection_rule: price.selectionRule,
      pricing_basis: {
        calculation: price.pricingBasis.calculation,
        quantity: price.pricingBasis.quantity,
        unit: price.pricingBasis.unit,
        unit_price_max: price.pricingBasis.unitPriceMax,
        unit_price_min: price.pricingBasis.unitPriceMin,
      },
      ...(price.pricingComponents
        ? {
          pricing_components: price.pricingComponents.map((component) => ({
            evidence_receipt: component.evidenceReceipt,
            kind: component.kind,
            price_max: component.priceMax,
            price_min: component.priceMin,
            selected_price: component.selectedPrice,
          })),
        }
        : {}),
      pricing_mode: price.pricingMode,
      stakeholder_balance: {
        commission_level: price.stakeholderBalance.commissionLevel,
        commission_rate_bps: price.stakeholderBalance.commissionRateBps,
        customer_confirmation_required:
          price.stakeholderBalance.customerConfirmationRequired,
        customer_total: price.stakeholderBalance.customerTotal,
        platform_fee: price.stakeholderBalance.platformFee,
        worker_confirmation_required:
          price.stakeholderBalance.workerConfirmationRequired,
        worker_net: price.stakeholderBalance.workerNet,
      },
    },
  };
}

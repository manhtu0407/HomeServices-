import { PRICE_DISCLAIMER, type ComplexityLevel, type ServiceType } from "../contracts/types.ts";
import {
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  type ScopeChangeRiskConfig,
} from "./scope-risk.ts";
import { kaelArtifactProposalSchema } from "../contracts/artifact-contract.ts";
import { sanitizeKaelOutputObject, sanitizeKaelText } from "./output-support.ts";
export function buildScopeChangeOutputs(input: {
  serviceType: ServiceType;
  originalPriceMax: number | null;
  newPriceMin: number;
  newPriceMax: number;
  newComplexity: ComplexityLevel;
  hasPhotos: boolean;
  workerDescription: string;
  workerReason: string;
  workerScopeChangeRate: number;
  riskConfig: ScopeChangeRiskConfig;
}) {
  const antiFraud = calculateScopeChangeAnomaly({
    originalPriceMax: input.originalPriceMax,
    newPriceMax: input.newPriceMax,
    hasPhotos: input.hasPhotos,
    description: input.workerDescription,
    reason: input.workerReason,
    workerScopeChangeRate: input.workerScopeChangeRate,
  });
  const margin = calculateScopeChangeMargin({
    newComplexity: input.newComplexity,
    newPriceMax: input.newPriceMax,
    config: input.riskConfig,
  });
  const challengeReasons = [
    ...antiFraud.reasons,
    ...(margin.adminAlert ? ["margin_requires_attention"] : []),
  ];
  const challengeRequired = antiFraud.challengeRequired || margin.adminAlert;
  const workerChallenge = {
    schema_version: "scope_change_worker_challenge.v1" as const,
    challenge_required: challengeRequired,
    challenge_reason: challengeReasons.length > 0
      ? challengeReasons.join(", ")
      : "scope_change_requires_kael_decision",
    requested_evidence: challengeRequired
      ? [
        "Ảnh cận cảnh phần phát sinh",
        "Giải thích phần khác so với phạm vi ban đầu",
      ]
      : ["Giữ mô tả rõ ràng để Kael quyết định và khách dễ kiểm tra"],
    worker_message: challengeRequired
      ? "Kael cần thêm bằng chứng trước khi ra quyết định phạm vi."
      : "Kael đã ghi nhận phạm vi phát sinh và đang quyết định theo chính sách.",
  };
  const newPriceMin = Math.max(1, Math.round(input.newPriceMin));
  const newPriceMax = Math.max(newPriceMin, Math.round(input.newPriceMax));
  const customerCard = {
    schema_version: "scope_change_customer_card.v1" as const,
    service_type: input.serviceType,
    problem_summary: sanitizeKaelText(input.workerDescription, 220),
    price_change: {
      original_price_max: input.originalPriceMax && input.originalPriceMax > 0
        ? Math.round(input.originalPriceMax)
        : null,
      new_price_min: newPriceMin,
      new_price_max: newPriceMax,
    },
    kael_assessment: margin.assessment,
    decision_required: true as const,
    advisory: margin.assessment === "reasonable"
      ? "Kael đã tính lại theo phạm vi thợ báo cáo. Khách có thể đồng ý hoặc khiếu nại nếu bằng chứng chưa đúng."
      : "Mức phát sinh cần được Kael xem kỹ cùng bằng chứng trước khi ra quyết định.",
    disclaimer: PRICE_DISCLAIMER,
  };
  return {
    anti_fraud: {
      drift_ratio: antiFraud.driftRatio,
      score: antiFraud.score,
      challenge_required: challengeRequired,
      admin_flag_required: antiFraud.adminFlagRequired || margin.adminAlert,
      matched_keywords: antiFraud.matchedKeywords,
      reasons: challengeReasons,
      margin,
    },
    worker_challenge: sanitizeKaelOutputObject(workerChallenge),
    customer_card: sanitizeKaelOutputObject(customerCard),
  };
}

// Persists an RFQ or inspection-only request for review: the case moves to offer review without a
// Kael price, and the customer's explicit confirmation stays the only way forward (RULES #4, #7).
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import {
  buildProfileSafetyFlags,
  getKaelPerformanceProfile,
  kaelDiagnosisScopeArtifactSchema,
} from "../../kael/index.ts";
import type { DbClient } from "../../platform/db.ts";
import { asRecord, nullableString } from "../../platform/coercions.ts";
import { appendKaelSystemTurn, updateKaelSession } from "./session-store.ts";
import { buildConfirmedWorkerScopeSummary } from "./estimate-evidence.ts";
import {
  matchingWorkerRequirementsForCase,
  publicMissingTierA,
  type ActiveIntakePolicy,
} from "./estimate-intake-policy.ts";

type KaelPerformanceProfile = NonNullable<ReturnType<typeof getKaelPerformanceProfile>>;
export async function persistUnpricedRequestReview(input: {
  client: DbClient;
  sessionId: string;
  artifact: KaelDiagnosisScopeArtifact;
  profile: KaelPerformanceProfile;
  serviceProblemId: string;
  problemSummary: string;
  customerAnalysisDetail: string;
  problemChips: string[];
  district: string;
  language: "vi" | "en";
  policy: ActiveIntakePolicy;
  safetyFlags: ReturnType<typeof buildProfileSafetyFlags>;
  profileFactCoverage: { facts: Record<string, string>; missing: readonly string[] };
  confidence: number;
  costUsd: number;
}) {
  const { language, client, sessionId, customerAnalysisDetail } = input;
  const safetyStop = input.safetyFlags.find((flag) => flag.severity === "stop");
  const firstMissing = input.policy.missingTierA[0];
  const orderEligible = !firstMissing && !safetyStop;
  const scopeSummary = buildConfirmedWorkerScopeSummary({
    customerAnalysisDetail,
    estimateProblemSummary: input.problemSummary,
    language,
  });
  const question = firstMissing
    ? localizedPolicyQuestion(input.policy, firstMissing, language)
    : null;
  const artifact = kaelDiagnosisScopeArtifactSchema.parse({
    ...input.artifact,
    case_phase: orderEligible ? "offer_review" : "analysis",
    facts: {
      ...input.artifact.facts,
      ...input.profileFactCoverage.facts,
      latest_customer_detail: customerAnalysisDetail,
      address_district: input.district,
      problem_summary: input.problemSummary,
      problem_chips: input.problemChips,
      needs_inspection: input.policy.quoteMode === "inspection_only",
    },
    missing_facts: [...input.policy.missingTierA],
    safety_flags: input.safetyFlags,
    scope_summary: scopeSummary || input.problemSummary,
    quote_ready: false,
    quote_blockers: safetyStop ? [`safety_gate:${safetyStop.code}`] : input.policy.missingTierA,
    worker_requirements: matchingWorkerRequirementsForCase(
      input.profile.worker_capabilities,
      input.policy.capabilityRequirements,
    ),
    confidence: input.confidence,
    next_action: safetyStop
      ? { kind: "escalate", reason: safetyStop.customer_message ?? safetyStop.code }
      : question
        ? { kind: "ask_question", question }
        : { kind: "wait" },
    updated_at: new Date().toISOString(),
  });
  const confirmationKind = input.policy.quoteMode === "rfq"
    ? "rfq_request"
    : "inspection_request";
  const nextAction = input.policy.quoteMode === "rfq" ? "rfq_review" : "inspection_review";
  const intakeCoverage = {
    policy_id: input.policy.policyId,
    policy_version: input.policy.version,
    quote_mode: input.policy.quoteMode,
    order_eligible: orderEligible,
    missing_required_fields: publicMissingTierA(input.policy.missingTierA),
    missing_enrichment_slots: input.policy.tierBSlots
      .filter((slot) => slot.enabled === true)
      .map((slot) => String(slot.key))
      .filter((slot) => !input.profileFactCoverage.facts[slot]),
    safety_blocker: safetyStop
      ? {
        code: safetyStop.code,
        message_vi: safetyStop.customer_message ?? "Yêu cầu cần được kiểm tra an toàn.",
        message_en: safetyStop.customer_message ?? "This request requires a safety review.",
        recoverable: false,
      }
      : null,
    confirmation_kind: orderEligible ? confirmationKind : "none",
    next_action: orderEligible ? nextAction : safetyStop ? "blocked" : "collect_required",
  };
  await updateKaelSession(client, sessionId, {
    case_phase: orderEligible ? "offer_review" : "analysis",
    diagnosis_scope: artifact,
  });
  const readyText = input.policy.quoteMode === "rfq"
    ? (language === "en"
      ? "The required request details are complete. Review the scope, then send it to eligible workers for quotes. Kael is not showing a price yet."
      : "Thông tin bắt buộc đã đủ. Bạn hãy xem lại phạm vi rồi gửi cho thợ phù hợp báo giá. Kael chưa hiển thị giá ở bước này.")
    : (language === "en"
      ? "The required request details are complete. Review the scope, then request an on-site inspection. Kael is not showing a price yet."
      : "Thông tin bắt buộc đã đủ. Bạn hãy xem lại phạm vi rồi yêu cầu thợ khảo sát tại chỗ. Kael chưa hiển thị giá ở bước này.");
  await appendKaelSystemTurn(client, sessionId, {
    contentType: orderEligible ? "analysis" : safetyStop ? "error" : "clarification",
    text: orderEligible ? readyText : safetyStop?.customer_message ?? question ?? readyText,
    nextStatus: orderEligible ? "estimate_ready" : "active",
    costUsd: input.costUsd,
    metadata: {
      diagnosis_scope: artifact,
      intake_coverage: intakeCoverage,
      service_problem_id: input.serviceProblemId,
      quote_readiness: orderEligible ? "worker_quote_or_inspection_ready" : "tier_a_incomplete",
    },
    sessionMetadata: { intake_coverage: intakeCoverage },
  });
}

export function localizedPolicyQuestion(
  policy: ActiveIntakePolicy,
  field: string,
  language: "vi" | "en",
) {
  const override = asRecord(policy.questionOverrides[field]);
  return nullableString(override[language]) ?? (language === "en"
    ? `Please add the required ${field.replaceAll("_", " ")}.`
    : `Bạn vui lòng bổ sung ${field.replaceAll("_", " ")} bắt buộc.`);
}

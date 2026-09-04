import { estimatePriceSourceFromStageLogs } from "../../platform/kael-price-source.ts";
import { formatKaelEstimateText } from "./estimate-copy.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import {
  buildEstimateCardOutput,
  buildPriceEvidenceUnavailableArtifact,
  buildProfileSafetyFlags,
  buildSafetyFirstElectricalEstimate,
  getKaelPerformanceProfile,
  kaelDiagnosisScopeArtifactSchema,
  resolveIntakeFactCoverage,
  type PipelineResult,
  type KaelProgressTarget,
} from "../../kael/index.ts";
import {
  type BaselinePriceEvidenceReceipt,
} from "../../kael/evidence/baseline-price-evidence.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { DbClient } from "../../platform/db.ts";
import { asRecord, nullableString } from "../../platform/coercions.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { intakeObservationMetadata, withIntakeSafetyGuidance } from "./intake-safety.ts";
import { appendKaelSystemTurn, updateKaelSession } from "./session-store.ts";
import { maybeRequestEstimateEvidence } from "./estimate-request-evidence.ts";
import { resolveStage1RuntimeBehavior } from "../release/stage1-release-lane.ts";
import {
  baselineEvidenceFromStageLogs,
  buildConfirmedWorkerScopeSummary,
  buildKaelEstimateAnalysisEvidence,
  buildKaelEstimateMarketEvidence,
  hasValidatedKaelPriceEvidence,
  type KaelEstimateMarketEvidence,
} from "./estimate-evidence.ts";
import {
  loadActiveIntakePolicy,
  publicMissingTierA,
  type ActiveIntakePolicy,
} from "./estimate-intake-policy.ts";
const KAEL_CHAT_SOFT_COST_CAP_USD = 0.5;
type SuccessfulPipeline = Extract<PipelineResult, { success: true }>;
type KaelPerformanceProfile = NonNullable<ReturnType<typeof getKaelPerformanceProfile>>;
type FinalizeKaelChatEstimateInput = {
  readonly client: DbClient;
  readonly sessionId: string;
  readonly artifact: KaelDiagnosisScopeArtifact;
  readonly pipeline: SuccessfulPipeline;
  readonly service_type: ServiceType;
  readonly vision_evidence?: KaelDiagnosisScopeArtifact["evidence"];
  readonly photo_urls?: string[];
  readonly language: "vi" | "en";
  readonly responseSafetySignals: readonly string[];
  readonly criticalSafetyGuidance: string | null;
  readonly electricalPlaybookEnabled: boolean;
  readonly progressTarget: KaelProgressTarget;
  readonly safeCustomerEvidence: string;
  readonly customerAnalysisDetail: string;
  readonly problemChips: string[];
  readonly district: string;
  readonly currentCostUsd: number;
  readonly previousAnalysisReceipt?: Record<string, unknown>;
  readonly environment?: string;
  readonly releaseId?: string;
  readonly deploymentId?: string;
  readonly clientContractEpoch?: number;
};
export {
  buildConfirmedWorkerScopeSummary,
  buildKaelEstimateAnalysisEvidence,
  hasValidatedKaelPriceEvidence,
} from "./estimate-evidence.ts";
export async function finalizeKaelChatEstimate(
  input: FinalizeKaelChatEstimateInput,
) {
  const {
    client,
    sessionId,
    pipeline,
    language,
    responseSafetySignals,
    criticalSafetyGuidance,
    electricalPlaybookEnabled,
    progressTarget,
    safeCustomerEvidence,
    customerAnalysisDetail,
    problemChips,
    district,
    currentCostUsd,
    previousAnalysisReceipt,
  } = input;
  let artifact = input.artifact;
  const costUsd = pipeline.stageLogs.reduce(
    (sum, stage) => sum + (stage.costUsd ?? 0),
    0,
  );
  const estimate = buildSafetyFirstElectricalEstimate(
    pipeline.estimate,
    responseSafetySignals,
    language,
    input.service_type,
  );
  const profile = getKaelPerformanceProfile(input.service_type);
  if (!profile) {
    apiFailure("UNSUPPORTED_SERVICE", language === "en" ? "This service does not have a valid Case Work profile" : "Dịch vụ chưa có hồ sơ Case Work hợp lệ", 400);
  }
  const runtimeBehavior = await resolveStage1RuntimeBehavior(client, {
    environment: input.environment,
    releaseId: input.releaseId,
    sessionId,
    deploymentId: input.deploymentId,
    clientContractEpoch: input.clientContractEpoch,
  });
  if (runtimeBehavior === "previous") {
    await finalizePreviousReleaseEstimate({
      input,
      artifact,
      profile,
      estimate,
      costUsd,
    });
    return;
  }
  const intakePolicy = await loadActiveIntakePolicy({
    ...input,
    serviceProblemId: pipeline.serviceProblemId,
  }, estimate.problem_category);
  if (
    intakePolicy.safetyRequirements.some((requirement) =>
      !profile.safety_capability_gates.some((gate) => gate.id === requirement)
    ) ||
    intakePolicy.capabilityRequirements.some((requirement) =>
      !profile.worker_capabilities.includes(requirement)
    )
  ) {
    apiFailure(
      "POLICY_UNAVAILABLE",
      language === "en"
        ? "The active service policy is incompatible with the service profile."
        : "Chính sách dịch vụ hiện tại không tương thích với hồ sơ dịch vụ.",
      503,
    );
  }
  if (intakePolicy.quoteMode === "blocked") {
    apiFailure(
      "POLICY_BLOCKED",
      language === "en"
        ? "This request cannot continue under the current service policy."
        : "Yêu cầu chưa thể tiếp tục theo chính sách dịch vụ hiện tại.",
      409,
    );
  }
  const profileFactCoverage = resolveIntakeFactCoverage({
    serviceType: input.service_type,
    problemSlug: estimate.problem_category,
    customerDescription: customerAnalysisDetail,
    profileFacts: pipeline.profileFacts ?? {},
    providerMissingSlots: [],
    providerNeedsClarification: false,
    electricalPlaybookEnabled,
  });
  if (intakePolicy.quoteMode !== "kael_auto_quote") {
    await persistUnpricedRequestReview({
      client,
      sessionId,
      artifact,
      serviceProblemId: pipeline.serviceProblemId,
      problemSummary: estimate.problem_summary,
      customerAnalysisDetail,
      problemChips,
      district,
      language,
      policy: intakePolicy,
      profileFactCoverage,
      safetyFlags: buildProfileSafetyFlags(profile, responseSafetySignals, language),
      confidence: estimate.confidence,
      costUsd,
    });
    return;
  }
  const evidenceGateDecision = artifact.facts.evidence_gate_decision;
  if (await maybeRequestEstimateEvidence({
    input,
    artifact,
    profile,
    estimate,
    evidenceGateDecision,
  })) return;
  const safetyFlags = buildProfileSafetyFlags(profile, responseSafetySignals, language);
  const marketEvidence = buildKaelEstimateMarketEvidence(pipeline.stageLogs);
  const baselineEvidence = baselineEvidenceFromStageLogs(pipeline.stageLogs);
  if (!hasValidatedKaelPriceEvidence({
    baselineEvidence,
    marketEvidence,
    requirements: intakePolicy.evidenceRequirements,
  })) {
    const unavailableArtifact = buildPriceEvidenceUnavailableArtifact(artifact, {
      customerDetail: customerAnalysisDetail,
      scopeSummary: estimate.problem_summary,
    });
    await emitKaelChatStep(client, sessionId, progressTarget, {
      artifact: unavailableArtifact,
      turn: {
        contentType: "error",
        text: withIntakeSafetyGuidance(
          language === "en"
            ? "Kael has identified the scope but does not have sufficiently grounded price evidence for this case. No estimate is shown until a verified source or an inspection supports it."
            : "Kael đã xác định phạm vi nhưng chưa có dữ liệu giá đủ căn cứ cho trường hợp này. Kael chưa hiển thị báo giá cho tới khi có nguồn đã kiểm chứng hoặc kết quả khảo sát hỗ trợ.",
          responseSafetySignals,
          language,
        ),
        nextStatus: "active",
        metadata: {
          diagnosis_scope: unavailableArtifact,
          quote_readiness: "validated_price_evidence_unavailable",
          fallback_used: pipeline.fallbackUsed,
          service_problem_id: pipeline.serviceProblemId,
          ...intakeObservationMetadata(pipeline.intakeObservation),
        },
      },
      progress: {
        stage: "price_synthesis",
        status: "failed",
        progress: 1,
        failureReason: "validated_price_evidence_unavailable",
      },
    });
    return;
  }
  await persistValidatedEstimate({
    input,
    artifact,
    profile,
    estimate,
    profileFactCoverage,
    safetyFlags,
    marketEvidence,
    baselineEvidence,
    policy: intakePolicy,
    costUsd,
  });
}

async function finalizePreviousReleaseEstimate(input: {
  input: FinalizeKaelChatEstimateInput;
  artifact: KaelDiagnosisScopeArtifact;
  profile: KaelPerformanceProfile;
  estimate: ReturnType<typeof buildSafetyFirstElectricalEstimate>;
  costUsd: number;
}) {
  const evidenceGateDecision = input.artifact.facts.evidence_gate_decision;
  if (await maybeRequestEstimateEvidence({
    input: input.input,
    artifact: input.artifact,
    profile: input.profile,
    estimate: input.estimate,
    evidenceGateDecision,
  })) return;
  const profileFactCoverage = resolveIntakeFactCoverage({
    serviceType: input.input.service_type,
    problemSlug: input.estimate.problem_category,
    customerDescription: input.input.customerAnalysisDetail,
    profileFacts: input.input.pipeline.profileFacts ?? {},
    providerMissingSlots: [],
    providerNeedsClarification: false,
    electricalPlaybookEnabled: input.input.electricalPlaybookEnabled,
  });
  const safetyFlags = buildProfileSafetyFlags(
    input.profile,
    input.input.responseSafetySignals,
    input.input.language,
  );
  const marketEvidence = buildKaelEstimateMarketEvidence(input.input.pipeline.stageLogs);
  const baselineEvidence = baselineEvidenceFromStageLogs(input.input.pipeline.stageLogs);
  if (!hasValidatedKaelPriceEvidence({ baselineEvidence, marketEvidence })) {
    const unavailableArtifact = buildPriceEvidenceUnavailableArtifact(input.artifact, {
      customerDetail: input.input.customerAnalysisDetail,
      scopeSummary: input.estimate.problem_summary,
    });
    await emitKaelChatStep(
      input.input.client,
      input.input.sessionId,
      input.input.progressTarget,
      {
        artifact: unavailableArtifact,
        turn: {
          contentType: "error",
          text: withIntakeSafetyGuidance(
            input.input.language === "en"
              ? "Kael has identified the scope but does not have sufficiently grounded price evidence for this case. No estimate is shown until a verified source or an inspection supports it."
              : "Kael đã xác định phạm vi nhưng chưa có dữ liệu giá đủ căn cứ cho trường hợp này. Kael chưa hiển thị báo giá cho tới khi có nguồn đã kiểm chứng hoặc kết quả khảo sát hỗ trợ.",
            input.input.responseSafetySignals,
            input.input.language,
          ),
          nextStatus: "active",
          metadata: {
            diagnosis_scope: unavailableArtifact,
            quote_readiness: "validated_price_evidence_unavailable",
            fallback_used: input.input.pipeline.fallbackUsed,
            service_problem_id: input.input.pipeline.serviceProblemId,
            ...intakeObservationMetadata(input.input.pipeline.intakeObservation),
          },
        },
        progress: {
          stage: "price_synthesis",
          status: "failed",
          progress: 1,
          failureReason: "validated_price_evidence_unavailable",
        },
      },
    );
    return;
  }
  await persistPreviousReleaseValidatedEstimate({
    ...input,
    profileFactCoverage,
    safetyFlags,
    marketEvidence,
    baselineEvidence,
  });
}

async function persistPreviousReleaseValidatedEstimate(input: {
  input: FinalizeKaelChatEstimateInput;
  artifact: KaelDiagnosisScopeArtifact;
  profile: KaelPerformanceProfile;
  estimate: ReturnType<typeof buildSafetyFirstElectricalEstimate>;
  profileFactCoverage: ReturnType<typeof resolveIntakeFactCoverage>;
  safetyFlags: ReturnType<typeof buildProfileSafetyFlags>;
  marketEvidence: KaelEstimateMarketEvidence;
  baselineEvidence: BaselinePriceEvidenceReceipt | null;
  costUsd: number;
}) {
  const quoteBlockers = [
    ...input.profileFactCoverage.missing.map((driver) => `missing_profile_fact:${driver}`),
    ...input.safetyFlags.map((flag) => `safety_gate:${flag.code}`),
    ...(input.estimate.needs_inspection ? ["onsite_inspection_required"] : []),
  ];
  const quoteReady = quoteBlockers.length === 0;
  const confirmedWorkerScope = buildConfirmedWorkerScopeSummary({
    customerAnalysisDetail: input.input.customerAnalysisDetail,
    estimateProblemSummary: input.estimate.problem_summary,
    language: input.input.language,
  });
  const quoteReadyArtifact = kaelDiagnosisScopeArtifactSchema.parse({
    ...input.artifact,
    case_phase: quoteReady ? "offer_review" : "analysis",
    facts: {
      ...input.artifact.facts,
      ...input.profileFactCoverage.facts,
      latest_customer_detail: input.input.customerAnalysisDetail,
      address_district: input.input.district,
      problem_summary: input.estimate.problem_summary,
      complexity: input.estimate.complexity,
      problem_chips: input.input.problemChips,
      needs_inspection: input.estimate.needs_inspection === true,
      safety_signals: input.input.responseSafetySignals,
    },
    missing_facts: [...input.profileFactCoverage.missing],
    evidence: input.artifact.evidence,
    safety_flags: input.safetyFlags,
    scope_summary: confirmedWorkerScope,
    quote_ready: quoteReady,
    quote_blockers: quoteBlockers,
    worker_requirements: input.profile.worker_capabilities,
    confidence: input.estimate.confidence,
    next_action: quoteReady
      ? { kind: "prepare_offer" }
      : {
        kind: "escalate",
        reason: input.safetyFlags[0]?.customer_message ??
          input.estimate.needs_inspection_reason ??
          quoteBlockers[0] ??
          "manual_review_required",
      },
    updated_at: new Date().toISOString(),
  });
  await updateKaelSession(input.input.client, input.input.sessionId, {
    case_phase: quoteReady ? "offer_review" : "analysis",
    diagnosis_scope: quoteReadyArtifact,
  });
  const estimateCardV3 = buildEstimateCardOutput({
    estimate: input.estimate,
    language: input.input.language,
    customerScopeContext: input.input.customerAnalysisDetail,
    priceSource: input.estimate.needs_inspection
      ? "inspection_required"
      : estimatePriceSourceFromStageLogs(input.input.pipeline.stageLogs),
    baselineUsed:
      `${input.input.service_type}:${input.input.pipeline.serviceProblemId}:${input.estimate.complexity}`,
    baselineEvidence: input.baselineEvidence,
    analysisEvidence: buildKaelEstimateAnalysisEvidence(
      input.artifact,
      input.input.vision_evidence,
    ),
    marketEvidence: input.marketEvidence,
    marketSignals: input.estimate.market_signals ?? input.estimate.needs_inspection_reason,
    needsInspectionReason: input.estimate.needs_inspection_reason,
    previousAnalysisReceipt: input.input.previousAnalysisReceipt,
    visionAnalysis: input.input.pipeline.visionAnalysis,
    visionFindings: input.input.pipeline.visionAnalysis?.problemSummary,
  });
  await appendKaelSystemTurn(input.input.client, input.input.sessionId, {
    contentType: "estimate",
    text: withIntakeSafetyGuidance(
      formatKaelEstimateText(input.estimate, input.input.language),
      input.input.responseSafetySignals,
      input.input.language,
    ),
    nextStatus: quoteReady ? "estimate_ready" : "active",
    estimate: input.estimate,
    costUsd: input.costUsd,
    metadata: {
      estimate: input.estimate,
      estimate_card_v3: estimateCardV3,
      artifact_proposal: estimateCardV3.artifact_proposal,
      diagnosis_scope: quoteReadyArtifact,
      fallback_used: input.input.pipeline.fallbackUsed,
      service_problem_id: input.input.pipeline.serviceProblemId,
      reference_price_min: input.input.pipeline.referencePriceMin ?? null,
      reference_price_max: input.input.pipeline.referencePriceMax ?? null,
      ...intakeObservationMetadata(input.input.pipeline.intakeObservation),
      photo_count: input.input.photo_urls?.length ?? 0,
      budget_soft_cap_reached:
        input.input.currentCostUsd + input.costUsd >= KAEL_CHAT_SOFT_COST_CAP_USD,
    },
    ...(input.input.pipeline.customerSentiment
      ? { sessionMetadata: { last_customer_sentiment: input.input.pipeline.customerSentiment } }
      : {}),
  });
}

export async function finalizeUnpricedStage1Intake(input: {
  client: DbClient;
  sessionId: string;
  artifact: KaelDiagnosisScopeArtifact;
  serviceProblemId: string;
  serviceType: ServiceType;
  customerAnalysisDetail: string;
  problemChips: string[];
  district: string;
  language: "vi" | "en";
  policy: ActiveIntakePolicy;
  profileFacts: Record<string, string>;
  responseSafetySignals: readonly string[];
  costUsd: number;
}) {
  const profile = getKaelPerformanceProfile(input.serviceType);
  if (!profile || (input.policy.quoteMode !== "rfq" && input.policy.quoteMode !== "inspection_only")) {
    apiFailure("POLICY_UNAVAILABLE", "Chính sách tiếp nhận không hợp lệ", 503);
  }
  if (
    input.policy.safetyRequirements.some((requirement) =>
      !profile.safety_capability_gates.some((gate) => gate.id === requirement)
    ) || input.policy.capabilityRequirements.some((requirement) =>
      !profile.worker_capabilities.includes(requirement)
    )
  ) {
    apiFailure("POLICY_UNAVAILABLE", "Chính sách dịch vụ không tương thích với hồ sơ dịch vụ", 503);
  }
  await persistUnpricedRequestReview({
    client: input.client,
    sessionId: input.sessionId,
    artifact: input.artifact,
    serviceProblemId: input.serviceProblemId,
    problemSummary: input.customerAnalysisDetail,
    customerAnalysisDetail: input.customerAnalysisDetail,
    problemChips: input.problemChips,
    district: input.district,
    language: input.language,
    policy: input.policy,
    profileFactCoverage: { facts: input.profileFacts, missing: [] },
    safetyFlags: buildProfileSafetyFlags(profile, input.responseSafetySignals, input.language),
    confidence: input.artifact.confidence,
    costUsd: input.costUsd,
  });
}

async function persistUnpricedRequestReview(input: {
  client: DbClient;
  sessionId: string;
  artifact: KaelDiagnosisScopeArtifact;
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
    worker_requirements: input.policy.capabilityRequirements,
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

function localizedPolicyQuestion(
  policy: ActiveIntakePolicy,
  field: string,
  language: "vi" | "en",
) {
  const override = asRecord(policy.questionOverrides[field]);
  return nullableString(override[language]) ?? (language === "en"
    ? `Please add the required ${field.replaceAll("_", " ")}.`
    : `Bạn vui lòng bổ sung ${field.replaceAll("_", " ")} bắt buộc.`);
}

async function persistValidatedEstimate(input: {
  input: FinalizeKaelChatEstimateInput;
  artifact: KaelDiagnosisScopeArtifact;
  profile: KaelPerformanceProfile;
  estimate: ReturnType<typeof buildSafetyFirstElectricalEstimate>;
  profileFactCoverage: ReturnType<typeof resolveIntakeFactCoverage>;
  safetyFlags: ReturnType<typeof buildProfileSafetyFlags>;
  marketEvidence: KaelEstimateMarketEvidence;
  baselineEvidence: BaselinePriceEvidenceReceipt | null;
  policy: ActiveIntakePolicy;
  costUsd: number;
}) {
  const {
    artifact,
    baselineEvidence,
    estimate,
    profileFactCoverage,
    safetyFlags,
    marketEvidence,
    policy,
    costUsd,
  } = input;
  const { client, sessionId, pipeline, language, customerAnalysisDetail } = input.input;
  const requiredEnrichmentSlots = policy.tierBSlots
    .filter((slot) => slot.enabled === true && slot.required_for_quote === true)
    .map((slot) => String(slot.key));
  const missingRequiredEnrichment = profileFactCoverage.missing
    .filter((field) => requiredEnrichmentSlots.includes(field));
  const safetyStop = safetyFlags.find((flag) => flag.severity === "stop");
  const quoteBlockers = [
    ...policy.missingTierA,
    ...missingRequiredEnrichment.map((driver) => `missing_profile_fact:${driver}`),
    ...(safetyStop ? [`safety_gate:${safetyStop.code}`] : []),
    ...(estimate.needs_inspection ? ["onsite_inspection_required"] : []),
  ];
  const quoteReady = quoteBlockers.length === 0;
  const confirmedWorkerScope = buildConfirmedWorkerScopeSummary({
    customerAnalysisDetail,
    estimateProblemSummary: estimate.problem_summary,
    language,
  });
  const quoteReadyArtifact = kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: quoteReady ? "offer_review" : "analysis",
    facts: {
      ...artifact.facts,
      ...profileFactCoverage.facts,
      latest_customer_detail: customerAnalysisDetail,
      address_district: input.input.district,
      problem_summary: estimate.problem_summary,
      complexity: estimate.complexity,
      problem_chips: input.input.problemChips,
      needs_inspection: estimate.needs_inspection === true,
      safety_signals: input.input.responseSafetySignals,
    },
    missing_facts: [...profileFactCoverage.missing],
    evidence: artifact.evidence,
    safety_flags: safetyFlags,
    scope_summary: confirmedWorkerScope,
    quote_ready: quoteReady,
    quote_blockers: quoteBlockers,
    worker_requirements: [...new Set([
      ...input.profile.worker_capabilities,
      ...policy.capabilityRequirements,
    ])],
    confidence: estimate.confidence,
    next_action: quoteReady
      ? { kind: "prepare_offer" }
      : {
        kind: "escalate",
        reason: safetyFlags[0]?.customer_message ??
          estimate.needs_inspection_reason ??
          quoteBlockers[0] ??
          "manual_review_required",
      },
    updated_at: new Date().toISOString(),
  });
  await updateKaelSession(client, sessionId, {
    case_phase: quoteReady ? "offer_review" : "analysis",
    diagnosis_scope: quoteReadyArtifact,
  });
  const intakeCoverage = {
    policy_id: policy.policyId,
    policy_version: policy.version,
    quote_mode: policy.quoteMode,
    order_eligible: quoteReady,
    missing_required_fields: publicMissingTierA(policy.missingTierA),
    missing_enrichment_slots: profileFactCoverage.missing,
    safety_blocker: safetyStop
      ? {
        code: safetyStop.code,
        message_vi: safetyStop.customer_message ?? "Yêu cầu cần được kiểm tra an toàn.",
        message_en: safetyStop.customer_message ?? "This request requires a safety review.",
        recoverable: false,
      }
      : null,
    confirmation_kind: quoteReady ? "priced_offer" : "none",
    next_action: quoteReady ? "offer_review" : "collect_required",
  };
  if (!quoteReady) {
    const missingField = policy.missingTierA[0] ?? missingRequiredEnrichment[0];
    const guidance = safetyStop?.customer_message ??
      (missingField ? localizedPolicyQuestion(policy, missingField, language) : null) ??
      estimate.needs_inspection_reason ??
      (language === "en"
        ? "Kael needs one more verified detail before an offer can be shown."
        : "Kael cần thêm một thông tin đã kiểm chứng trước khi hiển thị báo giá.");
    await appendKaelSystemTurn(client, sessionId, {
      contentType: safetyStop ? "error" : "clarification",
      text: withIntakeSafetyGuidance(
        guidance,
        input.input.responseSafetySignals,
        language,
      ),
      nextStatus: "active",
      costUsd,
      metadata: {
        diagnosis_scope: quoteReadyArtifact,
        intake_coverage: intakeCoverage,
        service_problem_id: pipeline.serviceProblemId,
        quote_readiness: "required_intake_incomplete",
      },
      sessionMetadata: {
        intake_coverage: intakeCoverage,
        ...(pipeline.customerSentiment
          ? { last_customer_sentiment: pipeline.customerSentiment }
          : {}),
      },
    });
    return;
  }
  const estimateCardV3 = buildEstimateCardOutput({
    estimate,
    language,
    customerScopeContext: customerAnalysisDetail,
    priceSource: estimate.needs_inspection
      ? "inspection_required"
      : estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      `${input.input.service_type}:${pipeline.serviceProblemId}:${estimate.complexity}`,
    baselineEvidence,
    analysisEvidence: buildKaelEstimateAnalysisEvidence(
      artifact,
      input.input.vision_evidence,
    ),
    marketEvidence,
    marketSignals: estimate.market_signals ?? estimate.needs_inspection_reason,
    needsInspectionReason: estimate.needs_inspection_reason,
    previousAnalysisReceipt: input.input.previousAnalysisReceipt,
    visionAnalysis: pipeline.visionAnalysis,
    visionFindings: pipeline.visionAnalysis?.problemSummary,
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "estimate",
    text: withIntakeSafetyGuidance(
      formatKaelEstimateText(estimate, language),
      input.input.responseSafetySignals,
      language,
      true,
      input.input.service_type,
    ),
    nextStatus: quoteReady ? "estimate_ready" : "active",
    estimate,
    costUsd,
    metadata: {
      estimate,
      estimate_card_v3: estimateCardV3,
      artifact_proposal: estimateCardV3.artifact_proposal,
      diagnosis_scope: quoteReadyArtifact,
      intake_coverage: intakeCoverage,
      fallback_used: pipeline.fallbackUsed,
      service_problem_id: pipeline.serviceProblemId,
      // Kept beside `estimate`, not inside it: the estimate object is the customer-facing
      // shape, and the reference band is server-only learning input. Turn reads for the
      // client select text columns and never safe_metadata.
      reference_price_min: pipeline.referencePriceMin ?? null,
      reference_price_max: pipeline.referencePriceMax ?? null,
      ...intakeObservationMetadata(pipeline.intakeObservation),
      photo_count: input.input.photo_urls?.length ?? 0,
      budget_soft_cap_reached:
        input.input.currentCostUsd + costUsd >= KAEL_CHAT_SOFT_COST_CAP_USD,
    },
    sessionMetadata: {
      intake_coverage: intakeCoverage,
      ...(pipeline.customerSentiment
        ? { last_customer_sentiment: pipeline.customerSentiment }
        : {}),
    },
  });
}

export { publicMissingTierA } from "./estimate-intake-policy.ts";

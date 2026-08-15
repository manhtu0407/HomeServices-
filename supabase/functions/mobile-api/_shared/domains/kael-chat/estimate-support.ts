import { estimatePriceSourceFromStageLogs } from "../../platform/kael-price-source.ts";
import { formatKaelEstimateText } from "./estimate-copy.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import {
  buildEstimateCardOutput,
  buildKaelMissingInfoArtifactProposal,
  buildPriceEvidenceUnavailableArtifact,
  buildProfileSafetyFlags,
  buildSafetyFirstElectricalEstimate,
  getKaelPerformanceProfile,
  kaelDiagnosisScopeArtifactSchema,
  resolveCaseWorkEvidenceRequest,
  resolveIntakeFactCoverage,
  type PipelineResult,
  type KaelProgressTarget,
} from "../../kael/index.ts";
import type { PipelineStageLog } from "../../kael/contracts/types.ts";
import {
  parseBaselinePriceEvidenceReceipt,
  type BaselinePriceEvidenceReceipt,
} from "../../kael/evidence/baseline-price-evidence.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { DbClient } from "../../platform/db.ts";
import { diagnosisScopeWithEvidenceRequest } from "./case-work-artifact.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { intakeObservationMetadata, withIntakeSafetyGuidance } from "./intake-safety.ts";
import { appendKaelSystemTurn, updateKaelSession } from "./session-store.ts";
import {
  customerContextClauses,
  customerDeclaredScope,
  isBookingMetadataClause,
  isCustomerInstruction,
  isDeclaredScopeClause,
  isDeclaredUnknownClause,
  publicReceiptTextList,
} from "../../kael/kael-guardrails/price-reasoning-text.ts";
const KAEL_CHAT_SOFT_COST_CAP_USD = 0.5;
const CONFIRMED_WORKER_SCOPE_MAX_LENGTH = 2000;
const PRICE_PRESSURE_CLAUSE = /\b(?:giá thấp nhất|chốt[^.]{0,40}\bgiá|lowest price|cheapest)\b/iu;
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
};
export function buildKaelEstimateAnalysisEvidence(
  artifact: KaelDiagnosisScopeArtifact,
  analyzedEvidence: readonly KaelDiagnosisScopeArtifact["evidence"][number][] = artifact.evidence,
) {
  const visualEvidence = artifact.evidence.filter(isModelEligibleVisualEvidence);
  const evidenceIndexByRef = new Map<
    string,
    { evidenceIndex: number; evidenceKind: "photo" | "video_frame" }
  >();
  let photoIndex = 0;
  let videoFrameIndex = 0;
  for (const evidence of visualEvidence) {
    const evidenceIndex = evidence.kind === "photo" ? ++photoIndex : ++videoFrameIndex;
    if (evidence.ref) {
      evidenceIndexByRef.set(evidence.ref, {
        evidenceIndex,
        evidenceKind: evidence.kind,
      });
    }
  }
  const visualEvidenceRefs = analyzedEvidence
    .filter(isModelEligibleVisualEvidence)
    .flatMap((evidence) => {
      const reference = evidence.ref ? evidenceIndexByRef.get(evidence.ref) : undefined;
      return reference ? [reference] : [];
    });
  return {
    photoCount: visualEvidence.filter((item) => item.kind === "photo").length,
    videoFrameCount: visualEvidence.filter((item) => item.kind === "video_frame").length,
    voiceTranscriptCount: artifact.evidence.filter((item) =>
      item.kind === "voice_transcript" && item.model_eligible
    ).length,
    skipped: artifact.facts.evidence_gate_decision === "skipped",
    visualEvidenceRefs,
  };
}
function isModelEligibleVisualEvidence(
  item: KaelDiagnosisScopeArtifact["evidence"][number],
): item is KaelDiagnosisScopeArtifact["evidence"][number] & {
  kind: "photo" | "video_frame";
} {
  return (item.kind === "photo" || item.kind === "video_frame") && item.model_eligible;
}
function buildKaelEstimateMarketEvidence(
  stageLogs: readonly PipelineStageLog[],
) {
  const metadata = stageLogs.find((stage) => stage.stage === "market")
    ?.safeMetadata;
  return {
    acceptedSourceCount: nonNegativeMetadataInteger(
      metadata?.source_trust_accepted_source_count,
    ),
    highTrustSourceCount: nonNegativeMetadataInteger(
      metadata?.source_trust_tier_1_2_count,
    ),
    quorumMet: typeof metadata?.source_trust_quorum_met === "boolean"
      ? metadata.source_trust_quorum_met
      : null,
  };
}

function baselineEvidenceFromStageLogs(
  stageLogs: readonly PipelineStageLog[],
): BaselinePriceEvidenceReceipt | null {
  return parseBaselinePriceEvidenceReceipt(
    stageLogs.find((stage) => stage.stage === "baseline")
      ?.safeMetadata?.baseline_price_evidence_receipt,
  );
}

export function buildConfirmedWorkerScopeSummary(input: {
  customerAnalysisDetail: string;
  estimateProblemSummary: string;
  language: "vi" | "en";
}) {
  const factualClauses = customerContextClauses(input.customerAnalysisDetail)
    .map((clause) => clause.replace(
      /,?\s*(?:hãy|khỏi|please|just)\b.*$/iu,
      "",
    ).trim())
    .filter((clause) =>
      clause.length > 0 &&
      !isBookingMetadataClause(clause) &&
      !PRICE_PRESSURE_CLAUSE.test(clause) &&
      !isCustomerInstruction(clause) &&
      !isDeclaredScopeClause(clause) &&
      !isDeclaredUnknownClause(clause)
    );
  const confirmedFacts = publicReceiptTextList(
    factualClauses,
    input.estimateProblemSummary,
    7,
    260,
  );
  const declaredScope = customerDeclaredScope(
    input.customerAnalysisDetail,
    input.language,
  );
  const uniqueLines = new Map<string, string>();
  for (const line of [
    ...confirmedFacts,
    ...declaredScope.included,
    ...declaredScope.excluded,
  ]) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!normalized || PRICE_PRESSURE_CLAUSE.test(normalized)) continue;
    const key = normalized.toLocaleLowerCase(input.language === "vi" ? "vi" : "en");
    if (!uniqueLines.has(key)) uniqueLines.set(key, normalized);
  }
  return [...uniqueLines.values()]
    .join("\n")
    .slice(0, CONFIRMED_WORKER_SCOPE_MAX_LENGTH)
    .trim();
}

type KaelEstimateMarketEvidence = ReturnType<
  typeof buildKaelEstimateMarketEvidence
>;

export function hasValidatedKaelPriceEvidence(input: {
  baselineEvidence?: BaselinePriceEvidenceReceipt | null;
  marketEvidence: KaelEstimateMarketEvidence;
}) {
  const hasVerifiedBaselineQuorum = Boolean(
    input.baselineEvidence?.quorum_met === true &&
      input.baselineEvidence.high_trust_source_count >=
        input.baselineEvidence.required_quorum &&
      input.baselineEvidence.accepted_source_count ===
        input.baselineEvidence.sources.length,
  );
  const hasTrustedMarketQuorum =
    input.marketEvidence.quorumMet === true &&
    (input.marketEvidence.acceptedSourceCount ?? 0) >= 2 &&
    (input.marketEvidence.highTrustSourceCount ?? 0) >= 1;
  return hasVerifiedBaselineQuorum || hasTrustedMarketQuorum;
}
function nonNegativeMetadataInteger(value: unknown): number | null {
  return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
    ? value
    : null;
}
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
  );
  const profile = getKaelPerformanceProfile(input.service_type);
  if (!profile) {
    apiFailure("UNSUPPORTED_SERVICE", language === "en" ? "This service does not have a valid Case Work profile" : "Dịch vụ chưa có hồ sơ Case Work hợp lệ", 400);
  }
  const evidenceGateDecision = artifact.facts.evidence_gate_decision;
  if (await maybeRequestEstimateEvidence({
    input,
    artifact,
    profile,
    estimate,
    evidenceGateDecision,
  })) return;
  const profileFactCoverage = resolveIntakeFactCoverage({
    serviceType: input.service_type,
    problemSlug: estimate.problem_category,
    customerDescription: customerAnalysisDetail,
    profileFacts: pipeline.profileFacts ?? {},
    providerMissingSlots: [],
    providerNeedsClarification: false,
    electricalPlaybookEnabled,
  });
  const safetyFlags = buildProfileSafetyFlags(profile, responseSafetySignals, language);
  const marketEvidence = buildKaelEstimateMarketEvidence(pipeline.stageLogs);
  const baselineEvidence = baselineEvidenceFromStageLogs(pipeline.stageLogs);
  if (!hasValidatedKaelPriceEvidence({
    baselineEvidence,
    marketEvidence,
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
    costUsd,
  });
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
  costUsd: number;
}) {
  const {
    artifact,
    baselineEvidence,
    estimate,
    profileFactCoverage,
    safetyFlags,
    marketEvidence,
    costUsd,
  } = input;
  const { client, sessionId, pipeline, language, customerAnalysisDetail } = input.input;
  const quoteBlockers = [
    ...profileFactCoverage.missing.map((driver) => `missing_profile_fact:${driver}`),
    ...safetyFlags.map((flag) => `safety_gate:${flag.code}`),
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
    worker_requirements: input.profile.worker_capabilities,
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
    ),
    nextStatus: quoteReady ? "estimate_ready" : "active",
    estimate,
    costUsd,
    metadata: {
      estimate,
      estimate_card_v3: estimateCardV3,
      artifact_proposal: estimateCardV3.artifact_proposal,
      diagnosis_scope: quoteReadyArtifact,
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
    ...(pipeline.customerSentiment
      ? { sessionMetadata: { last_customer_sentiment: pipeline.customerSentiment } }
      : {}),
  });
}

async function maybeRequestEstimateEvidence(input: {
  input: FinalizeKaelChatEstimateInput;
  artifact: KaelDiagnosisScopeArtifact;
  profile: KaelPerformanceProfile;
  estimate: ReturnType<typeof buildSafetyFirstElectricalEstimate>;
  evidenceGateDecision: KaelDiagnosisScopeArtifact["facts"]["evidence_gate_decision"];
}): Promise<boolean> {
  const evidenceRequest = resolveCaseWorkEvidenceRequest({
    serviceType: input.input.service_type,
    problemCategory: input.estimate.problem_category,
    customerMessage: input.input.safeCustomerEvidence,
    evidence: input.artifact.evidence,
    evidenceDecision: input.evidenceGateDecision === "confirmed" || input.evidenceGateDecision === "skipped"
      ? input.evidenceGateDecision
      : undefined,
    language: input.input.language,
  });
  if (!evidenceRequest || input.input.criticalSafetyGuidance) return false;
  const evidenceArtifact = diagnosisScopeWithEvidenceRequest(
    input.artifact,
    evidenceRequest,
    {
      customerDetail: input.input.customerAnalysisDetail,
      problemSummary: input.estimate.problem_summary,
      complexity: input.estimate.complexity,
      problemChips: input.input.problemChips,
      workerRequirements: input.profile.worker_capabilities,
      confidence: input.estimate.confidence,
    },
  );
  await emitKaelChatStep(input.input.client, input.input.sessionId, input.input.progressTarget, {
    artifact: evidenceArtifact,
    turn: {
      contentType: "clarification",
      text: withIntakeSafetyGuidance(
        evidenceRequest.prompt,
        input.input.responseSafetySignals,
        input.input.language,
      ),
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: [evidenceRequest.blocker],
          question: evidenceRequest.prompt,
          confidence: Math.min(input.estimate.confidence, 0.65),
          artifactType: "ai_notes",
        }),
        diagnosis_scope: evidenceArtifact,
        ...intakeObservationMetadata(input.input.pipeline.intakeObservation),
      },
    },
    progress: { stage: "clarification", status: "completed", progress: 1 },
  });
  return true;
}

import { estimatePriceSourceFromStageLogs } from "../../platform/kael-price-source.ts";
import { formatKaelEstimateText } from "./estimate-copy.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import {
  buildEstimateCardOutput,
  buildKaelMissingInfoArtifactProposal,
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
import { apiFailure } from "../../platform/api-failure.ts";
import type { DbClient } from "../../platform/db.ts";
import { diagnosisScopeWithEvidenceRequest } from "./case-work-artifact.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { intakeObservationMetadata, withIntakeSafetyGuidance } from "./intake-safety.ts";
import { appendKaelSystemTurn, updateKaelSession } from "./session-store.ts";
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
    profileFacts: pipeline.profileFacts ?? {},
    providerMissingSlots: [],
    providerNeedsClarification: false,
    electricalPlaybookEnabled,
  });
  const safetyFlags = buildProfileSafetyFlags(profile, responseSafetySignals, language);
  const quoteBlockers = [
    ...profileFactCoverage.missing.map((driver) => `missing_profile_fact:${driver}`),
    ...safetyFlags.map((flag) => `safety_gate:${flag.code}`),
    ...(estimate.needs_inspection ? ["onsite_inspection_required"] : []),
  ];
  const quoteReady = quoteBlockers.length === 0;
  const quoteReadyArtifact = kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: quoteReady ? "offer_review" : "analysis",
    facts: {
      ...artifact.facts,
      ...profileFactCoverage.facts,
      latest_customer_detail: customerAnalysisDetail,
      address_district: district,
      problem_summary: estimate.problem_summary,
      complexity: estimate.complexity,
      problem_chips: problemChips,
      needs_inspection: estimate.needs_inspection === true,
      safety_signals: responseSafetySignals,
    },
    missing_facts: [...profileFactCoverage.missing],
    evidence: artifact.evidence,
    safety_flags: safetyFlags,
    scope_summary: estimate.problem_summary,
    quote_ready: quoteReady,
    quote_blockers: quoteBlockers,
    worker_requirements: profile.worker_capabilities,
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
    priceSource: estimate.needs_inspection
      ? "inspection_required"
      : estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      `${input.service_type}:${pipeline.serviceProblemId}:${estimate.complexity}`,
    analysisEvidence: buildKaelEstimateAnalysisEvidence(
      artifact,
      input.vision_evidence,
    ),
    marketEvidence: buildKaelEstimateMarketEvidence(pipeline.stageLogs),
    marketSignals: estimate.market_signals ?? estimate.needs_inspection_reason,
    needsInspectionReason: estimate.needs_inspection_reason,
    previousAnalysisReceipt,
    visionAnalysis: pipeline.visionAnalysis,
    visionFindings: pipeline.visionAnalysis?.problemSummary,
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "estimate",
    text: withIntakeSafetyGuidance(
      formatKaelEstimateText(estimate, language),
      responseSafetySignals,
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
      photo_count: input.photo_urls?.length ?? 0,
      budget_soft_cap_reached:
        currentCostUsd + costUsd >= KAEL_CHAT_SOFT_COST_CAP_USD,
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

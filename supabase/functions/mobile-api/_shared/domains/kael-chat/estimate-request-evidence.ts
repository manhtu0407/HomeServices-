import type { ServiceType } from "../../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import {
  buildKaelMissingInfoArtifactProposal,
  buildSafetyFirstElectricalEstimate,
  getKaelPerformanceProfile,
  resolveCaseWorkEvidenceRequest,
  type KaelProgressTarget,
  type PipelineResult,
} from "../../kael/index.ts";
import type { DbClient } from "../../platform/db.ts";
import { diagnosisScopeWithEvidenceRequest } from "./case-work-artifact.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { intakeObservationMetadata, withIntakeSafetyGuidance } from "./intake-safety.ts";

type SuccessfulPipeline = Extract<PipelineResult, { success: true }>;
type KaelPerformanceProfile = NonNullable<ReturnType<typeof getKaelPerformanceProfile>>;

export async function maybeRequestEstimateEvidence(input: {
  input: {
    client: DbClient;
    sessionId: string;
    service_type: ServiceType;
    safeCustomerEvidence: string;
    criticalSafetyGuidance: string | null;
    language: "vi" | "en";
    customerAnalysisDetail: string;
    problemChips: string[];
    responseSafetySignals: readonly string[];
    pipeline: SuccessfulPipeline;
    progressTarget: KaelProgressTarget;
  };
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

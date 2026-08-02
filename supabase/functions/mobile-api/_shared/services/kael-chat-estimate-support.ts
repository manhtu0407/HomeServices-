import type { KaelDiagnosisScopeArtifact } from "../kael/artifact-contract.ts";
import type { PipelineStageLog } from "../kael/types.ts";

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

export function buildKaelEstimateMarketEvidence(
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

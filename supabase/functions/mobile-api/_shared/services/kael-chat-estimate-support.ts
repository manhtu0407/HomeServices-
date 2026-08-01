import type { KaelDiagnosisScopeArtifact } from "../kael/artifact-contract.ts";
import type { PipelineStageLog } from "../kael/types.ts";

export function buildKaelEstimateAnalysisEvidence(
  artifact: KaelDiagnosisScopeArtifact,
) {
  return {
    photoCount: artifact.evidence.filter((item) =>
      item.kind === "photo" && item.model_eligible
    ).length,
    videoFrameCount: artifact.evidence.filter((item) =>
      item.kind === "video_frame" && item.model_eligible
    ).length,
    voiceTranscriptCount: artifact.evidence.filter((item) =>
      item.kind === "voice_transcript" && item.model_eligible
    ).length,
    skipped: artifact.facts.evidence_gate_decision === "skipped",
  };
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

import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import type { PipelineStageLog } from "../../kael/contracts/types.ts";
import {
  parseBaselinePriceEvidenceReceipt,
  type BaselinePriceEvidenceReceipt,
} from "../../kael/evidence/baseline-price-evidence.ts";
import {
  customerContextClauses,
  customerDeclaredScope,
  isBookingMetadataClause,
  isCustomerInstruction,
  isDeclaredScopeClause,
  isDeclaredUnknownClause,
  publicReceiptTextList,
} from "../../kael/kael-guardrails/price-reasoning-text.ts";

const CONFIRMED_WORKER_SCOPE_MAX_LENGTH = 2000;
const PRICE_PRESSURE_CLAUSE = /\b(?:giá thấp nhất|chốt[^.]{0,40}\bgiá|lowest price|cheapest)\b/iu;

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

export function baselineEvidenceFromStageLogs(
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

export type KaelEstimateMarketEvidence = ReturnType<
  typeof buildKaelEstimateMarketEvidence
>;

export function hasValidatedKaelPriceEvidence(input: {
  baselineEvidence?: BaselinePriceEvidenceReceipt | null;
  marketEvidence: KaelEstimateMarketEvidence;
  requirements?: {
    minimumSourceCount: number;
    minimumHighTrustSourceCount: number;
    requiresActiveBaseline: boolean;
  };
}) {
  const minimumSourceCount = input.requirements?.minimumSourceCount ?? 2;
  const minimumHighTrustSourceCount = input.requirements?.minimumHighTrustSourceCount ?? 1;
  const hasVerifiedBaselineQuorum = Boolean(
    input.baselineEvidence?.quorum_met === true &&
      input.baselineEvidence.high_trust_source_count >=
        Math.max(input.baselineEvidence.required_quorum, minimumHighTrustSourceCount) &&
      input.baselineEvidence.accepted_source_count >= minimumSourceCount &&
      input.baselineEvidence.accepted_source_count ===
        input.baselineEvidence.sources.length,
  );
  if (input.requirements?.requiresActiveBaseline) return hasVerifiedBaselineQuorum;
  const hasTrustedMarketQuorum =
    input.marketEvidence.quorumMet === true &&
    (input.marketEvidence.acceptedSourceCount ?? 0) >= minimumSourceCount &&
    (input.marketEvidence.highTrustSourceCount ?? 0) >= minimumHighTrustSourceCount;
  return hasVerifiedBaselineQuorum || hasTrustedMarketQuorum;
}

function nonNegativeMetadataInteger(value: unknown): number | null {
  return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
    ? value
    : null;
}

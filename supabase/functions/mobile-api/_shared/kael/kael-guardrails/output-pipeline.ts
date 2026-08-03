import type { ComplexityLevel, KaelEstimate, ServiceType } from "../contracts/types.ts";
import { PRICE_DISCLAIMER, priceDisclaimer } from "../contracts/types.ts";
import {
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  type ScopeChangeRiskConfig,
} from "./scope-risk.ts";
import { kaelArtifactProposalSchema } from "../contracts/artifact-contract.ts";
import { looksLikePrivateUnitIdentifier } from "../pipeline/utils.ts";
import { customerVisibleKaelProblemSummary } from "../language/user-facing-copy.ts";

export type EstimatePriceSource =
  | "perplexity_validated"
  | "baseline_with_market"
  | "baseline_only"
  | "inspection_required";

export type EstimateCardV3 = {
  service_type: ServiceType;
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  confidence: "low" | "medium" | "high";
  needs_inspection: boolean;
  price_source: EstimatePriceSource;
  kael_reasoning: {
    vision_findings?: string;
    market_signals?: string;
    baseline_used: string;
    complexity_reasoning: string;
    needs_inspection_reason?: string;
  };
  analysis_receipt?: EstimateAnalysisReceipt;
  advisory?: string;
  disclaimer: string;
};

export type EstimateAnalysisReceipt = {
  schema_version: "analysis_receipt.v1";
  evidence: {
    analysis_status?: "analyzed" | "not_provided" | "unavailable";
    findings?: Array<{
      confidence: "low" | "medium" | "high";
      evidence_index: number;
      evidence_kind: "photo" | "video_frame";
      observation: string;
      possible_meaning: string | null;
    }>;
    photo_count: number;
    video_frame_count: number;
    voice_transcript_count: number;
    skipped: boolean;
  };
  market: {
    accepted_source_count: number | null;
    high_trust_source_count: number | null;
    quorum_met: boolean | null;
  };
  problem?: {
    remaining_uncertainty: string | null;
    recommended_scope: string | null;
    severity_indicators: string[];
    summary: string;
  };
};

export type WorkerBrief = {
  schema_version: "worker_brief.v1";
  stage: "core" | "guidance";
  visibility: "pre_accept" | "post_accept";
  service_type: ServiceType;
  problem_summary: string;
  district: string;
  full_address: {
    building: string | null;
    floor: string | null;
    unit: string | null;
    district: string | null;
  } | null;
  estimated_earning_min?: number | null;
  estimated_earning_max?: number | null;
  sections: {
    context: string[];
    guidance: string[];
    safety: string[];
  };
};

type PipelineSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export function runKaelOutputPipeline<TInput, TSanitized, TOutput>(input: {
  raw: TInput;
  fallback: TSanitized;
  schema: PipelineSchema<TSanitized>;
  sanitize(value: TSanitized): TSanitized;
  render(value: TSanitized): TOutput;
}) {
  const parsed = input.schema.safeParse(input.raw);
  const value = parsed.success ? parsed.data : input.fallback;
  const sanitized = input.sanitize(value);
  const finalParsed = input.schema.safeParse(sanitized);
  const output = input.render(finalParsed.success ? finalParsed.data : input.fallback);
  return {
    output,
    fallback_used: !parsed.success || !finalParsed.success,
  };
}

export function buildEstimateCardOutput(input: {
  estimate: KaelEstimate;
  language?: "vi" | "en";
  priceSource?: EstimatePriceSource;
  baselineUsed: string | null;
  analysisEvidence?: {
    photoCount: number;
    videoFrameCount: number;
    voiceTranscriptCount: number;
    skipped: boolean;
    visualEvidenceRefs?: Array<{
      evidenceIndex: number;
      evidenceKind: "photo" | "video_frame";
    }>;
  };
  marketEvidence?: {
    acceptedSourceCount: number | null;
    highTrustSourceCount: number | null;
    quorumMet: boolean | null;
  };
  visionFindings?: string | null;
  visionAnalysis?: {
    analysisStatus?: "analyzed" | "not_provided" | "unavailable";
    evidenceFindings?: Array<{
      confidence: "low" | "medium" | "high";
      evidenceIndex: number;
      observation: string;
      possibleMeaning: string | null;
    }>;
    problemSummary: string;
    recommendedScope?: string | null;
    remainingUncertainty?: string | null;
    severityIndicators: string[];
  };
  marketSignals?: string | null;
  needsInspectionReason?: string | null;
  previousAnalysisReceipt?: unknown;
}) {
  const language = input.language ?? "vi";
  const confidence = numericConfidenceToLabel(input.estimate.confidence);
  const needsInspection = input.estimate.needs_inspection === true ||
    input.priceSource === "inspection_required";
  const card: EstimateCardV3 = {
    service_type: input.estimate.service_type,
    problem_summary: sanitizeKaelText(
      customerVisibleKaelProblemSummary(input.estimate.problem_summary, language),
      200,
    ),
    complexity: input.estimate.complexity,
    price_min: Math.max(1, Math.round(input.estimate.price_min)),
    price_max: Math.max(
      Math.round(input.estimate.price_min),
      Math.round(input.estimate.price_max),
    ),
    confidence: needsInspection ? "low" : confidence,
    needs_inspection: needsInspection,
    price_source: needsInspection
      ? "inspection_required"
      : input.priceSource ?? "baseline_with_market",
    kael_reasoning: {
      vision_findings: optionalText(
        input.visionFindings
          ? customerVisibleKaelProblemSummary(input.visionFindings, language)
          : null,
        300,
      ),
      market_signals: optionalText(input.marketSignals, 300),
      baseline_used: optionalText(input.baselineUsed, 100) ?? "inspection_required",
      complexity_reasoning: estimateComplexityReasoning(
        input.estimate.complexity,
        needsInspection,
        language,
      ),
      needs_inspection_reason: needsInspection
        ? optionalText(input.needsInspectionReason, 200) ??
          (language === "en"
            ? "The scope must be verified on site before it is finalized."
            : "Cần xác nhận hiện trường trước khi chốt phạm vi.")
        : undefined,
    },
    analysis_receipt: buildEstimateAnalysisReceipt(
      input.analysisEvidence,
      input.marketEvidence,
      input.visionAnalysis,
      language,
      input.previousAnalysisReceipt,
    ),
    advisory: needsInspection
      ? sanitizeKaelText(
        input.estimate.advisory ??
          (language === "en"
            ? "A worker must inspect the issue on site before the scope is finalized."
            : "Cần thợ kiểm tra trực tiếp trước khi chốt phạm vi."),
        150,
      )
      : optionalText(input.estimate.advisory, 150),
    disclaimer: priceDisclaimer(language),
  };
  const artifactProposal = kaelArtifactProposalSchema.parse({
    artifact_type: "estimate",
    visibility: "customer_review",
    confidence: Math.max(0, Math.min(1, input.estimate.confidence)),
    missing_fields: needsInspection ? ["inspection"] : [],
    may_transition: false,
    estimate: {
      price_min: card.price_min,
      price_max: card.price_max,
      confidence: Math.max(0, Math.min(1, input.estimate.confidence)),
      disclaimer: card.disclaimer,
    },
    recommended_next_question: needsInspection
      ? "Bạn có thể gửi thêm ảnh hoặc mô tả vị trí hư hỏng để Kael kiểm tra chắc hơn không?"
      : undefined,
  });
  return {
    schema_version: "estimate_card.v3" as const,
    card,
    artifact_proposal: artifactProposal,
  };
}

export function buildWorkerBriefOutput(input: {
  stage: "core" | "guidance";
  serviceType: ServiceType;
  problemSummary: string;
  district: string | null;
  fullAddress?: {
    building: string | null;
    floor: string | null;
    unit: string | null;
    district: string | null;
  } | null;
  estimatedEarningMin?: number | null;
  estimatedEarningMax?: number | null;
  knowledgeSafetyGuidance?: readonly string[];
}) {
  const isGuidance = input.stage === "guidance";
  const district = sanitizeKaelText(
    input.district ?? input.fullAddress?.district ?? "TP.HCM",
    100,
  );
  const problemSummary = sanitizeKaelText(input.problemSummary, 200);
  const knowledgeSafety = (input.knowledgeSafetyGuidance ?? [])
    .map(cleanWorkerBriefKnowledgeLine)
    .filter((line) => line.length > 0)
    .slice(0, 2);
  const brief: WorkerBrief = {
    schema_version: "worker_brief.v1",
    stage: input.stage,
    visibility: isGuidance ? "post_accept" : "pre_accept",
    service_type: input.serviceType,
    problem_summary: problemSummary,
    district,
    full_address: isGuidance && input.fullAddress
      ? {
        building: nullableSanitized(input.fullAddress.building, 200),
        floor: nullableSanitized(input.fullAddress.floor, 50),
        unit: nullableSanitized(input.fullAddress.unit, 50),
        district: nullableSanitized(input.fullAddress.district ?? district, 100),
      }
      : null,
    estimated_earning_min: input.estimatedEarningMin ?? null,
    estimated_earning_max: input.estimatedEarningMax ?? null,
    sections: {
      context: [
        `Khu vực: ${district}`,
        `Vấn đề Kael ghi nhận: ${problemSummary}`,
      ],
      guidance: isGuidance
        ? [
          "Kiểm tra đúng phạm vi Kael đã chốt và khách có thể xem/khiếu nại.",
          "Nếu phát sinh thêm, gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Chỉ làm khi khách xác nhận trong ứng dụng.",
        ]
        : [
          "Đọc nhanh vấn đề trước khi nhận việc.",
          "Địa chỉ đầy đủ chỉ hiển thị sau khi nhận yêu cầu.",
        ],
      safety: [
        ...knowledgeSafety,
        "Không bắt đầu phần phát sinh khi khách chưa xác nhận đề xuất đổi phạm vi trong ứng dụng.",
      ],
    },
  };
  return {
    schema_version: "worker_brief_output.v1" as const,
    brief,
  };
}

function cleanWorkerBriefKnowledgeLine(value: string): string {
  const line = sanitizeKaelText(value, 220)
    .replace(/^Safety\s+(?:urgent|warning|advisory):\s*/i, "")
    .trim();
  return line.includes("không làm trước khi Kael quyết định")
    ? "Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Không làm trước khi khách xác nhận đề xuất trong ứng dụng."
    : line;
}

function buildEstimateAnalysisReceipt(
  evidence: {
    photoCount: number;
    videoFrameCount: number;
    voiceTranscriptCount: number;
    skipped: boolean;
    visualEvidenceRefs?: Array<{
      evidenceIndex: number;
      evidenceKind: "photo" | "video_frame";
    }>;
  } | undefined,
  market: {
    acceptedSourceCount: number | null;
    highTrustSourceCount: number | null;
    quorumMet: boolean | null;
  } | undefined,
  vision: {
    analysisStatus?: "analyzed" | "not_provided" | "unavailable";
    evidenceFindings?: Array<{
      confidence: "low" | "medium" | "high";
      evidenceIndex: number;
      observation: string;
      possibleMeaning: string | null;
    }>;
    problemSummary: string;
    recommendedScope?: string | null;
    remainingUncertainty?: string | null;
    severityIndicators: string[];
  } | undefined,
  language: "vi" | "en",
  previousAnalysisReceipt?: unknown,
): EstimateAnalysisReceipt | undefined {
  if (!evidence && !market && !vision) return undefined;
  const findings = buildReceiptEvidenceFindings(
    evidence?.visualEvidenceRefs,
    vision?.evidenceFindings,
  );
  const problemSummary = optionalText(
    vision?.problemSummary
      ? customerVisibleKaelProblemSummary(vision.problemSummary, language)
      : null,
    500,
  );
  const severityIndicators = (vision?.severityIndicators ?? [])
    .map((indicator) => optionalText(indicator, 200))
    .filter((indicator): indicator is string => Boolean(indicator))
    .slice(0, 5);
  const receipt: EstimateAnalysisReceipt = {
    schema_version: "analysis_receipt.v1",
    evidence: {
      ...(vision?.analysisStatus ? { analysis_status: vision.analysisStatus } : {}),
      ...(findings.length > 0 ? { findings } : {}),
      photo_count: boundedEvidenceCount(evidence?.photoCount),
      video_frame_count: boundedEvidenceCount(evidence?.videoFrameCount),
      voice_transcript_count: boundedEvidenceCount(evidence?.voiceTranscriptCount),
      skipped: evidence?.skipped === true,
    },
    market: {
      accepted_source_count: nullableBoundedEvidenceCount(market?.acceptedSourceCount),
      high_trust_source_count: nullableBoundedEvidenceCount(market?.highTrustSourceCount),
      quorum_met: typeof market?.quorumMet === "boolean" ? market.quorumMet : null,
    },
    ...(problemSummary
      ? {
        problem: {
          remaining_uncertainty: optionalText(vision?.remainingUncertainty, 300) ?? null,
          recommended_scope: optionalText(vision?.recommendedScope, 400) ?? null,
          severity_indicators: severityIndicators,
          summary: problemSummary,
        },
      }
      : {}),
  };
  return reusePreviousAnalyzedEvidence(receipt, previousAnalysisReceipt);
}

function reusePreviousAnalyzedEvidence(
  receipt: EstimateAnalysisReceipt,
  previous: unknown,
): EstimateAnalysisReceipt {
  if (
    receipt.evidence.analysis_status === "analyzed" ||
    (receipt.evidence.findings?.length ?? 0) > 0
  ) return receipt;
  const previousRecord = recordFromUnknown(previous);
  const previousEvidence = recordFromUnknown(previousRecord?.evidence);
  if (previousEvidence?.analysis_status !== "analyzed") return receipt;
  const findings: NonNullable<EstimateAnalysisReceipt["evidence"]["findings"]> = [];
  const seenEvidence = new Set<string>();
  for (const value of Array.isArray(previousEvidence.findings) ? previousEvidence.findings : []) {
    const finding = recordFromUnknown(value);
    if (!finding) continue;
    const evidenceKind = finding.evidence_kind === "photo" || finding.evidence_kind === "video_frame"
      ? finding.evidence_kind
      : null;
    const evidenceIndex = Number.isSafeInteger(finding.evidence_index)
      ? finding.evidence_index as number
      : null;
    const confidence = finding.confidence === "low" ||
        finding.confidence === "medium" || finding.confidence === "high"
      ? finding.confidence
      : null;
    const availableCount = evidenceKind === "photo"
      ? receipt.evidence.photo_count
      : evidenceKind === "video_frame"
      ? receipt.evidence.video_frame_count
      : 0;
    const observation = typeof finding.observation === "string"
      ? optionalText(finding.observation, 240)
      : undefined;
    const evidenceKey = `${evidenceKind}:${evidenceIndex}`;
    if (
      !evidenceKind || !evidenceIndex || !confidence || !observation ||
      evidenceIndex > availableCount || seenEvidence.has(evidenceKey)
    ) continue;
    seenEvidence.add(evidenceKey);
    findings.push({
      confidence,
      evidence_index: evidenceIndex,
      evidence_kind: evidenceKind,
      observation,
      possible_meaning: typeof finding.possible_meaning === "string"
        ? optionalText(finding.possible_meaning, 240) ?? null
        : null,
    });
    if (findings.length >= 5) break;
  }
  if (findings.length === 0) return receipt;
  const previousProblem = recordFromUnknown(previousRecord?.problem);
  const summary = typeof previousProblem?.summary === "string"
    ? optionalText(previousProblem.summary, 500)
    : undefined;
  return {
    ...receipt,
    evidence: {
      ...receipt.evidence,
      analysis_status: "analyzed",
      findings,
    },
    ...(summary
      ? {
        problem: {
          remaining_uncertainty: typeof previousProblem?.remaining_uncertainty === "string"
            ? optionalText(previousProblem.remaining_uncertainty, 300) ?? null
            : null,
          recommended_scope: typeof previousProblem?.recommended_scope === "string"
            ? optionalText(previousProblem.recommended_scope, 400) ?? null
            : null,
          severity_indicators: Array.isArray(previousProblem?.severity_indicators)
            ? previousProblem.severity_indicators
              .flatMap((value) => typeof value === "string" ? [optionalText(value, 200)] : [])
              .filter((value): value is string => Boolean(value))
              .slice(0, 5)
            : [],
          summary,
        },
      }
      : {}),
  };
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function buildReceiptEvidenceFindings(
  visualEvidenceRefs: Array<{
    evidenceIndex: number;
    evidenceKind: "photo" | "video_frame";
  }> | undefined,
  findings: Array<{
    confidence: "low" | "medium" | "high";
    evidenceIndex: number;
    observation: string;
    possibleMeaning: string | null;
  }> | undefined,
): NonNullable<EstimateAnalysisReceipt["evidence"]["findings"]> {
  if (!visualEvidenceRefs || visualEvidenceRefs.length === 0 || !findings) return [];
  const seen = new Set<number>();
  return findings.flatMap((finding) => {
    if (
      !Number.isSafeInteger(finding.evidenceIndex) ||
      finding.evidenceIndex < 1 ||
      finding.evidenceIndex > visualEvidenceRefs.length ||
      seen.has(finding.evidenceIndex)
    ) return [];
    const evidenceRef = visualEvidenceRefs[finding.evidenceIndex - 1];
    if (!evidenceRef) return [];
    const observation = optionalText(finding.observation, 240);
    if (!observation) return [];
    seen.add(finding.evidenceIndex);
    return [{
      confidence: finding.confidence,
      evidence_index: evidenceRef.evidenceIndex,
      evidence_kind: evidenceRef.evidenceKind,
      observation,
      possible_meaning: optionalText(finding.possibleMeaning, 240) ?? null,
    }];
  });
}

function estimateComplexityReasoning(
  complexity: ComplexityLevel,
  needsInspection: boolean,
  language: "vi" | "en",
) {
  if (needsInspection) {
    return language === "en"
      ? "The current evidence is not yet strong enough, so a worker must inspect it on site."
      : "Thông tin hiện tại chưa đủ chắc chắn nên cần thợ kiểm tra trực tiếp.";
  }
  if (language === "en") {
    const level = complexity === "small"
      ? "small"
      : complexity === "medium"
      ? "medium"
      : "large";
    return `The confirmed scope and evidence place this request at ${level} complexity.`;
  }
  const level = complexity === "small"
    ? "nhỏ"
    : complexity === "medium"
    ? "vừa"
    : "lớn";
  return `Phạm vi và bằng chứng đã xác nhận xếp yêu cầu ở mức độ ${level}.`;
}

function boundedEvidenceCount(value: number | null | undefined) {
  if (!Number.isSafeInteger(value) || (value ?? -1) < 0) return 0;
  return Math.min(value ?? 0, 100);
}

function nullableBoundedEvidenceCount(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 100) : null;
}

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

const UNLABELLED_BANK_ACCOUNT_PATTERN = /\b\d{13,20}\b/g;
const UNSAFE_TEXT_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g;

export function sanitizeKaelText(input: string, maxLength = 500): string {
  const safeMaxLength = maxLength === Number.POSITIVE_INFINITY
    ? 500
    : Number.isFinite(maxLength)
    ? Math.max(0, Math.floor(maxLength))
    : 0;
  const sanitized = stripVndPatterns(scrubKaelPiiText(input))
    .replace(/\s+/g, " ")
    .trim();
  return truncateWithoutSplittingSurrogate(sanitized, safeMaxLength);
}

function truncateWithoutSplittingSurrogate(value: string, maxLength: number): string {
  const truncated = value.slice(0, maxLength);
  const lastCodeUnit = truncated.charCodeAt(truncated.length - 1);
  return lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF
    ? truncated.slice(0, -1)
    : truncated;
}

export function sanitizeKaelOutputObject<T>(value: T): T {
  if (typeof value === "string") return sanitizeKaelText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeKaelOutputObject(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeKaelOutputObject(item)]),
    ) as T;
  }
  return value;
}

function numericConfidenceToLabel(value: number): "low" | "medium" | "high" {
  if (value >= 0.75) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

function optionalText(value: string | null | undefined, maxLength: number) {
  const sanitized = sanitizeKaelText(value ?? "", maxLength);
  return sanitized.length > 0 ? sanitized : undefined;
}

function nullableSanitized(value: string | null | undefined, maxLength: number) {
  const sanitized = sanitizeKaelText(value ?? "", maxLength);
  return sanitized.length > 0 ? sanitized : null;
}

function stripVndPatterns(input: string): string {
  return input.replace(
    /\b\d{1,3}(?:[.,]\d{3})+\s*(?:vnd|vnđ|đ|₫|dong|đồng)|\b\d{4,}\s*(?:vnd|vnđ|đ|₫|dong|đồng)/gi,
    "[price-removed]",
  );
}

export function scrubKaelPiiText(input: string): string {
  return input
    .replace(UNSAFE_TEXT_CONTROL_PATTERN, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:stk|số tài khoản|so tai khoan|bank)\s*[:#-]?\s*\d{6,20}\b/gi, "[bank-account]")
    .replace(UNLABELLED_BANK_ACCOUNT_PATTERN, "[bank-account]")
    .replace(/\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, "[phone]")
    .replace(/\b\d{9,12}\b/g, "[id-number]")
    .replace(
      /(?<![\p{L}\p{N}])(?:căn(?:[^\S\r\n]+hộ)?|can(?:[^\S\r\n]+ho)?|unit|phòng|phong|apt)[^\S\r\n]+([\p{L}\p{N}](?:[\p{L}\p{N}._/-]*[\p{L}\p{N}])?)/giu,
      (match, identifier: string) => looksLikePrivateUnitIdentifier(identifier) ? "[unit]" : match,
    )
    .replace(/\b(?:tầng|tang|lầu|lau|floor)\s*\d+\b/gi, "[floor]")
    .replace(/\b(?:số nhà|so nha|nhà số|nha so)\s*[A-Z0-9./-]+\b/gi, "[house-no]");
}

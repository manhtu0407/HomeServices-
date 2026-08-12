import type { ComplexityLevel, KaelEstimate, ServiceType } from "../contracts/types.ts";
import { PRICE_DISCLAIMER, priceDisclaimer } from "../contracts/types.ts";
import { kaelArtifactProposalSchema } from "../contracts/artifact-contract.ts";
import {
  buildReceiptEvidenceFindings,
  boundedEvidenceCount,
  estimateComplexityReasoning,
  isSafePublicPriceReasoningText,
  nullableBoundedEvidenceCount,
  nullableSanitized,
  numericConfidenceToLabel,
  optionalText,
  recordFromUnknown,
  reusePreviousAnalyzedEvidence,
  sanitizeKaelText,
} from "./output-support.ts";
export {
  isSafePublicPriceReasoningText,
  sanitizeKaelOutputObject,
  sanitizeKaelText,
  scrubKaelPiiText,
} from "./output-support.ts";
export { buildScopeChangeOutputs } from "./scope-change-output.ts";
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
  price_reasoning_receipt: PriceReasoningReceipt;
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

export type PriceReasoningReceipt = {
  schema_version: "price_reasoning_receipt.v1";
  receipt_id: string;
  problem: {
    confirmed_facts: string[];
    possible_causes: Array<{
      statement: string;
      basis: Array<"customer_report" | "visual_evidence" | "service_profile" | "knowledge">;
      confidence: "low" | "medium" | "high";
    }>;
    unknowns: string[];
  };
  scope: {
    included: string[];
    conditional: string[];
    excluded: string[];
  };
  costs: {
    currency: "VND";
    total_min: number;
    total_max: number;
    reconciliation: "package_total" | "exact";
    components: Array<{
      kind:
        | "service_package"
        | "labor"
        | "travel"
        | "materials"
        | "replacement_parts"
        | "equipment"
        | "other";
      status: "priced" | "included_unitemized" | "conditional_unpriced" | "excluded" | "undetermined";
      amount_min: number | null;
      amount_max: number | null;
      explanation: string;
    }>;
  };
  scenarios: {
    low: { total: number; conditions: string[]; scope: string[] };
    high: { total: number; conditions: string[]; scope: string[] };
  };
  fairness: {
    price_source: EstimatePriceSource;
    confidence: "low" | "medium" | "high";
    market_source_count: number | null;
    high_trust_source_count: number | null;
    quorum_met: boolean | null;
    cap_statement: string;
    remaining_uncertainty: string[];
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
  const priceMin = Math.max(1, Math.round(input.estimate.price_min));
  const priceMax = Math.max(priceMin, Math.round(input.estimate.price_max));
  const priceSource = needsInspection
    ? "inspection_required" as const
    : input.priceSource ?? "baseline_with_market";
  const analysisReceipt = buildEstimateAnalysisReceipt(
    input.analysisEvidence,
    input.marketEvidence,
    input.visionAnalysis,
    language,
    input.previousAnalysisReceipt,
  );
  const problemSummary = sanitizeKaelText(
    customerVisibleKaelProblemSummary(input.estimate.problem_summary, language),
    200,
  );
  const card: EstimateCardV3 = {
    service_type: input.estimate.service_type,
    problem_summary: problemSummary,
    complexity: input.estimate.complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence: needsInspection ? "low" : confidence,
    needs_inspection: needsInspection,
    price_source: priceSource,
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
    analysis_receipt: analysisReceipt,
    price_reasoning_receipt: buildPriceReasoningReceipt({
      analysisReceipt,
      complexity: input.estimate.complexity,
      confidence: needsInspection ? "low" : confidence,
      language,
      needsInspection,
      priceMax,
      priceMin,
      priceSource,
      problemSummary,
    }),
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

function buildPriceReasoningReceipt(input: {
  analysisReceipt: EstimateAnalysisReceipt | undefined;
  complexity: ComplexityLevel;
  confidence: "low" | "medium" | "high";
  language: "vi" | "en";
  needsInspection: boolean;
  priceMin: number;
  priceMax: number;
  priceSource: EstimatePriceSource;
  problemSummary: string;
}): PriceReasoningReceipt {
  const isVietnamese = input.language === "vi";
  const problem = input.analysisReceipt?.problem;
  const evidence = input.analysisReceipt?.evidence;
  const noVisualEvidence = evidence?.analysis_status === "not_provided" ||
    evidence?.skipped === true || evidence?.photo_count === 0;
  const unknowns = publicReceiptTextList(
    [
      problem?.remaining_uncertainty,
      noVisualEvidence
        ? isVietnamese
          ? "Chưa có ảnh hoặc bằng chứng trực quan để xác nhận nguyên nhân và phần bị che khuất."
          : "No image or visual evidence is available to verify the cause or hidden damage."
        : undefined,
      input.needsInspection
        ? isVietnamese
          ? "Cần kiểm tra hiện trường trước khi chốt các hạng mục ngoài phạm vi hiện có."
          : "An on-site inspection is required before any work outside the current scope is finalized."
        : undefined,
    ],
    isVietnamese
      ? "Phạm vi thực tế vẫn cần được đối chiếu trước khi thực hiện."
      : "The actual scope still needs to be verified before work begins.",
    4,
    280,
  );
  const possibleCauses: PriceReasoningReceipt["problem"]["possible_causes"] = [];
  for (const finding of evidence?.findings ?? []) {
    if (finding.possible_meaning) {
      possibleCauses.push({
        statement: publicReasoningText(
          finding.possible_meaning,
          isVietnamese
            ? "Dấu hiệu này cần được kiểm tra thêm tại hiện trường."
            : "This sign needs further on-site verification.",
          240,
        ),
        basis: ["visual_evidence"],
        confidence: finding.confidence,
      });
    }
    if (possibleCauses.length >= 3) break;
  }
  if (possibleCauses.length === 0) {
    possibleCauses.push({
      statement: isVietnamese
        ? "Nguyên nhân cụ thể chưa thể khẳng định chỉ từ thông tin hiện có."
        : "The specific cause cannot yet be confirmed from the available information alone.",
      basis: ["customer_report"],
      confidence: "low",
    });
  }
  const included = publicReceiptTextList(
    [
      problem?.recommended_scope,
      isVietnamese
        ? `Gói hiện tại được tính theo mức độ phạm vi ${complexityLabel(input.complexity, input.language)}.`
        : `The current package is priced for ${complexityLabel(input.complexity, input.language)} complexity.`,
    ],
    isVietnamese
      ? "Kiểm tra và xử lý phần việc đã được mô tả trong yêu cầu hiện có."
      : "Inspect and handle the work described in the current request.",
    3,
    320,
  );
  const scope = priceReasoningScope(isVietnamese);
  return {
    schema_version: "price_reasoning_receipt.v1",
    receipt_id: `price_reasoning:${crypto.randomUUID()}`,
    problem: {
      confirmed_facts: publicReceiptTextList(
        [
          isVietnamese
            ? `Khách mô tả: ${input.problemSummary}`
            : `Customer report: ${input.problemSummary}`,
          problem?.summary,
          ...(problem?.severity_indicators ?? []),
        ],
        isVietnamese
          ? "Kael ghi nhận yêu cầu trong phạm vi thông tin khách đã cung cấp."
          : "Kael recorded the request within the information the customer provided.",
        5,
        240,
      ),
      possible_causes: possibleCauses,
      unknowns,
    },
    scope: {
      included,
      conditional: scope.conditional,
      excluded: scope.excluded,
    },
    costs: priceReasoningCosts(input, isVietnamese),
    scenarios: {
      low: {
        total: input.priceMin,
        conditions: scope.lowConditions,
        scope: included,
      },
      high: {
        total: input.priceMax,
        conditions: scope.highConditions,
        scope: included,
      },
    },
    fairness: {
      price_source: input.priceSource,
      confidence: input.confidence,
      market_source_count: input.analysisReceipt?.market.accepted_source_count ?? null,
      high_trust_source_count: input.analysisReceipt?.market.high_trust_source_count ?? null,
      quorum_met: input.analysisReceipt?.market.quorum_met ?? null,
      cap_statement: input.needsInspection
        ? isVietnamese
          ? "Khoảng giá chỉ là căn cứ tham khảo trước khi kiểm tra hiện trường; không tự phát sinh khoản mới."
          : "This range is a pre-inspection reference and does not add new charges automatically."
        : isVietnamese
        ? "Khoảng giá chỉ dùng các kết quả định giá đã kiểm chứng; Kael không tự tạo một mức giá ngoài kết quả này."
        : "The range uses only verified pricing results; Kael does not create a price outside those results.",
      remaining_uncertainty: unknowns,
    },
  };
}

function priceReasoningCosts(
  input: {
    priceMin: number;
    priceMax: number;
  },
  isVietnamese: boolean,
): PriceReasoningReceipt["costs"] {
  return {
    currency: "VND",
    total_min: input.priceMin,
    total_max: input.priceMax,
    reconciliation: "package_total",
    components: [
      {
        kind: "service_package",
        status: "priced",
        amount_min: input.priceMin,
        amount_max: input.priceMax,
        explanation: isVietnamese
          ? "Khoảng giá đã chốt cho gói công việc trong phạm vi hiện có."
          : "The confirmed price range for the current work package.",
      },
      {
        kind: "labor",
        status: "included_unitemized",
        amount_min: null,
        amount_max: null,
        explanation: isVietnamese
          ? "Tiền công được thể hiện trong gói, nhưng hệ thống không có số tách riêng."
          : "Labor is represented in the package, but no separate amount is available.",
      },
      {
        kind: "travel",
        status: "undetermined",
        amount_min: null,
        amount_max: null,
        explanation: isVietnamese
          ? "Không có dữ liệu tách riêng cho di chuyển nên Kael không suy diễn thành một khoản giá."
          : "There is no separate travel amount, so Kael does not infer one.",
      },
      {
        kind: "materials",
        status: "conditional_unpriced",
        amount_min: null,
        amount_max: null,
        explanation: isVietnamese
          ? "Vật tư chỉ được báo riêng nếu thực tế cần và khách xác nhận phạm vi mới."
          : "Materials are quoted separately only if needed and the customer approves the new scope.",
      },
      {
        kind: "replacement_parts",
        status: "conditional_unpriced",
        amount_min: null,
        amount_max: null,
        explanation: isVietnamese
          ? "Linh kiện thay thế chưa được định giá khi chưa xác nhận hiện trạng."
          : "Replacement parts are not priced before the condition is confirmed.",
      },
    ],
  };
}

function priceReasoningScope(isVietnamese: boolean) {
  return {
    conditional: [
      isVietnamese
        ? "Nếu phát hiện hạng mục ngoài phạm vi, thợ phải gửi đề xuất đổi phạm vi để khách xác nhận trước khi làm."
        : "If work outside the scope is found, the worker must submit a scope-change proposal for customer approval first.",
    ],
    excluded: [
      isVietnamese
        ? "Chưa có số tách riêng cho linh kiện thay thế, vật tư hoặc hạng mục ngoài mô tả."
        : "No separate amount is quoted for replacement parts, materials, or work outside the description.",
    ],
    lowConditions: [
      isVietnamese
        ? "Phạm vi thực tế khớp với mô tả hiện có."
        : "The actual scope matches the current description.",
      isVietnamese
        ? "Không phát hiện hạng mục ngoài phạm vi cần khách duyệt."
        : "No out-of-scope work requiring customer approval is found.",
    ],
    highConditions: [
      isVietnamese
        ? "Cần nhiều thao tác hơn nhưng vẫn nằm trong phạm vi đã định giá."
        : "More work is needed, but it remains within the priced scope.",
      isVietnamese
        ? "Không tự cộng linh kiện hoặc hạng mục ngoài phạm vi chưa được khách xác nhận."
        : "Unapproved parts or out-of-scope work are not added automatically.",
    ],
  };
}

function complexityLabel(complexity: ComplexityLevel, language: "vi" | "en") {
  if (language === "en") return complexity;
  return complexity === "small" ? "nhỏ" : complexity === "medium" ? "vừa" : "lớn";
}

function publicReceiptTextList(
  values: Array<string | null | undefined>,
  fallback: string,
  limit: number,
  maxLength: number,
): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const text = publicReasoningText(value, "", maxLength);
    if (text) unique.add(text);
    if (unique.size >= limit) break;
  }
  return unique.size > 0 ? [...unique] : [fallback];
}

function publicReasoningText(
  value: string | null | undefined,
  fallback: string,
  maxLength: number,
): string {
  const text = optionalText(value, maxLength);
  return text && isSafePublicPriceReasoningText(text, maxLength) ? text : fallback;
}

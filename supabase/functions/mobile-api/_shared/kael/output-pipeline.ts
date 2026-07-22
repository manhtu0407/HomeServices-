import type { ComplexityLevel, KaelEstimate, ServiceType } from "./types.ts";
import { PRICE_DISCLAIMER, priceDisclaimer } from "./types.ts";
import {
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  type ScopeChangeRiskConfig,
} from "./scope-risk.ts";
import { kaelArtifactProposalSchema } from "./artifact-contract.ts";
import { looksLikePrivateUnitIdentifier } from "./utils.ts";

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
  advisory?: string;
  disclaimer: string;
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
  visionFindings?: string | null;
  marketSignals?: string | null;
  needsInspectionReason?: string | null;
}) {
  const language = input.language ?? "vi";
  const confidence = numericConfidenceToLabel(input.estimate.confidence);
  const needsInspection = input.estimate.needs_inspection === true ||
    input.priceSource === "inspection_required";
  const card: EstimateCardV3 = {
    service_type: input.estimate.service_type,
    problem_summary: sanitizeKaelText(input.estimate.problem_summary, 200),
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
      vision_findings: optionalText(input.visionFindings, 300),
      market_signals: optionalText(input.marketSignals, 300),
      baseline_used: optionalText(input.baselineUsed, 100) ?? "inspection_required",
      complexity_reasoning: needsInspection
        ? language === "en"
          ? "The current evidence is not yet strong enough, so a worker must inspect it on site."
          : "Thông tin hiện tại chưa đủ chắc chắn nên cần thợ kiểm tra trực tiếp."
        : language === "en"
        ? "Kael checks the description, severity, and governed baseline before presenting a price range."
        : "Kael đối chiếu mô tả, mức độ và baseline phù hợp trước khi đưa khoảng giá.",
      needs_inspection_reason: needsInspection
        ? optionalText(input.needsInspectionReason, 200) ??
          (language === "en"
            ? "The scope must be verified on site before it is finalized."
            : "Cần xác nhận hiện trường trước khi chốt phạm vi.")
        : undefined,
    },
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
          "Nếu phát sinh thêm, gửi scope-change kèm lý do và ảnh trước khi làm.",
        ]
        : [
          "Đọc nhanh vấn đề trước khi nhận việc.",
          "Địa chỉ đầy đủ chỉ hiển thị sau khi nhận yêu cầu.",
        ],
      safety: [
        ...knowledgeSafety,
        "Không bắt đầu phần phát sinh khi Kael chưa quyết định hoặc chưa có override hợp lệ.",
      ],
    },
  };
  return {
    schema_version: "worker_brief_output.v1" as const,
    brief,
  };
}

function cleanWorkerBriefKnowledgeLine(value: string): string {
  return sanitizeKaelText(value, 220)
    .replace(/^Safety\s+(?:urgent|warning|advisory):\s*/i, "")
    .trim();
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

import type { ComplexityLevel } from "../contracts/types.ts";
import { looksLikePrivateUnitIdentifier } from "../pipeline/utils.ts";
import type { EstimateAnalysisReceipt } from "./output-pipeline.ts";
export function reusePreviousAnalyzedEvidence(
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

export function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function buildReceiptEvidenceFindings(
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

export function estimateComplexityReasoning(
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

export function boundedEvidenceCount(value: number | null | undefined) {
  if (!Number.isSafeInteger(value) || (value ?? -1) < 0) return 0;
  return Math.min(value ?? 0, 100);
}

export function nullableBoundedEvidenceCount(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 100) : null;
}

const UNLABELLED_BANK_ACCOUNT_PATTERN = /\b\d{13,20}\b/g;
const UNSAFE_TEXT_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g;
const PUBLIC_PRICE_REASONING_UNSAFE_PATTERN = /\b(?:provider|model|prompt|token|api(?:[_\s-]?key)?|anthropic|deepseek|perplexity|openai|secret|system message)\b|\b\d{4,}(?:[.,]\d{3})*\b|(?:nhà cung cấp|mô hình|lời nhắc|mã thông báo|khóa api|bí mật)/iu;

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

export function isSafePublicPriceReasoningText(
  value: unknown,
  maxLength: number,
): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === sanitizeKaelText(value, maxLength) &&
    !PUBLIC_PRICE_REASONING_UNSAFE_PATTERN.test(value);
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

export function numericConfidenceToLabel(value: number): "low" | "medium" | "high" {
  if (value >= 0.75) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

export function optionalText(value: string | null | undefined, maxLength: number) {
  const sanitized = sanitizeKaelText(value ?? "", maxLength);
  return sanitized.length > 0 ? sanitized : undefined;
}

export function nullableSanitized(value: string | null | undefined, maxLength: number) {
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

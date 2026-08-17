import type { ComplexityLevel } from "../contracts/types.ts";
import {
  isSafePublicPriceReasoningText,
  optionalText,
} from "./output-support.ts";

export function normalizeCustomerReasoningClause(value: string): string {
  return value.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function customerDeclaredUnknowns(
  value: string,
  language: "vi" | "en",
): string[] {
  const clauses = customerContextClauses(value).filter((clause) =>
    /\b(?:chưa biết|chưa rõ|không biết|unknown|not known|do not know)\b/iu.test(clause)
  );
  if (clauses.length === 0) return [];
  return publicReceiptTextList(
    clauses,
    language === "vi"
      ? "Chi tiết chưa biết cần được thợ xác minh tại chỗ."
      : "The unknown detail must be verified on site.",
    3,
    240,
  );
}

export function isDeclaredUnknownClause(value: string): boolean {
  return /\b(?:chưa biết|chưa rõ|không biết|unknown|not known|do not know)\b/iu.test(value);
}

export function customerDeclaredScope(
  value: string,
  language: "vi" | "en",
): { included: string[]; excluded: string[] } {
  const clauses = customerContextClauses(value);
  return {
    included: publicReceiptTextList(
      clauses.filter((clause) =>
        /^(?:phạm vi mong muốn|desired scope)\s*:|\b(?:phạm vi).*(?:chỉ gồm|bao gồm)|\bscope\b.*\b(?:includes|covers)\b/iu.test(clause)
      ),
      language === "vi"
        ? "Thực hiện đúng phần việc khách đã xác nhận."
        : "Perform only the work the customer confirmed.",
      2,
      320,
    ),
    excluded: publicReceiptTextList(
      clauses.filter((clause) =>
        /^(?:loại trừ|không gồm|không bao gồm|không cho phép|does not include|do not|exclude)/iu.test(clause)
      ),
      language === "vi"
        ? "Không thực hiện phần việc khách chưa xác nhận."
        : "Do not perform work the customer has not approved.",
      3,
      320,
    ),
  };
}

export function customerContextClauses(value: string): string[] {
  return value
    .split(/(?:\r?\n)+|(?<=[.!?;])\s+|;/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

export function isCustomerInstruction(value: string): boolean {
  return /^(?:hãy|khỏi|chỉ đánh giá|please|just quote|only assess)\b/iu.test(value);
}

export function isBookingMetadataClause(value: string): boolean {
  return /^(?:Dịch vụ|Service|Vấn đề|Problem|Khu vực|Area|Thời gian|Time)\s*:/iu.test(value);
}

export function isDeclaredScopeClause(value: string): boolean {
  return /^(?:phạm vi mong muốn|desired scope)\s*:|\bphạm vi\b.*\b(?:chỉ gồm|bao gồm)\b|^(?:loại trừ|không (?:gồm|bao gồm|cho phép))|\bscope\b.*\b(?:includes|covers)\b/iu.test(value);
}

export function mentionsVisualEvidence(value: string | null | undefined): boolean {
  return typeof value === "string" &&
    /\b(?:ảnh|hình ảnh|video|visual|image|photo)\b/iu.test(value);
}

export function hasUnconfirmedReplacement(problemSummary: string): boolean {
  const normalized = problemSummary
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return /(?:chua|khong) xac nhan[^.]{0,80}\bthay\b/.test(normalized) ||
    /\bthay\b[^.]{0,80}(?:chua|khong) xac nhan/.test(normalized) ||
    /replacement[^.]{0,80}(?:is )?not confirmed/.test(normalized) ||
    /not confirmed[^.]{0,80}\breplace/.test(normalized);
}

export function hasExplicitReplacementExclusion(
  customerScopeContext: string,
  language: "vi" | "en",
): boolean {
  return customerContextClauses(customerScopeContext).some((clause) => {
    const normalized = normalizeCustomerReasoningClause(clause);
    const exclusion = language === "vi"
      ? /^(?:loai tru|khong gom|khong bao gom|khong cho phep)\b/.test(normalized)
      : /^(?:exclude|does not include|do not|not included)\b/.test(normalized);
    if (!exclusion) return false;
    return language === "vi"
      ? /\bthay(?: the)?\b[^.]{0,100}\b(?:ban le|linh kien|phu kien)\b/.test(normalized)
      : /\b(?:replace|replacement)\b[^.]{0,100}\b(?:hinge|part|hardware)\b/.test(normalized);
  });
}

export function customerResolvesHingeDamage(value: string): boolean {
  const normalized = normalizeCustomerReasoningClause(value);
  return /\bkhong\b[^.]{0,140}\b(?:nut|muc|cong|toet|hong)\b/.test(normalized) ||
    /\b(?:intact|no)\b[^.]{0,140}\b(?:crack|rot|warp|stripped|damage)\b/.test(normalized);
}

export function mentionsHingeSubstrateDamage(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalizeCustomerReasoningClause(value);
  return /\b(?:lo vit|khung tu|go|screw hole|cabinet frame|wood)\b/.test(normalized) &&
    /\b(?:nut|muc|cong|toet|hong|hu hai|rong|crack|rot|warp|stripped|damage|widened)\b/.test(normalized);
}

export function withoutUnconfirmedReplacement(
  recommendedScope: string | null | undefined,
  language: "vi" | "en",
): string | undefined {
  if (!recommendedScope) return undefined;
  const replacementClause = language === "vi"
    ? /,?\s*(?:và|hoặc)\s+thay(?:\s+thế)?[^.]*\.?/iu
    : /,?\s*(?:and|or)\s+replace[^.]*\.?/iu;
  const replacementSentence = language === "vi"
    ? /(?:^|\.\s*)thay(?:\s+thế)?[^.]*\.?/giu
    : /(?:^|\.\s*)replace[^.]*\.?/giu;
  const withoutClauses = recommendedScope
    .replace(replacementClause, ". ")
    .replace(replacementSentence, " ")
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !isReplacementScopeSentence(sentence, language))
    .join(" ");
  const scoped = withoutClauses
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
  return scoped || undefined;
}

function isReplacementScopeSentence(
  sentence: string,
  language: "vi" | "en",
): boolean {
  const normalized = sentence
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return language === "vi"
    ? /thay(?:\s+the)?.*ban le/.test(normalized)
    : /replace(?:ment)?.*hinge/.test(normalized);
}

export function complexityLabel(complexity: ComplexityLevel, language: "vi" | "en") {
  if (language === "en") return complexity;
  return complexity === "small" ? "nhỏ" : complexity === "medium" ? "vừa" : "lớn";
}

export function publicReceiptTextList(
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

export function publicReasoningText(
  value: string | null | undefined,
  fallback: string,
  maxLength: number,
): string {
  const text = optionalText(value, maxLength);
  return text && isSafePublicPriceReasoningText(text, maxLength) ? text : fallback;
}

import type { KaelPromptLanguage } from "../prompts/system-prompt.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";
export function buildWorkerKaelSessionTitle(
  question: string,
  suggestedTitle: string | null | undefined,
  language: KaelPromptLanguage,
): string {
  const safeSuggestion = normalizeWorkerKaelSessionTitle(suggestedTitle, false);
  if (safeSuggestion) return safeSuggestion;

  const scrubbedQuestion = scrubSensitiveForLLM(question)
    .replace(/\[(?:phone|email|id-number|bank-account|building|floor|unit|house-no)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutConversationalPrefix = language === "en"
    ? scrubbedQuestion.replace(
      /^(?:kael[,:]?\s*)?(?:i\s+(?:want|need|would like)\s+to\s+)?(?:ask|know|check|get help with)\s+(?:about\s+)?/i,
      "",
    )
    : scrubbedQuestion.replace(
      /^(?:kael[,:]?\s*)?(?:(?:tôi|mình|em)\s+)?(?:muốn\s+)?(?:hỏi|nhờ|cần)\s+(?:kael\s+)?(?:về|giúp|kiểm tra)?\s*/iu,
      "",
    );
  return normalizeWorkerKaelSessionTitle(withoutConversationalPrefix, true) ??
    (language === "en" ? "Work advisory" : "Trao đổi về công việc");
}

export function sanitizeWorkerKaelSessionTitle(value: string): string | null {
  return normalizeWorkerKaelSessionTitle(value, false);
}

export function normalizeWorkerKaelSessionTitle(
  value: string | null | undefined,
  removeSensitiveTokens: boolean,
): string | null {
  if (!value) return null;
  const scrubbed = scrubSensitiveForLLM(value);
  const hasSensitiveToken = /\[(?:phone|email|id-number|bank-account|building|floor|unit|house-no)\]/i
    .test(scrubbed);
  if (hasSensitiveToken && !removeSensitiveTokens) return null;

  const normalized = (removeSensitiveTokens
    ? scrubbed.replace(/\[(?:phone|email|id-number|bank-account|building|floor|unit|house-no)\]/gi, " ")
    : scrubbed)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.!?,;:…]+$/u, "")
    .trim();
  if (normalized.length < 3) return null;

  const bounded = truncateWorkerKaelSessionTitle(normalized, 64);
  return `${bounded.charAt(0).toLocaleUpperCase()}${bounded.slice(1)}`;
}

function truncateWorkerKaelSessionTitle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, maxLength + 1);
  const wordBoundary = slice.lastIndexOf(" ");
  return (wordBoundary >= 24 ? slice.slice(0, wordBoundary) : value.slice(0, maxLength)).trim();
}

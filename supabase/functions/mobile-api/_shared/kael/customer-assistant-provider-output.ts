import type { StructuredAIError } from "./structured-call.ts";

export type CustomerAssistantBoundary =
  | "answered"
  | "educational_only"
  | "redirect"
  | "unsupported"
  | "fallback";

export type CustomerAssistantSuggestedAction =
  | "open_booking"
  | "check_job"
  | "message_worker"
  | "contact_support"
  | "request_scope_change";

const ASSISTANT_ANSWER_KEYS = [
  "answer",
  "answer_text",
  "answerText",
  "final",
  "final_answer",
  "finalAnswer",
  "text",
  "message",
  "reply",
  "response",
  "content",
  "output_text",
  "outputText",
  "completion",
] as const;
const ASSISTANT_ANSWER_KEY_SET = new Set<string>(ASSISTANT_ANSWER_KEYS);
const MAX_RECOVERY_SCAN_LENGTH = 64 * 1024;
const MAX_ASSISTANT_ANSWER_LENGTH = 900;

export function normalizeAssistantPayload(value: unknown) {
  const unwrapped = unwrapAssistantPayload(value);
  if (!unwrapped) return value;
  const record = unwrapped;
  const answer = firstString(
    ...ASSISTANT_ANSWER_KEYS.map((key) => record[key]),
  )?.slice(0, MAX_ASSISTANT_ANSWER_LENGTH);
  return {
    ...record,
    ...(answer ? { answer } : {}),
    safety_notes: normalizeStringArray(
      [record.safety_notes, record.safetyNotes],
      3,
      180,
    ),
    citations: normalizeStringArray(
      [record.citations, record.sources],
      5,
      180,
    ),
    suggested_actions: normalizeSuggestedActions(
      record.suggested_actions,
      record.suggestedActions,
      record.actions,
    ),
    boundary: normalizeAssistantBoundary(record.boundary),
  };
}

export function recoverAssistantProviderAnswer(result: StructuredAIError): string | null {
  const normalized = normalizeAssistantPayload(result.parsedValue);
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const answer = firstString((normalized as Record<string, unknown>).answer);
    if (answer) return answer.slice(0, MAX_ASSISTANT_ANSWER_LENGTH);
  }
  if (typeof result.parsedValue === "string" && result.parsedValue.trim()) {
    return recoverAssistantText(result.parsedValue);
  }
  return recoverAssistantText(result.response?.content);
}

function unwrapAssistantPayload(value: unknown): Record<string, unknown> | null {
  let candidate = Array.isArray(value) && value.length === 1 ? value[0] : value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const record = candidate as Record<string, unknown>;
    const nested = ["result", "data", "output", "response"]
      .map((key) => record[key])
      .find((item) => item && typeof item === "object" && !Array.isArray(item));
    if (!nested) return record;
    candidate = nested;
  }
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function normalizeStringArray(
  values: readonly unknown[],
  maxItems: number,
  maxLength: number,
) {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim().slice(0, maxLength);
      if (normalized) return [normalized];
    }
    if (Array.isArray(value)) {
      return Array.from(new Set(value
        .map((item) => typeof item === "string" ? item.trim().slice(0, maxLength) : "")
        .filter(Boolean)))
        .slice(0, maxItems);
    }
  }
  return [];
}

function recoverAssistantText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const plain = stripOptionalMarkdownFence(value);
  if (!plain) return null;
  if (!/^[{[]/.test(plain)) {
    return plain.slice(0, MAX_ASSISTANT_ANSWER_LENGTH);
  }
  return recoverAllowedJsonStringField(plain);
}

function stripOptionalMarkdownFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?[ \t]*(?:\r?\n)?/i, "")
    .replace(/(?:\r?\n)?```[ \t]*$/i, "")
    .trim();
}

function recoverAllowedJsonStringField(value: string): string | null {
  const bounded = value.slice(0, MAX_RECOVERY_SCAN_LENGTH);
  for (let index = 0; index < bounded.length; index += 1) {
    if (bounded[index] !== '"') continue;
    const key = parseJsonStringAt(bounded, index);
    if (!key) continue;
    index = key.end - 1;
    if (!ASSISTANT_ANSWER_KEY_SET.has(key.value)) continue;
    let cursor = skipWhitespace(bounded, key.end);
    if (bounded[cursor] !== ":") continue;
    cursor = skipWhitespace(bounded, cursor + 1);
    if (bounded[cursor] !== '"') continue;
    const answer = parseJsonStringAt(bounded, cursor);
    const normalized = answer?.value.trim();
    if (normalized) return normalized.slice(0, MAX_ASSISTANT_ANSWER_LENGTH);
  }
  return null;
}

function parseJsonStringAt(value: string, start: number): { value: string; end: number } | null {
  if (value[start] !== '"') return null;
  let escaped = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character !== '"') continue;
    try {
      const parsed = JSON.parse(value.slice(start, index + 1));
      return typeof parsed === "string"
        ? { value: parsed, end: index + 1 }
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function skipWhitespace(value: string, start: number) {
  let index = start;
  while (index < value.length && /\s/.test(value[index] ?? "")) index += 1;
  return index;
}

function normalizeSuggestedActions(...values: unknown[]): CustomerAssistantSuggestedAction[] {
  const allowed = new Set<CustomerAssistantSuggestedAction>([
    "open_booking",
    "check_job",
    "message_worker",
    "contact_support",
    "request_scope_change",
  ]);
  const raw = normalizeStringArray(values, 12, 80);
  return Array.from(new Set(raw
    .map((value) => value.toLowerCase().replace(/[\s-]+/g, "_"))
    .filter((value): value is CustomerAssistantSuggestedAction => (
      allowed.has(value as CustomerAssistantSuggestedAction)
    ))))
    .slice(0, 3);
}

function normalizeAssistantBoundary(value: unknown): CustomerAssistantBoundary {
  const normalized = firstString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "educational" || normalized === "education") {
    return "educational_only";
  }
  if (normalized === "support_redirect") return "redirect";
  if (normalized === "out_of_scope") return "unsupported";
  if (
    normalized === "answered" ||
    normalized === "educational_only" ||
    normalized === "redirect" ||
    normalized === "unsupported" ||
    normalized === "fallback"
  ) {
    return normalized;
  }
  return "answered";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

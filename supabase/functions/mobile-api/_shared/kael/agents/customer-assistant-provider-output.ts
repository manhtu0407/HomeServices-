import type { StructuredAIError } from "../kael-providers/structured-call.ts";

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
const ASSISTANT_WRAPPER_KEYS = ["result", "data", "output", "response"] as const;
const MAX_ASSISTANT_ANSWER_LENGTH = 900;
const MAX_ASSISTANT_WRAPPER_ITEMS = 4;
const MAX_ASSISTANT_RECOVERY_DEPTH = 4;
const MAX_ASSISTANT_RECOVERY_ITEMS = 4;
const MAX_RECOVERY_SCAN_LENGTH = 64 * 1024;
const ASSISTANT_INTERNAL_ENVELOPE_TYPES = new Set([
  "analysis",
  "internal",
  "reasoning",
  "thinking",
]);
const ASSISTANT_INTERNAL_REPLY_MARKERS = [
  "<think",
  "</think",
  "analysis:",
  "reasoning:",
  "chain of thought",
  "system prompt",
  "system instruction",
  "api key",
  "api_key",
  "access token",
  "[internal]",
  "deepseek",
  "anthropic",
  "perplexity",
] as const;

export function normalizeAssistantPayload(
  value: unknown,
  maxAnswerLength = MAX_ASSISTANT_ANSWER_LENGTH,
) {
  const records = assistantPayloadRecords(value);
  if (records.length === 0) return value;
  const firstPublicSummary = records.findIndex((record) => (
    normalizeStringArray(
      [record.public_reasoning_summary, record.publicReasoningSummary],
      4,
      220,
    ).length > 0
  ));
  const publicRecords = firstPublicSummary < 0
    ? assistantPayloadHasInternalEnvelope(value) ? [] : records
    : records.slice(firstPublicSummary);
  const answer = firstPublicAssistantString(
    ...publicRecords.flatMap((record) => ASSISTANT_ANSWER_KEYS.map((key) => record[key])),
  )?.slice(0, maxAnswerLength);
  return {
    ...(answer ? { answer } : {}),
    safety_notes: normalizeRecordStringArrays(
      publicRecords,
      ["safety_notes", "safetyNotes"],
      3,
      180,
    ),
    citations: normalizeRecordStringArrays(
      publicRecords,
      ["citations", "sources"],
      5,
      180,
    ),
    public_reasoning_summary: normalizeRecordStringArrays(
      publicRecords,
      ["public_reasoning_summary", "publicReasoningSummary"],
      4,
      220,
    ),
    suggested_actions: normalizeSuggestedActions(
      ...publicRecords.flatMap((record) => [
        record.suggested_actions,
        record.suggestedActions,
        record.actions,
      ]),
    ),
    boundary: normalizeAssistantBoundary(firstString(
      ...publicRecords.map((record) => record.boundary),
    )),
  };
}

export function recoverAssistantProviderAnswer(
  result: StructuredAIError,
  maxAnswerLength = MAX_ASSISTANT_ANSWER_LENGTH,
): string | null {
  const normalized = normalizeAssistantPayload(result.parsedValue, maxAnswerLength);
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const record = normalized as Record<string, unknown>;
    const answer = firstString(record.answer);
    if (answer) return answer.slice(0, maxAnswerLength);
  }
  if (assistantRecoveryHasInternalEnvelope(result.parsedValue)) return null;
  return recoverAssistantText(result.response?.content, maxAnswerLength);
}

function assistantPayloadRecords(value: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  collectAssistantPayloadRecords(value, 0, records);
  return records;
}

function collectAssistantPayloadRecords(
  value: unknown,
  depth: number,
  records: Record<string, unknown>[],
) {
  if (depth > MAX_ASSISTANT_RECOVERY_DEPTH) return;
  if (Array.isArray(value)) {
    if (value.length > MAX_ASSISTANT_WRAPPER_ITEMS) return;
    for (const item of value) {
      collectAssistantPayloadRecords(item, depth + 1, records);
    }
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (isAssistantInternalEnvelope(record)) return;
  if (hasAssistantPublicPayloadField(record)) records.push(record);
  for (const key of ASSISTANT_WRAPPER_KEYS) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      collectAssistantPayloadRecords(nested, depth + 1, records);
    }
  }
}

function assistantPayloadHasInternalEnvelope(value: unknown, depth = 0): boolean {
  if (depth > MAX_ASSISTANT_RECOVERY_DEPTH) return true;
  if (Array.isArray(value)) {
    if (value.length > MAX_ASSISTANT_WRAPPER_ITEMS) return true;
    return value.some((item) => assistantPayloadHasInternalEnvelope(item, depth + 1));
  }
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (isAssistantInternalEnvelope(record)) return true;
  return ASSISTANT_WRAPPER_KEYS.some((key) => {
    const nested = record[key];
    return nested && typeof nested === "object"
      ? assistantPayloadHasInternalEnvelope(nested, depth + 1)
      : false;
  });
}

function hasAssistantPublicPayloadField(record: Record<string, unknown>) {
  const answer = firstPublicAssistantString(
    ...ASSISTANT_ANSWER_KEYS.map((key) => record[key]),
  );
  return Boolean(answer) ||
    normalizeStringArray(
      [record.public_reasoning_summary, record.publicReasoningSummary],
      4,
      220,
    ).length > 0 ||
    normalizeStringArray([record.safety_notes, record.safetyNotes], 3, 180).length > 0 ||
    normalizeStringArray([record.citations, record.sources], 5, 180).length > 0 ||
    normalizeStringArray(
      [record.suggested_actions, record.suggestedActions, record.actions],
      3,
      80,
    ).length > 0 ||
    typeof record.boundary === "string";
}

function isAssistantInternalEnvelope(record: Record<string, unknown>) {
  const type = firstString(record.type, record.kind, record.channel)?.toLowerCase();
  return Boolean(type && ASSISTANT_INTERNAL_ENVELOPE_TYPES.has(type));
}

function normalizeRecordStringArrays(
  records: readonly Record<string, unknown>[],
  keys: readonly string[],
  maxItems: number,
  maxLength: number,
) {
  return Array.from(new Set(records.flatMap((record) => normalizeStringArray(
    keys.map((key) => record[key]),
    maxItems,
    maxLength,
  )))).slice(0, maxItems);
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

function assistantRecoveryHasInternalEnvelope(value: unknown, depth = 0): boolean {
  if (depth > MAX_ASSISTANT_RECOVERY_DEPTH || value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ASSISTANT_RECOVERY_ITEMS) return true;
    return value.some((item) => assistantRecoveryHasInternalEnvelope(item, depth + 1));
  }
  if (typeof value === "string") {
    return hasAssistantInternalReplyMarker(value);
  }
  if (typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  if (isAssistantInternalEnvelope(record)) return true;
  return Object.values(record)
    .slice(0, MAX_ASSISTANT_RECOVERY_ITEMS)
    .some((item) => assistantRecoveryHasInternalEnvelope(item, depth + 1));
}

function recoverAssistantText(
  value: unknown,
  maxAnswerLength = MAX_ASSISTANT_ANSWER_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const withoutThinking = stripLeadingAssistantThinking(value);
  if (withoutThinking === null || hasAssistantInternalReplyMarker(withoutThinking)) return null;
  const plain = stripOptionalMarkdownFence(withoutThinking);
  if (!plain) return null;
  if (!/^[{[]/.test(plain)) return plain.slice(0, maxAnswerLength);
  return recoverAllowedJsonStringField(plain, maxAnswerLength);
}

function stripLeadingAssistantThinking(value: string): string | null {
  const trimmed = value.trim();
  const opening = trimmed.match(/^<think(?:ing)?\b[^>]*>/i);
  if (!opening) return trimmed;
  const closing = /<\/think(?:ing)?\s*>/ig;
  closing.lastIndex = opening[0].length;
  const match = closing.exec(trimmed);
  if (!match || match.index < opening[0].length) return null;
  return trimmed.slice(match.index + match[0].length).trim();
}

function stripOptionalMarkdownFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?[ \t]*(?:\r?\n)?/i, "")
    .replace(/(?:\r?\n)?```[ \t]*$/i, "")
    .trim();
}

function recoverAllowedJsonStringField(
  value: string,
  maxAnswerLength = MAX_ASSISTANT_ANSWER_LENGTH,
): string | null {
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
    if (normalized && !hasAssistantInternalReplyMarker(normalized)) {
      return normalized.slice(0, maxAnswerLength);
    }
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

function hasAssistantInternalReplyMarker(value: string) {
  const normalized = value.toLowerCase();
  return ASSISTANT_INTERNAL_REPLY_MARKERS.some((marker) => normalized.includes(marker));
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

function firstPublicAssistantString(...values: unknown[]) {
  for (const value of values) {
    if (
      typeof value === "string" &&
      value.trim() &&
      !hasAssistantInternalReplyMarker(value)
    ) {
      return value.trim();
    }
  }
  return undefined;
}

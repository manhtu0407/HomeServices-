import type { WorkerVisionFinding } from "../contracts/types.ts";
import { detectForbiddenAiDecisionText } from "../contracts/ai-boundary-contract.ts";
import type { StructuredValidationIssue } from "../kael-providers/structured-call.ts";
import type { ProviderChoice } from "../kael-providers/routing.ts";
import {
  buildProviderAttemptTrace,
  promptVersionForPurpose,
  schemaVersionForPurpose,
  type KaelSafeTraceEvent,
} from "../learning/trace.ts";
import type { KaelPromptLanguage } from "../prompts/system-prompt.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";
import { hasKaelLanguageMismatch } from "../kael-guardrails/self-check.ts";
import {
  buildWorkerKaelSessionTitle,
  normalizeWorkerKaelSessionTitle,
} from "./worker-assist-title.ts";
import type {
  WorkerAssistAnswer,
  WorkerAssistInput,
  WorkerAssistProviderAttempt,
} from "./worker-assist.ts";
const FALLBACK_TEXT =
  "Kael ch\u1ec9 c\u00f3 th\u1ec3 h\u01b0\u1edbng d\u1eabn theo vi\u1ec7c \u0111\u00e3 nh\u1eadn trong \u1ee9ng d\u1ee5ng. H\u00e3y ki\u1ec3m tra ph\u1ea1m vi, ghi b\u1eb1ng ch\u1ee9ng th\u1ef1c t\u1ebf, v\u00e0 g\u1eedi \u0111\u1ec1 xu\u1ea5t thay \u0111\u1ed5i ph\u1ea1m vi n\u1ebfu c\u00f3 ph\u1ea7n ph\u00e1t sinh.";
const FALLBACK_TEXT_EN =
  "Kael can only guide you inside the accepted job in the app. Check the agreed scope, save real evidence, and send a scope-change request if new work appears.";
const GENERAL_FALLBACK_TEXT =
  "Kael chưa thể trả lời lúc này. Bạn có thể hỏi về cách dùng ứng dụng, kỹ năng phục vụ hoặc nguyên tắc an toàn; với một việc cụ thể, hãy mở cuộc trò chuyện theo công việc.";
const GENERAL_FALLBACK_TEXT_EN =
  "Kael cannot answer right now. You can ask about app usage, service skills, or safety principles; open the job chat for a specific job.";
const DEFAULT_SAFETY_NOTES = [
  "Kh\u00f4ng t\u1ef1 b\u00e1o gi\u00e1 m\u1edbi ngo\u00e0i lu\u1ed3ng Kael trong \u1ee9ng d\u1ee5ng.",
  "Kh\u00f4ng chuy\u1ec3n tr\u1ea1ng th\u00e1i thay cho b\u1eb1ng ch\u1ee9ng th\u1ef1c t\u1ebf.",
] as const;
const DEFAULT_SAFETY_NOTES_EN = [
  "Do not quote a new price outside the Kael flow in the app.",
  "Do not change lifecycle status without real evidence.",
] as const;
const MAX_WORKER_ASSIST_TEXT_LENGTH = 700;
const MAX_WORKER_ASSIST_SAFETY_NOTE_LENGTH = 180;
const MAX_WORKER_ASSIST_WRAPPER_ITEMS = 4;
const MAX_WORKER_ASSIST_RECOVERY_DEPTH = 4;
const MAX_WORKER_ASSIST_RECOVERY_ITEMS = 4;
const WORKER_ASSIST_REPLY_KEYS = [
  "text",
  "answer",
  "message",
  "guidance",
  "advisory",
  "final",
  "final_answer",
  "finalAnswer",
  "response",
  "content",
  "output_text",
  "outputText",
  "completion",
] as const;
const WORKER_ASSIST_WRAPPER_KEYS = [
  "result",
  "data",
  "output",
  "response",
  "content",
] as const;
const WORKER_ASSIST_INTERNAL_REPLY_MARKERS = [
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
  "suy luận:",
  "lý luận nội bộ",
  "huong dan he thong",
  "hướng dẫn hệ thống",
  "khóa api",
  "khoa api",
  "deepseek",
  "anthropic",
  "perplexity",
] as const;
const WORKER_ASSIST_INTERNAL_ENVELOPE_TYPES = new Set([
  "analysis",
  "internal",
  "reasoning",
  "thinking",
]);
export function guardWorkerAssistText(text: string): {
  readonly allowed: boolean;
  readonly text: string;
  readonly reason?: string;
} {
  const trimmed = unwrapWorkerAssistOuterQuote(text.trim());
  if (!trimmed) return { allowed: false, text: trimmed, reason: "EMPTY" };
  if (!detectForbiddenAiDecisionText(trimmed).allowed) {
    return { allowed: false, text: trimmed, reason: "MONEY_OR_STATUS_MUTATION" };
  }
  return { allowed: true, text: trimmed };
}
function unwrapWorkerAssistOuterQuote(value: string): string {
  if (value.length < 3) return value;
  const opening = value[0];
  const closing = value.at(-1);
  const pairs: Record<string, string> = {
    '"': '"',
    "'": "'",
    "“": "”",
    "‘": "’",
  };
  if (opening && pairs[opening] === closing) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function fallbackAnswer(
  reason: string,
  redirectScopeChange: boolean,
  language: KaelPromptLanguage,
  providerAttempts: readonly WorkerAssistProviderAttempt[] = [],
  trace: readonly KaelSafeTraceEvent[] = [],
  guardrailSource?: WorkerAssistAnswer["guardrail_source"],
  conversationMode: "normal" | "intake" = "intake",
): WorkerAssistAnswer {
  return {
    schema_version: "worker_assist_answer.v1",
    text: fallbackTextForLanguage(language, conversationMode),
    safety_notes: safetyNotesForLanguage(language),
    redirect_scope_change: redirectScopeChange,
    fallback_used: true,
    guardrail_reason: reason,
    ...(guardrailSource ? { guardrail_source: guardrailSource } : {}),
    provider_attempts: providerAttempts,
    trace,
  };
}

export function providerAttempt(
  route: ProviderChoice,
  result: WorkerAssistProviderAttempt["result"],
  options: { code?: string; latencyMs?: number; costUsd?: number } = {},
): WorkerAssistProviderAttempt {
  return {
    provider: route.provider,
    model: route.model,
    role: route.role,
    timeout_ms: route.latencyBudgetMs,
    prompt_version: promptVersionForPurpose("worker_assist"),
    schema_version: schemaVersionForPurpose("worker_assist"),
    result,
    ...(options.code ? { code: options.code } : {}),
    ...(options.latencyMs !== undefined ? { latency_ms: options.latencyMs } : {}),
    ...(options.costUsd !== undefined ? { cost_usd: options.costUsd } : {}),
  };
}

export function traceForAttempt(
  attempt: WorkerAssistProviderAttempt,
  action: "worker.ask_kael",
  fallbackUsed: boolean,
  conversationMode: "normal" | "intake" = "intake",
): KaelSafeTraceEvent {
  return buildProviderAttemptTrace({
    workflowPhase: "in_progress",
    actorRole: "worker",
    action,
    policyId: workerAssistPolicyId(conversationMode),
    purpose: "worker_assist",
    provider: attempt.provider as "anthropic" | "perplexity" | "deepseek",
    model: attempt.model,
    latencyMs: attempt.latency_ms,
    costUsd: attempt.cost_usd,
    result: attempt.result,
    code: attempt.code,
    fallbackUsed,
  });
}

export function normalizeWorkerAssistPayload(value: unknown, maxTextLength = MAX_WORKER_ASSIST_TEXT_LENGTH) {
  const records = workerAssistPayloadRecords(value);
  if (records.length === 0) return value;
  const firstPublicSummary = records.findIndex((record) => (
    normalizeProviderPublicReasoningSummary(record).length > 0
  ));
  const publicRecords = firstPublicSummary < 0
    ? workerAssistPayloadHasInternalEnvelope(value) ? [] : records
    : records.slice(firstPublicSummary);
  const text = publicRecords.map((record) => normalizedWorkerAssistReply(record, 0, maxTextLength)).find(Boolean);
  const safetyNotes = uniqueWorkerAssistStrings(
    publicRecords.flatMap((record) => normalizeProviderSafetyNotes(record) ?? []),
    3,
  );
  const redirectScopeChange = publicRecords.some((record) => workerRedirectScopeChange(record));
  const sessionTitle = publicRecords
    .map((record) => normalizeWorkerKaelSessionTitle(firstString(
      record.session_title,
      record.sessionTitle,
      record.title,
    ), false))
    .find(Boolean);
  const publicReasoningSummary = uniqueWorkerAssistStrings(
    publicRecords.flatMap(normalizeProviderPublicReasoningSummary),
    4,
  );
  return {
    ...(text ? { text } : {}),
    public_reasoning_summary: publicReasoningSummary,
    safety_notes: safetyNotes,
    redirect_scope_change: redirectScopeChange,
    ...(sessionTitle ? { session_title: sessionTitle } : {}),
  };
}

function workerAssistPayloadRecords(value: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  collectWorkerAssistPayloadRecords(value, 0, records);
  return records;
}

function collectWorkerAssistPayloadRecords(
  value: unknown,
  depth: number,
  records: Record<string, unknown>[],
) {
  if (depth > MAX_WORKER_ASSIST_RECOVERY_DEPTH) return;
  if (Array.isArray(value)) {
    if (value.length > MAX_WORKER_ASSIST_WRAPPER_ITEMS) return;
    for (const item of value) {
      collectWorkerAssistPayloadRecords(item, depth + 1, records);
    }
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (isWorkerAssistInternalEnvelope(record)) return;
  if (hasWorkerAssistPublicPayloadField(record)) records.push(record);
  for (const key of WORKER_ASSIST_WRAPPER_KEYS) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      collectWorkerAssistPayloadRecords(nested, depth + 1, records);
    }
  }
}

function workerAssistPayloadHasInternalEnvelope(value: unknown, depth = 0): boolean {
  if (depth > MAX_WORKER_ASSIST_RECOVERY_DEPTH) return true;
  if (Array.isArray(value)) {
    if (value.length > MAX_WORKER_ASSIST_WRAPPER_ITEMS) return true;
    return value.some((item) => workerAssistPayloadHasInternalEnvelope(item, depth + 1));
  }
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (isWorkerAssistInternalEnvelope(record)) return true;
  return WORKER_ASSIST_WRAPPER_KEYS.some((key) => {
    const nested = record[key];
    return nested && typeof nested === "object"
      ? workerAssistPayloadHasInternalEnvelope(nested, depth + 1)
      : false;
  });
}

function hasWorkerAssistPublicPayloadField(record: Record<string, unknown>) {
  const text = firstString(
    ...WORKER_ASSIST_REPLY_KEYS.map((key) => record[key]),
  );
  return Boolean(text && !hasWorkerAssistInternalReplyMarker(text)) ||
    normalizeProviderPublicReasoningSummary(record).length > 0 ||
    Boolean(normalizeProviderSafetyNotes(record)?.length) ||
    firstBoolean(
      record.redirect_scope_change,
      record.redirectScopeChange,
      record.scope_change_required,
      record.scopeChangeRequired,
      record.requires_scope_change,
      record.requiresScopeChange,
    ) !== undefined ||
    Boolean(normalizeWorkerKaelSessionTitle(firstString(
      record.session_title,
      record.sessionTitle,
      record.title,
    ), false));
}

function isWorkerAssistInternalEnvelope(record: Record<string, unknown>) {
  const type = firstString(record.type, record.kind, record.channel)?.toLowerCase();
  return Boolean(type && WORKER_ASSIST_INTERNAL_ENVELOPE_TYPES.has(type));
}

function workerRedirectScopeChange(record: Record<string, unknown>) {
  return firstBoolean(
    record.redirect_scope_change,
    record.redirectScopeChange,
    record.scope_change_required,
    record.scopeChangeRequired,
    record.requires_scope_change,
    record.requiresScopeChange,
  ) === true;
}

function uniqueWorkerAssistStrings(values: readonly string[], maxItems: number) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, maxItems);
}

function normalizeProviderSafetyNotes(record: Record<string, unknown>) {
  for (const value of [record.safety_notes, record.safetyNotes]) {
    if (Array.isArray(value)) {
      const notes = value
        .map((item) =>
          typeof item === "string"
            ? item
            : item && typeof item === "object"
            ? firstString(
              (item as Record<string, unknown>).text,
              (item as Record<string, unknown>).note,
              (item as Record<string, unknown>).message,
            )
            : undefined
        )
        .map((item) => item?.trim().slice(0, MAX_WORKER_ASSIST_SAFETY_NOTE_LENGTH))
        .filter((item): item is string => Boolean(item))
        .slice(0, 3);
      return notes.length > 0 ? notes : undefined;
    }
  }
  const note = firstString(record.safety_note, record.safetyNote);
  return note ? [note.slice(0, MAX_WORKER_ASSIST_SAFETY_NOTE_LENGTH)] : undefined;
}

function normalizedWorkerAssistReply(
  value: unknown,
  depth = 0,
  maxTextLength = MAX_WORKER_ASSIST_TEXT_LENGTH,
): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (isWorkerAssistInternalEnvelope(record)) return undefined;
  for (const key of WORKER_ASSIST_REPLY_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim() && !hasWorkerAssistInternalReplyMarker(candidate)) {
      return candidate.trim().slice(0, maxTextLength);
    }
  }
  for (const key of WORKER_ASSIST_WRAPPER_KEYS) {
    const nested = normalizedWorkerAssistReply(record[key], depth + 1, maxTextLength);
    if (nested) return nested;
  }
  return undefined;
}

function hasWorkerAssistInternalReplyMarker(value: string) {
  const normalized = value.toLowerCase();
  return WORKER_ASSIST_INTERNAL_REPLY_MARKERS.some((marker) => normalized.includes(marker));
}

export function recoverWorkerAssistProviderReply(
  parsedValue: unknown,
  responseContent: unknown,
  maxTextLength = MAX_WORKER_ASSIST_TEXT_LENGTH,
): string | undefined {
  return recoverWorkerAssistProviderValue(parsedValue, 0, maxTextLength)
    ?? recoverWorkerAssistProviderValue(responseContent, 0, maxTextLength);
}

export function recoverWorkerAssistPlainReply(
  value: unknown,
  maxTextLength = MAX_WORKER_ASSIST_TEXT_LENGTH,
): string | undefined {
  if (typeof value !== "string") return undefined;
  let reply = value.trim();
  const hasThinkBlock = /<think(?:ing)?>/i.test(reply);
  if (hasThinkBlock) {
    const closingTags = [...reply.matchAll(/<\/think(?:ing)?>/gi)];
    const closingTag = closingTags.at(-1);
    if (!closingTag || closingTag.index === undefined) return undefined;
    reply = reply.slice(closingTag.index + closingTag[0].length).trim();
  }
  if (!reply || reply.startsWith("{") || reply.startsWith("[") || reply.startsWith("```")) {
    return undefined;
  }
  if (hasWorkerAssistInternalReplyMarker(reply)) return undefined;
  return reply.slice(0, maxTextLength);
}

function recoverWorkerAssistProviderValue(
  value: unknown,
  depth = 0,
  maxTextLength = MAX_WORKER_ASSIST_TEXT_LENGTH,
): string | undefined {
  if (depth > MAX_WORKER_ASSIST_RECOVERY_DEPTH || value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_WORKER_ASSIST_RECOVERY_ITEMS)) {
      const recovered = recoverWorkerAssistProviderValue(item, depth + 1, maxTextLength);
      if (recovered) return recovered;
    }
    return undefined;
  }
  if (typeof value === "string") {
    const plainReply = recoverWorkerAssistPlainReply(value, maxTextLength);
    if (plainReply) return plainReply;
    const parsed = parseWorkerAssistRecoveryJson(value);
    return parsed === undefined
      ? undefined
      : recoverWorkerAssistProviderValue(parsed, depth + 1, maxTextLength);
  }
  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  if (isWorkerAssistInternalEnvelope(record)) return undefined;
  for (const key of WORKER_ASSIST_REPLY_KEYS) {
    const recovered = recoverWorkerAssistProviderValue(record[key], depth + 1, maxTextLength);
    if (recovered) return recovered;
  }
  for (const key of [...WORKER_ASSIST_WRAPPER_KEYS, "choices", "items", "results"]) {
    const recovered = recoverWorkerAssistProviderValue(record[key], depth + 1, maxTextLength);
    if (recovered) return recovered;
  }
  return undefined;
}

function parseWorkerAssistRecoveryJson(value: string): unknown | undefined {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?[ \t]*(?:\r?\n)?/i, "")
    .replace(/(?:\r?\n)?```[ \t]*$/i, "")
    .trim();
  if (!normalized || (!normalized.startsWith("{") && !normalized.startsWith("["))) {
    return undefined;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return undefined;
  }
}

function normalizeProviderPublicReasoningSummary(record: Record<string, unknown>) {
  for (const value of [record.public_reasoning_summary, record.publicReasoningSummary]) {
    if (typeof value === "string") {
      const summary = value.trim().slice(0, 220);
      if (summary) return [summary];
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => typeof item === "string" ? item.trim().slice(0, 220) : "")
        .filter(Boolean)
        .slice(0, 4);
    }
  }
  return [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1"].includes(normalized)) return true;
      if (["false", "no", "0"].includes(normalized)) return false;
    }
  }
  return undefined;
}

export function describeWorkerAssistShape(
  value: unknown,
  issues: readonly StructuredValidationIssue[],
) {
  const shape = !value || typeof value !== "object"
    ? `type=${typeof value}`
    : Array.isArray(value)
    ? `array:${value.length}`
    : `keys=${Object.keys(value as Record<string, unknown>).slice(0, 8).join("|") || "none"}`;
  const issueSummary = issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`)
    .join("|");
  return `schema:${shape}${issueSummary ? `:${issueSummary}` : ""}`.slice(0, 120);
}

export function normalizeSafetyNotes(notes: readonly string[], language: KaelPromptLanguage) {
  const normalized = notes
    .map((note) => guardWorkerAssistText(note).text)
    .filter((note) => (
      note.length > 0 &&
      detectForbiddenAiDecisionText(note).allowed &&
      !hasKaelLanguageMismatch(note, language)
    ))
    .slice(0, 3);
  return normalized.length > 0 ? normalized : safetyNotesForLanguage(language);
}

export function fallbackTextForLanguage(
  language: KaelPromptLanguage,
  conversationMode: "normal" | "intake",
) {
  if (conversationMode === "normal") {
    return language === "en" ? GENERAL_FALLBACK_TEXT_EN : GENERAL_FALLBACK_TEXT;
  }
  return language === "en" ? FALLBACK_TEXT_EN : FALLBACK_TEXT;
}

export function workerScopeConfirmationAnswer(
  question: string,
  language: KaelPromptLanguage,
): WorkerAssistAnswer {
  return {
    schema_version: "worker_assist_answer.v1",
    text: language === "en"
      ? "No. You may submit a scope-change proposal for Kael to review, but do not perform the extra work until the customer confirms that proposal in the app. Add photos when available."
      : "Không. Bạn có thể gửi đề xuất đổi phạm vi để Kael kiểm tra, nhưng không được làm phần phát sinh cho đến khi khách xác nhận đề xuất đó trong ứng dụng. Thêm ảnh nếu có.",
    session_title: buildWorkerKaelSessionTitle(question, null, language),
    safety_notes: safetyNotesForLanguage(language),
    redirect_scope_change: true,
    fallback_used: false,
    provider_attempts: [],
    trace: [],
  };
}

export function workerPreCheckInAnswer(
  question: string,
  language: KaelPromptLanguage,
): WorkerAssistAnswer {
  return {
    schema_version: "worker_assist_answer.v1",
    text: language === "en"
      ? "No. Before check-in, do not report an inspection, enter the apartment, or begin inspecting. Use the Check in with a lobby photo step in the app. After check-in, wait for the customer to authorize unit access in the app before inspecting; an off-platform message does not replace that authorization."
      : "Không. Khi chưa xác nhận có mặt, bạn không được báo đang kiểm tra, vào căn hộ hoặc bắt đầu kiểm tra. Hãy dùng bước xác nhận có mặt bằng ảnh tại sảnh trong ứng dụng. Sau khi xác nhận có mặt, chờ khách xác nhận trong ứng dụng cho phép lên căn hộ trước khi kiểm tra; tin nhắn ngoài ứng dụng không thay thế bước xác nhận này.",
    session_title: buildWorkerKaelSessionTitle(question, null, language),
    safety_notes: safetyNotesForLanguage(language),
    redirect_scope_change: false,
    fallback_used: false,
    provider_attempts: [],
    trace: [],
  };
}

export function workerPrematureCompletionPaymentAnswer(
  question: string,
  language: KaelPromptLanguage,
): WorkerAssistAnswer {
  return {
    schema_version: "worker_assist_answer.v1",
    text: language === "en"
      ? "No. You cannot report completion or open payment at this step. First complete the lobby-photo check-in, wait for the customer to authorize access to the unit, then inspect and perform only the confirmed scope. After the real work is complete, submit the result and evidence for the customer to review, then the customer confirms; only then can payment open."
      : "Không. Bạn chưa thể báo hoàn thành hoặc mở thanh toán ở bước này. Trước hết hãy xác nhận có mặt bằng ảnh tại sảnh, chờ khách cho phép lên căn hộ, rồi kiểm tra và chỉ thực hiện công việc trong phạm vi đã xác nhận. Sau khi hoàn thành thực tế, bạn gửi kết quả và bằng chứng để khách xem, rồi khách xác nhận; chỉ khi đó thanh toán mới mở.",
    session_title: buildWorkerKaelSessionTitle(question, null, language),
    safety_notes: safetyNotesForLanguage(language),
    redirect_scope_change: false,
    fallback_used: false,
    provider_attempts: [],
    trace: [],
  };
}

function safetyNotesForLanguage(language: KaelPromptLanguage) {
  return language === "en" ? DEFAULT_SAFETY_NOTES_EN : DEFAULT_SAFETY_NOTES;
}

export function topicForQuestion(question: string) {
  const lower = question.toLowerCase();
  if (/scope|ph[a\u1ea1]m vi|phat sinh|ph[a\u00e1]t sinh|b\u1ed5 sung/i.test(lower)) {
    return "scope_change" as const;
  }
  if (/an toan|safety|\u0111i\u1ec7n|dien|r\u00f2|ro|leak|n\u01b0\u1edbc|nuoc/i.test(lower)) {
    return "worker_safety_advisory" as const;
  }
  if (/app|n[u\u00fa]t|b[a\u1ea5]m|button|khong thay|kh\u00f4ng th\u1ea5y/i.test(lower)) {
    return "app_usage_help" as const;
  }
  return "worker_brief" as const;
}

export function shouldRedirectToScopeChange(question: string) {
  return /scope|ph[a\u1ea1]m vi|phat sinh|ph[a\u00e1]t sinh|b\u1ed5 sung|th[e\u00ea]m vi[e\u1ec7]c|them viec|gi[a\u00e1]|price/i
    .test(question);
}

export function isWorkerPrematureScopeWorkRequest(question: string) {
  const normalized = question.toLowerCase();
  const scopeSignal = /scope|ph[aạ]m vi|phat sinh|ph[aá]t sinh|b[ổo] sung|th[eê]m vi[eệ]c|extra work/i.test(normalized);
  const earlyWorkSignal = /tr[ướo]c khi|ch[uư]a.*(?:kh[aá]ch|customer)|l[aà]m lu[oô]n|l[aà]m ngay|do it now|start.*(?:before|without)|perform.*(?:before|without)/i.test(normalized);
  return scopeSignal && earlyWorkSignal;
}

export function isWorkerPreCheckInBypassRequest(question: string) {
  const normalized = question
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLowerCase();
  const mentionsCheckIn = /\b(?:check[- ]?in|anh check[- ]?in|anh tai sanh|lobby photo)\b/.test(normalized);
  const asksToBypass = /\b(?:chua(?:\s+co)?|khong\s+co|bo\s+qua|skip|bypass|without)\b/.test(normalized);
  const asksToContinue = /\b(?:bao.*kiem tra|vao.*can ho|bat dau.*kiem tra|kiem tra truoc|report.*inspect|enter.*(?:apartment|unit)|start.*inspect)\b/.test(normalized);
  return mentionsCheckIn && asksToBypass && asksToContinue;
}

export function isWorkerPrematureCompletionPaymentRequest(question: string) {
  const normalized = question
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLowerCase();
  const completionOrPayment = /\b(?:bao hoan thanh|hoan thanh|thanh toan|tra tien|complete(?:d|ion)?|payment|pay)\b/.test(normalized);
  const earlySignal = /\b(?:chua(?: co)?|bo\s+qua|skip|bypass|truoc khi|before|without|ngay|now)\b/.test(normalized);
  return completionOrPayment && earlySignal;
}

export function buildWorkerAssistContext(input: WorkerAssistInput) {
  const job = input.job;
  const conversationMode = input.conversationMode ?? (job ? "intake" : "normal");
  const conversationScope = input.conversationScope ?? (
    job ? "job_intake" : conversationMode === "intake" ? "opportunity_intake" : "normal"
  );
  const opportunities = conversationScope === "opportunity_intake"
    ? (input.opportunities ?? []).slice(0, 20).map((opportunity) => ({
      ...opportunity,
      district: scrubOptionalWorkerOpportunityText(opportunity.district, 120),
      problem_summary: scrubOptionalWorkerOpportunityText(opportunity.problem_summary, 240),
      scope_summary: scrubOptionalWorkerOpportunityText(opportunity.scope_summary, 480),
    }))
    : undefined;
  const workerPreferences = conversationScope === "opportunity_intake"
    ? {
      service_types: input.opportunityPreferences?.service_types ?? [],
      districts: (input.opportunityPreferences?.districts ?? [])
        .map((district) => scrubSensitiveForLLM(district).trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 20),
    }
    : undefined;
  const recentTurns = conversationScope === "normal"
    ? []
    : (input.previousTurns ?? []).slice(-6);
  const turns = recentTurns.map((turn) => ({
    role: turn.role,
    text: turn.text
      ? scrubSensitiveForLLM(turn.text).slice(0, conversationScope === "normal" ? 1_500 : 240)
      : null,
  }));
  if (!job) {
    return JSON.stringify({
      conversation_mode: conversationScope,
      opportunities,
      worker_preferences: workerPreferences,
      recent_turns: turns,
    });
  }
  const brief = JSON.stringify({
    core: job.kael_worker_brief_core ?? null,
    guidance: job.kael_worker_brief_guidance ?? null,
  }).slice(0, 1600);
  return JSON.stringify({
    job_id: job.id,
    status: job.status ?? null,
    service_type: job.service_type ?? null,
    district: job.address_district ?? null,
    problem: job.kael_problem_identified ?? job.description ?? null,
    complexity: job.kael_complexity ?? null,
    worker_brief: brief,
    media_ref_count: input.mediaRefs?.length ?? 0,
    vision_evidence: input.visionFinding
      ? {
        present: true,
        confidence: input.visionFinding.confidence,
        requires_direct_verification: input.visionFinding.requires_direct_verification,
        safety_flags: input.visionFinding.safety_flags,
      }
      : { present: false },
    recent_turns: turns,
  });
}

function scrubOptionalWorkerOpportunityText(
  value: string | null,
  maxLength: number,
) {
  if (!value) return null;
  const scrubbed = scrubSensitiveForLLM(value).trim().slice(0, maxLength);
  return scrubbed || null;
}

export function workerAssistPolicyId(
  conversationScope: "normal" | "intake" | "opportunity_intake" | "job_intake",
) {
  if (conversationScope === "normal") return "kael.path.worker_assist_general.v1";
  return conversationScope === "opportunity_intake"
    ? "kael.path.worker_assist_opportunity.v1"
    : "kael.path.worker_assist_own_job.v1";
}

export function enforceWorkerVisionHonesty(
  text: string,
  safetyNotes: readonly string[],
  finding: WorkerVisionFinding | null | undefined,
  language: KaelPromptLanguage,
) {
  if (!finding) return { text, safetyNotes };

  const safetyCritical = finding.safety_flags.length > 0;
  const requiresVerification = finding.requires_direct_verification ||
    finding.confidence < 0.75 || safetyCritical;
  if (!requiresVerification) return { text, safetyNotes };

  const unsafeCertainty = /\b(?:safe to touch|safe to reconnect|definitely safe|confirmed safe)\b|(?:an to[aà]n|an toàn)\s+(?:để|de)\s+(?:chạm|cham|tác động|tac dong)|(?:chắc chắn|chac chan)\s+(?:an to[aà]n|an toàn)/iu
    .test(text);
  const findingText = scrubSensitiveForLLM(finding.problem_identified).slice(0, 240);
  const prefix = language === "en"
    ? `The image only suggests a possible finding: ${findingText}. Confirm it directly before acting.`
    : `Từ ảnh, Kael chỉ ghi nhận khả năng: ${findingText}. Bạn cần kiểm tra trực tiếp trước khi thao tác.`;
  const safeText = unsafeCertainty
    ? language === "en"
      ? `${prefix} The image cannot establish electrical safety for contact or reconnection.`
      : `${prefix} Ảnh không thể xác lập mức an toàn điện cho việc tiếp xúc hoặc đấu nối.`
    : `${prefix} ${text}`;
  const verificationNote = safetyCritical
    ? language === "en"
      ? "De-energize the area and verify it with appropriate equipment before contact."
      : "Ngắt nguồn khu vực và xác minh bằng thiết bị phù hợp trước khi chạm."
    : language === "en"
    ? "Confirm the image finding directly before changing the work."
    : "Xác minh trực tiếp nhận định từ ảnh trước khi thay đổi công việc.";
  return {
    text: safeText.slice(0, 700),
    safetyNotes: [...new Set([verificationNote, ...safetyNotes])].slice(0, 3),
  };
}

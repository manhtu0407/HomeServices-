import { scrubSensitiveForLLM } from "./pipeline/utils.ts";
import { hasKaelLanguageMismatch } from "./kael-guardrails/self-check.ts";
import type { KaelPromptLanguage } from "./prompts/system-prompt.ts";

export const KAEL_REASONING_SCHEMA_VERSION = "kael_reasoning.v1" as const;

export type KaelReasoningPublicStage =
  | "intent"
  | "context"
  | "retrieval"
  | "safety"
  | "compose";

export type KaelReasoningPublicStepStatus = "running" | "completed" | "failed";

export type KaelReasoningEventEmitter = (event: string, data: unknown) => void;

export type KaelReasoningReporter = {
  complete(input: {
    fallbackUsed: boolean;
    summary: readonly string[];
  }): void;
  fail(input: {
    publicMessage: string;
    recoverable: boolean;
  }): void;
  start(): void;
  step(input: {
    detail?: string | null;
    id: string;
    label: string;
    sequence: number;
    stage: KaelReasoningPublicStage;
    status: KaelReasoningPublicStepStatus;
  }): void;
};

export function reportKaelPublicExecutionStep(
  reporter: KaelReasoningReporter | undefined,
  step: Parameters<KaelReasoningReporter["step"]>[0],
) {
  reporter?.step(step);
}

const MAX_LABEL = 96;
const MAX_DETAIL = 180;
const MAX_SUMMARY = 220;
const MAX_FAILURE = 280;
const MAX_RECEIPT_ID = 160;
const MAX_SEQUENCE = 12;
const PUBLIC_STAGES = new Set<KaelReasoningPublicStage>([
  "intent",
  "context",
  "retrieval",
  "safety",
  "compose",
]);
const PUBLIC_STEP_STATUSES = new Set<KaelReasoningPublicStepStatus>([
  "running",
  "completed",
  "failed",
]);
const FORBIDDEN_PUBLIC_FIELD = /(?:\b(?:provider|model|prompt|token|cost|authorization|raw|deepseek|anthropic|perplexity|openai|chatgpt|claude|gemini|grok|mistral|qwen|llama)\b|api(?:[_\s-]?key)|chain\s*of\s*thought|(?:nhà|nha)\s*cung\s*cấp|mô\s*hình|lời\s*nhắc|chuỗi\s*suy\s*nghĩ|chuoi\s*suy\s*nghi|khóa\s*api|khoa\s*api|chỉ\s*dẫn\s*hệ\s*thống|chi\s*phí)/iu;
const SECRET_LIKE_VALUE = /\b(?:sk|pplx|sbp|eyJ)[A-Za-z0-9._-]{16,}\b/;

export function createKaelReasoningReporter(input: {
  emit: KaelReasoningEventEmitter;
  receiptId?: string;
  startedAt?: Date;
}): KaelReasoningReporter {
  const receiptId = publicReceiptId(input.receiptId ?? `kael-reasoning:${crypto.randomUUID()}`);
  const startedAt = input.startedAt ?? new Date();
  if (!Number.isFinite(startedAt.getTime())) {
    throw new Error("KAEL_REASONING_STARTED_AT_INVALID");
  }

  const startedAtMs = startedAt.getTime();
  let started = false;
  let terminal = false;
  const elapsedMs = () => Math.max(0, Date.now() - startedAtMs);
  const start = () => {
    if (started || terminal) return;
    started = true;
    input.emit("reasoning.started", {
      receipt_id: receiptId,
      schema_version: KAEL_REASONING_SCHEMA_VERSION,
      started_at: startedAt.toISOString(),
    });
  };

  return {
    complete(result) {
      if (terminal) return;
      if (typeof result.fallbackUsed !== "boolean") {
        throw new Error("KAEL_REASONING_FALLBACK_FLAG_INVALID");
      }
      const summary = result.summary
        .slice(0, 4)
        .map((item) => publicText(item, MAX_SUMMARY));
      start();
      terminal = true;
      input.emit("reasoning.completed", {
        elapsed_ms: elapsedMs(),
        fallback_used: result.fallbackUsed,
        receipt_id: receiptId,
        schema_version: KAEL_REASONING_SCHEMA_VERSION,
        summary,
      });
    },
    fail(failure) {
      if (terminal) return;
      if (typeof failure.recoverable !== "boolean") {
        throw new Error("KAEL_REASONING_RECOVERABLE_FLAG_INVALID");
      }
      const publicMessage = publicText(failure.publicMessage, MAX_FAILURE);
      start();
      terminal = true;
      input.emit("reasoning.failed", {
        elapsed_ms: elapsedMs(),
        public_message: publicMessage,
        receipt_id: receiptId,
        recoverable: failure.recoverable,
        schema_version: KAEL_REASONING_SCHEMA_VERSION,
      });
    },
    start,
    step(step) {
      if (terminal) return;
      const safeStep = {
        detail: step.detail === undefined || step.detail === null
          ? null
          : publicText(step.detail, MAX_DETAIL),
        id: publicIdentifier(step.id, 80),
        label: publicText(step.label, MAX_LABEL),
        sequence: boundedSequence(step.sequence),
        stage: publicStage(step.stage),
        status: publicStepStatus(step.status),
      };
      assertNoForbiddenPublicFields(safeStep);
      start();
      input.emit("reasoning.step", {
        elapsed_ms: elapsedMs(),
        receipt_id: receiptId,
        schema_version: KAEL_REASONING_SCHEMA_VERSION,
        step: safeStep,
      });
    },
  };
}

export function isKaelReasoningPublicSummaryItem(
  value: string,
  language?: KaelPromptLanguage,
) {
  try {
    const text = publicText(value, MAX_SUMMARY);
    return !language || !hasKaelLanguageMismatch(text, language);
  } catch {
    return false;
  }
}

function publicReceiptId(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9:_-]+$/u.test(normalized) || normalized.length > MAX_RECEIPT_ID) {
    throw new Error("KAEL_REASONING_RECEIPT_ID_INVALID");
  }
  if (SECRET_LIKE_VALUE.test(normalized)) {
    throw new Error("KAEL_REASONING_RECEIPT_ID_UNSAFE");
  }
  return normalized;
}

function publicStage(value: KaelReasoningPublicStage) {
  if (!PUBLIC_STAGES.has(value)) throw new Error("KAEL_REASONING_STAGE_INVALID");
  return value;
}

function publicStepStatus(value: KaelReasoningPublicStepStatus) {
  if (!PUBLIC_STEP_STATUSES.has(value)) {
    throw new Error("KAEL_REASONING_STEP_STATUS_INVALID");
  }
  return value;
}

function publicText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error("KAEL_REASONING_PUBLIC_TEXT_INVALID");
  }
  if (FORBIDDEN_PUBLIC_FIELD.test(normalized) || SECRET_LIKE_VALUE.test(normalized)) {
    throw new Error("KAEL_REASONING_PUBLIC_TEXT_UNSAFE");
  }
  if (scrubSensitiveForLLM(normalized) !== normalized) {
    throw new Error("KAEL_REASONING_PUBLIC_TEXT_UNSAFE");
  }
  return normalized;
}

function publicIdentifier(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9_-]*$/u.test(normalized) || normalized.length > maxLength) {
    throw new Error("KAEL_REASONING_PUBLIC_ID_INVALID");
  }
  return normalized;
}

function boundedSequence(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SEQUENCE) {
    throw new Error("KAEL_REASONING_SEQUENCE_INVALID");
  }
  return value;
}

function assertNoForbiddenPublicFields(value: unknown, path: readonly string[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPublicFields(item, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PUBLIC_FIELD.test(key)) {
      throw new Error(`KAEL_REASONING_FORBIDDEN_FIELD:${[...path, key].join(".")}`);
    }
    assertNoForbiddenPublicFields(nested, [...path, key]);
  }
}

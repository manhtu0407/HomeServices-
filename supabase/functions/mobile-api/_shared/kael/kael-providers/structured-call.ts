import { KAEL_CIRCUIT_BREAKER } from "./circuit-breaker.ts";
import {
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
} from "../kael-guardrails/durable-guards.ts";
import {
  callAI,
  callAIStream,
  type CallAIOptions,
  type CallAIStreamOptions,
} from "./provider-client.ts";
import type { KaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import type {
  AIError,
  AIRequest,
  AIResponse,
  EdgeAiSecrets,
} from "../contracts/types.ts";
import { safeParseJSONCandidates } from "../pipeline/utils.ts";

type SchemaIssue = {
  readonly code?: unknown;
  readonly path?: readonly PropertyKey[];
  readonly message?: unknown;
};

export type StructuredValidationIssue = {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
};

export type StructuredSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error?: { issues?: readonly SchemaIssue[] } };
};

export type StructuredAIResponse<T> = AIResponse & {
  readonly data: T;
};

export type StructuredAIError = AIError & {
  readonly response?: AIResponse;
  readonly parsedValue?: unknown;
  readonly streamStarted?: boolean;
  readonly validationIssues?: readonly StructuredValidationIssue[];
};

export type StructuredAIInvoker = (
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
  options?: CallAIOptions,
) => Promise<AIResponse | AIError>;

export type StructuredAIStreamInvoker = (
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate: KaelSpendGate | undefined,
  options: CallAIStreamOptions,
) => Promise<AIResponse | AIError>;

export type StructuredResponseStreamObserver = {
  readonly hasSeenText: () => boolean;
  readonly push: (delta: string) => void;
};

export async function callStructuredAI<T>(
  request: AIRequest,
  schema: StructuredSchema<T>,
  secrets: EdgeAiSecrets,
  gate: KaelSpendGate | undefined,
  invoke: StructuredAIInvoker = callAI,
): Promise<StructuredAIResponse<T> | StructuredAIError> {
  const response = await invoke(request, secrets, gate, {
    deferCircuitSuccess: true,
  });
  if (!response.success) return response;

  const validated = validateStructuredProviderContent(response.content, schema);
  if (!validated.success) {
    await recordStructuredFailure(request, secrets);
    return {
      success: false,
      provider: request.provider,
      code: "SCHEMA_INVALID",
      error: "schema_invalid",
      response,
      parsedValue: validated.parsedValue,
      validationIssues: validated.validationIssues,
    };
  }

  await recordStructuredSuccess(request, secrets);
  return { ...response, data: validated.data };
}

/**
 * Validates the final structured response exactly as callStructuredAI does,
 * while feeding a bounded server-side observer with provider-native text.
 */
export async function callStructuredAIStream<T>(
  request: AIRequest,
  schema: StructuredSchema<T>,
  secrets: EdgeAiSecrets,
  gate: KaelSpendGate | undefined,
  observer: StructuredResponseStreamObserver,
  invoke: StructuredAIStreamInvoker = callAIStream,
): Promise<StructuredAIResponse<T> | StructuredAIError> {
  const response = await invoke(request, secrets, gate, {
    deferCircuitSuccess: true,
    onTextDelta: observer.push,
  });
  if (!response.success) {
    return {
      ...response,
      streamStarted: observer.hasSeenText(),
    };
  }

  const validated = validateStructuredProviderContent(response.content, schema);
  if (!validated.success) {
    await recordStructuredFailure(request, secrets);
    return {
      success: false,
      provider: request.provider,
      code: "SCHEMA_INVALID",
      error: "schema_invalid",
      response,
      parsedValue: validated.parsedValue,
      streamStarted: observer.hasSeenText(),
      validationIssues: validated.validationIssues,
    };
  }

  await recordStructuredSuccess(request, secrets);
  return { ...response, data: validated.data };
}

/**
 * Extracts only completed public-summary strings and the growing answer/text
 * value from the provider's JSON channel. It never returns raw SSE payloads,
 * private fields, or a partial escaped sequence.
 */
export function createStructuredResponseStreamObserver(input: {
  readonly onPublicReasoningSummary?: (detail: string, index: number) => void;
  readonly onTextUpdate?: (text: string, complete: boolean) => void;
  readonly textField: "answer" | "text";
}): StructuredResponseStreamObserver {
  let source = "";
  let emittedSummaryCount = 0;
  let lastText = "";
  let sawText = false;

  const push = (delta: string) => {
    if (!delta || source.length >= MAX_STRUCTURED_STREAM_CHARS) return;
    source = `${source}${delta}`.slice(0, MAX_STRUCTURED_STREAM_CHARS);
    const summaryJson = structuredJsonSource(source);
    if (!summaryJson) return;

    const summary = extractJsonStringArray(summaryJson, "public_reasoning_summary");
    for (let index = emittedSummaryCount; index < summary.values.length; index += 1) {
      input.onPublicReasoningSummary?.(summary.values[index], index);
    }
    emittedSummaryCount = Math.max(emittedSummaryCount, summary.values.length);

    const text = extractApprovedJsonString(source, input.textField);
    if (!text || text.value === lastText) return;
    lastText = text.value;
    sawText = sawText || text.value.length > 0;
    input.onTextUpdate?.(text.value, text.complete);
  };

  return {
    hasSeenText: () => sawText,
    push,
  };
}

const MAX_STRUCTURED_STREAM_CHARS = 16_000;
function validateStructuredProviderContent<T>(
  content: string,
  schema: StructuredSchema<T>,
):
  | { readonly success: true; readonly data: T }
  | {
    readonly success: false;
    readonly parsedValue: unknown | null;
    readonly validationIssues: readonly StructuredValidationIssue[];
  } {
  let parsedValue: unknown | null = null;
  let validationIssues: readonly StructuredValidationIssue[] = [];
  for (const candidate of safeParseStructuredProviderContentCandidates(content)) {
    if (parsedValue === null) parsedValue = candidate;
    const validated = schema.safeParse(candidate);
    if (validated.success) return { success: true, data: validated.data };
    if (validationIssues.length === 0) {
      validationIssues = normalizeIssues(validated.error?.issues) ?? [];
    }
  }
  return { success: false, parsedValue, validationIssues };
}

function safeParseStructuredProviderContentCandidates(content: string): readonly unknown[] {
  const visibleContent = contentAfterLeadingThinkingBlocks(content);
  return visibleContent === null ? [] : safeParseJSONCandidates(visibleContent);
}

function contentAfterLeadingThinkingBlocks(content: string): string | null {
  let remaining = content.trimStart();
  let strippedThinking = false;

  while (true) {
    const opening = remaining.match(/^<think(?:ing)?\b[^>]*>/i);
    if (!opening) break;
    const closing = /<\/think(?:ing)?\s*>/ig;
    closing.lastIndex = opening[0].length;
    const match = closing.exec(remaining);
    if (!match || match.index < opening[0].length) return null;
    remaining = remaining.slice(match.index + match[0].length).trimStart();
    strippedThinking = true;
  }

  if (/^<think/i.test(remaining)) return null;
  return strippedThinking ? remaining : content;
}

function extractJsonStringArray(source: string, field: string) {
  const fieldStart = findJsonFieldValueStart(source, field, "[");
  if (fieldStart === null) return { values: [] as string[] };
  const values: string[] = [];
  let index = fieldStart + 1;
  while (index < source.length) {
    index = skipJsonWhitespaceAndCommas(source, index);
    if (source[index] === "]") break;
    if (source[index] !== "\"") break;
    const value = readJsonString(source, index);
    if (!value.complete) break;
    values.push(value.value);
    index = value.nextIndex;
  }
  return { values };
}

function extractApprovedJsonString(source: string, field: string) {
  const json = strictStructuredJsonObject(source);
  if (!json) return null;
  const summaryStart = findJsonFieldValueStart(json, "public_reasoning_summary", "[");
  const textStart = findJsonFieldValueStart(json, field, "\"");
  if (summaryStart === null || textStart === null || summaryStart > textStart) return null;
  return readJsonString(json, textStart);
}

function structuredJsonSource(source: string) {
  const visible = contentAfterLeadingThinkingBlocks(source);
  if (visible === null) return null;
  const start = visible.indexOf("{");
  return start >= 0 ? visible.slice(start) : null;
}

function strictStructuredJsonObject(source: string) {
  const visible = contentAfterLeadingThinkingBlocks(source);
  if (visible === null) return null;
  const json = visible.trimStart();
  return json.startsWith("{") ? json : null;
}

function findJsonFieldValueStart(
  source: string,
  field: string,
  expectedOpening: "[" | "\"",
) {
  const match = new RegExp(`"${field}"\\s*:\\s*`, "u").exec(source);
  if (!match) return null;
  const index = (match.index ?? 0) + match[0].length;
  return source[index] === expectedOpening ? index : null;
}

function skipJsonWhitespaceAndCommas(source: string, start: number) {
  let index = start;
  while (index < source.length && /[\s,]/u.test(source[index])) index += 1;
  return index;
}

function readJsonString(source: string, start: number): {
  readonly complete: boolean;
  readonly nextIndex: number;
  readonly value: string;
} {
  if (source[start] !== "\"") return { complete: false, nextIndex: start, value: "" };
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    const char = source[index];
    if (char === "\"") {
      return { complete: true, nextIndex: index + 1, value };
    }
    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }
    const escaped = source[index + 1];
    if (!escaped) return { complete: false, nextIndex: index, value };
    if (escaped === "u") {
      const code = source.slice(index + 2, index + 6);
      if (!/^[0-9a-f]{4}$/iu.test(code)) {
        return { complete: false, nextIndex: index, value };
      }
      value += String.fromCharCode(Number.parseInt(code, 16));
      index += 6;
      continue;
    }
    const escapedValue = escaped === "n"
      ? "\n"
      : escaped === "r"
      ? "\r"
      : escaped === "t"
      ? "\t"
      : escaped === "b"
      ? "\b"
      : escaped === "f"
      ? "\f"
      : escaped === "\"" || escaped === "\\" || escaped === "/"
      ? escaped
      : null;
    if (escapedValue === null) return { complete: false, nextIndex: index, value };
    value += escapedValue;
    index += 2;
  }
  return { complete: false, nextIndex: index, value };
}

export function hasStructuredValidationIssue(
  result: StructuredAIError,
  message: string,
): boolean {
  return result.validationIssues?.some((issue) => issue.message === message) ?? false;
}

async function recordStructuredFailure(
  request: AIRequest,
  secrets: EdgeAiSecrets,
): Promise<void> {
  if (!request.purpose) return;
  const failure = {
    purpose: request.purpose,
    provider: request.provider,
    errorCode: "SCHEMA_INVALID",
  };
  if (secrets.durableGuardsEnabled) {
    await recordDurableCircuitFailure(secrets.durableGuardClient, failure);
    return;
  }
  KAEL_CIRCUIT_BREAKER.recordFailure(failure);
}

async function recordStructuredSuccess(
  request: AIRequest,
  secrets: EdgeAiSecrets,
): Promise<void> {
  if (!request.purpose) return;
  if (secrets.durableGuardsEnabled) {
    await recordDurableCircuitSuccess(
      secrets.durableGuardClient,
      request.purpose,
      request.provider,
    );
    return;
  }
  KAEL_CIRCUIT_BREAKER.recordSuccess(request.purpose, request.provider);
}

function normalizeIssues(
  issues: readonly SchemaIssue[] | undefined,
): readonly StructuredValidationIssue[] | undefined {
  if (!issues?.length) return undefined;
  return issues.map((issue) => ({
    code: typeof issue.code === "string" ? issue.code : "invalid",
    path: Array.isArray(issue.path) ? issue.path : [],
    message: typeof issue.message === "string" ? issue.message : "invalid",
  }));
}

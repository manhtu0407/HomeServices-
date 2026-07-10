import { KAEL_CIRCUIT_BREAKER } from "./circuit-breaker.ts";
import {
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
} from "./durable-guards.ts";
import {
  callAI,
  type CallAIOptions,
} from "./provider-client.ts";
import type { KaelSpendGate } from "./spend-gate.ts";
import type {
  AIError,
  AIRequest,
  AIResponse,
  EdgeAiSecrets,
} from "./types.ts";
import { safeParseJSON } from "./utils.ts";

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
  readonly validationIssues?: readonly StructuredValidationIssue[];
};

export type StructuredAIInvoker = (
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
  options?: CallAIOptions,
) => Promise<AIResponse | AIError>;

export async function callStructuredAI<T>(
  request: AIRequest,
  schema: StructuredSchema<T>,
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
  invoke: StructuredAIInvoker = callAI,
): Promise<StructuredAIResponse<T> | StructuredAIError> {
  const response = await invoke(request, secrets, gate, {
    deferCircuitSuccess: true,
  });
  if (!response.success) return response;

  const parsed = safeParseJSON(response.content);
  const validated = parsed === null ? null : schema.safeParse(parsed);
  if (!validated?.success) {
    await recordStructuredFailure(request, secrets);
    return {
      success: false,
      provider: request.provider,
      code: "SCHEMA_INVALID",
      error: "schema_invalid",
      response,
      parsedValue: parsed,
      validationIssues: normalizeIssues(validated?.error?.issues),
    };
  }

  await recordStructuredSuccess(request, secrets);
  return { ...response, data: validated.data };
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

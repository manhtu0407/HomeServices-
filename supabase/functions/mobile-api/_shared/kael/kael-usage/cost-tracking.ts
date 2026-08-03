import type { AIProvider } from "../contracts/types.ts";
import { calculateModelCostUsd } from "./model-pricing.ts";

export const KAEL_OPTIMIZATION_FLAG_NAMES = [
  "KAEL_OPT_PROMPT_CACHE_ENABLED",
  "KAEL_OPT_CAP_OUTPUT_ENABLED",
  "KAEL_OPT_MARKET_CACHE_ENABLED",
  "KAEL_OPT_BATCH_LEARNING_ENABLED",
  "KAEL_OPT_BATCH_API_ENABLED",
  // Off keeps the deterministic clarification path;
  // clarification path; on = conversation-aware diagnose + ONE specific question.
  "KAEL_OPT_LLM_CLARIFICATION_ENABLED",
] as const;

export type KaelOptimizationFlagName =
  (typeof KAEL_OPTIMIZATION_FLAG_NAMES)[number];

export type KaelOptimizationFlags = Record<KaelOptimizationFlagName, boolean>;

export type KaelCostProjectionInput = {
  readonly totalCostUsd: number;
  readonly sampleJobs: number;
  readonly targetJobs: number;
};

export type KaelApiLogMetricInput = {
  readonly request_id?: unknown;
  readonly job_id?: unknown;
  readonly purpose?: unknown;
  readonly provider?: unknown;
  readonly model?: unknown;
  readonly input_tokens?: unknown;
  readonly output_tokens?: unknown;
  readonly cost_usd?: unknown;
  readonly latency_ms?: unknown;
  readonly success?: unknown;
  readonly error_code?: unknown;
  readonly safe_metadata?: unknown;
};

export function readKaelOptimizationFlags(
  getEnv = readRuntimeEnv,
): KaelOptimizationFlags {
  return {
    KAEL_OPT_PROMPT_CACHE_ENABLED: envFlag(getEnv("KAEL_OPT_PROMPT_CACHE_ENABLED")),
    KAEL_OPT_CAP_OUTPUT_ENABLED: envFlag(getEnv("KAEL_OPT_CAP_OUTPUT_ENABLED")),
    KAEL_OPT_MARKET_CACHE_ENABLED: envFlag(getEnv("KAEL_OPT_MARKET_CACHE_ENABLED")),
    KAEL_OPT_BATCH_LEARNING_ENABLED: envFlag(getEnv("KAEL_OPT_BATCH_LEARNING_ENABLED")),
    KAEL_OPT_BATCH_API_ENABLED: envFlag(getEnv("KAEL_OPT_BATCH_API_ENABLED")),
    KAEL_OPT_LLM_CLARIFICATION_ENABLED: envFlag(getEnv("KAEL_OPT_LLM_CLARIFICATION_ENABLED")),
  };
}

export function enabledKaelOptimizationOptions(
  flags: KaelOptimizationFlags,
): string[] {
  return KAEL_OPTIMIZATION_FLAG_NAMES.filter((name) => flags[name]);
}

export function buildKaelOptimizationMetricRows(
  apiLogRows: readonly KaelApiLogMetricInput[],
  flags = readKaelOptimizationFlags(),
): Array<Record<string, unknown>> {
  const enabledOptions = enabledKaelOptimizationOptions(flags);
  return apiLogRows
    .map((row) => toMetricRow(row, flags, enabledOptions))
    .filter((row): row is Record<string, unknown> => row !== null);
}

export function estimateProviderCostUsd(input: {
  readonly provider: AIProvider;
  readonly model?: string | null;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly searchContextSize?: "low" | "medium" | "high";
}): number | null {
  const inputTokens = nonNegativeNumber(input.inputTokens);
  const outputTokens = nonNegativeNumber(input.outputTokens);
  if (inputTokens === null && outputTokens === null) return null;
  if (!input.model?.trim()) return null;
  return roundUsd(calculateModelCostUsd({
    provider: input.provider,
    model: input.model,
    inputTokens,
    outputTokens,
    searchContextSize: input.searchContextSize,
  }));
}

export function calculateKaelCostProjection(
  input: KaelCostProjectionInput,
): { costPerJobUsd: number; projectedCostUsd: number } {
  if (input.sampleJobs <= 0 || input.targetJobs <= 0) {
    return { costPerJobUsd: 0, projectedCostUsd: 0 };
  }
  const costPerJobUsd = input.totalCostUsd / input.sampleJobs;
  return {
    costPerJobUsd: roundUsd(costPerJobUsd),
    projectedCostUsd: roundUsd(costPerJobUsd * input.targetJobs),
  };
}

function toMetricRow(
  row: KaelApiLogMetricInput,
  flags: KaelOptimizationFlags,
  enabledOptions: string[],
): Record<string, unknown> | null {
  const purpose = stringOrNull(row.purpose);
  const provider = providerOrNull(row.provider);
  if (!purpose || !provider) return null;

  const inputTokens = integerOrNull(row.input_tokens);
  const outputTokens = integerOrNull(row.output_tokens);
  const costActual = nonNegativeNumber(row.cost_usd);
  const estimatedCost = estimateProviderCostUsd({
    provider,
    model: stringOrNull(row.model),
    inputTokens,
    outputTokens,
  });
  const qualityPass = typeof row.success === "boolean" ? row.success : null;
  const safeMetadata = safeMetricMetadata(row.safe_metadata);

  return {
    request_id: stringOrNull(row.request_id),
    job_id: stringOrNull(row.job_id),
    purpose,
    provider,
    model: stringOrNull(row.model),
    option_flags: flags,
    enabled_options: enabledOptions,
    cost_before_estimate: costActual ?? estimatedCost,
    cost_actual: costActual,
    latency_ms: integerOrNull(row.latency_ms),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    quality_pass: qualityPass,
    quality_signal: qualityPass === false
      ? stringOrNull(row.error_code) ?? "provider_failed"
      : "provider_success",
    metric_source: "edge_api_log",
    safe_metadata: safeMetadata,
  };
}

function safeMetricMetadata(value: unknown): Record<string, unknown> {
  const metadata = isRecord(value) ? value : {};
  return {
    metric_version: "q1.2026-05-26",
    surface: stringOrNull(metadata.surface),
    cache_status: stringOrNull(metadata.cache_status),
  };
}

function readRuntimeEnv(name: string): string | undefined {
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.(name);
}

function envFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function providerOrNull(value: unknown): AIProvider | null {
  return value === "anthropic" || value === "perplexity" || value === "deepseek"
    ? value
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerOrNull(value: unknown): number | null {
  const number = nonNegativeNumber(value);
  return number === null ? null : Math.round(number);
}

function nonNegativeNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

import { z } from "zod";
import type { AIProvider, EdgeAiSecrets } from "./types.ts";
import { KAEL_BUSINESS_GUARDRAILS, KAEL_RESPONSE_STYLE } from "./types.ts";
import { callStructuredAI } from "./structured-call.ts";
import { KAEL_ROUTING_CONFIG, maxTokensForPurpose } from "./routing.config.ts";

export const priceSynthesisAbCaseSchema = z.object({
  case_key: z.string().min(4).max(160),
  service_type: z.enum(["electrical", "plumbing", "cleaning"]),
  problem_slug: z.string().min(1).max(100),
  district_code: z.string().min(1).max(80),
  complexity: z.enum(["small", "medium", "large"]),
  baseline_min: z.number().int().positive(),
  baseline_max: z.number().int().positive(),
  market_range_min: z.number().int().positive(),
  market_range_max: z.number().int().positive(),
  market_confidence: z.number().min(0).max(1),
  actual_final_price: z.number().int().positive().optional(),
}).refine((data) => data.baseline_max >= data.baseline_min, {
  path: ["baseline_max"],
  message: "baseline_max must be >= baseline_min",
}).refine((data) => data.market_range_max >= data.market_range_min, {
  path: ["market_range_max"],
  message: "market_range_max must be >= market_range_min",
});

export type PriceSynthesisAbCaseInput = z.infer<
  typeof priceSynthesisAbCaseSchema
>;

const priceSynthesisAbResultSchema = z.object({
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
}).refine((data) => data.price_max >= data.price_min, {
  path: ["price_max"],
  message: "price_max must be >= price_min",
});

type ProviderEval = {
  provider: AIProvider;
  model: string;
  schema_valid: boolean;
  price_min: number | null;
  price_max: number | null;
  confidence: number | null;
  failure_reason: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
};

export type PriceSynthesisAbEvaluation = {
  case_key: string;
  purpose: "price_synthesis";
  perplexity: ProviderEval;
  anthropic: ProviderEval;
  fallback_used: boolean;
};

export async function evaluatePriceSynthesisAbCase(
  input: PriceSynthesisAbCaseInput,
  secrets: EdgeAiSecrets,
): Promise<PriceSynthesisAbEvaluation> {
  const route = KAEL_ROUTING_CONFIG.price_synthesis;
  const [perplexity, anthropic] = await Promise.all([
    evaluateProvider("perplexity", "sonar", input, secrets),
    evaluateProvider(route.primary.provider, route.primary.model, input, secrets),
  ]);

  return {
    case_key: input.case_key,
    purpose: "price_synthesis",
    perplexity,
    anthropic,
    fallback_used: !perplexity.schema_valid,
  };
}

async function evaluateProvider(
  provider: AIProvider,
  model: string,
  input: PriceSynthesisAbCaseInput,
  secrets: EdgeAiSecrets,
): Promise<ProviderEval> {
  const route = KAEL_ROUTING_CONFIG.price_synthesis;
  const result = await callStructuredAI({
    purpose: "price_synthesis",
    provider,
    model,
    messages: buildPriceSynthesisAbMessages(input),
    maxTokens: maxTokensForPurpose("price_synthesis", 200),
    temperature: 0.1,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
  }, priceSynthesisAbResultSchema, secrets);

  if (!result.success) {
    const schemaResponse = result.code === "SCHEMA_INVALID"
      ? result.response
      : undefined;
    if (schemaResponse) {
      return {
        provider,
        model,
        schema_valid: false,
        price_min: null,
        price_max: null,
        confidence: null,
        failure_reason: "SCHEMA_INVALID",
        input_tokens: schemaResponse.usage.inputTokens,
        output_tokens: schemaResponse.usage.outputTokens,
        cost_usd: schemaResponse.usage.costUsd,
        latency_ms: schemaResponse.latencyMs,
      };
    }
    return {
      provider,
      model,
      schema_valid: false,
      price_min: null,
      price_max: null,
      confidence: null,
      failure_reason: result.code,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      latency_ms: route.latencyBudgetMs,
    };
  }

  return {
    provider,
    model,
    schema_valid: true,
    price_min: result.data.price_min,
    price_max: result.data.price_max,
    confidence: result.data.confidence,
    failure_reason: null,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_usd: result.usage.costUsd,
    latency_ms: result.latencyMs,
  };
}

function buildPriceSynthesisAbMessages(input: PriceSynthesisAbCaseInput) {
  return [
    {
      role: "system" as const,
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are evaluating price_synthesis for a Ho Chi Minh City apartment service.
Use the provided baseline and market range only. Do not add unsupported services.
Return ONLY JSON: {"price_min":number,"price_max":number,"confidence":number}.`,
    },
    {
      role: "user" as const,
      content: `Service: ${input.service_type}
Problem slug: ${input.problem_slug}
District: ${input.district_code}
Complexity: ${input.complexity}
Baseline VND: ${input.baseline_min}-${input.baseline_max}
Market VND: ${input.market_range_min}-${input.market_range_max}
Market confidence: ${input.market_confidence}`,
    },
  ];
}

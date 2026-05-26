import type { ComplexityLevel, EdgeAiSecrets, MarketPriceResult, ServiceType } from "./types.ts";
import { marketPriceResultSchema } from "./types.ts";
import { buildPricingMessages } from "./prompts.ts";
import { callAI } from "./provider-client.ts";
import { providerCandidatesForPurpose } from "./routing.ts";
import { safeParseJSON } from "./utils.ts";

export async function searchMarketPrice(
  serviceType: ServiceType,
  problem: string,
  complexity: ComplexityLevel,
  district: string,
  secrets: EdgeAiSecrets,
): Promise<
  {
    success: true;
    market: MarketPriceResult;
    provider: "anthropic" | "perplexity" | "deepseek";
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | {
    success: false;
    failureReason: string;
    provider?: "anthropic" | "perplexity" | "deepseek";
    model?: string;
  }
> {
  const failures: string[] = [];
  for (const route of providerCandidatesForPurpose("market_lookup")) {
    const result = await callAI({
      purpose: "market_lookup",
      provider: route.provider,
      model: route.model,
      messages: buildPricingMessages(serviceType, problem, complexity, district),
      maxTokens: 300,
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, secrets);

    if (!result.success) {
      failures.push(`${route.provider}:AI call failed: ${result.code}`);
      continue;
    }

    const parsed = safeParseJSON(result.content);
    const validated = parsed ? marketPriceResultSchema.safeParse(parsed) : null;
    if (!validated?.success) {
      failures.push(`${route.provider}:AI market JSON validation failed`);
      continue;
    }
    if (validated.data.market_range_max < validated.data.market_range_min) {
      failures.push(`${route.provider}:market_range_max < market_range_min`);
      continue;
    }
    return {
      success: true,
      market: validated.data,
      provider: route.provider,
      model: route.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.usage.costUsd,
    };
  }
  return { success: false, failureReason: failures.join("; ") || "NO_PROVIDER_AVAILABLE" };
}

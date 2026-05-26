import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { EdgeAiSecrets, VisionResult } from "./types.ts";
import { visionResultSchema } from "./types.ts";
import { buildVisionMessages } from "./prompts.ts";
import { callAI } from "./provider-client.ts";
import { chooseProvider } from "./routing.ts";
import { safeParseJSON } from "./utils.ts";

export async function analyzeDescription(
  description: string,
  intentContext: string,
  photoUrls: string[],
  secrets: EdgeAiSecrets,
): Promise<
  | { success: true; analysis: VisionResult }
  | { success: false; fallback: VisionResult; failureReason: string }
> {
  const route = chooseProvider("vision_analysis");
  const result = await callAI({
    purpose: "vision_analysis",
    provider: route.provider,
    model: route.model,
    messages: buildVisionMessages(
      description,
      sanitizeForLLM(intentContext),
      photoUrls,
    ),
    maxTokens: 500,
    temperature: 0.2,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
  }, secrets);

  if (!result.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: `AI call failed: ${result.code}`,
    };
  }

  const parsed = safeParseJSON(result.content);
  const validated = parsed ? visionResultSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: "AI vision JSON validation failed",
    };
  }

  return { success: true, analysis: validated.data };
}

function buildFallbackVision(intentContext: string): VisionResult {
  return {
    problem_identified: intentContext || "Vấn đề cần kiểm tra trực tiếp",
    severity_indicators: [],
    complexity_hint: "medium",
  };
}

import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { EdgeAiSecrets, VisionResult } from "./types.ts";
import { visionResultSchema } from "./types.ts";
import { buildVisionMessages } from "./prompts.ts";
import { callAI } from "./provider-client.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { chooseProvider } from "./routing.ts";
import { safeParseJSON, sanitizeVisionPhotoUrls } from "./utils.ts";

const VISION_MAX_TOKENS = 320;

type VisionAnalysisResult =
  | {
    success: true;
    analysis: VisionResult;
    provider: "anthropic" | "perplexity" | "deepseek";
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cacheStatus?: "hit" | "write" | "miss";
  }
  | {
    success: false;
    fallback: VisionResult;
    failureReason: string;
    skipped?: boolean;
  };

export async function analyzeDescription(
  description: string,
  intentContext: string,
  photoUrls: string[],
  secrets: EdgeAiSecrets,
): Promise<VisionAnalysisResult> {
  const safePhotoUrls = sanitizeVisionPhotoUrls(photoUrls);
  if (safePhotoUrls.length === 0) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: "NO_PHOTOS_FOR_VISION",
      skipped: true,
    };
  }

  const route = chooseProvider("vision_analysis");
  const result = await callAI({
    purpose: "vision_analysis",
    provider: route.provider,
    model: route.model,
    messages: buildVisionMessages(
      description,
      sanitizeForLLM(intentContext),
      safePhotoUrls,
    ),
    maxTokens: maxTokensForPurpose("vision_analysis", VISION_MAX_TOKENS),
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

  return {
    success: true,
    analysis: validated.data,
    provider: route.provider,
    model: route.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd: result.usage.costUsd,
    cacheStatus: result.usage.cacheStatus,
  };
}

function buildFallbackVision(intentContext: string): VisionResult {
  return {
    problem_identified: intentContext || "Vấn đề cần kiểm tra trực tiếp",
    severity_indicators: [],
    complexity_hint: "medium",
  };
}

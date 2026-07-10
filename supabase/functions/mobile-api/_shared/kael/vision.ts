import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { AIImageContent, EdgeAiSecrets, VisionResult } from "./types.ts";
import { visionResultSchema } from "./types.ts";
import { buildVisionMessages } from "./prompts.ts";
import {
  callStructuredAI,
  hasStructuredValidationIssue,
  type StructuredAIResponse,
} from "./structured-call.ts";
import type { KaelSpendGate } from "./spend-gate.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { chooseCircuitAwareProviderOrNull } from "./routing.ts";
import { logKaelEscalation, selectKaelEscalation } from "./escalation.ts";
import { sanitizeVisionPhotoUrls } from "./utils.ts";

const VISION_MAX_TOKENS = 320;
const VISION_IMAGE_FETCH_TIMEOUT_MS = 5_000;
const VISION_IMAGE_MAX_BYTES = 4_000_000;
const VIETNAMESE_DIACRITICS_REQUIRED = "VIETNAMESE_DIACRITICS_REQUIRED";
const visionStructuredResultSchema = visionResultSchema.refine(
  (value) => hasVietnameseDiacritics(value.problem_identified),
  {
    path: ["problem_identified"],
    message: VIETNAMESE_DIACRITICS_REQUIRED,
  },
);

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
type VisionImageMediaType = Extract<
  AIImageContent["source"],
  { type: "base64" }
>["media_type"];

export async function analyzeDescription(
  description: string,
  intentContext: string,
  photoUrls: string[],
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
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
  const imageBlocks = await fetchVisionImageBlocks(safePhotoUrls);
  if (imageBlocks.length === 0) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: "NO_FETCHABLE_PHOTOS_FOR_VISION",
      skipped: true,
    };
  }

  const route = chooseCircuitAwareProviderOrNull("vision_analysis");
  if (!route) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: "NO_PROVIDER_AVAILABLE",
    };
  }
  const primaryResult = await callStructuredAI({
    purpose: "vision_analysis",
    provider: route.provider,
    model: route.model,
    messages: buildVisionMessages(
      description,
      sanitizeForLLM(intentContext),
      imageBlocks,
    ),
    maxTokens: maxTokensForPurpose("vision_analysis", VISION_MAX_TOKENS),
    temperature: 0.2,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
  }, visionStructuredResultSchema, secrets, gate);

  if (!primaryResult.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: primaryResult.code === "SCHEMA_INVALID"
        ? hasStructuredValidationIssue(primaryResult, VIETNAMESE_DIACRITICS_REQUIRED)
          ? "AI vision Vietnamese validation failed"
          : "AI vision JSON validation failed"
        : `AI call failed: ${primaryResult.code}`,
    };
  }

  const escalation = selectKaelEscalation("vision_analysis", {
    provider: route.provider,
    model: route.model,
    hardVision: primaryResult.data.complexity_hint === "large",
  });
  if (!escalation) return successfulVisionResult(primaryResult, route);

  logKaelEscalation("vision_analysis", escalation);
  const escalatedResult = await callStructuredAI({
    purpose: "vision_analysis",
    provider: escalation.route.provider,
    model: escalation.route.model,
    messages: buildVisionMessages(
      description,
      sanitizeForLLM(intentContext),
      imageBlocks,
    ),
    maxTokens: maxTokensForPurpose("vision_analysis", VISION_MAX_TOKENS),
    temperature: 0.2,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
  }, visionStructuredResultSchema, secrets, gate);
  if (!escalatedResult.success) return successfulVisionResult(primaryResult, route);
  return successfulVisionResult(escalatedResult, escalation.route);
}

function successfulVisionResult(
  result: StructuredAIResponse<VisionResult>,
  route: { provider: "anthropic" | "perplexity" | "deepseek"; model: string },
): VisionAnalysisResult {
  return {
    success: true,
    analysis: result.data,
    provider: route.provider,
    model: route.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd: result.usage.costUsd,
    cacheStatus: result.usage.cacheStatus,
  };
}

function hasVietnameseDiacritics(text: string): boolean {
  return /[\u0300-\u036f]/u.test(text.normalize("NFD")) || /[đĐ]/u.test(text);
}

async function fetchVisionImageBlocks(
  photoUrls: string[],
): Promise<AIImageContent[]> {
  const blocks: AIImageContent[] = [];
  for (const url of photoUrls) {
    const block = await fetchVisionImageBlock(url);
    if (block) blocks.push(block);
  }
  return blocks;
}

async function fetchVisionImageBlock(url: string): Promise<AIImageContent | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "image/jpeg,image/png,image/webp,image/gif" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const mediaType = normalizeVisionImageMediaType(
      response.headers.get("content-type"),
    ) ?? inferVisionImageMediaTypeFromUrl(url);
    if (!mediaType) return null;
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > VISION_IMAGE_MAX_BYTES) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > VISION_IMAGE_MAX_BYTES) {
      return null;
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: arrayBufferToBase64(buffer),
      },
    };
  } catch (error) {
    console.warn("mobile-api vision image fetch failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function inferVisionImageMediaTypeFromUrl(url: string): VisionImageMediaType | null {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  return null;
}

function normalizeVisionImageMediaType(
  contentType: string | null,
): VisionImageMediaType | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/gif" ||
    type === "image/webp"
  ) {
    return type;
  }
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const bufferCtor = (globalThis as unknown as {
    Buffer?: { from(input: Uint8Array): { toString(encoding: "base64"): string } };
  }).Buffer;
  if (bufferCtor) return bufferCtor.from(bytes).toString("base64");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function buildFallbackVision(intentContext: string): VisionResult {
  return {
    problem_identified: intentContext || "Vấn đề cần kiểm tra trực tiếp",
    severity_indicators: [],
    complexity_hint: "medium",
  };
}

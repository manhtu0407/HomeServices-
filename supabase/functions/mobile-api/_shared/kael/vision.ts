import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { AIImageContent, EdgeAiSecrets, VisionResult } from "./types.ts";
import { visionResultSchema } from "./types.ts";
import { buildVisionMessages } from "./prompts.ts";
import {
  callStructuredAI,
  hasStructuredValidationIssue,
  type StructuredAIResponse,
} from "./structured-call.ts";
import type { KaelSpendGate } from "./guards/spend-gate.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { chooseCircuitAwareProviderOrNull } from "./routing.ts";
import { logKaelEscalation, selectKaelEscalation } from "./escalation.ts";
import { sanitizeVisionPhotoUrls } from "./_runtime/utils.ts";
import { readResponseBytesBounded } from "../../../_shared/network.ts";

const VISION_MAX_TOKENS = 320;
const VISION_IMAGE_FETCH_TIMEOUT_MS = 5_000;
const VISION_IMAGE_MAX_BYTES = 4_000_000;
const VIETNAMESE_DIACRITICS_REQUIRED = "VIETNAMESE_DIACRITICS_REQUIRED";
const ENGLISH_OUTPUT_REQUIRED = "ENGLISH_OUTPUT_REQUIRED";

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
  gate: KaelSpendGate,
  language: "vi" | "en" = "vi",
): Promise<VisionAnalysisResult> {
  const outputSchema = visionSchemaForLanguage(language);
  const safePhotoUrls = sanitizeVisionPhotoUrls(photoUrls);
  if (safePhotoUrls.length === 0) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language),
      failureReason: "NO_PHOTOS_FOR_VISION",
      skipped: true,
    };
  }
  const imageBlocks = await fetchVisionImageBlocks(safePhotoUrls);
  if (imageBlocks.length === 0) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language),
      failureReason: "NO_FETCHABLE_PHOTOS_FOR_VISION",
      skipped: true,
    };
  }

  const route = chooseCircuitAwareProviderOrNull("vision_analysis");
  if (!route) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language),
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
      language,
    ),
    maxTokens: maxTokensForPurpose("vision_analysis", VISION_MAX_TOKENS),
    temperature: 0.2,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
  }, outputSchema, secrets, gate);

  if (!primaryResult.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language),
      failureReason: primaryResult.code === "SCHEMA_INVALID"
        ? hasStructuredValidationIssue(primaryResult, VIETNAMESE_DIACRITICS_REQUIRED)
          ? "AI vision Vietnamese validation failed"
          : hasStructuredValidationIssue(primaryResult, ENGLISH_OUTPUT_REQUIRED)
          ? "AI vision English validation failed"
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
      language,
    ),
    maxTokens: maxTokensForPurpose("vision_analysis", VISION_MAX_TOKENS),
    temperature: 0.2,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
  }, outputSchema, secrets, gate);
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

function visionSchemaForLanguage(language: "vi" | "en") {
  return language === "en"
    ? visionResultSchema.refine(
      (value) => !hasVietnameseDiacritics([
        value.problem_identified,
        ...value.severity_indicators,
      ].join(" ")),
      { path: ["problem_identified"], message: ENGLISH_OUTPUT_REQUIRED },
    )
    : visionResultSchema.refine(
      (value) => hasVietnameseDiacritics(value.problem_identified),
      {
        path: ["problem_identified"],
        message: VIETNAMESE_DIACRITICS_REQUIRED,
      },
    );
}

async function fetchVisionImageBlocks(
  photoUrls: string[],
): Promise<AIImageContent[]> {
  const supabaseUrl = readSupabaseUrl();
  if (!supabaseUrl) return [];
  const blocks: AIImageContent[] = [];
  for (const url of photoUrls) {
    if (!isTrustedVisionImageUrl(url, supabaseUrl)) continue;
    const block = await fetchVisionImageBlock(url);
    if (block) blocks.push(block);
  }
  return blocks;
}

export function isTrustedVisionImageUrl(
  rawUrl: string,
  supabaseUrl: string,
): boolean {
  try {
    const candidate = new URL(rawUrl);
    const trusted = new URL(supabaseUrl);
    if (
      candidate.origin !== trusted.origin || candidate.username ||
      candidate.password || candidate.hash
    ) return false;
    return /^\/storage\/v1\/(?:object\/(?:authenticated|public|sign)|render\/image\/(?:authenticated|public))\//
      .test(candidate.pathname);
  } catch {
    return false;
  }
}

function readSupabaseUrl(): string | null {
  const deno = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno;
  const value = deno?.env?.get?.("SUPABASE_URL")?.trim();
  return value || null;
}

async function fetchVisionImageBlock(url: string): Promise<AIImageContent | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "image/jpeg,image/png,image/webp,image/gif" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = response.headers.get("content-type");
    const mediaType = normalizeVisionImageMediaType(contentType) ??
      (canInferVisionMediaType(contentType)
        ? inferVisionImageMediaTypeFromUrl(url)
        : null);
    if (!mediaType) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const bytes = await readResponseBytesBounded(response, VISION_IMAGE_MAX_BYTES);
    if (bytes.byteLength === 0) {
      return null;
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: arrayBufferToBase64(bytes.buffer),
      },
    };
  } catch {
    console.warn("mobile-api vision image fetch failed", {
      errorCode: controller.signal.aborted ? "IMAGE_FETCH_TIMEOUT" : "IMAGE_FETCH_FAILED",
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

function canInferVisionMediaType(contentType: string | null): boolean {
  if (!contentType?.trim()) return true;
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/octet-stream";
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

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
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

function buildFallbackVision(
  intentContext: string,
  language: "vi" | "en" = "vi",
): VisionResult {
  return {
    problem_identified: intentContext || (language === "en"
      ? "The issue requires an on-site inspection"
      : "Vấn đề cần kiểm tra trực tiếp"),
    severity_indicators: [],
    complexity_hint: "medium",
  };
}

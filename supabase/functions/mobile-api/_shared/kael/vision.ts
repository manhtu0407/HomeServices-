import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { AIImageContent, AIProvider, EdgeAiSecrets, VisionResult } from "./types.ts";
import { visionResultSchema } from "./types.ts";
import { buildVisionMessages } from "./prompts.ts";
import {
  callStructuredAI,
  hasStructuredValidationIssue,
  type StructuredAIError,
  type StructuredAIResponse,
} from "./structured-call.ts";
import type { KaelSpendGate } from "./kael-guardrails/spend-gate.ts";
import { maxTokensForPurpose } from "./kael-providers/routing.config.ts";
import {
  circuitAwareProviderCandidatesForPurpose,
  shouldSkipProviderSiblingModels,
} from "./kael-providers/routing.ts";
import { logKaelEscalation, selectKaelEscalation } from "./escalation.ts";
import { sanitizeVisionPhotoUrls, scrubSensitiveForLLM } from "./utils.ts";
import { readResponseBytesBounded } from "../../../_shared/network.ts";
import { customerVisibleKaelProblemSummary } from "./user-facing-copy.ts";

const VISION_BASE_MAX_TOKENS = 900;
const VISION_EXTRA_IMAGE_MAX_TOKENS = 200;
const VISION_MAX_TOKENS_CAP = 1_300;
const VISION_BASE_TIMEOUT_MS = 10_000;
const VISION_EXTRA_IMAGE_TIMEOUT_MS = 5_000;
const VISION_TIMEOUT_CAP_MS = 20_000;
const VISION_IMAGE_FETCH_TIMEOUT_MS = 5_000;
const VISION_IMAGE_MAX_BYTES = 4_000_000;
const VIETNAMESE_DIACRITICS_REQUIRED = "VIETNAMESE_DIACRITICS_REQUIRED";
const ENGLISH_OUTPUT_REQUIRED = "ENGLISH_OUTPUT_REQUIRED";
const CUSTOMER_EVIDENCE_MARKER = "UNTRUSTED_CUSTOMER_EVIDENCE_JSON";

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
    provider?: "anthropic" | "perplexity" | "deepseek";
    model?: string;
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
      fallback: buildFallbackVision(intentContext, language, false, description),
      failureReason: "NO_PHOTOS_FOR_VISION",
      skipped: true,
    };
  }
  const imageBlocks = await fetchVisionImageBlocks(safePhotoUrls);
  if (imageBlocks.length === 0) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language, true, description),
      failureReason: "NO_FETCHABLE_PHOTOS_FOR_VISION",
    };
  }
  if (imageBlocks.length !== safePhotoUrls.length) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language, true, description),
      failureReason: "INCOMPLETE_FETCHABLE_PHOTOS_FOR_VISION",
    };
  }

  const routes = circuitAwareProviderCandidatesForPurpose("vision_analysis");
  if (routes.length === 0) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language, true, description),
      failureReason: "NO_PROVIDER_AVAILABLE",
    };
  }
  const messages = buildVisionMessages(
    description,
    sanitizeForLLM(intentContext),
    imageBlocks,
    language,
  );
  const runtimeBudget = visionRuntimeBudget(imageBlocks.length);
  const blockedProviders = new Set<AIProvider>();
  let successfulAttempt: {
    result: StructuredAIResponse<VisionResult>;
    route: (typeof routes)[number];
  } | null = null;
  let lastAttemptedRoute: (typeof routes)[number] | null = null;
  let failureReason = "NO_PROVIDER_AVAILABLE";

  for (const route of routes) {
    if (blockedProviders.has(route.provider)) continue;
    lastAttemptedRoute = route;
    const result = await callStructuredAI({
      purpose: "vision_analysis",
      provider: route.provider,
      model: route.model,
      messages,
      effort: route.model === "claude-sonnet-5" ? "medium" : undefined,
      maxTokens: maxTokensForPurpose("vision_analysis", runtimeBudget.maxTokens),
      temperature: 0.2,
      timeoutMs: route.role === "primary"
        ? runtimeBudget.timeoutMs
        : route.latencyBudgetMs,
      maxRetries: 0,
    }, outputSchema, secrets, gate);
    if (result.success) {
      successfulAttempt = { result, route };
      break;
    }
    failureReason = visionFailureReason(result);
    if (shouldSkipProviderSiblingModels(result.code)) {
      blockedProviders.add(route.provider);
    }
  }

  if (!successfulAttempt) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext, language, true, description),
      failureReason,
      ...(lastAttemptedRoute
        ? {
          provider: lastAttemptedRoute.provider,
          model: lastAttemptedRoute.model,
        }
        : {}),
    };
  }

  const { result: primaryResult, route } = successfulAttempt;

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
    maxTokens: maxTokensForPurpose("vision_analysis", runtimeBudget.maxTokens),
    temperature: 0.2,
    timeoutMs: runtimeBudget.timeoutMs,
    maxRetries: 0,
  }, outputSchema, secrets, gate);
  if (!escalatedResult.success) return successfulVisionResult(primaryResult, route);
  return successfulVisionResult(escalatedResult, escalation.route);
}

export function visionRuntimeBudget(imageCount: number): {
  maxTokens: number;
  timeoutMs: number;
} {
  const normalizedCount = Math.max(1, Math.min(3, Math.floor(imageCount)));
  const additionalImages = normalizedCount - 1;
  return {
    maxTokens: Math.min(
      VISION_MAX_TOKENS_CAP,
      VISION_BASE_MAX_TOKENS +
        additionalImages * VISION_EXTRA_IMAGE_MAX_TOKENS,
    ),
    timeoutMs: Math.min(
      VISION_TIMEOUT_CAP_MS,
      VISION_BASE_TIMEOUT_MS +
        additionalImages * VISION_EXTRA_IMAGE_TIMEOUT_MS,
    ),
  };
}

function visionFailureReason(
  result: StructuredAIError,
) {
  if (result.code !== "SCHEMA_INVALID") return `AI call failed: ${result.code}`;
  if (hasStructuredValidationIssue(result, VIETNAMESE_DIACRITICS_REQUIRED)) {
    return "AI vision Vietnamese validation failed";
  }
  if (hasStructuredValidationIssue(result, ENGLISH_OUTPUT_REQUIRED)) {
    return "AI vision English validation failed";
  }
  return "AI vision JSON validation failed";
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
      (value) => !hasVietnameseDiacritics(visionCustomerText(value)),
      { path: ["problem_identified"], message: ENGLISH_OUTPUT_REQUIRED },
    )
    : visionResultSchema.refine(
      (value) => hasVietnameseDiacritics(visionCustomerText(value)),
      {
        path: ["problem_identified"],
        message: VIETNAMESE_DIACRITICS_REQUIRED,
      },
    );
}

function visionCustomerText(value: VisionResult) {
  return [
    value.problem_identified,
    ...value.severity_indicators,
    value.recommended_scope,
    value.remaining_uncertainty,
    ...(value.evidence_findings ?? []).flatMap((finding) => [
      finding.observation,
      finding.possible_meaning,
    ]),
  ].filter((item): item is string => typeof item === "string").join(" ");
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
    return /^\/storage\/v1\/(?:object\/(?:authenticated|public|sign)|render\/image\/(?:authenticated|public|sign))\//
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

export function buildFallbackVision(
  intentContext: string,
  language: "vi" | "en" = "vi",
  hasVisualEvidence = false,
  confirmedDescription = "",
): VisionResult {
  const problemLabel = customerVisibleKaelProblemSummary(intentContext, language) ||
    (language === "en"
      ? "The issue requires an on-site inspection"
      : "Vấn đề cần kiểm tra trực tiếp");
  const confirmedContext = extractConfirmedIssueDescription(
    confirmedDescription,
    language,
  ).slice(0, 320);
  const problem = confirmedContext
    ? (language === "en"
      ? `${problemLabel}. Confirmed description: ${confirmedContext}`
      : `${problemLabel}. Mô tả đã xác nhận: ${confirmedContext}`)
    : problemLabel;
  return {
    problem_identified: problem,
    severity_indicators: [],
    complexity_hint: "medium",
    recommended_scope: language === "en"
      ? "The worker should inspect the described area on site before the repair scope is finalized."
      : "Thợ cần kiểm tra trực tiếp vị trí được mô tả trước khi chốt hạng mục sửa chữa.",
    remaining_uncertainty: hasVisualEvidence
      ? (language === "en"
        ? "Kael received the image but could not verify its details; the cause and any hidden damage still require an on-site inspection."
        : "Kael đã nhận ảnh nhưng chưa thể xác nhận chi tiết trong ảnh; nguyên nhân và phần hư hỏng bị che khuất vẫn cần kiểm tra trực tiếp.")
      : (language === "en"
        ? "No image was provided to verify the cause or any hidden damage."
        : "Chưa có hình ảnh để xác nhận nguyên nhân và phần hư hỏng bị che khuất."),
  };
}

function extractConfirmedIssueDescription(
  input: string,
  language: "vi" | "en",
): string {
  const unwrapped = unwrapCustomerEvidenceEnvelope(input);
  const safe = scrubSensitiveForLLM(unwrapped).trim();
  if (!safe) return "";

  const descriptionMatch = safe.match(
    /(?:Mô tả|Description)\s*:\s*([\s\S]*?)(?=\s+(?:Dịch vụ|Service|Vấn đề|Problem|Khu vực|Area|Thời gian|Time)\s*:|$)/iu,
  );
  const detail = (descriptionMatch?.[1] ?? safe).trim();
  const genericEvidenceStatus = language === "en"
    ? /^(?:evidence (?:submitted|skipped))\.?$/iu
    : /^(?:đã gửi bằng chứng|bỏ qua bằng chứng)\.?$/iu;
  return genericEvidenceStatus.test(detail) ? "" : detail;
}

function unwrapCustomerEvidenceEnvelope(input: string): string {
  const markerIndex = input.indexOf(CUSTOMER_EVIDENCE_MARKER);
  if (markerIndex < 0) return input;
  const jsonStart = input.indexOf("{", markerIndex);
  if (jsonStart >= 0) {
    try {
      const payload = JSON.parse(input.slice(jsonStart)) as { text?: unknown };
      if (typeof payload.text === "string") return payload.text;
    } catch {
      // A malformed model envelope is never suitable for customer-visible copy.
    }
  }
  return input.slice(0, markerIndex);
}

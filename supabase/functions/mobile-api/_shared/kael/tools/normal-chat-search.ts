import { z } from "zod";
import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import type { AIRequest, EdgeAiSecrets } from "../contracts/types.ts";
import { createRuntimeKaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import { evaluateKaelPermissionGate } from "../kael-guardrails/permission-gate.ts";
import { circuitAwareProviderCandidatesForPurpose } from "../kael-providers/routing.ts";
import { maxTokensForPurpose } from "../kael-providers/routing.config.ts";
import { callStructuredAI, type StructuredAIInvoker } from "../kael-providers/structured-call.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";
import type { DbClient } from "../../platform/db.ts";

const normalChatSearchSchema = z.object({
  results: z.array(z.object({
    title: z.string().trim().min(1).max(180),
    url: z.string().url().max(2_000),
    snippet: z.string().trim().min(1).max(1_000),
    date: z.string().max(40).optional(),
    last_updated: z.string().max(40).optional(),
  }).strict()).max(5),
}).strict();

export type NormalChatSearchResult = z.infer<typeof normalChatSearchSchema>["results"][number];

export function shouldSearchNormalChatQuestion(question: string): boolean {
  const normalized = normalizeForSearchRouting(question);
  if (!normalized) return false;
  const currentInformation = /\b(?:latest|current|currently|today|tonight|this week|recent|newest|updated|update|news|release|version|regulation|standard|recall|source|sources|search online|look up|right now)\b|(?:hiện nay|hiện tại|hôm nay|tuần này|gần đây|mới nhất|mới cập nhật|tin tức|phiên bản|quy định|tiêu chuẩn|hướng dẫn mới|tìm trên mạng|tra cứu|nguồn mới)/u.test(normalized);
  if (currentInformation) return true;
  const serviceQuestion = /\b(?:electrical|plumbing|cleaning|housekeeping|air conditioner|hvac|sofa|mattress|curtain|carpet|handyman|repair|installation|warranty|manual|manufacturer|product model)\b|(?:điện|nước|vệ sinh|dọn dẹp|máy lạnh|điều hòa|ghế sofa|nệm|rèm|thảm|sửa chữa|lắp đặt|bảo hành|hướng dẫn hãng|mã máy)/u.test(normalized);
  const explicitResearch = /\b(?:research|look up|search|find sources|official guidance|manufacturer guidance)\b|(?:tìm hiểu|tra cứu|tìm nguồn|tìm thông tin|theo hướng dẫn hãng|nguồn chính thức)/u.test(normalized);
  return serviceQuestion && explicitResearch;
}

export async function searchNormalChatQuestion(input: {
  question: string;
  language: "vi" | "en";
  actorRole: "customer" | "worker";
  actorId: string;
  client: DbClient;
  secrets: EdgeAiSecrets;
  callAI?: StructuredAIInvoker;
}): Promise<readonly NormalChatSearchResult[] | null> {
  const query = scrubSensitiveForLLM(sanitizeForLLM(input.question))
    .replace(/\[(?:phone|email|id-number|bank-account|building|floor|unit|house-no)\]/giu, " ")
    .replace(/\b(?:my name is|i am|i'm)\b[^,.?!]*/giu, " ")
    .replace(/(?:tên tôi là|tôi tên là|mình tên là)[^,.?!]*/giu, " ")
    .replace(/(?:địa chỉ(?: nhà)?(?: của tôi)?|số điện thoại(?: của tôi)?|căn hộ(?: của tôi)?|số căn(?: hộ)?)[^,.;?!]*/giu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
  if (!query) return null;
  const permission = evaluateKaelPermissionGate({
    purpose: "normal_chat_search",
    actor: input.actorRole,
    jobRelation: "none",
    action: "lookup_market",
    topic: "app_usage_help",
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: false,
  });
  if (!permission.allowed) return null;
  const route = circuitAwareProviderCandidatesForPurpose("normal_chat_search")[0];
  if (!route) return null;
  const request: AIRequest = {
    purpose: "normal_chat_search",
    provider: route.provider,
    model: route.model,
    maxTokens: maxTokensForPurpose("normal_chat_search", 5),
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
    searchContextSize: "low",
    searchLanguageFilter: [input.language],
    messages: [{ role: "user", content: query }],
  };
  const result = await callStructuredAI(
      request,
      normalChatSearchSchema,
      input.secrets,
      {
        ...createRuntimeKaelSpendGate(input.client, input.actorId, input.secrets.harnessTrace),
        estimatedCostUsd: route.costCeilingUsd,
      },
      input.callAI,
    ).catch((error) => {
    console.warn("normal-chat Perplexity search threw", {
      actorRole: input.actorRole,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  });
  if (!result) return null;
  if (!result.success) {
    console.warn("normal-chat Perplexity search unavailable", {
      actorRole: input.actorRole,
      purpose: request.purpose,
      code: result.code,
    });
    return null;
  }
  return result.data.results.map((row) => ({
    ...row,
    title: scrubSensitiveForLLM(row.title).slice(0, 180),
    snippet: scrubSensitiveForLLM(row.snippet).slice(0, 1_000),
  }));
}

export function appendNormalChatSources(
  text: string,
  sources: readonly NormalChatSearchResult[],
  language: "vi" | "en",
): string {
  const usable = sources.slice(0, 3);
  if (usable.length === 0) return text.slice(0, 4_000);
  const label = language === "en" ? "Sources" : "Nguồn tham khảo";
  const sourceLines = usable.map((source, index) =>
    `[${index + 1}] ${source.title.slice(0, 120)} — ${source.url.slice(0, 300)}`
  );
  const suffix = `\n\n${label}:\n${sourceLines.join("\n")}`;
  const bodyLimit = Math.max(0, 4_000 - suffix.length);
  return `${text.slice(0, bodyLimit).trimEnd()}${suffix}`;
}

export function normalChatSearchEvidence(
  sources: readonly NormalChatSearchResult[],
): readonly { readonly index: number; readonly title: string; readonly url: string; readonly snippet: string }[] {
  return sources.slice(0, 5).map((source, index) => ({
    index: index + 1,
    title: source.title,
    url: source.url,
    snippet: source.snippet,
  }));
}

function normalizeForSearchRouting(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

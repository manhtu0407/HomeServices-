import { z } from "zod";
import type { CustomerAssistantInput } from "./customer-assistant.ts";
import {
  classifyAssistantTopic,
  inferAssistantServiceType,
  normalizeText,
} from "./customer-assistant-policy.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";
import { sanitizeCustomerCaseEvidenceText } from "../evidence/untrusted-evidence.ts";

export function assistantQuestion(input: CustomerAssistantInput) {
  const language = input.language ?? "vi";
  const surface = input.surface ?? "customer_normal";
  const sourceMessage = input.message.trim() || (input.imageUrls?.length
    ? language === "en" ? "Please analyze the attached image(s)." : "Hãy phân tích ảnh đính kèm."
    : input.message);
  const cleanQuestion = (
    surface === "customer_case"
      ? sanitizeCustomerCaseEvidenceText(sourceMessage)
      : scrubSensitiveForLLM(sourceMessage)
  ).slice(0, 2000);
  return { language, surface, sourceMessage, cleanQuestion };
}

const recentImageMemorySchema = z.object({
  recent_image_analysis: z.array(z.object({
    turn_index: z.number().int().positive(),
    analysis: z.object({
      summary: z.string().trim().min(1).max(900),
      observations: z.array(z.string().trim().min(1).max(240)).max(8),
      uncertainties: z.array(z.string().trim().min(1).max(240)).max(6),
    }),
  })).min(1).max(5),
});

function hasScopedImageEvidence(summary: string | null | undefined) {
  if (!summary || summary.length > 8_000) return false;
  try {
    return recentImageMemorySchema.safeParse(JSON.parse(summary)).success;
  } catch {
    return false;
  }
}

function isFollowUp(text: string) {
  return /\b(cai (do|nay)|dieu (do|nay)|diem (do|nay)|no thi|vay thi|the thi|con (no|cai)|noi (ro|them)|cu the hon|tiep theo|that|this|it|what next|tell me more|more detail)\b/.test(text);
}

function isGreeting(text: string) {
  return /^(xin chao|chao|hello|hi|hey|kael)[.!? ]*$/.test(text);
}

function isCorrection(text: string) {
  return /\b(khong phai|khong noi ve|bo qua|not the|not an?|instead of)\b/.test(text);
}

function affirmedStatement(text: string) {
  return text.replace(/(?:không phải|khong phai|không nói về|khong noi ve|bỏ qua|bo qua|\bnot (?:the|an?)\b|\binstead of\b)[^,.;!?]*?(?=[,.;!?]|\s+(?:mà|ma|but)\s+|$)/giu, " ");
}

export function resolveCustomerAssistantTurnContext(input: CustomerAssistantInput, question: string) {
  const surface = input.surface ?? "customer_normal";
  const normalized = normalizeText(question);
  const unsafeRequest = surface === "customer_normal" &&
    /\b(dau tat|vo hieu hoa)\b.{0,30}\b(aptomat|cau dao|thiet bi bao ve)\b|\b(che tao|che|lam) (bom|vu khi)\b|\b(bypass|disable) (the )?(circuit breaker|safety interlock)\b|\b(build|make) (a )?(bomb|weapon)\b/.test(normalized);
  const correction = isCorrection(normalized);
  const affirmedQuestion = surface === "customer_normal"
    ? affirmedStatement(question)
    : question;
  // An open Case outranks the recent turns: a short reply carries no service word of its own.
  let serviceType = surface === "customer_normal"
    ? inferAssistantServiceType(affirmedQuestion) ??
      input.caseContext?.serviceType ?? (correction ? null : input.serviceType ?? null)
    : input.serviceType ?? inferAssistantServiceType(question, input.job);
  let topic = classifyAssistantTopic(question, serviceType, surface, Boolean(input.imageUrls?.length));
  if (surface !== "customer_normal") return { serviceType, topic, clarificationRequired: false, unsafeRequest };

  // Only customer statements establish the subject; Kael's greeting often lists every service.
  if (!serviceType && !correction && topic === "support_redirect" && isFollowUp(normalized)) {
    for (const turn of (input.previousTurns ?? []).slice(-20).reverse()) {
      if (turn.role !== "customer" || !turn.text?.trim()) continue;
      const previous = scrubSensitiveForLLM(turn.text).slice(0, 2_000);
      const candidate = inferAssistantServiceType(affirmedStatement(previous));
      const previousTopic = classifyAssistantTopic(previous, candidate, "customer_normal");
      const previousText = normalizeText(previous);
      if (!candidate && isCorrection(previousText)) return { serviceType, topic, clarificationRequired: true, unsafeRequest };
      if (previousTopic === "support_redirect") {
        if (hasScopedImageEvidence(input.memorySummary) &&
          /\b(trong (anh|hinh)|anh nay|hinh nay|in (this|the) (photo|image|picture))\b/.test(previousText)) {
          return { serviceType, topic: "normal_chat_general" as const, clarificationRequired: false, unsafeRequest };
        }
        if (isFollowUp(previousText) || isGreeting(previousText)) continue;
        return { serviceType, topic, clarificationRequired: true, unsafeRequest };
      }
      if (candidate && previousTopic !== "out_of_scope_services_anything" &&
        ["electrical_repair", "plumbing_repair", "home_cleaning", "hvac_service", "upholstery_care", "handyman_service"].includes(previousTopic)) {
        serviceType = candidate;
        topic = classifyAssistantTopic(question, serviceType, "customer_normal");
      } else if (previousTopic === "normal_chat_general") {
        topic = "normal_chat_general";
      }
      return { serviceType, topic, clarificationRequired: topic === "support_redirect", unsafeRequest };
    }
    if (hasScopedImageEvidence(input.memorySummary)) topic = "normal_chat_general";
  }
  return {
    serviceType,
    topic,
    unsafeRequest,
    clarificationRequired: !isGreeting(normalized) &&
      (topic === "support_redirect" || (correction && !serviceType && topic === "normal_chat_general")),
  };
}

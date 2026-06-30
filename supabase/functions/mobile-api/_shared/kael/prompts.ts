import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { ComplexityLevel, ServiceType } from "./types.ts";
import type { AIImageContent, AIMessage, ScopeChangeComputeInput, ScopeChangeReviewInput } from "./types.ts";
import { KAEL_BUSINESS_GUARDRAILS, KAEL_RESPONSE_STYLE, PROBLEM_SLUGS_BY_SERVICE } from "./types.ts";
import { scrubSensitiveForLLM, sanitizeVisionPhotoUrls } from "./utils.ts";

export function buildScopeChangeEstimateMessages(
  input: ScopeChangeComputeInput,
): AIMessage[] {
  const originalRange = formatReviewPriceRange(
    input.originalPriceMin,
    input.originalPriceMax,
  );
  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You compute an updated price estimate for a Vietnamese HCMC NestScout job
after the worker reports a different on-site scope.
The worker does NOT propose a price; you compute it independently using the
original Kael analysis and the worker's reported scope description + reason.
Do not include PII, full addresses, phone numbers, or raw worker/customer text.
Prices must be VND integers reasonable for HCMC apartment electrical / plumbing
/ cleaning work. Confidence below 0.4 if evidence is weak.

Respond ONLY with valid JSON matching this schema:
{
  "complexity_assessment": "small" | "medium" | "large",
  "price_min": number (VND integer),
  "price_max": number (VND integer, >= price_min),
  "confidence": number (0-1),
  "problem_summary": "short Vietnamese summary of updated problem",
  "advisory": "optional short Vietnamese practical note or null"
}`,
    },
    {
      role: "user",
      content: `Service: ${sanitizeForLLM(input.serviceType)}
District: ${sanitizeForLLM(input.district ?? "unknown")}
Original description: ${scrubSensitiveForLLM(input.originalDescription)}
Original Kael summary: ${scrubSensitiveForLLM(input.originalProblemSummary ?? "")}
Original complexity: ${sanitizeForLLM(input.originalComplexity ?? "unknown")}
Original price range: ${originalRange}
Worker reported scope: ${scrubSensitiveForLLM(input.workerReportedDescription)}
Worker reason: ${scrubSensitiveForLLM(input.workerReason)}`,
    },
  ];
}

export function buildIntentMessages(
  serviceType: string,
  problemChips: string[],
  description: string,
): AIMessage[] {
  return [
    {
      role: "system",
      content:
        `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are an intent classifier for NestScout in Ho Chi Minh City.
Supported services: electrical, plumbing, cleaning. Nothing else.
If the request is not about electrical repair, plumbing repair, or home cleaning, classify as "unsupported".
Allowed electrical problem_slug values: ${
          PROBLEM_SLUGS_BY_SERVICE.electrical.join(", ")
        }.
Allowed plumbing problem_slug values: ${
          PROBLEM_SLUGS_BY_SERVICE.plumbing.join(", ")
        }.
Allowed cleaning problem_slug values: ${
          PROBLEM_SLUGS_BY_SERVICE.cleaning.join(", ")
        }.
If the exact problem is unclear, use other_electrical, other_plumbing, or other_cleaning for the chosen service.
Respond only with valid JSON for: service_type, problem_slug, confidence, needs_clarification.`,
    },
    {
      role: "user",
      content: `Service: ${serviceType}
Problem chips: ${problemChips.join(", ")}
Description: ${description}`,
    },
  ];
}

export const KAEL_INTAKE_DIAGNOSIS_PROMPT_VERSION = "2026-06-04.v1";

// Intake-diagnosis (2026-06-04): upgraded intent classifier that also decides
// whether Kael should ask ONE specific clarification question before estimating,
// using recent conversation context. Drives smart clarification (STRUCTURES.md A4)
// + LLM-assisted scope/sentiment signals. Returns intentResultSchema shape.
export function buildIntakeDiagnosisMessages(
  serviceType: string,
  problemChips: string[],
  description: string,
  conversationContext?: string,
): AIMessage[] {
  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are Kael's intake-diagnosis step for NestScout in Ho Chi Minh City.
Supported services: electrical repair, plumbing repair, home cleaning. Nothing else.
Understand the customer's problem from the selected service, problem chips, their
description, and the recent conversation, then decide if you can estimate reliably
or must ask ONE focused clarification question first.

Respond ONLY with valid JSON matching this schema:
{
  "service_type": "electrical" | "plumbing" | "cleaning" | "unsupported",
  "problem_slug": "string (snake_case problem category)",
  "confidence": number (0-1),
  "needs_clarification": boolean,
  "missing_slots": string[] (subset of: location, symptom, severity, duration, photo, district),
  "clarification_question_vi": string | null,
  "scope_signal": "in_scope" | "out_of_scope" | "service_mismatch",
  "suggested_service": "electrical" | "plumbing" | "cleaning" | null,
  "customer_sentiment": "neutral" | "detail_oriented" | "pressure"
}

Rules:
- needs_clarification = true ONLY when the description is too vague/empty to estimate
  reliably AND a single question would meaningfully improve it.
- clarification_question_vi: when needs_clarification, ONE short, SPECIFIC Vietnamese
  question about the single most important missing slot. Max ~140 chars. Reference the
  customer's actual problem. NEVER a generic "vui lòng cung cấp thêm thông tin".
  Good: "Cầu dao có tự nhảy lại sau khi bạn bật lên không?" / "Rò rỉ ở một vòi hay nhiều vị trí?"
  When needs_clarification is false, set clarification_question_vi to null.
- missing_slots: list only genuinely missing context; empty array when enough is known.
- scope_signal: "out_of_scope" if not electrical/plumbing/cleaning at all;
  "service_mismatch" if it clearly belongs to a different one of the three than selected
  (set suggested_service); otherwise "in_scope".
- customer_sentiment: "pressure" if pushy/aggressive/discount-threat, "detail_oriented" if
  asking for breakdowns/credentials/specifics, else "neutral".
- Do not re-ask anything already answered earlier in the conversation.

Allowed electrical problem_slug values: ${PROBLEM_SLUGS_BY_SERVICE.electrical.join(", ")}.
Allowed plumbing problem_slug values: ${PROBLEM_SLUGS_BY_SERVICE.plumbing.join(", ")}.
Allowed cleaning problem_slug values: ${PROBLEM_SLUGS_BY_SERVICE.cleaning.join(", ")}.`,
    },
    {
      role: "user",
      content: `Service: ${serviceType}
Problem chips: ${problemChips.join(", ")}
${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ""}Latest customer message: ${description}`,
    },
  ];
}

export function buildVisionMessages(
  description: string,
  intentContext: string,
  photoInputs: string[] | AIImageContent[] = [],
): AIMessage[] {
  const textContent =
    `Intent context: ${intentContext}\nCustomer description: ${description}`;
  const imageBlocks: AIImageContent[] = photoInputs.every((item) =>
      typeof item !== "string"
    )
    ? photoInputs
    : sanitizeVisionPhotoUrls(photoInputs as string[]).map((
      url,
    ): AIImageContent => ({
      type: "image",
      source: { type: "url", url },
    }));

  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

Analyze a Ho Chi Minh City apartment electrical, plumbing, or cleaning issue.
Respond only with valid JSON: problem_identified, severity_indicators, complexity_hint.
problem_identified must be Vietnamese. complexity_hint is small, medium, or large.`,
    },
    {
      role: "user",
      content: imageBlocks.length > 0
        ? [{ type: "text", text: textContent }, ...imageBlocks]
        : textContent,
    },
  ];
}

export function buildPricingMessages(
  serviceType: ServiceType,
  problem: string,
  complexity: ComplexityLevel,
  district: string,
  knowledgeContext?: string | null,
): AIMessage[] {
  return appendKnowledgeContextToMessages([
    {
      role: "system",
      content:
        `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

Research current market prices for HCMC apartment electrical repair, plumbing repair, or home cleaning.
Respond only with valid JSON: market_range_min, market_range_max, confidence, sources_summary.
Prices must be VND integers. If weak evidence, use conservative estimates with confidence below 0.5.`,
    },
    {
      role: "user",
      content: `Service: ${serviceType}
Problem: ${problem}
Complexity: ${complexity}
District: ${district}
Location: Ho Chi Minh City, Vietnam`,
    },
  ], knowledgeContext);
}

export function appendKnowledgeContextToMessages(
  messages: AIMessage[],
  knowledgeContext?: string | null,
): AIMessage[] {
  const context = knowledgeContext?.trim();
  if (!context) return messages;
  if (messages.length === 0) {
    return [{ role: "system", content: context }];
  }
  const [first, ...rest] = messages;
  if (first.role === "system" && typeof first.content === "string") {
    return [
      {
        ...first,
        content: `${first.content}\n\n${context}`,
      },
      ...rest,
    ];
  }
  return [
    { role: "system", content: context },
    ...messages,
  ];
}

export function buildScopeChangeReviewMessages(
  input: ScopeChangeReviewInput,
): AIMessage[] {
  const originalPrice = formatReviewPriceRange(
    input.originalPriceMin,
    input.originalPriceMax,
  );
  const requestedPrice = formatReviewPriceRange(
    input.requestedPriceMin,
    input.requestedPriceMax,
  );
  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You review worker scope-change requests for a Vietnamese NestScout workflow.
Compare the original Kael estimate with the worker's new on-site scope and explain the decision support for the customer.
Do not approve work yourself; the customer must decide.
Do not include PII, full addresses, phone numbers, or raw worker/customer text.

Respond ONLY with valid JSON matching this schema:
{
  "recommendation": "approve" | "ask_worker" | "reject",
  "price_assessment": "reasonable" | "needs_review" | "high_risk",
  "problem_summary": "short Vietnamese summary of updated problem",
  "advisory": "optional short Vietnamese practical note or null",
  "complexity_assessment": "small" | "medium" | "large",
  "confidence": number (0-1)
}`,
    },
    {
      role: "user",
      content: `Service: ${sanitizeForLLM(input.serviceType)}
Original description: ${scrubSensitiveForLLM(input.originalDescription)}
Original Kael summary: ${scrubSensitiveForLLM(input.originalProblemSummary ?? "")}
Original complexity: ${sanitizeForLLM(input.originalComplexity ?? "unknown")}
Original price range: ${originalPrice}
Worker requested scope: ${scrubSensitiveForLLM(input.requestedDescription)}
Worker reason: ${scrubSensitiveForLLM(input.reason)}
Worker requested price range: ${requestedPrice}`,
    },
  ];
}

export function formatReviewPriceRange(
  priceMin: number | null | undefined,
  priceMax: number | null | undefined,
): string {
  if (!priceMin || !priceMax) return "unknown";
  return `${Math.round(priceMin)}-${Math.round(priceMax)} VND`;
}

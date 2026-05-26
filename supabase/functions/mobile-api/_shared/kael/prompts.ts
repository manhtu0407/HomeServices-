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

You compute an updated price estimate for a Vietnamese HCMC home-services job
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

You are an intent classifier for a home service platform in Ho Chi Minh City.
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

export function buildVisionMessages(
  description: string,
  intentContext: string,
  photoUrls: string[] = [],
): AIMessage[] {
  const textContent =
    `Intent context: ${intentContext}\nCustomer description: ${description}`;
  const imageBlocks = sanitizeVisionPhotoUrls(photoUrls).map((
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
): AIMessage[] {
  return [
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

You review worker scope-change requests for a Vietnamese home-services workflow.
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

import type { AIImageContent, AIMessage } from '@home-services/shared'

export const PROMPT_VERSIONS = {
  intent: '2026-05-19.v2',
  vision: '2026-05-19.v2',
  pricing: '2026-05-19.v2',
  prebrief: '2026-05-14.v1',
} as const

export const KAEL_BUSINESS_GUARDRAILS = `Kael is the main AI assistant for this home-services product.
Scope is strictly HCMC home services for exactly three service boxes: electrical repair, plumbing repair, and home cleaning.
Reject unrelated topics, adult or explicit sexual content, random image requests, or any request that is not useful for those three service boxes by classifying it as unsupported.
Home-service safety and legality questions are allowed only when they directly affect electrical, plumbing, or cleaning work.
Do not collect or repeat PII; use only sanitized job context.`

export const KAEL_RESPONSE_STYLE = `Keep reasoning concise, friendly, and on-point.
Return the required JSON only. Any free-text field should be short Vietnamese, directly answer the job context, and include a practical safety note only when relevant.`

export function buildIntentMessages(
  serviceType: string,
  problemChips: string[],
  description: string,
): AIMessage[] {
  return [
    {
      role: 'system',
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are an intent classifier for a home service platform in Ho Chi Minh City.
Supported services: electrical, plumbing, cleaning. Nothing else.
If the request is not about electrical repair, plumbing repair, or home cleaning, classify as "unsupported".

Respond ONLY with valid JSON matching this schema:
{
  "service_type": "electrical" | "plumbing" | "cleaning" | "unsupported",
  "problem_slug": "string (snake_case problem category)",
  "confidence": number (0-1),
  "needs_clarification": boolean
}

Problem slugs for electrical: power_outage_one_room, power_outage_whole_unit, outlet_or_switch_broken, breaker_trip, flickering_light, install_device, other_electrical
Problem slugs for plumbing: pipe_leak, clogged_drain_or_sink, toilet_flush_issue, faucet_broken, weak_water_pressure, install_or_replace_fixture, other_plumbing
Problem slugs for cleaning: standard_home_cleaning, kitchen_deep_clean, bathroom_deep_clean, deep_cleaning, post_repair_cleaning, window_cleaning, other_cleaning`,
    },
    {
      role: 'user',
      content: `Service: ${serviceType}
Problem chips: ${problemChips.join(', ')}
Description: ${description}`,
    },
  ]
}

export function buildVisionMessages(
  description: string,
  intentContext: string,
  photoUrls: string[] = [],
): AIMessage[] {
  const textContent = `Intent context: ${intentContext}
Customer description: ${description}`
  const imageBlocks = sanitizeVisionPhotoUrls(photoUrls).map((url): AIImageContent => ({
    type: 'image',
    source: { type: 'url', url },
  }))

  return [
    {
      role: 'system',
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are a home service problem analyst for Ho Chi Minh City apartments.
Analyze the customer's problem description and provide a structured assessment.
Focus on: what the problem likely is, severity indicators, and complexity level.

Respond ONLY with valid JSON matching this schema:
{
  "problem_identified": "string (clear Vietnamese description of the identified problem)",
  "severity_indicators": ["string (list of severity indicators found)"],
  "complexity_hint": "small" | "medium" | "large"
}

Complexity guide:
- small: simple fix, standard parts, <1 hour (e.g., replace outlet, fix faucet)
- medium: moderate work, may need diagnosis, 1-3 hours (e.g., breaker issues, pipe leak)
- large: complex diagnosis, multiple components, >3 hours (e.g., full rewiring, main pipe)`,
    },
    {
      role: 'user',
      content: imageBlocks.length > 0
        ? [{ type: 'text', text: textContent }, ...imageBlocks]
        : textContent,
    },
  ]
}

function sanitizeVisionPhotoUrls(photoUrls: string[]): string[] {
  const seen = new Set<string>()
  const sanitized: string[] = []
  for (const rawUrl of photoUrls) {
    const url = rawUrl.trim()
    if (seen.has(url) || !isHttpUrl(url)) continue
    seen.add(url)
    sanitized.push(url)
    if (sanitized.length >= 5) break
  }
  return sanitized
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function buildPricingMessages(
  serviceType: string,
  problem: string,
  complexity: string,
  district: string,
): AIMessage[] {
  return [
    {
      role: 'system',
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are a market price researcher for home services in Ho Chi Minh City.
Search for current market prices for the specified electrical repair, plumbing repair, or home cleaning service.
Focus on HCMC apartment service pricing in Vietnamese Dong (VND).

Respond ONLY with valid JSON matching this schema:
{
  "market_range_min": number (VND, integer),
  "market_range_max": number (VND, integer),
  "confidence": number (0-1, how confident you are in this price range),
  "sources_summary": "string (brief summary of price sources found)"
}

If you cannot find reliable pricing data, use conservative estimates and set confidence below 0.5.`,
    },
    {
      role: 'user',
      content: `Service: ${serviceType}
Problem: ${problem}
Complexity: ${complexity}
District: ${district}
Location: Ho Chi Minh City, Vietnam`,
    },
  ]
}

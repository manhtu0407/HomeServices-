import type { AIMessage } from '@home-services/shared'

export const PROMPT_VERSIONS = {
  intent: '2026-05-14.v1',
  vision: '2026-05-14.v1',
  pricing: '2026-05-14.v1',
  prebrief: '2026-05-14.v1',
} as const

export function buildIntentMessages(
  serviceType: string,
  problemChips: string[],
  description: string,
): AIMessage[] {
  return [
    {
      role: 'system',
      content: `You are an intent classifier for a home repair service in Ho Chi Minh City.
Supported services: electrical, plumbing. Nothing else.
If the request is not about electrical or plumbing repair, classify as "unsupported".

Respond ONLY with valid JSON matching this schema:
{
  "service_type": "electrical" | "plumbing" | "unsupported",
  "problem_slug": "string (snake_case problem category)",
  "confidence": number (0-1),
  "needs_clarification": boolean
}

Problem slugs for electrical: power_outage_one_room, power_outage_whole_unit, outlet_or_switch_broken, breaker_trip, flickering_light, install_device, other_electrical
Problem slugs for plumbing: pipe_leak, clogged_drain_or_sink, toilet_flush_issue, faucet_broken, weak_water_pressure, install_or_replace_fixture, other_plumbing`,
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
): AIMessage[] {
  return [
    {
      role: 'system',
      content: `You are a home repair problem analyst for Ho Chi Minh City apartments.
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
      content: `Intent context: ${intentContext}
Customer description: ${description}`,
    },
  ]
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
      content: `You are a market price researcher for home repair services in Ho Chi Minh City.
Search for current market prices for the specified repair service.
Focus on HCMC apartment repair pricing in Vietnamese Dong (VND).

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

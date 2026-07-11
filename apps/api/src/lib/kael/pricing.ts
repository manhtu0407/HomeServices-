import { callAI } from '@/lib/ai/client'
import { buildPricingMessages } from './prompts'
import { marketPriceResultSchema, type MarketPriceResult } from './schemas'
import { safeParseJSON } from './parsing'
import { sanitizeForLLM } from '@nestscout/shared'

const MARKET_BLEND_WEIGHT = 0.5

export type PriceSearchResult =
  | { success: true; market: MarketPriceResult; failureReason?: undefined }
  | { success: false; failureReason: string }

export async function searchMarketPrice(
  serviceType: string,
  problem: string,
  complexity: string,
  district: string,
): Promise<PriceSearchResult> {
  const messages = buildPricingMessages(
    sanitizeForLLM(serviceType),
    sanitizeForLLM(problem),
    sanitizeForLLM(complexity),
    sanitizeForLLM(district),
  )

  const result = await callAI({
    provider: 'perplexity',
    model: 'sonar',
    messages,
    maxTokens: 300,
    temperature: 0.1,
  })

  if (!result.success) {
    return { success: false, failureReason: `AI call failed: ${result.code} — ${result.error}` }
  }

  const parsed = safeParseJSON(result.content)
  if (!parsed) {
    return { success: false, failureReason: 'JSON parse failed on AI response' }
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'error' in parsed &&
    parsed.error === 'insufficient_trusted_data'
  ) {
    return { success: false, failureReason: 'insufficient_trusted_data' }
  }

  const validated = marketPriceResultSchema.safeParse(parsed)
  if (!validated.success) {
    return {
      success: false,
      failureReason: `Schema validation failed: ${validated.error.issues[0]?.message ?? 'unknown'}`,
    }
  }

  if (validated.data.market_range_max < validated.data.market_range_min) {
    return { success: false, failureReason: 'market_range_max < market_range_min' }
  }

  return { success: true, market: validated.data }
}

export type PriceSynthesisInput = {
  baselineMin: number
  baselineMax: number
  market: MarketPriceResult | null
  complexityHint: 'small' | 'medium' | 'large'
}

export type SynthesizedPrice = {
  price_min: number
  price_max: number
  confidence: number
  source: 'market_weighted' | 'baseline_only'
}

export function synthesizePrice(input: PriceSynthesisInput): SynthesizedPrice {
  const { baselineMin, baselineMax, market, complexityHint } = input

  if (!market) {
    return {
      price_min: baselineMin,
      price_max: baselineMax,
      confidence: 0.4,
      source: 'baseline_only',
    }
  }

  let priceMin = Math.round(
    market.market_range_min * MARKET_BLEND_WEIGHT + baselineMin * (1 - MARKET_BLEND_WEIGHT),
  )
  let priceMax = Math.round(
    market.market_range_max * MARKET_BLEND_WEIGHT + baselineMax * (1 - MARKET_BLEND_WEIGHT),
  )

  const complexityMultiplier =
    complexityHint === 'large' ? 1.2 : complexityHint === 'small' ? 0.85 : 1.0

  priceMin = Math.round(priceMin * complexityMultiplier)
  priceMax = Math.round(priceMax * complexityMultiplier)

  if (priceMax < priceMin) {
    priceMax = priceMin
  }

  priceMin = roundToThousand(priceMin)
  priceMax = roundToThousand(priceMax)

  if (priceMax <= priceMin) {
    priceMax = priceMin + 50_000
  }

  const confidence = Math.min(
    0.85,
    (market.confidence + 0.5) / 2,
  )

  return {
    price_min: priceMin,
    price_max: priceMax,
    confidence: Math.round(confidence * 100) / 100,
    source: 'market_weighted',
  }
}

function roundToThousand(n: number): number {
  return Math.round(n / 1000) * 1000
}

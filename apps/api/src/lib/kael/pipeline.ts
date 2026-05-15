import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@home-services/shared'
import type { ComplexityLevel, ServiceType } from '@home-services/shared'
import { classifyIntent } from './intent'
import { analyzeDescription } from './vision'
import { searchMarketPrice, synthesizePrice } from './pricing'
import { PRICE_DISCLAIMER, UNSUPPORTED_SERVICE_MESSAGE } from './schemas'
import { getFallbackBaseline, hasHighSeverity, SEVERITY_ADVISORY } from './defaults'
import type { KaelEstimate } from './schemas'

export type PipelineInput = {
  serviceType: string
  problemChips: string[]
  description: string
  district: string
}

export type PipelineResult =
  | { success: true; estimate: KaelEstimate; fallbackUsed: boolean }
  | { success: false; error: string; code: string }

export async function runKaelPipeline(
  input: PipelineInput,
  supabase: SupabaseClient<Database>,
): Promise<PipelineResult> {
  const { serviceType, problemChips, description, district } = input

  // Step 1: Intent classification
  const intentResult = await classifyIntent(serviceType, problemChips, description)
  const intent = intentResult.success ? intentResult.intent : intentResult.fallback
  let fallbackUsed = !intentResult.success

  if (intent.service_type === 'unsupported') {
    return {
      success: false,
      error: UNSUPPORTED_SERVICE_MESSAGE,
      code: 'UNSUPPORTED',
    }
  }

  // Step 2: Problem analysis (text-only for prototype)
  const visionResult = await analyzeDescription(
    description,
    `${intent.service_type}: ${intent.problem_slug}`,
  )
  const analysis = visionResult.success
    ? visionResult.analysis
    : visionResult.fallback
  if (!visionResult.success) fallbackUsed = true

  // Step 3: Fetch baseline from DB
  const baseline = await fetchBaseline(
    supabase,
    intent.service_type,
    intent.problem_slug,
    analysis.complexity_hint,
    district,
  )

  // Step 4: Market price search
  const marketResult = await searchMarketPrice(
    intent.service_type,
    intent.problem_slug,
    analysis.complexity_hint,
    district,
  )
  if (!marketResult.success) fallbackUsed = true

  // Step 5: Price synthesis (pure logic, no AI call)
  const synthesized = synthesizePrice({
    baselineMin: baseline.priceMin,
    baselineMax: baseline.priceMax,
    market: marketResult.success ? marketResult.market : null,
    complexityHint: analysis.complexity_hint,
  })

  const estimate: KaelEstimate = {
    service_type: intent.service_type,
    problem_category: intent.problem_slug,
    problem_summary: analysis.problem_identified,
    complexity: analysis.complexity_hint,
    price_min: synthesized.price_min,
    price_max: synthesized.price_max,
    confidence: synthesized.confidence,
    advisory: buildAdvisory(analysis.severity_indicators),
    disclaimer: PRICE_DISCLAIMER,
  }

  return { success: true, estimate, fallbackUsed }
}

type BaselineResult = { priceMin: number; priceMax: number }

async function fetchBaseline(
  supabase: SupabaseClient<Database>,
  serviceType: ServiceType,
  problemSlug: string,
  complexity: ComplexityLevel,
  district: string,
): Promise<BaselineResult> {
  const { data, error } = await supabase
    .from('price_baselines')
    .select('price_min, price_max')
    .eq('service_type', serviceType)
    .eq('complexity', complexity)
    .eq('district_code', district)
    .limit(1)
    .single()

  if (error) {
    console.warn('Baseline district query failed', { serviceType, complexity, district, errorCode: error.code })
  }

  if (data) {
    return { priceMin: data.price_min, priceMax: data.price_max }
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from('price_baselines')
    .select('price_min, price_max')
    .eq('service_type', serviceType)
    .eq('complexity', complexity)
    .limit(1)
    .single()

  if (fallbackError) {
    console.warn('Baseline fallback query failed', { serviceType, complexity, errorCode: fallbackError.code })
  }

  if (fallback) {
    return { priceMin: fallback.price_min, priceMax: fallback.price_max }
  }

  return getFallbackBaseline(complexity)
}

function buildAdvisory(severityIndicators: string[]): string | null {
  if (severityIndicators.length === 0) return null
  return hasHighSeverity(severityIndicators) ? SEVERITY_ADVISORY : null
}

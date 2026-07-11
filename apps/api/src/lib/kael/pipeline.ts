import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ServiceType } from '@nestscout/shared'
import { classifyIntent as defaultClassifyIntent, diagnoseIntake as defaultDiagnoseIntake } from './intent'
import { analyzeDescription as defaultAnalyzeDescription } from './vision'
import { searchMarketPrice as defaultSearchMarketPrice, synthesizePrice } from './pricing'
import { fetchBaseline } from './baseline'
import { priceDisclaimer, unsupportedServiceMessage } from './schemas'
import { hasHighSeverity, severityAdvisory } from './defaults'
import { applyLearnedComplexityRule } from '@/lib/learning/apply-complexity-rule'
import type { KaelEstimate } from './schemas'

export type PipelineInput = {
  serviceType: string
  problemChips: string[]
  description: string
  district: string
  photoUrls?: string[]
  language?: 'vi' | 'en'
  // Smart-clarification intake-diagnosis (2026-06-04). When enabled, the intent
  // stage uses diagnoseIntake (conversation-aware) and the pipeline may short-circuit
  // to ask ONE clarification question or flag a scope mismatch before vision/market.
  intakeDiagnosisEnabled?: boolean
  conversationContext?: string
  clarificationCount?: number
}

export type PipelineProviders = {
  classifyIntent?: typeof defaultClassifyIntent
  diagnoseIntake?: typeof defaultDiagnoseIntake
  analyzeDescription?: typeof defaultAnalyzeDescription
  searchMarketPrice?: typeof defaultSearchMarketPrice
}

export type PipelineStageLog = {
  stage: 'intent' | 'vision' | 'baseline' | 'market' | 'synthesis'
  latencyMs: number
  success: boolean
  failureReason?: string
  fallbackUsed: boolean
}

export type PipelineClarification = {
  question: string | null
  missingSlots: string[]
  customerSentiment?: 'neutral' | 'detail_oriented' | 'pressure'
}

export type PipelineResult =
  | {
      success: true
      estimate: KaelEstimate
      serviceProblemId: string
      fallbackUsed: boolean
      stageLogs: PipelineStageLog[]
      customerSentiment?: 'neutral' | 'detail_oriented' | 'pressure'
    }
  | {
      success: false
      error: string
      code: string
      stageLogs: PipelineStageLog[]
      clarification?: PipelineClarification
      suggestedService?: ServiceType
    }

function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now()
  return fn().then((result) => ({ result, ms: Date.now() - start }))
}

export async function runKaelPipeline(
  input: PipelineInput,
  supabase: SupabaseClient<Database>,
  providers?: PipelineProviders,
): Promise<PipelineResult> {
  const { serviceType, problemChips, description, district } = input
  const language = input.language ?? 'vi'
  const photoUrls = input.photoUrls ?? []
  const classifyIntent = providers?.classifyIntent ?? defaultClassifyIntent
  const diagnoseIntake = providers?.diagnoseIntake ?? defaultDiagnoseIntake
  const analyzeDescription = providers?.analyzeDescription ?? defaultAnalyzeDescription
  const searchMarketPrice = providers?.searchMarketPrice ?? defaultSearchMarketPrice

  const stageLogs: PipelineStageLog[] = []
  let fallbackUsed = false

  // Stage 1: Intent classification (or conversation-aware intake-diagnosis).
  const { result: intentResult, ms: intentMs } = await timed(() =>
    input.intakeDiagnosisEnabled
      ? diagnoseIntake(serviceType, problemChips, description, input.conversationContext, language)
      : classifyIntent(serviceType, problemChips, description),
  )
  const intent = intentResult.success ? intentResult.intent : intentResult.fallback
  if (!intentResult.success) fallbackUsed = true

  stageLogs.push({
    stage: 'intent',
    latencyMs: intentMs,
    success: intentResult.success,
    failureReason: intentResult.success ? undefined : intentResult.failureReason,
    fallbackUsed: !intentResult.success,
  })

  if (intent.service_type === 'unsupported' || intent.scope_signal === 'out_of_scope') {
    return {
      success: false,
      error: unsupportedServiceMessage(language),
      code: 'UNSUPPORTED',
      stageLogs,
    }
  }

  // Intake-diagnosis short-circuits — only when diagnosis mode produced the signals.
  // Stop BEFORE vision/market so a clarification/mismatch turn costs no downstream AI.
  if (input.intakeDiagnosisEnabled) {
    if (intent.scope_signal === 'service_mismatch') {
      return {
        success: false,
        error: language === 'en'
          ? 'Your description does not match the selected service.'
          : 'Mô tả của bạn không khớp với dịch vụ đang chọn.',
        code: 'SERVICE_MISMATCH',
        stageLogs,
        suggestedService: intent.suggested_service ?? undefined,
      }
    }
    if (intent.needs_clarification) {
      const clarificationQuestion = intent.clarification_question ??
        (language === 'vi' ? intent.clarification_question_vi : null) ??
        (language === 'en'
          ? 'Please describe the issue in a little more detail for Kael.'
          : 'Bạn mô tả rõ hơn vấn đề đang gặp giúp Kael nhé.')
      return {
        success: false,
        error: clarificationQuestion,
        code: 'NEEDS_CLARIFICATION',
        stageLogs,
        clarification: {
          question: clarificationQuestion,
          missingSlots: intent.missing_slots ?? [],
          customerSentiment: intent.customer_sentiment,
        },
      }
    }
  }

  const validServiceType = intent.service_type as ServiceType

  // Stage 2: Problem analysis
  const { result: visionResult, ms: visionMs } = await timed(() =>
    analyzeDescription(description, `${validServiceType}: ${intent.problem_slug}`, photoUrls, language),
  )
  const analysis = visionResult.success ? visionResult.analysis : visionResult.fallback
  if (!visionResult.success) fallbackUsed = true

  stageLogs.push({
    stage: 'vision',
    latencyMs: visionMs,
    success: visionResult.success,
    failureReason: visionResult.success ? undefined : visionResult.failureReason,
    fallbackUsed: !visionResult.success,
  })

  // Stage 2.5 (optional): apply learned complexity rule if one exists.
  // No-op when LEARNING_ENABLED=false. Cannot lower complexity, only raise.
  const learnedComplexity = await applyLearnedComplexityRule(
    supabase,
    validServiceType,
    intent.problem_slug,
    district,
    analysis.complexity_hint,
  )
  const effectiveComplexity = learnedComplexity?.newComplexity ?? analysis.complexity_hint

  // Stage 3: Fetch baseline from DB (uses effective complexity).
  const { result: baselineResult, ms: baselineMs } = await timed(() =>
    fetchBaseline(supabase, validServiceType, intent.problem_slug, effectiveComplexity, district),
  )

  stageLogs.push({
    stage: 'baseline',
    latencyMs: baselineMs,
    success: baselineResult.success,
    failureReason: baselineResult.success ? undefined : baselineResult.error,
    fallbackUsed: false,
  })

  if (!baselineResult.success) {
    return {
      success: false,
      error: language === 'en'
        ? 'No governed price evidence is available for this service. Please try again later.'
        : 'Không có dữ liệu giá tham khảo cho dịch vụ này. Vui lòng thử lại sau.',
      code: 'NO_BASELINE',
      stageLogs,
    }
  }

  // Stage 4: Market price search (use effective complexity so search reflects
  // any learned complexity raise).
  const { result: marketResult, ms: marketMs } = await timed(() =>
    searchMarketPrice(validServiceType, intent.problem_slug, effectiveComplexity, district),
  )
  if (!marketResult.success) fallbackUsed = true

  stageLogs.push({
    stage: 'market',
    latencyMs: marketMs,
    success: marketResult.success,
    failureReason: marketResult.success ? undefined : marketResult.failureReason,
    fallbackUsed: !marketResult.success,
  })

  // Stage 5: Price synthesis (pure logic). Uses effectiveComplexity so
  // complexity multipliers reflect the learned raise.
  const synthStart = Date.now()
  const synthesized = synthesizePrice({
    baselineMin: baselineResult.priceMin,
    baselineMax: baselineResult.priceMax,
    market: marketResult.success ? marketResult.market : null,
    complexityHint: effectiveComplexity,
  })
  const synthMs = Date.now() - synthStart

  stageLogs.push({
    stage: 'synthesis',
    latencyMs: synthMs,
    success: true,
    fallbackUsed: false,
  })

  const estimate: KaelEstimate = {
    service_type: validServiceType,
    problem_category: intent.problem_slug,
    problem_summary: analysis.problem_identified,
    complexity: effectiveComplexity,
    price_min: synthesized.price_min,
    price_max: synthesized.price_max,
    confidence: synthesized.confidence,
    advisory: buildAdvisory(analysis.severity_indicators, language),
    disclaimer: priceDisclaimer(language),
  }

  return {
    success: true,
    estimate,
    serviceProblemId: baselineResult.serviceProblemId,
    fallbackUsed,
    stageLogs,
    customerSentiment: input.intakeDiagnosisEnabled ? intent.customer_sentiment : undefined,
  }
}

function buildAdvisory(
  severityIndicators: string[],
  language: 'vi' | 'en' = 'vi',
): string | null {
  if (severityIndicators.length === 0) return null
  return hasHighSeverity(severityIndicators) ? severityAdvisory(language) : null
}

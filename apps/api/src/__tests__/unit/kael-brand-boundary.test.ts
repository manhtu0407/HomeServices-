import { describe, expect, it } from 'vitest'
import {
  KAEL_BUSINESS_GUARDRAILS as API_KAEL_BUSINESS_GUARDRAILS,
  buildIntentMessages as buildApiIntentMessages,
  buildIntakeDiagnosisMessages as buildApiIntakeDiagnosisMessages,
  buildPricingMessages as buildApiPricingMessages,
  buildVisionMessages as buildApiVisionMessages,
} from '@/lib/kael/prompts'
import {
  buildIntentMessages as buildEdgeIntentMessages,
  buildIntakeDiagnosisMessages as buildEdgeIntakeDiagnosisMessages,
  buildPricingMessages as buildEdgePricingMessages,
  buildVisionMessages as buildEdgeVisionMessages,
  buildScopeChangeEstimateMessages,
  buildScopeChangeReviewMessages,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts'
import { trustedPerplexityMarketConfig } from '../../../../../supabase/functions/mobile-api/_shared/kael/source-trust/source-trust'
import {
  KAEL_BUSINESS_GUARDRAILS as EDGE_KAEL_BUSINESS_GUARDRAILS,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/types'

describe('Kael brand boundary', () => {
  it('uses NestScout instead of legacy Home Services naming in AI guardrails', () => {
    const guardrails = [
      API_KAEL_BUSINESS_GUARDRAILS,
      EDGE_KAEL_BUSINESS_GUARDRAILS,
    ]

    for (const guardrail of guardrails) {
      expect(guardrail).toContain('NestScout')
      expect(guardrail).not.toMatch(/Home Services/i)
      expect(guardrail).not.toMatch(/home-services product/i)
    }
  })

  it('uses the selected language in intake and vision prompts without contradictory Vietnamese instructions', () => {
    const prompts = [
      buildApiIntakeDiagnosisMessages('electrical', [], 'breaker trips', undefined, 'en'),
      buildApiVisionMessages('breaker trips', 'electrical: breaker_trip', [], 'en'),
      buildEdgeIntakeDiagnosisMessages('electrical', [], 'breaker trips', undefined, 'en'),
      buildEdgeVisionMessages('breaker trips', 'electrical: breaker_trip', [], 'en'),
    ].map((messages) => String(messages[0]?.content ?? ''))

    for (const prompt of prompts) {
      expect(prompt).toContain('short English')
      expect(prompt).toContain('Do not mix languages')
      expect(prompt).not.toContain('Any free-text field should be short Vietnamese')
      expect(prompt).not.toContain('problem_identified must be natural Vietnamese')
    }
  })

  it('uses NestScout in runtime prompt surfaces and avoids legacy product phrases', () => {
    const prompts = [
      buildApiIntentMessages('electrical', ['breaker_trip'], 'breaker keeps tripping'),
      buildApiIntakeDiagnosisMessages('electrical', ['breaker_trip'], 'breaker keeps tripping'),
      buildApiVisionMessages('breaker keeps tripping', 'electrical: breaker_trip'),
      buildApiPricingMessages('electrical', 'breaker_trip', 'medium', 'District 1'),
      buildEdgeIntentMessages('electrical', ['breaker_trip'], 'breaker keeps tripping'),
      buildEdgeIntakeDiagnosisMessages('electrical', ['breaker_trip'], 'breaker keeps tripping'),
      buildEdgePricingMessages('electrical', 'breaker_trip', 'medium', 'District 1'),
      buildScopeChangeEstimateMessages({
        serviceType: 'electrical',
        district: 'District 1',
        originalDescription: 'breaker trips',
        originalProblemSummary: 'cau dao bi trip',
        originalComplexity: 'medium',
        originalPriceMin: 200_000,
        originalPriceMax: 500_000,
        workerReportedDescription: 'needs a replacement breaker',
        workerReason: 'burn mark found',
      }),
      buildScopeChangeReviewMessages({
        serviceType: 'electrical',
        originalDescription: 'breaker trips',
        originalProblemSummary: 'cau dao bi trip',
        originalComplexity: 'medium',
        originalPriceMin: 200_000,
        originalPriceMax: 500_000,
        requestedDescription: 'needs a replacement breaker',
        requestedPriceMin: 300_000,
        requestedPriceMax: 600_000,
        reason: 'burn mark found',
      }),
      trustedPerplexityMarketConfig({
        serviceType: 'electrical',
        problem: 'breaker_trip',
        complexity: 'medium',
        district: 'District 1',
      }).messages,
    ].map((messages) => messages[0]?.content ?? '')

    for (const prompt of prompts) {
      expect(prompt).toContain('NestScout')
      expect(prompt).not.toMatch(/Home Services/i)
      expect(prompt).not.toMatch(/home-services product/i)
      expect(prompt).not.toMatch(/home-services job/i)
      expect(prompt).not.toMatch(/home-services workflow/i)
      expect(prompt).not.toMatch(/home service platform/i)
      expect(prompt).not.toMatch(/home-service app/i)
      expect(prompt).not.toMatch(/home service problem analyst/i)
      expect(prompt).not.toMatch(/market price researcher for home services/i)
      expect(prompt).not.toMatch(/apartment home services/i)
    }
  })
})

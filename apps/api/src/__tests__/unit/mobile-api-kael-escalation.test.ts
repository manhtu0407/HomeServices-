import { afterEach, describe, expect, it, vi } from 'vitest'
import { selectKaelEscalation } from '../../../../../supabase/functions/mobile-api/_shared/kael/escalation'
import { KAEL_ROUTING_CONFIG } from '../../../../../supabase/functions/mobile-api/_shared/kael/routing.config'
import { reviewScopeChange } from '../../../../../supabase/functions/mobile-api/_shared/kael/scope-change'
import { allowKaelSpendForTest } from './kael-spend-test-helper'

describe('Kael model escalation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('selects the Model Board escalation only after a qualifying primary result', () => {
    expect(selectKaelEscalation('vision_analysis', {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      hardVision: true,
    })).toMatchObject({
      reason: 'hard_vision',
      route: { provider: 'anthropic', model: 'claude-opus-4-8' },
    })

    expect(selectKaelEscalation('market_lookup', {
      provider: 'perplexity',
      model: 'sonar',
      confidence: 0.81,
    })).toMatchObject({
      reason: 'low_confidence',
      route: { provider: 'perplexity', model: 'sonar-pro' },
    })

    expect(selectKaelEscalation('scope_change', {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      highStakes: true,
    })).toMatchObject({
      reason: 'high_stakes',
      route: { provider: 'anthropic', model: 'claude-opus-4-8' },
    })
  })

  it('maps every Model Board job to the approved shared path and role tier', () => {
    expect(KAEL_ROUTING_CONFIG).toMatchObject({
      intent_classification: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5'),
      vision_analysis: escalationRoute('anthropic', 'claude-sonnet-5', 'anthropic', 'claude-opus-4-8'),
      clarification: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001'),
      problem_synthesis: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5'),
      market_lookup: {
        primary: { provider: 'perplexity', model: 'sonar' },
        fallback: undefined,
        escalation: { provider: 'perplexity', model: 'sonar-pro' },
      },
      price_synthesis: { primary: { provider: 'anthropic', model: 'claude-sonnet-5' } },
      advisory_generation: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001'),
      worker_brief: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5'),
      scope_change: escalationRoute('anthropic', 'claude-sonnet-5', 'anthropic', 'claude-opus-4-8'),
      job_incident: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5'),
      post_job_learning: routes('deepseek', 'deepseek-v4-pro', 'anthropic', 'claude-sonnet-5'),
      educational_response: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001'),
      worker_assist: routes('deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5'),
    })
    expect(JSON.stringify(KAEL_ROUTING_CONFIG)).not.toContain('claude-sonnet-4-6')
  })

  it('does not escalate confident or non-primary results', () => {
    expect(selectKaelEscalation('market_lookup', {
      provider: 'perplexity',
      model: 'sonar',
      confidence: 0.82,
    })).toBeNull()

    expect(selectKaelEscalation('market_lookup', {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      confidence: 0.2,
    })).toBeNull()
  })

  it('runs the configured Opus path for a configured high-stakes scope change', async () => {
    const models: string[] = []
    vi.stubGlobal('Deno', {
      env: { get: (name: string) => name === 'KAEL_SCOPE_CHANGE_ESCALATION_VND' ? '1000000' : undefined },
    })
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { model: string }
      models.push(body.model)
      return new Response(JSON.stringify({
        content: [{
          type: 'text',
          text: JSON.stringify({
          recommendation: 'ask_worker',
          price_assessment: 'high_risk',
          problem_summary: 'Cần kiểm tra kỹ phạm vi phát sinh.',
          advisory: null,
          complexity_assessment: 'large',
          confidence: 0.92,
          }),
        }],
        usage: { input_tokens: 80, output_tokens: 20 },
      }))
    })

    const result = await reviewScopeChange({
      serviceType: 'plumbing',
      originalDescription: 'Rò rỉ lavabo',
      originalPriceMin: 300_000,
      originalPriceMax: 800_000,
      requestedDescription: 'Cần thay đường ống âm tường',
      requestedPriceMin: 1_000_000,
      requestedPriceMax: 1_200_000,
      reason: 'Phát hiện hư hỏng phía trong tường',
    }, { anthropicApiKey: 'anthropic-test' }, allowKaelSpendForTest('worker-1'))

    expect(models).toEqual(['claude-sonnet-5', 'claude-opus-4-8'])
    expect(result).toMatchObject({ model: 'claude-opus-4-8', fallback_used: false })
    expect(result.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({
        model: 'claude-opus-4-8',
        safe_metadata: { escalation_reason: 'high_stakes' },
      }),
    ]))
  })
})

function routes(
  primaryProvider: 'anthropic' | 'deepseek' | 'perplexity',
  primaryModel: string,
  fallbackProvider: 'anthropic' | 'deepseek' | 'perplexity',
  fallbackModel: string,
) {
  return {
    primary: { provider: primaryProvider, model: primaryModel },
    fallback: { provider: fallbackProvider, model: fallbackModel },
  }
}

function escalationRoute(
  primaryProvider: 'anthropic' | 'deepseek' | 'perplexity',
  primaryModel: string,
  escalationProvider: 'anthropic' | 'deepseek' | 'perplexity',
  escalationModel: string,
) {
  return {
    primary: { provider: primaryProvider, model: primaryModel },
    escalation: { provider: escalationProvider, model: escalationModel },
  }
}

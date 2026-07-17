import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  evaluatePriceSynthesisAbCase,
  priceSynthesisAbCaseSchema,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/market/price-synthesis-ab'
import { allowKaelSpendForTest } from './kael-spend-test-helper'

describe('Kael F26 price_synthesis A/B evaluator', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('validates the A/B case contract', () => {
    expect(priceSynthesisAbCaseSchema.safeParse(caseInput()).success).toBe(true)
    expect(priceSynthesisAbCaseSchema.safeParse({
      ...caseInput(),
      baseline_max: 100000,
      baseline_min: 200000,
    }).success).toBe(false)
  })

  it('runs Perplexity and Anthropic shadow evaluations with schema results', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const isAnthropic = String(url).includes('anthropic')
      if (isAnthropic) {
        return jsonResponse({
          content: [{ type: 'text', text: '{"price_min":190000,"price_max":360000,"confidence":0.8}' }],
          usage: { input_tokens: 90, output_tokens: 22 },
        })
      }
      return jsonResponse({
        choices: [{
          message: {
            content: '{"price_min":200000,"price_max":380000,"confidence":0.76}',
          },
        }],
        usage: { prompt_tokens: 80, completion_tokens: 20 },
      })
    }))

    const result = await evaluatePriceSynthesisAbCase(caseInput(), {
      perplexityApiKey: 'pplx-test',
      anthropicApiKey: 'anthropic-test',
    }, allowKaelSpendForTest('admin-1'))

    expect(result).toMatchObject({
      case_key: 'case-1',
      purpose: 'price_synthesis',
      fallback_used: false,
      perplexity: {
        provider: 'perplexity',
        schema_valid: true,
        price_min: 200000,
        price_max: 380000,
      },
      anthropic: {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        schema_valid: true,
        price_min: 190000,
        price_max: 360000,
      },
    })
  })

  it('marks fallback when Perplexity is not schema-valid', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const isAnthropic = String(url).includes('anthropic')
      if (isAnthropic) {
        return jsonResponse({
          content: [{ type: 'text', text: '{"price_min":190000,"price_max":360000,"confidence":0.8}' }],
          usage: { input_tokens: 90, output_tokens: 22 },
        })
      }
      return jsonResponse({
        choices: [{ message: { content: '{"oops":true}' } }],
        usage: { prompt_tokens: 80, completion_tokens: 20 },
      })
    }))

    const result = await evaluatePriceSynthesisAbCase(caseInput(), {
      perplexityApiKey: 'pplx-test',
      anthropicApiKey: 'anthropic-test',
    }, allowKaelSpendForTest('admin-1'))

    expect(result.fallback_used).toBe(true)
    expect(result.perplexity.schema_valid).toBe(false)
    expect(result.anthropic.schema_valid).toBe(true)
  })
})

function caseInput() {
  return {
    case_key: 'case-1',
    service_type: 'cleaning' as const,
    problem_slug: 'standard_home_cleaning',
    district_code: 'q7',
    complexity: 'medium' as const,
    baseline_min: 160000,
    baseline_max: 320000,
    market_range_min: 180000,
    market_range_max: 380000,
    market_confidence: 0.78,
    actual_final_price: 280000,
  }
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

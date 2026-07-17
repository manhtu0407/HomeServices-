import { describe, expect, it } from 'vitest'

import { buildAdvisory } from '../../../../../supabase/functions/mobile-api/_shared/kael/advisory'
import {
  evaluateMarketVerdict,
  marketVerdictReason,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/market-verdict'
import {
  priceDisclaimer,
  unsupportedServiceMessage,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import { buildEstimateCardOutput } from '../../../../../supabase/functions/mobile-api/_shared/kael/output-pipeline'
import { formatKaelEstimateText } from '../../../../../supabase/functions/mobile-api/_shared/services/_runtime/shared'

describe('mobile-api Kael customer-visible language contract', () => {
  it('localizes deterministic unsupported, advisory, and disclaimer copy', () => {
    expect(unsupportedServiceMessage('en')).toContain('currently supports')
    expect(unsupportedServiceMessage('en')).not.toMatch(/[ăâđêôơưàáạảã]/iu)
    expect(priceDisclaimer('en')).toContain("Kael's estimate")
    expect(buildAdvisory(['burning smell'], ['Hãy ngắt nguồn.'], 'en'))
      .toContain('switch off the relevant supply')
  })

  it('localizes market inspection reasons and the stored estimate turn', () => {
    const verdict = evaluateMarketVerdict({
      baselineMin: 300_000,
      baselineMax: 500_000,
      market: {
        market_range_min: 300_000,
        market_range_max: 500_000,
        confidence: 0.8,
        sources: [],
      },
    })
    expect(marketVerdictReason(verdict, 'en')).toContain('verify the pricing evidence')

    const text = formatKaelEstimateText({
      problem_summary: 'The breaker trips after an outlet sparks',
      complexity: 'medium',
      price_min: 300_000,
      price_max: 500_000,
      advisory: 'Switch off the affected circuit.',
      disclaimer: priceDisclaimer('en'),
    }, 'en')
    expect(text).toContain('Kael has prepared an estimate')
    expect(text).toContain('300,000-500,000 VND')
    expect(text).not.toMatch(/[ăâđêôơưàáạảã]/iu)

    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'electrical',
        problem_category: 'breaker_trip',
        problem_summary: 'The breaker trips after an outlet sparks',
        complexity: 'medium',
        price_min: 300_000,
        price_max: 500_000,
        confidence: 0.4,
        advisory: null,
        disclaimer: priceDisclaimer('en'),
      },
      language: 'en',
      priceSource: 'inspection_required',
      baselineUsed: 'electrical:breaker_trip:medium',
    })
    expect(output.card.disclaimer).toContain("Kael's estimate")
    expect(output.card.kael_reasoning.complexity_reasoning).toContain('on site')
    expect(JSON.stringify(output.card)).not.toMatch(/[ăâđêôơưàáạảã]/iu)
  })
})

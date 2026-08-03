import { describe, expect, it } from 'vitest'
import { detectDemandingCustomerPatterns } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/agentic/demanding-customer-detect'

// Intake-diagnosis sentiment
// sentiment fills a keyword gap, but only softly and only in an established
// conversation. Keyword detection stays the primary, deterministic path.
describe('demanding-customer detection — LLM sentiment assist', () => {
  it('fills a keyword gap with prior-turn pressure sentiment (qaCount >= 2)', () => {
    const d = detectDemandingCustomerPatterns({
      message: 'thấy kiểu này hơi kỳ á',
      qaCount: 2,
      llmSentiment: 'pressure',
    })
    expect(d.pressureSignals).toHaveLength(0) // no keyword signal
    expect(d.expectedNuance).toBe('pressure')
    expect(d.llmAssisted).toBe(true)
    // Soft only — the LLM must never trigger a hard escalation by itself.
    expect(d.escalationLevel).not.toBe('hard')
  })

  it('does not assist on a fresh turn (qaCount < 2)', () => {
    const d = detectDemandingCustomerPatterns({
      message: 'thấy kiểu này hơi kỳ á',
      qaCount: 1,
      llmSentiment: 'pressure',
    })
    expect(d.expectedNuance).toBe('none')
    expect(d.llmAssisted).toBe(false)
  })

  it('ignores neutral sentiment', () => {
    const d = detectDemandingCustomerPatterns({
      message: 'ok bạn',
      qaCount: 3,
      llmSentiment: 'neutral',
    })
    expect(d.expectedNuance).toBe('none')
    expect(d.llmAssisted).toBe(false)
  })

  it('keyword pressure dominates over neutral LLM sentiment', () => {
    const d = detectDemandingCustomerPatterns({
      message: 'giảm giá cho tôi đi',
      qaCount: 2,
      llmSentiment: 'neutral',
    })
    expect(d.pressureSignals).toContain('demand_discount')
    expect(d.expectedNuance).toBe('pressure')
    expect(d.llmAssisted).toBe(false) // keyword found it, not the LLM
  })

  it('assists with detail_oriented sentiment', () => {
    const d = detectDemandingCustomerPatterns({
      message: 'ừm rồi sao nữa',
      qaCount: 2,
      llmSentiment: 'detail_oriented',
    })
    expect(d.legitimateConcernSignals).toHaveLength(0) // no keyword signal
    expect(d.expectedNuance).toBe('detail_oriented')
    expect(d.llmAssisted).toBe(true)
  })

  it('is unchanged when no llmSentiment is provided (backward compatible)', () => {
    const without = detectDemandingCustomerPatterns({ message: 'ok bạn', qaCount: 3 })
    expect(without.expectedNuance).toBe('none')
    expect(without.llmAssisted).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  KAEL_OPTIMIZATION_FLAG_NAMES,
  readKaelOptimizationFlags,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/cost-tracking'

// Verifies the smart-clarification feature flag is wired into the edge
// optimization-flag system (off by default; opt-in via env). Imports the edge
// module directly, mirroring mobile-api-kael-x5.test.ts.
describe('KAEL_OPT_LLM_CLARIFICATION_ENABLED (edge optimization flag)', () => {
  it('is registered in KAEL_OPTIMIZATION_FLAG_NAMES', () => {
    expect(KAEL_OPTIMIZATION_FLAG_NAMES).toContain('KAEL_OPT_LLM_CLARIFICATION_ENABLED')
  })

  it('defaults off and turns on for truthy env values', () => {
    const off = readKaelOptimizationFlags(() => undefined)
    expect(off.KAEL_OPT_LLM_CLARIFICATION_ENABLED).toBe(false)

    for (const truthy of ['1', 'true', 'yes', 'on']) {
      const on = readKaelOptimizationFlags((n) =>
        n === 'KAEL_OPT_LLM_CLARIFICATION_ENABLED' ? truthy : undefined,
      )
      expect(on.KAEL_OPT_LLM_CLARIFICATION_ENABLED).toBe(true)
    }
  })
})

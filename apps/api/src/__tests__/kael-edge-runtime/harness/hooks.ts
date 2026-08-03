import { afterEach, beforeEach, vi } from 'vitest'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import { __resetRateLimitStoreForTests } from '../../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'

export function installEdgeRuntimeTestHooks() {
  beforeEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
    __resetRateLimitStoreForTests()
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn((name: string) => name === 'KAEL_AUTONOMY_FULL_ENABLED' ? 'true' : undefined),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
}

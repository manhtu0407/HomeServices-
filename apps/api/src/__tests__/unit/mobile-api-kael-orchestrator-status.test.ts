import { describe, expect, it } from 'vitest'

import {
  runKaelPurposeStage,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/orchestrator'

describe('mobile-api Kael orchestrator stage status', () => {
  it('distinguishes an allowed result, policy decline, degraded fallback, and hard failure', async () => {
    const [ok, declined, degraded, failed] = await Promise.all([
      runKaelPurposeStage({
        label: 'ok',
        purpose: 'educational_response',
        timeoutMs: 100,
        run: async () => 'answer',
      }),
      runKaelPurposeStage({
        label: 'declined',
        purpose: 'educational_response',
        timeoutMs: 100,
        permission: { check: () => ({ allowed: false, reasonCode: 'DENY_TEST' }) },
        run: async () => 'must not run',
      }),
      runKaelPurposeStage({
        label: 'degraded',
        purpose: 'educational_response',
        timeoutMs: 100,
        run: async () => {
          throw new Error('provider unavailable')
        },
        fallback: () => 'safe fallback',
      }),
      runKaelPurposeStage({
        label: 'failed',
        purpose: 'educational_response',
        timeoutMs: 100,
        run: async () => {
          throw new Error('provider unavailable')
        },
      }),
    ])

    expect(ok).toMatchObject({ status: 'ok', value: 'answer', fallbackUsed: false })
    expect(declined).toMatchObject({ status: 'declined', fallbackUsed: true, failureReason: 'DENY_TEST' })
    expect(degraded).toMatchObject({ status: 'degraded', value: 'safe fallback', fallbackUsed: true })
    expect(failed).toMatchObject({ status: 'failed', fallbackUsed: false })
    expect(failed).not.toHaveProperty('value')
  })
})

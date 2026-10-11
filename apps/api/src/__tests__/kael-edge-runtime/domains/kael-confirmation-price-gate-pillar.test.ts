import { describe, expect, it } from 'vitest'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P358-kael-confirmation-price-gate',
  invariant: 'missing price evidence is refused by the atomic confirmation command before any job or broadcast write',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/confirm.service.ts',
  layer: 'integration',
  siblings: ['P48-durable-confirmation-operation', 'P357-legacy-confirmation-recovery'],
  mutation: 'move a job or broadcast write ahead of confirm_kael_chat_durable_atomic_v4; the refusal must keep its single-command boundary',
} as const satisfies PillarManifest

describe('Kael confirmation price gate', () => {
  installEdgeRuntimeTestHooks()

  it('rejects missing price proof in one atomic command without job writes', async () => {
    const client = makeSequenceClient([], {
      confirm_kael_chat_durable_atomic_v4: [{
        data: null,
        error: { code: '23514', message: 'KAEL_PRICE_EVIDENCE_REQUIRED' },
      }],
    })
    const context: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmKaelChat(
      context,
      'kael-session-1',
      { price_reasoning_receipt_id: 'price_reasoning:receipt-1' },
    )).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })

    expect(
      client.calls.filter((call) => call.table === 'jobs' || call.table === 'job_broadcasts'),
      pillarWhy(PILLAR, 'an invalid price receipt must not create a job or broadcast'),
    ).toEqual([])
    expect(
      client.calls.filter((call) => call.table === 'rpc:confirm_kael_chat_durable_atomic_v4'),
      pillarWhy(PILLAR, 'price validation and confirmation stay within one atomic command'),
    ).toHaveLength(1)
  })
})

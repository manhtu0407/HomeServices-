import { describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { loadDirectWorkerPaymentAvailability } from '../../../../../../supabase/functions/mobile-api/_shared/domains/payment/direct-payment-availability'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'

export const PILLAR = {
  id: 'P03-direct-payment-availability',
  invariant:
    'new public transactions cannot advertise or activate direct-worker payment while V1 is manual-bank only',
  authority: [
    'governance/RULES.md #8 (fallback yes, fake success no)',
    'governance/RULES.md #9 (no PII in logs)',
    'governance/RULES.md #7 (payment requires an implemented rail)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/direct-payment-availability.ts',
  layer: 'integration',
  siblings: ['P01-commission-math', 'P10-per-actor-rls'],
  mutation: 'return the hosted projection or call its RPC again; the no-call and fail-closed assertions turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const JOB_ID = 'job-p03'
const CUSTOMER_ID = 'customer-p03-must-not-be-logged'

describe('retired direct-worker payment availability', () => {
  it('fails closed without consulting a hosted eligibility projection', async () => {
    const client = makeSequenceClient([], {
      get_direct_worker_payment_availability: [{
        data: [{ direct_payment_available: true }],
        error: null,
      }],
    })

    const available = await loadDirectWorkerPaymentAvailability(
      client as unknown as DbClient,
      JOB_ID,
      CUSTOMER_ID,
    )

    expect(available, pillarWhy(PILLAR, 'manual-bank V1 has no direct-payment launch state')).toBe(false)
    expect(
      client.calls,
      pillarWhy(PILLAR, 'a stale hosted projection cannot reactivate a retired payment rail'),
    ).toEqual([])
  })
})

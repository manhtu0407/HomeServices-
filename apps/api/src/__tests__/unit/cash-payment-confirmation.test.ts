import { describe, expect, it, vi } from 'vitest'

import { confirmWorkerCashPayment } from '../../../../../supabase/functions/mobile-api/_shared/domains/payment/cash'

describe('legacy worker cash payment confirmation', () => {
  it('fails closed for every caller and never settles a job from a worker statement', async () => {
    const rpc = vi.fn()
    const workerContext = {
      role: 'worker',
      supabase: { rpc },
      user: { id: 'worker-1' },
    } as never

    await expect(confirmWorkerCashPayment(workerContext, 'job-1')).rejects.toMatchObject({
      code: 'PAYMENT_METHOD_CHANGED',
      status: 409,
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

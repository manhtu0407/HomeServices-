import { describe, expect, it, vi } from 'vitest'

import { loadPaymentReceipt } from '../../../../../supabase/functions/mobile-api/_shared/domains/job/payment-receipt'

function receiptClient(availability: boolean) {
  const order = {
    customer_confirmed_at: null,
    customer_transfer_claimed_at: null,
    customer_transferred_at: null,
    gross_amount: 450_000,
    hold_until: null,
    id: 'order-1',
    payment_method: 'platform_bank_manual',
    qr_image_url: 'https://vietqr.app/img?acc=1234567890&bank=VCB&amount=450000&des=NS1234567890ABCDEF12345678&holder=NESTSCOUT',
    response_deadline: null,
    status: 'manual_qr_ready',
    worker_confirmed_at: null,
  }
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: order, error: null })),
    select: vi.fn(() => query),
  }
  const rpc = vi.fn(async () => ({
    data: [{ direct_payment_available: availability }],
    error: null,
  }))
  return { client: { from: vi.fn(() => query), rpc } as never, rpc }
}

describe('payment receipt direct-payment availability', () => {
  it('projects only a safe eligibility boolean for the owning customer', async () => {
    const { client, rpc } = receiptClient(false)

    await expect(loadPaymentReceipt(client, 'job-1', 'customer', 'customer-1')).resolves.toMatchObject({
      direct_payment_available: false,
      method: 'platform_bank_manual',
    })
    expect(rpc).toHaveBeenCalledWith('get_direct_worker_payment_availability', {
      p_customer_id: 'customer-1',
      p_job_id: 'job-1',
    })
  })

  it('does not project direct-payment eligibility to the worker', async () => {
    const { client, rpc } = receiptClient(true)

    await expect(loadPaymentReceipt(client, 'job-1', 'worker', null)).resolves.toMatchObject({
      direct_payment_available: null,
      method: 'platform_bank_manual',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

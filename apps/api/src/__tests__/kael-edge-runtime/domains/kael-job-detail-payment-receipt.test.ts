import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('job-detail private payment receipt', () => {
  installEdgeRuntimeTestHooks()

  it('reads a private payment receipt through the privileged client after job ownership passes', async () => {
    const userClient = makeSequenceClient([
      {
        data: {
          address_district: 'q7',
          created_at: '2026-08-15T13:30:00.000Z',
          customer_id: 'customer-1',
          description: 'Replace a damaged outlet',
          final_price: 183_000,
          id: 'job-private-receipt-1',
          payment_provider: 'platform_bank_manual',
          payment_status: 'manual_customer_claimed',
          photo_urls: [],
          problem_chips: ['Outlet'],
          service_type: 'electrical',
          status: 'payment_pending',
        },
        error: null,
      },
      { data: null, error: null },
    ])
    const privilegedClient = makeSequenceClient([
      {
        data: {
          account_holder: null,
          customer_confirmed_at: null,
          customer_transfer_claimed_at: '2026-08-15T13:35:00.000Z',
          customer_transferred_at: null,
          gross_amount: 183_000,
          hold_until: null,
          id: 'payment-order-1',
          payment_method: 'platform_bank_manual',
          qr_image_url: null,
          response_deadline: null,
          status: 'manual_customer_claimed',
          worker_confirmed_at: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      privilegedSupabase: privilegedClient,
      role: 'customer',
      success: true,
      supabase: userClient,
      user: { id: 'customer-1' },
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-private-receipt-1')).resolves.toMatchObject({
      job: {
        payment_receipt: {
          customer_transfer_claimed_at: '2026-08-15T13:35:00.000Z',
          gross_amount: 183_000,
          method: 'platform_bank_manual',
          status: 'manual_customer_claimed',
        },
      },
    })
    expect(userClient.calls.some((call) => call.table === 'job_payment_orders')).toBe(false)
    expect(privilegedClient.calls.some((call) => call.table === 'job_payment_orders')).toBe(true)
  })
})

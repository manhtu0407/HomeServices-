import { describe, expect, it, vi } from 'vitest'

import { confirmWorkerCashPayment } from '../../../../../supabase/functions/mobile-api/_shared/services/cash-payment.service'

const confirmedCashRow = {
  cash_commission_collected: 45_000,
  cash_commission_due: 0,
  commission_level: 1,
  commission_rate_bps: 1500,
  gross_amount: 300_000,
  job_id: 'job-1',
  job_status: 'paid',
  outcome: 'confirmed',
  payment_received_at: '2026-07-29T10:00:00.000Z',
  payment_status: 'cash_confirmed',
  payment_updated_at: '2026-07-29T10:00:00.000Z',
  platform_fee: 45_000,
  worker_net: 255_000,
}

function workerContext(rpc: ReturnType<typeof vi.fn>) {
  return {
    role: 'worker',
    supabase: { rpc },
    user: { id: 'worker-1' },
  } as never
}

describe('worker cash payment confirmation', () => {
  it('rejects every role except the assigned worker before calling the settlement RPC', async () => {
    const rpc = vi.fn(async () => ({ data: [confirmedCashRow], error: null }))
    const customerContext = {
      role: 'customer',
      supabase: { rpc },
      user: { id: 'worker-1' },
    } as never

    await expect(confirmWorkerCashPayment(customerContext, 'job-1')).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      status: 403,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends no client-side amount and accepts only the authoritative RPC result', async () => {
    const rpc = vi.fn(async () => ({ data: [confirmedCashRow], error: null }))

    await expect(confirmWorkerCashPayment(workerContext(rpc), 'job-1')).resolves.toEqual({
      job_id: 'job-1',
      outcome: 'confirmed',
      payment: {
        cash_commission_collected: 45_000,
        cash_commission_due: 0,
        commission_level: 1,
        commission_rate_bps: 1500,
        gross_amount: 300_000,
        provider: 'cash',
        received_at: '2026-07-29T10:00:00.000Z',
        status: 'cash_confirmed',
        updated_at: '2026-07-29T10:00:00.000Z',
        platform_fee: 45_000,
        worker_net: 255_000,
      },
      status: 'paid',
    })
    expect(rpc).toHaveBeenCalledWith('confirm_worker_cash_payment', {
      p_job_id: 'job-1',
      p_worker_id: 'worker-1',
    })
  })

  it('fails closed when the RPC does not prove a paid cash settlement', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ ...confirmedCashRow, payment_status: 'received' }],
      error: null,
    }))

    await expect(confirmWorkerCashPayment(workerContext(rpc), 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('keeps the QR flow authoritative once it has already claimed the job state', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'P0001', message: 'cash payment confirmation is unavailable' },
    }))

    await expect(confirmWorkerCashPayment(workerContext(rpc), 'job-1')).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
  })
})

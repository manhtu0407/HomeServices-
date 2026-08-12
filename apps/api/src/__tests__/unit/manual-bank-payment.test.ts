import { describe, expect, it, vi } from 'vitest'

import {
  buildManualBankPaymentInstructions,
  claimManualBankPayment,
  createManualBankPaymentOrder,
  respondToDirectWorkerPayment,
  selectDirectWorkerPayment,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/payment/manual-bank'

const paymentCode = 'NS1234567890ABCDEF12345678'

function customerContext(rpc: ReturnType<typeof vi.fn>) {
  const job = {
    customer_id: 'customer-1',
    final_price: 450_000,
    id: 'job-1',
    status: 'confirmed_by_customer',
    worker_id: 'worker-1',
  }
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({ data: job, error: null })),
  }
  return {
    role: 'customer',
    supabase: { from: vi.fn(() => query), rpc },
    user: { id: 'customer-1' },
  } as never
}

function workerContext(rpc: ReturnType<typeof vi.fn>) {
  return {
    role: 'worker',
    supabase: { rpc },
    user: { id: 'worker-1' },
  } as never
}

describe('manual bank payment authority', () => {
  it('builds a per-deal QR only from server-supplied bank settings and a unique payment code', () => {
    expect(buildManualBankPaymentInstructions({
      accountHolder: 'NESTSCOUT COMPANY',
      accountNumber: '1234567890',
      amount: 450_000,
      bankCode: 'VCB',
      paymentCode,
    })).toEqual({
      paymentCode,
      qrImageUrl: 'https://vietqr.app/img?acc=1234567890&bank=VCB&amount=450000&des=NS1234567890ABCDEF12345678&template=compact&showinfo=true&holder=NESTSCOUT+COMPANY&store=NestScout',
      transferContent: paymentCode,
    })
  })

  it('creates or returns an idempotent pending order rather than declaring payment', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        gross_amount: 450_000,
        job_id: 'job-1',
        payment_code: paymentCode,
        payment_qr_image_url: 'https://vietqr.app/img?acc=1234567890&bank=VCB&amount=450000&des=NS1234567890ABCDEF12345678&template=compact&showinfo=true&holder=NESTSCOUT+COMPANY&store=NestScout',
        payment_status: 'manual_qr_ready',
        payment_transfer_content: paymentCode,
        payment_updated_at: '2026-08-11T08:00:00.000Z',
        status: 'payment_pending',
      }],
      error: null,
    }))

    await expect(createManualBankPaymentOrder(customerContext(rpc), 'job-1', {
      accountHolder: 'NESTSCOUT COMPANY',
      accountNumber: '1234567890',
      bankCode: 'VCB',
      enabled: true,
    })).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'payment_pending',
      payment: { provider: 'platform_bank_manual', status: 'manual_qr_ready' },
    })

    expect(rpc).toHaveBeenCalledWith('create_manual_bank_payment_order', expect.objectContaining({
      p_customer_id: 'customer-1',
      p_expected_gross_amount: 450_000,
      p_job_id: 'job-1',
      p_payment_code: expect.stringMatching(/^NS[A-Z0-9]{24}$/),
    }))
  })

  it('treats a customer transfer claim as reconciliation pending, never a paid authority', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        job_id: 'job-1',
        notification_required: true,
        payment_status: 'manual_customer_claimed',
        status: 'payment_pending',
        transfer_claimed_at: '2026-08-11T08:05:00.000Z',
      }],
      error: null,
    }))

    await expect(claimManualBankPayment(customerContext(rpc), 'job-1', {
      sending_bank: 'VCB',
      transferred_at: '2026-08-11T08:05:00.000Z',
    })).resolves.toEqual({
      job_id: 'job-1',
      payment_status: 'manual_customer_claimed',
      status: 'payment_pending',
      transfer_claimed_at: '2026-08-11T08:05:00.000Z',
    })
    expect(rpc).toHaveBeenCalledWith('claim_manual_bank_payment', {
      p_customer_id: 'customer-1',
      p_job_id: 'job-1',
      p_sending_bank: 'VCB',
      p_transferred_at: '2026-08-11T08:05:00.000Z',
    })
  })

  it('requires a customer to select direct payment and returns only a pending confirmation receipt', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        collateral_amount: 67_500,
        direct_status: 'awaiting_customer_confirmation',
        job_id: 'job-1',
        ok: true,
        status: 'payment_pending',
      }],
      error: null,
    }))

    await expect(selectDirectWorkerPayment(customerContext(rpc), 'job-1', 'request-1')).resolves.toMatchObject({
      direct_status: 'awaiting_customer_confirmation',
      status: 'payment_pending',
    })
    expect(rpc).toHaveBeenCalledWith('select_direct_worker_payment', {
      p_client_request_id: 'request-1',
      p_customer_id: 'customer-1',
      p_job_id: 'job-1',
    })
  })

  it('allows a worker confirmation to remain pending until the customer also confirms', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        direct_status: 'awaiting_customer_confirmation',
        job_id: 'job-1',
        notification_required: false,
        ok: true,
        status: 'payment_pending',
      }],
      error: null,
    }))

    await expect(respondToDirectWorkerPayment(workerContext(rpc), 'job-1', {
      received: true,
    })).resolves.toMatchObject({
      direct_status: 'awaiting_customer_confirmation',
      status: 'payment_pending',
    })
    expect(rpc).toHaveBeenCalledWith('respond_to_direct_worker_payment', {
      p_actor_id: 'worker-1',
      p_actor_role: 'worker',
      p_job_id: 'job-1',
      p_received: true,
    })
  })
})

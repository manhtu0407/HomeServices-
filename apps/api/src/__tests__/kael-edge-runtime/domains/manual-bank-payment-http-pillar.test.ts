import { describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { buildManualBankPaymentInstructions } from '../../../../../../supabase/functions/mobile-api/_shared/domains/payment/manual-bank'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P364-customer-manual-bank-payment-http',
  invariant: 'Customer manual-bank order and transfer-claim routes stay actor-bound, use the durable payment RPCs, and never treat a customer claim as verified settlement',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (manual-bank payment authority)'],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/manual-bank.ts',
  layer: 'integration',
  siblings: ['P68-completion-payment-authority', 'P86-customer-completion-http'],
  mutation: 'route order or claim through a direct job update, remove the authenticated customer id from either RPC, or change a customer transfer claim to a paid status; the HTTP boundary cases turn red',
} as const satisfies PillarManifest

const JOB = 'd2040000-0000-4000-8000-000000000001'
const CUSTOMER = 'd2040000-0000-4000-8000-000000000002'
const OTHER_CUSTOMER = 'd2040000-0000-4000-8000-000000000003'
const PAYMENT_CODE = 'NS1234567890ABCDEF12345678'
const GENERATED_PAYMENT_CODE = 'NSF36400000000400080000000'
const TRANSFERRED_AT = '2026-09-05T10:20:30+07:00'
const BANK = { accountHolder: 'TEST COHORT', accountNumber: '1234567890', bankCode: 'VCB', enabled: true }

function orderReceipt(paymentCode: string) {
  const paymentInstructions = buildManualBankPaymentInstructions({ ...BANK, amount: 450000, paymentCode })
  return {
    job_id: JOB,
    gross_amount: 450000,
    status: 'payment_pending',
    payment_status: 'manual_qr_ready',
    payment_code: paymentCode,
    payment_transfer_content: paymentCode,
    payment_qr_image_url: paymentInstructions.qrImageUrl,
    payment_updated_at: '2026-09-05T00:00:00.000Z',
  }
}

function setup(input: {
  role?: 'customer' | 'worker' | 'admin'
  actorId?: string
  ownerId?: string
  jobStatus?: string
  enabled?: boolean
  orderResult?: QueryResult
  claimResult?: QueryResult
  recognitionResult?: QueryResult
} = {}) {
  const client = makeSequenceClient([], {
    create_manual_bank_payment_order: [input.orderResult ?? {
      data: [orderReceipt(PAYMENT_CODE)],
      error: null,
    }],
    claim_manual_bank_payment: [input.claimResult ?? { data: [{
      job_id: JOB,
      status: 'payment_pending',
      payment_status: 'manual_customer_claimed',
      transfer_claimed_at: TRANSFERRED_AT,
      notification_required: false,
    }], error: null }],
    recognize_customer_payment_claim: [input.recognitionResult ?? { data: [{
      ok: true,
      settlement_state: 'customer_claimed',
    }], error: null }],
  }, {
    jobs: [{ data: {
      id: JOB,
      customer_id: input.ownerId ?? CUSTOMER,
      worker_id: null,
      status: input.jobStatus ?? 'payment_pending',
      final_price: 450000,
    }, error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: input.actorId ?? CUSTOMER },
      role: input.role ?? 'customer',
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({ manualBank: { ...BANK, enabled: input.enabled ?? true } }),
  })
  const send = (path: string, body?: unknown) => handler(new Request(`https://edge.test/jobs/${JOB}/${path}`, {
    method: 'POST',
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  }))
  return { client, send }
}

describe('Customer manual-bank payment at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('creates a Customer-owned manual bank payment order without marking it paid', async () => {
    const uuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('f3640000-0000-4000-8000-000000000004')
    const { client, send } = setup({ orderResult: { data: [orderReceipt(GENERATED_PAYMENT_CODE)], error: null } })
    let response: Response
    try {
      response = await send('payment-order')
    } finally {
      uuidSpy.mockRestore()
    }
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({
      job_id: JOB,
      status: 'payment_pending',
      payment: {
        provider: 'platform_bank_manual',
        status: 'manual_qr_ready',
        gross_amount: 450000,
        payment_code: GENERATED_PAYMENT_CODE,
      },
    })
    const orderCalls = client.calls.filter((call) => call.table === 'rpc:create_manual_bank_payment_order')
    expect(orderCalls).toHaveLength(1)
    expect(orderCalls[0]?.operations[0]?.[2]).toMatchObject({
      p_customer_id: CUSTOMER,
      p_job_id: JOB,
      p_expected_gross_amount: 450000,
      p_payment_code: GENERATED_PAYMENT_CODE,
    })
    expect(client.calls.some((call) =>
      call.table === 'jobs' && call.operations.some((operation) => operation[0] === 'update')
    )).toBe(false)
  })

  it.each(['worker', 'admin'] as const)('refuses the %s actor before reading the job or creating an order', async (role) => {
    const { client, send } = setup({ role })
    const response = await send('payment-order')
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table === 'jobs')).toEqual([])
    expect(client.calls.filter((call) => call.table === 'rpc:create_manual_bank_payment_order')).toEqual([])
  })

  it('conceals another Customer job before creating its payment order', async () => {
    const { client, send } = setup({ actorId: OTHER_CUSTOMER, ownerId: CUSTOMER })
    const response = await send('payment-order')
    expect(response.status, pillarWhy(PILLAR)).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(client.calls.filter((call) => call.table === 'rpc:create_manual_bank_payment_order')).toEqual([])
  })

  it.each([
    ['completed_by_worker', true],
    ['payment_pending', false],
  ] as const)('fails closed for job state %s with bank enabled=%s', async (jobStatus, enabled) => {
    const { client, send } = setup({ jobStatus, enabled })
    const response = await send('payment-order')
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: enabled ? 'INVALID_STATUS' : 'PAYMENT_NOT_ENABLED' })
    expect(client.calls.filter((call) => call.table === 'rpc:create_manual_bank_payment_order')).toEqual([])
  })

  it('records a Customer transfer claim and leaves settlement pending', async () => {
    const { client, send } = setup()
    const response = await send('payment-order/claim', { transferred_at: TRANSFERRED_AT, sending_bank: 'vcb' })
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({
      job_id: JOB,
      status: 'payment_pending',
      payment_status: 'manual_customer_claimed',
      transfer_claimed_at: TRANSFERRED_AT,
      settlement_state: 'customer_claimed',
    })
    const claim = client.calls.find((call) => call.table === 'rpc:claim_manual_bank_payment')
    expect(claim?.operations[0]?.[2]).toMatchObject({
      p_customer_id: CUSTOMER,
      p_job_id: JOB,
      p_sending_bank: 'VCB',
      p_transferred_at: TRANSFERRED_AT,
    })
    const recognition = client.calls.find((call) => call.table === 'rpc:recognize_customer_payment_claim')
    expect(recognition?.operations[0]?.[2]).toMatchObject({
      p_customer_id: CUSTOMER,
      p_job_id: JOB,
    })
    expect(client.calls.some((call) =>
      call.table === 'jobs' && call.operations.some((operation) => operation[0] === 'update')
    )).toBe(false)
  })

  it.each(['worker', 'admin'] as const)('refuses the %s actor before either transfer-claim RPC', async (role) => {
    const { client, send } = setup({ role })
    const response = await send('payment-order/claim', { transferred_at: TRANSFERRED_AT })
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) =>
      call.table === 'rpc:claim_manual_bank_payment' || call.table === 'rpc:recognize_customer_payment_claim'
    )).toEqual([])
  })

  it.each([
    { label: 'an invalid timestamp', body: { transferred_at: 'yesterday', sending_bank: 'VCB' } },
    { label: 'a forged actor field', body: { transferred_at: TRANSFERRED_AT, sending_bank: 'VCB', customer_id: OTHER_CUSTOMER } },
  ])('rejects $label transfer claims before either RPC', async ({ body }) => {
    const { client, send } = setup()
    const response = await send('payment-order/claim', body)
    expect(response.status, pillarWhy(PILLAR)).toBe(400)
    expect(client.calls.filter((call) => call.table.startsWith('rpc:claim_manual_bank_payment') || call.table === 'rpc:recognize_customer_payment_claim')).toEqual([])
  })

  it('maps a rejected atomic claim without returning a payment success', async () => {
    const { client, send } = setup({ claimResult: { data: null, error: { code: 'P0001', message: 'PAYMENT_ORDER_NOT_PENDING' } } })
    const response = await send('payment-order/claim', { transferred_at: TRANSFERRED_AT })
    expect(response.status, pillarWhy(PILLAR, 'database refusal remains a pending or rejected claim, never settlement')).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'STATUS_CHANGED' })
    expect(client.calls.filter((call) => call.table === 'rpc:recognize_customer_payment_claim')).toEqual([])
  })

  it('fails closed when payment-claim recognition does not return a valid receipt', async () => {
    const { client, send } = setup({ recognitionResult: { data: [{ ok: false, settlement_state: 'unknown' }], error: null } })
    const response = await send('payment-order/claim', { transferred_at: TRANSFERRED_AT })
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
    expect(client.calls.filter((call) => call.table === 'rpc:claim_manual_bank_payment')).toHaveLength(1)
  })
})

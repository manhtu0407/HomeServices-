import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { buildManualBankPaymentInstructions } from '../../../../../../supabase/functions/mobile-api/_shared/domains/payment/manual-bank'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P86-customer-completion-http',
  invariant: 'Only the owning Customer can confirm completion through HTTP; the real domain preserves atomic evidence/state refusals and recovers the same unpaid operation after a lost response',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (Customer-only completion)'],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/manual-bank.ts',
  layer: 'security-negative',
  siblings: ['P68-completion-payment-authority', 'P79-worker-completion-media-ownership'],
  mutation: 'replace the composed confirmCompletion service with the retired status update or discard the atomic operation receipt; HTTP success/replay and state-refusal cases fail',
} as const satisfies PillarManifest

const JOB = 'f8600000-0000-4000-8000-000000000001'
const CUSTOMER = 'f8600000-0000-4000-8000-000000000002'
const WORKER = 'f8600000-0000-4000-8000-000000000003'
const OPERATION = 'f8600000-0000-4000-8000-000000000004'
const PAYMENT_CODE = 'NS1234567890ABCDEF12345678'
const REQUEST_ID = `completion-payment:${JOB}:${CUSTOMER}`
const bank = { accountHolder: 'TEST COHORT', accountNumber: '1234567890', bankCode: 'VCB', enabled: true }
const qr = buildManualBankPaymentInstructions({ ...bank, amount: 450000, paymentCode: PAYMENT_CODE })

function receipt(alreadyApplied = false) {
  return {
    operation_id: OPERATION, request_id: REQUEST_ID, already_applied: alreadyApplied,
    job_id: JOB, gross_amount: 450000, status: 'payment_pending',
    payment_status: 'manual_qr_ready', payment_code: PAYMENT_CODE,
    payment_transfer_content: PAYMENT_CODE, payment_qr_image_url: qr.qrImageUrl,
    payment_updated_at: '2026-09-05T00:00:00.000Z',
  }
}

function setup(input: {
  role?: 'customer' | 'worker' | 'admin'
  actorId?: string
  status?: string
  finalPrice?: number | null
  rpcResults?: QueryResult[]
  enabled?: boolean
} = {}) {
  const job = {
    id: JOB, customer_id: CUSTOMER, worker_id: WORKER,
    status: input.status ?? 'completed_by_worker',
    final_price: input.finalPrice === undefined ? 450000 : input.finalPrice,
  }
  const client = makeSequenceClient([], {
    confirm_completion_manual_bank_atomic: input.rpcResults ?? [{ data: [receipt()], error: null }],
    insert_notification_atomic: [{ data: [{ notification_id: 'notification-1' }], error: null }],
  }, { jobs: Array.from({ length: 4 }, () => ({ data: job, error: null })) })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: input.actorId ?? CUSTOMER }, role: input.role ?? 'customer',
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({ manualBank: { ...bank, enabled: input.enabled ?? true } }),
  })
  return {
    client,
    confirm: () => handler(new Request(`https://edge.test/jobs/${JOB}/confirm-completion`, { method: 'POST' })),
  }
}

function completionCalls(client: ReturnType<typeof makeSequenceClient>) {
  return client.calls.filter((call) => call.table === 'rpc:confirm_completion_manual_bank_atomic')
}

describe('Customer completion at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('creates an atomic unpaid operation and returns its durable receipt', async () => {
    const { client, confirm } = setup()
    const response = await confirm()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({
      operation_id: OPERATION, request_id: REQUEST_ID, already_applied: false,
      job_id: JOB, status: 'payment_pending', final_price: 450000,
      payment: { status: 'manual_qr_ready', provider: 'platform_bank_manual', gross_amount: 450000 },
    })
    expect(completionCalls(client)).toHaveLength(1)
    expect(completionCalls(client)[0].operations).toContainEqual(['rpc', 'confirm_completion_manual_bank_atomic', expect.objectContaining({
      p_customer_id: CUSTOMER, p_job_id: JOB, p_request_id: REQUEST_ID, p_expected_final_price: 450000,
    })])
    expect(client.calls.some((call) => call.table === 'jobs' && call.operations.some((op) => op[0] === 'update'))).toBe(false)
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('recovers the same operation on retry without issuing a second notification', async () => {
    const { client, confirm } = setup({ rpcResults: [
      { data: [receipt()], error: null }, { data: [receipt(true)], error: null },
    ] })
    const first = await (await confirm()).json()
    const retryResponse = await confirm()
    expect(retryResponse.status, pillarWhy(PILLAR, 'lost-response retry is not a new completion')).toBe(200)
    expect(await retryResponse.json()).toMatchObject({
      operation_id: first.operation_id, request_id: first.request_id,
      already_applied: true, status: 'payment_pending', payment: first.payment,
    })
    expect(completionCalls(client)).toHaveLength(2)
    for (const call of completionCalls(client)) {
      expect(call.operations[0][2]).toMatchObject({ p_request_id: REQUEST_ID })
    }
    expect(client.calls.filter((call) => call.table === 'rpc:insert_notification_atomic')).toHaveLength(1)
  })

  it.each(['worker', 'admin'] as const)('refuses the %s actor before any domain read or write', async (role) => {
    const { client, confirm } = setup({ role })
    const response = await confirm()
    expect(response.status, pillarWhy(PILLAR, 'role cannot substitute for Customer authority')).toBe(403)
    expect(client.calls.filter((call) => call.table === 'jobs')).toEqual([])
    expect(completionCalls(client)).toEqual([])
  })

  it('conceals another Customer job before the completion RPC', async () => {
    const { client, confirm } = setup({ actorId: 'f8600000-0000-4000-8000-000000000099' })
    const response = await confirm()
    expect(response.status, pillarWhy(PILLAR)).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(completionCalls(client)).toEqual([])
  })

  it.each([null, 0, -1, 1.5])('refuses the invalid final price %s before mutation', async (finalPrice) => {
    const { client, confirm } = setup({ finalPrice })
    const response = await confirm()
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'INVALID_STATUS' })
    expect(completionCalls(client)).toEqual([])
  })

  it.each([
    ['repairing', 'COMPLETION_NOT_READY', 'STATUS_CHANGED', 409],
    ['completed_by_worker', 'CUSTOMER_COMPLETION_EVIDENCE_REQUIRED', 'COMPLETION_EVIDENCE_REQUIRED', 409],
    ['completed_by_worker', 'SYNTHETIC_PAYMENT_PATH_REQUIRED', 'AUTH_FORBIDDEN', 403],
  ] as const)('preserves the atomic refusal %s / %s', async (status, message, code, httpStatus) => {
    const { client, confirm } = setup({ status, rpcResults: [{ data: null, error: { code: 'P0001', message } }] })
    const response = await confirm()
    expect(response.status, pillarWhy(PILLAR, 'DB refusal must never become a payment success')).toBe(httpStatus)
    expect(await response.json()).toMatchObject({ code })
    expect(client.calls.filter((call) => call.table === 'rpc:insert_notification_atomic')).toEqual([])
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('fails closed when the bank provider is not enabled', async () => {
    const { client, confirm } = setup({ enabled: false })
    const response = await confirm()
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'PAYMENT_NOT_ENABLED' })
    expect(client.calls.filter((call) => call.table === 'jobs')).toEqual([])
    expect(completionCalls(client)).toEqual([])
  })
})

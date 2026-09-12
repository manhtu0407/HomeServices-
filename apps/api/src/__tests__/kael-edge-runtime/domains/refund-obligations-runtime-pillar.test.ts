import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { loadPaymentReceipt } from '../../../../../../supabase/functions/mobile-api/_shared/domains/job/payment-receipt'
import { loadJobRefundSummary } from '../../../../../../supabase/functions/mobile-api/_shared/domains/payment/refund-obligations'
import { refundSummarySchema } from '../../../../../../packages/shared/src/contracts/payment'
import { edgeRefundSummarySchema } from '../../../../../../supabase/functions/_shared/contracts/payment'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P88-refund-obligations-runtime',
  invariant: 'paid cancellation opens an audited review without reversing paid facts; payment receipts distinguish approved refund obligations from money actually returned',
  authority: ['governance/RULES.md #7 (explicit financial authority)', 'governance/RULES.md #8 (no false payment success)'],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/refund-obligations.ts',
  layer: 'security-negative',
  siblings: ['P89-refund-obligation-integrity-sql', 'P82-review-submission-runtime'],
  mutation: 'remove the paid-cancellation adapter or omit refund receipt serialization; paid requests fail and approved obligations disappear from the receipt',
} as const satisfies PillarManifest

const JOB = 'f8800000-0000-4000-8000-000000000001'
const CUSTOMER = 'f8800000-0000-4000-8000-000000000002'
const WORKER = 'f8800000-0000-4000-8000-000000000003'
const CANCELLATION = 'f8800000-0000-4000-8000-000000000004'
const DISPUTE = 'f8800000-0000-4000-8000-000000000005'
const OBLIGATION = 'f8800000-0000-4000-8000-000000000006'
const TIME = '2026-09-05T00:00:00.000Z'

function cancellationSetup(input: { status?: string; actorId?: string; role?: 'customer' | 'worker'; error?: { code: string; message: string } } = {}) {
  const client = makeSequenceClient([], {
    request_paid_cancellation_review_atomic: [{ data: input.error ? null : {
      cancellation_id: CANCELLATION, dispute_id: DISPUTE, job_id: JOB,
      job_status: input.status ?? 'paid', created_at: TIME,
    }, error: input.error ?? null }],
  }, { jobs: [{ data: {
    id: JOB, status: input.status ?? 'paid', customer_id: CUSTOMER, worker_id: WORKER,
  }, error: null }] })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: input.actorId ?? CUSTOMER },
      role: input.role ?? 'customer', supabase: client, privilegedSupabase: client, userSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, request: () => handler(new Request(`https://edge.test/jobs/${JOB}/customer-cancellation`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason_code: 'pricing_disagreement_late', reason_note: 'Đề nghị kiểm tra lại khoản thanh toán.' }),
  })) }
}

describe('Refund obligations at existing payment boundaries', () => {
  installEdgeRuntimeTestHooks()

  it.each(['paid', 'reviewed'])('opens an audited review from %s without cancelling or refunding the job', async (status) => {
    const { client, request } = cancellationSetup({ status })
    const response = await request()
    expect(response.status, pillarWhy(PILLAR, status)).toBe(201)
    expect(await response.json()).toMatchObject({ cancellation_id: CANCELLATION, dispute_id: DISPUTE,
      job_status: status, refund_state: 'review_required', admin_review_required: true })
    expect(client.calls.map((call) => call.table)).toContain('rpc:request_paid_cancellation_review_atomic')
    expect(client.calls.map((call) => call.table)).not.toContain('rpc:request_customer_cancellation_atomic')
    expect(client.calls.flatMap((call) => call.operations).some((operation) => operation[0] === 'update')).toBe(false)
  })

  it.each([
    ['worker', WORKER, 403], ['customer', WORKER, 404],
  ] as const)('rejects %s acting as %s before opening financial review', async (role, actorId, expectedStatus) => {
    const { client, request } = cancellationSetup({ role, actorId })
    expect((await request()).status, pillarWhy(PILLAR, 'participant authority')).toBe(expectedStatus)
    expect(client.calls.some((call) => call.table.startsWith('rpc:request_paid'))).toBe(false)
  })

  it('keeps failed review persistence recoverable rather than returning a submitted state', async () => {
    const { request } = cancellationSetup({ error: { code: '08006', message: 'connection failed' } })
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'REFUND_REVIEW_UNAVAILABLE' })
  })

  it('shows an approved refund obligation without claiming money was returned', async () => {
    const client = makeSequenceClient([], {
      read_job_refund_summary: [{ data: {
        state: 'refund_required', amount_vnd: 100000, obligation_ids: [OBLIGATION],
        requested_at: TIME, receipt_verification_available: false,
      }, error: null }],
    }, { job_payment_orders: [{ data: {
      id: 'payment-order', payment_method: 'platform_bank_manual', status: 'manual_verified', gross_amount: 450000,
    }, error: null }] })
    const receipt = await loadPaymentReceipt(client as unknown as DbClient, JOB, 'worker', CUSTOMER)
    expect(receipt, pillarWhy(PILLAR, 'obligation is distinct from payment receipt')).toMatchObject({
      status: 'manual_verified', refund: { state: 'refund_required', amount_vnd: 100000, receipt_verification_available: false },
    })
    expect(JSON.stringify(receipt)).not.toContain('refunded')
  })

  it('fails closed when refund state cannot be reconciled', async () => {
    const client = makeSequenceClient([], {
      read_job_refund_summary: [{ data: null, error: { code: '08006' } }],
    }, { job_payment_orders: [{ data: {
      id: 'payment-order', payment_method: 'platform_bank_manual', status: 'manual_verified', gross_amount: 450000,
    }, error: null }] })
    await expect(loadPaymentReceipt(client as unknown as DbClient, JOB, 'worker', CUSTOMER))
      .rejects.toMatchObject({ code: 'REFUND_READ_UNAVAILABLE', status: 503 })
  })

  it('requests cohort-excluded state for existing Admin real-finance detail', async () => {
    const client = makeSequenceClient([], { read_job_refund_summary: [{ data: null, error: null }] })
    expect(await loadJobRefundSummary(client as unknown as DbClient, JOB, true)).toBeNull()
    expect(client.calls[0].operations).toContainEqual(['rpc', 'read_job_refund_summary', {
      p_job_id: JOB, p_real_only: true,
    }])
  })

  it('keeps shared and Edge receipt contracts equivalent without inventing completed refunds', () => {
    const required = { state: 'refund_required', amount_vnd: 100000, obligation_ids: [OBLIGATION],
      requested_at: TIME, receipt_verification_available: false }
    for (const value of [required, { ...required, state: 'review_required', amount_vnd: null, obligation_ids: [] }]) {
      expect(refundSummarySchema.parse(value)).toEqual(edgeRefundSummarySchema.parse(value))
    }
    for (const value of [
      { ...required, state: 'refunded' }, { ...required, amount_vnd: 0 },
      { ...required, amount_vnd: null }, { ...required, obligation_ids: [] },
      { ...required, state: 'review_required' }, { ...required, receipt_verification_available: true },
    ]) {
      expect(refundSummarySchema.safeParse(value).success).toBe(false)
      expect(edgeRefundSummarySchema.safeParse(value).success).toBe(false)
    }
  })

  it.each(['REFUND_PAYMENT_UNVERIFIED', 'REFUND_AMOUNT_EXCEEDS_PAID', 'REFUND_SOURCE_CONFLICT'])(
    'retains the safe decision conflict %s from the atomic SQL boundary', async (code) => {
      const client = makeSequenceClient([], { admin_decide_dispute_atomic: [
        { data: null, error: { code: 'P0001', message: code } },
      ] })
      await expect(createEdgeServices({}).decideDispute({ success: true, user: { id: CUSTOMER }, role: 'admin',
        supabase: client }, DISPUTE, { outcome: 'customer_favor_partial', refund_amount: 100000,
        customer_trust_impact: 'none', worker_action: 'none', reasoning: 'Đã xem xét đầy đủ bằng chứng của hai bên trước quyết định.' }))
        .rejects.toMatchObject({ code, status: 409 })
    },
  )
})

import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { localQaRecord as record } from './local-qa-http-harness'
import { createLocalFulfillmentFixture } from './local-qa-fulfillment-fixture'

export const PILLAR = {
  id: 'P397-kael-local-http-payment',
  invariant: 'the same noncohort fulfilled job creates one manual-bank order after Customer consent, keeps transfer claims unverified, and requires an authorized versioned Admin decision before paid and review',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'approved Build 56 journey verification plan'],
  target: 'actual local Edge and PostgreSQL completion, manual-bank claim, Admin reconciliation and review',
  layer: 'integration',
  siblings: ['P396-kael-local-http-fulfillment', 'P364-customer-manual-bank-payment-http', 'P68-completion-payment-authority'],
  mutation: 'use the Customer token for the successful Admin reconciliation claim; the real public role boundary must deny it and the expected success turns red',
} as const satisfies PillarManifest

const { target, prepare } = createLocalFulfillmentFixture(PILLAR)
const fixture = process.env.NESTSCOUT_QA_PAYMENT_FIXTURE_NAME
if (fixture !== undefined && !/^qa-payment-fixture-[a-f0-9]{12}$/u.test(fixture)) throw new Error('QA payment fixture name refused')
const integration = pillarPrerequisite(PILLAR, { available: target !== null && fixture !== undefined,
  hint: 'Requires the named local stack and dedicated payment fixture; dummy QR metadata is never sent to a bank or QR host.' }) ? describe.sequential : describe.skip
const why = (detail?: string) => pillarWhy(PILLAR, detail)

integration('Configured manual-bank payment through the same actual local journey', () => {
  for (const mismatchFirst of [false, true]) {
    it(`preserves one payment and Admin receipt with amount mismatch first=${mismatchFirst}`, async context => {
      const { owner, worker, foreign, jobId, request, command, read, journey, customer } = await prepare(context, {
        apiRoot: `/functions/v1/${fixture}`, paymentRail: 'platform_bank_manual',
      })
      const admin = await customer('admin')
      Object.assign(journey, { adminId: admin.id, paymentProfile: 'local_dummy_manual_bank', mismatchFirst })
      expect((await command(`/jobs/${jobId}/confirm-completion`, foreign)).status, why('foreign Customer cannot open this payment')).toBe(404)
      expect((await command(`/jobs/${jobId}/confirm-completion`, worker)).status, why()).toBe(403)
      const completed = await Promise.all([command(`/jobs/${jobId}/confirm-completion`, owner), command(`/jobs/${jobId}/confirm-completion`, owner)])
      expect(completed.map(result => result.status), why('concurrent consent must recover one committed payment')).toEqual([200, 200])
      const first = record(completed[0].payload)
      expect(record(completed[1].payload).operation_id, why()).toBe(first.operation_id)
      expect(completed.map(result => record(result.payload).already_applied).sort(), why()).toEqual([false, true])
      const payment = record(first.payment)
      expect(first, why()).toMatchObject({ job_id: jobId, final_price: 350000, status: 'payment_pending' })
      expect(payment, why()).toMatchObject({ provider: 'platform_bank_manual', status: 'manual_qr_ready', gross_amount: 350000 })
      const qr = new URL(String(payment.qr_image_url))
      expect(qr.origin, why()).toBe('https://vietqr.app')
      expect(qr.searchParams.get('acc'), why('fixture account is not a real bank account')).toBe('QAONLY')
      expect(qr.searchParams.get('bank'), why()).toBe('QA')
      expect(qr.searchParams.get('amount'), why()).toBe('350000')
      expect(qr.searchParams.get('des'), why()).toBe(payment.payment_code)
      expect(payment.transfer_content, why()).toBe(payment.payment_code)
      const orderReplay = await command(`/jobs/${jobId}/payment-order`, owner)
      expect(orderReplay.status, why()).toBe(200)
      expect(record(record(orderReplay.payload).payment).payment_code, why('lost response must not change transfer identity')).toBe(payment.payment_code)
      const orders = await request(`/rest/v1/job_payment_orders?job_id=eq.${jobId}&select=id,status,gross_amount,version,platform_fee,worker_net`)
      expect(orders.payload, why()).toHaveLength(1)
      if (!Array.isArray(orders.payload)) throw new Error(why('payment order missing'))
      const order = record(orders.payload[0])
      const orderId = String(order.id)
      Object.assign(journey, { paymentOrderId: orderId, completionOperationId: first.operation_id })
      expect(order, why('new Worker level1 has the active15percent commission policy')).toMatchObject({
        status: 'manual_qr_ready', gross_amount: 350000, platform_fee: 52500, worker_net: 297500,
      })
      const transfer = { transferred_at: new Date().toISOString(), sending_bank: 'QA' }
      expect((await command(`/jobs/${jobId}/payment-order/claim`, foreign, transfer)).status, why()).toBe(409)
      expect((await command(`/jobs/${jobId}/payment-order/claim`, worker, transfer)).status, why()).toBe(403)
      const claim = await command(`/jobs/${jobId}/payment-order/claim`, owner, transfer)
      expect(claim.status, why()).toBe(200)
      expect(record(claim.payload), why('a Customer statement is not bank confirmation')).toMatchObject({
        job_id: jobId, status: 'payment_pending', payment_status: 'manual_customer_claimed', settlement_state: 'customer_claimed',
      })
      const claimReplay = await command(`/jobs/${jobId}/payment-order/claim`, owner, transfer)
      expect(claimReplay.status, why()).toBe(200)
      expect(record(claimReplay.payload).transfer_claimed_at, why()).toBe(record(claim.payload).transfer_claimed_at)
      const pending = await read(`/jobs/${jobId}`, owner)
      expect(record(record(pending.payload).job), why()).toMatchObject({ status: 'payment_pending', payment_status: 'manual_customer_claimed' })
      const resource = `/admin/payment-reconciliations/${orderId}`
      expect((await read(resource, owner)).status, why()).toBe(403)
      const detail = await read(resource, admin)
      expect(detail.status, why()).toBe(200)
      const version = record(record(detail.payload).reconciliation).version
      const assignment = { client_request_id: randomUUID(), expected_version: version }
      expect((await command(`${resource}/claim`, owner, assignment)).status, why()).toBe(403)
      const assigned = await command(`${resource}/claim`, admin, assignment)
      expect(assigned.status, why()).toBe(200)
      expect(record(assigned.payload).assigned_to, why()).toBe(admin.id)
      let currentVersion = record(assigned.payload).version
      const decision = { decision: 'confirm', amount_received: 350000, credited_at: new Date().toISOString(),
        bank_reference: `QA-${randomUUID()}`, client_request_id: randomUUID(), expected_version: currentVersion }
      const stale = await command(`${resource}/decision`, admin, { ...decision, expected_version: version })
      expect(stale.status, why('a stale Admin screen must not mutate financial state')).toBe(409)
      if (mismatchFirst) {
        const mismatch = await command(`${resource}/decision`, admin, { ...decision, amount_received: 349999 })
        expect(mismatch.status, why()).toBe(200)
        expect(record(mismatch.payload), why('amount mismatch cannot become paid')).toMatchObject({ outcome: 'reconcile_required', status: 'payment_pending', payment_status: 'manual_reconcile_required' })
        currentVersion = record(mismatch.payload).version
      }
      const correct = { ...decision, expected_version: currentVersion, client_request_id: randomUUID(), bank_reference: `QA-${randomUUID()}` }
      const confirmed = await command(`${resource}/decision`, admin, correct)
      Object.assign(journey, { adminDecisionStatus: confirmed.status, adminDecisionCode: record(confirmed.payload).code ?? null })
      expect(confirmed.status, why()).toBe(200)
      expect(record(confirmed.payload), why()).toMatchObject({ outcome: 'paid', status: 'paid', payment_status: 'manual_verified', job_id: jobId })
      const replayed = await command(`${resource}/decision`, admin, correct)
      expect(replayed.status, why()).toBe(200)
      expect(replayed.payload, why('same receipt survives response loss without another effect')).toEqual(confirmed.payload)
      for (const actor of [owner, worker]) {
        const reopened = await read(`/jobs/${jobId}`, actor)
        expect(reopened.status, why()).toBe(200)
        const job = record(record(reopened.payload).job)
        expect(job, why()).toMatchObject({ status: 'paid', final_price: 350000, payment_status: 'manual_verified',
          gross_amount: 350000, platform_fee: 52500, worker_net: 297500, payment_amount_received: 350000 })
        expect(record(job.payment_receipt), why()).toMatchObject({ method: 'platform_bank_manual', status: 'manual_verified', gross_amount: 350000 })
        if (actor.id === worker.id) expect(job, why('Worker does not receive platform bank instructions')).toMatchObject({ payment_code: null, payment_qr_image_url: null })
      }
      const events = await request(`/rest/v1/job_events?job_id=eq.${jobId}&event_type=eq.payment_confirmed&select=id`)
      expect(events.payload, why('decision replay must not duplicate the financial event')).toHaveLength(1)
      const review = await command(`/jobs/${jobId}/review`, owner, { rating: 5 })
      expect(review.status, why('review becomes reachable only after the verified local fixture settlement')).toBe(201)
      const reviewReplay = await command(`/jobs/${jobId}/review`, owner, { rating: 5 })
      expect(reviewReplay.status, why()).toBe(201)
      expect(record(reviewReplay.payload).review_id, why()).toBe(record(review.payload).review_id)
      const logs = await request(`/rest/v1/api_logs?job_id=eq.${jobId}&select=id`)
      expect(logs.payload, why('no paid inference in this fixture journey')).toEqual([])
    }, 120_000)
  }
})

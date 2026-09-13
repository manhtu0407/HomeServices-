import { describe, expect, it } from 'vitest'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import './kael-review.test'

export const PILLAR = {
  id: 'P82-review-submission-runtime',
  invariant:
    'the review service rejects unpaid jobs, wrong actors and cross-Customer access before the atomic write, and recovers an existing review after a lost response',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (paid-only review)'],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/completion-review.ts',
  layer: 'security-negative',
  siblings: ['P19-job-access-ownership', 'P68-completion-payment-authority'],
  mutation: 'remove the review service ownership or paid-state gate; the actor and unpaid cases reach the atomic write and fail',
} as const satisfies PillarManifest

describe('review public service authority', () => {
  installEdgeRuntimeTestHooks()

  it.each(['completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'cancelled'])(
    'refuses review from %s without issuing the review RPC', async (status) => {
      const client = makeSequenceClient([{ data: {
        id: 'job-1', status, customer_id: 'customer-1', worker_id: 'worker-1',
      }, error: null }])
      const ctx: MobileApiContext = {
        success: true, user: { id: 'customer-1' }, role: 'customer', supabase: client,
      }
      await expect(createEdgeServices({}).submitReview(ctx, 'job-1', { rating: 5, tags: [] }))
        .rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })
      expect(client.calls.some((call) => call.table === 'rpc:submit_review_atomic'), pillarWhy(PILLAR)).toBe(false)
    },
  )

  it.each([
    ['worker', 'worker-1', 'AUTH_FORBIDDEN', 403],
    ['customer', 'different-customer', 'NOT_FOUND', 404],
  ] as const)('refuses %s %s even when the job is paid', async (role, actorId, code, status) => {
    const client = makeSequenceClient([{ data: {
      id: 'job-1', status: 'paid', customer_id: 'customer-1', worker_id: 'worker-1',
    }, error: null }])
    const ctx: MobileApiContext = {
      success: true, user: { id: actorId }, role, supabase: client,
    }
    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', { rating: 5, tags: [] }))
      .rejects.toMatchObject({ code, status })
    expect(client.calls.some((call) => call.table === 'rpc:submit_review_atomic'), pillarWhy(PILLAR)).toBe(false)
  })
})

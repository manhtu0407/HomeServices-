import { describe, expect, it, vi } from 'vitest'
import { observeFinalPrice } from '@/lib/learning/market-memory'
import { observeReview } from '@/lib/learning/case-review'
import type { LearningHookInput } from '@/lib/learning/types'

function input(overrides: Partial<LearningHookInput> = {}): LearningHookInput {
  return {
    jobId: '10000000-0000-4000-8000-000000000001',
    serviceType: 'plumbing',
    problemSlug: 'pipe_leak',
    districtCode: 'q1',
    complexityHint: 'small',
    baselineMin: 200_000,
    baselineMax: 400_000,
    finalPrice: 500_000,
    rating: 4,
    reviewTags: ['Đúng giờ'],
    scopeChangeRequested: false,
    reviewedAt: '2026-07-14T02:00:00.000Z',
    ...overrides,
  }
}

function rpcResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [{
      ok: true,
      error_code: null,
      candidate_id: '20000000-0000-4000-8000-000000000001',
      is_new: true,
      confidence: 0,
      evidence_count: 1,
      status: 'created',
      idempotent: false,
      ...overrides,
    }],
    error: null,
  }
}

describe('atomic learning observation boundary', () => {
  it('records a price observation through the service-role RPC', async () => {
    const rpc = vi.fn().mockResolvedValue(rpcResult())

    const result = await observeFinalPrice({ rpc } as never, input())

    expect(rpc).toHaveBeenCalledWith('record_learning_observation_atomic', {
      p_affected_district: 'q1',
      p_affected_problem: 'pipe_leak',
      p_affected_service: 'plumbing',
      p_baseline_max: 400_000,
      p_baseline_min: 200_000,
      p_candidate_type: 'price_prior_update',
      p_complexity: 'small',
      p_final_price: 500_000,
      p_job_id: '10000000-0000-4000-8000-000000000001',
      p_rating: 4,
      p_review_tags: ['Đúng giờ'],
      p_reviewed_at: '2026-07-14T02:00:00.000Z',
      p_scope_change_requested: false,
      // Absent on jobs quoted before the reference columns existed; the RPC only
      // enforces its reference pin when a value is supplied.
      p_reference_min: null,
      p_reference_max: null,
    })
    expect(result).toEqual({
      ok: true,
      candidateId: '20000000-0000-4000-8000-000000000001',
      isNew: true,
      confidence: 0,
      evidenceCount: 1,
    })
  })

  it('returns the durable count unchanged when the RPC reports a retry', async () => {
    const rpc = vi.fn().mockResolvedValue(rpcResult({
      is_new: false,
      evidence_count: 3,
      confidence: 0.72,
      idempotent: true,
    }))

    const result = await observeReview({ rpc } as never, input({ scopeChangeRequested: true }))

    expect(result).toEqual({
      ok: true,
      candidateId: '20000000-0000-4000-8000-000000000001',
      isNew: false,
      confidence: 0.72,
      evidenceCount: 3,
    })
  })

  it('keeps only unique canonical review tags at the learning boundary', async () => {
    const rpc = vi.fn().mockResolvedValue(rpcResult())

    await observeReview({ rpc } as never, input({
      reviewTags: [
        'phone:0900000000',
        'Giá hợp lý',
        'Đúng giờ',
        'Giá hợp lý',
        'free-form note',
      ],
      scopeChangeRequested: true,
    }))

    expect(rpc).toHaveBeenCalledWith(
      'record_learning_observation_atomic',
      expect.objectContaining({ p_review_tags: ['Đúng giờ', 'Giá hợp lý'] }),
    )
  })

  it('preserves the case-review no-signal result from the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        ok: false,
        error_code: 'NO_SIGNAL_YET',
        candidate_id: null,
        is_new: false,
        confidence: 0,
        evidence_count: 0,
        status: null,
        idempotent: false,
      }],
      error: null,
    })

    await expect(observeReview({ rpc } as never, input())).resolves.toEqual({
      ok: false,
      reason: 'no_signal_yet',
    })
  })

  it('does not call the RPC for an unusable price observation', async () => {
    const rpc = vi.fn()

    await expect(observeFinalPrice({ rpc } as never, input({ finalPrice: null }))).resolves.toEqual({
      ok: false,
      reason: 'no_final_price',
    })
    await expect(observeFinalPrice({ rpc } as never, input({ scopeChangeRequested: true }))).resolves.toEqual({
      ok: false,
      reason: 'scope_changed',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'] as const)(
    'passes the supported %s service through the typed RPC contract',
    async (serviceType) => {
      const rpc = vi.fn().mockResolvedValue(rpcResult())

      await observeReview({ rpc } as never, input({ serviceType, scopeChangeRequested: true }))

      expect(rpc).toHaveBeenCalledWith(
        'record_learning_observation_atomic',
        expect.objectContaining({ p_affected_service: serviceType }),
      )
    },
  )
})

import { describe, expect, it } from 'vitest'
import { buildWorkerPerformanceInsights } from '../../../../../supabase/functions/mobile-api/_shared/services'

describe('worker performance insights aggregation', () => {
  it('derives reputation metrics from real broadcasts, jobs, reviews, and earnings rows', () => {
    const insights = buildWorkerPerformanceInsights({
      broadcasts: [
        {
          broadcast_at: '2026-06-01T09:00:00.000Z',
          responded_at: '2026-06-01T09:06:00.000Z',
          sent_at: '2026-06-01T09:00:00.000Z',
          status: 'accepted',
        },
        {
          broadcast_at: '2026-06-02T09:00:00.000Z',
          responded_at: '2026-06-02T09:14:00.000Z',
          sent_at: '2026-06-02T09:00:00.000Z',
          status: 'declined',
        },
        {
          broadcast_at: '2026-06-03T09:00:00.000Z',
          responded_at: '2026-06-03T10:00:00.000Z',
          sent_at: '2026-06-03T09:00:00.000Z',
          status: 'expired',
        },
      ],
      jobs: [
        {
          arrived_at: '2026-06-04T09:55:00.000Z',
          completed_at: '2026-06-04T11:00:00.000Z',
          final_price: 600_000,
          paid_at: '2026-06-04T12:00:00.000Z',
          reviewed_at: '2026-06-04T13:00:00.000Z',
          scheduled_at: '2026-06-04T10:00:00.000Z',
          status: 'reviewed',
        },
        {
          arrived_at: '2026-06-05T10:20:00.000Z',
          completed_at: '2026-06-05T12:00:00.000Z',
          final_price: 400_000,
          paid_at: '2026-06-05T13:00:00.000Z',
          reviewed_at: null,
          scheduled_at: '2026-06-05T10:00:00.000Z',
          status: 'paid',
        },
        {
          arrived_at: null,
          completed_at: null,
          final_price: null,
          paid_at: null,
          reviewed_at: null,
          scheduled_at: null,
          status: 'cancelled',
        },
      ],
      reviews: [
        { rating: 5, tags: ['Chuyên nghiệp', 'Giải thích rõ ràng'] },
        { rating: 4, tags: [] },
      ],
      incidentCases: [],
      workerId: '33333333-3333-4333-8333-333333333333',
      workerProfile: {
        is_approved: true,
        is_available: true,
        is_suspended: false,
        rating: 4.7,
        total_jobs: 2,
        verification_status: 'approved',
      },
    })

    expect(insights).toMatchObject({
      worker_id: '33333333-3333-4333-8333-333333333333',
      completed_job_count: 2,
      review_count: 2,
      average_rating: 4.5,
      total_broadcast_count: 3,
      responded_broadcast_count: 2,
      accepted_broadcast_count: 1,
      response_rate_percent: 67,
      average_response_minutes: 10,
      scheduled_arrival_job_count: 2,
      on_time_job_count: 1,
      on_time_rate_percent: 50,
      paid_job_count: 2,
      reconciled_earnings_vnd: 1_000_000,
    })
    expect(insights.performance_score).toBeGreaterThan(0)
    expect(insights.badges.map((badge) => badge.id)).toContain('verified_profile')
    expect(insights.performance_axes.find((axis) => axis.id === 'response')?.score).toBe(67)
    expect(insights.work_response_review_count).toBe(2)
    expect(insights.performance_axes.find((axis) => axis.id === 'work_response')?.score).toBe(82)
    expect(insights.performance_axes.find((axis) => axis.id === 'incident_handling')?.score).toBeNull()
  })

  it('keeps empty workers pending instead of fabricating performance signals', () => {
    const insights = buildWorkerPerformanceInsights({
      broadcasts: [],
      incidentCases: [],
      jobs: [],
      reviews: [],
      workerId: '33333333-3333-4333-8333-333333333333',
      workerProfile: null,
    })

    expect(insights).toMatchObject({
      average_rating: null,
      response_rate_percent: null,
      average_response_minutes: null,
      on_time_rate_percent: null,
      performance_score: null,
      reconciled_earnings_vnd: null,
      total_broadcast_count: 0,
      completed_job_count: 0,
      review_count: 0,
    })
    expect(insights.badges.every((badge) => badge.status === 'locked')).toBe(true)
    expect(insights.performance_axes.every((axis) => axis.score === null)).toBe(true)
  })

  it('scores scarce incidents by closed Kael-reviewed cases instead of averaging them into routine performance', () => {
    const insights = buildWorkerPerformanceInsights({
      broadcasts: [],
      incidentCases: [
        { kael_review: { verdict: 'documented' }, status: 'approved_by_customer' },
        { kael_review: { verdict: 'documented' }, status: 'rejected_by_customer' },
        { kael_review: null, status: 'approved_by_customer' },
        { kael_review: { verdict: 'pending' }, status: 'waiting_customer_decision' },
      ],
      jobs: [],
      reviews: [],
      workerId: '33333333-3333-4333-8333-333333333333',
      workerProfile: null,
    })

    expect(insights.resolved_incident_case_count).toBe(2)
    expect(insights.incident_rank_bonus).toBe(10)
    expect(insights.performance_score).toBeNull()
    expect(insights.performance_axes.find((axis) => axis.id === 'incident_handling')?.score).toBe(50)
    expect(insights.performance_axes.find((axis) => axis.id === 'work_response')?.score).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { buildCustomerProfileInsights } from '../../../../../supabase/functions/mobile-api/_shared/domains'

describe('customer profile insights aggregation', () => {
  it('counts distinct days with completed service activity', () => {
    const insights = buildCustomerProfileInsights({
      accountProfile: { created_at: '2026-07-01T00:00:00.000Z' },
      customerId: '11111111-1111-4111-8111-111111111111',
      customerProfile: null,
      disputes: [],
      kaelInteractionCount: 0,
      jobs: [
        {
          id: 'job-1',
          status: 'paid',
          service_type: 'electrical',
          created_at: '2026-07-02T01:00:00.000Z',
          completed_at: '2026-07-02T02:00:00.000Z',
          final_price: 500_000,
          kael_price_min: 450_000,
          kael_price_max: 550_000,
          paid_at: '2026-07-02T03:00:00.000Z',
          reviewed_at: null,
        },
        {
          id: 'job-2',
          status: 'reviewed',
          service_type: 'cleaning',
          created_at: '2026-07-02T04:00:00.000Z',
          completed_at: '2026-07-02T05:00:00.000Z',
          final_price: 600_000,
          kael_price_min: 550_000,
          kael_price_max: 650_000,
          paid_at: '2026-07-02T06:00:00.000Z',
          reviewed_at: '2026-07-02T07:00:00.000Z',
        },
        {
          id: 'job-3',
          status: 'completed',
          service_type: 'plumbing',
          created_at: '2026-07-05T01:00:00.000Z',
          completed_at: '2026-07-05T02:00:00.000Z',
          final_price: null,
          kael_price_min: null,
          kael_price_max: null,
          paid_at: null,
          reviewed_at: null,
        },
      ],
      reviews: [],
      savedAddressCount: 0,
    })

    expect(insights.active_service_days).toBe(2)
  })

  it('derives profile metrics from real job, dispute, and Kael session rows', () => {
    const insights = buildCustomerProfileInsights({
      accountProfile: { created_at: '2025-12-15T00:00:00.000Z' },
      customerId: '11111111-1111-4111-8111-111111111111',
      customerProfile: {
        building_name: null,
        created_at: '2026-01-02T00:00:00.000Z',
        default_address: null,
        district: null,
        floor: null,
        unit_number: null,
      },
      disputes: [
        { job_id: 'job-3', status: 'admin_review' },
      ],
      kaelInteractionCount: 4,
      jobs: [
        {
          id: 'job-1',
          status: 'paid',
          service_type: 'electrical',
          created_at: '2026-02-01T00:00:00.000Z',
          completed_at: '2026-02-01T02:00:00.000Z',
          final_price: 900_000,
          kael_price_min: 700_000,
          kael_price_max: 1_000_000,
          paid_at: '2026-02-01T03:00:00.000Z',
          reviewed_at: null,
        },
        {
          id: 'job-2',
          status: 'reviewed',
          service_type: 'cleaning',
          created_at: '2026-03-01T00:00:00.000Z',
          completed_at: '2026-03-01T02:00:00.000Z',
          final_price: 700_000,
          kael_price_min: 600_000,
          kael_price_max: 800_000,
          paid_at: '2026-03-01T03:00:00.000Z',
          reviewed_at: '2026-03-02T00:00:00.000Z',
        },
        {
          id: 'job-3',
          status: 'payment_pending',
          service_type: 'plumbing',
          created_at: '2026-04-01T00:00:00.000Z',
          completed_at: '2026-04-01T02:00:00.000Z',
          final_price: 1_200_000,
          kael_price_min: 800_000,
          kael_price_max: 1_000_000,
          paid_at: null,
          reviewed_at: null,
        },
        {
          id: 'job-4',
          status: 'cancelled',
          service_type: 'plumbing',
          created_at: '2026-05-01T00:00:00.000Z',
          completed_at: null,
          final_price: null,
          kael_price_min: null,
          kael_price_max: null,
          paid_at: null,
          reviewed_at: null,
        },
      ],
      reviews: [
        { job_id: 'job-2', rating: 5 },
      ],
      savedAddressCount: 0,
    })

    expect(insights).toMatchObject({
      customer_id: '11111111-1111-4111-8111-111111111111',
      member_since: '2025-12-15T00:00:00.000Z',
      kael_interaction_count: 4,
      completed_service_count: 3,
      reviewed_service_count: 1,
      preferred_service_count: 3,
      price_savings_vnd: 200_000,
      fair_price_service_count: 2,
      protected_value_vnd: 1_600_000,
      protected_transaction_count: 2,
      total_transaction_count: 3,
      dispute_free_rate_percent: 67,
      money_protection_score: 44,
      fair_price_status: 'mixed',
    })
    expect(insights.usage_rank_points).toBeGreaterThan(0)
    expect(insights.usage_rank_level).toBeGreaterThanOrEqual(1)
  })

  it('emits real zero numeric metrics for empty accounts', () => {
    const insights = buildCustomerProfileInsights({
      customerId: '11111111-1111-4111-8111-111111111111',
      customerProfile: null,
      disputes: [],
      jobs: [],
      kaelInteractionCount: 0,
      reviews: [],
      savedAddressCount: 0,
    })

    expect(insights).toMatchObject({
      active_service_days: 0,
      active_streak_days: 0,
      kael_interaction_count: 0,
      completed_service_count: 0,
      saved_address_count: 0,
      preferred_service_count: 0,
      reviewed_service_count: 0,
      positive_review_rate_percent: 0,
      price_savings_vnd: 0,
      total_spend_vnd: 0,
      usage_rank_level: 0,
      usage_rank_points: 0,
      fair_price_service_count: 0,
      money_protection_score: 0,
      protected_value_vnd: 0,
      protected_transaction_count: 0,
      total_transaction_count: 0,
      dispute_free_rate_percent: 0,
      fair_price_status: null,
    })
  })

  it('counts a saved default_address as a real address even with the structured fields blank', () => {
    const insights = buildCustomerProfileInsights({
      customerId: '11111111-1111-4111-8111-111111111111',
      customerProfile: {
        building_name: null,
        created_at: null,
        default_address: 'Tòa A, Quận 7',
        district: null,
        floor: null,
        unit_number: null,
      },
      disputes: [],
      jobs: [],
      kaelInteractionCount: 0,
      reviews: [],
      savedAddressCount: 0,
    })

    expect(insights.saved_address_count).toBe(1)
  })
})

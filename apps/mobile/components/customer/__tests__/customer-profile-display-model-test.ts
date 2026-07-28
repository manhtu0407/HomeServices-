import type { CustomerProfileInsightsResponse } from '@/lib/api-types'

import {
  formatWorkerJobs,
  insightNumber,
  percentFromConfidenceLabel,
  protectedTransactionLabel,
} from '../profile/profile-display-model'

describe('customer profile display honesty', () => {
  it('keeps unavailable worker history distinct from a real zero count', () => {
    expect(formatWorkerJobs(null, 'vi')).toBe('Chưa có dữ liệu')
    expect(formatWorkerJobs(undefined, 'en')).toBe('Data pending')
    expect(formatWorkerJobs(0, 'vi')).toBe('0 đơn')
    expect(formatWorkerJobs(0, 'en')).toBe('0 jobs')
  })

  it('does not invent zero confidence when a label has no numeric signal', () => {
    expect(percentFromConfidenceLabel('pending')).toBeNull()
    expect(percentFromConfidenceLabel('')).toBeNull()
    expect(percentFromConfidenceLabel('0%')).toBe(0)
    expect(percentFromConfidenceLabel('84%')).toBe(84)
  })

  it('uses pending copy only for missing metrics and preserves a real zero', () => {
    expect(insightNumber(null, 'completed_service_count', 'Chưa có', 'vi')).toBe('Chưa có')
    const realZero: CustomerProfileInsightsResponse = {
      active_service_days: 0,
      active_streak_days: 0,
      completed_service_count: 0,
      customer_id: 'customer-1',
      dispute_free_rate_percent: 0,
      fair_price_service_count: 0,
      fair_price_status: null,
      kael_interaction_count: 0,
      member_since: null,
      money_protection_score: 0,
      positive_review_rate_percent: 0,
      preferred_service_count: 0,
      price_savings_vnd: 0,
      protected_transaction_count: 0,
      protected_value_vnd: 0,
      saved_address_count: 0,
      total_spend_vnd: 0,
      total_transaction_count: 0,
      usage_rank_level: 0,
      usage_rank_points: 0,
    }
    expect(insightNumber(realZero, 'completed_service_count', 'Chưa có', 'vi')).toBe('0')
    expect(protectedTransactionLabel(realZero, 'vi', 'Chưa có')).toBe('Chưa có')
    expect(protectedTransactionLabel({
      ...realZero,
      protected_transaction_count: 0,
      total_transaction_count: 3,
    }, 'vi', 'Chưa có')).toBe('0 / 3')
  })
})

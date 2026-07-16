import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: <T,>(promise: PromiseLike<T>) => promise,
  DbTimeoutError: class extends Error {},
}))

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import {
  getCustomerProfileInsights,
  getWorkerPerformanceInsights,
} from '../../../../../supabase/functions/mobile-api/_shared/services/profile-insights.service'
import { getWorkerEarnings } from '../../../../../supabase/functions/mobile-api/_shared/services/workers.service'
import { computeEarnings } from '@/lib/workers/earnings'

function rpcOnlyClient(row: Record<string, unknown>) {
  const rpc = vi.fn(() => Promise.resolve({ data: [row], error: null }))
  return {
    client: {
      from: vi.fn(() => {
        throw new Error('aggregate endpoints must not fetch capped row lists')
      }),
      rpc,
    },
    rpc,
  }
}

describe('exact aggregate RPC runtime wiring', () => {
  it('loads Next worker earnings through one database aggregate', async () => {
    const { client, rpc } = rpcOnlyClient({
      worker_id: 'worker-1',
      total_jobs_paid: 1_205,
      gross_earnings: 12_050_000,
      platform_fee_total: 1_205_000,
      net_earnings: 10_845_000,
      pending_payment_count: 17,
      pending_payment_amount: 170_000,
      daily_earnings: [{
        date: '2026-07-15',
        gross_earnings: 12_050_000,
        platform_fee_total: 1_205_000,
        net_earnings: 10_845_000,
        paid_job_count: 1_205,
      }],
      from_date: '2026-01-01T00:00:00.000Z',
      to_date: '2026-12-31T23:59:59.999Z',
    })

    await expect(computeEarnings(client as never, 'worker-1', {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T23:59:59.999Z',
    })).resolves.toMatchObject({
      totalJobsPaid: 1_205,
      grossEarnings: 12_050_000,
      netEarnings: 10_845_000,
      dailyEarnings: [{
        date: '2026-07-15',
        grossEarnings: 12_050_000,
        platformFeeTotal: 1_205_000,
        netEarnings: 10_845_000,
        paidJobCount: 1_205,
      }],
    })
    expect(rpc).toHaveBeenCalledWith('get_worker_earnings_summary', {
      p_from: '2026-01-01T00:00:00.000Z',
      p_platform_fee_rate: 0.1,
      p_to: '2026-12-31T23:59:59.999Z',
      p_worker_id: 'worker-1',
    })
  })

  it('loads Edge worker earnings through the same exact aggregate', async () => {
    const { client, rpc } = rpcOnlyClient({
      worker_id: 'worker-1',
      total_jobs_paid: 1_205,
      gross_earnings: 12_050_000,
      platform_fee_total: 1_205_000,
      net_earnings: 10_845_000,
      pending_payment_count: 17,
      pending_payment_amount: 170_000,
      daily_earnings: [{
        date: '2026-07-15',
        gross_earnings: 12_050_000,
        platform_fee_total: 1_205_000,
        net_earnings: 10_845_000,
        paid_job_count: 1_205,
      }],
      from_date: null,
      to_date: null,
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(getWorkerEarnings(ctx, {})).resolves.toMatchObject({
      total_jobs_paid: 1_205,
      gross_earnings: 12_050_000,
      net_earnings: 10_845_000,
      daily_earnings: [{
        date: '2026-07-15',
        gross_earnings: 12_050_000,
        platform_fee_total: 1_205_000,
        net_earnings: 10_845_000,
        paid_job_count: 1_205,
      }],
    })
    expect(rpc).toHaveBeenCalledWith('get_worker_earnings_summary', {
      p_from: null,
      p_platform_fee_rate: 0.1,
      p_to: null,
      p_worker_id: 'worker-1',
    })
  })

  it('loads customer profile totals without a 500-row ceiling', async () => {
    const { client, rpc } = rpcOnlyClient({
      active_service_days: 8,
      active_streak_days: 3,
      completed_service_count: 750,
      disputed_transaction_count: 5,
      fair_price_service_count: 700,
      has_primary_address: true,
      kael_interaction_count: 650,
      member_since: '2025-01-01T00:00:00.000Z',
      positive_review_rate_percent: 96,
      preferred_service_count: 6,
      price_savings_vnd: 5_000_000,
      protected_transaction_count: 700,
      protected_value_vnd: 700_000_000,
      reviewed_service_count: 620,
      total_spend_vnd: 750_000_000,
      total_transaction_count: 750,
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(getCustomerProfileInsights(ctx)).resolves.toMatchObject({
      customer_id: 'customer-1',
      active_service_days: 8,
      completed_service_count: 750,
      total_transaction_count: 750,
      protected_transaction_count: 700,
    })
    expect(rpc).toHaveBeenCalledWith('get_customer_profile_insights_aggregate', {
      p_customer_id: 'customer-1',
    })
  })

  it('loads worker performance totals without a 500-row ceiling', async () => {
    const { client, rpc } = rpcOnlyClient({
      accepted_broadcast_count: 700,
      average_response_minutes: 8,
      average_review_rating: 4.9,
      completed_job_count: 650,
      is_approved: true,
      is_available: true,
      is_suspended: false,
      on_time_job_count: 600,
      paid_job_count: 640,
      profile_exists: true,
      profile_rating: 4.9,
      profile_total_jobs: 650,
      reconciled_earnings_vnd: 640_000_000,
      resolved_incident_case_count: 4,
      responded_broadcast_count: 800,
      review_count: 620,
      scheduled_arrival_job_count: 625,
      total_broadcast_count: 1_200,
      verification_status: 'approved',
      work_response_review_count: 620,
      work_response_score: 94,
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(getWorkerPerformanceInsights(ctx)).resolves.toMatchObject({
      worker_id: 'worker-1',
      completed_job_count: 650,
      paid_job_count: 640,
      total_broadcast_count: 1_200,
      review_count: 620,
    })
    expect(rpc).toHaveBeenCalledWith('get_worker_performance_insights_aggregate', {
      p_worker_id: 'worker-1',
    })
  })
})

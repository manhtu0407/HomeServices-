import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { getAdminFinanceOverview } from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/finance'

export const PILLAR = {
  id: 'P48-admin-finance-overview-contract',
  invariant:
    'Admin Finance Overview accepts the canonical non-empty Production RPC fields without relabelling collected commission as accrued commission',
  authority: [
    'governance/RULES.md #8 (Production data is honest and never invented)',
    'supabase/migrations/20260813100000_admin_finance_overview_v1.sql',
    'user-approved Admin Overview dashboard implementation plan',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/finance.ts',
  layer: 'integration',
  siblings: ['P34-admin-finance-bank-reference', 'P45-admin-overview-dashboard'],
  mutation:
    'read series from row.metrics/from/to or read breakdown values from gmv/paid_job_count — the canonical non-empty Production fixture raises DB_ERROR',
} as const satisfies PillarManifest

function ownerContext(rpc: ReturnType<typeof vi.fn>) {
  return {
    role: 'admin',
    supabase: { rpc },
    user: { id: 'owner-1' },
  } as never
}

describe('Admin Finance Overview Production RPC contract', () => {
  it('serializes canonical non-empty series and breakdown rows without inventing service accrual', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        metrics: {
          gmv: 800_000,
          paid_job_count: 1,
          average_order_value: 800_000,
          commission_accrued: 120_000,
          commission_collected: 120_000,
          commission_receivable: 0,
          commission_retained: 120_000,
          platform_incoming: 0,
          payout_outflow: 0,
          net_cash_flow: 0,
          refund_outflow: 0,
          kael_ai_spend_usd: 0,
        },
        previous_period: {
          metrics: {
            gmv: 0,
            paid_job_count: 0,
            average_order_value: null,
            commission_accrued: 0,
            commission_collected: 0,
            commission_receivable: 0,
            commission_retained: 0,
            platform_incoming: 0,
            payout_outflow: 0,
            net_cash_flow: 0,
            refund_outflow: 0,
          },
        },
        current_worker_balances: { on_hold: 680_000, available: 0, payout_pending: 0 },
        bank_reconciliation: {
          opening_balance: null,
          closing_balance: null,
          expected_change: null,
          actual_change: null,
          unexplained_variance: null,
        },
        series: [{
          bucket_start: '2026-08-01T00:00:00.000Z',
          bucket_end: '2026-09-01T00:00:00.000Z',
          gmv_vnd: 800_000,
          commission_collected_vnd: 120_000,
          paid_jobs: 1,
          data_quality: 'available',
          unavailable_reason: null,
        }],
        payment_method_breakdown: [{
          payment_method: 'cash',
          gmv_vnd: 800_000,
          paid_jobs: 1,
          share_percent: 100,
          data_quality: 'available',
          unavailable_reason: null,
        }],
        service_breakdown: [{
          service_type: 'plumbing',
          gmv_vnd: 800_000,
          commission_collected_vnd: 120_000,
          paid_jobs: 1,
          data_quality: 'available',
          unavailable_reason: null,
        }],
        tax: { status: 'unconfigured', estimated_vnd: null, rules: [] },
        data_quality: { paid_financials: 'complete', bank_snapshots: 'missing', kael_spend: 'no_records' },
      },
      error: null,
    }))

    const result = await getAdminFinanceOverview(ownerContext(rpc), {
      anchor: '2026-08-25T06:00:00.000Z',
      range: 'month',
    })

    expect(result.trend, pillarWhy(PILLAR, 'series uses bucket_start/bucket_end and *_vnd fields')).toEqual([{
      bucket_start: '2026-08-01T00:00:00.000Z',
      bucket_end: '2026-09-01T00:00:00.000Z',
      gmv_vnd: 800_000,
      commission_collected_vnd: 120_000,
      paid_jobs: 1,
      data_quality: 'available',
      unavailable_reason: null,
    }])
    expect(result.payment_methods, pillarWhy(PILLAR, 'payment breakdown uses gmv_vnd and paid_jobs')).toEqual([{
      payment_method: 'cash',
      gmv_vnd: 800_000,
      paid_jobs: 1,
      share_percent: 100,
      data_quality: 'available',
      unavailable_reason: null,
    }])
    expect(result.services, pillarWhy(PILLAR, 'the RPC does not provide per-service accrued commission')).toEqual([{
      service_type: 'plumbing',
      gmv_vnd: 800_000,
      commission_accrued_vnd: null,
      paid_jobs: 1,
      data_quality: 'partial',
      unavailable_reason: 'SERVICE_COMMISSION_ACCRUAL_UNAVAILABLE',
    }])
  })
})

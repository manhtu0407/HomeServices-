import { describe, expect, it, vi } from 'vitest'

import {
  decideAdminPaymentReconciliation,
  getAdminFinanceSummary,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/finance'

function ownerContext(rpc: ReturnType<typeof vi.fn>) {
  return {
    role: 'admin',
    supabase: { rpc },
    user: { id: 'owner-1' },
  } as never
}

const financeSummaryRow = {
  actual_bank_change: null,
  closing_balance: null,
  commission_accrued: 67_500,
  commission_collected: 67_500,
  commission_receivable: 0,
  direct_payment_total: 0,
  expected_bank_change: null,
  opening_balance: null,
  payout_outflow: 0,
  payout_pending: 0,
  platform_incoming: 450_000,
  unexplained_variance: null,
  worker_available: 0,
  worker_hold: 382_500,
}

describe('admin finance authority', () => {
  it('keeps variance unknown when the server has no opening or closing snapshot', async () => {
    const rpc = vi.fn(async () => ({ data: financeSummaryRow, error: null }))

    await expect(getAdminFinanceSummary(ownerContext(rpc), {
      anchor: '2026-08-11T18:00:00.000Z',
      range: 'day',
    })).resolves.toMatchObject({
      actual_bank_change: null,
      expected_bank_change: null,
      from: '2026-08-11T17:00:00.000Z',
      to: '2026-08-12T17:00:00.000Z',
      unexplained_variance: null,
    })

    expect(rpc).toHaveBeenCalledWith('admin_finance_summary', {
      p_actor_id: 'owner-1',
      p_from: '2026-08-11T17:00:00.000Z',
      p_to: '2026-08-12T17:00:00.000Z',
    })
  })

  it('hashes a bank reference before it reaches the reconciliation RPC', async () => {
    const calls: Array<{ args: Record<string, unknown> | undefined; name: string }> = []
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      calls.push({ args, name })
      return {
      data: [{
        hold_until: '2026-08-12T10:00:00.000Z',
        job_id: 'job-1',
        ok: true,
        outcome: 'paid',
        payment_status: 'manual_verified',
        status: 'paid',
      }],
      error: null,
      }
    })

    await expect(decideAdminPaymentReconciliation(ownerContext(rpc), 'payment-order-1', {
      amount_received: 450_000,
      bank_reference: 'BANK-REF-123',
      credited_at: '2026-08-11T10:00:00.000Z',
      decision: 'confirm',
    })).resolves.toMatchObject({
      hold_until: '2026-08-12T10:00:00.000Z',
      outcome: 'paid',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('decide_manual_bank_payment_reconciliation')
    const request = calls[0]?.args
    if (!request) throw new Error('expected reconciliation RPC arguments')
    expect(request).toMatchObject({
      p_actor_id: 'owner-1',
      p_bank_reference_suffix: 'BANK-REF-123',
      p_decision: 'confirm',
      p_payment_order_id: 'payment-order-1',
    })
    expect(request.p_bank_reference_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(request.p_bank_reference_hash).not.toBe('BANK-REF-123')
  })
})

import { describe, expect, it, vi } from 'vitest'

import {
  approveAdminFinanceTaxPolicy,
  createAdminFinanceTaxPolicyDraft,
  decideAdminPaymentReconciliation,
  exportAdminFinanceCsv,
  getAdminFinanceOverview,
  getAdminFinanceSummary,
  listAdminFinanceTransactions,
  listAdminFinanceTaxPolicies,
  retireAdminFinanceTaxPolicy,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/finance'
import { requireAdminCapability } from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/control'

function ownerContext(rpc: ReturnType<typeof vi.fn>) {
  return {
    role: 'admin',
    supabase: { rpc },
    user: { id: 'owner-1' },
  } as never
}

function operatorContext(capabilities: string[]) {
  const result = { data: { capabilities, status: 'active' }, error: null }
  const query = {
    eq: () => query,
    maybeSingle: () => query,
    select: () => query,
    then: (onfulfilled: (value: typeof result) => unknown) => Promise.resolve(result).then(onfulfilled),
  }
  return {
    role: 'admin_operator',
    supabase: { from: () => query },
    user: { id: 'operator-1' },
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
  it('treats finance.read as the authenticated admin baseline without elevating write permissions', async () => {
    const context = operatorContext(['operations.read'])

    await expect(requireAdminCapability(context, 'finance.read')).resolves.toMatchObject({
      access_level: 'operator',
      capabilities: ['operations.read', 'finance.read'],
    })
    await expect(requireAdminCapability(context, 'finance.reconcile')).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      status: 403,
    })
  })

  it('preserves unavailable overview metrics as null instead of inventing zero', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        metrics: {
          gmv: 450_000,
          paid_job_count: 1,
          average_order_value: 450_000,
          commission_accrued: 67_500,
          commission_collected: 67_500,
          commission_receivable: 0,
          commission_retained: 67_500,
          platform_incoming: 450_000,
          payout_outflow: 0,
          net_cash_flow: 450_000,
          refund_outflow: 0,
          kael_ai_spend_usd: 0,
        },
        previous_period: {
          metrics: {
            gmv: 300_000,
            paid_job_count: 1,
            average_order_value: 300_000,
            commission_accrued: 45_000,
            commission_collected: 45_000,
            commission_receivable: 0,
            commission_retained: 45_000,
            platform_incoming: 300_000,
            payout_outflow: 0,
            net_cash_flow: 300_000,
            refund_outflow: 0,
          },
        },
        current_worker_balances: { on_hold: 382_500, available: 0, payout_pending: 0 },
        bank_reconciliation: {
          opening_balance: null,
          closing_balance: null,
          expected_change: null,
          actual_change: null,
          unexplained_variance: null,
        },
        series: [],
        payment_method_breakdown: [],
        service_breakdown: [],
        tax: { status: 'unconfigured', estimated_vnd: null, rules: [] },
        data_quality: { paid_financials: 'partial', bank_snapshots: 'missing', kael_spend: 'no_records' },
      },
      error: null,
    }))

    const result = await getAdminFinanceOverview(ownerContext(rpc), {
      anchor: '2026-08-11T18:00:00.000Z',
      range: 'day',
    })

    expect(result.metrics.kael_ai_cost_usd).toMatchObject({
      value: null,
      previous_value: null,
      change_value: null,
      change_percent: null,
      data_quality: 'unavailable',
      unavailable_reason: 'KAEL_COST_NOT_RECORDED',
    })
    expect(rpc).toHaveBeenCalledWith('admin_finance_overview', expect.objectContaining({
      p_actor_id: 'owner-1',
      p_from: '2026-08-11T17:00:00.000Z',
      p_to: '2026-08-12T17:00:00.000Z',
      p_bucket: 'hour',
    }))
  })

  it('returns cursor transactions without exposing RPC-provided PII fields', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        limit: 25,
        next_cursor: null,
        pii: 'masked',
        rows: [{
          job_id: 'job-1',
          display_code: 'NS-001',
          customer_ref: 'C-123',
          worker_ref: 'W-456',
          service_type: 'cleaning',
          payment_method: 'platform_bank_manual',
          status: 'paid',
          gross_amount_vnd: 450_000,
          platform_fee_vnd: 67_500,
          worker_net_vnd: 382_500,
          refund_amount_vnd: 0,
          commission_reversal_vnd: 0,
          worker_credit_vnd: 0,
          paid_at: '2026-08-11T10:00:00.000Z',
          customer_phone: '0901234567',
          worker_bank_account: '123456789',
        }],
      },
      error: null,
    }))

    const result = await listAdminFinanceTransactions(ownerContext(rpc), {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-13T00:00:00.000Z',
      limit: 25,
    })

    expect(result.transactions).toEqual([expect.objectContaining({
      display_code: 'NS-001',
      gross_amount_vnd: 450_000,
    })])
    expect(JSON.stringify(result)).not.toContain('0901234567')
    expect(JSON.stringify(result)).not.toContain('123456789')
  })

  it('returns a JSON CSV payload with a fixed PII-safe column allow-list', async () => {
    const rpc = vi.fn(async () => ({
      data: { rows: [{
        job_id: 'job-1',
        display_code: 'NS-001',
        customer_ref: 'C-123',
        worker_ref: 'W-456',
        service_type: 'cleaning',
        payment_method: 'platform_bank_manual',
        status: 'paid',
        gross_amount_vnd: 450_000,
        platform_fee_vnd: 67_500,
        worker_net_vnd: 382_500,
        refund_amount_vnd: 0,
        commission_reversal_vnd: 0,
        worker_credit_vnd: 0,
        paid_at: '2026-08-11T10:00:00.000Z',
        customer_name: 'Nguyen, Van A',
      }], row_count: 1, pii: 'masked' },
      error: null,
    }))

    const result = await exportAdminFinanceCsv(ownerContext(rpc), {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-13T00:00:00.000Z',
    })

    expect(result).toMatchObject({
      content_type: 'text/csv;charset=utf-8',
      encoding: 'utf-8',
      pii_masked: true,
      row_count: 1,
    })
    expect(result.csv).toContain('job_id,display_code,customer_ref,worker_ref,service_type,payment_method,status')
    expect(result.csv).not.toContain('Nguyen')
    expect(rpc).toHaveBeenCalledWith('admin_finance_export_rows', expect.objectContaining({
      p_actor_id: 'owner-1',
      p_limit: 50_001,
    }))
  })

  it('requires finance.tax.manage before creating a tax policy draft', async () => {
    const rpc = vi.fn(async (name: string) => name === 'admin_create_finance_tax_policy_draft'
      ? { data: [{
        id: 'policy-1',
        version: 1,
        name: 'VAT services',
        tax_type: 'vat',
        subject: 'platform',
        basis: 'commission_retained',
        rate_bps: 500,
        status: 'draft',
        effective_from: '2026-09-01',
        effective_to: null,
        source_reference: 'accountant-file-1',
        approved_at: null,
        approved_by: null,
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:00:00.000Z',
      }], error: null }
      : { data: null, error: null })

    await expect(createAdminFinanceTaxPolicyDraft(ownerContext(rpc), {
      name: 'VAT services',
      tax_type: 'vat',
      subject: 'platform',
      basis: 'commission_retained',
      rate_bps: 500,
      effective_from: '2026-09-01',
      source_reference: 'accountant-file-1',
    })).resolves.toMatchObject({ id: 'policy-1', status: 'draft' })

    expect(rpc).toHaveBeenCalledWith('admin_create_finance_tax_policy_draft', expect.objectContaining({
      p_actor_id: 'owner-1',
      p_policy: expect.objectContaining({ rate_bps: 500 }),
    }))
  })

  it('uses the approved tax lifecycle wrappers and reports only the effective policy id', async () => {
    const basePolicy = {
      id: 'policy-1', version: 1, name: 'VAT services', tax_type: 'vat', subject: 'platform',
      basis: 'commission_retained', rate_bps: 500, effective_from: '2026-09-01', effective_to: null,
      source_reference: 'accountant-file-1', approved_at: null, approved_by: null,
      created_at: '2026-08-13T00:00:00.000Z', updated_at: '2026-08-13T00:00:00.000Z',
    }
    const rpc = vi.fn(async (name: string) => {
      if (name === 'admin_finance_tax_policies') return { data: {
        active_policy_ids: ['policy-1', 'policy-2'],
        tax_policies: [
          { ...basePolicy, status: 'approved' },
          { ...basePolicy, id: 'policy-2', status: 'approved' },
        ],
      }, error: null }
      if (name === 'admin_approve_finance_tax_policy') return { data: [{ ...basePolicy, status: 'approved' }], error: null }
      if (name === 'admin_retire_finance_tax_policy') return { data: [{ ...basePolicy, status: 'retired' }], error: null }
      return { data: null, error: null }
    })

    await expect(listAdminFinanceTaxPolicies(ownerContext(rpc))).resolves.toMatchObject({ active_policy_ids: ['policy-1', 'policy-2'] })
    await expect(approveAdminFinanceTaxPolicy(ownerContext(rpc), 'policy-1', {
      accountant_approval_reference: 'approval-file-1',
    })).resolves.toMatchObject({ status: 'approved' })
    await expect(retireAdminFinanceTaxPolicy(ownerContext(rpc), 'policy-1', {
      reason: 'Replaced by a reviewed policy',
    })).resolves.toMatchObject({ status: 'retired' })

    expect(rpc).toHaveBeenCalledWith('admin_approve_finance_tax_policy', expect.objectContaining({
      p_accountant_approval_reference: 'approval-file-1',
      p_policy_id: 'policy-1',
    }))
    expect(rpc).toHaveBeenCalledWith('admin_retire_finance_tax_policy', expect.objectContaining({
      p_policy_id: 'policy-1',
      p_reason: 'Replaced by a reviewed policy',
    }))
  })

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

  // The bank-reference case moved to P34-admin-finance-bank-reference, which pins the
  // invariant instead of the RPC name: a hash that is not the value, a suffix bounded at
  // sixteen characters, trimming before hashing, null for absence, and a cash decision that
  // carries no bank field at all. This one pinned the pre-idempotent RPC name and used a
  // twelve-character reference, so it could never tell a bounded suffix from the whole value.
})

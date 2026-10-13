import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P366-admin-payment-reconciliation-read-http',
  invariant: 'Admin payment-reconciliation reads enforce the authenticated finance boundary, apply bounded queue filters, return only allowlisted fields, and fail closed on database errors',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #4', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/finance-reconciliation.ts',
  layer: 'security-negative',
  siblings: ['P34-admin-finance-bank-reference', 'P51-admin-finance-operations-contract'],
  mutation: 'remove the finance capability check, ignore a public queue filter, spread raw payment rows into the response, or return the database error text; the public HTTP assertions turn red',
} as const satisfies PillarManifest

const ADMIN_ID = 'd3660000-0000-4000-8000-000000000001'
const JOB_ID = 'd3660000-0000-4000-8000-000000000002'
const ORDER_ID = 'd3660000-0000-4000-8000-000000000003'
const REFUND_JOB_ID = 'd3660000-0000-4000-8000-000000000004'
const REFUND_ORDER_ID = 'd3660000-0000-4000-8000-000000000005'
const PRIVATE_SENTINEL = 'PRIVATE BANK AND CUSTOMER DATA'

const ORDER_ROW = {
  id: ORDER_ID,
  job_id: JOB_ID,
  payment_method: 'platform_bank_manual',
  status: 'manual_reconcile_required',
  gross_amount: 450_000,
  worker_id: 'worker-1',
  platform_fee: 45_000,
  worker_net: 405_000,
  amount_received: 450_000,
  customer_transfer_claimed_at: '2026-10-10T10:00:00.000Z',
  response_deadline: '2099-10-10T10:00:00.000Z',
  assigned_to: null,
  assigned_at: null,
  version: 2,
  created_at: '2026-10-10T09:00:00.000Z',
  updated_at: '2026-10-10T10:00:00.000Z',
  transfer_content: PRIVATE_SENTINEL,
  bank_reference: PRIVATE_SENTINEL,
  private_note: PRIVATE_SENTINEL,
}

function setup(input: {
  role?: 'admin' | 'admin_operator' | 'customer' | 'worker'
  operatorAccount?: { capabilities: string[]; status: string }
  tables?: Record<string, QueryResult[]>
} = {}) {
  const role = input.role ?? 'admin'
  const client = makeSequenceClient([], {}, {
    ...(role === 'admin_operator' ? {
      admin_operator_accounts: [{
        data: input.operatorAccount ?? { capabilities: ['finance.read'], status: 'active' },
        error: null,
      }],
    } : {}),
    ...input.tables,
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: ADMIN_ID },
      role,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  const send = (path: string) => handler(new Request(`https://edge.test${path}`))
  return { client, send }
}

function queueTables(jobStatus = 'payment_pending', jobId = JOB_ID, orderId = ORDER_ID, displayCode = 'NS-PAYMENT-01') {
  return {
    job_payment_orders: [{ data: [{ ...ORDER_ROW, id: orderId, job_id: jobId }], error: null }],
    jobs: [{ data: [{
      id: jobId,
      display_code: displayCode,
      service_type: 'plumbing',
      customer_id: PRIVATE_SENTINEL,
      status: jobStatus,
    }], error: null }],
  }
}

describe('Admin payment reconciliation read at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('returns an allowlisted queue for a payment-pending job through the finance capability route', async () => {
    const { client, send } = setup({ tables: queueTables() })
    const response = await send('/admin/payment-reconciliations?status=reconcile_required&payment_method=platform_bank_manual&assignment=unassigned&limit=10')
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      total_count: 1,
      total_amount_vnd: 450_000,
      has_more: false,
      payment_reconciliations: [{
        id: ORDER_ID,
        job_id: JOB_ID,
        display_code: 'NS-PAYMENT-01',
        payment_method: 'platform_bank_manual',
        status: 'manual_reconcile_required',
        gross_amount: 450_000,
        assigned_to: null,
        assigned_to_me: false,
      }],
    })
    expect(JSON.stringify(body)).not.toContain(PRIVATE_SENTINEL)
    const orderQuery = client.calls.find((call) => call.table === 'job_payment_orders')
    expect(orderQuery?.operations).toContainEqual(['in', 'status', ['manual_reconcile_required', 'direct_reconcile_required']])
    expect(orderQuery?.operations).toContainEqual(['eq', 'payment_method', 'platform_bank_manual'])
    expect(orderQuery?.operations).toContainEqual(['is', 'assigned_to', null])
    expect(orderQuery?.operations.find((operation) => operation[0] === 'select')?.[1]).not.toContain('bank_reference')
  })

  it('returns a reconciliation row linked to a refund-required job without changing either status', async () => {
    const { send } = setup({ tables: queueTables('refund_required', REFUND_JOB_ID, REFUND_ORDER_ID, 'NS-REFUND-01') })
    const response = await send('/admin/payment-reconciliations?status=reconcile_required&payment_method=platform_bank_manual&assignment=unassigned&limit=10')
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json()
    expect(body.payment_reconciliations).toEqual([expect.objectContaining({
      id: REFUND_ORDER_ID,
      job_id: REFUND_JOB_ID,
      display_code: 'NS-REFUND-01',
      status: 'manual_reconcile_required',
    })])
  })

  it('refuses a Customer before reading payment reconciliation data', async () => {
    const { client, send } = setup({ role: 'customer' })
    const response = await send('/admin/payment-reconciliations')
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table === 'job_payment_orders')).toEqual([])
  })

  it('denies an inactive Operator before reading payment reconciliation data', async () => {
    const { client, send } = setup({
      role: 'admin_operator',
      operatorAccount: { capabilities: ['finance.read'], status: 'suspended' },
    })
    const response = await send('/admin/payment-reconciliations')
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table === 'job_payment_orders')).toEqual([])
  })

  it('fails closed and redacts database errors from the queue response', async () => {
    const { send } = setup({
      tables: {
        job_payment_orders: [{ data: null, error: { code: '08006', message: PRIVATE_SENTINEL } }],
      },
    })
    const response = await send('/admin/payment-reconciliations')
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'DB_ERROR' })
    expect(JSON.stringify(body)).not.toContain(PRIVATE_SENTINEL)
  })
})

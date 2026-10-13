import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P368-admin-payment-reconciliation-decision-http',
  invariant: 'Admin payment-reconciliation decisions enforce the finance capability, pass a versioned command to the atomic RPC, and return only a validated decision receipt',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/finance-reconciliation.ts',
  layer: 'security-negative',
  siblings: ['P34-admin-finance-bank-reference', 'P51-admin-finance-operations-contract', 'P366-admin-payment-reconciliation-read-http'],
  mutation: 'bypass the finance.reconcile capability, drop the expected version or idempotency key, leak the bank reference, or accept an invalid decision receipt; the public HTTP assertions turn red',
} as const satisfies PillarManifest

const ADMIN_ID = 'd3680000-0000-4000-8000-000000000001'
const PAYMENT_ORDER_ID = 'd3680000-0000-4000-8000-000000000002'
const JOB_ID = 'd3680000-0000-4000-8000-000000000003'
const REQUEST_ID = 'd3680000-0000-4000-8000-000000000004'
const EVENT_ID = 'd3680000-0000-4000-8000-000000000005'
const BANK_REFERENCE = 'VCB-TRANSFER-99887766554433'
const CREDITED_AT = '2026-10-11T08:30:00.000Z'
const GENERATED_AT = '2026-10-11T08:31:00.000Z'

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    error_code: null,
    outcome: 'paid',
    job_id: JOB_ID,
    status: 'paid',
    payment_status: 'manual_verified',
    hold_until: '2026-10-18T08:31:00.000Z',
    event_id_out: EVENT_ID,
    version_out: 4,
    generated_at_out: GENERATED_AT,
    ...overrides,
  }
}

function decisionBody(overrides: Record<string, unknown> = {}) {
  return {
    decision: 'confirm',
    amount_received: 450_000,
    bank_reference: BANK_REFERENCE,
    credited_at: CREDITED_AT,
    expected_version: 3,
    client_request_id: REQUEST_ID,
    ...overrides,
  }
}

function setup(input: {
  role?: 'admin' | 'admin_operator' | 'customer' | 'worker'
  operatorAccount?: { capabilities: string[]; status: string }
  rpcResults?: QueryResult[]
} = {}) {
  const role = input.role ?? 'admin'
  const client = makeSequenceClient([], {
    admin_decide_payment_reconciliation_v2: input.rpcResults ?? [{ data: [receipt()], error: null }],
  }, role === 'admin_operator' ? {
    admin_operator_accounts: [{
      data: input.operatorAccount ?? { capabilities: ['finance.read'], status: 'active' },
      error: null,
    }],
  } : {})
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
  const send = (body: Record<string, unknown>) => handler(new Request(
    `https://edge.test/admin/payment-reconciliations/${PAYMENT_ORDER_ID}/decision`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  ))
  return { client, send }
}

describe('Admin payment reconciliation decision at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('confirms a payment-pending bank reconciliation through the versioned receipt and returns paid', async () => {
    const { client, send } = setup()
    const response = await send(decisionBody())

    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      payment_order_id: PAYMENT_ORDER_ID,
      outcome: 'paid',
      job_id: JOB_ID,
      status: 'paid',
      payment_status: 'manual_verified',
      event_id: EVENT_ID,
      version: 4,
      generated_at: GENERATED_AT,
    })
    const rpc = client.calls.find((call) => call.table === 'rpc:admin_decide_payment_reconciliation_v2')
    expect(rpc?.operations).toContainEqual(['rpc', 'admin_decide_payment_reconciliation_v2', expect.objectContaining({
      p_actor_id: ADMIN_ID,
      p_payment_order_id: PAYMENT_ORDER_ID,
      p_expected_version: 3,
      p_client_request_id: REQUEST_ID,
      p_decision: 'confirm',
      p_amount_received: 450_000,
      p_credited_at: CREDITED_AT,
      p_bank_reference_suffix: BANK_REFERENCE.slice(-16),
    })])
    const args = rpc?.operations[0]?.[2]
    expect(args).toMatchObject({ p_bank_reference_hash: expect.stringMatching(/^[0-9a-f]{64}$/u) })
    expect(JSON.stringify(args)).not.toContain(BANK_REFERENCE)
    expect(client.calls.filter((call) => !call.table.startsWith('rpc:'))).toEqual([])
  })

  it('keeps a payment-pending job pending when the atomic receipt requires reconciliation', async () => {
    const { client, send } = setup({ rpcResults: [{
      data: [receipt({
        outcome: 'reconcile_required',
        status: 'payment_pending',
        payment_status: 'manual_reconcile_required',
        hold_until: null,
        version_out: 5,
      })],
      error: null,
    }] })
    const response = await send(decisionBody({ decision: 'reconcile_required', reason: 'The bank amount needs a second review.' }))

    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({
      outcome: 'reconcile_required',
      status: 'payment_pending',
      payment_status: 'manual_reconcile_required',
      hold_until: null,
      version: 5,
    })
    expect(client.calls.filter((call) => call.table === 'rpc:admin_decide_payment_reconciliation_v2')).toHaveLength(1)
  })

  it('refuses a Customer before the reconciliation decision reaches the domain', async () => {
    const { client, send } = setup({ role: 'customer' })
    const response = await send(decisionBody())

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls).toEqual([])
  })

  it('denies an active Operator without finance reconciliation capability before the atomic RPC', async () => {
    const { client, send } = setup({
      role: 'admin_operator',
      operatorAccount: { capabilities: ['finance.read'], status: 'active' },
    })
    const response = await send(decisionBody())

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.some((call) => call.table === 'admin_operator_accounts')).toBe(true)
    expect(client.calls.some((call) => call.table === 'rpc:admin_decide_payment_reconciliation_v2')).toBe(false)
  })

  it('preserves the atomic version conflict without claiming the job was paid', async () => {
    const { client, send } = setup({ rpcResults: [{
      data: [{ ok: false, error_code: 'VERSION_CONFLICT', version_out: 4 }],
      error: null,
    }] })
    const response = await send(decisionBody())

    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CONFLICT' })
    expect(client.calls.filter((call) => call.table === 'rpc:admin_decide_payment_reconciliation_v2')).toHaveLength(1)
  })

  it('rejects a malformed atomic receipt instead of returning a false paid result', async () => {
    const { send } = setup({ rpcResults: [{ data: [receipt({ status: 'refund_required' })], error: null }] })
    const response = await send(decisionBody())

    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
  })
})

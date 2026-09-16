import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import * as sharedRfq from '../../../../../../packages/shared/src/contracts/rfq-price'
import * as edgeRfq from '../../../../../../supabase/functions/_shared/contracts/rfq-price'

export const PILLAR = {
  id: 'P178-rfq-price-public-contract',
  invariant: 'RFQ price commands bind the authenticated participant and immutable intent; unknown outcomes never become invented agreement',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7'],
  target: 'supabase/functions/mobile-api/_shared/domains/job/rfq-price.ts',
  layer: 'integration',
  siblings: ['P177-rfq-price-agreement-sql'],
  mutation: 'Accept any RPC payload as a price receipt; a mismatched proposal or Customer decision becomes false success',
} as const satisfies PillarManifest

const JOB = 'e1780000-0000-4000-8000-000000000001'
const CUSTOMER = 'e1780000-0000-4000-8000-000000000002'
const WORKER = 'e1780000-0000-4000-8000-000000000003'
const PROPOSAL = 'e1780000-0000-4000-8000-000000000004'
const input = { request_id: PROPOSAL, customer_total: 220000, scope_summary: 'Replace the inspected fitting including labor.' }
const receipt = { id: PROPOSAL, job_id: JOB, worker_id: WORKER, customer_id: CUSTOMER,
  quote_mode: 'rfq', scope_summary: input.scope_summary, customer_total: 220000, currency: 'VND',
  status: 'pending', created_at: '2026-09-13T00:00:00Z', decided_at: null }
const approved = { ...receipt, status: 'approved', decided_at: '2026-09-13T00:01:00Z' }

function setup(role: 'worker' | 'customer' | 'admin' = 'worker', data: unknown = receipt, error?: { code: string; message: string }) {
  const client = makeSequenceClient([], {
    propose_rfq_price_atomic: [{ data, error: error ?? null }],
    decide_rfq_price_atomic: [{ data, error: error ?? null }],
  }, {
    jobs: [{ data: { id: JOB, worker_id: WORKER, customer_id: CUSTOMER, status: 'inspecting', quote_mode: 'rfq' }, error: null }],
    job_rfq_price_proposals: [{ data, error: error ?? null }],
  })
  const handler = createMobileApiHandler({ authenticate: async () => ({ success: true, role,
    user: { id: role === 'worker' ? WORKER : CUSTOMER }, supabase: client, userSupabase: client, privilegedSupabase: client }),
    services: createEdgeServices({}) })
  return { client, run: (action = '', body: unknown = input, method = 'POST') => handler(
    new Request(`https://edge.test/jobs/${JOB}/rfq-price${action}`, { method, headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })) }
}

describe('RFQ exact price public contract', () => {
  installEdgeRuntimeTestHooks()
  it('keeps the mobile and deployed Edge validation contract behavior identical', () => {
    for (const [schema, cases] of [
      ['rfqPriceProposalInputSchema', [input, { ...input, customer_total: 0 }, { ...input, customer_total: 2147483648 }, { ...input, customer_id: CUSTOMER }]],
      ['rfqPriceDecisionInputSchema', [{ proposal_id: PROPOSAL, approve: true }, { proposal_id: PROPOSAL, approve: 'true' }]],
      ['rfqPriceProposalSchema', [receipt, approved, { ...receipt, status: 'approved' }, { ...approved, customer_total: 0 }]],
    ] as const) {
      for (const value of cases) {
        const left = sharedRfq[schema].safeParse(value), right = edgeRfq[schema].safeParse(value)
        expect(left.success).toBe(right.success)
        if (left.success && right.success) expect(left.data).toEqual(right.data)
      }
    }
  })
  it('proposes through the assigned Worker command and redacts internal metadata', async () => {
    const { client, run } = setup('worker', { ...receipt, synthetic_cohort_id: 'private', commission_level: 1 })
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toEqual(receipt)
    expect(client.calls.find(call => call.table === 'rpc:propose_rfq_price_atomic')?.operations).toEqual([
      ['rpc', 'propose_rfq_price_atomic', { p_job_id: JOB, p_worker_id: WORKER, p_request_id: PROPOSAL,
        p_customer_total: input.customer_total, p_scope_summary: input.scope_summary }]])
    expect(client.calls.some(call => call.operations.some(op => ['insert', 'update'].includes(String(op[0]))))).toBe(false)
  })
  it('approves only the exact immutable proposal with the authenticated Customer', async () => {
    const { client, run } = setup('customer', approved)
    const response = await run('/decide', { proposal_id: PROPOSAL, approve: true })
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toEqual(approved)
    expect(client.calls.find(call => call.table === 'rpc:decide_rfq_price_atomic')?.operations).toEqual([
      ['rpc', 'decide_rfq_price_atomic', { p_job_id: JOB, p_customer_id: CUSTOMER, p_proposal_id: PROPOSAL, p_approve: true }]])
  })
  it.each(['admin', 'customer'] as const)('rejects a proposal from %s before any command', async role => {
    const { run, client } = setup(role)
    expect((await run()).status).toBe(403)
    expect(client.calls.some(call => call.table === 'rpc:propose_rfq_price_atomic' || call.table === 'rpc:decide_rfq_price_atomic')).toBe(false)
  })
  it.each(['admin', 'worker'] as const)('rejects a decision from %s before any command', async role => {
    const { run, client } = setup(role)
    expect((await run('/decide', { proposal_id: PROPOSAL, approve: true })).status).toBe(403)
    expect(client.calls.some(call => call.table === 'rpc:propose_rfq_price_atomic' || call.table === 'rpc:decide_rfq_price_atomic')).toBe(false)
  })
  it.each([{}, { ...input, customer_total: 0 }, { ...input, customer_total: 2.5 },
    { ...input, customer_total: 2147483648 }, { ...input, worker_id: CUSTOMER }, { ...input, scope_summary: 'short' }])(
    'rejects malformed or authority-bearing proposal %j', async body => {
      const { run, client } = setup()
      expect((await run('', body)).status).toBe(400)
      expect(client.calls.some(call => call.table === 'rpc:propose_rfq_price_atomic' || call.table === 'rpc:decide_rfq_price_atomic')).toBe(false)
    })
  it.each([null, [], { ...receipt, id: JOB }, { ...receipt, job_id: PROPOSAL }, { ...receipt, worker_id: CUSTOMER },
    { ...receipt, customer_total: 1 }, { ...receipt, scope_summary: 'Other scope text' }, { ...receipt, quote_mode: 'kael_auto_quote' }])(
    'reconciles an invalid proposal receipt %j without claiming success', async data => {
      const { run } = setup('worker', data)
      const response = await run()
      expect(response.status, pillarWhy(PILLAR)).toBe(503)
      expect(await response.json()).toMatchObject({ code: 'RFQ_PRICE_OUTCOME_UNKNOWN', reconcile_required: true })
      expect(response.headers.get('x-support-code')).toBeTruthy()
    })
  it.each([receipt, { ...approved, status: 'rejected' }, { ...approved, customer_id: WORKER }, { ...approved, id: JOB }])(
    'does not treat a mismatched decision receipt as approval', async data => {
      const { run } = setup('customer', data)
      expect((await run('/decide', { proposal_id: PROPOSAL, approve: true })).status).toBe(503)
    })
  it('keeps transport failure unknown and excludes database details', async () => {
    const { run } = setup('worker', null, { code: 'DB_TIMEOUT', message: 'SECRET_DB_DETAILS' })
    const response = await run()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'RFQ_PRICE_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(JSON.stringify(body)).not.toContain('SECRET_DB_DETAILS')
  })
  it.each([['P0002', 'RFQ_PRICE_NOT_FOUND', 404], ['55000', 'RFQ_PRICE_STATE_CHANGED', 409],
    ['22023', 'RFQ_PRICE_DECISION_CONFLICT', 409]] as const)('maps known rejected commands safely (%s)', async (code, message, status) => {
      const { run } = setup('worker', null, { code, message })
      const response = await run()
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ code: message })
    })
  it('rehydrates the current participant-bound proposal without any mutation', async () => {
    const { run, client } = setup('customer', approved)
    const response = await run('', undefined, 'GET')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ job_id: JOB, quote_mode: 'rfq', proposal: approved })
    expect(client.calls.some(call => call.table === 'rpc:propose_rfq_price_atomic' || call.table === 'rpc:decide_rfq_price_atomic')).toBe(false)
  })
  it('rehydrates the current Worker participant-bound proposal without any mutation', async () => {
    const { run, client } = setup('worker', approved)
    const response = await run('', undefined, 'GET')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ job_id: JOB, quote_mode: 'rfq', proposal: approved })
    expect(client.calls.some(call => call.table === 'rpc:propose_rfq_price_atomic' || call.table === 'rpc:decide_rfq_price_atomic')).toBe(false)
  })
  it('denies an unbound Worker RFQ proposal without mutation', async () => {
    const { run, client } = setup('worker', { ...approved, worker_id: CUSTOMER })
    const response = await run('', undefined, 'GET')
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'RFQ_PRICE_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(client.calls.some(call => call.table === 'rpc:propose_rfq_price_atomic' || call.table === 'rpc:decide_rfq_price_atomic')).toBe(false)
  })
  it('returns an honest empty proposal before the Worker has sent one', async () => {
    const { run } = setup('customer', null)
    expect(await (await run('', undefined, 'GET')).json()).toEqual({ job_id: JOB, quote_mode: 'rfq', proposal: null })
  })
})

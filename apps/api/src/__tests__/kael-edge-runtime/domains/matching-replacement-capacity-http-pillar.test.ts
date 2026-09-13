import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P91-matching-replacement-capacity-http',
  invariant: 'Expired initial or replacement capacity is a typed recoverable HTTP conflict with a safe support trace across priced accept, RFQ proposal and Customer selection',
  authority: ['governance/RULES.md #8', 'approved Production Agentic Transaction Readiness plan (capacity race and safe error support)'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
  layer: 'integration',
  siblings: ['P21-matching-guard-liveness', 'P84-worker-cancellation-matching-outbox'],
  mutation: 'remove the exact replacement-capacity SQL error mapping; all expected 409 cases return DB_ERROR500 and fail',
} as const satisfies PillarManifest

const JOB = 'f9100000-0000-4000-8000-000000000001'
const CUSTOMER = 'f9100000-0000-4000-8000-000000000002'
const WORKER = 'f9100000-0000-4000-8000-000000000003'
const CANDIDATE = 'f9100000-0000-4000-8000-000000000004'
const BROADCAST = 'f9100000-0000-4000-8000-000000000005'
const CAPACITY_CODES = ['MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE', 'MATCHING_CAPACITY_UNAVAILABLE'] as const

function setup(input: {
  mode: 'kael_auto_quote' | 'rfq' | 'inspection_only'
  role: 'customer' | 'worker'
  error: { code: string; message: string }
}) {
  const pricedAccept = input.role === 'worker' && input.mode === 'kael_auto_quote'
  const rpcName = input.role === 'worker' ? pricedAccept ? 'accept_priced_broadcast_durable_atomic' : 'submit_worker_matching_proposal_atomic'
    : input.mode === 'kael_auto_quote' ? 'confirm_worker_candidate_atomic' : 'confirm_worker_matching_proposal_atomic'
  const client = makeSequenceClient([], { [rpcName]: [{ data: null, error: input.error }] }, {
    jobs: [{ data: { id: JOB, status: 'worker_candidate_pending', customer_id: CUSTOMER, quote_mode: input.mode }, error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: input.role === 'customer' ? CUSTOMER : WORKER }, role: input.role,
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return { client, rpcName, run: () => handler(new Request(input.role === 'customer'
    ? `https://edge.test/jobs/${JOB}/candidates/${CANDIDATE}/confirm`
    : pricedAccept ? `https://edge.test/jobs/${JOB}/accept` : `https://edge.test/workers/me/broadcasts/${BROADCAST}/proposal`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input.role === 'customer' ? {} : pricedAccept ? { quote_id: BROADCAST } : {
      scope_summary: 'Khảo sát và kiểm tra phạm vi công việc đã mô tả.',
      ...(input.mode === 'rfq' ? { price_min: 200000, price_max: 300000 } : {}),
    }),
  })) }
}

describe.each(CAPACITY_CODES)('%s at the public HTTP boundary', (capacityCode) => {
  installEdgeRuntimeTestHooks()

  it.each([
    ['customer', 'kael_auto_quote'], ['customer', 'rfq'], ['customer', 'inspection_only'],
    ['worker', 'kael_auto_quote'], ['worker', 'rfq'], ['worker', 'inspection_only'],
  ] as const)('returns a traced conflict for %s / %s capacity expiry', async (role, mode) => {
    const { client, rpcName, run } = setup({ role, mode, error: { code: '55000', message: capacityCode } })
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    const body = await response.json()
    expect(body).toMatchObject({ code: capacityCode })
    expect(body).not.toHaveProperty('candidate')
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
    expect(client.calls.filter((call) => call.table === `rpc:${rpcName}`)).toHaveLength(1)
    expect(client.calls.some((call) => call.table === 'job_events' || call.table === 'rpc:insert_notification_atomic')).toBe(false)
  })

  it.each(['customer', 'worker'] as const)('does not disguise an unrelated database error as capacity expiry for %s', async (role) => {
    const { run } = setup({ role, mode: 'rfq', error: { code: '08006', message: 'private connection failure' } })
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(role === 'customer' ? 503 : 500)
    const body = await response.json()
    expect(body).toMatchObject(role === 'customer'
      ? { code: 'CANDIDATE_DECISION_OUTCOME_UNKNOWN', reconcile_required: true }
      : { code: 'DB_ERROR' })
    expect(body.code).not.toBe(capacityCode)
    expect(JSON.stringify(body)).not.toContain('private connection failure')
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })
})

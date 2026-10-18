import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P107-confirmation-preference-http',
  invariant: 'Customer confirmation records matching intent in its atomic command and presents a saved-worker choice without claiming delivery',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (Customer authority and durable confirmation)'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/confirm.service.ts',
  layer: 'integration',
  siblings: ['P48-durable-confirmation-operation', 'P108-confirmation-preference-sql'],
  mutation: 'Discard matching_mode or allow Admin confirmation; the RPC intent or actor-negative assertion fails',
} as const satisfies PillarManifest

const SESSION = 'd1070000-0000-4000-8000-000000000001'
const CUSTOMER = 'd1070000-0000-4000-8000-000000000002'
const JOB = 'd1070000-0000-4000-8000-000000000003'
const receipt = {
  ok: true, error_code: null, operation_id: 'd1070000-0000-4000-8000-000000000004',
  receipt_id: 'd1070000-0000-4000-8000-000000000005', job_id: JOB,
  job_status: 'awaiting_customer_confirm', quote_mode: 'rfq', operation_state: 'matching_queued',
  already_applied: false, accepted_at: '2026-09-05T16:20:00Z', updated_at: '2026-09-05T16:20:00Z',
  idempotency_key: `kael-confirm:${SESSION}:${CUSTOMER}`, support_code: 'P107TEST',
  terminal: false, retry_after_ms: null, trace_finalized: true,
}

function setup(role: 'customer' | 'worker' | 'admin' = 'customer', pending = true, confirmationReceipt = receipt, rpcError: { code: string; message: string } | null = null) {
  const client = makeSequenceClient([], {
    begin_harness_authorized_request: [{ data: true, error: null }],
    confirm_kael_chat_durable_atomic_v3: [{ data: rpcError ? null : [confirmationReceipt], error: rpcError }],
    confirm_kael_chat_durable_atomic_v4: [{ data: rpcError ? null : [confirmationReceipt], error: rpcError }],
    confirm_kael_chat_durable_authorized_v5: [{ data: rpcError ? null : [confirmationReceipt], error: rpcError }],
    confirm_kael_chat_durable_authorized_v6: [{ data: rpcError ? null : [confirmationReceipt], error: rpcError }],
  }, {
    job_matching_preferences: [{ data: { strategy: pending ? 'pending' : 'general', auto_general: false, fallback_at: null }, error: null }],
    job_broadcasts: [{ data: [], error: null }],
    job_events: [{ data: [], error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: CUSTOMER }, role,
      supabase: client, privilegedSupabase: client, userSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, run: (body: unknown = { confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved' }) =>
    handler(new Request(`https://edge.test/kael/chat/${SESSION}/confirm`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })) }
}

describe('Customer confirmation matching intent', () => {
  installEdgeRuntimeTestHooks()

  it.each([
    ['42501', 'CONFIRMATION_NOT_OWNED', 404, 'NOT_FOUND'],
    ['42501', 'permission denied for function private_confirmation', 500, 'DB_ERROR'],
    ['42501', 'CONFIRMATION_NOT_OWNED extra private detail', 500, 'DB_ERROR'],
    ['08006', 'private database connection details', 500, 'DB_ERROR'],
  ])('maps only the exact ownership failure %s/%s safely', async (code, message, status, safeCode) => {
    const { client, run } = setup('customer', false, receipt, { code, message })
    const response = await run({ confirmation_kind: 'rfq_request' })
    expect(response.status, pillarWhy(PILLAR)).toBe(status)
    const body = await response.json()
    expect(body).toMatchObject({ code: safeCode })
    expect(JSON.stringify(body)).not.toContain(message)
    if (status === 404) {
      const technicalFailures = client.calls.flatMap(call => call.operations).filter(operation =>
        operation[0] === 'rpc' && operation[1] === 'append_harness_event' &&
        (operation[2] as Record<string, unknown>).p_event_class === 'kael.confirm.rpc_failed')
      expect(technicalFailures.length, pillarWhy(PILLAR, 'permission denial is not a server outage')).toBe(0)
    }
  })

  it('persists prompt intent through one atomic command and returns the actual pending choice', async () => {
    const { client, run } = setup()
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(202)
    expect(await response.json()).toMatchObject({
      job_id: JOB, broadcast_sent: false, worker: null,
      matching_state: { strategy: 'pending_choice', stage: 'awaiting_choice' },
      operation: { state: 'matching_queued', job_id: JOB },
    })
    const commands = client.calls.filter((call) => call.table.includes('confirm_kael_chat'))
    expect(commands).toHaveLength(1)
    expect(commands[0]?.operations).toContainEqual(['rpc', 'confirm_kael_chat_durable_authorized_v6', expect.objectContaining({
      p_session_id: SESSION, p_customer_id: CUSTOMER, p_idempotency_key: `kael-confirm:${SESSION}:${CUSTOMER}`,
      p_confirmation_kind: 'rfq_request', p_price_reasoning_receipt_id: null, p_matching_mode: 'prompt_if_saved',
    })])
    expect(client.calls.flatMap((call) => call.operations).filter((op) =>
      ['insert', 'update', 'upsert'].includes(String(op[0])))).toEqual([])
    expect(client.calls.some((call) => /broadcast_atomic|claim_job_broadcast|create_job_matching/.test(call.table))).toBe(false)
  })

  it('passes an absent preference as null, without inventing fallback consent', async () => {
    const { client, run } = setup('customer', false)
    expect((await run({ confirmation_kind: 'rfq_request' })).status).toBe(202)
    expect(client.calls.find((call) => call.table.includes('confirm_kael_chat'))?.operations[0]?.[2])
      .toMatchObject({ p_matching_mode: null })
  })

  it('returns a recovery-required operation state from the confirmation HTTP receipt', async () => {
    const recoveryReceipt = { ...receipt, operation_state: 'recovery_required', already_applied: true }
    const { client, run } = setup('customer', true, recoveryReceipt)
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(202)
    expect(await response.json()).toMatchObject({
      job_id: JOB, broadcast_sent: false, worker: null,
      operation: { state: 'recovery_required', job_id: JOB, terminal: false },
    })
    expect(client.calls.filter((call) => call.table.includes('confirm_kael_chat'))).toHaveLength(1)
    expect(client.calls.some((call) => /broadcast_atomic|claim_job_broadcast|create_job_matching/.test(call.table))).toBe(false)
  })

  it.each(['worker', 'admin'] as const)('denies %s before privileged confirmation', async (role) => {
    const { client, run } = setup(role)
    expect((await run()).status).toBe(403)
    expect(client.calls.filter((call) => call.table.includes('confirm_kael_chat'))).toEqual([])
  })
})

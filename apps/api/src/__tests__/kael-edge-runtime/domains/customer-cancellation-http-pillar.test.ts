import { describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P116-customer-cancellation-http',
  invariant: 'Customer cancellation only acknowledges a validated atomic receipt; missing evidence requires reconciliation without invented cancellation or downstream effects',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'governance/structures/cancellation-recovery.md'],
  target: 'supabase/functions/mobile-api/_shared/domains/customer/cancellation.ts',
  layer: 'integration',
  siblings: ['P115-customer-job-command-isolation', 'P88-refund-obligations-runtime'],
  mutation: 'Default an absent RPC job_status to cancelled; the HTTP unknown-outcome assertion fails',
} as const satisfies PillarManifest

const JOB = 'c116abcd-0000-4000-8000-abcdef000001'
const CUSTOMER = 'c116abcd-0000-4000-8000-abcdef000002'
const CANCELLATION = 'c116abcd-0000-4000-8000-abcdef000003'
const TIME = '2026-09-06T10:00:00.000Z'
const receipt = {
  ok: true, error_code: null, cancellation_id: CANCELLATION, job_id_out: JOB,
  job_status: 'cancelled', sub_case: 'after_a7_before_worker_accept', reason_code: 'changed_mind',
  reason_category: 'no_penalty_phase_0', worker_id_out: null, admin_review_required: false,
  phase0_no_monetary_penalty: true, worker_goodwill: { required: false }, abuse_signals: [],
  created_at_ts: TIME,
}
const existingReceipt = {
  id: CANCELLATION, job_id: JOB, customer_id: CUSTOMER, status: 'requested',
  sub_case: receipt.sub_case, reason_code: receipt.reason_code, reason_category: receipt.reason_category,
  worker_id: null, admin_review_required: false, phase0_no_monetary_penalty: true,
  worker_goodwill: receipt.worker_goodwill, abuse_signals: [], created_at: TIME,
}

function setup(options: {
  result?: QueryResult; existing?: QueryResult; existingAfterConflict?: QueryResult;
  jobStatus?: string; role?: 'customer' | 'worker' | 'admin';
  workerId?: string;
  actorId?: string; ownerId?: string; route?: 'customer-cancellation' | 'cancel';
} = {}) {
  const actorId = options.actorId ?? CUSTOMER
  const client = makeSequenceClient([], {
    request_customer_cancellation_atomic: [options.result ?? { data: [receipt], error: null }],
    cancel_job_before_accept_atomic: [options.result ?? { data: [{
      ok: true, error_code: null, job_status: 'cancelled', cancelled_at_ts: TIME,
    }], error: null }],
  }, {
    jobs: [{ data: { id: JOB, customer_id: options.ownerId ?? actorId, worker_id: options.workerId ?? null,
      status: options.jobStatus ?? 'broadcasting' }, error: null }],
    customer_cancellation_records: [options.existing ?? { data: null, error: null },
      options.existingAfterConflict ?? { data: null, error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: actorId }, role: options.role ?? 'customer',
      supabase: client, privilegedSupabase: client, userSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, run: () => handler(new Request(`https://edge.test/jobs/${JOB}/${options.route ?? 'customer-cancellation'}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason_code: 'changed_mind' }),
  })) }
}

describe('Customer cancellation HTTP receipt integrity', () => {
  installEdgeRuntimeTestHooks()

  it('requires reconciliation when the atomic receipt omits the resulting job status', async () => {
    const { job_status: _, ...missingStatus } = receipt
    const { client, run } = setup({ result: { data: [missingStatus], error: null } })
    const response = await run()
    const body = await response.json()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(503)
    expect(body).toMatchObject({ code: 'CANCELLATION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(true)
    expect(client.calls.some(call => call.table === 'job_events')).toBe(false)
  })

  it('acknowledges the validated receipt for the authenticated Customer job', async () => {
    const { client, run } = setup()
    const response = await run()
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ cancellation_id: CANCELLATION, job_id: JOB,
      job_status: 'cancelled', created_at: TIME, phase0_no_monetary_penalty: true })
    expect(client.calls.find(call => call.table === 'rpc:request_customer_cancellation_atomic')?.operations)
      .toContainEqual(['rpc', 'request_customer_cancellation_atomic', {
        p_job_id: JOB, p_customer_id: CUSTOMER, p_reason_code: 'changed_mind', p_reason_note: null,
      }])
  })

  it.each(['after_worker_accept', 'scheduled_job'])('uses the committed Worker notice contract for %s', async subCase => {
    const workerId = 'c116abcd-0000-4000-8000-abcdef000004'
    const { client, run } = setup({ workerId, jobStatus: 'worker_matched',
      result: { data: [{ ...receipt, sub_case: subCase, worker_id_out: workerId }], error: null } })
    const response = await run()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(await response.clone().json()))).toBe(201)
    const notice = client.calls.find(call => call.table === 'rpc:insert_notification_atomic')
    expect(notice?.operations).toContainEqual(['rpc', 'insert_notification_atomic', {
      p_user_id: workerId, p_job_id: JOB, p_event_type: 'customer_cancelled_after_accept',
      p_title: 'Khách đã hủy yêu cầu',
      p_body: subCase === 'scheduled_job'
        ? 'Khách đã hủy lịch sắp tới. Bạn không cần tiếp tục công việc này.'
        : 'Khách đã hủy yêu cầu. Bạn không cần tiếp tục công việc này.',
      p_safe_metadata: { sub_case: subCase, phase0_no_monetary_penalty: true },
    }])
  })

  it.each([
    ['foreign job', { job_id_out: CANCELLATION }],
    ['missing identity', { cancellation_id: null }],
    ['malformed identity', { cancellation_id: 'not-a-uuid' }],
    ['unknown state', { job_status: 'unrecognized' }],
    ['different reason', { reason_code: 'other' }],
    ['unknown subcase', { sub_case: 'future' }],
    ['cancelled dispute', { sub_case: 'after_worker_completed_trigger_dispute' }],
    ['string success', { ok: 'true' }],
    ['unproven monetary safety', { phase0_no_monetary_penalty: false }],
    ['invalid timestamp', { created_at_ts: 'yesterday' }],
  ])('requires reconciliation for a %s receipt without emitting cancellation effects', async (_name, patch) => {
    const { client, run } = setup({ result: { data: [{ ...receipt, ...patch }], error: null } })
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'CANCELLATION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(client.calls.some(call => call.table === 'job_events')).toBe(false)
  })

  it.each([null, [], [receipt, receipt], { 0: receipt }])('does not acknowledge a non-single-row result %j', async data => {
    const { run } = setup({ result: { data, error: null } })
    expect((await run()).status).toBe(503)
  })

  it.each([
    { data: null, error: { code: '08006', message: 'private connection details' } },
    { reject: new Error('private connection details') },
  ])('keeps a transport failure outcome unknown and private', async result => {
    const { run } = setup({ result })
    const response = await run()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'CANCELLATION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(JSON.stringify(body)).not.toContain('private connection details')
  })

  it.each(['worker', 'admin'] as const)('denies %s before cancellation mutation', async role => {
    const { client, run } = setup({ role })
    expect((await run()).status).toBe(403)
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(false)
  })

  it('denies a different Customer before cancellation mutation', async () => {
    const { client, run } = setup({ ownerId: CANCELLATION })
    expect((await run()).status).toBe(404)
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(false)
  })

  it('preserves the autonomy flag denial before a policy cancellation mutation', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'false' } })
    const { client, run } = setup()
    const response = await run()
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'INVALID_STATUS', error: 'AUTONOMY_FULL_FLAG_OFF' })
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(false)
  })

  it('keeps completion facts when the RPC opens an after-completion dispute', async () => {
    const { run } = setup({ jobStatus: 'completed_by_worker', result: { data: [{ ...receipt,
      job_status: 'completed_by_worker', sub_case: 'after_worker_completed_trigger_dispute',
    }], error: null } })
    const response = await run()
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ job_status: 'completed_by_worker', admin_review_required: true })
  })

  it('does not confuse a numeric UUID reference with personal data', async () => {
    const { client, run } = setup({ actorId: 'c1160000-0000-4000-8000-000000000002' })
    const response = await run()
    expect(response.status).toBe(201)
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(true)
  })

  it('stops before mutation when the durable cancellation lookup is unavailable', async () => {
    const { client, run } = setup({ existing: { data: null, error: { code: '08006', message: 'private DB detail' } } })
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'CANCELLATION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(false)
  })

  it('recovers the same persisted request after restart without another cancellation RPC', async () => {
    const { client, run } = setup({ jobStatus: 'cancelled', existing: { data: existingReceipt, error: null } })
    const response = await run()
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ cancellation_id: CANCELLATION, job_id: JOB,
      job_status: 'cancelled', created_at: TIME })
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(false)
  })

  it.each([
    ['foreign job', { job_id: CANCELLATION }], ['foreign owner', { customer_id: CANCELLATION }],
    ['missing identity', { id: '' }], ['unknown subcase', { sub_case: 'unknown' }],
    ['invalid time', { created_at: null }],
  ])('does not acknowledge a persisted %s receipt', async (_name, patch) => {
    const { client, run } = setup({ existing: { data: { ...existingReceipt, ...patch }, error: null } })
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'CANCELLATION_OUTCOME_UNKNOWN' })
    expect(client.calls.some(call => call.table === 'rpc:request_customer_cancellation_atomic')).toBe(false)
    expect(client.calls.some(call => call.table === 'rpc:record_customer_cancellation_memory_atomic')).toBe(false)
  })

  it('acknowledges a valid direct pre-accept cancellation independently of the autonomy flag', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'false' } })
    const { run } = setup({ route: 'cancel' })
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ job_id: JOB, status: 'cancelled' })
  })

  it.each([
    [{ ok: true, error_code: null, job_status: 'broadcasting', cancelled_at_ts: TIME }],
    [{ ok: 'true', error_code: null, job_status: 'cancelled', cancelled_at_ts: TIME }],
    [{ ok: true, error_code: null, job_status: 'cancelled', cancelled_at_ts: null }],
    null,
  ])('requires reconciliation for a malformed direct cancellation receipt %j', async data => {
    const { client, run } = setup({ route: 'cancel', result: { data, error: null } })
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'CANCELLATION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(client.calls.some(call => call.table === 'job_events')).toBe(false)
  })

  it('recovers a previously cancelled direct request without another RPC or event', async () => {
    const { client, run } = setup({ route: 'cancel', jobStatus: 'cancelled' })
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ job_id: JOB, status: 'cancelled' })
    expect(client.calls.some(call => call.table === 'rpc:cancel_job_before_accept_atomic')).toBe(false)
    expect(client.calls.some(call => call.table === 'job_events')).toBe(false)
  })

  it('recovers a concurrent committed cancellation using the authoritative conflict status', async () => {
    const { client, run } = setup({ result: { data: [{ ok: false, error_code: 'ALREADY_REQUESTED',
      job_status: 'cancelled' }], error: null }, existingAfterConflict: { data: existingReceipt, error: null } })
    const response = await run()
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ cancellation_id: CANCELLATION, job_status: 'cancelled' })
    expect(client.calls.filter(call => call.table === 'rpc:request_customer_cancellation_atomic')).toHaveLength(1)
  })

  it('never replaces an unknown conflict status with a default workflow state', async () => {
    const { run } = setup({ result: { data: [{ ok: false, error_code: 'ALREADY_REQUESTED',
      job_status: 'not-a-state' }], error: null }, existingAfterConflict: { data: existingReceipt, error: null } })
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'CANCELLATION_OUTCOME_UNKNOWN' })
  })
})

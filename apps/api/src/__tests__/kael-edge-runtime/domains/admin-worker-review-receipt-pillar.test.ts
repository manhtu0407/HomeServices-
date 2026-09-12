import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P171-admin-worker-review-receipt',
  invariant: 'Admin Worker decisions acknowledge one queue-bound and decision-bound RPC receipt, never a fabricated identity or review timestamp',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #8', 'governance/structures/admin-workflow.md'],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/control-validation.ts',
  layer: 'security-negative',
  siblings: ['P53-admin-worker-controls', 'P164-worker-draft-receipt'],
  mutation: 'select the first RPC row without validating queue, decision or timestamp; malformed receipt cases return HTTP 200',
} as const satisfies PillarManifest

const ADMIN = 'd7400000-0000-4000-8000-000000000001'
const WORKER = 'd7400000-0000-4000-8000-000000000002'
const APPLICATION = 'd7400000-0000-4000-8000-000000000003'
const PROFILE_QUEUE = 'd7400000-0000-4000-8000-000000000004'
const FOREIGN = 'd7400000-0000-4000-8000-000000000005'
const AT = '2026-09-10T12:34:56.123456+00:00'
type ReviewStage = 'access' | 'profile'

installEdgeRuntimeTestHooks()

function receipt(stage: ReviewStage, overrides: Record<string, unknown> = {}) {
  return {
    ok: true, error_code: null, queue_id: stage === 'access' ? APPLICATION : PROFILE_QUEUE,
    worker_id: WORKER, decision: 'approve', decided_at: AT,
    ...(stage === 'access'
      ? { status_out: 'resolved', role_out: 'worker', verification_status_out: 'draft' }
      : { verification_status: 'approved' }),
    ...overrides,
  }
}

function reviewHttp(stage: ReviewStage, data: unknown, options: {
  role?: 'admin' | 'admin_operator' | 'customer' | 'worker'
  operator?: { status: string; capabilities: string[] }
  queueResults?: QueryResult[]
  error?: { code: string; message: string }
} = {}) {
  const rpc = stage === 'access' ? 'admin_review_worker_application_atomic' : 'admin_review_worker_profile_snapshot_atomic'
  const client = makeSequenceClient([], { [rpc]: [{ data, error: options.error ?? null }] }, {
    kael_admin_queue: options.queueResults ?? [
      { data: { actor_id: WORKER }, error: null },
      { data: { id: PROFILE_QUEUE }, error: null },
    ],
    admin_operator_accounts: [{ data: options.operator ?? { status: 'active', capabilities: [] }, error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: ADMIN, authProvider: 'email' }, role: options.role ?? 'admin',
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return { client, rpc, response: handler(new Request(
    `https://edge.test/admin/worker-applications/${APPLICATION}/${stage === 'access' ? 'decision' : 'profile-decision'}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve',
      ...(stage === 'profile' ? { profile_review_queue_id: PROFILE_QUEUE, expected_profile_updated_at: AT } : {}),
    }) },
  )) }
}

describe.each(['access', 'profile'] as const)('Admin Worker %s review receipt', (stage) => {
  it('acknowledges a complete receipt without copying private database fields', async () => {
    const { response, client, rpc } = reviewHttp(stage, [receipt(stage, { private_kyc: 'PRIVATE_KYC_SENTINEL' })])
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    const body = await result.json()
    expect(body).toMatchObject({ ok: true, application_id: APPLICATION, worker_id: WORKER, decision: 'approve', decided_at: AT })
    expect(JSON.stringify(body)).not.toContain('PRIVATE_KYC_SENTINEL')
    expect(client.calls.find(call => call.table === `rpc:${rpc}`)?.operations).toEqual([['rpc', rpc, {
      p_queue_id: stage === 'access' ? APPLICATION : PROFILE_QUEUE, p_admin_id: ADMIN, p_decision: 'approve', p_reason: null,
      ...(stage === 'profile' ? { p_application_id: APPLICATION, p_expected_profile_updated_at: AT } : {}),
    }]])
    expect(client.calls.filter(call => call.table === 'profiles' || call.table === 'worker_profiles')).toEqual([])
  })

  it.each([
    ['no receipt', () => []],
    ['null receipt', () => [null]],
    ['multiple receipts', (row: Record<string, unknown>) => [row, row]],
    ['array-like object', (row: Record<string, unknown>) => ({ 0: row, length: 1 })],
    ['missing queue', (row: Record<string, unknown>) => [{ ...row, queue_id: null }]],
    ['foreign queue', (row: Record<string, unknown>) => [{ ...row, queue_id: FOREIGN }]],
    ['missing worker', (row: Record<string, unknown>) => [{ ...row, worker_id: null }]],
    ['malformed worker', (row: Record<string, unknown>) => [{ ...row, worker_id: 'not-a-uuid' }]],
    ['contradictory decision', (row: Record<string, unknown>) => [{ ...row, decision: 'request_changes' }]],
    ['contradictory error', (row: Record<string, unknown>) => [{ ...row, error_code: 'ALREADY_REVIEWED' }]],
    ['string success flag', (row: Record<string, unknown>) => [{ ...row, ok: 'true' }]],
    ['missing timestamp', (row: Record<string, unknown>) => [{ ...row, decided_at: null }]],
    ['invalid timestamp', (row: Record<string, unknown>) => [{ ...row, decided_at: '2026-02-30T00:00:00Z' }]],
    ['invalid verification status', (row: Record<string, unknown>) => [{ ...row, [stage === 'access' ? 'verification_status_out' : 'verification_status']: 'ready-ish' }]],
  ] as const)('rejects %s without claiming a completed review', async (_name, mutate) => {
    const result = await reviewHttp(stage, mutate(receipt(stage))).response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
    expect(result.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it.each(['customer', 'worker'] as const)('rejects the %s role before any review RPC', async (role) => {
    const { response, client } = reviewHttp(stage, [receipt(stage)], { role })
    expect((await response).status).toBe(403)
    expect(client.calls).toEqual([])
  })

  it.each([
    { status: 'active', capabilities: ['workers.read'] },
    { status: 'revoked', capabilities: ['workers.review'] },
  ])('rejects an operator without active review authority %#', async (operator) => {
    const { response, client } = reviewHttp(stage, [receipt(stage)], { role: 'admin_operator', operator })
    expect((await response).status).toBe(403)
    expect(client.calls.some(call => call.table.startsWith('rpc:admin_review_worker_'))).toBe(false)
  })

  it('accepts an active operator with the review capability', async () => {
    const result = await reviewHttp(stage, [receipt(stage)], {
      role: 'admin_operator', operator: { status: 'active', capabilities: ['workers.review'] },
    }).response
    expect(result.status).toBe(200)
  })

  it('does not acknowledge a row when the database also reports failure', async () => {
    const result = await reviewHttp(stage, [receipt(stage)], { error: { code: '08006', message: 'PRIVATE_DB_SENTINEL' } }).response
    expect(result.status).toBe(500)
    expect(await result.text()).not.toContain('PRIVATE_DB_SENTINEL')
  })

  it('preserves an explicit already-reviewed refusal instead of fabricating success', async () => {
    const result = await reviewHttp(stage, [receipt(stage, {
      ok: false, error_code: 'ALREADY_REVIEWED', worker_id: null, decided_at: null,
    })]).response
    expect(result.status).toBe(409)
    expect(await result.json()).toMatchObject({ code: 'ALREADY_REVIEWED' })
    expect(result.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })
})

it('rejects a profile receipt for a Worker different from the selected application', async () => {
  const result = await reviewHttp('profile', [receipt('profile', { worker_id: FOREIGN })]).response
  expect(result.status, pillarWhy(PILLAR)).toBe(500)
  expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
})

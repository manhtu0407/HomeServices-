import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P167-worker-registration-command-http',
  invariant: 'the authenticated Worker can submit and reconcile an exact server draft command without exposing KYC fields or treating an absent receipt as failure',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #8', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/registration-command.ts',
  layer: 'security-negative',
  siblings: ['P166-worker-registration-command-sql', 'P164-worker-draft-receipt'],
  mutation: 'accept a receipt with another actor or request ID; the public endpoint falsely acknowledges a different submission',
} as const satisfies PillarManifest

const WORKER = 'd7700000-0000-4000-8000-000000000001'
const KEY = 'd7700000-0000-4000-8000-000000000002'
const OTHER = 'd7700000-0000-4000-8000-000000000003'
const AT = '2026-09-09T00:00:00.123456+00:00'
const input = { client_request_id: KEY, expected_draft_updated_at: AT }
const receipt = {
  operation_id: OTHER, worker_id: WORKER, client_request_id: KEY,
  draft_updated_at: AT, outcome: 'submitted', error_code: null,
  verification_status: 'submitted', submitted_at: AT, recorded_at: AT,
}
function request(options: {
  method?: 'POST' | 'GET'; data?: unknown; body?: unknown; role?: 'worker' | 'customer';
  error?: { code: string; message: string };
} = {}) {
  const method = options.method ?? 'POST'
  const rpc = method === 'POST' ? 'submit_worker_registration_draft_atomic' : 'get_worker_registration_command'
  const client = makeSequenceClient([], { [rpc]: [{ data: options.data ?? [receipt], error: options.error ?? null }] })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: WORKER, authProvider: 'email' }, role: options.role ?? 'worker',
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return { client, response: handler(new Request(`https://edge.test/workers/registration-commands${method === 'GET' ? `/${KEY}` : ''}`, {
    method, headers: { 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(options.body ?? input) } : {}),
  })) }
}

describe('Worker server-draft command public contract', () => {
  installEdgeRuntimeTestHooks()

  it('submits only the actor-owned revision and returns a durable receipt', async () => {
    const { client, response } = request()
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(await result.json()).toEqual({ state: 'resolved', receipt })
    expect(client.calls.find((call) => call.table === 'rpc:submit_worker_registration_draft_atomic')?.operations)
      .toEqual([['rpc', 'submit_worker_registration_draft_atomic', {
        p_actor_id: WORKER, p_worker_id: WORKER, p_client_request_id: KEY, p_expected_draft_updated_at: AT,
      }]])
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('reconciles without another mutation or copying unexpected private fields', async () => {
    const { client, response } = request({ method: 'GET', data: [{ ...receipt, bank_account: 'PRIVATE_FIELD' }] })
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(await result.json()).toEqual({ state: 'resolved', receipt })
    expect(client.calls.find((call) => call.table === 'rpc:get_worker_registration_command')?.operations)
      .toEqual([['rpc', 'get_worker_registration_command', { p_actor_id: WORKER, p_client_request_id: KEY }]])
    expect(client.calls.some((call) => call.table === 'rpc:submit_worker_registration_draft_atomic')).toBe(false)
  })

  it('normalizes equivalent UUID casing before submitting the command', async () => {
    const { client, response } = request({ body: { ...input, client_request_id: KEY.toUpperCase() } })
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(await result.json()).toEqual({ state: 'resolved', receipt })
    expect(client.calls.find(call => call.table === 'rpc:submit_worker_registration_draft_atomic')?.operations)
      .toEqual([['rpc', 'submit_worker_registration_draft_atomic', {
        p_actor_id: WORKER, p_worker_id: WORKER, p_client_request_id: KEY, p_expected_draft_updated_at: AT,
      }]])
  })

  it('keeps an absent receipt unknown rather than declaring that submission failed', async () => {
    const result = await request({ method: 'GET', data: [] }).response
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(await result.json()).toEqual({ state: 'unknown', client_request_id: KEY })
  })

  it.each([
    [], [receipt, receipt], [{ ...receipt, worker_id: OTHER }], [{ ...receipt, client_request_id: OTHER }],
    [{ ...receipt, draft_updated_at: '2026-09-09T00:00:00.123457Z' }],
    [{ ...receipt, error_code: 'INVALID_INPUT' }], [{ ...receipt, submitted_at: null }],
    [{ ...receipt, recorded_at: '2026-02-30T00:00:00Z' }],
    [{ ...receipt, outcome: 'rejected', error_code: 'PRIVATE_DB_DETAIL', submitted_at: null }],
  ].map(data => ({ data })))('rejects malformed or unrelated receipt %#', async ({ data }) => {
    const result = await request({ data }).response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
    expect(result.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('retains a committed stale-draft rejection as a resolved command', async () => {
    const rejected = { ...receipt, outcome: 'rejected', error_code: 'STALE_DRAFT', verification_status: 'draft', submitted_at: null }
    const result = await request({ data: [rejected] }).response
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(await result.json()).toEqual({ state: 'resolved', receipt: rejected })
  })

  it.each([
    { ...input, worker_id: OTHER }, { ...input, bank_account: 'PRIVATE_FIELD' },
    { ...input, expected_draft_updated_at: '2026-02-30T00:00:00Z' },
    { ...input, expected_draft_updated_at: '2026-09-09T00:00:00.1234567Z' },
  ])('rejects actor/payload overrides and invalid revisions before submission', async body => {
    const { client, response } = request({ body })
    expect((await response).status, pillarWhy(PILLAR)).toBe(400)
    expect(client.calls.some(call => call.table === 'rpc:submit_worker_registration_draft_atomic')).toBe(false)
  })

  it.each(['POST', 'GET'] as const)('denies a Customer access to the %s command', async method => {
    const { client, response } = request({ role: 'customer', method })
    expect((await response).status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.some(call => call.table === 'rpc:submit_worker_registration_draft_atomic')).toBe(false)
  })

  it('rejects a foreign receipt on the reconciliation read', async () => {
    const result = await request({ method: 'GET', data: [{ ...receipt, worker_id: OTHER }] }).response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
  })

  it.each(['POST', 'GET'] as const)('reports a %s DB timeout as unknown outcome, never as a success receipt', async method => {
    const result = await request({ method, error: { code: '57014', message: 'PRIVATE_DB_DETAIL' } }).response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    const body = await result.text()
    expect(body).not.toContain('PRIVATE_DB_DETAIL')
    expect(JSON.parse(body)).toMatchObject({ code: 'DB_ERROR' })
  })
})

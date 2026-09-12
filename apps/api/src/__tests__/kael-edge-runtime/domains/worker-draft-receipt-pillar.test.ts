import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P164-worker-draft-receipt',
  invariant: 'a draft save succeeds only with one boolean-success receipt bound to the authenticated Worker, draft status and a valid server timestamp',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/registration-draft.ts',
  layer: 'security-negative',
  siblings: ['P163-worker-registration-draft-gate', 'P71-worker-readiness-onboarding'],
  mutation: 'coerce row.ok by truthiness; a string false receipt incorrectly returns HTTP 200',
} as const satisfies PillarManifest

const WORKER = 'd7300000-0000-4000-8000-000000000001'
const AT = '2026-09-09T00:00:00.123456+00:00'
const receipt = { ok: true, error_code: null, worker_id: WORKER, verification_status: 'draft', updated_at: AT }
function request(data: unknown = [receipt], error: { code: string; message: string } | null = null) {
  const client = makeSequenceClient([], {
    save_worker_registration_draft_atomic: [{ data, error }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: WORKER, authProvider: 'email' }, role: 'worker',
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return { client, response: handler(new Request('https://edge.test/workers/registration-draft', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ districts: ['q1'] }),
  })) }
}

describe('Worker draft acknowledgement', () => {
  installEdgeRuntimeTestHooks()

  it('rejects a truthy string in place of a boolean acknowledgement', async () => {
    const { response } = request([{ ...receipt, ok: 'false' }])
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
    expect(result.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it.each([
    null, [], [receipt, receipt], { 0: receipt, length: 1 },
    [{ ...receipt, worker_id: 'another-worker' }],
    [{ ...receipt, ok: true, error_code: 'INVALID_INPUT' }],
    [{ ...receipt, verification_status: 'submitted' }],
    [{ ...receipt, verification_status: 'approved' }],
    [{ ...receipt, verification_status: null }],
    [{ ...receipt, updated_at: null }],
    [{ ...receipt, updated_at: '2026-02-30T00:00:00Z' }],
    [{ ...receipt, updated_at: 'not-a-date' }],
    [{ ...receipt, ok: false, error_code: 'UNKNOWN_DATABASE_FAILURE' }],
  ].map((data) => ({ data })))('rejects malformed or unrecognized receipt %# without fabricating saved progress', async ({ data }) => {
    const result = await request(data).response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
    expect(result.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it.each([
    ['WORKER_ACCESS_REQUIRED', 403, 'FORBIDDEN'],
    ['DRAFT_NOT_EDITABLE', 409, 'CONFLICT'],
    ['INVALID_INPUT', 400, 'VALIDATION'],
  ] as const)('preserves the known %s refusal', async (error_code, status, code) => {
    const result = await request([{ ...receipt, ok: false, error_code, verification_status: null, updated_at: null }]).response
    expect(result.status, pillarWhy(PILLAR)).toBe(status)
    expect(await result.json()).toMatchObject({ code })
    expect(result.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('returns the actor-bound draft receipt and preserves the server timestamp precision', async () => {
    const { client, response } = request()
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(await result.json()).toEqual({ worker_id: WORKER, verification_status: 'draft', updated_at: AT })
    expect(client.calls.find((call) => call.table === 'rpc:save_worker_registration_draft_atomic')?.operations)
      .toEqual([['rpc', 'save_worker_registration_draft_atomic', {
        p_actor_id: WORKER, p_worker_id: WORKER, p_draft: { districts: ['q1'] },
      }]])
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('does not expose database error text even when a success row accompanies the failure', async () => {
    const result = await request([receipt], { code: '08006', message: 'PRIVATE_DATABASE_DETAIL' }).response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    const body = await result.text()
    expect(body).not.toContain('PRIVATE_DATABASE_DETAIL')
    expect(JSON.parse(body)).toMatchObject({ code: 'DB_ERROR' })
  })
})

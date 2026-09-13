import { describe, expect, it } from 'vitest'
import { workerServiceAreaUpdateSchema } from '@nestscout/shared'
import { workerServiceAreaUpdateSchema as edgeAreaSchema } from '../../../../../../supabase/functions/_shared/contracts/worker'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P162-worker-service-area-authority',
  invariant: 'service-area updates cannot alter pending KYC and only a valid actor-bound atomic receipt permits success',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/service-settings.ts',
  layer: 'integration',
  siblings: ['P71-worker-readiness-onboarding'],
  mutation: 'restore direct worker_profiles UPDATE — pending-profile refusal returns HTTP 200 instead of 409',
} as const satisfies PillarManifest

const WORKER = 'd7200000-0000-4000-8000-000000000001'
const AT = '2026-09-09T00:00:00.000Z'
const receipt = { ok: true, error_code: null, worker_id: WORKER, updated_at: AT }
function request(row: unknown = receipt, patch: Record<string, unknown> = {}) {
  const client = makeSequenceClient([], {
    update_worker_service_area_atomic: [{ data: [row], error: null }],
  }, {
    worker_profiles: [{ data: { id: WORKER, verification_status: 'submitted', districts: ['q1'] }, error: null }],
    profiles: [{ data: { avatar_url: null }, error: null }],
    worker_service_quality_status: [{ data: [], error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: WORKER, authProvider: 'email' }, role: 'worker',
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return { client, response: handler(new Request('https://edge.test/workers/me/service-area', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ districts: ['q3'], home_lat: null, home_lng: null, ...patch }),
  })) }
}

describe('worker service area authority', () => {
  installEdgeRuntimeTestHooks()

  it('rejects a null radius at both contracts and HTTP before any write', async () => {
    const patch = { districts: ['q3'], service_radius_km: null }
    expect(workerServiceAreaUpdateSchema.safeParse(patch).success).toBe(false)
    expect(edgeAreaSchema.safeParse(patch).success).toBe(false)
    const { client, response } = request(receipt, patch)
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(400)
    expect(await result.json()).toMatchObject({ code: 'VALIDATION' })
    expect(client.calls.filter((call) => call.table === 'rpc:update_worker_service_area_atomic')).toEqual([])
    expect(client.calls.some((call) => call.table === 'worker_profiles' && call.operations.some((op) => op[0] === 'update'))).toBe(false)
  })

  it('preserves pending-profile refusal without a direct profile write', async () => {
    const { client, response } = request({ ...receipt, ok: false, error_code: 'ALREADY_FINALIZED' })
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(409)
    expect(await result.json()).toMatchObject({ code: 'ALREADY_FINALIZED' })
    expect(result.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
    expect(client.calls.some((call) => call.operations.some((op) => op[0] === 'update'))).toBe(false)
  })

  it('binds the area patch to the authenticated actor and preserves omitted radius', async () => {
    const { client, response } = request()
    expect((await response).status, pillarWhy(PILLAR)).toBe(200)
    expect(client.calls.find((call) => call.table === 'rpc:update_worker_service_area_atomic')?.operations)
      .toEqual([['rpc', 'update_worker_service_area_atomic', {
        p_actor_id: WORKER, p_worker_id: WORKER,
        p_patch: { districts: ['q3'], home_lat: null, home_lng: null },
      }]])
    expect(client.calls.some((call) => call.operations.some((op) => op[0] === 'update'))).toBe(false)
  })

  it.each([
    { ...receipt, ok: 'true' },
    { ...receipt, worker_id: 'd7200000-0000-4000-8000-000000000002' },
    { ...receipt, updated_at: 'not-a-date' },
    { ...receipt, updated_at: null },
  ])('rejects malformed atomic receipt %# without reporting an update', async (row) => {
    const { response } = request(row)
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
  })
})

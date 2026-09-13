import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P170-worker-document-resume',
  invariant: 'an owner profile exposes independent document-presence flags, never private KYC refs or full bank details, so an incomplete draft can resume',
  authority: ['governance/RULES.md #8', 'governance/RULES.md #9', 'governance/structures/worker-workflow.md B0'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/profile.ts',
  layer: 'security-negative',
  siblings: ['P163-worker-registration-draft-gate', 'P165-worker-verification-upload-deadline'],
  mutation: 'omit the per-side presence projection; the partial-draft HTTP assertion receives undefined instead of true/false',
} as const satisfies PillarManifest

const WORKER = 'd7200000-0000-4000-8000-000000000001'
function request(row: Record<string, unknown> | null, role: 'worker' | 'customer' = 'worker') {
  const client = makeSequenceClient([], {}, {
    worker_profiles: [{ data: row, error: null }],
    profiles: [{ data: { avatar_url: null }, error: null }],
    worker_service_quality_status: [{ data: [], error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: WORKER, authProvider: 'email' }, role,
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return { client, response: handler(new Request('https://edge.test/workers/me')) }
}

describe('worker document resume projection', () => {
  installEdgeRuntimeTestHooks()

  it.each([
    [true, false, true], [false, true, false], [true, true, true], [false, false, false],
  ])('reports each saved document independently without private refs (%s/%s/%s)', async (front, back, selfie) => {
    const privateRef = `supabase://worker-verification/${WORKER}/`
    const { client, response } = request({
      id: WORKER, verification_status: 'draft', is_approved: false,
      cccd_front_url: front ? `${privateRef}cccd-front/front.jpg` : null,
      cccd_back_url: back ? `${privateRef}cccd-back/back.jpg` : null,
      selfie_url: selfie ? `${privateRef}selfie/selfie.jpg` : null,
      bank_account: '123456789', bank_name: 'Fixture bank',
    })
    const result = await response
    const body = await result.json()
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(body, pillarWhy(PILLAR)).toMatchObject({
      id: WORKER, has_cccd_front: front, has_cccd_back: back,
      has_cccd: front && back, has_selfie: selfie, bank_account_masked: '****6789',
    })
    expect(JSON.stringify(body)).not.toContain(privateRef)
    expect(JSON.stringify(body)).not.toContain('123456789')
    for (const field of ['cccd_front_url', 'cccd_back_url', 'selfie_url', 'bank_account']) {
      expect(body).not.toHaveProperty(field)
    }
    expect(client.calls.find((call) => call.table === 'worker_profiles')?.operations).toContainEqual(['eq', 'id', WORKER])
  })

  it('does not invent documents for a missing profile', async () => {
    const { response } = request(null)
    expect(await (await response).json(), pillarWhy(PILLAR)).toMatchObject({
      has_cccd_front: false, has_cccd_back: false, has_cccd: false, has_selfie: false,
    })
  })

  it('rejects a Customer before reading Worker KYC', async () => {
    const { client, response } = request(null, 'customer')
    expect((await response).status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })
})

/**
 * Learning-candidate routes are admin-only
 * at the Edge ROUTER, not merely at the service layer.
 *
 * Before the fix, `admin.kaelLearning.candidates.{list,approve,reject}` carried
 * roles ["customer","worker","admin"] and depended solely on a service-layer
 * `ctx.role !== "admin"` guard. This negative test proves the router now rejects
 * non-admins BEFORE dispatch.
 *
 * The assertion that BITES: for a non-admin, the route's service mock must NOT be
 * called. A plain "status === 403" check would pass both before AND after the fix
 * (the service-layer guard also returns 403), so it cannot prove the router change.
 * `not.toHaveBeenCalled()` fails on the old router (which dispatched to the service)
 * and passes on the new one (which blocks at the role gate).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'

const customerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'customer',
  supabase: {},
}
const workerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '33333333-3333-4333-8333-333333333333' },
  role: 'worker',
  supabase: {},
}
const adminAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '99999999-9999-4999-8999-999999999999' },
  role: 'admin',
  supabase: {},
}

// The Edge handler delegates role enforcement to `authenticate(request, route.roles)`
// (router.ts:1021). This mock replicates that contract: it 403s when the actor's role
// is not in the route.roles the router passes — so the test exercises the REAL
// route.roles values declared in router.ts. It bites on the old
// ["customer","worker","admin"] and passes only with the S2 ["admin"].
function roleAwareAuthenticate(role: 'customer' | 'worker' | 'admin', actor: MobileApiAuthResult) {
  return vi.fn(async (_request: Request, roles?: readonly string[]): Promise<MobileApiAuthResult> => {
    if (roles && !roles.includes(role)) {
      return { success: false, status: 403, error: 'Bạn không có quyền thực hiện hành động này' }
    }
    return actor
  })
}

function makeLearningServices() {
  const mocks = {
    listKaelLearningCandidates: vi.fn(async () => ({ candidates: [] })),
    approveKaelLearningCandidate: vi.fn(async () => ({
      ok: true,
      candidate_id: 'candidate-1',
      rule_id: 'rule-1',
      rule_version: 1,
      status: 'auto_promoted',
      knowledge_apply: null,
    })),
    rejectKaelLearningCandidate: vi.fn(async () => ({
      ok: true,
      candidate_id: 'candidate-1',
      status: 'archived',
    })),
  }
  // The router type requires the full service surface; this test only exercises
  // the three learning-candidate handlers, so cast the partial mock.
  const services = mocks as unknown as MobileApiServices
  return { services, mocks }
}

type SvcName = keyof ReturnType<typeof makeLearningServices>['mocks']

const ROUTES: { name: string; method: 'GET' | 'POST'; path: string; svc: SvcName }[] = [
  {
    name: 'list candidates',
    method: 'GET',
    path: '/mobile-api/admin/kael/learning/candidates',
    svc: 'listKaelLearningCandidates',
  },
  {
    name: 'approve candidate',
    method: 'POST',
    path: '/mobile-api/admin/kael/learning/candidates/candidate-1/approve',
    svc: 'approveKaelLearningCandidate',
  },
  {
    name: 'reject candidate',
    method: 'POST',
    path: '/mobile-api/admin/kael/learning/candidates/candidate-1/reject',
    svc: 'rejectKaelLearningCandidate',
  },
]

function makeReq(method: 'GET' | 'POST', path: string): Request {
  const init: RequestInit = { method }
  if (method === 'POST') {
    init.headers = { 'content-type': 'application/json' }
    init.body = '{}'
  }
  return new Request(`https://example.test${path}`, init)
}

describe('S2/F2: learning-candidate routes reject non-admins at the router', () => {
  for (const route of ROUTES) {
    for (const [label, auth] of [
      ['customer', customerAuth],
      ['worker', workerAuth],
    ] as const) {
      it(`${route.method} ${route.path}: ${label} → 403 and service NOT dispatched`, async () => {
        const { services, mocks } = makeLearningServices()
        const handler = createMobileApiHandler({
          authenticate: roleAwareAuthenticate(label, auth),
          services,
        })

        const res = await handler(makeReq(route.method, route.path))

        expect(res.status).toBe(403)
        // Router blocked before dispatch → service layer never reached.
        expect(mocks[route.svc]).not.toHaveBeenCalled()
      })
    }

    it(`${route.method} ${route.path}: admin → passes role gate (not 403)`, async () => {
      const { services } = makeLearningServices()
      const handler = createMobileApiHandler({
        authenticate: roleAwareAuthenticate('admin', adminAuth),
        services,
      })

      const res = await handler(makeReq(route.method, route.path))

      expect(res.status).not.toBe(403)
      expect(res.status).not.toBe(401)
    })
  }

  it('admin GET list candidates dispatches to the service exactly once', async () => {
    const { services, mocks } = makeLearningServices()
    const handler = createMobileApiHandler({
      authenticate: roleAwareAuthenticate('admin', adminAuth),
      services,
    })

    const res = await handler(makeReq('GET', '/mobile-api/admin/kael/learning/candidates'))

    expect(res.status).toBe(200)
    expect(mocks.listKaelLearningCandidates).toHaveBeenCalledTimes(1)
  })
})

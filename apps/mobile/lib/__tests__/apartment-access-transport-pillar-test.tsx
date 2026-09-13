import { api } from '../api'
import { jobService } from '../services'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P131-apartment-access-mobile-transport',
  invariant: 'Apartment authorization transmits the exact worker and visit consent with the initiating Customer token',
  authority: ['governance/RULES.md #7 (Customer confirmation)', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/lib/services.ts',
  layer: 'integration',
  siblings: ['P128-apartment-access-authorization'],
  mutation: 'use the legacy bodyless ambient-token POST; the explicit token and worker-visit assertion fails',
} as const satisfies PillarManifest

jest.mock('../api', () => ({ api: { post: jest.fn(), postAuthenticated: jest.fn() } }))
const INTENT = { expected_worker_id: '33333333-3333-4333-8333-333333333333', expected_check_in_at: '2026-09-08T01:00:00.000Z' }

it('sends only the captured consent and token through the public job service', () => {
  // Reflect also exercises callers compiled against the earlier one-argument method.
  Reflect.apply(jobService.authorizeApartmentAccess, jobService, ['job/unsafe', INTENT, 'initiating-token'])
  withPillarContext(PILLAR, () => {
    expect(api.postAuthenticated).toHaveBeenCalledWith('/jobs/job%2Funsafe/access/authorize', INTENT, 'initiating-token')
    expect(api.post).not.toHaveBeenCalled()
  }, 'The app must not grant access through a bodyless request or a later account token')
})

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { api } from '../api'
import { adminControlService } from '../services/admin-control-service'

jest.mock('../api', () => ({ api: {
  get: jest.fn(), post: jest.fn(), getAuthenticated: jest.fn(), postAuthenticated: jest.fn(),
} }))

export const PILLAR = {
  id: 'P175-admin-worker-review-session',
  invariant: 'Admin KYC requests preserve explicit reviewer credentials and never fall back to another ambient account for a decision',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #19'],
  target: 'apps/mobile/lib/services/admin-control-service.ts',
  layer: 'unit',
  siblings: ['P173-admin-worker-review-snapshot-ui'],
  mutation: 'send the decision with api.post instead of postAuthenticated; the reviewer-bound mutation assertion fails',
} as const satisfies PillarManifest

beforeEach(() => jest.clearAllMocks())

const applicationId = 'd7900000-0000-4000-8000-000000000001'
const workerId = 'd7900000-0000-4000-8000-000000000002'
const command = {
  decision: 'approve' as const, profile_review_queue_id: 'd7900000-0000-4000-8000-000000000003',
  expected_profile_updated_at: '2026-09-12T00:00:00.123456Z',
}

it.each(['explicit-reviewer-token', ''])('uses the explicit credential boundary for detail reads (%s)', token => {
  adminControlService.getWorkerReviewDetail(applicationId, token)
  expect(api.getAuthenticated).toHaveBeenCalledWith(`/admin/worker-applications/${applicationId}/review-detail`, token)
  expect(api.get).not.toHaveBeenCalled()
})

it.each(['explicit-reviewer-token', ''])('uses the explicit credential boundary for finance reads (%s)', token => {
  adminControlService.getWorkerFinanceSnapshot(workerId, { from: '2026-09-01', to: '2026-09-12' }, token)
  expect(api.getAuthenticated).toHaveBeenCalledWith(`/admin/workers/${workerId}/finance-snapshot?from=2026-09-01&to=2026-09-12`, token)
  expect(api.get).not.toHaveBeenCalled()
})

it.each(['explicit-reviewer-token', ''])('never substitutes ambient auth for a profile decision (%s)', token => {
  adminControlService.decideWorkerProfile(applicationId, command, token)
  withPillarContext(PILLAR, () => expect(api.postAuthenticated).toHaveBeenCalledWith(
    `/admin/worker-applications/${applicationId}/profile-decision`, command, token,
  ))
  expect(api.post).not.toHaveBeenCalled()
})

it('preserves existing read-only callers that do not supply credentials explicitly', () => {
  adminControlService.getWorkerReviewDetail(applicationId)
  adminControlService.getWorkerFinanceSnapshot(workerId)
  expect(api.get).toHaveBeenCalledTimes(2)
  expect(api.getAuthenticated).not.toHaveBeenCalled()
})

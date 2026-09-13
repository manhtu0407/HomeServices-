import type { WorkerProfileResponse } from '../api-types'
import { sameWorkerProfile } from '../frontend-workflow/comparisons'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P176-worker-profile-document-refresh',
  invariant: 'Worker profile refresh cannot discard a changed identity-document side while the aggregate remains incomplete',
  authority: ['governance/RULES.md #8', 'governance/structures/worker-workflow.md B0'],
  target: 'apps/mobile/lib/frontend-workflow/comparisons.ts',
  layer: 'unit',
  siblings: ['P163-worker-registration-draft-gate', 'P170-worker-document-resume'],
  mutation: 'omit either per-side flag from sameWorkerProfile; the incomplete-document refresh is incorrectly unchanged',
} as const satisfies PillarManifest

const profile: WorkerProfileResponse = {
  id: 'fixture-worker', verification_status: 'draft', legal_name: 'Thợ kiểm thử',
  date_of_birth: null, districts: [], problem_specializations: [], service_types: [],
  service_radius_km: 8, years_experience: 0, bank_name: null, avatar_url: null,
  active_minutes: 0, last_active_at: null, is_available: false, is_approved: false,
  is_suspended: false, home_lat: null, home_lng: null, gender: null,
  bank_account_masked: null, rating: 0, total_jobs: 0, has_cccd: false,
  has_cccd_front: false, has_cccd_back: false, has_selfie: false,
}

it.each(['has_cccd_front', 'has_cccd_back'] as const)('retains a refreshed %s even while aggregate has_cccd remains false', (side) => {
  withPillarContext(PILLAR, () => {
    const updated = { ...profile, [side]: true }
    expect(sameWorkerProfile(profile, updated)).toBe(false)
    expect(sameWorkerProfile(updated, profile)).toBe(false)
    expect(sameWorkerProfile(updated, { ...updated })).toBe(true)
  }, `a change to ${side} must invalidate the cached profile in both directions`)
})

it('does not invent per-side presence when a legacy profile omits it', () => {
  const legacy = { ...profile, has_cccd_front: undefined, has_cccd_back: undefined }
  expect(sameWorkerProfile(legacy, profile)).toBe(false)
  expect(sameWorkerProfile(legacy, { ...legacy })).toBe(true)
})

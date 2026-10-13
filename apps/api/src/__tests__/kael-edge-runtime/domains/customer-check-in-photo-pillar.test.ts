import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { projectAddressAccess } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/apartment-access'

export const PILLAR = {
  id: 'P381-customer-check-in-photo',
  invariant: 'The customer is given the worker\'s lobby photo refs of this job only while the worker has checked in and the unit is not yet released; never the worker, never after release, never another job\'s or another stage\'s file, at most three',
  authority: ['governance/RULES.md Multimodal Evidence Privacy', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/apartment-access.ts',
  layer: 'security-negative',
  siblings: ['P129-apartment-access-authority-sql', 'P36-worker-route-unit-protection'],
  mutation: 'return every stored photo ref or drop the not-yet-released condition; the foreign-ref, release and role cases fail',
} as const satisfies PillarManifest

const JOB = 'f3810000-0000-4000-8000-000000000001'
const OTHER_JOB = 'f3810000-0000-4000-8000-000000000009'
const WORKER = 'f3810000-0000-4000-8000-000000000002'
const OTHER_WORKER = 'f3810000-0000-4000-8000-000000000003'
const ref = (name: string, job = JOB, stage = 'access_check_in') => `supabase://job-media/${job}/${stage}/${name}`

function row(overrides: { photos?: unknown; released?: boolean; checkInWorker?: string; checkedIn?: boolean; status?: string } = {}) {
  const checkedIn = overrides.checkedIn ?? true
  return {
    id: JOB,
    status: overrides.status ?? 'arrived',
    worker_id: WORKER,
    address_building: 'Tòa A', address_unit: 'A1201', address_floor: '12', address_district: 'Thủ Đức',
    apartment_access_profile: {},
    apartment_access_state: {
      worker_checked_in: checkedIn,
      ...(checkedIn
        ? { check_in: { worker_id: overrides.checkInWorker ?? WORKER, checked_in_at: '2026-10-13T06:40:00.000Z', mode: 'manual_photo', photo_urls: overrides.photos ?? [ref('lobby-1.jpg')] } }
        : {}),
      ...(overrides.released
        ? { exact_unit_released: true, customer_authorized: true, authorized_worker_id: WORKER, authorized_check_in_at: '2026-10-13T06:40:00.000Z', customer_authorized_at: '2026-10-13T06:41:00.000Z' }
        : {}),
    },
  }
}

const refsFor = (r: ReturnType<typeof row>, role: 'customer' | 'worker' | 'admin') =>
  projectAddressAccess(r, role).addressAccess as { check_in_photo_refs?: string[] }

describe('Customer check-in photo projection', () => {
  it('gives the customer the worker\'s lobby photos while the release waits on them', () => {
    expect(refsFor(row({ photos: [ref('a.jpg'), ref('b.png')] }), 'customer').check_in_photo_refs, pillarWhy(PILLAR))
      .toEqual([ref('a.jpg'), ref('b.png')])
  })

  it('never gives them to the worker or leaves the key on a worker response', () => {
    expect('check_in_photo_refs' in refsFor(row(), 'worker'), pillarWhy(PILLAR)).toBe(false)
  })

  it('stops once the unit is released', () => {
    expect(refsFor(row({ released: true }), 'customer').check_in_photo_refs, pillarWhy(PILLAR, 'the photo served its purpose')).toEqual([])
  })

  it.each([
    ['the worker has not checked in', row({ checkedIn: false })],
    ['the check-in belongs to another worker', row({ checkInWorker: OTHER_WORKER })],
    ['the building has not been released for this job', row({ status: 'broadcasting' })],
  ])('shows nothing when %s', (_name, value) => {
    expect(refsFor(value, 'customer').check_in_photo_refs).toEqual([])
  })

  it('drops refs that are not this job\'s own check-in files', () => {
    const photos = [
      ref('ok.jpg'),
      ref('other-job.jpg', OTHER_JOB),
      ref('wrong-stage.jpg', JOB, 'after'),
      ref('..'),
      `supabase://job-media/${JOB}/access_check_in/../after/x.jpg`,
      'https://example.test/leak.jpg',
      42,
      null,
    ]
    expect(refsFor(row({ photos }), 'customer').check_in_photo_refs, pillarWhy(PILLAR)).toEqual([ref('ok.jpg')])
  })

  it('caps the list at three and tolerates a missing or malformed list', () => {
    expect(refsFor(row({ photos: ['1', '2', '3', '4', '5'].map((n) => ref(`${n}.jpg`)) }), 'customer').check_in_photo_refs).toHaveLength(3)
    expect(refsFor(row({ photos: undefined }), 'customer').check_in_photo_refs).toHaveLength(1)
    expect(refsFor(row({ photos: 'not-a-list' }), 'customer').check_in_photo_refs).toEqual([])
  })
})

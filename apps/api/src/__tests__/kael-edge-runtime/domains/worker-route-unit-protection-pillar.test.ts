import { describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'

export const PILLAR = {
  id: 'P36-worker-route-unit-protection',
  invariant:
    'a worker route preview answers with building-level coordinates only — the unit, floor, and building name are read from the job row to authorise the trip and never travel back in the response, and a job still at area-only release is refused outright',
  authority: [
    'governance/RULES.md #9 (do not expose exact addresses)',
    'governance/RULES.md Security Invariants — PII Handling (share only the minimum job context the workflow needs)',
    'governance/structures/trust-safety-evidence.md',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/route.ts',
  layer: 'security-negative',
  siblings: ['P19-job-access-ownership', 'P09-kael-pii-scrub', 'P03-direct-payment-availability'],
  mutation:
    'return `{ ...result.data, latitude, longitude }` from workerRouteDestination instead of the two coordinates — the no-sentinel case names the unit it leaked and the destination-shape case names the extra keys. Dropping the `release_stage === "area_only"` guard turns only the area-only case red, which is why it is separate',
} as const satisfies PillarManifest

// Distinctive so an absence assertion cannot pass by accident: a bare '12' floor would
// collide with a timestamp or a distance in the same payload.
const UNIT = 'UNIT-SENTINEL-A1201'
const FLOOR = 'FLOOR-SENTINEL-12'
const BUILDING = 'BUILDING-SENTINEL-TOA-A'

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-route-1',
    status: 'worker_matched',
    worker_id: 'worker-1',
    address_lat: 10.7767,
    address_lng: 106.7009,
    address_building: BUILDING,
    address_unit: UNIT,
    address_floor: FLOOR,
    address_district: 'Bình Thạnh',
    apartment_access_profile: {},
    apartment_access_state: { exact_unit_released: false },
    ...overrides,
  }
}

function workerContext(row: Record<string, unknown> | null): MobileApiContext {
  return {
    success: true,
    user: { id: 'worker-1' },
    role: 'worker',
    supabase: makeSequenceClient([{ data: row, error: null }]),
  } as MobileApiContext
}

function stubRoute(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))))
}

const ORIGIN = { latitude: 10.7692, longitude: 106.6819 }
const OK_ROUTE = { code: 'OK', paths: [{ distance: 3_200, time: 720_000 }] }

function preview(row: Record<string, unknown> | null) {
  return createEdgeServices({ vietmapApiKey: 'vietmap-test-key' })
    .getWorkerRoutePreview(workerContext(row), 'job-route-1', ORIGIN)
}

describe('P36 worker route — the unit does not travel back', () => {
  installEdgeRuntimeTestHooks()

  it('returns a route without the unit, floor, or building name anywhere in it', async () => {
    stubRoute(OK_ROUTE)
    const result = await preview(jobRow())
    const serialized = JSON.stringify(result)

    for (const [label, sentinel] of [['unit', UNIT], ['floor', FLOOR], ['building name', BUILDING]] as const) {
      expect(
        serialized.includes(sentinel),
        pillarWhy(PILLAR, `the ${label} is read to authorise the trip; a worker who has not been handed the address must not receive it back`),
      ).toBe(false)
    }
  })

  it('carries only coordinates and a building marker as the destination', async () => {
    stubRoute(OK_ROUTE)
    const result = await preview(jobRow())

    expect(
      Object.keys(result.destination).sort(),
      pillarWhy(PILLAR, 'an extra key here is the whole job row leaking one field at a time'),
    ).toEqual(['kind', 'latitude', 'longitude'])
    expect(
      result.destination.kind,
      pillarWhy(PILLAR, 'building is the promise: the worker is routed to the block, not the door'),
    ).toBe('building')
  })

  it('still answers the distance and duration the worker actually needs', async () => {
    stubRoute(OK_ROUTE)
    await expect(
      preview(jobRow()),
      pillarWhy(PILLAR, 'protection that removed the route would be protection nobody could ship'),
    ).resolves.toMatchObject({ distance_meters: 3_200, duration_seconds: 720, provider: 'vietmap' })
  })
})

describe('P36 worker route — refusals', () => {
  installEdgeRuntimeTestHooks()

  // The release stage is derived from job status, not stored: a status outside
  // ADDRESS_BUILDING_RELEASE_STATUSES with no exact-unit release lands on area_only. A job
  // still broadcasting has not been assigned to anyone, so no worker may route to it.
  it('refuses a job whose status has not reached building release', async () => {
    stubRoute(OK_ROUTE)
    await expect(
      preview(jobRow({ status: 'broadcasting' })),
      pillarWhy(PILLAR, 'before the workflow releases the building the destination is not the worker to have, not even as coordinates'),
    ).rejects.toMatchObject({ code: 'ADDRESS_PROTECTED', status: 403 })
  })

  it('refuses a job the worker does not hold', async () => {
    stubRoute(OK_ROUTE)
    await expect(
      preview(null),
      pillarWhy(PILLAR, 'the query filters on worker_id; a missing row means not yours and must read as not found'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('refuses a malformed provider payload rather than routing to corrupted coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code": "OK", "paths": [{"distance": "far"}]}')))
    await expect(
      preview(jobRow()),
      pillarWhy(PILLAR, 'a non-numeric distance must not become a rounded number on a worker screen'),
    ).rejects.toMatchObject({ status: 502 })
  })
})

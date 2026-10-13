import { describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { readJobWorkerTravel } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/travel-position'
import { decodePolyline5, thinPolyline } from '../../../../../../supabase/functions/mobile-api/_shared/platform/polyline'

export const PILLAR = {
  id: 'P380-worker-travel-position',
  invariant: 'Only the assigned worker can report a position, only while the job is worker_on_way, it is priced against the same VietMap route as the worker\'s own map, and the customer reads back only what the database function returns for their own job',
  authority: ['governance/RULES.md #9', 'governance/RULES.md #10', 'governance/RULES.md #7'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/travel-position.ts',
  layer: 'security-negative',
  siblings: ['P36-worker-route-unit-protection', 'P379-worker-travel-position-sql'],
  mutation: 'drop the on-the-way status check, the Worker role guard or the 10-second gap, or store the position when no route came back; the refusal and no-write cases fail',
} as const satisfies PillarManifest

const JOB = 'f3800000-0000-4000-8000-000000000001'
const WORKER = 'f3800000-0000-4000-8000-000000000002'
const CUSTOMER = 'f3800000-0000-4000-8000-000000000003'
const ORIGIN = { latitude: 10.7692, longitude: 106.6819 }

// Google polyline precision 5, so the test does not depend on the decoder under test to build its input.
function encode(points: [number, number][]) {
  let lastLat = 0
  let lastLng = 0
  const chunk = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1
    let out = ''
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    return out + String.fromCharCode(v + 63)
  }
  return points.map(([lat, lng]) => {
    const la = Math.round(lat * 1e5)
    const ln = Math.round(lng * 1e5)
    const piece = chunk(la - lastLat) + chunk(ln - lastLng)
    lastLat = la
    lastLng = ln
    return piece
  }).join('')
}

const ROUTE: [number, number][] = [[10.7692, 106.6819], [10.7720, 106.6890], [10.7767, 106.7009]]
const POLYLINE = encode(ROUTE)

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB, status: 'worker_on_way', worker_id: WORKER, customer_id: CUSTOMER,
    address_lat: 10.7767, address_lng: 106.7009, address_building: 'Tòa A', address_unit: null, address_floor: null,
    address_district: 'Bình Thạnh', apartment_access_profile: {}, apartment_access_state: { exact_unit_released: false },
    ...overrides,
  }
}

function setup(input: {
  role?: 'worker' | 'customer' | 'admin'
  status?: string
  lastReportedAt?: string | null
  rpc?: unknown
  provider?: unknown
} = {}) {
  const row = jobRow({ status: input.status ?? 'worker_on_way' })
  const client = makeSequenceClient([], {
    record_worker_travel_position_atomic: [{
      data: input.rpc ?? [{ recorded: true, reason: null, total_meters: 3200, reported_at: '2026-10-13T03:00:00.000Z' }],
      error: null,
    }],
  }, {
    jobs: Array.from({ length: 4 }, () => ({ data: row, error: null })),
    job_worker_positions: [{ data: input.lastReportedAt ? { reported_at: input.lastReportedAt } : null, error: null }],
  })
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(
    input.provider ?? { code: 'OK', paths: [{ distance: 3_200, time: 720_000, points: POLYLINE }] },
  )))
  vi.stubGlobal('fetch', fetchMock)
  const ctx = {
    success: true, user: { id: input.role === 'customer' ? CUSTOMER : WORKER }, role: input.role ?? 'worker',
    supabase: client, privilegedSupabase: client,
  } as unknown as MobileApiContext
  return {
    client,
    fetchMock,
    report: () => createEdgeServices({ vietmapApiKey: 'vietmap-test-key' }).reportWorkerTravelPosition(ctx, JOB, ORIGIN),
  }
}

const rpcCalls = (client: ReturnType<typeof makeSequenceClient>) =>
  client.calls.filter((call) => call.table === 'rpc:record_worker_travel_position_atomic')

describe('Worker travel position report', () => {
  installEdgeRuntimeTestHooks()

  it('prices the position against the worker route and stores it for the customer', async () => {
    const { client, report } = setup()
    const result = await report()
    expect(result, pillarWhy(PILLAR)).toMatchObject({
      distance_meters: 3_200, duration_seconds: 720, shared_with_customer: true, reported_at: '2026-10-13T03:00:00.000Z',
    })
    expect(rpcCalls(client)).toHaveLength(1)
    expect(rpcCalls(client)[0].operations[0][2]).toEqual({
      p_job_id: JOB, p_latitude: ORIGIN.latitude, p_longitude: ORIGIN.longitude, p_remaining_meters: 3_200,
      p_remaining_seconds: 720, p_route_polyline: POLYLINE, p_worker_id: WORKER,
    })
  })

  it.each(['customer', 'admin'] as const)('refuses the %s actor before any read, provider call or write', async (role) => {
    const { client, fetchMock, report } = setup({ role })
    await expect(report(), pillarWhy(PILLAR)).rejects.toMatchObject({ status: 403 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpcCalls(client)).toEqual([])
  })

  it.each(['arrived', 'worker_matched', 'repairing'])('refuses a job in %s without a provider call or a write', async (status) => {
    const { client, fetchMock, report } = setup({ status })
    await expect(report(), pillarWhy(PILLAR, 'only the trip itself is shared')).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpcCalls(client)).toEqual([])
  })

  it('refuses a second report inside the gap before spending a route lookup', async () => {
    const { client, fetchMock, report } = setup({ lastReportedAt: new Date(Date.now() - 3_000).toISOString() })
    await expect(report(), pillarWhy(PILLAR)).rejects.toMatchObject({ code: 'TRAVEL_REPORT_TOO_SOON', status: 429 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpcCalls(client)).toEqual([])
  })

  it('accepts a report once the gap has passed', async () => {
    const { report } = setup({ lastReportedAt: new Date(Date.now() - 30_000).toISOString() })
    await expect(report()).resolves.toMatchObject({ shared_with_customer: true })
  })

  it('does not store a position when the provider returned no route to follow', async () => {
    const { client, report } = setup({ provider: { code: 'OK', paths: [{ distance: 3_200, time: 720_000 }] } })
    await expect(report(), pillarWhy(PILLAR, 'a position without a route cannot be drawn for the customer')).resolves.toMatchObject({ shared_with_customer: false })
    expect(rpcCalls(client)).toEqual([])
  })

  it('does not claim the customer can see the trip when the database refused the report', async () => {
    const { report } = setup({ rpc: [{ recorded: false, reason: 'THROTTLED', total_meters: 3200, reported_at: '2026-10-13T03:00:00.000Z' }] })
    await expect(report()).resolves.toMatchObject({ shared_with_customer: false })
  })

  it('answers INVALID_STATUS when the job left the trip between the check and the write', async () => {
    const { report } = setup({ rpc: [{ recorded: false, reason: 'INVALID_STATUS', total_meters: null, reported_at: null }] })
    await expect(report()).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })
  })
})

describe('readJobWorkerTravel', () => {
  installEdgeRuntimeTestHooks()

  const row = (overrides: Record<string, unknown> = {}) => ({
    latitude: '10.772000', longitude: 106.689, route_polyline: POLYLINE, total_meters: 5_000,
    remaining_meters: 3_200, remaining_seconds: 720, reported_at: '2026-10-13T03:00:00.000Z', ...overrides,
  })
  const read = (result: { data: unknown; error: { code?: string; message?: string } | null }) =>
    readJobWorkerTravel(makeSequenceClient([], { get_job_worker_travel: [result] }) as never, JOB, CUSTOMER)

  it('hands the customer the route as coordinates with the latest position', async () => {
    await expect(read({ data: [row()], error: null })).resolves.toEqual({
      updated_at: '2026-10-13T03:00:00.000Z',
      route: ROUTE,
      position: [10.772, 106.689],
      total_meters: 5_000,
      remaining_meters: 3_200,
      remaining_seconds: 720,
    })
  })

  it('asks the database for the caller\'s own job only', async () => {
    const client = makeSequenceClient([], { get_job_worker_travel: [{ data: [], error: null }] })
    await readJobWorkerTravel(client as never, JOB, CUSTOMER)
    expect(client.calls[0].operations[0][2]).toEqual({ p_customer_id: CUSTOMER, p_job_id: JOB })
  })

  it.each([
    ['no report yet', { data: [], error: null }],
    ['a database error', { data: null, error: { code: '42883', message: 'missing' } }],
    ['an unreadable route', { data: [row({ route_polyline: '!!!' })], error: null }],
    ['more left than the whole trip', { data: [row({ remaining_meters: 6_000 })], error: null }],
    ['a missing time', { data: [row({ reported_at: null })], error: null }],
  ])('returns null for %s instead of a made-up trip', async (_name, result) => {
    await expect(read(result)).resolves.toBeNull()
  })
})

describe('polyline helpers', () => {
  it('decodes what it encodes and rejects garbage', () => {
    expect(decodePolyline5(POLYLINE)).toEqual(ROUTE)
    expect(decodePolyline5('!!!')).toBeNull()
    expect(decodePolyline5(null)).toBeNull()
    expect(decodePolyline5('')).toBeNull()
  })

  it('thins a long route and keeps both ends', () => {
    const long: [number, number][] = Array.from({ length: 500 }, (_, i) => [10.7 + i * 0.0001, 106.6 + i * 0.0001])
    const thin = thinPolyline(long, 120)
    expect(thin).toHaveLength(120)
    expect(thin[0]).toEqual(long[0])
    expect(thin[119]).toEqual(long[499])
    expect(thinPolyline(ROUTE, 120)).toEqual(ROUTE)
  })
})

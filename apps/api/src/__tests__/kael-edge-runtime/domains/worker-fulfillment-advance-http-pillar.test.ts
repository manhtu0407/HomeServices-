import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P373-worker-fulfillment-advance-http',
  invariant:
    'The assigned Worker advances only through the public status route in workflow order; arrival geofence evidence is checked before mutation and stale status writes remain recoverable',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind mobile-api)',
    'governance/structures/worker-workflow.md B5 (on-site status updates)',
    'governance/structures/state-machines.md §12.2 (composed transition graph)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/job/status.ts',
  layer: 'integration',
  siblings: ['P12-workflow-transition-composition', 'P79-worker-completion-media-ownership'],
  mutation:
    'remove the assigned-worker guard, workflow transition guard, or geofence validation, or omit the status compare-and-set result check; the unassigned-worker, skipped-phase, far-arrival, and stale-write assertions turn red',
} as const satisfies PillarManifest

const JOB = 'f7900000-0000-4000-8000-000000000001'
const WORKER = 'f7900000-0000-4000-8000-000000000002'
const CUSTOMER = 'f7900000-0000-4000-8000-000000000003'
const BUILDING = { lat: 10.75, lng: 106.65 }
const CHECK_IN = {
  mode: 'geofence',
  lat: BUILDING.lat,
  lng: BUILDING.lng,
  accuracy_m: 25,
}

function setup(input: {
  status: string
  jobWorkerId?: string | null
  updated?: { data: { id: string } | null; error: { code?: string; message?: string } | null }
} = { status: 'worker_matched' }) {
  const client = makeSequenceClient([], {}, {
    jobs: [
      {
        data: {
          id: JOB,
          status: input.status,
          customer_id: CUSTOMER,
          worker_id: input.jobWorkerId === undefined ? WORKER : input.jobWorkerId,
          final_price: 450000,
          completion_notes: null,
          completion_photo_urls: [],
          address_lat: BUILDING.lat,
          address_lng: BUILDING.lng,
          apartment_access_state: null,
          work_started_at: null,
          work_paused_at: null,
          work_paused_ms: 0,
          worker_work_note: null,
        },
        error: null,
      },
      input.updated ?? { data: { id: JOB }, error: null },
    ],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: WORKER },
      role: 'worker',
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })

  return {
    client,
    run: (body: Record<string, unknown>) => handler(new Request(
      `https://edge.test/jobs/${JOB}/status`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    )),
  }
}

function jobWrites(client: ReturnType<typeof makeSequenceClient>) {
  return client.calls.filter((call) => call.table === 'jobs')
    .flatMap((call) => call.operations.filter((operation) => operation[0] === 'update'))
}

describe('worker fulfillment status at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('advances each allowed on-site worker step through the public status route', async () => {
    const transitions = [
      ['worker_matched', 'worker_on_way'],
      ['worker_on_way', 'arrived'],
      ['arrived', 'inspecting'],
      ['inspecting', 'repairing'],
    ] as const

    for (const [from, to] of transitions) {
      const { run } = setup({ status: from })
      const response = await run({
        status: to,
        ...(to === 'arrived' ? { access_check_in: CHECK_IN } : {}),
      })

      expect(response.status, pillarWhy(PILLAR, `${from} -> ${to}`)).toBe(200)
      expect(await response.json(), pillarWhy(PILLAR, `${from} -> ${to}`)).toMatchObject({
        job_id: JOB,
        from_status: from,
        to_status: to,
      })
    }
  })

  it('stores a valid arrival check-in with the worker identity and access state', async () => {
    const { client, run } = setup({ status: 'worker_on_way' })
    const response = await run({ status: 'arrived', access_check_in: CHECK_IN })

    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(jobWrites(client)).toEqual([['update', expect.objectContaining({
      status: 'arrived',
      apartment_access_state: expect.objectContaining({
        worker_checked_in: true,
        evidence_mode: 'geofence',
        check_in: expect.objectContaining({ worker_id: WORKER, lat: BUILDING.lat, lng: BUILDING.lng }),
      }),
    })]])
  })

  it('rejects a skipped phase before any job write', async () => {
    const { client, run } = setup({ status: 'worker_matched' })
    const response = await run({ status: 'inspecting' })

    expect(response.status, pillarWhy(PILLAR, 'worker_matched cannot skip on-way and arrival')).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'INVALID_STATUS' })
    expect(jobWrites(client)).toEqual([])
  })

  it('refuses an unassigned Worker before changing the job', async () => {
    const { client, run } = setup({ status: 'worker_matched', jobWorkerId: null })
    const response = await run({ status: 'worker_on_way' })

    expect(response.status, pillarWhy(PILLAR, 'an unassigned Worker cannot advance another job')).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(jobWrites(client)).toEqual([])
  })

  it('rejects an arrival outside the geofence before mutation', async () => {
    const { client, run } = setup({ status: 'worker_on_way' })
    const response = await run({
      status: 'arrived',
      access_check_in: { ...CHECK_IN, lat: 10.8, lng: 106.8 },
    })

    expect(response.status, pillarWhy(PILLAR, 'a distant client coordinate is not arrival evidence')).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
    expect(jobWrites(client)).toEqual([])
  })

  it('accepts a retried arrival check-in after the first response was lost', async () => {
    const { client, run } = setup({ status: 'arrived' })
    const response = await run({ status: 'arrived', access_check_in: CHECK_IN })

    expect(response.status, pillarWhy(PILLAR, 'same-status arrival is a check-in retry')).toBe(200)
    expect(jobWrites(client)).toEqual([['update', expect.objectContaining({
      status: 'arrived',
      apartment_access_state: expect.objectContaining({ worker_checked_in: true }),
    })]])
  })

  it('reports a stale status compare-and-set as a recoverable conflict', async () => {
    const { client, run } = setup({ status: 'worker_matched', updated: { data: null, error: null } })
    const response = await run({ status: 'worker_on_way' })

    expect(response.status, pillarWhy(PILLAR, 'a zero-row update means another status won the race')).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'STATUS_CHANGED' })
    expect(client.calls.filter((call) => call.table === 'jobs').at(-1)?.operations)
      .toContainEqual(['eq', 'status', 'worker_matched'])
  })
})

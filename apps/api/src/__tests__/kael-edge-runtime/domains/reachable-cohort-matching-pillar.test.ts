import { describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { queryEligibleWorkers } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/broadcast-workers'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import {
  isCohortEligible,
  isWorkerReachable,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/reachability'

export const PILLAR = {
  id: 'P50-reachable-cohort-matching',
  invariant:
    'matching admits only push-proven or recently foreground workers and synthetic cohorts never mix with each other or real jobs',
  authority: ['docs/dev-suggestion/stage1-intake-quote-admin-proposal.md (real recipient and synthetic isolation gates)'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/reachability.ts',
  layer: 'integration',
  siblings: ['P48-durable-confirmation-operation', 'P49-durable-matching-delivery'],
  mutation: 'treat availability as reachability or allow a null cohort to match a synthetic cohort; the isolation cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const JOB_ID = '50000000-0000-4000-8000-000000000050'

function worker(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    rating: 5,
    total_jobs: 100,
    selected_service_types: ['electrical'],
    active_service_types: ['electrical'],
    service_types: ['electrical'],
    districts: ['district_1'],
    problem_specializations: [
      'electrical_fault_isolation',
      'fixed_wiring_and_panel_safety',
    ],
    synthetic_cohort_id: 'release-a',
    matching_push_proven_at: '2026-08-23T04:00:00.000Z',
    matching_foreground_active_until: '2099-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function matchingClient(
  candidates: Array<Record<string, unknown>>,
  requiredCapabilities = [
    'electrical_fault_isolation',
    'fixed_wiring_and_panel_safety',
  ],
): DbClient {
  return makeSequenceClient([], {}, {
    jobs: [
      {
        data: {
          customer_id: null,
          address_lat: null,
          address_lng: null,
          problem_chips: [],
          service_problem_id: null,
          kael_problem_identified: null,
          diagnosis_scope: { worker_requirements: requiredCapabilities },
          intake_scope_snapshot: null,
          quote_mode: 'rfq',
          synthetic_cohort_id: 'release-a',
        },
        error: null,
      },
      { data: [], error: null },
    ],
    worker_profiles: [{ data: candidates, error: null }],
    job_worker_candidates: [{ data: [], error: null }],
    worker_kael_memory: [{ data: [], error: null }],
  }) as unknown as DbClient
}

describe('worker reachability and cohort isolation', () => {
  const now = new Date('2026-08-23T04:10:00.000Z')

  it('accepts proven push or a recent foreground heartbeat', () => {
    expect(isWorkerReachable({
      pushProvenAt: '2026-08-23T04:00:00.000Z',
      foregroundActiveUntil: null,
      currentPushTokenUpdatedAts: ['2026-08-23T03:59:00.000Z'],
    }, now)).toBe(true)
    expect(isWorkerReachable({ pushProvenAt: null, foregroundActiveUntil: '2026-08-23T04:11:00.000Z' }, now)).toBe(true)
  })

  it('rejects unavailable delivery paths', () => {
    expect(
      isWorkerReachable({ pushProvenAt: null, foregroundActiveUntil: '2026-08-23T04:09:59.999Z' }, now),
      pillarWhy(PILLAR, 'available is not synonymous with reachable'),
    ).toBe(false)
  })

  it('expires old push proof and invalidates proof from a previous token generation', () => {
    expect(isWorkerReachable({
      pushProvenAt: '2026-08-21T04:10:00.000Z',
      foregroundActiveUntil: null,
      currentPushTokenUpdatedAts: ['2026-08-21T04:00:00.000Z'],
    }, now)).toBe(false)
    expect(isWorkerReachable({
      pushProvenAt: '2026-08-23T04:00:00.000Z',
      foregroundActiveUntil: null,
      currentPushTokenUpdatedAts: ['2026-08-23T04:01:00.000Z'],
    }, now)).toBe(false)
  })

  it('keeps every synthetic cohort isolated from real traffic and other cohorts', () => {
    expect(isCohortEligible(null, null)).toBe(true)
    expect(isCohortEligible('release-a', 'release-a')).toBe(true)
    expect(isCohortEligible('release-a', null)).toBe(false)
    expect(isCohortEligible(null, 'release-a')).toBe(false)
    expect(isCohortEligible('release-a', 'release-b')).toBe(false)
  })

  it('filters more than five higher-ranked unreachable or wrong-cohort workers before slicing', async () => {
    const blocked = [
      worker('50000000-0000-4000-8000-000000000001', { synthetic_cohort_id: 'release-b' }),
      worker('50000000-0000-4000-8000-000000000002', { synthetic_cohort_id: null }),
      worker('50000000-0000-4000-8000-000000000003', { synthetic_cohort_id: 'release-b' }),
      worker('50000000-0000-4000-8000-000000000004', {
        matching_push_proven_at: null,
        matching_foreground_active_until: '2020-01-01T00:00:00.000Z',
      }),
      worker('50000000-0000-4000-8000-000000000005', {
        matching_push_proven_at: null,
        matching_foreground_active_until: null,
      }),
      worker('50000000-0000-4000-8000-000000000006', {
        matching_push_proven_at: null,
        matching_foreground_active_until: '2020-01-01T00:00:00.000Z',
      }),
    ]
    const validWorker = worker('50000000-0000-4000-8000-000000000007', {
      rating: 1,
      total_jobs: 0,
    })

    const result = await queryEligibleWorkers(
      matchingClient([...blocked, validWorker]),
      'electrical',
      'district_1',
      1,
      { jobId: JOB_ID },
    )

    expect(result, pillarWhy(PILLAR, 'selection starvation must not hide a valid lower-ranked recipient'))
      .toEqual({ success: true, workers: [{ id: validWorker.id }] })
  })

  it('admits all capabilities while rejecting zero and partial capability sets', async () => {
    const zero = worker('50000000-0000-4000-8000-000000000011', {
      problem_specializations: [],
    })
    const partial = worker('50000000-0000-4000-8000-000000000012', {
      problem_specializations: ['electrical_fault_isolation'],
    })
    const complete = worker('50000000-0000-4000-8000-000000000013')

    const result = await queryEligibleWorkers(
      matchingClient([zero, partial, complete]),
      'electrical',
      'district_1',
      5,
      { jobId: JOB_ID },
    )

    expect(result, pillarWhy(PILLAR, 'a governed job requires every declared worker capability'))
      .toEqual({ success: true, workers: [{ id: complete.id }] })
  })

})

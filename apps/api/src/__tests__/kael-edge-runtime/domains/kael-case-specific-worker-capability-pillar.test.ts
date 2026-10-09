import { describe, expect, it } from 'vitest'
import { workerServicePreferencesUpdateSchema } from '@nestscout/shared'
import { workerServicePreferencesUpdateSchema as edgeWorkerServicePreferencesUpdateSchema } from '../../../../../../supabase/functions/_shared/contracts/worker'

import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { type DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/learning/performance-profiles'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'
import { matchingWorkerRequirementsForCase } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-intake-policy'
import { loadJobGeoForMatching, resolveMatchingWorkerRequirements } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/broadcast-support'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P350-kael-case-specific-worker-capabilities',
  invariant:
    'a confirmed case requires only the capability keys named by its active service policy, never every capability supported by that service profile',
  authority: [
    'governance/STRUCTURES.md §6 (matching uses the confirmed work scope)',
    'governance/RULES.md #8 (matching eligibility must reflect validated data)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support.ts',
  layer: 'unit',
  siblings: ['P349-worker-six-service-registration', 'P344-kael-price-knowledge-reuse'],
  mutation:
    'union the complete service profile capability list into the case requirement list; the single-requirement and no-requirement cases turn red',
} as const satisfies PillarManifest

describe(`${PILLAR.id}: case-specific worker requirements`, () => {
  installEdgeRuntimeTestHooks()

  it('keeps unrelated HVAC skills out of a case requiring diagnosis only', () => {
    const profile = getKaelPerformanceProfile('hvac')
    expect(profile).not.toBeNull()

    expect(
      matchingWorkerRequirementsForCase(
        profile?.worker_capabilities ?? [],
        ['hvac_fault_diagnosis'],
      ),
      pillarWhy(PILLAR, 'this case requires diagnosis, not every listed HVAC specialty'),
    ).toEqual(['hvac_fault_diagnosis'])
  })

  it('does not turn the service catalog into required skills when the policy has no case-specific requirement', () => {
    const profile = getKaelPerformanceProfile('hvac')
    expect(profile).not.toBeNull()

    expect(
      matchingWorkerRequirementsForCase(profile?.worker_capabilities ?? [], []),
      pillarWhy(PILLAR, 'an empty case policy must stay empty'),
    ).toEqual([])
  })

  it('starts a new case without treating every service capability as mandatory', () => {
    const artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: 'hvac',
      customerGoal: 'Máy lạnh chảy nước',
    })

    expect(artifact.worker_requirements).toEqual([])
  })

  it('replaces a legacy service-wide snapshot with the active case policy requirements', () => {
    const profile = getKaelPerformanceProfile('hvac')
    expect(profile).not.toBeNull()

    expect(
      resolveMatchingWorkerRequirements(
        'hvac',
        profile?.worker_capabilities ?? [],
        ['hvac_fault_diagnosis'],
      ),
      pillarWhy(PILLAR, 'old jobs must not keep the broken service-wide requirement snapshot'),
    ).toEqual(['hvac_fault_diagnosis'])
  })

  it('loads the active case policy before retrying a job with a legacy service-wide snapshot', async () => {
    const profile = getKaelPerformanceProfile('hvac')
    expect(profile).not.toBeNull()
    const client = makeSequenceClient([
      {
        data: {
          customer_id: 'customer-1',
          address_lat: null,
          address_lng: null,
          problem_chips: [],
          service_type: 'hvac',
          service_problem_id: 'problem-water-leak',
          kael_problem_identified: 'water_leak',
          diagnosis_scope: { worker_requirements: profile?.worker_capabilities ?? [] },
          intake_scope_snapshot: null,
          quote_mode: null,
          synthetic_cohort_id: null,
        },
        error: null,
      },
      { data: { capability_requirements: ['hvac_fault_diagnosis'] }, error: null },
    ])

    const jobGeo = await loadJobGeoForMatching(client as unknown as DbClient, 'job-hvac-legacy', 'hvac')

    expect(jobGeo?.workerRequirements).toEqual(['hvac_fault_diagnosis'])
    expect(client.calls[1]?.table).toBe('service_intake_policies')
    expect(client.calls[1]?.operations).toContainEqual(['eq', 'status', 'active'])
    expect(client.calls[1]?.operations).toContainEqual(['eq', 'service_problem_id', 'problem-water-leak'])
  })

  it('preserves a case-specific snapshot instead of replacing it with a newer policy', () => {
    expect(
      resolveMatchingWorkerRequirements(
        'hvac',
        ['hvac_cleaning'],
        ['hvac_fault_diagnosis'],
      ),
      pillarWhy(PILLAR, 'a valid saved case scope must remain bound to its confirmed work'),
    ).toEqual(['hvac_cleaning'])
  })

  it('accepts worker capability edits only within their selected service categories', () => {
    const valid = {
      selected_service_types: ['hvac'],
      problem_specializations: ['hvac_fault_diagnosis'],
    }
    const wrongService = {
      selected_service_types: ['hvac'],
      problem_specializations: ['electrical_fault_isolation'],
    }
    const duplicate = {
      selected_service_types: ['hvac'],
      problem_specializations: ['hvac_fault_diagnosis', 'hvac_fault_diagnosis'],
    }
    for (const schema of [workerServicePreferencesUpdateSchema, edgeWorkerServicePreferencesUpdateSchema]) {
      expect(schema.safeParse(valid).success).toBe(true)
      expect(schema.safeParse(wrongService).success).toBe(false)
      expect(schema.safeParse(duplicate).success).toBe(false)
    }
  })

  it('broadcasts a case to a selected worker who has the required diagnosis skill but not every HVAC specialty', async () => {
    const profile = getKaelPerformanceProfile('hvac')
    expect(profile).not.toBeNull()
    const requirements = matchingWorkerRequirementsForCase(
      profile?.worker_capabilities ?? [],
      ['hvac_fault_diagnosis'],
    )
    const client = makeSequenceClient([
      { data: { id: 'job-hvac', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'hvac', address_district: 'q7', kael_price_max: 400000, final_price: null }, error: null },
      { data: { id: 'job-hvac' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null, diagnosis_scope: { worker_requirements: requirements } }, error: null },
      { data: [], error: null },
      { data: [{ id: 'worker-hvac', rating: 4.8, total_jobs: 12, selected_service_types: ['hvac'], active_service_types: ['hvac'], districts: ['q7'], problem_specializations: ['hvac_fault_diagnosis'] }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: 'broadcast-hvac', worker_id: 'worker-hvac' }], error: null },
      { data: [{ notification_id: 'notification-hvac' }], error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-hvac')).resolves.toMatchObject({
      job_id: 'job-hvac',
      status: 'broadcasting',
      broadcast_sent: true,
    })
    expect(client.calls.find((call) => call.table === 'rpc:activate_job_broadcast_batch_atomic')?.operations).toContainEqual([
      'rpc',
      'activate_job_broadcast_batch_atomic',
      expect.objectContaining({ p_job_id: 'job-hvac', p_worker_ids: ['worker-hvac'] }),
    ])
    expect(requirements, pillarWhy(PILLAR, 'the case asks for one verified skill only')).toEqual(['hvac_fault_diagnosis'])
  })
})

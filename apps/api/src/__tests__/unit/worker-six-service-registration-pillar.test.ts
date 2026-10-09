import { describe, expect, it } from 'vitest'

import { SERVICE_TYPES, WORKER_SERVICE_CAPABILITIES, workerRegistrationDraftSchema } from '@nestscout/shared'
import { workerRegistrationDraftSchema as edgeDraftSchema } from '../../../../../supabase/functions/_shared/contracts/worker'
import { getKaelPerformanceProfile } from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/performance-profiles'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P349-worker-six-service-registration',
  invariant: 'a worker can explicitly declare the capabilities of all six supported services without truncation; oversized input remains rejected',
  authority: ['governance/RULES.md #6 (six supported services)', 'governance/structures/worker-workflow.md B0'],
  target: 'packages/shared/src/contracts/worker.ts',
  layer: 'integration',
  siblings: ['P71-worker-readiness-onboarding'],
  mutation: 'restore the 20-capability limit; the six-service registration case rejects 25 required capabilities',
} as const satisfies PillarManifest

const capabilities = [...new Set(SERVICE_TYPES.flatMap(service =>
  [...(getKaelPerformanceProfile(service)?.worker_capabilities ?? [])],
))]

describe('six-service worker capability registration', () => {
  it.each(SERVICE_TYPES)('uses the same %s capability keys in registration and Matching', service => {
    expect(Object.keys(WORKER_SERVICE_CAPABILITIES[service]).sort()).toEqual(
      [...(getKaelPerformanceProfile(service)?.worker_capabilities ?? [])].sort(),
    )
  })
  it.each([['mobile', workerRegistrationDraftSchema], ['Edge', edgeDraftSchema]] as const)(
    '%s accepts every explicitly declared capability across the six launch services',
    (runtime, schema) => {
      const parsed = schema.safeParse({ service_types: [...SERVICE_TYPES], problem_specializations: capabilities })
      expect(capabilities, pillarWhy(PILLAR, JSON.stringify({ runtime, capabilities }))).toHaveLength(25)
      expect(parsed.success, pillarWhy(PILLAR, JSON.stringify({ runtime, result: parsed }))).toBe(true)
      if (parsed.success) expect(parsed.data.problem_specializations).toEqual(capabilities)
    },
  )

  it.each([['mobile', workerRegistrationDraftSchema], ['Edge', edgeDraftSchema]] as const)(
    '%s rejects declarations beyond the bounded capability limit',
    (runtime, schema) => {
      const parsed = schema.safeParse({ problem_specializations: Array.from({ length: 26 }, (_, index) => `skill_${index}`) })
      expect(parsed.success, pillarWhy(PILLAR, JSON.stringify({ runtime, result: parsed }))).toBe(false)
    },
  )

  it.each([['mobile', workerRegistrationDraftSchema], ['Edge', edgeDraftSchema]] as const)(
    '%s rejects unknown skills and skills outside the selected service',
    (runtime, schema) => {
      const wrongService = schema.safeParse({
        service_types: ['hvac'],
        problem_specializations: ['electrical_fault_isolation'],
      })
      const unknownSkill = schema.safeParse({
        service_types: ['hvac'],
        problem_specializations: ['hvac_unlisted_skill'],
      })

      expect(wrongService.success, pillarWhy(PILLAR, JSON.stringify({ runtime, wrongService }))).toBe(false)
      expect(unknownSkill.success, pillarWhy(PILLAR, JSON.stringify({ runtime, unknownSkill }))).toBe(false)
    },
  )
})

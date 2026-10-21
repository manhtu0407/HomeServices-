import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { kaelEmergencyGuidanceCopy, readKaelEmergencyGuidance, kaelEmergencyGuidanceSchema } from '../../../../../packages/shared/src/contracts/emergency-guidance'
import * as edge from '../../../../../supabase/functions/_shared/contracts/emergency-guidance'
import { requestEmergencyFields, setRequestEmergencyGuidance, clearRequestEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/platform/emergency-guidance'
import { type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P417-kael-emergency-error-contract',
  invariant: 'both clients accept only versioned closed route metadata and render the frozen deterministic safety copy; private text and unknown fields never cross the safety contract',
  authority: ['governance/RULES.md #9 (no private request content in new safety fields)'],
  target: 'packages/shared/src/contracts/emergency-guidance.ts', layer: 'unit',
  siblings: ['P416-kael-emergency-error-delivery'],
  mutation: 'allow extra fields or change one translation: schema privacy and deterministic-copy parity turn red',
} as const satisfies PillarManifest

const routes = kaelEmergencyGuidanceSchema.shape.route.options
const classifierSource = readFileSync('../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts', 'utf8')
const frozenCopy = [...classifierSource.matchAll(/    (vi|en): ("[^"\n]+"),/g)].map(m => JSON.parse(m[2]) as string)

describe(PILLAR.id, () => {
  it.each(routes)('keeps exact VI/EN copy and wire compatibility for %s', route => {
    const payload = { version: 'v1', route }
    expect(readKaelEmergencyGuidance(payload)).toEqual(payload)
    expect(edge.readKaelEmergencyGuidance(payload)).toEqual(payload)
    for (const language of ['vi', 'en'] as const) {
      expect(kaelEmergencyGuidanceCopy(route, language)).toBe(edge.kaelEmergencyGuidanceCopy(route, language))
      expect(frozenCopy).toContain(kaelEmergencyGuidanceCopy(route, language))
    }
  })
  it.each([null, {}, [], { version: 'v2', route: 'fire' }, { version: 'v1', route: 'invented' },
    { version: 'v1', route: 'fire', text: 'private transcript' }, { version: 'v1', route: 'fire', address: 'private' },
    { version: 'v1', route: 'fire', actor_hash: 'private' }])('rejects invalid/private metadata %j', value => {
    expect(readKaelEmergencyGuidance(value)).toBeNull()
    expect(edge.readKaelEmergencyGuidance(value)).toBeNull()
  })
  it('isolates requests and clears reused contexts without storing customer words', () => {
    const first = {}; const other = {}
    setRequestEmergencyGuidance(first, { version: 'v1', route: 'fire' })
    expect(requestEmergencyFields(first)).toEqual({ emergency: { version: 'v1', route: 'fire' } })
    expect(requestEmergencyFields(other)).toEqual({})
    clearRequestEmergencyGuidance(first)
    expect(requestEmergencyFields(first)).toEqual({})
  })
})

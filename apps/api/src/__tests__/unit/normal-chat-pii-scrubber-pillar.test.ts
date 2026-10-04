import { describe, expect, it } from 'vitest'

import { scrubSensitiveForLLM as scrubSharedSensitiveForLLM } from '@nestscout/shared'
import { scrubSensitiveForLLM as scrubEdgeSensitiveForLLM } from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/utils'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P254-normal-chat-pii-scrubber-parity',
  invariant: 'English floor and private unit identifiers are scrubbed before normal-chat model requests in both runtimes',
  authority: [
    'governance/protocols/ai-data-security.md (unit number and floor are sensitive PII)',
    'governance/Plan.md #57.4.1 (normal-chat transcripts and memory are scrubbed before model requests)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/pipeline/utils.ts',
  layer: 'unit',
  siblings: ['P253-kael-normal-chat-session-memory', 'P11-kael-routing-conformance'],
  mutation: 'remove English floor or unit labels from either runtime scrubber; the shared parity assertion turns red',
} as const satisfies PillarManifest

describe('normal-chat PII scrubber parity', () => {
  it.each([
    ['Floor 12, unit A.25.07', '[floor], [unit]'],
    ['My unit is A.25.07 on floor 12', 'My [unit] on [floor]'],
    ['level 3, apartment 8C', '[floor], [unit]'],
    ['floor 7, unit a', '[floor], [unit]'],
  ])(pillarWhy(PILLAR), (input, expected) => {
    expect(scrubEdgeSensitiveForLLM(input)).toBe(expected)
    expect(scrubSharedSensitiveForLLM(input)).toBe(expected)
  })

  it.each([
    'Apartment 65 m2 includes 2 bedrooms',
    'A 65m² apartment has two bedrooms',
  ])('preserves English cleaning-area measurements: %s', (input) => {
    expect(scrubEdgeSensitiveForLLM(input)).toBe(input)
    expect(scrubSharedSensitiveForLLM(input)).toBe(input)
  })
})

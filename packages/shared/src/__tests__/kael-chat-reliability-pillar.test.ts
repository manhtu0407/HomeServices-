import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { kaelChatCreateSchema, kaelChatTurnSchema } from '../contracts/kael-chat'
import { inferLocalDealDraftFromKael, validateLocalDealDraft } from '../mobile-workflow/draft'
import { pillarWhy, type PillarManifest } from './pillar-manifest'

export const PILLAR = {
  id: 'P182-kael-chat-input-and-scope-contract',
  invariant: 'shared Kael intake preserves the six-service boundary, rejects unsupported categories before a Case can start, and keeps message validation aligned at the one-to-5000-character boundary',
  authority: ['governance/RULES.md #3 and #6', 'packages/shared/src/contracts/kael-chat.ts'],
  target: 'packages/shared/src/mobile-workflow/draft.ts and packages/shared/src/contracts/kael-chat.ts',
  layer: 'unit',
  siblings: ['P181-kael-composer-and-failure-boundary', 'P104-kael-ephemeral-state-scope'],
  mutation: 'remove unsupported-service detection, allow an unsupported draft through validation, or loosen the whitespace/5000-character schema boundary; a collected assertion fails',
} as const satisfies PillarManifest

describe('Kael shared input boundary', () => {
  it('declines unsupported services before any local Case draft becomes actionable', () => {
    const unsupported = inferLocalDealDraftFromKael('Tôi cần sửa xe máy ở quận 3')
    const supported = inferLocalDealDraftFromKael('Điều hòa phòng ngủ không lạnh ở quận 3')

    expect(unsupported, pillarWhy(PILLAR, 'unsupported service must stop before service selection')).toMatchObject({
      serviceType: null,
      unsupportedServiceLabel: expect.any(String),
    })
    expect(validateLocalDealDraft(unsupported)).toContain('sáu dịch vụ')
    expect(supported, pillarWhy(PILLAR, 'supported HVAC language must remain actionable')).toMatchObject({
      serviceType: 'hvac',
      unsupportedServiceLabel: null,
    })
  })

  it('holds the message schemas to non-empty and 5000-character boundaries', () => {
    withPillarContext(PILLAR, () => {
      expect(kaelChatTurnSchema.safeParse({ message: '   ' }).success).toBe(false)
      expect(kaelChatTurnSchema.safeParse({ message: 'A'.repeat(5_000) }).success).toBe(true)
      expect(kaelChatTurnSchema.safeParse({ message: 'A'.repeat(5_001) }).success).toBe(false)
      expect(kaelChatCreateSchema.safeParse({ service_type: 'hvac', message: 'A'.repeat(5_000) }).success).toBe(true)
      expect(kaelChatCreateSchema.safeParse({ service_type: 'hvac', message: 'A'.repeat(5_001) }).success).toBe(false)
    })
  })

  it('keeps shared service-intake imports pointed at leaf modules', () => {
    const engine = readFileSync(new URL('../service-intake/engine.ts', import.meta.url), 'utf8')
    const caseWork = readFileSync(new URL('../kael-case-work.ts', import.meta.url), 'utf8')

    withPillarContext(PILLAR, () => {
      expect(engine).toContain("from '../contracts/job'")
      expect(engine).not.toContain("from '../validation'")
      expect(caseWork).toContain("from './service-intake/types'")
      expect(caseWork).not.toContain("from './service-intake'")
    })
  })
})

function withPillarContext(pillar: PillarManifest, assertion: () => void) {
  try {
    assertion()
  } catch (error) {
    if (error instanceof Error) error.message = `${pillarWhy(pillar)}\n\n${error.message}`
    throw error
  }
}

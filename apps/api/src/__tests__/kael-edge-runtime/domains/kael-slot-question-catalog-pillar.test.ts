import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/learning/performance-profiles'
import {
  INTAKE_SLOT_QUESTIONS,
  isPlaceholderQuestion,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/language/intake-slot-questions'
import { localizedPolicyQuestion } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/unpriced-request-review'
import { clarificationNextActions } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/clarification-next-actions'
import { kaelNextActionsSchema } from '../../../../../../supabase/functions/_shared/contracts/kael-next-actions'

export const PILLAR = {
  id: 'P367-kael-slot-question-catalog',
  invariant:
    'every intake field and every quote driver of the six services has one focused Vietnamese and English question with a sample answer, the published placeholder and raw field names never reach a customer, and a clarification offers at most a few one-tap answers',
  authority: [
    'governance/RULES.md #5 (Vietnamese-first copy, no mixed languages)',
    'CLAUDE.md Product Context (one focused question per turn until quote-ready)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/language/intake-slot-questions.ts',
  layer: 'unit',
  siblings: ['P364-kael-evidence-gap-options'],
  mutation:
    'delete one quote-driver entry — the coverage case turns red; return the override even when it is the placeholder — the placeholder case turns red',
} as const satisfies PillarManifest

const SERVICES = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'] as const
const TIER_A = ['service_type', 'problem_slug', 'address_district', 'address_label', 'scheduled_at', 'description_min']
const VIETNAMESE = /[À-ǯẠ-ỿ]/u

const policy = (overrides: Record<string, unknown>) => ({
  policyId: 'policy-1',
  version: 1,
  quoteMode: 'kael_auto_quote' as const,
  tierAFields: TIER_A,
  tierBSlots: [],
  questionOverrides: overrides,
  capabilityRequirements: [],
  safetyRequirements: [],
  evidenceRequirements: { minimumSourceCount: 2, minimumHighTrustSourceCount: 2, requiresActiveBaseline: false, allowLiveMarketEvidence: true, unavailableFallback: null },
  missingTierA: [],
})

describe(`${PILLAR.id}: Kael asks for exactly what it needs`, () => {
  it('covers every Tier A field and every quote driver of the six services in both languages', () => {
    const fields = [...TIER_A, ...SERVICES.flatMap((service) => getKaelPerformanceProfile(service)?.quote_drivers ?? [])]
    expect(fields.length).toBeGreaterThan(30)
    for (const field of fields) {
      const entry = INTAKE_SLOT_QUESTIONS[field]
      expect(entry, pillarWhy(PILLAR, `missing catalog entry for ${field}`)).toBeDefined()
      expect(VIETNAMESE.test(entry!.vi.question), pillarWhy(PILLAR, `${field} Vietnamese question`)).toBe(true)
      expect(VIETNAMESE.test(entry!.en.question), pillarWhy(PILLAR, `${field} English question has no Vietnamese`)).toBe(false)
      expect(entry!.vi.label.length).toBeLessThanOrEqual(60)
      expect(entry!.en.label.length).toBeLessThanOrEqual(60)
      expect(entry!.vi.example.length).toBeGreaterThan(0)
    }
  })

  it('never shows the published placeholder or a raw field name', () => {
    const placeholder = { address_label: { vi: 'Anh/chị có thể bổ sung chi tiết này không?', en: 'Can you add this detail?' } }
    const vi = localizedPolicyQuestion(policy(placeholder) as never, 'address_label', 'vi')
    expect(isPlaceholderQuestion(vi), pillarWhy(PILLAR, 'Production policies carry this placeholder for every slot')).toBe(false)
    expect(vi).toContain('Tên tòa')
    expect(localizedPolicyQuestion(policy({}) as never, 'unknown_field_key', 'vi'), pillarWhy(PILLAR, 'no snake_case field reaches the customer')).not.toMatch(/_/)
    const custom = { address_label: { vi: 'Bạn ở tòa nào?', en: 'Which building?' } }
    expect(localizedPolicyQuestion(policy(custom) as never, 'address_label', 'vi'), pillarWhy(PILLAR, 'a real override still wins')).toBe('Bạn ở tòa nào?')
  })

  it('turns a clarification into at most a few valid one-tap answers', () => {
    const actions = clarificationNextActions({
      artifact_proposal: { missing_fields: ['item_dimensions_weight_and_quantity', 'wall_surface_or_substrate', 'mounting_location_access_and_height', 'description_or_photo'] },
    }, 'vi')
    expect(actions.map((action) => action.kind)).toEqual(['provide_detail', 'provide_detail', 'attach_photo'])
    expect(actions[0]).toMatchObject({ slot: 'item_dimensions_weight_and_quantity', message: 'Kệ gỗ 30x20cm, nặng khoảng 1kg.' })
    expect(kaelNextActionsSchema.safeParse(actions).success).toBe(true)
    expect(clarificationNextActions({}, 'en')).toEqual([])
  })
})

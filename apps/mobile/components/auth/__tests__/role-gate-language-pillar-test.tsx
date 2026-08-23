import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import {
  roleGateGreetingVariantsByLanguage,
  selectRoleGateGreeting,
} from '../entry-access/role-gate-greeting'
import { entryAccessCopy } from '../entry-access/copy'

export const PILLAR = {
  id: 'P64-role-gate-language-integrity',
  invariant: 'the native role gate renders a greeting from the selected VI or EN catalog without cross-language leakage',
  authority: [
    'AGENTS.md Language Rules (one selected language per visible screen)',
    'governance/RULES.md #8 (honest user-facing runtime)',
  ],
  target: 'apps/mobile/components/auth/entry-access/copy.ts',
  layer: 'integration',
  siblings: ['P42-auth-session-shell'],
  mutation: 'map the vi catalog back to the English variants; the native language-integrity assertion turns red',
} as const satisfies PillarManifest

describe('native role-gate language integrity', () => {
  it('keeps every Vietnamese greeting distinct from the English catalog', () => {
    const vietnamese = Object.values(roleGateGreetingVariantsByLanguage.vi).flat()
    const english = Object.values(roleGateGreetingVariantsByLanguage.en).flat()
    const englishHeadlines = new Set(english.map((greeting) => greeting.headline))

    withPillarContext(PILLAR, () => {
      expect(vietnamese).toHaveLength(20)
      expect(english).toHaveLength(20)
      expect(vietnamese.every((greeting) => !englishHeadlines.has(greeting.headline))).toBe(true)
      expect(vietnamese.every((greeting) => /[À-ỹ]/u.test(greeting.headline))).toBe(true)
    }, 'Vietnamese mode must not reuse an English greeting')
  })

  it('selects from the requested locale for the same time and random input', () => {
    const now = new Date(2026, 7, 23, 13, 40)

    withPillarContext(PILLAR, () => {
      expect(selectRoleGateGreeting(now, () => 0.8, 'vi')).not.toEqual(
        selectRoleGateGreeting(now, () => 0.8, 'en'),
      )
    }, 'locale selection must remain part of the native greeting lookup')
  })

  it('keeps the Vietnamese login title localized after role selection', () => {
    withPillarContext(PILLAR, () => {
      expect(entryAccessCopy.vi.login.title).toBe('Chào mừng trở lại!')
      expect(entryAccessCopy.vi.login.title).not.toBe(entryAccessCopy.en.login.title)
    }, 'the role gate must not hand Vietnamese users to an English login title')
  })
})

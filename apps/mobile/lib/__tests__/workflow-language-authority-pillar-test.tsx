import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { localizedStatusLabel } from '../app-language'

export const PILLAR = {
  id: 'P73-workflow-language-authority',
  invariant:
    'critical Customer decision states name the Customer as authority and resolve to exactly one selected language',
  authority: [
    'AGENTS.md Language Rules (one selected language per visible screen)',
    'governance/RULES.md #7 (Kael never acts as the Customer)',
  ],
  target: 'apps/mobile/lib/app-language.ts',
  layer: 'integration',
  siblings: ['P06-payment-unlock-gate', 'P64-role-gate-language-integrity'],
  mutation:
    'restore Kael as the completion actor or reuse an English decision label in VI — the exact locale and authority matrix turns red',
} as const satisfies PillarManifest

describe('workflow language and Customer authority', () => {
  it.each([
    ['awaiting_customer_confirm', 'Chờ khách xác nhận yêu cầu', 'Awaiting customer confirmation'],
    ['scope_change_pending', 'Chờ khách duyệt đổi phạm vi', 'Awaiting customer scope decision'],
    ['confirmed_by_customer', 'Khách đã xác nhận hoàn tất', 'Customer confirmed completion'],
  ] as const)('localizes %s without assigning the decision to Kael', (status, vi, en) => {
    withPillarContext(PILLAR, () => {
      expect(localizedStatusLabel(status, 'vi')).toBe(vi)
      expect(localizedStatusLabel(status, 'en')).toBe(en)
      expect(vi).not.toMatch(/\bKael\b/u)
      expect(en).not.toMatch(/\bKael\b/u)
      expect(vi).not.toBe(en)
    })
  })
})

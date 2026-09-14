import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { canSubmitCustomerKaelComposer } from '../kael-chat/customer-kael-composer-state'
import { customerKaelInlineError } from '../kael-chat/customer-kael-error-display'
import {
  CUSTOMER_KAEL_MESSAGE_MAX_LENGTH,
  customerKaelMessageLengthError,
} from '../kael-chat/customer-kael-message-limits'
import { preAgenticUnsupportedService } from '../kael-chat/customer-kael-pre-agentic-copy'

export const PILLAR = {
  id: 'P181-kael-composer-and-failure-boundary',
  invariant: 'Kael never submits an empty composer, never sends a message beyond the shared 5000-character boundary, keeps media in Work handling, and renders one user-facing failure copy',
  authority: ['governance/RULES.md #3, #6, and #7', 'governance/protocols/frontend-test.md G3 and G4'],
  target: 'apps/mobile/components/customer/kael-chat/kael-chat-composer.tsx',
  layer: 'unit',
  siblings: ['P104-kael-ephemeral-state-scope', 'P75-transaction-critical-route-coverage'],
  mutation: 'allow whitespace submission, lower the UI boundary without the contract constant, render an inline failure beside the receipt, or mix VI and EN decline copy; an assertion fails',
} as const satisfies PillarManifest

describe('Kael composer and failure boundary', () => {
  it('only enables send for meaningful content and keeps the shared length limit', () => {
    withPillarContext(PILLAR, () => {
      expect(canSubmitCustomerKaelComposer({ busy: false, draft: '   ', mediaDraftCount: 0, voiceTranscript: '' })).toBe(false)
      expect(canSubmitCustomerKaelComposer({ busy: false, draft: 'Hello Kael', mediaDraftCount: 0, voiceTranscript: '' })).toBe(true)
      expect(canSubmitCustomerKaelComposer({ busy: false, draft: '', mediaDraftCount: 1, voiceTranscript: '' })).toBe(true)
      expect(canSubmitCustomerKaelComposer({ busy: true, draft: 'Hello Kael', mediaDraftCount: 0, voiceTranscript: '' })).toBe(false)
      expect(CUSTOMER_KAEL_MESSAGE_MAX_LENGTH).toBe(5_000)
      expect(customerKaelMessageLengthError('A'.repeat(5_000), 'vi')).toBeNull()
      expect(customerKaelMessageLengthError('A'.repeat(5_001), 'vi')).toContain('5000')
      expect(customerKaelMessageLengthError('A'.repeat(5_001), 'en')).toContain('5000')
    })
  })

  it('uses the reasoning receipt as the single normal-mode failure surface', () => {
    withPillarContext(PILLAR, () => {
      expect(customerKaelInlineError('Kael is unavailable. Try again.', 'normal', 'failed')).toBeNull()
      expect(customerKaelInlineError('Kael is unavailable. Try again.', 'normal', 'idle')).toBe('Kael is unavailable. Try again.')
      expect(customerKaelInlineError('Media requires a real job.', 'case', 'failed')).toBe('Media requires a real job.')
    })
  })

  it('declines unsupported service scope without leaking the selected language', () => {
    const expectedVietnamese = 'Yêu cầu này hiện chưa thuộc phạm vi NestScout. NestScout đang hỗ trợ sửa điện, sửa nước, vệ sinh nhà cửa, điều hòa và không khí, sofa/nệm/rèm/thảm, cùng sửa vặt và lắp đặt nhỏ.'
    const vietnamese = preAgenticUnsupportedService('vi')
    const english = preAgenticUnsupportedService('en')
    withPillarContext(PILLAR, () => {
      expect(vietnamese).toBe(expectedVietnamese)
      expect(vietnamese).not.toContain('“')
      expect(english).toContain('outside NestScout')
      expect(english).not.toContain('Yêu cầu')
    })
  })
})

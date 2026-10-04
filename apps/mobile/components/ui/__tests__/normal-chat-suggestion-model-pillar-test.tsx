import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import {
  getNormalChatGhostSuffix,
  getNormalChatStarterSuggestions,
} from '../normal-chat-composer-model'
import { NormalChatStarterRail, getNormalChatStarterChipStyle } from '../normal-chat-starter-rail'
import { color } from '@/design/theme'

export const PILLAR = {
  id: 'P302-normal-chat-suggestion-model',
  invariant: 'Normal Kael Chat shows four localized role-aware starter drafts in a single horizontal rail with hidden scroll indicator and mint capsule styling without decorative plus glyphs, and only exposes an unaccepted ghost suffix when the draft is a normalized prefix, the caret is at the end, and composition is inactive; the ghost itself is never part of the draft',
  authority: ['governance/protocols/frontend-test.md G3 and G4', 'governance/RULES.md #2 and #6'],
  target: 'apps/mobile/components/ui/normal-chat-starter-rail.tsx',
  layer: 'unit',
  siblings: ['P205-kael-composer-and-failure-boundary', 'P298-worker-kael-composer-layout'],
  mutation: 'remove role-specific wording, omit a starter, add decorative plus glyphs to chips, change the rail to wrapped cards or show its scroll indicator, alter the confirmed mint capsule colors, skip Unicode or whitespace normalization, show a suffix after a non-terminal selection or during composition, accept a nonmatching suggestion, or append ghost text to the controlled draft; at least one focused assertion turns red',
} as const satisfies PillarManifest

describe('normal Kael Chat suggestion model', () => {
  it.each(['customer', 'worker'] as const)('renders %s starters in a hidden-scrollbar horizontal capsule rail', (role) => {
    const onSelect = jest.fn()

    withPillarContext(PILLAR, () => {
      render(<NormalChatStarterRail actorRole={role} language="vi" onSelect={onSelect} visible />)

      const rail = screen.getByTestId('normal-chat-starter-section')
      expect(rail.props).toMatchObject({ horizontal: true, showsHorizontalScrollIndicator: false })
      expect(rail.props.contentContainerStyle).toMatchObject({ flexDirection: 'row', gap: 8 })
      expect(screen.getAllByRole('button')).toHaveLength(4)
      expect(screen.queryByText('+')).toBeNull()
      expect(screen.queryByText('Chọn một gợi ý hoặc chạm camera để thêm ảnh.')).toBeNull()
      expect(getNormalChatStarterChipStyle()).toMatchObject({
        backgroundColor: '#F2FAF9',
        borderRadius: 26,
        borderWidth: 1,
        minHeight: 52,
        minWidth: 156,
        shadowColor: color.brand.primary,
      })
      expect(getNormalChatStarterChipStyle().opacity).toBe(1)
      expect(getNormalChatStarterChipStyle(true).opacity).toBe(0.84)
    }, 'both roles must use swipeable horizontal suggestions with matching light-mint capsule treatment')

    fireEvent.press(screen.getByTestId(`normal-chat-starter-${role === 'customer' ? 'describe-a-problem' : 'describe-a-fault'}`))
    expect(onSelect).toHaveBeenCalledWith(role === 'customer'
      ? 'Hướng dẫn tôi mô tả vấn đề trong nhà để bạn hỗ trợ rõ hơn.'
      : 'Hướng dẫn tôi mô tả lỗi đang kiểm tra để bạn hỗ trợ rõ hơn.')
  })

  it('provides four localized starters with role-specific problem wording', () => {
    withPillarContext(PILLAR, () => {
      const customerVi = getNormalChatStarterSuggestions('vi', 'customer')
      const workerVi = getNormalChatStarterSuggestions('vi', 'worker')
      const customerEn = getNormalChatStarterSuggestions('en', 'customer')

      expect(customerVi).toHaveLength(4)
      expect(workerVi).toHaveLength(4)
      expect(customerVi[2]?.label).toBe('Mô tả vấn đề')
      expect(workerVi[2]?.label).toBe('Mô tả lỗi')
      expect(customerEn[0]?.label).toBe('What can Kael do?')
      expect(customerEn.map((item) => item.draft).join(' ')).not.toMatch(/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i)
    }, 'each role and language must receive the specified starter set without mixed-mode copy')
  })

  it('shows the complete next-turn suggestion in an empty draft', () => {
    withPillarContext(PILLAR, () => {
      expect(getNormalChatGhostSuffix('', [{ id: 'suggestion-1', text: 'Hãy hướng dẫn tôi từng bước.' }], null))
        .toEqual({ suggestionId: 'suggestion-1', text: 'Hãy hướng dẫn tôi từng bước.' })
    }, 'an unaccepted follow-up is visible but remains separate from the controlled draft')
  })

  it('matches case, Unicode composition, and repeated whitespace without rewriting typed text', () => {
    withPillarContext(PILLAR, () => {
      const draft = 'Hướng   dẫn tôi'.normalize('NFD')
      expect(getNormalChatGhostSuffix(draft, [{ id: 'suggestion-2', text: 'Hướng dẫn tôi mô tả vấn đề trong nhà.' }], {
        start: draft.length,
        end: draft.length,
      })).toEqual({ suggestionId: 'suggestion-2', text: ' mô tả vấn đề trong nhà.' })
      expect(draft).toBe('Hướng   dẫn tôi'.normalize('NFD'))
    }, 'comparison normalization must not alter the user-owned draft')
  })

  it('hides ghost text for a middle cursor, selected range, composition, or unmatched draft', () => {
    withPillarContext(PILLAR, () => {
      const suggestions = [{ id: 'suggestion-3', text: 'Describe the repair issue clearly.' }]
      expect(getNormalChatGhostSuffix('Describe', suggestions, { start: 4, end: 4 })).toBeNull()
      expect(getNormalChatGhostSuffix('Describe', suggestions, { start: 8, end: 9 })).toBeNull()
      expect(getNormalChatGhostSuffix('Describe', suggestions, { start: 8, end: 8 }, true)).toBeNull()
      expect(getNormalChatGhostSuffix('Ask about another topic', suggestions, { start: 23, end: 23 })).toBeNull()
    }, 'the ghost must not appear when the caret, selected text, IME, or prefix no longer matches')
  })
})

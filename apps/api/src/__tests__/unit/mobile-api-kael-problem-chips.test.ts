import { describe, expect, it } from 'vitest'
import { resolveKaelChatProblemChips } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/intake'

describe('Kael chat problem-chip continuity', () => {
  it('preserves the confirmed intake problem when a follow-up sends an empty chip list', () => {
    expect(resolveKaelChatProblemChips([], ['Sửa bản lề/tay nắm'])).toEqual([
      'Sửa bản lề/tay nắm',
    ])
  })
})

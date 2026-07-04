import type { KaelChatTurn } from '@/lib/api-types'

import { normalizeKaelRoutingText } from './case-work-display-model'

export function totalMediaRefs(turns: KaelChatTurn[]) {
  return turns.reduce((total, turn) => total + (Array.isArray(turn.media_refs) ? turn.media_refs.length : 0), 0)
}

export function isScriptedKaelAcknowledgementTurn(turn: KaelChatTurn) {
  if (turn.role === 'customer') return false
  const text = turn.text_content?.trim()
  if (!text) return false
  const normalized = normalizeKaelRoutingText(text)
  return normalized.includes('kael ghi nhan moi lo') &&
    (normalized.includes('admin can thiep') || normalized.includes('moi tuong tac duoc luu'))
}

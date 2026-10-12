import type { KaelNextAction } from '@nestscout/shared'
import { useState } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import { kaelChatService } from '@/lib/services'

import { localizeKaelRequestFailure } from './customer-kael-chat-helpers'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import type { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import type { useCustomerKaelEvidenceActions } from './use-customer-kael-evidence-actions'

type ChatUi = ReturnType<typeof useCustomerKaelChatUiState>
type Conversation = ReturnType<typeof useCustomerKaelConversationState>
type EvidenceActions = ReturnType<typeof useCustomerKaelEvidenceActions>

const TURN_INTENTS = new Set(['request_worker_quote', 'request_reference_price', 'ask_question'] as const)
type ChipTurnIntent = 'request_worker_quote' | 'request_reference_price' | 'ask_question'

function chipTurnIntent(action: KaelNextAction): ChipTurnIntent | null {
  const intent = action.turn_intent
  return intent && (TURN_INTENTS as ReadonlySet<string>).has(intent) ? intent as ChipTurnIntent : null
}

// A tap either prepares the composer (the customer still sends it) or sends the chosen step as a
// visible turn with its intent; the server re-checks every one. Nothing here confirms an offer.
export function useCustomerKaelNextActions({
  chatUi,
  conversation,
  evidenceActions,
  kaelRequestGuard,
  language,
}: {
  chatUi: ChatUi
  conversation: Conversation
  evidenceActions: EvidenceActions
  kaelRequestGuard: CustomerKaelRequestGuard
  language: AppLanguage
}) {
  const [sendingActionId, setSendingActionId] = useState<string | null>(null)
  const { chat, setChat, setError, setLoading, setTurns } = conversation

  const runNextAction = async (action: KaelNextAction) => {
    if (action.kind === 'provide_detail') {
      chatUi.setDraft(action.message ?? '')
      return
    }
    if (action.kind === 'attach_photo') {
      await evidenceActions.pickComposerMedia()
      return
    }
    const turnIntent = chipTurnIntent(action)
    if (!turnIntent || !chat?.session.id || conversation.loading || sendingActionId) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setSendingActionId(action.id)
    setLoading(true)
    setError(null)
    try {
      const result = await kaelChatService.sendTurn(chat.session.id, {
        language,
        message: action.message ?? action.label,
        photo_urls: [],
        turn_intent: turnIntent,
      })
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (result.success) {
        setChat(result.data)
        setTurns(result.data.turns)
      } else {
        setError(localizeKaelRequestFailure(result, language))
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setError(language === 'vi' ? 'Kael chưa thể hoàn tất bước này. Vui lòng thử lại.' : 'Kael could not complete that step. Please try again.')
      }
    } finally {
      setSendingActionId(null)
      if (kaelRequestGuard.isCurrent(requestToken)) setLoading(false)
    }
  }

  return { runNextAction, sendingActionId }
}

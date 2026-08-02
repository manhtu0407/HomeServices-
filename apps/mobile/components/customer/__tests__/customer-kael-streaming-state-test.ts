import {
  createCustomerKaelConversationState,
  customerKaelConversationReducer,
} from '../kael-chat/use-customer-kael-conversation-state'
import { createCompletedKaelResponseState } from '@/lib/kael-response-stream'

describe('Customer Kael streaming response state', () => {
  it('keeps verified deltas ephemeral and clears them when the chat mode changes', () => {
    const initial = createCustomerKaelConversationState({
      initialLoading: false,
      initialMode: 'normal',
      pendingDraft: null,
    })
    const response = createCompletedKaelResponseState('Kael dang tra loi', 'turn-1')
    const streaming = customerKaelConversationReducer(initial, {
      type: 'set-streaming-reply',
      value: response,
    })

    expect(streaming.streamingReply).toEqual(response)
    expect(customerKaelConversationReducer(streaming, {
      mode: 'case',
      type: 'switch-mode',
    }).streamingReply).toBeNull()
  })
})

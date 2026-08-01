import {
  createCustomerKaelConversationState,
  customerKaelConversationReducer,
} from '../kael-chat/use-customer-kael-conversation-state'

describe('Customer Kael streaming response state', () => {
  it('keeps verified deltas ephemeral and clears them when the chat mode changes', () => {
    const initial = createCustomerKaelConversationState({
      initialLoading: false,
      initialMode: 'normal',
      pendingDraft: null,
    })
    const streaming = customerKaelConversationReducer(initial, {
      type: 'set-streaming-reply',
      value: {
        text: 'Kael dang tra loi',
        turnId: 'turn-1',
      },
    })

    expect(streaming.streamingReply).toEqual({
      text: 'Kael dang tra loi',
      turnId: 'turn-1',
    })
    expect(customerKaelConversationReducer(streaming, {
      mode: 'case',
      type: 'switch-mode',
    }).streamingReply).toBeNull()
  })
})

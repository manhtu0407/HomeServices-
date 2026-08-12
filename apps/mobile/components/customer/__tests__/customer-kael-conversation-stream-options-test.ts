import { forwardCustomerKaelStreamEvent } from '../kael-chat/customer-kael-conversation-stream-options'

describe('customer Kael stream options', () => {
  it('forwards stream events only while the owning operation remains current', () => {
    const onEvent = jest.fn()
    const event = { type: 'reasoning.step' }

    forwardCustomerKaelStreamEvent(event, () => false, onEvent)
    forwardCustomerKaelStreamEvent(event, () => true, onEvent)

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(event)
  })
})

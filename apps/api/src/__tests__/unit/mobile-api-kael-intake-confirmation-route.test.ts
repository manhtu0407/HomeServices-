import { describe, expect, it } from 'vitest'

import { matchCustomerKaelChatSessionRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/kael-chat-session-routes'

const decode = (segment: string) => segment

describe('Kael intake confirmation route', () => {
  it('matches only the customer POST decision endpoint', () => {
    expect(matchCustomerKaelChatSessionRoute(
      '/kael/chat/session-1/intake-confirmation',
      'POST',
      decode,
    )).toEqual({
      kind: 'kael.chat.intakeConfirmation',
      method: 'POST',
      roles: ['customer', 'admin'],
      sessionId: 'session-1',
    })
    expect(matchCustomerKaelChatSessionRoute(
      '/kael/chat/session-1/intake-confirmation',
      'GET',
      decode,
    )).toBeNull()
  })
})

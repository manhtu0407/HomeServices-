import AsyncStorage from '@react-native-async-storage/async-storage'

import type { CustomerKaelConversationSession } from '@/lib/api-types'
import {
  readCustomerKaelSessionCatalogState,
  writeCustomerKaelSessionCatalog,
} from '../kael-chat/customer-kael-session-catalog-cache'

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

const customerId = 'customer-stream-snapshot'

function makeSession(id: string): CustomerKaelConversationSession {
  return {
    case_job_id: null,
    case_session_id: null,
    client_request_id: `${id}-request`,
    customer_id: customerId,
    id,
    mode: 'normal',
    pinned_at: null,
    profile_id: null,
    service_type: null,
    started_at: '2026-08-01T09:00:00.000Z',
    title: null,
    total_turns: 2,
    updated_at: '2026-08-01T09:01:00.000Z',
  }
}

describe('Customer Kael active session cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  it('restores the committed active session with its validated catalog', async () => {
    const session = makeSession('conversation-active')

    await writeCustomerKaelSessionCatalog(customerId, 'normal', [session], session.id)

    await expect(readCustomerKaelSessionCatalogState(customerId, 'normal')).resolves.toEqual({
      activeSessionId: session.id,
      sessions: [session],
    })
  })

  it('drops an active session id that is not present in the validated catalog', async () => {
    const session = makeSession('conversation-retained')

    await writeCustomerKaelSessionCatalog(customerId, 'normal', [session], 'conversation-foreign')

    await expect(readCustomerKaelSessionCatalogState(customerId, 'normal')).resolves.toEqual({
      activeSessionId: null,
      sessions: [session],
    })
  })
})

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

const mockAddNotificationReceivedListener = jest.fn()
const mockAddNotificationResponseReceivedListener = jest.fn()
const mockGetLastNotificationResponseAsync = jest.fn()

export const PILLAR = {
  id: 'P62-matching-push-delivery-ack-mobile',
  invariant:
    'the Worker app acknowledges foreground receipt and user-open only for one complete delivery bound to the exact current device-token generation',
  authority: [
    'approved Stage 1 implementation plan (Realtime fast path, durable inbox recovery path)',
    'governance/RULES.md #8 (provider submission cannot become fake device delivery)',
  ],
  target: 'apps/mobile/lib/push-notifications.ts',
  layer: 'integration',
  siblings: ['P57-stage1-provider-push-receipt', 'P60-matching-push-delivery-ack-route'],
  mutation:
    'acknowledge an incomplete payload or omit the exact token generation; malformed/stale notification cases no longer stay null',
} as const satisfies PillarManifest

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { iosPushNotificationsEnabled: true } } },
}))

jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: mockAddNotificationReceivedListener,
  addNotificationResponseReceivedListener: mockAddNotificationResponseReceivedListener,
  getLastNotificationResponseAsync: mockGetLastNotificationResponseAsync,
}))

jest.mock('../services', () => ({
  notificationService: {
    registerDeviceToken: jest.fn(),
    unregisterDeviceToken: jest.fn(),
  },
}))

import {
  addPushNotificationResponseListener,
  matchingDeliveryAckFromNotificationData,
} from '../push-notifications'

const BROADCAST_ID = '33333333-3333-4333-8333-333333333333'
const DELIVERY_ID = '44444444-4444-4444-8444-444444444444'
const PUSH_TOKEN_ID = '55555555-5555-4555-8555-555555555555'
const TOKEN_UPDATED_AT = '2026-08-23T07:00:00.000Z'

describe('matching push delivery acknowledgement pillar', () => {
  beforeEach(() => {
    mockAddNotificationReceivedListener.mockReset()
    mockAddNotificationResponseReceivedListener.mockReset()
    mockGetLastNotificationResponseAsync.mockReset()
    mockGetLastNotificationResponseAsync.mockResolvedValue(null)
  })

  it('acknowledges foreground receipt and user-open with the exact token generation', async () => {
    type TestNotification = { request: { content: { data?: Record<string, unknown> } } }
    let received: ((notification: TestNotification) => void) | undefined
    let responded: ((response: { notification: TestNotification }) => void) | undefined
    const removeReceived = jest.fn()
    const removeResponded = jest.fn()
    mockAddNotificationReceivedListener.mockImplementation((listener) => {
      received = listener
      return { remove: removeReceived }
    })
    mockAddNotificationResponseReceivedListener.mockImplementation((listener) => {
      responded = listener
      return { remove: removeResponded }
    })
    const openPath = jest.fn()
    const acknowledge = jest.fn(async () => undefined)
    const data = {
      broadcast_id: BROADCAST_ID,
      matching_delivery_id: DELIVERY_ID,
      device_push_token_id: PUSH_TOKEN_ID,
      device_push_token_updated_at: TOKEN_UPDATED_AT,
    }

    const subscription = addPushNotificationResponseListener(openPath, acknowledge)
    received?.({ request: { content: { data } } })
    responded?.({ notification: { request: { content: { data } } } })
    await Promise.resolve()

    withPillarContext(PILLAR, () => {
      expect(acknowledge).toHaveBeenCalledTimes(2)
      expect(acknowledge).toHaveBeenCalledWith({
        matching_delivery_id: DELIVERY_ID,
        device_push_token_id: PUSH_TOKEN_ID,
        device_push_token_updated_at: TOKEN_UPDATED_AT,
      })
      expect(openPath).toHaveBeenCalledWith(`/(worker)/jobs?broadcast_id=${BROADCAST_ID}`)
    })
    subscription.remove()
    expect(removeReceived).toHaveBeenCalledTimes(1)
    expect(removeResponded).toHaveBeenCalledTimes(1)
  })

  it('rejects incomplete, stale-shaped, or malformed app acknowledgements', () => {
    for (const payload of [
      {
        matching_delivery_id: DELIVERY_ID,
        device_push_token_id: PUSH_TOKEN_ID,
        device_push_token_updated_at: 'not-a-time',
      },
      {
        matching_delivery_id: DELIVERY_ID,
        device_push_token_updated_at: TOKEN_UPDATED_AT,
      },
      {
        matching_delivery_id: 'not-a-uuid',
        device_push_token_id: PUSH_TOKEN_ID,
        device_push_token_updated_at: TOKEN_UPDATED_AT,
      },
    ]) {
      withPillarContext(PILLAR, () => {
        expect(matchingDeliveryAckFromNotificationData(payload)).toBeNull()
      })
    }
  })
})

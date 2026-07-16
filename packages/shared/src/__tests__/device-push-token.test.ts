import { describe, expect, it } from 'vitest'
import {
  devicePushTokenSchema,
  devicePushTokenUnregisterSchema,
} from '../validation'

describe('device push token validation', () => {
  it('accepts a bounded registration token', () => {
    expect(devicePushTokenSchema.safeParse({
      platform: 'ios',
      push_token: 'ExponentPushToken[valid-token]',
      permission_status: 'granted',
      safe_metadata: {
        project_id_available: true,
        role: 'customer',
        source: 'expo-notifications',
      },
    }).success).toBe(true)
  })

  it('rejects unbounded or misleading client metadata', () => {
    for (const safe_metadata of [
      { phone: '0901234567' },
      { nested: { arbitrary: true } },
      { project_id_available: 'yes' },
      { role: 'superadmin' },
      { source: 'untrusted-client' },
    ]) {
      expect(devicePushTokenSchema.safeParse({
        platform: 'ios',
        push_token: 'ExponentPushToken[valid-token]',
        permission_status: 'granted',
        safe_metadata,
      }).success).toBe(false)
    }
  })

  it('accepts only the token needed to unregister the current device', () => {
    expect(devicePushTokenUnregisterSchema.safeParse({
      push_token: 'ExponentPushToken[valid-token]',
    }).success).toBe(true)
    expect(devicePushTokenUnregisterSchema.safeParse({
      push_token: 'short',
    }).success).toBe(false)
    expect(devicePushTokenUnregisterSchema.safeParse({
      push_token: 'ExponentPushToken[valid-token]',
      user_id: 'another-user',
    }).success).toBe(false)
  })
})

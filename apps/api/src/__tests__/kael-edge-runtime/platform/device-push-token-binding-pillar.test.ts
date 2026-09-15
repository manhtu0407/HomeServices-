import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import {
  registerDevicePushToken,
  unregisterDevicePushToken,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/notification/notifications-inbox'

export const PILLAR = {
  id: 'P185-device-push-token-binding',
  invariant:
    'an authenticated Worker registers and removes only the actor-owned device token through atomic Supabase RPC receipts, while client metadata cannot change the role boundary',
  authority: [
    'governance/RULES.md #0 (device-token workflow writes stay behind the Edge boundary)',
    'governance/RULES.md #8 (unknown notification receipts do not become success)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/notification/notifications-inbox.ts',
  layer: 'integration',
  siblings: ['P57-stage1-provider-push-receipt', 'P60-matching-push-delivery-ack-route'],
  mutation:
    'replace ctx.user.id or the sanitized role metadata with client input, or accept a malformed RPC receipt; the actor-bound token cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const WORKER_ID = '18500000-0000-4000-8000-000000000001'
const TOKEN_ID = '18500000-0000-4000-8000-000000000002'
const UPDATED_AT = '2026-09-15T08:00:00.000Z'
const unsafeClientMetadata = {
  project_id_available: true,
  role: 'customer',
  source: 'client-injected',
} as unknown as Parameters<typeof registerDevicePushToken>[1]['safe_metadata']

function workerContext(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: WORKER_ID },
    role: 'worker',
    supabase: client,
  }
}

describe('device push token actor binding', () => {
  it('registers the Worker token through one actor-bound atomic RPC', async () => {
    const client = makeSequenceClient([{
      data: [{ token_id: TOKEN_ID, enabled_out: true, updated_at_ts: UPDATED_AT }],
      error: null,
    }])

    const result = await registerDevicePushToken(workerContext(client), {
      platform: 'android',
      push_token: 'ExponentPushToken[p185]',
      permission_status: 'granted',
      safe_metadata: unsafeClientMetadata,
    })

    expect(result, pillarWhy(PILLAR, 'an enabled token must carry the exact actor receipt')).toEqual({
      token_id: TOKEN_ID,
      enabled: true,
      updated_at: UPDATED_AT,
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'register_device_push_token_atomic',
      {
        p_user_id: WORKER_ID,
        p_platform: 'android',
        p_push_token: 'ExponentPushToken[p185]',
        p_permission_status: 'granted',
        p_safe_metadata: {
          project_id_available: true,
          role: 'worker',
          source: 'expo-notifications',
        },
      },
    ])
  })

  it('rejects a malformed registration receipt without acknowledging a token', async () => {
    const client = makeSequenceClient([{
      data: [{ token_id: TOKEN_ID, enabled_out: 'true', updated_at_ts: UPDATED_AT }],
      error: null,
    }])

    await expect(registerDevicePushToken(workerContext(client), {
      platform: 'android',
      push_token: 'ExponentPushToken[p185]',
      permission_status: 'granted',
      safe_metadata: {},
    })).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })

  it('unregisters only the authenticated Worker token through one atomic RPC', async () => {
    const client = makeSequenceClient([{
      data: [{ token_id: TOKEN_ID, unregistered_out: true, updated_at_ts: UPDATED_AT }],
      error: null,
    }])

    const result = await unregisterDevicePushToken(workerContext(client), {
      push_token: 'ExponentPushToken[p185]',
    })

    expect(result, pillarWhy(PILLAR, 'unregister must return the durable actor-bound receipt')).toEqual({
      token_id: TOKEN_ID,
      unregistered: true,
      updated_at: UPDATED_AT,
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'unregister_device_push_token_atomic',
      {
        p_user_id: WORKER_ID,
        p_push_token: 'ExponentPushToken[p185]',
      },
    ])
  })

  it('rejects an absent unregister receipt without claiming removal', async () => {
    const client = makeSequenceClient([{
      data: [],
      error: null,
    }])

    await expect(unregisterDevicePushToken(workerContext(client), {
      push_token: 'ExponentPushToken[p185]',
    })).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })
})

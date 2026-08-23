import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'

export const PILLAR = {
  id: 'P60-matching-push-delivery-ack-route',
  invariant:
    'only an authenticated Worker can acknowledge a complete delivery and exact device-token generation through mobile-api',
  authority: [
    'approved Stage 1 implementation plan (app-level delivery proof)',
    'governance/RULES.md #8 (provider handoff cannot become device delivery)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/routes/notifications.ts',
  layer: 'security-negative',
  siblings: ['P49-durable-matching-delivery', 'P57-stage1-provider-push-receipt'],
  mutation:
    'allow Customer/Admin access, accept an incomplete token generation, or omit the exact acknowledgement service call — this pillar turns red',
} as const satisfies PillarManifest

const input = {
  matching_delivery_id: '44444444-4444-4444-8444-444444444444',
  device_push_token_id: '55555555-5555-4555-8555-555555555555',
  device_push_token_updated_at: '2026-08-23T07:00:00.000Z',
}

const workerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '33333333-3333-4333-8333-333333333333' },
  role: 'worker',
  supabase: {},
  userSupabase: {},
}

function handlerWith(inputOverrides: {
  authenticate: (request: Request, roles?: Array<'customer' | 'worker' | 'admin'>) => Promise<MobileApiAuthResult>
  acknowledge: ReturnType<typeof vi.fn>
}) {
  return createMobileApiHandler({
    authenticate: inputOverrides.authenticate,
    services: {
      acknowledgeMatchingPushDelivery: inputOverrides.acknowledge,
    } as unknown as MobileApiServices,
  })
}

function request(body: unknown = input) {
  return new Request('https://example.test/mobile-api/notifications/matching-delivery-ack', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('matching push delivery acknowledgement route', () => {
  it('routes an exact acknowledgement through the Worker-only API boundary', async () => {
    const acknowledge = vi.fn(async () => ({
      acknowledged: true,
      delivery_id: input.matching_delivery_id,
      delivered_at: '2026-08-23T07:00:01.000Z',
    }))
    const authenticate = vi.fn(async () => workerAuth)
    const response = await handlerWith({ authenticate, acknowledge })(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ acknowledged: true, delivered_at: '2026-08-23T07:00:01.000Z' })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker'])
    expect(acknowledge, pillarWhy(PILLAR, 'the complete token generation reaches the domain once')).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker', user: workerAuth.success ? workerAuth.user : null }),
      input,
    )
  })

  it('does not dispatch when Worker authorization fails', async () => {
    const acknowledge = vi.fn()
    const authenticate = vi.fn(async (): Promise<MobileApiAuthResult> => ({
      success: false,
      status: 403,
      error: 'forbidden',
    }))
    const response = await handlerWith({ authenticate, acknowledge })(request())

    expect(response.status).toBe(403)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker'])
    expect(acknowledge).not.toHaveBeenCalled()
  })

  it('rejects an incomplete token generation before the domain call', async () => {
    const acknowledge = vi.fn()
    const response = await handlerWith({
      authenticate: vi.fn(async () => workerAuth),
      acknowledge,
    })(request({
      matching_delivery_id: input.matching_delivery_id,
      device_push_token_id: input.device_push_token_id,
    }))

    expect(response.status).toBe(400)
    expect(acknowledge).not.toHaveBeenCalled()
  })
})

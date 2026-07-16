import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { providerUsageCount, readBoundedProviderJson } from '@/lib/ai/provider-response'
import {
  createMobileApiHandler,
  type MobileApiContext,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/router'
import { getWorkerRoutePreview } from '../../../../../supabase/functions/mobile-api/_shared/services/worker-route.service'
import { updateWorkerAvailability } from '../../../../../supabase/functions/mobile-api/_shared/services/workers.service'

const nextMocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  computeEarnings: vi.fn(),
}))

vi.mock('@/lib/auth/api-auth', () => ({
  authenticateRequest: nextMocks.authenticateRequest,
  apiError: (code: string, error: string, status: number) =>
    Response.json({ code, error }, { status }),
  apiSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
}))

vi.mock('@/lib/workers/earnings', () => ({
  computeEarnings: nextMocks.computeEarnings,
  EarningsQueryError: class EarningsQueryError extends Error {},
}))

import { GET as getNextWorkerEarnings } from '@/app/api/workers/me/earnings/route'
import { PATCH as patchNextWorkerAvailability } from '@/app/api/workers/me/availability/route'

const workerAuth = {
  success: true as const,
  user: { id: 'worker-1' },
  role: 'worker' as const,
  supabase: {},
}

const adminAuth = {
  success: true as const,
  user: { id: 'admin-1' },
  role: 'admin' as const,
  supabase: {},
}

function makeWorkerRouteClient() {
  const result = {
    data: {
      id: 'job-route-1',
      status: 'worker_matched',
      worker_id: 'worker-1',
      address_lat: 10.7767,
      address_lng: 106.7009,
      address_building: 'Tòa A',
      address_unit: 'A1201',
      address_floor: '12',
      address_district: 'Bình Thạnh',
      apartment_access_profile: {},
      apartment_access_state: { exact_unit_released: false },
    },
    error: null,
  }
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    then: <TResult1 = typeof result, TResult2 = never>(
      onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(),
  }
}

describe('boundary parser validation', () => {
  beforeEach(() => {
    nextMocks.authenticateRequest.mockResolvedValue(workerAuth)
    nextMocks.computeEarnings.mockResolvedValue({
      workerId: 'worker-1',
      totalJobsPaid: 0,
      grossEarnings: 0,
      platformFeeTotal: 0,
      netEarnings: 0,
      pendingPaymentCount: 0,
      pendingPaymentAmount: 0,
      dailyEarnings: [],
      fromDate: null,
      toDate: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('ISO timestamp query parameters', () => {
    it.each(['', '0', '2026-02-30T00:00:00.000Z'])(
      'rejects a non-ISO or normalized-invalid Edge earnings timestamp: %s',
      async (value) => {
        const getWorkerEarnings = vi.fn()
        const handler = createMobileApiHandler({
          authenticate: vi.fn(async () => workerAuth),
          services: { getWorkerEarnings } as unknown as MobileApiServices,
        })

        const response = await handler(new Request(
          `https://example.test/mobile-api/workers/me/earnings?from=${encodeURIComponent(value)}`,
        ))

        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
        expect(getWorkerEarnings).not.toHaveBeenCalled()
      },
    )

    it.each(['', '0', '2026-02-30T00:00:00.000Z'])(
      'rejects a non-ISO or normalized-invalid Next earnings timestamp: %s',
      async (value) => {
        const response = await getNextWorkerEarnings(new Request(
          `https://example.test/api/workers/me/earnings?from=${encodeURIComponent(value)}`,
        ))

        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
        expect(nextMocks.computeEarnings).not.toHaveBeenCalled()
      },
    )

    it('normalizes an explicit ISO offset at both earnings boundaries', async () => {
      const getWorkerEarnings = vi.fn(async () => ({ worker_id: 'worker-1' }))
      const handler = createMobileApiHandler({
        authenticate: vi.fn(async () => workerAuth),
        services: { getWorkerEarnings } as unknown as MobileApiServices,
      })
      const value = encodeURIComponent('2026-07-01T07:00:00+07:00')

      const edgeResponse = await handler(new Request(
        `https://example.test/mobile-api/workers/me/earnings?from=${value}`,
      ))
      const nextResponse = await getNextWorkerEarnings(new Request(
        `https://example.test/api/workers/me/earnings?from=${value}`,
      ))

      expect(edgeResponse.status).toBe(200)
      expect(getWorkerEarnings).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'worker' }),
        { from: '2026-07-01T00:00:00.000Z', to: undefined },
      )
      expect(nextResponse.status).toBe(200)
      expect(nextMocks.computeEarnings).toHaveBeenCalledWith(
        workerAuth.supabase,
        'worker-1',
        { from: '2026-07-01T00:00:00.000Z' },
      )
    })

    it('returns the daily earnings contract from the Next reference route', async () => {
      nextMocks.computeEarnings.mockResolvedValueOnce({
        workerId: 'worker-1',
        totalJobsPaid: 2,
        grossEarnings: 700_000,
        platformFeeTotal: 70_000,
        netEarnings: 630_000,
        pendingPaymentCount: 0,
        pendingPaymentAmount: 0,
        dailyEarnings: [{
          date: '2026-07-15',
          grossEarnings: 700_000,
          platformFeeTotal: 70_000,
          netEarnings: 630_000,
          paidJobCount: 2,
        }],
        fromDate: null,
        toDate: null,
      })

      const response = await getNextWorkerEarnings(new Request(
        'https://example.test/api/workers/me/earnings',
      ))

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        daily_earnings: [{
          date: '2026-07-15',
          gross_earnings: 700_000,
          platform_fee_total: 70_000,
          net_earnings: 630_000,
          paid_job_count: 2,
        }],
      })
    })
  })

  describe('provider and RPC response shapes', () => {
    it('rejects invalid UTF-8 instead of silently accepting replacement characters', async () => {
      const invalidUtf8Json = new Uint8Array([
        0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d,
      ])

      await expect(readBoundedProviderJson(new Response(invalidUtf8Json))).rejects.toThrow(
        'AI_PROVIDER_RESPONSE_INVALID',
      )
    })

    it.each(['null', '[]', '"text"', '42'])(
      'rejects a non-object AI provider payload: %s',
      async (payload) => {
        await expect(readBoundedProviderJson(new Response(payload))).rejects.toThrow(
          'AI_PROVIDER_RESPONSE_INVALID',
        )
      },
    )

    it.each([0.5, Number.MAX_VALUE])(
      'rejects an invalid AI provider token count: %s',
      (value) => {
        expect(() => providerUsageCount(value)).toThrow('AI_PROVIDER_RESPONSE_INVALID')
      },
    )

    it.each([
      'null',
      '{"code":"OK","paths":[{"distance":1e400,"time":720000}]}',
    ])('rejects an invalid VietMap route payload: %s', async (payload) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(payload, {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })))
      const ctx: MobileApiContext = {
        success: true,
        user: { id: 'worker-1' },
        role: 'worker',
        supabase: makeWorkerRouteClient(),
      }

      await expect(getWorkerRoutePreview(
        ctx,
        'job-route-1',
        { latitude: 10.7692, longitude: 106.6819 },
        { vietmapApiKey: 'vietmap-test-key' },
      )).rejects.toMatchObject({ code: 'ROUTE_UNAVAILABLE', status: 502 })
    })

    it.each([
      {
        error_code: 'WORKER_BUSY',
        is_available: null,
        ok: 'false',
        updated_at_ts: null,
      },
      {
        error_code: null,
        is_available: null,
        ok: true,
        updated_at_ts: null,
      },
      {
        error_code: null,
        is_available: true,
        ok: true,
        updated_at_ts: '0',
      },
      {
        error_code: null,
        is_available: true,
        ok: true,
        updated_at_ts: '2026-02-30T10:00:00Z',
      },
    ])('rejects a malformed availability RPC row: %o', async (row) => {
      nextMocks.authenticateRequest.mockResolvedValue({
        ...workerAuth,
        supabase: { rpc: vi.fn(async () => ({ data: [row], error: null })) },
      })

      const response = await patchNextWorkerAvailability(new Request(
        'https://example.test/api/workers/me/availability',
        {
          body: JSON.stringify({ is_available: true }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      ))

      expect(response.status).toBe(500)
      expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
    })

    it.each([
      {
        error_code: 'WORKER_BUSY',
        is_available: null,
        ok: 'false',
        updated_at_ts: null,
      },
      {
        error_code: null,
        is_available: null,
        ok: true,
        updated_at_ts: null,
      },
      {
        error_code: null,
        is_available: true,
        ok: true,
        updated_at_ts: '0',
      },
      {
        error_code: null,
        is_available: true,
        ok: true,
        updated_at_ts: '2026-02-30T10:00:00Z',
      },
    ])('rejects a malformed Edge availability RPC row: %o', async (row) => {
      const ctx: MobileApiContext = {
        success: true,
        user: { id: 'worker-1' },
        role: 'worker',
        supabase: {
          from: vi.fn(),
          rpc: vi.fn(async () => ({ data: [row], error: null })),
        },
      }

      await expect(updateWorkerAvailability(ctx, { is_available: true })).rejects.toMatchObject({
        code: 'DB_ERROR',
        status: 500,
      })
    })
  })

  describe('typed JSON fields', () => {
    it('rejects an oversized Next request before the availability mutation runs', async () => {
      const rpc = vi.fn()
      nextMocks.authenticateRequest.mockResolvedValue({
        ...workerAuth,
        supabase: { rpc },
      })

      const response = await patchNextWorkerAvailability(new Request(
        'https://example.test/api/workers/me/availability',
        {
          body: '{}',
          headers: {
            'content-length': '65537',
            'content-type': 'application/json',
          },
          method: 'PATCH',
        },
      ))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
      expect(rpc).not.toHaveBeenCalled()
    })

    it.each([
      {
        body: { limit: '2' },
        method: 'processKaelLearningQueue',
        path: '/admin/kael-learning/process-queue',
      },
      {
        body: { force_poll: 'true', limit: 1 },
        method: 'processKaelBatchResults',
        path: '/admin/kael-learning/process-batch-results',
      },
    ])('rejects coerced admin JSON at $path', async ({ body, method, path }) => {
      const service = vi.fn(async () => ({}))
      const handler = createMobileApiHandler({
        authenticate: vi.fn(async () => adminAuth),
        services: { [method]: service } as unknown as MobileApiServices,
      })

      const response = await handler(new Request(`https://example.test/mobile-api${path}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
      expect(service).not.toHaveBeenCalled()
    })

    it('rejects unknown admin fields instead of running with an unintended default', async () => {
      const processKaelLearningQueue = vi.fn(async () => ({}))
      const handler = createMobileApiHandler({
        authenticate: vi.fn(async () => adminAuth),
        services: { processKaelLearningQueue } as unknown as MobileApiServices,
      })

      const response = await handler(new Request(
        'https://example.test/mobile-api/admin/kael-learning/process-queue',
        {
          body: JSON.stringify({ force_realtiime: true, limit: 2 }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      ))

      expect(response.status).toBe(400)
      expect(processKaelLearningQueue).not.toHaveBeenCalled()
    })

    it('rejects invalid UTF-8 instead of persisting replacement characters', async () => {
      const approveKaelLearningCandidate = vi.fn(async () => ({}))
      const handler = createMobileApiHandler({
        authenticate: vi.fn(async () => adminAuth),
        services: { approveKaelLearningCandidate } as unknown as MobileApiServices,
      })
      const prefix = new TextEncoder().encode('{"review_note":"')
      const suffix = new TextEncoder().encode('"}')
      const body = new Uint8Array(prefix.length + 1 + suffix.length)
      body.set(prefix)
      body[prefix.length] = 0xc3
      body.set(suffix, prefix.length + 1)

      const response = await handler(new Request(
        'https://example.test/mobile-api/admin/kael-learning/candidates/candidate-1/approve',
        {
          body,
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      ))

      expect(response.status).toBe(400)
      expect(approveKaelLearningCandidate).not.toHaveBeenCalled()
    })
  })
})

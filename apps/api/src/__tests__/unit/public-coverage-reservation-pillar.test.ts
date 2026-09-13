import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes'
import {
  PUBLIC_COVERAGE_MINIMUM_WORKERS,
  readServiceCoverageReadiness,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/catalog/coverage'
import {
  activateBroadcastBatch,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/matching/broadcasts'
import type { DbClient } from '../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P67-public-coverage-reservation',
  invariant:
    'Customer booking readiness is a dedicated authenticated contract and confirmation cannot create a real job below three distinct eligible and reachable Workers',
  authority: [
    'governance/RULES.md #7 (customer authority before matching)',
    'approved Production Agentic Transaction Readiness plan (service x district coverage threshold)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/catalog/coverage.ts',
  layer: 'security-negative',
  siblings: ['P48-durable-confirmation-operation', 'P50-reachable-cohort-matching'],
  mutation:
    'remove the Customer-only coverage route or lower PUBLIC_COVERAGE_MINIMUM_WORKERS below three; the route and threshold cases turn red',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../../')
const coverageMigrationPath = resolve(
  root,
  'supabase/migrations/20260904230000_public_coverage_capacity_reservation.sql',
)

describe('public service coverage reservation gate', () => {
  it('exposes an authenticated Customer-only readiness route', () => {
    const route = matchRoute(new Request(
      'https://example.test/functions/v1/mobile-api/services/coverage?service_type=plumbing&district_code=q7',
    ))

    expect(route, pillarWhy(PILLAR, 'coverage route must be reachable through the canonical matcher'))
      .toEqual({
        kind: 'services.coverage',
        method: 'GET',
        roles: ['customer'],
      })
  })

  it('parses only a truthful threshold-backed readiness result without worker identity', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const client = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args })
        return Promise.resolve({
          data: [{
            service_type: 'plumbing',
            district_code: 'q7',
            status: 'ready',
            minimum_worker_count: 3,
            eligible_reachable_worker_count: 3,
            required_capabilities: [],
            reason_code: 'READY',
            checked_at: '2026-09-04T05:00:00.000Z',
            valid_until: '2026-09-04T05:00:30.000Z',
          }],
          error: null,
        })
      },
    } as unknown as DbClient

    const result = await readServiceCoverageReadiness(client, {
      customerId: '11111111-1111-4111-8111-111111111111',
      districtCode: 'q7',
      serviceType: 'plumbing',
    })

    expect(PUBLIC_COVERAGE_MINIMUM_WORKERS, pillarWhy(PILLAR, 'the launch threshold is policy, not a caller option')).toBe(3)
    expect(result.status, pillarWhy(PILLAR, 'three eligible and reachable workers open the cell')).toBe('ready')
    expect(Object.keys(result), pillarWhy(PILLAR, 'public response contains no Worker identity'))
      .not.toContain('worker_ids')
    expect(calls).toEqual([{
      name: 'get_service_coverage_readiness',
      args: {
        p_customer_id: '11111111-1111-4111-8111-111111111111',
        p_district_code: 'q7',
        p_service_type: 'plumbing',
      },
    }])
  })

  it('rejects missing auth and a Worker role before coverage evaluation', async () => {
    const getServiceCoverageReadiness = vi.fn()
    const services = { getServiceCoverageReadiness } as unknown as MobileApiServices
    const missingAuth: MobileApiAuthResult = {
      success: false,
      status: 401,
      error: 'Vui lòng đăng nhập',
    }
    const forbiddenWorker: MobileApiAuthResult = {
      success: false,
      status: 403,
      error: 'Bạn không có quyền thực hiện thao tác này',
    }
    const missingHandler = createMobileApiHandler({
      authenticate: vi.fn(async () => missingAuth),
      services,
    })
    const workerHandler = createMobileApiHandler({
      authenticate: vi.fn(async (_request, allowedRoles) => {
        expect(allowedRoles).toEqual(['customer'])
        return forbiddenWorker
      }),
      services,
    })
    const url = 'https://example.test/functions/v1/mobile-api/services/coverage?service_type=plumbing&district_code=q7'

    const [missingResponse, workerResponse] = await Promise.all([
      missingHandler(new Request(url)),
      workerHandler(new Request(url)),
    ])

    expect(missingResponse.status).toBe(401)
    expect(workerResponse.status).toBe(403)
    expect(await missingResponse.json()).toMatchObject({ code: 'AUTH_MISSING' })
    expect(await workerResponse.json()).toMatchObject({ code: 'AUTH_FORBIDDEN' })
    expect(getServiceCoverageReadiness).not.toHaveBeenCalled()
  })

  it('validates the district before passing canonical Customer input to the service', async () => {
    const customerId = '11111111-1111-4111-8111-111111111111'
    const customerAuth: MobileApiAuthResult = {
      success: true,
      user: { id: customerId },
      role: 'customer',
      supabase: {},
      userSupabase: {},
    }
    const getServiceCoverageReadiness = vi.fn(async () => ({
      service_type: 'plumbing' as const,
      district_code: 'q7',
      status: 'ready' as const,
      minimum_worker_count: 3 as const,
      eligible_reachable_worker_count: 3,
      required_capabilities: [],
      reason_code: 'READY' as const,
      checked_at: '2026-09-04T05:00:00.000Z',
      valid_until: '2026-09-04T05:00:30.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: { getServiceCoverageReadiness } as unknown as MobileApiServices,
    })

    const invalidResponse = await handler(new Request(
      'https://example.test/functions/v1/mobile-api/services/coverage?service_type=plumbing&district_code=hcmc_all',
    ))
    const validResponse = await handler(new Request(
      'https://example.test/functions/v1/mobile-api/services/coverage?service_type=plumbing&district_code=q7',
    ))

    expect(invalidResponse.status).toBe(400)
    expect(validResponse.status).toBe(200)
    expect(getServiceCoverageReadiness).toHaveBeenCalledOnce()
    expect(getServiceCoverageReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer', user: { id: customerId } }),
      { serviceType: 'plumbing', districtCode: 'q7' },
    )
  })

  it('binds preview, confirmation, and durable fan-out to one reserved eligibility source', () => {
    expect(
      existsSync(coverageMigrationPath),
      pillarWhy(PILLAR, 'the expand-only reservation migration must ship with the route'),
    ).toBe(true)
    const migration = readFileSync(coverageMigrationPath, 'utf8').replace(/\r\n/g, '\n')

    expect(migration).toMatch(/create table(?: if not exists)? public\.matching_capacity_reservations/i)
    expect(migration).toContain('private.eligible_matching_worker_ids')
    expect(migration).toContain('public.get_service_coverage_readiness')
    expect(migration).toContain('public.confirm_kael_chat_durable_atomic_v3')
    expect(migration).toContain('public.activate_job_broadcast_batch_durable_atomic_v2')
    expect(migration).toMatch(/for update of worker skip locked/i)
    expect(migration).not.toMatch(/\b(drop|truncate|delete\s+from)\b/i)
  })

  it('uses the reservation-enforcing activation RPC for every durable batch', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        id: '22222222-2222-4222-8222-222222222222',
        worker_id: '33333333-3333-4333-8333-333333333333',
        delivery_id: '44444444-4444-4444-8444-444444444444',
        operation_id: '55555555-5555-4555-8555-555555555555',
      }],
      error: null,
    }))
    const client = { rpc } as unknown as DbClient

    const result = await activateBroadcastBatch(client, {
      jobId: '22222222-2222-4222-8222-222222222222',
      workerIds: ['33333333-3333-4333-8333-333333333333'],
      batchId: '66666666-6666-4666-8666-666666666666',
      sentAt: '2026-09-04T05:00:00.000Z',
      expiresAt: '2026-09-04T05:05:00.000Z',
      durable: true,
    })

    expect(result.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'activate_job_broadcast_batch_durable_atomic_v2',
      expect.objectContaining({
        p_job_id: '22222222-2222-4222-8222-222222222222',
        p_worker_ids: ['33333333-3333-4333-8333-333333333333'],
      }),
    )
  })
})

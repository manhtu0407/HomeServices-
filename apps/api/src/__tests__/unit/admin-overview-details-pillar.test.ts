import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'
import {
  capabilityForAdminOverviewDetail,
  serializeAdminOverviewWorkerRecord,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/overview-details'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes'

export const PILLAR = {
  id: 'P46-admin-overview-details',
  invariant:
    'Admin Overview detail worklists are validated read-only requests, enforce the capability required by each data family, and serialize only the minimum safe record fields',
  authority: [
    'governance/RULES.md #0 (server-side role and capability gates)',
    'governance/RULES.md #8 (Production data is honest and never invented)',
    'user-approved Admin Overview detail and typography implementation plan',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/overview-details.ts',
  layer: 'security-negative',
  siblings: ['P18-capability-registry-parity', 'P45-admin-overview-dashboard'],
  mutation:
    'map workers_suspended to operations.read or spread an input worker row into the DTO — the capability matrix or PII allowlist assertion turns red',
} as const satisfies PillarManifest

const operatorAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'admin_operator',
  supabase: {},
}

describe('Admin Overview detail route contract', () => {
  it('matches one read-only Admin route and dispatches validated pagination', async () => {
    const getAdminOverviewDetails = vi.fn(async () => ({
      generated_at: '2026-08-24T09:00:00.000Z',
      has_more: false,
      key: 'coordination' as const,
      next_cursor: null,
      oldest_updated_at: null,
      records: [],
      service_breakdown: [],
      status_breakdown: [],
      total_count: 0,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => operatorAuth),
      services: { getAdminOverviewDetails } as unknown as MobileApiServices,
    })

    const route = matchRoute(new Request(
      'https://edge.test/admin/overview/details?key=coordination&limit=5&cursor=10',
    ))
    const response = await handler(new Request(
      'https://edge.test/admin/overview/details?key=coordination&limit=5&cursor=10',
    ))

    expect(route).toMatchObject({
      kind: 'admin.overview.details',
      method: 'GET',
      roles: ['admin', 'admin_operator'],
    })
    expect(response.status).toBe(200)
    expect(getAdminOverviewDetails).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin_operator' }),
      { cursor: '10', key: 'coordination', limit: 5 },
    )
  })

  it.each([
    'https://edge.test/admin/overview/details?key=unknown&limit=5',
    'https://edge.test/admin/overview/details?key=coordination&limit=21',
    'https://edge.test/admin/overview/details?key=coordination&cursor=-1',
  ])('rejects invalid input before the service is reached: %s', async (url) => {
    const getAdminOverviewDetails = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => operatorAuth),
      services: { getAdminOverviewDetails } as unknown as MobileApiServices,
    })

    const response = await handler(new Request(url))

    expect(response.status).toBe(400)
    expect(getAdminOverviewDetails).not.toHaveBeenCalled()
  })
})

describe('Admin Overview detail authorization and PII floor', () => {
  it('maps every detail family to its server capability and keeps disputes Owner-only', () => {
    expect(capabilityForAdminOverviewDetail('coordination')).toBe('operations.read')
    expect(capabilityForAdminOverviewDetail('other_admin_queue')).toBe('operations.read')
    expect(capabilityForAdminOverviewDetail('worker_applications')).toBe('workers.read')
    expect(capabilityForAdminOverviewDetail('workers_in_verification')).toBe('workers.read')
    expect(capabilityForAdminOverviewDetail('workers_suspended')).toBe('workers.read')
    expect(capabilityForAdminOverviewDetail('payment_attention')).toBe('transactions.read')
    expect(capabilityForAdminOverviewDetail('open_disputes')).toBe('owner')
  })

  it('allowlists worker fields instead of spreading banking, identity, or contact data', () => {
    const serialized = serializeAdminOverviewWorkerRecord({
      bank_account: '0123456789',
      bank_name: 'Sensitive bank',
      cccd_front_url: 'https://private.example/id.jpg',
      full_name: 'Nguyễn An',
      id: 'worker-1',
      is_suspended: true,
      phone: '0909000000',
      service_types: ['electrical'],
      updated_at: '2026-08-24T08:00:00.000Z',
      verification_status: 'suspended',
    })

    expect(serialized).toEqual({
      kind: 'worker',
      name: 'Nguyễn An',
      service_types: ['electrical'],
      state: 'suspended',
      updated_at: '2026-08-24T08:00:00.000Z',
      worker_id: 'worker-1',
    })
    expect(
      Object.keys(serialized),
      pillarWhy(PILLAR, 'a compact Admin worklist must never inherit unseen sensitive columns'),
    ).not.toEqual(expect.arrayContaining(['bank_account', 'bank_name', 'cccd_front_url', 'phone']))
  })
})

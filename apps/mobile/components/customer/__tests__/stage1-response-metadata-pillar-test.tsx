const mockFetch = jest.fn()

jest.mock('@/lib/runtime-config', () => ({
  mobileRuntimeConfig: {
    apiBaseUrl: 'https://api.test/functions/v1/mobile-api',
    supabasePublishableKey: 'publishable-test',
  },
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
  },
}))

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { api } from '@/lib/api'

export const PILLAR = {
  id: 'P45-stage1-response-identity',
  invariant: 'mobile preserves canonical release and trace response identity and reuses an explicit idempotency key for a confirmation retry',
  authority: [
    'governance/RULES.md #8 (honest recovery state)',
    'docs/dev-suggestion/stage1-intake-quote-admin-proposal.md (release and trace continuity)',
  ],
  target: 'apps/mobile/lib/api.ts',
  layer: 'integration',
  siblings: ['P46-stage1-customer-intake-mode', 'P47-stage1-worker-delivery'],
  mutation: 'drop x-operation-id extraction or ignore the explicit idempotency key; this pillar turns red',
} as const satisfies PillarManifest

describe('Stage-1 mobile response identity', () => {
  beforeAll(() => {
    global.fetch = mockFetch as typeof fetch
  })

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it.each([
    ['explicit server code', 'A1B2C3D4', 'A1B2C3D4'],
    ['trace identity fallback', null, '7F83E5C2'],
  ])('keeps canonical headers and the %s on the result', async (_label, supportHeader, supportCode) => {
    const headers = new Map([
      ['x-release-id', 'release-2026-08-23'],
      ['x-trace-id', 'trace_7f83e5c2'],
      ['x-run-id', 'run_abcd1234'],
      ['x-operation-id', 'operation_deadbeef'],
      ['x-support-code', supportHeader],
    ])
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: (name: string) => headers.get(name) ?? null },
      ok: true,
      status: 200,
      text: jest.fn(async () => '{}'),
    })

    const result = await api.get('/kael/chat/session-a/operation')

    withPillarContext(PILLAR, () => {
      expect(result).toMatchObject({
        meta: {
          operationId: 'operation_deadbeef',
          releaseId: 'release-2026-08-23',
          runId: 'run_abcd1234',
          supportCode,
          traceId: 'trace_7f83e5c2',
        },
        success: true,
      })
    }, 'response identity must survive the fetch boundary')
  })

  it('uses the same explicit idempotency key without injecting it into the body', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: jest.fn(async () => '{}'),
    })

    await Promise.all([
      api.postWithIdempotency('/kael/chat/session-a/confirm', { confirmation_kind: 'rfq_request' }, 'confirm-session-a-20260823'),
      api.postWithIdempotency('/kael/chat/session-a/confirm', { confirmation_kind: 'rfq_request' }, 'confirm-session-a-20260823'),
    ])

    withPillarContext(PILLAR, () => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
      for (const [, request] of mockFetch.mock.calls) {
        expect(request).toEqual(expect.objectContaining({
          body: JSON.stringify({ confirmation_kind: 'rfq_request' }),
          headers: expect.objectContaining({ 'Idempotency-Key': 'mobile:confirm-session-a-20260823' }),
        }))
      }
    }, 'confirmation retry identity belongs in the header, not the strict request body')
  })
})

import { describe, expect, it, vi } from 'vitest'

import { createEdgeAuthenticator } from '../../../../../supabase/functions/mobile-api/_shared/platform/auth'
import { createActorContext } from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/actor-context'
import {
  authorizeRouteCapability,
  CapabilityAuthorizationError,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/capability-policy'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P272-locked-account-deletion-only',
  invariant:
    'an account locked for a verified fabricated report is refused on every Edge route with an honest message, except POST /me/account-deletion; it reaches the actor context as locked rather than being normalised to active, so the capability policy refuses it a second time on anything but deletion',
  authority: [
    'governance/RULES.md #3, #8',
    'Tu 2026-09-25: fabricated customer report locks the account, deletion still allowed',
    'supabase/migrations/20260928120000_worker_discipline_foundation.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/platform/auth.ts',
  layer: 'unit',
  siblings: ['P268-appeal-restores-exactly-sql', 'P270-discipline-edge-routes'],
  mutation:
    'map "locked" back to "active" in normalizeAccountState, or drop the locked clause from the auth gate — the context-state or refusal case turns red',
} as const satisfies PillarManifest

const USER = '11111111-1111-4111-8111-111111111111'

function authenticatorFor(accountState: string) {
  const createClient = vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER, email: 'customer@example.com' } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { role: 'customer', account_state: accountState }, error: null })) })),
      })),
    })),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  }))
  return createEdgeAuthenticator({
    supabaseUrl: 'https://staging.example.test',
    supabaseSecretKey: 'service-role-key',
    harnessRelease: { deploymentId: null },
  } as never, createClient as never)
}

describe(`${PILLAR.id}: locked accounts`, () => {
  it('refuses a locked customer on an ordinary route with the lock reason', async () => {
    const result = await authenticatorFor('locked')(new Request('https://api.example.test/jobs', {
      headers: { Authorization: 'Bearer token' },
    }), ['customer'])
    expect(result, pillarWhy(PILLAR, JSON.stringify(result))).toMatchObject({ success: false, status: 403 })
    expect((result as { error: string }).error).toContain('bị khóa')
  })

  it('lets a locked customer ask for deletion and carries the locked state', async () => {
    const result = await authenticatorFor('locked')(new Request('https://api.example.test/me/account-deletion', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    }), ['customer'])
    expect(result, pillarWhy(PILLAR, JSON.stringify(result))).toMatchObject({ success: true, accountState: 'locked' })
  })

  it('refuses a locked actor in the capability policy on anything but deletion', () => {
    const actor = createActorContext({ userId: USER, role: 'customer', accountState: 'locked' })
    expect(actor.accountState).toBe('locked')
    expect(() => authorizeRouteCapability(actor, { kind: 'jobs.get', method: 'GET' } as never))
      .toThrowError(CapabilityAuthorizationError)
    try {
      authorizeRouteCapability(actor, { kind: 'jobs.get', method: 'GET' } as never)
    } catch (error) {
      expect((error as CapabilityAuthorizationError).code).toBe('ACCOUNT_NOT_ACTIVE')
    }
    expect(() => authorizeRouteCapability(actor, { kind: 'me.accountDeletion', method: 'POST' } as never)).not.toThrow()
  })

  it('keeps an active customer on ordinary routes', async () => {
    const result = await authenticatorFor('active')(new Request('https://api.example.test/jobs', {
      headers: { Authorization: 'Bearer token' },
    }), ['customer'])
    expect(result).toMatchObject({ success: true, accountState: 'active' })
  })
})

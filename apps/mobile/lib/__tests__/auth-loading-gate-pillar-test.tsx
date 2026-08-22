import type { Session } from '@supabase/supabase-js'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'

export const PILLAR = {
  id: 'P29-auth-session-shell',
  invariant:
    'once session and role are known, auth refetches must not replace the routed shell with a blocking spinner',
  authority: ['governance/protocols/frontend-test.md (state survives foreground refresh)'],
  target: 'apps/mobile/lib/auth-loading-gate.ts',
  layer: 'runtime-auth',
  siblings: [],
  mutation:
    'return loading from isAuthShellBlocking whenever auth.loading is true even if role is already set — tab refetch unmounts Kael chat like F5',
} as const satisfies PillarManifest

const mockSession = {
  access_token: 'token',
  user: { id: 'user-1', email: 'user@example.com' },
} as Session

describe('auth session shell gate', () => {
  it('blocks during bootstrap before auth resolves', () => {
    withPillarContext(PILLAR, () => {
      expect(isAuthShellBlocking({
        loading: true,
        profileStatus: 'idle',
        role: null,
        session: null,
      })).toBe(true)
    })
  })

  it('does not block guest mode while auth is loading', () => {
    withPillarContext(PILLAR, () => {
      expect(isAuthShellBlocking({
        guestMode: true,
        loading: true,
        profileStatus: 'idle',
        role: null,
        session: null,
      })).toBe(false)
    })
  })

  it('blocks until role resolves for a signed-in session', () => {
    withPillarContext(PILLAR, () => {
      expect(isAuthShellBlocking({
        loading: true,
        profileStatus: 'loading',
        role: null,
        session: mockSession,
      })).toBe(true)
    })
  })

  it('keeps the shell mounted during a soft role refresh', () => {
    withPillarContext(PILLAR, () => {
      expect(isAuthShellBlocking({
        loading: true,
        profileStatus: 'loading',
        role: 'customer',
        session: mockSession,
      })).toBe(false)
    })
  })
})

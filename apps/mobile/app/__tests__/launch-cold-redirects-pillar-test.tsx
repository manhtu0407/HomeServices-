import { render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P305-launch-cold-redirects',
  invariant:
    'a cold launch lands every actor on its own home (guest/customer, worker, admin, signed-out login) and never renders blank once auth has settled',
  authority: [
    'governance/protocols/frontend-test.md G2-G3',
    'docs/architecture/code-ownership-map.md (Auth And Role Gate)',
  ],
  target: 'apps/mobile/app/index.tsx',
  layer: 'integration',
  siblings: ['P304-launch-routing-targets', 'P42-auth-session-shell'],
  mutation:
    'change the worker branch in app/index.tsx to a different href — the worker case receives the wrong value',
} as const satisfies PillarManifest

type AuthState = {
  guestMode: boolean
  session: object | null
  role: string | null
  loading: boolean
  profileStatus: string
}

let mockAuth: AuthState
let mockActivation: { loading: boolean; status: { required: boolean } | null }

jest.mock('expo-router', () => {
  const { Text: MockText } = require('react-native')
  return {
    Redirect: ({ href }: { href: string }) => <MockText testID="redirect-href">{href}</MockText>,
  }
})
jest.mock('@/lib/auth-provider', () => ({ useAuth: () => mockAuth }))
jest.mock('@/lib/admin-activation-provider', () => ({ useAdminActivation: () => mockActivation }))
jest.mock('@/components/ui/app-loading-shell', () => {
  const { Text: MockText } = require('react-native')
  return { AppLoadingShell: () => <MockText testID="loading-shell">loading</MockText> }
})

import Index from '../index'

const settled = (overrides: Partial<AuthState>): AuthState => ({
  guestMode: false,
  session: { user: { id: 'u1' } },
  role: null,
  loading: false,
  profileStatus: 'ready',
  ...overrides,
})

beforeEach(() => {
  mockActivation = { loading: false, status: null }
})

describe('cold launch redirects', () => {
  const cases: [string, AuthState, string][] = [
    ['signed out', settled({ session: null }), '/(auth)/login'],
    ['guest', settled({ session: null, guestMode: true }), '/(customer)/(tabs)/home'],
    ['customer', settled({ role: 'customer' }), '/(customer)/(tabs)/home'],
    ['worker', settled({ role: 'worker' }), '/(worker)/(tabs)/home'],
    ['admin', settled({ role: 'admin' }), '/(admin)/sections'],
    ['admin operator', settled({ role: 'admin_operator' }), '/(admin)/sections'],
    ['session without a resolvable role', settled({ role: null }), '/(auth)/login'],
  ]

  it.each(cases)('routes %s to its home', (_name, auth, expected) => {
    mockAuth = auth
    render(<Index />)
    withPillarContext(PILLAR, () => expect(screen.getByTestId('redirect-href').props.children).toBe(expected))
  })

  it('shows the loading shell, not a blank screen, while the role is still resolving', () => {
    mockAuth = settled({ role: null, loading: true, profileStatus: 'loading' })
    render(<Index />)
    withPillarContext(PILLAR, () => expect(screen.getByTestId('loading-shell')).toBeOnTheScreen())
  })

  it('sends an account that must activate to the activation screen before any home', () => {
    mockAuth = settled({ role: 'admin' })
    mockActivation = { loading: false, status: { required: true } }
    render(<Index />)
    withPillarContext(PILLAR, () =>
      expect(screen.getByTestId('redirect-href').props.children).toBe('/(auth)/admin-activation'),
    )
  })
})

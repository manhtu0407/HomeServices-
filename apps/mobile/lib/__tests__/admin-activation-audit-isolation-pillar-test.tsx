import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

const mockApiGet = jest.fn()
const mockApiPost = jest.fn()
const mockSignOut = jest.fn()
let mockSession: unknown
let mockRole: 'customer' | 'worker' | 'admin' | 'admin_operator' | null

jest.mock('../api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

jest.mock('../auth-provider', () => ({
  useAuth: () => ({ session: mockSession, role: mockRole, signOut: mockSignOut }),
}))

import { AdminActivationProvider, useAdminActivation } from '../admin-activation-provider'

export const PILLAR = {
  id: 'P221-admin-activation-audit-isolation',
  invariant: 'only endpoint-authorized roles call admin activation APIs, and local visual-audit or unsupported roles never block the routed shell',
  authority: [
    'governance/protocols/ai-data-security.md §15 (auth and security-negative tests)',
    'docs/architecture/code-ownership-map.md (Auth And Role Gate)',
    'supabase/functions/mobile-api/_shared/http/routes/me.ts (activation route role allowlists)',
  ],
  target: 'apps/mobile/lib/admin-activation-provider.tsx',
  layer: 'security-negative',
  siblings: ['P42-auth-session-shell'],
  mutation: 'remove the local-audit or role guards; a worker reaches the GET route, or an admin_operator reaches the customer-only POST route',
} as const satisfies PillarManifest

function ActivationHarness() {
  const activation = useAdminActivation()
  const [activationResult, setActivationResult] = useState('pending')

  return (
    <>
      <Text testID="activation-loading">{String(activation.loading)}</Text>
      <Text testID="activation-required">{String(activation.status?.required ?? false)}</Text>
      <Text testID="activation-error">{activation.error ?? ''}</Text>
      <Text testID="activation-result">{activationResult}</Text>
      <Pressable testID="refresh-activation" onPress={() => void activation.refresh()} />
      <Pressable
        testID="activate-admin"
        onPress={() => {
          void activation.activate({
            current_password: 'InitialPass123!',
            new_password: 'PersonalPass456!',
          }).then((result) => setActivationResult(String(result)))
        }}
      />
    </>
  )
}

describe('Admin activation access by actor role', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession = {
      user: {
        id: 'local-visual-audit-customer',
        app_metadata: { provider: 'local-visual-audit' },
      },
    }
    mockRole = 'customer'
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        required: true,
        status: 'pending_password_change',
        email_masked: 'op***@example.com',
        full_name: 'QA Operator',
        capability_count: 1,
      },
    })
    mockApiPost.mockResolvedValue({ success: true, data: { ok: true } })
    mockSignOut.mockResolvedValue(undefined)
  })

  it('skips mounted and explicit reads without blocking the shell or showing activation state', async () => {
    render(
      <AdminActivationProvider>
        <ActivationHarness />
      </AdminActivationProvider>,
    )

    fireEvent.press(screen.getByTestId('refresh-activation'))

    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('activation-loading').props.children).toBe('false')
      expect(screen.getByTestId('activation-required').props.children).toBe('false')
      expect(screen.getByTestId('activation-error').props.children).toBe('')
    }, 'audit sessions stay out of the admin activation flow without waiting on the API'))

    withPillarContext(PILLAR, () => {
      expect(mockApiGet).not.toHaveBeenCalled()
    }, 'the mounted effect and explicit refresh must not send the synthetic token')
  })

  it('refuses activation without sending a protected mutation', async () => {
    render(
      <AdminActivationProvider>
        <ActivationHarness />
      </AdminActivationProvider>,
    )

    fireEvent.press(screen.getByTestId('activate-admin'))

    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('activation-result').props.children).toBe('false')
    }, 'synthetic audit identity cannot activate a real admin account'))

    withPillarContext(PILLAR, () => {
      expect(mockApiPost).not.toHaveBeenCalled()
      expect(mockSignOut).not.toHaveBeenCalled()
    }, 'local audit actions must not reach the Production mutation endpoint')
  })

  it('preserves the customer activation flow', async () => {
    mockSession = { user: { id: 'customer-session-1', app_metadata: { provider: 'email' } } }
    mockRole = 'customer'

    render(
      <AdminActivationProvider>
        <ActivationHarness />
      </AdminActivationProvider>,
    )

    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('activation-required').props.children).toBe('true')
      expect(mockApiGet).toHaveBeenCalledTimes(1)
    }, 'Customer remains eligible for the activation read'))

    fireEvent.press(screen.getByTestId('activate-admin'))

    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('activation-result').props.children).toBe('true')
      expect(mockApiPost).toHaveBeenCalledWith('/me/admin-activation', {
        current_password: 'InitialPass123!',
        new_password: 'PersonalPass456!',
      })
      expect(mockSignOut).toHaveBeenCalledTimes(1)
    }, 'Customer retains the password activation mutation and session invalidation'))
  })

  it('keeps authenticated workers out of the customer/operator activation endpoints', async () => {
    mockSession = { user: { id: 'worker-session-1', app_metadata: { provider: 'email' } } }
    mockRole = 'worker'

    render(
      <AdminActivationProvider>
        <ActivationHarness />
      </AdminActivationProvider>,
    )

    fireEvent.press(screen.getByTestId('refresh-activation'))
    fireEvent.press(screen.getByTestId('activate-admin'))

    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('activation-loading').props.children).toBe('false')
      expect(screen.getByTestId('activation-required').props.children).toBe('false')
      expect(screen.getByTestId('activation-error').props.children).toBe('')
      expect(screen.getByTestId('activation-result').props.children).toBe('false')
    }, 'a worker session does not wait on or enter customer/operator activation'))

    withPillarContext(PILLAR, () => {
      expect(mockApiGet).not.toHaveBeenCalled()
      expect(mockApiPost).not.toHaveBeenCalled()
      expect(mockSignOut).not.toHaveBeenCalled()
    }, 'Worker role is absent from both admin-activation route allowlists')
  })

  it('allows admin operators to read status but not call customer-only activation', async () => {
    mockSession = { user: { id: 'operator-session-1', app_metadata: { provider: 'email' } } }
    mockRole = 'admin_operator'

    render(
      <AdminActivationProvider>
        <ActivationHarness />
      </AdminActivationProvider>,
    )

    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('activation-required').props.children).toBe('true')
      expect(mockApiGet).toHaveBeenCalledTimes(1)
    }, 'admin_operator remains eligible for the guarded GET route'))

    fireEvent.press(screen.getByTestId('activate-admin'))

    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('activation-result').props.children).toBe('false')
    }, 'the POST route is customer-only'))

    withPillarContext(PILLAR, () => {
      expect(mockApiPost).not.toHaveBeenCalled()
      expect(mockSignOut).not.toHaveBeenCalled()
    }, 'operator reads do not imply permission for the customer-only activation mutation')
  })
})

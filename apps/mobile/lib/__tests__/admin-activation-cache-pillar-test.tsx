import { act, render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { readResource, writeResource } from '../resource-cache/resource-cache'
import { hydrateResourceOwner } from '../resource-cache/resource-cache-persistence'

const mockApiGet = jest.fn()
const mockSession = { access_token: 'token', user: { id: 'customer_activation_1', app_metadata: {} } }

jest.mock('../api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: jest.fn(),
  },
}))

jest.mock('../auth-provider', () => ({
  useAuth: () => ({ session: mockSession, role: 'customer', signOut: jest.fn() }),
}))

import { AdminActivationProvider, useAdminActivation } from '../admin-activation-provider'

export const PILLAR = {
  id: 'P328-admin-activation-cache',
  invariant: 'a cached activation answer unblocks the launch shell, but the server answer always replaces it, and an unreachable server never turns a cached answer into an error',
  authority: [
    'governance/RULES.md #0 (Edge enforces activation; the client only routes)',
    'docs/architecture/code-ownership-map.md (Auth And Role Gate)',
  ],
  target: 'apps/mobile/lib/admin-activation-provider.tsx',
  layer: 'security-negative',
  siblings: ['P221-admin-activation-audit-isolation', 'P327-auth-cold-start-role-cache'],
  mutation: 'return before applyResult whenever a cached answer exists — the server required:true case stays on the cached required:false',
} as const satisfies PillarManifest

const OWNER = mockSession.user.id
const KEY = 'auth.admin-activation:customer'
const notRequired = { required: false, status: null, email_masked: null, full_name: null, capability_count: 0 }
const required = { required: true, status: 'pending_password_change', email_masked: 'a***@x.vn', full_name: null, capability_count: 2 }

function Probe() {
  const activation = useAdminActivation()
  return (
    <>
      <Text testID="loading">{String(activation.loading)}</Text>
      <Text testID="required">{String(activation.status?.required ?? 'none')}</Text>
      <Text testID="error">{activation.error ?? ''}</Text>
    </>
  )
}

function never<T>() {
  return new Promise<T>(() => undefined)
}

beforeEach(async () => {
  mockApiGet.mockReset()
  await hydrateResourceOwner(OWNER)
})

describe('admin activation cache', () => {
  it('unblocks the shell from the cached answer while the server is still pending', async () => {
    writeResource(OWNER, KEY, notRequired)
    mockApiGet.mockImplementation(() => never())
    render(<AdminActivationProvider><Probe /></AdminActivationProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('required')).toHaveTextContent('false')
    }, 'a known activation answer must not hold the launch shell on the network')
  })

  it('lets a fresh server required:true replace a cached required:false', async () => {
    writeResource(OWNER, KEY, notRequired)
    mockApiGet.mockResolvedValue({ success: true, data: required, status: 200 })
    render(<AdminActivationProvider><Probe /></AdminActivationProvider>)

    await waitFor(() => expect(screen.getByTestId('required')).toHaveTextContent('true'))
    withPillarContext(PILLAR, () => {
      expect(readResource<typeof required>(OWNER, KEY)?.data.required).toBe(true)
    }, 'the cache must never hide an activation the server now requires')
  })

  it('keeps the cached answer without an error when the server is unreachable', async () => {
    writeResource(OWNER, KEY, notRequired)
    mockApiGet.mockResolvedValue({ success: false, error: 'Không thể kết nối đến hệ thống', code: 'NETWORK_ERROR', status: 0 })
    render(<AdminActivationProvider><Probe /></AdminActivationProvider>)

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('required')).toHaveTextContent('false')
      expect(screen.getByTestId('error')).toHaveTextContent('')
    }, 'an offline launch must not surface a fake activation error')
  })

  it('still blocks and reports the error when nothing is cached and the server is unreachable', async () => {
    mockApiGet.mockResolvedValue({ success: false, error: 'Không thể kết nối đến hệ thống', code: 'NETWORK_ERROR', status: 0 })
    render(<AdminActivationProvider><Probe /></AdminActivationProvider>)

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('error')).toHaveTextContent('Không thể kết nối đến hệ thống')
      expect(screen.getByTestId('required')).toHaveTextContent('none')
    }, 'with nothing cached the failure stays visible')
  })
})

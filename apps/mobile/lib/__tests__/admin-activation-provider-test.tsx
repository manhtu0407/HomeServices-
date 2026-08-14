import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

const mockApiGet = jest.fn()
const mockApiPost = jest.fn()
const mockSignOut = jest.fn()
const mockSession = { user: { id: 'pending-admin-1' } }

jest.mock('../api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

jest.mock('../auth-provider', () => ({
  useAuth: () => ({ session: mockSession, signOut: mockSignOut }),
}))

import { AdminActivationProvider, useAdminActivation } from '../admin-activation-provider'

function ActivationHarness() {
  const activation = useAdminActivation()
  const [activated, setActivated] = useState(false)
  return (
    <>
      <Text testID="activation-required">{String(activation.status?.required)}</Text>
      <Text testID="activation-complete">{String(activated)}</Text>
      <Pressable
        testID="activate-admin"
        onPress={() => {
          void activation.activate({
            current_password: 'InitialPass123!',
            new_password: 'PersonalPass456!',
          }).then(setActivated)
        }}
      />
    </>
  )
}

describe('AdminActivationProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

  it('clears the invalidated local session after the first password change', async () => {
    render(
      <AdminActivationProvider>
        <ActivationHarness />
      </AdminActivationProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('activation-required').props.children).toBe('true'))
    fireEvent.press(screen.getByTestId('activate-admin'))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/me/admin-activation', {
        current_password: 'InitialPass123!',
        new_password: 'PersonalPass456!',
      })
      expect(mockSignOut).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('activation-complete').props.children).toBe('true')
    })
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })
})

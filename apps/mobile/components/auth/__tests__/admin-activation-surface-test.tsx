import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { AdminActivationSurface } from '../admin-activation-surface'

const mockActivate = jest.fn()
const mockReplace = jest.fn()
let mockSession: { user: { id: string } } | null = { user: { id: 'pending-admin-1' } }
let mockStatus: {
  required: boolean
  status: 'pending_password_change' | 'active' | 'failed' | null
  email_masked: string | null
  full_name: string | null
  capability_count: number
} | null = {
  required: true,
  status: 'pending_password_change',
  email_masked: 'a•••@gmail.com',
  full_name: 'Admin Account One',
  capability_count: 2,
}

jest.mock('expo-router', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, { testID: 'activation-redirect' }, href),
    useRouter: () => ({ replace: mockReplace }),
  }
})

jest.mock('@/lib/admin-activation-provider', () => ({
  useAdminActivation: () => ({
    activate: mockActivate,
    error: null,
    loading: false,
    status: mockStatus,
  }),
}))

jest.mock('@/lib/app-language', () => ({ useAppLanguage: () => 'vi' }))
jest.mock('@/lib/auth-provider', () => ({ useAuth: () => ({ session: mockSession }) }))

describe('AdminActivationSurface', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession = { user: { id: 'pending-admin-1' } }
    mockStatus = {
      required: true,
      status: 'pending_password_change',
      email_masked: 'a•••@gmail.com',
      full_name: 'Admin Account One',
      capability_count: 2,
    }
    mockActivate.mockResolvedValue(true)
  })

  it('requires the first password change before routing the operator to Admin Sections', async () => {
    render(<AdminActivationSurface />)

    expect(screen.getByTestId('admin-first-password-change')).toBeTruthy()
    fireEvent.changeText(screen.getByLabelText('Mật khẩu ban đầu'), 'InitialPass123!')
    fireEvent.changeText(screen.getByLabelText('Mật khẩu mới'), 'PersonalPass456!')
    fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu mới'), 'PersonalPass456!')
    fireEvent.press(screen.getByTestId('admin-first-password-submit'))

    await waitFor(() => {
      expect(mockActivate).toHaveBeenCalledWith({
        current_password: 'InitialPass123!',
        new_password: 'PersonalPass456!',
      })
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login?stage=login&admin_activation=complete')
    })
  })

  it('blocks mismatched passwords locally and redirects accounts that no longer require activation', async () => {
    const view = render(<AdminActivationSurface />)
    fireEvent.changeText(screen.getByLabelText('Mật khẩu ban đầu'), 'InitialPass123!')
    fireEvent.changeText(screen.getByLabelText('Mật khẩu mới'), 'PersonalPass456!')
    fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu mới'), 'DifferentPass789!')
    fireEvent.press(screen.getByTestId('admin-first-password-submit'))

    expect(await screen.findByText('Mật khẩu mới phải có 8–128 ký tự và hai ô phải khớp nhau.')).toBeTruthy()
    expect(mockActivate).not.toHaveBeenCalled()

    mockStatus = { ...mockStatus!, required: false, status: 'active' }
    view.rerender(<AdminActivationSurface />)
    expect(screen.getByTestId('activation-redirect').props.children).toBe('/')
  })
})

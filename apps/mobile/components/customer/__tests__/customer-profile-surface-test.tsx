import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

let mockSessionMetadata: Record<string, unknown>
const mockSignOut = jest.fn()
const mockUpdateCustomerProfile = jest.fn()
const mockUpdatePassword = jest.fn()
const mockSubmitCustomerFeedback = jest.fn()
const mockReplace = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  }
})

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      user: {
        email: 'manhtu0407@gmail.com',
        id: 'customer_test_1',
        user_metadata: mockSessionMetadata,
      },
    },
    signOut: mockSignOut,
    updateCustomerProfile: mockUpdateCustomerProfile,
    updatePassword: mockUpdatePassword,
  }),
}))

jest.mock('@/lib/services', () => ({
  __esModule: true,
  customerFeedbackService: {
    submit: (...args: unknown[]) => mockSubmitCustomerFeedback(...args),
  },
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    setAppLanguage: jest.fn(),
    useAppLanguage: () => 'vi',
  }
})

import { CustomerProfileSurface, CustomerV4DockOverlay } from '../customer-surfaces'
import { setCustomerThemeMode } from '../customer-theme'

beforeEach(() => {
  setCustomerThemeMode('light')
  mockReplace.mockClear()
  mockSignOut.mockClear()
  mockSubmitCustomerFeedback.mockClear()
  mockSubmitCustomerFeedback.mockResolvedValue({
    data: {
      created_at: '2026-06-02T00:00:00.000Z',
      feedback_id: 'feedback-1',
      status: 'new',
    },
    status: 201,
    success: true,
  })
  mockUpdateCustomerProfile.mockClear()
  mockUpdateCustomerProfile.mockResolvedValue({ success: true })
  mockUpdatePassword.mockClear()
  mockUpdatePassword.mockResolvedValue({ success: true })
  mockSessionMetadata = {}
})

describe('CustomerProfileSurface editable rows', () => {
  it('shows the saved nickname in the profile hero when available', () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú', nickname: 'Tu Rooftop' }

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-profile-hero-title')).toHaveTextContent('Tu Rooftop')
    expect(screen.getByText('Thông tin cơ bản')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-profile-hero-status-pill')).toBeNull()
    expect(screen.queryByTestId('customer-section-liquid-wash-profile')).toBeNull()
    expect(screen.queryByTestId('customer-profile-mint-glass-slab')).toBeNull()
    expect(screen.queryByTestId('customer-profile-identity-liquid-card')).toBeNull()
    expect(screen.getByText('Tài khoản căn hộ')).toBeOnTheScreen()
    expect(screen.getByText('Thiết lập và hỗ trợ')).toBeOnTheScreen()
    expect(screen.queryByText('Hồ sơ khách')).toBeNull()
  })

  it('keeps the generic profile hero title when no nickname or name is saved', () => {
    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-profile-hero-title')).toHaveTextContent('Hồ sơ khách')
  })

  it('renders the Trust Signals card with three honest insight states without the intro block or CTA', () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-profile-home-care-card')).toHaveTextContent(/Tín hiệu tin cậy/)
    expect(screen.getByTestId('customer-profile-care-header-motion')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-profile-care-body-motion')).toBeNull()
    expect(screen.queryByTestId('customer-profile-care-shield-icon')).toBeNull()
    expect(screen.queryByTestId('customer-profile-care-signal-rail')).toBeNull()
    expect(screen.queryByTestId('customer-profile-care-top-wash')).toBeNull()
    const careCardStyle = StyleSheet.flatten(screen.getByTestId('customer-profile-home-care-card').props.style) as Record<string, unknown>
    expect(String(careCardStyle.backgroundImage)).not.toContain('radial-gradient')
    expect(screen.getByTestId('customer-profile-care-stat-motion-0')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-profile-care-stat-motion-1')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-profile-care-stat-motion-2')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-profile-insight-0')).toHaveTextContent('Sẵn sàng')
    expect(screen.getByTestId('customer-profile-insight-1')).toHaveTextContent('Chưa có')
    expect(screen.getByTestId('customer-profile-insight-2')).toHaveTextContent('Chờ kiểm giá')

    expect(screen.queryByTestId('customer-profile-home-care-cta')).toBeNull()
  })

  it('uses real profile metrics in the Trust Signals card when they exist', () => {
    mockSessionMetadata = {
      default_address: 'Căn hộ 1201, tòa A, Quận 1',
      full_name: 'Phan Mạnh Tú',
      kael_interaction_count: 4,
      phone_number: '0901234567',
      completed_service_count: 2,
      price_savings_vnd: 150000,
    }

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-profile-insight-0')).toHaveTextContent('4')
    expect(screen.getByTestId('customer-profile-insight-1')).toHaveTextContent('2')
    expect(screen.getByTestId('customer-profile-insight-2')).toHaveTextContent('150.000đ')
  })

  it.each([
    ['customer-profile-edit-nickname', 'Nguyen Tu', { nickname: 'Nguyen Tu' }],
    ['customer-utility-saved-address', 'Can ho 1201, toa A, Quan 1', { defaultAddress: 'Can ho 1201, toa A, Quan 1' }],
  ])('opens %s and saves the edited value', async (rowTestID, value, expectedPayload) => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId(rowTestID))
    fireEvent.changeText(screen.getByTestId('customer-profile-editor-input'), value)
    fireEvent.press(screen.getByTestId('customer-profile-editor-save'))

    await waitFor(() => {
      expect(mockUpdateCustomerProfile).toHaveBeenCalledWith(expectedPayload)
    })
  })

  it('opens account information and saves contact metadata', async () => {
    mockSessionMetadata = {
      contact_email: 'old@example.com',
      full_name: 'Phan Manh Tu',
      phone_number: '0900000000',
    }

    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-account-info'))
    expect(screen.getByTestId('customer-account-info-sheet')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-account-gender-segment')).toBeOnTheScreen()

    fireEvent.changeText(screen.getByTestId('customer-account-full-name-input'), 'Nguyen Van Tu')
    fireEvent.press(screen.getByTestId('customer-account-gender-male'))
    fireEvent.changeText(screen.getByTestId('customer-account-birth-date-input'), '01021990')
    expect(screen.getByTestId('customer-account-birth-date-input').props.value).toBe('01/02/1990')
    fireEvent.changeText(screen.getByTestId('customer-account-phone-input'), '0901234567')
    fireEvent.changeText(screen.getByTestId('customer-account-email-input'), 'tu@example.com')
    fireEvent.press(screen.getByTestId('customer-account-info-save'))

    await waitFor(() => {
      expect(mockUpdateCustomerProfile).toHaveBeenCalledWith({
        birthDate: '01/02/1990',
        email: 'tu@example.com',
        fullName: 'Nguyen Van Tu',
        gender: 'male',
        phone: '0901234567',
        salutation: undefined,
      })
    })
  })

  it('rejects invalid phone input in account information before saving profile metadata', async () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-account-info'))
    fireEvent.changeText(screen.getByTestId('customer-account-phone-input'), 'abc')
    fireEvent.press(screen.getByTestId('customer-account-info-save'))

    expect(screen.getByTestId('customer-account-info-error')).toBeOnTheScreen()
    expect(mockUpdateCustomerProfile).not.toHaveBeenCalled()
  })

  it('opens feedback and sends it to Kael through the mobile API service', async () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-feedback'))
    expect(screen.getByTestId('customer-feedback-sheet')).toBeOnTheScreen()

    const feedbackMessage = 'Kael nên giải thích biên giá rõ hơn trước khi tạo yêu cầu.'
    fireEvent.changeText(screen.getByTestId('customer-feedback-input'), feedbackMessage)
    await waitFor(() => {
      expect(screen.getByTestId('customer-feedback-input').props.value).toBe(feedbackMessage)
    })
    fireEvent.press(screen.getByTestId('customer-feedback-submit'))
    await waitFor(() => {
      expect(mockSubmitCustomerFeedback).toHaveBeenCalledWith({
        language: 'vi',
        message: feedbackMessage,
        source: 'profile',
      })
    })
  })

  it('rejects short feedback before calling the backend service', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-feedback'))
    fireEvent.changeText(screen.getByTestId('customer-feedback-input'), 'Ngắn')
    fireEvent.press(screen.getByTestId('customer-feedback-submit'))

    expect(screen.getByTestId('customer-feedback-error')).toBeOnTheScreen()
    expect(mockSubmitCustomerFeedback).not.toHaveBeenCalled()
  })

  it('opens password support and updates the signed-in account password', async () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-password'))
    expect(screen.getByTestId('customer-password-sheet')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-password-current-input').props.secureTextEntry).toBe(true)
    expect(screen.getByTestId('customer-password-new-input').props.secureTextEntry).toBe(true)
    expect(screen.getByTestId('customer-password-confirm-input').props.secureTextEntry).toBe(true)

    fireEvent.changeText(screen.getByTestId('customer-password-current-input'), 'CurrentSafe123')
    fireEvent.changeText(screen.getByTestId('customer-password-new-input'), 'KaelSafe123')
    fireEvent.changeText(screen.getByTestId('customer-password-confirm-input'), 'KaelSafe123')
    fireEvent.press(screen.getByTestId('customer-password-save'))

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        currentPassword: 'CurrentSafe123',
        newPassword: 'KaelSafe123',
      })
    })
  })

  it('requires the current password before changing the account password', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-password'))
    fireEvent.changeText(screen.getByTestId('customer-password-new-input'), 'KaelSafe123')
    fireEvent.changeText(screen.getByTestId('customer-password-confirm-input'), 'KaelSafe123')
    fireEvent.press(screen.getByTestId('customer-password-save'))

    expect(screen.getByTestId('customer-password-error')).toHaveTextContent('Nhập mật khẩu hiện tại để tiếp tục.')
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it('rejects mismatched password confirmation before calling auth', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-password'))
    fireEvent.changeText(screen.getByTestId('customer-password-current-input'), 'CurrentSafe123')
    fireEvent.changeText(screen.getByTestId('customer-password-new-input'), 'KaelSafe123')
    fireEvent.changeText(screen.getByTestId('customer-password-confirm-input'), 'KaelSafe456')
    fireEvent.press(screen.getByTestId('customer-password-save'))

    expect(screen.getByTestId('customer-password-error')).toHaveTextContent('Hai mật khẩu chưa khớp.')
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it('rejects short passwords before calling auth', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-profile-open-password'))
    fireEvent.changeText(screen.getByTestId('customer-password-current-input'), 'CurrentSafe123')
    fireEvent.changeText(screen.getByTestId('customer-password-new-input'), 'short')
    fireEvent.changeText(screen.getByTestId('customer-password-confirm-input'), 'short')
    fireEvent.press(screen.getByTestId('customer-password-save'))

    expect(screen.getByTestId('customer-password-error')).toHaveTextContent('Mật khẩu cần 8-72 ký tự.')
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })
})

describe('CustomerV4DockOverlay', () => {
  it('splits four main sections from the Kael Orb action', async () => {
    render(<CustomerV4DockOverlay active="home" />)

    expect(screen.getByTestId('customer-dock-motion-shell')).toHaveProp('pointerEvents', 'box-none')
    expect(screen.getByTestId('customer-dock-split-toolbar')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-liquid-glass-dock')).toBeOnTheScreen()
    expect(screen.getByTestId('liquid-toolbar-apple-material')).toBeOnTheScreen()
    expect(screen.getByTestId('liquid-toolbar-segmented-control')).toBeOnTheScreen()
    expect(screen.getByTestId('liquid-toolbar-service-segment-motion')).toBeOnTheScreen()
    expect(screen.getByTestId('liquid-toolbar-slider-thumb')).toBeOnTheScreen()
    expect(screen.getByTestId('liquid-toolbar-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('liquid-toolbar-specular-sheen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-dock-backdrop-shield')).toBeNull()
    expect(screen.getByTestId('customer-v4-dock-home')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-booking')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-profile')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-kael')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-dock-kael-action-glass')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-dock-kael-action-edge')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-dock-kael-action-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('liquid-toolbar-selection-kael')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v4-dock-booking'))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/booking')
    })

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('customer-v4-dock-kael'))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael')
    })
  })

  it('hides the dock on downward scroll and restores it on upward scroll', async () => {
    render(
      <>
        <CustomerProfileSurface />
        <CustomerV4DockOverlay active="profile" />
      </>,
    )

    expect(screen.getByTestId('customer-dock-motion-shell')).toHaveProp('pointerEvents', 'box-none')

    fireEvent.scroll(screen.getByTestId('customer-v4-scroll'), {
      nativeEvent: { contentOffset: { y: 90 } },
    })
    await waitFor(() => {
      expect(screen.getByTestId('customer-dock-motion-shell')).toHaveProp('pointerEvents', 'none')
    })

    fireEvent.scroll(screen.getByTestId('customer-v4-scroll'), {
      nativeEvent: { contentOffset: { y: 50 } },
    })
    await waitFor(() => {
      expect(screen.getByTestId('customer-dock-motion-shell')).toHaveProp('pointerEvents', 'box-none')
    })
  })

  it('uses Apple-style Dark Mode treatment for client image assets', () => {
    setCustomerThemeMode('dark')

    render(<CustomerV4DockOverlay active="home" />)

    expect(screen.getAllByTestId('customer-client-asset-appearance-adaptive').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('customer-client-asset-dark-elevated-base').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('customer-client-asset-dark-softener').length).toBeGreaterThan(0)
  })
})

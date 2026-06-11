import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import type { LocalDeal, LocalWorkflowSelectors } from '@home-services/shared'

let mockWorkflowValue: any
let mockSessionMetadata: Record<string, unknown>
const mockSetPendingKaelChatDraft = jest.fn()
const mockPush = jest.fn()
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
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
        id: 'customer_test_1',
        user_metadata: mockSessionMetadata,
      },
    },
  }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/client-request-id', () => ({
  generateClientRequestId: () => 'home-command-request-id',
}))

jest.mock('../kael-chat/pending-intake', () => ({
  setPendingKaelChatDraft: (draft: unknown) => mockSetPendingKaelChatDraft(draft),
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { CustomerHomeSurface } from '../customer-surfaces'
import { setCustomerThemeMode } from '../customer-theme'

function buildActiveDeal(): LocalDeal {
  return {
    backendStatus: 'broadcasting',
    broadcast: {
      broadcastId: 'broadcast_test_1',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Thủ Đức',
      jobId: 'job_test_1',
      prebrief: [],
      problemSummary: 'Bóng đèn hư',
      secondsRemaining: 42,
      serviceType: 'electrical',
      status: 'sent',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: '1714/7 Nguyễn Duy Trinh, phường Bình Trưng Tây, Thủ Đức',
      description: 'Bóng đèn nhà tôi bị hư rồi',
      districtLabel: 'Thủ Đức',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: ['bóng đèn hỏng'],
      serviceType: 'electrical',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael đang giữ ước tính theo bằng chứng hiện có.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Ước tính dựa trên bằng chứng hiện tại.',
      hasVndPrice: true,
      priceRangeLabel: '180.000đ - 260.000đ',
      problemLabel: 'Bóng đèn hỏng',
    },
    finalPrice: null,
    id: 'job_test_1',
    scopeChange: null,
    status: 'broadcasting',
  }
}

function buildWorkflow(deal: LocalDeal | null) {
  const selectors: LocalWorkflowSelectors = {
    canConfirmCustomerSearch: false,
    canCustomerCancelDeal: Boolean(deal),
    canCustomerConfirmCompletion: false,
    canCustomerSubmitReview: false,
    canWorkerAccept: false,
    canWorkerAdvance: false,
    canWorkerSeeFullAddress: false,
    currentBackendStatus: deal?.backendStatus ?? deal?.status ?? null,
    currentStatus: deal?.status ?? null,
    customerSearchState: deal ? 'searching' : 'idle',
    draftValidationMessage: null,
    hasLocalBroadcast: Boolean(deal?.broadcast),
    paymentLocked: true,
    reviewLocked: true,
    scheduleMode: 'now_only',
  }

  mockWorkflowValue = {
    actions: {},
    dispatch: jest.fn(),
    selectors,
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
  }
}

beforeEach(() => {
  setCustomerThemeMode('light')
  mockSetPendingKaelChatDraft.mockClear()
  mockPush.mockClear()
  mockReplace.mockClear()
  mockSessionMetadata = {}
  buildWorkflow(null)
})

describe('CustomerHomeSurface address context', () => {
  it('greets the customer by real profile name and keeps the Kael home prompt in the hero', () => {
    mockSessionMetadata = { full_name: 'Anh Hoàng' }

    render(<CustomerHomeSurface />)

    expect(screen.getByText('Xin chào, Anh Hoàng')).toBeOnTheScreen()
    expect(screen.getByText('Bạn cần Kael giúp việc gì hôm nay?')).toBeOnTheScreen()
  })

  it('hands a real home command draft directly to Kael chat', () => {
    render(<CustomerHomeSurface />)

    fireEvent.changeText(screen.getByTestId('customer-home-kael-command-input'), 'Ổ cắm phòng khách bị nóng')
    fireEvent.press(screen.getByTestId('customer-home-kael-command-send'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      clientRequestId: 'home-command-request-id',
      locale: 'vi',
      mediaCount: 0,
      message: 'Ổ cắm phòng khách bị nóng',
      problemChips: [],
      serviceType: null,
      source: 'kael',
    }))
    expect(mockPush).toHaveBeenCalledWith('/(customer)/kael-chat')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('adds a restrained worker mint boost to home service and shortcut tiles', () => {
    render(<CustomerHomeSurface />)

    const serviceStyle = screen.getByTestId('customer-shell-service-electrical').props.style
    const shortcutStyle = screen.getByTestId('customer-home-shortcut-active').props.style
    const serviceCardStyle = StyleSheet.flatten(typeof serviceStyle === 'function' ? serviceStyle({ pressed: false }) : serviceStyle) as Record<string, unknown>
    const shortcutCardStyle = StyleSheet.flatten(typeof shortcutStyle === 'function' ? shortcutStyle({ pressed: false }) : shortcutStyle) as Record<string, unknown>
    const serviceIconStageStyle = StyleSheet.flatten(screen.getByTestId('customer-shell-service-electrical-icon-stage').props.style) as Record<string, unknown>
    const shortcutIconStageStyle = StyleSheet.flatten(screen.getByTestId('customer-home-shortcut-active-icon-stage').props.style) as Record<string, unknown>
    const serviceIconShellStyle = StyleSheet.flatten(within(screen.getByTestId('customer-shell-service-electrical-icon-stage')).getByTestId('customer-client-asset-elevated-shell').props.style) as Record<string, unknown>
    const shortcutIconShellStyle = StyleSheet.flatten(within(screen.getByTestId('customer-home-shortcut-active-icon-stage')).getByTestId('customer-client-asset-elevated-shell').props.style) as Record<string, unknown>
    const serviceTitleStyle = StyleSheet.flatten(within(screen.getByTestId('customer-shell-service-electrical')).getByText('Sửa điện').props.style) as Record<string, unknown>
    const shortcutTitleStyle = StyleSheet.flatten(within(screen.getByTestId('customer-home-shortcut-active')).getByText('Yêu cầu').props.style) as Record<string, unknown>

    expect(String(serviceCardStyle.backgroundImage)).toContain('rgba(76,222,199,0.12)')
    expect(String(serviceCardStyle.backgroundImage)).toContain('rgba(76,222,199,0.061)')
    expect(String(shortcutCardStyle.backgroundImage)).toContain('rgba(76,222,199,0.12)')
    expect(String(shortcutCardStyle.backgroundImage)).toContain('rgba(76,222,199,0.061)')
    expect(serviceCardStyle.alignItems).toBe('center')
    expect(shortcutCardStyle.alignItems).toBe('center')
    expect(serviceIconStageStyle.alignItems).toBe('center')
    expect(shortcutIconStageStyle.alignItems).toBe('center')
    expect(serviceTitleStyle.textAlign).toBe('center')
    expect(shortcutTitleStyle.textAlign).toBe('center')
    expect(serviceIconShellStyle.height).toBe(42)
    expect(serviceIconShellStyle.width).toBe(42)
    expect(shortcutIconShellStyle.height).toBe(33)
    expect(shortcutIconShellStyle.width).toBe(33)
  })

  it('renders all four real customer home shortcuts without fake counters', () => {
    render(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-home-shortcut-active')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-shortcut-history')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-shortcut-address')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-shortcut-trust')).toBeOnTheScreen()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('--')).toBeNull()
    expect(screen.queryByText('Local')).toBeNull()
  })

  it('shows the full active request address and applies a subtle worker mint wash', () => {
    buildWorkflow(buildActiveDeal())

    render(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-home-address-value')).toHaveTextContent(/1714\/7 Nguyễn Duy Trinh/)
    expect(screen.getByTestId('customer-home-address-value')).toHaveTextContent(/phường Bình Trưng Tây/)
    expect(screen.getByTestId('customer-home-address-value')).toHaveTextContent(/Thủ Đức/)
    expect(screen.getByTestId('customer-home-address-value').props.numberOfLines).toBeUndefined()

    const style = screen.getByTestId('customer-home-address-card').props.style
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style
    const cardStyle = StyleSheet.flatten(resolvedStyle) as Record<string, unknown>
    expect(String(cardStyle.backgroundImage)).toContain('rgba(76,222,199,0.16)')
  })

  it('applies a stronger worker mint formula to the active request card', () => {
    const deal = buildActiveDeal()
    deal.status = 'draft'
    deal.backendStatus = 'draft'
    deal.draft.serviceType = 'cleaning'
    deal.draft.problemChips = []
    buildWorkflow(deal)

    render(<CustomerHomeSurface />)

    const activeCardStyle = StyleSheet.flatten(screen.getByTestId('customer-home-active-local-deal').props.style) as Record<string, unknown>
    expect(screen.getByTestId('customer-home-active-local-deal')).toHaveTextContent(/Vệ sinh/)
    expect(screen.getByTestId('customer-home-active-local-deal')).not.toHaveTextContent(/Nháp/)
    expect(screen.getByTestId('customer-home-active-status')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-active-estimate')).toHaveTextContent(/180\.000/)
    expect(String(activeCardStyle.backgroundImage)).toContain('rgba(76,222,199,0.20)')
    expect(String(activeCardStyle.backgroundImage)).toContain('rgba(76,222,199,0.10)')
  })
})

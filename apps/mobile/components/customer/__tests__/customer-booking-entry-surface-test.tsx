import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { PROBLEM_CHIPS, type LocalWorkflowSelectors } from '@nestscout/shared'

let mockWorkflowValue: any
let mockAuthValue: any
let mockRouteParams: Record<string, string | string[] | undefined>
const mockReplace = jest.fn()
const mockCreateRemoteJobFromDraft = jest.fn()
const mockSetPendingKaelChatDraft = jest.fn()
const mockPlacesAutocomplete = jest.fn()
const mockRequestRecordingPermissionsAsync = jest.fn()
const mockSetAudioModeAsync = jest.fn()
const mockAudioRecorder = {
  prepareToRecordAsync: jest.fn(),
  record: jest.fn(),
  stop: jest.fn(),
  uri: null as string | null,
}
const mockAudioRecorderState = {
  durationMillis: 0,
  isRecording: false,
}

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: () => mockRequestRecordingPermissionsAsync(),
  },
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  setAudioModeAsync: (options: unknown) => mockSetAudioModeAsync(options),
  useAudioRecorder: () => mockAudioRecorder,
  useAudioRecorderState: () => mockAudioRecorderState,
}))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => mockAuthValue,
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('../kael-chat/pending-intake', () => ({
  setPendingKaelChatDraft: (ownerId: string, draft: unknown) => mockSetPendingKaelChatDraft(ownerId, draft),
  takePendingKaelChatDraft: jest.fn(),
}))

jest.mock('@/lib/client-request-id', () => ({
  generateClientRequestId: () => '11111111-1111-4111-8111-111111111111',
}))

jest.mock('@/lib/services', () => {
  const actual = jest.requireActual('@/lib/services')
  return {
    ...actual,
    placesService: {
      ...actual.placesService,
      autocomplete: (...args: unknown[]) => mockPlacesAutocomplete(...args),
    },
  }
})

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { CustomerBookingEntrySurface } from '../customer-surfaces'

function buildWorkflow() {
  const selectors: LocalWorkflowSelectors = {
    canConfirmCustomerSearch: false,
    canCustomerCancelDeal: false,
    canCustomerConfirmCompletion: false,
    canCustomerSubmitReview: false,
    canWorkerAccept: false,
    canWorkerAdvance: false,
    canWorkerSeeFullAddress: false,
    currentBackendStatus: null,
    currentStatus: null,
    customerSearchState: 'idle',
    draftValidationMessage: null,
    hasLocalBroadcast: false,
    paymentLocked: true,
    reviewLocked: true,
    scheduleMode: 'now_only',
  }

  mockWorkflowValue = {
    actions: {
      createRemoteJobFromDraft: mockCreateRemoteJobFromDraft,
    },
    dispatch: jest.fn(),
    selectors,
    state: {
      deal: null,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
  }
}

function selectTomorrowQuickSchedule(timeIndex = 0) {
  fireEvent.press(screen.getByTestId('customer-v21-booking-date-1'))
  fireEvent.press(screen.getByTestId(`customer-v21-booking-time-${timeIndex}`))
}

beforeEach(() => {
  mockRouteParams = {}
  mockAuthValue = {
    guestMode: false,
    session: { user: { id: 'customer_test_1', user_metadata: {} } },
  }
  mockCreateRemoteJobFromDraft.mockClear()
  mockReplace.mockClear()
  mockSetPendingKaelChatDraft.mockClear()
  mockSetPendingKaelChatDraft.mockResolvedValue(undefined)
  mockPlacesAutocomplete.mockReset()
  mockPlacesAutocomplete.mockImplementation(() => new Promise<never>(() => undefined))
  mockAudioRecorder.prepareToRecordAsync.mockReset()
  mockAudioRecorder.prepareToRecordAsync.mockResolvedValue(undefined)
  mockAudioRecorder.record.mockReset()
  mockAudioRecorder.record.mockImplementation(() => {
    mockAudioRecorder.uri = null
    mockAudioRecorderState.isRecording = true
  })
  mockAudioRecorder.stop.mockReset()
  mockAudioRecorder.stop.mockImplementation(async () => {
    mockAudioRecorder.uri = 'file://kael-voice-1.m4a'
    mockAudioRecorderState.isRecording = false
  })
  mockAudioRecorder.uri = null
  mockAudioRecorderState.durationMillis = 0
  mockAudioRecorderState.isRecording = false
  mockRequestRecordingPermissionsAsync.mockReset()
  mockRequestRecordingPermissionsAsync.mockResolvedValue({ granted: true })
  mockSetAudioModeAsync.mockReset()
  mockSetAudioModeAsync.mockResolvedValue(undefined)
  buildWorkflow()
})

describe('CustomerBookingEntrySurface v2.1', () => {
  it('blocks guests before creating any pending Kael draft', () => {
    mockAuthValue = { guestMode: true, session: null }

    render(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-v21-guest-gate')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-guest-login'))

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login')
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
  })

  it('starts the services board clean instead of rehydrating a prior Kael deal', () => {
    mockWorkflowValue.state.deal = {
      draft: {
        addressLabel: 'Previous apartment details',
        description: 'Previous problem details',
        districtLabel: 'District 1',
        mediaCount: 1,
        problemChips: [PROBLEM_CHIPS.plumbing[0]],
        serviceType: 'plumbing',
      },
    }

    render(<CustomerBookingEntrySurface />)

    expect(screen.queryByTestId('customer-v21-selected-service')).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-address')).toHaveProp('value', '')
    expect(screen.getByTestId('customer-v21-booking-description')).toHaveProp('value', '')
  })

  it('renders the six approved service paths without fake worker or priority data', () => {
    render(<CustomerBookingEntrySurface />)

    expect(screen.queryByText('≡')).toBeNull()
    expect(screen.getByTestId('customer-v21-service-electrical')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-plumbing')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-home_cleaning')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-hvac_basic_maintenance')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-upholstery_care')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-handyman_minor_installation')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-step-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-step-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-step-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-progress-node-1')).toHaveTextContent('1')
    expect(screen.getByTestId('customer-v21-booking-progress-node-4')).toHaveTextContent('4')
    expect(screen.getByTestId('customer-v21-booking-progress-line-1')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-progress-line-3')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-booking-search-source')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-search-mint-border')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-search-icon')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-search-input')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-search-suggestions')).toBeNull()
    expect(screen.queryByText('Gợi ý đặt')).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-info-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-info-card-aura-layer')).toHaveStyle({ opacity: 0.8 })
    expect(screen.getByTestId('customer-v21-booking-info-card-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-info-card-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-schedule-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-schedule-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-schedule-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-date-grid-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-custom-date-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-time-0-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-custom-time-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-description-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-description-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-booking-kael-context')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-kael-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-submit-mint-aura')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ dẫn bạn theo từng bước')).toBeOnTheScreen()
    expect(screen.queryByText(/Công việc mới/)).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/Chưa chọn/)
    expect(screen.queryByText('Sớm nhất có thể')).toBeNull()
    expect(screen.queryByTestId('customer-v21-screen-2.3-media')).toBeNull()
    expect(screen.queryByText(/rating|4\.9|Nguyễn Văn Minh/i)).toBeNull()
  })

  it('uses compact service-specific detail rails for all six customer services', () => {
    render(<CustomerBookingEntrySurface />)

    for (const [service, details] of [
      ['electrical', ['Ổ cắm · cầu dao', 'Đèn']],
      ['plumbing', ['Rò rỉ', 'Đường ống']],
      ['home_cleaning', ['Diện tích', 'Hiện trạng · ưu tiên']],
      ['hvac_basic_maintenance', ['Vệ sinh · kiểm tra', 'An toàn']],
      ['upholstery_care', ['Chất liệu · vết bẩn', 'Mùi · khô']],
      ['handyman_minor_installation', ['Vật tư · dụng cụ', 'Ranh giới việc']],
    ] as const) {
      expect(screen.getByTestId(`customer-v21-service-${service}-visual-panel`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-service-${service}-icon`)).toHaveStyle({
        backgroundColor: 'transparent',
        borderWidth: 0,
      })
      expect(screen.getByTestId(`customer-v21-service-${service}-connector`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-service-${service}-connector-dot`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-service-${service}-heading`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-service-${service}-title`)).toHaveStyle({
        fontSize: 14,
        lineHeight: 18,
        marginTop: 4,
      })
      expect(screen.getByTestId(`customer-v21-service-${service}-detail-0`)).toHaveTextContent(details[0])
      expect(screen.getByTestId(`customer-v21-service-${service}-detail-1`)).toHaveTextContent(details[1])
      expect(screen.getByTestId(`customer-v21-service-${service}-detail-rail`)).not.toHaveTextContent(/Mô tả nhu cầu|Bạn xác nhận/)
      expect(screen.getByTestId(`customer-v21-service-${service}-detail-rail`)).toHaveStyle({
        borderTopWidth: 0,
        flexDirection: 'row',
        marginTop: 6,
        paddingTop: 0,
      })
    }

    expect(screen.getByTestId('customer-v21-service-electrical')).toHaveStyle({
      alignItems: 'stretch',
      flexBasis: '48%',
      flexDirection: 'row',
      minHeight: 100,
    })
    expect(screen.getByTestId('customer-v21-service-electrical-visual-panel')).toHaveStyle({
      borderRightWidth: 1,
      minHeight: 100,
      width: 80,
    })
    expect(screen.getByTestId('customer-v21-service-electrical-copy')).toHaveStyle({
      justifyContent: 'center',
      paddingLeft: 40,
      paddingRight: 14,
      paddingVertical: 10,
    })
    expect(screen.getByTestId('customer-v21-service-electrical')).toHaveProp(
      'accessibilityLabel',
      'Sửa điện. Ổ cắm · cầu dao · đèn',
    )
  })

  it('keeps the redesigned service tile after the customer selects a service', () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.press(screen.getByTestId('customer-v21-service-electrical'))

    expect(screen.getByTestId('customer-v21-selected-service')).toHaveStyle({
      alignItems: 'stretch',
      flexBasis: '100%',
      flexDirection: 'row',
      maxWidth: '100%',
      minHeight: 100,
    })
    expect(screen.getByTestId('customer-v21-selected-service-visual-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-selected-service-formula-mint-aura')).toHaveStyle({
      bottom: 0,
      left: 0,
      opacity: 0.94,
      position: 'absolute',
      right: 0,
      top: 0,
      zIndex: 0,
    })
    expect(screen.getByTestId('customer-v21-selected-service-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-selected-service-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-selected-service-connector')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-selected-service-connector-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-selected-service-detail-0')).toHaveTextContent('Ổ cắm · cầu dao')
    expect(screen.getByTestId('customer-v21-selected-service-detail-1')).toHaveTextContent('Đèn')
    expect(screen.queryByTestId('customer-v21-booking-suggested-chip-aura')).toBeNull()
    expect(screen.queryByText('Bạn đã chọn')).toBeNull()
    expect(screen.queryByText('Chưa có')).toBeNull()
  })

  it.each([
    ['electrical', 'electrical', 'electric_diagnose', PROBLEM_CHIPS.electrical[0]],
    ['plumbing', 'plumbing', 'water_diagnose', PROBLEM_CHIPS.plumbing[0]],
    ['home_cleaning', 'cleaning', 'clean_scope', PROBLEM_CHIPS.cleaning[0]],
    ['hvac_basic_maintenance', 'hvac', 'air_scope', PROBLEM_CHIPS.hvac[0]],
    ['upholstery_care', 'upholstery', 'fabric_scope', PROBLEM_CHIPS.upholstery[0]],
    ['handyman_minor_installation', 'handyman', 'task_scope', PROBLEM_CHIPS.handyman[0]],
  ] as const)(
    'uses the same Basic Intake for %s and preserves its canonical Kael profile',
    async (serviceId, serviceType, profileId, firstProblemChip) => {
      mockRouteParams = { service: serviceId }
      render(<CustomerBookingEntrySurface />)

      expect(screen.getByTestId('customer-v21-selected-service')).toBeOnTheScreen()
      expect(screen.getByTestId('customer-v21-booking-description')).toBeOnTheScreen()
      expect(screen.getByTestId('customer-v21-booking-schedule-panel')).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-problem-${firstProblemChip}`)).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-booking-add-media')).toBeNull()
      expect(screen.queryByTestId('customer-v21-booking-media-count')).toBeNull()
      expect(screen.queryByTestId('customer-v21-performance-intake')).toBeNull()
      expect(screen.queryByTestId('customer-v21-performance-scope-card')).toBeNull()
      expect(screen.queryByTestId('customer-v21-performance-question-hvac_goal')).toBeNull()

      fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
      fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Can Kael tim hieu them truoc khi bao gia')
      selectTomorrowQuickSchedule()
      fireEvent.press(screen.getByTestId(`customer-v21-problem-${firstProblemChip}`))
      fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

      await waitFor(() => {
        expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith('customer_test_1', expect.objectContaining({
          description: 'Can Kael tim hieu them truoc khi bao gia',
          problemChips: [firstProblemChip],
          profileId,
          scheduleMode: 'scheduled',
          scheduleWindow: expect.objectContaining({
            date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            end: '10:00',
            start: '08:00',
            timeZone: 'Asia/Ho_Chi_Minh',
          }),
          scheduledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          serviceType,
        }))
      })
      expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
    },
  )

  it('requires a complete desired time before handing Basic Intake to Kael Case Work', async () => {
    mockRouteParams = { service: 'handyman_minor_installation' }
    render(<CustomerBookingEntrySurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Can lap ke nho trong phong khach')
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(screen.getByTestId('customer-v21-booking-error')).toHaveTextContent(/giờ bắt đầu mong muốn/i)
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()

    selectTomorrowQuickSchedule()
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    await waitFor(() => expect(mockSetPendingKaelChatDraft).toHaveBeenCalledTimes(1))
  })

  it('uses mint text for booking guidance instead of red error copy', () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    const errorStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-error').props.style)
    expect(errorStyle.color).toBe('#08AF9C')
  })

  it('keeps the booking location row balanced without a fake chevron', () => {
    render(<CustomerBookingEntrySurface />)

    const rowStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-address-row').props.style)
    const inputStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-address').props.style)
    expect(rowStyle.paddingRight).toBe(14)
    expect(rowStyle.minHeight).toBe(48)
    expect(inputStyle.lineHeight).toBe(17)
    expect(inputStyle.width).toBe('100%')
    expect(inputStyle.overflow).toBe('hidden')
    expect(screen.getByTestId('customer-v21-booking-address').props.multiline).toBe(false)
    expect(screen.getByTestId('customer-v21-booking-address').props.scrollEnabled).toBe(false)
    expect(screen.queryByTestId('customer-v21-booking-address-chevron')).toBeNull()

    fireEvent.changeText(
      screen.getByTestId('customer-v21-booking-address'),
      'Tòa S1.07 Chung Cư Vinhomes Grand Park, Phường Long Thạnh Mỹ, Thành Phố Thủ Đức',
    )

    const longRowStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-address-row').props.style)
    const longInputStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-address').props.style)
    expect(longRowStyle.minHeight).toBe(72)
    expect(longInputStyle.minHeight).toBe(54)
    expect(longInputStyle.paddingTop).toBe(8)
    expect(longInputStyle.paddingBottom).toBe(8)
    expect(screen.getByTestId('customer-v21-booking-address').props.multiline).toBe(true)
  })

  it('uses the real places autocomplete service for booking address suggestions', async () => {
    mockPlacesAutocomplete.mockResolvedValueOnce({
      data: {
        fallback_used: false,
        suggestions: [
          {
            label: 'Tòa A, Vinhomes Grand Park, TP. Thủ Đức',
            main_text: 'Tòa A, Vinhomes Grand Park',
            place_id: 'google_places_toa_a',
            secondary_text: 'TP. Thủ Đức, TP.HCM',
          },
        ],
      },
      success: true,
    })

    render(<CustomerBookingEntrySurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A')

    await waitFor(() => {
      expect(mockPlacesAutocomplete).toHaveBeenCalledWith({ input: 'Toa A' })
    })
    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-booking-address-suggestion-0')).toHaveTextContent(/Tòa A, Vinhomes Grand Park/)
    })

    fireEvent.press(screen.getByTestId('customer-v21-booking-address-suggestion-0'))
    fireEvent.press(screen.getByTestId('customer-v21-service-plumbing'))
    selectTomorrowQuickSchedule()
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Vòi nước bếp bị rò và cần thợ kiểm tra')
    fireEvent.press(screen.getByTestId(`customer-v21-problem-${PROBLEM_CHIPS.plumbing[2]}`))
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith('customer_test_1', expect.objectContaining({
      addressLabel: 'Tòa A, Vinhomes Grand Park, TP. Thủ Đức',
      serviceType: 'plumbing',
    }))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/(customer)/kael-chat?mode=case&handoff=11111111-1111-4111-8111-111111111111',
      )
    })
  })

  it('hydrates the selected service passed from Stage 2.1', () => {
    mockRouteParams = { service: 'plumbing' }

    render(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-v21-selected-service')).toHaveTextContent(/Sửa nước/)
    expect(screen.getByTestId('customer-v21-selected-service-visual-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-selected-service-detail-0')).toHaveTextContent('Rò rỉ')
    expect(screen.getByTestId('customer-v21-selected-service-detail-1')).toHaveTextContent('Đường ống')
    expect(screen.queryByTestId('customer-v21-booking-suggested-chip-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-problem-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-booking-search-input')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-search-suggestions')).toBeNull()
    expect(screen.queryByTestId('customer-v21-service-electrical')).toBeNull()
  })

  it('lets the customer choose a date and time without auto-selecting a slot', () => {
    render(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/Chưa chọn/)

    fireEvent.press(screen.getByTestId('customer-v21-booking-date-1'))
    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/Chưa chọn giờ/)

    fireEvent.press(screen.getByTestId('customer-v21-booking-time-1'))
    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/Bắt đầu lúc 10:00/)
  })

  it('accepts a desired date beyond the seven quick date options', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 6, 13, 9, 0, 0))

    try {
      render(<CustomerBookingEntrySurface />)

      expect(screen.queryByTestId('customer-v21-booking-date-7')).toBeNull()
      fireEvent.changeText(screen.getByTestId('customer-v21-booking-custom-date'), '23/07/2026')
      fireEvent.press(screen.getByTestId('customer-v21-booking-time-1'))

      expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/23\/07\/2026/)
    } finally {
      jest.useRealTimers()
    }
  })

  it('uses a desired start time and preserves a custom start in the Kael draft', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 6, 13, 9, 0, 0))
    mockRouteParams = { service: 'handyman_minor_installation' }

    try {
      render(<CustomerBookingEntrySurface />)

      expect(screen.queryByText('Giờ bắt đầu mong muốn')).toBeNull()
      expect(screen.getByText('Chọn giờ bạn muốn dịch vụ bắt đầu.')).toHaveStyle({ fontWeight: '700' })
      expect(screen.getByTestId('customer-v21-booking-time-1')).toHaveTextContent(/^10:00$/)
      expect(screen.queryByText('10:00-12:00')).toBeNull()

      fireEvent.changeText(screen.getByTestId('customer-v21-booking-custom-date'), '23072026')
      fireEvent.changeText(screen.getByTestId('customer-v21-booking-custom-time'), '1030')
      expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/23\/07\/2026.*Bắt đầu lúc 10:30/)

      fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
      fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Can lap ke nho trong phong khach')
      fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

      await waitFor(() => {
        expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith('customer_test_1', expect.objectContaining({
          scheduleMode: 'scheduled',
          scheduleWindow: {
            date: '2026-07-23',
            end: '12:30',
            start: '10:30',
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          scheduledAt: '2026-07-23T03:30:00.000Z',
        }))
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it('rejects invalid custom dates and start times before creating a Kael draft', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 6, 13, 9, 0, 0))
    mockRouteParams = { service: 'handyman_minor_installation' }

    try {
      render(<CustomerBookingEntrySurface />)

      const customDate = screen.getByTestId('customer-v21-booking-custom-date')
      const customTime = screen.getByTestId('customer-v21-booking-custom-time')
      expect(customDate).toHaveProp('accessibilityLabel', 'Nhập ngày muốn đặt')
      expect(customDate).toHaveProp('keyboardType', 'number-pad')
      expect(customDate).toHaveProp('maxLength', 10)
      expect(customTime).toHaveProp('accessibilityLabel', 'Nhập giờ bắt đầu mong muốn')
      expect(customTime).toHaveProp('keyboardType', 'number-pad')
      expect(customTime).toHaveProp('maxLength', 5)

      fireEvent.changeText(customDate, '31022026')
      fireEvent.changeText(customTime, '2460')

      expect(screen.getByTestId('customer-v21-booking-custom-date-error')).toHaveTextContent(/ngày hợp lệ/i)
      expect(screen.getByTestId('customer-v21-booking-custom-time-error')).toHaveTextContent(/HH:mm/)

      fireEvent.changeText(customDate, '12072026')
      expect(screen.getByTestId('customer-v21-booking-custom-date-error')).toHaveTextContent(/ngày hợp lệ/i)

      fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
      fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Can lap ke nho trong phong khach')
      fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

      expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('refreshes booking dates from runtime while the screen stays open', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-19T16:59:50.000Z'))

    try {
      render(<CustomerBookingEntrySurface />)

      expect(screen.getByTestId('customer-v21-booking-date-0')).toHaveTextContent(/Hôm nay/)
      expect(screen.getByTestId('customer-v21-booking-date-0')).toHaveTextContent(/19\/06/)

      jest.setSystemTime(new Date('2026-06-19T17:00:25.000Z'))
      act(() => {
        jest.advanceTimersByTime(30_000)
      })

      expect(screen.getByTestId('customer-v21-booking-date-0')).toHaveTextContent(/Hôm nay/)
      expect(screen.getByTestId('customer-v21-booking-date-0')).toHaveTextContent(/20\/06/)
    } finally {
      jest.useRealTimers()
    }
  })

  it('blocks the legacy media intake route because evidence now lives in Kael Chat cards', async () => {
    mockRouteParams = { screen: '2.3-media' }

    render(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-v21-services')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-screen-2.3-media')).toBeNull()
    expect(screen.queryByTestId('customer-v21-media-intake')).toBeNull()
    expect(screen.queryByTestId('customer-v21-media-voice-note')).toBeNull()
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    })
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
  })

  it('does not allow legacy Stage 2.3 voice recording outside the Kael Chat evidence gate', async () => {
    mockRouteParams = { screen: '2.3-media' }

    render(<CustomerBookingEntrySurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    })
    expect(screen.queryByTestId('customer-v21-media-voice-note')).toBeNull()
    expect(mockRequestRecordingPermissionsAsync).not.toHaveBeenCalled()
    expect(mockSetAudioModeAsync).not.toHaveBeenCalled()
    expect(mockAudioRecorder.prepareToRecordAsync).not.toHaveBeenCalled()
    expect(mockAudioRecorder.record).not.toHaveBeenCalled()
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()
  })

  it('does not show a separate continue-to-media CTA on the service step', () => {
    render(<CustomerBookingEntrySurface />)

    selectTomorrowQuickSchedule(1)
    fireEvent.press(screen.getByTestId('customer-v21-service-plumbing'))
    expect(screen.getByTestId('customer-v21-selected-service-visual-panel')).toBeOnTheScreen()

    expect(screen.queryByTestId('customer-v21-booking-open-media')).toBeNull()
    expect(screen.queryByText('Tiếp tục mô tả')).toBeNull()
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
  })

  it('opens full-screen Kael chat as soon as the pending draft is staged in memory', async () => {
    let resolvePersist!: () => void
    mockSetPendingKaelChatDraft.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolvePersist = resolve
    }))
    render(<CustomerBookingEntrySurface />)

    const typedDescription = 'Ổ cắm phòng khách bị nóng và có mùi khét'
    fireEvent.press(screen.getByTestId('customer-v21-service-electrical'))
    selectTomorrowQuickSchedule(2)
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Tòa A, Quận 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), typedDescription)
    fireEvent.press(screen.getByTestId(`customer-v21-problem-${PROBLEM_CHIPS.electrical[2]}`))
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith('customer_test_1', expect.objectContaining({
      addressLabel: 'Tòa A, Quận 7',
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      description: typedDescription,
      locale: 'vi',
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'booking',
    }))
    expect(mockSetPendingKaelChatDraft.mock.calls[0][1]).not.toHaveProperty('mediaCount')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][1]).not.toHaveProperty('photoDrafts')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][1].message).toContain('Dịch vụ: Sửa điện')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][1].message).toContain('Khu vực: Tòa A, Quận 7')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][1].message).toContain('Thời gian:')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][1].message).toContain('Bắt đầu lúc 14:00')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][1].message).toContain(`Mô tả: ${typedDescription}`)
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith(
      '/(customer)/kael-chat?mode=case&handoff=11111111-1111-4111-8111-111111111111',
    )
    expect(screen.queryByTestId('customer-v21-selected-service')).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-address')).toHaveProp('value', '')
    expect(screen.getByTestId('customer-v21-booking-description')).toHaveProp('value', '')
    await act(async () => {
      resolvePersist()
      await Promise.resolve()
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
  })
})

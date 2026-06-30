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
  setPendingKaelChatDraft: (draft: unknown) => mockSetPendingKaelChatDraft(draft),
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
  mockPlacesAutocomplete.mockResolvedValue({
    data: {
      fallback_used: false,
      suggestions: [],
    },
    success: true,
  })
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

  it('renders supported service intake without AC or fake priority options', () => {
    render(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-v21-service-electrical')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-plumbing')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-cleaning')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-step-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-progress-node-1')).toHaveTextContent('1')
    expect(screen.getByTestId('customer-v21-booking-progress-node-4')).toHaveTextContent('4')
    expect(screen.getByTestId('customer-v21-booking-progress-line-1')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-progress-line-3')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-search-source')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-search-mint-border')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-search-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-search-suggestions')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-search-suggestion-0')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-info-card-skin')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-booking-kael-context')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-kael-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-submit-mint-aura')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ dẫn bạn theo từng bước')).toBeOnTheScreen()
    expect(screen.queryByText(/Công việc mới/)).toBeNull()
    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/Chưa chọn/)
    expect(screen.queryByText('Sớm nhất có thể')).toBeNull()
    expect(screen.queryByTestId('customer-v21-screen-2.3-media')).toBeNull()
    expect(screen.queryByText(/máy lạnh|AC|ưu tiên|tiêu chuẩn|linh hoạt/i)).toBeNull()
  })

  it('uses mint text for booking guidance instead of red error copy', () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    const errorStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-error').props.style)
    expect(errorStyle.color).toBe('#24B3A1')
  })

  it('filters booking suggestions from a typed service topic', () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-booking-search-input'), 'Nước')

    const inputStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-search-input').props.style)
    expect(inputStyle.color).toBe('#071A24')
    expect(screen.getByTestId('customer-v21-booking-search-suggestion-0')).toHaveTextContent(/Sửa nước/)
    expect(screen.getByTestId('customer-v21-booking-search-suggestion-1')).toHaveTextContent(PROBLEM_CHIPS.plumbing[0])
    expect(screen.getByTestId('customer-v21-booking-search-suggestion-3')).toHaveTextContent(PROBLEM_CHIPS.plumbing[2])

    fireEvent.press(screen.getByTestId('customer-v21-booking-search-suggestion-3'))

    expect(screen.getByTestId('customer-v21-selected-service')).toHaveTextContent(/Sửa nước/)
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Voi nuoc trong bep bi ro va can tho kiem tra')
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      problemChips: [PROBLEM_CHIPS.plumbing[2]],
      serviceType: 'plumbing',
    }))
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
    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-time-0'))
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Vòi nước bếp bị rò và cần thợ kiểm tra')
    fireEvent.press(screen.getByTestId(`customer-v21-problem-${PROBLEM_CHIPS.plumbing[2]}`))
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      addressLabel: 'Tòa A, Vinhomes Grand Park, TP. Thủ Đức',
      serviceType: 'plumbing',
    }))
  })

  it('hydrates the selected service passed from Stage 2.1', () => {
    mockRouteParams = { service: 'plumbing' }

    render(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-v21-selected-service')).toHaveTextContent(/Sửa nước/)
    expect(screen.getByTestId('customer-v21-selected-service')).toHaveTextContent(/Rò rỉ · đường ống/)
    expect(screen.getByTestId('customer-v21-booking-suggested-chip-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-problem-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-search-suggestions')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-booking-search-suggestion-0')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-service-electrical')).toBeNull()
  })

  it('uses search suggestions as real booking problem shortcuts', async () => {
    mockRouteParams = { service: 'plumbing' }

    render(<CustomerBookingEntrySurface />)

    fireEvent.press(screen.getByTestId('customer-v21-booking-search-suggestion-0'))
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Ong nuoc duoi lavabo bi ro ri rat nhieu')
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      problemChips: [PROBLEM_CHIPS.plumbing[0]],
      serviceType: 'plumbing',
    }))
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    })
  })

  it('lets the customer choose a date and time without auto-selecting a slot', () => {
    render(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/Chưa chọn/)

    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/Chưa chọn giờ/)

    fireEvent.press(screen.getByTestId('customer-v21-booking-time-1'))
    expect(screen.getByTestId('customer-v21-booking-schedule-summary')).toHaveTextContent(/10:00-12:00/)
  })

  it('refreshes booking dates from runtime while the screen stays open', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 5, 19, 23, 59, 50))

    try {
      render(<CustomerBookingEntrySurface />)

      expect(screen.getByTestId('customer-v21-booking-date-0')).toHaveTextContent(/Hôm nay/)
      expect(screen.getByTestId('customer-v21-booking-date-0')).toHaveTextContent(/19\/06/)

      jest.setSystemTime(new Date(2026, 5, 20, 0, 0, 25))
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
    return
    expect(screen.getByTestId('customer-v21-screen-2.3-media')).toBeOnTheScreen()
    expect(screen.getByText('Kael thu thập hiện trạng')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-media-case-row')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-media-private-chip')).toBeNull()
    expect(screen.getByTestId('customer-v21-media-hero-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-media-intake')).toHaveTextContent(/0/)
    expect(screen.getByTestId('customer-v21-media-slot-files')).toHaveTextContent(/0/)
    expect(screen.getByTestId('customer-v21-media-slot-voice')).toHaveTextContent(/0/)
    expect(screen.getByTestId('customer-v21-media-voice-note')).toHaveTextContent(/0/)
    expect(screen.getByTestId('customer-v21-media-description-empty-chip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-media-prep-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-media-prep')).toHaveTextContent(/0/)
    expect(screen.getByTestId('customer-v21-media-analyze-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-media-analyze')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-services-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-search-source')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-search-suggestions')).toBeNull()
    expect(screen.queryByTestId('customer-v21-selected-service')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-info-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-kael-context')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-submit')).toBeNull()
    expect(screen.queryByText(/2 t.p|00:12|mÃ¡y láº¡nh|AC|paid_held|520\.000/i)).toBeNull()
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
    return

    fireEvent.press(screen.getByTestId('customer-v21-media-voice-note'))

    await waitFor(() => {
      expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalled()
      expect(mockSetAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
        allowsRecording: true,
        playsInSilentMode: true,
      }))
      expect(mockAudioRecorder.prepareToRecordAsync).toHaveBeenCalled()
      expect(mockAudioRecorder.record).toHaveBeenCalled()
      expect(screen.getByTestId('customer-v21-media-voice-note')).toHaveTextContent(/Đang ghi/)
    })

    fireEvent.press(screen.getByTestId('customer-v21-media-voice-note'))

    await waitFor(() => {
      expect(mockAudioRecorder.stop).toHaveBeenCalled()
      expect(screen.getByTestId('customer-v21-media-slot-voice')).toHaveTextContent(/1/)
      expect(screen.getByTestId('customer-v21-media-slot-extra')).toHaveTextContent(/1/)
      expect(screen.getByTestId('customer-v21-media-prep')).toHaveTextContent(/1/)
    })
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()
  })

  it('does not show a separate continue-to-media CTA on the service step', () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-time-1'))
    fireEvent.press(screen.getByTestId('customer-v21-service-plumbing'))
    expect(screen.getByTestId('customer-v21-booking-selected-card-skin')).toBeOnTheScreen()

    expect(screen.queryByTestId('customer-v21-booking-open-media')).toBeNull()
    expect(screen.queryByText('Tiếp tục mô tả')).toBeNull()
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
  })

  it('creates a pending Kael draft only, then opens full-screen Kael chat after the draft is persisted', async () => {
    let resolvePersist!: () => void
    mockSetPendingKaelChatDraft.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolvePersist = resolve
    }))
    render(<CustomerBookingEntrySurface />)

    const typedDescription = 'Ổ cắm phòng khách bị nóng và có mùi khét'
    fireEvent.press(screen.getByTestId('customer-v21-service-electrical'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-time-2'))
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Tòa A, Quận 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), typedDescription)
    fireEvent.press(screen.getByTestId(`customer-v21-problem-${PROBLEM_CHIPS.electrical[2]}`))
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      addressLabel: 'Tòa A, Quận 7',
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      description: typedDescription,
      locale: 'vi',
      mediaCount: 0,
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'booking',
    }))
    expect(mockSetPendingKaelChatDraft.mock.calls[0][0].message).toContain('Dịch vụ: Sửa điện')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][0].message).toContain('Khu vực: Tòa A, Quận 7')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][0].message).toContain('Thời gian:')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][0].message).toContain('14:00-16:00')
    expect(mockSetPendingKaelChatDraft.mock.calls[0][0].message).toContain(`Mô tả: ${typedDescription}`)
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    await act(async () => {
      resolvePersist()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    })
  })
})

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
const mockRequestMediaLibraryPermissionsAsync = jest.fn()
const mockLaunchImageLibraryAsync = jest.fn()
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

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
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
  mockRequestMediaLibraryPermissionsAsync.mockReset()
  mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
  mockLaunchImageLibraryAsync.mockReset()
  mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true })
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

    expect(screen.getByTestId('customer-v21-service-electrical')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-plumbing')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-home_cleaning')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-hvac_basic_maintenance')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-upholstery_care')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-service-handyman_minor_installation')).toBeOnTheScreen()
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
    expect(screen.queryByText(/rating|4\.9|Nguyễn Văn Minh/i)).toBeNull()
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
      expect(screen.getByTestId('customer-v21-booking-add-media')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-performance-intake')).toBeNull()
      expect(screen.queryByTestId('customer-v21-performance-scope-card')).toBeNull()
      expect(screen.queryByTestId('customer-v21-performance-question-hvac_goal')).toBeNull()

      fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
      fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Can Kael tim hieu them truoc khi bao gia')
      fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
      fireEvent.press(screen.getByTestId('customer-v21-booking-time-0'))
      fireEvent.press(screen.getByTestId(`customer-v21-problem-${firstProblemChip}`))
      fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

      await waitFor(() => {
        expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
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

  it('keeps optional photo evidence with the Basic Intake without building a local scope card', async () => {
    mockRouteParams = { service: 'handyman_minor_installation' }
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ fileName: 'wall.jpg', fileSize: 2048, mimeType: 'image/jpeg', uri: 'file://wall.jpg' }],
    })
    render(<CustomerBookingEntrySurface />)

    fireEvent.press(screen.getByTestId('customer-v21-booking-add-media'))

    await waitFor(() => {
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        selectionLimit: 5,
      }))
      expect(screen.getByTestId('customer-v21-booking-media-count')).toHaveTextContent('1/5')
    })
    expect(screen.queryByTestId('customer-v21-performance-scope-card')).toBeNull()

    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Can lap ke nho trong phong khach')
    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-time-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    await waitFor(() => {
      expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
        mediaCount: 1,
        photoDrafts: [expect.objectContaining({ fileName: 'wall.jpg', type: 'image', uri: 'file://wall.jpg' })],
        profileId: 'task_scope',
        serviceType: 'handyman',
      }))
    })
  })

  it('requires a complete desired time before handing Basic Intake to Kael Case Work', async () => {
    mockRouteParams = { service: 'handyman_minor_installation' }
    render(<CustomerBookingEntrySurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Can lap ke nho trong phong khach')
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(screen.getByTestId('customer-v21-booking-error')).toHaveTextContent(/thời gian mong muốn/i)
    expect(mockSetPendingKaelChatDraft).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-time-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    await waitFor(() => expect(mockSetPendingKaelChatDraft).toHaveBeenCalledTimes(1))
  })

  it('finds expansion services through the existing booking search', () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-booking-search-input'), 'điều hòa')

    expect(screen.getByTestId('customer-v21-booking-search-suggestion-0')).toHaveTextContent('Điều hòa & Không khí')
  })

  it('uses mint text for booking guidance instead of red error copy', () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    const errorStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-error').props.style)
    expect(errorStyle.color).toBe('#08AF9C')
  })

  it('filters booking suggestions from a typed service topic', async () => {
    render(<CustomerBookingEntrySurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-booking-search-input'), 'Nước')

    const inputStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-booking-search-input').props.style)
    expect(inputStyle.color).toBe('#071A24')
    expect(screen.getByTestId('customer-v21-booking-search-suggestion-0')).toHaveTextContent(/Sửa nước/)
    expect(screen.getByText(PROBLEM_CHIPS.plumbing[0])).toBeOnTheScreen()
    expect(screen.getByText(PROBLEM_CHIPS.plumbing[2])).toBeOnTheScreen()

    fireEvent.press(screen.getByLabelText(PROBLEM_CHIPS.plumbing[2]))

    expect(screen.getByTestId('customer-v21-selected-service')).toHaveTextContent(/Sửa nước/)
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-address'), 'Toa A, Quan 7')
    fireEvent.changeText(screen.getByTestId('customer-v21-booking-description'), 'Voi nuoc trong bep bi ro va can tho kiem tra')
    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-time-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-submit'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      problemChips: [PROBLEM_CHIPS.plumbing[2]],
      serviceType: 'plumbing',
    }))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    })
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
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    })
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
    fireEvent.press(screen.getByTestId('customer-v21-booking-date-0'))
    fireEvent.press(screen.getByTestId('customer-v21-booking-time-0'))
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
      expect(screen.queryByTestId('customer-v21-selected-service')).toBeNull()
      expect(screen.getByTestId('customer-v21-booking-address')).toHaveProp('value', '')
      expect(screen.getByTestId('customer-v21-booking-description')).toHaveProp('value', '')
    })
  })
})

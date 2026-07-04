import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { PROBLEM_CHIPS, type LocalWorkflowSelectors } from '@nestscout/shared'
import { SafeAreaProvider } from 'react-native-safe-area-context'

let mockWorkflowValue: any
let mockAuthValue: any
let mockRouteParams: Record<string, string | string[] | undefined>
const mockPush = jest.fn()
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
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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

import { CustomerBookingEntrySurface as ActiveCustomerBookingEntrySurface, CustomerKaelSurface as ActiveCustomerKaelSurface } from '../customer-surfaces'
import { CustomerBookingEntrySurface } from '../v21/surfaces'

const TEST_SAFE_AREA_METRICS = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
}

function renderWithSafeArea(ui: Parameters<typeof render>[0]) {
  return render(
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
      {ui}
    </SafeAreaProvider>,
  )
}

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
  mockPush.mockClear()
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

describe('Customer booking runtime surface wiring', () => {
  it('exports the current V4 booking entry surface instead of the legacy v21 flow', () => {
    renderWithSafeArea(<ActiveCustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-booking-entry-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-booking-ios26-foundation-section')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-booking-intake-to-kael-primary')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-services')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-step-card-skin')).toBeNull()
  })

  it('keeps the legacy v21 booking import path pinned to the current V4 surface', () => {
    renderWithSafeArea(<CustomerBookingEntrySurface />)

    expect(screen.getByTestId('customer-booking-entry-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-booking-intake-to-kael-primary')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-services')).toBeNull()
    expect(screen.queryByTestId('customer-v21-booking-step-card-skin')).toBeNull()
  })

  it('exports the current Kael route shim that redirects to the full-screen chat', () => {
    render(<ActiveCustomerKaelSurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat')
  })
})

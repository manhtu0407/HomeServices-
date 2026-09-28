import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { Alert, Platform, StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { LocalDeal, LocalWorkerGate } from '@nestscout/shared'
import type { EarningsResponse, NotificationListResponse, WorkerBroadcastProposalAction, WorkerPayoutMethod, WorkerPerformanceInsightsResponse, WorkerProfileResponse, WorkerWithdrawalRequest } from '@/lib/api-types'
import { color, glass } from '@/design/theme'

let mockWorkflowValue: any
let mockAuthRole: 'admin' | 'customer' | 'worker'
let mockAuthSessionProvider: string | null
let mockAuthSessionUserId: string
let mockSignOut: jest.Mock
let mockWorkerUpdateAvailability: jest.Mock
let mockWorkerConfirmCashPayment: jest.Mock
let mockWorkerSavePayoutMethod: jest.Mock
let mockWorkerRequestWithdrawal: jest.Mock
let mockWorkerRefresh: jest.Mock
let mockWorkerUploadAvatar: jest.Mock
let mockWorkerUpdateServiceArea: jest.Mock
let mockWorkerUpdateServicePreferences: jest.Mock
let mockRefreshNotifications: jest.Mock
let mockMarkNotificationRead: jest.Mock
let mockPathname: string
let mockRouteParams: Record<string, string | string[] | undefined>
let mockAppLanguage = 'vi'
let mockFocusCallback: (() => void | (() => void)) | null
const mockWorkerKaelChatModes = new Map<string, 'normal' | 'intake'>()
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()
const mockPlacesAutocomplete = jest.fn()
const mockGetMyWorkerMemory = jest.fn()
const mockUpdateMyWorkerPreference = jest.fn()
const mockUpdateCustomerProfile = jest.fn()
const mockUpdatePassword = jest.fn()
const mockWorkerKaelChatService = {
  archive: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  getTrainingConsent: jest.fn(),
  list: jest.fn(),
  rename: jest.fn(),
  setPinned: jest.fn(),
  sendTurn: jest.fn(),
  setTrainingConsent: jest.fn(),
  streamTurn: jest.fn(),
  submitFeedback: jest.fn(),
}

const pendingWorkerKaelServiceCall = () => new Promise<never>(() => undefined)

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}))

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(() => new Promise(() => undefined)),
  watchPositionAsync: jest.fn(),
}), { virtual: true })

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react')
    React.useEffect(() => {
      mockFocusCallback = callback
      const cleanup = callback()
      return () => {
        if (mockFocusCallback === callback) mockFocusCallback = null
        if (typeof cleanup === 'function') cleanup()
      }
    }, [callback])
  },
  useLocalSearchParams: () => mockRouteParams,
  usePathname: () => mockPathname,
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

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    role: mockAuthRole,
    session: {
      user: {
        app_metadata: mockAuthSessionProvider ? { provider: mockAuthSessionProvider } : {},
        id: mockAuthSessionUserId,
      },
    },
    signOut: mockSignOut,
    updateCustomerProfile: mockUpdateCustomerProfile,
    updatePassword: mockUpdatePassword,
  }),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (jobId: string | null, enabled: boolean) => mockUseJobChatThread(jobId, enabled),
}))

jest.mock('@/lib/services', () => ({
  kaelMemoryService: {
    getMyWorkerMemory: (...args: unknown[]) => mockGetMyWorkerMemory(...args),
    updateMyWorkerPreference: (...args: unknown[]) => mockUpdateMyWorkerPreference(...args),
  },
  placesService: {
    autocomplete: (...args: unknown[]) => mockPlacesAutocomplete(...args),
  },
  workerRouteService: {
    getMapImage: jest.fn(),
    getPreview: jest.fn(),
  },
  workerKaelChatService: {
    archive: (...args: unknown[]) => mockWorkerKaelChatService.archive(...args),
    create: (...args: unknown[]) => mockWorkerKaelChatService.create(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatService.get(...args),
    getTrainingConsent: (...args: unknown[]) => mockWorkerKaelChatService.getTrainingConsent(...args),
    list: (...args: unknown[]) => mockWorkerKaelChatService.list(...args),
    rename: (...args: unknown[]) => mockWorkerKaelChatService.rename(...args),
    setPinned: (...args: unknown[]) => mockWorkerKaelChatService.setPinned(...args),
    sendTurn: (...args: unknown[]) => mockWorkerKaelChatService.sendTurn(...args),
    setTrainingConsent: (...args: unknown[]) => mockWorkerKaelChatService.setTrainingConsent(...args),
    streamTurn: (...args: unknown[]) => mockWorkerKaelChatService.streamTurn(...args),
    submitFeedback: (...args: unknown[]) => mockWorkerKaelChatService.submitFeedback(...args),
  },
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => mockAppLanguage,
  }
})

import {
  WorkerChatSurface,
  WorkerEarningsSurface,
  WorkerHomeSurface,
  WorkerJobsSurface,
  WorkerProfileSurface,
} from '../worker-surfaces'
import { resolveWorkerV5DockActive } from '../dock/routing'
import { WorkerRebuildDockOverlay } from '../dock/worker-v5-dock-overlay'
import { WorkerJobsLegacyPrototypeOfferDetailBody } from '../jobs/worker-jobs-zip-prototype-early-stages'
import {
  WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY,
  WorkerV5FormulaMintCardAura,
} from '../ui/aura-surfaces'
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'

function buildWorkerProfile(overrides: Partial<WorkerProfileResponse> = {}): WorkerProfileResponse {
  return {
    active_service_types: ['electrical'],
    active_minutes: 0,
    avatar_url: null,
    bank_account_masked: null,
    bank_name: null,
    date_of_birth: null,
    districts: ['quan_1'],
    gender: null,
    has_cccd: true,
    has_selfie: true,
    home_lat: null,
    home_lng: null,
    id: 'worker_test_1',
    is_approved: true,
    is_available: false,
    is_suspended: false,
    last_active_at: null,
    legal_name: 'Worker Test',
    problem_specializations: [],
    rating: 0,
    selected_service_types: ['electrical'],
    service_quality: [],
    service_radius_km: 8,
    service_types: ['electrical'],
    total_jobs: 0,
    verification_status: 'approved',
    years_experience: 3,
    ...overrides,
  }
}

function buildWorkerPerformanceInsights(
  overrides: Partial<WorkerPerformanceInsightsResponse> = {},
): WorkerPerformanceInsightsResponse {
  return {
    accepted_broadcast_count: 0,
    average_rating: null,
    average_response_minutes: null,
    badges: [],
    completed_job_count: 0,
    incident_rank_bonus: 0,
    on_time_job_count: 0,
    on_time_rate_percent: null,
    paid_job_count: 0,
    performance_axes: [],
    performance_score: null,
    reconciled_earnings_vnd: null,
    resolved_incident_case_count: 0,
    responded_broadcast_count: 0,
    response_rate_percent: null,
    review_count: 0,
    scheduled_arrival_job_count: 0,
    total_broadcast_count: 0,
    work_response_review_count: 0,
    worker_id: 'worker_test_1',
    ...overrides,
  }
}

function buildNoEarnings(): EarningsResponse {
  return {
    available_balance: 0,
    cash_commission_collected_total: 0,
    cash_commission_due_total: 0,
    current_commission_level: 1,
    current_commission_rate_bps: 1500,
    daily_earnings: [],
    from_date: null,
    gross_earnings: 0,
    net_earnings: 0,
    pending_payment_amount: 0,
    pending_payment_count: 0,
    on_hold_amount: 0,
    platform_fee_total: 0,
    recent_transactions: [],
    to_date: null,
    total_jobs_paid: 0,
    withdrawal_reserved_amount: 0,
    withdrawn_total: 0,
    collateral_reserved_amount: 0,
    worker_id: 'worker_test_1',
  }
}

function settledEarningsDateKey(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function buildSettledEarnings(): EarningsResponse {
  return {
    available_balance: 1200000,
    cash_commission_collected_total: 0,
    cash_commission_due_total: 0,
    current_commission_level: 2,
    current_commission_rate_bps: 1200,
    daily_earnings: [
      { date: settledEarningsDateKey(0), gross_earnings: 400000, net_earnings: 320000, paid_job_count: 2, platform_fee_total: 80000 },
      { date: settledEarningsDateKey(1), gross_earnings: 220000, net_earnings: 180000, paid_job_count: 1, platform_fee_total: 40000 },
    ],
    from_date: settledEarningsDateKey(6),
    gross_earnings: 1500000,
    net_earnings: 1200000,
    pending_payment_amount: 0,
    pending_payment_count: 0,
    on_hold_amount: 0,
    platform_fee_total: 300000,
    recent_transactions: [
      {
        available_at: '2026-07-15T09:00:00.000Z',
        cash_commission_collected: 0,
        cash_commission_due: 0,
        commission_level: 2,
        commission_rate_bps: 1200,
        display_code: 'NS-WORK-001',
        gross_amount: 400000,
        job_id: 'job-credit-1',
        entry_type: 'worker_credit',
        payment_state: 'available',
        platform_fee: 48000,
        recorded_at: '2026-07-15T09:00:00.000Z',
        worker_net: 352000,
      },
    ],
    to_date: settledEarningsDateKey(0),
    total_jobs_paid: 5,
    withdrawal_reserved_amount: 0,
    withdrawn_total: 0,
    collateral_reserved_amount: 0,
    worker_id: 'worker_test_1',
  }
}

function buildIncomingDeal(): LocalDeal {
  return {
    broadcast: {
      broadcastId: 'broadcast_test_1',
      estimatedEarningLabel: '120.000d - 180.000d',
      estimatedPriceLabel: '150.000d - 240.000d',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Qu?n 1',
      jobId: 'job_test_1',
      priceQuote: {
        schemaVersion: 'original_scope_price_quote.v1',
        quoteId: 'a1510000-0000-4000-8000-000000000010',
        referencePriceMin: 150000,
        referencePriceMax: 240000,
        customerTotal: 195000,
        platformFee: 29250,
        workerNet: 165750,
        commissionLevel: 1,
        commissionRateBps: 1500,
        priceSource: 'baseline_with_market',
        selectionRule: 'verified_neutral_midpoint_with_bilateral_confirmation',
        workerConfirmationRequired: true,
        customerConfirmationRequired: true,
        workerConfirmedAt: null,
        expiresAt: '2099-07-22T05:19:29.849Z',
        evidenceSummary: {
          confidence: 'high',
          baselineSourceCount: 2,
          marketSourceCount: 2,
          highTrustSourceCount: 2,
          quorumMet: true,
          capStatement: 'Current confirmed scope only.',
        },
      },
      prebrief: ['Kael dã tóm t?t ph?m vi tru?c khi th? nh?n vi?c.'],
      problemSummary: '? c?m ch?p ch?n',
      secondsRemaining: 42,
      serviceType: 'electrical',
      status: 'sent',
    },
    draft: {
      addressLabel: 'Ðu?ng Nguy?n Hu?, Qu?n 1',
      description: '? c?m ch?p ch?n',
      districtLabel: 'Qu?n 1',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: ['? c?m/công t?c h?ng'],
      serviceType: 'electrical',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: 'job_test_1',
    scopeChange: null,
    status: 'broadcasting',
  }
}

function buildAcceptedDeal(): LocalDeal {
  const deal = buildIncomingDeal()
  return {
    ...deal,
    backendStatus: 'worker_matched',
    broadcast: deal.broadcast ? { ...deal.broadcast, status: 'accepted' } : null,
    status: 'worker_matched',
  }
}

function buildCandidatePendingDeal(): LocalDeal {
  const deal = buildIncomingDeal()
  return {
    ...deal,
    backendStatus: 'worker_candidate_pending',
    broadcast: deal.broadcast ? { ...deal.broadcast, status: 'accepted' } : null,
    status: 'worker_candidate_pending',
  }
}

function buildCancelledDeal(): LocalDeal {
  const deal = buildIncomingDeal()
  return {
    ...deal,
    broadcast: deal.broadcast ? { ...deal.broadcast, status: 'cancelled' } : null,
    status: 'cancelled',
  }
}

function buildAcceptedDealForJob(jobId: string): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    broadcast: deal.broadcast ? { ...deal.broadcast, broadcastId: `broadcast_${jobId}`, jobId } : null,
    id: jobId,
  }
}

function buildRepairingDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'repairing',
    status: 'repairing',
  }
}

function buildSettledCaseEarnings(): EarningsResponse {
  return {
    ...buildNoEarnings(),
    available_balance: 340000,
    current_commission_level: 1,
    current_commission_rate_bps: 1500,
    gross_earnings: 400000,
    net_earnings: 340000,
    platform_fee_total: 60000,
    recent_transactions: [
      {
        available_at: '2026-07-15T09:00:00.000Z',
        cash_commission_collected: 0,
        cash_commission_due: 0,
        commission_level: 1,
        commission_rate_bps: 1500,
        display_code: 'NS-WORK-SETTLED',
        gross_amount: 400000,
        job_id: 'job_test_1',
        entry_type: 'worker_credit',
        payment_state: 'available',
        platform_fee: 60000,
        recorded_at: '2026-07-15T09:00:00.000Z',
        worker_net: 340000,
      },
    ],
    total_jobs_paid: 1,
  }
}

function buildArrivedDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'arrived',
    status: 'arrived',
  }
}

function buildConfirmedCompletionDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'confirmed_by_customer',
    completionNotes: 'Ðã thay ? c?m và ki?m tra t?i.',
    completionPhotoUrls: ['job-media/after-1.jpg'],
    status: 'confirmed_by_customer',
  }
}

function buildDirectWorkerConfirmationDeal(): LocalDeal {
  const deal = buildConfirmedCompletionDeal()
  return {
    ...deal,
    backendStatus: 'payment_pending',
    payment: {
      collateralAmount: 60_000,
      directCustomerConfirmedAt: '2026-08-11T09:00:00.000Z',
      directResponseDeadline: '2026-08-12T09:00:00.000Z',
      directWorkerConfirmedAt: null,
      grossAmount: 400_000,
      platformFee: 60_000,
      provider: 'direct_worker',
      status: 'direct_awaiting_worker_confirmation',
      workerNet: 340_000,
    },
    status: 'payment_pending',
  }
}

function buildSettledCaseDeal(): LocalDeal {
  const deal = buildConfirmedCompletionDeal()
  return {
    ...deal,
    backendStatus: 'paid',
    payment: {
      grossAmount: 400_000,
      platformFee: 60_000,
      provider: 'sepay_vietqr',
      status: 'received',
      workerNet: 340_000,
    },
    status: 'paid',
  }
}

function buildCompletedByWorkerDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'completed_by_worker',
    completionNotes: 'Ðã thay ? c?m và ki?m tra t?i.',
    completionPhotoUrls: ['job-media/after-1.jpg'],
    status: 'completed_by_worker',
  }
}

function buildWorkflow({
  canWorkerAdvance = false,
  deal = null,
  workerEarnings = buildNoEarnings(),
  workerEarningsError = null,
  workerJobs = [],
  workerJobsHydrated = true,
  workerGate = 'remote_backend',
  workerPerformanceInsights = null,
  workerProfile = buildWorkerProfile(),
  workerProposalAction = deal?.status === 'broadcasting' && deal.broadcast?.status === 'sent'
    ? 'accept_priced_offer'
    : null,
  workerPayoutMethod = null,
  workerWithdrawalRequests = [],
  notifications = [],
  notificationUnreadCount = 0,
}: {
  canWorkerAdvance?: boolean
  deal?: LocalDeal | null
  workerEarnings?: EarningsResponse | null
  workerEarningsError?: string | null
  workerJobs?: { status: string }[]
  workerJobsHydrated?: boolean
  workerGate?: LocalWorkerGate
  workerPerformanceInsights?: WorkerPerformanceInsightsResponse | null
  workerProfile?: WorkerProfileResponse | null
  workerProposalAction?: WorkerBroadcastProposalAction | null
  workerPayoutMethod?: WorkerPayoutMethod | null
  workerWithdrawalRequests?: WorkerWithdrawalRequest[]
  notifications?: NotificationListResponse['notifications']
  notificationUnreadCount?: number
} = {}) {
  mockWorkerUpdateAvailability = jest.fn(async () => true)
  mockWorkerConfirmCashPayment = jest.fn(async () => true)
  mockWorkerSavePayoutMethod = jest.fn(async () => ({
    code: 'PAYOUT_NOT_ENABLED',
    error: 'Tài khoản nhận tiền chưa được bật',
    success: false,
  }))
  mockWorkerRequestWithdrawal = jest.fn(async () => true)
  mockWorkerRefresh = jest.fn(async () => true)
  mockWorkerUploadAvatar = jest.fn(async () => true)
  mockWorkerUpdateServiceArea = jest.fn(async () => true)
  mockWorkerUpdateServicePreferences = jest.fn(async () => true)
  mockRefreshNotifications = jest.fn(async () => true)
  mockMarkNotificationRead = jest.fn(async () => true)
  mockWorkflowValue = {
    actions: {
      getKaelJobIncident: jest.fn(async () => null),
      openKaelJobIncident: jest.fn(async () => ({ incident: null })),
      previewScopeChangeFromKaelIncident: jest.fn(async () => false),
      proposeScopeChangeFromKaelIncident: jest.fn(async () => true),
      requestScopeChange: jest.fn(async () => true),
      requestWorkerCancellation: jest.fn(async () => true),
      workerAcceptBroadcast: jest.fn(async () => true),
      workerDeclineBroadcast: jest.fn(async () => true),
      workerMarkBroadcastSeen: jest.fn(async () => true),
      workerUpdateAvailability: mockWorkerUpdateAvailability,
      workerUploadAvatar: mockWorkerUploadAvatar,
      workerUpdateServiceArea: mockWorkerUpdateServiceArea,
      workerUpdateServicePreferences: mockWorkerUpdateServicePreferences,
      workerUpdateStatus: jest.fn(async () => true),
      workerConfirmCashPayment: mockWorkerConfirmCashPayment,
      workerSavePayoutMethod: mockWorkerSavePayoutMethod,
      workerSubmitBroadcastProposal: jest.fn(async () => true),
      workerRequestWithdrawal: mockWorkerRequestWithdrawal,
      workerRefresh: mockWorkerRefresh,
      workerSubmitRegistration: jest.fn(async () => true),
      refreshNotifications: mockRefreshNotifications,
      markNotificationRead: mockMarkNotificationRead,
    },
    selectors: {
      canWorkerAccept: Boolean(deal?.broadcast && deal.broadcast.status === 'sent'),
      canWorkerAdvance,
      canWorkerSeeFullAddress: Boolean(deal?.broadcast?.fullAddressVisible),
      currentBackendStatus: deal?.backendStatus ?? deal?.status ?? null,
      currentStatus: deal?.status ?? null,
    },
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate,
    },
    workerEarnings,
    workerEarningsError,
    workerJobs,
    workerJobsHydrated,
    workerMatchingDelivery: null,
    workerPerformanceInsights,
    workerProfile,
    workerProposalOpportunity: workerProposalAction && deal?.broadcast?.broadcastId
      ? {
          broadcastId: deal.broadcast.broadcastId,
          proposalAction: workerProposalAction,
          quoteMode: workerProposalAction === 'accept_priced_offer' ? 'kael_auto_quote' : null,
          result: null,
        }
      : null,
    workerPayoutMethod,
    workerWithdrawalRequests,
    notifications,
    notificationUnreadCount,
  }
}

beforeEach(async () => {
  // Fake only the clock, never the timer APIs: the earnings dashboard windows
  // by calendar month, so a real "yesterday" drops out of range on the 1st.
  jest.useFakeTimers({
    now: new Date('2026-08-15T03:00:00.000Z'),
    doNotFake: [
      'cancelAnimationFrame',
      'clearImmediate',
      'clearInterval',
      'clearTimeout',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'setImmediate',
      'setInterval',
      'setTimeout',
    ],
  })
  await AsyncStorage.clear()
  mockFocusCallback = null
  mockAuthRole = 'worker'
  mockAuthSessionProvider = null
  mockAuthSessionUserId = 'worker_test_1'
  mockSignOut = jest.fn(async () => undefined)
  mockUpdateCustomerProfile.mockReset()
  mockUpdateCustomerProfile.mockResolvedValue({ success: true })
  mockUpdatePassword.mockReset()
  mockUpdatePassword.mockResolvedValue({ success: true })
  mockReplace.mockClear()
  mockUseJobChatThread.mockClear()
  mockUseJobChatThread.mockReturnValue({
    error: null,
    loading: false,
    messages: [],
    refresh: jest.fn(),
    send: jest.fn(async () => true),
    sendMessage: jest.fn(async () => true),
    sending: false,
  })
  mockWorkerKaelChatService.create.mockReset()
  mockWorkerKaelChatService.archive.mockReset()
  mockWorkerKaelChatService.get.mockReset()
  mockWorkerKaelChatService.getTrainingConsent.mockReset()
  mockWorkerKaelChatService.list.mockReset()
  mockWorkerKaelChatService.rename.mockReset()
  mockWorkerKaelChatService.setPinned.mockReset()
  mockWorkerKaelChatService.sendTurn.mockReset()
  mockWorkerKaelChatService.setTrainingConsent.mockReset()
  mockWorkerKaelChatService.streamTurn.mockReset()
  mockWorkerKaelChatService.submitFeedback.mockReset()
  mockWorkerKaelChatModes.clear()
  mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.get.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.getTrainingConsent.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.create.mockImplementation(async (input: {
    job_id?: string
    mode?: 'normal' | 'intake'
  }) => {
    const mode = input.mode ?? 'intake'
    mockWorkerKaelChatModes.set('worker-kael-session-1', mode)
    return {
      data: {
        session: {
          closed_at: null,
          id: 'worker-kael-session-1',
          job_id: mode === 'intake' ? input.job_id ?? 'job_test_1' : null,
          mode,
          progress: null,
          safe_metadata: {},
          started_at: '2026-06-04T00:00:00.000Z',
          status: 'active',
          title: null,
          total_cost_usd: 0,
          total_turns: 0,
          worker_id: 'worker_test_1',
        },
        turns: [],
      },
      status: 201,
      success: true,
    }
  })
  mockWorkerKaelChatService.archive.mockResolvedValue({
    data: {
      archived_at: '2026-07-13T07:45:00.000Z',
      session_id: 'worker-kael-session-1',
    },
    status: 200,
    success: true,
  })
  mockWorkerKaelChatService.rename.mockImplementation(async (sessionId: string, input: { title: string }) => ({
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: null,
        mode: 'normal',
        pinned_at: null,
        progress: null,
        started_at: '2026-07-13T07:30:00.000Z',
        status: 'active',
        title: input.title,
        total_turns: 4,
        worker_id: 'worker_test_1',
      },
      turns: [],
    },
    status: 200,
    success: true,
  }))
  mockWorkerKaelChatService.setPinned.mockImplementation(async (sessionId: string, input: { pinned: boolean }) => ({
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: null,
        mode: 'normal',
        pinned_at: input.pinned ? '2026-07-13T08:00:00.000Z' : null,
        progress: null,
        started_at: '2026-07-13T07:30:00.000Z',
        status: 'active',
        title: 'Kiểm tra phạm vi lavabo',
        total_turns: 4,
        worker_id: 'worker_test_1',
      },
      turns: [],
    },
    status: 200,
    success: true,
  }))
  mockWorkerKaelChatService.streamTurn.mockImplementation(async (sessionId: string, input: { message: string }, handlers?: any) => {
    handlers?.onStage?.({
      progress: {
        current_stage: 'worker_assist',
        failure_reason: null,
        progress: 0.2,
        status: 'running',
        updated_at: '2026-06-04T00:00:01.000Z',
      },
      type: 'stage',
    })
    return {
      data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: mockWorkerKaelChatModes.get(sessionId) === 'intake' ? 'job_test_1' : null,
        mode: mockWorkerKaelChatModes.get(sessionId) ?? 'normal',
        progress: {
          current_stage: 'worker_assist',
          failure_reason: null,
          progress: 1,
          status: 'completed',
          updated_at: '2026-06-04T00:00:02.000Z',
        },
        safe_metadata: {},
        started_at: '2026-06-04T00:00:00.000Z',
        status: 'active',
        title: 'Chuẩn bị cho công việc',
        total_cost_usd: 0,
        total_turns: 2,
        worker_id: 'worker_test_1',
      },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-04T00:00:00.000Z',
            id: 'turn-worker-default',
            media_refs: [],
            role: 'worker',
            safe_metadata: {},
            session_id: sessionId,
            text_content: input.message,
            turn_index: 1,
          },
          {
            content_type: 'guidance',
            created_at: '2026-06-04T00:00:01.000Z',
            id: 'turn-kael-default',
            media_refs: [],
            role: 'kael',
            safe_metadata: {},
            session_id: sessionId,
            text_content: 'Kael saved this advisory. Keep the next step inside the app.',
            turn_index: 2,
          },
        ],
      },
      status: 200,
      success: true,
    }
  })
  const imagePicker = jest.requireMock('expo-image-picker')
  imagePicker.requestCameraPermissionsAsync.mockReset()
  imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true })
  imagePicker.launchCameraAsync.mockReset()
  imagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: [] })
  imagePicker.requestMediaLibraryPermissionsAsync.mockReset()
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
  imagePicker.launchImageLibraryAsync.mockReset()
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
  mockPlacesAutocomplete.mockReset()
  mockPlacesAutocomplete.mockResolvedValue({
    data: {
      fallback_used: false,
      suggestions: [],
    },
    success: true,
  })
  mockGetMyWorkerMemory.mockReset()
  mockGetMyWorkerMemory.mockResolvedValue({
    data: { memory: { safe_metadata: { memory_preferences: { area_preference: true } } } },
    status: 200,
    success: true,
  })
  mockUpdateMyWorkerPreference.mockReset()
  mockUpdateMyWorkerPreference.mockResolvedValue({
    error: 'not saved',
    status: 503,
    success: false,
  })
  mockPathname = '/(worker)/home'
  mockRouteParams = {}
  mockAppLanguage = 'vi'
  buildWorkflow()
})

describe('Worker runtime surface wiring', () => {
  it('updates the availability control immediately while the backend write is pending', async () => {
    buildWorkflow()
    let resolveAvailabilityWrite: (saved: boolean) => void = () => undefined
    mockWorkerUpdateAvailability.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      resolveAvailabilityWrite = resolve
    }))

    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đang tắt nhận việc')
    expect(screen.getByTestId('worker-v5-availability-switch-motion-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-switch-fill')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-switch-sheen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-switch-knob')).toBeOnTheScreen()

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    fireEvent(availabilitySwitch, 'pressIn')
    fireEvent(availabilitySwitch, 'pressOut')
    expect(mockWorkerUpdateAvailability).not.toHaveBeenCalled()
    fireEvent.press(availabilitySwitch)

    expect(mockWorkerUpdateAvailability).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Sẵn sàng nhận việc')
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
      busy: true,
      checked: true,
    })

    resolveAvailabilityWrite(true)
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({ busy: false })
    })
  })

  it('commits only the first availability intent while its write is pending', () => {
    buildWorkflow()
    mockWorkerUpdateAvailability.mockImplementationOnce(() => new Promise<boolean>(() => undefined))

    render(<WorkerHomeSurface />)

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    fireEvent.press(availabilitySwitch)
    fireEvent.press(availabilitySwitch)

    expect(mockWorkerUpdateAvailability).toHaveBeenCalledTimes(1)
    expect(mockWorkerUpdateAvailability).toHaveBeenLastCalledWith(true)
    expect(availabilitySwitch.props.accessibilityState).toMatchObject({ busy: true, checked: true })
  })

  it('rolls back visibly when the availability write is rejected', async () => {
    buildWorkflow()
    mockWorkerUpdateAvailability.mockResolvedValueOnce(false)
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<WorkerHomeSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Chưa cập nhật được — kiểm tra việc đang chạy')
    })
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
      checked: false,
    })
    expect(alertSpy).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('keeps availability guarded until the real worker job list has hydrated', () => {
    buildWorkflow({ workerJobsHydrated: false })

    render(<WorkerHomeSurface />)

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    expect(availabilitySwitch.props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đang đồng bộ công việc')
    fireEvent.press(availabilitySwitch)
    expect(mockWorkerUpdateAvailability).not.toHaveBeenCalled()
  })

  it('retires the old accept-review deep link back to the work board', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '2.3-accept-review' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()
  })

  it('keeps the work board focused on real opportunities without the workflow note card', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Một luồng công việc')).toBeNull()
    expect(screen.queryByText('Kael đã lọc theo kỹ năng, bán kính và lịch trống')).toBeNull()
    expect(screen.queryByText('Công việc')).toBeNull()
    expect(screen.getByTestId('worker-v5-opportunity-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toBeOnTheScreen()
  })

  it('acknowledges a queued durable offer when the foreground Worker opens the inbox', async () => {
    const deal = buildIncomingDeal()
    buildWorkflow({ deal })
    mockWorkflowValue.workerMatchingDelivery = {
      confirmedRecipientCount: 1,
      receipt: {
        accepted_at: null,
        broadcast_id: deal.broadcast!.broadcastId,
        delivered_at: null,
        expires_at: '2026-08-15T03:05:00.000Z',
        seen_at: null,
        state: 'queued',
      },
    }
    mockRouteParams = { ns_worker_screen: '2.1-opportunity-inbox' }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerMarkBroadcastSeen).toHaveBeenCalledWith(deal.broadcast!.broadcastId)
    })
  })

  it('uses one Worker Jobs rebuild surface in Preview and shows only real opportunity data', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_lang: 'vi',
      ns_worker_screen: '2.1-opportunity-inbox',
    }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-jobs-rebuild-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toBeOnTheScreen()
    expect(screen.getByText('Sửa điện')).toBeOnTheScreen()
    expect(screen.queryByText('Vệ sinh sofa')).toBeNull()
    const opportunityCard = screen.getByTestId('worker-v5-opportunity-card')
    expect(StyleSheet.flatten(opportunityCard.props.style)).toMatchObject({ flexDirection: 'row', minHeight: 172, position: 'relative' })
    expect(screen.queryByTestId('worker-v5-opportunity-artwork-frame')).toBeNull()
    expect(screen.getByTestId('worker-v5-opportunity-selection-hint')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-opportunity-card'))
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.2-offer-detail&ns_audit_role=worker&ns_worker_lang=vi')
  })

  it('keeps Stage 11 bound to the real settled job and earnings ledger', () => {
    buildWorkflow({ deal: buildSettledCaseDeal(), workerEarnings: buildSettledCaseEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_lang: 'vi',
      ns_worker_prototype: 'worker-jobs-rebuild-v1',
      ns_worker_screen: '2.12-case-closed',
      ns_worker_stage: 'payment-confirmed',
    }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-eleven-payment-confirmed')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-eleven-payment-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-eleven-amount')).toHaveTextContent('340.000 ₫')
    expect(screen.getByTestId('stage11-job-card')).toBeOnTheScreen()
    expect(screen.getByTestId('stage11-income-card')).toBeOnTheScreen()
    expect(screen.getByText('Thông tin công việc')).toBeOnTheScreen()
    expect(screen.getByText('Thông tin thanh toán')).toBeOnTheScreen()
    expect(screen.getByText('Chi tiết thu nhập')).toBeOnTheScreen()
    expect(screen.getByText('Cảm ơn bạn!')).toBeOnTheScreen()
    expect(screen.getByText('Về trang chủ')).toBeOnTheScreen()
    expect(screen.queryByTestId('stage11-back')).toBeNull()
    expect(screen.queryByTestId('worker-v5-stage-eleven-payment-workart')).toBeNull()
    expect(screen.queryByText('Quy trình công việc')).toBeNull()
    expect(screen.queryByText('10/11')).toBeNull()
  })

  it('opens the payment disclosure and routes earnings actions to their owning screens', () => {
    buildWorkflow({ deal: buildSettledCaseDeal(), workerEarnings: buildSettledCaseEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_lang: 'vi',
      ns_worker_screen: '2.12-case-closed',
      ns_worker_stage: 'payment-confirmed',
    }

    render(<WorkerJobsSurface />)

    const paymentToggle = screen.getByTestId('stage11-payment-toggle')
    expect(paymentToggle.props.accessibilityState).toMatchObject({ expanded: true })
    fireEvent.press(paymentToggle)
    expect(paymentToggle.props.accessibilityState).toMatchObject({ expanded: false })
    expect(screen.queryByTestId('stage11-payment-details')).toBeNull()
    fireEvent.press(paymentToggle)
    expect(paymentToggle.props.accessibilityState).toMatchObject({ expanded: true })
    expect(screen.getByTestId('stage11-payment-details')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-stage-eleven-earnings-action'))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('ns_worker_screen=4.1-earnings-overview'))
  })

  it('opens the transaction ledger from the empty earnings breakdown and can retry payment refresh', async () => {
    const deal = buildSettledCaseDeal()
    deal.backendStatus = 'payment_pending'
    deal.status = 'payment_pending'
    deal.payment = deal.payment ? { ...deal.payment, status: 'pending', provider: 'platform_bank_manual' } : null
    buildWorkflow({ deal, workerEarnings: buildNoEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_lang: 'vi',
      ns_worker_screen: '2.12-case-closed',
      ns_worker_stage: 'payment-confirmed',
    }

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('stage11-income-history-action'))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('ns_worker_screen=4.2-ledger-detail'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('stage11-refresh'))
    })
    expect(mockWorkerRefresh).toHaveBeenCalledTimes(1)
  })

  it('keeps local payment metadata visible when the hydrated worker list has not matched the deal yet', () => {
    const deal = buildSettledCaseDeal()
    deal.payment = deal.payment ? {
      ...deal.payment,
      accountMasked: '•••• 2681',
      bankCode: 'Vietcombank',
      paymentCode: 'PAY-SETTLED-01',
      receivedAt: '2026-07-15T09:01:00.000Z',
    } : null
    buildWorkflow({ deal, workerEarnings: buildSettledCaseEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_lang: 'vi',
      ns_worker_screen: '2.12-case-closed',
      ns_worker_stage: 'payment-confirmed',
    }

    render(<WorkerJobsSurface />)

    expect(screen.getByText('Vietcombank · •••• 2681')).toBeOnTheScreen()
    expect(screen.getByText('PAY-SETTLED-01')).toBeOnTheScreen()
    expect(screen.getByText('16:01 · 15/07/2026')).toBeOnTheScreen()
  })

  it('shows the recorded bank-transfer amount as currency when the payment record has it', () => {
    const deal = buildSettledCaseDeal()
    deal.payment = deal.payment ? { ...deal.payment, amountReceived: 400_000 } : null
    buildWorkflow({ deal, workerEarnings: buildNoEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_lang: 'vi',
      ns_worker_prototype: 'worker-jobs-rebuild-v1',
      ns_worker_screen: '2.12-case-closed',
      ns_worker_stage: 'payment-confirmed',
    }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-eleven-amount')).toHaveTextContent('400.000 ₫')
    expect(screen.getByText('Thông tin thanh toán')).toBeOnTheScreen()
    expect(screen.queryByText('Số tiền chuyển khoản')).toBeNull()
  })

  it('does not turn a pending bank order or provisional earnings into a payment receipt', () => {
    const deal = buildSettledCaseDeal()
    deal.backendStatus = 'payment_pending'
    deal.status = 'payment_pending'
    deal.payment = deal.payment ? { ...deal.payment, status: 'pending', provider: 'platform_bank_manual' } : null
    buildWorkflow({ deal, workerEarnings: buildNoEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker', ns_worker_lang: 'vi',
      ns_worker_screen: '2.12-case-closed', ns_worker_stage: 'payment-confirmed',
    }

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Thanh toán đã ghi nhận')).toBeNull()
    expect(screen.queryByText('Khách đã xác nhận thanh toán')).toBeNull()
    expect(screen.queryByText('Chúc mừng!')).toBeNull()
    expect(screen.getByTestId('worker-v5-stage-eleven-amount')).toHaveTextContent('—')
    expect(screen.getByText('Đang chờ thanh toán')).toBeOnTheScreen()
    expect(screen.getByTestId('stage11-refresh')).toBeOnTheScreen()
    expect(screen.queryByTestId('stage11-thanks')).toBeNull()
  })

  it('does not synthesize a job when the Preview inbox has no real opportunity', () => {
    buildWorkflow({ deal: null })
    mockRouteParams = { ns_audit_role: 'worker', ns_worker_lang: 'vi', ns_worker_screen: '2.1-opportunity-inbox' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-opportunity-empty-card')).toBeOnTheScreen()
    expect(screen.getByText('Chưa có việc phù hợp')).toBeOnTheScreen()
    expect(screen.queryByText('Vệ sinh sofa')).toBeNull()
    expect(screen.getByTestId('worker-v5-primary-action')).toBeDisabled()
  })

  it('requires a selected mission before enabling the continuation CTA and source formula', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Phù hợp từ nguồn thật')).toBeNull()
    expect(screen.getByText('150.000d - 240.000d')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-selection-hint')).toHaveTextContent('Chọn công việc để xem chi tiết.')
    expect(screen.getByTestId('worker-v5-primary-action')).toBeDisabled()
    expect(screen.queryByTestId('worker-v5-primary-gradient')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-opportunity-card'))

    expect(screen.getByTestId('worker-v5-opportunity-card').props.accessibilityState).toEqual({ selected: true })
    expect(screen.queryByTestId('worker-v5-opportunity-selection-hint')).toBeNull()
    expect(screen.getByTestId('worker-v5-primary-action')).not.toBeDisabled()
  })

  it('accepts an open offer from the unified offer decision screen', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-accept-checklist-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-commitment')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-accept-confirm-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerAcceptBroadcast).toHaveBeenCalledWith('job_test_1')
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.3-customer-confirmation-wait')
    })
  })

  it('keeps a candidate-pending mission in the customer confirmation phase', () => {
    buildWorkflow({ deal: buildCandidatePendingDeal() })
    mockRouteParams = { ns_worker_screen: '2.3-customer-confirmation-wait' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.3-customer-confirmation-wait')).toBeOnTheScreen()
    expect(screen.getByTestId('waiting-customer-confirmation')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-screen-2.7-in-progress')).toBeNull()
    expect(screen.queryByTestId('worker-v5-in-progress-scope-action')).toBeNull()
  })

  it('does not render an unselected service label while waiting for customer confirmation', () => {
    const deal = buildCandidatePendingDeal()
    deal.broadcast = null
    deal.draft = { ...deal.draft, serviceType: null }
    buildWorkflow({ deal })
    mockRouteParams = { ns_worker_screen: '2.3-customer-confirmation-wait' }

    render(<WorkerJobsSurface />)

    expect(within(screen.getByTestId('waiting-customer-confirmation')).queryByText('Chưa chọn')).toBeNull()
  })

  it('leaves customer confirmation after an authoritative empty worker refresh', async () => {
    buildWorkflow({ deal: null, workerJobs: [], workerJobsHydrated: true, workerGate: 'backend_pending' })
    mockRouteParams = { ns_worker_screen: '2.3-customer-confirmation-wait' }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox')
    })
  })

  it('redirects a stale in-progress route back to customer confirmation', async () => {
    buildWorkflow({ deal: buildCandidatePendingDeal() })
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.3-customer-confirmation-wait')
    })
    expect(screen.queryByTestId('worker-v5-in-progress-scope-action')).toBeNull()
  })

  it('does not invent zero earnings while an offer estimate is missing', () => {
    const deal = buildIncomingDeal()
    deal.broadcast = deal.broadcast
      ? { ...deal.broadcast, estimatedEarningLabel: '   ' }
      : null
    buildWorkflow({ deal })
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-offer-detail-summary-card')).toBeOnTheScreen()
    expect(screen.queryByText(/^0$/)).toBeNull()
  })

  it('declines an open offer from the same decision screen and returns to the board', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-offer-decline-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerDeclineBroadcast).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox')
    })
  })

  it('does not navigate when the server rejects the accept action', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockWorkflowValue.actions.workerAcceptBroadcast = jest.fn(async () => false)
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-accept-confirm-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerAcceptBroadcast).toHaveBeenCalledTimes(1)
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('lays the offer detail out as four section cards, each with its own header and status rows', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)

    for (const [testID, title, description] of [
      ['worker-v5-offer-request-list', 'Yêu cầu', 'Thông tin yêu cầu và hiện trạng của công việc.'],
      ['worker-v5-offer-address-list', 'Địa chỉ & khách hàng', 'Thông tin địa chỉ và khách hàng của công việc.'],
      ['worker-v5-offer-price-list', 'Giá dịch vụ & tiền công', 'Thông tin giá và tiền công của công việc.'],
      ['worker-v5-accept-checklist-card', 'Sẵn sàng nhận việc', 'Các thông tin cần thiết để bắt đầu công việc.'],
    ] as const) {
      const card = within(screen.getByTestId(testID))
      expect(card.getByText(title)).toBeOnTheScreen()
      expect(card.getByText(description)).toBeOnTheScreen()
    }
    expect(within(screen.getByTestId('worker-v5-accept-check-0')).getAllByText(/^(Đạt|Cần xử lý)$/).length).toBeGreaterThan(0)
  })

  it('moves the empty request hint into the card header and leaves the placeholder row title-only', () => {
    buildWorkflow({ deal: null })
    mockRouteParams = {}

    render(
      <WorkerJobsLegacyPrototypeOfferDetailBody
        actionBusy={false}
        language="vi"
        prototypeMode
        reduceTransparency={false}
        runWorkerAction={jest.fn()}
        runtime={mockWorkflowValue}
      />,
    )

    expect(screen.getAllByText('Yêu cầu sẽ hiện khi có cơ hội phù hợp.')).toHaveLength(1)
    const request = within(screen.getByTestId('worker-v5-offer-request-list'))
    expect(request.getByText('Yêu cầu sẽ hiện khi có cơ hội phù hợp.')).toBeOnTheScreen()
    expect(request.getByText('Chưa có yêu cầu')).toBeOnTheScreen()
    expect(request.getByText('Chờ')).toBeOnTheScreen()
  })

  it('does not loop a cancelled deal back into the work board', () => {
    buildWorkflow({ deal: buildCancelledDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-v5-opportunity-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-primary-action')).toBeDisabled()
  })

  it('shows an accepted job on the Stage 4 travel screen', () => {
    const deal = { ...buildAcceptedDeal(), createdAt: '2026-07-10T00:00:00.000Z' }
    buildWorkflow({ deal })
    mockRouteParams = { ns_worker_screen: '2.4-route-eta' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.4-route-eta')).toBeOnTheScreen()
    expect(screen.getByTestId('stage4-destination-card')).toBeOnTheScreen()
    expect(screen.getByTestId('stage4-primary')).toHaveTextContent(/Bắt đầu di chuyển/)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects a matched job from the in-progress route to Stage 4 travel', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.4-route-eta')
    })
  })

  it('starts Kael job intake with its empty hero before revealing current workflow context', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-kael-empty-hero-intake')).toBeOnTheScreen()
    expect(screen.queryByText('120.000d - 180.000d')).toBeNull()
    expect(screen.queryByTestId('worker-v5-private-kael-chat-intake')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-composer')).toBeOnTheScreen()

    fireEvent(screen.getByTestId('worker-v5-kael-orb-input'), 'focus')

    expect(screen.queryByTestId('worker-v5-kael-empty-hero-intake')).toBeNull()
    expect(screen.getByText('120.000d - 180.000d')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-open-opportunity'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.4-route-eta')
    })
  })

  it('shows the active job state before a worker starts a case-bound Kael conversation', () => {
    buildWorkflow({ deal: buildArrivedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-active-mode')).toHaveTextContent('Công việc')
    expect(screen.getByTestId('worker-v5-kael-empty-hero-copy'))
      .toHaveTextContent(/You are working on .* Current status: .* Complete the lobby photo check-in/)
    expect(screen.getByTestId('worker-v5-kael-orb-input'))
      .toHaveProp('placeholder', 'Nhập tin nhắn cho Kael...')
  })

  it('sends the matched-job intake message through the private worker Kael session', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Tôi nên chuẩn bị dụng cụ gì?')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({
        job_id: 'job_test_1',
        language: 'vi',
        mode: 'intake',
      }))
    })
    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-1',
        expect.objectContaining({ language: 'vi', media_refs: [], message: 'Tôi nên chuẩn bị dụng cụ gì?' }),
        expect.any(Object),
      )
    })
    expect(await screen.findByText('Kael saved this advisory. Keep the next step inside the app.')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe('')
    expect(screen.getByText('Tôi nên chuẩn bị dụng cụ gì?')).toBeOnTheScreen()
  })

  it('ignores an empty Kael orb send without opening a session', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
  })

  it('opens normal Kael chat as a blank unsaved session', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-orb-transcript')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-normal-thread')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
    expect(screen.queryByText('Cuộc trò chuyện mới. Hãy gửi tin nhắn đầu tiên cho Kael.')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-composer')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-customer-frame').props.style)).toMatchObject({
      paddingBottom: 0,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-orb-disclaimer').props.style)).toMatchObject({
      paddingBottom: 12,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-orb-input').props.style)).toMatchObject({
      boxShadow: 'none',
      fontSize: 15,
      fontWeight: '400',
      letterSpacing: -0.23,
      lineHeight: 20,
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 0,
      WebkitBoxShadow: 'none',
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-orb-input-shell').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 0,
      minHeight: 44,
      paddingHorizontal: 0,
      paddingVertical: 0,
    })
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
  })

  it('shows the Kael empty hero until the worker focuses or types in normal chat', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-model')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-model-body')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-model-bow')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-model-blink')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-copy').props.children.length).toBeGreaterThan(20)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-orb-transcript').props.contentContainerStyle)).toMatchObject({
      flexGrow: 1,
      gap: 8,
      justifyContent: 'center',
      paddingBottom: 44,
      paddingVertical: 6,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-empty-hero-normal').props.style)).toMatchObject({
      flexGrow: 0,
      minHeight: 300,
      paddingBottom: 18,
      paddingHorizontal: 24,
      paddingTop: 22,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-empty-hero-copy').props.style)).toMatchObject({
      color: color.text.primary,
      fontSize: 20,
      fontWeight: '500',
      letterSpacing: -0.45,
      lineHeight: 25,
      maxWidth: 240,
      textAlign: 'left',
    })

    fireEvent(screen.getByTestId('worker-v5-kael-empty-hero-normal'), 'layout', {
      persist: jest.fn(),
      nativeEvent: { layout: { height: 400, width: 320, x: 0, y: 0 } },
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-empty-hero-content').props.style).transform).toEqual([
      { translateY: -60 },
    ])

    const input = screen.getByTestId('worker-v5-kael-orb-input')
    fireEvent(input, 'focus')
    expect(screen.queryByTestId('worker-v5-kael-empty-hero-normal')).toBeNull()

    fireEvent(input, 'blur')
    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()

    fireEvent.changeText(input, 'Kael, bắt đầu nhé')
    expect(screen.queryByTestId('worker-v5-kael-empty-hero-normal')).toBeNull()
  })

  it('uses a dedicated job-intake empty hero when no real opportunity is present', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-empty-hero-intake')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-copy').props.children.length).toBeGreaterThan(20)
    expect(screen.queryByTestId('worker-v5-kael-empty-hero-normal')).toBeNull()
  })

  it('keeps an in-flight turn in the same conversation when Kael chat refocuses', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let rejectPreviousTurn: ((reason?: unknown) => void) | undefined
    mockWorkerKaelChatService.streamTurn.mockImplementation(() => new Promise((_, reject) => {
      rejectPreviousTurn = reject
    }))

    render(<WorkerChatSurface />)
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Tin nhắn thuộc phiên trước')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByText('Tin nhắn thuộc phiên trước')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-reasoning-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: true, expanded: true })
    expect(screen.queryByText('Kael đang xử lý...')).toBeNull()

    act(() => {
      mockFocusCallback?.()
    })

    expect(screen.getByTestId('worker-v5-kael-orb-live-thread')).toBeOnTheScreen()
    expect(screen.getByText('Tin nhắn thuộc phiên trước')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-reasoning-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: true, expanded: true })

    await act(async () => {
      rejectPreviousTurn?.(new Error('previous session failed after refocus'))
      await Promise.resolve()
    })

    expect(screen.getByTestId('worker-v5-kael-orb-live-thread')).toBeOnTheScreen()
    expect(screen.getByText('Kael chưa thể hoàn tất phản hồi này.')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-reasoning-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: false, expanded: false })
    expect(screen.getByText('Suy nghĩ bị gián đoạn')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
  })

  it('removes the optimistic receipt when a normal reply has no backend receipt', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)
    await waitFor(() => expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('normal'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Reply without receipt')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await screen.findByText('Kael saved this advisory. Keep the next step inside the app.')
    await waitFor(() => expect(screen.queryByTestId('worker-v5-kael-reasoning-receipt')).toBeNull())
  })

  it('marks a backend-started receipt as interrupted when its terminal event is missing', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    const defaultStreamTurn = mockWorkerKaelChatService.streamTurn.getMockImplementation()
    mockWorkerKaelChatService.streamTurn.mockImplementation((sessionId: string, input: { message: string }, handlers?: any) => {
      handlers?.onReasoning?.({
        receiptId: 'kael-reasoning:worker-incomplete',
        schemaVersion: 'kael_reasoning.v1',
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      })
      return defaultStreamTurn?.(sessionId, input, handlers)
    })

    render(<WorkerChatSurface />)
    await waitFor(() => expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('normal'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Check an incomplete receipt')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await screen.findByText('Kael saved this advisory. Keep the next step inside the app.')
    expect(screen.getByTestId('worker-v5-kael-reasoning-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: false, expanded: false })
    expect(screen.getByText('Suy nghĩ bị gián đoạn')).toBeOnTheScreen()
  })

  it('shows server-received processing feedback in normal Kael chat and lets the Worker reopen it after completion', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let emitReasoning: ((event: unknown) => void) | undefined
    let resolveTurn: ((response: unknown) => void) | undefined
    mockWorkerKaelChatService.streamTurn.mockImplementation((
      _sessionId: string,
      _input: { message: string },
      handlers?: { onReasoning?: (event: unknown) => void },
    ) => {
      emitReasoning = handlers?.onReasoning
      return new Promise((resolve) => {
        resolveTurn = resolve
      })
    })

    render(<WorkerChatSurface />)
    await waitFor(() => expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('normal'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Help with my next step')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
    await waitFor(() => expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1))
    expect(emitReasoning).toEqual(expect.any(Function))
    await act(async () => {
      emitReasoning?.({
        receiptId: 'kael-reasoning:worker-test',
        schemaVersion: 'kael_reasoning.v1',
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      })
      emitReasoning?.({
        elapsedMs: 320,
        receiptId: 'kael-reasoning:worker-test',
        schemaVersion: 'kael_reasoning.v1',
        step: {
          detail: null,
          id: 'context',
          label: 'Checked the relevant conversation context',
          sequence: 1,
          stage: 'context',
          status: 'completed',
        },
        type: 'reasoning.step',
      })
      emitReasoning?.({
        elapsedMs: 560,
        fallbackUsed: false,
        receiptId: 'kael-reasoning:worker-test',
        schemaVersion: 'kael_reasoning.v1',
        summary: ['Prepared the next safe action from backend feedback.'],
        type: 'reasoning.completed',
      })
      await Promise.resolve()
    })

    const receipt = await screen.findByTestId('worker-v5-kael-reasoning-receipt')
    expect(receipt).toBeOnTheScreen()
    const receiptToggle = screen.getByTestId('worker-v5-kael-reasoning-receipt-toggle')
    expect(receiptToggle).toHaveProp('accessibilityState', { busy: false, expanded: false })
    fireEvent.press(receiptToggle)
    expect(receiptToggle).toHaveProp('accessibilityState', { busy: false, expanded: true })
    expect(screen.getByText('Checked the relevant conversation context')).toBeOnTheScreen()
    expect(screen.getByText('Prepared the next safe action from backend feedback.')).toBeOnTheScreen()

    await act(async () => {
      resolveTurn?.({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-1',
            job_id: null,
            mode: 'normal',
            progress: {
              current_stage: 'worker_assist',
              failure_reason: null,
              progress: 1,
              status: 'completed',
              updated_at: '2026-08-10T00:00:01.000Z',
            },
            safe_metadata: {},
            started_at: '2026-08-10T00:00:00.000Z',
            status: 'active',
            title: 'Safe next step',
            total_cost_usd: 0,
            total_turns: 2,
            worker_id: 'worker_test_1',
          },
          turns: [
            { content_type: 'text', created_at: '2026-08-10T00:00:00.000Z', id: 'worker-receipt-turn', media_refs: [], role: 'worker', safe_metadata: {}, session_id: 'worker-kael-session-1', text_content: 'Help with my next step', turn_index: 1 },
            { content_type: 'guidance', created_at: '2026-08-10T00:00:01.000Z', id: 'kael-receipt-turn', media_refs: [], role: 'kael', safe_metadata: {}, session_id: 'worker-kael-session-1', text_content: 'Kael has prepared the next safe action.', turn_index: 2 },
          ],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    await screen.findByText('Kael has prepared the next safe action.')
    expect(screen.getByTestId('worker-v5-kael-reasoning-receipt')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))

    await waitFor(() => expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('worker-v5-kael-reasoning-receipt')).toBeNull()
  })

  it('persists and answers normal Kael chat without an active work session', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)
    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('normal')
    })
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Kael giúp tôi chuẩn bị gì?')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({
        language: 'vi',
        mode: 'normal',
      }))
    })
    expect(mockWorkerKaelChatService.create.mock.calls[0]?.[0]).not.toHaveProperty('job_id')
    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Kael giúp tôi chuẩn bị gì?')).toBeOnTheScreen()
    expect(await screen.findByText('Kael saved this advisory. Keep the next step inside the app.')).toBeOnTheScreen()
  })

  it('shows the safe API error when normal Kael session creation fails', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.create.mockResolvedValueOnce({
      code: 'DB_ERROR',
      error: 'Không thể tạo phiên Kael cho thợ',
      status: 500,
      success: false,
    })

    render(<WorkerChatSurface />)
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Kiểm tra tạo phiên Kael')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    expect(await screen.findByText('Chưa thể mở cuộc trò chuyện riêng cho việc này.')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })

  it.each([
    ['Trò chuyện', '3.1-kael-chat-normal'],
    ['Công việc', '3.2-kael-job-intake'],
  ])('groups session management and %s mode selection in one header capsule', (modeLabel, workerScreen) => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: workerScreen }

    render(<WorkerChatSurface />)

    const headerActions = screen.getByTestId('worker-v5-kael-header-actions')
    expect(StyleSheet.flatten(headerActions.props.style)).toMatchObject({
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderColor: 'rgba(255,255,255,0.72)',
      borderWidth: 0,
    })
    expect(screen.getByTestId('worker-v5-kael-header-actions-liquid-layers')).toBeOnTheScreen()
    expect(headerActions.findAllByProps({ testID: 'worker-v5-kael-session-toggle' }).length).toBeGreaterThan(0)
    expect(headerActions.findAllByProps({ testID: 'worker-v5-kael-mode-toggle' }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('worker-v5-kael-active-mode')).toHaveTextContent(new RegExp(`^${modeLabel}$`))

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByTestId('worker-v5-kael-session-menu')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))
    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-mode-menu')).toBeOnTheScreen()
  })

  it('uses dark text icons for the Worker Kael header controls', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-back').findAllByProps({ stroke: color.text.primary }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('worker-v5-kael-session-toggle').findAllByProps({ stroke: color.text.primary }).length).toBeGreaterThan(0)
  })

  it('matches Customer bold stroke weights for the Worker Kael header controls', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-back').findAllByProps({ strokeWidth: 2.35 }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('worker-v5-kael-session-toggle').findAllByProps({ strokeWidth: 2.7 }).length).toBeGreaterThan(0)
  })

  it('matches the Customer Kael mode control hit area and label alignment', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-trigger-frame').props.style)).toMatchObject({
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      minWidth: 114,
    })
    expect(
      StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-toggle').props.style),
    ).toMatchObject({
      alignItems: 'center',
      alignSelf: 'stretch',
      flexGrow: 1,
      justifyContent: 'center',
      outlineColor: 'transparent',
      outlineStyle: 'solid',
      outlineWidth: 0,
      paddingHorizontal: 11,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-active-mode').props.style)).toMatchObject({
      alignSelf: 'stretch',
      fontSize: 16,
      includeFontPadding: false,
      textAlign: 'center',
      textAlignVertical: 'center',
      transform: [{ translateX: -14 }, { translateY: -1 }],
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))

    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-trigger-frame').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
    })
  })

  it('opens the Kael mode menu from the combined header capsule and switches to job intake', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-active-mode')).toHaveTextContent(/^Trò chuyện$/)
    expect(screen.queryByText('⌄')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-mode-menu')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))

    const modeMenu = screen.getByTestId('worker-v5-kael-mode-menu')
    expect(modeMenu).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-options')).toBeOnTheScreen()
    expect(StyleSheet.flatten(modeMenu.props.style)).toMatchObject({
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderColor: 'rgba(255,255,255,0.72)',
      borderRadius: 18,
      borderWidth: 1,
      maxWidth: 208,
      width: '59%',
    })
    expect(screen.getByTestId('worker-v5-kael-mode-menu-liquid-layers')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-mode-menu-sheen')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-menu-normal').props.style)).toMatchObject({
      backgroundColor: 'rgba(255,255,255,0.42)',
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-menu-intake').props.style)).toMatchObject({
      minHeight: 46,
    })
    expect(screen.getByTestId('worker-v5-kael-mode-toggle').props.accessibilityState).toMatchObject({ expanded: true })
    expect(screen.getByText('Hỏi đáp và hỗ trợ nhanh')).toBeOnTheScreen()
    expect(screen.getByText('Lọc và chuẩn bị cơ hội phù hợp')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-menu-intake'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake')
    })
  })

  it('keeps the Worker visual-audit role while switching Kael modes in Preview', async () => {
    buildWorkflow()
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_screen: '3.1-kael-chat-normal',
    }

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-menu-intake'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/(worker)/chat?ns_worker_screen=3.2-kael-job-intake&ns_audit_role=worker',
      )
    })
  })

  it.each([
    ['normal chat', '3.1-kael-chat-normal', 'normal', 'worker-kael-session-normal', 'worker-kael-session-intake'],
    ['job intake', '3.2-kael-job-intake', 'intake', 'worker-kael-session-intake', 'worker-kael-session-normal'],
  ])('keeps %s session catalog isolated from the other Kael mode', async (
    _label,
    workerScreen,
    expectedMode,
    visibleSessionId,
    hiddenSessionId,
  ) => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: workerScreen }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [
          {
            closed_at: null,
            id: 'worker-kael-session-normal',
            job_id: null,
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:00:00.000Z',
            status: 'active',
            title: 'Trò chuyện thường',
            total_turns: 1,
            worker_id: 'worker_test_1',
          },
          {
            closed_at: null,
            id: 'worker-kael-session-intake',
            job_id: 'job_test_1',
            mode: 'intake',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:05:00.000Z',
            status: 'active',
            title: 'Trao đổi nhận việc',
            total_turns: 1,
            worker_id: 'worker_test_1',
          },
        ],
      },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith(expectedMode)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByTestId(`worker-v5-kael-session-${visibleSessionId}`)).toBeOnTheScreen()
    expect(screen.queryByTestId(`worker-v5-kael-session-${hiddenSessionId}`)).toBeNull()
  })

  it('ignores a late catalog response from the previous Kael mode', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveNormal: ((value: unknown) => void) | undefined
    let resolveIntake: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.list.mockImplementation((mode: 'normal' | 'intake') => (
      new Promise((resolve) => {
        if (mode === 'normal') resolveNormal = resolve
        else resolveIntake = resolve
      })
    ))

    const { rerender } = render(<WorkerChatSurface />)
    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('normal')
    })

    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }
    rerender(<WorkerChatSurface />)
    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('intake')
    })

    await act(async () => {
      resolveNormal?.({
        data: {
          sessions: [{
            closed_at: null,
            id: 'worker-kael-session-late-normal',
            job_id: null,
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:10:00.000Z',
            status: 'active',
            title: 'Phiên thường đến muộn',
            total_turns: 1,
            worker_id: 'worker_test_1',
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.queryByTestId('worker-v5-kael-session-worker-kael-session-late-normal')).toBeNull()

    await act(async () => {
      resolveIntake?.({
        data: {
          sessions: [{
            closed_at: null,
            id: 'worker-kael-session-current-intake',
            job_id: 'job_test_1',
            mode: 'intake',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:11:00.000Z',
            status: 'active',
            title: 'Phiên nhận việc hiện tại',
            total_turns: 1,
            worker_id: 'worker_test_1',
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-current-intake')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-session-worker-kael-session-late-normal')).toBeNull()
  })

  it('preloads work-scoped Kael sessions and reuses the same in-flight request when the menu opens', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveList: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.list.mockImplementation(() => new Promise((resolve) => {
      resolveList = resolve
    }))

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByText('Đang tải cuộc trò chuyện...')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveList?.({
        data: {
          sessions: [{
            closed_at: null,
            id: 'worker-kael-session-preloaded',
            job_id: null,
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T08:30:00.000Z',
            status: 'active',
            title: 'Phiên đã tải trước',
            total_turns: 2,
            worker_id: 'worker_test_1',
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-preloaded')).toBeOnTheScreen()
    expect(screen.queryByText('Đang tải cuộc trò chuyện...')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByTestId('worker-v5-kael-session-worker-kael-session-preloaded')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
  })

  it('keeps new conversation available while the existing session catalog is still loading', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    const newSession = screen.getByTestId('worker-v5-kael-session-new')
    expect(newSession.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }))
    fireEvent.press(newSession)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps a newly created intake conversation when Preview uses a visual-audit identity', async () => {
    mockAuthSessionProvider = 'local-visual-audit'
    mockAuthSessionUserId = 'local-visual-audit-worker'
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_screen: '3.2-kael-job-intake',
    }

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))
      await Promise.resolve()
    })

    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(mockWorkerKaelChatService.list).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(screen.getByText('Trao đổi về công việc')).toBeOnTheScreen()
  })

  it('creates a Worker Preview conversation locally without calling remote chat APIs', async () => {
    mockAuthSessionProvider = 'local-visual-audit'
    mockAuthSessionUserId = 'local-visual-audit-worker'
    buildWorkflow()
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_screen: '3.1-kael-chat-normal',
    }

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByTestId('worker-v5-kael-session-menu')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.list).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))
      await Promise.resolve()
    })

    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByText('Trò chuyện cùng Kael')).toBeOnTheScreen()
  })

  it('keeps the empty hero mounted while a new conversation is being created', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveCreate: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.create.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))

    render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()

    await act(async () => {
      resolveCreate?.({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-new-empty',
            job_id: null,
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T10:45:00.000Z',
            status: 'active',
            title: null,
            total_turns: 0,
            worker_id: 'worker_test_1',
          },
          turns: [],
        },
        status: 201,
        success: true,
      })
      await Promise.resolve()
    })

    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
  })

  it('prefetches the worker session catalog before the active job finishes hydrating', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-prefetched-before-job',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:40:00.000Z',
          status: 'active',
          title: 'Phiên sẵn sàng trước khi đồng bộ việc',
          total_turns: 3,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    const { rerender } = render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })

    buildWorkflow({ deal: buildAcceptedDeal() })
    rerender(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-prefetched-before-job')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
  })

  it('restores real session summaries from device cache while background refresh is pending', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-device-cache',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:42:00.000Z',
          status: 'active',
          title: 'Phiên đã lưu trên thiết bị',
          total_turns: 5,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    const firstRender = render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-device-cache')).toBeOnTheScreen()

    await waitFor(async () => {
      const keys = await AsyncStorage.getAllKeys()
      expect(keys.some((key) => key.includes('worker.kael_session_catalog'))).toBe(true)
    })
    firstRender.unmount()

    mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-device-cache')).toBeOnTheScreen()
    expect(screen.queryByText('Đang tải cuộc trò chuyện...')).toBeNull()
  })

  it('loads Kael sessions when the active job hydrates after the session menu is already open', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-hydrated',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:45:00.000Z',
          status: 'active',
          title: 'Phiên sau đồng bộ',
          total_turns: 4,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    const { rerender } = render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByText('Đang tải cuộc trò chuyện...')).toBeOnTheScreen()

    buildWorkflow({ deal: buildAcceptedDeal() })
    rerender(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-hydrated')).toBeOnTheScreen()
    expect(screen.queryByText('Chưa có cuộc trò chuyện cho công việc này.')).toBeNull()
  })

  it('shows the normal-chat empty state without waiting for worker jobs to hydrate', async () => {
    buildWorkflow({ workerJobsHydrated: false })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: { sessions: [] },
      status: 200,
      success: true,
    })
    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByText('Chưa có cuộc trò chuyện thường.')).toBeOnTheScreen()
    expect(screen.queryByText('Đang tải cuộc trò chuyện...')).toBeNull()
  })

  it('keeps a newly-created Kael session visible when the initial list response arrives later', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveList: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.list.mockImplementation(() => new Promise((resolve) => {
      resolveList = resolve
    }))

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Chuẩn bị dụng cụ ngay')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-1',
        expect.objectContaining({ message: 'Chuẩn bị dụng cụ ngay' }),
        expect.any(Object),
      )
    })
    expect(await screen.findByText('Kael saved this advisory. Keep the next step inside the app.')).toBeOnTheScreen()

    await act(async () => {
      resolveList?.({ data: { sessions: [] }, status: 200, success: true })
      await Promise.resolve()
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByTestId('worker-v5-kael-session-worker-kael-session-1')).toBeOnTheScreen()
    expect(screen.queryByText('Chưa có cuộc trò chuyện cho công việc này.')).toBeNull()
  })

  it('shares the prefetched transcript request when a Kael session is opened immediately', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-shared-load',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T09:00:00.000Z',
          status: 'active',
          title: 'Phiên đang tải',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    let resolveGet: ((value: unknown) => void) | undefined
    const sharedGet = new Promise((resolve) => {
      resolveGet = resolve
    })
    mockWorkerKaelChatService.get.mockReturnValue(sharedGet)

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
      expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-shared-load'))

    expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveGet?.({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-shared-load',
            job_id: null,
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:00:00.000Z',
            status: 'active',
            title: 'Phiên đang tải',
            total_turns: 2,
            worker_id: 'worker_test_1',
          },
          turns: [{
            content_type: 'guidance',
            created_at: '2026-07-13T09:01:00.000Z',
            id: 'turn-shared-load',
            media_refs: [],
            role: 'kael',
            safety_notes: [],
            session_id: 'worker-kael-session-shared-load',
            text_content: 'Transcript chỉ được tải một lần.',
            turn_index: 1,
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    expect(await screen.findByText('Transcript chỉ được tải một lần.')).toBeOnTheScreen()
  })

  it('opens the real work-scoped Kael session manager without a count and switches complete transcripts', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [
          {
            closed_at: null,
            id: 'worker-kael-session-2',
            job_id: null,
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T07:30:00.000Z',
            status: 'active',
            title: 'Kiểm tra phạm vi lavabo',
            total_turns: 4,
            worker_id: 'worker_test_1',
          },
          {
            closed_at: null,
            id: 'worker-kael-session-1',
            job_id: null,
            mode: 'normal',
            progress: null,
            started_at: '2026-07-13T07:00:00.000Z',
            status: 'active',
            title: 'Chuẩn bị dụng cụ sửa ống',
            total_turns: 2,
            worker_id: 'worker_test_1',
          },
        ],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatService.get.mockImplementation(async (sessionId: string) => ({
      data: {
        session: {
          closed_at: null,
          id: sessionId,
          job_id: null,
          mode: 'normal',
          progress: null,
          started_at: sessionId === 'worker-kael-session-2'
            ? '2026-07-13T07:30:00.000Z'
            : '2026-07-13T07:00:00.000Z',
          status: 'active',
          title: sessionId === 'worker-kael-session-2'
            ? 'Kiểm tra phạm vi lavabo'
            : 'Chuẩn bị dụng cụ sửa ống',
          total_turns: sessionId === 'worker-kael-session-2' ? 4 : 2,
          worker_id: 'worker_test_1',
        },
        turns: [{
          content_type: 'guidance',
          created_at: '2026-07-13T07:31:00.000Z',
          id: `turn-${sessionId}`,
          media_refs: [],
          role: 'kael',
          safety_notes: [],
          session_id: sessionId,
          text_content: sessionId === 'worker-kael-session-2'
            ? 'Hãy kiểm tra phạm vi đã xác nhận trước.'
            : 'Chuẩn bị kìm và khóa nước trước khi thao tác.',
          turn_index: 1,
        }],
      },
      status: 200,
      success: true,
    }))

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(2)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('worker-v5-kael-session-menu')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-menu-shell').props.style)).toMatchObject({
      maxWidth: 208,
      top: 74,
      width: '59%',
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-menu-glass').props.style)).toMatchObject({
      borderRadius: 18,
    })
    expect(screen.getByTestId('worker-v5-kael-session-menu-liquid-layers')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-list').props.style)).toMatchObject({
      marginTop: 6,
      maxHeight: 138,
    })
    expect(screen.getByText('Cuộc trò chuyện mới')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-session-new-liquid-layers')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-new').props.style)).toMatchObject({
      alignSelf: 'stretch',
      borderWidth: 0,
      gap: 8,
      marginHorizontal: -4,
      paddingHorizontal: 13,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-new-label').props.style))
      .toMatchObject({ color: color.brand.primary, fontSize: 13 })
    expect(screen.getByTestId('worker-v5-kael-session-new-plus')).toHaveProp('height', 21)
    expect(screen.getByTestId('worker-v5-kael-session-new-plus')).toHaveProp('width', 21)
    expect(screen.queryByText('Phiên Kael')).toBeNull()
    expect(screen.getByText('Kiểm tra phạm vi lavabo')).toBeOnTheScreen()
    expect(screen.queryByText('2')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-session-worker-kael-session-2')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-session-row-worker-kael-session-2-liquid-layers')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-row-worker-kael-session-2').props.style))
      .toMatchObject({
        backgroundColor: '#FAFDFC',
        borderColor: '#D8EBE8',
        borderCurve: 'continuous',
        borderRadius: 16,
      })

    const prefetchedCalls = mockWorkerKaelChatService.get.mock.calls.length
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-worker-kael-session-2'))

    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(screen.getByText('Hãy kiểm tra phạm vi đã xác nhận trước.')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(prefetchedCalls)
    expect(screen.queryByTestId('worker-v5-kael-normal-thread')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-1'))

    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(screen.getByText('Chuẩn bị kìm và khóa nước trước khi thao tác.')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(prefetchedCalls)
    expect(screen.queryByText('Hãy kiểm tra phạm vi đã xác nhận trước.')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-1'))
    const actionMenu = screen.getByTestId('worker-v5-kael-session-action-menu-worker-kael-session-1')
    expect(actionMenu).toBeOnTheScreen()
    expect(StyleSheet.flatten(actionMenu.props.style)).toEqual(expect.objectContaining({
      flexDirection: 'row',
      minHeight: 44,
      width: '100%',
    }))
    expect(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-session-rename-worker-kael-session-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-1')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-1'))

    expect(screen.getByTestId('worker-v5-kael-session-delete-confirm-worker-kael-session-1')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.archive).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-cancel-worker-kael-session-1'))
    expect(screen.queryByTestId('worker-v5-kael-session-delete-confirm-worker-kael-session-1')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-actions-worker-kael-session-1'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-1'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-submit-worker-kael-session-1'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.archive).toHaveBeenCalledWith('worker-kael-session-1')
    })
  })

  it('renames a work-scoped Kael session from its three-dot menu', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-2',
          job_id: null,
          mode: 'normal',
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Kiểm tra phạm vi lavabo',
          total_turns: 4,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-2'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-rename-worker-kael-session-2'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-session-title-input'), 'Kiểm tra rò nước lavabo')
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-title-save'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.rename).toHaveBeenCalledWith(
        'worker-kael-session-2',
        { title: 'Kiểm tra rò nước lavabo' },
      )
    })
    expect(await screen.findByText('Kiểm tra rò nước lavabo')).toBeOnTheScreen()
  })

  it('shows a renamed session immediately while the Edge write is still pending', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-2',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Kiểm tra phạm vi lavabo',
          total_turns: 4,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    let resolveRename: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.rename.mockImplementation(() => new Promise((resolve) => {
      resolveRename = resolve
    }))

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-2'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-rename-worker-kael-session-2'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-session-title-input'), 'Kiểm tra rò nước mới')
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-title-save'))

    expect(screen.getByText('Kiểm tra rò nước mới')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-session-rename-editor-worker-kael-session-2')).toBeNull()

    await act(async () => {
      resolveRename?.({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-2',
            job_id: null,
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T07:30:00.000Z',
            status: 'active',
            title: 'Kiểm tra rò nước mới',
            total_turns: 4,
            worker_id: 'worker_test_1',
          },
          turns: [],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })
  })

  it('removes a session from the list immediately while its evidence-preserving delete is pending', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-delete',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Phiên cần xóa',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    let resolveArchive: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.archive.mockImplementation(() => new Promise((resolve) => {
      resolveArchive = resolve
    }))

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-delete'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-delete'))
    expect(screen.getByTestId('worker-v5-kael-session-delete-confirm-worker-kael-session-delete')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-submit-worker-kael-session-delete'))

    expect(screen.queryByTestId('worker-v5-kael-session-worker-kael-session-delete')).toBeNull()
    expect(mockWorkerKaelChatService.archive).toHaveBeenCalledWith('worker-kael-session-delete')

    await act(async () => {
      resolveArchive?.({
        data: {
          archived_at: '2026-07-13T08:00:00.000Z',
          session_id: 'worker-kael-session-delete',
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })
  })

  it('pins and unpins a Kael session from the three-dot menu', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-pin',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Kiểm tra aptomat',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-pin'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-pin'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.setPinned).toHaveBeenCalledWith(
        'worker-kael-session-pin',
        { pinned: true },
      )
    })
    expect(screen.getByTestId('worker-v5-kael-session-pinned-worker-kael-session-pin')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-session-action-menu-worker-kael-session-pin')).toBeOnTheScreen()
    expect(screen.getByText('Bỏ ghim')).toBeOnTheScreen()
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-pin').props.accessibilityState).toEqual({ disabled: false })
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-pin'))
    await waitFor(() => {
      expect(mockWorkerKaelChatService.setPinned).toHaveBeenLastCalledWith(
        'worker-kael-session-pin',
        { pinned: false },
      )
    })
    expect(screen.queryByTestId('worker-v5-kael-session-pinned-worker-kael-session-pin')).toBeNull()
    expect(screen.getByText('Ghim')).toBeOnTheScreen()
  })

  it('starts a truly empty Kael session and sends its first turn to the new session id', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-old',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Phiên cũ',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatService.get.mockResolvedValue({
      data: {
        session: {
          closed_at: null,
          id: 'worker-kael-session-old',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Phiên cũ',
          total_turns: 2,
          worker_id: 'worker_test_1',
        },
        turns: [{
          content_type: 'guidance',
          created_at: '2026-07-13T07:31:00.000Z',
          id: 'turn-old',
          media_refs: [],
          role: 'kael',
          safety_notes: [],
          session_id: 'worker-kael-session-old',
          text_content: 'Nội dung chỉ thuộc phiên cũ.',
          turn_index: 1,
        }],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatService.create.mockResolvedValue({
      data: {
        session: {
          closed_at: null,
          id: 'worker-kael-session-new',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:00:00.000Z',
          status: 'active',
          title: null,
          total_turns: 0,
          worker_id: 'worker_test_1',
        },
        turns: [],
      },
      status: 201,
      success: true,
    })

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-kael-session-new').props.accessibilityState).toEqual({ disabled: false })
    })
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-old'))
    expect(await screen.findByText('Nội dung chỉ thuộc phiên cũ.')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({
        language: 'vi',
        mode: 'normal',
      }))
    })
    expect(mockWorkerKaelChatService.create.mock.calls.at(-1)?.[0]).not.toHaveProperty('job_id')
    expect(screen.queryByTestId('worker-v5-kael-orb-empty-session')).toBeNull()
    expect(screen.queryByText('Cuộc trò chuyện mới. Hãy gửi tin nhắn đầu tiên cho Kael.')).toBeNull()
    expect(screen.queryByText('Nội dung chỉ thuộc phiên cũ.')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-normal-thread')).toBeNull()

    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Tin nhắn đầu tiên của phiên mới')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-new',
        expect.objectContaining({ message: 'Tin nhắn đầu tiên của phiên mới' }),
        expect.any(Object),
      )
    })
    expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
  })

  it('refuses a Kael orb photo attach without an active work session', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)
    expect(screen.queryByTestId('worker-v5-kael-orb-camera')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-send-arrow')).toBeOnTheScreen()
    const imagePicker = jest.requireMock('expo-image-picker')
    expect(imagePicker.launchImageLibraryAsync).not.toHaveBeenCalled()
  })

  it('opens Kael job intake from the work board without losing the current opportunity', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-opportunity-kael-action'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake')
    })
  })

  it('retires map and schedule deep links from the mandatory jobs workflow', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '1.4-smart-schedule' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-schedule-support-aura-group')).toBeNull()
  })

  it('uses the compact completion seal and one static status marker while awaiting customer confirmation', () => {
    buildWorkflow({ deal: buildCompletedByWorkerDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-nine-prototype')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-nine-hero')).toBeOnTheScreen()
    expect(screen.getByText('Đã gửi hồ sơ')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-nine-status-list')).toHaveTextContent(/Đang chờ/)
  })

  it('shows the server-owned provisional settlement before payment starts', () => {
    const deal = buildCompletedByWorkerDeal()
    deal.finalPrice = 800_000
    Object.assign(deal.broadcast!, { estimatedEarning: 680_000 })
    buildWorkflow({ deal })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-nine-status-list')).toBeOnTheScreen()
    expect(screen.getByText('2 mục')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-nine-status-list')).toHaveTextContent(/Đang chờ/)
    expect(screen.queryByText(/800\.000/)).toBeNull()
    expect(screen.queryByText(/680\.000/)).toBeNull()
  })

  it('uses the approved full-screen stage with generic system copy when no completion record exists', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-nine-empty')).toBeOnTheScreen()
    expect(screen.getByText('Chưa có hồ sơ đã gửi')).toBeOnTheScreen()
    expect(screen.getByText('Mọi công việc tuyệt vời\nđều bắt đầu từ một hồ sơ.')).toBeOnTheScreen()
    expect(screen.queryByText(/NestScout/i)).toBeNull()
    expect(screen.queryByTestId('worker-v5-stage-nine-status-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-back')).toBeNull()

    await act(async () => {
      fireEvent.press(screen.getByTestId('worker-v5-stage-nine-empty-submit'))
    })
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('ns_worker_screen=2.10-completion-evidence'))
  })

  it('does not record payment or unlock settlement from completion confirmation alone', () => {
    buildWorkflow({ deal: buildConfirmedCompletionDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-nine-status-list')).not.toHaveTextContent('Đã ghi nhận')
    expect(screen.getByTestId('worker-v5-completion-submitted-next-action')).toBeDisabled()
    fireEvent.press(screen.getByTestId('worker-v5-completion-submitted-next-action'))
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.12-case-closed')
  })

  it('keeps the status marker static and the legacy direct-payment receipt read-only', () => {
    buildWorkflow({ deal: buildCompletedByWorkerDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }
    const pending = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-nine-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-nine-status-list')).toBeOnTheScreen()
    pending.unmount()

    buildWorkflow({ deal: buildDirectWorkerConfirmationDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }
    const confirmed = render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-v5-completion-direct-payment-action')).toBeNull()
    expect(screen.queryByTestId('worker-v5-completion-direct-payment-problem')).toBeNull()
    expect(screen.getByText('Chờ nền tảng đối soát')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-submitted-next-action')).toBeDisabled()
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.12-case-closed')
    fireEvent.press(screen.getByTestId('worker-v5-completion-submitted-next-action'))
    expect(mockWorkerConfirmCashPayment).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.12-case-closed')
    confirmed.unmount()

    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-stage-ten-prototype')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-ten-summary-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-case-closed-title')).toBeNull()
  })

  it('keeps the legacy payment pending without restoring a worker acknowledgement mutation', () => {
    buildWorkflow({ deal: buildDirectWorkerConfirmationDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-completion-direct-payment-problem')).toBeNull()
    expect(screen.getByText('Chờ nền tảng đối soát')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-completion-submitted-next-action'))
    expect(mockWorkerConfirmCashPayment).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.12-case-closed')
  })

  it('preserves the reconciliation error and support code without enabling legacy payment', () => {
    buildWorkflow({ deal: buildDirectWorkerConfirmationDeal() })
    mockWorkflowValue.state.lastError = 'Chưa thể tải lại trạng thái thanh toán. Mã hỗ trợ: A1B2C3D4.'
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)

    expect(screen.getByText('Chưa thể tải lại trạng thái thanh toán. Mã hỗ trợ: A1B2C3D4.')).toBeOnTheScreen()
  })

  it('opens the payment-received stage from a real recorded payment', () => {
    buildWorkflow({ deal: buildSettledCaseDeal(), workerEarnings: buildSettledCaseEarnings() })
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-eleven-payment-confirmed')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-stage-ten-prototype')).toBeNull()
    expect(screen.getByTestId('worker-v5-stage-eleven-amount')).toHaveTextContent(/340\.000/)
  })

  it('removes the requested home, jobs, earnings, and settings header utilities', () => {
    buildWorkflow()

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-home-production-surface')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-home-header')).toBeNull()
    expect(screen.queryByTestId('worker-v5-home-notifications')).toBeNull()
    home.unmount()

    mockRouteParams = {}
    const jobs = render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-opportunity-header-icon')).toBeNull()
    expect(screen.queryByTestId('worker-v5-opportunity-filter')).toBeNull()
    jobs.unmount()

    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.queryByTestId('worker-v5-opportunity-header-icon')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-filter')).toBeNull()
    earnings.unmount()

    mockRouteParams = { ns_worker_screen: '5.10-support-settings' }
    const settings = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-header-icon-5.10-support-settings')).toBeNull()
    expect(screen.getByTestId('worker-v5-settings-screen')).toBeOnTheScreen()
    settings.unmount()
  })

  it('removes the requested Worker profile header sub-headlines while keeping each surface available', () => {
    buildWorkflow()

    const profileScreens = [
      ['5.4-reliability-insights', 'Chỉ số có thể kiểm chứng, không phải cảm tính'],
      ['5.5-account-utilities', 'Tài khoản, ứng dụng, quyền riêng tư và hỗ trợ'],
      ['5.6-agent-memory-preferences', 'Kael nhớ có kiểm soát, bạn có thể tắt bất kỳ lúc nào'],
      ['5.10-support-settings', 'Tài khoản, ứng dụng, quyền riêng tư và hỗ trợ'],
      ['5.11-worker-availability', 'Bật hoặc tắt nhận yêu cầu mới phù hợp với bạn'],
    ] as const

    profileScreens.forEach(([screenId, subtitle]) => {
      mockRouteParams = { ns_worker_screen: screenId }
      const view = render(<WorkerProfileSurface />)

      expect(screen.getByTestId(`worker-v5-screen-${screenId}`)).toBeOnTheScreen()
      expect(screen.queryByText(subtitle)).toBeNull()
      view.unmount()
    })
  })

  it('removes duplicate Earnings headings while preserving the dashboard', () => {
    buildWorkflow()

    const overview = render(<WorkerEarningsSurface />)

    expect(screen.queryByTestId('worker-v5-earnings-overview-title')).toBeNull()
    expect(screen.queryByTestId('worker-v5-income-dashboard-title')).toBeNull()
    expect(screen.getByTestId('worker-v5-earnings-dashboard')).toBeOnTheScreen()
    overview.unmount()

    render(<WorkerRebuildDockOverlay active="earnings" />)
    expect(within(screen.getByTestId('worker-v5-dock-earnings')).getByText('Thu nhập')).toBeOnTheScreen()
  })

  it('removes every Worker header info icon without removing the primary navigation', () => {
    buildWorkflow()

    const profileOverview = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.1-profile-overview')).toBeNull()
    profileOverview.unmount()

    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    const ranking = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.2-worker-ranking')).toBeNull()
    ranking.unmount()

    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    const skills = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.3-skills-service-area')).toBeNull()
    skills.unmount()

    mockRouteParams = { ns_worker_screen: '5.4-reliability-insights' }
    const reliability = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.4-reliability-insights')).toBeNull()
    reliability.unmount()

    buildWorkflow({ canWorkerAdvance: true, deal: buildRepairingDeal() })
    mockRouteParams = { tab: 'active' }
    render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-case-flow-info')).toBeNull()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
  })

  it('routes the public worker wrapper to the restored Worker V5 sections', () => {
    buildWorkflow()

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.1-worker-home')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-home-production-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-home-production-quick-actions')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-home-scroll')).toBeNull()
    home.unmount()

    mockRouteParams = {}
    const jobs = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-page-customer-mint-aura')).toBeOnTheScreen()
    jobs.unmount()

    const chat = render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-page-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-orb-page-zip-mint-aura')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-composer-frame')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-orb-composer-mint-aura')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-normal')).toBeOnTheScreen()
    chat.unmount()

    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-screen-4.1-earnings-overview')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-dashboard')).toBeOnTheScreen()
    earnings.unmount()

    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-screen-5.1-profile-overview')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-avatar-picker')).toBeOnTheScreen()
    profile.unmount()
  })

  it('keeps the approved profile identity card grounded in real worker data', async () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        active_minutes: 90,
        avatar_url: 'https://storage.example.test/signed/worker-avatar.jpg',
        last_active_at: '2026-07-13T14:30:00.000Z',
      }),
    })

    render(<WorkerProfileSurface />)

    expect(screen.queryByTestId('worker-v5-profile-title')).toBeNull()
    expect(screen.getAllByText('Hồ sơ thợ')).toHaveLength(1)
    expect(screen.getByTestId('worker-v5-profile-header-name')).toHaveTextContent('Worker Test')
    expect(screen.getByTestId('worker-v5-profile-identity-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-profile-identity-formula-mint-aura')).toBeNull()
    ;['professional', 'schedule', 'settings', 'account'].forEach((groupId) => {
      expect(screen.getByTestId(`worker-v5-profile-group-${groupId}-surface-formula-mint-aura`)).toHaveStyle({ opacity: 0.5 })
    })
    expect(screen.getByTestId('worker-v5-profile-avatar-image').props.source).toEqual({
      uri: 'https://storage.example.test/signed/worker-avatar.jpg',
    })
    expect(screen.queryByText('Đã duyệt')).toBeNull()
    expect(screen.queryByText('Chưa có đánh giá')).toBeNull()
    expect(screen.queryByText('Chưa có việc')).toBeNull()
    expect(screen.queryByText('Sẵn sàng nhận việc')).toBeNull()
  })

  it('lets the worker choose a real avatar without requesting library permission', async () => {
    buildWorkflow()
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{
        fileName: 'worker.jpg',
        fileSize: 1234,
        mimeType: 'image/jpeg',
        uri: 'file:///worker.jpg',
      }],
    })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const library = buttons?.find((button) => button.text === 'Chọn từ thư viện')
      void library?.onPress?.()
    })

    try {
      render(<WorkerProfileSurface />)
      fireEvent.press(screen.getByTestId('worker-v5-profile-avatar-picker'))

      await waitFor(() => {
        expect(mockWorkerUploadAvatar).toHaveBeenCalledWith({
          fileName: 'worker.jpg',
          fileSizeBytes: 1234,
          mimeType: 'image/jpeg',
          uri: 'file:///worker.jpg',
        })
      })
      expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1)
      expect(imagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalled()
    } finally {
      alertSpy.mockRestore()
    }
  })

  it('opens the real image library directly from the avatar button in web Preview', async () => {
    const originalPlatform = Platform.OS
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
    const alertSpy = jest.spyOn(Alert, 'alert')

    try {
      buildWorkflow()
      const imagePicker = jest.requireMock('expo-image-picker')
      imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] })

      render(<WorkerProfileSurface />)
      fireEvent.press(screen.getByTestId('worker-v5-profile-avatar-picker'))

      await waitFor(() => {
        expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1)
      })
      expect(imagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
    } finally {
      alertSpy.mockRestore()
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
    }
  })

  it('keeps Worker V5 route params, language params, and money-impacting screens explicit', () => {
    buildWorkflow({ canWorkerAdvance: true, deal: buildRepairingDeal() })
    mockRouteParams = { ns_worker_lang: 'en' }

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityLabel).toBe('Toggle work availability')
    home.unmount()

    mockRouteParams = { tab: 'active' }

    const active = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-2.7-in-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
    active.unmount()

    mockRouteParams = { ns_audit_surface: 'worker_scope_change' }
    const scope = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-2.8-scope-change')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-scope-change-hero')).toBeNull()
    expect(screen.getByTestId('worker-v5-stage-six-primary-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
    scope.unmount()

    mockRouteParams = { ns_payment_step: 'wallet' }
    const ledger = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-screen-4.2-ledger-detail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-transaction-history')).toBeOnTheScreen()
    ledger.unmount()
  })

  it('keeps final-work handoffs on the dock section owned by their target screen', () => {
    expect(resolveWorkerV5DockActive('/jobs', { ns_worker_screen: '4.2-ledger-detail' })).toBe('earnings')
    expect(resolveWorkerV5DockActive('/jobs', { ns_worker_screen: '5.2-worker-ranking' })).toBe('profile')
    expect(resolveWorkerV5DockActive('/jobs', {})).toBe('jobs')
  })

  it('moves the dock pill to earnings when a closed-case handoff retains the prior jobs tab', () => {
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerRebuildDockOverlay active="jobs" />)

    expect(screen.getByTestId('worker-v5-dock-earnings').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-dock-jobs').props.accessibilityState).toMatchObject({ selected: false })
  })

  it('renders the approved earnings dashboard with real period controls and utilities', () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-dashboard')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-chart')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-period-month').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('620.000đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-withdrawn-value')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-fee-value')).toHaveTextContent('120.000đ')
    expect(screen.getByTestId('worker-v5-earnings-utility-history')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-utility-account')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-utility-commission')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-income-dashboard-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-income-dashboard-background')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-income-dashboard-orb')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-income-dashboard-notifications')).toBeNull()
    expect(screen.getByTestId('worker-v5-earnings-metric-available-value')).toHaveTextContent('1.200.000đ')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-scroll').props.contentContainerStyle)).toMatchObject({
      paddingBottom: 0,
      paddingHorizontal: 0,
      paddingTop: 0,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-production-content').props.style)).toMatchObject({
      backgroundColor: '#FFFFFF',
      gap: 14,
      paddingBottom: 158,
      paddingHorizontal: 29,
      paddingTop: 16,
    })
    expect(screen.getByTestId('worker-v5-earnings-production-background')).toBeOnTheScreen()
    expect(screen.queryByText('Quản lý thu nhập')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-transactions')).toBeNull()
    expect(screen.queryByText('Sau phí nền tảng')).toBeNull()
    expect(screen.queryByText('Số dư đã ghi có trên ứng dụng')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-earnings-period-day'))
    expect(screen.getByTestId('worker-v5-earnings-period-day').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('400.000đ')

    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-history'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.2-ledger-detail&ns_worker_earnings_period=month')
  })

  it('uses the Production Salary surface even when the retired Prototype query is present', () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_prototype: 'worker-salary-rebuild-v1',
      ns_worker_screen: '4.1-earnings-overview',
    }

    const overview = render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-dashboard')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-income-dashboard-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('620.000đ')
    expect(screen.queryByTestId('worker-salary-redesign-prototype')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-earnings-period-day'))
    expect(screen.getByTestId('worker-v5-earnings-period-day').props.accessibilityState).toMatchObject({ selected: true })
    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-history'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.2-ledger-detail&ns_audit_role=worker&ns_worker_earnings_period=month')

    overview.unmount()
    mockReplace.mockClear()
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_prototype: 'worker-salary-rebuild-v1',
      ns_worker_screen: '4.5-commission-policy',
    }
    render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-commission-policy')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-salary-redesign-commission')).toBeNull()
  })

  it.each([
    ['4.2-ledger-detail', 'worker-v5-transaction-history'],
    ['4.3-payout-request', 'worker-v5-payout-request'],
    ['4.4-payout-method', 'worker-v5-bank-account-form'],
    ['4.5-commission-policy', 'worker-v5-commission-policy'],
  ] as const)('renders the isolated Salary %s section', (ns_worker_screen, testID) => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_prototype: 'worker-salary-rebuild-v1',
      ns_worker_screen,
    }

    const view = render(<WorkerEarningsSurface />)

    expect(screen.getByTestId(testID)).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-salary-redesign-prototype')).toBeNull()
    view.unmount()
  })

  it('removes page-level mint aura from Earnings sections while preserving card formulas', () => {
    buildWorkflow()

    for (const ns_worker_screen of ['4.1-earnings-overview', '4.2-ledger-detail', '4.3-payout-request', '4.4-payout-method', '4.5-commission-policy'] as const) {
      mockRouteParams = { ns_worker_screen }
      const surface = render(<WorkerEarningsSurface />)

      expect(screen.queryByTestId('worker-v5-earnings-page-customer-mint-aura')).toBeNull()
      expect(screen.queryByTestId('worker-v5-earnings-page-customer-zip-mint-aura')).toBeNull()
      expect(screen.queryByTestId('worker-v5-earnings-page-lower-mint-aura')).toBeNull()
      surface.unmount()
    }

    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    render(<WorkerEarningsSurface />)

    expect(screen.queryByTestId('worker-v5-earnings-dashboard-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-period-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-utilities-formula-mint-aura')).toBeNull()
  })

  it('shows a customer payment claim as pending reconciliation without inventing income', () => {
    buildWorkflow({
      workerEarnings: {
        ...buildNoEarnings(),
        pending_payment_amount: 1_031_050,
        pending_payment_count: 1,
      },
    })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-amount')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-available-value')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-pending-value')).toHaveTextContent('1.031.050đ')
    expect(screen.queryByText('1 khoản khách đã báo thanh toán, đang chờ đối soát')).toBeNull()
  })

  it('uses Navigation line icons for the rebuilt utilities', () => {
    buildWorkflow({ workerEarnings: buildNoEarnings() })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-utility-history-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-utility-account-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-utility-commission-icon')).toBeOnTheScreen()
  })

  it('opens focused earnings routes for history, account, commission policy, and payout request', () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerEarningsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-income-dashboard-orb-withdraw'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.3-payout-request&ns_worker_earnings_period=month')
    expect(screen.queryByTestId('worker-v5-earnings-withdraw-action')).toBeNull()
    mockReplace.mockClear()

    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-history'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.2-ledger-detail&ns_worker_earnings_period=month')
    mockReplace.mockClear()

    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-account'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.4-payout-method&ns_worker_earnings_period=month')
    mockReplace.mockClear()

    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-commission'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.5-commission-policy&ns_worker_earnings_period=month')

  })

  it('distinguishes pending earnings from a hydrated zero ledger', () => {
    buildWorkflow({ workerEarnings: null })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    const pending = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).not.toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-withdrawn-value')).not.toHaveTextContent('0đ')
    expect(screen.queryByText('Chưa có số liệu chi trả')).toBeNull()
    for (const period of ['day', 'week', 'month', 'year'] as const) {
      fireEvent.press(screen.getByTestId(`worker-v5-earnings-period-${period}`))
      expect(screen.getByTestId('worker-v5-earnings-metric-withdrawn-value')).not.toHaveTextContent('0đ')
    }
    expect(screen.getByTestId('worker-v5-earnings-metric-fee-value')).not.toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-available-value')).not.toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-chart').props.accessibilityLabel).toBe('Đang tải biểu đồ thu nhập')
    expect(screen.getByTestId('worker-v5-earnings-chart').props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.queryByText('Đang tải dữ liệu thu nhập…')).toBeNull()
    expect(screen.queryByText('Chờ dữ liệu thật')).toBeNull()
    expect(screen.queryByText('Biểu đồ chỉ dùng số liệu đã đối soát.')).toBeNull()
    pending.unmount()

    buildWorkflow({ workerEarnings: buildNoEarnings() })
    render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-fee-value')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-available-value')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-earnings-chart').props.accessibilityLabel).toBe('Biểu đồ thu nhập chưa phát sinh trong kỳ đã chọn')
    expect(screen.getByTestId('worker-v5-earnings-chart').props.accessibilityState).toMatchObject({ busy: false })
  })

  it('replaces loading and zero values when real earnings arrive', () => {
    buildWorkflow({ workerEarnings: null })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    const view = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).not.toHaveTextContent('0đ')

    buildWorkflow({ workerEarnings: buildNoEarnings() })
    view.rerender(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('0đ')

    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    view.rerender(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('620.000đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-fee-value')).toHaveTextContent('120.000đ')
  })

  it('shows a retryable earnings error without presenting unavailable money as zero', async () => {
    buildWorkflow({ workerEarnings: null, workerEarningsError: 'Không thể tải thông tin thu nhập.' })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-error')).toHaveTextContent(/Chưa thể tải thông tin thu nhập/)
    expect(screen.getByTestId('worker-v5-earnings-retry')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('Chưa có dữ liệu')
    expect(screen.getByTestId('worker-v5-earnings-chart').props.accessibilityState).toMatchObject({ busy: false })

    await act(async () => {
      fireEvent.press(screen.getByTestId('worker-v5-earnings-retry'))
    })
    expect(mockWorkerRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows a simple transaction history without the retired ledger sections', () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: '4.2-ledger-detail' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-transaction-history')).toBeOnTheScreen()
    expect(screen.getByText('NS-WORK-001')).toBeOnTheScreen()
    expect(screen.getByText('+352.000đ')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-ledger-hero')).toBeNull()
    expect(screen.queryByTestId('worker-v5-ledger-breakdown')).toBeNull()
    expect(screen.queryByTestId('worker-v5-ledger-trace')).toBeNull()
    expect(screen.queryByTestId('worker-v5-ledger-payout-action')).toBeNull()
    expect(screen.queryByTestId('worker-v5-bank-account-form')).toBeNull()
    expect(screen.queryByTestId('worker-v5-commission-policy')).toBeNull()
  })

  it.each([
    '4.2-ledger-detail',
    '4.3-payout-request',
    '4.4-payout-method',
    '4.5-commission-policy',
  ] as const)('returns %s directly to the earnings overview', (detailScreen) => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: detailScreen }

    render(<WorkerEarningsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-back'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.1-earnings-overview&ns_worker_earnings_period=month')
  })

  it('opens the withdrawal request screen only from the orb action on the earnings overview', () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerEarningsSurface />)
    const withdrawAction = screen.getByTestId('worker-v5-income-dashboard-orb-withdraw')
    expect(screen.queryByTestId('worker-v5-earnings-withdraw-action')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-withdrawal-area')).toBeNull()
    expect(screen.queryByText('Tạo yêu cầu rút tiền')).toBeNull()
    fireEvent.press(withdrawAction)
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.3-payout-request&ns_worker_earnings_period=month')
  })

  it('submits a manual withdrawal request only after a verified receiving account and valid amount are present', async () => {
    buildWorkflow({
      workerEarnings: buildSettledEarnings(),
      workerPayoutMethod: {
        id: 'payout-method-1',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
        bank_account_masked: '**** 6789',
        status: 'verified',
        reviewed_at: '2026-08-08T03:00:00.000Z',
        updated_at: '2026-08-08T03:00:00.000Z',
      },
    })
    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-payout-request')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-payout-request-formula-mint-aura')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-request').props.style)).toMatchObject({
      backgroundColor: '#FFFFFF',
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-balance-block').props.style)).toMatchObject({
      backgroundColor: '#FFFFFF',
    })
    expect(screen.getByText('Techcombank · **** 6789')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-submit').props.accessibilityState).toMatchObject({ disabled: true })

    fireEvent.changeText(screen.getByTestId('worker-v5-payout-amount-input'), '250000')
    expect(screen.getByTestId('worker-v5-payout-submit').props.accessibilityState).toMatchObject({ disabled: false })
    fireEvent.press(screen.getByTestId('worker-v5-payout-submit'))

    await waitFor(() => {
      expect(mockWorkerRequestWithdrawal).toHaveBeenCalledWith(expect.objectContaining({ amount_vnd: 250000 }))
    })
    expect(await screen.findByText(/Yêu cầu rút tiền đã được ghi nhận/)).toBeOnTheScreen()
  })

  it('keeps withdrawal disabled and offers retry when earnings cannot be loaded', async () => {
    buildWorkflow({ workerEarnings: null, workerEarningsError: 'Không thể tải thông tin thu nhập.' })
    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-payout-error')).toHaveTextContent(/Chưa thể tải thông tin thu nhập/)
    expect(screen.getByTestId('worker-v5-payout-available-balance')).toHaveTextContent('Chưa có dữ liệu')
    expect(screen.getByTestId('worker-v5-payout-submit').props.accessibilityState).toMatchObject({ disabled: true })

    await act(async () => {
      fireEvent.press(screen.getByTestId('worker-v5-payout-retry'))
    })
    expect(mockWorkerRefresh).toHaveBeenCalledTimes(1)
  })

  it('keeps only bank selection and confirmation on the receiving account route', async () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-bank-account-form')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-receiving-account-formula-mint-aura')).toBeNull()
    expect(screen.getByTestId('worker-v5-bank-logo-frame-vietcombank')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-bank-logo-frame-vietcombank').props.style)).toMatchObject({
      height: 38,
      width: 78,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-bank-confirm-spacing').props.style)).toMatchObject({ marginTop: 14 })
    expect(screen.getByTestId('worker-v5-bank-confirm-action').props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.queryByTestId('worker-v5-payout-method-hero')).toBeNull()
    expect(screen.queryByTestId('worker-v5-payout-limit-policy')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-bank-option-techcombank'))
    fireEvent.changeText(screen.getByTestId('worker-v5-bank-holder-input'), 'PHAN MANH TU')
    fireEvent.changeText(screen.getByTestId('worker-v5-bank-account-input'), '123456789')
    fireEvent.changeText(screen.getByTestId('worker-v5-bank-account-confirm-input'), '123456789')
    expect(screen.getByTestId('worker-v5-bank-confirm-action').props.accessibilityState).toMatchObject({ disabled: false })

    fireEvent.press(screen.getByTestId('worker-v5-bank-confirm-action'))
    await waitFor(() => {
      expect(mockWorkerSavePayoutMethod).toHaveBeenCalledWith({
        account_holder_name: 'PHAN MANH TU',
        bank_account: '123456789',
        bank_key: 'techcombank',
      })
    })
    expect(await screen.findByText('Hiện chưa thể lưu tài khoản. Thông tin của bạn chưa bị thay đổi.')).toBeOnTheScreen()
  })

  it('uses the recorded payout bank by default without overriding a new worker choice', () => {
    buildWorkflow({
      workerEarnings: buildSettledEarnings(),
      workerPayoutMethod: {
        id: 'payout-method-1',
        bank_key: 'vietcombank',
        bank_name: 'Vietcombank',
        bank_account_masked: '**** 6789',
        status: 'verified',
        reviewed_at: '2026-08-08T03:00:00.000Z',
        updated_at: '2026-08-08T03:00:00.000Z',
      },
    })
    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-bank-option-vietcombank').props.accessibilityState).toMatchObject({ selected: true })
    fireEvent.press(screen.getByTestId('worker-v5-bank-option-bidv'))
    expect(screen.getByTestId('worker-v5-bank-option-bidv').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-bank-option-vietcombank').props.accessibilityState).toMatchObject({ selected: false })
  })

  it('keeps every captured Worker card icon distinct from the other captured card contexts', () => {
    const sources = Object.values(workerV5CapturedIconAssets)

    expect(sources).toHaveLength(34)
    expect(new Set(sources).size).toBe(sources.length)
  })

  it('wires distinct line icons into the grouped profile and earnings utilities', () => {
    buildWorkflow({ workerEarnings: buildNoEarnings() })
    mockRouteParams = {}

    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-row-services-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-row-reliability-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-row-schedule-icon')).toBeOnTheScreen()
    for (const rowID of [
      'services',
      'ranking',
      'reliability',
      'reviews',
      'verification',
      'schedule',
      'notifications',
      'settings',
      'memory',
      'support',
      'policies',
      'sign-out',
      'delete-account',
    ]) {
      const frameStyle = StyleSheet.flatten(screen.getByTestId(`worker-v5-profile-${rowID === 'sign-out' || rowID === 'delete-account' ? rowID : `row-${rowID}`}-icon-frame`).props.style)
      expect(frameStyle).toMatchObject({ height: 24, width: 24 })
      expect(frameStyle.backgroundColor).toBeUndefined()
      expect(frameStyle.borderWidth).toBeUndefined()
    }
    profile.unmount()

    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-utility-history-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-utility-account-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-utility-commission-icon')).toBeOnTheScreen()
  })

  it('groups professional, schedule, app, and account controls without the retired dossier panels', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        active_service_types: ['plumbing', 'electrical', 'cleaning'],
        selected_service_types: ['plumbing', 'electrical', 'cleaning'],
        service_types: ['plumbing', 'electrical', 'cleaning'],
      }),
    })
    mockRouteParams = {}

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-profile-group-professional')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-group-schedule')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-group-settings')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-group-account')).toBeOnTheScreen()
    ;['professional', 'schedule', 'settings', 'account'].forEach((groupId) => {
      expect(screen.getByTestId(`worker-v5-profile-group-${groupId}-surface-formula-mint-aura`)).toHaveStyle({ opacity: 0.5 })
    })
    expect(screen.getByTestId('worker-v5-profile-row-services').props.accessibilityLabel).toContain('3 dịch vụ')
    expect(screen.getByTestId('worker-v5-profile-row-reliability').props.accessibilityLabel).toContain('Chưa có dữ liệu')
    expect(screen.getByTestId('worker-v5-profile-row-schedule')).toHaveTextContent(/Trạng thái nhận việc/)
    expect(screen.queryByText('Bật hoặc tắt nhận yêu cầu mới phù hợp với bạn.')).toBeNull()
    expect(screen.queryByText('Tài khoản, ứng dụng, quyền riêng tư và hỗ trợ.')).toBeNull()
    expect(screen.getByTestId('worker-v5-profile-sign-out')).toHaveTextContent(/Đăng xuất/)
    expect(screen.getByTestId('worker-v5-profile-delete-account')).toHaveTextContent(/Xóa tài khoản/)
  })

  it('keeps every approved worker profile control on its existing route', () => {
    buildWorkflow()
    mockRouteParams = {}

    const overview = render(<WorkerProfileSurface />)
    const routes = [
      ['ranking', '5.2-worker-ranking'],
      ['reliability', '5.4-reliability-insights'],
      ['reviews', '5.9-reviews-feedback'],
      ['verification', '5.7-verification-documents'],
      ['notifications', '5.12-worker-notifications'],
      ['memory', '5.6-agent-memory-preferences'],
      ['support', '5.13-worker-support'],
      ['policies', '5.14-worker-policies'],
    ] as const

    for (const [rowID, screenID] of routes) {
      fireEvent.press(screen.getByTestId(`worker-v5-profile-row-${rowID}`))
      expect(mockReplace).toHaveBeenLastCalledWith(`/(worker)/profile?ns_worker_screen=${screenID}`)
      mockReplace.mockClear()
    }

    overview.unmount()
  })

  it('keeps ranking and reliability sections connected in both directions', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }

    const ranking = render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))
    expect(mockReplace).toHaveBeenLastCalledWith('/(worker)/profile?ns_worker_screen=5.4-reliability-insights')
    ranking.unmount()

    mockReplace.mockClear()
    mockRouteParams = { ns_worker_screen: '5.4-reliability-insights' }
    const reliability = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-primary-action')).toHaveTextContent('Quay lại xếp hạng')
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))
    expect(mockReplace).toHaveBeenLastCalledWith('/(worker)/profile?ns_worker_screen=5.2-worker-ranking')
    reliability.unmount()
  })

  it('opens the grouped availability control and keeps the existing worker mutation', async () => {
    buildWorkflow({ workerProfile: buildWorkerProfile({ is_available: false }) })
    mockRouteParams = {}

    const overview = render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-profile-row-schedule'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.11-worker-availability')
    overview.unmount()

    mockRouteParams = { ns_worker_screen: '5.11-worker-availability' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-schedule-screen')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))
    await waitFor(() => expect(mockWorkerUpdateAvailability).toHaveBeenCalledWith(true))
  })

  it('opens the real worker registration path instead of leaving an inactive mock switch', () => {
    buildWorkflow({ workerJobsHydrated: false, workerProfile: null })
    mockRouteParams = { ns_worker_screen: '5.11-worker-availability' }

    const schedule = render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-availability-open-registration')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-availability-switch')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-availability-open-registration'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.7-verification-documents')
    schedule.unmount()

    mockRouteParams = { ns_worker_screen: '5.7-verification-documents' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-registration-form')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-registration-title-icon')).toBeOnTheScreen()
    expect(screen.getByText('Dùng thông tin, giấy tờ thật. Hồ sơ được kiểm tra trước khi nhận việc.')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-registration-submit'))
    expect(screen.getByTestId('worker-v5-registration-error')).toHaveTextContent(/Nhập họ tên hợp lệ/)
    screen.unmount()

    buildWorkflow({
      workerJobsHydrated: false,
      workerProfile: buildWorkerProfile({ is_approved: false, verification_status: 'draft' }),
    })
    mockRouteParams = { ns_worker_screen: '5.11-worker-availability' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-availability-open-registration')).toBeOnTheScreen()
  })

  it('removes the bank and tax route and its verification CTA without touching payout settings', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '5.7-verification-documents' }

    const verification = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-screen-5.7-verification-documents')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-verification-hero')).toBeOnTheScreen()
    expect(screen.queryByText('Xem ngân hàng và thuế')).toBeNull()
    expect(screen.queryByTestId('worker-v5-bank-tax-hero')).toBeNull()
    verification.unmount()

    mockRouteParams = { ns_worker_screen: '5.8-bank-tax-center' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-screen-5.1-profile-overview')).toBeOnTheScreen()
    expect(screen.queryByText('Ngân hàng và thuế')).toBeNull()
    screen.unmount()
  })

  it('keeps sign-out inside the grouped profile and routes settings utilities to real surfaces', async () => {
    buildWorkflow()
    mockRouteParams = {}
    const overview = render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-profile-sign-out'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    overview.unmount()

    mockRouteParams = { ns_worker_screen: '5.10-support-settings' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-settings-group-account-security')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-group-app')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-group-privacy')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-group-help')).toBeOnTheScreen()
    for (const rowTestID of [
      'worker-v5-settings-account',
      'worker-v5-settings-password',
      'worker-v5-settings-language',
      'worker-v5-settings-appearance',
      'worker-v5-settings-notifications',
      'worker-v5-settings-memory',
      'worker-v5-settings-support',
      'worker-v5-settings-policy',
    ]) {
      expect(StyleSheet.flatten(screen.getByTestId(`${rowTestID}-icon`).props.style)).toMatchObject({
        backgroundColor: glass.bg,
        borderWidth: 1,
        height: 46,
        width: 46,
      })
    }
    fireEvent.press(screen.getByTestId('worker-v5-settings-notifications'))
    expect(mockReplace).toHaveBeenLastCalledWith('/(worker)/profile?ns_worker_screen=5.12-worker-notifications&ns_worker_lang=vi')
  })

  it('requires acknowledgement and the exact phrase before submitting account deletion', () => {
    buildWorkflow()
    mockRouteParams = {}

    const overview = render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-profile-delete-account'))
    expect(mockReplace).toHaveBeenLastCalledWith('/(worker)/profile?ns_worker_screen=5.15-worker-delete-account')
    overview.unmount()

    mockRouteParams = { ns_worker_screen: '5.15-worker-delete-account' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-delete-account-screen')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-delete-account-icon-frame').props.style)).toMatchObject({
      backgroundColor: color.surface.base,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-delete-account-warning').props.style)).toMatchObject({
      backgroundColor: color.surface.base,
    })
    const submit = screen.getByTestId('worker-v5-delete-account-submit')
    expect(submit).toBeDisabled()

    fireEvent.press(screen.getByTestId('worker-v5-delete-account-acknowledgement'))
    expect(submit).toBeDisabled()
    fireEvent.changeText(screen.getByTestId('worker-v5-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    expect(submit).not.toBeDisabled()
    expect(screen.queryByTestId('worker-v5-delete-account-open-support')).toBeNull()
  })

  it('reads recorded notifications and keeps support and policy routes usable', async () => {
    const notification = {
      body: 'Công việc cần được xem lại.',
      created_at: '2026-08-15T03:00:00.000Z',
      event_type: 'job_update',
      id: 'notification_test_1',
      job_id: 'job_test_1',
      read_at: null,
      status: 'unread',
      title: 'Cập nhật công việc',
    }
    buildWorkflow({ notificationUnreadCount: 1, notifications: [notification] })
    mockRouteParams = { ns_worker_screen: '5.12-worker-notifications' }

    const notifications = render(<WorkerProfileSurface />)
    await waitFor(() => expect(mockRefreshNotifications).toHaveBeenCalled())
    fireEvent.press(screen.getByTestId('worker-v5-notification-notification_test_1'))
    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalledWith('notification_test_1'))
    expect(mockReplace).toHaveBeenLastCalledWith('/(worker)/jobs?job_id=job_test_1')
    notifications.unmount()

    mockRouteParams = { ns_worker_screen: '5.13-worker-support' }
    const support = render(<WorkerProfileSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-support-jobs-icon').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 1,
      height: 46,
      width: 46,
    })
    expect(screen.getByTestId('worker-v5-support-jobs-icon-glyph').props).toMatchObject({ height: 24, width: 24 })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-support-kael-icon').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 1,
      height: 46,
      width: 46,
    })
    fireEvent.press(screen.getByTestId('worker-v5-support-jobs'))
    expect(mockReplace).toHaveBeenLastCalledWith('/(worker)/jobs')
    fireEvent.press(screen.getByTestId('worker-v5-support-kael'))
    expect(mockReplace).toHaveBeenLastCalledWith('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal&ns_worker_lang=vi&ns_worker_return_to=worker-support')
    support.unmount()

    mockRouteParams = { ns_worker_screen: '5.14-worker-policies' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-policy-work-body')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-policy-work-icon-frame').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 1,
      height: 46,
      width: 46,
    })
    expect(screen.getByTestId('worker-v5-policy-work-icon').props).toMatchObject({ height: 24, width: 24 })
    expect(screen.queryByTestId('worker-v5-policies-formula-mint-aura')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-policy-money'))
    expect(screen.getByTestId('worker-v5-policy-money-body')).toBeOnTheScreen()
  })

  it('uses the rebuilt workart quick-action grid without restoring the retired dossier card', () => {
    expect(WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY).toBe(1.4)

    buildWorkflow({ deal: buildIncomingDeal(), workerEarnings: buildNoEarnings() })
    mockRouteParams = {}

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-home-production-quick-actions')).toBeOnTheScreen()
    for (const action of ['jobs', 'schedule', 'earnings', 'profile']) {
      expect(screen.getByTestId(`worker-home-production-action-${action}`)).toBeOnTheScreen()
    }
    home.unmount()

    const profile = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-identity-formula-mint-aura')).toBeNull()
    expect(screen.getByTestId('worker-v5-profile-group-professional-surface-formula-mint-aura')).toHaveStyle({ opacity: 0.5 })
    expect(screen.getByTestId('worker-v5-profile-group-professional')).toBeOnTheScreen()
    profile.unmount()

    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.queryByTestId('worker-v5-earnings-dashboard-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-period-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-utilities-formula-mint-aura')).toBeNull()
    earnings.unmount()

    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }
    const payoutRequest = render(<WorkerEarningsSurface />)
    expect(screen.queryByTestId('worker-v5-payout-request-formula-mint-aura')).toBeNull()
    payoutRequest.unmount()

    mockRouteParams = { ns_worker_screen: '4.5-commission-policy' }
    const commissionPolicy = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-commission-policy-formula-mint-aura')).toBeOnTheScreen()
    commissionPolicy.unmount()

    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    const receivingAccount = render(<WorkerEarningsSurface />)
    expect(screen.queryByTestId('worker-v5-receiving-account-formula-mint-aura')).toBeNull()
    receivingAccount.unmount()

    mockRouteParams = {}
    const opportunity = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toBeOnTheScreen()
    opportunity.unmount()

    buildWorkflow({ deal: buildArrivedDeal() })
    mockRouteParams = { ns_worker_screen: '2.7-in-progress', ns_arrival_gate: '1' }
    const activeRoute = render(<WorkerJobsSurface />)
    ;[0, 1, 2].forEach((index) => {
      expect(screen.getByTestId(`worker-v5-info-cell-ActiveRoute-formula-mint-aura-${index}`)).toBeOnTheScreen()
    })
    activeRoute.unmount()

    buildWorkflow({ deal: buildRepairingDeal() })
    mockRouteParams = { ns_audit_surface: 'worker_scope_change' }
    const scopeChange = render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-progress-rail-formula-mint-aura')).toBeNull()
    scopeChange.unmount()

    buildWorkflow({ deal: buildCompletedByWorkerDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }
    const submitted = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-completion-submitted-background-mint-aura')).toBeOnTheScreen()
    submitted.unmount()

    buildWorkflow({ deal: buildConfirmedCompletionDeal() })
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-ten-summary-list')).toBeOnTheScreen()
  })

  it('keeps the Formula Mint card identity with an opaque Reduce Transparency fallback', () => {
    render(
      <WorkerV5FormulaMintCardAura
        reduceTransparency
        scope="ReduceTransparencyProbe"
        testID="worker-v5-formula-mint-card-reduce-transparency"
      />,
    )

    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-formula-mint-card-reduce-transparency').props.style)).toMatchObject({
      backgroundColor: '#EFFAF7',
    })
  })

  it('renders contextual guidance across the captured Worker card clusters', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = {}

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-home-production-opportunities')).toHaveTextContent(/Việc phù hợp cho bạn/)
    home.unmount()

    const jobs = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toHaveTextContent(/Ngay/)
    jobs.unmount()

    buildWorkflow({ workerEarnings: buildNoEarnings() })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-chart').props.accessibilityLabel).toBe('Biểu đồ thu nhập chưa phát sinh trong kỳ đã chọn')
    expect(screen.getByTestId('worker-v5-income-dashboard-orb-withdraw')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-utility-history')).toBeOnTheScreen()
    earnings.unmount()

    mockRouteParams = { ns_worker_screen: '4.5-commission-policy' }
    const commissionPolicy = render(<WorkerEarningsSurface />)
    expect(screen.queryByText('Mức khởi điểm 15%')).toBeNull()
    expect(screen.getByText(/Thưởng thay cho giảm phí/)).toBeOnTheScreen()
    expect(screen.queryByText(/Bậc hiện tại/)).toBeNull()
    commissionPolicy.unmount()

    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    const receivingAccount = render(<WorkerEarningsSurface />)
    expect(screen.getByText('Chọn ngân hàng')).toBeOnTheScreen()
    expect(screen.getByText('Thông tin tài khoản')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-account-form')).toBeOnTheScreen()
    receivingAccount.unmount()

    buildWorkflow({ deal: buildConfirmedCompletionDeal() })
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    const closedCase = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-stage-ten-summary-list')).toBeOnTheScreen()
    closedCase.unmount()

    buildWorkflow({
      workerProfile: buildWorkerProfile({
        active_service_types: ['plumbing', 'electrical', 'cleaning'],
        districts: ['quan_1', 'quan_binh_thanh'],
        selected_service_types: ['plumbing', 'electrical', 'cleaning'],
        service_types: ['plumbing', 'electrical', 'cleaning'],
      }),
    })
    mockRouteParams = {}
    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-row-reliability')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-row-services').props.accessibilityLabel).toContain('3 dịch vụ')
    profile.unmount()

    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    const skills = render(<WorkerProfileSurface />)
    expect(screen.queryByText('Chỉ hiển thị dữ liệu sử dụng trực tiếp trong workflow.')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-skills-hero-copy').props.style)).toMatchObject({ justifyContent: 'center' })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-skills-service-count').props.style)).toMatchObject({ fontSize: 17 })
    expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('3 / 6 dịch vụ')
    expect(screen.getByTestId('worker-v5-skills-hero-detail')).toBeOnTheScreen()
    for (const iconFrameID of [
      'worker-v5-service-form-intro-icon-frame',
      'worker-v5-quick-action-0-icon-frame',
      'worker-v5-quick-action-1-icon-frame',
      'worker-v5-quick-action-2-icon-frame',
      'worker-v5-service-area-summary-icon',
    ]) {
      const iconFrameStyle = StyleSheet.flatten(screen.getByTestId(iconFrameID).props.style)
      expect(iconFrameStyle).toMatchObject({ height: 24, width: 24 })
      expect(iconFrameStyle.backgroundColor).toBeUndefined()
      expect(iconFrameStyle.borderWidth).toBeUndefined()
    }
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-service-card-detail-0').props.style)).toMatchObject({
      alignItems: 'flex-start',
      flexDirection: 'column',
    })
    expect(screen.getByTestId('worker-v5-service-area-detail')).toBeOnTheScreen()
    skills.unmount()

    mockRouteParams = { ns_worker_screen: '5.4-reliability-insights' }
    const reliability = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-reliability-status')).toBeNull()
    expect(screen.getByTestId('worker-v5-reliability-axis-detail-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-reliability-score')).not.toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-reliability-stat-completion-value')).not.toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('worker-v5-reliability-stat-arrival-value')).not.toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('worker-v5-reliability-axis-meta-0')).not.toHaveTextContent(/0\/100/)
    expect(screen.getByTestId('worker-v5-reliability-axis-score-0')).not.toHaveTextContent(/^0\/100$/)
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    reliability.unmount()

    mockRouteParams = { ns_worker_screen: '5.5-account-utilities' }
    const settings = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-settings-group-account-security')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-group-app')).toBeOnTheScreen()
    settings.unmount()

    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-ranking-title')).toHaveTextContent('Chưa có điểm xếp hạng')
    expect(screen.getByTestId('worker-v5-ranking-score')).not.toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-ranking-stat-value-0')).toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-ranking-stat-value-1')).not.toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-ranking-stat-value-2')).not.toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-status')).not.toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-detail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-improvement-detail-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-3')).toHaveTextContent('Phản hồi trong công việc')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-4')).toHaveTextContent('Xử lý phát sinh minh bạch')
    expect(screen.getByTestId('worker-v5-ranking-improvement-meta-3')).toHaveTextContent('Chờ khách đánh giá sau khi công việc hoàn tất')
    expect(screen.getByTestId('worker-v5-ranking-improvement-meta-4')).toHaveTextContent('Mỗi phát sinh chỉ tính khi Kael và khách đã chốt')
  })

  it('preserves zero performance values when they came from real worker insights', () => {
    buildWorkflow({
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        on_time_rate_percent: 0,
        performance_axes: [
          { id: 'arrival', score: 0 },
          { id: 'completion', score: 0 },
          { id: 'rating', score: 0 },
        ],
        performance_score: 0,
      }),
    })

    mockRouteParams = {}
    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-row-reliability').props.accessibilityLabel).toContain('0/100')
    profile.unmount()

    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    const ranking = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-ranking-score')).toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-ranking-stat-value-0')).toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-ranking-stat-value-1')).toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-ranking-stat-value-2')).toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-status')).toHaveTextContent(/^0$/)
    ranking.unmount()

    mockRouteParams = { ns_worker_screen: '5.4-reliability-insights' }
    render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-reliability-status')).toBeNull()
    expect(screen.getByTestId('worker-v5-reliability-score')).toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-reliability-stat-completion-value')).toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('worker-v5-reliability-stat-arrival-value')).toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('worker-v5-reliability-axis-meta-0')).toHaveTextContent(/0\/100/)
    expect(screen.getByTestId('worker-v5-reliability-axis-score-0')).toHaveTextContent(/^0\/100$/)
  })

  it('waits for the worker profile instead of inventing zero active skills', () => {
    buildWorkflow({ workerProfile: null })

    mockRouteParams = {}
    const overview = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-header-name')).toHaveTextContent('Chờ hồ sơ')
    expect(screen.getByTestId('worker-v5-profile-row-services').props.accessibilityLabel).toContain('Chưa chọn')
    overview.unmount()

    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-skills-service-count')).not.toHaveTextContent(/^0/)
    expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('Chờ hồ sơ')
    expect(screen.getByTestId('worker-v5-skills-hero-detail')).toHaveTextContent(/Đã lưu/)
    expect(screen.getByTestId('worker-v5-quick-action-empty-title')).toHaveTextContent('Chờ dữ liệu kỹ năng')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-quick-action-empty-icon').props.style)).toMatchObject({
      height: 24,
      width: 24,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-quick-action-empty-icon').props.style).borderWidth).toBeUndefined()
  })

  it('lets a worker select multiple supported services beyond the legacy hardcoded list', async () => {
    let resolveSave: ((saved: boolean) => void) | undefined
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        active_service_types: ['electrical'],
        selected_service_types: ['electrical'],
        service_types: ['electrical'],
      }),
    })
    mockWorkerUpdateServicePreferences.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      resolveSave = resolve
    }))
    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }

    render(<WorkerProfileSurface />)

    expect(screen.getByText('Chỉ ghép việc cho dịch vụ đã chọn và đủ điều kiện chất lượng.')).toBeTruthy()
    expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('1 / 6 dịch vụ')
    expect(screen.getByTestId('worker-v5-skills-hero-detail')).toHaveTextContent(/Đã lưu/)
    expect(screen.getByTestId('worker-v5-quick-action-0').props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByTestId('worker-v5-quick-action-1').props.accessibilityState).toMatchObject({ checked: false })
    fireEvent.press(screen.getByTestId('worker-v5-quick-action-0'))
    expect(screen.getByText('Giữ ít nhất 1 dịch vụ.')).toBeTruthy()
    fireEvent.press(screen.getByTestId('worker-v5-quick-action-1'))

    expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('2 / 6 dịch vụ')
    expect(screen.getByTestId('worker-v5-skills-hero-detail')).toHaveTextContent(/Chưa lưu/)

    fireEvent.press(screen.getByTestId('worker-v5-service-preferences-save'))

    await waitFor(() => {
      expect(mockWorkerUpdateServicePreferences).toHaveBeenCalledWith({
        selected_service_types: ['electrical', 'plumbing'],
      })
    })
    expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('2 / 6 dịch vụ')
    expect(screen.getByTestId('worker-v5-skills-hero-detail')).toHaveTextContent(/Đang lưu/)

    resolveSave?.(true)

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('2 / 6 dịch vụ')
      expect(screen.getByTestId('worker-v5-skills-hero-detail')).toHaveTextContent(/Đã lưu/)
      expect(screen.getByTestId('worker-v5-service-preferences-save').props.accessibilityState).toMatchObject({
        disabled: true,
      })
    })
  })

  it('keeps a low-quality service selected but blocks matching and explains the temporary lock', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        active_service_types: ['plumbing'],
        selected_service_types: ['electrical', 'plumbing'],
        service_quality: [{
          average_rating: 3.67,
          locked_until: '2026-08-06T12:00:00.000Z',
          review_count: 3,
          service_type: 'electrical',
          status: 'quality_locked',
        }],
      }),
    })
    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-quick-action-0').props.accessibilityState).toMatchObject({
      checked: true,
      disabled: true,
    })
    expect(screen.getByTestId('worker-v5-quick-action-0')).toHaveTextContent(/Tạm khóa/)
    expect(screen.getByTestId('worker-v5-service-quality-notice-electrical')).toHaveTextContent(
      /3 đánh giá/,
    )
  })

  it('localizes worker account mutation errors in the selected English mode', async () => {
    mockAppLanguage = 'en'
    mockRouteParams = { ns_worker_lang: 'en', ns_worker_screen: '5.10-support-settings' }
    mockUpdateCustomerProfile.mockResolvedValueOnce({
      error: 'Thông tin hồ sơ chưa hợp lệ.',
      success: false,
    })
    mockUpdatePassword.mockResolvedValueOnce({
      error: 'Mật khẩu hiện tại không đúng.',
      success: false,
    })

    render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-settings-account'))
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-account-name-input'), 'Worker Test')
    fireEvent.press(screen.getByTestId('worker-v5-settings-account-save'))
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-settings-account-message')).toHaveTextContent('Check the profile details.')
    })
    expect(screen.getByTestId('worker-v5-settings-account-message')).not.toHaveTextContent(/Thông tin|hồ sơ/)

    fireEvent.press(screen.getByTestId('worker-v5-settings-password'))
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-current-input'), 'old-password')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-new-input'), 'new-password')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-confirm-input'), 'new-password')
    fireEvent.press(screen.getByTestId('worker-v5-settings-password-save'))
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-settings-password-message')).toHaveTextContent('The current password is incorrect.')
    })
    expect(screen.getByTestId('worker-v5-settings-password-message')).not.toHaveTextContent(/Mật khẩu/)
  })

  it('serializes worker settings writes and releases each control after rejection', async () => {
    mockRouteParams = { ns_worker_screen: '5.10-support-settings' }
    let rejectAccount!: (reason?: unknown) => void
    let rejectPassword!: (reason?: unknown) => void
    mockUpdateCustomerProfile.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectAccount = reject
    }))
    mockUpdatePassword.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectPassword = reject
    }))

    render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-settings-account'))
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-account-name-input'), 'Worker Test')
    const accountButton = screen.getByTestId('worker-v5-settings-account-save')
    let accountPressTarget: typeof accountButton | null = accountButton
    while (accountPressTarget && typeof accountPressTarget.props.onPress !== 'function') {
      accountPressTarget = accountPressTarget.parent
    }
    expect(accountPressTarget).not.toBeNull()
    const pressAccountSave = accountPressTarget?.props.onPress as (() => void)

    act(() => {
      pressAccountSave()
      pressAccountSave()
    })

    expect(mockUpdateCustomerProfile).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectAccount(new Error('network unavailable'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-settings-account-message')).toHaveTextContent(/Không thể lưu thay đổi/)
      expect(accountButton).not.toBeDisabled()
    })

    fireEvent.press(screen.getByTestId('worker-v5-settings-password'))
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-current-input'), 'old-password')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-new-input'), 'new-password')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-confirm-input'), 'new-password')
    const passwordButton = screen.getByTestId('worker-v5-settings-password-save')
    let passwordPressTarget: typeof passwordButton | null = passwordButton
    while (passwordPressTarget && typeof passwordPressTarget.props.onPress !== 'function') {
      passwordPressTarget = passwordPressTarget.parent
    }
    expect(passwordPressTarget).not.toBeNull()
    const pressPasswordSave = passwordPressTarget?.props.onPress as (() => void)

    act(() => {
      pressPasswordSave()
      pressPasswordSave()
    })

    expect(mockUpdatePassword).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectPassword(new Error('network unavailable'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-settings-password-message')).toHaveTextContent(/Dịch vụ tài khoản chưa sẵn sàng/)
      expect(passwordButton).not.toBeDisabled()
    })
  })

  it('rolls a worker memory switch back when the backend rejects the preference', async () => {
    mockRouteParams = { ns_worker_screen: '5.6-agent-memory-preferences' }

    render(<WorkerProfileSurface />)

    const areaPreference = await screen.findByTestId('worker-v5-memory-permission-list-row-0')
    await waitFor(() => {
      expect(areaPreference.props.accessibilityState).toMatchObject({ checked: true })
    })
    fireEvent.press(areaPreference)

    await waitFor(() => {
      expect(mockUpdateMyWorkerPreference).toHaveBeenCalledWith({
        enabled: false,
        key: 'area_preference',
      })
    })
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({
        busy: false,
        checked: true,
      })
    })
  })

  it('keeps each worker memory switch on after the backend confirms the write', async () => {
    mockRouteParams = { ns_worker_screen: '5.6-agent-memory-preferences' }
    mockUpdateMyWorkerPreference.mockImplementation((input: { key: string; enabled: boolean }) => Promise.resolve({
      data: { memory: { safe_metadata: { memory_preferences: { [input.key]: input.enabled } } } },
      status: 200,
      success: true,
    }))

    render(<WorkerProfileSurface />)

    const switchCases = [
      ['worker-v5-memory-permission-list-row-0', 'area_preference'],
      ['worker-v5-memory-permission-list-row-1', 'travel_limit'],
      ['worker-v5-memory-permission-list-row-2', 'skill_preference'],
      ['worker-v5-memory-boundary-list-row-0', 'opportunity_filter'],
      ['worker-v5-memory-boundary-list-row-1', 'auto_accept_work'],
    ] as const

    for (const [testID, key] of switchCases) {
      const memorySwitch = await screen.findByTestId(testID)
      const nextEnabled = !Boolean(memorySwitch.props.accessibilityState?.checked)
      fireEvent.press(memorySwitch)
      await waitFor(() => {
        expect(mockUpdateMyWorkerPreference).toHaveBeenLastCalledWith({
          enabled: nextEnabled,
          key,
        })
        expect(screen.getByTestId(testID).props.accessibilityState).toMatchObject({
          busy: false,
          checked: nextEnabled,
        })
      })
    }
  })

  it('starts only one worker memory update when a switch is pressed twice in one render', async () => {
    mockRouteParams = { ns_worker_screen: '5.6-agent-memory-preferences' }
    let resolveUpdate!: (value: { error: string; status: number; success: false }) => void
    mockUpdateMyWorkerPreference.mockImplementationOnce(() => new Promise((resolve) => {
      resolveUpdate = resolve
    }))

    render(<WorkerProfileSurface />)

    const areaPreference = await screen.findByTestId('worker-v5-memory-permission-list-row-0')
    await waitFor(() => {
      expect(areaPreference.props.accessibilityState).toMatchObject({ checked: true })
    })
    let pressTarget: typeof areaPreference | null = areaPreference
    while (pressTarget && typeof pressTarget.props.onPress !== 'function') {
      pressTarget = pressTarget.parent
    }
    expect(pressTarget).not.toBeNull()
    const pressMemorySwitch = pressTarget?.props.onPress as (() => void)

    act(() => {
      pressMemorySwitch()
      pressMemorySwitch()
    })

    expect(mockUpdateMyWorkerPreference).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveUpdate({ error: 'not saved', status: 503, success: false })
    })
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({
        busy: false,
        checked: true,
      })
    })
  })

  it('does not surface a failed Kael response after the worker switches jobs', async () => {
    let rejectFirstJobTurn: (reason?: unknown) => void = () => undefined
    mockWorkerKaelChatService.streamTurn.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectFirstJobTurn = reject
    }))
    buildWorkflow({ deal: buildAcceptedDealForJob('job_test_1') })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }
    const view = render(<WorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Kiểm tra việc đầu tiên')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
    await waitFor(() => expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1))

    buildWorkflow({ deal: buildAcceptedDealForJob('job_test_2') })
    view.rerender(<WorkerChatSurface />)
    await act(async () => {
      rejectFirstJobTurn(new Error('old job failed'))
      await Promise.resolve()
    })

    expect(screen.queryByText('Kael đang không kết nối được. Không có hành động nào được ghi vào việc.')).toBeNull()
    expect(screen.queryByText('Kiểm tra việc đầu tiên')).toBeNull()
  })

  it('starts a clean scope-change draft when the active job changes', () => {
    buildWorkflow({ deal: buildAcceptedDealForJob('job_scope_a') })
    mockRouteParams = { ns_scope_mode: 'edit', ns_worker_screen: '2.8-scope-change' }
    const view = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-price-total-value')).not.toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-price-total-value')).toHaveTextContent(/Kael/)
    fireEvent.changeText(screen.getByTestId('worker-scope-change-new-description-input'), 'Dây điện của việc A đã cháy ở ổ cắm.')
    fireEvent.changeText(screen.getByTestId('worker-scope-change-reason-input'), 'Việc A cần thay thêm dây do quá nhiệt.')

    buildWorkflow({ deal: buildAcceptedDealForJob('job_scope_b') })
    view.rerender(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-scope-change-new-description-input').props.value).toBe('')
    expect(screen.getByTestId('worker-scope-change-reason-input').props.value).toBe('')
  })

  it('serializes service-area writes and releases the save control after rejection', async () => {
    buildWorkflow({ workerProfile: buildWorkerProfile({ id: 'worker_a', districts: ['quan_1'] }) })
    let rejectSave!: (reason?: unknown) => void
    mockWorkerUpdateServiceArea.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectSave = reject
    }))
    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    render(<WorkerProfileSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-service-area-open-card'))
    fireEvent.changeText(screen.getByTestId('worker-v5-service-area-draft-input'), 'Bình Thạnh')
    const saveButton = screen.getByTestId('worker-v5-service-area-save-inline')
    let savePressTarget: typeof saveButton | null = saveButton
    while (savePressTarget && typeof savePressTarget.props.onPress !== 'function') {
      savePressTarget = savePressTarget.parent
    }
    expect(savePressTarget).not.toBeNull()
    const pressSave = savePressTarget?.props.onPress as (() => void)

    act(() => {
      pressSave()
      pressSave()
    })

    expect(mockWorkerUpdateServiceArea).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectSave(new Error('network unavailable'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByText('Chưa đồng bộ được. Khu vực vừa nhập vẫn đang chờ lưu.')).toBeOnTheScreen()
      expect(saveButton).not.toBeDisabled()
    })
  })

  it('ignores an old service-area save result after the profile owner changes', async () => {
    buildWorkflow({ workerProfile: buildWorkerProfile({ id: 'worker_a', districts: ['quan_1'] }) })
    let resolveFirstProfileSave: (saved: boolean) => void = () => undefined
    mockWorkerUpdateServiceArea.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      resolveFirstProfileSave = resolve
    }))
    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    const view = render(<WorkerProfileSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-service-area-open-card'))
    fireEvent.changeText(screen.getByTestId('worker-v5-service-area-draft-input'), 'Bình Thạnh')
    fireEvent.press(screen.getByTestId('worker-v5-service-area-save-inline'))
    expect(mockWorkerUpdateServiceArea).toHaveBeenCalledWith({ districts: ['binh_thanh'] })

    buildWorkflow({ workerProfile: buildWorkerProfile({ id: 'worker_b', districts: ['quan_7'] }) })
    view.rerender(<WorkerProfileSurface />)
    await act(async () => {
      resolveFirstProfileSave(false)
      await Promise.resolve()
    })

    expect(screen.queryByText('Chưa đồng bộ được với NestScout. Khu vực vừa nhập vẫn đang chờ lưu.')).toBeNull()
  })
})

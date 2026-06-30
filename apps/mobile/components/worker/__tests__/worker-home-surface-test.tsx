import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { StyleSheet } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'
import { LOCAL_WORKFLOW_PRICE_DISCLAIMER } from '@nestscout/shared'
import { color } from '@/design/theme'
import type { EarningsResponse, WorkerJobListResponse, WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'
import { uploadJobMediaDrafts } from '@/lib/media-upload'

let mockWorkflowValue: any
let mockAuthRole: 'admin' | 'customer' | 'worker'
let mockSignOut: jest.Mock
let mockUpdateCustomerProfile: jest.Mock
let mockUpdatePassword: jest.Mock
let mockWorkerUpdateAvailability: jest.Mock
let mockWorkerUpdateServiceArea: jest.Mock
let mockWorkerSavePayoutMethod: jest.Mock
let mockPathname: string
let mockRouteParams: Record<string, string | string[] | undefined>
let mockAppLanguage = 'vi'
let mockGlassAccessibility = { reduceMotion: false, reduceTransparency: false }
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()
const mockWorkerKaelChatService = {
  create: jest.fn(),
  get: jest.fn(),
  getTrainingConsent: jest.fn(),
  list: jest.fn(),
  sendTurn: jest.fn(),
  setTrainingConsent: jest.fn(),
  streamTurn: jest.fn(),
  submitFeedback: jest.fn(),
}
const mockKaelMemoryService = {
  getMyWorkerMemory: jest.fn(),
  updateMyWorkerPreference: jest.fn(),
}
const mockPlacesAutocomplete = jest.fn()
const mockPlacesResolve = jest.fn()
const mockUploadJobMediaDrafts = uploadJobMediaDrafts as jest.MockedFunction<typeof uploadJobMediaDrafts>

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

jest.mock('expo-router', () => ({
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
        email: 'worker@example.com',
        id: 'worker_test_1',
        user_metadata: {
          contact_email: 'worker@example.com',
          full_name: 'Tran Minh Tuan',
          phone_number: '0901234567',
        },
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

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(async () => ({
    mediaRefs: [
      'supabase://job-media/11111111-1111-4111-8111-111111111111/kael_reference/burnt-wire.jpg',
      'supabase://job-media/11111111-1111-4111-8111-111111111111/kael_reference/old-socket.jpg',
    ],
    success: true,
  })),
}))

jest.mock('@/lib/services', () => ({
  kaelMemoryService: {
    getMyWorkerMemory: (...args: unknown[]) => mockKaelMemoryService.getMyWorkerMemory(...args),
    updateMyWorkerPreference: (...args: unknown[]) => mockKaelMemoryService.updateMyWorkerPreference(...args),
  },
  placesService: {
    autocomplete: (...args: unknown[]) => mockPlacesAutocomplete(...args),
    resolve: (...args: unknown[]) => mockPlacesResolve(...args),
  },
  workerService: {
    savePayoutMethod: (...args: unknown[]) => mockWorkerSavePayoutMethod(...args),
  },
  workerKaelChatService: {
    create: (...args: unknown[]) => mockWorkerKaelChatService.create(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatService.get(...args),
    getTrainingConsent: (...args: unknown[]) => mockWorkerKaelChatService.getTrainingConsent(...args),
    list: (...args: unknown[]) => mockWorkerKaelChatService.list(...args),
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

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => mockGlassAccessibility,
}))

import {
  WorkerChatSurface,
  WorkerDockLayoutProvider,
  WorkerEarningsSurface,
  WorkerHomeSurface,
  WorkerJobsSurface,
  WorkerProfileSurface,
  WorkerRebuildDockOverlay,
} from '../worker-surfaces'
import { WorkerChatSurface as RebuildWorkerChatSurface } from '../../rebuild/rebuild-surfaces'

describe('WorkerV5 typography contract', () => {
  it('uses the customer base font family without extra-heavy worker weights', () => {
    const source = readFileSync(join(__dirname, '../worker-v5-flow.tsx'), 'utf8')

    expect(source).toContain('fontFamily: typography.fontFamily')
    expect(source.match(/<RNText/g) ?? []).toHaveLength(1)
    expect(source).not.toMatch(/fontWeight:\s*['"](800|900)['"]/)
  })
})

describe('WorkerV5 customer mint aura contract', () => {
  it('reuses the customer fulfillment aura formula for Stage 2.7 instead of local guessed opacity layers', () => {
    const customerSource = readFileSync(join(__dirname, '../../customer/v21/surfaces.tsx'), 'utf8')
    const workerSource = readFileSync(join(__dirname, '../worker-v5-flow.tsx'), 'utf8')
    const customerFormulaTokens = [
      'stopColor="#F2FBF8"',
      'stopColor="#E7F7F3"',
      'stopColor="rgba(73,232,210,0.33)"',
      'stopColor="rgba(255,255,255,0.83)"',
      'stopColor="rgba(250,255,253,0.65)"',
      'stopColor="rgba(77,231,209,0.25)"',
      'stopColor="rgba(75,214,201,0.17)"',
    ]

    for (const token of customerFormulaTokens) {
      expect(customerSource).toContain(token)
      expect(workerSource).toContain(token)
    }
    expect(workerSource).toContain('WorkerV5CustomerFulfillmentCanvasAura')
    expect(workerSource).toContain('WorkerV5SourceCardSkin')
    expect(workerSource).toContain('WorkerV5CustomerCaseWorkCardAura')
    expect(workerSource).not.toContain('timerCardFocusAura')
    expect(workerSource).not.toContain('evidencePickerAura')
  })
})

function buildWorkerProfile(overrides: Partial<WorkerProfileResponse> = {}): WorkerProfileResponse {
  return {
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
    legal_name: 'Worker Test',
    problem_specializations: [],
    rating: 0,
    service_radius_km: 8,
    service_types: ['electrical'],
    total_jobs: 0,
    verification_status: 'approved',
    years_experience: 3,
    ...overrides,
  }
}

function buildNoEarnings(): EarningsResponse {
  return {
    daily_earnings: [],
    from_date: null,
    gross_earnings: 0,
    net_earnings: 0,
    pending_payment_amount: 0,
    pending_payment_count: 0,
    platform_fee_total: 0,
    to_date: null,
    total_jobs_paid: 0,
    worker_id: 'worker_test_1',
  }
}

function buildIncomingDeal(): LocalDeal {
  return {
    broadcast: {
      broadcastId: 'broadcast_test_1',
      estimatedEarningLabel: '120.000đ - 180.000đ',
      estimatedPriceLabel: '150.000đ - 240.000đ',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 1',
      jobId: 'job_test_1',
      prebrief: ['Kael đã tóm tắt phạm vi trước khi thợ nhận việc.'],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: 42,
      serviceType: 'electrical',
      status: 'sent',
    },
    draft: {
      addressLabel: 'Đường Nguyễn Huệ, Quận 1',
      description: 'Ổ cắm chập chờn',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm/công tắc hỏng'],
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
    broadcast: deal.broadcast ? { ...deal.broadcast, status: 'accepted' } : null,
    status: 'worker_matched',
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

function buildInspectingDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    status: 'inspecting',
  }
}

function buildInspectingDealWithReleasedAddress(): LocalDeal {
  const deal = buildInspectingDeal()
  return {
    ...deal,
    broadcast: deal.broadcast
      ? {
        ...deal.broadcast,
        fullAddressLabel: 'Tòa A, Nguyễn Huệ, Quận 1',
        fullAddressVisible: true,
      }
      : null,
  }
}

function buildRepairingDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    status: 'repairing',
  }
}

function buildRepairingDealWithKaelChecklist(): LocalDeal {
  const deal = buildRepairingDeal()
  return {
    ...deal,
    broadcast: deal.broadcast
      ? {
        ...deal.broadcast,
        prebrief: [
          'Kael checklist: Ngắt nguồn aptomat khu vực ổ cắm trước khi thao tác.',
          'Kael checklist: Kiểm tra bút thử điện và dụng cụ cách điện.',
          'Kael checklist: Chụp ảnh hiện trạng trước/sau để đối soát.',
        ],
      }
      : null,
  }
}

function buildScopeChangePendingDeal(): LocalDeal {
  const deal = buildRepairingDeal()
  return {
    ...deal,
    estimate: {
      advisory: '',
      complexity: 'small',
      confidenceLabel: '82%',
      disclaimer: '',
      hasVndPrice: true,
      problemLabel: 'Ổ cắm/công tắc hỏng',
      priceRangeLabel: '150.000đ - 240.000đ',
    },
    scopeChange: {
      createdAt: '2026-06-11T08:00:00.000Z',
      evidencePhotoUrls: ['job-media/scope-1.jpg'],
      id: 'scope_1',
      kaelProgress: {
        current_stage: 'scope_estimating',
        progress: 1,
        status: 'completed',
        updated_at: '2026-06-11T08:01:00.000Z',
      },
      kaelReview: null,
      priceMax: 390000,
      priceMin: 300000,
      reason: 'Dây ổ cắm hở hoàn toàn',
      requestedDescription: 'Thay dây điện hỏng',
      status: 'waiting_customer_decision',
    },
    status: 'scope_change_pending',
  }
}

function buildConfirmedCompletionDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'confirmed_by_customer',
    completionNotes: 'Đã thay ổ cắm và kiểm tra tải.',
    completionPhotoUrls: ['job-media/after-1.jpg'],
    status: 'confirmed_by_customer',
  }
}

function buildCompletedByWorkerDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'completed_by_worker',
    completionNotes: 'Đã thay ổ cắm và kiểm tra tải.',
    completionPhotoUrls: ['job-media/after-1.jpg'],
    status: 'completed_by_worker',
  }
}

function buildPaymentPendingDeal(): LocalDeal {
  const deal = buildConfirmedCompletionDeal()
  return {
    ...deal,
    backendStatus: 'payment_pending',
  }
}

function buildWorkerPerformanceInsights(overrides: Partial<WorkerPerformanceInsightsResponse> = {}): WorkerPerformanceInsightsResponse {
  return {
    accepted_broadcast_count: 0,
    average_rating: null,
    average_response_minutes: null,
    badges: [
      { id: 'verified_profile', status: 'locked' },
      { id: 'fast_responder', status: 'locked' },
      { id: 'reliable_arrival', status: 'locked' },
      { id: 'trusted_by_customers', status: 'locked' },
      { id: 'steady_earner', status: 'locked' },
    ],
    completed_job_count: 0,
    on_time_job_count: 0,
    on_time_rate_percent: null,
    paid_job_count: 0,
    performance_axes: [
      { id: 'rating', score: null },
      { id: 'response', score: null },
      { id: 'arrival', score: null },
      { id: 'completion', score: null },
      { id: 'earnings', score: null },
    ],
    performance_score: null,
    reconciled_earnings_vnd: null,
    responded_broadcast_count: 0,
    response_rate_percent: null,
    review_count: 0,
    scheduled_arrival_job_count: 0,
    total_broadcast_count: 0,
    worker_id: 'worker_test_1',
    ...overrides,
  }
}

function buildWorkerScheduleJob(overrides: Partial<WorkerJobListResponse['jobs'][number]> = {}): WorkerJobListResponse['jobs'][number] {
  return {
    address_access: {
      access_profile: {},
      check_in_required: true,
      customer_handoff_required: false,
      evidence_mode: 'manual_photo',
      exact_unit_released: false,
      identity_check_required: false,
      release_stage: 'area_only',
    },
    address_building: null,
    address_floor: null,
    address_unit: null,
    completed_at: null,
    completion_notes: null,
    completion_photo_urls: [],
    created_at: '2026-06-04T08:00:00.000Z',
    display_code: null,
    district: 'quan_1',
    estimated_earning: null,
    final_price: null,
    id: 'job_schedule_default',
    matched_at: '2026-06-04T08:05:00.000Z',
    problem_summary: 'kiem tra viec that',
    service_type: 'electrical',
    status: 'worker_matched',
    worker_brief_guidance: null,
    ...overrides,
  }
}

function buildWorkflow({
  canWorkerAdvance = false,
  deal = null,
  workerEarnings = buildNoEarnings(),
  workerJobs = [],
  workerPerformanceInsights = null,
  workerProfile = buildWorkerProfile(),
}: {
  canWorkerAdvance?: boolean
  deal?: LocalDeal | null
  workerEarnings?: EarningsResponse | null
  workerJobs?: WorkerJobListResponse['jobs']
  workerPerformanceInsights?: WorkerPerformanceInsightsResponse | null
  workerProfile?: WorkerProfileResponse | null
} = {}) {
  mockWorkerUpdateAvailability = jest.fn(async () => true)
  mockWorkerUpdateServiceArea = jest.fn(async () => true)
  mockWorkflowValue = {
    actions: {
      requestScopeChange: jest.fn(async () => true),
      requestWorkerCancellation: jest.fn(async () => true),
      workerAcceptBroadcast: jest.fn(async () => true),
      workerDeclineBroadcast: jest.fn(async () => true),
      workerSavePayoutMethod: mockWorkerSavePayoutMethod,
      workerUpdateAvailability: mockWorkerUpdateAvailability,
      workerUpdateServiceArea: mockWorkerUpdateServiceArea,
      workerUpdateStatus: jest.fn(async () => true),
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
      workerGate: 'remote_backend',
    },
    workerEarnings,
    workerJobs,
    workerPerformanceInsights,
    workerProfile,
  }
}

function buildWorkerKaelProgress(progress = 1) {
  return {
    current_stage: 'worker_assist',
    failure_reason: null,
    progress,
    status: progress >= 1 ? 'completed' : 'running',
    updated_at: '2026-06-04T00:00:02.000Z',
  }
}

function buildWorkerKaelSession({
  jobId = 'job_test_1',
  progress = null,
  sessionId = 'worker-kael-session-1',
  totalTurns = 0,
}: {
  jobId?: string
  progress?: ReturnType<typeof buildWorkerKaelProgress> | null
  sessionId?: string
  totalTurns?: number
} = {}) {
  return {
    closed_at: null,
    id: sessionId,
    job_id: jobId,
    progress,
    started_at: '2026-06-04T00:00:00.000Z',
    status: 'active',
    total_turns: totalTurns,
  }
}

function buildWorkerKaelResponse({
  answer = 'Kael saved this advisory. Keep the next step inside the app.',
  jobId = 'job_test_1',
  message = 'Need advice',
  progress = buildWorkerKaelProgress(1),
  sessionId = 'worker-kael-session-1',
}: {
  answer?: string
  jobId?: string
  message?: string
  progress?: ReturnType<typeof buildWorkerKaelProgress> | null
  sessionId?: string
} = {}) {
  return {
    data: {
      session: buildWorkerKaelSession({ jobId, progress, sessionId, totalTurns: 2 }),
      turns: [
        {
          content_type: 'text',
          created_at: '2026-06-04T00:00:00.000Z',
          id: `turn-worker-${sessionId}`,
          media_refs: [],
          role: 'worker',
          session_id: sessionId,
          text_content: message,
          turn_index: 1,
        },
        {
          content_type: 'guidance',
          created_at: '2026-06-04T00:00:01.000Z',
          id: `turn-kael-${sessionId}`,
          media_refs: [],
          role: 'kael',
          session_id: sessionId,
          text_content: answer,
          turn_index: 2,
        },
      ],
    },
    status: 200,
    success: true,
  }
}

type WorkerV5LegacyReplacementScreenId = keyof typeof workerV5DefaultViText

function workerV5LegacyReplacementScreenId(title: string): WorkerV5LegacyReplacementScreenId {
  const lower = title.toLowerCase()
  if (lower.includes('map data') || lower.includes('missing worker map')) return '1.3-demand-map'
  if (lower.includes('dock') || lower.includes('readiness') || lower.includes('greets') || lower.includes('home screen') || lower.includes('suspended')) {
    return '1.1-worker-home'
  }
  if (lower.includes('payment gate') || lower.includes('wallet') || lower.includes('withdraw') || lower.includes('receiving method')) {
    return lower.includes('withdraw') ? '4.3-payout-request' : lower.includes('method') ? '4.4-payout-method' : '4.1-earnings-overview'
  }
  if (lower.includes('earnings tab') || lower.includes('payout reconciliation') || lower.includes('earnings section')) return '4.1-earnings-overview'
  if (lower.includes('legal name') || lower.includes('profile liquid') || lower.includes('trust signals')) return '5.1-profile-overview'
  if (lower.includes('level progress') || lower.includes('later worker rewards')) return '5.2-worker-ranking'
  if (lower.includes('reputation') || lower.includes('performance')) return '5.4-reliability-insights'
  if (lower.includes('verification form')) return '5.7-verification-documents'
  if (lower.includes('case closed')) return '2.12-case-closed'
  if (lower.includes('summary report') || lower.includes('job summary') || lower.includes('submitted artifact')) return '2.11-completion-submitted'
  if (lower.includes('completion')) return '2.10-completion-evidence'
  if (lower.includes('scope')) return lower.includes('approval') ? '2.9-approval-wait' : '2.8-scope-change'
  if (lower.includes('safety')) return '2.7-in-progress'
  if (lower.includes('active jobs') || lower.includes('full address') || lower.includes('confirmed work') || lower.includes('phase context')) return '2.7-in-progress'
  if (lower.includes('waiting') || lower.includes('request') || lower.includes('incoming')) return '2.1-opportunity-inbox'
  return '1.2-shift-brief'
}

function workerV5LegacyReplacementSurface(screenId: WorkerV5LegacyReplacementScreenId) {
  if (screenId === '1.1-worker-home') return <WorkerHomeSurface />
  if (screenId.startsWith('4.')) return <WorkerEarningsSurface />
  if (screenId.startsWith('5.')) return <WorkerProfileSurface />
  return <WorkerJobsSurface />
}

function workerV5LegacyReplacementPathname(screenId: WorkerV5LegacyReplacementScreenId) {
  if (screenId.startsWith('1.')) return screenId === '1.1-worker-home' ? '/(worker)/home' : '/(worker)/jobs'
  if (screenId.startsWith('4.')) return '/(worker)/earnings'
  if (screenId.startsWith('5.')) return '/(worker)/profile'
  return '/(worker)/jobs'
}

function workerV5LegacyReplacementWorkflow(title: string, screenId: WorkerV5LegacyReplacementScreenId) {
  const lower = title.toLowerCase()
  const workerProfile = lower.includes('map data') || lower.includes('missing worker map')
    ? buildWorkerProfile({ districts: [], home_lat: null, home_lng: null, service_radius_km: null })
    : lower.includes('legal name') || lower.includes('greets')
    ? buildWorkerProfile({ legal_name: '  Hoang   Minh  ' })
    : lower.includes('suspended')
      ? buildWorkerProfile({ is_available: true, is_suspended: true })
      : lower.includes('level') || lower.includes('reputation') || lower.includes('performance')
        ? buildWorkerProfile({ is_available: true, rating: 4.9, total_jobs: 24 })
        : buildWorkerProfile()
  const workerEarnings = screenId.startsWith('4.') || lower.includes('payment') || lower.includes('wallet')
    ? {
        ...buildNoEarnings(),
        daily_earnings: lower.includes('transaction') || lower.includes('reconciliation')
          ? [{ date: '2026-06-01', gross_earnings: 120000, net_earnings: 100000, paid_job_count: 1, platform_fee_total: 20000 }]
          : [],
        gross_earnings: lower.includes('reconciliation') ? 1350000 : 0,
        net_earnings: lower.includes('reconciliation') ? 1285000 : 0,
        pending_payment_amount: lower.includes('reconciliation') ? 350000 : 0,
        platform_fee_total: lower.includes('reconciliation') ? 65000 : 0,
        total_jobs_paid: lower.includes('reconciliation') ? 6 : 0,
      }
    : buildNoEarnings()
  const deal = screenId.startsWith('2.12')
    ? buildConfirmedCompletionDeal()
    : screenId.startsWith('2.11')
      ? buildCompletedByWorkerDeal()
      : screenId.startsWith('2.10')
        ? buildRepairingDeal()
        : screenId.startsWith('2.8') || screenId.startsWith('2.9')
          ? buildScopeChangePendingDeal()
            : screenId.startsWith('2.7')
            ? buildRepairingDealWithKaelChecklist()
            : screenId.startsWith('2.')
              ? buildIncomingDeal()
              : lower.includes('request') || lower.includes('readiness')
                ? buildIncomingDeal()
                : null

  return {
    canWorkerAdvance: true,
    deal,
    workerEarnings,
    workerPerformanceInsights: lower.includes('reputation') || lower.includes('performance')
      ? buildWorkerPerformanceInsights({ average_rating: 4.9, completed_job_count: 24, performance_score: 84, review_count: 18 })
      : null,
    workerProfile,
  }
}

async function expectCurrentWorkerV5LegacyReplacement(title: string) {
  const screenId = workerV5LegacyReplacementScreenId(title)
  mockPathname = workerV5LegacyReplacementPathname(screenId)
  mockRouteParams = screenId === '1.1-worker-home'
    ? {}
    : { ns_worker_screen: screenId }
  buildWorkflow(workerV5LegacyReplacementWorkflow(title, screenId))

  const view = render(workerV5LegacyReplacementSurface(screenId))

  expect(screen.getByTestId(`worker-v5-screen-${screenId}`)).toBeOnTheScreen()
  if (screenId === '2.12-case-closed') {
    expect(screen.queryByText(workerV5DefaultViText[screenId])).toBeNull()
    expect(screen.getByTestId('worker-v5-case-closed-title')).toBeOnTheScreen()
  } else {
    expect(screen.getAllByText(workerV5DefaultViText[screenId]).length).toBeGreaterThan(0)
  }
  expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
  expect(screen.queryByText('--')).toBeNull()
  expect(screen.queryByText(/MÃ¡y láº¡nh|Äiá»u hÃ²a|Air conditioner|camera|Vietcombank|4821|18\.920\.000|4\.8tr/i)).toBeNull()

  if (screenId === '1.1-worker-home') {
    expect(screen.getByTestId('worker-v5-availability-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-grid')).toBeOnTheScreen()
    if (title.toLowerCase().includes('suspended')) {
      expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
        checked: false,
        disabled: false,
      })
      fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))
      await waitFor(() => expect(mockWorkerUpdateAvailability).toHaveBeenCalledWith(false))
    }
  }
  if (screenId === '1.3-demand-map') {
    expect(screen.getByTestId('worker-v5-demand-map-panel')).toBeOnTheScreen()
    expect(screen.queryByText('8 km')).toBeNull()
  }
  if (screenId.startsWith('2.') && ![
    '2.1-opportunity-inbox',
    '2.2-offer-detail',
    '2.3-accept-review',
    '2.4-route-eta',
    '2.5-arrival-checkin',
    '2.7-in-progress',
    '2.8-scope-change',
    '2.9-approval-wait',
    '2.10-completion-evidence',
    '2.11-completion-submitted',
    '2.12-case-closed',
  ].includes(screenId)) {
    expect(screen.getByTestId('worker-v5-authority-card')).toHaveTextContent(/Ranh/)
  }
  if (screenId === '2.1-opportunity-inbox') {
    expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-inbox-tab-matches').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
  }
  if (screenId === '2.2-offer-detail') {
    expect(screen.getByTestId('worker-v5-offer-detail-summary-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
  }
  if (screenId === '2.3-accept-review') {
    expect(screen.getByTestId('worker-v5-accept-review-handoff')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
  }
  if (screenId === '2.7-in-progress') {
    expect(screen.getByTestId('worker-v5-in-progress-canvas-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
  }
  if ([
    '2.8-scope-change',
    '2.9-approval-wait',
    '2.10-completion-evidence',
  ].includes(screenId)) {
    expect(screen.getByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
  }
  if (screenId === '4.1-earnings-overview') {
    expect(screen.getByTestId('worker-v5-earnings-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-transactions')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
  }
  if (screenId === '4.2-ledger-detail') {
    expect(screen.getByTestId('worker-v5-ledger-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-breakdown')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-trace')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
  }
  if (screenId === '4.3-payout-request') {
    expect(screen.getByTestId('worker-v5-payout-request-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-amount-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-account-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
  }
  if (screenId.startsWith('4.') && ![
    '4.1-earnings-overview',
    '4.2-ledger-detail',
    '4.3-payout-request',
    '4.4-payout-method',
  ].includes(screenId)) {
    expect(screen.getByTestId('worker-v5-authority-card')).toHaveTextContent(/Ranh/)
  }
  if (screenId.startsWith('5.')) {
    if (screenId === '5.1-profile-overview') {
      expect(screen.getByTestId('worker-v5-worker-avatar')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-profile-dossier')).toBeOnTheScreen()
    }
    if (screenId === '5.2-worker-ranking') {
      expect(screen.getByTestId('worker-v5-ranking-hero')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-ranking-leaderboard')).toBeOnTheScreen()
    }
    if (screenId === '5.4-reliability-insights') {
      expect(screen.getByTestId('worker-v5-reliability-hero')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-reliability-components')).toBeOnTheScreen()
    }
    if (screenId === '5.5-account-utilities') {
      expect(screen.getByTestId('worker-v5-settings-hero')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-settings-list')).toBeOnTheScreen()
      expect(screen.queryByTestId('worker-v5-utility-grid')).toBeNull()
    }
    if (screenId === '5.7-verification-documents') {
      expect(screen.getByTestId('worker-v5-verification-hero')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-verification-checklist')).toBeOnTheScreen()
    }
  }

  view.unmount()
}

beforeEach(() => {
  jest.useRealTimers()
  mockAuthRole = 'worker'
  mockPathname = '/(worker)/home'
  mockRouteParams = {}
  mockSignOut = jest.fn(async () => undefined)
  mockUpdateCustomerProfile = jest.fn(async () => ({ success: true }))
  mockUpdatePassword = jest.fn(async () => ({ success: true }))
  mockWorkerSavePayoutMethod = jest.fn(async () => true)
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
  mockWorkerKaelChatService.get.mockReset()
  mockWorkerKaelChatService.getTrainingConsent.mockReset()
  mockWorkerKaelChatService.list.mockReset()
  mockWorkerKaelChatService.sendTurn.mockReset()
  mockWorkerKaelChatService.setTrainingConsent.mockReset()
  mockWorkerKaelChatService.streamTurn.mockReset()
  mockWorkerKaelChatService.submitFeedback.mockReset()
  mockKaelMemoryService.getMyWorkerMemory.mockReset()
  mockKaelMemoryService.updateMyWorkerPreference.mockReset()
  mockKaelMemoryService.getMyWorkerMemory.mockResolvedValue({
    data: {
      memory: null,
      subject_type: 'worker',
    },
    status: 200,
    success: true,
  })
  mockKaelMemoryService.updateMyWorkerPreference.mockResolvedValue({
    data: {
      memory: null,
      subject_type: 'worker',
    },
    status: 200,
    success: true,
  })
  mockPlacesAutocomplete.mockReset()
  mockPlacesResolve.mockReset()
  mockPlacesAutocomplete.mockResolvedValue({
    data: {
      fallback_used: false,
      suggestions: [],
    },
    status: 200,
    success: true,
  })
  mockPlacesResolve.mockResolvedValue({
    data: {
      fallback_used: false,
      label: 'Saigon Pearl, Bình Thạnh',
      location: { lat: 10.790422, lng: 106.720843 },
      place_id: 'vietmap-place-1',
      provider: 'vietmap',
    },
    status: 200,
    success: true,
  })
  mockUploadJobMediaDrafts.mockReset()
  mockUploadJobMediaDrafts.mockResolvedValue({
    mediaRefs: [
      'supabase://job-media/11111111-1111-4111-8111-111111111111/kael_reference/burnt-wire.jpg',
      'supabase://job-media/11111111-1111-4111-8111-111111111111/kael_reference/old-socket.jpg',
    ],
    success: true,
  })
  mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.getTrainingConsent.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.create.mockResolvedValue({
    data: {
      session: {
        closed_at: null,
        id: 'worker-kael-session-1',
        job_id: 'job_test_1',
        progress: null,
        started_at: '2026-06-04T00:00:00.000Z',
        status: 'active',
        total_turns: 0,
      },
      turns: [],
    },
    status: 201,
    success: true,
  })
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
        job_id: 'job_test_1',
        progress: {
          current_stage: 'worker_assist',
          failure_reason: null,
          progress: 1,
          status: 'completed',
          updated_at: '2026-06-04T00:00:02.000Z',
        },
        started_at: '2026-06-04T00:00:00.000Z',
        status: 'active',
        total_turns: 2,
      },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-04T00:00:00.000Z',
            id: 'turn-worker-default',
            media_refs: [],
            role: 'worker',
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
  imagePicker.requestMediaLibraryPermissionsAsync.mockReset()
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
  imagePicker.requestCameraPermissionsAsync.mockReset()
  imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true })
  imagePicker.launchCameraAsync.mockReset()
  imagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: [] })
  imagePicker.launchImageLibraryAsync.mockReset()
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
  mockPathname = '/(worker)/home'
  mockRouteParams = {}
  mockAppLanguage = 'vi'
  mockGlassAccessibility = { reduceMotion: false, reduceTransparency: false }
  buildWorkflow()
})

const workerV5RouteCases = [
  { id: '1.1-worker-home', pathname: '/(worker)/home', renderSurface: () => <WorkerHomeSurface /> },
  { id: '1.2-shift-brief', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '1.3-demand-map', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '1.4-smart-schedule', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.1-opportunity-inbox', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.2-offer-detail', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.3-accept-review', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.4-route-eta', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.5-arrival-checkin', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.7-in-progress', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.8-scope-change', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.9-approval-wait', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.10-completion-evidence', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.11-completion-submitted', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '2.12-case-closed', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
  { id: '3.1-kael-chat-normal', pathname: '/(worker)/chat', renderSurface: () => <WorkerChatSurface /> },
  { id: '3.2-kael-job-intake', pathname: '/(worker)/chat', renderSurface: () => <WorkerChatSurface /> },
  { id: '4.1-earnings-overview', pathname: '/(worker)/earnings', renderSurface: () => <WorkerEarningsSurface /> },
  { id: '4.2-ledger-detail', pathname: '/(worker)/earnings', renderSurface: () => <WorkerEarningsSurface /> },
  { id: '4.3-payout-request', pathname: '/(worker)/earnings', renderSurface: () => <WorkerEarningsSurface /> },
  { id: '4.4-payout-method', pathname: '/(worker)/earnings', renderSurface: () => <WorkerEarningsSurface /> },
  { id: '5.1-profile-overview', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.2-worker-ranking', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.3-skills-service-area', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.4-reliability-insights', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.5-account-utilities', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.6-agent-memory-preferences', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.7-verification-documents', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.8-bank-tax-center', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.9-reviews-feedback', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
  { id: '5.10-support-settings', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
] as const

const workerV5DefaultViText: Record<(typeof workerV5RouteCases)[number]['id'], string> = {
  '1.1-worker-home': 'Giải quyết công việc hôm nay',
  '1.2-shift-brief': 'Bảng công việc',
  '1.3-demand-map': 'Bản đồ cơ hội',
  '1.4-smart-schedule': 'Tối ưu việc làm',
  '2.1-opportunity-inbox': 'Hộp thư cơ hội',
  '2.2-offer-detail': 'Chi tiết đề nghị',
  '2.3-accept-review': 'Xác nhận nhận việc',
  '2.4-route-eta': 'Di chuyển và thời gian đến',
  '2.5-arrival-checkin': 'Địa điểm',
  '2.7-in-progress': 'Đang thực hiện',
  '2.8-scope-change': 'Đổi phạm vi',
  '2.9-approval-wait': 'Chờ khách phê duyệt',
  '2.10-completion-evidence': 'Bằng chứng hoàn tất',
  '2.11-completion-submitted': 'Đã gửi hoàn tất',
  '2.12-case-closed': 'Case đã đóng',
  '3.1-kael-chat-normal': 'Kael',
  '3.2-kael-job-intake': 'Kael nhận việc',
  '4.1-earnings-overview': 'Thu nhập của bạn',
  '4.2-ledger-detail': 'Chi tiết đối soát',
  '4.3-payout-request': 'Yêu cầu rút tiền',
  '4.4-payout-method': 'Tài khoản nhận tiền',
  '5.1-profile-overview': 'Hồ sơ thợ',
  '5.2-worker-ranking': 'Xếp hạng thợ',
  '5.3-skills-service-area': 'Kỹ năng và khu vực',
  '5.4-reliability-insights': 'Độ tin cậy',
  '5.5-account-utilities': 'Cài đặt',
  '5.6-agent-memory-preferences': 'Bộ nhớ & ưu tiên',
  '5.7-verification-documents': 'Giấy tờ & xác minh',
  '5.8-bank-tax-center': 'Ngân hàng và thuế',
  '5.9-reviews-feedback': 'Đánh giá và phản hồi',
  '5.10-support-settings': 'Cài đặt',
}

const workerV5TranslateEnText: Record<(typeof workerV5RouteCases)[number]['id'], string> = {
  '1.1-worker-home': 'Today work resolution',
  '1.2-shift-brief': 'Work board',
  '1.3-demand-map': 'Opportunity map',
  '1.4-smart-schedule': 'Work optimization',
  '2.1-opportunity-inbox': 'Opportunity inbox',
  '2.2-offer-detail': 'Offer detail',
  '2.3-accept-review': 'Accept review',
  '2.4-route-eta': 'Route and ETA',
  '2.5-arrival-checkin': 'Location',
  '2.7-in-progress': 'In progress',
  '2.8-scope-change': 'Scope change',
  '2.9-approval-wait': 'Customer approval wait',
  '2.10-completion-evidence': 'Completion evidence',
  '2.11-completion-submitted': 'Completion submitted',
  '2.12-case-closed': 'Case closed',
  '3.1-kael-chat-normal': 'Kael',
  '3.2-kael-job-intake': 'Kael intake',
  '4.1-earnings-overview': 'Your earnings',
  '4.2-ledger-detail': 'Ledger detail',
  '4.3-payout-request': 'Payout request',
  '4.4-payout-method': 'Payout method',
  '5.1-profile-overview': 'Worker profile',
  '5.2-worker-ranking': 'Worker ranking',
  '5.3-skills-service-area': 'Skills and service area',
  '5.4-reliability-insights': 'Reliability insights',
  '5.5-account-utilities': 'Settings',
  '5.6-agent-memory-preferences': 'Kael memory preferences',
  '5.7-verification-documents': 'Verification documents',
  '5.8-bank-tax-center': 'Bank and tax center',
  '5.9-reviews-feedback': 'Reviews and feedback',
  '5.10-support-settings': 'Settings',
}

const forbiddenWorkerCaseWorkCopy = /CaseWork|Case Work|Case work|\bCa\b|Kết ca|Trạng thái ca|Chưa có case|Tóm tắt ca làm|Kết thúc ca làm/

describe('Worker v5 route-param registry', () => {
  it('renders every worker v5 screen id through the stable worker route surfaces', () => {
    buildWorkflow({
      canWorkerAdvance: true,
      deal: buildRepairingDealWithKaelChecklist(),
      workerEarnings: {
        ...buildNoEarnings(),
        net_earnings: 1285000,
        pending_payment_amount: 350000,
        total_jobs_paid: 6,
      },
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.2,
        performance_score: 72,
        review_count: 3,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: '**** 4821',
        bank_name: 'Vietcombank',
        legal_name: 'Anh Hoang',
      }),
    })

    expect(workerV5RouteCases).toHaveLength(31)

    for (const routeCase of workerV5RouteCases) {
      mockPathname = routeCase.pathname
      mockRouteParams = { ns_worker_screen: routeCase.id }

      const view = render(routeCase.renderSurface())
      const handoffPageAuraByScreen: Record<string, string> = {
        '1.2-shift-brief': 'worker-v5-shift-page-customer-mint-aura',
        '1.3-demand-map': 'worker-v5-demand-page-customer-mint-aura',
        '1.4-smart-schedule': 'worker-v5-schedule-page-customer-mint-aura',
        '2.1-opportunity-inbox': 'worker-v5-opportunity-page-customer-mint-aura',
        '2.2-offer-detail': 'worker-v5-offer-page-customer-mint-aura',
        '2.3-accept-review': 'worker-v5-accept-page-customer-mint-aura',
        '2.4-route-eta': 'worker-v5-route-page-customer-mint-aura',
        '2.5-arrival-checkin': 'worker-v5-checkin-page-customer-mint-aura',
        '2.7-in-progress': 'worker-v5-in-progress-canvas-aura',
        '2.8-scope-change': 'worker-v5-case-flow-page-customer-mint-aura',
        '2.9-approval-wait': 'worker-v5-case-flow-page-customer-mint-aura',
        '2.10-completion-evidence': 'worker-v5-case-flow-page-customer-mint-aura',
        '2.11-completion-submitted': 'worker-v5-case-flow-page-customer-mint-aura',
        '2.12-case-closed': 'worker-v5-case-flow-page-customer-mint-aura',
        '3.1-kael-chat-normal': 'worker-v5-kael-orb-background-mint-aura',
        '3.2-kael-job-intake': 'worker-v5-kael-orb-background-mint-aura',
        '4.1-earnings-overview': 'worker-v5-earnings-page-customer-mint-aura',
        '4.2-ledger-detail': 'worker-v5-earnings-page-customer-mint-aura',
        '4.3-payout-request': 'worker-v5-earnings-page-customer-mint-aura',
        '4.4-payout-method': 'worker-v5-earnings-page-customer-mint-aura',
        '5.1-profile-overview': 'worker-v5-earnings-page-customer-mint-aura',
        '5.2-worker-ranking': 'worker-v5-earnings-page-customer-mint-aura',
        '5.3-skills-service-area': 'worker-v5-earnings-page-customer-mint-aura',
        '5.4-reliability-insights': 'worker-v5-earnings-page-customer-mint-aura',
        '5.5-account-utilities': 'worker-v5-earnings-page-customer-mint-aura',
        '5.6-agent-memory-preferences': 'worker-v5-earnings-page-customer-mint-aura',
        '5.10-support-settings': 'worker-v5-earnings-page-customer-mint-aura',
      }

      expect(screen.getByTestId(`worker-v5-screen-${routeCase.id}`)).toBeOnTheScreen()
      const handoffPageAura = handoffPageAuraByScreen[routeCase.id]
      if (handoffPageAura) {
        expect(screen.getByTestId(handoffPageAura)).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-page-mint-aura')).toBeNull()
      } else {
        expect(screen.getByTestId('worker-v5-page-mint-aura')).toBeOnTheScreen()
      }
      if (routeCase.id === '1.2-shift-brief') {
        expect(screen.getByTestId('worker-v5-shift-summary-card')).toBeOnTheScreen()
      } else if (routeCase.id === '1.3-demand-map') {
        expect(screen.getByTestId('worker-v5-demand-map-panel')).toBeOnTheScreen()
      } else if (routeCase.id === '1.4-smart-schedule') {
        expect(screen.getByTestId('worker-v5-schedule-summary-card')).toBeOnTheScreen()
      } else if (routeCase.id === '2.1-opportunity-inbox') {
        expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.2-offer-detail') {
        expect(screen.getByTestId('worker-v5-offer-detail-summary-card')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.3-accept-review') {
        expect(screen.getByTestId('worker-v5-accept-review-handoff')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.4-route-eta') {
        expect(screen.getByTestId('worker-v5-route-map-panel')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.5-arrival-checkin') {
        expect(screen.getByTestId('worker-v5-checkin-hero')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.7-in-progress') {
        expect(screen.getByTestId('worker-v5-timer-card')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-in-progress-step-list-formula-aura')).toBeOnTheScreen()
        expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.8-scope-change') {
        expect(screen.getByTestId('worker-v5-scope-change-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-price-lines-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-jobs-needs-phase-context')).toBeNull()
        expect(screen.queryByTestId('worker-scope-change-request')).toBeNull()
        expect(screen.queryByTestId('worker-v5-boundary-note')).toBeNull()
        expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.9-approval-wait') {
        expect(screen.getByTestId('worker-v5-approval-wait-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-approval-timeline-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.10-completion-evidence') {
        expect(screen.getByTestId('worker-v5-completion-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-final-checklist-mint-aura')).toBeOnTheScreen()
        expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.11-completion-submitted') {
        expect(screen.getByTestId('worker-v5-completion-submitted-background-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-success-emblem')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-success-emblem-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-success-check-fill')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-settlement-cell-mint-aura-0')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-submission-timeline-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '2.12-case-closed') {
        expect(screen.getByTestId('worker-v5-case-closed-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-case-closed-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-case-closed-check-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-case-closed-check-fill')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-case-trail-row-mint-aura-0')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '3.1-kael-chat-normal') {
        expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-kael-orb-normal')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '3.2-kael-job-intake') {
        expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-kael-orb-opportunities')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '4.1-earnings-overview') {
        expect(screen.getByTestId('worker-v5-earnings-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-transactions-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-action-rail-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByText(/Tổng thu nhập|Total income/)).toBeNull()
        expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '4.2-ledger-detail') {
        expect(screen.getByTestId('worker-v5-ledger-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-ledger-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-page-lower-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-breakdown-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-action-rail-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-ledger-period')).toBeNull()
    expect(screen.queryByTestId('worker-v5-ledger-status')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '4.3-payout-request') {
        expect(screen.getByTestId('worker-v5-payout-request-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-payout-request-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-payout-amount-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-payout-account-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-payout-request-status')).toBeNull()
        expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
        expect(screen.queryByTestId('worker-v5-final-checklist')).toBeNull()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '4.4-payout-method') {
        expect(screen.getByTestId('worker-v5-payout-method-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-payout-method-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-payout-method-bank-aura-0')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-account-management-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '5.1-profile-overview') {
        expect(screen.getByTestId('worker-v5-worker-avatar')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-dashboard')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '5.2-worker-ranking') {
        expect(screen.getByTestId('worker-v5-ranking-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-ranking-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '5.3-skills-service-area') {
        expect(screen.getByTestId('worker-v5-skills-service-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-skills-service-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-service-card-mint-aura-0')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '5.4-reliability-insights') {
        expect(screen.getByText('Chỉ số có thể kiểm chứng, không phải cảm tính')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-reliability-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-reliability-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '5.5-account-utilities' || routeCase.id === '5.10-support-settings') {
        expect(screen.getByText('Tài khoản, bảo mật và bộ nhớ Kael')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-settings-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-settings-list')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-settings-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-utility-grid')).toBeNull()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else if (routeCase.id === '5.6-agent-memory-preferences') {
        expect(screen.getByTestId('worker-v5-memory-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-profile-page-lower-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-permission-list')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-boundary-list')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
      } else {
        expect(screen.getByTestId('worker-v5-hero-mint-aura')).toBeOnTheScreen()
      }

      view.unmount()
    }
  })

  it('keeps Vietnamese as the default language across every worker v5 screen even when app cache is English', () => {
    mockAppLanguage = 'en'
    buildWorkflow({
      canWorkerAdvance: true,
      deal: buildRepairingDealWithKaelChecklist(),
      workerEarnings: {
        ...buildNoEarnings(),
        net_earnings: 1285000,
        pending_payment_amount: 350000,
        total_jobs_paid: 6,
      },
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.2,
        performance_score: 72,
        review_count: 3,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: '**** 4821',
        bank_name: 'Vietcombank',
        legal_name: 'Anh Hoang',
      }),
    })

    for (const routeCase of workerV5RouteCases) {
      mockPathname = routeCase.pathname
      mockRouteParams = { ns_worker_screen: routeCase.id }

      const view = render(routeCase.renderSurface())

      expect(screen.getByTestId(`worker-v5-screen-${routeCase.id}`)).toBeOnTheScreen()
      if (routeCase.id === '2.12-case-closed') {
        expect(screen.queryByText(workerV5DefaultViText[routeCase.id])).toBeNull()
        expect(screen.getByTestId('worker-v5-case-closed-title')).toBeOnTheScreen()
      } else {
        expect(screen.getAllByText(workerV5DefaultViText[routeCase.id]).length).toBeGreaterThan(0)
      }

      view.unmount()
    }
  })

  it('uses English only through the explicit worker translation route param across worker v5 screens', () => {
    mockAppLanguage = 'vi'
    buildWorkflow({
      canWorkerAdvance: true,
      deal: buildRepairingDealWithKaelChecklist(),
      workerEarnings: {
        ...buildNoEarnings(),
        net_earnings: 1285000,
        pending_payment_amount: 350000,
        total_jobs_paid: 6,
      },
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.2,
        performance_score: 72,
        review_count: 3,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: '**** 4821',
        bank_name: 'Vietcombank',
        legal_name: 'Anh Hoang',
      }),
    })

    for (const routeCase of workerV5RouteCases) {
      mockPathname = routeCase.pathname
      mockRouteParams = { ns_worker_lang: 'en', ns_worker_screen: routeCase.id }

      const view = render(routeCase.renderSurface())

      expect(screen.getByTestId(`worker-v5-screen-${routeCase.id}`)).toBeOnTheScreen()
      if (routeCase.id === '2.12-case-closed') {
        expect(screen.queryByText(workerV5TranslateEnText[routeCase.id])).toBeNull()
        expect(screen.getByTestId('worker-v5-case-closed-title')).toBeOnTheScreen()
      } else {
        expect(screen.getAllByText(workerV5TranslateEnText[routeCase.id]).length).toBeGreaterThan(0)
      }

      view.unmount()
    }
  })

  it('keeps worker v5 registry copy free of forbidden CaseWork and Ca wording', () => {
    const visibleRegistryCopy = [
      ...Object.values(workerV5DefaultViText),
      ...Object.values(workerV5TranslateEnText),
    ].join('\n')

    expect(visibleRegistryCopy).not.toMatch(forbiddenWorkerCaseWorkCopy)
  })

  it('uses worker v5 roots as the production default for every worker tab', () => {
    buildWorkflow({
      canWorkerAdvance: true,
      deal: buildRepairingDealWithKaelChecklist(),
      workerEarnings: {
        ...buildNoEarnings(),
        net_earnings: 1285000,
        total_jobs_paid: 6,
      },
      workerProfile: buildWorkerProfile({
        bank_account_masked: '**** 4821',
        bank_name: 'Vietcombank',
        legal_name: 'Anh Hoang',
      }),
    })

    const productionRoots = [
      { id: '1.1-worker-home', pathname: '/(worker)/home', renderSurface: () => <WorkerHomeSurface /> },
      { id: '1.2-shift-brief', pathname: '/(worker)/jobs', renderSurface: () => <WorkerJobsSurface /> },
      { id: '3.1-kael-chat-normal', pathname: '/(worker)/chat', renderSurface: () => <WorkerChatSurface /> },
      { id: '4.1-earnings-overview', pathname: '/(worker)/earnings', renderSurface: () => <WorkerEarningsSurface /> },
      { id: '5.1-profile-overview', pathname: '/(worker)/profile', renderSurface: () => <WorkerProfileSurface /> },
    ] as const

    for (const routeCase of productionRoots) {
      mockPathname = routeCase.pathname
      mockRouteParams = {}

      const view = render(routeCase.renderSurface())

      expect(screen.getByTestId(`worker-v5-screen-${routeCase.id}`)).toBeOnTheScreen()

      view.unmount()
    }
  })

  it('mounts Stage 1.2 as the Công việc default route', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_approved: true,
        is_available: true,
      }),
    })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.2-shift-brief' }
    const jobsView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.2-shift-brief')).toBeOnTheScreen()
    expect(screen.getAllByText('Bảng công việc').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('worker-v5-shift-summary-kicker')).toBeNull()
    expect(screen.getByTestId('worker-v5-shift-summary-title')).toHaveTextContent('Đang mở nhận cơ hội')
    expect(screen.getByTestId('worker-v5-shift-summary-meta')).toHaveTextContent('1 dịch vụ · 1 khu vực')
    expect(screen.getByText('Chỉ hiện mức nhu cầu khi NestScout có tín hiệu đã xác thực')).toBeOnTheScreen()
    expect(screen.getByText('NHIỆM VỤ TỪ KHÁCH')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-priority-list')).toHaveTextContent(/Chưa có nhiệm vụ từ khách/)
    expect(screen.queryByText('Dịch vụ đã duyệt trong hồ sơ thợ')).toBeNull()
    jobsView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'waiting' }
    const waitingView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.2-shift-brief')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-demand-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-priority-list')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeNull()
    waitingView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = {}
    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.2-shift-brief')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeNull()
  })

  it('keeps Stage 1.2 through 2.1 preparation workflow inside the Công việc route', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_approved: true,
        is_available: true,
      }),
    })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.2-shift-brief' }
    const briefView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.2-shift-brief')).toBeOnTheScreen()
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=1.3-demand-map')
    briefView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.3-demand-map' }
    const mapView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.3-demand-map')).toBeOnTheScreen()
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=1.4-smart-schedule')
    mapView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.4-smart-schedule' }
    const scheduleView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.4-smart-schedule')).toBeOnTheScreen()
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-schedule-use'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox')
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-schedule-customize'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=1.3-demand-map')
    scheduleView.unmount()
  })

  it('adds a mint aura group to the Stage 1.4 empty schedule support cards', () => {
    buildWorkflow({ deal: null, workerJobs: [] })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.4-smart-schedule' }
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-schedule-empty-state')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-brief-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-support-aura-group')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-support-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-support-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-schedule-list')).toBeNull()
  })

  it('renders Stage 1.4 schedule rows from real accepted worker jobs in Kael priority order', () => {
    buildWorkflow({
      workerJobs: [
        buildWorkerScheduleJob({
          id: 'job_far_repairing',
          created_at: '2026-06-04T09:00:00.000Z',
          district: 'quan_7',
          estimated_earning: 220000,
          matched_at: '2026-06-04T09:05:00.000Z',
          problem_summary: 'viec xa hon',
          service_type: 'cleaning',
          status: 'repairing',
        }),
        buildWorkerScheduleJob({
          id: 'job_near_ready',
          address_access: {
            access_profile: {},
            check_in_required: true,
            customer_handoff_required: false,
            evidence_mode: 'manual_photo',
            exact_unit_released: true,
            identity_check_required: false,
            release_stage: 'unit_released',
          },
          address_building: 'Saigon Pearl',
          address_floor: '12',
          address_unit: '1201',
          created_at: '2026-06-04T10:00:00.000Z',
          district: 'quan_1',
          estimated_earning: 120000,
          matched_at: '2026-06-04T10:05:00.000Z',
          problem_summary: 'viec gan hon',
          service_type: 'electrical',
          status: 'worker_matched',
        }),
      ],
    })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.4-smart-schedule' }
    render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-v5-schedule-empty-state')).toBeNull()
    expect(screen.getByTestId('worker-v5-schedule-summary-card')).toHaveTextContent(/2 việc đã nhận/)
    expect(screen.getByTestId('worker-v5-kael-brief-card')).toHaveTextContent(/tín hiệu/)
    const rows = screen.getAllByTestId('worker-v5-schedule-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText(/viec gan hon/)).toBeOnTheScreen()
    expect(within(rows[1]).getByText(/viec xa hon/)).toBeOnTheScreen()
  })

  it('uses the real places service flow for Stage 1.3 search before rendering a VietMap-backed preview', async () => {
    mockPlacesAutocomplete.mockResolvedValueOnce({
      data: {
        fallback_used: false,
        suggestions: [{
          label: 'Saigon Pearl, Binh Thanh',
          main_text: 'Saigon Pearl',
          place_id: 'vietmap-place-1',
          secondary_text: 'Binh Thanh, TP.HCM',
        }],
      },
      status: 200,
      success: true,
    })
    buildWorkflow({ workerProfile: buildWorkerProfile({ home_lat: null, home_lng: null }) })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.3-demand-map' }
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-vietmap-empty-state')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-demand-info-mint-aura')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('worker-v5-search-input'), 'Saigon Pearl')

    await waitFor(() => expect(mockPlacesAutocomplete).toHaveBeenCalledWith({ input: 'Saigon Pearl' }))
    await waitFor(() => expect(screen.getByTestId('worker-v5-search-suggestion')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('worker-v5-search-suggestion'))

    await waitFor(() => expect(mockPlacesResolve).toHaveBeenCalledWith({
      label: 'Saigon Pearl, Binh Thanh',
      place_id: 'vietmap-place-1',
    }))
    await waitFor(() => expect(screen.getByTestId('worker-v5-vietmap-static-image')).toBeOnTheScreen())
    expect(screen.getByTestId('worker-v5-vietmap-static-image').props.source.uri).toContain('/maps/vietmap/static')
  })

  it('renders Stage 2.4 route metrics and VietMap preview from backend route metadata', async () => {
    const deal = buildAcceptedDeal()
    deal.broadcast = deal.broadcast
      ? ({
        ...deal.broadcast,
        safe_metadata: {
          destination_label: 'Saigon Pearl, Bình Thạnh',
          destination_lat: '10.790422',
          destination_lng: '106.720843',
          map_provider: 'vietmap',
          route_distance_m: 2100,
          travel_minutes: 18,
        },
      } as LocalDeal['broadcast'])
      : null
    buildWorkflow({ deal })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.4-route-eta' }
    render(<WorkerJobsSurface />)

    expect(mockPlacesAutocomplete).not.toHaveBeenCalled()
    expect(mockPlacesResolve).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('worker-v5-vietmap-static-image')).toBeOnTheScreen())
    expect(screen.getByTestId('worker-v5-vietmap-static-image').props.source.uri).toContain('/maps/vietmap/static')
    expect(screen.getByTestId('worker-v5-info-grid')).toHaveTextContent(/2,1 km/)
    expect(screen.getByTestId('worker-v5-info-grid')).toHaveTextContent(/Di chuyển trong 18 phút/)
    expect(screen.getByTestId('worker-v5-info-grid')).toHaveTextContent(/Saigon Pearl, Bình Thạnh/)
    expect(screen.queryByTestId('worker-v5-route-kael-tracking')).toBeNull()
    expect(screen.queryByText('Bắt đầu di chuyển')).toBeNull()
  })

  it('does not render the Stage 2.4 workflow fallback subtitle when no real work exists', () => {
    buildWorkflow({ deal: null })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.4-route-eta' }
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.4-route-eta')).toBeOnTheScreen()
    expect(screen.queryByText('Cập nhật từ workflow thật')).toBeNull()
    expect(screen.queryByText('Updates from the real workflow')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-route-contact-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal')
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-route-arrival-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.5-arrival-checkin')
  })

  it('renders Stage 2.5 location, customer contact, and checklist from workflow data', () => {
    const deal = buildInspectingDealWithReleasedAddress()
    deal.broadcast = deal.broadcast
      ? ({
        ...deal.broadcast,
        addressAccess: {
          access_profile: {},
          check_in_required: true,
          customer_handoff_required: true,
          evidence_mode: 'manual_photo',
          exact_unit_released: true,
          identity_check_required: false,
          release_stage: 'unit_released',
        },
        safe_metadata: {
          customer_contact_channel: 'JobRoom',
          customer_contacted: true,
          customer_display_name: 'Chi Hanh',
          initial_condition_confirmed: true,
        },
      } as LocalDeal['broadcast'])
      : null
    buildWorkflow({ deal })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.5-arrival-checkin' }
    render(<WorkerJobsSurface />)

    expect(screen.getAllByText('Địa điểm').length).toBeGreaterThan(0)
    expect(screen.getByTestId('worker-v5-checkin-destination-title')).toHaveTextContent(/Tòa A, Nguyễn Huệ, Quận 1/)
    expect(screen.getByTestId('worker-v5-checkin-destination-meta')).toHaveTextContent(/Đã mở căn hộ/)
    expect(screen.getByTestId('worker-v5-customer-contact-title')).toHaveTextContent(/Chi Hanh/)
    expect(screen.getByTestId('worker-v5-customer-contact-meta')).toHaveTextContent(/JobRoom/)
    expect(screen.getByTestId('worker-v5-customer-contact-icons')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-meta-0')).toHaveTextContent(/Tòa A, Nguyễn Huệ, Quận 1/)
    expect(screen.getByTestId('worker-v5-checkin-meta-1')).toHaveTextContent(/Đã ghi trong workflow/)
    expect(screen.getByTestId('worker-v5-checkin-meta-2')).toHaveTextContent(/Đã có bằng chứng/)
    expect(screen.queryByTestId('worker-v5-checkin-boundary-note')).toBeNull()
  })

  it('maps legacy worker deep-link params to worker v5 screens instead of rebuild surfaces', () => {
    buildWorkflow({
      canWorkerAdvance: true,
      deal: buildRepairingDealWithKaelChecklist(),
      workerEarnings: {
        ...buildNoEarnings(),
        net_earnings: 1285000,
        total_jobs_paid: 6,
      },
    })

    const deepLinks = [
      {
        id: '2.7-in-progress',
        params: { tab: 'active' },
        pathname: '/(worker)/jobs',
        renderSurface: () => <WorkerJobsSurface />,
      },
      {
        id: '2.8-scope-change',
        params: { ns_audit_role: 'worker', ns_audit_surface: 'worker_scope_change', tab: 'needs' },
        pathname: '/(worker)/jobs',
        renderSurface: () => <WorkerJobsSurface />,
      },
      {
        id: '2.10-completion-evidence',
        params: { ns_audit_role: 'worker', ns_audit_surface: 'worker_completion_evidence', tab: 'needs' },
        pathname: '/(worker)/jobs',
        renderSurface: () => <WorkerJobsSurface />,
      },
      {
        id: '4.3-payout-request',
        params: { ns_payment_step: 'withdraw' },
        pathname: '/(worker)/earnings',
        renderSurface: () => <WorkerEarningsSurface />,
      },
      {
        id: '4.4-payout-method',
        params: { ns_payment_step: 'method' },
        pathname: '/(worker)/earnings',
        renderSurface: () => <WorkerEarningsSurface />,
      },
    ] as const

    for (const routeCase of deepLinks) {
      mockPathname = routeCase.pathname
      mockRouteParams = routeCase.params

      const view = render(routeCase.renderSurface())

      expect(screen.getByTestId(`worker-v5-screen-${routeCase.id}`)).toBeOnTheScreen()

      view.unmount()
    }
  })

  it('renders the worker v5 source visual primitives for checklist timeline and score surfaces', () => {
    const evidenceDeal = {
      ...buildRepairingDealWithKaelChecklist(),
      completionNotes: 'Đã kiểm tra tải và chụp ảnh sau sửa.',
      completionPhotoUrls: ['file:///after-repair.jpg'],
    }
    buildWorkflow({
      deal: evidenceDeal,
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.2,
        completed_job_count: 9,
        on_time_rate_percent: 81,
        performance_score: 72,
        review_count: 3,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: '**** 4821',
        bank_name: 'Vietcombank',
        districts: ['quan_1', 'quan_3'],
      }),
    })

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.1-opportunity-inbox' }
    const opportunityView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-opportunity-header-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-filter')).toBeOnTheScreen()
    expect(screen.getByText('Hộp thư cơ hội')).toBeOnTheScreen()
    expect(screen.getByText('Kael đã lọc theo kỹ năng, bán kính và lịch trống')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-page-customer-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-inbox-tabs')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.queryByText(/M\?i|tr\?ng|t\?i th\?|d\? x\?p/i)).toBeNull()
    opportunityView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.2-shift-brief' }
    const shiftView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-shift-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-top-calendar-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-icon-formula-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-summary-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-summary-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-shift-summary-kicker')).toBeNull()
    expect(screen.getByTestId('worker-v5-shift-summary-meta')).toHaveTextContent(/Sửa điện/)
    expect(screen.getByTestId('worker-v5-shift-demand-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-demand-list')).toHaveTextContent(/Sửa điện/)
    expect(screen.getByTestId('worker-v5-shift-demand-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-demand-mint-aura-zip')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-priority-list')).toBeOnTheScreen()
    expect(screen.getByText('NHIỆM VỤ TỪ KHÁCH')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-priority-list')).toHaveTextContent(/Sửa điện/)
    expect(screen.getByTestId('worker-v5-shift-priority-list')).toHaveTextContent(/Điểm hẹn của khách/)
    expect(screen.getByTestId('worker-v5-shift-priority-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-shift-priority-mint-aura-zip')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-primary-action')).toBeOnTheScreen()
    expect(screen.queryByText('SẴN SÀNG NHẬN VIỆC')).toBeNull()
    expect(screen.queryByTestId('worker-v5-inbox-tabs')).toBeNull()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    shiftView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.3-demand-map' }
    const mapView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-demand-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-demand-page-customer-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-search-pill')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-search-input')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-demand-map-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-vietmap-empty-state')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-demand-map-data-sheet')).toBeNull()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-next')).toBeNull()
    mapView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.4-smart-schedule' }
    const scheduleView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-schedule-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-page-customer-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-summary-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-schedule-action-row')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-next')).toBeNull()
    expect(screen.queryByText('Lắp camera')).toBeNull()
    expect(screen.queryByText('Bảo trì máy giặt')).toBeNull()
    scheduleView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }
    const offerDetailView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-offer-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-page-customer-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-page-lower-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-detail-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-detail-summary-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-address-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-address-list-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-request-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-request-list-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-offer-kael-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-job-meta-pills')).toBeNull()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    offerDetailView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.3-accept-review' }
    const acceptReviewView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-accept-review-handoff')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-checklist-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-commitment')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-boundary-note')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-confirm-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    acceptReviewView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.4-route-eta' }
    const routeEtaView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-route-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-page-customer-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-map-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-map-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-eta-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-eta-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-route-kael-tracking')).toBeNull()
    expect(screen.queryByText('Bắt đầu di chuyển')).toBeNull()
    expect(screen.getByTestId('worker-v5-info-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-arrival-action')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    routeEtaView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.5-arrival-checkin' }
    const arrivalView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-checkin-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-page-customer-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-customer-contact-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-customer-contact-icons')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-checklist')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-checklist-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-checkin-boundary-note')).toBeNull()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-arrived-action')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    arrivalView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    const inProgressView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-in-progress-canvas-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeNull()
    expect(screen.queryByTestId('worker-v5-case-flow-page-lower-mint-aura')).toBeNull()
    expect(screen.getByTestId('worker-v5-timer-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-card-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-in-progress-timer-focus-mint-aura')).toBeNull()
    expect(screen.queryByText('Đề nghị từ dữ liệu thật')).toBeNull()
    expect(screen.getByTestId('worker-v5-work-progress-board')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-step-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-step-list-formula-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-picker-actions')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-camera-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-library-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-camera-action-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-library-action-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-camera-action-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-library-action-mint-aura')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-in-progress-camera-icon').props.style).height).toBe(38)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-in-progress-library-icon').props.style).height).toBe(38)
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    inProgressView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    const evidenceView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-evidence-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-final-checklist')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-final-checklist-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-draft-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-submit-action')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    evidenceView.unmount()

    const approvalDeal = buildScopeChangePendingDeal()
    buildWorkflow({ deal: approvalDeal })
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }
    const scopeChangeView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-progress-rail')).toBeOnTheScreen()
    expect(within(screen.getByTestId('worker-v5-progress-rail-segment-4')).getByTestId('worker-v5-progress-rail-label-4')).toHaveTextContent('Duyệt')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-progress-rail-segment-4').props.style).alignItems).toBe('center')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-progress-rail-label-4').props.style).width).toBe('100%')
    expect(screen.getByTestId('worker-v5-scope-change-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-scope-change-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-price-lines')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-price-lines-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-jobs-needs-phase-context')).toBeNull()
    expect(screen.queryByTestId('worker-scope-change-request')).toBeNull()
    expect(screen.queryByTestId('worker-v5-boundary-note')).toBeNull()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-scope-change-send-action')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-v5-primary-gradient').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    scopeChangeView.unmount()

    buildWorkflow({ deal: buildScopeChangePendingDeal() })
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }
    const approvalWaitView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-wait-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-wait-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-timeline')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-timeline-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-boundary-note-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-continue-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-amount')).toHaveTextContent(/\+150\.000\s?đ/)
    expect(screen.getByTestId('worker-v5-approval-wait-hero')).toHaveTextContent(/Thay dây điện hỏng/)
    expect(screen.getByTestId('worker-v5-approval-timeline-meta-0')).toHaveTextContent(/1 ảnh/)
    expect(screen.getByTestId('worker-v5-approval-timeline-meta-0')).not.toHaveTextContent(/2026-06-11T/)
    expect(screen.getByTestId('worker-v5-approval-timeline-meta-1')).not.toHaveTextContent(/2026-06-11T/)
    expect(screen.queryByText(/Approval pending|simulate|mô phỏng/i)).toBeNull()
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    approvalWaitView.unmount()

    buildWorkflow({ deal: buildCompletedByWorkerDeal() })
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }
    const submittedView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-submitted-background-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-success-emblem')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-success-emblem-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-success-check-fill')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-submitted-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-submission-timeline')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-submission-timeline-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settlement-strip')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settlement-cell-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settlement-cell-zip-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-submitted-next-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-submitted-timeline-action')).toBeOnTheScreen()
    submittedView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    const closedView = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-flow-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-closed-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-closed-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-trail-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-closed-earnings-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-closed-ranking-action')).toBeOnTheScreen()
    closedView.unmount()

    mockPathname = '/(worker)/chat'
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    const kaelNormalView = render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-header')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-title')).toHaveTextContent('Kael')
    expect(screen.getByTestId('worker-v5-kael-mode-toggle')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))
    expect(screen.getByTestId('worker-v5-kael-mode-menu')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-sheen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-top-light')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-inner-shadow')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-normal').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-kael-mode-menu-intake').props.accessibilityState).toMatchObject({ selected: false })
    expect(screen.queryByTestId('worker-v5-mode-tab-case')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-transcript')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-composer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-camera-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-composer-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-orb-boundary')).toBeNull()
    expect(screen.queryByTestId('worker-v5-suggestion-chips')).toBeNull()
    kaelNormalView.unmount()

    buildWorkflow({ deal: buildIncomingDeal() })
    mockPathname = '/(worker)/chat'
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }
    const kaelIntakeView = render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-header')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-title')).toHaveTextContent('Kael nhận việc')
    expect(screen.getByTestId('worker-v5-kael-mode-toggle')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))
    expect(screen.getByTestId('worker-v5-kael-mode-menu-sheen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-top-light')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-inner-shadow')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-normal').props.accessibilityState).toMatchObject({ selected: false })
    expect(screen.getByTestId('worker-v5-kael-mode-menu-intake').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.queryByTestId('worker-v5-mode-tab-case')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-orb-boundary')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-opportunities')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-open-opportunity')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-composer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-camera-icon')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-suggestion-chips')).toBeNull()
    kaelIntakeView.unmount()

    buildWorkflow({
      workerEarnings: {
        ...buildNoEarnings(),
        gross_earnings: 1540000,
        net_earnings: 1285000,
        platform_fee_total: 255000,
        total_jobs_paid: 6,
      },
    })
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    const earningsOverviewView = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-page-lower-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-transactions')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-transactions-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-earnings-action-rail-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    earningsOverviewView.unmount()

    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.2-ledger-detail' }
    const ledgerView = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-ledger-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-breakdown')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-breakdown-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-trace')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-action-rail-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-ledger-period')).toBeNull()
    expect(screen.queryByTestId('worker-v5-ledger-status')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByText(/2026-05-31T17:00:00\.000Z|2026-06-30T16:59:59\.999Z/)).toBeNull()
    expect(screen.getByTestId('worker-v5-action-rail')).toBeOnTheScreen()
    ledgerView.unmount()

    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }
    const payoutRequestView = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-request-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-request-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-amount-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-amount-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-account-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-account-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-payout-request-status')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-final-checklist')).toBeNull()
    payoutRequestView.unmount()

    buildWorkflow({
      workerEarnings: {
        ...buildNoEarnings(),
        net_earnings: 1285000,
        total_jobs_paid: 6,
      },
      workerProfile: buildWorkerProfile({
        bank_account_masked: '•••• 1234',
        bank_name: 'ACB',
      }),
    })
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    const payoutMethodView = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-method-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-method-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-method-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-account-management-list')).toBeOnTheScreen()
    payoutMethodView.unmount()

    buildWorkflow({
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.2,
        completed_job_count: 9,
        on_time_rate_percent: 81,
        performance_axes: [
          { id: 'rating', score: 72 },
          { id: 'response', score: 68 },
          { id: 'arrival', score: 81 },
          { id: 'completion', score: 75 },
          { id: 'earnings', score: 64 },
        ],
        performance_score: 72,
        review_count: 3,
      }),
    })
    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    const rankingView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-ranking-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-score')).toHaveTextContent('72')
    expect(screen.getByTestId('worker-v5-ranking-stat-strip')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-stat-value-0')).toHaveTextContent('9')
    expect(screen.getByTestId('worker-v5-ranking-stat-value-1')).toHaveTextContent('3')
    expect(screen.getByTestId('worker-v5-ranking-stat-value-2')).toHaveTextContent('81%')
    expect(screen.getByTestId('worker-v5-ranking-leaderboard')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-status')).toHaveTextContent('72')
    expect(screen.getByTestId('worker-v5-ranking-improvement-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-improvement-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-0')).toHaveTextContent('Thu nhập đã đối soát')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-1')).toHaveTextContent('Kỷ luật phản hồi')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-2')).toHaveTextContent('Phản hồi khách')
    expect(screen.queryByText(/Đ\?|Ch\?t|Phẹn h\?i|K\? lu/)).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-gauge')).toBeNull()
    expect(screen.queryByTestId('worker-v5-score-ring')).toBeNull()
    expect(screen.queryByTestId('worker-v5-rank-rail')).toBeNull()
    expect(screen.queryByTestId('worker-v5-ranking-podium')).toBeNull()
    rankingView.unmount()

    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.1-profile-overview' }
    const profileView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-worker-avatar')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-sync-progress-label')).toHaveTextContent(/72%/)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-profile-sync-progress-fill').props.style).width).toBe('72%')
    expect(screen.getByTestId('worker-v5-profile-dashboard')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-utility-grid')).toBeNull()
    expect(screen.getByTestId('worker-v5-profile-dossier')).toBeOnTheScreen()
    profileView.unmount()

    buildWorkflow({
      workerProfile: buildWorkerProfile({
        districts: ['quan_1', 'quan_3'],
        service_radius_km: 6,
        service_types: ['electrical', 'plumbing'],
      }),
    })
    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    const registeredSkillsView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('2 kỹ năng đang hoạt động')
    expect(screen.getByTestId('worker-v5-quick-action-title-0')).toHaveTextContent('Sửa điện')
    expect(screen.getByTestId('worker-v5-quick-action-title-1')).toHaveTextContent('Sửa nước')
    expect(screen.queryByTestId('worker-v5-quick-action-2')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-quick-action-0').props.style).width).toBe('48.7%')
    registeredSkillsView.unmount()

    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.6-agent-memory-preferences' }
    const memoryView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-memory-permission-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-memory-boundary-list')).toBeOnTheScreen()
    memoryView.unmount()

    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.8-bank-tax-center' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-bank-tax-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-tax-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-tax-logo')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-rules-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-chip-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-account-change-guard')).toBeOnTheScreen()
  })

  it('uses opaque fallback for worker v5 source primitives when Reduce Transparency is enabled', () => {
    mockGlassAccessibility = { reduceMotion: false, reduceTransparency: true }
    buildWorkflow({
      deal: buildScopeChangePendingDeal(),
      workerEarnings: {
        ...buildNoEarnings(),
        from_date: '2026-06-01',
        gross_earnings: 1540000,
        net_earnings: 1285000,
        platform_fee_total: 255000,
        to_date: '2026-06-07',
        total_jobs_paid: 6,
      },
      workerPerformanceInsights: buildWorkerPerformanceInsights({ performance_score: 72 }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: '**** 4821',
        bank_name: 'Vietcombank',
        districts: ['quan_1', 'quan_3'],
      }),
    })

    mockPathname = '/(worker)/home'
    mockRouteParams = { ns_worker_screen: '1.1-worker-home' }
    const homeView = render(<WorkerHomeSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-availability-card').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-brief-card').props.style).backgroundColor).toBe(color.mint.white)
    homeView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '1.4-smart-schedule' }
    const scheduleView = render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-page-mint-aura')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-schedule-row').props.style).backgroundColor).toBe(color.mint.white)
    scheduleView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.5-arrival-checkin' }
    const arrivalView = render(<WorkerJobsSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-checkin-hero').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-checkin-checklist').props.style).backgroundColor).toBe(color.mint.white)
    arrivalView.unmount()

    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }
    const scopeView = render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-scope-change-mint-aura')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-scope-change-hero').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-price-lines').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-evidence-tray-tile-0').props.style).backgroundColor).toBe(color.mint.white)
    scopeView.unmount()

    mockPathname = '/(worker)/chat'
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    const chatView = render(<WorkerChatSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-source-header').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-orb-composer-frame').props.style).backgroundColor).toBe(color.mint.white)
    chatView.unmount()

    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.2-ledger-detail' }
    const ledgerView = render(<WorkerEarningsSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-ledger-hero').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-ledger-breakdown').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-ledger-trace').props.style).backgroundColor).toBe(color.mint.white)
    ledgerView.unmount()

    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.8-bank-tax-center' }
    const bankProfileView = render(<WorkerProfileSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-bank-tax-hero').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-rules-list').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-bank-card').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-bank-chip-0').props.style).backgroundColor).toBe(color.mint.white)
    bankProfileView.unmount()

    mockRouteParams = { ns_worker_screen: '5.9-reviews-feedback' }
    const reviewsProfileView = render(<WorkerProfileSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-reviews-hero').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-recent-feedback-list').props.style).backgroundColor).toBe(color.mint.white)
    reviewsProfileView.unmount()

    mockRouteParams = { ns_worker_screen: '5.10-support-settings' }
    render(<WorkerProfileSurface />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-settings-hero').props.style).backgroundColor).toBe(color.mint.white)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-settings-list').props.style).backgroundColor).toBe(color.mint.white)
  })

})

describe('WorkerHomeSurface', () => {
  it('maps the first worker v5 batch into route-param surfaces', () => {
    mockRouteParams = { ns_worker_screen: '1.1-worker-home' }
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_approved: true,
        is_available: true,
        legal_name: 'Hoang Minh',
      }),
    })

    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-v5-screen-1.1-worker-home')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-page-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-home-background-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-hero-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-list-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-home-command-center')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-home-score-ring')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-mint-aura-0')).toBeOnTheScreen()
    expect(screen.queryByText('COMMAND CENTER')).toBeNull()
    expect(screen.queryByText('Đang bật')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-brief-card')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-home-score-ring').props.style).width).toBe(92)
    expect(screen.getByText('Giải quyết công việc hôm nay')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-title-0')).toHaveTextContent('Nhận việc ngay')

    fireEvent.press(screen.getByTestId('worker-v5-quick-action-0'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox')
  })

  it('routes the Stage 1.1 availability switch through the worker backend action', async () => {
    mockRouteParams = { ns_worker_screen: '1.1-worker-home' }
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_approved: true,
        is_available: false,
        legal_name: 'Hoang Minh',
      }),
    })

    render(<WorkerHomeSurface />)

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    expect(availabilitySwitch.props.accessibilityState).toMatchObject({
      checked: false,
      disabled: false,
    })

    fireEvent.press(availabilitySwitch)

    await waitFor(() => expect(mockWorkerUpdateAvailability).toHaveBeenCalledWith(true))
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
        checked: true,
        disabled: false,
      })
    })
  })

  it('keeps the Stage 1.1 availability switch responsive while the backend save is pending', async () => {
    mockRouteParams = { ns_worker_screen: '1.1-worker-home' }
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_approved: true,
        is_available: false,
      }),
    })
    const saves: Array<(value: boolean) => void> = []
    mockWorkerUpdateAvailability = jest.fn(() => new Promise<boolean>((resolve) => saves.push(resolve)))
    mockWorkflowValue.actions.workerUpdateAvailability = mockWorkerUpdateAvailability

    render(<WorkerHomeSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))

    expect(mockWorkerUpdateAvailability).toHaveBeenLastCalledWith(true)
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
      busy: true,
      checked: true,
      disabled: false,
    })

    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))

    expect(mockWorkerUpdateAvailability).toHaveBeenLastCalledWith(false)
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
      busy: true,
      checked: false,
      disabled: false,
    })

    await act(async () => {
      saves[0]?.(true)
      await Promise.resolve()
    })

    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
      checked: false,
      disabled: false,
    })

    await act(async () => {
      saves[1]?.(true)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
        busy: false,
        checked: false,
        disabled: false,
      })
    })
  })

  it('keeps the Stage 1.1 availability title transition constrained to the text node', async () => {
    mockRouteParams = { ns_worker_screen: '1.1-worker-home' }
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_approved: true,
        is_available: false,
      }),
    })

    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-v5-availability-title').props.numberOfLines).toBe(1)
    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đang tắt nhận việc')

    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Sẵn sàng nhận việc')
    })
  })

  it('keeps the Stage 1.1 availability switch on the source mint palette', () => {
    mockRouteParams = { ns_worker_screen: '1.1-worker-home' }
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_approved: true,
        is_available: true,
      }),
    })

    render(<WorkerHomeSurface />)

    const styleProp = screen.getByTestId('worker-v5-availability-switch').props.style
    const sourceSwitchStyle = StyleSheet.flatten(typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp)
    expect(sourceSwitchStyle).toMatchObject({
      backgroundColor: '#16C7B4',
      height: 26,
      width: 44,
    })
  })

  it('keeps Kael estimate disclaimer visible on incoming worker price metrics', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-request-price-disclaimer')).toHaveTextContent(LOCAL_WORKFLOW_PRICE_DISCLAIMER)
  })

  it('uses pending Kael copy when incoming worker price sources are missing', () => {
    const deal = buildIncomingDeal()
    deal.broadcast = deal.broadcast
      ? { ...deal.broadcast, estimatedEarningLabel: undefined, estimatedPriceLabel: undefined }
      : null
    buildWorkflow({ deal })
    render(<WorkerHomeSurface />)

    expect(screen.getByText('Chờ Kael ước tính')).toBeOnTheScreen()
    expect(screen.getByText('Chờ Kael tính tiền công')).toBeOnTheScreen()
  })

  it('renders worker brief artifact lines while keeping the full address locked before accept', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-kael-brief')).toHaveTextContent(/Kael.*ph/)
    expect(within(screen.getByTestId('worker-kael-brief')).getByTestId('worker-request-kael-analyzing')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-general-area-before-accept')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-full-address-after-accept')).toBeNull()
  })

  it('filters generated worker brief lines to the selected language', () => {
    mockAppLanguage = 'en'
    mockRouteParams.ns_worker_lang = 'en'
    const deal = buildIncomingDeal()
    deal.broadcast = deal.broadcast
      ? {
          ...deal.broadcast,
          prebrief: [
            'Kael đã tóm tắt phạm vi trước khi thợ nhận việc.',
            'Kael grouped the key risk before acceptance.',
          ],
        }
      : null
    buildWorkflow({ deal })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-kael-brief')).toHaveTextContent(/Kael grouped the key risk before acceptance\./)
    expect(screen.getByTestId('worker-kael-brief')).not.toHaveTextContent(/tóm tắt phạm vi/)
  })

  it('keeps Vietnamese as the worker default when no worker route language override is present', () => {
    mockAppLanguage = 'en'
    buildWorkflow()

    render(<WorkerHomeSurface />)

    expect(screen.getByText('Giải quyết công việc hôm nay')).toBeOnTheScreen()
    expect(screen.queryByText('Today work resolution')).toBeNull()
  })

  it("renders a suspended raw-online profile as locked offline but still lets the worker turn the raw flag off", async () => {
    await expectCurrentWorkerV5LegacyReplacement("renders a suspended raw-online profile as locked offline but still lets the worker turn the raw flag off")
  })

  it("surfaces worker readiness signals from real profile and request data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("surfaces worker readiness signals from real profile and request data")
  })

  it("greets the worker from the real profile and keeps NestScout service scope", async () => {
    await expectCurrentWorkerV5LegacyReplacement("greets the worker from the real profile and keeps NestScout service scope")
  })

  it("keeps the home screen free of dashboard stat strips", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps the home screen free of dashboard stat strips")
  })

  it("keeps the home map free of fake stat strips while binding real backend profile map fields", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps the home map free of fake stat strips while binding real backend profile map fields")
  })

  it('renders the v1.1 worker home formula layers from the handoff', () => {
    buildWorkflow({ deal: buildIncomingDeal(), workerProfile: buildWorkerProfile({ is_available: true }) })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-v5-home-background-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-hero-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-list-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-mint-aura-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-mint-aura-2')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-quick-action-mint-aura-3')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-brief-card')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-home-score-ring').props.style).width).toBe(92)
  })

  it("does not backfill missing worker map data with a default radius or area chip", async () => {
    await expectCurrentWorkerV5LegacyReplacement("does not backfill missing worker map data with a default radius or area chip")
  })

  it('splits the worker dock into four main tabs and a separate Kael action', () => {
    mockAppLanguage = 'en'
    buildWorkflow()
    render(
      <WorkerDockLayoutProvider>
        <WorkerHomeSurface />
        <WorkerRebuildDockOverlay active="home" />
      </WorkerDockLayoutProvider>,
    )

    expect(screen.getByTestId('worker-dock-motion-shell').props.pointerEvents).toBe('box-none')
    expect(screen.getByTestId('worker-dock-motion-shell').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ bottom: 12 })]),
    )
    expect(screen.getByTestId('worker-dock-split-toolbar')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-split-toolbar').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ alignItems: 'flex-end' })]),
    )
    expect(screen.getByTestId('worker-liquid-glass-dock')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-dock-floating-edge')).toBeNull()
    expect(screen.queryByTestId('worker-dock-lensing-glow')).toBeNull()
    expect(screen.queryByTestId('worker-dock-liquid-sheen')).toBeNull()
    expect(screen.queryByTestId('worker-dock-route-liquid-bridge')).toBeNull()
    expect(screen.queryByTestId('liquid-toolbar-specular-sheen')).toBeNull()
    expect(screen.queryByTestId('worker-dock-source-glass-top-wash')).toBeNull()
    expect(screen.queryByTestId('worker-dock-source-glass-bottom-wash')).toBeNull()
    expect(screen.getByTestId('worker-dock-shimmer')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-caustic')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-caustic-glow')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-inner-refraction')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-home')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-dock-home-active-liquid-motion')).toBeNull()
    expect(screen.queryByTestId('worker-dock-home-active-liquid-sheen')).toBeNull()
    expect(screen.queryByTestId('worker-dock-home-active-soft-edge')).toBeNull()
    expect(screen.getByTestId('worker-dock-lens')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-lens-bloom')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-lens-top-light')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-lens-sheen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-lens-inner-shadow')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-home-image-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-jobs')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-jobs-image-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-earnings')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-earnings-image-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-profile')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-profile-image-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-home').props.accessibilityLabel).toBe('Trang chủ')
    expect(screen.getByTestId('worker-dock-kael').props.accessibilityLabel).toBe('Mở Kael')
    expect(screen.queryByTestId('worker-dock-kael-aura-breathe')).toBeNull()
    expect(screen.queryByTestId('worker-dock-kael-orbit-front-white-arc')).toBeNull()
    expect(screen.queryByTestId('worker-dock-kael-orbit-front-mint-arc')).toBeNull()
    expect(screen.queryByTestId('worker-dock-kael-orbit-front-tail-arc')).toBeNull()
    expect(screen.queryByTestId('worker-dock-kael-orbit-back-white-arc')).toBeNull()
    expect(screen.queryByTestId('worker-dock-kael-orbit-back-mint-arc')).toBeNull()
    expect(screen.queryByTestId('worker-dock-kael-orbit-back-tail-arc')).toBeNull()
    expect(screen.getByTestId('worker-dock-kael-source-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-customer-motion-model')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-orbit-front')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-orbit-front-pearl')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-orbit-back')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-orbit-back-pearl')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-action-glass')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-backdrop')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-dock-kael-backdrop-star')).toBeNull()
    expect(screen.queryByTestId('worker-dock-kael-globe-bottom-bloom')).toBeNull()
    expect(screen.getByTestId('worker-dock-kael-globe-top-highlight')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-orb-caustic')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-orb-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-orb-icon').props.source).toEqual(require('@/assets/navigation/customer/kael.png'))
    expect(screen.getByTestId('worker-dock-kael-glint')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-front-rim')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-status-top-light')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-role-badge-wash')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-dock-jobs'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?tab=waiting')

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-dock-kael'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat')
  })

  it('lets the worker layout own one persistent dock instance for cached tab motion', () => {
    buildWorkflow()
    const { rerender } = render(
      <WorkerDockLayoutProvider>
        <WorkerHomeSurface />
        <WorkerRebuildDockOverlay active="home" />
      </WorkerDockLayoutProvider>,
    )

    expect(screen.getAllByTestId('worker-dock-motion-shell')).toHaveLength(1)
    expect(screen.getByTestId('worker-dock-home').props.accessibilityState.selected).toBe(true)

    rerender(
      <WorkerDockLayoutProvider>
        <WorkerHomeSurface />
        <WorkerRebuildDockOverlay active="jobs" />
      </WorkerDockLayoutProvider>,
    )

    expect(screen.getAllByTestId('worker-dock-motion-shell')).toHaveLength(1)
    expect(screen.getByTestId('worker-dock-jobs').props.accessibilityState.selected).toBe(true)
  })

  it("hides the worker dock while scrolling down and restores it when scrolling up", async () => {
    await expectCurrentWorkerV5LegacyReplacement("hides the worker dock while scrolling down and restores it when scrolling up")
  })
})

describe('WorkerChatSurface', () => {
  it('maps the fourth worker v5 batch to advisory-only Kael intake navigation', () => {
    mockPathname = '/(worker)/chat'
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }
    buildWorkflow({ deal: buildIncomingDeal() })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.2-kael-job-intake')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-open-opportunity'))

    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()
    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.2-offer-detail')
  })

  it('uses the worker v5 Customer-style Kael shell for the standalone chat state', () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-header')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-toggle')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-background-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-transcript')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-composer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-camera-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-composer-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-voice-shell')).toBeNull()
    expect(screen.queryByTestId('worker-v5-mode-tab-case')).toBeNull()
    expect(screen.queryByTestId('worker-chat-reference-top-controls')).toBeNull()
    expect(screen.queryByTestId('worker-chat-static-empty-state')).toBeNull()
    expect(screen.queryByTestId('worker-kael-feedback-input')).toBeNull()
    expect(screen.queryByTestId('worker-kael-chat-attach')).toBeNull()
    expect(screen.queryByTestId('worker-kael-feedback-open')).toBeNull()
    expect(screen.queryByTestId('worker-kael-chat-mic')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-send')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-input').props.placeholder).toContain('Kael')
    expect(mockUseJobChatThread).not.toHaveBeenCalled()
  })

  it('keeps the Stage 3.1 Kael source copy stable in Vietnamese with a worker profile present', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-01T12:10:00+07:00').getTime())
    mockPathname = '/(worker)/chat'
    mockAppLanguage = 'vi'
    buildWorkflow({ workerProfile: buildWorkerProfile({ legal_name: '  Phan   Manh Tu  ' }) })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-title')).toHaveTextContent('Kael')
    expect(screen.queryByText(/Phan Manh Tu/)).toBeNull()
    expect(screen.queryByText('Lunch, Phan Manh Tu')).toBeNull()
    expect(screen.queryByText(/Worker QA/)).toBeNull()
    nowSpy.mockRestore()
  })

  it('keeps the Stage 3.1 Kael source copy honest when the worker profile has no name', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-01T15:30:00+07:00').getTime())
    mockPathname = '/(worker)/chat'
    buildWorkflow({ workerProfile: buildWorkerProfile({ legal_name: null }) })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-title')).toHaveTextContent('Kael')
    expect(screen.queryByText(/Xin ch/)).toBeNull()
    expect(screen.queryByText('Afternoon, there')).toBeNull()
    expect(screen.queryByText(/Worker QA/)).toBeNull()
    nowSpy.mockRestore()
  })
  it('lets the standalone Kael orb composer accept and clear a local draft without faking a backend send', async () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Kael oi')
    expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe('Kael oi')

    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe(''))
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
    expect(mockUseJobChatThread).not.toHaveBeenCalled()
  })

  it('opens the Kael orb media picker as a local advisory attachment without uploading to JobRoom', async () => {
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ fileName: 'repair-note.jpg', fileSize: 1234, mimeType: 'image/jpeg', uri: 'file:///repair-note.jpg' }],
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    expect(screen.queryByTestId('worker-v5-kael-orb-camera-count')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-camera'))

    await waitFor(() => expect(imagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled())
    await waitFor(() => expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('worker-v5-kael-orb-camera-count')).toHaveTextContent('1'))
    expect(mockUploadJobMediaDrafts).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })

  it('clears Kael orb local media and text on send without persisting private worker chat state', async () => {
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ fileName: 'onsite-burnt-wire.jpg', fileSize: 4321, mimeType: 'image/jpeg', uri: 'file:///onsite-burnt-wire.jpg' }],
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-camera'))
    await waitFor(() => expect(screen.getByTestId('worker-v5-kael-orb-camera-count')).toHaveTextContent('1'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Kael xem ảnh giúp tôi')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => expect(screen.queryByTestId('worker-v5-kael-orb-camera-count')).toBeNull())
    expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe('')
    expect(mockUploadJobMediaDrafts).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })

  it('keeps removed worker private chat controls out of the Kael orb surface', () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    expect(screen.queryByTestId('worker-kael-training-consent-toggle')).toBeNull()
    expect(screen.queryByText('Cho phép học')).toBeNull()
    expect(screen.queryByText('Không dùng để học')).toBeNull()
    expect(screen.queryByTestId('worker-kael-feedback-input')).toBeNull()
    expect(screen.queryByTestId('worker-kael-chat-attach')).toBeNull()
    expect(screen.queryByTestId('worker-kael-feedback-open')).toBeNull()
    expect(screen.queryByTestId('worker-kael-chat-mic')).toBeNull()
    expect(mockWorkerKaelChatService.setTrainingConsent).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.submitFeedback).not.toHaveBeenCalled()
  })

  it('keeps accepted active Kael orb advisory local without opening the JobRoom relay', () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-input')).toBeOnTheScreen()
    expect(mockUseJobChatThread).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })

  it('does not expose removed Stage 3.4 as a JobRoom relay from the worker Kael section', async () => {
    const send = jest.fn(async () => true)
    mockUseJobChatThread.mockReturnValue({
      error: null,
      loading: false,
      messages: [],
      refresh: jest.fn(),
      send,
      sendMessage: jest.fn(async () => true),
      sending: false,
    })
    mockPathname = '/(worker)/chat'
    mockRouteParams = { ns_worker_screen: '3.4-job-room-chat' }
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-header')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-job-room-thread-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-private-kael-chat-normal')).toBeNull()
    expect(send).not.toHaveBeenCalled()
    expect(mockUseJobChatThread).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })

  it('does not expose removed Stage 3.3 as a case-work screen from the worker Kael section', async () => {
    mockPathname = '/(worker)/chat'
    mockRouteParams = { ns_worker_screen: '3.3-kael-case-work' }
    buildWorkflow({ deal: buildRepairingDeal() })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-source-header')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-onsite-advisory-rail')).toBeNull()
    expect(screen.queryByTestId('worker-v5-case-work-hero')).toBeNull()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
    expect(screen.queryByText('--')).toBeNull()
  })

  it('keeps worker Kael orb sends free of stale private progress state', async () => {
    mockWorkerKaelChatService.create.mockResolvedValueOnce({
      data: {
        session: buildWorkerKaelSession({ jobId: 'job_other', sessionId: 'worker-kael-session-stale' }),
        turns: [],
      },
      status: 201,
      success: true,
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Need current-job advice')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe(''))
    expect(screen.queryByTestId('worker-kael-chat-progress')).toBeNull()
    expect(screen.queryByText(/80%/)).toBeNull()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.get).not.toHaveBeenCalled()
  })

  it('does not recover persisted private worker Kael sessions from the current orb surface', async () => {
    mockWorkerKaelChatService.get.mockResolvedValueOnce(buildWorkerKaelResponse({
      answer: 'Recovered persisted Kael answer.',
      message: 'Need recovered advice',
      progress: buildWorkerKaelProgress(1),
      sessionId: 'worker-kael-session-1',
    }))
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Need recovered advice')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe(''))
    expect(screen.queryByText('Recovered persisted Kael answer.')).toBeNull()
    expect(mockWorkerKaelChatService.get).not.toHaveBeenCalled()
  })

  it('recovers the rebuild worker Kael surface from the persisted session when streaming fails', async () => {
    mockWorkerKaelChatService.streamTurn.mockResolvedValueOnce({
      code: 'STREAM_ENDED',
      error: 'Kael stream ended before a result.',
      status: 200,
      success: false,
    })
    mockWorkerKaelChatService.get.mockResolvedValueOnce(buildWorkerKaelResponse({
      answer: 'Recovered rebuild Kael answer.',
      message: 'Need rebuild recovery',
      progress: buildWorkerKaelProgress(1),
      sessionId: 'worker-kael-session-1',
    }))
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<RebuildWorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'Need rebuild recovery')
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(mockWorkerKaelChatService.get).toHaveBeenCalledWith('worker-kael-session-1'))
    await waitFor(() => expect(screen.getByText('Recovered rebuild Kael answer.')).toBeOnTheScreen())
    expect(screen.getByTestId('worker-kael-chat-progress')).toHaveTextContent(/100%/)
  })

  it('blocks rapid rebuild worker Kael sends while the first turn is still streaming', async () => {
    let resolveStream!: () => void
    mockWorkerKaelChatService.streamTurn.mockImplementationOnce((_sessionId: string, input: { message: string }, handlers?: any) => {
      handlers?.onStage?.({
        progress: buildWorkerKaelProgress(0.35),
        type: 'stage',
      })
      return new Promise((resolve) => {
        resolveStream = () => resolve(buildWorkerKaelResponse({
          answer: 'First rebuild turn completed.',
          message: input.message,
          progress: buildWorkerKaelProgress(1),
          sessionId: 'worker-kael-session-1',
        }))
      })
    })
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<RebuildWorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'First rebuild question')
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('worker-kael-chat-input').props.editable).toBe(false))
    expect(screen.getByTestId('worker-kael-send-button').props.accessibilityState.disabled).toBe(true)
    expect(screen.getByTestId('worker-kael-chat-attach').props.accessibilityState.disabled).toBe(true)
    expect(screen.getByTestId('worker-kael-chat-mic').props.accessibilityState.disabled).toBe(true)

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'Second rebuild question while pending')
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
    expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1)
    expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
      'worker-kael-session-1',
      expect.objectContaining({ message: 'First rebuild question' }),
      expect.anything(),
    )

    await act(async () => {
      resolveStream()
    })

    await waitFor(() => expect(screen.getByText('First rebuild turn completed.')).toBeOnTheScreen())
    expect(screen.getByTestId('worker-kael-chat-progress')).toHaveTextContent(/100%/)
  })

  it('resets rebuild worker Kael busy state after switching jobs mid-stream', async () => {
    let resolveFirstStream!: () => void
    mockWorkerKaelChatService.create
      .mockResolvedValueOnce({
        data: {
          session: buildWorkerKaelSession({ jobId: 'job_test_1', sessionId: 'worker-kael-session-1' }),
          turns: [],
        },
        status: 201,
        success: true,
      })
      .mockResolvedValueOnce({
        data: {
          session: buildWorkerKaelSession({ jobId: 'job_other', sessionId: 'worker-kael-session-2' }),
          turns: [],
        },
        status: 201,
        success: true,
      })
    mockWorkerKaelChatService.streamTurn
      .mockImplementationOnce((_sessionId: string, input: { message: string }) => new Promise((resolve) => {
        resolveFirstStream = () => resolve(buildWorkerKaelResponse({
          answer: 'Old job response should stay hidden.',
          message: input.message,
          progress: buildWorkerKaelProgress(1),
          sessionId: 'worker-kael-session-1',
        }))
      }))
      .mockResolvedValueOnce(buildWorkerKaelResponse({
        answer: 'New job response completed.',
        jobId: 'job_other',
        message: 'New job question',
        progress: buildWorkerKaelProgress(1),
        sessionId: 'worker-kael-session-2',
      }))
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    const view = render(<RebuildWorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'Old job question')
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('worker-kael-chat-input').props.editable).toBe(false))

    buildWorkflow({ deal: buildAcceptedDealForJob('job_other') })
    view.rerender(<RebuildWorkerChatSurface />)

    await waitFor(() => expect(screen.getByTestId('worker-kael-chat-input').props.editable).toBe(true))

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'New job question')
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(2))
    expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(2)
    expect(mockWorkerKaelChatService.streamTurn.mock.calls.map((call) => call[0])).toEqual([
      'worker-kael-session-1',
      'worker-kael-session-2',
    ])

    await waitFor(() => expect(screen.getByText('New job response completed.')).toBeOnTheScreen())

    await act(async () => {
      resolveFirstStream()
    })

    expect(screen.queryByText('Old job response should stay hidden.')).toBeNull()
  })

  it('clears rebuild worker Kael progress when recovered stream state belongs to another job', async () => {
    mockWorkerKaelChatService.streamTurn.mockImplementationOnce((_sessionId: string, _input: { message: string }, handlers?: any) => {
      handlers?.onStage?.({
        progress: buildWorkerKaelProgress(0.4),
        type: 'stage',
      })
      return Promise.resolve({
        code: 'STREAM_ENDED',
        error: 'Kael stream ended before a result.',
        status: 200,
        success: false,
      })
    })
    mockWorkerKaelChatService.get.mockResolvedValueOnce(buildWorkerKaelResponse({
      answer: 'Wrong-job rebuild Kael answer.',
      jobId: 'job_other',
      message: 'Need current job only',
      progress: buildWorkerKaelProgress(1),
      sessionId: 'worker-kael-session-1',
    }))
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<RebuildWorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'Need current job only')
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(mockWorkerKaelChatService.get).toHaveBeenCalledWith('worker-kael-session-1'))
    await waitFor(() => expect(screen.queryByTestId('worker-kael-chat-progress')).toBeNull())
    expect(screen.getByText('Kael ignored a response that did not match the current work.')).toBeOnTheScreen()
    expect(screen.queryByText('Wrong-job rebuild Kael answer.')).toBeNull()
  })

  it('keeps late private worker SSE state inert after the Kael orb rerenders for another job', async () => {
    mockWorkerKaelChatService.streamTurn.mockImplementationOnce(() => pendingWorkerKaelServiceCall())
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    const view = render(<WorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Need old-job advice')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    buildWorkflow({ deal: buildAcceptedDealForJob('job_other') })
    view.rerender(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-private-kael-chat-normal')).toBeNull()
    expect(screen.queryByTestId('worker-kael-chat-progress')).toBeNull()
    expect(screen.queryByText(/Late stale worker token|20%|40%/)).toBeNull()
    expect(mockUseJobChatThread).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })

  it('keeps accepted and payment-gated Kael orb messages local without relaying to JobRoom', async () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildPaymentPendingDeal() })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Đã tới nơi')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe(''))
    expect(screen.queryByTestId('worker-kael-chat-progress')).toBeNull()
    expect(mockUseJobChatThread).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })

  it('keeps the Stage 3.1 and 3.2 worker Kael batch spaced and free of source demo opportunities', () => {
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/chat'

    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    buildWorkflow()
    const normalView = render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-orb-background-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-toggle')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-transcript')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-composer-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-orb-boundary')).toBeNull()
    expect(screen.queryByTestId('worker-v5-mode-tab-case')).toBeNull()
    expect(screen.queryByTestId('worker-v5-suggestion-chips')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-input').props.placeholder).toContain('Kael')
    normalView.unmount()

    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }
    buildWorkflow({ deal: buildIncomingDeal() })
    const intakeView = render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-toggle')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-opportunities')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-open-opportunity')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-orb-boundary')).toBeNull()
    expect(screen.queryByTestId('worker-v5-mode-tab-case')).toBeNull()
    expect(screen.queryByTestId('worker-v5-suggestion-chips')).toBeNull()
    expect(screen.queryByText(/air conditioner|camera|washing machine|may lanh|may giat/i)).toBeNull()
    expect(screen.queryByText(/5\.0|\+18|fake|demo/i)).toBeNull()
    intakeView.unmount()
  })

  it('does not expose removed worker v5 Kael stages 3.5 through 3.8', () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildScopeChangePendingDeal() })

    for (const legacyStage of ['3.5-kael-command-center', '3.6-worker-approval-queue', '3.7-case-timeline', '3.8-safety-escalation']) {
      mockRouteParams = { ns_worker_screen: legacyStage }
      const view = render(<WorkerChatSurface />)

      expect(screen.getByTestId('worker-v5-kael-customer-frame')).toBeOnTheScreen()
      expect(screen.queryByTestId('worker-v5-command-center-hero')).toBeNull()
      expect(screen.queryByTestId('worker-v5-approval-queue-hero')).toBeNull()
      expect(screen.queryByTestId('worker-v5-timeline-hero')).toBeNull()
      expect(screen.queryByTestId('worker-v5-safety-hero')).toBeNull()

      view.unmount()
    }
  })
})

describe('WorkerJobsSurface', () => {
  it('routes the opportunity inbox to offer detail before any accept action', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.1-opportunity-inbox' }
    buildWorkflow({ deal: buildIncomingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-inbox-tab-matches').props.accessibilityState).toMatchObject({ selected: true })

    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.2-offer-detail')
    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-inbox-tab-new'))

    expect(screen.getByTestId('worker-v5-inbox-tab-new').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-opportunity-card')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-inbox-tab-saved'))

    expect(screen.getByTestId('worker-v5-inbox-tab-saved').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-opportunity-empty-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-opportunity-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-primary-action').props.accessibilityState).toMatchObject({ disabled: true })

    fireEvent.press(screen.getByTestId('worker-v5-inbox-tab-matches'))

    expect(screen.getByTestId('worker-v5-inbox-tab-matches').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-opportunity-card')).toBeOnTheScreen()

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-opportunity-map-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=1.3-demand-map')
    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()
  })

  it('renders the Stage 2.1 handoff empty state without old hero copy or fabricated opportunities', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.1-opportunity-inbox' }
    buildWorkflow({ deal: null })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-opportunity-header-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-filter')).toBeOnTheScreen()
    expect(screen.getByText('Hộp thư cơ hội')).toBeOnTheScreen()
    expect(screen.getByText('Kael đã lọc theo kỹ năng, bán kính và lịch trống')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-inbox-handoff')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-empty-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-inbox-tab-matches').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.queryByTestId('worker-v5-opportunity-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.getByText('Mới · Chưa có')).toBeOnTheScreen()
    expect(screen.getByText('Chưa có cơ hội phù hợp')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-primary-action').props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.queryByText(/M\?i|tr\?ng|t\?i th\?|d\? x\?p/i)).toBeNull()
  })

  it('keeps the Stage 2.1 new and saved tabs openable without fabricating opportunities', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.1-opportunity-inbox' }
    buildWorkflow({ deal: null })

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-inbox-tab-new'))

    expect(screen.getByTestId('worker-v5-inbox-tab-new').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-opportunity-empty-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-opportunity-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-primary-action').props.accessibilityState).toMatchObject({ disabled: true })

    fireEvent.press(screen.getByTestId('worker-v5-inbox-tab-saved'))

    expect(screen.getByTestId('worker-v5-inbox-tab-saved').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-opportunity-empty-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-opportunity-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-primary-action').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('renders Stage 2.2 from the handoff structure and keeps actions explicit', async () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }
    buildWorkflow({ deal: buildIncomingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-offer-detail-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-detail-summary-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-page-lower-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-summary-chip-row')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-summary-chip-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-summary-chip-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-summary-chip-2')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-address-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-address-list-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-request-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-offer-request-list-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-offer-kael-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-job-meta-pills')).toBeNull()
    expect(screen.queryByTestId('worker-v5-hero-mint-aura')).toBeNull()
    expect(screen.queryByText(/Case |M\?i|d\? m\?|Xem k\?/i)).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-offer-continue-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.3-accept-review')
    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('worker-v5-offer-decline-action'))

    await waitFor(() => expect(mockWorkflowValue.actions.workerDeclineBroadcast).toHaveBeenCalled())
    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()
  })

  it('keeps the second worker v5 batch text lanes spaced for long real content', () => {
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }
    const offerDeal = buildIncomingDeal()
    offerDeal.broadcast = offerDeal.broadcast
      ? {
        ...offerDeal.broadcast,
        estimatedEarningLabel: '1,200,000 VND - 1,800,000 VND',
        generalArea: 'District 1 service corridor near Nguyen Hue apartment towers',
      }
      : null
    buildWorkflow({ deal: offerDeal })

    const offerView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-offer-summary-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-offer-summary-meta').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-offer-summary-price').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-offer-summary-price').props.style).minWidth).toBe(86)
    offerView.unmount()

    mockRouteParams = { ns_worker_screen: '2.5-arrival-checkin' }
    buildWorkflow({ deal: buildInspectingDealWithReleasedAddress() })
    const checkInView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-checkin-label-2').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-checkin-meta-0').props.style).maxWidth).toBe(86)
    checkInView.unmount()

    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow({ deal: buildRepairingDealWithKaelChecklist() })
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-step-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-step-meta-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-step-meta-0').props.style).maxWidth).toBe(86)
  })

  it('keeps the third worker v5 batch aura and text lanes spaced without demo approval shortcuts', () => {
    mockPathname = '/(worker)/jobs'
    mockAppLanguage = 'en'

    const baseProgressDeal = buildRepairingDeal()
    const progressDeal: LocalDeal = {
      ...baseProgressDeal,
      broadcast: baseProgressDeal.broadcast
        ? {
          ...baseProgressDeal.broadcast,
          prebrief: [
            'Inspect the electrical cabinet and document the breaker condition before touching the circuit.',
            'Confirm the replacement wire path with the resident and keep the accepted scope unchanged.',
            'Photograph the final load test and note any source that still needs customer approval.',
          ],
        }
        : null,
      completionPhotoUrls: ['file:///progress-before.jpg', 'file:///progress-detail.jpg'],
    }
    buildWorkflow({ deal: progressDeal })
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    const inProgressView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-in-progress-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-timer-caption').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-timer-card').props.style).position).toBe('relative')
    inProgressView.unmount()

    const baseScopeDeal = buildScopeChangePendingDeal()
    const noReviewedPriceScopeDeal: LocalDeal = {
      ...baseScopeDeal,
      scopeChange: baseScopeDeal.scopeChange
        ? {
          ...baseScopeDeal.scopeChange,
          priceMax: null,
          priceMin: null,
        }
        : null,
    }
    buildWorkflow({ deal: noReviewedPriceScopeDeal })
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }
    const noReviewedPriceView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-price-total-value')).toHaveTextContent(/^0$/)
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    noReviewedPriceView.unmount()

    const scopeDeal: LocalDeal = {
      ...baseScopeDeal,
      scopeChange: baseScopeDeal.scopeChange
        ? {
          ...baseScopeDeal.scopeChange,
          evidencePhotoUrls: ['file:///scope-source-one.jpg', 'file:///scope-source-two.jpg'],
          priceMax: 395000,
          priceMin: 300000,
          reason: 'Resident shared a real source photo and the exposed cable path is outside the accepted repair.',
          requestedDescription: 'Replace the exposed electrical cable segment behind the kitchen cabinet safely.',
        }
        : null,
    }
    buildWorkflow({ deal: scopeDeal })
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }
    const scopeView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-scope-change-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-price-line-label-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-price-line-value-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-price-line-value-0').props.style).minWidth).toBe(92)
    expect(screen.getByTestId('worker-v5-price-total-value')).toHaveTextContent(/300\.000/)
    expect(screen.getByTestId('worker-v5-price-total-value')).toHaveTextContent(/395\.000/)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-price-total-value').props.style).minWidth).toBe(98)
    scopeView.unmount()

    buildWorkflow({ deal: scopeDeal })
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }
    const approvalView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-approval-wait-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-amount').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-approval-timeline-title-0').props.numberOfLines).toBe(2)
    expect(screen.queryByText(/simulate|mo phong/i)).toBeNull()
    approvalView.unmount()

    const completionDeal: LocalDeal = {
      ...buildRepairingDeal(),
      completionNotes: 'Replaced the outlet and verified the load test after the repair.',
      completionPhotoUrls: ['file:///after-panel.jpg', 'file:///after-switch.jpg'],
    }
    buildWorkflow({ deal: completionDeal })
    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    const completionView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-completion-evidence-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-final-check-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-final-check-meta-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-final-check-meta-0').props.style).minWidth).toBe(48)
    completionView.unmount()

    const submittedDeal: LocalDeal = {
      ...buildCompletedByWorkerDeal(),
      payment: {
        grossAmount: 520000,
        platformFee: 48000,
        provider: 'bank_transfer',
        status: 'reconciled',
        workerNet: 472000,
      },
    }
    buildWorkflow({ deal: submittedDeal })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-completion-submitted-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-completion-submitted-background-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-success-emblem-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-success-check-fill')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settlement-cell-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settlement-cell-zip-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-submission-timeline-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-settlement-value-0').props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-settlement-value-0').props.style).fontSize).toBe(12)
    expect(screen.queryByText(/simulate|mo phong/i)).toBeNull()
  })

  it('lets Stage 2.7 capture or choose on-site evidence through the real media picker boundary', async () => {
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchCameraAsync.mockResolvedValueOnce({
      assets: [{ fileName: 'field-camera.jpg', uri: 'file:///field-camera.jpg' }],
      canceled: false,
    })
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      assets: [
        { fileName: 'field-library-one.jpg', uri: 'file:///field-library-one.jpg' },
        { fileName: 'field-library-two.jpg', uri: 'file:///field-library-two.jpg' },
        { fileName: 'field-library-three.jpg', uri: 'file:///field-library-three.jpg' },
      ],
      canceled: false,
    })
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      assets: [
        { fileName: 'field-library-four.jpg', uri: 'file:///field-library-four.jpg' },
        { fileName: 'field-library-five.jpg', uri: 'file:///field-library-five.jpg' },
        { fileName: 'field-library-six.jpg', uri: 'file:///field-library-six.jpg' },
      ],
      canceled: false,
    })
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow({ deal: buildRepairingDealWithKaelChecklist() })

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-in-progress-camera-action'))
    await waitFor(() => expect(imagePicker.requestCameraPermissionsAsync).toHaveBeenCalled())
    await waitFor(() => expect(imagePicker.launchCameraAsync).toHaveBeenCalled())
    await waitFor(() => expect(mockUploadJobMediaDrafts).toHaveBeenCalledWith(
      'job_test_1',
      expect.arrayContaining([expect.objectContaining({ type: 'image', uri: 'file:///field-camera.jpg' })]),
      'before',
    ))

    fireEvent.press(screen.getByTestId('worker-v5-in-progress-library-action'))
    await waitFor(() => expect(imagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled())
    await waitFor(() => expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalled())
    await waitFor(() => expect(mockUploadJobMediaDrafts).toHaveBeenCalledWith(
      'job_test_1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', uri: 'file:///field-library-one.jpg' }),
        expect.objectContaining({ type: 'image', uri: 'file:///field-library-two.jpg' }),
        expect.objectContaining({ type: 'image', uri: 'file:///field-library-three.jpg' }),
      ]),
      'before',
    ))
    expect(screen.getByTestId('worker-v5-evidence-tray-tile-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray-tile-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray-tile-2')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray-badge-2')).toHaveTextContent('+2')

    fireEvent.press(screen.getByTestId('worker-v5-in-progress-library-action'))
    await waitFor(() => expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockUploadJobMediaDrafts).toHaveBeenCalledWith(
      'job_test_1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', uri: 'file:///field-library-four.jpg' }),
        expect.objectContaining({ type: 'image', uri: 'file:///field-library-five.jpg' }),
        expect.objectContaining({ type: 'image', uri: 'file:///field-library-six.jpg' }),
      ]),
      'before',
    ))
    expect(screen.getByTestId('worker-v5-evidence-tray-badge-2')).toHaveTextContent('+5')
  })

  it('keeps the case closed worker v5 screen honest and spaced', () => {
    mockAppLanguage = 'vi'
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    const closedDeal: LocalDeal = {
      ...buildConfirmedCompletionDeal(),
      createdAt: '2026-06-11T08:00:00.000Z',
      matchedAt: '2026-06-11T08:15:00.000Z',
      completedAt: '2026-06-11T10:00:00.000Z',
      confirmedAt: '2026-06-11T10:05:00.000Z',
      payment: {
        grossAmount: 520000,
        platformFee: 48000,
        provider: 'bank_transfer',
        status: 'reconciled',
        workerNet: 472000,
      },
    }
    buildWorkflow({
      deal: closedDeal,
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.7,
        performance_score: 84,
      }),
    })

    const closedView = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-case-closed-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-closed-check-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-closed-check-fill')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-closed-title').props.numberOfLines).toBe(2)
    expect(screen.queryByText(workerV5DefaultViText['2.12-case-closed'])).toBeNull()
    expect(screen.getByTestId('worker-v5-case-closed-amount')).toHaveTextContent(/472\.000|472,000/)
    expect(screen.queryByText(/No real income yet/i)).toBeNull()
    expect(screen.getByTestId('worker-v5-case-closed-title')).toHaveTextContent('Hoàn tất công việc')
    expect(screen.queryByText(/NestScout sẽ mở màn này|Case có trạng thái đóng|Khách đã xác nhận/i)).toBeNull()
    expect(screen.getByTestId('worker-v5-case-closed-status').props.numberOfLines).toBe(2)
    expect(screen.queryByText(/^Case job_test_1$/)).toBeNull()
    expect(screen.queryByText(/Case waiting for customer approval/i)).toBeNull()
    expect(screen.getByTestId('worker-v5-info-cell-value-0')).toHaveTextContent(/4\.7/)
    expect(screen.getByTestId('worker-v5-info-cell-value-1')).toHaveTextContent('1 giờ 45 phút')
    expect(screen.getByTestId('worker-v5-info-cell-value-2')).toHaveTextContent('+84')
    expect(screen.getByTestId('worker-v5-case-trail-row-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-trail-row-zip-mint-aura-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-trail-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-case-trail-status-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-case-trail-status-0').props.style).maxWidth).toBe(86)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-case-trail-status-0').props.style).textAlign).toBe('center')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-case-trail-status-0').props.style).minWidth).toBe(64)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-case-trail-icon-0').props.style).height).toBe(40)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-case-trail-icon-1').props.style).width).toBe(40)
    expect(screen.queryByText(/5\.0|5,0|\+18|five star|5 sao/i)).toBeNull()
    closedView.unmount()

    buildWorkflow({ deal: null })
    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-closed-title')).toHaveTextContent('Chưa hoàn tất công việc')
    expect(screen.queryByText(workerV5DefaultViText['2.12-case-closed'])).toBeNull()
    expect(screen.getByTestId('worker-v5-case-closed-amount')).toHaveTextContent('0')
    expect(screen.queryByText(/No real income yet/i)).toBeNull()
    expect(screen.queryByText(/NestScout sẽ mở màn này|Case có trạng thái đóng|Khách đã xác nhận/i)).toBeNull()
  })

  it('maps the second worker v5 batch to explicit worker accept action', async () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.3-accept-review' }
    const deal = buildIncomingDeal()
    buildWorkflow({
      deal: {
        ...deal,
        broadcast: deal.broadcast
          ? {
            ...deal.broadcast,
            prebrief: [...deal.broadcast.prebrief, 'ETA di chuyển 12 phút'],
          }
          : null,
      },
    })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.3-accept-review')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-page-customer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-page-customer-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-summary-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-summary-zip-mint-aura')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-card').props.style).backgroundColor).toBe('rgba(244,255,252,0.88)')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-card').props.style).borderColor).toBe('rgba(161,235,224,0.62)')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-zip-mint-aura').props.style).opacity).toBe(0.78)
    expect(screen.queryByText('Bạn quyết định')).toBeNull()
    expect(screen.getByTestId('worker-v5-accept-checklist-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-checklist-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-check-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-check-row-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-check-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-check-2')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-commitment')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-commitment-title')).toHaveTextContent('Di chuyển trong 12 phút')
    expect(screen.getByTestId('worker-v5-accept-commitment-meta')).toHaveTextContent(/quãng đường/)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-card').props.style).justifyContent).toBe('center')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-copy').props.style).justifyContent).toBe('center')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-copy').props.style).alignSelf).toBe('stretch')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-icon-tile').props.style).alignItems).toBe('center')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-icon-tile').props.style).justifyContent).toBe('center')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-price-slot').props.style).alignItems).toBe('center')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-accept-summary-price-slot').props.style).justifyContent).toBe('center')
    expect(screen.getByTestId('worker-v5-accept-boundary-note')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-boundary-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-confirm-formula-fill')).toBeOnTheScreen()
    const workerSource = readFileSync(join(__dirname, '../worker-v5-flow.tsx'), 'utf8')
    expect(workerSource).toContain("['#2DD4BF', '#20CDB9', '#12BCAA', '#069889', '#008579']")
    expect(workerSource).toContain('offset="0.52" stopColor="#12BCAA"')
    expect(workerSource).toContain('stopColor="#008579"')
    expect(screen.queryByTestId('worker-v5-authority-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-primary-gradient')).toBeNull()
    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('worker-v5-accept-confirm-action'))

    await waitFor(() => expect(mockWorkflowValue.actions.workerAcceptBroadcast).toHaveBeenCalled())
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.4-route-eta')
  })

  it('keeps Stage 2.3 clean when the real earning value has not synced yet', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.3-accept-review' }
    const deal = buildIncomingDeal()
    buildWorkflow({
      deal: {
        ...deal,
        broadcast: deal.broadcast
          ? {
            ...deal.broadcast,
            estimatedEarningLabel: undefined,
          }
          : null,
      },
    })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-accept-summary-price')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-accept-commitment-title')).toHaveTextContent('Đang đo thời gian đến')
    expect(screen.getByTestId('worker-v5-accept-commitment-title')).not.toHaveTextContent(/ETA/)
    expect(screen.queryByTestId('worker-v5-accept-commitment-meta')).toBeNull()
    expect(screen.queryByText('Bạn quyết định')).toBeNull()
    expect(screen.queryByText('Cam kết chỉ mở khi có đề nghị thật từ NestScout.')).toBeNull()
    expect(screen.getByTestId('worker-v5-accept-check-row-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-boundary-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-confirm-formula-fill')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-primary-gradient')).toBeNull()
  })

  it('keeps Stage 2.3 accept CTA pressable when the backend broadcast is still sent', async () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.3-accept-review' }
    const deal = buildIncomingDeal()
    buildWorkflow({
      deal: {
        ...deal,
        status: 'draft',
      },
    })
    mockWorkflowValue.selectors.canWorkerAccept = false

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-accept-check-0')).toHaveTextContent(/Đạt/)
    expect(screen.getByTestId('worker-v5-accept-confirm-action').props.accessibilityState).toMatchObject({ disabled: false })
    fireEvent.press(screen.getByTestId('worker-v5-accept-confirm-action'))

    await waitFor(() => expect(mockWorkflowValue.actions.workerAcceptBroadcast).toHaveBeenCalledTimes(1))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.4-route-eta')
  })

  it('wires Stage 2.4 and Stage 2.5 handoff actions to the real worker workflow', async () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.4-route-eta' }
    buildWorkflow({ deal: buildAcceptedDeal() })

    const routeEtaView = render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-route-contact-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal')
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-route-arrival-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.5-arrival-checkin')
    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    routeEtaView.unmount()

    mockReplace.mockClear()
    mockRouteParams = { ns_worker_screen: '2.5-arrival-checkin' }
    buildWorkflow({ deal: buildAcceptedDeal() })
    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-checkin-contact-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal')
    mockReplace.mockClear()

    fireEvent.press(screen.getByTestId('worker-v5-checkin-arrived-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
  })

  it('routes Stage 2.10 completion action directly to Stage 2.11 without a backend mutation', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    const deal = {
      ...buildRepairingDeal(),
      completionNotes: 'Đã kiểm tra tải và chụp ảnh sau sửa.',
      completionPhotoUrls: ['file:///after-repair.jpg'],
    }
    buildWorkflow({ deal })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.10-completion-evidence')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-completion-submit-action'))

    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.11-completion-submitted')
  })

  it("defaults the Jobs route to the waiting request section", async () => {
    await expectCurrentWorkerV5LegacyReplacement("defaults the Jobs route to the waiting request section")
  })

  it("keeps waiting jobs focused on the request content without the summary strip", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps waiting jobs focused on the request content without the summary strip")
  })

  it("shows incoming request phase context while keeping the full address locked", async () => {
    await expectCurrentWorkerV5LegacyReplacement("shows incoming request phase context while keeping the full address locked")
  })

  it("routes a confirmed waiting request into the active job flow", async () => {
    await expectCurrentWorkerV5LegacyReplacement("routes a confirmed waiting request into the active job flow")
  })

  it("does not expose Needs evidence before the worker has a confirmed work case", async () => {
    await expectCurrentWorkerV5LegacyReplacement("does not expose Needs evidence before the worker has a confirmed work case")
  })

  it("opens the worker safety checklist audit preview directly without backend deal data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker safety checklist audit preview directly without backend deal data")
  })

  it("opens the worker scope-change audit preview directly without backend deal data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker scope-change audit preview directly without backend deal data")
  })

  it("opens the worker completion evidence audit preview directly without backend deal data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker completion evidence audit preview directly without backend deal data")
  })

  it("opens the worker job summary audit preview directly after completion evidence", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker job summary audit preview directly after completion evidence")
  })

  it("opens the worker summary report audit preview directly after job summary", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker summary report audit preview directly after job summary")
  })

  it("opens the worker payment gate audit preview directly after the final report", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker payment gate audit preview directly after the final report")
  })

  it("expands the worker wallet transaction history from real earnings data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("expands the worker wallet transaction history from real earnings data")
  })

  it("opens the worker receiving method audit section directly", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker receiving method audit section directly")
  })

  it("opens the worker withdraw audit section directly", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker withdraw audit section directly")
  })

  it("opens the worker case closed audit preview without fabricated payment data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker case closed audit preview without fabricated payment data")
  })

  it("opens the worker scope evidence form audit preview directly without backend deal data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker scope evidence form audit preview directly without backend deal data")
  })

  it("reveals the full address only after backend release on an accepted job", async () => {
    await expectCurrentWorkerV5LegacyReplacement("reveals the full address only after backend release on an accepted job")
  })

  it("keeps active jobs on the same operational tile hierarchy", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps active jobs on the same operational tile hierarchy")
  })

  it("renders the active Jobs row from the real accepted job data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("renders the active Jobs row from the real accepted job data")
  })

  it("aligns the active Jobs card to the reference list skeleton without fabricating another job", async () => {
    await expectCurrentWorkerV5LegacyReplacement("aligns the active Jobs card to the reference list skeleton without fabricating another job")
  })

  it("renders safety checklist gates from the active workflow without a worker price input", async () => {
    await expectCurrentWorkerV5LegacyReplacement("renders safety checklist gates from the active workflow without a worker price input")
  })

  it("renders a Kael-derived safety checklist without advancing job status directly", async () => {
    await expectCurrentWorkerV5LegacyReplacement("renders a Kael-derived safety checklist without advancing job status directly")
  })

  it("routes completion from Active to Needs evidence without direct status update", async () => {
    await expectCurrentWorkerV5LegacyReplacement("routes completion from Active to Needs evidence without direct status update")
  })

  it("keeps worker phase context on worker-visible artifacts after completion confirmation", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps worker phase context on worker-visible artifacts after completion confirmation")
  })

  it('renders scope-change evidence without any worker price input', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'needs' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildInspectingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-jobs-needs-phase-context')).toBeNull()
    expect(screen.queryByTestId('worker-scope-change-request')).toBeNull()
    expect(screen.queryByTestId('worker-scope-change-submit')).toBeNull()
    expect(screen.queryByTestId('worker-scope-change-evidence-form')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-scope-change-edit-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.8-scope-change&ns_scope_mode=edit')
    expect(screen.getByTestId('worker-scope-change-request')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-scope-change-evidence-form')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-scope-change-photo-count')).toHaveTextContent(/Ảnh là tùy chọn/)
    expect(screen.getByTestId('worker-scope-change-photo-count')).toHaveTextContent(/video chưa hỗ trợ/)
    expect(screen.queryByTestId('worker-completion-evidence-blocker-card')).toBeNull()
    expect(screen.queryByTestId('worker-local-status-action')).toBeNull()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
  })

  it('keeps Stage 2.8 scope evidence flowing through the picker, tray, upload, and submit payload', async () => {
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      assets: [{ fileName: 'scope-wire.jpg', uri: 'file:///scope-wire.jpg' }],
      canceled: false,
    })
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildInspectingDeal() })

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-scope-change-edit-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.8-scope-change&ns_scope_mode=edit')
    fireEvent.changeText(screen.getByTestId('worker-scope-change-new-description-input'), 'Thay đoạn dây bị cháy phía sau tủ bếp.')
    fireEvent.changeText(screen.getByTestId('worker-scope-change-reason-input'), 'Dây cháy lộ rõ tại hiện trường và nằm ngoài phạm vi đã nhận.')
    fireEvent.press(screen.getByTestId('worker-scope-change-add-photo'))

    await waitFor(() => expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalled())
    expect(screen.getByTestId('worker-v5-evidence-tray-badge-0')).toHaveTextContent('Đã có')

    fireEvent.press(screen.getByTestId('worker-scope-change-confirm-submit'))

    await waitFor(() => expect(mockUploadJobMediaDrafts).toHaveBeenCalledWith(
      'job_test_1',
      expect.arrayContaining([expect.objectContaining({ type: 'image', uri: 'file:///scope-wire.jpg' })]),
      'scope_change_evidence',
    ))
    await waitFor(() => expect(mockWorkflowValue.actions.requestScopeChange).toHaveBeenCalledWith({
      new_description: 'Thay đoạn dây bị cháy phía sau tủ bếp.',
      photo_urls: expect.arrayContaining([
        'supabase://job-media/11111111-1111-4111-8111-111111111111/kael_reference/burnt-wire.jpg',
      ]),
      reason: 'Dây cháy lộ rõ tại hiện trường và nằm ngoài phạm vi đã nhận.',
    }))
    expect(screen.getByTestId('worker-v5-scope-change-send-action')).toHaveTextContent('Gửi khách phê duyệt')
  })

  it('routes Stage 2.8 no-scope action directly to Stage 2.9 without submitting scope evidence', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildInspectingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-scope-change-send-action')).toHaveTextContent('Không có vấn đề phát sinh')
    fireEvent.press(screen.getByTestId('worker-v5-scope-change-send-action'))

    expect(mockWorkflowValue.actions.requestScopeChange).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.9-approval-wait')
  })

  it('keeps Stage 2.9 empty approval honest without a fake request status chip', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildInspectingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-approval-wait-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-approval-wait-hero')).not.toHaveTextContent(/Chưa có yêu cầu|No request/)
    expect(screen.getByTestId('worker-v5-approval-amount')).toHaveTextContent(/Chờ dữ liệu thật/)
    expect(screen.getByTestId('worker-v5-approval-timeline-meta-0')).toHaveTextContent(/Chưa có mốc gửi thật/)
  })

  it('routes Stage 2.9 approval action directly to Stage 2.10 without a backend mutation', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildInspectingDeal() })

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-approval-continue-action'))

    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.10-completion-evidence')
  })

  it('opens the Stage 2.8 edit form directly from the edit route path', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_scope_mode: 'edit', ns_worker_screen: '2.8-scope-change' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildInspectingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-scope-change-request')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-scope-change-evidence-form')).toBeOnTheScreen()
  })

  it('opens the Stage 2.8 edit form for an existing scope draft without dropping backend evidence', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }
    buildWorkflow({ deal: buildScopeChangePendingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-scope-change-active')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray-badge-0')).toHaveTextContent('Đã có')
    fireEvent.press(screen.getByTestId('worker-v5-scope-change-edit-action'))

    expect(screen.getByTestId('worker-scope-change-evidence-form')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-scope-change-active')).toBeNull()
    expect(screen.getByTestId('worker-scope-change-new-description-input').props.value.length).toBeGreaterThan(10)
    expect(screen.getByTestId('worker-scope-change-reason-input').props.value.length).toBeGreaterThan(10)
    expect(screen.getByTestId('worker-v5-evidence-tray-badge-0')).toHaveTextContent('Đã có')
  })

  it("submits scope-change evidence as text plus selected photos without worker price input", async () => {
    await expectCurrentWorkerV5LegacyReplacement("submits scope-change evidence as text plus selected photos without worker price input")
  })

  it('summarizes scope-change evidence with a real Kael price delta', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'needs' }
    buildWorkflow({ deal: buildScopeChangePendingDeal() })

    render(<WorkerJobsSurface />)

    const scopeCard = screen.getByTestId('worker-scope-change-active')
    expect(screen.getByTestId('worker-scope-change-reference-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-scope-change-reference-old')).toHaveTextContent(/Ổ cắm chập chờn/)
    expect(screen.getByTestId('worker-scope-change-reference-new')).toHaveTextContent(/Thay dây điện hỏng/)
    expect(screen.getByTestId('worker-scope-change-reference-reason')).toHaveTextContent(/Dây ổ cắm hở hoàn toàn/)
    expect(screen.getByTestId('worker-scope-change-reference-media')).toHaveTextContent(/1 ảnh/)
    expect(screen.getByTestId('worker-scope-change-reference-delta')).toHaveTextContent(/Chi phí phát sinh/)
    expect(screen.getByTestId('worker-scope-change-reference-delta')).toHaveTextContent(/\+150\.000\s?(đ|VND)/)
    expect(screen.queryByTestId('worker-scope-change-submit')).toBeNull()
    expect(screen.queryByTestId('worker-completion-evidence-blocker-card')).toBeNull()
    expect(screen.getByTestId('worker-scope-change-detail-action')).toHaveTextContent(/Xem chi tiết/)
    fireEvent.press(screen.getByTestId('worker-scope-change-detail-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat')
    expect(scopeCard).not.toHaveTextContent(/worker price|nhập giá/i)
  })

  it("renders completion evidence as the repairing-phase Needs artifact", async () => {
    await expectCurrentWorkerV5LegacyReplacement("renders completion evidence as the repairing-phase Needs artifact")
  })

  it("uses the reference report CTA for completion evidence upload", async () => {
    await expectCurrentWorkerV5LegacyReplacement("uses the reference report CTA for completion evidence upload")
  })

  it("previews selected completion evidence photos before upload", async () => {
    await expectCurrentWorkerV5LegacyReplacement("previews selected completion evidence photos before upload")
  })

  it("submits completion evidence notes and selected photos through the worker status action", async () => {
    await expectCurrentWorkerV5LegacyReplacement("submits completion evidence notes and selected photos through the worker status action")
  })

  it("moves completed evidence into a job summary before the final report", async () => {
    await expectCurrentWorkerV5LegacyReplacement("moves completed evidence into a job summary before the final report")
  })

  it("routes from job summary into the summary report surface", async () => {
    await expectCurrentWorkerV5LegacyReplacement("routes from job summary into the summary report surface")
  })

  it("does not treat partial completion evidence as a submitted artifact", async () => {
    await expectCurrentWorkerV5LegacyReplacement("does not treat partial completion evidence as a submitted artifact")
  })

  it("guards needs review before a confirmed work case without a map preview", async () => {
    await expectCurrentWorkerV5LegacyReplacement("guards needs review before a confirmed work case without a map preview")
  })
})

describe('WorkerEarningsSurface', () => {
  it('maps the fifth worker v5 batch without fabricating earnings totals', () => {
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    buildWorkflow({ workerEarnings: buildNoEarnings() })

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-screen-4.1-earnings-overview')).toBeOnTheScreen()
    expect(screen.queryByText(/18\.920\.000/)).toBeNull()
    expect(screen.queryByText(/472k/)).toBeNull()
  })

  it('keeps the Stage 4.2 ledger numeric empty state at zero until real earnings sync', () => {
    mockAppLanguage = 'vi'
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.2-ledger-detail' }
    buildWorkflow({
      workerEarnings: {
        ...buildNoEarnings(),
        from_date: '2026-05-31T17:00:00.000Z',
        to_date: '2026-06-30T16:59:59.999Z',
      },
    })

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-breakdown-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-action-rail-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-amount')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-ledger-breakdown-value-0')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-ledger-breakdown-value-1')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-ledger-breakdown-value-2')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ledger-net-total')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-ledger-trace-meta-0')).toHaveTextContent('0 việc đã trả')
    expect(screen.getByTestId('worker-v5-ledger-trace-meta-1')).toHaveTextContent('0đ')
    expect(screen.queryByText(/2026-05-31T17:00:00\.000Z|2026-06-30T16:59:59\.999Z/)).toBeNull()
  })

  it('keeps the Stage 4.3 payout request empty state numeric and free of fake trust copy', () => {
    mockAppLanguage = 'vi'
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }
    buildWorkflow({
      workerEarnings: buildNoEarnings(),
      workerProfile: buildWorkerProfile({ bank_account_masked: null, bank_name: null }),
    })

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-request-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-amount-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-account-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-request-amount')).toHaveTextContent('0đ')
    expect(screen.getByTestId('worker-v5-payout-amount-value')).toHaveTextContent('0')
    expect(screen.queryByTestId('worker-v5-payout-request-status')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-final-checklist')).toBeNull()
    expect(screen.queryByText(/Ranh giới rút tiền|Cần xác minh ngân hàng|Từ ví Worker tới tài khoản ngân hàng|Trong 5-15 phút|Thiết bị tin cậy/)).toBeNull()
  })

  it('routes the Stage 4.3 payout CTA directly to the payout method stage', () => {
    mockAppLanguage = 'vi'
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }
    buildWorkflow({
      workerEarnings: buildNoEarnings(),
      workerProfile: buildWorkerProfile({ bank_account_masked: null, bank_name: null }),
    })

    render(<WorkerEarningsSurface />)

    const action = screen.getByTestId('worker-v5-payout-request-confirm-action')
    expect(action.props.accessibilityState).toEqual({ disabled: false })
    fireEvent.press(action)
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.4-payout-method')
  })

  it('turns the Stage 4.4 bank list and account management rows into real local interactions', async () => {
    mockAppLanguage = 'vi'
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    buildWorkflow({
      workerEarnings: buildNoEarnings(),
      workerProfile: buildWorkerProfile({
        bank_account_masked: null,
        bank_name: null,
        legal_name: '',
      }),
    })

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-payout-method-name')).toHaveTextContent('Tài khoản nhận tiền')

    fireEvent.press(screen.getByTestId('worker-v5-payout-method-bank-4'))
    expect(screen.getByTestId('worker-v5-payout-method-name')).toHaveTextContent('ACB')
    expect(screen.getByTestId('worker-v5-payout-method-bank-4').props.accessibilityState).toEqual({ selected: true })

    fireEvent.press(screen.getByTestId('worker-v5-account-management-row-0'))
    expect(screen.getByTestId('worker-v5-bank-account-form')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-account-selected-bank')).toHaveTextContent('ACB')

    fireEvent.changeText(screen.getByTestId('worker-v5-bank-account-owner-input'), 'Tran Minh Tuan')
    fireEvent.changeText(screen.getByTestId('worker-v5-bank-account-number-input'), '1234 5678 90')
    fireEvent.press(screen.getByTestId('worker-v5-bank-account-precheck-action'))
    expect(screen.getByTestId('worker-v5-bank-account-precheck-status')).toHaveTextContent(/Đã kiểm tra định dạng/)

    fireEvent.press(screen.getByTestId('worker-v5-payout-method-use-action'))
    await waitFor(() => expect(mockWorkerSavePayoutMethod).toHaveBeenCalledWith({
      account_holder_name: 'Tran Minh Tuan',
      bank_account: '1234567890',
      bank_key: 'acb',
      bank_name: 'ACB',
    }))
    await waitFor(() => expect(screen.getByTestId('worker-v5-payout-method-save-status')).toBeOnTheScreen())

    fireEvent.press(screen.getByTestId('worker-v5-account-management-row-1'))
    expect(screen.getByTestId('worker-v5-payout-limit-policy')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-limit-policy-copy')).toHaveTextContent(/không đặt hạn mức rút tiền cố định/)
  })

  it('keeps the fifth worker earnings overview honest and spaced with real ledger data', () => {
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/earnings'
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    buildWorkflow({
      workerEarnings: {
        ...buildNoEarnings(),
        daily_earnings: [
          { date: '2026-06-20', gross_earnings: 520000, net_earnings: 472000, paid_job_count: 1, platform_fee_total: 48000 },
          { date: '2026-06-21', gross_earnings: 420000, net_earnings: 378000, paid_job_count: 1, platform_fee_total: 42000 },
        ],
        from_date: '2026-06-20',
        gross_earnings: 940000,
        net_earnings: 850000,
        pending_payment_amount: 0,
        platform_fee_total: 90000,
        to_date: '2026-06-21',
        total_jobs_paid: 2,
      },
    })

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-background-home-formula-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-page-lower-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-transactions-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-action-rail-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-amount').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-earnings-transaction-amount-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-transaction-amount-0').props.style).minWidth).toBe(76)
    expect(screen.queryByText(/Tổng thu nhập|Total income/)).toBeNull()
    expect(screen.queryByText(/2026-06-20 - 2026-06-21/)).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByText(/18\.920\.000|3,32tr|472k|may lanh|camera/i)).toBeNull()
  })

  it('keeps the sixth worker ledger and payout screens spaced without demo payout data', () => {
    mockAppLanguage = 'en'
    mockPathname = '/(worker)/earnings'
    buildWorkflow({
      workerEarnings: {
        ...buildNoEarnings(),
        daily_earnings: [
          { date: '2026-06-20', gross_earnings: 123456789, net_earnings: 111111111, paid_job_count: 12, platform_fee_total: 12345678 },
        ],
        from_date: '2026-06-01',
        gross_earnings: 123456789,
        net_earnings: 111111111,
        platform_fee_total: 12345678,
        to_date: '2026-06-26',
        total_jobs_paid: 12,
      },
      workerProfile: buildWorkerProfile({ bank_account_masked: null, bank_name: null }),
    })

    mockRouteParams = { ns_worker_screen: '4.2-ledger-detail' }
    const ledgerView = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-ledger-amount').props.numberOfLines).toBe(2)
    expect(screen.queryByTestId('worker-v5-ledger-period')).toBeNull()
    expect(screen.getByTestId('worker-v5-ledger-breakdown-label-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-ledger-amount').props.style).flexShrink).toBe(1)
    ledgerView.unmount()

    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }
    const payoutRequestView = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-request-amount').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-payout-amount-value').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-payout-account-title').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-amount-value').props.style).flexShrink).toBe(1)
    expect(screen.queryByText(/1\.500\.000|Vietcombank|4821|20\.000\.000/)).toBeNull()
    payoutRequestView.unmount()

    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-method-name').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-payout-method-account').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-payout-method-label-0').props.numberOfLines).toBe(2)
    expect(screen.queryByText(/1\.500\.000|Vietcombank|4821|20\.000\.000/)).toBeNull()
  })

  it("uses the worker income wallet as the earnings section", async () => {
    await expectCurrentWorkerV5LegacyReplacement("uses the worker income wallet as the earnings section")
  })

  it("opens the worker withdraw path from the earnings section without merging the wallet", async () => {
    await expectCurrentWorkerV5LegacyReplacement("opens the worker withdraw path from the earnings section without merging the wallet")
  })

  it("feeds real payout reconciliation into the worker income wallet", async () => {
    await expectCurrentWorkerV5LegacyReplacement("feeds real payout reconciliation into the worker income wallet")
  })

  it("keeps the earnings tab in the selected English wallet mode", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps the earnings tab in the selected English wallet mode")
  })
})
describe('WorkerProfileSurface', () => {
  it('maps the sixth worker v5 batch without fabricating profile ranking', () => {
    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    buildWorkflow({
      workerPerformanceInsights: null,
      workerProfile: buildWorkerProfile({ rating: 0, total_jobs: 0 }),
    })

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-screen-5.2-worker-ranking')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-score')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ranking-stat-value-0')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ranking-stat-value-1')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ranking-stat-value-2')).toHaveTextContent('0%')
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-status')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-0')).toHaveTextContent('Đúng hẹn')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-1')).toHaveTextContent('Chất lượng hoàn tất')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-2')).toHaveTextContent('Phản hồi khách')
    expect(screen.queryByText(/Đ\?|Ch\?t|Phẹn h\?i|K\? lu/)).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByText(/Top 3%/)).toBeNull()
    expect(screen.queryByText(/312 Case/)).toBeNull()
  })

  it('uses the handoff info icon for profile and ranking header badges', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        performance_score: 72,
      }),
    })

    const screenIds = [
      '5.1-profile-overview',
      '5.2-worker-ranking',
      '5.3-skills-service-area',
      '5.4-reliability-insights',
    ] as const

    for (const screenId of screenIds) {
      mockRouteParams = { ns_worker_screen: screenId }
      const view = render(<WorkerProfileSurface />)
      expect(screen.getByTestId(`worker-v5-profile-info-header-icon-${screenId}`)).toHaveTextContent('i')
      view.unmount()
    }
  })

  it('keeps the sixth worker profile and ranking screens honest and spaced', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({
      workerPerformanceInsights: null,
      workerProfile: buildWorkerProfile({
        bank_account_masked: null,
        bank_name: null,
        districts: ['quan_1', 'quan_3', 'quan_7'],
        is_approved: false,
        legal_name: 'Tran Minh Tuan With A Very Long Legal Worker Name',
        rating: 0,
        service_types: ['electrical', 'plumbing', 'cleaning'],
        total_jobs: 0,
        verification_status: 'under_review',
      }),
    })

    mockRouteParams = { ns_worker_screen: '5.1-profile-overview' }
    const profileView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-header-name').props.numberOfLines).toBe(2)
    expect(screen.queryByTestId('worker-v5-profile-header-meta')).toBeNull()
    expect(screen.getByTestId('worker-v5-profile-sync-progress-label')).toHaveTextContent(/0%/)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-profile-sync-progress-fill').props.style).width).toBe('0%')
    expect(screen.getByTestId('worker-v5-profile-header-availability').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-profile-dashboard-title-0').props.numberOfLines).toBe(2)
    expect(screen.queryByTestId('worker-v5-profile-dashboard-meta-0')).toBeNull()
    expect(screen.queryByTestId('worker-v5-profile-dashboard-meta-1')).toBeNull()
    expect(screen.getByTestId('worker-v5-profile-dashboard-score-0')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-profile-dashboard-score-1')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-profile-dashboard-score-label-0')).toHaveTextContent('xếp hạng')
    expect(screen.getByTestId('worker-v5-profile-dashboard-score-label-1')).toHaveTextContent('đánh giá')
    expect(screen.getByText('Xem xếp hạng thợ')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-sign-out')).toHaveTextContent('Đăng xuất')
    expect(screen.getByTestId('worker-v5-profile-sign-out-mint-aura')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-profile-sign-out-mint-aura').props.style).top).toBe(-34)
    fireEvent.press(screen.getByTestId('worker-v5-profile-sign-out'))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('worker-v5-profile-dossier-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-dossier-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-dossier-row-0-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-dossier-row-1-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-dossier-row-2-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-dossier-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-profile-dossier-status-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-profile-dossier-status-0')).toHaveTextContent('Vào')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-profile-dossier-status-0').props.style).minWidth).toBe(54)
    screen.getAllByTestId('worker-v5-profile-dossier-icon-shell').forEach((tile) => {
      const iconTileStyle = StyleSheet.flatten(tile.props.style)
      expect(iconTileStyle.height).toBe(64)
      expect(iconTileStyle.width).toBe(64)
      expect(iconTileStyle.alignItems).toBe('center')
      expect(iconTileStyle.justifyContent).toBe('center')
    })
    screen.getAllByTestId('worker-v5-profile-dossier-icon').forEach((icon) => {
      const iconStyle = StyleSheet.flatten(icon.props.style)
      expect(icon.props.resizeMode).toBe('contain')
      expect(iconStyle.height).toBe(42)
      expect(iconStyle.width).toBe(42)
    })
    expect(screen.getByTestId('worker-v5-profile-dossier-row-0').props.accessibilityRole).toBe('button')
    fireEvent.press(screen.getByTestId('worker-v5-profile-dossier-row-0'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.3-skills-service-area')
    expect(screen.getByTestId('worker-v5-profile-dossier-title-1')).toHaveTextContent('Độ tin cậy')
    expect(screen.getByTestId('worker-v5-profile-dossier-status-1')).toHaveTextContent('Vào')
    expect(screen.getByTestId('worker-v5-profile-dossier-row-1').props.accessibilityRole).toBe('button')
    fireEvent.press(screen.getByTestId('worker-v5-profile-dossier-row-1'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.4-reliability-insights')
    expect(screen.getByTestId('worker-v5-profile-dossier-title-2')).toHaveTextContent('Cài đặt')
    expect(screen.getByTestId('worker-v5-profile-dossier-status-2')).toHaveTextContent('Vào')
    expect(screen.getByTestId('worker-v5-profile-dossier-row-2').props.accessibilityRole).toBe('button')
    fireEvent.press(screen.getByTestId('worker-v5-profile-dossier-row-2'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.10-support-settings')
    expect(screen.queryByText('Khu vực phục vụ')).toBeNull()
    expect(screen.queryByText(/Phát triển và hỗ trợ|Growth and support|Quyền Kael|Kael permissions/)).toBeNull()
    expect(screen.queryByText(/Top 3%|312 Case|Elite|4,96|máy lạnh|camera/i)).toBeNull()
    profileView.unmount()

    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-ranking-score').props.numberOfLines).toBe(1)
    expect(screen.getByTestId('worker-v5-ranking-score')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ranking-stat-strip')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-stat-value-0')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ranking-stat-value-1')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-ranking-stat-value-2')).toHaveTextContent('0%')
    expect(screen.getByTestId('worker-v5-ranking-name').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-status').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-status')).toHaveTextContent('0')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-ranking-leaderboard-status').props.style).minWidth).toBe(54)
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-0')).toHaveTextContent('Đúng hẹn')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-1')).toHaveTextContent('Chất lượng hoàn tất')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-2')).toHaveTextContent('Phản hồi khách')
    expect(screen.getByTestId('worker-v5-ranking-improvement-status-0')).toHaveTextContent('+100')
    expect(screen.queryByText(/Đ\?|Ch\?t|Phẹn h\?i|K\? lu/)).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-draft-card')).toBeNull()
    expect(screen.queryByTestId('worker-v5-gauge')).toBeNull()
    expect(screen.queryByTestId('worker-v5-score-ring')).toBeNull()
    expect(screen.queryByTestId('worker-v5-rank-rail')).toBeNull()
    expect(screen.queryByTestId('worker-v5-ranking-podium')).toBeNull()
    expect(screen.queryByText(/Top 3%|312 Case|Elite Worker|4,96|Nguyễn|Trần Minh Tuấn|máy lạnh|camera/i)).toBeNull()
  })

  it('maps the seventh worker v5 batch from real profile documents and insights', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.7,
        average_response_minutes: 18,
        completed_job_count: 9,
        on_time_rate_percent: 91,
        performance_axes: [
          { id: 'rating', score: 88 },
          { id: 'response', score: 73 },
          { id: 'arrival', score: 91 },
        ],
        performance_score: 82,
        response_rate_percent: 79,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: null,
        bank_name: null,
        districts: ['quan_1', 'quan_3'],
        has_cccd: true,
        has_selfie: false,
        is_available: true,
        problem_specializations: ['cong_tac_hong'],
        service_radius_km: 6,
        service_types: ['electrical', 'plumbing'],
        verification_status: 'under_review',
      }),
    })

    const screenIds = [
      '5.3-skills-service-area',
      '5.4-reliability-insights',
      '5.5-account-utilities',
      '5.6-agent-memory-preferences',
      '5.7-verification-documents',
    ]

    for (const id of screenIds) {
      mockRouteParams = { ns_worker_screen: id }
      const view = render(<WorkerProfileSurface />)
      expect(screen.getByTestId(`worker-v5-screen-${id}`)).toBeOnTheScreen()
      if (id === '5.3-skills-service-area') {
        expect(screen.getByTestId('worker-v5-skills-service-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-skills-service-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-quick-action-grid')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-service-area-map-card')).toBeOnTheScreen()
      }
      if (id === '5.4-reliability-insights') {
        expect(screen.getByTestId('worker-v5-reliability-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-reliability-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-reliability-components')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-kael-draft-card')).toBeOnTheScreen()
      }
      if (id === '5.5-account-utilities') {
        expect(screen.getByTestId('worker-v5-settings-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-settings-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-settings-list')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-utility-grid')).toBeNull()
      }
      if (id === '5.6-agent-memory-preferences') {
        expect(screen.getByTestId('worker-v5-memory-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-permission-list')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-permission-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-boundary-list')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-memory-boundary-mint-aura')).toBeOnTheScreen()
      }
      if (id === '5.7-verification-documents') {
        expect(screen.getByTestId('worker-v5-verification-hero')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-verification-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-verification-checklist')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-verification-checklist-mint-aura')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-verification-renewal-card')).toBeOnTheScreen()
      }
      view.unmount()
    }

    mockRouteParams = { ns_worker_screen: '5.7-verification-documents' }
    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-screen-5.7-verification-documents')).toHaveTextContent(/Còn thiếu/)
    expect(screen.queryByText(/6\/6/)).toBeNull()
    expect(screen.queryByText(/Active/)).toBeNull()
    expect(screen.queryByText(/94/)).toBeNull()
  })

  it('keeps the seventh worker profile batch spaced with real profile-only data', async () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: null,
        average_response_minutes: 24,
        completed_job_count: 3,
        on_time_rate_percent: 88,
        performance_axes: [
          { id: 'rating', score: 71 },
          { id: 'response', score: 67 },
          { id: 'arrival', score: 83 },
        ],
        performance_score: 74,
        response_rate_percent: 64,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: null,
        bank_name: null,
        districts: ['quan_1', 'quan_3', 'quan_7'],
        has_cccd: true,
        has_selfie: false,
        is_approved: false,
        is_available: true,
        legal_name: 'Tran Minh Tuan With Long Worker Legal Name',
        problem_specializations: ['cong_tac_hong', 'voi_nuoc_ri'],
        service_radius_km: 12,
        service_types: ['electrical', 'plumbing', 'cleaning'],
        verification_status: 'under_review',
      }),
    })

    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    const skillsView = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-skills-service-status')).toBeNull()
    expect(screen.getByTestId('worker-v5-skills-service-count').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-skills-service-count')).toHaveTextContent('3 kỹ năng đang hoạt động')
    expect(screen.getByTestId('worker-v5-service-card-mint-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-service-area-open-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-service-area-open-summary')).toHaveTextContent('Nhấn để xem khu vực ưu tiên')
    expect(screen.queryByTestId('worker-v5-service-area-expanded')).toBeNull()
    expect(screen.getByTestId('worker-v5-quick-action-title-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-quick-action-0').props.style).width).toBe('31.8%')
    expect(screen.queryByTestId('worker-v5-quick-action-3')).toBeNull()
    expect(screen.queryByText('Chuyên môn chi tiết')).toBeNull()
    expect(screen.queryByText('Kỹ năng và dịch vụ')).toBeNull()
    expect(screen.queryByText(/Quận 1|quan_1|q1|12 km/i)).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-service-area-open-card'))
    expect(screen.getByTestId('worker-v5-service-area-expanded')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-service-area-place-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-service-area-place-name-0')).toHaveTextContent('Quận 1')
    expect(screen.getByTestId('worker-v5-service-area-place-name-1')).toHaveTextContent('Quận 3')
    expect(screen.getByTestId('worker-v5-service-area-radius')).toHaveTextContent('Bán kính phục vụ 12 km')
    expect(screen.queryByTestId('worker-v5-service-area-district-input')).toBeNull()
    expect(screen.queryByTestId('worker-v5-service-area-save')).toBeNull()
    expect(screen.queryByTestId('worker-v5-service-area-option-binh_thanh')).toBeNull()
    fireEvent.changeText(screen.getByTestId('worker-v5-service-area-draft-input'), 'Bình Thạnh, Quận 1')
    fireEvent.press(screen.getByTestId('worker-v5-service-area-save-inline'))
    await waitFor(() => expect(mockWorkerUpdateServiceArea).toHaveBeenCalledWith({
      districts: ['binh_thanh', 'q1'],
    }))
    mockWorkerUpdateServiceArea.mockResolvedValueOnce(false)
    fireEvent.changeText(screen.getByTestId('worker-v5-service-area-draft-input'), 'Thủ Đức, Quận 2, Quận 3')
    expect(screen.getByTestId('worker-v5-service-area-place-name-0')).toHaveTextContent('Thủ Đức')
    expect(screen.getByTestId('worker-v5-service-area-place-name-1')).toHaveTextContent('Quận 2')
    expect(screen.getByTestId('worker-v5-service-area-place-name-2')).toHaveTextContent('Quận 3')
    fireEvent.press(screen.getByTestId('worker-v5-service-area-save-inline'))
    await waitFor(() => expect(screen.getByTestId('worker-v5-service-area-message')).toHaveTextContent(/Chưa đồng bộ được với NestScout/))
    expect(mockWorkerUpdateServiceArea).toHaveBeenLastCalledWith({
      districts: ['thu_duc', 'q3'],
    })
    expect(screen.getByTestId('worker-v5-service-area-place-name-0')).toHaveTextContent('Thủ Đức')
    expect(screen.getByTestId('worker-v5-service-area-place-name-1')).toHaveTextContent('Quận 2')
    expect(screen.getByTestId('worker-v5-service-area-place-name-2')).toHaveTextContent('Quận 3')
    expect(screen.queryByText(/Máy lạnh|Air conditioner|Advanced|Elite|128 Case/i)).toBeNull()
    skillsView.unmount()

    mockRouteParams = { ns_worker_screen: '5.4-reliability-insights' }
    const reliabilityView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-reliability-status').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-reliability-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-reliability-score')).toHaveTextContent('74')
    expect(screen.getByTestId('worker-v5-reliability-stat-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-reliability-stat-completion-value')).toHaveTextContent('0%')
    expect(screen.getByTestId('worker-v5-reliability-stat-completion-label')).toHaveTextContent('Hoàn tất')
    expect(screen.getByTestId('worker-v5-reliability-stat-arrival-value')).toHaveTextContent('88%')
    expect(screen.getByTestId('worker-v5-reliability-stat-rating-value')).toHaveTextContent('0')
    expect(screen.getByTestId('worker-v5-reliability-components-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-reliability-axis-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-reliability-axis-title-0')).toHaveTextContent('Đúng hẹn & cập nhật thời gian đến')
    expect(screen.getByTestId('worker-v5-reliability-axis-meta-0')).toHaveTextContent(/83\/100/)
    expect(screen.getByTestId('worker-v5-reliability-axis-fill-0')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-reliability-axis-score-0').props.style).width).toBe(58)
    expect(screen.queryByTestId('worker-v5-gauge')).toBeNull()
    expect(screen.queryByTestId('worker-v5-score-ring')).toBeNull()
    expect(screen.queryByTestId('worker-v5-rank-rail')).toBeNull()
    expect(screen.queryByText(/4,96|128 Case|A\+|Trust score|ETA|Reliable|Explainable|Score components/i)).toBeNull()
    reliabilityView.unmount()

    mockRouteParams = { ns_worker_screen: '5.5-account-utilities' }
    const settingsAliasView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-settings-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-list-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-account')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-account-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-language')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-language-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-password')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-password-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-service-area')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-service-area-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-memory')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-memory-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-account-utility-hero')).toBeNull()
    expect(screen.queryByTestId('worker-v5-utility-grid')).toBeNull()
    expect(screen.queryByText(/Tài khoản, giấy tờ, hỗ trợ và bảo mật|Kỹ năng & dịch vụ|Trung tâm hỗ trợ|VCB|4821|6\/6|24\/7/i)).toBeNull()
    expect(screen.queryByTestId('worker-v5-settings-status')).toBeNull()
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-settings-language'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.10-support-settings&ns_worker_lang=en')
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-settings-service-area'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.3-skills-service-area')
    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-v5-settings-memory'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.6-agent-memory-preferences')
    expect(screen.queryByTestId('worker-v5-primary-action')).toBeNull()
    settingsAliasView.unmount()

    mockRouteParams = { ns_worker_screen: '5.6-agent-memory-preferences' }
    const memoryView = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-memory-count')).toBeNull()
    expect(screen.getByTestId('worker-v5-memory-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-memory-permission-list-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-memory-permission-list-value-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-memory-permission-list-value-0')).toHaveTextContent(/Quận 1|Quáº­n 1|quan_1/i)
    expect(screen.getByTestId('worker-v5-memory-permission-list-value-0')).toHaveTextContent(/12 km/)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-memory-permission-list-track-0').props.style).flexShrink).toBe(0)
    expect(screen.queryByText(/Mức thu nhập tối thiểu|Minimum income|Chưa có ngưỡng thu nhập/i)).toBeNull()
    expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({ checked: true })
    fireEvent.press(screen.getByTestId('worker-v5-memory-permission-list-row-0'))
    expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({ checked: false })
    await waitFor(() =>
      expect(mockKaelMemoryService.updateMyWorkerPreference).toHaveBeenCalledWith({
        enabled: false,
        key: 'area_preference',
      }),
    )
    fireEvent.press(screen.getByTestId('worker-v5-memory-permission-list-row-0'))
    expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({ checked: true })
    await waitFor(() =>
      expect(mockKaelMemoryService.updateMyWorkerPreference).toHaveBeenCalledWith({
        enabled: true,
        key: 'area_preference',
      }),
    )
    expect(screen.getByTestId('worker-v5-memory-boundary-list-row-1').props.accessibilityState).toMatchObject({ checked: false })
    fireEvent.press(screen.getByTestId('worker-v5-memory-boundary-list-row-1'))
    expect(screen.getByTestId('worker-v5-memory-boundary-list-row-1').props.accessibilityState).toMatchObject({ checked: true })
    await waitFor(() =>
      expect(mockKaelMemoryService.updateMyWorkerPreference).toHaveBeenCalledWith({
        enabled: true,
        key: 'auto_accept_work',
      }),
    )
    expect(screen.queryByTestId('worker-v5-memory-boundary-list-title-2')).toBeNull()
    expect(screen.queryByText(/Chia sẻ dữ liệu ra ngoài công việc|Share data outside work/i)).toBeNull()
    expect(screen.queryByText(/450\.000|Máy lạnh|Từ 450/i)).toBeNull()
    memoryView.unmount()

    mockRouteParams = { ns_worker_screen: '5.7-verification-documents' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-verification-count').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-verification-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-toggle-label-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-toggle-value-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-verification-row-status-0')).toHaveTextContent('OK')
    expect(screen.getByTestId('worker-v5-verification-row-status-1')).toHaveTextContent('Chờ')
    expect(screen.queryByText(/6\/6 hợp lệ|03\/2031|12\/2026|Máy lạnh/i)).toBeNull()
  })

  it('formats Stage 5.6 memory area copy from backend district and radius data', async () => {
    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.6-agent-memory-preferences' }
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        districts: ['binh_thanh', 'q1', 'thu_duc'],
        service_radius_km: 8,
      }),
    })

    render(<WorkerProfileSurface />)

    await waitFor(() =>
      expect(screen.getByTestId('worker-v5-memory-permission-list-value-0')).toHaveTextContent('Bình Thạnh, Quận 1, Thủ Đức · bán kính 8 km'),
    )
  })

  it('keeps the latest Stage 5.6 memory switch choice instead of reverting to stale Supabase state', async () => {
    mockPathname = '/(worker)/profile'
    mockRouteParams = { ns_worker_screen: '5.6-agent-memory-preferences' }
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        districts: ['binh_thanh'],
        service_radius_km: 8,
      }),
    })
    let resolveMemory!: (value: unknown) => void
    mockKaelMemoryService.getMyWorkerMemory.mockImplementationOnce(() => new Promise((resolve) => {
      resolveMemory = resolve
    }))
    mockKaelMemoryService.updateMyWorkerPreference.mockResolvedValueOnce({
      data: {
        memory: null,
        subject_type: 'worker',
      },
      status: 500,
      success: false,
    })

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({ checked: true })
    fireEvent.press(screen.getByTestId('worker-v5-memory-permission-list-row-0'))
    expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({ checked: false })
    await waitFor(() =>
      expect(mockKaelMemoryService.updateMyWorkerPreference).toHaveBeenCalledWith({
        enabled: false,
        key: 'area_preference',
      }),
    )

    await act(async () => {
      resolveMemory({
        data: {
          memory: {
            safe_metadata: {
              memory_preferences: {
                area_preference: true,
              },
            },
          },
          subject_type: 'worker',
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    expect(screen.getByTestId('worker-v5-memory-permission-list-row-0').props.accessibilityState).toMatchObject({ checked: false })
  })

  it('maps the eighth worker v5 batch with production-safe payout reviews and support states', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({
      workerEarnings: {
        ...buildNoEarnings(),
        from_date: '2026-06-01',
        net_earnings: 1285000,
        pending_payment_amount: 350000,
        to_date: '2026-06-07',
        total_jobs_paid: 6,
      },
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: 4.2,
        on_time_rate_percent: 81,
        performance_score: 72,
        review_count: 3,
        response_rate_percent: 67,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: '**** 4821',
        bank_name: 'Vietcombank',
        legal_name: 'Anh Hoang',
      }),
    })

    const screenIds = [
      '5.8-bank-tax-center',
      '5.9-reviews-feedback',
      '5.10-support-settings',
    ]

    for (const id of screenIds) {
      mockRouteParams = { ns_worker_screen: id }
      const view = render(<WorkerProfileSurface />)
      expect(screen.getByTestId(`worker-v5-screen-${id}`)).toBeOnTheScreen()
      view.unmount()
    }

    mockRouteParams = { ns_worker_screen: '5.8-bank-tax-center' }
    const bankView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-bank-tax-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-tax-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-tax-logo')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-payout-rules-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-bank-card-logo')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-account-change-guard')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-screen-5.8-bank-tax-center')).toHaveTextContent(/1\.285\.000|1,285,000/)
    expect(screen.queryByText(/3\.32tr|3,32tr/)).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.10-support-settings')
    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    bankView.unmount()

    mockRouteParams = { ns_worker_screen: '5.9-reviews-feedback' }
    const reviewsView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-reviews-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-reviews-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-review-signal-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-recent-feedback-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-review-improvement-plan')).toBeOnTheScreen()
    expect(screen.queryByText(/4,96/)).toBeNull()
    expect(screen.queryByText(/24 chuỗi/)).toBeNull()
    reviewsView.unmount()

    mockRouteParams = { ns_worker_screen: '5.10-support-settings' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-settings-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-list')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-list-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-account')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-language')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-password')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-service-area')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-memory')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-support-utility-grid')).toBeNull()
    expect(screen.queryByTestId('worker-v5-support-privacy-card')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-settings-service-area'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.3-skills-service-area')
    fireEvent.press(screen.getByTestId('worker-v5-settings-memory'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.6-agent-memory-preferences')
    expect(screen.queryByText(/24\/7/)).toBeNull()
  })

  it('keeps the final worker v5 profile batch spaced without reference payout or review data', async () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({
      workerEarnings: buildNoEarnings(),
      workerPerformanceInsights: buildWorkerPerformanceInsights({
        average_rating: null,
        on_time_rate_percent: null,
        performance_axes: [],
        performance_score: null,
        review_count: 0,
        response_rate_percent: null,
      }),
      workerProfile: buildWorkerProfile({
        bank_account_masked: null,
        bank_name: null,
        has_cccd: true,
        has_selfie: true,
        legal_name: 'Tran Minh Tuan With Long Support Name',
      }),
    })

    mockRouteParams = { ns_worker_screen: '5.8-bank-tax-center' }
    const bankView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-bank-tax-status').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-bank-tax-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-bank-tax-available').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-bank-card-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-payout-rule-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-payout-rule-status-0').props.numberOfLines).toBe(2)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-rule-status-0').props.style).minWidth).toBe(54)
    expect(screen.queryByText(/Vietcombank|4821|3\.32tr|3,32tr|Primary|20\.000\.000/i)).toBeNull()
    bankView.unmount()

    mockRouteParams = { ns_worker_screen: '5.9-reviews-feedback' }
    const reviewsView = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-reviews-rating').props.numberOfLines).toBe(1)
    expect(screen.getByTestId('worker-v5-reviews-count').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-reviews-title').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-feedback-title-0').props.numberOfLines).toBe(2)
    expect(screen.getByTestId('worker-v5-feedback-status-0').props.numberOfLines).toBe(2)
    expect(screen.queryByText(/4,96|312 đánh giá|312 Case|24 chuỗi|Đúng giờ, giải thích rõ|Case máy lạnh/i)).toBeNull()
    reviewsView.unmount()

    mockRouteParams = { ns_worker_screen: '5.10-support-settings' }
    render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-settings-status')).toBeNull()
    expect(screen.getByTestId('worker-v5-settings-title').props.numberOfLines).toBe(2)
    expect(screen.queryByTestId('worker-v5-support-hero')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-settings-account'))
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-account-name-input'), 'Tran Minh Tuan Updated')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-account-phone-input'), '0909999999')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-account-email-input'), 'worker-updated@example.com')
    fireEvent.press(screen.getByTestId('worker-v5-settings-account-save'))
    await waitFor(() => {
      expect(mockUpdateCustomerProfile).toHaveBeenCalledWith({
        email: 'worker-updated@example.com',
        fullName: 'Tran Minh Tuan Updated',
        phone: '0909999999',
      })
    })
    fireEvent.press(screen.getByTestId('worker-v5-settings-password'))
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-current-input'), 'old-password')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-new-input'), 'new-password-123')
    fireEvent.changeText(screen.getByTestId('worker-v5-settings-password-confirm-input'), 'new-password-123')
    fireEvent.press(screen.getByTestId('worker-v5-settings-password-save'))
    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
      })
    })
    expect(screen.queryByText(/SLA 24\/7|24\/7|Liquid Glass|Worker|Case khẩn cấp/i)).toBeNull()
  })

  it("uses the real worker legal name in the profile hero when available", async () => {
    await expectCurrentWorkerV5LegacyReplacement("uses the real worker legal name in the profile hero when available")
  })

  it("applies the profile liquid hierarchy without fabricating worker trust data", async () => {
    await expectCurrentWorkerV5LegacyReplacement("applies the profile liquid hierarchy without fabricating worker trust data")
  })

  it("derives worker level progress from real completed jobs and feedback", async () => {
    await expectCurrentWorkerV5LegacyReplacement("derives worker level progress from real completed jobs and feedback")
  })

  it("keeps reputation and performance outside the rebuilt profile section one plus two scope", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps reputation and performance outside the rebuilt profile section one plus two scope")
  })

  it("keeps empty worker trust signals in the selected English mode", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps empty worker trust signals in the selected English mode")
  })

  it("keeps later worker rewards locked until level five opens the next requirement", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps later worker rewards locked until level five opens the next requirement")
  })

  it("keeps the verification form as a crisp profile panel when a worker can submit", async () => {
    await expectCurrentWorkerV5LegacyReplacement("keeps the verification form as a crisp profile panel when a worker can submit")
  })
})

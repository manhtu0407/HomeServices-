import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { JobStatus, LocalDeal, LocalDealStatus } from '@nestscout/shared'

import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

let mockWorkflowValue: any
let mockPathname: string
let mockRouteParams: Record<string, string | string[] | undefined>
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()
const pendingWorkerKaelServiceCall = () => new Promise<never>(() => undefined)
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
const mockWorkerRouteService = {
  getMapImage: jest.fn(),
  getPreview: jest.fn(),
}
const mockGetMobileApiAuthHeaders = jest.fn()

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
  getCameraPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: false })),
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

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return {
    ...actual,
    getMobileApiAuthHeaders: (...args: unknown[]) => mockGetMobileApiAuthHeaders(...args),
  }
})

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ role: 'worker', session: { user: { id: 'worker_test_1' } }, signOut: jest.fn(async () => undefined) }),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (jobId: string | null, enabled: boolean) => mockUseJobChatThread(jobId, enabled),
}))

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(),
  uploadWorkerVerificationDrafts: jest.fn(),
}))

jest.mock('@/lib/services', () => ({
  placesService: {
    autocomplete: jest.fn(async () => ({ data: { fallback_used: false, suggestions: [] }, success: true })),
    resolve: jest.fn(async () => ({ data: { fallback_used: true, location: null, provider: 'fallback' }, success: true })),
  },
  workerRouteService: {
    getMapImage: (...args: unknown[]) => mockWorkerRouteService.getMapImage(...args),
    getPreview: (...args: unknown[]) => mockWorkerRouteService.getPreview(...args),
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
    useAppLanguage: () => 'vi',
  }
})

import { WorkerJobsSurface } from '../worker-surfaces'

const imagePicker = require('expo-image-picker') as {
  launchImageLibraryAsync: jest.Mock
}
const mediaUpload = require('@/lib/media-upload') as {
  uploadJobMediaDrafts: jest.Mock
}

const JOB_ID = 'job_test_1'

type AddressAccess = NonNullable<NonNullable<LocalDeal['broadcast']>['addressAccess']>

const LOBBY_CHECK_IN_REQUIRED: AddressAccess = {
  access_profile: {},
  check_in_required: true,
  customer_handoff_required: true,
  evidence_mode: 'none',
  exact_unit_released: false,
  identity_check_required: true,
  release_stage: 'building_released',
  worker_checked_in: false,
}

const UNIT_RELEASED: AddressAccess = {
  access_profile: {},
  check_in_required: false,
  customer_handoff_required: false,
  evidence_mode: 'manual_photo',
  exact_unit_released: true,
  identity_check_required: false,
  release_stage: 'unit_released',
  worker_checked_in: true,
}

function buildWorkerProfile(): WorkerProfileResponse {
  return {
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
    is_available: true,
    is_suspended: false,
    last_active_at: null,
    legal_name: 'Worker Test',
    problem_specializations: [],
    rating: 4.8,
    service_radius_km: 8,
    service_types: ['electrical'],
    total_jobs: 12,
    verification_status: 'approved',
    years_experience: 3,
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
      jobId: JOB_ID,
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
      prebrief: ['Kael đã tóm tắt phạm vi trước khi thợ nhận việc.'],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: 42,
      serviceType: 'electrical',
      status: 'sent',
    },
    draft: {
      addressLabel: 'Tòa A, Quận 1',
      description: 'Ổ cắm phòng khách chập chờn',
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
    id: JOB_ID,
    scopeChange: null,
    status: 'broadcasting',
  }
}

function buildDealAt(status: JobStatus, overrides: Partial<LocalDeal> = {}, addressAccess?: AddressAccess): LocalDeal {
  const incoming = buildIncomingDeal()
  return {
    ...incoming,
    backendStatus: status,
    broadcast: {
      ...incoming.broadcast!,
      ...(addressAccess ? { addressAccess } : {}),
      fullAddressLabel: 'Tòa A, Quận 1',
      fullAddressVisible: status !== 'worker_candidate_pending',
      secondsRemaining: null,
      status: 'accepted',
    },
    status: status as LocalDealStatus,
    ...overrides,
  }
}

function buildScopePendingDeal(): LocalDeal {
  return buildDealAt('scope_change_pending', {
    scopeChange: {
      id: 'scope-change-pending',
      status: 'waiting_customer_decision',
      requestedDescription: 'Thay đoạn dây bị cháy tại ổ cắm phòng khách.',
      reason: 'Dây bên trong đã quá nhiệt và không còn an toàn để tiếp tục.',
      priceMin: 300000,
      priceMax: 300000,
      kaelReview: null,
      kaelProgress: null,
      evidencePhotoUrls: ['https://storage.example.test/scope-evidence.jpg'],
      requestTiming: 'on_site',
      resumeJobStatus: 'inspecting',
      createdAt: '2026-08-13T13:00:00.000Z',
    },
  }, UNIT_RELEASED)
}

function buildWorkflow(deal: LocalDeal | null) {
  const proposalAction = deal?.status === 'broadcasting' && deal.broadcast?.status === 'sent'
    ? 'accept_priced_offer'
    : null
  mockWorkflowValue = {
    actions: {
      getKaelJobIncident: jest.fn(async () => null),
      hydrateRemoteJobById: jest.fn(async () => true),
      openKaelJobIncident: jest.fn(async () => ({ incident: null })),
      previewScopeChangeFromKaelIncident: jest.fn(async () => false),
      proposeScopeChangeFromKaelIncident: jest.fn(async () => true),
      requestScopeChange: jest.fn(async () => true),
      requestWorkerCancellation: jest.fn(async () => true),
      workerAcceptBroadcast: jest.fn(async () => true),
      workerDeclineBroadcast: jest.fn(async () => true),
      workerMarkBroadcastSeen: jest.fn(async () => true),
      workerRefresh: jest.fn(async () => true),
      workerSelectBroadcast: jest.fn(() => true),
      workerSubmitBroadcastProposal: jest.fn(async () => true),
      workerUpdateAvailability: jest.fn(async () => true),
      workerUpdateStatus: jest.fn(async () => true),
    },
    selectors: {
      canWorkerAccept: Boolean(deal?.broadcast && deal.broadcast.status === 'sent'),
      canWorkerAdvance: true,
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
    workerBroadcasts: [],
    workerEarnings: null as EarningsResponse | null,
    workerJobs: [],
    workerJobsHydrated: true,
    workerMatchingDelivery: null,
    workerPerformanceInsights: null,
    workerProfile: buildWorkerProfile(),
    workerProposalOpportunity: proposalAction && deal?.broadcast?.broadcastId
      ? {
          broadcastId: deal.broadcast.broadcastId,
          proposalAction,
          quoteMode: 'kael_auto_quote',
          result: null,
        }
      : null,
  }
}

function openAt(screenId: string, extra: Record<string, string> = {}) {
  mockRouteParams = { ns_worker_screen: screenId, ...extra }
  render(<WorkerJobsSurface />)
}

async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function replacedScreens(): string[] {
  return mockReplace.mock.calls
    .map(([href]) => String(href))
    .map((href) => href.match(/ns_worker_screen=([^&]+)/)?.[1] ?? href)
}

describe('Worker 11-stage flow: expected order from first sight of a job to payment', () => {
  beforeEach(() => {
    mockPathname = '/(worker)/jobs'
    mockReplace.mockClear()
    mockUseJobChatThread.mockReturnValue({
      error: null,
      loading: false,
      messages: [],
      refresh: jest.fn(),
      send: jest.fn(async () => true),
      sendMessage: jest.fn(async () => true),
      sending: false,
    })
    mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
    mockWorkerKaelChatService.getTrainingConsent.mockImplementation(pendingWorkerKaelServiceCall)
    mockWorkerRouteService.getMapImage.mockResolvedValue(new Blob())
    mockWorkerRouteService.getPreview.mockResolvedValue({
      data: { distance_meters: 3200, duration_seconds: 720 },
      success: true,
    })
    mockGetMobileApiAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test', 'Content-Type': 'application/json' })
    mediaUpload.uploadJobMediaDrafts.mockReset()
    imagePicker.launchImageLibraryAsync.mockReset()
  })

  describe('S1-S3: discovery, acceptance, customer confirmation', () => {
    it('S1 -> S2: selecting the offer card and pressing the primary action opens offer detail 2.2', () => {
      buildWorkflow(buildIncomingDeal())
      openAt('2.1-opportunity-inbox')

      fireEvent.press(screen.getByTestId('worker-v5-opportunity-card'))
      fireEvent.press(screen.getByTestId('worker-v5-primary-action'))

      expect(replacedScreens()).toContain('2.2-offer-detail')
    })

    it('S2 -> S3: accepting a priced offer calls accept and opens the customer-confirmation wait 2.3', async () => {
      buildWorkflow(buildIncomingDeal())
      openAt('2.2-offer-detail')

      fireEvent.press(screen.getByTestId('worker-v5-accept-confirm-action'))

      await waitFor(() => {
        expect(mockWorkflowValue.actions.workerAcceptBroadcast).toHaveBeenCalledWith(JOB_ID)
        expect(replacedScreens()).toContain('2.3-customer-confirmation-wait')
      })
    })

    it('S3: a candidate-pending job stays on 2.3 and nothing on screen advances the job', async () => {
      buildWorkflow(buildDealAt('worker_candidate_pending'))
      openAt('2.3-customer-confirmation-wait')
      await settle()

      expect(screen.getByTestId('worker-v5-screen-2.3-customer-confirmation-wait')).toBeOnTheScreen()
      expect(mockReplace).not.toHaveBeenCalled()
      expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    })

    it('S3 -> S4: once the customer confirms (worker_matched) the wait hands over to travel stage 2.4', async () => {
      buildWorkflow(buildDealAt('worker_matched'))
      openAt('2.3-customer-confirmation-wait')

      await waitFor(() => expect(mockReplace).toHaveBeenCalled())
      expect(replacedScreens()).toEqual(['2.4-route-eta'])
    })
  })

  describe('S4: travel', () => {
    it('S4: a matched job keeps the dedicated travel screen 2.4 instead of being redirected', async () => {
      buildWorkflow(buildDealAt('worker_matched'))
      openAt('2.4-route-eta')
      await settle()

      expect(replacedScreens()).not.toContain('2.7-in-progress')
      expect(screen.getByTestId('worker-v5-screen-2.4-route-eta')).toBeOnTheScreen()
    })

    it('S4: starting travel keeps the worker on 2.4 until arrival is confirmed', async () => {
      buildWorkflow(buildDealAt('worker_matched'))
      openAt('2.4-route-eta')
      expect(screen.getByTestId('stage4-primary')).toHaveTextContent(/Bắt đầu di chuyển/)

      fireEvent.press(screen.getByTestId('stage4-primary'))

      await waitFor(() => expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('worker_on_way'))
      expect(replacedScreens()).toEqual(['2.4-route-eta'])
    })

    it('S4 -> S5: confirming arrival moves the job to arrived and opens Stage 5', async () => {
      buildWorkflow(buildDealAt('worker_on_way'))
      openAt('2.4-route-eta')
      expect(screen.getByTestId('stage4-primary')).toHaveTextContent(/Xác nhận đã tới/)

      fireEvent.press(screen.getByTestId('stage4-primary'))

      await waitFor(() => expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('arrived'))
      expect(replacedScreens()).toEqual(['2.7-in-progress'])
    })

    it('S5 -> S4: an in-progress route for a traveling job hands back to 2.4', async () => {
      buildWorkflow(buildDealAt('worker_on_way'))
      openAt('2.7-in-progress')

      await waitFor(() => expect(replacedScreens()).toEqual(['2.4-route-eta']))
    })
  })

  describe('S5: on-site work', () => {
    it('S5: an arrived worker checks in at the lobby from the main Stage 5 button', async () => {
      buildWorkflow(buildDealAt('arrived', {}, LOBBY_CHECK_IN_REQUIRED))
      imagePicker.launchImageLibraryAsync.mockResolvedValue({
        assets: [{ fileName: 'lobby.jpg', fileSize: 1024, mimeType: 'image/jpeg', uri: 'file://lobby.jpg' }],
        canceled: false,
      })
      mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
        mediaRefs: [`supabase://job-media/${JOB_ID}/access_check_in/lobby.jpg`],
        success: true,
      })
      openAt('2.7-in-progress')
      const primary = screen.getByTestId('stage5-primary')
      expect(primary).toHaveTextContent(/Check-in bằng ảnh tại sảnh/)

      fireEvent.press(primary)

      await waitFor(() => expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('arrived', {
        access_check_in: expect.objectContaining({
          mode: 'manual_photo',
          photo_urls: [`supabase://job-media/${JOB_ID}/access_check_in/lobby.jpg`],
        }),
      }))
    })

    it('S5: after check-in the main button waits for the customer to release the unit', async () => {
      buildWorkflow(buildDealAt('arrived', {}, { ...LOBBY_CHECK_IN_REQUIRED, worker_checked_in: true }))
      openAt('2.7-in-progress')
      await settle()

      const primary = screen.getByTestId('stage5-primary')
      expect(primary).toHaveTextContent(/Chờ khách cho thợ lên/)
      expect(primary).toBeDisabled()
    })

    it('S5: after the unit is released the worker starts inspection from the main button', async () => {
      buildWorkflow(buildDealAt('arrived', {}, UNIT_RELEASED))
      openAt('2.7-in-progress')
      const primary = screen.getByTestId('stage5-primary')
      expect(primary).toHaveTextContent(/Bắt đầu kiểm tra/)

      fireEvent.press(primary)

      await waitFor(() => expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('inspecting'))
    })

    it('S5: without an agreed price the main button opens the post-inspection quote', async () => {
      buildWorkflow(buildDealAt('inspecting', { finalPrice: null }, UNIT_RELEASED))
      openAt('2.7-in-progress')
      const primary = screen.getByTestId('stage5-primary')
      expect(primary).toHaveTextContent(/Báo giá sau khảo sát/)

      await act(async () => {
        fireEvent.press(primary)
        await Promise.resolve()
      })

      expect(screen.getByText('Hồ sơ công việc')).toBeOnTheScreen()
      expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    })

    it('S5: with a customer-approved price the worker starts work from the main button', async () => {
      buildWorkflow(buildDealAt('inspecting', { finalPrice: 220000 }, UNIT_RELEASED))
      openAt('2.7-in-progress')
      const primary = screen.getByTestId('stage5-primary')
      expect(primary).toHaveTextContent(/Bắt đầu công việc/)

      fireEvent.press(primary)

      await waitFor(() => expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('repairing'))
    })

    it('S5 -> S6: reporting a scope issue opens scope-change stage 2.8', () => {
      buildWorkflow(buildDealAt('inspecting', { finalPrice: 220000 }, UNIT_RELEASED))
      openAt('2.7-in-progress')

      fireEvent.press(screen.getByTestId('stage5-scope'))

      expect(replacedScreens()).toContain('2.8-scope-change')
    })

    it('S5 -> S8: a repairing job opens completion evidence stage 2.10', async () => {
      buildWorkflow(buildDealAt('repairing', { finalPrice: 220000 }, UNIT_RELEASED))
      openAt('2.7-in-progress')
      const primary = screen.getByTestId('stage5-primary')
      expect(primary).toHaveTextContent(/Chuẩn bị hồ sơ hoàn tất/)

      fireEvent.press(primary)

      await waitFor(() => expect(replacedScreens()).toContain('2.10-completion-evidence'))
    })
  })

  describe('S6-S7: scope change and customer approval', () => {
    it('S6: the scope-change screen offers a way back to the job', async () => {
      buildWorkflow(buildDealAt('inspecting', { finalPrice: 220000 }, UNIT_RELEASED))
      openAt('2.8-scope-change', { job_id: JOB_ID })
      await settle()

      expect(screen.getByTestId('worker-v5-back')).toBeOnTheScreen()
    })

    it('S6 -> S5: the back button leaves a submitted proposal for the in-progress route', async () => {
      const deal = buildScopePendingDeal()
      buildWorkflow(deal)
      mockWorkflowValue.actions.getKaelJobIncident.mockResolvedValue({
        incident: {
          id: 'incident-proposed',
          job_id: deal.id,
          status: 'scope_proposed',
          evidence_status: 'ready',
          last_summary: 'Đề xuất đã được gửi để khách xem xét.',
          last_question: null,
          last_next_actor: 'customer',
          created_at: '2026-08-13T13:00:00.000Z',
          updated_at: '2026-08-13T13:06:00.000Z',
        },
        quote: null,
      })
      openAt('2.8-scope-change', { job_id: deal.id })
      await waitFor(() => expect(screen.getByText('Khách đang xem đề xuất.')).toBeOnTheScreen())

      fireEvent.press(screen.getByTestId('worker-v5-back'))

      expect(replacedScreens()).toEqual(['2.7-in-progress'])
    })

    it('S5 -> S7: the in-progress route of a scope_change_pending job hands over to approval wait 2.9', async () => {
      buildWorkflow(buildScopePendingDeal())
      openAt('2.7-in-progress')

      await waitFor(() => expect(replacedScreens()).toEqual(['2.9-approval-wait']))
    })

    it('S7: approval wait stays on 2.9 without advancing while the customer decides', async () => {
      buildWorkflow(buildScopePendingDeal())
      openAt('2.9-approval-wait')
      await settle()

      expect(screen.getByTestId('worker-v5-screen-2.9-approval-wait')).toBeOnTheScreen()
      expect(mockReplace).not.toHaveBeenCalled()
      expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    })

    it('S7 -> S5: when the backend resumes the job the worker returns to Stage 5', async () => {
      buildWorkflow(buildDealAt('inspecting', { finalPrice: 300000 }, UNIT_RELEASED))
      openAt('2.9-approval-wait')

      await waitFor(() => expect(replacedScreens()).toContain('2.7-in-progress'))
    })
  })

  describe('S8-S11: completion, settlement, payment', () => {
    it('S8: completion evidence refuses a job that is not repairing yet', async () => {
      buildWorkflow(buildDealAt('inspecting', { finalPrice: 220000 }, UNIT_RELEASED))
      openAt('2.10-completion-evidence')

      await waitFor(() => expect(replacedScreens()).toContain('2.7-in-progress'))
    })

    it('S8 -> S9: submitting a note and photo marks completed_by_worker and opens 2.11', async () => {
      buildWorkflow(buildDealAt('repairing', { finalPrice: 220000 }, UNIT_RELEASED))
      imagePicker.launchImageLibraryAsync.mockResolvedValue({
        assets: [{ fileName: 'completed.jpg', fileSize: 2048, mimeType: 'image/jpeg', uri: 'file://completed.jpg' }],
        canceled: false,
      })
      mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
        mediaRefs: [`supabase://job-media/${JOB_ID}/after/completed.jpg`],
        success: true,
      })
      openAt('2.10-completion-evidence')

      fireEvent.changeText(screen.getByTestId('worker-v5-stage-eight-fidelity-note-input'), 'Đã thay ổ cắm và kiểm tra tải.')
      fireEvent.press(screen.getByTestId('worker-v5-stage-eight-fidelity-add-photo'))
      await waitFor(() => expect(screen.getByTestId('worker-v5-stage-eight-fidelity-submit')).not.toBeDisabled())
      fireEvent.press(screen.getByTestId('worker-v5-stage-eight-fidelity-submit'))

      await waitFor(() => {
        expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('completed_by_worker', expect.objectContaining({
          completion_photo_urls: [`supabase://job-media/${JOB_ID}/after/completed.jpg`],
        }))
        expect(replacedScreens()).toContain('2.11-completion-submitted')
      })
    })

    it.each(['completed_by_worker', 'confirmed_by_customer'] as const)(
      'S9: %s stays on submitted stage 2.11',
      async (status) => {
        buildWorkflow(buildDealAt(status, { finalPrice: 220000 }, UNIT_RELEASED))
        openAt('2.11-completion-submitted')
        await settle()

        expect(screen.getByTestId('worker-v5-screen-2.11-completion-submitted')).toBeOnTheScreen()
        expect(mockReplace).not.toHaveBeenCalled()
      },
    )

    it('S9 -> S10: once platform payment is pending the worker leaves 2.11 for case closed 2.12', async () => {
      buildWorkflow(buildDealAt('payment_pending', {
        finalPrice: 220000,
        payment: { grossAmount: 220000, platformFee: 33000, provider: 'sepay_vietqr', status: 'pending', workerNet: 187000 },
      }, UNIT_RELEASED))
      openAt('2.11-completion-submitted')

      await waitFor(() => expect(replacedScreens()).toContain('2.12-case-closed'))
    })

    it('S10: a case waiting on platform payment shows case closed, not payment received', async () => {
      buildWorkflow(buildDealAt('payment_pending', {
        finalPrice: 220000,
        payment: { grossAmount: 220000, platformFee: 33000, provider: 'sepay_vietqr', status: 'pending', workerNet: 187000 },
      }, UNIT_RELEASED))
      openAt('2.12-case-closed')
      await settle()

      expect(screen.getByTestId('worker-v5-stage-ten-prototype')).toBeOnTheScreen()
      expect(screen.queryByTestId('worker-v5-stage-eleven-payment-confirmed')).toBeNull()
    })

    it('S11: a paid job shows the payment-received stage without a prototype route param', async () => {
      buildWorkflow(buildDealAt('paid', {
        finalPrice: 220000,
        paidAt: '2026-08-15T03:00:00.000Z',
        payment: {
          amountReceived: 220000,
          grossAmount: 220000,
          platformFee: 33000,
          provider: 'sepay_vietqr',
          receivedAt: '2026-08-15T03:00:00.000Z',
          status: 'received',
          workerNet: 187000,
        },
      }, UNIT_RELEASED))
      openAt('2.12-case-closed')
      await settle()

      expect(screen.getByTestId('worker-v5-stage-eleven-payment-confirmed')).toBeOnTheScreen()
    })
  })
})

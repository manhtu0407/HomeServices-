import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AppState, Pressable, Text } from 'react-native'

let mockAuthRole: 'admin' | 'worker' = 'admin'

jest.mock('../auth-provider', () => ({
  useAuth: () => ({
    role: mockAuthRole,
    session: { user: { id: 'worker_test_1' } },
  }),
}))

jest.mock('../app-language', () => ({
  useAppLanguage: () => 'vi',
}))

jest.mock('../realtime', () => ({
  subscribeToJobStatus: jest.fn(() => null),
  subscribeToWorkerBroadcasts: jest.fn(() => null),
  subscribeToWorkerEarnings: jest.fn(() => null),
}))

jest.mock('../services', () => ({
  customerProfileService: {},
  jobService: {
    getWorkerCandidate: jest.fn(async () => ({
      data: { candidate: null, job_id: 'job-candidate-pending', status: 'worker_candidate_pending' },
      status: 200,
      success: true,
    })),
  },
  kaelMemoryService: {},
  notificationService: {
    list: jest.fn(async () => ({
      data: { notifications: [], unread_count: 0 },
      status: 200,
      success: true,
    })),
  },
  workerService: {
    getBroadcasts: jest.fn(),
    getEarnings: jest.fn(),
    getJobs: jest.fn(),
    getPerformanceInsights: jest.fn(),
    getPayoutMethod: jest.fn(),
    getProfile: jest.fn(),
    listWithdrawalRequests: jest.fn(),
    recordActiveMinute: jest.fn(),
    updateAvailability: jest.fn(),
  },
}))

import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

const { workerService: mockWorkerService } = jest.requireMock('../services') as {
  workerService: Record<keyof typeof import('../services').workerService, jest.Mock>
}
const { subscribeToWorkerEarnings: mockSubscribeToWorkerEarnings } = jest.requireMock('../realtime') as {
  subscribeToWorkerEarnings: jest.Mock
}

let refreshPromise: Promise<boolean> | undefined

function WorkerRefreshProbe() {
  const { actions, state } = useFrontendWorkflow()
  return (
    <>
      <Pressable
        onPress={() => {
          refreshPromise = actions.workerRefresh()
        }}
        testID="worker-refresh"
      />
      <Text testID="worker-refresh-deal">{state.deal?.id ?? 'none'}</Text>
      <Text testID="worker-refresh-error">{state.lastError ?? 'none'}</Text>
      <Text testID="worker-refresh-status">
        {state.deal ? `${state.deal.backendStatus ?? 'none'}/${state.deal.broadcast?.status ?? 'none'}` : 'none'}
      </Text>
    </>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

beforeEach(() => {
  mockAuthRole = 'admin'
  refreshPromise = undefined
  jest.clearAllMocks()
})

function arrangeSuccessfulWorkerRuntime() {
  mockWorkerService.getProfile.mockResolvedValue({
    data: {
      active_minutes: 41,
      avatar_url: null,
      bank_account_masked: null,
      bank_name: null,
      date_of_birth: null,
      districts: [],
      gender: null,
      has_cccd: false,
      has_selfie: false,
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
      service_radius_km: 8,
      service_types: ['electrical'],
      total_jobs: 0,
      verification_status: 'approved',
      years_experience: 1,
    },
    status: 200,
    success: true,
  })
  mockWorkerService.getEarnings.mockResolvedValue({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
  mockWorkerService.getPerformanceInsights.mockResolvedValue({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
  mockWorkerService.getPayoutMethod.mockResolvedValue({ data: { payout_method: null }, status: 200, success: true })
  mockWorkerService.getBroadcasts.mockResolvedValue({ data: { broadcasts: [] }, status: 200, success: true })
  mockWorkerService.getJobs.mockResolvedValue({ data: { jobs: [] }, status: 200, success: true })
  mockWorkerService.listWithdrawalRequests.mockResolvedValue({ data: { requests: [] }, status: 200, success: true })
  mockWorkerService.updateAvailability.mockResolvedValue({
    data: { is_available: false, updated_at: '2026-07-13T14:00:00.000Z', worker_id: 'worker_test_1' },
    status: 200,
    success: true,
  })
  ;(mockWorkerService as any).recordActiveMinute.mockResolvedValue({
    data: {
      active_minutes: 42,
      incremented: true,
      last_active_at: '2026-07-13T14:01:00.000Z',
      worker_id: 'worker_test_1',
    },
    status: 200,
    success: true,
  })
}

it('refreshes earnings immediately when the worker ledger changes', async () => {
  mockAuthRole = 'worker'
  arrangeSuccessfulWorkerRuntime()
  const unsubscribe = jest.fn(async () => 'ok')
  mockSubscribeToWorkerEarnings.mockReturnValue({ unsubscribe })

  const view = render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )

  try {
    await waitFor(() => {
      expect(mockSubscribeToWorkerEarnings).toHaveBeenCalledWith('worker_test_1', expect.any(Function))
    })
    mockWorkerService.getEarnings.mockClear()

    await act(async () => {
      const onLedgerChange = mockSubscribeToWorkerEarnings.mock.calls[0][1] as () => void
      onLedgerChange()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockWorkerService.getEarnings).toHaveBeenCalledTimes(1)
    })
  } finally {
    view.unmount()
  }

  expect(unsubscribe).toHaveBeenCalledTimes(1)
})

function buildWorkerJob(status: string) {
  return {
    address_access: {
      access_profile: {},
      check_in_required: true,
      customer_handoff_required: true,
      evidence_mode: 'none',
      exact_unit_released: false,
      identity_check_required: true,
      release_stage: 'area_only',
    },
    address_building: 'Toa A',
    address_floor: null,
    address_unit: null,
    completed_at: null,
    completion_notes: null,
    completion_photo_urls: [],
    created_at: '2026-07-22T05:00:00.000Z',
    display_code: 'NS-ACTIVE-1',
    district: 'q1',
    estimated_earning: 510_000,
    final_price: 600_000,
    gross_amount: null,
    id: 'job-active',
    matched_at: '2026-07-22T05:10:00.000Z',
    payment_amount_received: null,
    payment_code: null,
    payment_expires_at: null,
    payment_provider: null,
    payment_qr_image_url: null,
    payment_received_at: null,
    payment_status: null,
    payment_transfer_content: null,
    photo_urls: [],
    platform_fee: null,
    problem_summary: 'Den chop chon',
    scheduled_at: '2026-07-22T06:00:00.000Z',
    service_type: 'electrical',
    status,
    worker_brief_guidance: null,
    worker_net: null,
  }
}

it('records one authoritative activity minute only after a foreground minute elapses', async () => {
  jest.useFakeTimers()
  mockAuthRole = 'worker'
  arrangeSuccessfulWorkerRuntime()
  const originalAppState = AppState.currentState
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  const view = render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )

  try {
    expect((mockWorkerService as any).recordActiveMinute).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(59_999)
      await Promise.resolve()
    })
    expect((mockWorkerService as any).recordActiveMinute).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect((mockWorkerService as any).recordActiveMinute).toHaveBeenCalledTimes(1)
  } finally {
    view.unmount()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState })
    jest.useRealTimers()
  }
})

it('does not count activity minutes while the app is backgrounded', async () => {
  jest.useFakeTimers()
  mockAuthRole = 'worker'
  arrangeSuccessfulWorkerRuntime()
  const originalAppState = AppState.currentState
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
  const view = render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )

  try {
    await act(async () => {
      jest.advanceTimersByTime(120_000)
      await Promise.resolve()
    })
    expect((mockWorkerService as any).recordActiveMinute).not.toHaveBeenCalled()
  } finally {
    view.unmount()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState })
    jest.useRealTimers()
  }
})

it('starts worker hydration without a startup availability write', async () => {
  mockAuthRole = 'worker'
  const originalAppState = AppState.currentState
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  const profile = deferred<any>()
  const earnings = deferred<any>()
  const performance = deferred<any>()
  const broadcasts = deferred<any>()
  const jobs = deferred<any>()
  mockWorkerService.getProfile.mockReturnValue(profile.promise)
  mockWorkerService.getEarnings.mockReturnValue(earnings.promise)
  mockWorkerService.getPerformanceInsights.mockReturnValue(performance.promise)
  mockWorkerService.getBroadcasts.mockReturnValue(broadcasts.promise)
  mockWorkerService.getJobs.mockReturnValue(jobs.promise)

  const view = render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )

  try {
    await waitFor(() => {
      expect(mockWorkerService.getProfile).toHaveBeenCalledTimes(1)
    })
    expect(mockWorkerService.getEarnings).toHaveBeenCalledTimes(1)
    expect(mockWorkerService.getPerformanceInsights).toHaveBeenCalledTimes(1)
    expect(mockWorkerService.getBroadcasts).toHaveBeenCalledTimes(1)
    expect(mockWorkerService.getJobs).toHaveBeenCalledTimes(1)
    expect(mockWorkerService.updateAvailability).not.toHaveBeenCalled()
  } finally {
    view.unmount()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState })
  }
})

it('retries Worker hydration promptly after a transient initial job-list failure', async () => {
  jest.useFakeTimers()
  mockAuthRole = 'worker'
  arrangeSuccessfulWorkerRuntime()
  const originalAppState = AppState.currentState
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  mockWorkerService.getJobs
    .mockResolvedValueOnce({ code: 'NETWORK_ERROR', error: 'Temporary transport failure', status: 0, success: false })
    .mockResolvedValue({ data: { jobs: [buildWorkerJob('arrived')] }, status: 200, success: true })

  const view = render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )

  try {
    await act(async () => {
      jest.advanceTimersByTime(0)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockWorkerService.getJobs).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(1_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockWorkerService.getJobs).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('worker-refresh-status')).toHaveTextContent('arrived/accepted')
    })

    await act(async () => {
      jest.advanceTimersByTime(3_001)
      await Promise.resolve()
    })
    expect(mockWorkerService.getJobs).toHaveBeenCalledTimes(2)
  } finally {
    view.unmount()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState })
    jest.useRealTimers()
  }
})

it('starts all independent worker hydration requests without serial round trips', async () => {
  const profile = deferred<any>()
  const earnings = deferred<any>()
  const performance = deferred<any>()
  const broadcasts = deferred<any>()
  const jobs = deferred<any>()
  mockWorkerService.getProfile.mockReturnValue(profile.promise)
  mockWorkerService.getEarnings.mockReturnValue(earnings.promise)
  mockWorkerService.getPerformanceInsights.mockReturnValue(performance.promise)
  mockWorkerService.getBroadcasts.mockReturnValue(broadcasts.promise)
  mockWorkerService.getJobs.mockReturnValue(jobs.promise)

  render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )
  fireEvent.press(screen.getByTestId('worker-refresh'))

  await waitFor(() => {
    expect(mockWorkerService.getProfile).toHaveBeenCalledTimes(1)
  })
  expect(mockWorkerService.getEarnings).toHaveBeenCalledTimes(1)
  expect(mockWorkerService.getPerformanceInsights).toHaveBeenCalledTimes(1)
  expect(mockWorkerService.getBroadcasts).toHaveBeenCalledTimes(1)
  expect(mockWorkerService.getJobs).toHaveBeenCalledTimes(1)

  await act(async () => {
    profile.resolve({
      data: {
        bank_account_masked: null,
        bank_name: null,
        date_of_birth: null,
        districts: [],
        gender: null,
        has_cccd: false,
        has_selfie: false,
        home_lat: null,
        home_lng: null,
        id: 'worker_test_1',
        is_approved: true,
        is_available: false,
        is_suspended: false,
        legal_name: null,
        problem_specializations: [],
        rating: 0,
        service_radius_km: null,
        service_types: ['electrical'],
        total_jobs: 0,
        verification_status: 'approved',
        years_experience: 1,
      },
      status: 200,
      success: true,
    })
    earnings.resolve({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
    performance.resolve({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
    broadcasts.resolve({ data: { broadcasts: [] }, status: 200, success: true })
    jobs.resolve({ data: { jobs: [] }, status: 200, success: true })
    await refreshPromise
  })
})

it('hydrates an incoming mission after reconciling the worker job list', async () => {
  const profile = deferred<any>()
  const earnings = deferred<any>()
  const performance = deferred<any>()
  const broadcasts = deferred<any>()
  const jobs = deferred<any>()
  mockWorkerService.getProfile.mockReturnValue(profile.promise)
  mockWorkerService.getEarnings.mockReturnValue(earnings.promise)
  mockWorkerService.getPerformanceInsights.mockReturnValue(performance.promise)
  mockWorkerService.getBroadcasts.mockReturnValue(broadcasts.promise)
  mockWorkerService.getJobs.mockReturnValue(jobs.promise)

  render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )
  fireEvent.press(screen.getByTestId('worker-refresh'))

  await act(async () => {
    broadcasts.resolve({
      data: {
        broadcasts: [{
          broadcast_id: 'broadcast-fast',
          district: 'thu_duc',
          estimated_earning_max: 405_000,
          estimated_earning_min: 170_100,
          estimated_price_max: 450_000,
          estimated_price_min: 189_000,
          expires_at: '2026-07-22T05:19:29.849Z',
          job_id: 'job-fast',
          original_scope_price_quote: {
            schema_version: 'original_scope_price_quote.v1',
            quote_id: 'a1510000-0000-4000-8000-000000000011',
            reference_price_min: 189000,
            reference_price_max: 450000,
            customer_total: 320000,
            platform_fee: 48000,
            worker_net: 272000,
            commission_level: 1,
            commission_rate_bps: 1500,
            price_source: 'baseline_with_market',
            selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
            worker_confirmation_required: true,
            customer_confirmation_required: true,
            worker_confirmed_at: null,
            expires_at: '2099-07-22T05:19:29.849Z',
            evidence_summary: {
              confidence: 'high',
              baseline_source_count: 2,
              market_source_count: 2,
              high_trust_source_count: 2,
              quorum_met: true,
              cap_statement: 'Current confirmed scope only.',
            },
          },
          problem_summary: 'Ổ cắm mất điện',
          scheduled_at: '2026-07-23T03:00:00.000Z',
          seconds_remaining: 60,
          sent_at: '2026-07-22T05:18:29.849Z',
          service_type: 'electrical',
          status: 'sent',
        }],
      },
      status: 200,
      success: true,
    })
    await Promise.resolve()
  })

  expect(screen.getByTestId('worker-refresh-deal')).toHaveTextContent('none')

  await act(async () => {
    profile.resolve({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
    earnings.resolve({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
    performance.resolve({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
    jobs.resolve({ data: { jobs: [] }, status: 200, success: true })
    await refreshPromise
  })

  expect(screen.getByTestId('worker-refresh-deal')).toHaveTextContent('job-fast')
})

it('restores a candidate-pending mission from the worker job list after reload', async () => {
  mockAuthRole = 'worker'
  arrangeSuccessfulWorkerRuntime()
  mockWorkerService.getJobs.mockResolvedValue({
    data: {
      jobs: [{
        address_access: {
          access_profile: {},
          check_in_required: true,
          customer_handoff_required: true,
          evidence_mode: 'none',
          exact_unit_released: false,
          identity_check_required: true,
          release_stage: 'area_only',
        },
        address_building: null,
        address_floor: null,
        address_unit: null,
        completed_at: null,
        completion_notes: null,
        completion_photo_urls: [],
        created_at: '2026-07-22T05:00:00.000Z',
        display_code: 'NS-PENDING-1',
        district: 'Thủ Đức',
        estimated_earning: null,
        final_price: null,
        gross_amount: null,
        id: 'job-candidate-pending',
        matched_at: null,
        payment_amount_received: null,
        payment_code: null,
        payment_expires_at: null,
        payment_provider: null,
        payment_qr_image_url: null,
        payment_received_at: null,
        payment_status: null,
        payment_transfer_content: null,
        photo_urls: [],
        platform_fee: null,
        problem_summary: 'Ổ cắm mất điện',
        scheduled_at: '2026-07-22T06:00:00.000Z',
        service_type: 'electrical',
        status: 'worker_candidate_pending',
        worker_brief_guidance: null,
        worker_net: null,
      }],
    },
    status: 200,
    success: true,
  })

  render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )
  fireEvent.press(screen.getByTestId('worker-refresh'))

  await waitFor(() => {
    expect(screen.getByTestId('worker-refresh-deal')).toHaveTextContent('job-candidate-pending')
  })
  const { jobService } = jest.requireMock('../services')
  expect(jobService.getWorkerCandidate).not.toHaveBeenCalled()
  expect(screen.getByTestId('worker-refresh-error')).toHaveTextContent('none')
})

it('keeps an active job visible while a stale offer is being reconciled', async () => {
  arrangeSuccessfulWorkerRuntime()
  const activeJob = buildWorkerJob('arrived')
  mockWorkerService.getJobs.mockResolvedValueOnce({ data: { jobs: [activeJob] }, status: 200, success: true })

  render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )
  fireEvent.press(screen.getByTestId('worker-refresh'))

  await waitFor(() => {
    expect(screen.getByTestId('worker-refresh-status')).toHaveTextContent('arrived/accepted')
  })

  const slowJobs = deferred<any>()
  mockWorkerService.getBroadcasts.mockResolvedValueOnce({
    data: {
      broadcasts: [{
        broadcast_id: 'broadcast-stale',
        district: 'q1',
        estimated_earning_max: 510_000,
        estimated_earning_min: 510_000,
        estimated_price_max: 600_000,
        estimated_price_min: 600_000,
        expires_at: '2026-07-22T05:19:29.849Z',
        job_id: 'job-active',
        problem_summary: 'Den chop chon',
        scheduled_at: '2026-07-22T06:00:00.000Z',
        seconds_remaining: 60,
        sent_at: '2026-07-22T05:18:29.849Z',
        service_type: 'electrical',
        status: 'sent',
      }],
    },
    status: 200,
    success: true,
  })
  mockWorkerService.getJobs.mockReturnValueOnce(slowJobs.promise)

  fireEvent.press(screen.getByTestId('worker-refresh'))

  await waitFor(() => {
    expect(mockWorkerService.getJobs).toHaveBeenCalledTimes(2)
  })
  expect(screen.getByTestId('worker-refresh-status')).toHaveTextContent('arrived/accepted')

  await act(async () => {
    slowJobs.resolve({ data: { jobs: [activeJob] }, status: 200, success: true })
    await refreshPromise
  })

  expect(screen.getByTestId('worker-refresh-status')).toHaveTextContent('arrived/accepted')
})

it('clears a stale candidate-pending mission after the authoritative worker lists become empty', async () => {
  arrangeSuccessfulWorkerRuntime()
  mockWorkerService.getJobs
    .mockResolvedValueOnce({
      data: {
        jobs: [{
          address_access: {
            access_profile: {},
            check_in_required: true,
            customer_handoff_required: true,
            evidence_mode: 'none',
            exact_unit_released: false,
            identity_check_required: true,
            release_stage: 'area_only',
          },
          address_building: null,
          address_floor: null,
          address_unit: null,
          completed_at: null,
          completion_notes: null,
          completion_photo_urls: [],
          created_at: '2026-07-22T05:00:00.000Z',
          display_code: 'NS-PENDING-1',
          district: 'thu_duc',
          estimated_earning: null,
          final_price: null,
          gross_amount: null,
          id: 'job-candidate-pending',
          matched_at: null,
          payment_amount_received: null,
          payment_code: null,
          payment_expires_at: null,
          payment_provider: null,
          payment_qr_image_url: null,
          payment_received_at: null,
          payment_status: null,
          payment_transfer_content: null,
          photo_urls: [],
          platform_fee: null,
          problem_summary: 'Socket lost power',
          scheduled_at: '2026-07-22T06:00:00.000Z',
          service_type: 'electrical',
          status: 'worker_candidate_pending',
          worker_brief_guidance: null,
          worker_net: null,
        }],
      },
      status: 200,
      success: true,
    })
    .mockResolvedValue({ data: { jobs: [] }, status: 200, success: true })

  render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )

  fireEvent.press(screen.getByTestId('worker-refresh'))

  await waitFor(() => {
    expect(screen.getByTestId('worker-refresh-deal')).toHaveTextContent('job-candidate-pending')
  })

  const profileResult = await mockWorkerService.getProfile()
  const slowProfile = deferred<any>()
  const slowEarnings = deferred<any>()
  const slowPerformance = deferred<any>()
  mockWorkerService.getProfile.mockReturnValue(slowProfile.promise)
  mockWorkerService.getEarnings.mockReturnValue(slowEarnings.promise)
  mockWorkerService.getPerformanceInsights.mockReturnValue(slowPerformance.promise)
  fireEvent.press(screen.getByTestId('worker-refresh'))

  try {
    await waitFor(() => {
      expect(screen.getByTestId('worker-refresh-deal')).toHaveTextContent('none')
    })
  } finally {
    await act(async () => {
      slowProfile.resolve(profileResult)
      slowEarnings.resolve({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
      slowPerformance.resolve({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
      await refreshPromise
    })
  }
  expect(screen.getByTestId('worker-refresh-error')).toHaveTextContent('none')
})

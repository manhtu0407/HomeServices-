import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AppState, Pressable } from 'react-native'

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
}))

jest.mock('../services', () => ({
  customerProfileService: {},
  jobService: {},
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
    getProfile: jest.fn(),
    recordActiveMinute: jest.fn(),
    updateAvailability: jest.fn(),
  },
}))

import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

const { workerService: mockWorkerService } = jest.requireMock('../services') as {
  workerService: Record<keyof typeof import('../services').workerService, jest.Mock>
}

let refreshPromise: Promise<boolean> | undefined

function WorkerRefreshProbe() {
  const { actions } = useFrontendWorkflow()
  return (
    <Pressable
      onPress={() => {
        refreshPromise = actions.workerRefresh()
      }}
      testID="worker-refresh"
    />
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
  mockWorkerService.getBroadcasts.mockResolvedValue({ data: { broadcasts: [] }, status: 200, success: true })
  mockWorkerService.getJobs.mockResolvedValue({ data: { jobs: [] }, status: 200, success: true })
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

it('starts worker hydration without waiting for the startup availability write', async () => {
  mockAuthRole = 'worker'
  const originalAppState = AppState.currentState
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  const profile = deferred<any>()
  const earnings = deferred<any>()
  const performance = deferred<any>()
  const broadcasts = deferred<any>()
  const jobs = deferred<any>()
  const availability = deferred<any>()
  mockWorkerService.getProfile.mockReturnValue(profile.promise)
  mockWorkerService.getEarnings.mockReturnValue(earnings.promise)
  mockWorkerService.getPerformanceInsights.mockReturnValue(performance.promise)
  mockWorkerService.getBroadcasts.mockReturnValue(broadcasts.promise)
  mockWorkerService.getJobs.mockReturnValue(jobs.promise)
  mockWorkerService.updateAvailability.mockReturnValue(availability.promise)

  const view = render(
    <FrontendWorkflowProvider>
      <WorkerRefreshProbe />
    </FrontendWorkflowProvider>,
  )

  try {
    await waitFor(() => {
      expect(mockWorkerService.updateAvailability).toHaveBeenCalledWith({ is_available: false })
      expect(mockWorkerService.getProfile).toHaveBeenCalledTimes(1)
    })
    expect(mockWorkerService.getEarnings).toHaveBeenCalledTimes(1)
    expect(mockWorkerService.getPerformanceInsights).toHaveBeenCalledTimes(1)
    expect(mockWorkerService.getBroadcasts).toHaveBeenCalledTimes(1)
    expect(mockWorkerService.getJobs).toHaveBeenCalledTimes(1)
  } finally {
    view.unmount()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState })
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

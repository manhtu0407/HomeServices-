import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

const mockRequestPermission = jest.fn()
const mockGetCurrentPosition = jest.fn()
const mockWatchPosition = jest.fn()
const mockGetPreview = jest.fn()
const mockReportPosition = jest.fn()

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPosition(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  watchPositionAsync: (...args: unknown[]) => mockWatchPosition(...args),
}), { virtual: true })

jest.mock('@/lib/api', () => ({
  mobileApiUrl: (path: string) => `https://mobile-api.test${path}`,
}))

jest.mock('@/lib/services', () => ({
  workerRouteService: {
    getPreview: (...args: unknown[]) => mockGetPreview(...args),
    reportTravelPosition: (...args: unknown[]) => mockReportPosition(...args),
  },
}))

import { useWorkerV5RoutePreview } from '../jobs/use-worker-route-preview'

type RoutePreviewState = ReturnType<typeof useWorkerV5RoutePreview>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function deal(jobId: string): LocalDeal {
  return {
    id: jobId,
    broadcast: {
      addressAccess: { release_stage: 'building_released' },
      jobId,
    },
  } as unknown as LocalDeal
}

describe('useWorkerV5RoutePreview lifecycle isolation', () => {
  beforeEach(() => {
    mockRequestPermission.mockReset()
    mockGetCurrentPosition.mockReset()
    mockWatchPosition.mockReset()
    mockGetPreview.mockReset()
    mockRequestPermission.mockResolvedValue({ granted: true })
    mockWatchPosition.mockResolvedValue({ remove: jest.fn() })
    mockGetPreview.mockResolvedValue({
      data: { distance_meters: 1_200, duration_seconds: 480 },
      success: true,
    })
  })

  it('does not expose the previous job location or route while the next job initializes', async () => {
    const nextPosition = deferred<{ coords: { latitude: number; longitude: number } }>()
    mockGetCurrentPosition
      .mockResolvedValueOnce({ coords: { latitude: 10.77, longitude: 106.70 } })
      .mockReturnValueOnce(nextPosition.promise)

    const { result, rerender } = renderHook<RoutePreviewState, { currentDeal: LocalDeal }>(
      ({ currentDeal }) => useWorkerV5RoutePreview(currentDeal, true),
      { initialProps: { currentDeal: deal('job-a') } },
    )
    await waitFor(() => expect(result.current.route?.distanceMeters).toBe(1_200))

    rerender({ currentDeal: deal('job-b') })

    expect(result.current.locationStatus).toBe('loading')
    expect(result.current.origin).toBeNull()
    expect(result.current.route).toBeNull()
    expect(result.current.mapUri).toBeNull()

    await act(async () => {
      nextPosition.resolve({ coords: { latitude: 10.78, longitude: 106.71 } })
    })
  })

  it('removes a watcher that resolves after its effect was cancelled', async () => {
    const pendingWatcher = deferred<{ remove: jest.Mock }>()
    const remove = jest.fn()
    mockGetCurrentPosition.mockResolvedValue({ coords: { latitude: 10.77, longitude: 106.70 } })
    mockWatchPosition.mockReturnValue(pendingWatcher.promise)

    const { rerender } = renderHook<RoutePreviewState, { enabled: boolean }>(
      ({ enabled }) => useWorkerV5RoutePreview(deal('job-a'), enabled),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1))

    rerender({ enabled: false })
    await act(async () => {
      pendingWatcher.resolve({ remove })
    })

    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('keeps location ready without route data when preview loading rejects', async () => {
    mockGetCurrentPosition.mockResolvedValue({ coords: { latitude: 10.77, longitude: 106.70 } })
    mockGetPreview.mockRejectedValue(new Error('route provider failed'))

    const { result } = renderHook(() => useWorkerV5RoutePreview(deal('job-a'), true))

    await waitFor(() => expect(mockGetPreview).toHaveBeenCalledTimes(1))
    expect(result.current.locationStatus).toBe('ready')
    expect(result.current.mapUri).toContain('/workers/me/jobs/job-a/route-map')
    expect(result.current.route).toBeNull()
  })
})

describe('useWorkerV5RoutePreview while the worker is on the way', () => {
  const onTheWay = (jobId: string) => ({ ...deal(jobId), backendStatus: 'worker_on_way' }) as unknown as LocalDeal
  const sharedRoute = { data: { distance_meters: 2_500, duration_seconds: 600, destination: null, encoded_polyline: null, fetched_at: 'now' }, success: true }

  beforeEach(() => {
    jest.useRealTimers()
    mockRequestPermission.mockReset()
    mockGetCurrentPosition.mockReset()
    mockWatchPosition.mockReset()
    mockGetPreview.mockReset()
    mockReportPosition.mockReset()
    mockRequestPermission.mockResolvedValue({ granted: true })
    mockWatchPosition.mockResolvedValue({ remove: jest.fn() })
    mockGetCurrentPosition.mockResolvedValue({ coords: { latitude: 10.77, longitude: 106.70 } })
    mockGetPreview.mockResolvedValue({ data: { distance_meters: 1_200, duration_seconds: 480 }, success: true })
    mockReportPosition.mockResolvedValue(sharedRoute)
  })
  afterEach(() => jest.useRealTimers())

  it('shares the position and draws the route from the same answer, without a second lookup', async () => {
    const { result } = renderHook(() => useWorkerV5RoutePreview(onTheWay('job-a'), true))
    await waitFor(() => expect(result.current.route?.distanceMeters).toBe(2_500))
    expect(mockReportPosition).toHaveBeenCalledWith('job-a', { latitude: 10.77, longitude: 106.70 })
    expect(mockGetPreview).not.toHaveBeenCalled()
  })

  it('keeps the worker\'s own map working when sharing is refused', async () => {
    mockReportPosition.mockResolvedValue({ success: false, status: 500, code: 'DB_ERROR' })
    const { result } = renderHook(() => useWorkerV5RoutePreview(onTheWay('job-a'), true))
    await waitFor(() => expect(result.current.route?.distanceMeters).toBe(1_200))
    expect(mockGetPreview).toHaveBeenCalledTimes(1)
  })

  it('does not spend a second lookup when the server says the last report was too recent', async () => {
    mockReportPosition.mockResolvedValue({ success: false, status: 429, code: 'TRAVEL_REPORT_TOO_SOON' })
    renderHook(() => useWorkerV5RoutePreview(onTheWay('job-a'), true))
    await waitFor(() => expect(mockReportPosition).toHaveBeenCalledTimes(1))
    expect(mockGetPreview).not.toHaveBeenCalled()
  })

  it('never shares a position outside the trip', async () => {
    const { result } = renderHook(() => useWorkerV5RoutePreview(deal('job-a'), true))
    await waitFor(() => expect(result.current.route?.distanceMeters).toBe(1_200))
    expect(mockReportPosition).not.toHaveBeenCalled()
  })

  it('sends the last position again on a heartbeat so a stationary worker stays live', async () => {
    jest.useFakeTimers()
    renderHook(() => useWorkerV5RoutePreview(onTheWay('job-a'), true))
    await act(async () => { await Promise.resolve() })
    await waitFor(() => expect(mockReportPosition).toHaveBeenCalledTimes(1))
    await act(async () => { jest.advanceTimersByTime(45_000) })
    expect(mockReportPosition).toHaveBeenCalledTimes(2)
  })
})

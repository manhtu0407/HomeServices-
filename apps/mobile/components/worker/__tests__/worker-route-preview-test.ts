import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

const mockRequestPermission = jest.fn()
const mockGetCurrentPosition = jest.fn()
const mockWatchPosition = jest.fn()
const mockGetPreview = jest.fn()

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

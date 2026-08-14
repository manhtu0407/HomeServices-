import { act, renderHook } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

const mockPlacesAutocomplete = jest.fn()
const mockWorkerKaelChatCreate = jest.fn()
const mockWorkerKaelChatGet = jest.fn()
const mockWorkerKaelChatStreamTurn = jest.fn()

jest.mock('@/lib/services', () => ({
  placesService: {
    autocomplete: (...args: unknown[]) => mockPlacesAutocomplete(...args),
  },
  workerKaelChatService: {
    create: (...args: unknown[]) => mockWorkerKaelChatCreate(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatGet(...args),
    streamTurn: (...args: unknown[]) => mockWorkerKaelChatStreamTurn(...args),
  },
}))

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(),
}))

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}))

import { useBookingAddressLookup } from '../customer/booking/use-booking-address-lookup'
import { useCustomerCaseHydration } from '../customer/kael-chat/use-customer-case-hydration'
import { useWorkerV5KaelOrbChat } from '../worker/chat/use-worker-kael-orb-chat'
import { useWorkerV5ScopeChangeDraft } from '../worker/jobs/use-worker-scope-change-draft'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function addressResult(placeId: string) {
  return {
    data: {
      fallback_used: false,
      suggestions: [{
        label: placeId,
        main_text: placeId,
        place_id: placeId,
        secondary_text: null,
      }],
    },
    success: true as const,
  }
}

function workerDeal(jobId: string): LocalDeal {
  return {
    backendStatus: 'worker_matched',
    broadcast: {
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 1',
      jobId,
      prebrief: [],
      problemSummary: 'Kiểm tra điện',
      secondsRemaining: null,
      serviceType: 'electrical',
      status: 'accepted',
    },
    draft: {
      addressLabel: '',
      description: 'Kiểm tra điện',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: [],
      serviceType: 'electrical',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: `deal-${jobId}`,
    scopeChange: null,
    status: 'worker_matched',
  }
}

function workerChatSuccess(sessionId: string, jobId: string) {
  return {
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: jobId,
        progress: null,
        started_at: '2026-07-15T00:00:00.000Z',
        status: 'active',
        total_turns: 0,
        worker_id: 'worker-a',
      },
      turns: [],
    },
    status: 200,
    success: true as const,
  }
}

describe('hook owner isolation', () => {
  beforeEach(() => {
    jest.useRealTimers()
    mockPlacesAutocomplete.mockReset()
    mockWorkerKaelChatCreate.mockReset()
    mockWorkerKaelChatGet.mockReset()
    mockWorkerKaelChatStreamTurn.mockReset()
  })

  it('keeps the first address request from resurfacing after A -> B -> A', async () => {
    jest.useFakeTimers()
    const firstA = deferred<ReturnType<typeof addressResult>>()
    const requestB = deferred<ReturnType<typeof addressResult>>()
    const secondA = deferred<ReturnType<typeof addressResult>>()
    mockPlacesAutocomplete
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(requestB.promise)
      .mockReturnValueOnce(secondA.promise)

    const { result, rerender } = renderHook<
      ReturnType<typeof useBookingAddressLookup>,
      { address: string }
    >(
      ({ address }) => useBookingAddressLookup(address, true),
      { initialProps: { address: 'A address' } },
    )
    act(() => jest.advanceTimersByTime(260))
    rerender({ address: 'B address' })
    act(() => jest.advanceTimersByTime(260))
    rerender({ address: 'A address' })
    act(() => jest.advanceTimersByTime(260))

    await act(async () => {
      firstA.resolve(addressResult('stale-a'))
      await Promise.resolve()
    })
    expect(result.current).toEqual({ fallbackUsed: false, pending: true, suggestions: [] })

    await act(async () => {
      secondA.resolve(addressResult('fresh-a'))
      await Promise.resolve()
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.suggestions.map((item) => item.place_id)).toEqual(['fresh-a'])
  })

  it('keeps a stale hydration result out of a later A owner generation', async () => {
    const firstA = deferred<boolean>()
    const requestB = deferred<boolean>()
    const secondA = deferred<boolean>()
    const hydrate = jest.fn()
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(requestB.promise)
      .mockReturnValueOnce(secondA.promise)

    const { result, rerender } = renderHook<
      ReturnType<typeof useCustomerCaseHydration>,
      { routeJobId: string | null }
    >(
      ({ routeJobId }) => useCustomerCaseHydration({
        active: true,
        hydrate,
        routeJobId,
        sessionAccessToken: 'customer-session-token',
      }),
      { initialProps: { routeJobId: 'job-a' as string | null } },
    )
    rerender({ routeJobId: 'job-b' })
    rerender({ routeJobId: 'job-a' })

    await act(async () => {
      firstA.resolve(false)
      await Promise.resolve()
    })
    expect(result.current).toEqual({ authRequired: false, failed: false, hydrating: true })

    await act(async () => {
      secondA.resolve(true)
      await Promise.resolve()
    })
    expect(result.current).toEqual({ authRequired: false, failed: false, hydrating: false })
  })

  it('does not restore or mutate the first scope draft after A -> B -> A', () => {
    const dealA = workerDeal('job-a')
    const dealB = workerDeal('job-b')
    const { result, rerender } = renderHook<
      ReturnType<typeof useWorkerV5ScopeChangeDraft>,
      { deal: LocalDeal | null }
    >(
      ({ deal }) => useWorkerV5ScopeChangeDraft(deal),
      { initialProps: { deal: dealA } },
    )
    const firstAOwnerKey = result.current.ownerKey
    const updateFirstA = result.current.updateOwnerState

    act(() => {
      updateFirstA(firstAOwnerKey, (current) => ({ ...current, description: 'first-a' }))
    })
    rerender({ deal: dealB })
    rerender({ deal: dealA })

    expect(result.current.state.description).toBe('')
    act(() => {
      updateFirstA(firstAOwnerKey, (current) => ({ ...current, reason: 'late-first-a' }))
    })
    expect(result.current.state.reason).toBe('')
  })

  it('keeps the scope-draft updater stable while its owner is unchanged', () => {
    const deal = workerDeal('job-a')
    const { result, rerender } = renderHook(
      ({ currentDeal }: { currentDeal: LocalDeal | null }) =>
        useWorkerV5ScopeChangeDraft(currentDeal),
      { initialProps: { currentDeal: deal } },
    )
    const updater = result.current.updateOwnerState

    rerender({ currentDeal: deal })

    expect(result.current.updateOwnerState).toBe(updater)
  })

  it('does not restore a pending chat or accept its late failure after A -> B -> A', async () => {
    const createFirstA = deferred<{ error: string; success: false }>()
    mockWorkerKaelChatCreate.mockReturnValueOnce(createFirstA.promise)
    const dealA = workerDeal('job-a')
    const dealB = workerDeal('job-b')
    const { result, rerender } = renderHook<
      ReturnType<typeof useWorkerV5KaelOrbChat>,
      { deal: LocalDeal | null }
    >(
      ({ deal }) => useWorkerV5KaelOrbChat(deal, 'vi'),
      { initialProps: { deal: dealA } },
    )
    let sendFirstA!: Promise<void>

    await act(async () => {
      sendFirstA = result.current.send('Kiểm tra giúp tôi')
      await Promise.resolve()
    })
    rerender({ deal: dealB })
    rerender({ deal: dealA })

    await act(async () => {
      createFirstA.resolve({ error: 'late failure', success: false })
      await sendFirstA
    })
    expect(result.current).toEqual(expect.objectContaining({
      busy: false,
      error: null,
      liveTurns: [],
    }))
  })

  it('lets the later A generation send while A1 is pending and keeps the A2 lock intact', async () => {
    const createFirstA = deferred<{ error: string; success: false }>()
    const createSecondA = deferred<{ error: string; success: false }>()
    mockWorkerKaelChatCreate
      .mockReturnValueOnce(createFirstA.promise)
      .mockReturnValueOnce(createSecondA.promise)
    const dealA = workerDeal('job-a')
    const dealB = workerDeal('job-b')
    const { result, rerender } = renderHook<
      ReturnType<typeof useWorkerV5KaelOrbChat>,
      { deal: LocalDeal | null }
    >(
      ({ deal }) => useWorkerV5KaelOrbChat(deal, 'vi'),
      { initialProps: { deal: dealA } },
    )
    let sendFirstA!: Promise<void>
    let sendSecondA!: Promise<void>

    await act(async () => {
      sendFirstA = result.current.send('Tin từ A1')
      await Promise.resolve()
    })
    rerender({ deal: dealB })
    rerender({ deal: dealA })
    await act(async () => {
      sendSecondA = result.current.send('Tin từ A2')
      await Promise.resolve()
    })

    expect(mockWorkerKaelChatCreate).toHaveBeenCalledTimes(2)
    await act(async () => {
      createFirstA.resolve({ error: 'late A1 failure', success: false })
      await sendFirstA
    })
    expect(result.current).toEqual(expect.objectContaining({
      busy: true,
      error: null,
      liveTurns: [expect.objectContaining({ text: 'Tin từ A2' })],
    }))

    await act(async () => {
      createSecondA.resolve({ error: 'A2 failure', success: false })
      await sendSecondA
    })
    expect(result.current.busy).toBe(false)
  })

  it('keeps a late A1 success from clearing the A2 turn retry key', async () => {
    const createFirstA = deferred<ReturnType<typeof workerChatSuccess>>()
    const createSecondA = deferred<ReturnType<typeof workerChatSuccess>>()
    mockWorkerKaelChatCreate
      .mockReturnValueOnce(createFirstA.promise)
      .mockReturnValueOnce(createSecondA.promise)
    mockWorkerKaelChatStreamTurn
      .mockResolvedValueOnce(workerChatSuccess('session-a1', 'job-a'))
      .mockResolvedValue({
        code: 'STREAM_TIMEOUT',
        error: 'ambiguous stream failure',
        status: 0,
        success: false,
      })
    mockWorkerKaelChatGet.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'recovery unavailable',
      status: 0,
      success: false,
    })
    const { result, rerender } = renderHook<
      ReturnType<typeof useWorkerV5KaelOrbChat>,
      { deal: LocalDeal | null }
    >(
      ({ deal }) => useWorkerV5KaelOrbChat(deal, 'vi'),
      { initialProps: { deal: workerDeal('job-a') as LocalDeal | null } },
    )
    let sendFirstA!: Promise<void>
    let sendSecondA!: Promise<void>

    await act(async () => {
      sendFirstA = result.current.send('Tin từ A1')
      await Promise.resolve()
    })
    rerender({ deal: workerDeal('job-b') })
    rerender({ deal: workerDeal('job-a') })
    await act(async () => {
      sendSecondA = result.current.send('Tin từ A2')
      await Promise.resolve()
    })

    await act(async () => {
      createFirstA.resolve(workerChatSuccess('session-a1', 'job-a'))
      await sendFirstA
    })
    await act(async () => {
      createSecondA.resolve(workerChatSuccess('session-a2', 'job-a'))
      await sendSecondA
    })
    await act(async () => {
      await result.current.send('Tin từ A2')
    })

    const firstA2TurnKey = mockWorkerKaelChatStreamTurn.mock.calls[1][1].client_request_id
    const retryA2TurnKey = mockWorkerKaelChatStreamTurn.mock.calls[2][1].client_request_id
    expect(retryA2TurnKey).toBe(firstA2TurnKey)
  })

  it('reuses a worker Kael session key while its payload is unchanged and rotates it for a new owner', async () => {
    mockWorkerKaelChatCreate.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'ambiguous failure',
      status: 0,
      success: false,
    })
    const { result, rerender } = renderHook<
      ReturnType<typeof useWorkerV5KaelOrbChat>,
      { deal: LocalDeal | null }
    >(
      ({ deal }) => useWorkerV5KaelOrbChat(deal, 'vi'),
      { initialProps: { deal: workerDeal('job-a') as LocalDeal | null } },
    )

    await act(async () => {
      await result.current.send('Kiểm tra giúp tôi')
      await result.current.send('Kiểm tra giúp tôi')
      await result.current.send('Kiểm tra lại phần khác')
    })

    rerender({ deal: workerDeal('job-b') })
    await act(async () => {
      await result.current.send('Inspect the new job')
    })

    const firstKey = mockWorkerKaelChatCreate.mock.calls[0][0].client_request_id
    const retryKey = mockWorkerKaelChatCreate.mock.calls[1][0].client_request_id
    const changedMessageKey = mockWorkerKaelChatCreate.mock.calls[2][0].client_request_id
    const changedOwnerKey = mockWorkerKaelChatCreate.mock.calls[3][0].client_request_id
    expect(retryKey).toBe(firstKey)
    expect(changedMessageKey).toBe(firstKey)
    expect(changedOwnerKey).not.toBe(firstKey)
  })

  it('reuses the worker Kael turn key after an ambiguous stream failure', async () => {
    mockWorkerKaelChatCreate.mockResolvedValue({
      data: {
        session: {
          closed_at: null,
          id: 'session-a',
          job_id: 'job-a',
          progress: null,
          started_at: '2026-07-15T00:00:00.000Z',
          status: 'active',
          total_turns: 0,
          worker_id: 'worker-a',
        },
        turns: [],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatStreamTurn.mockResolvedValue({
      code: 'STREAM_TIMEOUT',
      error: 'ambiguous stream failure',
      status: 0,
      success: false,
    })
    mockWorkerKaelChatGet.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'recovery unavailable',
      status: 0,
      success: false,
    })
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(workerDeal('job-a'), 'vi'))

    await act(async () => {
      await result.current.send('Kiểm tra giúp tôi')
    })
    await act(async () => {
      await result.current.send('Kiểm tra giúp tôi')
    })

    const firstKey = mockWorkerKaelChatStreamTurn.mock.calls[0][1].client_request_id
    const retryKey = mockWorkerKaelChatStreamTurn.mock.calls[1][1].client_request_id
    expect(retryKey).toBe(firstKey)
    expect(mockWorkerKaelChatCreate).toHaveBeenCalledTimes(1)
  })
})

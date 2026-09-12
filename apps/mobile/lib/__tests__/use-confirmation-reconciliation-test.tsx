import { act, renderHook } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import { useConfirmationReconciliation } from '../frontend-workflow/use-confirmation-reconciliation'

describe('native confirmation reconciliation scheduling', () => {
  let onAppState: ((state: AppStateStatus) => void) | undefined
  const remove = jest.fn()
  const input = {
    sessionId: 'session-1',
    ownerId: 'customer-1',
    pendingSessionId: 'session-1',
    reconciling: true,
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.spyOn(globalThis, 'setInterval')
    jest.spyOn(globalThis, 'clearInterval')
    onAppState = undefined
    remove.mockClear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppState = listener
      return { remove }
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('reports a rejected reconciliation and retries on polling and foreground without overlap', async () => {
    let rejectFirst: ((reason: Error) => void) | undefined
    const reconcile = jest.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject }))
      .mockResolvedValue(undefined)
    const onUnavailable = jest.fn()
    const view = renderHook(() => useConfirmationReconciliation({ ...input, reconcile, onUnavailable }))
    expect(reconcile).toHaveBeenCalledTimes(1)
    await act(async () => {
      onAppState?.('active')
      await jest.advanceTimersByTimeAsync(3_000)
    })
    expect(reconcile).toHaveBeenCalledTimes(1)
    await act(async () => { rejectFirst?.(new Error('private storage failure')) })
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    expect(onUnavailable).toHaveBeenCalledWith()
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000) })
    expect(reconcile).toHaveBeenCalledTimes(2)
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000) })
    expect(reconcile).toHaveBeenCalledTimes(2)
    await act(async () => { onAppState?.('active') })
    expect(reconcile).toHaveBeenCalledTimes(3)
    view.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(clearInterval).toHaveBeenCalledWith((setInterval as jest.Mock).mock.results[0].value)
    await act(async () => { await jest.advanceTimersByTimeAsync(9_000) })
    expect(reconcile).toHaveBeenCalledTimes(3)
  })

  it('does not report a late rejection after unmount or retain native polling', async () => {
    let rejectPending: ((reason: Error) => void) | undefined
    const reconcile = jest.fn(() => new Promise<void>((_resolve, reject) => { rejectPending = reject }))
    const onUnavailable = jest.fn()
    const view = renderHook(() => useConfirmationReconciliation({ ...input, reconcile, onUnavailable }))
    view.unmount()
    await act(async () => { rejectPending?.(new Error('late private storage failure')) })
    expect(onUnavailable).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(clearInterval).toHaveBeenCalledWith((setInterval as jest.Mock).mock.results[0].value)
  })

  it('does not schedule a session with no authenticated owner', async () => {
    const reconcile = jest.fn(async () => undefined)
    const view = renderHook(() => useConfirmationReconciliation({ ...input, ownerId: null, reconcile, onUnavailable: jest.fn() }))
    await act(async () => { await jest.advanceTimersByTimeAsync(6_000) })
    expect(reconcile).not.toHaveBeenCalled()
    expect(AppState.addEventListener).not.toHaveBeenCalled()
    view.unmount()
  })

  it('starts recovery for the new owner without letting an old request unlock the new in-flight request', async () => {
    let finishFirst!: () => void
    let finishSecond!: () => void
    const reconcile = jest.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishSecond = resolve }))
      .mockResolvedValue(undefined)
    const onUnavailable = jest.fn()
    const view = renderHook<void, { ownerId: string }>(({ ownerId }) => useConfirmationReconciliation({
      ...input, ownerId, reconcile, onUnavailable,
    }), { initialProps: { ownerId: 'customer-1' } })
    view.rerender({ ownerId: 'customer-2' })
    expect(reconcile).toHaveBeenCalledTimes(2)
    await act(async () => { finishFirst() })
    await act(async () => { onAppState?.('active'); await jest.advanceTimersByTimeAsync(3_000) })
    expect(reconcile).toHaveBeenCalledTimes(2)
    await act(async () => { finishSecond() })
    await act(async () => { onAppState?.('active') })
    expect(reconcile).toHaveBeenCalledTimes(3)
    expect(onUnavailable).not.toHaveBeenCalled()
    view.unmount()
  })

  it('polls only the pending session and reads the latest callback on foreground', async () => {
    const first = jest.fn(async () => undefined)
    const latest = jest.fn(async () => undefined)
    const view = renderHook<void, { reconcile: () => Promise<void> }>(({ reconcile }) => useConfirmationReconciliation({
      ...input, pendingSessionId: 'another-session', reconcile, onUnavailable: jest.fn(),
    }), { initialProps: { reconcile: first } })
    await act(async () => { await jest.advanceTimersByTimeAsync(9_000) })
    expect(first).toHaveBeenCalledTimes(1)
    expect(setInterval).not.toHaveBeenCalled()
    view.rerender({ reconcile: latest })
    await act(async () => { onAppState?.('active') })
    expect(latest).toHaveBeenCalledTimes(1)
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})

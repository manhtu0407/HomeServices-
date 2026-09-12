import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { getOrCreatePendingConfirmation, readPendingConfirmation } from '../frontend-workflow/confirmation-recovery'
import { useCustomerJobActions } from '../frontend-workflow/use-customer-job-actions'

const mockConfirm = jest.fn()
const mockGetConfirmationOperation = jest.fn()
const mockGetKaelSession = jest.fn()
const mockGetJob = jest.fn()
const mockListMyActiveJob = jest.fn()
const mockCreateJob = jest.fn()

jest.mock('../services', () => ({
  jobService: {
    createJob: (...args: unknown[]) => mockCreateJob(...args),
    getJob: (...args: unknown[]) => mockGetJob(...args),
    listMyActiveJob: (...args: unknown[]) => mockListMyActiveJob(...args),
  },
  kaelChatService: {
    confirm: (...args: unknown[]) => mockConfirm(...args),
    get: (...args: unknown[]) => mockGetKaelSession(...args),
    getConfirmationOperation: (...args: unknown[]) => mockGetConfirmationOperation(...args),
  },
}))

jest.mock('../media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(),
}))

describe('Customer confirmation recovery lifecycle', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    mockListMyActiveJob.mockResolvedValue({ data: { active_job: null }, status: 200, success: true })
    mockCreateJob.mockResolvedValue({ success: false, status: 409, code: 'KAEL_CASE_WORK_REQUIRED', error: '' })
    mockGetConfirmationOperation.mockResolvedValue({
      code: 'NOT_FOUND', error: 'missing', status: 404, success: false,
    })
    mockGetKaelSession.mockResolvedValue({
      data: { session: { id: 'session-recovered', confirmation_operation: null } }, status: 200, success: true,
    })
    mockConfirm.mockResolvedValue({
      data: { broadcast_sent: false, job_id: 'job-recovered', session_id: 'session-recovered' },
      status: 202,
      success: true,
    })
    mockGetJob.mockResolvedValue({ code: 'NOT_READY', error: 'queued', status: 409, success: false })
  })

  it('reconciles a persisted pending confirmation automatically on Customer cold start', async () => {
    const pending = await getOrCreatePendingConfirmation('customer-recovered', 'session-recovered', {
      confirmation_kind: 'inspection_request',
      matching_mode: 'prompt_if_saved',
    })
    const dispatch = jest.fn()
    const setRemoteError = jest.fn((): false => false)
    const stateRef = { current: { deal: null } } as never
    const view = renderHook(() => useCustomerJobActions({
      dispatch,
      language: 'vi',
      pendingJobCreateClientRequestRef: { current: null },
      role: 'customer',
      sessionAccessToken: 'customer-access-token',
      sessionUserId: 'customer-recovered',
      setRemoteError,
      stateRef,
    }))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(
      'session-recovered',
      pending.confirmInput,
      'customer-access-token',
      pending.idempotencyKey,
    ))
    await waitFor(() => expect(mockGetJob).toHaveBeenCalledWith(
      'job-recovered',
      'customer-access-token',
    ))
    await waitFor(async () => {
      expect(await readPendingConfirmation('customer-recovered', 'session-recovered')).toBeNull()
    })
    view.unmount()
  })

  it('does not continue an old account confirmation after switching accounts during recovery', async () => {
    await getOrCreatePendingConfirmation('customer-recovered', 'session-recovered', { confirmation_kind: 'inspection_request' })
    let finish!: (result: unknown) => void
    mockGetConfirmationOperation.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const dispatch = jest.fn()
    const setRemoteError = jest.fn((): false => false)
    const stateRef = { current: { deal: null } } as never
    const view = renderHook<ReturnType<typeof useCustomerJobActions>, { owner: string }>(({ owner }) => useCustomerJobActions({
      dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionAccessToken: `token-${owner}`, sessionUserId: owner, setRemoteError, stateRef,
    }), { initialProps: { owner: 'customer-recovered' } })
    await waitFor(() => expect(mockGetConfirmationOperation).toHaveBeenCalledTimes(1))
    view.rerender({ owner: 'customer-other' })
    await act(async () => { finish({ success: false, status: 404, code: 'NOT_FOUND', error: '' }) })
    expect(mockGetKaelSession).not.toHaveBeenCalled()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockGetJob).not.toHaveBeenCalled()
    expect(await readPendingConfirmation('customer-recovered', 'session-recovered')).not.toBeNull()
    view.unmount()
  })

  it('rejects an old account hydration callback invoked after the new account has mounted', async () => {
    const dispatch = jest.fn()
    const setRemoteError = jest.fn((): false => false)
    const stateRef = { current: { deal: null } } as never
    const view = renderHook<ReturnType<typeof useCustomerJobActions>, { owner: string }>(({ owner }) => useCustomerJobActions({
      dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionAccessToken: `token-${owner}`, sessionUserId: owner, setRemoteError, stateRef,
    }), { initialProps: { owner: 'customer-recovered' } })
    const staleHydrate = view.result.current.hydrateRemoteJobById
    view.rerender({ owner: 'customer-other' })
    await act(async () => { await staleHydrate('job-recovered', 'token-customer-recovered') })
    expect(mockGetJob).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    view.unmount()
  })

  it('keeps callbacks retired after switching away and returning to the same account', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    const dispatch = jest.fn()
    const view = renderHook<ReturnType<typeof useCustomerJobActions>, { owner: string }>(({ owner }) => useCustomerJobActions({
      dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionAccessToken: `token-${owner}`, sessionUserId: owner, setRemoteError: () => false,
      stateRef: { current: { deal: { id: 'job-private' } } } as never,
    }), { initialProps: { owner: 'customer-first' } })
    const stale = view.result.current
    view.rerender({ owner: 'customer-other' })
    view.rerender({ owner: 'customer-first' })
    await act(async () => {
      expect(await stale.hydrateRemoteJobById('job-private')).toBe(false)
      expect(await stale.refreshCurrentJob()).toBe(false)
      expect(await stale.hydrateCustomerActiveJob()).toBe(false)
    })
    expect(mockGetJob).not.toHaveBeenCalled()
    expect(mockListMyActiveJob).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    view.unmount()
    expect(await view.result.current.refreshCurrentJob()).toBe(false)
    expect(mockGetJob).not.toHaveBeenCalled()
  })

  it('shares the actual failed refresh result instead of accepting the overlapping caller early', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    let finish!: (value: unknown) => void
    mockGetJob.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const view = renderHook(() => useCustomerJobActions({
      dispatch: jest.fn(), language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'worker',
      sessionAccessToken: 'worker-token', sessionUserId: 'worker-first', setRemoteError: () => false,
      stateRef: { current: { deal: { id: 'job-private' } } } as never,
    }))
    const first = view.result.current.refreshCurrentJob()
    const second = view.result.current.refreshCurrentJob()
    expect(second).toBe(first)
    expect(mockGetJob).toHaveBeenCalledTimes(1)
    expect(mockGetJob).toHaveBeenCalledWith('job-private', 'worker-token')
    finish({ success: false, status: 503, code: 'NETWORK_ERROR', error: '' })
    expect(await first).toBe(false)
    expect(await second).toBe(false)
    view.unmount()
  })

  it('does not let an old refresh clear or report errors into the new job flight', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    let finishOld!: (value: unknown) => void
    let finishNew!: (value: unknown) => void
    mockGetJob.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve }))
    const stateRef = { current: { deal: { id: 'job-first' } } }
    const dispatch = jest.fn()
    const setRemoteError = jest.fn((): false => false)
    const view = renderHook(() => useCustomerJobActions({
      dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionAccessToken: 'customer-token', sessionUserId: 'customer-first', setRemoteError, stateRef: stateRef as never,
    }))
    const old = view.result.current.refreshCurrentJob()
    stateRef.current.deal.id = 'job-next'
    const next = view.result.current.refreshCurrentJob()
    expect(mockGetJob).toHaveBeenCalledTimes(2)
    finishOld({ success: false, status: 403, code: 'FORBIDDEN', error: '' })
    expect(await old).toBe(false)
    expect(setRemoteError).not.toHaveBeenCalled()
    expect(view.result.current.refreshCurrentJob()).toBe(next)
    expect(mockGetJob).toHaveBeenCalledTimes(2)
    finishNew({ success: false, status: 409, code: 'NOT_READY', error: '' })
    expect(await next).toBe(false)
    expect(setRemoteError).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()
    view.unmount()
  })

  it('does not use shared credentials when the actor has no captured access token', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    const view = renderHook(() => useCustomerJobActions({
      dispatch: jest.fn(), language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionUserId: 'customer-first', setRemoteError: () => false,
      stateRef: { current: { deal: null } } as never,
    }))
    expect(await view.result.current.hydrateRemoteJobById('job-private')).toBe(false)
    expect(await view.result.current.refreshCurrentJob()).toBe(false)
    expect(await view.result.current.hydrateCustomerActiveJob()).toBe(false)
    expect(mockGetJob).not.toHaveBeenCalled()
    expect(mockListMyActiveJob).not.toHaveBeenCalled()
    view.unmount()
  })

  it('uses the captured token for bootstrap and exposes only safe transport diagnostics', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    const setRemoteError = jest.fn((): false => false)
    const view = renderHook(() => useCustomerJobActions({
      dispatch: jest.fn(), language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionAccessToken: 'customer-token', sessionUserId: 'customer-first', setRemoteError,
      stateRef: { current: { deal: null } } as never,
    }))
    expect(await view.result.current.hydrateCustomerActiveJob()).toBe(true)
    expect(mockListMyActiveJob).toHaveBeenCalledWith('customer-token')
    mockGetJob.mockRejectedValueOnce(new Error('private transport detail'))
    expect(await view.result.current.hydrateRemoteJobById('job-private')).toBe(false)
    expect(setRemoteError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'NETWORK_ERROR', error: '', meta: expect.objectContaining({ clientDiagnosticCode: expect.stringMatching(/^NSL-/) }),
    }))
    expect(JSON.stringify(setRemoteError.mock.calls)).not.toContain('private transport detail')
    view.unmount()
  })

  it('rejects legacy draft creation before a network mutation and points back to Customer confirmation', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    const dispatch = jest.fn()
    const setRemoteError = jest.fn((): false => false)
    const view = renderHook(() => useCustomerJobActions({
      dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionAccessToken: 'customer-token', sessionUserId: 'customer-first', setRemoteError,
      stateRef: { current: { deal: null } } as never,
    }))
    await view.result.current.createRemoteJobFromDraft({
      serviceType: 'plumbing', problemChips: ['leak'], description: 'Vòi nước bị rò rỉ cần kiểm tra',
      addressLabel: 'Tòa A, Quận 7', districtLabel: 'Quận 7',
    } as never)
    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(setRemoteError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'KAEL_CASE_WORK_REQUIRED', meta: expect.objectContaining({ clientDiagnosticCode: expect.stringMatching(/^NSL-/) }),
    }))
    view.unmount()
  })

  it('reports unavailable recovery without clearing consent when a receipt read throws', async () => {
    await getOrCreatePendingConfirmation('customer-recovered', 'session-recovered', { confirmation_kind: 'inspection_request' })
    mockGetConfirmationOperation.mockRejectedValue(new Error('private transport detail'))
    const setRemoteError = jest.fn((): false => false)
    const view = renderHook(() => useCustomerJobActions({
      dispatch: jest.fn(), language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role: 'customer',
      sessionAccessToken: 'customer-token', sessionUserId: 'customer-recovered', setRemoteError,
      stateRef: { current: { deal: null } } as never,
    }))
    let recovered: boolean | undefined
    await act(async () => { recovered = await view.result.current.reconcilePendingConfirmations() })
    expect(recovered).toBe(false)
    expect(setRemoteError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'CONFIRMATION_RECOVERY_UNAVAILABLE', error: '', meta: expect.objectContaining({ clientDiagnosticCode: expect.stringMatching(/^NSL-/), supportCode: null }),
    }))
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(await readPendingConfirmation('customer-recovered', 'session-recovered')).not.toBeNull()
    view.unmount()
  })
})

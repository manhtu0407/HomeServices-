import { act, renderHook } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createInitialLocalWorkflowState, localWorkflowReducer, type JobStatus, type UserRole } from '@nestscout/shared'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { useCustomerJobActions } from '../frontend-workflow/use-customer-job-actions'
import type { JobDetailResponse } from '../api-types'

export const PILLAR = {
  id: 'P115-customer-job-command-isolation',
  invariant: 'Cancellation and saved-worker reads stay bound to the initiating Customer and selected job, and an unknown cancellation outcome never fabricates a cancelled job',
  authority: ['governance/RULES.md #7 (Customer authority)', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/lib/frontend-workflow/use-customer-job-actions.ts',
  layer: 'security-negative',
  siblings: ['P105-customer-matching-retry-mobile', 'P114-customer-matching-consent-ui'],
  mutation: 'allow a retired Customer callback to POST cancellation after account switch; the no-mutation assertion fails',
} as const satisfies PillarManifest

const JOB = '22222222-2222-4222-8222-222222222222'
const OTHER_JOB = '33333333-3333-4333-8333-333333333333'
const mockCancel = jest.fn()
const mockRequestCancellation = jest.fn()
const mockGetJob = jest.fn()
const mockFavorites = jest.fn()
jest.mock('../services', () => ({ jobService: {
  cancelJob: (...args: unknown[]) => mockCancel(...args),
  requestCustomerCancellation: (...args: unknown[]) => mockRequestCancellation(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  listFavoriteWorkersForMatching: (...args: unknown[]) => mockFavorites(...args),
} }))

function jobState(id = JOB, status: JobStatus = 'broadcasting') {
  return localWorkflowReducer(createInitialLocalWorkflowState(), { type: 'hydrate_remote_job', job: {
    id, status, backendStatus: status, serviceType: 'plumbing', description: 'Kiểm tra vòi nước',
    problemChips: ['Rò nước'], addressLabel: 'Quận 7', districtLabel: 'Quận 7',
  }, workerGate: 'remote_backend' })
}

function deferred<T>() {
  let resolve!: (result: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function detail(status: JobStatus): JobDetailResponse {
  return {
    job: {
      id: JOB, status, service_type: 'plumbing', description: 'Kiểm tra vòi nước', problem_chips: ['Rò nước'],
      photo_urls: [], customer_evidence_photo_urls: [], field_evidence_photo_urls: [],
      address_building: null, address_unit: null, address_floor: null, address_district: 'district_7',
      address_access: { release_stage: 'area_only', exact_unit_released: false, worker_checked_in: false,
        check_in_required: false, identity_check_required: false, customer_handoff_required: false, evidence_mode: 'none', access_profile: {} },
      scheduled_at: null, kael_problem_identified: null, kael_complexity: null, kael_price_min: null, kael_price_max: null,
      kael_advisory: null, kael_estimate_card_v3: null, kael_worker_brief_core: null, kael_worker_brief_guidance: null,
      kael_progress: null, final_price: null, completion_notes: null, completion_photo_urls: [],
      created_at: '2026-09-06T01:00:00.000Z', matched_at: null, arrived_at: null, completed_at: null,
      confirmed_at: null, paid_at: null, reviewed_at: null,
    },
    worker: null, broadcast_state: null, matching_state: null, current_scope_change: null,
  }
}

function setup(role: UserRole = 'customer', token: string | undefined = 'customer-token', status: JobStatus = 'broadcasting') {
  const dispatch = jest.fn()
  const setRemoteError = jest.fn((): false => false)
  const stateRef = { current: jobState(JOB, status) }
  const view = renderHook<ReturnType<typeof useCustomerJobActions>, { owner: string }>(({ owner }) => useCustomerJobActions({
    dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role,
    sessionAccessToken: token, sessionUserId: owner, setRemoteError, stateRef,
  }), { initialProps: { owner: 'customer-first' } })
  return { ...view, dispatch, setRemoteError, stateRef }
}

describe('Customer job command isolation', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    for (const mock of [mockCancel, mockRequestCancellation, mockGetJob, mockFavorites]) mock.mockReset()
    await AsyncStorage.clear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    mockCancel.mockResolvedValue({ success: true, status: 200, data: { job_id: JOB, status: 'cancelled' } })
    mockGetJob.mockResolvedValue({ success: false, status: 503, code: 'NETWORK_ERROR', error: '' })
    mockFavorites.mockResolvedValue({ success: true, status: 200, data: { workers: [] } })
  })

  it('never sends a cancellation or favorite read from a retired actor callback', async () => {
    const view = setup()
    const stale = view.result.current
    view.rerender({ owner: 'customer-other' })
    await act(async () => {
      await stale.cancelRemoteJob()
      await stale.listFavoriteWorkersForMatching()
    })
    withPillarContext(PILLAR, () => {
      expect(mockCancel).not.toHaveBeenCalled()
      expect(mockFavorites).not.toHaveBeenCalled()
      expect(view.dispatch).not.toHaveBeenCalled()
    }, 'a callback captured before account switch must not use the new shared credentials')
    view.unmount()
  })

  it('joins duplicate cancellation presses and uses the captured Customer token', async () => {
    const view = setup()
    const pending = deferred<unknown>()
    mockCancel.mockReturnValue(pending.promise)
    const first = view.result.current.cancelRemoteJob()
    const second = view.result.current.cancelRemoteJob()
    await act(async () => {
      pending.resolve({ success: true, status: 200, data: { job_id: JOB, status: 'cancelled' } })
      expect(await first).toBe(true)
      expect(await second).toBe(true)
    })
    expect(mockCancel).toHaveBeenCalledTimes(1)
    expect(mockCancel).toHaveBeenCalledWith(JOB, 'customer-token')
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({ job: expect.objectContaining({ id: JOB, status: 'cancelled' }) }))
    view.unmount()
  })

  it('does not hydrate a cancellation receipt into a newly selected job', async () => {
    const view = setup()
    const pending = deferred<unknown>()
    mockCancel.mockReturnValue(pending.promise)
    const cancellation = view.result.current.cancelRemoteJob()
    view.stateRef.current = jobState(OTHER_JOB)
    await act(async () => {
      pending.resolve({ success: true, status: 200, data: { job_id: JOB, status: 'cancelled' } })
      expect(await cancellation).toBe(false)
    })
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(view.setRemoteError).not.toHaveBeenCalled()
    view.unmount()
  })

  it.each(['worker', 'admin'] as const)('never sends Customer cancellation under the %s role', async (role) => {
    const view = setup(role)
    await view.result.current.cancelRemoteJob()
    expect(mockCancel).not.toHaveBeenCalled()
    expect(mockRequestCancellation).not.toHaveBeenCalled()
    view.unmount()
  })

  it('discards saved workers read for the previous job', async () => {
    const view = setup()
    const pending = deferred<unknown>()
    mockFavorites.mockReturnValue(pending.promise)
    const list = view.result.current.listFavoriteWorkersForMatching()
    view.stateRef.current = jobState(OTHER_JOB)
    pending.resolve({ success: true, status: 200, data: { workers: [] } })
    expect(await list).toBeNull()
    expect(mockFavorites).toHaveBeenCalledWith(JOB, 'customer-token')
    view.unmount()
  })

  it('does not fabricate cancellation when a success response identifies another job', async () => {
    const view = setup()
    mockCancel.mockResolvedValue({ success: true, status: 200, data: { job_id: OTHER_JOB, status: 'cancelled' } })
    expect(await view.result.current.cancelRemoteJob()).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'CANCELLATION_OUTCOME_UNKNOWN' }))
    view.unmount()
  })

  it('keeps the job and reconciles a network-ambiguous cancellation instead of claiming failure', async () => {
    const view = setup()
    mockCancel.mockResolvedValue({ success: false, status: 0, code: 'TIMEOUT', error: '' })
    expect(await view.result.current.cancelRemoteJob()).toBe(false)
    expect(mockGetJob).toHaveBeenCalledWith(JOB, 'customer-token')
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({
      code: 'CANCELLATION_OUTCOME_UNKNOWN', meta: expect.objectContaining({ clientDiagnosticCode: expect.stringMatching(/^NSL-/) }),
    }))
    view.unmount()
  })

  it('recovers a committed cancellation after timeout from the same authenticated job read', async () => {
    const view = setup()
    mockCancel.mockResolvedValue({ success: false, status: 0, code: 'TIMEOUT', error: '' })
    mockGetJob.mockResolvedValue({ success: true, status: 200, data: detail('cancelled') })
    expect(await view.result.current.cancelRemoteJob()).toBe(true)
    expect(mockCancel).toHaveBeenCalledTimes(1)
    expect(mockGetJob).toHaveBeenCalledWith(JOB, 'customer-token')
    expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({ job: expect.objectContaining({ id: JOB, status: 'cancelled' }) }))
    view.unmount()
  })

  it('does not let a pre-cancellation refresh restore broadcasting after the receipt', async () => {
    const view = setup()
    const pending = deferred<unknown>()
    mockGetJob.mockReturnValue(pending.promise)
    const refresh = view.result.current.refreshCurrentJob()
    expect(await view.result.current.cancelRemoteJob()).toBe(true)
    pending.resolve({ success: true, status: 200, data: detail('broadcasting') })
    expect(await refresh).toBe(false)
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ job: expect.objectContaining({ status: 'cancelled' }) }))
    view.unmount()
  })

  it('keeps an accepted paid-cancellation review paid rather than claiming cancellation or refund', async () => {
    const view = setup('customer', 'customer-token', 'paid')
    mockRequestCancellation.mockResolvedValue({ success: true, status: 200, data: {
      job_id: JOB, cancellation_id: 'review-case', status: 'requested', job_status: 'paid',
      admin_review_required: true, refund_state: 'review_required',
    } })
    mockGetJob.mockResolvedValue({ success: true, status: 200, data: detail('paid') })
    expect(await view.result.current.cancelRemoteJob()).toBe(true)
    expect(mockCancel).not.toHaveBeenCalled()
    expect(mockRequestCancellation).toHaveBeenCalledWith(JOB, expect.objectContaining({ reason_code: 'changed_mind' }), 'customer-token')
    expect(view.dispatch.mock.calls.every(([action]) => action.job.status === 'paid')).toBe(true)
    expect(JSON.stringify(view.dispatch.mock.calls)).not.toContain('refunded')
    view.unmount()
  })

  it('does not call cancellation or favorites with a missing captured token', async () => {
    const view = setup('customer', '')
    expect(await view.result.current.cancelRemoteJob()).toBe(false)
    expect(await view.result.current.listFavoriteWorkersForMatching()).toBeNull()
    expect(mockCancel).not.toHaveBeenCalled()
    expect(mockFavorites).not.toHaveBeenCalled()
    view.unmount()
  })

  it('does not expose thrown cancellation or reconcile transport details', async () => {
    const view = setup()
    mockCancel.mockRejectedValue(new Error('private provider payload'))
    mockGetJob.mockRejectedValue(new Error('private read payload'))
    expect(await view.result.current.cancelRemoteJob()).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'CANCELLATION_OUTCOME_UNKNOWN', error: '' }))
    expect(JSON.stringify(view.setRemoteError.mock.calls)).not.toContain('private')
    view.unmount()
  })
})

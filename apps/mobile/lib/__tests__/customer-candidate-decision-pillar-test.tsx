import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import type { LocalWorkflowState, UserRole } from '@nestscout/shared'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { useWorkerCandidateActions } from '../frontend-workflow/use-worker-candidate-actions'
import { WorkerCandidateReviewResponse } from '@/components/customer/kael-chat/worker-candidate-review-response'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import type { WorkerCandidateView } from '../api-types'
import type { JobDetailResponse } from '../api-types'
import { listCandidateDecisions, prepareCandidateDecision, storeCandidateDecision } from '../frontend-workflow/candidate-decision-recovery'

export const PILLAR = {
  id: 'P136-customer-candidate-decision-mobile',
  invariant: 'Customer choice is persisted before mutation and recovered by exact candidate without changing actor or decision',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'apps/mobile/lib/frontend-workflow/use-worker-candidate-actions.ts',
  layer: 'integration',
  siblings: ['P134-candidate-decision-receipt', 'P133-candidate-decision-receipt-sql'],
  mutation: 'Make the process current-session predicate always true; a retired account sends a candidate decision',
} as const satisfies PillarManifest

const OWNER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const WORKER = '33333333-3333-4333-8333-333333333333'
const CANDIDATE = '44444444-4444-4444-8444-444444444444'
const stamp = '2026-09-08T00:00:00.000Z'
const candidate: WorkerCandidateView = { candidate_id: CANDIDATE, worker_id: WORKER, status: 'proposed', display_name: 'Thợ kiểm thử',
  avatar_url: null, rating: null, total_jobs: 0, years_experience: 5, verification_status: 'approved', is_favorite: false,
  proposed_at: stamp, expires_at: null, customer_decided_at: null, original_scope_price_quote: null,
  worker_proposal: { proposal_id: CANDIDATE, status: 'proposed', scope_summary: 'Khảo sát rồi báo giá', price_min: null, price_max: null } }
const pendingStatus = { job_id: JOB, candidate_id: CANDIDATE, worker_id: WORKER, candidate_status: 'proposed', receipt: null }
const decidedStatus = (decision: 'confirm' | 'reject') => ({ ...pendingStatus,
  candidate_status: decision === 'confirm' ? 'customer_confirmed' : 'customer_declined',
  receipt: { job_id: JOB, candidate_id: CANDIDATE, worker_id: WORKER, decision, decided_at: stamp } })
const success = (data: unknown) => ({ success: true, status: 200, data })
const unknown = { success: false, status: 0, code: 'TIMEOUT', error: '' }
const mockCandidate = jest.fn()
const mockReceipt = jest.fn()
const mockConfirm = jest.fn()
const mockReject = jest.fn()
const mockJob = jest.fn()
const mockFavorite = jest.fn()
jest.mock('../services', () => ({ jobService: {
  getWorkerCandidate: (...args: unknown[]) => mockCandidate(...args),
  getWorkerCandidateDecision: (...args: unknown[]) => mockReceipt(...args),
  confirmWorkerCandidate: (...args: unknown[]) => mockConfirm(...args),
  rejectWorkerCandidate: (...args: unknown[]) => mockReject(...args),
  getJob: (...args: unknown[]) => mockJob(...args),
  setFavoriteWorker: (...args: unknown[]) => mockFavorite(...args),
} }))

function jobDetail(): JobDetailResponse {
  return { job: {
    id: JOB, status: 'arrived', service_type: 'plumbing', description: 'Kiểm tra vòi nước', problem_chips: [],
    photo_urls: [], customer_evidence_photo_urls: [], field_evidence_photo_urls: [], address_building: null, address_unit: null,
    address_floor: null, address_district: 'district_7', address_access: { release_stage: 'building_released',
      exact_unit_released: false, worker_checked_in: false, check_in_required: true, identity_check_required: true,
      customer_handoff_required: true, evidence_mode: 'geofence', access_profile: {} }, scheduled_at: null,
    kael_problem_identified: null, kael_complexity: null, kael_price_min: null, kael_price_max: null, kael_advisory: null,
    kael_estimate_card_v3: null, kael_worker_brief_core: null, kael_worker_brief_guidance: null, kael_progress: null,
    final_price: null, completion_notes: null, completion_photo_urls: [], created_at: stamp,
    matched_at: null, arrived_at: null, completed_at: null, confirmed_at: null, paid_at: null, reviewed_at: null,
  }, worker: null, broadcast_state: null, matching_state: null, current_scope_change: null }
}
const intent = { candidate_id: CANDIDATE, worker_id: WORKER, decision: 'confirm' as const }

function setup(role: UserRole = 'customer') {
  const dispatch = jest.fn()
  const stateRef = { current: { deal: { id: JOB, status: 'worker_candidate_pending', backendStatus: 'worker_candidate_pending' } } } as unknown as { current: LocalWorkflowState }
  const view = renderHook<ReturnType<typeof useWorkerCandidateActions>, { owner: string; jobId?: string }>(({ owner, jobId = JOB }) => useWorkerCandidateActions({
    dispatch, customerStatus: 'worker_candidate_pending', remoteJobId: jobId, language: 'vi', role,
    sessionUserId: owner, sessionAccessToken: `token-${owner}`, stateRef,
  }), { initialProps: { owner: OWNER } })
  return { ...view, dispatch, stateRef }
}
async function ready(view: ReturnType<typeof setup>) {
  await waitFor(() => expect(view.result.current.customerWorkerCandidate?.candidate_id).toBe(CANDIDATE))
  await waitFor(() => expect(view.result.current.customerWorkerCandidateBusy).toBe(false))
}
async function records() {
  return JSON.parse((await AsyncStorage.getItem(`nestscout.customer.candidate-decision.v1.${OWNER}`)) ?? '[]')
}

describe('Customer candidate decision recovery', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() })
    mockCandidate.mockReset().mockResolvedValue(success({ job_id: JOB, status: 'worker_candidate_pending', candidate }))
    mockReceipt.mockReset().mockResolvedValue(success(pendingStatus))
    mockConfirm.mockReset().mockResolvedValue(unknown)
    mockReject.mockReset().mockResolvedValue(unknown)
    mockJob.mockReset().mockResolvedValue(unknown)
    mockFavorite.mockReset().mockResolvedValue(unknown)
  })
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

  it('persists exact consent before POST, joins duplicate presses and refuses an opposite decision', async () => {
    const view = setup()
    await ready(view)
    mockConfirm.mockImplementation(async () => {
      expect(await records()).toEqual([expect.objectContaining({ ownerId: OWNER, jobId: JOB,
        intent: { candidate_id: CANDIDATE, worker_id: WORKER, decision: 'confirm' }, resolution: 'pending' })])
      return unknown
    })
    await act(async () => { await Promise.all([
      view.result.current.decideWorkerCandidate('confirm'),
      view.result.current.decideWorkerCandidate('confirm'),
      view.result.current.decideWorkerCandidate('reject'),
    ]) })
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(mockConfirm).toHaveBeenCalledWith(JOB, CANDIDATE, `token-${OWNER}`)
    expect(mockReject).not.toHaveBeenCalled()
    expect(view.result.current.customerWorkerCandidateBusy).toBe(true)
    expect(view.result.current.customerWorkerCandidateError).toContain('Đang đối soát')
    view.unmount()
  })

  it('rehydrates an unknown committed decision on relaunch without resending it', async () => {
    const first = setup()
    await ready(first)
    await act(async () => { await first.result.current.decideWorkerCandidate('confirm') })
    first.unmount()
    mockReceipt.mockResolvedValue(success(decidedStatus('confirm')))
    const resumed = setup()
    await waitFor(async () => expect(await records()).toEqual([expect.objectContaining({ resolution: 'recorded' })]))
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(mockJob).toHaveBeenCalledWith(JOB, `token-${OWNER}`)
    await waitFor(() => expect(resumed.result.current.customerWorkerCandidateError).toContain('Chưa đồng bộ'))
    expect(resumed.dispatch).not.toHaveBeenCalled()
    resumed.unmount()
  })

  it('fences a retired account after a receipt GET and before POST', async () => {
    const view = setup()
    await ready(view)
    let finish!: (value: unknown) => void
    mockReceipt.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    let decision!: Promise<boolean>
    act(() => { decision = view.result.current.decideWorkerCandidate('confirm') })
    await waitFor(() => expect(mockReceipt).toHaveBeenCalledTimes(1))
    view.rerender({ owner: WORKER })
    await act(async () => { finish(success(pendingStatus)); await decision })
    withPillarContext(PILLAR, () => expect(mockConfirm).not.toHaveBeenCalled())
    expect(view.dispatch).not.toHaveBeenCalled()
    view.unmount()
  })

  it.each(['worker', 'admin'] as const)('does not load or decide as %s', async (role) => {
    const view = setup(role)
    await act(async () => { expect(await view.result.current.decideWorkerCandidate('confirm')).toBe(false) })
    expect(mockCandidate).not.toHaveBeenCalled()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(await records()).toEqual([])
    view.unmount()
  })

  it('does not replay a choice when the exact candidate expired without Customer rejection', async () => {
    const first = setup()
    await ready(first)
    await act(async () => { await first.result.current.decideWorkerCandidate('reject') })
    first.unmount()
    mockReceipt.mockResolvedValue(success({ ...pendingStatus, candidate_status: 'expired' }))
    const resumed = setup()
    await waitFor(async () => expect(await records()).toEqual([expect.objectContaining({ resolution: 'superseded', receipt: null })]))
    expect(mockReject).toHaveBeenCalledTimes(1)
    expect(mockConfirm).not.toHaveBeenCalled()
    resumed.unmount()
  })

  it('does not POST when receipt identity belongs to another worker', async () => {
    const view = setup()
    await ready(view)
    mockReceipt.mockResolvedValue(success({ ...pendingStatus, worker_id: OWNER }))
    await act(async () => { await view.result.current.decideWorkerCandidate('confirm') })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect((await records())[0].resolution).toBe('pending')
    view.unmount()
  })

  it('does not send when local consent cannot be saved', async () => {
    const view = setup()
    await ready(view)
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk unavailable'))
    await act(async () => { await view.result.current.decideWorkerCandidate('confirm') })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockReceipt).not.toHaveBeenCalled()
    view.unmount()
  })

  it('bounds automatic recovery and exposes a manual status check after the budget is exhausted', async () => {
    jest.useFakeTimers()
    await prepareCandidateDecision(OWNER, JOB, intent, () => true)
    mockReceipt.mockResolvedValue(unknown)
    const view = setup()
    await act(async () => {})
    for (let step = 0; step < 25; step += 1) {
      await act(async () => { jest.advanceTimersByTime(5_000) })
    }
    expect(mockReceipt).toHaveBeenCalledTimes(20)
    expect(view.result.current.customerWorkerCandidateError).toContain('hỗ trợ')
    expect(view.result.current.customerWorkerCandidateBusy).toBe(true)
    expect(mockConfirm).not.toHaveBeenCalled()
    await act(async () => { await view.result.current.refreshWorkerCandidate() })
    expect(mockReceipt).toHaveBeenCalledTimes(21)
    view.unmount()
  })

  it('blocks a decision immediately while a favorite mutation is in flight', async () => {
    const view = setup()
    await ready(view)
    let finish!: (value: unknown) => void
    mockFavorite.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    let favorite!: Promise<boolean>
    await act(async () => {
      favorite = view.result.current.setWorkerCandidateFavorite(true)
      expect(await view.result.current.decideWorkerCandidate('confirm')).toBe(false)
    })
    await act(async () => { finish(success({ worker_id: WORKER, is_favorite: true })); await favorite })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockFavorite).toHaveBeenCalledWith(WORKER, true, `token-${OWNER}`)
    view.unmount()
  })

  it('restarts reconciliation when opening a job after the polling budget ended', async () => {
    jest.useFakeTimers()
    const otherJob = '55555555-5555-4555-8555-555555555555'
    await prepareCandidateDecision(OWNER, otherJob, intent, () => true)
    mockReceipt.mockResolvedValue(unknown)
    const view = setup()
    await act(async () => {})
    for (let step = 0; step < 25; step += 1) {
      await act(async () => { jest.advanceTimersByTime(5_000) })
    }
    expect(mockReceipt).toHaveBeenCalledTimes(20)
    view.stateRef.current = { ...view.stateRef.current, deal: { ...view.stateRef.current.deal!, id: otherJob } }
    view.rerender({ owner: OWNER, jobId: otherJob })
    await act(async () => {})
    expect(mockReceipt).toHaveBeenCalledTimes(21)
    expect(mockReceipt).toHaveBeenLastCalledWith(otherJob, CANDIDATE, `token-${OWNER}`)
    view.unmount()
  })

  it('uses the historical receipt only to recover the current server job, not to invent a match', async () => {
    const view = setup()
    await ready(view)
    mockReceipt.mockResolvedValue(success(decidedStatus('confirm')))
    mockJob.mockResolvedValue(success(jobDetail()))
    let accepted = false
    await act(async () => { accepted = await view.result.current.decideWorkerCandidate('confirm') })
    expect(accepted).toBe(true)
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'hydrate_remote_job',
      job: expect.objectContaining({ id: JOB, status: 'arrived', backendStatus: 'arrived' }) }))
    expect(view.result.current.customerWorkerCandidateBusy).toBe(false)
    expect(view.result.current.customerWorkerCandidateError).toBeNull()
    expect((await records())[0].receipt).toEqual(decidedStatus('confirm').receipt)
    view.unmount()
  })

  it.each([
    { success: false, status: 404, code: 'NOT_FOUND', error: '' },
    success({ ...pendingStatus, receipt: undefined }),
    success({ ...pendingStatus, candidate_id: OWNER }),
    success({ ...pendingStatus, job_id: OWNER }),
  ])('keeps unreadable, old-schema and foreign receipt outcomes unknown', async (response) => {
    const view = setup()
    await ready(view)
    mockReceipt.mockResolvedValue(response)
    await act(async () => { expect(await view.result.current.decideWorkerCandidate('confirm')).toBe(false) })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect((await records())[0].resolution).toBe('pending')
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(view.result.current.customerWorkerCandidateError).toContain('Đang đối soát')
    view.unmount()
  })

  it('does not treat the opposite recorded choice as acceptance of this intent', async () => {
    const view = setup()
    await ready(view)
    mockReceipt.mockResolvedValue(success(decidedStatus('reject')))
    mockJob.mockResolvedValue(success(jobDetail()))
    await act(async () => { expect(await view.result.current.decideWorkerCandidate('confirm')).toBe(false) })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect((await records())[0]).toMatchObject({ resolution: 'superseded', receipt: { decision: 'reject' } })
    expect(view.result.current.customerWorkerCandidateError).toContain('đã thay đổi')
    view.unmount()
  })

  it('stops before POST when the app backgrounds during the exact receipt read', async () => {
    const view = setup()
    await ready(view)
    mockReceipt.mockImplementationOnce(async () => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
      return success(pendingStatus)
    })
    await act(async () => { expect(await view.result.current.decideWorkerCandidate('confirm')).toBe(false) })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect((await records())[0].resolution).toBe('pending')
    view.unmount()
  })

  it('keeps an old callback retired after an A to B to A account switch', async () => {
    const view = setup()
    await ready(view)
    const oldPress = view.result.current.decideWorkerCandidate
    view.rerender({ owner: WORKER })
    view.rerender({ owner: OWNER })
    await ready(view)
    await act(async () => { expect(await oldPress('confirm')).toBe(false) })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(await records()).toEqual([])
    view.unmount()
  })

  it('rejects a retained callback for an older candidate after refresh', async () => {
    const view = setup()
    await ready(view)
    const oldPress = view.result.current.decideWorkerCandidate
    mockCandidate.mockResolvedValue(success({ job_id: JOB, candidate: { ...candidate, candidate_id: OWNER } }))
    await act(async () => { await view.result.current.refreshWorkerCandidate() })
    expect(view.result.current.customerWorkerCandidate?.candidate_id).toBe(OWNER)
    await act(async () => { expect(await oldPress('confirm')).toBe(false) })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(await records()).toEqual([])
    view.unmount()
  })

  it('does not change durable consent while recording a result', async () => {
    const original = await prepareCandidateDecision(OWNER, JOB, intent, () => true)
    expect(original).not.toBeNull()
    expect(await storeCandidateDecision({ ...original!, intent: { ...intent, decision: 'reject' } }, () => true)).toBe(false)
    expect((await records())[0].intent).toEqual(intent)
  })

  it('rejects corrupt or cross-owner journals before sending a new choice', async () => {
    await AsyncStorage.setItem(`nestscout.customer.candidate-decision.v1.${OWNER}`, '{invalid')
    const view = setup()
    await waitFor(() => expect(view.result.current.customerWorkerCandidateError).toContain('thiết bị'))
    await act(async () => { expect(await view.result.current.decideWorkerCandidate('confirm')).toBe(false) })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockReceipt).not.toHaveBeenCalled()
    view.unmount()
    await AsyncStorage.clear()
    const foreign = await prepareCandidateDecision(WORKER, JOB, intent, () => true)
    await AsyncStorage.setItem(`nestscout.customer.candidate-decision.v1.${OWNER}`, JSON.stringify([foreign]))
    await expect(listCandidateDecisions(OWNER)).rejects.toThrow('CANDIDATE_STORAGE_UNAVAILABLE')
  })

  it('retains all unresolved choices at capacity instead of evicting consent', async () => {
    for (let i = 0; i < 20; i += 1) {
      await prepareCandidateDecision(OWNER, `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`, intent, () => true)
    }
    const before = await records()
    await expect(prepareCandidateDecision(OWNER, JOB, intent, () => true)).rejects.toThrow('CANDIDATE_STORAGE_UNAVAILABLE')
    expect(await records()).toEqual(before)
  })

  it('does not overwrite a newer candidate with an older completion or an opposite queued choice', async () => {
    const original = await prepareCandidateDecision(OWNER, JOB, intent, () => true)
    await expect(prepareCandidateDecision(OWNER, JOB, { ...intent, decision: 'reject' }, () => true)).rejects.toThrow('CANDIDATE_DECISION_CONFLICT')
    expect(await storeCandidateDecision({ ...original!, resolution: 'superseded' }, () => true)).toBe(true)
    const next = await prepareCandidateDecision(OWNER, JOB, { ...intent, candidate_id: OWNER }, () => true)
    expect(await storeCandidateDecision({ ...original!, resolution: 'superseded' }, () => true)).toBe(false)
    expect(await records()).toEqual([next])
  })

  it('leaves the old account outcome pending when it retires after POST', async () => {
    const view = setup()
    await ready(view)
    let finish!: (value: unknown) => void
    mockConfirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    let decision!: Promise<boolean>
    act(() => { decision = view.result.current.decideWorkerCandidate('confirm') })
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    view.rerender({ owner: WORKER })
    await act(async () => { finish(success({ matched: true })); expect(await decision).toBe(false) })
    expect(mockReceipt).toHaveBeenCalledTimes(1)
    expect(view.dispatch).not.toHaveBeenCalled()
    expect((await records())[0].resolution).toBe('pending')
    view.unmount()
  })

  it('does not publish a favorite response into another account', async () => {
    const view = setup()
    await ready(view)
    let finish!: (value: unknown) => void
    mockFavorite.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    let favorite!: Promise<boolean>
    act(() => { favorite = view.result.current.setWorkerCandidateFavorite(true) })
    view.rerender({ owner: WORKER })
    await ready(view)
    await act(async () => { finish(success({ worker_id: WORKER, is_favorite: true })); expect(await favorite).toBe(false) })
    expect(view.result.current.customerWorkerCandidate?.is_favorite).toBe(false)
    expect(mockFavorite).toHaveBeenCalledWith(WORKER, true, `token-${OWNER}`)
    view.unmount()
  })

  it.each(['vi', 'en'] as const)('keeps recovery available but blocks a second choice in %s', (language) => {
    const onConfirm = jest.fn()
    const onReject = jest.fn()
    const onRetry = jest.fn()
    const view = render(<WorkerCandidateReviewResponse
      candidate={candidate} busy error={language === 'vi' ? 'Đang đối soát lựa chọn thợ.' : 'Reconciling your worker choice.'}
      language={language} onConfirm={onConfirm} onReject={onReject} onRetry={onRetry}
      onToggleFavorite={jest.fn()} onRetrySavedWorkers={jest.fn()} savedWorkers={[]} savedWorkersStatus="ready"
      tokens={getCustomerThemeTokens('light')}
    />)
    expect(view.getByTestId('customer-v21-worker-candidate-reject').props.accessibilityState.disabled).toBe(true)
    fireEvent.press(view.getByTestId('customer-v21-worker-candidate-reject'))
    fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))
    fireEvent.press(view.getByTestId('customer-v21-worker-candidate-reconcile'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(view.getByText(language === 'vi' ? 'Kiểm tra lại trạng thái' : 'Check status again')).toBeTruthy()
    view.unmount()
  })

  it.each(['light', 'dark'] as const)('does not pretend to load a missing profile while recovery needs attention in %s', (mode) => {
    const onRetry = jest.fn()
    const view = render(<WorkerCandidateReviewResponse
      candidate={null} busy error="Chưa xác định được kết quả lựa chọn thợ. Cần kiểm tra lại trạng thái."
      language="vi" onConfirm={jest.fn()} onReject={jest.fn()} onRetry={onRetry}
      onToggleFavorite={jest.fn()} onRetrySavedWorkers={jest.fn()} savedWorkers={[]} savedWorkersStatus="ready"
      tokens={getCustomerThemeTokens(mode)}
    />)
    expect(view.queryByTestId('customer-v21-worker-candidate-loading')).toBeNull()
    fireEvent.press(view.getByTestId('customer-v21-worker-candidate-reconcile'))
    expect(onRetry).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})

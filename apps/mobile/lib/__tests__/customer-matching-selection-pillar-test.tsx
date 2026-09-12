import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import type { JobMatchingPreferenceInput, MatchingSelectionReceipt, UserRole } from '@nestscout/shared'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { JobDetailResponse } from '../api-types'
import { useCustomerJobActions } from '../frontend-workflow/use-customer-job-actions'
import { FindingWorkersReceipt } from '@/components/customer/kael-chat/finding-workers-receipt'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'

export const PILLAR = {
  id: 'P111-customer-matching-selection-mobile',
  invariant: 'Customer matching choice persists before send and recovers the identical actor/job/consent-bound receipt without inventing delivery or crossing accounts',
  authority: ['governance/RULES.md #7 (Customer confirmation)', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/lib/frontend-workflow/use-customer-job-actions.ts',
  layer: 'integration',
  siblings: ['P109-matching-selection-http', 'P105-customer-matching-retry-mobile'],
  mutation: 'send the legacy POST before durable storage; the persist-before-send and initiating-token assertions fail',
} as const satisfies PillarManifest

const OWNER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const WORKER = '33333333-3333-4333-8333-333333333333'
const CHOICE = { mode: 'saved_worker_first' as const, worker_id: WORKER, auto_general: false }
const mockSelect = jest.fn()
const mockRead = jest.fn()
const mockJob = jest.fn()
jest.mock('../services', () => ({ jobService: {
  setMatchingPreference: (...args: unknown[]) => mockSelect(...args),
  getMatchingPreferenceReceipt: (...args: unknown[]) => mockRead(...args),
  getJob: (...args: unknown[]) => mockJob(...args),
  listMyActiveJob: jest.fn(async () => ({ success: true, data: { active_job: null } })),
} }))
jest.mock('../media-upload', () => ({ uploadJobMediaDrafts: jest.fn() }))

function receipt(request: JobMatchingPreferenceInput): MatchingSelectionReceipt {
  return {
    job_id: JOB, job_status: 'awaiting_customer_confirm', request_id: request.client_request_id,
    operation_id: '44444444-4444-4444-8444-444444444444',
    confirmation_operation_id: '55555555-5555-4555-8555-555555555555',
    state: 'queued', mode: request.mode, preferred_worker_id: request.worker_id ?? null,
    auto_general: request.auto_general, selected_at: '2026-09-05T01:00:00.000Z',
    support_code: 'SELECT12', broadcast_sent: false,
  }
}

function setup(role: UserRole = 'customer') {
  const dispatch = jest.fn()
  const setRemoteError = jest.fn((): false => false)
  const stateRef = { current: { deal: { id: JOB, status: 'awaiting_customer_confirm', backendStatus: 'awaiting_customer_confirm' } } } as never
  const view = renderHook<ReturnType<typeof useCustomerJobActions>, { owner: string }>(({ owner }) => useCustomerJobActions({
    dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null },
    role,
    sessionUserId: owner, sessionAccessToken: `token-${owner}`, setRemoteError, stateRef,
  }), { initialProps: { owner: OWNER } })
  return { ...view, dispatch, setRemoteError }
}

function jobDetail(): JobDetailResponse {
  return {
    job: {
      id: JOB, status: 'awaiting_customer_confirm', service_type: 'plumbing', description: 'Kiểm tra vòi nước',
      problem_chips: ['Kiểm tra vòi nước'], photo_urls: [], customer_evidence_photo_urls: [], field_evidence_photo_urls: [],
      address_building: null, address_unit: null, address_floor: null, address_district: 'district_7',
      address_access: { release_stage: 'area_only', exact_unit_released: false, worker_checked_in: false,
        check_in_required: false, identity_check_required: false, customer_handoff_required: false, evidence_mode: 'none', access_profile: {} },
      scheduled_at: null, kael_problem_identified: null, kael_complexity: null, kael_price_min: null, kael_price_max: null,
      kael_advisory: null, kael_estimate_card_v3: null, kael_worker_brief_core: null, kael_worker_brief_guidance: null,
      kael_progress: null, final_price: null, completion_notes: null, completion_photo_urls: [],
      created_at: '2026-09-05T01:00:00.000Z', matched_at: null, arrived_at: null, completed_at: null,
      confirmed_at: null, paid_at: null, reviewed_at: null,
    },
    worker: null, broadcast_state: null, matching_state: null, current_scope_change: null,
  }
}

async function stored() {
  const keys = await AsyncStorage.getAllKeys()
  return Promise.all(keys.map(async (key) => JSON.parse((await AsyncStorage.getItem(key))!)))
}

function ConsentHarness() {
  const actions = useCustomerJobActions({
    dispatch: jest.fn(), language: 'vi', pendingJobCreateClientRequestRef: { current: null },
    role: 'customer', sessionUserId: OWNER, sessionAccessToken: `token-${OWNER}`, setRemoteError: () => false,
    stateRef: { current: { deal: { id: JOB, status: 'awaiting_customer_confirm' } } } as never,
  })
  return <FindingWorkersReceipt language="vi" reduceMotion tokens={getCustomerThemeTokens('light')}
    matchingState={{ stage: 'awaiting_choice', strategy: 'pending_choice', batch: null, checks: [], event_history: [] }}
    selectionState={actions.customerMatchingSelectionState} onChoosePreference={actions.setMatchingPreference}
    onLoadSavedWorkers={async () => [{ id: WORKER, display_name: 'Thợ kiểm thử', avatar_url: null,
      rating: null, total_jobs: 0, availability: 'available', availability_reason: null }]}
    onRetry={() => undefined} onStop={() => false} />
}

describe('Customer durable matching selection mobile boundary', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }))
    mockRead.mockResolvedValue({ success: false, status: 404, code: 'NOT_FOUND', error: '' })
    mockJob.mockResolvedValue({ success: false, status: 503, code: 'UNAVAILABLE', error: '' })
    mockSelect.mockResolvedValue({ success: false, status: 0, code: 'TIMEOUT', error: '' })
  })
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

  it('carries explicit UI consent through storage and API, then locks it on relaunch after timeout', async () => {
    const first = render(<ConsentHarness />)
    const prefix = 'customer-v21-finding-workers-'
    await waitFor(() => expect(screen.getByTestId(`${prefix}saved-open`)).toBeEnabled())
    fireEvent.press(screen.getByTestId(`${prefix}saved-open`))
    await screen.findByTestId(`${prefix}saved-select-${WORKER}`)
    fireEvent.press(screen.getByRole('checkbox'))
    fireEvent.press(screen.getByTestId(`${prefix}saved-select-${WORKER}`))
    await waitFor(() => expect(mockSelect).toHaveBeenCalledTimes(1))
    expect(mockSelect.mock.calls[0][1]).toMatchObject({ ...CHOICE, auto_general: true })
    await waitFor(() => expect(screen.getByRole('checkbox')).toHaveProp('accessibilityState', { checked: true, disabled: true }))
    expect((await stored())[0][0].request.auto_general).toBe(true)
    first.unmount()
    mockRead.mockResolvedValue({ success: false, status: 503, code: 'UNAVAILABLE', error: '' })
    const resumed = render(<ConsentHarness />)
    await waitFor(() => expect(screen.getByTestId(`${prefix}selection-reconcile`)).toHaveTextContent(/cho phép tìm thợ khác/))
    expect(screen.getByTestId(`${prefix}general`)).toBeDisabled()
    expect(screen.getByTestId(`${prefix}saved-open`)).toBeDisabled()
    expect(mockSelect).toHaveBeenCalledTimes(1)
    resumed.unmount()
  })

  it('keeps choice controls locked until actor storage has been read', async () => {
    const view = setup()
    expect(view.result.current.customerMatchingSelectionState).toMatchObject({ jobId: JOB, ready: false, choice: null })
    await waitFor(() => expect(view.result.current.customerMatchingSelectionState.ready).toBe(true))
    expect(mockSelect).not.toHaveBeenCalled()
    view.unmount()
  })

  it('exposes immutable pending consent on cold start even if receipt reads fail', async () => {
    const first = setup()
    await act(async () => { await first.result.current.setMatchingPreference({ ...CHOICE, auto_general: true }) })
    first.unmount()
    mockRead.mockResolvedValue({ success: false, status: 503, code: 'UNAVAILABLE', error: '' })
    const resumed = setup()
    await waitFor(() => expect(resumed.result.current.customerMatchingSelectionState).toMatchObject({
      jobId: JOB, ready: true, choice: { ...CHOICE, auto_general: true },
    }))
    expect(mockSelect).toHaveBeenCalledTimes(1)
    const otherOwner = '66666666-6666-4666-8666-666666666666'
    resumed.rerender({ owner: otherOwner })
    expect(resumed.result.current.customerMatchingSelectionState).toMatchObject({ ready: false, choice: null, scopeKey: `${otherOwner}:${JOB}` })
    await waitFor(() => expect(resumed.result.current.customerMatchingSelectionState.ready).toBe(true))
    expect(resumed.result.current.customerMatchingSelectionState.choice).toBeNull()
    resumed.unmount()
  })

  it('unlocks editing only after a definitive refusal has been persisted', async () => {
    const view = setup()
    mockSelect.mockResolvedValue({ success: false, status: 409, code: 'COVERAGE_UNAVAILABLE', error: '' })
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(view.result.current.customerMatchingSelectionState).toMatchObject({ ready: true, choice: null })
    mockSelect.mockResolvedValue({ success: false, status: 0, code: 'TIMEOUT', error: '' })
    await act(async () => { await view.result.current.setMatchingPreference({ ...CHOICE, auto_general: true }) })
    expect(view.result.current.customerMatchingSelectionState.choice).toMatchObject({ auto_general: true })
    view.unmount()
  })

  it('persists exact saved-only consent before POST and joins duplicate presses', async () => {
    const view = setup()
    let atSend: unknown
    mockSelect.mockImplementation(async () => {
      atSend = await stored()
      return { success: false, status: 0, code: 'TIMEOUT', error: '' }
    })
    await act(async () => { await Promise.all([
      view.result.current.setMatchingPreference(CHOICE), view.result.current.setMatchingPreference(CHOICE),
    ]) })
    withPillarContext(PILLAR, () => {
      expect(mockSelect).toHaveBeenCalledTimes(1)
      const request = mockSelect.mock.calls[0][1]
      expect(mockSelect).toHaveBeenCalledWith(JOB, { ...CHOICE, client_request_id: expect.any(String) }, `token-${OWNER}`)
      expect(atSend).toEqual([[expect.objectContaining({ ownerId: OWNER, jobId: JOB, request })]])
    })
    expect(view.dispatch).not.toHaveBeenCalled()
    view.unmount()
  })

  it('cold start reads the exact persisted request without another POST when receipt exists', async () => {
    const first = setup()
    await act(async () => { await first.result.current.setMatchingPreference(CHOICE) })
    const request = mockSelect.mock.calls[0][1]
    first.unmount()
    mockRead.mockResolvedValue({ success: true, status: 200, data: { selection: receipt(request) } })
    const resumed = setup()
    await waitFor(() => expect(resumed.result.current.customerMatchingSelectionFeedback?.message).toContain('đang chờ xử lý'))
    expect(mockRead).toHaveBeenLastCalledWith(JOB, request.client_request_id, `token-${OWNER}`)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(resumed.dispatch).not.toHaveBeenCalled()
    expect(JSON.stringify(await stored())).toContain('SELECT12')
    resumed.unmount()
  })

  it('replays only identical persisted consent when a cold-start GET proves absence', async () => {
    const first = setup()
    await act(async () => { await first.result.current.setMatchingPreference(CHOICE) })
    const request = mockSelect.mock.calls[0][1]
    first.unmount()
    mockSelect.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { selection: receipt(input) } }))
    const resumed = setup()
    await waitFor(() => expect(resumed.result.current.customerMatchingSelectionFeedback?.message).toContain('đang chờ xử lý'))
    expect(mockSelect).toHaveBeenCalledTimes(2)
    expect(mockSelect).toHaveBeenLastCalledWith(JOB, request, `token-${OWNER}`)
    resumed.unmount()
  })

  it('does not replay POST when receipt lookup is unavailable', async () => {
    mockRead.mockResolvedValue({ success: false, status: 503, code: 'UNAVAILABLE', error: '' })
    const view = setup()
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(mockSelect).not.toHaveBeenCalled()
    expect(view.result.current.customerMatchingSelectionFeedback?.message).toContain('Đang đối soát')
    view.unmount()
  })

  it.each(['admin', 'worker'] as const)('denies %s selection before storage or network', async (role) => {
    const view = setup(role)
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockRead).not.toHaveBeenCalled()
    expect(await stored()).toEqual([])
    view.unmount()
  })

  it('does not send when persistent storage fails', async () => {
    const view = setup()
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'))
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(mockSelect).not.toHaveBeenCalled()
    expect(view.setRemoteError).toHaveBeenCalledWith(expect.objectContaining({ code: 'MATCHING_PREFERENCE_STORAGE_UNAVAILABLE' }))
    view.unmount()
  })

  it('does not turn corrupt storage into a fresh command', async () => {
    const first = setup()
    await act(async () => { await first.result.current.setMatchingPreference(CHOICE) })
    first.unmount()
    const key = (await AsyncStorage.getAllKeys())[0]
    await AsyncStorage.setItem(key, '{broken')
    const resumed = setup()
    await act(async () => { await resumed.result.current.setMatchingPreference(CHOICE) })
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(resumed.setRemoteError).toHaveBeenCalledWith(expect.objectContaining({ code: 'MATCHING_PREFERENCE_STORAGE_UNAVAILABLE' }))
    expect(resumed.result.current.customerMatchingSelectionState.ready).toBe(false)
    resumed.unmount()
  })

  it('does not replace an unknown saved-only choice with broader consent', async () => {
    const view = setup()
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    const before = JSON.stringify(await stored())
    await act(async () => { await view.result.current.setMatchingPreference({ ...CHOICE, auto_general: true }) })
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(await stored())).toBe(before)
    expect(view.setRemoteError).toHaveBeenCalledWith(expect.objectContaining({ code: 'MATCHING_PREFERENCE_REQUEST_CONFLICT' }))
    view.unmount()
  })

  it('does not report a broader press as accepted while automatic recovery is reading saved-only consent', async () => {
    const first = setup()
    await act(async () => { await first.result.current.setMatchingPreference(CHOICE) })
    const input = mockSelect.mock.calls[0][1]
    first.unmount()
    let finish!: (value: unknown) => void
    mockRead.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const resumed = setup()
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2))
    let accepted: boolean | undefined
    await act(async () => {
      const press = resumed.result.current.setMatchingPreference({ ...CHOICE, auto_general: true })
      finish({ success: true, status: 200, data: { selection: receipt(input) } })
      accepted = await press
    })
    expect(accepted).toBe(false)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    resumed.unmount()
  })

  it.each([
    { job_id: WORKER }, { request_id: OWNER }, { preferred_worker_id: OWNER },
    { auto_general: true }, { broadcast_sent: true }, { state: 'made_up' },
  ])('does not persist or hydrate a forged selection receipt: %j', async (changes) => {
    const view = setup()
    mockSelect.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { selection: { ...receipt(input), ...changes } } }))
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(mockJob).not.toHaveBeenCalled()
    expect(view.result.current.customerMatchingSelectionFeedback?.message).toContain('Đang đối soát')
    expect(JSON.stringify(await stored())).not.toContain('SELECT12')
    view.unmount()
  })

  it('does not apply an old POST receipt to an account switched during the request', async () => {
    const view = setup()
    let finish!: (value: unknown) => void
    mockSelect.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    let request!: Promise<boolean>
    act(() => { request = view.result.current.setMatchingPreference(CHOICE) })
    await waitFor(() => expect(mockSelect).toHaveBeenCalledTimes(1))
    const input = mockSelect.mock.calls[0][1]
    view.rerender({ owner: WORKER })
    await act(async () => { finish({ success: true, status: 202, data: { selection: receipt(input) } }); await request })
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(mockJob).not.toHaveBeenCalled()
    expect(view.result.current.customerMatchingSelectionFeedback).toBeNull()
    expect(JSON.stringify(await stored())).not.toContain('SELECT12')
    view.unmount()
  })

  it('stops automatic mutation after a definitive capacity rejection until another explicit press', async () => {
    const view = setup()
    mockSelect.mockResolvedValue({ success: false, status: 409, code: 'COVERAGE_UNAVAILABLE', error: '' })
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    view.unmount()
    const resumed = setup()
    await act(async () => { await Promise.resolve() })
    expect(mockSelect).toHaveBeenCalledTimes(1)
    resumed.unmount()
  })

  it('does not send if the app backgrounds while looking up the receipt', async () => {
    const view = setup()
    mockRead.mockImplementation(async () => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
      return { success: false, status: 404, code: 'NOT_FOUND', error: '' }
    })
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(mockSelect).not.toHaveBeenCalled()
    expect(JSON.stringify(await stored())).toContain(WORKER)
    view.unmount()
  })

  it('hydrates only the fresh job response without fabricating a broadcast or price from queued acceptance', async () => {
    const view = setup()
    mockSelect.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { selection: receipt(input) } }))
    mockJob.mockResolvedValue({ success: true, status: 200, data: jobDetail() })
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(mockJob).toHaveBeenCalledWith(JOB, `token-${OWNER}`)
    expect(view.dispatch).toHaveBeenCalledWith({ type: 'hydrate_remote_job', job: expect.objectContaining({
      id: JOB, backendStatus: 'awaiting_customer_confirm', broadcast: null, estimate: null,
    }) })
    expect(view.result.current.customerMatchingSelectionFeedback?.message).toContain('Chưa xác nhận gửi lời mời')
    view.unmount()
  })

  it('does not hydrate a foreign job after a valid receipt', async () => {
    const view = setup()
    mockSelect.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { selection: receipt(input) } }))
    const data = jobDetail()
    data.job.id = WORKER
    mockJob.mockResolvedValue({ success: true, status: 200, data })
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    expect(view.dispatch).not.toHaveBeenCalled()
    view.unmount()
  })

  it('keeps foreground recovery bounded and never creates another request while polling', async () => {
    jest.useFakeTimers()
    const callbacks: Array<(state: AppStateStatus) => void> = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      callbacks.push(callback)
      return { remove: jest.fn() }
    })
    const view = setup()
    await act(async () => { await view.result.current.setMatchingPreference(CHOICE) })
    const request = mockSelect.mock.calls[0][1]
    mockRead.mockResolvedValue({ success: true, status: 200, data: { selection: receipt(request) } })
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000) })
    expect(mockRead).toHaveBeenCalledTimes(1)
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    await act(async () => { callbacks.forEach((callback) => callback('active')); await jest.advanceTimersByTimeAsync(120_000) })
    expect(mockRead).toHaveBeenCalledTimes(21)
    await act(async () => { await jest.advanceTimersByTimeAsync(120_000) })
    expect(mockRead).toHaveBeenCalledTimes(21)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})

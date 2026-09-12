import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import type { ApartmentAccessAuthorizationReceipt, LocalWorkflowState, UserRole } from '@nestscout/shared'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { ApartmentAccessControls } from '@/components/customer/kael-chat/apartment-access-controls'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { useCustomerJobActions } from '../frontend-workflow/use-customer-job-actions'
import type { JobDetailResponse } from '../api-types'
import { listApartmentAccess, prepareApartmentAccess, storeApartmentAccess } from '../frontend-workflow/apartment-access-recovery'

export const PILLAR = {
  id: 'P132-customer-apartment-access-mobile',
  invariant: 'Apartment consent survives interruption without changing actor, worker or visit, and unknown outcomes remain locked in the native UI',
  authority: ['governance/RULES.md #7 (Customer confirmation)', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/lib/frontend-workflow/use-customer-job-actions.ts',
  layer: 'integration',
  siblings: ['P131-apartment-access-mobile-transport', 'P129-apartment-access-authority-sql'],
  mutation: 'remove the captured-session check after the job read; a retired account callback sends the authorization',
} as const satisfies PillarManifest

const OWNER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const WORKER = '33333333-3333-4333-8333-333333333333'
const INTENT = { expected_worker_id: WORKER, expected_check_in_at: '2026-09-08T01:00:00.000Z' }
const RECEIPT: ApartmentAccessAuthorizationReceipt = { job_id: JOB, worker_id: WORKER, checked_in_at: INTENT.expected_check_in_at,
  authorized_at: '2026-09-08T01:01:00.000Z', release_stage: 'unit_released', already_authorized: false }
const mockAuthorize = jest.fn()
const mockJob = jest.fn()
jest.mock('../services', () => ({ jobService: {
  authorizeApartmentAccess: (...args: unknown[]) => mockAuthorize(...args),
  getJob: (...args: unknown[]) => mockJob(...args),
  listMyActiveJob: jest.fn(async () => ({ success: true, data: { active_job: null } })),
} }))

function access(receipt: ApartmentAccessAuthorizationReceipt | null = null) {
  return { authorization_context: INTENT, authorization_receipt: receipt,
    release_stage: receipt ? 'unit_released' as const : 'building_released' as const,
    exact_unit_released: Boolean(receipt), worker_checked_in: true,
    check_in_required: true, identity_check_required: true, customer_handoff_required: true, evidence_mode: 'geofence' as const, access_profile: {} }
}
function jobDetail(receipt: ApartmentAccessAuthorizationReceipt | null = null): JobDetailResponse {
  return { job: {
    id: JOB, status: 'arrived', service_type: 'plumbing', description: 'Kiểm tra vòi nước', problem_chips: ['Kiểm tra vòi nước'],
    photo_urls: [], customer_evidence_photo_urls: [], field_evidence_photo_urls: [], address_building: null, address_unit: null,
    address_floor: null, address_district: 'district_7', address_access: access(receipt), scheduled_at: null,
    kael_problem_identified: null, kael_complexity: null, kael_price_min: null, kael_price_max: null, kael_advisory: null,
    kael_estimate_card_v3: null, kael_worker_brief_core: null, kael_worker_brief_guidance: null, kael_progress: null,
    final_price: null, completion_notes: null, completion_photo_urls: [], created_at: '2026-09-08T00:00:00.000Z',
    matched_at: null, arrived_at: null, completed_at: null, confirmed_at: null, paid_at: null, reviewed_at: null,
  }, worker: null, broadcast_state: null, matching_state: null, current_scope_change: null }
}
function setup(role: UserRole = 'customer') {
  const dispatch = jest.fn()
  const setRemoteError = jest.fn((): false => false)
  const stateRef = { current: { deal: { id: JOB, status: 'arrived', backendStatus: 'arrived', broadcast: { addressAccess: access() } } } } as unknown as { current: LocalWorkflowState }
  const view = renderHook<ReturnType<typeof useCustomerJobActions>, { owner: string }>(({ owner }) => useCustomerJobActions({
    dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null }, role,
    sessionUserId: owner, sessionAccessToken: `token-${owner}`, setRemoteError, stateRef,
  }), { initialProps: { owner: OWNER } })
  return { ...view, dispatch, setRemoteError, stateRef }
}
async function stored() {
  return JSON.parse((await AsyncStorage.getItem(`nestscout.customer.apartment-access.v1.${OWNER}`)) ?? '[]')
}
const success = (data: JobDetailResponse) => ({ success: true, status: 200, data })

describe('Customer apartment access recovery', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() })
    mockJob.mockReset().mockResolvedValue(success(jobDetail()))
    mockAuthorize.mockReset().mockResolvedValue({ success: false, status: 0, code: 'TIMEOUT', error: '' })
  })
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

  it('persists consent before POST and joins double presses using the captured token', async () => {
    const view = setup()
    mockAuthorize.mockImplementation(async () => {
      expect(await stored()).toEqual([expect.objectContaining({ ownerId: OWNER, jobId: JOB, intent: INTENT, resolution: 'pending' })])
      return { success: false, code: 'TIMEOUT', status: 0, error: '' }
    })
    await act(async () => { await Promise.all([view.result.current.authorizeApartmentAccess(), view.result.current.authorizeApartmentAccess()]) })
    expect(mockAuthorize).toHaveBeenCalledTimes(1)
    expect(mockAuthorize).toHaveBeenCalledWith(JOB, INTENT, `token-${OWNER}`)
    expect(view.result.current.customerApartmentAccessState).toMatchObject({ ready: false, pending: true, message: expect.stringContaining('Đang đối soát') })
    view.unmount()
  })

  it('recovers an unknown committed receipt on cold start without another POST', async () => {
    const first = setup()
    await act(async () => { await first.result.current.authorizeApartmentAccess() })
    first.unmount()
    mockJob.mockResolvedValue(success(jobDetail({ ...RECEIPT, already_authorized: true })))
    const resumed = setup()
    await waitFor(() => expect(resumed.dispatch).toHaveBeenCalled())
    expect(mockAuthorize).toHaveBeenCalledTimes(1)
    expect(await stored()).toEqual([expect.objectContaining({ resolution: 'confirmed', receipt: expect.objectContaining({ authorized_at: RECEIPT.authorized_at }) })])
    resumed.unmount()
  })

  it('does not authorize a new worker or visit during automatic recovery', async () => {
    const first = setup()
    await act(async () => { await first.result.current.authorizeApartmentAccess() })
    first.unmount()
    const detail = jobDetail()
    detail.job.address_access.authorization_context = { ...INTENT, expected_check_in_at: '2026-09-08T02:00:00.000Z' }
    mockJob.mockResolvedValue(success(detail))
    const resumed = setup()
    await waitFor(() => expect(resumed.result.current.customerApartmentAccessState.message).toContain('đã thay đổi'))
    expect(mockAuthorize).toHaveBeenCalledTimes(1)
    expect(await stored()).toEqual([expect.objectContaining({ resolution: 'superseded', receipt: null })])
    resumed.unmount()
  })

  it('does not send after switching accounts while the job read is in flight', async () => {
    const view = setup()
    let finish!: (value: unknown) => void
    mockJob.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    let pending!: Promise<boolean>
    act(() => { pending = view.result.current.authorizeApartmentAccess() })
    await waitFor(() => expect(mockJob).toHaveBeenCalledTimes(1))
    view.rerender({ owner: WORKER })
    await act(async () => { finish(success(jobDetail())); await pending })
    withPillarContext(PILLAR, () => expect(mockAuthorize).not.toHaveBeenCalled(), 'Retired Customer read must not authorize access')
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(view.result.current.customerApartmentAccessState.message).toBeNull()
    view.unmount()
  })

  it.each(['worker', 'admin'] as const)('rejects %s before storage or network mutation', async (role) => {
    const view = setup(role)
    await act(async () => { expect(await view.result.current.authorizeApartmentAccess()).toBe(false) })
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect(await stored()).toEqual([])
    view.unmount()
  })

  it.each([{ success: false, status: 503, code: 'UNAVAILABLE', error: '' }, success({ ...jobDetail(), job: { ...jobDetail().job, id: WORKER } })])(
    'keeps an unreadable or foreign job outcome unknown without POST', async (response) => {
      const view = setup()
      mockJob.mockResolvedValue(response)
      await act(async () => { await view.result.current.authorizeApartmentAccess() })
      expect(mockAuthorize).not.toHaveBeenCalled()
      expect(view.result.current.customerApartmentAccessState.pending).toBe(true)
      view.unmount()
    },
  )

  it('fails closed when local persistence fails', async () => {
    const view = setup()
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage unavailable'))
    await act(async () => { await view.result.current.authorizeApartmentAccess() })
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect(view.result.current.customerApartmentAccessState).toMatchObject({ ready: false, message: expect.stringContaining('thiết bị') })
    view.unmount()
  })

  it('rejects corrupt local recovery state before a new network mutation', async () => {
    await AsyncStorage.setItem(`nestscout.customer.apartment-access.v1.${OWNER}`, '{invalid')
    const view = setup()
    await act(async () => { await view.result.current.authorizeApartmentAccess() })
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect(mockJob).not.toHaveBeenCalled()
    expect(view.result.current.customerApartmentAccessState.ready).toBe(false)
    view.unmount()
  })

  it('keeps a callback retired after signing out and returning to the same account', async () => {
    const view = setup()
    const oldPress = view.result.current.authorizeApartmentAccess
    view.rerender({ owner: WORKER })
    view.rerender({ owner: OWNER })
    await act(async () => { expect(await oldPress()).toBe(false) })
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect(await stored()).toEqual([])
    view.unmount()
  })

  it('retains an unknown POST without publishing its receipt after an account switch', async () => {
    const view = setup()
    let finish!: (value: unknown) => void
    mockAuthorize.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    let request!: Promise<boolean>
    act(() => { request = view.result.current.authorizeApartmentAccess() })
    await waitFor(() => expect(mockAuthorize).toHaveBeenCalledTimes(1))
    view.rerender({ owner: WORKER })
    await act(async () => { finish({ success: true, status: 200, data: RECEIPT }); expect(await request).toBe(false) })
    expect(view.dispatch).not.toHaveBeenCalled()
    expect((await stored())[0]).toMatchObject({ resolution: 'pending', receipt: null })
    expect(view.result.current.customerApartmentAccessState.message).toBeNull()
    view.unmount()
  })

  it('does not join an old visit command as consent for a newly rendered visit', async () => {
    const view = setup()
    let finish!: (value: unknown) => void
    mockAuthorize.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    let prior!: Promise<boolean>
    act(() => { prior = view.result.current.authorizeApartmentAccess() })
    await waitFor(() => expect(mockAuthorize).toHaveBeenCalledTimes(1))
    view.stateRef.current.deal!.broadcast!.addressAccess = {
      ...access(), authorization_context: { ...INTENT, expected_check_in_at: '2026-09-08T02:00:00.000Z' },
    }
    view.rerender({ owner: OWNER })
    let nextOutcome: boolean | undefined
    try {
      await act(async () => { void view.result.current.authorizeApartmentAccess().then((value) => { nextOutcome = value }) })
      expect(nextOutcome).toBe(false)
      expect(mockAuthorize).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => { finish({ success: false, status: 0, code: 'TIMEOUT', error: '' }); await prior })
      view.unmount()
    }
  })

  it('does not POST if the app backgrounds during its preflight job read', async () => {
    const view = setup()
    mockJob.mockImplementation(async () => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
      return success(jobDetail())
    })
    await act(async () => { expect(await view.result.current.authorizeApartmentAccess()).toBe(false) })
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect((await stored())[0].resolution).toBe('pending')
    view.unmount()
  })

  it('never evicts unresolved consent when the local journal reaches its bound', async () => {
    for (let index = 1; index <= 20; index += 1) {
      await prepareApartmentAccess(OWNER, `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`, INTENT, () => true)
    }
    await expect(prepareApartmentAccess(OWNER, JOB, INTENT, () => true)).rejects.toThrow('ACCESS_STORAGE_UNAVAILABLE')
    expect(await listApartmentAccess(OWNER)).toHaveLength(20)
  })

  it('prevents a late storage completion from replacing a newer explicit consent', async () => {
    const prior = (await prepareApartmentAccess(OWNER, JOB, INTENT, () => true))!
    expect(await storeApartmentAccess({ ...prior, resolution: 'superseded' }, () => true)).toBe(true)
    const next = (await prepareApartmentAccess(OWNER, JOB, { ...INTENT, expected_check_in_at: '2026-09-08T02:00:00.000Z' }, () => true))!
    expect(await storeApartmentAccess({ ...prior, resolution: 'confirmed', receipt: RECEIPT }, () => true)).toBe(false)
    expect(await listApartmentAccess(OWNER)).toEqual([next])
  })

  it('rejects a press from an old rendered visit instead of adopting the latest worker context', async () => {
    const view = setup()
    const oldPress = view.result.current.authorizeApartmentAccess
    view.stateRef.current.deal!.broadcast!.addressAccess = {
      ...access(), authorization_context: { ...INTENT, expected_worker_id: OWNER },
    }
    await act(async () => { expect(await oldPress()).toBe(false) })
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect(await stored()).toEqual([])
    view.unmount()
  })

  it('does not claim current access when the post-command read contradicts its receipt', async () => {
    const view = setup()
    mockAuthorize.mockResolvedValue({ success: true, status: 200, data: RECEIPT })
    await act(async () => { expect(await view.result.current.authorizeApartmentAccess()).toBe(false) })
    expect(view.result.current.customerApartmentAccessState).toMatchObject({ ready: false, message: expect.stringContaining('chưa tải được') })
    expect(view.dispatch).not.toHaveBeenCalled()
    view.unmount()
  })

  it.each([{ worker_id: OWNER }, { checked_in_at: '2026-09-08T02:00:00.000Z' }, { authorized_at: null }, { job_id: WORKER }])(
    'rejects a mismatched command receipt: %j', async (changes) => {
      const view = setup()
      mockAuthorize.mockResolvedValue({ success: true, status: 200, data: { ...RECEIPT, ...changes } })
      await act(async () => { await view.result.current.authorizeApartmentAccess() })
      expect(view.dispatch).not.toHaveBeenCalled()
      expect((await stored())[0].receipt).toBeNull()
      view.unmount()
    },
  )

  it('keeps foreground recovery bounded, pauses in background and reuses the same persisted consent', async () => {
    jest.useFakeTimers()
    const callbacks: Array<(state: AppStateStatus) => void> = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { callbacks.push(callback); return { remove: jest.fn() } })
    const view = setup()
    await act(async () => { await view.result.current.authorizeApartmentAccess() })
    mockJob.mockResolvedValue({ success: false, status: 503, error: '' })
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    await act(async () => { await jest.advanceTimersByTimeAsync(120_000) })
    expect(mockJob).toHaveBeenCalledTimes(1)
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    await act(async () => { callbacks.forEach((callback) => callback('active')); await jest.advanceTimersByTimeAsync(240_000) })
    const reads = mockJob.mock.calls.length
    await act(async () => { await jest.advanceTimersByTimeAsync(240_000) })
    expect(mockJob).toHaveBeenCalledTimes(reads)
    expect(mockAuthorize).toHaveBeenCalledTimes(1)
    expect(reads).toBeLessThanOrEqual(21)
    view.unmount()
  })

  it.each(['vi', 'en'] as const)('renders a disabled unknown outcome with accessible state in %s', (language) => {
    const onAuthorize = jest.fn()
    render(<ApartmentAccessControls jobId={JOB} language={language} tokens={getCustomerThemeTokens('light')} onAuthorize={onAuthorize}
      state={{ jobId: JOB, ready: false, pending: true, message: language === 'vi' ? 'Đang đối soát quyền vào căn hộ.' : 'Reconciling apartment access.' }} />)
    const button = screen.getByTestId('customer-v21-case-authorize-apartment-access')
    expect(button).toBeDisabled()
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    fireEvent.press(button)
    expect(onAuthorize).not.toHaveBeenCalled()
    expect(screen.getByText(language === 'vi' ? 'Đang đối soát' : 'Reconciling')).toBeOnTheScreen()
  })
})

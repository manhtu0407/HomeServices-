import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import { createInitialLocalWorkflowState, localWorkflowReducer, type MatchingRetryReceipt, type MatchingRetryRequest, type UserRole } from '@nestscout/shared'
import type { JobDetailResponse } from '../api-types'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { useCustomerJobActions } from '../frontend-workflow/use-customer-job-actions'
import { listMatchingRetries, prepareMatchingRetry } from '../frontend-workflow/matching-retry-recovery'
import { api } from '../api'
import { recoverLegacyConfirmation } from '../services/legacy-confirmation-recovery'

export const PILLAR = {
  id: 'P105-customer-matching-retry-mobile',
  invariant: 'Customer retry persists one actor/job-bound command before POST and reconciles the same request after interruption without inventing delivery or crossing accounts',
  authority: ['governance/RULES.md #7 (Customer confirmation)', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/lib/frontend-workflow/use-customer-job-actions.ts',
  layer: 'integration',
  siblings: ['P74-customer-confirmation-relaunch-recovery'],
  mutation: 'send the bodyless legacy POST before durable storage — persist-before-send and exact request replay assertions fail',
} as const satisfies PillarManifest

const OWNER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const PARENT = '33333333-3333-4333-8333-333333333333'
const OPERATION = '44444444-4444-4444-8444-444444444444'
const SESSION = '66666666-6666-4666-8666-666666666666'
const mockGetChat = jest.fn()
const mockRecoverConfirmation = jest.fn()
const mockConfirmSearch = jest.fn()
const mockGetMatchingRetry = jest.fn()
const mockGetMatchingOperation = jest.fn()
const mockGetJob = jest.fn()

jest.mock('../services', () => ({
  kaelChatService: {
    get: (...args: unknown[]) => mockGetChat(...args),
    recoverConfirmation: (...args: unknown[]) => mockRecoverConfirmation(...args),
  },
  jobService: {
    confirmSearch: (...args: unknown[]) => mockConfirmSearch(...args),
    getMatchingRetry: (...args: unknown[]) => mockGetMatchingRetry(...args),
    getMatchingOperation: (...args: unknown[]) => mockGetMatchingOperation(...args),
    getJob: (...args: unknown[]) => mockGetJob(...args),
    listMyActiveJob: jest.fn(async () => ({ success: true, data: { active_job: null } })),
  },
}))
jest.mock('../media-upload', () => ({ uploadJobMediaDrafts: jest.fn() }))

function receipt(input: MatchingRetryRequest, state: MatchingRetryReceipt['state'] = 'queued'): MatchingRetryReceipt {
  return {
    operation_id: OPERATION, job_id: JOB, request_id: input.client_request_id,
    parent_operation_id: input.expected_matching_operation_id,
    confirmation_operation_id: '55555555-5555-4555-8555-555555555555',
    state, support_code: 'RETRY123', broadcast_sent: false,
    created_at: '2026-09-05T01:00:00.000Z', updated_at: '2026-09-05T01:00:00.000Z',
  }
}

function jobDetail(): JobDetailResponse {
  return {
    job: {
      id: JOB, status: 'broadcasting', service_type: 'plumbing', description: 'Kiểm tra vòi nước',
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
    worker: null, broadcast_state: { active_count: 1, seconds_remaining: 300 }, matching_state: null, current_scope_change: null,
  }
}

function setup(owner = OWNER, role: UserRole = 'customer') {
  const dispatch = jest.fn()
  const setRemoteError = jest.fn((): false => false)
  const stateRef = { current: { deal: { id: JOB, status: 'broadcasting', backendStatus: 'broadcasting' } } } as never
  const view = renderHook<ReturnType<typeof useCustomerJobActions>, { userId: string }>(({ userId }) => useCustomerJobActions({
    dispatch, language: 'vi', pendingJobCreateClientRequestRef: { current: null },
    role,
    sessionAccessToken: `token-${userId}`, sessionUserId: userId, setRemoteError, stateRef,
  }), { initialProps: { userId: owner } })
  return { ...view, dispatch, setRemoteError, stateRef }
}

async function persistedValues() {
  const keys = await AsyncStorage.getAllKeys()
  return Promise.all(keys.map(async (key) => JSON.parse((await AsyncStorage.getItem(key))!)))
}

function legacyChat() {
  return { success: true, status: 200, data: { session: {
    id: SESSION, customer_id: OWNER, job_id: JOB,
    estimate: { price_reasoning_receipt: { receipt_id: 'original-price-receipt' } },
  } } }
}

describe('Customer durable matching retry mobile boundary', () => {
  it('explicit retry recovers the original server-bound confirmation before reading the real matching parent', async () => {
    mockGetMatchingOperation.mockResolvedValueOnce({ success: true, status: 200, data: { job_id: JOB, operation: null } })
    mockGetChat.mockResolvedValue({ success: true, status: 200, data: {
      session: { id: SESSION, customer_id: OWNER, job_id: JOB, estimate: {
        price_reasoning_receipt: { receipt_id: 'original-price-receipt' },
      } },
    } })
    mockRecoverConfirmation.mockResolvedValue({ success: true, status: 200, data: { operation: {
      operation_id: OPERATION, idempotency_key: `kael-confirm:${SESSION}:${OWNER}`, session_id: SESSION,
      job_id: JOB, quote_mode: 'kael_auto_quote', state: 'no_reachable_worker', terminal: true,
      accepted_at: '2026-10-09T00:00:00.000Z', updated_at: '2026-10-09T00:00:00.000Z',
      retry_after_ms: null, support_code: 'RETRY123',
    } } })
    const view = setup()
    await act(async () => { expect(await view.result.current.confirmRemoteSearch(JOB, SESSION)).toBe(true) })
    expect(mockGetChat).toHaveBeenCalledWith(SESSION, `token-${OWNER}`)
    expect(mockRecoverConfirmation).toHaveBeenCalledWith(SESSION, {
      job_id: JOB, price_reasoning_receipt_id: 'original-price-receipt',
    }, `token-${OWNER}`)
    expect(mockGetMatchingOperation).toHaveBeenCalledTimes(2)
    expect(mockConfirmSearch).toHaveBeenCalledWith(JOB, expect.objectContaining({ expected_matching_operation_id: PARENT }), `token-${OWNER}`)
    view.unmount()
  })
  it('does not fabricate a parent operation or send a retry for a legacy job without confirmation receipts', async () => {
    mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: { job_id: JOB, operation: null } })
    const view = setup()
    await act(async () => { expect(await view.result.current.confirmRemoteSearch(JOB)).toBe(false) })
    expect(mockConfirmSearch).not.toHaveBeenCalled()
    expect(mockGetMatchingRetry).not.toHaveBeenCalled()
    expect(view.result.current.customerMatchingRetryFeedback?.message).toContain('Cần khôi phục xác nhận')
    view.unmount()
  })

  it.each(['LEGACY_OFFER_CHANGED', 'POLICY_BLOCKED', 'KAEL_PRICE_EVIDENCE_REQUIRED', 'LEGACY_RECOVERY_OUTCOME_UNKNOWN'])(
    'does not send matching when recovery returns %s', async (code) => {
      mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: { job_id: JOB, operation: null } })
      mockGetChat.mockResolvedValue(legacyChat())
      mockRecoverConfirmation.mockResolvedValue({ success: false, status: 409, code, error: '' })
      const view = setup()
      await act(async () => { expect(await view.result.current.confirmRemoteSearch(JOB, SESSION)).toBe(false) })
      expect(mockConfirmSearch).not.toHaveBeenCalled()
      expect(await listMatchingRetries(OWNER)).toHaveLength(0)
      expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({ code }))
      expect(view.result.current.customerMatchingRetryFeedback?.message).not.toContain(code)
      view.unmount()
    },
  )

  it.each(['job', 'account'] as const)('does not recover after the visible %s changes during the session read', async (changed) => {
    mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: { job_id: JOB, operation: null } })
    let finish!: (value: ReturnType<typeof legacyChat>) => void
    mockGetChat.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const view = setup()
    let pending!: Promise<boolean>
    act(() => { pending = view.result.current.confirmRemoteSearch(JOB, SESSION) })
    await waitFor(() => expect(mockGetChat).toHaveBeenCalled())
    if (changed === 'account') view.rerender({ userId: 'another-account' })
    else (view.stateRef as { current: { deal: { id: string } } }).current.deal.id = 'another-job'
    await act(async () => { finish(legacyChat()); expect(await pending).toBe(false) })
    expect(mockRecoverConfirmation).not.toHaveBeenCalled()
    expect(mockConfirmSearch).not.toHaveBeenCalled()
    view.unmount()
  })

  it.each(['job_id', 'customer_id', 'id'] as const)('rejects a session with mismatched %s before recovery', async (field) => {
    mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: { job_id: JOB, operation: null } })
    const chat = legacyChat()
    chat.data.session[field] = 'foreign-identity'
    mockGetChat.mockResolvedValue(chat)
    const view = setup()
    await act(async () => { expect(await view.result.current.confirmRemoteSearch(JOB, SESSION)).toBe(false) })
    expect(mockRecoverConfirmation).not.toHaveBeenCalled()
    expect(mockConfirmSearch).not.toHaveBeenCalled()
    view.unmount()
  })

  it('never adopts a legacy confirmation automatically on mount or foreground', async () => {
    const view = setup()
    await act(async () => {})
    expect(mockGetChat).not.toHaveBeenCalled()
    expect(mockRecoverConfirmation).not.toHaveBeenCalled()
    view.unmount()
  })

  it('binds the recovery HTTP command to the explicit token and rejects a foreign receipt', async () => {
    const post = jest.spyOn(api, 'postAuthenticated').mockResolvedValue({ success: true, status: 200, data: { operation: {
      operation_id: OPERATION, idempotency_key: `kael-confirm:${SESSION}:${OWNER}`, session_id: SESSION,
      job_id: PARENT, quote_mode: 'kael_auto_quote', state: 'no_reachable_worker', terminal: true,
      accepted_at: '2026-10-09T00:00:00.000Z', updated_at: '2026-10-09T00:00:00.000Z',
      retry_after_ms: null, support_code: 'RETRY123',
    } } })
    const input = { job_id: JOB, price_reasoning_receipt_id: 'original-price-receipt' }
    expect(await recoverLegacyConfirmation(SESSION, input, `token-${OWNER}`)).toMatchObject({
      success: false, code: 'LEGACY_RECOVERY_OUTCOME_UNKNOWN',
    })
    expect(post).toHaveBeenCalledWith(`/kael/chat/${SESSION}/recover-confirmation`, input, `token-${OWNER}`)
  })

  it('does not keep retry failure visible after the same job has been cancelled', async () => {
    mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: { job_id: JOB, operation: null } })
    const view = setup()
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(view.result.current.customerMatchingRetryFeedback).not.toBeNull()
    const stateRef = view.stateRef as { current: { deal: { status: string } } }
    stateRef.current.deal.status = 'cancelled'
    view.rerender({ userId: OWNER })
    expect(view.result.current.customerMatchingRetryFeedback).toBeNull()
    view.unmount()
  })
  beforeEach(async () => {
    jest.clearAllMocks()
    mockGetChat.mockReset()
    mockRecoverConfirmation.mockReset()
    await AsyncStorage.clear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }))
    mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: {
      job_id: JOB, operation: { operation_id: PARENT, state: 'no_reachable_worker', updated_at: '2026-09-05T00:00:00.000Z' },
    } })
    mockGetMatchingRetry.mockResolvedValue({ success: false, status: 404, code: 'NOT_FOUND', error: '' })
    mockGetJob.mockResolvedValue({ success: false, status: 503, code: 'UNAVAILABLE', error: '' })
    mockConfirmSearch.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { operation: receipt(input) } }))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('persists actor, job, expected parent and stable request before the first POST; double tap joins it', async () => {
    const view = setup()
    let storedAtPost = ''
    mockConfirmSearch.mockImplementation(async (job, input) => {
      storedAtPost = JSON.stringify(await persistedValues())
      return { success: true, status: 202, data: { operation: receipt(input) } }
    })
    await act(async () => {
      await Promise.all([view.result.current.confirmRemoteSearch(JOB), view.result.current.confirmRemoteSearch(JOB)])
    })
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    expect(mockConfirmSearch).toHaveBeenCalledWith(JOB, expect.any(Object), `token-${OWNER}`)
    withPillarContext(PILLAR, () => {
      const input = mockConfirmSearch.mock.calls[0][1]
      expect(input).toEqual({ client_request_id: expect.any(String), expected_matching_operation_id: PARENT })
      for (const identity of [OWNER, JOB, input.client_request_id, PARENT]) expect(storedAtPost).toContain(identity)
    })
    expect(view.dispatch.mock.calls.some(([action]) => action.type === 'hydrate_remote_job')).toBe(false)
    view.unmount()
  })

  it('does not send when durable storage fails', async () => {
    const view = setup()
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'))
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(mockConfirmSearch).not.toHaveBeenCalled()
    expect(view.setRemoteError).toHaveBeenCalledWith(expect.objectContaining({ code: 'MATCHING_RETRY_STORAGE_UNAVAILABLE' }))
    view.unmount()
  })

  it('hydrates the real job response through the shared reducer, not the retry receipt', async () => {
    const view = setup()
    mockConfirmSearch.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: {
      operation: { ...receipt(input, 'broadcasting'), broadcast_sent: true },
    } }))
    mockGetJob.mockResolvedValue({ success: true, status: 200, data: jobDetail() })
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    const action = view.dispatch.mock.calls.find(([value]) => value.type === 'hydrate_remote_job')?.[0]
    expect(action).toBeDefined()
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), action)
    expect(state.deal).toMatchObject({ id: JOB, status: 'broadcasting', broadcast: { status: 'sent' }, estimate: null })
    expect(state.lastError).toBeNull()
    expect(view.result.current.customerMatchingRetryFeedback).toBeNull()
    view.unmount()
  })

  it('does not hydrate a different job even when the retry receipt was valid', async () => {
    const view = setup()
    const data = jobDetail()
    data.job.id = '99999999-9999-4999-8999-999999999999'
    mockGetJob.mockResolvedValue({ success: true, status: 200, data })
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(view.dispatch.mock.calls.some(([action]) => action.type === 'hydrate_remote_job')).toBe(false)
    view.unmount()
  })

  it('serializes 100 same-job preparations and never evicts an unresolved command when storage is full', async () => {
    const prepared = await Promise.all(Array.from({ length: 100 }, () => prepareMatchingRetry(OWNER, JOB, PARENT)))
    expect(new Set(prepared.map((value) => value.request.client_request_id)).size).toBe(1)
    for (let index = 0; index < 19; index += 1) {
      await prepareMatchingRetry(OWNER, `88888888-8888-4888-8888-${String(index).padStart(12, '0')}`, PARENT)
    }
    await expect(prepareMatchingRetry(OWNER, '99999999-9999-4999-8999-999999999999', PARENT)).rejects.toThrow('MATCHING_RETRY_STORAGE_FULL')
    expect(await listMatchingRetries(OWNER)).toHaveLength(20)
    expect((await listMatchingRetries(OWNER)).find((entry) => entry.jobId === JOB)?.request).toEqual(prepared[0].request)
  })

  it.each(['worker', 'admin'] as const)('does not use the Customer retry command for %s', async (role) => {
    const view = setup(OWNER, role)
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(mockConfirmSearch).not.toHaveBeenCalled()
    expect(mockGetMatchingOperation).not.toHaveBeenCalled()
    view.unmount()
  })

  it('a failed storage read never becomes an empty queue', async () => {
    const view = setup()
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read unavailable'))
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'MATCHING_RETRY_STORAGE_UNAVAILABLE' }))
    view.unmount()
  })

  it('cold start reads the exact persisted request after an ambiguous POST, without a second POST when receipt exists', async () => {
    const first = setup()
    mockConfirmSearch.mockResolvedValue({ success: false, status: 0, code: 'TIMEOUT', error: '' })
    await act(async () => { await first.result.current.confirmRemoteSearch(JOB) })
    const input = mockConfirmSearch.mock.calls[0][1]
    expect(input).toBeDefined()
    first.unmount()
    mockGetMatchingRetry.mockResolvedValue({ success: true, status: 200, data: { operation: receipt(input, 'official_match') } })
    const resumed = setup()
    await waitFor(() => expect(mockGetMatchingRetry).toHaveBeenCalledWith(JOB, input.client_request_id, `token-${OWNER}`))
    await waitFor(() => expect(mockGetJob).toHaveBeenCalledWith(JOB, `token-${OWNER}`))
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    resumed.unmount()
  })

  it('replays an unknown request with identical input when GET proves the receipt is missing', async () => {
    const first = setup()
    mockConfirmSearch.mockResolvedValue({ success: false, status: 0, code: 'NETWORK_ERROR', error: '' })
    await act(async () => { await first.result.current.confirmRemoteSearch(JOB) })
    const input = mockConfirmSearch.mock.calls[0][1]
    first.unmount()
    mockConfirmSearch.mockImplementation(async (_job, replay) => ({ success: true, status: 202, data: { operation: receipt(replay) } }))
    const resumed = setup()
    await waitFor(() => expect(mockConfirmSearch).toHaveBeenCalledTimes(2))
    expect(mockConfirmSearch.mock.calls[1]).toEqual([JOB, input, `token-${OWNER}`])
    await waitFor(() => expect(resumed.result.current.customerMatchingRetryFeedback?.message).toContain('đang chờ xử lý'))
    resumed.unmount()
  })

  it('does not clear an ambiguous request on auth failure or treat it as a final retry failure', async () => {
    const view = setup()
    mockConfirmSearch.mockResolvedValue({ success: false, status: 401, code: 'AUTH_REQUIRED', error: '' })
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect((await listMatchingRetries(OWNER))[0].receipt).toBeNull()
    expect(view.result.current.customerMatchingRetryFeedback?.message).toContain('Đang đối soát')
    expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'MATCHING_RETRY_OUTCOME_UNKNOWN' }))
    view.unmount()
  })

  it.each(['job_id', 'request_id', 'parent_operation_id'] as const)('rejects a receipt with a foreign %s without hydrating or forgetting the command', async (field) => {
    const view = setup()
    mockConfirmSearch.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: {
      operation: { ...receipt(input), [field]: '99999999-9999-4999-8999-999999999999' },
    } }))
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect((await listMatchingRetries(OWNER))[0].receipt).toBeNull()
    expect(mockGetJob).not.toHaveBeenCalled()
    expect(view.result.current.customerMatchingRetryFeedback?.message).toContain('Đang đối soát')
    view.unmount()
  })

  it('does not replay POST when a previously acknowledged receipt disappears', async () => {
    const first = setup()
    await act(async () => { await first.result.current.confirmRemoteSearch(JOB) })
    first.unmount()
    const resumed = setup()
    await waitFor(() => expect(mockGetMatchingRetry).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(resumed.result.current.customerMatchingRetryFeedback?.message).toContain('Đang đối soát'))
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    resumed.unmount()
  })

  it('does not mutate or hydrate the new account when the old POST finishes after an account switch', async () => {
    const view = setup()
    let resolvePost!: (value: unknown) => void
    mockConfirmSearch.mockImplementation(() => new Promise((resolve) => { resolvePost = resolve }))
    let action!: Promise<boolean>
    act(() => { action = view.result.current.confirmRemoteSearch(JOB) })
    await waitFor(() => expect(mockConfirmSearch).toHaveBeenCalledTimes(1))
    const input = mockConfirmSearch.mock.calls[0][1]
    view.rerender({ userId: '66666666-6666-4666-8666-666666666666' })
    view.dispatch.mockClear()
    view.setRemoteError.mockClear()
    await act(async () => {
      resolvePost({ success: true, status: 202, data: { operation: receipt(input) } })
      await action
    })
    expect(mockGetJob).not.toHaveBeenCalled()
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(view.setRemoteError).not.toHaveBeenCalled()
    expect(view.result.current.customerMatchingRetryFeedback).toBeNull()
    expect((await listMatchingRetries(OWNER))[0].receipt).toBeNull()
    expect(await listMatchingRetries('66666666-6666-4666-8666-666666666666')).toEqual([])
    view.unmount()
  })

  it('fails closed on a corrupt or failed storage read instead of creating a fresh command', async () => {
    const view = setup()
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    const key = (await AsyncStorage.getAllKeys()).find((value) => value.includes('matching-retry'))!
    await AsyncStorage.setItem(key, '{broken')
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    expect(await AsyncStorage.getItem(key)).toBe('{broken')
    expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'MATCHING_RETRY_STORAGE_UNAVAILABLE' }))
    view.unmount()
  })

  it('creates a new retry only for an explicit Customer action against the newly exhausted parent', async () => {
    const view = setup()
    mockConfirmSearch.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { operation: receipt(input, 'no_reachable_worker') } }))
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    const firstInput = mockConfirmSearch.mock.calls[0][1]
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: {
      job_id: JOB, operation: { operation_id: OPERATION, state: 'no_reachable_worker', updated_at: '2026-09-05T01:00:00.000Z' },
    } })
    mockConfirmSearch.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { operation: {
      ...receipt(input), operation_id: '77777777-7777-4777-8777-777777777777',
    } } }))
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(mockConfirmSearch).toHaveBeenCalledTimes(2)
    const secondInput = mockConfirmSearch.mock.calls[1][1]
    expect(secondInput.expected_matching_operation_id).toBe(OPERATION)
    expect(secondInput.client_request_id).not.toBe(firstInput.client_request_id)
    view.unmount()
  })

  it('does not POST for an active or missing parent operation', async () => {
    const view = setup()
    for (const operation of [null, { operation_id: PARENT, state: 'broadcasting', updated_at: '2026-09-05T01:00:00.000Z' }]) {
      mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: { job_id: JOB, operation } })
      await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    }
    expect(mockConfirmSearch).not.toHaveBeenCalled()
    expect(await listMatchingRetries(OWNER)).toEqual([])
    view.unmount()
  })

  it('replaces a rejected stale-parent command only after a fresh explicit retry and persists its new identity', async () => {
    const first = setup()
    mockConfirmSearch.mockResolvedValueOnce({ success: false, status: 409, code: 'MATCHING_RETRY_PARENT_CHANGED', error: '' })
    await act(async () => { await first.result.current.confirmRemoteSearch(JOB) })
    const rejected = mockConfirmSearch.mock.calls[0][1]
    first.unmount()
    mockGetMatchingOperation.mockResolvedValue({ success: true, status: 200, data: {
      job_id: JOB, operation: { operation_id: OPERATION, state: 'no_reachable_worker', updated_at: '2026-09-05T01:00:00.000Z' },
    } })
    const resumed = setup()
    await act(async () => { await Promise.resolve() })
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    let savedAtPost: unknown
    mockConfirmSearch.mockImplementation(async (_job, input) => {
      savedAtPost = (await listMatchingRetries(OWNER))[0].request
      return { success: true, status: 202, data: { operation: receipt(input) } }
    })
    await act(async () => { await resumed.result.current.confirmRemoteSearch(JOB) })
    const replacement = mockConfirmSearch.mock.calls[1][1]
    expect(replacement.expected_matching_operation_id).toBe(OPERATION)
    expect(replacement.client_request_id).not.toBe(rejected.client_request_id)
    expect(savedAtPost).toEqual(replacement)
    expect((await listMatchingRetries(OWNER))[0].request).toEqual(replacement)
    resumed.unmount()
  })

  it('does not automatically retry a definitive coverage rejection on relaunch', async () => {
    const view = setup()
    mockConfirmSearch.mockResolvedValue({ success: false, status: 409, code: 'COVERAGE_UNAVAILABLE', error: '' })
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect((await listMatchingRetries(OWNER))[0].rejectedCode).toBe('COVERAGE_UNAVAILABLE')
    view.unmount()
    const resumed = setup()
    await act(async () => { await Promise.resolve() })
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    resumed.unmount()
  })

  it('persists an unrecognized client contract rejection and stops automatic POST retries', async () => {
    const view = setup()
    mockConfirmSearch.mockResolvedValue({ success: false, status: 409, code: 'CLIENT_UPDATE_REQUIRED', error: '' })
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect((await listMatchingRetries(OWNER))[0].rejectedCode).toBe('CLIENT_UPDATE_REQUIRED')
    expect(view.setRemoteError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'CLIENT_UPDATE_REQUIRED' }))
    view.unmount()

    const resumed = setup()
    await act(async () => { await Promise.resolve() })
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    resumed.unmount()
  })

  it('foreground reconciliation uses the same receipt and never sends a new request', async () => {
    const onForeground: Array<(state: AppStateStatus) => void> = []
    const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      onForeground.push(callback)
      return { remove: jest.fn() }
    })
    const view = setup()
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    const input = mockConfirmSearch.mock.calls[0][1]
    mockGetMatchingRetry.mockResolvedValue({ success: true, status: 200, data: { operation: receipt(input, 'candidate_ready') } })
    await act(async () => { onForeground.forEach((callback) => callback('active')) })
    await waitFor(() => expect(mockGetMatchingRetry).toHaveBeenCalledTimes(2))
    expect(mockGetMatchingRetry).toHaveBeenLastCalledWith(JOB, input.client_request_id, `token-${OWNER}`)
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    view.unmount()
    listener.mockRestore()
  })

  it('keeps reconciling a terminal receipt until the job can hydrate, then stops rereading it', async () => {
    const foreground: Array<(state: AppStateStatus) => void> = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      foreground.push(callback)
      return { remove: jest.fn() }
    })
    const view = setup()
    mockConfirmSearch.mockImplementation(async (_job, input) => ({ success: true, status: 202, data: { operation: receipt(input, 'stopped') } }))
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    const input = mockConfirmSearch.mock.calls[0][1]
    const data = jobDetail()
    data.job.status = 'cancelled'
    data.broadcast_state = null
    mockGetMatchingRetry.mockResolvedValue({ success: true, status: 200, data: { operation: receipt(input, 'stopped') } })
    mockGetJob.mockResolvedValue({ success: true, status: 200, data })
    await act(async () => { foreground.forEach((callback) => callback('active')) })
    await waitFor(() => expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'hydrate_remote_job' })))
    const reads = mockGetMatchingRetry.mock.calls.length
    await act(async () => { foreground.forEach((callback) => callback('active')) })
    expect(mockGetMatchingRetry).toHaveBeenCalledTimes(reads)
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('blocks outgoing mutation if the app backgrounds during the parent read', async () => {
    const view = setup()
    mockGetMatchingOperation.mockImplementation(async () => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
      return { success: true, status: 200, data: { job_id: JOB, operation: {
        operation_id: PARENT, state: 'no_reachable_worker', updated_at: '2026-09-05T00:00:00.000Z',
      } } }
    })
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    expect(mockConfirmSearch).not.toHaveBeenCalled()
    expect(await listMatchingRetries(OWNER)).toEqual([])
    view.unmount()
  })

  it('keeps polling bounded and inactive in background; foreground opens a new bounded recovery window', async () => {
    jest.useFakeTimers()
    const foreground: Array<(state: AppStateStatus) => void> = []
    const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      foreground.push(callback)
      return { remove: jest.fn() }
    })
    const view = setup()
    await act(async () => { await view.result.current.confirmRemoteSearch(JOB) })
    const input = mockConfirmSearch.mock.calls[0][1]
    mockGetMatchingRetry.mockResolvedValue({ success: true, status: 200, data: { operation: receipt(input) } })
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000) })
    expect(mockGetMatchingRetry).toHaveBeenCalledTimes(1)
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    await act(async () => { foreground.forEach((callback) => callback('active')); await jest.advanceTimersByTimeAsync(120_000) })
    const reads = mockGetMatchingRetry.mock.calls.length
    expect(reads).toBe(21)
    await act(async () => { await jest.advanceTimersByTimeAsync(120_000) })
    expect(mockGetMatchingRetry).toHaveBeenCalledTimes(reads)
    expect(mockConfirmSearch).toHaveBeenCalledTimes(1)
    view.unmount()
    listener.mockRestore()
    jest.useRealTimers()
  })
})

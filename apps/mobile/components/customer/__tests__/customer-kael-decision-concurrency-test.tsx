import { act, renderHook, waitFor } from '@testing-library/react-native'
import { clearPendingConfirmation, getOrCreatePendingConfirmation, writePendingConfirmation } from '@/lib/frontend-workflow/confirmation-recovery'

import { createCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'
import { useCustomerKaelDecisionActions } from '../kael-chat/use-customer-kael-decision-actions'

const mockConfirmEstimate = jest.fn()
const mockSendKaelTurn = jest.fn()
const mockDecideIntake = jest.fn()
const mockProgressGet = jest.fn()

jest.mock('@/lib/services', () => ({
  kaelAssistantService: { ask: jest.fn() },
  kaelChatService: {
    confirm: (...args: unknown[]) => mockConfirmEstimate(...args),
    sendTurn: (...args: unknown[]) => mockSendKaelTurn(...args),
    decideIntakeConfirmation: (...args: unknown[]) => mockDecideIntake(...args),
  },
  kaelChatProgressService: { get: (...args: unknown[]) => mockProgressGet(...args) },
}))

jest.mock('@/lib/frontend-workflow/confirmation-recovery', () => ({
  clearPendingConfirmation: jest.fn(async () => undefined),
  getOrCreatePendingConfirmation: jest.fn(async (
    ownerId: string,
    sessionId: string,
    confirmInput: Record<string, unknown>,
  ) => ({
    confirmInput,
    idempotencyKey: 'confirm:test-idempotency-key',
    operation: null,
    ownerId,
    sessionId,
    supportCode: null,
    updatedAt: '2026-08-23T00:00:00.000Z',
  })),
  readPendingConfirmation: jest.fn(async () => null),
  writePendingConfirmation: jest.fn(async () => undefined),
}))

function decisionHarness(agenticAdjustmentText = '') {
  const chatUi = {
    agenticAdjustmentText,
    agenticRejectReason: '',
    caseQuoteRejectReason: '',
    confirmingAgenticEstimate: false,
    confirmingCaseQuote: false,
    confirmingCompletion: false,
    retryingWorkerSearch: false,
    setAgenticAdjustmentOpen: jest.fn(),
    setAgenticAdjustmentText: jest.fn(),
    setAgenticPriceQuestionOpen: jest.fn(),
    setAgenticRejectOpen: jest.fn(),
    setAgenticRejectReason: jest.fn(),
    setCaseEditOpen: jest.fn(),
    setCaseQuoteRejectOpen: jest.fn(),
    setCaseQuoteRejectReason: jest.fn(),
    setConfirmingAgenticEstimate: jest.fn(),
    setConfirmingCaseQuote: jest.fn(),
    setConfirmingCompletion: jest.fn(),
    setRetryingWorkerSearch: jest.fn(),
    setSubmittingAgenticAdjustment: jest.fn(),
    setSubmittingAgenticRejectReason: jest.fn(),
    setSubmittingCaseQuoteRejectReason: jest.fn(),
    submittingAgenticAdjustment: false,
    submittingAgenticRejectReason: false,
    submittingCaseQuoteRejectReason: false,
  } as any
  const conversation = {
    chat: {
      session: {
        id: 'session-a',
        service_type: 'electrical',
      },
    },
    setAssistantTurns: jest.fn(),
    setChat: jest.fn(),
    setError: jest.fn(),
    setLoading: jest.fn(),
    setLocalMode: jest.fn(),
    setTurns: jest.fn(),
    turns: [],
  } as any
  const workflow = {
    actions: {
      confirmRemoteSearch: jest.fn(async () => false),
      customerConfirmCompletion: jest.fn(),
      hydrateRemoteJobById: jest.fn(async () => false),
    },
  } as any
  const deal = {
    draft: { mediaCount: 0, serviceType: 'electrical' },
    estimate: { complexity: 'standard' },
    id: 'job-a',
    status: 'completed_by_worker',
  } as any
  const input = {
    chatEstimate: {
      complexity: 'standard',
      price_reasoning_receipt: { receipt_id: 'receipt_kael_price_20260811_01' },
    } as any,
    chatUi,
    conversation,
    deal,
    kaelRequestGuard: createCustomerKaelRequestGuard('customer-a:job-a'),
    language: 'vi' as const,
    mode: 'case' as const,
    pendingDraftOwnerId: 'customer-a',
    processController: {
      startBackendProcessLines: jest.fn(),
      startProcessLines: jest.fn(async () => undefined),
      stopProcessLines: jest.fn(),
      updateBackendProcessProgress: jest.fn(),
    } as any,
    router: { replace: jest.fn() } as any,
    sessionAccessToken: undefined as string | undefined,
    workflow,
  }
  return { chatUi, conversation, input, workflow }
}

describe('customer Kael decision concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConfirmEstimate.mockReset()
    mockSendKaelTurn.mockReset()
    mockDecideIntake.mockReset()
    mockProgressGet.mockReset()
  })

  it('shows backend progress as soon as the intake is confirmed and keeps it live until the response', async () => {
    const harness = decisionHarness()
    harness.conversation.chat.session.intake_confirmation = { blocking: false, status: 'pending' }
    harness.conversation.setComposerMediaDrafts = jest.fn()
    let resolveDecision: (value: unknown) => void = () => undefined
    mockDecideIntake.mockReturnValue(new Promise((resolve) => { resolveDecision = resolve }))
    const livePhase = { current_stage: 'vision_analysis', progress: 0.3, status: 'running', updated_at: 'now' }
    mockProgressGet.mockResolvedValue({ success: true, data: { session_id: 'session-a', progress: livePhase } })
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))

    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = result.current.confirmIntakeInformation() })

    const { processController } = harness.input
    expect(processController.startBackendProcessLines).toHaveBeenCalledTimes(1)
    expect(processController.updateBackendProcessProgress).toHaveBeenCalledWith(
      expect.objectContaining({ current_stage: 'intent_classification', status: 'queued' }),
    )
    await waitFor(() => {
      expect(processController.updateBackendProcessProgress).toHaveBeenCalledWith(livePhase)
    }, { timeout: 3000 })

    await act(async () => {
      resolveDecision({
        success: true,
        data: { session: { id: 'session-a', intake_confirmation: { status: 'confirmed' } }, turns: [] },
      })
      await pending
    })
    expect(harness.conversation.setChat).toHaveBeenCalled()
    expect(harness.conversation.setComposerMediaDrafts).toHaveBeenCalledWith([])
    expect(processController.stopProcessLines).toHaveBeenCalled()
    const callsAfterDone = mockProgressGet.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(mockProgressGet.mock.calls.length).toBe(callsAfterDone)
  })

  it('persists estimate adjustments through the Kael turn rail before clearing the draft', async () => {
    const detail = 'Nuoc chi ro khi xa bon; khi khong su dung thi khop noi kho.'
    const harness = decisionHarness(`  ${detail}  `)
    const response = {
      session: {
        case_phase: 'offer_review',
        id: 'session-a',
        service_type: 'electrical',
        status: 'estimate_ready',
      },
      turns: [{ id: 'turn-adjustment', role: 'customer', text_content: detail }],
    }
    mockSendKaelTurn.mockResolvedValueOnce({ data: response, success: true })
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))

    await act(async () => {
      await result.current.submitAgenticAdjustment()
    })

    expect(mockSendKaelTurn).toHaveBeenCalledWith('session-a', {
      language: 'vi',
      message: detail,
      photo_urls: [],
      turn_intent: 'scope_adjustment',
    })
    expect(harness.input.processController.startProcessLines).toHaveBeenCalledWith(detail, expect.objectContaining({
      mediaCount: 0,
      scenario: 'analysis_refinement',
    }))
    expect(harness.conversation.setChat).toHaveBeenCalledWith(response)
    expect(harness.conversation.setTurns).toHaveBeenCalledWith(response.turns)
    expect(harness.chatUi.setAgenticAdjustmentOpen).toHaveBeenLastCalledWith(false)
    expect(harness.chatUi.setAgenticAdjustmentText).toHaveBeenLastCalledWith('')
  })

  it('keeps an estimate adjustment available when the backend rejects it', async () => {
    const harness = decisionHarness('Can kiem tra them dau noi phia sau.')
    mockSendKaelTurn.mockResolvedValueOnce({
      error: { code: 'CONFLICT', message: 'not accepted' },
      success: false,
    })
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))

    await act(async () => {
      await result.current.submitAgenticAdjustment()
    })

    expect(harness.chatUi.setAgenticAdjustmentOpen).not.toHaveBeenCalled()
    expect(harness.chatUi.setAgenticAdjustmentText).not.toHaveBeenCalled()
    expect(harness.conversation.setError).toHaveBeenCalled()
  })

  it('starts only one estimate confirmation and releases the action after rejection', async () => {
    let rejectConfirm!: (reason?: unknown) => void
    mockConfirmEstimate.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectConfirm = reject
    }))
    const harness = decisionHarness()
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))
    let firstConfirm!: Promise<void>
    let secondConfirm!: Promise<void>

    act(() => {
      firstConfirm = result.current.confirmAgenticEstimate()
      secondConfirm = result.current.confirmAgenticEstimate()
    })

    await waitFor(() => expect(mockConfirmEstimate).toHaveBeenCalledTimes(1))
    await act(async () => {
      rejectConfirm(new Error('network unavailable'))
      await Promise.all([firstConfirm, secondConfirm])
    })
    expect(harness.conversation.setError).not.toHaveBeenCalledWith('Chưa thể hoàn tất lựa chọn này. Vui lòng thử lại.')
    expect(result.current.confirmationReconciling).toBe(true)
    expect(harness.chatUi.setConfirmingAgenticEstimate).toHaveBeenLastCalledWith(false)

    mockConfirmEstimate.mockResolvedValueOnce({ error: 'not confirmed', success: false })
    await act(async () => {
      await result.current.confirmAgenticEstimate()
    })
    expect(mockConfirmEstimate).toHaveBeenCalledTimes(2)
  })

  it('does not send a confirmation without the receipt rendered to the customer', async () => {
    const harness = decisionHarness()
    harness.input.chatEstimate = { complexity: 'standard' }
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))

    await act(async () => {
      await result.current.confirmAgenticEstimate()
    })

    expect(mockConfirmEstimate).not.toHaveBeenCalled()
    expect(harness.conversation.setError).toHaveBeenCalledWith(
      'Kael chưa có biên nhận phân tích giá hợp lệ cho đề nghị này.',
    )
  })

  it('continues to the matching job when optional hydration fails after confirmation', async () => {
    const harness = decisionHarness()
    mockConfirmEstimate.mockResolvedValueOnce({
      data: { job_id: 'job-confirmed' },
      success: true,
    })
    harness.workflow.actions.hydrateRemoteJobById.mockRejectedValueOnce(new Error('stale cache'))
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))

    await act(async () => {
      await result.current.confirmAgenticEstimate()
    })

    expect(harness.workflow.actions.hydrateRemoteJobById).toHaveBeenCalledWith('job-confirmed')
    expect(harness.conversation.setLocalMode).toHaveBeenCalledWith('case')
    expect(harness.input.router.replace).toHaveBeenCalledWith(
      '/(customer)/kael-chat?mode=case&jobId=job-confirmed',
    )
    expect(harness.conversation.setError).not.toHaveBeenCalledWith(
      'Chưa thể hoàn tất lựa chọn này. Vui lòng thử lại.',
    )
  })

  it.each([401, 403])('preserves confirmation identity when a manual retry receives an auth refusal (%s)', async (status) => {
    const harness = decisionHarness()
    mockConfirmEstimate.mockResolvedValueOnce({ success: false, status, code: 'AUTH_REQUIRED', error: '' })
    const view = renderHook(() => useCustomerKaelDecisionActions(harness.input))
    await act(async () => { await view.result.current.confirmAgenticEstimate() })
    expect(view.result.current.confirmationReconciling).toBe(true)
    expect(clearPendingConfirmation).not.toHaveBeenCalled()
    expect(writePendingConfirmation).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'confirm:test-idempotency-key' }))
    view.unmount()
  })

  it.each(['rfq', 'inspection_only'])('does not announce a sent request before durable storage succeeds (%s)', async (quoteMode) => {
    const harness = decisionHarness()
    harness.conversation.chat.session.quote_mode = quoteMode
    jest.mocked(getOrCreatePendingConfirmation).mockRejectedValueOnce(new Error('storage unavailable'))
    const view = renderHook(() => useCustomerKaelDecisionActions(harness.input))
    await act(async () => { await view.result.current.confirmAgenticEstimate() })
    expect(mockConfirmEstimate).not.toHaveBeenCalled()
    expect(harness.input.processController.startProcessLines).not.toHaveBeenCalledWith(
      expect.stringMatching(/^Đã gửi/), expect.anything(),
    )
    expect(harness.conversation.setError).toHaveBeenCalledWith(expect.stringContaining('Chưa gửi thêm yêu cầu mới'))
    view.unmount()
  })

  it.each([true, false])('retains recovery and opens the committed job when receipt cleanup fails (operation=%s)', async (hasOperation) => {
    const harness = decisionHarness()
    jest.mocked(clearPendingConfirmation).mockRejectedValueOnce(new Error('device storage unavailable'))
    mockConfirmEstimate.mockResolvedValueOnce({
      success: true,
      data: {
        session_id: 'session-a', job_id: 'job-confirmed',
        ...(hasOperation ? { operation: {
          session_id: 'session-a', job_id: 'job-confirmed', operation_id: 'operation-confirmed',
          idempotency_key: 'kael-confirm:session-a:customer-a', quote_mode: 'kael_auto_quote',
          state: 'stopped', terminal: true, support_code: 'A1B2C3D4', retry_after_ms: 0,
          accepted_at: '2026-09-05T01:00:00.000Z', updated_at: '2026-09-05T01:00:01.000Z',
        } } : {}),
      },
    })
    const view = renderHook(() => useCustomerKaelDecisionActions(harness.input))
    await act(async () => { await view.result.current.confirmAgenticEstimate() })

    expect(view.result.current.confirmationReconciling).toBe(true)
    expect(writePendingConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'customer-a', sessionId: 'session-a', idempotencyKey: 'confirm:test-idempotency-key',
    }))
    expect(harness.input.router.replace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job-confirmed')
    expect(harness.conversation.setError).not.toHaveBeenCalledWith(expect.stringContaining('Chưa có yêu cầu nào được gửi'))
    view.unmount()
  })

  it('confirms an estimate with the rendered customer session token', async () => {
    const harness = decisionHarness()
    harness.input.sessionAccessToken = 'customer-session-token'
    mockConfirmEstimate.mockResolvedValueOnce({
      data: { job_id: 'job-confirmed' },
      success: true,
    })
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))

    await act(async () => {
      await result.current.confirmAgenticEstimate()
    })

    expect(mockConfirmEstimate).toHaveBeenCalledWith(
      'session-a',
      {
        confirmation_kind: 'priced_offer',
        price_reasoning_receipt_id: 'receipt_kael_price_20260811_01',
        matching_mode: 'prompt_if_saved',
      },
      'customer-session-token',
      'confirm:test-idempotency-key',
    )
    expect(harness.workflow.actions.hydrateRemoteJobById).toHaveBeenCalledWith(
      'job-confirmed',
      'customer-session-token',
    )
  })

  it('serializes conflicting case decisions and releases the lane after rejection', async () => {
    let rejectCompletion!: (reason?: unknown) => void
    const harness = decisionHarness()
    harness.workflow.actions.customerConfirmCompletion.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectCompletion = reject
    }))
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))
    let completion!: Promise<void>
    let quote!: Promise<void>

    act(() => {
      completion = result.current.confirmCaseCompletion()
      quote = result.current.confirmCaseQuote()
    })

    expect(harness.workflow.actions.customerConfirmCompletion).toHaveBeenCalledTimes(1)
    expect(harness.workflow.actions.confirmRemoteSearch).not.toHaveBeenCalled()
    await act(async () => {
      rejectCompletion(new Error('network unavailable'))
      await Promise.all([completion, quote])
    })
    expect(harness.chatUi.setConfirmingCompletion).toHaveBeenLastCalledWith(false)

    await act(async () => {
      await result.current.confirmCaseQuote()
    })
    expect(harness.workflow.actions.confirmRemoteSearch).toHaveBeenCalledTimes(1)
    expect(harness.workflow.actions.confirmRemoteSearch).toHaveBeenLastCalledWith('job-a')
  })

  it('sends only one worker-search retry while the expired broadcast is being renewed', async () => {
    let resolveRetry!: (value: boolean) => void
    const harness = decisionHarness()
    harness.input.deal = {
      ...harness.input.deal,
      broadcast: { status: 'expired' },
      status: 'broadcasting',
    }
    harness.workflow.actions.confirmRemoteSearch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRetry = resolve
    }))
    const { result } = renderHook(() => useCustomerKaelDecisionActions(harness.input))
    let firstRetry!: Promise<void>
    let secondRetry!: Promise<void>

    act(() => {
      firstRetry = result.current.retryWorkerSearch()
      secondRetry = result.current.retryWorkerSearch()
    })

    expect(harness.workflow.actions.confirmRemoteSearch).toHaveBeenCalledTimes(1)
    expect(harness.workflow.actions.confirmRemoteSearch).toHaveBeenLastCalledWith('job-a')
    await act(async () => {
      resolveRetry(true)
      await Promise.all([firstRetry, secondRetry])
    })
    expect(harness.chatUi.setRetryingWorkerSearch).toHaveBeenLastCalledWith(false)
  })
})

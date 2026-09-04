import { act, renderHook, waitFor } from '@testing-library/react-native'

import { createCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'
import { useCustomerKaelDecisionActions } from '../kael-chat/use-customer-kael-decision-actions'

const mockConfirmEstimate = jest.fn()
const mockSendKaelTurn = jest.fn()

jest.mock('@/lib/services', () => ({
  kaelAssistantService: { ask: jest.fn() },
  kaelChatService: {
    confirm: (...args: unknown[]) => mockConfirmEstimate(...args),
    sendTurn: (...args: unknown[]) => mockSendKaelTurn(...args),
  },
}))

jest.mock('@/lib/frontend-workflow/confirmation-recovery', () => ({
  clearPendingConfirmation: jest.fn(async () => undefined),
  getOrCreatePendingConfirmation: jest.fn(async (sessionId: string) => ({
    idempotencyKey: 'confirm:test-idempotency-key',
    operation: null,
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
      hydrateRemoteJobById: jest.fn(),
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
    processController: {
      startProcessLines: jest.fn(async () => undefined),
      stopProcessLines: jest.fn(),
    } as any,
    router: { replace: jest.fn() } as any,
    sessionAccessToken: undefined as string | undefined,
    workflow,
  }
  return { chatUi, conversation, input, workflow }
}

describe('customer Kael decision concurrency', () => {
  beforeEach(() => {
    mockConfirmEstimate.mockReset()
    mockSendKaelTurn.mockReset()
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

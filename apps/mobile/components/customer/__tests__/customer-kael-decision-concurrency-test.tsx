import { act, renderHook } from '@testing-library/react-native'

import { createCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'
import { useCustomerKaelDecisionActions } from '../kael-chat/use-customer-kael-decision-actions'

const mockConfirmEstimate = jest.fn()

jest.mock('@/lib/services', () => ({
  kaelAssistantService: { ask: jest.fn() },
  kaelChatService: {
    confirm: (...args: unknown[]) => mockConfirmEstimate(...args),
    sendTurn: jest.fn(),
  },
}))

function decisionHarness() {
  const chatUi = {
    agenticRejectReason: '',
    caseQuoteRejectReason: '',
    confirmingAgenticEstimate: false,
    confirmingCaseQuote: false,
    confirmingCompletion: false,
    retryingWorkerSearch: false,
    setAgenticRejectOpen: jest.fn(),
    setAgenticRejectReason: jest.fn(),
    setCaseEditOpen: jest.fn(),
    setCaseQuoteRejectOpen: jest.fn(),
    setCaseQuoteRejectReason: jest.fn(),
    setConfirmingAgenticEstimate: jest.fn(),
    setConfirmingCaseQuote: jest.fn(),
    setConfirmingCompletion: jest.fn(),
    setRetryingWorkerSearch: jest.fn(),
    setSubmittingAgenticRejectReason: jest.fn(),
    setSubmittingCaseQuoteRejectReason: jest.fn(),
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
    chatEstimate: { complexity: 'standard' } as any,
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
    workflow,
  }
  return { chatUi, conversation, input, workflow }
}

describe('customer Kael decision concurrency', () => {
  beforeEach(() => {
    mockConfirmEstimate.mockReset()
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

    expect(mockConfirmEstimate).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectConfirm(new Error('network unavailable'))
      await Promise.all([firstConfirm, secondConfirm])
    })
    expect(harness.conversation.setError).toHaveBeenCalledWith('Chưa thể hoàn tất lựa chọn này. Vui lòng thử lại.')
    expect(harness.chatUi.setConfirmingAgenticEstimate).toHaveBeenLastCalledWith(false)

    mockConfirmEstimate.mockResolvedValueOnce({ error: 'not confirmed', success: false })
    await act(async () => {
      await result.current.confirmAgenticEstimate()
    })
    expect(mockConfirmEstimate).toHaveBeenCalledTimes(2)
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

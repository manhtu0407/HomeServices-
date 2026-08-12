import { act, renderHook } from '@testing-library/react-native'
import { createInitialLocalWorkflowState, type LocalWorkflowState } from '@nestscout/shared'

const mockSelectDirectWorkerPayment = jest.fn()

jest.mock('../services', () => ({
  jobService: {
    selectDirectWorkerPayment: (...args: unknown[]) => mockSelectDirectWorkerPayment(...args),
  },
}))

import { useCompletionPaymentActions } from '../frontend-workflow/use-completion-payment-actions'

function paymentPendingState(): LocalWorkflowState {
  return {
    ...createInitialLocalWorkflowState(),
    deal: {
      broadcast: null,
      id: 'job-direct-select',
    } as LocalWorkflowState['deal'],
  }
}

describe('useCompletionPaymentActions', () => {
  beforeEach(() => {
    mockSelectDirectWorkerPayment.mockReset()
  })

  it('preserves a safe direct-payment selection failure code for the workflow error mapper', async () => {
    mockSelectDirectWorkerPayment.mockResolvedValue({
      code: 'COLLATERAL_UNAVAILABLE',
      error: 'private provider detail 42',
      status: 409,
      success: false,
    })
    const dispatch = jest.fn()
    const refreshCurrentJob = jest.fn(async () => true)
    const setRemoteError = jest.fn((): false => false)
    const stateRef = { current: paymentPendingState() }
    const { result } = renderHook(() => useCompletionPaymentActions({
      dispatch,
      refreshCurrentJob,
      setRemoteError,
      stateRef,
    }))

    await act(async () => {
      await expect(result.current.selectDirectWorkerPayment()).resolves.toBe(false)
    })

    expect(setRemoteError).toHaveBeenCalledWith(
      'private provider detail 42',
      'COLLATERAL_UNAVAILABLE',
      'direct_payment_selection',
    )
    expect(refreshCurrentJob).not.toHaveBeenCalled()
  })
})

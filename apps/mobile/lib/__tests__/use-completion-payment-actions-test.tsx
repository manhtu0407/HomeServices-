import { act, renderHook } from '@testing-library/react-native'
import { createInitialLocalWorkflowState, type LocalWorkflowState } from '@nestscout/shared'

const mockClaimManualBankPayment = jest.fn()

jest.mock('../services', () => ({
  jobService: {
    claimManualBankPayment: (...args: unknown[]) => mockClaimManualBankPayment(...args),
  },
}))

import { useCompletionPaymentActions } from '../frontend-workflow/use-completion-payment-actions'

function paymentPendingState(): LocalWorkflowState {
  return {
    ...createInitialLocalWorkflowState(),
    deal: {
      broadcast: null,
      id: 'job-manual-bank-claim',
    } as LocalWorkflowState['deal'],
  }
}

describe('useCompletionPaymentActions', () => {
  beforeEach(() => {
    mockClaimManualBankPayment.mockReset()
  })

  it('keeps a failed manual-bank claim pending without refreshing to a false success', async () => {
    mockClaimManualBankPayment.mockResolvedValue({
      code: 'PAYMENT_CLAIM_FAILED',
      error: 'private provider detail 42',
      status: 409,
      success: false,
      meta: { supportCode: 'A1B2C3D4' },
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
      await expect(result.current.claimManualBankPayment('VCB')).resolves.toBe(false)
    })

    expect(mockClaimManualBankPayment).toHaveBeenCalledWith('job-manual-bank-claim', expect.objectContaining({
      sending_bank: 'VCB',
      transferred_at: expect.any(String),
    }))
    expect(setRemoteError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PAYMENT_CLAIM_FAILED',
      meta: { supportCode: 'A1B2C3D4' },
    }))
    expect(refreshCurrentJob).not.toHaveBeenCalled()
  })
})

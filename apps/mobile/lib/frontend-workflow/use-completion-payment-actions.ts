import { useCallback, type Dispatch, type RefObject } from 'react'
import type { LocalWorkflowAction, LocalWorkflowState, ReviewInput } from '@nestscout/shared'
import { jobService } from '../services'
import type { WorkflowErrorHandler } from './errors'
import { getRemoteJobId } from './helpers'

type CompletionPaymentActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  refreshCurrentJob: () => Promise<boolean>
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
}

export function useCompletionPaymentActions({
  dispatch,
  refreshCurrentJob,
  setRemoteError,
  stateRef,
}: CompletionPaymentActionsInput) {
  const customerConfirmCompletion = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận hoàn tất')
    const confirmed = await jobService.confirmCompletion(jobId)
    if (!confirmed.success) return setRemoteError(confirmed)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const createManualBankPaymentOrder = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để tạo lệnh thanh toán')
    const created = await jobService.createPaymentOrder(jobId)
    if (!created.success) return setRemoteError(created)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const claimManualBankPayment = useCallback(async (sendingBank?: string) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận chuyển khoản')
    const claimed = await jobService.claimManualBankPayment(jobId, {
      transferred_at: new Date().toISOString(),
      ...(sendingBank ? { sending_bank: sendingBank } : {}),
    })
    if (!claimed.success) return setRemoteError(claimed)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const submitReview = useCallback(async (input: Omit<ReviewInput, 'job_id'>) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đánh giá')
    const reviewed = await jobService.submitReview(jobId, input)
    if (!reviewed.success) return setRemoteError(reviewed)
    dispatch({ type: 'customer_submit_review' })
    await refreshCurrentJob()
    return true
  }, [dispatch, refreshCurrentJob, setRemoteError, stateRef])

  return {
    claimManualBankPayment,
    createManualBankPaymentOrder,
    customerConfirmCompletion,
    submitReview,
  }
}

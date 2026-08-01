import { useCallback, type Dispatch, type RefObject } from 'react'
import type { LocalWorkflowAction, LocalWorkflowState, ReviewInput } from '@nestscout/shared'
import { jobService } from '../services'
import { getRemoteJobId } from './helpers'

type CompletionPaymentActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  refreshCurrentJob: () => Promise<boolean>
  setRemoteError: (error: string) => false
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
    if (!confirmed.success) return setRemoteError(confirmed.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const createPaymentIntent = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để tạo thanh toán')
    const created = await jobService.createPaymentIntent(jobId)
    if (!created.success) return setRemoteError(created.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const confirmStagingPayment = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận thanh toán Staging')
    const confirmed = await jobService.confirmStagingPayment(jobId)
    if (!confirmed.success) return setRemoteError(confirmed.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const submitReview = useCallback(async (input: Omit<ReviewInput, 'job_id'>) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đánh giá')
    const reviewed = await jobService.submitReview(jobId, input)
    if (!reviewed.success) return setRemoteError(reviewed.error)
    dispatch({ type: 'customer_submit_review' })
    await refreshCurrentJob()
    return true
  }, [dispatch, refreshCurrentJob, setRemoteError, stateRef])

  return {
    confirmStagingPayment,
    createPaymentIntent,
    customerConfirmCompletion,
    submitReview,
  }
}

import { useCallback, type Dispatch, type RefObject } from 'react'
import type { LocalWorkflowAction, LocalWorkflowState, ReviewInput } from '@nestscout/shared'
import { jobService } from '../services'
import { generateClientRequestId } from '../client-request-id'
import type { WorkflowErrorContext } from './errors'
import { getRemoteJobId } from './helpers'

type CompletionPaymentActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  refreshCurrentJob: () => Promise<boolean>
  setRemoteError: (error: string, code?: string, context?: WorkflowErrorContext) => false
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

  const createManualBankPaymentOrder = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để tạo lệnh thanh toán')
    const created = await jobService.createPaymentOrder(jobId)
    if (!created.success) return setRemoteError(created.error)
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
    if (!claimed.success) return setRemoteError(claimed.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const selectDirectWorkerPayment = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để chọn thanh toán trực tiếp')
    const selected = await jobService.selectDirectWorkerPayment(jobId, {
      client_request_id: generateClientRequestId(),
    })
    if (!selected.success) return setRemoteError(selected.error, selected.code, 'direct_payment_selection')
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const respondToDirectWorkerPayment = useCallback(async (received: boolean) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận thanh toán trực tiếp')
    const responded = await jobService.respondToDirectWorkerPayment(jobId, { received })
    if (!responded.success) return setRemoteError(responded.error, responded.code, 'direct_payment_confirmation')
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, stateRef])

  const confirmStagingPayment = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận thanh toán')
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
    claimManualBankPayment,
    confirmStagingPayment,
    createManualBankPaymentOrder,
    createPaymentIntent,
    customerConfirmCompletion,
    respondToDirectWorkerPayment,
    selectDirectWorkerPayment,
    submitReview,
  }
}

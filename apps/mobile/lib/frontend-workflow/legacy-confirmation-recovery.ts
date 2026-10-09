import { confirmationOperationReceiptSchema } from '@nestscout/shared'
import type { ApiResult } from '../api'
import { kaelChatService } from '../services'

// A UI session ID is only a hint; fresh owned Backend data authorizes the recovery.
export async function recoverCustomerLegacyConfirmation(input: {
  sessionId: string; jobId: string; customerId: string; accessToken: string; current: () => boolean
}): Promise<ApiResult<unknown> | null> {
  const { sessionId, jobId, customerId, accessToken, current } = input
  const chat = await kaelChatService.get(sessionId, accessToken)
  if (!current()) return null
  if (!chat.success) return chat
  const session = chat.data.session
  const receiptId = session.estimate?.price_reasoning_receipt?.receipt_id
  if (session.id !== sessionId || session.job_id !== jobId || session.customer_id !== customerId || !receiptId) {
    return { success: false, code: 'MATCHING_RETRY_CONFIRMATION_UNAVAILABLE', error: '', status: 409 }
  }
  const result = await kaelChatService.recoverConfirmation(sessionId, {
    job_id: jobId, price_reasoning_receipt_id: receiptId,
  }, accessToken)
  if (!current()) return null
  if (!result.success) return result
  const receipt = confirmationOperationReceiptSchema.safeParse(result.data.operation)
  if (!receipt.success || receipt.data.job_id !== jobId || receipt.data.session_id !== sessionId
    || receipt.data.idempotency_key !== `kael-confirm:${sessionId}:${customerId}`) {
    return { success: false, code: 'LEGACY_RECOVERY_OUTCOME_UNKNOWN', error: '', status: 503, meta: result.meta }
  }
  return result
}

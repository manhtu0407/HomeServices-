import { confirmationOperationReceiptSchema, type ConfirmationOperationReceipt, type LegacyConfirmationRecoveryInput } from '@nestscout/shared'
import { api, type ApiResult } from '../api'

export async function recoverLegacyConfirmation(
  sessionId: string, input: LegacyConfirmationRecoveryInput, accessToken: string,
): Promise<ApiResult<{ operation: ConfirmationOperationReceipt }>> {
  const result = await api.postAuthenticated<{ operation: ConfirmationOperationReceipt }>(
    `/kael/chat/${encodeURIComponent(sessionId)}/recover-confirmation`, input, accessToken,
  )
  if (!result.success) return result
  const parsed = confirmationOperationReceiptSchema.safeParse(result.data?.operation)
  if (!parsed.success || parsed.data.session_id !== sessionId || parsed.data.job_id !== input.job_id) {
    return { success: false, code: 'LEGACY_RECOVERY_OUTCOME_UNKNOWN', error: '', status: result.status, meta: result.meta }
  }
  return { ...result, data: { operation: parsed.data } }
}

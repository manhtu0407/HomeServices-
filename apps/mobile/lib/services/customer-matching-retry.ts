import { matchingOperationSnapshotSchema, matchingRetryReceiptSchema, type MatchingRetryReceipt, type MatchingRetryRequest } from '@nestscout/shared'
import { api, type ApiResult } from '../api'

export const customerMatchingRetryService = {
  confirmSearch(jobId: string, input: MatchingRetryRequest, accessToken: string) {
    return api.postAuthenticated<{ operation: MatchingRetryReceipt }>(
      `/jobs/${encodeURIComponent(jobId)}/confirm-search`, input, accessToken,
    )
  },
  getMatchingRetry(jobId: string, requestId: string, accessToken: string) {
    return api.getAuthenticated<{ operation: MatchingRetryReceipt }>(
      `/jobs/${encodeURIComponent(jobId)}/matching-retries/${encodeURIComponent(requestId)}`, accessToken,
    )
  },
  async getMatchingOperation(jobId: string, accessToken: string) {
    const result = await api.getAuthenticated<{
      job_id: string
      operation: unknown
    }>(`/jobs/${encodeURIComponent(jobId)}/matching-operation`, accessToken)
    if (!result.success) return result
    const parsed = matchingOperationSnapshotSchema.nullable().safeParse(result.data.operation)
    if (result.data.job_id !== jobId || !parsed.success) return invalidMatchingResponse(result)
    return { ...result, data: { job_id: jobId, operation: parsed.data } }
  },
}

// Check both shape and identity before a successful HTTP envelope can affect UI/storage.
export function validateMatchingRetryResult(
  result: ApiResult<{ operation: MatchingRetryReceipt }>,
  jobId: string,
  request: MatchingRetryRequest,
): ApiResult<{ operation: MatchingRetryReceipt }> {
  if (!result.success) return result
  const parsed = matchingRetryReceiptSchema.safeParse(result.data?.operation)
  if (!parsed.success || parsed.data.job_id !== jobId
    || parsed.data.request_id !== request.client_request_id
    || parsed.data.parent_operation_id !== request.expected_matching_operation_id) {
    return invalidMatchingResponse(result)
  }
  return { ...result, data: { operation: parsed.data } }
}

function invalidMatchingResponse(result: Pick<ApiResult<unknown>, 'status' | 'meta'>): ApiResult<never> {
  return { success: false, code: 'INVALID_RESPONSE', error: '', status: result.status, meta: result.meta }
}

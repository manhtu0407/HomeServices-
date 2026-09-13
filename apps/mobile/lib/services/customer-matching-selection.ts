import { matchingSelectionReceiptSchema, type JobMatchingPreferenceInput, type MatchingSelectionReceipt } from '@nestscout/shared'
import { api, type ApiResult } from '../api'
import type { MatchingPreferenceResponse } from '../api-types'

export const customerMatchingSelectionService = {
  setMatchingPreference(jobId: string, input: JobMatchingPreferenceInput, accessToken: string) {
    return api.postAuthenticated<MatchingPreferenceResponse>(
      `/jobs/${encodeURIComponent(jobId)}/matching-preference`, input, accessToken,
    )
  },
  getMatchingPreferenceReceipt(jobId: string, requestId: string, accessToken: string) {
    return api.getAuthenticated<{ selection: MatchingSelectionReceipt }>(
      `/jobs/${encodeURIComponent(jobId)}/matching-preference/${encodeURIComponent(requestId)}`, accessToken,
    )
  },
}

export function validateMatchingSelectionResult(
  result: ApiResult<{ selection?: unknown }>, jobId: string, request: JobMatchingPreferenceInput,
): ApiResult<{ selection: MatchingSelectionReceipt }> {
  if (!result.success) return result
  const parsed = matchingSelectionReceiptSchema.safeParse(result.data?.selection)
  if (!parsed.success || parsed.data.job_id !== jobId || parsed.data.request_id !== request.client_request_id
    || parsed.data.mode !== request.mode || parsed.data.preferred_worker_id !== (request.worker_id ?? null)
    || parsed.data.auto_general !== request.auto_general) {
    return { success: false, code: 'INVALID_RESPONSE', error: '', status: result.status, meta: result.meta }
  }
  return { ...result, data: { selection: parsed.data } }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@home-services/shared'
import type { AIProvider } from '@/lib/ai/types'

export type ApiCallLog = {
  jobId: string | null
  /**
   * Correlation ID for one HTTP request. All AI calls in a single pipeline run
   * share the same request_id, so a debugger can SELECT * FROM api_logs WHERE
   * request_id = X to see every provider call for a single user request.
   */
  requestId?: string | null
  purpose: string
  provider: AIProvider
  model: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  latencyMs?: number
  success: boolean
  errorCode?: string
}

function toRow(log: ApiCallLog) {
  return {
    job_id: log.jobId,
    request_id: log.requestId ?? null,
    purpose: log.purpose,
    provider: log.provider,
    model: log.model,
    input_tokens: log.inputTokens ?? null,
    output_tokens: log.outputTokens ?? null,
    cost_usd: log.costUsd ?? null,
    latency_ms: log.latencyMs ?? null,
    success: log.success,
    error_code: log.errorCode ?? null,
  }
}

/**
 * Batch insert variant - sends all logs in a single round trip.
 *
 * Use when a pipeline produces multiple log entries (e.g. one HTTP request
 * yields 3 AI provider calls). Cuts DB round trips proportionally.
 */
export async function logApiCalls(
  supabase: SupabaseClient<Database>,
  logs: ApiCallLog[],
): Promise<void> {
  if (logs.length === 0) return
  try {
    await supabase.from('api_logs').insert(logs.map(toRow))
  } catch {
    console.warn('Failed to persist api_log batch', {
      count: logs.length,
    })
  }
}

/**
 * Generate a request correlation ID. Used at the top of route handlers that
 * trigger pipelines; passed through to logApiCalls so all rows for one user
 * request share the same id.
 */
export function generateRequestId(): string {
  return crypto.randomUUID()
}

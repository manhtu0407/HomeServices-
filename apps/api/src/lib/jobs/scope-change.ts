import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, WorkerScopeChangeInput, ScopeChangeStatus } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'

export type RequestScopeChangeResult =
  | {
      success: true
      scopeChangeId: string
      jobId: string
      status: ScopeChangeStatus
      createdAt: string
    }
  | { success: false; error: string; code: string; status: number }

export type DecideScopeChangeResult =
  | {
      success: true
      scopeChangeId: string
      jobId: string
      status: ScopeChangeStatus
      decidedAt: string
    }
  | { success: false; error: string; code: string; status: number }

/**
 * Map RPC error codes to HTTP response shapes.
 */
function mapRequestError(errorCode: string | null): {
  success: false
  error: string
  code: string
  status: number
} {
  switch (errorCode) {
    case 'NOT_FOUND':
      return { success: false, error: 'Không tìm thấy yêu cầu', code: 'NOT_FOUND', status: 404 }
    case 'AUTH_FORBIDDEN':
      return {
        success: false,
        error: 'Bạn không có quyền thực hiện hành động này',
        code: 'AUTH_FORBIDDEN',
        status: 403,
      }
    case 'INVALID_STATUS':
      return {
        success: false,
        error: 'Trạng thái yêu cầu không hợp lệ',
        code: 'INVALID_STATUS',
        status: 409,
      }
    case 'INVALID_PRICE_RANGE':
      return {
        success: false,
        error: 'Khoảng giá không hợp lệ',
        code: 'VALIDATION',
        status: 400,
      }
    default:
      return { success: false, error: 'Không thể tạo yêu cầu thay đổi', code: 'DB_ERROR', status: 500 }
  }
}

function mapDecideError(errorCode: string | null): {
  success: false
  error: string
  code: string
  status: number
} {
  switch (errorCode) {
    case 'NOT_FOUND':
      return { success: false, error: 'Không tìm thấy yêu cầu thay đổi', code: 'NOT_FOUND', status: 404 }
    case 'ALREADY_DECIDED':
      return {
        success: false,
        error: 'Yêu cầu này đã được xử lý',
        code: 'ALREADY_DECIDED',
        status: 409,
      }
    case 'INVALID_STATUS':
      return {
        success: false,
        error: 'Trạng thái yêu cầu không hợp lệ',
        code: 'INVALID_STATUS',
        status: 409,
      }
    case 'INVALID_DECISION':
      return {
        success: false,
        error: 'Quyết định không hợp lệ',
        code: 'VALIDATION',
        status: 400,
      }
    default:
      return { success: false, error: 'Không thể cập nhật quyết định', code: 'DB_ERROR', status: 500 }
  }
}

/**
 * B6 — Worker requests scope change via `request_scope_change_atomic` RPC.
 *
 * The PG function atomically:
 *   - Inserts the scope_change_requests row
 *   - Transitions job to 'scope_change_pending' with mirrored price fields
 *
 * Replaces a 2-write non-atomic flow that could leave orphan scope_change rows.
 */
export async function requestScopeChange(
  supabase: SupabaseClient<Database>,
  jobId: string,
  workerId: string,
  input: WorkerScopeChangeInput,
): Promise<RequestScopeChangeResult> {
  const { data, error } = await withDbTimeout(
    supabase.rpc('request_scope_change_atomic', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_new_description: input.new_description,
      p_new_price_min: input.new_price_min,
      p_new_price_max: input.new_price_max,
      p_reason: input.reason,
    }),
  )

  if (error) {
    console.warn('requestScopeChange: RPC call failed', { jobId, workerId, errorCode: error.code })
    return { success: false, error: 'Không thể tạo yêu cầu thay đổi', code: 'DB_ERROR', status: 500 }
  }

  const row = data?.[0]
  if (!row) {
    return { success: false, error: 'Không thể tạo yêu cầu thay đổi', code: 'DB_ERROR', status: 500 }
  }

  if (!row.ok) {
    return mapRequestError(row.error_code)
  }

  return {
    success: true,
    scopeChangeId: row.scope_change_id!,
    jobId,
    status: row.scope_status as ScopeChangeStatus,
    createdAt: row.created_at_ts!,
  }
}

/**
 * A11 — Customer decides on scope change via `decide_scope_change_atomic` RPC.
 *
 * The PG function atomically:
 *   - Updates scope_change_requests.status to approved_by_customer / rejected_by_customer
 *   - Transitions job.status back to 'repairing' with decision text
 *
 * Both approve and reject return job to 'repairing' so worker can continue
 * (with new scope on approve, original on reject). Per RULES.md #7, customer
 * MUST tap explicitly — no auto-decision.
 */
export async function decideScopeChange(
  supabase: SupabaseClient<Database>,
  scopeChangeId: string,
  customerId: string,
  decision: 'approve' | 'reject',
): Promise<DecideScopeChangeResult> {
  const { data, error } = await withDbTimeout(
    supabase.rpc('decide_scope_change_atomic', {
      p_scope_change_id: scopeChangeId,
      p_customer_id: customerId,
      p_decision: decision,
    }),
  )

  if (error) {
    console.warn('decideScopeChange: RPC call failed', { scopeChangeId, errorCode: error.code })
    return { success: false, error: 'Không thể cập nhật quyết định', code: 'DB_ERROR', status: 500 }
  }

  const row = data?.[0]
  if (!row) {
    return { success: false, error: 'Không thể cập nhật quyết định', code: 'DB_ERROR', status: 500 }
  }

  if (!row.ok) {
    return mapDecideError(row.error_code)
  }

  return {
    success: true,
    scopeChangeId,
    jobId: row.job_id_out!,
    status: row.scope_status as ScopeChangeStatus,
    decidedAt: row.decided_at_ts!,
  }
}

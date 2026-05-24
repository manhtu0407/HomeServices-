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
    case 'KAEL_PRICE_MISSING':
      return {
        success: false,
        error: 'Kael chưa có giá phát sinh hợp lệ để chốt yêu cầu',
        code: 'KAEL_PRICE_MISSING',
        status: 409,
      }
    default:
      return { success: false, error: 'Không thể cập nhật quyết định', code: 'DB_ERROR', status: 500 }
  }
}

/**
 * B6 scope-change requests are Edge-only.
 *
 * The Edge mobile-api computes and persists Kael's estimate before notifying
 * the customer. Keeping this Next reference path open would call a stale RPC
 * signature without Kael fields.
 */
export async function requestScopeChange(
  _supabase: SupabaseClient<Database>,
  _jobId: string,
  _workerId: string,
  _input: WorkerScopeChangeInput,
): Promise<RequestScopeChangeResult> {
  return {
    success: false,
    error: 'Yêu cầu thay đổi phạm vi phải đi qua Edge mobile-api để Kael tính và lưu giá trước khi thông báo khách.',
    code: 'EDGE_MOBILE_API_REQUIRED',
    status: 501,
  }
}

/**
 * A11 — Customer decides on scope change via `decide_scope_change_atomic` RPC.
 *
 * The PG function atomically:
 *   - Updates scope_change_requests.status to approved_by_customer / rejected_by_customer
 *   - Approve transitions job.status back to 'repairing' with decision text
 *   - Reject transitions the job to 'cancelled' to stop changed work
 *
 * Per RULES.md #7, customer MUST tap explicitly — no auto-decision.
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

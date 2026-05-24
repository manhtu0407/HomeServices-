import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: <T,>(p: PromiseLike<T>) => p,
  DbTimeoutError: class extends Error {},
}))

import { requestScopeChange, decideScopeChange } from '@/lib/jobs/scope-change'

// Phase 2.0 (2026-05-23): worker không gửi price; Kael compute từ context.
const VALID_INPUT = {
  new_description: 'Phát hiện ống chính bị hỏng, cần thay đoạn lớn hơn',
  reason: 'On-site inspection cho thấy vấn đề nghiêm trọng hơn',
  photo_urls: [],
}

// =============================================================================
// requestScopeChange (B6) — RPC-based
// =============================================================================

type RequestRpcRow = {
  ok: boolean
  error_code: string | null
  scope_change_id: string | null
  scope_status: string | null
  created_at_ts: string | null
}

function makeRequestRpcSupabase(rpcResult: RequestRpcRow | null, rpcError: { code: string } | null = null) {
  return {
    rpc: vi.fn(async (_fnName: string, _args: unknown) => ({
      data: rpcResult ? [rpcResult] : null,
      error: rpcError,
    })),
  } as any
}

describe('requestScopeChange (RPC-based)', () => {
  it('succeeds when RPC returns ok=true', async () => {
    const supabase = makeRequestRpcSupabase({
      ok: true,
      error_code: null,
      scope_change_id: 'sc-1',
      scope_status: 'waiting_customer_decision',
      created_at_ts: '2026-05-16T10:00:00Z',
    })

    const result = await requestScopeChange(supabase, 'job-1', 'worker-1', VALID_INPUT)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.scopeChangeId).toBe('sc-1')
      expect(result.status).toBe('waiting_customer_decision')
    }
  })

  it('passes all input fields to RPC', async () => {
    const supabase = makeRequestRpcSupabase({
      ok: true,
      error_code: null,
      scope_change_id: 'sc-1',
      scope_status: 'waiting_customer_decision',
      created_at_ts: '2026-05-16T10:00:00Z',
    })
    await requestScopeChange(supabase, 'job-1', 'worker-1', VALID_INPUT)
    expect(supabase.rpc).toHaveBeenCalledWith('request_scope_change_atomic', {
      p_job_id: 'job-1',
      p_worker_id: 'worker-1',
      p_new_description: VALID_INPUT.new_description,
      p_reason: VALID_INPUT.reason,
    })
  })

  it('maps NOT_FOUND → 404', async () => {
    const supabase = makeRequestRpcSupabase({
      ok: false,
      error_code: 'NOT_FOUND',
      scope_change_id: null,
      scope_status: null,
      created_at_ts: null,
    })
    const result = await requestScopeChange(supabase, 'job-x', 'worker-1', VALID_INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
  })

  it('maps AUTH_FORBIDDEN → 403 (worker not assigned to job)', async () => {
    const supabase = makeRequestRpcSupabase({
      ok: false,
      error_code: 'AUTH_FORBIDDEN',
      scope_change_id: null,
      scope_status: null,
      created_at_ts: null,
    })
    const result = await requestScopeChange(supabase, 'job-1', 'worker-1', VALID_INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH_FORBIDDEN')
  })

  it('maps INVALID_STATUS → 409 (job not in inspecting/repairing)', async () => {
    const supabase = makeRequestRpcSupabase({
      ok: false,
      error_code: 'INVALID_STATUS',
      scope_change_id: null,
      scope_status: null,
      created_at_ts: null,
    })
    const result = await requestScopeChange(supabase, 'job-1', 'worker-1', VALID_INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('INVALID_STATUS')
  })

  it('returns DB_ERROR on RPC failure', async () => {
    const supabase = makeRequestRpcSupabase(null, { code: 'PGRST500' })
    const result = await requestScopeChange(supabase, 'job-1', 'worker-1', VALID_INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('DB_ERROR')
  })
})

// =============================================================================
// decideScopeChange (A11) — RPC-based
// =============================================================================

type DecideRpcRow = {
  ok: boolean
  error_code: string | null
  job_id_out: string | null
  scope_status: string | null
  decided_at_ts: string | null
}

function makeDecideRpcSupabase(rpcResult: DecideRpcRow | null, rpcError: { code: string } | null = null) {
  return {
    rpc: vi.fn(async (_fnName: string, _args: unknown) => ({
      data: rpcResult ? [rpcResult] : null,
      error: rpcError,
    })),
  } as any
}

describe('decideScopeChange (RPC-based)', () => {
  it('approves valid scope change', async () => {
    const supabase = makeDecideRpcSupabase({
      ok: true,
      error_code: null,
      job_id_out: 'job-1',
      scope_status: 'approved_by_customer',
      decided_at_ts: '2026-05-16T10:00:00Z',
    })

    const result = await decideScopeChange(supabase, 'sc-1', 'cust-1', 'approve')
    expect(result.success).toBe(true)
    if (result.success) expect(result.status).toBe('approved_by_customer')
  })

  it('rejects valid scope change', async () => {
    const supabase = makeDecideRpcSupabase({
      ok: true,
      error_code: null,
      job_id_out: 'job-1',
      scope_status: 'rejected_by_customer',
      decided_at_ts: '2026-05-16T10:00:00Z',
    })

    const result = await decideScopeChange(supabase, 'sc-1', 'cust-1', 'reject')
    expect(result.success).toBe(true)
    if (result.success) expect(result.status).toBe('rejected_by_customer')
  })

  it('passes decision to RPC', async () => {
    const supabase = makeDecideRpcSupabase({
      ok: true,
      error_code: null,
      job_id_out: 'job-1',
      scope_status: 'approved_by_customer',
      decided_at_ts: '2026-05-16T10:00:00Z',
    })
    await decideScopeChange(supabase, 'sc-1', 'cust-1', 'approve')
    expect(supabase.rpc).toHaveBeenCalledWith('decide_scope_change_atomic', {
      p_scope_change_id: 'sc-1',
      p_customer_id: 'cust-1',
      p_decision: 'approve',
    })
  })

  it('maps NOT_FOUND (wrong customer or missing scope) → 404', async () => {
    const supabase = makeDecideRpcSupabase({
      ok: false,
      error_code: 'NOT_FOUND',
      job_id_out: null,
      scope_status: null,
      decided_at_ts: null,
    })
    const result = await decideScopeChange(supabase, 'sc-x', 'cust-1', 'approve')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
  })

  it('maps ALREADY_DECIDED → 409', async () => {
    const supabase = makeDecideRpcSupabase({
      ok: false,
      error_code: 'ALREADY_DECIDED',
      job_id_out: null,
      scope_status: null,
      decided_at_ts: null,
    })
    const result = await decideScopeChange(supabase, 'sc-1', 'cust-1', 'approve')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ALREADY_DECIDED')
  })

  it('maps INVALID_STATUS → 409', async () => {
    const supabase = makeDecideRpcSupabase({
      ok: false,
      error_code: 'INVALID_STATUS',
      job_id_out: null,
      scope_status: null,
      decided_at_ts: null,
    })
    const result = await decideScopeChange(supabase, 'sc-1', 'cust-1', 'approve')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('INVALID_STATUS')
  })

  it('returns DB_ERROR on RPC failure', async () => {
    const supabase = makeDecideRpcSupabase(null, { code: 'PGRST500' })
    const result = await decideScopeChange(supabase, 'sc-1', 'cust-1', 'approve')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('DB_ERROR')
  })
})

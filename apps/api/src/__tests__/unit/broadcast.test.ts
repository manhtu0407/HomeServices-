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

import {
  createBroadcasts,
  queryEligibleWorkers,
  secondsRemaining,
  DEFAULT_BROADCAST_EXPIRY_SEC,
  DEFAULT_BROADCAST_BATCH_SIZE,
} from '@/lib/jobs/broadcast'
import { acceptBroadcast, declineBroadcast } from '@/lib/jobs/accept-broadcast'

// =============================================================================
// secondsRemaining — pure utility
// =============================================================================

describe('secondsRemaining', () => {
  it('returns positive seconds for future expires_at', () => {
    const now = new Date('2026-05-16T10:00:00Z')
    const future = new Date('2026-05-16T10:00:45Z').toISOString()
    expect(secondsRemaining(future, now)).toBe(45)
  })

  it('returns 0 for past expires_at', () => {
    const now = new Date('2026-05-16T10:00:00Z')
    const past = new Date('2026-05-16T09:59:30Z').toISOString()
    expect(secondsRemaining(past, now)).toBe(0)
  })

  it('returns 0 exactly at expiry', () => {
    const now = new Date('2026-05-16T10:00:00Z')
    expect(secondsRemaining(now.toISOString(), now)).toBe(0)
  })

  it('returns null for null input', () => {
    expect(secondsRemaining(null)).toBeNull()
  })

  it('default batch size = 5', () => {
    expect(DEFAULT_BROADCAST_BATCH_SIZE).toBe(5)
  })

  it('default expiry = 60 seconds (STRUCTURES B2)', () => {
    expect(DEFAULT_BROADCAST_EXPIRY_SEC).toBe(60)
  })
})

// =============================================================================
// createBroadcasts — module logic
// =============================================================================

function makeBroadcastSupabase(opts: {
  eligibleWorkers?: Array<{ id: string; rating: number; total_jobs: number; service_types: string[]; districts: string[] }>
  workerQueryError?: { code: string }
  insertError?: { code: string }
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'worker_profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          contains: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: opts.eligibleWorkers ?? [],
            error: opts.workerQueryError ?? null,
          }),
        }
      }
      if (table === 'job_broadcasts') {
        return {
          insert: vi.fn().mockResolvedValue({ error: opts.insertError ?? null }),
        }
      }
      return {}
    }),
  } as any
}

describe('queryEligibleWorkers', () => {
  it('returns workers ordered by rating', async () => {
    const supabase = makeBroadcastSupabase({
      eligibleWorkers: [
        { id: 'w1', rating: 4.9, total_jobs: 100, service_types: ['electrical'], districts: ['Q1'] },
        { id: 'w2', rating: 4.7, total_jobs: 80, service_types: ['electrical'], districts: ['Q1'] },
      ],
    })

    const workers = await queryEligibleWorkers(supabase, 'electrical', 'Q1')
    expect(workers).toHaveLength(2)
    expect(workers[0].id).toBe('w1')
    expect(workers[0].rating).toBe(4.9)
  })

  it('returns empty array when query errors', async () => {
    const supabase = makeBroadcastSupabase({ workerQueryError: { code: 'PGRST500' } })
    const workers = await queryEligibleWorkers(supabase, 'electrical', 'Q1')
    expect(workers).toEqual([])
  })

  it('returns empty array when no eligible workers', async () => {
    const supabase = makeBroadcastSupabase({ eligibleWorkers: [] })
    const workers = await queryEligibleWorkers(supabase, 'plumbing', 'Q99')
    expect(workers).toEqual([])
  })
})

describe('createBroadcasts', () => {
  it('returns failure when no eligible workers', async () => {
    const supabase = makeBroadcastSupabase({ eligibleWorkers: [] })
    const result = await createBroadcasts(supabase, 'job-1', 'electrical', 'Q1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toContain('Không tìm thấy thợ')
    }
  })

  it('creates broadcasts for eligible workers and returns batch info', async () => {
    const supabase = makeBroadcastSupabase({
      eligibleWorkers: [
        { id: 'w1', rating: 4.9, total_jobs: 100, service_types: ['electrical'], districts: ['Q1'] },
        { id: 'w2', rating: 4.8, total_jobs: 90, service_types: ['electrical'], districts: ['Q1'] },
      ],
    })

    const result = await createBroadcasts(supabase, 'job-1', 'electrical', 'Q1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.broadcastCount).toBe(2)
      expect(result.workerIds).toEqual(['w1', 'w2'])
      expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it('returns DB error when insert fails', async () => {
    const supabase = makeBroadcastSupabase({
      eligibleWorkers: [{ id: 'w1', rating: 4.9, total_jobs: 100, service_types: ['electrical'], districts: ['Q1'] }],
      insertError: { code: 'PGRST500' },
    })

    const result = await createBroadcasts(supabase, 'job-1', 'electrical', 'Q1')
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// acceptBroadcast — Tier 3 RPC-based atomic accept
// =============================================================================

type AcceptRpcRow = {
  ok: boolean
  error_code: string | null
  job_status: string | null
  address_building: string | null
  address_unit: string | null
  address_floor: string | null
  address_district: string | null
}

/**
 * Build a mock Supabase client where `.rpc('accept_broadcast_atomic', ...)`
 * returns the given row. Also records job_events.insert calls so we can
 * assert observability events (e.g. broadcast_expired log).
 */
function makeAcceptRpcSupabase(opts: {
  rpcResult?: AcceptRpcRow | null
  rpcError?: { code: string }
}) {
  const eventLogs: Array<{ event_type: string; metadata: unknown }> = []
  const supabase = {
    rpc: vi.fn(async (_fnName: string, _args: unknown) => ({
      data: opts.rpcResult ? [opts.rpcResult] : null,
      error: opts.rpcError ?? null,
    })),
    from: vi.fn((table: string) => {
      if (table === 'job_events') {
        return {
          insert: vi.fn(async (row: { event_type: string; safe_metadata: unknown }) => {
            eventLogs.push({ event_type: row.event_type, metadata: row.safe_metadata })
            return { error: null }
          }),
        }
      }
      return {}
    }),
  } as any
  return { supabase, eventLogs }
}

describe('acceptBroadcast (RPC-based)', () => {
  it('succeeds when RPC returns ok=true with full address', async () => {
    const { supabase } = makeAcceptRpcSupabase({
      rpcResult: {
        ok: true,
        error_code: null,
        job_status: 'worker_matched',
        address_building: 'Vinhomes',
        address_unit: 'A101',
        address_floor: '5',
        address_district: 'q1',
      },
    })

    const result = await acceptBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.status).toBe('worker_matched')
      expect(result.fullAddress.building).toBe('Vinhomes')
      expect(result.fullAddress.unit).toBe('A101')
    }
  })

  it('calls RPC with correct params', async () => {
    const { supabase } = makeAcceptRpcSupabase({
      rpcResult: {
        ok: true,
        error_code: null,
        job_status: 'worker_matched',
        address_building: null,
        address_unit: null,
        address_floor: null,
        address_district: null,
      },
    })
    await acceptBroadcast(supabase, 'job-42', 'worker-99')
    expect(supabase.rpc).toHaveBeenCalledWith('accept_broadcast_atomic', {
      p_job_id: 'job-42',
      p_worker_id: 'worker-99',
    })
  })

  it('maps NOT_FOUND error_code → 404', async () => {
    const { supabase } = makeAcceptRpcSupabase({
      rpcResult: {
        ok: false,
        error_code: 'NOT_FOUND',
        job_status: null,
        address_building: null,
        address_unit: null,
        address_floor: null,
        address_district: null,
      },
    })
    const result = await acceptBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
      expect(result.status).toBe(404)
    }
  })

  it('maps BROADCAST_NOT_ACTIVE → 409', async () => {
    const { supabase } = makeAcceptRpcSupabase({
      rpcResult: {
        ok: false,
        error_code: 'BROADCAST_NOT_ACTIVE',
        job_status: null,
        address_building: null,
        address_unit: null,
        address_floor: null,
        address_district: null,
      },
    })
    const result = await acceptBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('BROADCAST_NOT_ACTIVE')
      expect(result.status).toBe(409)
    }
  })

  it('maps EXPIRED → 410 + logs broadcast_expired event', async () => {
    const { supabase, eventLogs } = makeAcceptRpcSupabase({
      rpcResult: {
        ok: false,
        error_code: 'EXPIRED',
        job_status: null,
        address_building: null,
        address_unit: null,
        address_floor: null,
        address_district: null,
      },
    })
    const result = await acceptBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('EXPIRED')
      expect(result.status).toBe(410)
    }
    const expiredEvent = eventLogs.find((e) => e.event_type === 'broadcast_expired')
    expect(expiredEvent).toBeDefined()
  })

  it('maps ALREADY_TAKEN → 409 (race condition: another worker won)', async () => {
    const { supabase } = makeAcceptRpcSupabase({
      rpcResult: {
        ok: false,
        error_code: 'ALREADY_TAKEN',
        job_status: null,
        address_building: null,
        address_unit: null,
        address_floor: null,
        address_district: null,
      },
    })
    const result = await acceptBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_TAKEN')
      expect(result.status).toBe(409)
    }
  })

  it('returns DB_ERROR when RPC itself fails', async () => {
    const { supabase } = makeAcceptRpcSupabase({
      rpcError: { code: 'PGRST500' },
    })
    const result = await acceptBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DB_ERROR')
      expect(result.status).toBe(500)
    }
  })

  it('returns DB_ERROR when RPC returns no row (defensive)', async () => {
    const { supabase } = makeAcceptRpcSupabase({ rpcResult: null })
    const result = await acceptBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DB_ERROR')
    }
  })
})

// =============================================================================
// declineBroadcast
// =============================================================================

type DeclineBroadcastRow = { id: string; status: string; expires_at: string | null; batch_id: string }

describe('declineBroadcast', () => {
  function makeDeclineSupabase(opts: { broadcast?: DeclineBroadcastRow | null; updateError?: { code: string } }) {
    let isSelect = true
    return {
      from: vi.fn(() => {
        if (isSelect) {
          isSelect = false
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: opts.broadcast ?? null, error: null }),
          }
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
        }
      }),
    } as any
  }

  const FUTURE = new Date(Date.now() + 30_000).toISOString()

  it('succeeds for active broadcast', async () => {
    const supabase = makeDeclineSupabase({
      broadcast: { id: 'b1', status: 'sent', expires_at: FUTURE, batch_id: 'batch-1' },
    })
    const result = await declineBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(true)
  })

  it('rejects when broadcast not found', async () => {
    const supabase = makeDeclineSupabase({ broadcast: null })
    const result = await declineBroadcast(supabase, 'job-1', 'worker-x')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('rejects when broadcast not in sent state', async () => {
    const supabase = makeDeclineSupabase({
      broadcast: { id: 'b1', status: 'accepted', expires_at: FUTURE, batch_id: 'batch-1' },
    })
    const result = await declineBroadcast(supabase, 'job-1', 'worker-1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('BROADCAST_NOT_ACTIVE')
    }
  })
})

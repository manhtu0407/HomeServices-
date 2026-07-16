/**
 * Route-level security negative tests (E12).
 *
 * Focus: verify the auth layer + ownership checks reject wrong-role and
 * wrong-owner requests at the route boundary. Complements api-auth.test.ts
 * which tests the middleware in isolation.
 *
 * Pattern: mock authenticateRequest to return controlled auth outcomes,
 * then invoke the real route handler and assert HTTP status + code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// Mock authenticateRequest at the module level so we can vary auth outcomes
// per test without spinning up real Supabase.
const mockAuthenticate = vi.fn()
const mockCreateBroadcasts = vi.fn()
const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SCOPE_CHANGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
vi.mock('@/lib/auth/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/api-auth')>('@/lib/auth/api-auth')
  return {
    ...actual,
    authenticateRequest: mockAuthenticate,
  }
})

// Mock pipeline so /jobs POST doesn't try to call AI providers
vi.mock('@/lib/kael/pipeline', () => ({
  runKaelPipeline: vi.fn(),
}))

// Mock rate limit so it never blocks
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  AI_SESSION_LIMIT: 10,
}))

vi.mock('@/lib/jobs/broadcast', async () => {
  const actual = await vi.importActual<typeof import('@/lib/jobs/broadcast')>('@/lib/jobs/broadcast')
  return {
    ...actual,
    createBroadcasts: mockCreateBroadcasts,
  }
})

// =============================================================================
// Helper: build a Request object + mock auth outcomes
// =============================================================================

function makeRequest(method = 'GET', body?: unknown): Request {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  return new Request('http://localhost/api/test', init)
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function authMissing() {
  mockAuthenticate.mockResolvedValue({
    success: false,
    code: 'AUTH_MISSING',
    error: 'Vui lòng đăng nhập',
    status: 401,
  })
}

function authForbidden() {
  mockAuthenticate.mockResolvedValue({
    success: false,
    code: 'AUTH_FORBIDDEN',
    error: 'Bạn không có quyền thực hiện hành động này',
    status: 403,
  })
}

function authUnavailable() {
  mockAuthenticate.mockResolvedValue({
    success: false,
    code: 'AUTH_UNAVAILABLE',
    error: 'Dịch vụ xác thực tạm thời không khả dụng',
    status: 503,
  })
}

beforeEach(() => {
  mockAuthenticate.mockReset()
  mockCreateBroadcasts.mockReset()
  mockCreateBroadcasts.mockResolvedValue({
    success: true,
    batchId: 'batch-1',
    broadcastCount: 1,
    workerIds: ['worker-1'],
  })
})

describe('Transient auth failures', () => {
  it('preserves AUTH_UNAVAILABLE and 503 at the route boundary', async () => {
    authUnavailable()
    const { GET } = await import('@/app/api/services/route')

    const response = await GET(makeRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'AUTH_UNAVAILABLE' })
  })
})

// =============================================================================
// Worker-only routes — reject customer + admin (when applicable) + unauth
// =============================================================================

describe('Worker-only routes reject non-workers', () => {
  it('POST /workers/register: unauthenticated → 401', async () => {
    authMissing()
    const { POST } = await import('@/app/api/workers/register/route')
    const res = await POST(makeRequest('POST', {}))
    expect(res.status).toBe(401)
  })

  it('POST /workers/register: customer role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/workers/register/route')
    const res = await POST(makeRequest('POST', {}))
    expect(res.status).toBe(403)
  })

  it('GET /workers/me: unauthenticated → 401', async () => {
    authMissing()
    const { GET } = await import('@/app/api/workers/me/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(401)
  })

  it('GET /workers/me: customer role → 403', async () => {
    authForbidden()
    const { GET } = await import('@/app/api/workers/me/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(403)
  })

  it('PATCH /workers/me/availability: customer role → 403', async () => {
    authForbidden()
    const { PATCH } = await import('@/app/api/workers/me/availability/route')
    const res = await PATCH(makeRequest('PATCH', { is_available: true }))
    expect(res.status).toBe(403)
  })

  it('PATCH /workers/me/availability: active job blocks online state', async () => {
    const supabase: any = {
      rpc: vi.fn(async () => ({
        data: [{
          ok: false,
          error_code: 'WORKER_BUSY',
          is_available: null,
          updated_at_ts: null,
        }],
        error: null,
      })),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'worker-1', email: 'worker-1@test.test' },
      role: 'worker',
      supabase,
    })
    const { PATCH } = await import('@/app/api/workers/me/availability/route')
    const res = await PATCH(makeRequest('PATCH', { is_available: true }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('WORKER_BUSY')
    expect(supabase.rpc).toHaveBeenCalledWith('set_worker_availability_atomic', {
      p_worker_id: 'worker-1',
      p_is_available: true,
    })
  })

  it('GET /workers/me/broadcasts: customer role → 403', async () => {
    authForbidden()
    const { GET } = await import('@/app/api/workers/me/broadcasts/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(403)
  })

  it('GET /workers/me/jobs: customer role → 403', async () => {
    authForbidden()
    const { GET } = await import('@/app/api/workers/me/jobs/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(403)
  })

  it('GET /workers/me/earnings: customer role → 403', async () => {
    authForbidden()
    const { GET } = await import('@/app/api/workers/me/earnings/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/accept: customer role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/accept/route')
    const res = await POST(makeRequest('POST'), makeParams(JOB_ID))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/decline: customer role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/decline/route')
    const res = await POST(makeRequest('POST'), makeParams(JOB_ID))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/scope-change: customer role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/scope-change/route')
    const res = await POST(makeRequest('POST', {}), makeParams(JOB_ID))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/scope-change: worker must use Edge mobile-api', async () => {
    const supabase: any = {
      rpc: vi.fn(async () => ({ data: [], error: null })),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'worker-1', email: 'worker-1@test.test' },
      role: 'worker',
      supabase,
    })

    const { POST } = await import('@/app/api/jobs/[id]/scope-change/route')
    const res = await POST(
      makeRequest('POST', {
        client_request_id: '11111111-1111-4111-8111-111111111111',
        new_description: 'Need extra pipe replacement',
        reason: 'Inspection found a larger leak',
        photo_urls: [],
      }),
      makeParams(JOB_ID),
    )
    const body = await res.json()

    expect(res.status).toBe(501)
    expect(body.code).toBe('EDGE_MOBILE_API_REQUIRED')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('PATCH /jobs/[id]/status: customer role → 403', async () => {
    authForbidden()
    const { PATCH } = await import('@/app/api/jobs/[id]/status/route')
    const res = await PATCH(makeRequest('PATCH', { status: 'arrived' }), makeParams(JOB_ID))
    expect(res.status).toBe(403)
  })

  it('PATCH /jobs/[id]/status rejects a malformed id before privileged DB access', async () => {
    const from = vi.fn()
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: { from },
    })
    const { PATCH } = await import('@/app/api/jobs/[id]/status/route')

    const res = await PATCH(
      makeRequest('PATCH', { status: 'arrived' }),
      makeParams('not-a-uuid'),
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(from).not.toHaveBeenCalled()
  })

  it('PATCH /jobs/[id]/status: concurrent status change → 409', async () => {
    const query: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: JOB_ID,
          status: 'worker_on_way',
          worker_id: 'worker-1',
        },
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }
    const supabase: any = {
      from: vi.fn(() => query),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'worker-1', email: 'worker-1@test.test' },
      role: 'worker',
      supabase,
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/status/route')
    const res = await PATCH(makeRequest('PATCH', { status: 'arrived' }), makeParams(JOB_ID))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('STATUS_CHANGED')
    expect(query.eq).toHaveBeenCalledWith('status', 'worker_on_way')
    expect(query.maybeSingle).toHaveBeenCalled()
  })

  it('PATCH /jobs/[id]/status: completed_by_worker rejects worker final_price', async () => {
    const query: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: JOB_ID,
          status: 'repairing',
          worker_id: 'worker-1',
        },
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: JOB_ID },
        error: null,
      }),
    }
    const supabase: any = {
      from: vi.fn(() => query),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'worker-1', email: 'worker-1@test.test' },
      role: 'worker',
      supabase,
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/status/route')
    const res = await PATCH(
      makeRequest('PATCH', {
        status: 'completed_by_worker',
        final_price: 280000,
        completion_notes: 'Done',
        completion_photo_urls: ['https://example.com/after.jpg'],
      }),
      makeParams(JOB_ID),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION')
  })

  it('PATCH /jobs/[id]/status: completed_by_worker preserves Kael final_price', async () => {
    const updates: Array<Record<string, unknown>> = []
    const query: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn((data: Record<string, unknown>) => {
        updates.push(data)
        return query
      }),
      single: vi.fn().mockResolvedValue({
        data: {
          id: JOB_ID,
          status: 'repairing',
          worker_id: 'worker-1',
        },
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: JOB_ID },
        error: null,
      }),
    }
    const supabase: any = {
      from: vi.fn(() => query),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'worker-1', email: 'worker-1@test.test' },
      role: 'worker',
      supabase,
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/status/route')
    const res = await PATCH(
      makeRequest('PATCH', {
        status: 'completed_by_worker',
        completion_notes: 'Done',
        completion_photo_urls: ['https://example.com/after.jpg'],
      }),
      makeParams(JOB_ID),
    )

    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({
      status: 'completed_by_worker',
      completion_notes: 'Done',
      completion_photo_urls: ['https://example.com/after.jpg'],
    })
    expect(updates[0]).not.toHaveProperty('final_price')
  })
})

// =============================================================================
// Customer-only routes — reject worker + admin (when applicable) + unauth
// =============================================================================

describe('Customer-only routes reject non-customers', () => {
  it('POST /jobs: unauthenticated → 401', async () => {
    authMissing()
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest('POST', {}))
    expect(res.status).toBe(401)
  })

  it('POST /jobs: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest('POST', {}))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/confirm-search: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/confirm-search/route')
    const res = await POST(makeRequest('POST'), makeParams(JOB_ID))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/confirm-completion: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/confirm-completion/route')
    const res = await POST(makeRequest('POST'), makeParams(JOB_ID))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/review: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/review/route')
    const res = await POST(makeRequest('POST', {}), makeParams(JOB_ID))
    expect(res.status).toBe(403)
  })

  it('POST /scope-changes/[id]/decide: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/scope-changes/[id]/decide/route')
    const res = await POST(makeRequest('POST', { decision: 'approve' }), makeParams(SCOPE_CHANGE_ID))
    expect(res.status).toBe(403)
  })
})

describe('Kael-owned money path parity in Next reference routes', () => {
  it('POST /jobs/[id]/confirm-search locks jobs.final_price from Kael baseline', async () => {
    const updates: Array<Record<string, unknown>> = []
    const jobsQuery: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn((data: Record<string, unknown>) => {
        updates.push(data)
        return jobsQuery
      }),
      single: vi.fn().mockResolvedValue({
        data: {
          id: JOB_ID,
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_price_max: 250000,
          final_price: null,
        },
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: JOB_ID },
        error: null,
      }),
    }
    const eventQuery = {
      insert: vi.fn(async () => ({ data: null, error: null })),
    }
    const supabase: any = {
      from: vi.fn((table: string) => table === 'job_events' ? eventQuery : jobsQuery),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase,
    })

    const { POST } = await import('@/app/api/jobs/[id]/confirm-search/route')
    const res = await POST(makeRequest('POST'), makeParams(JOB_ID))

    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({
      status: 'broadcasting',
      final_price: 250000,
    })
  })
})

// =============================================================================
// Cross-owner: right role, wrong owner — return 404 (don't reveal existence)
// =============================================================================

describe('Cross-owner access returns 404 (no info leak)', () => {
  it('Customer A reads Customer B job → 404', async () => {
    // Mock supabase returns a job owned by 'other-customer'
    const supabase: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: JOB_ID,
            status: 'awaiting_customer_confirm',
            customer_id: 'other-customer', // NOT user-1
            service_type: 'electrical',
            address_district: 'q1',
          },
          error: null,
        }),
      })),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'user-1' },
      role: 'customer',
      supabase,
    })

    const { POST } = await import('@/app/api/jobs/[id]/confirm-search/route')
    const res = await POST(makeRequest('POST'), makeParams(JOB_ID))
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })

  it('Worker A updates Worker B job status → 404', async () => {
    const supabase: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: JOB_ID,
            status: 'arrived',
            worker_id: 'other-worker', // NOT user-1
          },
          error: null,
        }),
      })),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'user-1' },
      role: 'worker',
      supabase,
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/status/route')
    const res = await PATCH(
      makeRequest('PATCH', { status: 'inspecting' }),
      makeParams(JOB_ID),
    )
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })

  it('Customer decides scope change on another customer\'s job → 404', async () => {
    // After Tier 3 refactor: decideScopeChange calls RPC `decide_scope_change_atomic`.
    // The function returns NOT_FOUND when customer_id doesn't match job owner.
    const supabase: any = {
      rpc: vi.fn(async () => ({
        data: [
          {
            ok: false,
            error_code: 'NOT_FOUND',
            job_id_out: null,
            scope_status: null,
            decided_at_ts: null,
          },
        ],
        error: null,
      })),
      from: vi.fn(() => ({})),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'user-1' },
      role: 'customer',
      supabase,
    })

    const { POST } = await import('@/app/api/scope-changes/[id]/decide/route')
    const res = await POST(makeRequest('POST', { decision: 'approve' }), makeParams(SCOPE_CHANGE_ID))
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })
})

// =============================================================================
// Admin bypass (Bug #6) — admin can read any job
// =============================================================================

describe('Admin can bypass ownership check (Bug #6)', () => {
  it('GET /jobs/[id]: admin reads any customer\'s job → 200', async () => {
    const supabase: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: JOB_ID,
            status: 'paid',
            customer_id: 'some-customer',
            worker_id: 'some-worker',
            service_type: 'electrical',
            description: 'test',
            problem_chips: [],
            photo_urls: [],
            address_building: null,
            address_unit: null,
            address_floor: null,
            address_district: 'q1',
            scheduled_at: null,
            kael_problem_identified: null,
            kael_complexity: null,
            kael_price_min: null,
            kael_price_max: null,
            kael_advisory: null,
            final_price: null,
            completion_notes: null,
            completion_photo_urls: [],
            created_at: new Date().toISOString(),
            matched_at: null,
            arrived_at: null,
            completed_at: null,
            confirmed_at: null,
            paid_at: null,
            reviewed_at: null,
          },
          error: null,
        }),
      })),
    }
    mockAuthenticate.mockResolvedValue({
      success: true,
      user: { id: 'admin-1' },
      role: 'admin',
      supabase,
    })

    const { GET } = await import('@/app/api/jobs/[id]/route')
    const res = await GET(makeRequest('GET'), makeParams(JOB_ID))
    expect(res.status).toBe(200)
  })
})

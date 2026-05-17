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
    error: 'Vui lòng đăng nhập',
    status: 401,
  })
}

function authForbidden() {
  mockAuthenticate.mockResolvedValue({
    success: false,
    error: 'Bạn không có quyền thực hiện hành động này',
    status: 403,
  })
}

function authAs(role: 'customer' | 'worker' | 'admin', userId = 'user-1') {
  const supabase: any = {
    from: vi.fn(() => {
      const chain: any = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.update = vi.fn(() => chain)
      chain.insert = vi.fn(() => chain)
      chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      chain.then = (cb: any) => Promise.resolve({ data: null, error: null }).then(cb)
      return chain
    }),
  }
  mockAuthenticate.mockResolvedValue({
    success: true,
    user: { id: userId, email: `${userId}@test.test` },
    role,
    supabase,
  })
}

beforeEach(() => {
  mockAuthenticate.mockReset()
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
    const res = await POST(makeRequest('POST'), makeParams('job-1'))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/decline: customer role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/decline/route')
    const res = await POST(makeRequest('POST'), makeParams('job-1'))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/scope-change: customer role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/scope-change/route')
    const res = await POST(makeRequest('POST', {}), makeParams('job-1'))
    expect(res.status).toBe(403)
  })

  it('PATCH /jobs/[id]/status: customer role → 403', async () => {
    authForbidden()
    const { PATCH } = await import('@/app/api/jobs/[id]/status/route')
    const res = await PATCH(makeRequest('PATCH', { status: 'arrived' }), makeParams('job-1'))
    expect(res.status).toBe(403)
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
    const res = await POST(makeRequest('POST'), makeParams('job-1'))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/confirm-completion: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/confirm-completion/route')
    const res = await POST(makeRequest('POST'), makeParams('job-1'))
    expect(res.status).toBe(403)
  })

  it('POST /jobs/[id]/review: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/jobs/[id]/review/route')
    const res = await POST(makeRequest('POST', {}), makeParams('job-1'))
    expect(res.status).toBe(403)
  })

  it('POST /scope-changes/[id]/decide: worker role → 403', async () => {
    authForbidden()
    const { POST } = await import('@/app/api/scope-changes/[id]/decide/route')
    const res = await POST(makeRequest('POST', { decision: 'approve' }), makeParams('sc-1'))
    expect(res.status).toBe(403)
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
            id: 'job-1',
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
    const res = await POST(makeRequest('POST'), makeParams('job-1'))
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })

  it('Worker A updates Worker B job status → 403', async () => {
    const supabase: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'job-1',
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
      makeParams('job-1'),
    )
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('AUTH_FORBIDDEN')
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
    const res = await POST(makeRequest('POST', { decision: 'approve' }), makeParams('sc-1'))
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
            id: 'job-1',
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
    const res = await GET(makeRequest('GET'), makeParams('job-1'))
    expect(res.status).toBe(200)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
    })),
  })),
}))

import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = {}
  if (token) {
    headers['authorization'] = `Bearer ${token}`
  }
  return new Request('http://localhost/api/test', { headers })
}

describe('api-auth — authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects request without Authorization header', async () => {
    const result = await authenticateRequest(makeRequest())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.status).toBe(401)
      expect(result.error).toContain('đăng nhập')
    }
  })

  it('rejects request with non-Bearer auth', async () => {
    const req = new Request('http://localhost/api/test', {
      headers: { authorization: 'Basic abc123' },
    })
    const result = await authenticateRequest(req)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.status).toBe(401)
    }
  })

  it('rejects request with empty Bearer token', async () => {
    const req = new Request('http://localhost/api/test', {
      headers: { authorization: 'Bearer ' },
    })
    const result = await authenticateRequest(req)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.status).toBe(401)
    }
  })

  it('rejects when getUser fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    })

    const result = await authenticateRequest(makeRequest('bad-token'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.status).toBe(401)
      expect(result.error).toContain('hết hạn')
    }
  })

  it('rejects when profile not found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com' } },
      error: null,
    })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const result = await authenticateRequest(makeRequest('valid-token'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.status).toBe(401)
    }
  })

  it('succeeds with valid token and profile', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com' } },
      error: null,
    })
    mockSingle.mockResolvedValue({
      data: { role: 'customer' },
      error: null,
    })

    const result = await authenticateRequest(makeRequest('valid-token'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.user.id).toBe('user-1')
      expect(result.role).toBe('customer')
    }
  })

  it('rejects when role not in allowedRoles', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com' } },
      error: null,
    })
    mockSingle.mockResolvedValue({
      data: { role: 'customer' },
      error: null,
    })

    const result = await authenticateRequest(makeRequest('valid-token'), ['worker'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.status).toBe(403)
      expect(result.error).toContain('quyền')
    }
  })

  it('allows when role is in allowedRoles', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com' } },
      error: null,
    })
    mockSingle.mockResolvedValue({
      data: { role: 'worker' },
      error: null,
    })

    const result = await authenticateRequest(makeRequest('valid-token'), ['worker', 'admin'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.role).toBe('worker')
    }
  })

  it('allows all roles when allowedRoles is undefined', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com' } },
      error: null,
    })
    mockSingle.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    })

    const result = await authenticateRequest(makeRequest('valid-token'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.role).toBe('admin')
    }
  })
})

describe('api-auth — apiError', () => {
  it('returns NextResponse with error shape', async () => {
    const response = apiError('AUTH_MISSING', 'Vui lòng đăng nhập', 401)
    const body = await response.json()
    expect(body.error).toBe('Vui lòng đăng nhập')
    expect(body.code).toBe('AUTH_MISSING')
    expect(response.status).toBe(401)
  })
})

describe('api-auth — apiSuccess', () => {
  it('returns NextResponse with data', async () => {
    const response = apiSuccess({ job_id: '123' })
    const body = await response.json()
    expect(body.job_id).toBe('123')
    expect(response.status).toBe(200)
  })

  it('supports custom status code', async () => {
    const response = apiSuccess({ created: true }, 201)
    expect(response.status).toBe(201)
  })
})

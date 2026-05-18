import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
  },
}))

const mockGetUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

import { updateSession } from '@/lib/middleware'
import { NextRequest } from 'next/server'

function makeRequest(pathname: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    headers: cookie ? { cookie } : undefined,
  })
}

describe('middleware — API route bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips auth for /api/ routes — returns NextResponse.next()', async () => {
    const response = await updateSession(makeRequest('/api/jobs'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('skips auth for /api/services', async () => {
    const response = await updateSession(makeRequest('/api/services'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('skips auth for /api/jobs/123/status', async () => {
    const response = await updateSession(makeRequest('/api/jobs/abc-123/status'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('skips auth for /api/health', async () => {
    const response = await updateSession(makeRequest('/api/health'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects non-API routes without Supabase auth cookie before auth lookup', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(makeRequest('/dashboard'))
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/login')
  })

  it('checks auth for non-API routes with Supabase auth cookie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(makeRequest('/dashboard', 'sb-local-auth-token=test'))
    expect(mockGetUser).toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/login')
  })

  it('allows /auth/login without redirect', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(makeRequest('/auth/login'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('allows /login without auth lookup', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(makeRequest('/login'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('allows authenticated non-API request through', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    })
    const response = await updateSession(makeRequest('/dashboard', 'sb-local-auth-token=test'))
    expect(response.status).toBe(200)
  })
})

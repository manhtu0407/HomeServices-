import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
  },
}))

const { mockGetUser, mockCreateServerClient } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockCreateServerClient = vi.fn(() => ({
    auth: { getUser: mockGetUser },
  }))
  return { mockGetUser, mockCreateServerClient }
})

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
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
    mockCreateServerClient.mockImplementation(() => ({
      auth: { getUser: mockGetUser },
    }))
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
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('checks auth for non-API routes with Supabase auth cookie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(makeRequest('/dashboard', 'sb-local-auth-token=test'))
    expect(mockGetUser).toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('redirects the nonexistent /auth/login route to the landing page', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(makeRequest('/auth/login'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects the nonexistent /login route to the landing page', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await updateSession(makeRequest('/login'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('allows the reference landing page without a cookie', async () => {
    const response = await updateSession(makeRequest('/'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('allows the bearer-token admin UI without a Supabase cookie', async () => {
    const response = await updateSession(makeRequest('/admin/kael-learning'))
    expect(response.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('does not make unrelated admin paths public', async () => {
    const response = await updateSession(makeRequest('/admin/unknown'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects safely when cookie-backed auth lookup rejects', async () => {
    mockGetUser.mockRejectedValue(new Error('auth timeout'))
    const response = await updateSession(makeRequest('/dashboard', 'sb-local-auth-token=test'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('redirects safely when the cookie-backed auth client cannot be created', async () => {
    mockCreateServerClient.mockImplementationOnce(() => {
      throw new Error('invalid runtime configuration')
    })

    const response = await updateSession(makeRequest('/dashboard', 'sb-local-auth-token=test'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('uses the bounded Supabase transport for cookie-backed auth lookup', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    await updateSession(makeRequest('/dashboard', 'sb-local-auth-token=test'))

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'http://localhost:54321',
      'test-anon-key',
      expect.objectContaining({
        global: { fetch: expect.any(Function) },
      }),
    )
  })

  it('allows authenticated non-API request through', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    })
    const response = await updateSession(makeRequest('/dashboard', 'sb-local-auth-token=test'))
    expect(response.status).toBe(200)
  })
})

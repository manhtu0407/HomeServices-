import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('production runtime env boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PHASE', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    vi.stubEnv('DEEPSEEK_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lets health report missing client env as a structured 503', async () => {
    const { GET } = await import('@/app/api/health/route')

    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      checks: { env_client: 'fail', env_server: 'fail', supabase: 'skip' },
    })
  })

  it('lets bearer auth report missing runtime config as AUTH_UNAVAILABLE', async () => {
    const { authenticateRequest } = await import('@/lib/auth/api-auth')
    const request = new Request('http://localhost/api/services', {
      headers: { authorization: 'Bearer valid-looking-token' },
    })

    await expect(authenticateRequest(request)).resolves.toMatchObject({
      success: false,
      code: 'AUTH_UNAVAILABLE',
      status: 503,
    })
  })
})

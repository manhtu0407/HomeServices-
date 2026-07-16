import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { ensureClientEnv, ensureServerEnv, createClient } = vi.hoisted(() => ({
  ensureClientEnv: vi.fn(),
  ensureServerEnv: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
  },
  ensureClientEnv,
  ensureServerEnv,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

import { GET } from '@/app/api/health/route'

function queryResult(result: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  }
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureClientEnv.mockReturnValue(undefined)
    ensureServerEnv.mockReturnValue(undefined)
    createClient.mockReturnValue(queryResult({ error: null }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fails closed and skips Supabase when required client env is missing', async () => {
    ensureClientEnv.mockImplementation(() => {
      throw new Error('missing client env')
    })

    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      checks: { env_client: 'fail', supabase: 'skip' },
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('reports healthy only when env and Supabase checks pass', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'healthy',
      checks: { env_client: 'ok', env_server: 'ok', supabase: 'ok' },
    })
  })

  it('bounds a hanging Supabase request and reports it as failed', async () => {
    vi.useFakeTimers()
    createClient.mockReturnValue(queryResult(new Promise(() => undefined)))

    let settled = false
    const pending = GET().then((response) => {
      settled = true
      return response
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(settled).toBe(true)
    const response = await pending

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      checks: { supabase: 'fail' },
    })
  })
})

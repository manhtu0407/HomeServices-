import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Tier 2: Env Validator
// Verify env.ts validates required vars and exposes getters correctly.
// Chain: Tier 3 providers depend on env vars being present — this tier
// ensures the validation gate works before providers attempt API calls.
//
// Note: env.ts calls validateEnv() at module level, so we use dynamic
// imports with vi.resetModules() to test different env states.
// ---------------------------------------------------------------------------

const REQUIRED_VARS = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJ-test-key',
}

const SERVER_VARS = {
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  PERPLEXITY_API_KEY: 'pplx-test',
  DEEPSEEK_API_KEY: 'sk-ds-test',
}

describe('Env validation — required vars', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of Object.keys(REQUIRED_VARS)) {
      delete process.env[key]
    }
    for (const key of Object.keys(SERVER_VARS)) {
      delete process.env[key]
    }
  })

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      REQUIRED_VARS.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    await expect(() => import('@/lib/env')).rejects.toThrow(
      'Missing required environment variables'
    )
  })

  it('throws when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      REQUIRED_VARS.NEXT_PUBLIC_SUPABASE_URL

    await expect(() => import('@/lib/env')).rejects.toThrow(
      'Missing required environment variables'
    )
  })

  it('throws when both required vars are missing', async () => {
    await expect(() => import('@/lib/env')).rejects.toThrow(
      'Missing required environment variables'
    )
  })

  it('error message lists missing var names', async () => {
    try {
      await import('@/lib/env')
      throw new Error('should have thrown')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('NEXT_PUBLIC_SUPABASE_URL')
      expect(msg).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    }
  })

  it('error message mentions .env.local', async () => {
    try {
      await import('@/lib/env')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('.env.local')
    }
  })

  it('does NOT throw when all required vars are set', async () => {
    Object.assign(process.env, REQUIRED_VARS)

    const mod = await import('@/lib/env')
    expect(mod.env).toBeDefined()
  })
})

describe('Env getters — required vars', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.assign(process.env, REQUIRED_VARS)
  })

  it('supabaseUrl returns correct value', async () => {
    const { env } = await import('@/lib/env')
    expect(env.supabaseUrl).toBe(REQUIRED_VARS.NEXT_PUBLIC_SUPABASE_URL)
  })

  it('supabasePublishableKey returns correct value', async () => {
    const { env } = await import('@/lib/env')
    expect(env.supabasePublishableKey).toBe(
      REQUIRED_VARS.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  })
})

describe('Env getters — server-only vars (optional)', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.assign(process.env, REQUIRED_VARS)
    for (const key of Object.keys(SERVER_VARS)) {
      delete process.env[key]
    }
  })

  it('supabaseServiceRoleKey returns empty string when not set', async () => {
    const { env } = await import('@/lib/env')
    expect(env.supabaseServiceRoleKey).toBe('')
  })

  it('anthropicApiKey returns empty string when not set', async () => {
    const { env } = await import('@/lib/env')
    expect(env.anthropicApiKey).toBe('')
  })

  it('perplexityApiKey returns empty string when not set', async () => {
    const { env } = await import('@/lib/env')
    expect(env.perplexityApiKey).toBe('')
  })

  it('deepseekApiKey returns empty string when not set', async () => {
    const { env } = await import('@/lib/env')
    expect(env.deepseekApiKey).toBe('')
  })

  it('server vars return values when set', async () => {
    Object.assign(process.env, SERVER_VARS)
    const { env } = await import('@/lib/env')
    expect(env.supabaseServiceRoleKey).toBe(SERVER_VARS.SUPABASE_SERVICE_ROLE_KEY)
    expect(env.anthropicApiKey).toBe(SERVER_VARS.ANTHROPIC_API_KEY)
    expect(env.perplexityApiKey).toBe(SERVER_VARS.PERPLEXITY_API_KEY)
    expect(env.deepseekApiKey).toBe(SERVER_VARS.DEEPSEEK_API_KEY)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('env module', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    // Clear vars that integration runs (e.g., real-supabase env injection)
    // may have set in process.env — unstubAllEnvs doesn't touch shell vars.
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

  describe('validateClientEnv', () => {
    it('throws when NEXT_PUBLIC vars are missing', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      await expect(import('@/lib/env')).rejects.toThrow(
        'Missing required client environment variables'
      )
    })

    it('error message lists each missing var', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      await expect(import('@/lib/env')).rejects.toThrow(
        'NEXT_PUBLIC_SUPABASE_URL'
      )
    })

    it('passes when all client vars are set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key')
      const mod = await import('@/lib/env')
      expect(mod.env).toBeDefined()
    })

    it('defers production runtime validation to request entrypoints', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const mod = await import('@/lib/env')
      expect(() => mod.ensureClientEnv()).toThrow(
        'Missing required client environment variables'
      )
      expect(() => mod.env.supabaseUrl).toThrow('Supabase URL not configured')
    })

    it('skips eager validation only during the Next production build phase', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PHASE', 'phase-production-build')
      const mod = await import('@/lib/env')
      expect(mod.env).toBeDefined()
      expect(() => mod.ensureClientEnv()).toThrow(
        'Missing required client environment variables'
      )
    })
  })

  describe('requireServerKey (via env getters)', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key')
    })

    it('env.anthropicApiKey throws when missing', async () => {
      const mod = await import('@/lib/env')
      expect(() => mod.env.anthropicApiKey).toThrow('Anthropic API key not configured')
    })

    it('env.perplexityApiKey throws when missing', async () => {
      const mod = await import('@/lib/env')
      expect(() => mod.env.perplexityApiKey).toThrow('Perplexity API key not configured')
    })

    it('env.deepseekApiKey throws when missing', async () => {
      const mod = await import('@/lib/env')
      expect(() => mod.env.deepseekApiKey).toThrow('DeepSeek API key not configured')
    })

    it('env.supabaseServiceRoleKey throws when missing', async () => {
      const mod = await import('@/lib/env')
      expect(() => mod.env.supabaseServiceRoleKey).toThrow(
        'Supabase service role key not configured'
      )
    })

    it('returns value when server key is set', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-anthropic')
      const mod = await import('@/lib/env')
      expect(mod.env.anthropicApiKey).toBe('sk-test-anthropic')
    })

    it('each server key getter works independently', async () => {
      vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test')
      vi.stubEnv('DEEPSEEK_API_KEY', 'ds-test')
      const mod = await import('@/lib/env')
      expect(mod.env.perplexityApiKey).toBe('pplx-test')
      expect(mod.env.deepseekApiKey).toBe('ds-test')
    })
  })

  describe('client env getters', () => {
    it('env.supabaseUrl returns correct value', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://iwevizmsedyqozxlawwl.supabase.co/')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')
      const mod = await import('@/lib/env')
      expect(mod.env.supabaseUrl).toBe('https://iwevizmsedyqozxlawwl.supabase.co')
    })

    it('env.supabasePublishableKey returns correct value', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test-key')
      const mod = await import('@/lib/env')
      expect(mod.env.supabasePublishableKey).toBe('sb_publishable_test-key')
    })

    it.each([
      'https://abcdefghijklmnopqrst.supabase.co.attacker.example',
      'https://user:secret@abcdefghijklmnopqrst.supabase.co',
      'http://abcdefghijklmnopqrst.supabase.co',
      'https://abcdefghijklmnopqrst.supabase.co/rest/v1',
    ])('rejects an untrusted Supabase authority: %s', async (supabaseUrl) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl)
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test-key')
      const mod = await import('@/lib/env')

      expect(() => mod.env.supabaseUrl).toThrow('exact trusted project root')
    })

    it.each(['sb_secret_server-key', 'not-a-jwt', 'sb_publishable_'])(
      'rejects server or malformed authority in the public key slot: %s',
      async (publishableKey) => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publishableKey)
        const mod = await import('@/lib/env')

        expect(() => mod.env.supabasePublishableKey).toThrow('must not contain server authority')
      },
    )

    it('accepts a legacy anon JWT without accepting arbitrary JWT payloads', async () => {
      const payload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', `header.${payload}.signature`)
      const mod = await import('@/lib/env')

      expect(mod.env.supabasePublishableKey).toContain(payload)
    })
  })

  describe('ensureServerEnv', () => {
    beforeEach(() => {
      // Isolate from shell env — tests assert behavior when specific vars are
      // missing; CI/integration runs may set these globally and pollute tests.
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key')
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
      vi.stubEnv('ANTHROPIC_API_KEY', '')
      vi.stubEnv('PERPLEXITY_API_KEY', '')
      vi.stubEnv('DEEPSEEK_API_KEY', '')
    })

    it('throws when any server key is missing', async () => {
      const mod = await import('@/lib/env')
      expect(() => mod.ensureServerEnv()).toThrow(
        'Missing required server environment variables'
      )
    })

    it('error lists all missing server vars', async () => {
      const mod = await import('@/lib/env')
      let errorMsg = ''
      try {
        mod.ensureServerEnv()
      } catch (e) {
        errorMsg = (e as Error).message
      }
      expect(errorMsg).toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(errorMsg).toContain('ANTHROPIC_API_KEY')
      expect(errorMsg).toContain('PERPLEXITY_API_KEY')
      expect(errorMsg).toContain('DEEPSEEK_API_KEY')
    })

    it('passes when all server keys are set', async () => {
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test')
      vi.stubEnv('ANTHROPIC_API_KEY', 'test')
      vi.stubEnv('PERPLEXITY_API_KEY', 'test')
      vi.stubEnv('DEEPSEEK_API_KEY', 'test')
      const mod = await import('@/lib/env')
      expect(() => mod.ensureServerEnv()).not.toThrow()
    })

    it('does not throw if only some server keys are set', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test')
      const mod = await import('@/lib/env')
      expect(() => mod.ensureServerEnv()).toThrow()
      let errorMsg = ''
      try {
        mod.ensureServerEnv()
      } catch (e) {
        errorMsg = (e as Error).message
      }
      expect(errorMsg).not.toContain('ANTHROPIC_API_KEY')
      expect(errorMsg).toContain('SUPABASE_SERVICE_ROLE_KEY')
    })
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) =>
  readFileSync(resolve(__dirname, '../../..', rel), 'utf-8')

describe('proxy.ts wiring (Next.js 16)', () => {
  const src = read('src/proxy.ts')

  it('exports "proxy" function (not "middleware")', () => {
    expect(src).toMatch(/export\s+async\s+function\s+proxy/)
  })

  it('does NOT export deprecated "middleware" function', () => {
    expect(src).not.toMatch(/export\s+(?:async\s+)?function\s+middleware/)
  })

  it('imports updateSession from @/lib/middleware', () => {
    expect(src).toMatch(/import\s+\{.*updateSession.*\}\s+from\s+['"]@\/lib\/middleware['"]/)
  })

  it('has route matcher config', () => {
    expect(src).toContain('matcher')
  })

  it('excludes static assets from matching', () => {
    expect(src).toContain('_next/static')
    expect(src).toContain('_next/image')
    expect(src).toContain('favicon.ico')
  })
})

describe('AI providers import env module (not process.env)', () => {
  const providers = [
    ['anthropic', read('src/lib/ai/providers/anthropic.ts')],
    ['perplexity', read('src/lib/ai/providers/perplexity.ts')],
    ['deepseek', read('src/lib/ai/providers/deepseek.ts')],
  ] as const

  it.each(providers)('%s imports from env module', (_name, src) => {
    expect(src).toMatch(/import\s+\{.*env.*\}\s+from\s+['"]\.\.\/\.\.\/env['"]/)
  })

  it.each(providers)('%s does NOT use process.env directly', (_name, src) => {
    const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(codeOnly).not.toContain('process.env')
  })

  it.each(providers)('%s throws AIProviderError on HTTP failure', (_name, src) => {
    expect(src).toContain('AIProviderError')
    expect(src).toMatch(/throw\s+new\s+AIProviderError/)
  })

  it.each(providers)('%s imports AIProviderError from types', (_name, src) => {
    expect(src).toMatch(/import\s+\{.*AIProviderError.*\}\s+from\s+['"]\.\.\/types['"]/)
  })

  it.each(providers)('%s checks res.ok before parsing', (_name, src) => {
    expect(src).toContain('if (!res.ok)')
  })

  it.each(providers)('%s returns AIResponse with success: true', (_name, src) => {
    expect(src).toContain('success: true')
  })
})

describe('Supabase clients import env module', () => {
  const clients = [
    ['middleware.ts', read('src/lib/middleware.ts')],
  ] as const

  it.each(clients)('%s imports from env module', (_name, src) => {
    expect(src).toMatch(/import\s+\{.*env.*\}\s+from\s+['"]\.\/env['"]/)
  })

  it.each(clients)('%s does NOT use process.env directly', (_name, src) => {
    const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(codeOnly).not.toContain('process.env')
  })

  it.each(clients)('%s uses Database type generic on Supabase client', (_name, src) => {
    expect(src).toContain('<Database>')
  })

  it('does not keep unused browser/server Supabase client wrappers', () => {
    expect(() => read('src/lib/client.ts')).toThrow()
    expect(() => read('src/lib/server.ts')).toThrow()
  })
})

describe('Health route wiring', () => {
  const health = read('src/app/api/health/route.ts')

  it('imports ensureServerEnv from env module', () => {
    expect(health).toMatch(/import\s+\{.*ensureServerEnv.*\}\s+from/)
  })

  it('calls ensureServerEnv()', () => {
    expect(health).toContain('ensureServerEnv()')
  })

  it('exports GET handler', () => {
    expect(health).toMatch(/export\s+async\s+function\s+GET/)
  })

  it('checks supabase connectivity', () => {
    expect(health).toContain('.from(')
  })

  it('returns status field (healthy/degraded)', () => {
    expect(health).toContain("'healthy'")
    expect(health).toContain("'degraded'")
  })
})

describe('AI client wiring (Rule #2: centralized wrapper)', () => {
  const client = read('src/lib/ai/client.ts')

  it('uses instanceof AIProviderError (not string matching)', () => {
    expect(client).toContain('instanceof AIProviderError')
    expect(client).not.toMatch(/msg\.includes\(['"]429['"]\)/)
    expect(client).not.toMatch(/msg\.includes\(['"]500['"]\)/)
  })

  it('imports all 3 providers', () => {
    expect(client).toContain('callAnthropic')
    expect(client).toContain('callPerplexity')
    expect(client).toContain('callDeepSeek')
  })

  it('imports TIMEOUT_MS and MAX_RETRIES from types', () => {
    expect(client).toContain('TIMEOUT_MS')
    expect(client).toContain('MAX_RETRIES')
  })

  it('exports callAI function', () => {
    expect(client).toMatch(/export\s+async\s+function\s+callAI/)
  })

  it('does not log PII (Rule #9)', () => {
    expect(client).not.toMatch(/phone|cccd|address|apiKey/i)
  })
})

describe('env module structure', () => {
  const env = read('src/lib/env.ts')

  it('defines client and server key lists', () => {
    expect(env).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(env).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    expect(env).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(env).toContain('ANTHROPIC_API_KEY')
    expect(env).toContain('PERPLEXITY_API_KEY')
    expect(env).toContain('DEEPSEEK_API_KEY')
  })

  it('has build-time detection', () => {
    expect(env).toContain('isBuildTime')
  })

  it('exports ensureServerEnv', () => {
    expect(env).toMatch(/export\s+function\s+ensureServerEnv/)
  })

  it('requireServerKey throws (not returns empty string)', () => {
    expect(env).toContain('throw new Error')
    expect(env).not.toMatch(/\?\?\s*['"]/)
  })
})

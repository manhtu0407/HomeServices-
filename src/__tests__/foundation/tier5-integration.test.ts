import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Tier 5: Integration Verification
// Verify that PR#4 structural changes are in place: Database generic on
// Supabase clients, layout.tsx lang/metadata, and file existence.
// Chain: Depends on all prior tiers. This tier confirms the deliverables
//        described in the foundation hardening plan are actually shipped.
//
// Strategy: Read source files as text and assert on patterns. No runtime
// imports (server.ts needs Next.js cookies(), middleware needs NextRequest).
// ---------------------------------------------------------------------------

const rootDir = join(__dirname, '..', '..')

function readSrc(relativePath: string): string {
  return readFileSync(join(rootDir, relativePath), 'utf-8')
}

// ===== SUPABASE TYPE-SAFE GENERICS =====

describe('Supabase clients use Database generic', () => {
  it('server.ts imports Database type', () => {
    const src = readSrc('lib/server.ts')
    expect(src).toContain("import type { Database } from './database.types'")
  })

  it('server.ts passes Database generic to createServerClient', () => {
    const src = readSrc('lib/server.ts')
    expect(src).toMatch(/createServerClient<Database>\s*\(/)
  })

  it('client.ts imports Database type', () => {
    const src = readSrc('lib/client.ts')
    expect(src).toContain("import type { Database } from './database.types'")
  })

  it('client.ts passes Database generic to createBrowserClient', () => {
    const src = readSrc('lib/client.ts')
    expect(src).toMatch(/createBrowserClient<Database>\s*\(/)
  })

  it('middleware.ts imports Database type', () => {
    const src = readSrc('lib/middleware.ts')
    expect(src).toContain("import type { Database } from './database.types'")
  })

  it('middleware.ts passes Database generic to createServerClient', () => {
    const src = readSrc('lib/middleware.ts')
    expect(src).toMatch(/createServerClient<Database>\s*\(/)
  })
})

// ===== DATABASE TYPES FILE =====

describe('database.types.ts exists and exports Database', () => {
  it('file exists and is non-empty', () => {
    const src = readSrc('lib/database.types.ts')
    expect(src.length).toBeGreaterThan(100)
  })

  it('exports Database type', () => {
    const src = readSrc('lib/database.types.ts')
    expect(src).toContain('export type Database')
  })

  it('has public schema with Tables', () => {
    const src = readSrc('lib/database.types.ts')
    expect(src).toContain('public:')
    expect(src).toContain('Tables:')
  })
})

// ===== LAYOUT.TSX =====

describe('layout.tsx — Rule #5 compliance', () => {
  it('lang is "vi" (Vietnamese-first)', () => {
    const src = readSrc('app/layout.tsx')
    expect(src).toMatch(/lang=["']vi["']/)
  })

  it('does NOT have lang="en"', () => {
    const src = readSrc('app/layout.tsx')
    expect(src).not.toMatch(/lang=["']en["']/)
  })

  it('title is "Home Services"', () => {
    const src = readSrc('app/layout.tsx')
    expect(src).toContain('"Home Services"')
  })

  it('description mentions HCMC services', () => {
    const src = readSrc('app/layout.tsx')
    expect(src).toContain('sửa điện')
    expect(src).toContain('sửa nước')
    expect(src).toContain('HCMC')
  })

  it('does NOT contain scaffolding text', () => {
    const src = readSrc('app/layout.tsx')
    expect(src).not.toContain('Create Next App')
  })
})

// ===== ENV VALIDATOR =====

describe('env.ts exists and has correct structure', () => {
  it('file exists', () => {
    const src = readSrc('lib/env.ts')
    expect(src.length).toBeGreaterThan(50)
  })

  it('validates NEXT_PUBLIC_SUPABASE_URL', () => {
    const src = readSrc('lib/env.ts')
    expect(src).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('validates NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', () => {
    const src = readSrc('lib/env.ts')
    expect(src).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  })

  it('references .env.local in error message', () => {
    const src = readSrc('lib/env.ts')
    expect(src).toContain('.env.local')
  })
})

// ===== AI WRAPPER FILES =====

describe('AI wrapper file structure', () => {
  it('client.ts exists and exports callAI', () => {
    const src = readSrc('lib/ai/client.ts')
    expect(src).toContain('export async function callAI')
  })

  it('types.ts exists and exports types + constants', () => {
    const src = readSrc('lib/ai/types.ts')
    expect(src).toContain('export type AIProvider')
    expect(src).toContain('export type AIRequest')
    expect(src).toContain('export type AIResponse')
    expect(src).toContain('export type AIError')
    expect(src).toContain('export type AIResult')
    expect(src).toContain('export const TIMEOUT_MS')
    expect(src).toContain('export const MAX_RETRIES')
  })

  it('anthropic.ts exists and exports callAnthropic', () => {
    const src = readSrc('lib/ai/providers/anthropic.ts')
    expect(src).toContain('export async function callAnthropic')
  })

  it('perplexity.ts exists and exports callPerplexity', () => {
    const src = readSrc('lib/ai/providers/perplexity.ts')
    expect(src).toContain('export async function callPerplexity')
  })

  it('deepseek.ts exists and exports callDeepSeek', () => {
    const src = readSrc('lib/ai/providers/deepseek.ts')
    expect(src).toContain('export async function callDeepSeek')
  })

  it('providers use server-side env vars only (Rule #1)', () => {
    const anthropic = readSrc('lib/ai/providers/anthropic.ts')
    const perplexity = readSrc('lib/ai/providers/perplexity.ts')
    const deepseek = readSrc('lib/ai/providers/deepseek.ts')

    expect(anthropic).toContain('process.env.ANTHROPIC_API_KEY')
    expect(perplexity).toContain('process.env.PERPLEXITY_API_KEY')
    expect(deepseek).toContain('process.env.DEEPSEEK_API_KEY')

    expect(anthropic).not.toContain('NEXT_PUBLIC_ANTHROPIC')
    expect(perplexity).not.toContain('NEXT_PUBLIC_PERPLEXITY')
    expect(deepseek).not.toContain('NEXT_PUBLIC_DEEPSEEK')
  })
})

// ===== CROSS-TIER CHAIN VERIFICATION =====

describe('Cross-tier chain: types → providers → client', () => {
  it('client.ts imports from types.ts', () => {
    const src = readSrc('lib/ai/client.ts')
    expect(src).toContain("from './types'")
  })

  it('client.ts imports all 3 providers', () => {
    const src = readSrc('lib/ai/client.ts')
    expect(src).toContain("from './providers/anthropic'")
    expect(src).toContain("from './providers/perplexity'")
    expect(src).toContain("from './providers/deepseek'")
  })

  it('client.ts uses TIMEOUT_MS and MAX_RETRIES from types', () => {
    const src = readSrc('lib/ai/client.ts')
    expect(src).toContain('TIMEOUT_MS')
    expect(src).toContain('MAX_RETRIES')
  })

  it('providers import AIRequest type from types.ts', () => {
    const anthropic = readSrc('lib/ai/providers/anthropic.ts')
    const perplexity = readSrc('lib/ai/providers/perplexity.ts')
    const deepseek = readSrc('lib/ai/providers/deepseek.ts')

    expect(anthropic).toContain('AIRequest')
    expect(perplexity).toContain('AIRequest')
    expect(deepseek).toContain('AIRequest')
  })
})

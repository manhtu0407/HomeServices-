import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PKG_ROOT = resolve(__dirname, '../..')
const SRC_ROOT = resolve(__dirname, '..')

const read = (rel: string) => readFileSync(resolve(SRC_ROOT, rel), 'utf-8')

// ===================================================================
// Barrel exports: index.ts must re-export everything from sub-modules
// If something is defined but not exported, consumers can't use it.
// ===================================================================

describe('packages/shared barrel export completeness', () => {
  const indexSrc = read('index.ts')

  it('re-exports from types/', () => {
    expect(indexSrc).toContain("from './types'")
  })

  it('re-exports from constants', () => {
    expect(indexSrc).toContain("from './constants'")
  })

  it('re-exports from workflow contracts', () => {
    expect(indexSrc).toContain("from './workflow'")
  })

  it('re-exports validation schemas by name (not wildcard)', () => {
    // Named exports are safer — prevent re-export collisions
    expect(indexSrc).toContain('serviceTypeSchema')
    expect(indexSrc).toContain('jobCreateSchema')
    expect(indexSrc).toContain('workerScopeChangeSchema')
    expect(indexSrc).toContain('reviewSchema')
    expect(indexSrc).toContain('chatMessageSchema')
    expect(indexSrc).toContain('sanitizeForLLM')
  })

  it('re-exports validation types', () => {
    expect(indexSrc).toContain('JobCreateInput')
    expect(indexSrc).toContain('WorkerScopeChangeInput')
    expect(indexSrc).toContain('ReviewInput')
    expect(indexSrc).toContain('ChatMessageInput')
  })
})

describe('types/index.ts barrel export completeness', () => {
  const typesSrc = read('types/index.ts')

  it('re-exports Database type', () => {
    expect(typesSrc).toContain('Database')
    expect(typesSrc).toContain("from './database'")
  })

  it('re-exports AI types', () => {
    expect(typesSrc).toContain('AIProvider')
    expect(typesSrc).toContain('AIMessage')
    expect(typesSrc).toContain('AIRequest')
    expect(typesSrc).toContain('AIResponse')
    expect(typesSrc).toContain('AIError')
    expect(typesSrc).toContain('AIResult')
    expect(typesSrc).toContain('AIUsage')
  })

  it('re-exports AI runtime values (not just types)', () => {
    // These are values, not types — they need non-type export
    expect(typesSrc).toMatch(/export\s+\{.*TIMEOUT_MS.*\}/)
    expect(typesSrc).toMatch(/export\s+\{.*MAX_RETRIES.*\}/)
    expect(typesSrc).toMatch(/export\s+\{.*AIProviderError.*\}/)
  })
})

// ===================================================================
// package.json export map — consumers rely on these paths
// ===================================================================

describe('package.json export map', () => {
  const pkg = JSON.parse(readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf-8'))

  it('has . entry point', () => {
    expect(pkg.exports['.']).toBeDefined()
    expect(pkg.exports['.']).toContain('index.ts')
  })

  it('has ./types entry point', () => {
    expect(pkg.exports['./types']).toBeDefined()
    expect(pkg.exports['./types']).toContain('types/index.ts')
  })

  it('has ./validation entry point', () => {
    expect(pkg.exports['./validation']).toBeDefined()
    expect(pkg.exports['./validation']).toContain('validation.ts')
  })

  it('has ./constants entry point', () => {
    expect(pkg.exports['./constants']).toBeDefined()
    expect(pkg.exports['./constants']).toContain('constants.ts')
  })

  it('has ./workflow entry point', () => {
    expect(pkg.exports['./workflow']).toBeDefined()
    expect(pkg.exports['./workflow']).toContain('workflow/index.ts')
  })

  it('all exported files actually exist', () => {
    for (const [key, path] of Object.entries(pkg.exports)) {
      const fullPath = resolve(PKG_ROOT, path as string)
      expect(existsSync(fullPath)).toBe(true)
    }
  })
})

// ===================================================================
// Source file existence — no dangling imports
// ===================================================================

describe('all source files exist', () => {
  const requiredFiles = [
    'index.ts',
    'constants.ts',
    'validation.ts',
    'workflow/index.ts',
    'types/index.ts',
    'types/database/index.ts',
    'types/database/schema.database.types.ts',
    'types/database/helpers.database.types.ts',
    'types/database/table-order.json',
    'types/ai.types.ts',
  ]

  it.each(requiredFiles)('%s exists', (file) => {
    expect(existsSync(resolve(SRC_ROOT, file))).toBe(true)
  })
})

// ===================================================================
// Cross-check: validation.ts imports from constants must stay in sync
// ===================================================================

describe('validation.ts ↔ constants.ts alignment', () => {
  // validation.ts is a re-export facade; the declaration lives in the bounded contract module.
  const validationSrc = read('contracts/common.ts')
  const constantsSrc = read('constants.ts')

  it('serviceTypeSchema enum matches SERVICE_TYPES values', () => {
    // The schema consumes the canonical tuple directly. A generic first-z.enum
    // regex can silently inspect an unrelated schema when validation order changes.
    expect(validationSrc).toContain('serviceTypeSchema = z.enum(SERVICE_TYPES)')
    expect(constantsSrc).toMatch(/SERVICE_TYPES\s*=\s*Object\.freeze\(\[/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '../../../..')
const readJSON = (rel: string) =>
  JSON.parse(readFileSync(resolve(REPO_ROOT, rel), 'utf-8'))
const readText = (rel: string) =>
  readFileSync(resolve(REPO_ROOT, rel), 'utf-8')
const exists = (rel: string) => existsSync(resolve(REPO_ROOT, rel))
const isDir = (rel: string) => {
  const p = resolve(REPO_ROOT, rel)
  return existsSync(p) && statSync(p).isDirectory()
}

// ===================================================================
// Workspace structure — Turborepo + pnpm
// ===================================================================

describe('monorepo directory structure', () => {
  it('apps/api/ exists', () => {
    expect(isDir('apps/api')).toBe(true)
  })

  it('apps/mobile/ exists', () => {
    expect(isDir('apps/mobile')).toBe(true)
  })

  it('packages/shared/ exists', () => {
    expect(isDir('packages/shared')).toBe(true)
  })

  it('supabase/ stays at root (not moved)', () => {
    expect(isDir('supabase')).toBe(true)
    expect(exists('supabase/migrations')).toBe(true)
  })

  it('no stray src/ at root (moved to apps/api/src/)', () => {
    // If src/ exists at root, the move was incomplete
    const rootSrc = resolve(REPO_ROOT, 'src')
    if (existsSync(rootSrc)) {
      // It could exist as an empty dir or leftover — check for actual code
      expect(exists('src/lib')).toBe(false)
      expect(exists('src/app')).toBe(false)
    }
  })

  it('CLAUDE.md stays at root (LOCKED)', () => {
    expect(exists('CLAUDE.md')).toBe(true)
  })

  it('STRUCTURES.md stays at root (LOCKED)', () => {
    expect(exists('STRUCTURES.md')).toBe(true)
  })

  it('RULES.md stays at root (LOCKED)', () => {
    expect(exists('RULES.md')).toBe(true)
  })
})

describe('root product contract alignment', () => {
  const structures = readText('STRUCTURES.md')
  const supabaseConfig = readText('supabase/config.toml')

  it('keeps Phase 0 auth aligned with the current role-first email/password app', () => {
    expect(structures).toContain('chooses role first')
    expect(structures).toContain('current Supabase email/password auth in Phase 0')
    expect(structures).toContain('phone OTP is a later production-auth upgrade after SMS provider setup')
    expect(structures).not.toContain('logs in with phone OTP')
    expect(structures).not.toContain('|- OTP required')
    expect(supabaseConfig).toContain('later phone OTP production-auth upgrade')
    expect(supabaseConfig).not.toContain('auth flow is phone OTP')
  })

  it('keeps worker verification scoped to electrical, plumbing, and cleaning services', () => {
    expect(structures).toContain('service skills: electrical / plumbing / cleaning')
    expect(structures).toContain('including multi-service combinations')
    expect(structures).not.toContain('service skills: electrical / plumbing / both')
  })

  it('does not describe the repo as pre-feature after mobile and Edge workflow slices exist', () => {
    // CLAUDE.md was rewritten 2026-05-22 (agent operating docs audit). Match the
    // current wording without dropping the regression guard.
    const claude = readText('CLAUDE.md')
    expect(claude).toMatch(/Production fix and foundation hardening/i)
    expect(claude).toMatch(/Mobile and Supabase Edge workflow slices exist/i)
    expect(claude).not.toContain('Chưa có feature code')
  })
})

// ===================================================================
// pnpm workspace config
// ===================================================================

describe('pnpm-workspace.yaml', () => {
  it('exists at root', () => {
    expect(exists('pnpm-workspace.yaml')).toBe(true)
  })

  it('includes apps/* and packages/*', () => {
    const content = readText('pnpm-workspace.yaml')
    expect(content).toContain('"apps/*"')
    expect(content).toContain('"packages/*"')
  })
})

// ===================================================================
// turbo.json pipeline
// ===================================================================

describe('turbo.json', () => {
  const turbo = readJSON('turbo.json')

  it('has $schema', () => {
    expect(turbo.$schema).toContain('turbo.build')
  })

  it('defines build task with ^build dependency', () => {
    expect(turbo.tasks.build).toBeDefined()
    expect(turbo.tasks.build.dependsOn).toContain('^build')
  })

  it('defines test task', () => {
    expect(turbo.tasks.test).toBeDefined()
  })

  it('defines type-check task', () => {
    expect(turbo.tasks['type-check']).toBeDefined()
  })

  it('dev task is not cached', () => {
    expect(turbo.tasks.dev.cache).toBe(false)
  })
})

// ===================================================================
// Root package.json — workspace root
// ===================================================================

describe('root package.json', () => {
  const pkg = readJSON('package.json')

  it('name is home-services', () => {
    expect(pkg.name).toBe('home-services')
  })

  it('is private', () => {
    expect(pkg.private).toBe(true)
  })

  it('scripts delegate to turbo', () => {
    expect(pkg.scripts.build).toContain('turbo')
    expect(pkg.scripts.test).toContain('turbo')
    expect(pkg.scripts['type-check']).toContain('turbo')
  })

  it('has turbo in devDependencies', () => {
    expect(pkg.devDependencies.turbo).toBeDefined()
  })

  it('does NOT have app-specific deps at root', () => {
    // Root should only have turbo — app deps live in apps/
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.devDependencies.next).toBeUndefined()
    expect(pkg.devDependencies.react).toBeUndefined()
    expect(pkg.devDependencies.expo).toBeUndefined()
  })
})

// ===================================================================
// apps/api package.json
// ===================================================================

describe('apps/api/package.json', () => {
  const pkg = readJSON('apps/api/package.json')

  it('name is @home-services/api', () => {
    expect(pkg.name).toBe('@home-services/api')
  })

  it('is private', () => {
    expect(pkg.private).toBe(true)
  })

  it('depends on @home-services/shared via workspace', () => {
    expect(pkg.dependencies['@home-services/shared']).toBe('workspace:*')
  })

  it('has next.js', () => {
    expect(pkg.dependencies.next).toBeDefined()
  })

  it('has vitest for testing', () => {
    expect(pkg.devDependencies.vitest).toBeDefined()
  })

  it('has test script', () => {
    expect(pkg.scripts.test).toBeDefined()
  })

  it('has type-check script', () => {
    expect(pkg.scripts['type-check']).toBeDefined()
  })

  it('has zod (for validation)', () => {
    expect(pkg.dependencies.zod).toBeDefined()
  })
})

// ===================================================================
// apps/mobile package.json
// ===================================================================

describe('apps/mobile/package.json', () => {
  const pkg = readJSON('apps/mobile/package.json')

  it('name is @home-services/mobile', () => {
    expect(pkg.name).toBe('@home-services/mobile')
  })

  it('is private', () => {
    expect(pkg.private).toBe(true)
  })

  it('depends on @home-services/shared via workspace', () => {
    expect(pkg.dependencies['@home-services/shared']).toBe('workspace:*')
  })

  it('has expo', () => {
    expect(pkg.dependencies.expo).toBeDefined()
  })

  it('has expo-router', () => {
    expect(pkg.dependencies['expo-router']).toBeDefined()
  })

  it('has react-native', () => {
    expect(pkg.dependencies['react-native']).toBeDefined()
  })

  it('has supabase client', () => {
    expect(pkg.dependencies['@supabase/supabase-js']).toBeDefined()
  })

  it('has AsyncStorage for non-sensitive local UI preferences', () => {
    expect(pkg.dependencies['@react-native-async-storage/async-storage']).toBeDefined()
  })

  it('has expo-secure-store for Supabase session persistence', () => {
    expect(pkg.dependencies['expo-secure-store']).toBeDefined()
  })

  it('has expo-image-picker for local customer media selection', () => {
    expect(pkg.dependencies['expo-image-picker']).toBeDefined()
  })

  it('main entry is expo-router/entry', () => {
    expect(pkg.main).toBe('expo-router/entry')
  })

  it('does NOT have vitest (no tests in mobile yet)', () => {
    // Mobile doesn't run vitest — it uses Expo testing tools
    expect(pkg.devDependencies?.vitest).toBeUndefined()
  })

  it('has type-check script', () => {
    expect(pkg.scripts['type-check']).toBeDefined()
  })
})

// ===================================================================
// packages/shared package.json
// ===================================================================

describe('packages/shared/package.json', () => {
  const pkg = readJSON('packages/shared/package.json')

  it('name is @home-services/shared', () => {
    expect(pkg.name).toBe('@home-services/shared')
  })

  it('is private', () => {
    expect(pkg.private).toBe(true)
  })

  it('has zod dependency', () => {
    expect(pkg.dependencies.zod).toBeDefined()
  })

  it('has vitest for testing', () => {
    expect(pkg.devDependencies.vitest).toBeDefined()
  })

  it('has test script', () => {
    expect(pkg.scripts.test).toBeDefined()
  })

  it('main points to src/index.ts', () => {
    expect(pkg.main).toContain('index.ts')
  })

  it('does NOT depend on next or react-native (shared = platform agnostic)', () => {
    expect(pkg.dependencies?.next).toBeUndefined()
    expect(pkg.dependencies?.['react-native']).toBeUndefined()
    expect(pkg.dependencies?.react).toBeUndefined()
  })
})

// ===================================================================
// Cross-package dependency consistency
// ===================================================================

describe('dependency version consistency', () => {
  const apiPkg = readJSON('apps/api/package.json')
  const mobilePkg = readJSON('apps/mobile/package.json')
  const sharedPkg = readJSON('packages/shared/package.json')

  it('all packages using zod have compatible versions', () => {
    const apiZod = apiPkg.dependencies?.zod
    const mobileZod = mobilePkg.dependencies?.zod
    const sharedZod = sharedPkg.dependencies?.zod
    // All should be ^4.x (Zod v4)
    if (apiZod) expect(apiZod).toMatch(/^\^4/)
    if (mobileZod) expect(mobileZod).toMatch(/^\^4/)
    if (sharedZod) expect(sharedZod).toMatch(/^\^4/)
  })

  it('api and mobile use same supabase-js major version', () => {
    const apiVersion = apiPkg.dependencies?.['@supabase/supabase-js']
    const mobileVersion = mobilePkg.dependencies?.['@supabase/supabase-js']
    if (apiVersion && mobileVersion) {
      // Both should be ^2.x
      expect(apiVersion).toMatch(/^\^2/)
      expect(mobileVersion).toMatch(/^\^2/)
    }
  })
})

// ===================================================================
// apps/api source structure (post-move)
// ===================================================================

describe('apps/api source structure after move', () => {
  it('has src/app/ (Next.js pages)', () => {
    expect(isDir('apps/api/src/app')).toBe(true)
  })

  it('has src/lib/ (server code)', () => {
    expect(isDir('apps/api/src/lib')).toBe(true)
  })

  it('has src/__tests__/ (test suites)', () => {
    expect(isDir('apps/api/src/__tests__')).toBe(true)
  })

  it('has next.config.ts', () => {
    expect(exists('apps/api/next.config.ts')).toBe(true)
  })

  it('has tsconfig.json', () => {
    expect(exists('apps/api/tsconfig.json')).toBe(true)
  })

  it('has vitest.config.ts', () => {
    expect(exists('apps/api/vitest.config.ts')).toBe(true)
  })

  it('has proxy.ts (Next.js 16 — not middleware.ts at root)', () => {
    expect(exists('apps/api/src/proxy.ts')).toBe(true)
  })

  it('no nested src/src/ (move artifact)', () => {
    expect(exists('apps/api/src/src')).toBe(false)
  })
})

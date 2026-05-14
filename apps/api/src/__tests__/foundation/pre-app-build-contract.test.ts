import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')

const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('Mission 3 pre-app build contract', () => {
  const contractPath = 'docs/foundation/pre-app-build-contract.md'
  const contract = read(contractPath)

  it('exists as the prepared foundation contract', () => {
    expect(existsSync(resolve(ROOT, contractPath))).toBe(true)
  })

  it('defines the mission boundary and explicitly blocks feature runtime work', () => {
    expect(contract).toContain('Prepared foundation only')
    expect(contract).toContain('Do not build now')
    expect(contract).toContain('functional customer booking screens')
    expect(contract).toContain('Kael runtime orchestration')
    expect(contract).toContain('remote production schema changes')
  })

  it('matches the current monorepo topology', () => {
    expect(contract).toContain('apps/mobile')
    expect(contract).toContain('apps/api')
    expect(contract).toContain('packages/shared')
    expect(contract).toContain('Do not recreate a root src/ application tree.')
  })

  it('defines mobile, backend, Supabase, Kael, and testing contracts', () => {
    for (const requiredText of [
      'Mobile Foundation Contract',
      'Backend API Contract',
      'Supabase Schema Alignment Audit',
      'Kael Foundation Contract',
      'Testing Blueprint',
    ]) {
      expect(contract).toContain(requiredText)
    }
  })

  it('keeps mobile AI and secret boundaries explicit', () => {
    expect(contract).toContain('never calls Anthropic, Perplexity, DeepSeek, or OpenAI directly')
    expect(contract).toContain('never reads Supabase service role or management credentials')
    expect(contract).toContain('expo-secure-store')
    expect(contract).toContain('fetch for network calls')
  })
})

describe('Build foundation stays offline-capable and app-scoped', () => {
  it('sets Turbopack root to the pnpm workspace root', () => {
    const config = read('apps/api/next.config.ts')

    expect(config).toContain('turbopack')
    expect(config).toContain('fileURLToPath(import.meta.url)')
    expect(config).toContain('resolve(appRoot, "../..")')
    expect(config).toContain('root: workspaceRoot')
  })

  it('does not depend on Google Fonts during build', () => {
    const layout = read('apps/api/src/app/layout.tsx')

    expect(layout).not.toContain('next/font/google')
    expect(layout).not.toContain('Geist')
  })
})

describe('Secret hygiene baseline', () => {
  it('.env.example lists keys with empty values only', () => {
    const envExample = read('.env.example')
    const requiredKeys = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SECRET_KEY',
      'ANTHROPIC_API_KEY',
      'PERPLEXITY_API_KEY',
      'DEEPSEEK_API_KEY',
    ]

    for (const key of requiredKeys) {
      expect(envExample).toContain(`${key}=`)
    }

    const assignments = envExample
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))

    for (const line of assignments) {
      const value = line.slice(line.indexOf('=') + 1)
      expect(value).toBe('')
    }
  })

  it('keeps local env files ignored while allowing .env.example', () => {
    const gitignore = read('.gitignore')

    expect(gitignore).toMatch(/^\.env\*/m)
    expect(gitignore).toMatch(/^!\.env\.example/m)
  })

  it('does not persist Supabase management tokens in repo text files', () => {
    const files = collectRepoTextFiles()
    const managementTokenPattern = /sbp_[A-Za-z0-9]{32,}/

    for (const file of files) {
      const contents = readFileSync(file, 'utf-8')
      expect(contents, `secret-like token found in ${file}`).not.toMatch(managementTokenPattern)
    }
  })
})

const scanRoots = [
  'apps',
  'packages',
  'supabase',
  'docs',
  '.claude',
  'README.md',
  'CLAUDE.md',
  'RULES.md',
  'STRUCTURES.md',
  'critical.md',
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.env.example',
  '.gitignore',
]

const textExtensions = new Set([
  '',
  '.css',
  '.example',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
])

function collectRepoTextFiles() {
  const files: string[] = []

  for (const scanRoot of scanRoots) {
    collect(resolve(ROOT, scanRoot), files)
  }

  return files
}

function collect(path: string, files: string[]) {
  if (!existsSync(path)) return

  const stat = statSync(path)

  if (stat.isFile()) {
    if (textExtensions.has(extname(path))) {
      files.push(path)
    }
    return
  }

  if (!stat.isDirectory()) return

  for (const entry of readdirSync(path)) {
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry === '.expo' ||
      entry === '.turbo' ||
      entry === 'dist' ||
      entry === 'settings.local.json' ||
      entry === 'worktrees'
    ) {
      continue
    }
    collect(resolve(path, entry), files)
  }
}

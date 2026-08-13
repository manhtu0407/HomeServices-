import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')

const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

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
  it('workspace env example lists keys with empty values only', () => {
    const envExample = read('config/env/workspace.env.example')
    const requiredKeys = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'EXPO_PUBLIC_API_BASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SECRET_KEY',
      'ANTHROPIC_API_KEY',
      'PERPLEXITY_API_KEY',
      'PERPLEXITY_API_URL',
      'DEEPSEEK_API_KEY',
      'KAEL_EVAL_FIXTURE_PATH',
      'KAEL_EVAL_KNOWLEDGE_FIXTURE_PATH',
      'KAEL_EVAL_REPORT_PATH',
      'KAEL_B3_SOURCE_AUDIT_LIVE',
      'SOURCE_TRUST_RUN_LIVE',
      'SOURCE_TRUST_OUTPUT_DIR',
      'SOURCE_RESEARCH_TIMEOUT_MS',
      'KEEP_USER',
    ]

    for (const key of requiredKeys) {
      expect(envExample).toContain(`${key}=`)
    }

    const assignments: string[] = []
    for (const line of envExample.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.length > 0 && !trimmed.startsWith('#')) assignments.push(trimmed)
    }

    for (const line of assignments) {
      const [, value = ''] = line.split('=')
      expect(value).toBe('')
    }
  })

  it('keeps local env files ignored while allowing committed env examples', () => {
    const gitignore = read('.gitignore')

    expect(gitignore).toMatch(/^\.env\*/m)
    expect(gitignore).toMatch(/^!config\/env\/workspace\.env\.example/m)
    expect(gitignore).toMatch(/^!apps\/mobile\/\.env\.example/m)
  })

  it('keeps mobile signing credentials out of Git and EAS upload contexts', () => {
    const gitignore = read('.gitignore')
    const easignore = read('.easignore')

    for (const pattern of ['*.p8', '*.p12', '*.pem', '*.key', '*.mobileprovision', '*.jks', '*.keystore']) {
      expect(gitignore).toContain(pattern)
      expect(easignore).toContain(pattern)
    }
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
  'governance',
  'config',
  'README.md',
  'CLAUDE.md',
  'package.json',
  'pnpm-workspace.yaml',
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

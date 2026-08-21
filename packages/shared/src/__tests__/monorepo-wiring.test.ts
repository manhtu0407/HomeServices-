import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
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
const sourceFileExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.sql'])
const skippedSourceDirs = new Set(['__tests__', 'assets', 'node_modules', 'prototypes'])
const mojibakePattern = /\u00c3|\u00c2|\u00e1\u00ba|\u00e1\u00bb|\u00c4\u0090|\u00c4\u2018|\u00c6/
const knownNativeTextInputFiles = new Set<string>()
const knownLegacyAssetFiles = new Set<string>()

function listSourceFiles(rel: string): string[] {
  const abs = resolve(REPO_ROOT, rel)
  if (!existsSync(abs)) return []
  const entries = readdirSync(abs, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (skippedSourceDirs.has(entry.name)) continue
    const childRel = `${rel}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(childRel))
      continue
    }
    const dot = entry.name.lastIndexOf('.')
    const extension = dot >= 0 ? entry.name.slice(dot) : ''
    if (sourceFileExtensions.has(extension)) files.push(childRel)
  }

  return files
}

// ===================================================================
// Workspace structure — Turborepo + pnpm
// ===================================================================

describe('root product contract alignment', () => {
  // The phone-OTP annotation case was removed: it pinned an exact comment string in
  // config.toml, and fd6a53e7 rewrote that comment to describe the current sign-up phase
  // instead of the planned upgrade. A comment is not the setting, so the assertion could
  // only ever track wording. docs/test-debt-ledger.md section 7 records what it claimed.

  it('keeps production source files free from mojibake Vietnamese strings', () => {
    const productionFiles = [
      ...listSourceFiles('apps/mobile/app'),
      ...listSourceFiles('apps/mobile/components'),
      ...listSourceFiles('apps/mobile/lib'),
      ...listSourceFiles('apps/api/src/app'),
      ...listSourceFiles('apps/api/src/lib'),
      ...listSourceFiles('packages/shared/src'),
      ...listSourceFiles('supabase/functions'),
    ]
    const offenders = productionFiles.filter((file) => mojibakePattern.test(readText(file)))

    expect(offenders).toEqual([])
  })

  it('keeps production mobile source on Kael component and image systems', () => {
    const mobileProductionFiles = [
      ...listSourceFiles('apps/mobile/app'),
      ...listSourceFiles('apps/mobile/components'),
      ...listSourceFiles('apps/mobile/lib'),
    ]
    const rawTextInputOffenders = mobileProductionFiles.filter((file) =>
      file !== 'apps/mobile/components/ui/kael-primitives.tsx' &&
      !knownNativeTextInputFiles.has(file) &&
      readText(file).includes('<TextInput')
    )
    const legacyAssetOffenders = mobileProductionFiles.filter((file) =>
      !knownLegacyAssetFiles.has(file) &&
      /common-image-icons|client-kael\.png|kael-model-8a/.test(readText(file))
    )

    expect(rawTextInputOffenders).toEqual([])
    expect(legacyAssetOffenders).toEqual([])
  })

  it('keeps Kael Core v9 as the only Kael visual source and removes legacy status assets', () => {
    expect(exists('apps/mobile/assets/kael/Kael-Core-v9-Codex-Rebuild.html')).toBe(true)
    expect(exists('apps/mobile/assets/kael/Kael-Motion-Clip-v11-Codex-Rebuild.html')).toBe(true)
    expect(exists('apps/mobile/assets/kael-emotions')).toBe(false)
    expect(exists('apps/mobile/assets/kael-states')).toBe(false)
    expect(exists('apps/mobile/assets/status')).toBe(false)
    expect(exists('apps/mobile/assets/lottie/kael-bow-welcome.json')).toBe(false)
    expect(exists('apps/mobile/assets/kael-model-8a.png')).toBe(false)
    expect(exists('apps/mobile/assets/kael-model-8a-head.png')).toBe(false)
    expect(exists('apps/mobile/assets/kael-orb-icon.png')).toBe(false)
    expect(exists('apps/mobile/assets/kael-orb-glyph.png')).toBe(false)
    expect(exists('apps/mobile/assets/client-image-icons/client-kael.png')).toBe(false)
    expect(exists('apps/mobile/assets/navigation/customer/kael.png')).toBe(false)
    expect(exists('apps/mobile/assets/navigation/worker/kael.png')).toBe(false)
    expect(exists('apps/mobile/components/auth/entry-access/assets/kael.png')).toBe(false)
    expect(exists('apps/mobile/components/kael/kael-mascot-assets.ts')).toBe(false)
    expect(exists('apps/mobile/components/kael/kael-mascot.tsx')).toBe(false)
    expect(exists('apps/mobile/components/kael/kael-motion-renderer.tsx')).toBe(false)
    expect(readText('apps/mobile/components/ui/kael-core-v9-contract.ts')).toContain("motionVocabulary: ['autoplay-clip', 'formal-bow']")
  })
})

// ===================================================================
// pnpm workspace config
// ===================================================================

describe('pnpm-workspace.yaml', () => {
  it('includes apps/* and packages/*', () => {
    const content = readText('pnpm-workspace.yaml')
    expect(content).toContain('"apps/*"')
    expect(content).toContain('"packages/*"')
  })
})

// ===================================================================
// Turbo pipeline
// ===================================================================

describe('config/turbo/turbo.json', () => {
  const turbo = readJSON('config/turbo/turbo.json')

  it('defines build task with ^build dependency', () => {
    expect(turbo.tasks.build).toBeDefined()
    expect(turbo.tasks.build.dependsOn).toContain('^build')
  })

})

// ===================================================================
// Root package.json — workspace root
// ===================================================================

describe('root package.json', () => {
  const pkg = readJSON('package.json')

  it('removes cmd forwarding shims that can reinterpret shell metacharacters', () => {
    for (const wrapper of [
      'scripts/run-node.cmd',
      'scripts/run-package-script.cmd',
      'scripts/run-turbo.cmd',
      'scripts/run-supabase.cmd',
      'scripts/run-react-doctor.cmd',
      'scripts/run-mobile-web-staging-preview.cmd',
    ]) {
      expect(exists(wrapper)).toBe(false)
    }
    for (const command of Object.values(pkg.scripts) as string[]) {
      expect(command).not.toMatch(/run-(?:node|package-script|turbo|supabase|react-doctor|mobile-web-staging-preview)\.cmd/i)
    }
  })

  it('runs the skills ratchet with portable Node on Ubuntu CI', () => {
    const securityWorkflow = readText('.github/workflows/security.yml')
    expect(securityWorkflow).toContain('node scripts/check-skills-sync.mjs')
    expect(securityWorkflow).not.toContain('run: pnpm skills:check')
  })

  it('derives the forbidden API package alias for the runtime-boundary ratchet', () => {
    const structureLint = readText('scripts/lint-structure.mjs')
    expect(structureLint).toContain("readJson('apps/api/package.json').name")
    expect(structureLint).toContain('API_PACKAGE_NAME')
    expect(structureLint).not.toContain('@home-services/api')
  })

})

// ===================================================================
// apps/api package.json
// ===================================================================

// ===================================================================
// apps/mobile package.json
// ===================================================================

describe('apps/mobile/package.json', () => {
  const pkg = readJSON('apps/mobile/package.json')

  it('pins EAS CLI commands to the workspace package manager', () => {
    const easScripts = [
      pkg.scripts['eas:login'],
      pkg.scripts['eas:whoami'],
      pkg.scripts.testflight,
      pkg.scripts['submit:ios:latest'],
      pkg.scripts['play:internal'],
      pkg.scripts['submit:android:latest'],
    ]

    for (const script of easScripts) {
      expect(script).toContain('pnpm dlx eas-cli@22.0.0')
      expect(script).not.toContain('npx')
      expect(script).not.toContain('@latest')
    }
    // eas.json states a floor (">= 22.0.0"), the scripts pin the exact version; both must name the same one.
    expect(readJSON('apps/mobile/eas.json').cli.version).toContain('22.0.0')
  })
})

// ===================================================================
// packages/shared package.json
// ===================================================================

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

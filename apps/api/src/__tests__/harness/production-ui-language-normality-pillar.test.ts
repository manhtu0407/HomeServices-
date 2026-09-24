import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P76-production-ui-language-normality',
  invariant:
    'Production UI source rejects internal test terminology and cross-language literals in explicit VI/EN slots before PR and release promotion',
  authority: [
    'AGENTS.md Language Rules (one selected language per visible screen)',
    'governance/RULES.md #8 (no fake or internal Production copy)',
  ],
  target: 'scripts/check-production-ui-copy.mjs',
  layer: 'security-negative',
  siblings: ['P56-stage1-production-release-workflow', 'P64-role-gate-language-integrity', 'P73-workflow-language-authority'],
  mutation:
    'put English Customer/Worker workflow copy in a VI slot, Vietnamese copy in an EN slot, or remove the PR ratchet — this pillar turns red',
} as const satisfies PillarManifest

const root = resolve(import.meta.dirname, '../../../../..')

describe('Production UI language normality', () => {
  it('audits the complete current runtime source with the v2 localized-copy receipt', () => {
    const result = spawnSync(process.execPath, ['scripts/check-production-ui-copy.mjs'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    })
    expect(result.error, pillarWhy(PILLAR, 'the full-source subprocess must finish within its bounded scan budget')).toBeUndefined()
    expect(result.status, pillarWhy(PILLAR, result.stderr || result.stdout)).toBe(0)
    expect(result.stdout).toMatch(/\d+ localized literals, 0 unsafe terms/u)
  }, 15_000)

  it('keeps the same fail-closed audit in PR and post-merge release workflows', () => {
    const prWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
    const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release-production.yml'), 'utf8')
    const audit = readFileSync(resolve(root, 'scripts/check-production-ui-copy.mjs'), 'utf8')
    expect(prWorkflow, pillarWhy(PILLAR, 'PR ratchet')).toContain('node scripts/check-production-ui-copy.mjs')
    expect(releaseWorkflow, pillarWhy(PILLAR, 'release receipt')).toContain('pnpm lint:production-ui-copy')
    expect(audit, pillarWhy(PILLAR, 'receipt schema')).toContain('stage1-production-ui-normality.v2')
    expect(audit, pillarWhy(PILLAR, 'language leakage gate')).toContain('languageLeakageCount')
  })
})

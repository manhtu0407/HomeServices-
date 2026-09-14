import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P102-workspace-pnpm-corepack-fallback',
  invariant: 'official workspace scripts resolve the exact package-manager version through a healthy Corepack command when the first pnpm candidate is mismatched',
  authority: ['governance/critical.md #3 No False Completion', 'governance/protocols/code-hygiene.md'],
  target: 'scripts/resolve-workspace-pnpm.ps1',
  layer: 'static-type',
  siblings: ['P75-transaction-critical-route-coverage', 'P101-matching-expiry-maintainer-runtime'],
  mutation: 'remove the Corepack fallback or invoke it without the repo-pinned pnpm prefix; the runner contract turns red',
} as const satisfies PillarManifest

const resolver = readFileSync(new URL('../../../../../scripts/resolve-workspace-pnpm.ps1', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../../../../../scripts/run-package-script.ps1', import.meta.url), 'utf8')

describe('workspace pnpm resolution boundary', () => {
  it('uses Corepack as the repo-pinned fallback and preserves command/prefix separately', () => {
    expect(resolver, pillarWhy(PILLAR, 'The fallback must avoid the stale global pnpm store.')).toContain('corepack.cmd')
    expect(resolver, pillarWhy(PILLAR, 'Corepack must receive pnpm and the exact package-manager version must be verified.')).toContain('"pnpm"')
    expect(resolver, pillarWhy(PILLAR, 'The selected command and its arguments must remain separately executable by all wrappers.')).toContain('Prefix = @($prefix)')
    expect(resolver, pillarWhy(PILLAR, 'A mismatched candidate must not be accepted without a pinned-version check.')).toContain('ExpectedVersion')
  })

  it('keeps the shared resolver on the official package-script path', () => {
    expect(runner, pillarWhy(PILLAR, 'The official mobile gates must use the same resolver.')).toContain('Get-WorkspacePnpmInvocation')
    expect(runner, pillarWhy(PILLAR, 'The runner must execute the resolver-selected command and prefix.')).toContain('$pnpmInvocation.Prefix')
  })
})

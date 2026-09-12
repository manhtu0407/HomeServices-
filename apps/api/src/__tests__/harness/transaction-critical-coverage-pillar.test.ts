import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P75-transaction-critical-route-coverage',
  invariant:
    'transaction catalog integrity never substitutes for behavioral proof; unresolved route/state gaps remain explicit and required proof rejects missing or non-passing runner assertions',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind mobile-api)',
    'governance/critical.md #3 (an unexecuted verification cannot support completion)',
  ],
  target: 'config/harness/transaction-critical-coverage.json',
  layer: 'static-type',
  siblings: ['P12-workflow-transition-composition', 'P18-capability-registry-parity', 'P71-worker-readiness-onboarding'],
  mutation:
    'map every entry to the unrelated P36 pillar or remove required behavioral rejection — the binding mutation or required-mode case turns red',
} as const satisfies PillarManifest

const root = join(process.cwd(), '../..')
const manifest = JSON.parse(
  readFileSync(join(root, 'config/harness/transaction-critical-coverage.json'), 'utf8'),
) as {
  minimum_public_workers: number
  actors: string[]
  states: string[]
  entries: Array<{ route_kind?: string; system_surface?: string; actor: string; pillars: string[] }>
}

describe('transaction-critical route coverage', () => {
  it('validates catalog bindings while reporting behavioral verification debt', () => {
    const result = spawnSync(process.execPath, ['scripts/harness/transaction-critical-coverage.mjs'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(
      result.status,
      pillarWhy(PILLAR, `${result.stdout}\n${result.stderr}`.trim()),
    ).toBe(0)
    expect(result.stdout).toContain('50 routes, 8 system surfaces')
    expect(result.stdout).toContain('behavioral verification:')
    expect(result.stdout).toContain('UNVERIFIED')
    expect(result.stdout).not.toContain('transaction-critical coverage ok')
  })

  it('refuses required behavioral proof when only the catalog exists', () => {
    const result = spawnSync(process.execPath, [
      'scripts/harness/transaction-critical-coverage.mjs', '--require-behavioral',
    ], { cwd: root, encoding: 'utf8', windowsHide: true })
    expect(result.status, pillarWhy(PILLAR, 'source bindings are not executed test evidence')).toBe(1)
    expect(result.stderr).toContain('required behavioral proof failed')
  })

  it('pins the launch threshold and all four transaction actors', () => {
    expect(manifest.minimum_public_workers, pillarWhy(PILLAR, 'a public cell needs three real reachable workers')).toBe(3)
    expect([...manifest.actors].sort()).toEqual(['admin', 'customer', 'system', 'worker'])
  })

  it('covers terminal money, recovery, and release states instead of stopping at matching', () => {
    for (const state of ['payment_pending', 'paid', 'reviewed', 'refund_required', 'recovery_required', 'closed']) {
      expect(manifest.states, pillarWhy(PILLAR, `missing terminal state ${state}`)).toContain(state)
    }
    expect(manifest.entries.some((entry) => entry.route_kind === 'jobs.review')).toBe(true)
    for (const route of ['workers.registrationCommand.submit', 'workers.registrationCommand.get']) {
      expect(manifest.entries.some(entry => entry.route_kind === route), pillarWhy(PILLAR, route)).toBe(true)
    }
    expect(manifest.entries.some((entry) => entry.system_surface === 'release.production_promotion')).toBe(true)
  })
})

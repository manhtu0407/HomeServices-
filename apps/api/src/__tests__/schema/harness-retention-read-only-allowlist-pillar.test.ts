import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { CAPABILITY_POLICIES } from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/capability-registry'

export const PILLAR = {
  id: 'P203-harness-retention-read-only-allowlist',
  invariant:
    'the harness retention pass may prune only route kinds the capability registry classifies as read-only GET routes, so a route that writes state or moves money never loses its evidence to the scheduled deletion',
  authority: [
    'governance/RULES.md #8 (no silent loss of evidence)',
    'governance/RULES.md #7 (server-validated decisions keep their audit trail)',
  ],
  target: 'supabase/migrations/20260921153130_harness_telemetry_retention.sql',
  layer: 'static-type',
  siblings: ['P202-harness-telemetry-retention-sql', 'P18-capability-registry-parity'],
  mutation:
    'add "workers.activityMinute" (a POST idempotent write) to the route array in private.prune_harness_read_telemetry — the named activityMinute case and the per-route case for it turn red',
} as const satisfies PillarManifest

type Policy = {
  readonly risk?: string
  readonly sideEffectClass?: string
  readonly methods?: readonly string[]
}

const root = resolve(__dirname, '../../../../..')
const migration = readFileSync(resolve(root, PILLAR.target), 'utf8')
const policies = CAPABILITY_POLICIES as unknown as Record<string, Policy | undefined>

function retentionRouteKinds(sql: string): string[] {
  const match = /route_kind\s*=\s*any\s*\(\s*array\s*\[([^\]]*)\]/iu.exec(sql)
  if (!match) return []
  return [...match[1].matchAll(/'([^']+)'/gu)].map((quoted) => quoted[1])
}

const KINDS = retentionRouteKinds(migration)

describe('harness retention allowlist', () => {
  it('reads a non-empty, duplicate-free route list out of the migration', () => {
    expect(
      KINDS.length,
      pillarWhy(PILLAR, 'no route_kind = any (array[...]) found; an empty list would let every case below pass vacuously'),
    ).toBeGreaterThan(0)
    expect(new Set(KINDS).size, pillarWhy(PILLAR, `duplicates in ${KINDS.join(', ')}`)).toBe(KINDS.length)
  })

  it.each(KINDS)('%s is a read-only GET route in the capability registry', (kind) => {
    const policy = policies[kind]
    expect(policy, pillarWhy(PILLAR, `${kind} is not in CAPABILITY_POLICIES`)).toBeDefined()
    expect(policy?.risk, pillarWhy(PILLAR, `${kind} risk`)).toBe('read')
    expect(policy?.sideEffectClass, pillarWhy(PILLAR, `${kind} sideEffectClass`)).toBe('read-only')
    expect(policy?.methods, pillarWhy(PILLAR, `${kind} methods`)).toEqual(['GET'])
  })

  it('never lists workers.activityMinute, which is an idempotent write', () => {
    expect(policies['workers.activityMinute']?.sideEffectClass).toBe('idempotent-write')
    expect(KINDS, pillarWhy(PILLAR, 'activityMinute records worker presence and is not telemetry noise')).not.toContain(
      'workers.activityMinute',
    )
  })
})

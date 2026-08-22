import { createClient } from '@supabase/supabase-js'
import { SERVICE_TYPES, type Database } from '@nestscout/shared'
import { describe, expect, it } from 'vitest'
import {
  pillarWhy,
  type PillarManifest,
} from '../pillar-manifest'
import { resolveOrAnnounceSkip } from './integration-target'

export const PILLAR = {
  id: 'P43-staging-service-catalog',
  invariant: 'the configured Supabase integration target exposes exactly the six active NestScout service types declared by the shared contract',
  authority: [
    'governance/RULES.md #6',
    'governance/STRUCTURES.md §1',
  ],
  target: 'Supabase public.service_categories',
  layer: 'integration',
  siblings: ['P04-remote-snapshot-validation', 'P11-kael-routing-conformance'],
  mutation: 'filter the catalog query to the unsupported `appliance` service — PostgreSQL rejects the enum value and the query assertion turns red',
} as const satisfies PillarManifest

const resolution = await resolveOrAnnounceSkip(PILLAR.id)
const describeIntegration = resolution.ok ? describe : describe.skip

describeIntegration('staging service catalog', () => {
  it('matches the shared six-service contract', async () => {
    if (!resolution.ok) return

    const supabase = createClient<Database>(
      resolution.target.url,
      resolution.target.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: { fetch: boundedFetch },
      },
    )
    const { data, error } = await supabase
      .from('service_categories')
      .select('service_type')
      .eq('is_active', true)

    expect(
      error,
      pillarWhy(PILLAR, `catalog query error code: ${error?.code ?? 'none'}`),
    ).toBeNull()

    const actual = (data ?? []).map((row) => row.service_type).sort()
    const expected = [...SERVICE_TYPES].sort()

    expect(
      actual,
      pillarWhy(PILLAR, `active services: ${actual.join(', ') || '(none)'}`),
    ).toEqual(expected)
  }, 15_000)
})

async function boundedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

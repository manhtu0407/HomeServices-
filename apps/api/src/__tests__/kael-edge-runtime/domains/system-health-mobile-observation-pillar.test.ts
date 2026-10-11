import { describe, expect, it, vi } from 'vitest'

import { recordMobileHealthObservation } from '../../../../../../supabase/functions/mobile-api/_shared/domains/monitoring/mobile-health'
import type { MobileHealthObservationInput } from '../../../../../../supabase/functions/_shared/contracts/system-health'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/platform/auth'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P356-system-health-mobile-telemetry-rate-limit',
  invariant: 'The durable mobile health observation limit is keyed by authenticated user identity and cannot be bypassed by rotating the client-selected session id, while no raw user id reaches the database',
  authority: [
    'user-approved System Health Monitoring implementation plan',
    'governance/RULES.md Security Invariants (PII handling and rate limits)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/monitoring/mobile-health.ts; supabase/migrations/20261011100000_system_health_monitor.sql',
  layer: 'security-negative',
  siblings: ['P352-system-health-monitor-sql', 'P353-system-health-monitor-runtime'],
  mutation: 'derive the actor rate key from client_session_id or send the raw user id to the database and these distinct-session and privacy assertions fail',
} as const satisfies PillarManifest

const USER_ID = 'e3560000-0000-4000-8000-000000000001'
const SESSION_ONE = 'e3560000-0000-4000-8000-000000000002'
const SESSION_TWO = 'e3560000-0000-4000-8000-000000000003'
const SECRET = 'system-health-session-hash-secret-for-tests'

describe('System health mobile telemetry rate limit pillar', () => {
  it('derives a stable actor hash from authenticated identity across caller-selected sessions', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: true, error: null }))
    const ctx = {
      user: { id: USER_ID },
      environment: 'local',
      clientPlatform: 'ios',
      clientReleaseId: 'release-test',
      supabase: { rpc },
    } as unknown as MobileApiContext

    await recordMobileHealthObservation(ctx, observation(SESSION_ONE), SECRET)
    await recordMobileHealthObservation(ctx, observation(SESSION_TWO), SECRET)

    const firstArgs = rpc.mock.calls[0]?.[1] as Record<string, unknown> | undefined
    const secondArgs = rpc.mock.calls[1]?.[1] as Record<string, unknown> | undefined

    expect(firstArgs?.p_actor_hash).toMatch(/^[a-f0-9]{64}$/u)
    expect(secondArgs?.p_actor_hash).toBe(firstArgs?.p_actor_hash)
    expect(secondArgs?.p_session_hash).not.toBe(firstArgs?.p_session_hash)
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(USER_ID)
    expect(pillarWhy(PILLAR)).toContain('P356-system-health-mobile-telemetry-rate-limit')
  })
})

function observation(clientSessionId: string): MobileHealthObservationInput {
  return {
    client_session_id: clientSessionId,
    observed_at: new Date().toISOString(),
    api_status: 'green',
    reason_code: 'API_REACHABLE',
    duration_ms: 24,
  }
}

import { describe, expect, it } from 'vitest'

import {
  advanceAvailability,
  evaluateKaelErrorRate,
  evaluateSystemHealth,
  isSystemEvidenceFresh,
  mobileHealthObservationInputSchema,
  sanitizeSystemIncidentPacket,
  serializeSystemHealthSnapshot,
  systemHealthFingerprint,
} from '../contracts/system-health'
import * as sharedSystemHealthContract from '../contracts/system-health'
import * as edgeSystemHealthContract from '../../../../supabase/functions/_shared/contracts/system-health.ts'
import { pillarWhy, type PillarManifest } from './pillar-manifest'

export const PILLAR = {
  id: 'P351-system-health-monitor-contract',
  invariant: 'Health evidence stays non-green when missing or stale, incidents are allowlisted, and monitor thresholds never send inference traffic',
  authority: [
    'user-approved System Health Monitoring implementation plan',
    'governance/RULES.md #0 (backend and mobile runtime boundaries)',
    'governance/RULES.md #8 (honest evidence and bounded data)',
  ],
  target: 'packages/shared/src/contracts/system-health.ts; supabase/functions/system-monitor; scripts/system-monitor',
  layer: 'security-negative',
  siblings: ['P18-capability-registry-parity', 'P53-admin-team-system-contract'],
  mutation: 'remove expiry validation, change the 20-sample or 5%/20% threshold, or copy arbitrary incident metadata and these boundary assertions fail',
} as const satisfies PillarManifest

const now = Date.parse('2026-10-11T00:00:00.000Z')
describe('System health evidence contract', () => {
  it('applies red, yellow, gray, green priority and treats an empty component set as gray', () => {
    expect(evaluateSystemHealth([])).toBe('gray')
    expect(evaluateSystemHealth([{ status: 'green' }, { status: 'gray' }])).toBe('gray')
    expect(evaluateSystemHealth([{ status: 'yellow' }, { status: 'red' }, { status: 'gray' }])).toBe('red')
    expect(evaluateSystemHealth([{ status: 'green' }, { status: 'yellow' }])).toBe('yellow')
    expect(evaluateSystemHealth([{ status: 'green' }])).toBe('green')
  })

  it.each([
    ['179 seconds', '2026-10-10T23:57:01.000Z', true],
    ['180 seconds', '2026-10-10T23:57:00.000Z', true],
    ['181 seconds', '2026-10-10T23:56:59.000Z', false],
    ['future timestamp', '2026-10-11T00:00:01.000Z', false],
    ['missing timestamp', null, false],
    ['invalid timestamp', 'not-a-date', false],
  ])('checks freshness at the %s boundary', (_label, observed, fresh) => {
    expect(isSystemEvidenceFresh(observed, now)).toBe(fresh)
  })

  it('opens availability after two failures and requires two successes to recover', () => {
    const initial = { status: 'green' as const, consecutive_failures: 0, consecutive_successes: 0 }
    const firstFailure = advanceAvailability(initial, 'failure')
    expect(firstFailure).toMatchObject({ status: 'yellow', consecutive_failures: 1 })
    const secondFailure = advanceAvailability(firstFailure, 'failure')
    expect(secondFailure).toMatchObject({ status: 'red', consecutive_failures: 2 })
    expect(advanceAvailability(secondFailure, 'success')).toMatchObject({ status: 'red', consecutive_successes: 1 })
    expect(advanceAvailability(advanceAvailability(secondFailure, 'success'), 'success')).toMatchObject({ status: 'green', consecutive_successes: 2 })
    expect(advanceAvailability(secondFailure, 'unknown').status).toBe('gray')
  })

  it('keeps samples below twenty statistically inconclusive and applies exact rate thresholds', () => {
    expect(evaluateKaelErrorRate({ failureCount: 19, sampleCount: 19 })).toMatchObject({ status: 'gray', errorRate: null, reasonCode: 'INSUFFICIENT_SAMPLE' })
    expect(evaluateKaelErrorRate({ failureCount: 1, sampleCount: 20 })).toMatchObject({ status: 'yellow', errorRate: 0.05 })
    expect(evaluateKaelErrorRate({ failureCount: 4, sampleCount: 20 })).toMatchObject({ status: 'yellow', errorRate: 0.2, redEvaluations: 1 })
    expect(evaluateKaelErrorRate({ failureCount: 4, sampleCount: 20, previousRedEvaluations: 1 })).toMatchObject({ status: 'red', redEvaluations: 2 })
    expect(evaluateKaelErrorRate({ failureCount: 0, sampleCount: 20 }).status).toBe('green')
    expect(evaluateKaelErrorRate({ failureCount: 21, sampleCount: 20 }).status).toBe('gray')
  })

  it('rejects mobile observations whose API status contradicts the reason code', () => {
    const observation = {
      client_session_id: '123e4567-e89b-42d3-a456-426614174000',
      observed_at: '2026-10-11T00:00:00.000Z',
      api_status: 'green' as const,
      reason_code: 'API_REACHABLE' as const,
      duration_ms: 120,
    }
    expect(mobileHealthObservationInputSchema.safeParse(observation).success).toBe(true)
    expect(mobileHealthObservationInputSchema.safeParse({ ...observation, reason_code: 'API_NETWORK_ERROR' }).success).toBe(false)
    expect(mobileHealthObservationInputSchema.safeParse({ ...observation, api_status: 'yellow' }).success).toBe(false)
  })

  it('normalizes a stable resource fingerprint without including arbitrary data', () => {
    expect(systemHealthFingerprint('PRODUCTION', 'Backend API', 'edge-availability', 'project:abc')).toBe('production:backend_api:edge-availability:project_abc')
  })

  it('re-exports the canonical shared contract for the Edge runtime', () => {
    const shared = sharedSystemHealthContract as unknown as Record<string, unknown>
    const edge = edgeSystemHealthContract as unknown as Record<string, unknown>
    expect(Object.keys(edge).sort()).toEqual(Object.keys(shared).sort())
    for (const key of Object.keys(shared)) expect(edge[key]).toBe(shared[key])
  })

  it('drops nested PII and secret sentinels from incident packets', () => {
    const packet = sanitizeSystemIncidentPacket({
      incident_id: 'incident_000001', fingerprint: 'prod:api:edge:project', component: 'backend', detector: 'edge_availability',
      severity: 'red', status: 'open', opened_at: '2026-10-10T23:00:00Z', updated_at: '2026-10-10T23:01:00Z',
      reason_code: 'EDGE_UNAVAILABLE', trace_id: 'trace_01',
      customer: { email: 'sentinel@example.com', phone: '+84900000000', otp: '123456', token: 'secret-token', chat: 'private chat' },
      safe_metadata: { api_key: 'sentinel-secret' },
    })
    expect(packet).not.toBeNull()
    expect(JSON.stringify(packet)).not.toMatch(/sentinel|example\.com|84900000000|123456|private chat|api_key/i)
    expect(packet).toMatchObject({ reason_code: 'EDGE_UNAVAILABLE', trace_id: 'trace_01', build_id: null, platform: null })
  })

  it('rejects invalid or oversized snapshots instead of truncating required evidence', () => {
    const snapshot = {
      schema_version: 1 as const, environment: 'production' as const, project_ref: 'abcdefgh1234', release_id: null,
      scheduled_at: '2026-10-11T00:00:00.000Z', completed_at: '2026-10-11T00:00:01.000Z', expires_at: '2026-10-11T00:03:01.000Z',
      overall_status: 'gray' as const, checks: [],
    }
    expect(serializeSystemHealthSnapshot(snapshot)).not.toBeNull()
    expect(serializeSystemHealthSnapshot({ ...snapshot, completed_at: 'soon' })).toBeNull()
    const oversized = { ...snapshot, checks: Array.from({ length: 32 }, (_, index) => ({
      check_id: `check-${index}`, component: 'app', status: 'gray' as const, reason_code: 'SOURCE_UNAVAILABLE',
      observed_at: snapshot.completed_at, evidence_window: null, sample_count: null, metrics: { detail: true }, incident_id: null,
    })) }
    expect(serializeSystemHealthSnapshot(oversized)).toBeNull()
    expect(pillarWhy(PILLAR)).toContain('P351-system-health-monitor-contract')
  })
})

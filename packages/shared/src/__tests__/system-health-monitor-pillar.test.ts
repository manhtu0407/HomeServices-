import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  target: 'packages/shared/src/contracts/system-health.ts; supabase/functions/_shared/contracts/system-health.ts; supabase/functions/system-monitor; scripts/system-monitor',
  layer: 'security-negative',
  siblings: ['P18-capability-registry-parity', 'P53-admin-team-system-contract'],
  mutation: 'import the Edge contract from packages/shared, remove expiry validation, change the 20-sample or 5%/20% threshold, or copy arbitrary incident metadata and these assertions fail',
} as const satisfies PillarManifest

const now = Date.parse('2026-10-11T00:00:00.000Z')
const edgeContractSource = readFileSync(
  resolve(__dirname, '../../../../supabase/functions/_shared/contracts/system-health.ts'),
  'utf8',
)
describe('System health evidence contract', () => {
  it('applies red, yellow, gray, green priority and treats an empty component set as gray', () => {
    expect(evaluateSystemHealth([])).toBe('gray')
    expect(evaluateSystemHealth([{ check_id: 'a', status: 'green' }, { check_id: 'b', status: 'gray' }])).toBe('gray')
    expect(evaluateSystemHealth([{ check_id: 'a', status: 'yellow' }, { check_id: 'b', status: 'red' }, { check_id: 'c', status: 'gray' }])).toBe('red')
    expect(evaluateSystemHealth([{ check_id: 'a', status: 'green' }, { check_id: 'b', status: 'yellow' }])).toBe('yellow')
    expect(evaluateSystemHealth([{ check_id: 'a', status: 'green' }])).toBe('green')
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

  it('keeps Edge and Shared contract twins behaviorally aligned without a cross-runtime import', () => {
    expect(edgeContractSource).not.toMatch(/from\s+['"][^'"]*packages\/shared/u)

    const edge = edgeSystemHealthContract
    const shared = sharedSystemHealthContract
    const snapshot = {
      schema_version: 1,
      environment: 'production',
      project_ref: 'abcdefgh1234',
      release_id: null,
      scheduled_at: '2026-10-11T00:00:00.000Z',
      completed_at: '2026-10-11T00:00:01.000Z',
      expires_at: '2026-10-11T00:03:01.000Z',
      overall_status: 'gray',
      checks: [],
    }
    const invalidSnapshot = { ...snapshot, completed_at: 'soon' }
    const check = {
      check_id: 'backend-core',
      component: 'backend',
      status: 'gray',
      reason_code: 'EVIDENCE_MISSING',
      observed_at: null,
      evidence_window: null,
      sample_count: null,
      metrics: { db_ok: null },
      incident_id: null,
    }
    const observation = {
      client_session_id: '123e4567-e89b-42d3-a456-426614174000',
      observed_at: '2026-10-11T00:00:00.000Z',
      api_status: 'green',
      reason_code: 'API_REACHABLE',
      duration_ms: 120,
    }
    const profileSnapshot = {
      ...snapshot,
      schema_version: 2,
      profile_id: 'cloudflare-admin-v1',
      required_check_ids: ['backend-core'],
      coverage_gaps: ['app-crash'],
      checks: [check],
    }
    const invalidProfileSnapshot = { ...profileSnapshot, profile_id: 'unknown-profile' }
    const invalidCoverageSnapshot = { ...profileSnapshot, coverage_gaps: ['sentry'] }

    expect(edge.systemHealthSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(shared.systemHealthSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(edge.systemHealthSnapshotSchema.safeParse(profileSnapshot).success).toBe(true)
    expect(shared.systemHealthSnapshotSchema.safeParse(profileSnapshot).success).toBe(true)
    expect(edge.systemHealthSnapshotSchema.safeParse(invalidProfileSnapshot).success).toBe(false)
    expect(shared.systemHealthSnapshotSchema.safeParse(invalidProfileSnapshot).success).toBe(false)
    expect(edge.systemHealthSnapshotSchema.safeParse(invalidCoverageSnapshot).success).toBe(false)
    expect(shared.systemHealthSnapshotSchema.safeParse(invalidCoverageSnapshot).success).toBe(false)
    expect(edge.systemHealthSnapshotSchema.safeParse(invalidSnapshot).success).toBe(false)
    expect(shared.systemHealthSnapshotSchema.safeParse(invalidSnapshot).success).toBe(false)
    expect(Object.keys(edge).sort()).toEqual(Object.keys(shared).sort())
    expect(edge.systemHealthStatusSchema.safeParse('green').success).toBe(shared.systemHealthStatusSchema.safeParse('green').success)
    expect(edge.systemHealthStatusSchema.safeParse('purple').success).toBe(shared.systemHealthStatusSchema.safeParse('purple').success)
    expect(edge.systemHealthCheckSchema.safeParse(check).success).toBe(shared.systemHealthCheckSchema.safeParse(check).success)
    expect(edge.mobileHealthObservationInputSchema.safeParse(observation).success).toBe(true)
    expect(shared.mobileHealthObservationInputSchema.safeParse(observation).success).toBe(true)
    expect(edge.evaluateSystemHealth([{ check_id: 'a', status: 'green' }, { check_id: 'b', status: 'gray' }])).toBe(shared.evaluateSystemHealth([{ check_id: 'a', status: 'green' }, { check_id: 'b', status: 'gray' }]))
    expect(edge.advanceAvailability({ status: 'green', consecutive_failures: 0, consecutive_successes: 0 }, 'failure'))
      .toEqual(shared.advanceAvailability({ status: 'green', consecutive_failures: 0, consecutive_successes: 0 }, 'failure'))
    expect(edge.evaluateKaelErrorRate({ failureCount: 4, sampleCount: 20, previousRedEvaluations: 1 }))
      .toEqual(shared.evaluateKaelErrorRate({ failureCount: 4, sampleCount: 20, previousRedEvaluations: 1 }))
    expect(edge.isSystemEvidenceFresh('2026-10-10T23:57:00.000Z', now, 180_000))
      .toBe(shared.isSystemEvidenceFresh('2026-10-10T23:57:00.000Z', now, 180_000))
    expect(edge.systemHealthFingerprint('PRODUCTION', 'Backend API', 'edge-availability', 'project:abc'))
      .toBe(shared.systemHealthFingerprint('PRODUCTION', 'Backend API', 'edge-availability', 'project:abc'))
    expect(edge.serializeSystemHealthSnapshot(snapshot)).toBe(shared.serializeSystemHealthSnapshot(snapshot))
    expect(edge.sanitizeSystemIncidentPacket({
      incident_id: 'incident_000001', fingerprint: 'prod:api:edge:project', component: 'backend', detector: 'edge_availability',
      severity: 'red', status: 'open', opened_at: '2026-10-10T23:00:00Z', updated_at: '2026-10-10T23:01:00Z',
      reason_code: 'EDGE_UNAVAILABLE', customer: { email: 'sentinel@example.com', token: 'sentinel-secret' },
    })).toEqual(shared.sanitizeSystemIncidentPacket({
      incident_id: 'incident_000001', fingerprint: 'prod:api:edge:project', component: 'backend', detector: 'edge_availability',
      severity: 'red', status: 'open', opened_at: '2026-10-10T23:00:00Z', updated_at: '2026-10-10T23:01:00Z',
      reason_code: 'EDGE_UNAVAILABLE', customer: { email: 'sentinel@example.com', token: 'sentinel-secret' },
    }))
    const appIncident = {
      incident_id: 'incident_000002', fingerprint: 'prod:app:heartbeat:release', component: 'app', detector: 'native_connectivity',
      severity: 'yellow', status: 'open', opened_at: '2026-10-10T23:00:00Z', updated_at: '2026-10-10T23:01:00Z',
      reason_code: 'NATIVE_EVIDENCE_STALE',
    }
    expect(edge.sanitizeSystemIncidentPacket(appIncident)).toEqual(shared.sanitizeSystemIncidentPacket(appIncident))
    expect(JSON.stringify(shared.sanitizeSystemIncidentPacket(appIncident))).not.toMatch(/sentry|telegram/iu)
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

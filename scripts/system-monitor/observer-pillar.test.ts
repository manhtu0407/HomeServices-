import { env } from 'cloudflare:workers'
import { beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'

import { isSystemHealthObserverConfigured, runSystemHealthObserver, type SystemHealthObserverEnv } from './observer'
import { pillarWhy, type PillarManifest } from '../../packages/shared/src/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P354-system-health-cloudflare-observer-d1',
  invariant: 'Cloudflare observer stores fresh v2 evidence and outage history in real D1 without alert-provider calls, while scheduled ticks are fenced and incident recurrences keep separate identities',
  authority: [
    'user-approved System Health Monitoring implementation plan',
    'governance/RULES.md #8 (bounded evidence and honest health state)',
  ],
  target: 'scripts/system-monitor/observer.ts; scripts/system-monitor/migrations/0002_observer_occurrences_and_ticks.sql',
  layer: 'integration',
  siblings: ['P351-system-health-monitor-contract', 'P352-system-health-monitor-sql', 'P353-system-health-monitor-runtime'],
  mutation: 'remove the D1 tick fence, recurrence index, profile validation, or outage ledger writes and the corresponding local D1 behavior assertions fail',
} as const satisfies PillarManifest

const TEST_NOW = Date.parse('2026-10-11T12:00:00.000Z')
const projectRef = 'abcdefgh'

beforeAll(async () => {
  const migration = inject<string>('systemMonitorD1Migration')
  const current = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'monitor_ticks'")
    .first<{ name: string }>()
  if (current) return
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM monitor_ticks').run()
  await env.DB.prepare('DELETE FROM monitor_outage_events').run()
  await env.DB.prepare('DELETE FROM monitor_incidents').run()
  await env.DB.prepare("UPDATE monitor_state SET current_outage_id = NULL, current_outage_reason = NULL, current_outage_opened_at = NULL, current_outage_synced = 0, last_snapshot_at = NULL, last_cleanup_at = NULL, last_completed_at = NULL, last_error_code = NULL, updated_at = ? WHERE singleton_id = 1")
    .bind(new Date(TEST_NOW).toISOString()).run()
})

describe('Cloudflare system health observer with local D1', () => {
  it('reads only the v2 Cloudflare profile and does not call deferred providers', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'app-native-connectivity',
      component: 'app',
      status: 'gray',
      reason_code: 'NATIVE_SESSION_EVIDENCE_MISSING',
      incident_id: null,
    }]))
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })

    expect(fixture.requests.map((request) => request.search)).toContain('?schema_version=2')
    expect(fixture.requests.every((request) => request.host === 'abcdefgh.supabase.co')).toBe(true)
    expect(fixture.requests.some((request) => /sentry|telegram/iu.test(request.host + request.path))).toBe(false)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM monitor_incidents').first<{ count: number }>()).toEqual({ count: 0 })
  })

  it('fails configuration closed when the expected profile does not match the release profile', () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW, []))
    expect(isSystemHealthObserverConfigured(fixture.config)).toBe(true)
    expect(isSystemHealthObserverConfigured({
      ...fixture.config,
      SYSTEM_HEALTH_PROFILE_ID: 'unrecognized-profile',
    })).toBe(false)
  })

  it('stores an open incident and resolves it only after a fresh green detector result', async () => {
    let current = makeSnapshot(TEST_NOW, [{
      check_id: 'kael-agentic', component: 'kael', status: 'yellow', reason_code: 'ERROR_RATE_ELEVATED', incident_id: 'incident_kael_000001',
    }])
    const fixture = createFixture(() => current)
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })
    let incident = await env.DB.prepare('SELECT incident_id, status, resolved_at FROM monitor_incidents WHERE incident_id = ?')
      .bind('incident_kael_000001').first<{ incident_id: string; status: string; resolved_at: string | null }>()
    expect(incident).toMatchObject({ status: 'open', resolved_at: null })

    current = makeSnapshot(TEST_NOW + 60_000, [{
      check_id: 'kael-agentic', component: 'kael', status: 'gray', reason_code: 'NO_RECENT_AI_ACTIVITY', incident_id: 'incident_kael_000001',
    }])
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000), scheduledTime: TEST_NOW + 60_000 })
    incident = await env.DB.prepare('SELECT incident_id, status, resolved_at FROM monitor_incidents WHERE incident_id = ?')
      .bind('incident_kael_000001').first<{ incident_id: string; status: string; resolved_at: string | null }>()
    expect(incident).toMatchObject({ status: 'open', resolved_at: null })

    current = makeSnapshot(TEST_NOW + 120_000, [{
      check_id: 'kael-agentic', component: 'kael', status: 'green', reason_code: 'ERROR_RATE_WITHIN_RANGE', incident_id: null,
    }])
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 120_000), scheduledTime: TEST_NOW + 120_000 })
    incident = await env.DB.prepare('SELECT incident_id, status, resolved_at FROM monitor_incidents WHERE incident_id = ?')
      .bind('incident_kael_000001').first<{ incident_id: string; status: string; resolved_at: string | null }>()
    expect(incident).toMatchObject({ status: 'resolved', resolved_at: new Date(TEST_NOW + 120_000).toISOString() })
  })

  it('keeps separate D1 rows for a new occurrence after a resolved fingerprint recurs', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_backend_0001',
    }]))
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })
    fixture.snapshot = () => makeSnapshot(TEST_NOW + 60_000, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'green', reason_code: 'EDGE_AVAILABLE', incident_id: null,
    }])
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000), scheduledTime: TEST_NOW + 60_000 })
    fixture.snapshot = () => makeSnapshot(TEST_NOW + 120_000, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_backend_0002',
    }])
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 120_000), scheduledTime: TEST_NOW + 120_000 })

    const rows = await env.DB.prepare('SELECT incident_id, status FROM monitor_incidents WHERE fingerprint = ? ORDER BY opened_at')
      .bind('production:backend:backend-edge-availability').all<{ incident_id: string; status: string }>()
    expect(rows.results).toEqual([
      { incident_id: 'incident_backend_0001', status: 'resolved' },
      { incident_id: 'incident_backend_0002', status: 'open' },
    ])
  })

  it('records outage and recovery events in D1 and syncs both with one external incident ID', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW + 60_000, [{
      check_id: 'backend-database-availability', component: 'backend', status: 'green', reason_code: 'DATABASE_READ_SUCCEEDED', incident_id: null,
    }]))
    fixture.failSupabase = true
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })
    const opened = await env.DB.prepare("SELECT external_incident_id, event_kind, sync_status FROM monitor_outage_events WHERE event_kind = 'opened'")
      .first<{ external_incident_id: string; event_kind: string; sync_status: string }>()
    expect(opened).toMatchObject({ event_kind: 'opened', sync_status: 'pending' })

    fixture.failSupabase = false
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000), scheduledTime: TEST_NOW + 60_000 })
    expect(fixture.externalIncidents.map((item) => item.status)).toEqual(['open', 'resolved'])
    expect(fixture.externalIncidents[0].external_incident_id).toBe(opened?.external_incident_id)
    const events = await env.DB.prepare('SELECT event_kind, sync_status FROM monitor_outage_events ORDER BY recorded_at, event_kind')
      .all<{ event_kind: string; sync_status: string }>()
    expect(events.results.map((event) => event.event_kind)).toEqual(['opened', 'resolved'])
    expect(events.results.every((event) => event.sync_status === 'synced')).toBe(true)
  })

  it.each([179_000, 180_000, 181_000])('expires snapshot at the exact boundary (%i ms)', async (ageMs) => {
    const now = TEST_NOW + 240_000
    const fixture = createFixture(() => makeSnapshot(now - ageMs, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'green', reason_code: 'EDGE_AVAILABLE', incident_id: null,
    }]))
    const result = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(now), scheduledTime: now })

    expect(result.outageReason).toBe(ageMs >= 180_000 ? 'SNAPSHOT_STALE' : null)
    expect(result.snapshotStatus).toBe(ageMs >= 180_000 ? 'unavailable' : 'fresh')
  })

  it('rejects a v2 snapshot that claims green while a required check is red', async () => {
    const snapshot = makeSnapshot(TEST_NOW, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_forged_001',
    }])
    snapshot.overall_status = 'green'
    const fixture = createFixture(() => snapshot)

    const result = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })

    expect(result.outageReason).toBe('SNAPSHOT_INVALID')
    expect(result.snapshotStatus).toBe('unavailable')
  })

  it('rejects a legacy v1 profile and missing required evidence as gray coverage failures', async () => {
    const legacy = makeSnapshot(TEST_NOW, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'green', reason_code: 'EDGE_AVAILABLE', incident_id: null,
    }])
    legacy.schema_version = 1
    delete legacy.profile_id
    delete legacy.required_check_ids
    delete legacy.coverage_gaps
    const legacyFixture = createFixture(() => legacy)
    const legacyResult = await runSystemHealthObserver(legacyFixture.config, { fetcher: legacyFixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })
    expect(legacyResult.outageReason).toBe('PROFILE_UNAVAILABLE')

    const missing = makeSnapshot(TEST_NOW + 60_000, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'gray', reason_code: 'REQUIRED_CHECK_MISSING', incident_id: null,
    }])
    missing.required_check_ids = ['backend-edge-availability', 'backend-database-availability']
    const missingFixture = createFixture(() => missing)
    const missingResult = await runSystemHealthObserver(missingFixture.config, { fetcher: missingFixture.fetcher, now: () => new Date(TEST_NOW + 60_000), scheduledTime: TEST_NOW + 60_000 })
    expect(missingResult.outageReason).toBe('REQUIRED_CHECK_MISSING')
    expect(missingResult.snapshotStatus).toBe('unavailable')
    expect((await env.DB.prepare('SELECT current_outage_reason FROM monitor_state WHERE singleton_id = 1')
      .first<{ current_outage_reason: string }>())?.current_outage_reason).toBe('REQUIRED_CHECK_MISSING')
  })

  it('rejects future completion and observation timestamps', async () => {
    const future = makeSnapshot(TEST_NOW + 31_000, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'green', reason_code: 'EDGE_AVAILABLE', incident_id: null,
    }])
    const fixture = createFixture(() => future)
    const result = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })
    expect(result.outageReason).toBe('SNAPSHOT_STALE')
  })

  it('accepts only one run for the same minute slot', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_duplicate_001',
    }]))
    const first = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })
    const duplicate = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 10_000), scheduledTime: TEST_NOW })

    expect(first.snapshotStatus).toBe('fresh')
    expect(duplicate).toMatchObject({ skipped: 'DUPLICATE_TICK' })
    expect(fixture.requests.filter((request) => request.path.endsWith('/latest'))).toHaveLength(1)
    const tick = await env.DB.prepare('SELECT fencing_token, outcome FROM monitor_ticks WHERE scheduled_at = ?')
      .bind(new Date(TEST_NOW).toISOString()).first<{ fencing_token: number; outcome: string }>()
    expect(tick).toEqual({ fencing_token: 1, outcome: 'completed' })
  })

  it('takes over an expired lease with a higher fencing token', async () => {
    const scheduledAt = new Date(TEST_NOW).toISOString()
    await env.DB.prepare("INSERT INTO monitor_ticks (scheduled_at, owner_id, fencing_token, lease_until, completed_at, outcome, updated_at) VALUES (?, ?, 1, ?, NULL, NULL, ?)")
      .bind(scheduledAt, 'old-owner', new Date(TEST_NOW + 45_000).toISOString(), new Date(TEST_NOW).toISOString()).run()
    const fixture = createFixture(() => makeSnapshot(TEST_NOW + 46_000, [{
      check_id: 'backend-edge-availability', component: 'backend', status: 'green', reason_code: 'EDGE_AVAILABLE', incident_id: null,
    }]))
    const result = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 46_000), scheduledTime: TEST_NOW })
    expect(result.snapshotStatus).toBe('fresh')
    const tick = await env.DB.prepare('SELECT owner_id, fencing_token, outcome FROM monitor_ticks WHERE scheduled_at = ?')
      .bind(scheduledAt).first<{ owner_id: string; fencing_token: number; outcome: string }>()
    expect(tick).toMatchObject({ fencing_token: 2, outcome: 'completed' })
    expect(tick?.owner_id).not.toBe('old-owner')
  })

  it('prunes only completed or expired D1 ticks older than seven days', async () => {
    const oldTickAt = new Date(TEST_NOW - 8 * 24 * 60 * 60_000).toISOString()
    await env.DB.prepare("INSERT INTO monitor_ticks (scheduled_at, owner_id, fencing_token, lease_until, completed_at, outcome, updated_at) VALUES (?, ?, 1, ?, ?, 'completed', ?)")
      .bind(oldTickAt, 'old-owner', oldTickAt, oldTickAt, oldTickAt).run()
    const now = TEST_NOW + 10 * 24 * 60 * 60_000
    const fixture = createFixture(() => makeSnapshot(now, [
      { check_id: 'backend-edge-availability', component: 'backend', status: 'green', reason_code: 'EDGE_AVAILABLE', incident_id: null },
    ]))

    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(now), scheduledTime: now })

    expect(await env.DB.prepare('SELECT scheduled_at FROM monitor_ticks WHERE scheduled_at = ?').bind(oldTickAt).first()).toBeNull()
    expect(await env.DB.prepare('SELECT outcome FROM monitor_ticks WHERE scheduled_at = ?')
      .bind(new Date(now).toISOString()).first<{ outcome: string }>()).toEqual({ outcome: 'completed' })
  })

  it('reports D1 failure to Supabase without claiming persistence or using an alert provider', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'app-native-connectivity', component: 'app', status: 'red', reason_code: 'API_HTTP_5XX', incident_id: 'incident_app_000001',
    }]))
    const brokenConfig = { ...fixture.config, DB: { prepare() { throw new Error('unavailable') } } } as unknown as SystemHealthObserverEnv

    const result = await runSystemHealthObserver(brokenConfig, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), scheduledTime: TEST_NOW })

    expect(result.d1Status).toBe('gray')
    expect(fixture.heartbeats.at(-1)).toMatchObject({ d1_status: 'gray' })
    expect(fixture.requests.some((request) => request.host === 'api.telegram.org' || request.host.endsWith('.sentry.io'))).toBe(false)
  })
})

pillarWhy(PILLAR)

function makeSnapshot(completedAt: number, checks: Array<{
  check_id: string
  component: string
  status: 'green' | 'yellow' | 'red' | 'gray'
  reason_code: string
  incident_id: string | null
}>): Record<string, unknown> {
  const requiredIds = checks.map((check) => check.check_id)
  const overallStatus = checks.some((check) => check.status === 'red')
    ? 'red'
    : checks.some((check) => check.status === 'yellow')
      ? 'yellow'
      : checks.some((check) => check.status === 'gray') || checks.length === 0 ? 'gray' : 'green'
  return {
    schema_version: 2,
    profile_id: 'cloudflare-admin-v1',
    required_check_ids: requiredIds.length > 0 ? requiredIds : ['backend-edge-availability'],
    coverage_gaps: ['app-crash', 'push-notifications'],
    environment: 'production',
    project_ref: projectRef,
    release_id: 'release-test-2026.10.11',
    scheduled_at: new Date(completedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    expires_at: new Date(completedAt + 180_000).toISOString(),
    overall_status: overallStatus,
    checks: checks.map((check) => ({ ...check, metrics: {}, observed_at: new Date(completedAt).toISOString(), evidence_window: null, sample_count: 1 })),
  }
}

function createFixture(snapshot: () => Record<string, unknown>) {
  const fixture = {
    config: {
      DB: env.DB,
      SUPABASE_HEALTH_URL: 'https://abcdefgh.supabase.co',
      SYSTEM_HEALTH_OBSERVER_SECRET: 'system-health-observer-test-secret-0001',
      SYSTEM_HEALTH_ENVIRONMENT: 'production',
      SYSTEM_HEALTH_EXPECTED_PROJECT_REF: projectRef,
      SYSTEM_HEALTH_PROFILE_ID: 'cloudflare-admin-v1',
      TELEGRAM_BOT_TOKEN: 'must-not-be-used',
      SENTRY_HEALTH_READ_TOKEN: 'must-not-be-used',
    } as unknown as SystemHealthObserverEnv,
    requests: [] as Array<{ host: string; path: string; search: string; method: string; body: unknown }>,
    externalIncidents: [] as Array<{ external_incident_id: string; status: string }>,
    heartbeats: [] as Array<Record<string, unknown>>,
    failSupabase: false,
    snapshot,
    async fetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null
      fixture.requests.push({ host: url.hostname, path: url.pathname, search: url.search, method: init?.method ?? 'GET', body })
      if (url.hostname !== 'abcdefgh.supabase.co') throw new Error('OUTBOUND_REQUEST_BLOCKED')
      if (url.pathname.endsWith('/latest')) {
        if (fixture.failSupabase) throw new Error('connection refused')
        return Response.json({ snapshot: fixture.snapshot() })
      }
      if (url.pathname.endsWith('/outage')) {
        if (fixture.failSupabase) return new Response('{}', { status: 503 })
        fixture.externalIncidents.push(body as { external_incident_id: string; status: string })
        return Response.json({ ok: true })
      }
      if (url.pathname.endsWith('/heartbeat')) {
        fixture.heartbeats.push(body as Record<string, unknown>)
        return Response.json({ ok: true })
      }
      throw new Error('UNEXPECTED_OUTBOUND_REQUEST')
    },
  }
  return fixture
}

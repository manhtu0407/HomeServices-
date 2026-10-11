import { env } from 'cloudflare:workers'
import { beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'

import { runSystemHealthObserver, type SystemHealthObserverEnv } from './observer'
import { pillarWhy, type PillarManifest } from '../../packages/shared/src/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P354-system-health-cloudflare-observer-d1',
  invariant: 'Cloudflare observer notifications remain deduplicated and recoverable across real D1-backed scheduled ticks while stale snapshots and missing D1 fail closed',
  authority: [
    'user-approved System Health Monitoring implementation plan',
    'governance/RULES.md #8 (bounded evidence and honest health state)',
  ],
  target: 'scripts/system-monitor/observer.ts; scripts/system-monitor/migrations/0001_initial.sql',
  layer: 'integration',
  siblings: ['P351-system-health-monitor-contract', 'P352-system-health-monitor-sql', 'P353-system-health-monitor-runtime'],
  mutation: 'remove the D1 delivery claim or the D1 incident lifecycle update and duplicate alert or recovery assertions fail',
} as const satisfies PillarManifest

const TEST_NOW = Date.parse('2026-10-11T12:00:00.000Z')
const projectRef = 'abcdefgh'

beforeAll(async () => {
  const migration = inject<string>('systemMonitorD1Migration')
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM monitor_deliveries').run()
  await env.DB.prepare('DELETE FROM monitor_incidents').run()
  await env.DB.prepare(
    `UPDATE monitor_state SET current_outage_id = NULL, current_outage_reason = NULL, current_outage_opened_at = NULL,
     current_outage_synced = 0, last_snapshot_at = NULL, last_cleanup_at = NULL, updated_at = ? WHERE singleton_id = 1`,
  ).bind(new Date(TEST_NOW).toISOString()).run()
})

describe('Cloudflare system health observer with local D1', () => {
  it('uses real D1 state to suppress duplicate Telegram alerts across scheduled ticks', async () => {
    const incidentSnapshot = makeSnapshot(TEST_NOW, [{
      check_id: 'backend-core', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_00000001',
    }])
    const fixture = createFixture(() => incidentSnapshot)

    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) })
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000) })

    expect(fixture.telegramMessages).toHaveLength(1)
    expect(fixture.telegramMessages[0]).toContain('incident_00000001')
    expect(fixture.telegramMessages[0]).toContain('Backend')
    expect(fixture.telegramMessages[0]).not.toMatch(/secret|email|phone|address|chat/iu)
    const deliveries = await env.DB.prepare('SELECT delivery_key, status FROM monitor_deliveries').all<{ delivery_key: string; status: string }>()
    expect(deliveries.results).toEqual([{ delivery_key: 'incident:incident_00000001:open', status: 'sent' }])
  })

  it('sends one recovery and closes the D1 incident when a fresh snapshot clears it', async () => {
    const active = makeSnapshot(TEST_NOW, [{
      check_id: 'kael-agentic', component: 'kael', status: 'yellow', reason_code: 'ERROR_RATE_ELEVATED', incident_id: 'incident_kael_000001',
    }])
    let currentSnapshot = active
    const fixture = createFixture(() => currentSnapshot)
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) })
    currentSnapshot = makeSnapshot(TEST_NOW + 60_000, [{
      check_id: 'kael-agentic', component: 'kael', status: 'green', reason_code: 'ERROR_RATE_WITHIN_RANGE', incident_id: null,
    }])
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000) })
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 120_000) })

    expect(fixture.telegramMessages).toHaveLength(2)
    expect(fixture.telegramMessages[1]).toContain('Đã phục hồi')
    const incident = await env.DB.prepare('SELECT status FROM monitor_incidents WHERE incident_id = ?')
      .bind('incident_kael_000001').first<{ status: string }>()
    expect(incident?.status).toBe('resolved')
  })

  it('keeps an incident open when the next snapshot has gray or missing evidence', async () => {
    const active = makeSnapshot(TEST_NOW, [{
      check_id: 'backend-core', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_missing_001',
    }])
    let currentSnapshot = active
    const fixture = createFixture(() => currentSnapshot)
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) })
    currentSnapshot = makeSnapshot(TEST_NOW + 60_000, [{
      check_id: 'backend-core', component: 'backend', status: 'gray', reason_code: 'EDGE_EVIDENCE_MISSING', incident_id: 'incident_missing_001',
    }])
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000) })

    const incident = await env.DB.prepare('SELECT status, resolved_at FROM monitor_incidents WHERE incident_id = ?')
      .bind('incident_missing_001').first<{ status: string; resolved_at: string | null }>()
    expect(incident).toEqual({ status: 'open', resolved_at: null })
    expect(fixture.telegramMessages).toHaveLength(1)
  })

  it('alerts on missing Sentry coverage while leaving ordinary no-activity gray unalerted', async () => {
    const sentryFixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'app-native-sentry', component: 'app', status: 'gray', reason_code: 'SENTRY_SOURCE_UNAVAILABLE', incident_id: null, metrics: { sentry_errors: null },
    }]))
    await runSystemHealthObserver(sentryFixture.config, { fetcher: sentryFixture.fetcher, now: () => new Date(TEST_NOW) })

    expect(sentryFixture.telegramMessages).toHaveLength(1)
    expect(sentryFixture.telegramMessages[0]).toContain('SENTRY_SOURCE_UNAVAILABLE')
    const coverageIncident = await env.DB.prepare('SELECT component, severity, status, reason_code FROM monitor_incidents WHERE fingerprint = ?')
      .bind('production:app:app-sentry-coverage')
      .first<{ component: string; severity: string; status: string; reason_code: string }>()
    expect(coverageIncident).toEqual({ component: 'app', severity: 'yellow', status: 'open', reason_code: 'SENTRY_SOURCE_UNAVAILABLE' })

    await env.DB.prepare('DELETE FROM monitor_deliveries').run()
    await env.DB.prepare('DELETE FROM monitor_incidents').run()
    let currentAppSnapshot = makeSnapshot(TEST_NOW, [{
      check_id: 'app-native-sentry', component: 'app', status: 'yellow', reason_code: 'NATIVE_API_DEGRADED', incident_id: null,
      metrics: { api_failures: 1, sentry_errors: null },
    }])
    const degradedFixture = createFixture(() => currentAppSnapshot)
    await runSystemHealthObserver(degradedFixture.config, { fetcher: degradedFixture.fetcher, now: () => new Date(TEST_NOW) })
    currentAppSnapshot = makeSnapshot(TEST_NOW + 60_000, [{
      check_id: 'app-native-sentry', component: 'app', status: 'yellow', reason_code: 'NATIVE_API_DEGRADED', incident_id: null,
      metrics: { api_failures: 1, sentry_errors: 0 },
    }])
    await runSystemHealthObserver(degradedFixture.config, { fetcher: degradedFixture.fetcher, now: () => new Date(TEST_NOW + 60_000) })
    const recoveredCoverage = await env.DB.prepare('SELECT status, resolved_at FROM monitor_incidents WHERE fingerprint = ?')
      .bind('production:app:app-sentry-coverage')
      .first<{ status: string; resolved_at: string | null }>()
    expect(recoveredCoverage?.status).toBe('resolved')
    const coverageMessages = degradedFixture.telegramMessages.filter((message) => message.includes('SENTRY_SOURCE_UNAVAILABLE'))
    expect(coverageMessages).toHaveLength(2)
    expect(coverageMessages[1]).toContain('đã phục hồi')

    await env.DB.prepare('DELETE FROM monitor_deliveries').run()
    await env.DB.prepare('DELETE FROM monitor_incidents').run()
    const inactivityFixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'kael-agentic', component: 'kael', status: 'gray', reason_code: 'NO_RECENT_AI_ACTIVITY', incident_id: null,
    }]))
    await runSystemHealthObserver(inactivityFixture.config, { fetcher: inactivityFixture.fetcher, now: () => new Date(TEST_NOW) })

    const incidents = await env.DB.prepare('SELECT incident_id FROM monitor_incidents').all()
    expect(inactivityFixture.telegramMessages).toEqual([])
    expect(incidents.results).toEqual([])
  })

  it('reconciles one external outage ID in D1 and Supabase after recovery', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW + 60_000, []))
    fixture.failSupabase = true
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) })
    fixture.failSupabase = false
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000) })
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 120_000) })

    expect(fixture.externalIncidents.map((item) => item.status)).toEqual(['open', 'resolved'])
    expect(fixture.externalIncidents[0].external_incident_id).toBe(fixture.externalIncidents[1].external_incident_id)
    expect(fixture.telegramMessages).toHaveLength(2)
  })

  it.each([179_000, 180_000, 181_000])('treats snapshot age %i ms at the documented freshness boundary', async (ageMs) => {
    const now = TEST_NOW
    const fixture = createFixture(() => makeSnapshot(now - ageMs, []))
    const result = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(now) })

    expect(result.outageReason).toBe(ageMs > 180_000 ? 'SNAPSHOT_STALE' : null)
    expect(result.snapshotStatus).toBe(ageMs > 180_000 ? 'unavailable' : 'fresh')
  })

  it('rejects a forged green summary when a required check is red', async () => {
    const snapshot = makeSnapshot(TEST_NOW, [{
      check_id: 'backend-core', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_forged_001',
    }])
    snapshot.overall_status = 'green'
    const fixture = createFixture(() => snapshot)

    const result = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) })

    expect(result.outageReason).toBe('SNAPSHOT_INVALID')
    expect(result.snapshotStatus).toBe('unavailable')
  })

  it('rejects future completion and check timestamps', async () => {
    const completedInFuture = makeSnapshot(TEST_NOW + 31_000, [])
    const fixture = createFixture(() => completedInFuture)
    const completedResult = await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) })
    expect(completedResult.outageReason).toBe('SNAPSHOT_STALE')

    const checkInFuture = makeSnapshot(TEST_NOW, [{
      check_id: 'backend-core', component: 'backend', status: 'green', reason_code: 'EDGE_AVAILABLE', incident_id: null,
    }])
    checkInFuture.checks = (checkInFuture.checks as Array<Record<string, unknown>>).map((check) => ({
      ...check,
      observed_at: new Date(TEST_NOW + 31_000).toISOString(),
    }))
    const secondFixture = createFixture(() => checkInFuture)
    const checkResult = await runSystemHealthObserver(secondFixture.config, { fetcher: secondFixture.fetcher, now: () => new Date(TEST_NOW) })
    expect(checkResult.outageReason).toBe('SNAPSHOT_INVALID')
  })

  it('serializes concurrent scheduled duplicates through a single D1 delivery claim', async () => {
    const incidentSnapshot = makeSnapshot(TEST_NOW, [{
      check_id: 'backend-core', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_concurrent_001',
    }])
    const fixture = createFixture(() => incidentSnapshot)

    await Promise.all([
      runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) }),
      runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) }),
    ])

    expect(fixture.telegramMessages).toHaveLength(1)
    const deliveries = await env.DB.prepare('SELECT delivery_key, status FROM monitor_deliveries').all<{ delivery_key: string; status: string }>()
    expect(deliveries.results).toEqual([{ delivery_key: 'incident:incident_concurrent_001:open', status: 'sent' }])
  })

  it('honors Telegram retry_after and resumes the same delivery after D1 says it is due', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'backend-core', component: 'backend', status: 'red', reason_code: 'EDGE_UNAVAILABLE', incident_id: 'incident_retry_0001',
    }]))
    fixture.telegramResponses.push(Response.json({ ok: false, parameters: { retry_after: 90 } }, { status: 429 }))
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW), sleep: async () => undefined })
    expect(fixture.telegramMessages).toHaveLength(1)
    const firstAttempt = await env.DB.prepare('SELECT status, next_attempt_at FROM monitor_deliveries WHERE delivery_key = ?')
      .bind('incident:incident_retry_0001:open').first<{ status: string; next_attempt_at: string | null }>()
    expect(firstAttempt).toMatchObject({ status: 'pending', next_attempt_at: new Date(TEST_NOW + 90_000).toISOString() })
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 60_000), sleep: async () => undefined })
    expect(fixture.telegramMessages).toHaveLength(1)
    await runSystemHealthObserver(fixture.config, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW + 90_000), sleep: async () => undefined })
    expect(fixture.telegramMessages).toHaveLength(2)
    const delivery = await env.DB.prepare('SELECT status, next_attempt_at FROM monitor_deliveries WHERE delivery_key = ?')
      .bind('incident:incident_retry_0001:open').first<{ status: string; next_attempt_at: string | null }>()
    expect(delivery).toMatchObject({ status: 'sent', next_attempt_at: null })
  })

  it('reports D1 failure to Supabase and delegates alert fallback without pretending D1 is healthy', async () => {
    const fixture = createFixture(() => makeSnapshot(TEST_NOW, [{
      check_id: 'app-native-sentry', component: 'app', status: 'red', reason_code: 'NATIVE_FATAL_ERROR', incident_id: 'incident_app_000001',
    }]))
    const brokenConfig = { ...fixture.config, DB: { prepare() { throw new Error('unavailable') } } } as unknown as SystemHealthObserverEnv

    const result = await runSystemHealthObserver(brokenConfig, { fetcher: fixture.fetcher, now: () => new Date(TEST_NOW) })

    expect(result.d1Status).toBe('gray')
    expect(fixture.heartbeats.at(-1)).toMatchObject({ d1_status: 'gray', error_code: 'D1_UNAVAILABLE' })
    expect(fixture.requests.some((request) => request.path.endsWith('/heartbeat'))).toBe(true)
    expect(fixture.requests.some((request) => request.path.endsWith('/fallback-alert'))).toBe(false)
    expect(fixture.telegramMessages).toHaveLength(0)
  })
})

pillarWhy(PILLAR)

function makeSnapshot(completedAt: number, checks: Array<{
  check_id: string
  component: string
  status: 'green' | 'yellow' | 'red' | 'gray'
  reason_code: string
  incident_id: string | null
  metrics?: Record<string, number | boolean | null>
}>): Record<string, unknown> {
  return {
    schema_version: 1,
    environment: 'production',
    project_ref: projectRef,
    release_id: 'release-test-2026.10.11',
    scheduled_at: new Date(completedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    expires_at: new Date(completedAt + 180_000).toISOString(),
    overall_status: checks.some((check) => check.status === 'red')
      ? 'red'
      : checks.some((check) => check.status === 'yellow')
        ? 'yellow'
        : checks.some((check) => check.status === 'gray') || checks.length === 0 ? 'gray' : 'green',
    checks: checks.map((check) => ({ ...check, metrics: check.metrics ?? {}, observed_at: new Date(completedAt).toISOString() })),
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
      TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(32)}`,
      TELEGRAM_CHAT_ID: '-1001234567890',
    } as unknown as SystemHealthObserverEnv,
    requests: [] as Array<{ path: string; method: string; body: unknown }>,
    externalIncidents: [] as Array<{ external_incident_id: string; status: string }>,
    heartbeats: [] as Array<Record<string, unknown>>,
    telegramMessages: [] as string[],
    telegramResponses: [] as Response[],
    failSupabase: false,
    async fetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null
      fixture.requests.push({ path: url.pathname, method: init?.method ?? 'GET', body })
      if (url.pathname.endsWith('/latest')) {
        if (fixture.failSupabase) throw new Error('connection refused')
        return Response.json({ snapshot: snapshot() })
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
      if (url.pathname.endsWith('/fallback-alert')) return Response.json({ ok: true })
      if (url.hostname === 'api.telegram.org') {
        fixture.telegramMessages.push((body as { text: string }).text)
        return fixture.telegramResponses.shift() ?? Response.json({ ok: true, result: { message_id: 100 } })
      }
      throw new Error('UNEXPECTED_OUTBOUND_REQUEST')
    },
  }
  return fixture
}

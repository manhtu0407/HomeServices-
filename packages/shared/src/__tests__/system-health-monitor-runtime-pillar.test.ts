import { describe, expect, it, vi } from 'vitest'

import { isSystemMonitorEvidenceUrlAllowed, normalizeSystemMonitorAggregate } from '../../../../supabase/functions/system-monitor/collector'
import { createSystemMonitorBudgetedFetch, createSystemMonitorHandler, type MonitorStore } from '../../../../supabase/functions/system-monitor/handler'
import { recordSystemMonitorWorkerCompletion, SYSTEM_MONITOR_WORKER_HEARTBEAT_TIMEOUT_MS } from '../../../../supabase/functions/_shared/system-monitor/worker-heartbeat'
import { pillarWhy, type PillarManifest } from './pillar-manifest'

export const PILLAR = {
  id: 'P353-system-health-monitor-runtime',
  invariant: 'Supabase runtime route prefixes normalize for collector and observer endpoints, requests remain bounded, and required evidence never appears green when missing',
  authority: [
    'user-approved System Health Monitoring implementation plan',
    'governance/RULES.md #0 (backend and mobile runtime boundaries)',
    'governance/RULES.md #8 (honest evidence and bounded data)',
    'https://supabase.com/docs/guides/functions/routing (function route paths)',
  ],
  target: 'supabase/functions/system-monitor/index.ts; supabase/functions/system-monitor/handler.ts; supabase/functions/system-monitor/collector.ts; supabase/functions/_shared/system-monitor/worker-heartbeat.ts',
  layer: 'security-negative',
  siblings: ['P351-system-health-monitor-contract', 'P352-system-health-monitor-sql'],
  mutation: 'drop /system-monitor runtime-prefix normalization, permit an inference/deferred-provider URL, coerce malformed evidence to zero, skip two-sample availability, or bypass heartbeat deadlines, and the route, provider, availability, or bounded-evidence assertions fail',
} as const satisfies PillarManifest

const now = new Date('2026-10-11T12:30:00.000Z')

describe('System health monitor runtime pillar', () => {
  it('returns success when the optional worker heartbeat RPC completes', async () => {
    const query = Object.assign(Promise.resolve({ error: null }), {
      abortSignal: vi.fn(() => Promise.resolve({ error: null })),
    })
    const client = { rpc: vi.fn(() => query) }

    await expect(recordSystemMonitorWorkerCompletion({
      client,
      jobName: 'payment-maintainer',
      executionId: '123e4567-e89b-42d3-a456-426614174000',
      startedAtMs: Date.now(),
      completionStatus: 'succeeded',
    })).resolves.toBe(true)
  })

  it('fails closed when a worker heartbeat query cannot be aborted', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = { rpc: vi.fn(() => Promise.resolve({ error: null })) }

    try {
      await expect(recordSystemMonitorWorkerCompletion({
        client,
        jobName: 'payment-maintainer',
        executionId: '123e4567-e89b-42d3-a456-426614174002',
        startedAtMs: Date.now(),
        completionStatus: 'succeeded',
      })).resolves.toBe(false)
      expect(warning).toHaveBeenCalledWith('system monitor worker heartbeat failed', {
        job_name: 'payment-maintainer',
        reason_code: 'HEARTBEAT_ABORT_UNAVAILABLE',
      })
    } finally {
      warning.mockRestore()
    }
  })

  it('aborts and bounds an optional worker heartbeat RPC that never settles', async () => {
    vi.useFakeTimers()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rpc = Object.assign(new Promise<never>(() => {}), {
      abortSignal: vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
      })),
    })
    const client = { rpc: vi.fn(() => rpc) }

    try {
      const completion = recordSystemMonitorWorkerCompletion({
        client,
        jobName: 'payment-maintainer',
        executionId: '123e4567-e89b-42d3-a456-426614174001',
        startedAtMs: Date.now(),
        completionStatus: 'succeeded',
      })
      const watchdog = new Promise<'hung'>((resolve) => {
        setTimeout(() => resolve('hung'), SYSTEM_MONITOR_WORKER_HEARTBEAT_TIMEOUT_MS)
      })

      await vi.advanceTimersByTimeAsync(SYSTEM_MONITOR_WORKER_HEARTBEAT_TIMEOUT_MS)

      await expect(Promise.race([completion, watchdog])).resolves.toBe(false)
      expect(rpc.abortSignal).toHaveBeenCalledTimes(1)
      expect(warning).toHaveBeenCalledWith('system monitor worker heartbeat failed', {
        job_name: 'payment-maintainer',
        reason_code: 'HEARTBEAT_WRITE_TIMEOUT',
      })
    } finally {
      warning.mockRestore()
      vi.useRealTimers()
    }
  })

  it('allows only the expected HTTPS evidence hosts and local HTTP, rejecting alternate schemes and ports', () => {
    expect(isSystemMonitorEvidenceUrlAllowed('https://abcdefgh.supabase.co/auth/v1/health')).toBe(true)
    expect(isSystemMonitorEvidenceUrlAllowed('https://sentry.io/api/0/projects/nestscout-organization/4512235847614464/events/?statsPeriod=15m&per_page=50')).toBe(false)
    expect(isSystemMonitorEvidenceUrlAllowed('http://127.0.0.1:54321/auth/v1/health')).toBe(true)
    expect(isSystemMonitorEvidenceUrlAllowed('ftp://localhost/auth/v1/health')).toBe(false)
    expect(isSystemMonitorEvidenceUrlAllowed('http://abcdefgh.supabase.co/auth/v1/health')).toBe(false)
    expect(isSystemMonitorEvidenceUrlAllowed('https://user:secret@abcdefgh.supabase.co/auth/v1/health')).toBe(false)
    expect(isSystemMonitorEvidenceUrlAllowed('https://abcdefgh.supabase.co:8443/auth/v1/health')).toBe(false)
  })

  it('rejects missing or malformed aggregate counts instead of converting them to zero', () => {
    const kaelEvidence = {
      valid_execution_count: 20,
      failed_execution_count: 1,
      api_call_count: 20,
      api_failure_count: 2,
      fallback_count: 1,
      api_call_count_15m: 4,
      open_circuit_count: 0,
      learning_eligible_count: 0,
      learning_oldest_due_at: null,
    }
    const mobileEvidence = { active_session_count: 2, api_failure_count: 1, platform_count: 1 }

    expect(normalizeSystemMonitorAggregate(kaelEvidence, 'kael')).toEqual(kaelEvidence)
    expect(normalizeSystemMonitorAggregate({ ...kaelEvidence, failed_execution_count: 'unknown' }, 'kael')).toBeNull()
    const missingFailureCount: Record<string, unknown> = { ...kaelEvidence }
    delete missingFailureCount.failed_execution_count
    expect(normalizeSystemMonitorAggregate(missingFailureCount, 'kael')).toBeNull()
    expect(normalizeSystemMonitorAggregate(mobileEvidence, 'mobile')).toEqual(mobileEvidence)
    expect(normalizeSystemMonitorAggregate({ ...mobileEvidence, api_failure_count: null }, 'mobile')).toBeNull()
  })

  it('probes Storage and Realtime health and can report green when every required source is healthy', async () => {
    const fixture = createFixture()
    const response = await fixture.handler(monitorRequest())

    expect(response.status, await response.clone().text()).toBe(200)
    expect(fixture.claimed).toBe(true)
    expect(fixture.savedSnapshot?.overall_status).toBe('green')
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-storage-realtime-io')).toMatchObject({
      status: 'green',
      reason_code: 'IO_CHECKS_HEALTHY',
      metrics: { storage_status: 0, realtime_status: 0 },
    })
    expect([...fixture.fetchPaths].sort()).toEqual([
      '/auth/v1/health',
      '/functions/v1/mobile-api/harness/health',
      '/realtime/v1/healthcheck',
      '/storage/v1/health',
    ].sort())
    expect(fixture.savedSnapshot).toMatchObject({ schema_version: 2, profile_id: 'cloudflare-admin-v1' })
    expect(fixture.savedSnapshot?.schema_version === 2 ? fixture.savedSnapshot.coverage_gaps : null).toEqual(['app-crash', 'push-notifications'])
    expect(fixture.fetchPaths.some((path) => /(?:chat\/completions|\/messages|\/embeddings|\/responses)/u.test(path))).toBe(false)
    expect(fixture.heartbeat?.completionStatus).toBe('succeeded')
    expect(fixture.heartbeat?.releaseId).toBe('harness-aaaaaaaaaaaa-bbbbbbbbbbbb')
  })

  it('requires two Auth and database failures and two successful samples for availability transitions', async () => {
    const fixture = createFixture()
    fixture.authStatus = 503
    fixture.databaseHealthy = false

    const firstFailure = await fixture.handler(monitorRequest(now))
    expect(firstFailure.status, await firstFailure.clone().text()).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-core')).toMatchObject({
      status: 'yellow',
      metrics: {
        auth_status: 1,
        auth_fails: 1,
        db_status: 1,
        db_fails: 1,
      },
    })

    fixture.previousSnapshot = fixture.savedSnapshot
    fixture.now = new Date(now.getTime() + 60_000)
    const secondFailure = await fixture.handler(monitorRequest(new Date(now.getTime() + 60_000)))
    expect(secondFailure.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-core')).toMatchObject({
      status: 'red',
      metrics: { auth_status: 2, auth_fails: 2, db_status: 2, db_fails: 2 },
    })

    fixture.previousSnapshot = fixture.savedSnapshot
    fixture.authStatus = 200
    fixture.databaseHealthy = true
    fixture.now = new Date(now.getTime() + 120_000)
    const firstRecovery = await fixture.handler(monitorRequest(new Date(now.getTime() + 120_000)))
    expect(firstRecovery.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-core')).toMatchObject({
      status: 'red',
      metrics: { auth_status: 2, auth_successes: 1, db_status: 2, db_successes: 1 },
    })

    fixture.previousSnapshot = fixture.savedSnapshot
    fixture.now = new Date(now.getTime() + 180_000)
    const secondRecovery = await fixture.handler(monitorRequest(new Date(now.getTime() + 180_000)))
    expect(secondRecovery.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-core')).toMatchObject({
      status: 'green',
      metrics: { auth_status: 0, db_status: 0 },
    })
  })

  it('keeps Storage gray when its health payload is malformed', async () => {
    const fixture = createFixture()
    fixture.storagePayload = { healthy: 'false' }
    const response = await fixture.handler(monitorRequest())

    expect(response.status, await response.clone().text()).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-storage-realtime-io')).toMatchObject({
      status: 'gray',
      reason_code: 'STORAGE_HEALTH_UNVERIFIED',
      metrics: { storage_status: 3, realtime_status: 0 },
    })
    expect(fixture.savedSnapshot?.overall_status).toBe('gray')
  })

  it('treats a valid unhealthy Storage response as an availability failure', async () => {
    const fixture = createFixture()
    fixture.storagePayload = { healthy: false }
    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-storage-realtime-io')).toMatchObject({
      status: 'yellow',
      reason_code: 'STORAGE_UNAVAILABLE_FIRST_SAMPLE',
      metrics: { storage_fails: 1, realtime_status: 0 },
    })
  })

  it('tracks Realtime failures independently inside the shared I/O check', async () => {
    const fixture = createFixture()
    fixture.realtimeStatus = 503
    fixture.previousSnapshot = previousIoSnapshot()
    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-storage-realtime-io')).toMatchObject({
      status: 'red',
      reason_code: 'REALTIME_UNAVAILABLE',
      metrics: { storage_status: 0, realtime_status: 2, realtime_fails: 2 },
    })
  })

  it('keeps a high Kael error rate red on the second consecutive evaluation', async () => {
    const fixture = createFixture()
    fixture.kaelEvidence = { ...fixture.kaelEvidence, failed_execution_count: 4 }
    fixture.previousSnapshot = previousKaelSnapshot()

    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'kael-agentic')).toMatchObject({
      status: 'red',
      reason_code: 'ERROR_RATE_HIGH',
      metrics: { red_evaluations: 2 },
    })
  })

  it('keeps Kael health gray when a required aggregate counter is malformed', async () => {
    const fixture = createFixture()
    fixture.kaelEvidence = { ...fixture.kaelEvidence, failed_execution_count: 'not-a-count' }

    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'kael-agentic')).toMatchObject({
      status: 'gray',
      reason_code: 'KAEL_EVIDENCE_INCOMPLETE',
      sample_count: 20,
      metrics: { failed: null, calls15m: 1 },
    })
    expect(fixture.savedSnapshot?.overall_status).toBe('gray')
  })

  it('keeps native App health gray when a required API failure count is malformed', async () => {
    const fixture = createFixture()
    fixture.mobileEvidence = { active_session_count: 1, api_failure_count: 'not-a-count', platform_count: 1 }

    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'app-native-connectivity')).toMatchObject({
      status: 'gray',
      reason_code: 'NATIVE_SESSION_EVIDENCE_INCOMPLETE',
      metrics: { api_failures: null },
    })
    expect(fixture.savedSnapshot?.overall_status).toBe('gray')
  })

  it('keeps scheduled worker health gray when required schedule metadata is absent', async () => {
    const fixture = createFixture()
    fixture.workers = fixture.workers.map((worker) => worker.job_name === 'kael-matching-maintainer'
      ? { ...worker, expected_interval_seconds: null }
      : worker)

    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-scheduled-workers')).toMatchObject({
      status: 'gray',
      reason_code: 'WORKER_EVIDENCE_INCOMPLETE',
    })
    expect(fixture.savedSnapshot?.overall_status).toBe('gray')
  })

  it('keeps an open Kael provider circuit yellow when there are too few recent executions', async () => {
    const fixture = createFixture()
    fixture.kaelEvidence = {
      ...fixture.kaelEvidence,
      valid_execution_count: 0,
      failed_execution_count: 0,
      api_call_count_15m: 0,
      open_circuit_count: 1,
    }
    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'kael-agentic')).toMatchObject({
      status: 'yellow',
      reason_code: 'PROVIDER_CIRCUIT_OPEN',
      metrics: { circuits: 1 },
    })
  })

  it('flags an eligible learning queue only after its declared daily worker opportunity and grace', async () => {
    const fixture = createFixture()
    fixture.kaelEvidence = {
      ...fixture.kaelEvidence,
      learning_eligible_count: 2,
      learning_oldest_due_at: '2026-10-08T01:00:00.000Z',
    }
    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'kael-agentic')).toMatchObject({
      status: 'yellow',
      reason_code: 'LEARNING_QUEUE_STALE',
      metrics: { learning: 2 },
    })
  })

  it.each(['2026-10-12T01:59:00.000Z', '2026-10-12T03:00:00.000Z'])('detects a missed daily worker run before the next due window at %s', async (timestamp) => {
    const fixture = createFixture()
    const tick = new Date(timestamp)
    fixture.now = tick
    fixture.workers = fixture.workers.map((worker) => worker.job_name === 'kael-learning-monitor'
      ? { ...worker, last_finished_at: '2026-10-10T02:05:00.000Z' }
      : { ...worker, last_finished_at: new Date(tick.getTime() - 1_000).toISOString() })

    const response = await fixture.handler(monitorRequest(tick))

    expect(response.status).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'backend-scheduled-workers')).toMatchObject({
      status: 'red',
      reason_code: 'WORKER_LATE',
      metrics: { late: 1 },
    })
  })

  it('does not contact Sentry or Telegram even when legacy configuration values exist', async () => {
    const fixture = createFixture()
    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
    expect(fixture.fetchPaths.some((path) => /(?:events\/|api\.telegram\.org)/iu.test(path))).toBe(false)
    expect(fixture.savedSnapshot?.schema_version === 2 ? fixture.savedSnapshot.coverage_gaps : null).toEqual(['app-crash', 'push-notifications'])
    expect(fixture.savedSnapshot?.checks.some((check) => check.check_id.includes('sentry'))).toBe(false)
  })

  it('routes public monitor paths after Supabase Edge Runtime strips the functions API prefix', async () => {
    const fixture = createFixture()
    const observerResponse = await fixture.handler(new Request('https://monitor.test/system-monitor/observer/latest?schema_version=2', {
      method: 'GET',
      headers: { 'x-system-monitor-observer-secret': 'observer-test-secret' },
    }))
    expect(observerResponse.status).toBe(200)

    const collectorResponse = await fixture.handler(new Request('https://monitor.test/system-monitor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-system-monitor-secret': 'monitor-test-secret' },
      body: JSON.stringify({ scheduled_at: now.toISOString() }),
    }))
    expect(collectorResponse.status).toBe(200)
    expect(fixture.savedSnapshot?.environment).toBe('production')

    const unrelatedPath = await fixture.handler(new Request('https://monitor.test/system-monitoring/observer/latest', {
      method: 'GET',
      headers: { 'x-system-monitor-observer-secret': 'observer-test-secret' },
    }))
    expect(unrelatedPath.status).toBe(404)
    expect(fixture.observerHeartbeatWrites).toBe(0)
  })

  it('negotiates snapshot v1 and v2 while projecting a gray coverage check for legacy readers', async () => {
    const fixture = createFixture()
    await fixture.handler(monitorRequest())

    const v2Response = await fixture.handler(observerLatestRequest('2'))
    expect(v2Response.status).toBe(200)
    expect(await v2Response.json()).toMatchObject({ snapshot: { schema_version: 2, profile_id: 'cloudflare-admin-v1' } })

    const v1Response = await fixture.handler(observerLatestRequest('1'))
    const v1 = await v1Response.json() as { snapshot: { schema_version: number; overall_status: string; checks: Array<{ check_id: string; status: string }> } }
    expect(v1Response.status).toBe(200)
    expect(v1.snapshot.schema_version).toBe(1)
    expect(v1.snapshot.overall_status).toBe('gray')
    expect(v1.snapshot.checks).toContainEqual(expect.objectContaining({ check_id: 'profile-coverage-unsupported', status: 'gray' }))

    expect((await fixture.handler(observerLatestRequest('3'))).status).toBe(400)
  })

  it('rejects an unauthenticated collector before any request or database access', async () => {
    const fixture = createFixture()
    const response = await fixture.handler(new Request('https://monitor.test/functions/v1/system-monitor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduled_at: now.toISOString() }),
    }))

    expect(response.status).toBe(401)
    expect(fixture.fetchPaths).toEqual([])
    expect(fixture.claimed).toBe(false)
  })

  it('aborts a Supabase request when the shared collector deadline expires', async () => {
    let requestSignal: AbortSignal | undefined
    const budgetedFetch = createSystemMonitorBudgetedFetch(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal ?? undefined
      requestSignal?.addEventListener('abort', () => reject(new Error('REQUEST_ABORTED')), { once: true })
    }), Date.now() + 20, 5_000)

    await expect(budgetedFetch('https://abcdefgh.supabase.co/rest/v1/rpc')).rejects.toThrow('REQUEST_ABORTED')
    expect(requestSignal?.aborted).toBe(true)
  })

  it('records observer heartbeat without sending an alert', async () => {
    const fixture = createFixture()
    fixture.observerTransition = {
      transition: 'opened',
      incidentId: '123e4567-e89b-42d3-a456-426614174000',
      openedAt: now.toISOString(),
      reasonCode: 'D1_UNAVAILABLE',
    }
    const open = await fixture.handler(observerHeartbeatRequest())
    expect(open.status).toBe(200)
    expect(await open.json()).toMatchObject({ ok: true, alert_delivery: 'disabled_by_profile' })
    expect(fixture.observerHeartbeatWrites).toBe(1)
    expect(fixture.fetchPaths.some((path) => /telegram|sentry/iu.test(path))).toBe(false)

    fixture.observerTransition = {
      transition: 'resolved',
      incidentId: '123e4567-e89b-42d3-a456-426614174000',
      openedAt: now.toISOString(),
      reasonCode: 'D1_UNAVAILABLE',
    }
    const recovery = await fixture.handler(observerHeartbeatRequest())
    expect(recovery.status).toBe(200)
    expect(fixture.observerHeartbeatWrites).toBe(2)
    expect(fixture.fetchPaths.some((path) => /telegram|sentry/iu.test(path))).toBe(false)
  })

  it('rejects unknown observer heartbeat fields before touching state or Telegram', async () => {
    const fixture = createFixture()
    const response = await fixture.handler(observerHeartbeatRequest({ secret: 'forged' }))

    expect(response.status).toBe(400)
    expect(fixture.observerHeartbeatWrites).toBe(0)
    expect(fixture.observerHeartbeatWrites).toBe(0)
  })
})

function observerHeartbeatRequest(extra: Record<string, unknown> = {}) {
  return new Request('https://monitor.test/functions/v1/system-monitor/observer/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-system-monitor-observer-secret': 'observer-test-secret' },
    body: JSON.stringify({ dispatcher_status: 'gray', d1_status: 'gray', error_code: 'D1_UNAVAILABLE', ...extra }),
  })
}

function observerLatestRequest(schemaVersion: string) {
  return new Request(`https://monitor.test/functions/v1/system-monitor/observer/latest?schema_version=${schemaVersion}`, {
    method: 'GET',
    headers: { 'x-system-monitor-observer-secret': 'observer-test-secret' },
  })
}

function monitorRequest(scheduledAt = now) {
  return new Request('https://monitor.test/functions/v1/system-monitor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-system-monitor-secret': 'monitor-test-secret' },
    body: JSON.stringify({ scheduled_at: scheduledAt.toISOString(), trigger: 'manual' }),
  })
}

function previousKaelSnapshot() {
  return {
    schema_version: 1 as const,
    environment: 'production' as const,
    project_ref: 'abcdefgh',
    release_id: 'release-2026.10.11',
    scheduled_at: new Date(now.getTime() - 60_000).toISOString(),
    completed_at: new Date(now.getTime() - 60_000).toISOString(),
    expires_at: new Date(now.getTime() + 120_000).toISOString(),
    overall_status: 'yellow' as const,
    checks: [{
      check_id: 'kael-agentic',
      component: 'kael',
      status: 'yellow' as const,
      reason_code: 'ERROR_RATE_HIGH',
      observed_at: new Date(now.getTime() - 60_000).toISOString(),
      evidence_window: null,
      sample_count: 20,
      metrics: { red_evaluations: 1 },
      incident_id: null,
    }],
  }
}

function previousIoSnapshot() {
  return {
    schema_version: 1 as const,
    environment: 'production' as const,
    project_ref: 'abcdefgh',
    release_id: 'release-2026.10.11',
    scheduled_at: new Date(now.getTime() - 60_000).toISOString(),
    completed_at: new Date(now.getTime() - 60_000).toISOString(),
    expires_at: new Date(now.getTime() + 120_000).toISOString(),
    overall_status: 'yellow' as const,
    checks: [{
      check_id: 'backend-storage-realtime-io',
      component: 'backend',
      status: 'yellow' as const,
      reason_code: 'REALTIME_UNAVAILABLE_FIRST_SAMPLE',
      observed_at: new Date(now.getTime() - 60_000).toISOString(),
      evidence_window: null,
      sample_count: 2,
      metrics: {
        storage_status: 0,
        storage_fails: 0,
        storage_successes: 1,
        realtime_status: 1,
        realtime_fails: 1,
        realtime_successes: 0,
      },
      incident_id: null,
    }],
  }
}

function createFixture() {
  let currentNow = now
  let savedSnapshot: Awaited<ReturnType<MonitorStore['readLatestSnapshot']>> = null
  let previousSnapshot: Awaited<ReturnType<MonitorStore['readPreviousSnapshot']>> = null
  let heartbeat: Parameters<MonitorStore['writeWorkerHeartbeat']>[0] | null = null
  let observerHeartbeatWrites = 0
  let observerTransition: Awaited<ReturnType<MonitorStore['recordObserverHeartbeat']>> = {
    transition: 'none', incidentId: null, openedAt: null, reasonCode: null,
  }
  let claimed = false
  const fetchPaths: string[] = []
  let mobileEvidence: Record<string, unknown> = { active_session_count: 1, api_failure_count: 0, platform_count: 1 }
  let authStatus = 200
  let databaseHealthy = true
  let realtimeStatus = 200
  let workers = [
    'kael-matching-maintainer',
    'payment-maintainer',
    'kael-learning-queue-stale-fallback',
    'kael-learning-monitor',
    'system-health-monitor',
  ].map((job_name) => ({
    job_name,
    schedule_kind: job_name === 'kael-learning-monitor' ? 'daily' : 'interval',
    expected_interval_seconds: job_name === 'kael-learning-monitor' ? null : 300,
    daily_utc_hour: job_name === 'kael-learning-monitor' ? 2 : null,
    daily_utc_minute: job_name === 'kael-learning-monitor' ? 0 : null,
    grace_seconds: 7200,
    config_version: 1,
    enabled: true,
    cron_enabled: true,
    last_status: 'succeeded',
    last_started_at: new Date(now.getTime() - 2_000).toISOString(),
    last_finished_at: new Date(now.getTime() - 1_000).toISOString(),
  }))
  let kaelEvidence: Record<string, unknown> = {
    valid_execution_count: 20,
    failed_execution_count: 0,
    api_call_count: 20,
    api_failure_count: 0,
    fallback_count: 0,
    api_call_count_15m: 1,
    open_circuit_count: 0,
    learning_eligible_count: 0,
    learning_oldest_due_at: null,
  }
  let storagePayload: unknown = { healthy: true }
  const store: MonitorStore = {
    async claimRun() { claimed = true; return true },
    async databaseProbe() { return databaseHealthy },
    async readPreviousSnapshot() { return previousSnapshot },
    async readWorkerEvidence() { return workers },
    async readKaelEvidence() { return kaelEvidence },
    async readMobileEvidence() { return mobileEvidence },
    async readObserverState() {
      return { observer_heartbeat_at: new Date(currentNow.getTime() - 1_000).toISOString(), dispatcher_status: 'green', d1_status: 'green' }
    },
    async readLatestSnapshot() { return savedSnapshot },
    async recordSnapshot(snapshot) { savedSnapshot = snapshot; return true },
    async writeWorkerHeartbeat(input) { heartbeat = input },
    async recordObserverHeartbeat() { observerHeartbeatWrites += 1; return observerTransition },
    async writeExternalObserverIncident() {},
  }
  const handler = createSystemMonitorHandler({
    env: (name) => ({
      SYSTEM_HEALTH_MONITOR_SECRET: 'monitor-test-secret',
      SYSTEM_HEALTH_OBSERVER_SECRET: 'observer-test-secret',
      SYSTEM_HEALTH_ENVIRONMENT: 'production',
      HARNESS_RELEASE_ID: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      SUPABASE_URL: 'https://abcdefgh.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
      SUPABASE_ANON_KEY: 'anon-test-key',
      SENTRY_HEALTH_ORG: 'nestscout-organization',
      SENTRY_HEALTH_PROJECT_ID: '4512235847614464',
      SENTRY_HEALTH_READ_TOKEN: 'sentry-read-test-token',
      SYSTEM_HEALTH_TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(32)}`,
      SYSTEM_HEALTH_TELEGRAM_CHAT_ID: '-1001234567890',
    } as Record<string, string>)[name],
    createStore: () => store,
    now: () => currentNow,
    fetcher: async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      fetchPaths.push(url.pathname)
      if (url.pathname.endsWith('/harness/health')) {
        return Response.json({
          environment: { name: 'production', project_ref: 'abcdefgh' },
          release: { release_id: 'release-2026.10.11', registered: true },
        })
      }
      if (url.pathname === '/storage/v1/health') return Response.json(storagePayload)
      if (url.pathname === '/realtime/v1/healthcheck') return new Response('ok', { status: realtimeStatus })
      if (url.pathname === '/auth/v1/health') return new Response('{}', { status: authStatus })
      throw new Error('Unexpected outbound request')
    },
  })
  return {
    handler,
    get savedSnapshot() { return savedSnapshot },
    get heartbeat() { return heartbeat },
    get claimed() { return claimed },
    get observerTransition() { return observerTransition },
    set observerTransition(value) { observerTransition = value },
    set now(value: Date) { currentNow = value },
    get workers() { return workers },
    set workers(value: typeof workers) { workers = value },
    get kaelEvidence() { return kaelEvidence },
    set kaelEvidence(value: Record<string, unknown>) { kaelEvidence = value },
    set mobileEvidence(value: Record<string, unknown>) { mobileEvidence = value },
    set authStatus(value: number) { authStatus = value },
    set databaseHealthy(value: boolean) { databaseHealthy = value },
    set previousSnapshot(value: Awaited<ReturnType<MonitorStore['readPreviousSnapshot']>>) { previousSnapshot = value },
    set storagePayload(value: unknown) { storagePayload = value },
    set realtimeStatus(value: number) { realtimeStatus = value },
    get observerHeartbeatWrites() { return observerHeartbeatWrites },
    fetchPaths,
  }
}

pillarWhy(PILLAR)

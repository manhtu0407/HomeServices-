import { describe, expect, it, vi } from 'vitest'

import { isSystemMonitorEvidenceUrlAllowed } from '../../../../supabase/functions/system-monitor/collector'
import { createSystemMonitorBudgetedFetch, createSystemMonitorHandler, type MonitorStore } from '../../../../supabase/functions/system-monitor/handler'
import { recordSystemMonitorWorkerCompletion, SYSTEM_MONITOR_WORKER_HEARTBEAT_TIMEOUT_MS } from '../../../../supabase/functions/_shared/system-monitor/worker-heartbeat'
import { pillarWhy, type PillarManifest } from './pillar-manifest'

export const PILLAR = {
  id: 'P353-system-health-monitor-runtime',
  invariant: 'Collector requests and optional worker completion telemetry stay within bounded deadlines, and required evidence never appears green when missing',
  authority: [
    'user-approved System Health Monitoring implementation plan',
    'governance/RULES.md #0 (backend and mobile runtime boundaries)',
    'governance/RULES.md #8 (honest evidence and bounded data)',
  ],
  target: 'supabase/functions/system-monitor/handler.ts; supabase/functions/system-monitor/collector.ts; supabase/functions/_shared/system-monitor/worker-heartbeat.ts',
  layer: 'security-negative',
  siblings: ['P351-system-health-monitor-contract', 'P352-system-health-monitor-sql'],
  mutation: 'permit an inference URL, accept a missing evidence source as green, report an unpersisted delivery as sent, let a collector or worker heartbeat request outlive its deadline, or report a worker heartbeat as successful without abort support and these runtime assertions fail',
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
    expect(isSystemMonitorEvidenceUrlAllowed('https://sentry.io/api/0/projects/nestscout-organization/4512235847614464/events/?statsPeriod=15m&per_page=50')).toBe(true)
    expect(isSystemMonitorEvidenceUrlAllowed('http://127.0.0.1:54321/auth/v1/health')).toBe(true)
    expect(isSystemMonitorEvidenceUrlAllowed('ftp://localhost/auth/v1/health')).toBe(false)
    expect(isSystemMonitorEvidenceUrlAllowed('http://abcdefgh.supabase.co/auth/v1/health')).toBe(false)
    expect(isSystemMonitorEvidenceUrlAllowed('https://user:secret@abcdefgh.supabase.co/auth/v1/health')).toBe(false)
    expect(isSystemMonitorEvidenceUrlAllowed('https://abcdefgh.supabase.co:8443/auth/v1/health')).toBe(false)
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
      '/api/0/projects/nestscout-organization/4512235847614464/events/',
      '/auth/v1/health',
      '/functions/v1/mobile-api/harness/health',
      '/realtime/v1/healthcheck',
      '/storage/v1/health',
    ].sort())
    expect(fixture.fetchPaths.some((path) => /(?:chat\/completions|\/messages|\/embeddings|\/responses)/u.test(path))).toBe(false)
    expect(fixture.heartbeat?.completionStatus).toBe('succeeded')
  })

  it('keeps Storage gray when its health payload is malformed', async () => {
    const fixture = createFixture()
    fixture.storagePayload = { healthy: 'false' }
    const response = await fixture.handler(monitorRequest())

    expect(response.status).toBe(200)
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

  it.each([401, 403, 429, 500])('keeps Sentry coverage gray when Sentry returns %i', async (status) => {
    const fixture = createFixture(status)
    const response = await fixture.handler(new Request('https://monitor.test/functions/v1/system-monitor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-system-monitor-secret': 'monitor-test-secret' },
      body: JSON.stringify({ scheduled_at: now.toISOString(), trigger: 'scheduled' }),
    }))
    const responseText = await response.text()
    const payload = JSON.parse(responseText) as { snapshot?: { overall_status: string } }

    expect(response.status, responseText).toBe(200)
    expect(fixture.savedSnapshot?.checks.find((check) => check.check_id === 'app-native-sentry')).toMatchObject({
      status: 'gray',
      reason_code: 'SENTRY_SOURCE_UNAVAILABLE',
    })
    expect(payload.snapshot?.overall_status).not.toBe('green')
    expect(fixture.sourceStates).toHaveLength(1)
    expect(fixture.sourceStates[0].last_status_code).toBe(status)
    expect(fixture.fetchPaths.some((path) => /(?:chat\/completions|\/messages|\/embeddings|\/responses)/u.test(path))).toBe(false)
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

  it('sends one Supabase-ledger fallback when Cloudflare reports dispatcher loss and a recovery on clear', async () => {
    const fixture = createFixture()
    fixture.observerTransition = {
      transition: 'opened',
      incidentId: '123e4567-e89b-42d3-a456-426614174000',
      openedAt: now.toISOString(),
      reasonCode: 'D1_UNAVAILABLE',
    }
    const open = await fixture.handler(observerHeartbeatRequest())
    expect(open.status).toBe(200)
    expect(await open.json()).toMatchObject({ ok: true, alert_delivery: 'sent' })
    expect(fixture.telegramMessages).toHaveLength(1)
    expect(fixture.telegramMessages[0]).toContain('D1_UNAVAILABLE')
    expect(fixture.fallbackClaims[0]).toContain('123e4567-e89b-42d3-a456-426614174000:open')

    fixture.observerTransition = {
      transition: 'resolved',
      incidentId: '123e4567-e89b-42d3-a456-426614174000',
      openedAt: now.toISOString(),
      reasonCode: 'D1_UNAVAILABLE',
    }
    const recovery = await fixture.handler(observerHeartbeatRequest())
    expect(recovery.status).toBe(200)
    expect(fixture.telegramMessages).toHaveLength(2)
    expect(fixture.telegramMessages[1]).toContain('đã phục hồi')
    expect(fixture.fallbackCompletions.map((item) => item.delivered)).toEqual([true, true])
  })

  it('retries Telegram fallback on the tick after retry_after without raw response logging', async () => {
    const fixture = createFixture()
    fixture.observerTransition = {
      transition: 'opened',
      incidentId: '123e4567-e89b-42d3-a456-426614174001',
      openedAt: now.toISOString(),
      reasonCode: 'D1_UNAVAILABLE',
    }
    fixture.telegramResponses.push(Response.json({ ok: false, description: 'private response', parameters: { retry_after: 90 } }, { status: 429 }))

    const response = await fixture.handler(observerHeartbeatRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ alert_delivery: 'deferred' })
    expect(fixture.telegramMessages).toHaveLength(1)
    expect(fixture.fallbackCompletions[0]).toMatchObject({
      delivered: false,
      retryAt: new Date(now.getTime() + 90_000).toISOString(),
      errorCode: 'TELEGRAM_RATE_LIMITED',
    })
    expect(JSON.stringify(fixture.fallbackCompletions)).not.toContain('private response')

    fixture.now = new Date(now.getTime() + 89_000)
    fixture.observerTransition = {
      transition: 'none',
      incidentId: '123e4567-e89b-42d3-a456-426614174001',
      openedAt: now.toISOString(),
      reasonCode: 'D1_UNAVAILABLE',
    }
    const beforeRetryAt = await fixture.handler(observerHeartbeatRequest())
    expect(beforeRetryAt.status).toBe(200)
    expect(await beforeRetryAt.json()).toMatchObject({ alert_delivery: 'deferred' })
    expect(fixture.telegramMessages).toHaveLength(1)

    fixture.now = new Date(now.getTime() + 90_000)
    const afterRetryAt = await fixture.handler(observerHeartbeatRequest())
    expect(afterRetryAt.status).toBe(200)
    expect(await afterRetryAt.json()).toMatchObject({ alert_delivery: 'sent' })
    expect(fixture.telegramMessages).toHaveLength(2)
  })

  it('does not report a Telegram alert as sent when its ledger completion is rejected', async () => {
    const fixture = createFixture()
    fixture.observerTransition = {
      transition: 'opened',
      incidentId: '123e4567-e89b-42d3-a456-426614174002',
      openedAt: now.toISOString(),
      reasonCode: 'D1_UNAVAILABLE',
    }
    fixture.fallbackCompletionAccepted = false

    const response = await fixture.handler(observerHeartbeatRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'OBSERVER_DELIVERY_STATE_FAILED' })
    expect(fixture.telegramMessages).toHaveLength(1)
  })

  it('rejects unknown observer heartbeat fields before touching state or Telegram', async () => {
    const fixture = createFixture()
    const response = await fixture.handler(observerHeartbeatRequest({ secret: 'forged' }))

    expect(response.status).toBe(400)
    expect(fixture.observerHeartbeatWrites).toBe(0)
    expect(fixture.telegramMessages).toEqual([])
  })
})

function observerHeartbeatRequest(extra: Record<string, unknown> = {}) {
  return new Request('https://monitor.test/functions/v1/system-monitor/observer/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-system-monitor-observer-secret': 'observer-test-secret' },
    body: JSON.stringify({ dispatcher_status: 'gray', d1_status: 'gray', error_code: 'D1_UNAVAILABLE', ...extra }),
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

function createFixture(sentryStatus = 200) {
  let currentNow = now
  let savedSnapshot: Awaited<ReturnType<MonitorStore['readLatestSnapshot']>> = null
  let previousSnapshot: Awaited<ReturnType<MonitorStore['readPreviousSnapshot']>> = null
  let heartbeat: Parameters<MonitorStore['writeWorkerHeartbeat']>[0] | null = null
  let observerHeartbeatWrites = 0
  let observerTransition: Awaited<ReturnType<MonitorStore['recordObserverHeartbeat']>> = {
    transition: 'none', incidentId: null, openedAt: null, reasonCode: null,
  }
  let claimed = false
  const sourceStates: Array<{ last_status_code: number | null; backoff_until: string | null; consecutive_failures: number }> = []
  const fetchPaths: string[] = []
  const telegramMessages: string[] = []
  const telegramResponses: Response[] = []
  const fallbackClaims: string[] = []
  const fallbackCompletions: Array<Parameters<MonitorStore['completeFallbackDelivery']>[0]> = []
  const fallbackStates = new Map<string, { delivered: boolean; retryAt: string | null; leaseExpiresAt: number | null }>()
  let fallbackCompletionAccepted = true
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
    async databaseProbe() { return true },
    async readPreviousSnapshot() { return previousSnapshot },
    async readWorkerEvidence() { return workers },
    async readKaelEvidence() { return kaelEvidence },
    async readMobileEvidence() { return { active_session_count: 1, api_failure_count: 0, platform_count: 1 } },
    async readObserverState() {
      return { observer_heartbeat_at: new Date(currentNow.getTime() - 1_000).toISOString(), dispatcher_status: 'green', d1_status: 'green' }
    },
    async readLatestSnapshot() { return savedSnapshot },
    async recordSnapshot(snapshot) { savedSnapshot = snapshot; return true },
    async writeWorkerHeartbeat(input) { heartbeat = input },
    async readSourceState() { return null },
    async writeSourceState(_source, state) { sourceStates.push(state) },
    async recordObserverHeartbeat() { observerHeartbeatWrites += 1; return observerTransition },
    async claimFallbackDelivery(dedupeKey, _kind, claimedAt) {
      fallbackClaims.push(dedupeKey)
      const state = fallbackStates.get(dedupeKey)
      const timestamp = Date.parse(claimedAt)
      if (state?.delivered || (state?.leaseExpiresAt !== null && state?.leaseExpiresAt !== undefined && state.leaseExpiresAt > timestamp) ||
          (state?.retryAt !== null && state?.retryAt !== undefined && Date.parse(state.retryAt) > timestamp)) return false
      fallbackStates.set(dedupeKey, { delivered: false, retryAt: null, leaseExpiresAt: timestamp + 30_000 })
      return true
    },
    async completeFallbackDelivery(input) {
      fallbackCompletions.push(input)
      if (!fallbackCompletionAccepted) return false
      fallbackStates.set(input.dedupeKey, {
        delivered: input.delivered,
        retryAt: input.retryAt,
        leaseExpiresAt: null,
      })
      return true
    },
    async writeExternalObserverIncident() {},
  }
  const handler = createSystemMonitorHandler({
    env: (name) => ({
      SYSTEM_HEALTH_MONITOR_SECRET: 'monitor-test-secret',
      SYSTEM_HEALTH_OBSERVER_SECRET: 'observer-test-secret',
      SYSTEM_HEALTH_ENVIRONMENT: 'production',
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
    fetcher: async (input, init) => {
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
      if (url.pathname === '/auth/v1/health') return new Response('{}', { status: 200 })
      if (url.pathname.endsWith('/events/')) {
        return sentryStatus === 200
          ? Response.json([])
          : new Response('{}', { status: sentryStatus, headers: sentryStatus === 429 ? { 'retry-after': '90' } : undefined })
      }
      if (url.hostname === 'api.telegram.org') {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { text: string } : { text: '' }
        telegramMessages.push(body.text)
        return telegramResponses.shift() ?? Response.json({ ok: true, result: { message_id: 1 } })
      }
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
    set previousSnapshot(value: Awaited<ReturnType<MonitorStore['readPreviousSnapshot']>>) { previousSnapshot = value },
    set storagePayload(value: unknown) { storagePayload = value },
    set realtimeStatus(value: number) { realtimeStatus = value },
    set fallbackCompletionAccepted(value: boolean) { fallbackCompletionAccepted = value },
    get observerHeartbeatWrites() { return observerHeartbeatWrites },
    sourceStates,
    fetchPaths,
    telegramMessages,
    telegramResponses,
    fallbackClaims,
    fallbackCompletions,
  }
}

pillarWhy(PILLAR)

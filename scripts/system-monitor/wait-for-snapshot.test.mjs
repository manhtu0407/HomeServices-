import assert from 'node:assert/strict'
import test from 'node:test'

import { isOperationalSystemHealthSnapshot, waitForFreshSystemHealthSnapshot } from './wait-for-snapshot.mjs'

const nowMs = Date.parse('2026-10-13T12:00:00.000Z')
const baseInput = {
  supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
  observerSecret: 'observer-secret-for-system-health-tests-0001',
  environment: 'production',
  projectRef: 'iwevizmsedyqozxlawwl',
  profileId: 'cloudflare-admin-v1',
  now: () => nowMs,
  sleep: async () => undefined,
  pollIntervalMs: 0,
  timeoutMs: 1_000,
}

test('accepts fresh v2 evidence and returns an allowlisted receipt', async () => {
  let request
  const result = await waitForFreshSystemHealthSnapshot({
    ...baseInput,
    fetcher: async (input, init) => {
      request = { url: String(input), init }
      return Response.json({ snapshot: makeSnapshot() })
    },
  })

  assert.deepEqual(result, {
    profileId: 'cloudflare-admin-v1',
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseId: 'harness-test-release',
    completedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + 180_000).toISOString(),
    overallStatus: 'green',
    requiredCheckCount: 1,
    checkCount: 1,
    coverageGaps: ['app-crash', 'push-notifications'],
  })
  assert.equal(request.url, 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/system-monitor/observer/latest?schema_version=2')
  assert.equal(request.init.headers['x-system-monitor-observer-secret'], baseInput.observerSecret)
})

test('rejects missing required evidence and an inconsistent claimed green state', async () => {
  const snapshot = makeSnapshot()
  snapshot.required_check_ids = ['backend-edge-availability', 'backend-database-availability']
  await assert.rejects(
    waitForFreshSystemHealthSnapshot({ ...baseInput, fetcher: async () => Response.json({ snapshot }) }),
    /SYSTEM_HEALTH_SNAPSHOT_INVALID_OR_STALE/u,
  )

  const inconsistent = makeSnapshot()
  inconsistent.checks[0].status = 'red'
  await assert.rejects(
    waitForFreshSystemHealthSnapshot({ ...baseInput, fetcher: async () => Response.json({ snapshot: inconsistent }) }),
    /SYSTEM_HEALTH_SNAPSHOT_INVALID_OR_STALE/u,
  )
})

test('rejects stale snapshots and does not keep polling beyond its bounded wait', async () => {
  let clock = nowMs
  let calls = 0
  const oldSnapshot = makeSnapshot(nowMs - 181_000)
  await assert.rejects(
    waitForFreshSystemHealthSnapshot({
      ...baseInput,
      pollIntervalMs: 1_000,
      now: () => clock,
      sleep: async (duration) => { clock += duration },
      fetcher: async () => { calls += 1; return Response.json({ snapshot: oldSnapshot }) },
    }),
    /SYSTEM_HEALTH_SNAPSHOT_INVALID_OR_STALE/u,
  )
  assert.equal(calls, 2)
})

test('stops immediately on an observer authorization failure', async () => {
  let calls = 0
  await assert.rejects(
    waitForFreshSystemHealthSnapshot({
      ...baseInput,
      fetcher: async () => { calls += 1; return new Response('{}', { status: 401 }) },
    }),
    /SYSTEM_HEALTH_SNAPSHOT_AUTH_FAILED/u,
  )
  assert.equal(calls, 1)
})

test('accepts a new failure evaluation carrying an old observer heartbeat without declaring readiness', async () => {
  const snapshot = operationalSnapshot('red', nowMs)
  const observer = snapshot.checks.find((check) => check.check_id === 'observer-dispatcher')
  observer.reason_code = 'OBSERVER_HEARTBEAT_STALE'
  observer.observed_at = new Date(nowMs - 3_600_000).toISOString()
  const result = await waitForFreshSystemHealthSnapshot({
    ...baseInput, fetcher: async () => Response.json({ snapshot }),
  })
  assert.equal(result.overallStatus, 'red')
  let clock = nowMs
  await assert.rejects(waitForFreshSystemHealthSnapshot({
    ...baseInput, requireOperational: true, now: () => clock,
    sleep: async (duration) => { clock += duration },
    fetcher: async () => Response.json({ snapshot }),
  }), /SYSTEM_HEALTH_SNAPSHOT_NOT_OPERATIONAL/u)
})

test('still rejects old positive evidence, expired evaluations, and invalid failure timestamps', async () => {
  for (const kind of ['green', 'yellow', 'expired', 'future', 'null']) {
    const snapshot = operationalSnapshot('red', nowMs)
    const observer = snapshot.checks.find((check) => check.check_id === 'observer-dispatcher')
    observer.observed_at = new Date(nowMs - 3_600_000).toISOString()
    if (kind === 'green' || kind === 'yellow') {
      observer.status = kind
      snapshot.overall_status = kind === 'yellow' ? 'yellow' : 'gray'
    }
    if (kind === 'expired') snapshot.expires_at = new Date(nowMs).toISOString()
    if (kind === 'future') observer.observed_at = new Date(nowMs + 1).toISOString()
    if (kind === 'null') observer.observed_at = null
    await assert.rejects(waitForFreshSystemHealthSnapshot({
      ...baseInput, fetcher: async () => Response.json({ snapshot }),
    }), /SYSTEM_HEALTH_SNAPSHOT_INVALID_OR_STALE/u, kind)
  }
})

test('rejects a cross-project target before making a request', async () => {
  let calls = 0
  await assert.rejects(
    waitForFreshSystemHealthSnapshot({
      ...baseInput,
      supabaseUrl: 'https://attacker.supabase.co',
      fetcher: async () => { calls += 1; return Response.json({ snapshot: makeSnapshot() }) },
    }),
    /SYSTEM_HEALTH_SNAPSHOT_TARGET_MISMATCH/u,
  )
  assert.equal(calls, 0)
})

function makeSnapshot(completedAt = nowMs) {
  return {
    schema_version: 2,
    profile_id: 'cloudflare-admin-v1',
    required_check_ids: ['backend-edge-availability'],
    coverage_gaps: ['app-crash', 'push-notifications'],
    environment: 'production',
    project_ref: 'iwevizmsedyqozxlawwl',
    release_id: 'harness-test-release',
    scheduled_at: new Date(completedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    expires_at: new Date(completedAt + 180_000).toISOString(),
    overall_status: 'green',
    checks: [{
      check_id: 'backend-edge-availability',
      component: 'backend',
      status: 'green',
      reason_code: 'EDGE_AVAILABLE',
      incident_id: null,
      observed_at: new Date(completedAt).toISOString(),
      evidence_window: null,
      sample_count: 1,
      metrics: {},
    }],
  }
}

test('operational readiness waits for a new collector snapshot after observer recovery', async () => {
  let calls = 0
  let clock = nowMs
  const result = await waitForFreshSystemHealthSnapshot({
    ...baseInput, requireOperational: true, timeoutMs: 5000,
    now: () => clock, sleep: async (duration) => { clock += duration },
    fetcher: async () => {
      calls += 1
      return Response.json({ snapshot: operationalSnapshot(calls === 1 ? 'red' : 'green', clock) })
    },
  })
  assert.equal(calls, 2)
  assert.equal(result.overallStatus, 'gray')
})

test('operational readiness fails within its budget if a detector remains unhealthy', async () => {
  let clock = nowMs
  let calls = 0
  await assert.rejects(waitForFreshSystemHealthSnapshot({
    ...baseInput, requireOperational: true,
    now: () => clock, sleep: async (duration) => { clock += duration },
    fetcher: async () => { calls += 1; return Response.json({ snapshot: operationalSnapshot('red', clock) }) },
  }), /SYSTEM_HEALTH_SNAPSHOT_NOT_OPERATIONAL/u)
  assert.equal(calls, 2)
})

function operationalSnapshot(observerStatus, completedAt) {
  const snapshot = makeSnapshot(completedAt)
  const ids = ['backend-core', 'backend-storage-realtime-io', 'backend-scheduled-workers',
    'kael-agentic', 'app-native-connectivity', 'observer-dispatcher']
  snapshot.required_check_ids = ids
  snapshot.checks = ids.map((check_id) => ({ ...snapshot.checks[0], check_id,
    status: check_id === 'observer-dispatcher' ? observerStatus : check_id === 'app-native-connectivity' ? 'gray' : 'green',
    reason_code: check_id === 'app-native-connectivity' ? 'NO_ACTIVE_NATIVE_SESSIONS' : 'OBSERVED' }))
  snapshot.overall_status = observerStatus === 'red' ? 'red' : 'gray'
  return snapshot
}

test('operational release tolerates only explained inactivity while missing backend evidence blocks', () => {
  const snapshot = operationalSnapshot('green', nowMs)
  const kael = snapshot.checks.find((check) => check.check_id === 'kael-agentic')
  Object.assign(kael, { status: 'gray', reason_code: 'NO_RECENT_AI_ACTIVITY', sample_count: 0 })
  assert.equal(isOperationalSystemHealthSnapshot(snapshot), true)
  for (const reason of ['KAEL_EVIDENCE_MISSING', 'KAEL_EVIDENCE_INCOMPLETE', 'LEARNING_QUEUE_EVIDENCE_MISSING']) {
    kael.reason_code = reason
    assert.equal(isOperationalSystemHealthSnapshot(snapshot), false, reason)
  }
  Object.assign(kael, { reason_code: 'NO_RECENT_AI_ACTIVITY', sample_count: 1 })
  assert.equal(isOperationalSystemHealthSnapshot(snapshot), false, 'inactivity must have zero outcomes')
  Object.assign(kael, { reason_code: 'NO_RECENT_AI_ACTIVITY', sample_count: 0 })
  for (const id of ['backend-core', 'backend-storage-realtime-io', 'backend-scheduled-workers', 'observer-dispatcher']) {
    const check = snapshot.checks.find((item) => item.check_id === id)
    check.status = 'gray'
    assert.equal(isOperationalSystemHealthSnapshot(snapshot), false, `missing required ${id}`)
    check.status = 'green'
  }
  const native = snapshot.checks.find((check) => check.check_id === 'app-native-connectivity')
  for (const status of ['yellow', 'red']) {
    native.status = status
    assert.equal(isOperationalSystemHealthSnapshot(snapshot), false, `observed native ${status} must block`)
  }
})

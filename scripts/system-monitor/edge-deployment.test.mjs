import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { systemHealthObserverReleaseIdentity } from '../harness/release-bundle.mjs'
import {
  captureSystemMonitorEdgeState,
  verifySystemMonitorCandidate,
  verifySystemMonitorPreviousState,
} from './edge-deployment.mjs'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const release = {
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  gitSha: 'a'.repeat(40),
  systemHealthObserver: systemHealthObserverReleaseIdentity(ROOT),
}
const edgeState = { exists: true, id: '123e4567-e89b-42d3-a456-426614174000', version: 7, status: 'ACTIVE', verifyJwt: false }
const workerState = { exists: true, versionId: 'worker-version', releaseTag: release.releaseId }

test('captures only the system-monitor deployment identity from the Supabase Management API', async () => {
  const requests = []
  const state = await captureSystemMonitorEdgeState({
    projectRef: 'iwevizmsedyqozxlawwl',
    accessToken: 'supabase-access-token-that-is-not-real',
    fetcher: async (url, init) => {
      requests.push({ url: String(url), authorization: init.headers.authorization })
      return requests.length === 1
        ? Response.json([{ slug: 'system-monitor', id: edgeState.id, version: 7, status: 'ACTIVE' }])
        : Response.json({ ...edgeState, slug: 'system-monitor', verify_jwt: false })
    },
  })

  assert.deepEqual(state, edgeState)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].url, 'https://api.supabase.com/v1/projects/iwevizmsedyqozxlawwl/functions')
  assert.equal(requests[1].url, 'https://api.supabase.com/v1/projects/iwevizmsedyqozxlawwl/functions/system-monitor')
  assert.equal(requests[0].authorization, 'Bearer supabase-access-token-that-is-not-real')
  assert.doesNotMatch(JSON.stringify(state), /supabase-access-token-that-is-not-real/u)
})

test('treats a missing function as an empty pre-deploy baseline', async () => {
  const state = await captureSystemMonitorEdgeState({
    projectRef: 'iwevizmsedyqozxlawwl',
    accessToken: 'supabase-access-token-that-is-not-real',
    fetcher: async () => Response.json([{ slug: 'mobile-api', id: 'not-system-monitor' }]),
  })
  assert.deepEqual(state, { exists: false })
})

test('treats absent Edge and Worker runtimes as a first install even if an older manifest declared intent', () => {
  const evidence = verifySystemMonitorPreviousState({
    release,
    edgeState: { exists: false },
    workerState: { exists: false },
  })
  assert.deepEqual(evidence, { status: 'no_previous_monitor', edgeExists: false, workerExists: false })
})

test('accepts a previous monitor only when Worker and Edge identities match the active release', () => {
  const evidence = verifySystemMonitorPreviousState({
    release,
    edgeState,
    workerState,
    sourceRoot: ROOT,
  })
  assert.equal(evidence.status, 'previous_monitor_verified')
  assert.equal(evidence.sourceSha256, release.systemHealthObserver.edgeFunction.sha256)
  assert.equal(evidence.edgeVersion, edgeState.version)
  assert.throws(() => verifySystemMonitorPreviousState({
    release,
    edgeState,
    workerState: { ...workerState, releaseTag: 'harness-cccccccccccc-dddddddddddd' },
    sourceRoot: ROOT,
  }), /SYSTEM_MONITOR_PREVIOUS_RUNTIME_IDENTITY_MISMATCH/u)
})

test('rejects an unregistered existing monitor before Production mutation', () => {
  assert.throws(() => verifySystemMonitorPreviousState({
    release: null,
    edgeState,
    workerState: { exists: false },
  }), /SYSTEM_MONITOR_UNREGISTERED_RUNTIME_FOUND/u)
})

test('accepts only a rollback-tagged Worker with confirmed empty Cron schedules as a dormant first-install remnant', () => {
  const previousRelease = { ...release, environment: 'production', systemHealthObserver: undefined }
  const dormantWorker = {
    exists: true,
    deploymentId: 'deployment-id',
    versionId: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: '2026-10-15T10:00:00.000Z',
    releaseTag: `rollback-${'c'.repeat(40)}`,
    releaseMessage: null,
    cronSchedules: [],
  }
  const evidence = verifySystemMonitorPreviousState({
    release: previousRelease,
    edgeState: { exists: false },
    workerState: dormantWorker,
  })
  assert.deepEqual(evidence, {
    status: 'dormant_rollback_worker_verified',
    releaseId: previousRelease.releaseId,
    edgeExists: false,
    workerExists: true,
    workerVersionId: '123e4567-e89b-12d3-a456-426614174000',
    workerReleaseTag: dormantWorker.releaseTag,
    workerCronSchedules: [],
  })
})

test('rejects an unverified Cron schedule when evaluating a rollback remnant', () => {
  assert.throws(() => verifySystemMonitorPreviousState({
    release: { ...release, systemHealthObserver: undefined },
    edgeState: { exists: false },
    workerState: { exists: true, releaseTag: `rollback-${'c'.repeat(40)}`, cronSchedules: ['* * * * *'] },
  }), /SYSTEM_MONITOR_UNREGISTERED_RUNTIME_FOUND/u)
})

test('does not treat a rollback-tagged Worker as dormant when the active release registered the observer', () => {
  assert.throws(() => verifySystemMonitorPreviousState({
    release,
    edgeState: { exists: false },
    workerState: { exists: true, releaseTag: `rollback-${'c'.repeat(40)}`, cronSchedules: [] },
  }), /SYSTEM_MONITOR_PREVIOUS_RUNTIME_IDENTITY_MISMATCH/u)
})

test('candidate proof requires a new active version and byte-matching source', () => {
  const evidence = verifySystemMonitorCandidate({
    release,
    beforeState: edgeState,
    afterState: { ...edgeState, version: edgeState.version + 1 },
    sourceRoot: ROOT,
  })
  assert.equal(evidence.status, 'verified')
  assert.equal(evidence.releaseId, release.releaseId)
  assert.equal(evidence.edgeVersion, edgeState.version + 1)
  assert.equal(evidence.runtimeConfigurationSha256, release.systemHealthObserver.edgeFunction.runtimeConfiguration.sha256)
  assert.throws(() => verifySystemMonitorCandidate({
    release,
    beforeState: edgeState,
    afterState: edgeState,
    sourceRoot: ROOT,
  }), /SYSTEM_MONITOR_CANDIDATE_IDENTITY_MISMATCH/u)
})

test('rejects an Edge source closure that differs from the registered release identity', () => {
  assert.throws(() => verifySystemMonitorCandidate({
    release: { ...release, systemHealthObserver: {
      ...release.systemHealthObserver,
      edgeFunction: { ...release.systemHealthObserver.edgeFunction, sha256: '0'.repeat(64) },
    } },
    beforeState: { exists: false },
    afterState: edgeState,
    sourceRoot: ROOT,
  }), /SYSTEM_MONITOR_EDGE_SOURCE_MISMATCH/u)
})

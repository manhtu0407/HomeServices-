import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyCloudflareRuntimeEvidence, verifyCloudflareWorkerDeploymentIdentity } from './verify-cloudflare-runtime.mjs'

const nowMs = Date.parse('2026-10-13T12:00:00.000Z')
const release = {
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  gitSha: 'a'.repeat(40),
  systemHealthObserver: {
    profileId: 'cloudflare-admin-v1',
    workerName: 'nestscout-system-health-observer',
    workerBundleSha256: 'b'.repeat(64),
    d1Database: { binding: 'DB', name: 'nestscout-system-health-observer', id: '33d39ec6-73a4-44e6-b030-fb9ee3e4f281' },
    d1Migrations: [
      { path: 'scripts/system-monitor/migrations/0001_initial.sql', sha256: 'c'.repeat(64) },
      { path: 'scripts/system-monitor/migrations/0002_observer_occurrences_and_ticks.sql', sha256: 'd'.repeat(64) },
    ],
    d1MigrationsSha256: 'e'.repeat(64),
  },
}
const deployments = {
  success: true,
  deployments: [{
    id: 'deployment-1',
    created_on: '2026-10-13T11:00:00.000Z',
    annotations: { 'workers/message': release.gitSha },
    versions: [{ version_id: 'version-1', percentage: 100 }],
  }],
}
const workerVersions = {
  success: true,
  result: [{
    id: 'version-1',
    annotations: { 'workers/tag': release.releaseId, 'workers/message': release.gitSha },
  }],
}

test('verifies the current Worker release tag, applied D1 migrations, and a live D1 tick', () => {
  const result = verifyCloudflareRuntimeEvidence({ deployments, versions: workerVersions, d1Evidence: makeD1Evidence(), release, nowMs })
  assert.deepEqual(result, {
    status: 'verified',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    profileId: 'cloudflare-admin-v1',
    workerName: 'nestscout-system-health-observer',
    workerBundleSha256: 'b'.repeat(64),
    deploymentId: 'deployment-1',
    workerVersions: [{ versionId: 'version-1', percentage: 100 }],
    d1Database: release.systemHealthObserver.d1Database,
    d1MigrationsSha256: 'e'.repeat(64),
    appliedMigrations: ['0001_initial.sql', '0002_observer_occurrences_and_ticks.sql'],
    latestTick: {
      scheduledAt: new Date(nowMs - 60_000).toISOString(),
      completedAt: new Date(nowMs - 45_000).toISOString(),
      snapshotAt: new Date(nowMs - 45_000).toISOString(),
    },
  })
})

test('can fail fast on Worker identity without requiring a Cron tick yet', () => {
  const result = verifyCloudflareWorkerDeploymentIdentity({ deployments, versions: workerVersions.result, release })
  assert.equal(result.releaseId, release.releaseId)
  assert.equal(result.gitSha, release.gitSha)
  assert.deepEqual(result.workerVersions, [{ versionId: 'version-1', percentage: 100 }])
})

test('accepts a result.items Worker version-list shape only when its annotations match', () => {
  const versions = { success: true, result: { items: workerVersions.result } }
  const result = verifyCloudflareWorkerDeploymentIdentity({ deployments, versions, release })
  assert.equal(result.status, 'verified')
  assert.equal(result.workerVersions[0].versionId, 'version-1')
})

test('rejects a Worker version tagged for another release even when the deployment points to it', () => {
  const wrong = structuredClone(workerVersions)
  wrong.result[0].annotations['workers/tag'] = 'other-release'
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, versions: wrong, d1Evidence: makeD1Evidence(), release, nowMs }),
    /CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH/u,
  )
})

test('rejects a deployment that points to a different version than the tagged release', () => {
  const wrong = structuredClone(deployments)
  wrong.deployments[0].versions[0].version_id = 'version-other'
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments: wrong, versions: workerVersions, d1Evidence: makeD1Evidence(), release, nowMs }),
    /CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH/u,
  )
})

test('rejects a version message that does not identify the merged source SHA', () => {
  const wrong = structuredClone(workerVersions)
  wrong.result[0].annotations['workers/message'] = 'b'.repeat(40)
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, versions: wrong, d1Evidence: makeD1Evidence(), release, nowMs }),
    /CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH/u,
  )
})

test('rejects traffic splits instead of treating a partly deployed release as production identity', () => {
  const wrong = structuredClone(deployments)
  wrong.deployments[0].versions[0].percentage = 50
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments: wrong, versions: workerVersions, d1Evidence: makeD1Evidence(), release, nowMs }),
    /CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH/u,
  )
})

test('rejects missing D1 migrations', () => {
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, versions: workerVersions, d1Evidence: makeD1Evidence(['0001_initial.sql']), release, nowMs }),
    /CLOUDFLARE_D1_MIGRATION_EVIDENCE_INCOMPLETE/u,
  )
})

test('rejects stale ticks, pending reconciliation errors, and late timestamps', () => {
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, versions: workerVersions, d1Evidence: makeD1Evidence(undefined, nowMs - 181_000), release, nowMs }),
    /CLOUDFLARE_OBSERVER_TICK_NOT_HEALTHY/u,
  )
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, versions: workerVersions, d1Evidence: makeD1Evidence(undefined, undefined, 'OUTAGE_RECONCILIATION_PENDING'), release, nowMs }),
    /CLOUDFLARE_OBSERVER_REPORTED_ERROR/u,
  )
})

test('selects the newest release from oldest-first Cloudflare deployment history', () => {
  const deploymentsOldestFirst = [
    { id: 'deployment-old', created_on: '2026-10-14T21:47:12.767573Z', versions: [{ version_id: 'version-old', percentage: 100 }] },
    { id: 'deployment-rollback', created_on: '2026-10-14T21:51:02.624096Z', versions: [{ version_id: 'version-rollback', percentage: 100 }] },
    { id: 'deployment-current', created_on: '2026-10-14T23:18:18.482949Z', versions: [{ version_id: 'version-current', percentage: 100 }] },
  ]
  const versions = [
    { id: 'version-old', annotations: { 'workers/tag': 'harness-old', 'workers/message': 'c'.repeat(40) } },
    { id: 'version-rollback', annotations: { 'workers/tag': 'rollback-old', 'workers/message': 'd'.repeat(40) } },
    { id: 'version-current', annotations: { 'workers/tag': release.releaseId, 'workers/message': release.gitSha } },
  ]

  const result = verifyCloudflareWorkerDeploymentIdentity({ deployments: deploymentsOldestFirst, versions, release })

  assert.equal(result.deploymentId, 'deployment-current')
  assert.deepEqual(result.workerVersions, [{ versionId: 'version-current', percentage: 100 }])
})

test('rejects a release that appears only on an older Worker deployment', () => {
  const deploymentsNewestLast = [
    { id: 'deployment-old', created_on: '2026-10-13T11:00:00.000Z', versions: [{ version_id: 'version-current', percentage: 100 }] },
    { id: 'deployment-new', created_on: '2026-10-13T12:00:00.000Z', versions: [{ version_id: 'version-new', percentage: 100 }] },
  ]
  const versions = [
    { id: 'version-current', annotations: { 'workers/tag': release.releaseId, 'workers/message': release.gitSha } },
    { id: 'version-new', annotations: { 'workers/tag': 'harness-other', 'workers/message': 'd'.repeat(40) } },
  ]

  assert.throws(
    () => verifyCloudflareWorkerDeploymentIdentity({ deployments: deploymentsNewestLast, versions, release }),
    /CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH/u,
  )
})

test('rejects tied deployment timestamps instead of guessing the active version', () => {
  const createdOn = '2026-10-13T12:00:00.000Z'
  const tiedDeployments = [
    { id: 'deployment-one', created_on: createdOn, versions: [{ version_id: 'version-1', percentage: 100 }] },
    { id: 'deployment-two', created_on: createdOn, versions: [{ version_id: 'version-1', percentage: 100 }] },
  ]

  assert.throws(
    () => verifyCloudflareWorkerDeploymentIdentity({ deployments: tiedDeployments, versions: workerVersions, release }),
    /CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH/u,
  )
})

function makeD1Evidence(migrations, snapshotTime = nowMs - 45_000, lastErrorCode = null) {
  const values = {
    migrations: migrations ?? ['0001_initial.sql', '0002_observer_occurrences_and_ticks.sql'],
    latestTick: {
      scheduled_at: new Date(nowMs - 60_000).toISOString(),
      completed_at: new Date(nowMs - 45_000).toISOString(),
      outcome: 'completed',
    },
    state: {
      last_snapshot_at: new Date(snapshotTime).toISOString(),
      last_error_code: lastErrorCode,
    },
  }
  return { success: true, results: [{ results: [{ evidence: JSON.stringify(values) }] }] }
}

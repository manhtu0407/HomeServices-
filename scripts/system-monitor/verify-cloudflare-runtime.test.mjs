import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyCloudflareRuntimeEvidence } from './verify-cloudflare-runtime.mjs'

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
    annotations: { 'workers/tag': release.releaseId },
    versions: [{ version_id: 'version-1', percentage: 100 }],
  }],
}

test('verifies the current Worker release tag, applied D1 migrations, and a live D1 tick', () => {
  const result = verifyCloudflareRuntimeEvidence({ deployments, d1Evidence: makeD1Evidence(), release, nowMs })
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

test('rejects an untagged deployment even when its source version is current', () => {
  const wrong = structuredClone(deployments)
  wrong.deployments[0].annotations['workers/tag'] = 'other-release'
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments: wrong, d1Evidence: makeD1Evidence(), release, nowMs }),
    /CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH/u,
  )
})

test('rejects missing D1 migrations', () => {
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, d1Evidence: makeD1Evidence(['0001_initial.sql']), release, nowMs }),
    /CLOUDFLARE_D1_MIGRATION_EVIDENCE_INCOMPLETE/u,
  )
})

test('rejects stale ticks, pending reconciliation errors, and late timestamps', () => {
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, d1Evidence: makeD1Evidence(undefined, nowMs - 181_000), release, nowMs }),
    /CLOUDFLARE_OBSERVER_TICK_NOT_HEALTHY/u,
  )
  assert.throws(
    () => verifyCloudflareRuntimeEvidence({ deployments, d1Evidence: makeD1Evidence(undefined, undefined, 'OUTAGE_RECONCILIATION_PENDING'), release, nowMs }),
    /CLOUDFLARE_OBSERVER_TICK_NOT_HEALTHY/u,
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

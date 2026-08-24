import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRelease, buildRemote, readMigrationVersions } from './parity-snapshot.mjs'
import { compareDeploymentState } from './deployment-drift.mjs'

const health = {
  environment: { name: 'production', project_ref: 'proj' },
  release: { release_id: 'unreleased', git_sha: 'unknown', manifest_sha256: 'unknown', registered: false },
}

test('reads versions from arrays and from row shapes alike', () => {
  assert.deepEqual(readMigrationVersions(['20260101000000']), ['20260101000000'])
  assert.deepEqual(readMigrationVersions([{ version: '20260101000000' }]), ['20260101000000'])
  assert.deepEqual(readMigrationVersions({ rows: [{ id: '20260101000000' }] }), ['20260101000000'])
  assert.deepEqual(readMigrationVersions([{ version: null }]), [])
})

test('writes an unregistered runtime through instead of substituting a value', () => {
  const remote = buildRemote(health, [])
  assert.equal(remote.releaseId, 'unreleased')
  assert.equal(remote.gitSha, 'unknown')
  assert.equal(remote.registered, false)
})

test('never passes the manifest digest off as the migration-inventory digest', () => {
  const registered = {
    environment: { name: 'staging', project_ref: 'proj' },
    release: { release_id: 'rel-1', git_sha: 'c'.repeat(40), manifest_sha256: 'a'.repeat(64), registered: true },
  }
  const remote = buildRemote(registered, [])
  assert.equal(remote.manifestSha256, 'a'.repeat(64))
  assert.equal(remote.migrationInventorySha256, null)
  const report = compareDeploymentState({
    release: buildRelease({
      environment: 'staging',
      releaseId: 'rel-1',
      gitSha: 'c'.repeat(40),
      migrationInventorySha256: 'd'.repeat(64),
    }),
    inventory: { entries: [] },
    remote,
  })
  assert.ok(report.problems.some((p) => p.includes('migration inventory digest is missing')))
  assert.ok(!report.problems.some((p) => p.includes('digest mismatch')))
})

test('feeds the drift gate a snapshot that names the missing migrations', () => {
  const inventory = {
    entries: [{ version: '20260815215000' }, { version: '20260816120000' }, { version: '20260818100000' }],
  }
  const report = compareDeploymentState({
    release: buildRelease({
      environment: 'production',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      gitSha: 'c'.repeat(40),
      migrationInventorySha256: 'd'.repeat(64),
    }),
    inventory,
    remote: buildRemote(health, ['20260815215000']),
  })
  assert.equal(report.ok, false)
  assert.ok(report.problems.some((p) => p.includes('20260816120000') && p.includes('20260818100000')))
})

test('an environment the caller did not intend is reported, not absorbed', () => {
  const report = compareDeploymentState({
    release: buildRelease({
      environment: 'staging',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      gitSha: 'c'.repeat(40),
      migrationInventorySha256: 'd'.repeat(64),
    }),
    inventory: { entries: [] },
    remote: buildRemote(health, []),
  })
  assert.ok(report.problems.some((p) => p.startsWith('environment mismatch')))
})

test('a fully matching snapshot passes once the inventory digest is supplied', () => {
  const inventory = { entries: [{ version: '20260101000000' }] }
  const registered = {
    environment: { name: 'staging', project_ref: 'proj' },
    release: { release_id: 'rel-1', git_sha: 'c'.repeat(40), manifest_sha256: 'a'.repeat(64), registered: true },
  }
  const report = compareDeploymentState({
    release: buildRelease({
      environment: 'staging',
      releaseId: 'rel-1',
      gitSha: 'c'.repeat(40),
      migrationInventorySha256: 'd'.repeat(64),
    }),
    inventory,
    remote: buildRemote(registered, ['20260101000000'], 'd'.repeat(64)),
  })
  assert.equal(report.ok, true, report.problems.join('; '))
})

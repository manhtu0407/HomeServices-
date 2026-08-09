import assert from 'node:assert/strict'
import test from 'node:test'
import { compareDeploymentState } from './deployment-drift.mjs'

const release = {
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  environment: 'staging',
  gitSha: 'c'.repeat(40),
  migrationInventorySha256: 'd'.repeat(64),
  edgeFunctions: { 'mobile-api': 'e'.repeat(64), 'sepay-webhook': 'f'.repeat(64) },
}
const inventory = { entries: [{ version: '20260101000000' }, { version: '20260102000000' }] }

test('accepts one exact release, migration, and function snapshot', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: 'staging',
      releaseId: release.releaseId,
      gitSha: release.gitSha,
      migrationInventorySha256: release.migrationInventorySha256,
      migrations: inventory.entries,
      edgeFunctions: release.edgeFunctions,
    },
  })
  assert.equal(report.ok, true)
})

test('blocks missing, unknown, modified, mixed, and out-of-order state', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: 'production',
      releaseId: 'other',
      gitSha: '0'.repeat(40),
      migrations: [{ version: '20260102000000' }, { version: 'unknown' }],
      edgeFunctions: { 'mobile-api': '0'.repeat(64), extra: '1'.repeat(64) },
    },
  })
  assert.equal(report.ok, false)
  assert.ok(report.problems.some((problem) => problem.includes('environment mismatch')))
  assert.ok(report.problems.some((problem) => problem.includes('missing migrations')))
  assert.ok(report.problems.some((problem) => problem.includes('unknown migrations')))
  assert.ok(report.problems.some((problem) => problem.includes('digest mismatch')))
  assert.ok(report.problems.some((problem) => problem.includes('unknown Edge function')))
})

test('rejects incomplete and ambiguous remote identity evidence', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: release.environment,
      migrations: [
        { version: '20260101000000' },
        { version: '20260102000000' },
        { version: '20260102000000' },
        null,
      ],
      edgeFunctions: release.edgeFunctions,
    },
  })
  assert.equal(report.ok, false)
  assert.ok(report.problems.some((problem) => problem.includes('remote release ID is missing')))
  assert.ok(report.problems.some((problem) => problem.includes('remote Git SHA is missing')))
  assert.ok(report.problems.some((problem) => problem.includes('remote migration inventory digest is missing')))
  assert.ok(report.problems.some((problem) => problem.includes('duplicate versions')))
  assert.ok(report.problems.some((problem) => problem.includes('without a version')))
})

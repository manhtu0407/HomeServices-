import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyRollbackProof } from './rollback-proof.mjs'

const digest = (character) => character.repeat(64)
const hosted = (overrides = {}) => ({
  environment: 'production',
  projectRef: 'iwevizmsedyqozxlawwl',
  releaseId: 'harness-111111111111-222222222222',
  gitSha: 'a'.repeat(40),
  manifestSha256: digest('1'),
  bundleSha256: digest('2'),
  migrationInventorySha256: digest('3'),
  sourceBundleSha256: digest('4'),
  mobileBuildFingerprintSha256: digest('5'),
  edgeBundleSha256: digest('6'),
  serviceIntakePolicyBundleSha256: digest('7'),
  priceEvidenceBundleSha256: digest('8'),
  providerReadinessFingerprintSha256: digest('9'),
  migrations: [{ version: '20260823100000' }],
  managedEdgeFunctions: {
    'mobile-api': { status: 'ACTIVE', version: 40, ezbr_sha256: digest('a'), verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json' },
    'kael-matching-maintainer': { status: 'ACTIVE', version: 10, ezbr_sha256: digest('d'), verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json' },
  },
  ...overrides,
})

const input = () => ({
  hostedBefore: hosted(),
  hostedAfter: hosted({
    migrations: [{ version: '20260823100000' }, { version: '20260823110000' }],
    managedEdgeFunctions: {
      'mobile-api': { status: 'ACTIVE', version: 44, ezbr_sha256: digest('b'), verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json' },
      'kael-matching-maintainer': { status: 'ACTIVE', version: 14, ezbr_sha256: digest('e'), verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json' },
    },
  }),
  controlBefore: {
    result: { active_release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb', candidate_release_id: null, candidate_cohort_id: null, candidate_packet_sha256: null, revision: 7 },
  },
  controlAfter: {
    result: { active_release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb', candidate_release_id: null, candidate_cohort_id: null, candidate_packet_sha256: null, revision: 9 },
  },
  controlRecovery: {
    action: 'recover',
    mode: 'candidate_aborted',
    before: {
      active_release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb', candidate_release_id: 'harness-111111111111-222222222222',
      candidate_cohort_id: 'synthetic-stage1-111111111111-222222222222-test', candidate_packet_sha256: digest('d'), revision: 8,
    },
    after: { active_release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb', candidate_release_id: null, candidate_cohort_id: null, candidate_packet_sha256: null, revision: 9 },
  },
  rollbackSourceSha256ByFunction: {
    'mobile-api': digest('c'),
    'kael-matching-maintainer': digest('f'),
  },
  restoredSourceSha256ByFunction: {
    'mobile-api': digest('c'),
    'kael-matching-maintainer': digest('f'),
  },
})

test('accepts an exact identity, aborted control, forward schema, and byte-identical downloaded source', () => {
  assert.deepEqual(verifyRollbackProof(input()).problems, [])
})

test('rejects a candidate identity or source that survived rollback', () => {
  const value = input()
  value.hostedAfter.releaseId = 'harness-333333333333-444444444444'
  value.controlAfter.result.candidate_release_id = value.hostedAfter.releaseId
  value.restoredSourceSha256ByFunction['mobile-api'] = digest('d')
  const report = verifyRollbackProof(value)
  assert.equal(report.ok, false)
  assert.match(report.problems.join('\n'), /identity/u)
  assert.match(report.problems.join('\n'), /candidate remained/u)
  assert.match(report.problems.join('\n'), /source does not match/u)
})

test('rejects a missing redeploy or migration history rewrite', () => {
  const value = input()
  value.hostedAfter.managedEdgeFunctions['mobile-api'].version = 40
  value.hostedAfter.managedEdgeFunctions['kael-matching-maintainer'].version = 10
  value.hostedAfter.migrations = [{ version: '20260823110000' }]
  const report = verifyRollbackProof(value)
  assert.equal(report.ok, false)
  assert.match(report.problems.join('\n'), /post-failure redeploy/u)
  assert.match(report.problems.join('\n'), /rewrote or reordered/u)
})

test('normalizes a legacy unreleased hosted identity on both sides', () => {
  const value = input()
  for (const state of [value.hostedBefore, value.hostedAfter]) {
    state.releaseId = null
    state.gitSha = null
    state.manifestSha256 = null
    state.bundleSha256 = null
    state.migrationInventorySha256 = null
    state.sourceBundleSha256 = null
    state.mobileBuildFingerprintSha256 = null
    state.edgeBundleSha256 = null
    state.serviceIntakePolicyBundleSha256 = null
    state.priceEvidenceBundleSha256 = null
    state.providerReadinessFingerprintSha256 = null
  }
  assert.equal(verifyRollbackProof(value).ok, true)
})

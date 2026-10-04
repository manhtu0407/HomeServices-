import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertPlan55RollbackDrillProof,
  buildPlan55RollbackDrillProofFromArchive,
  verifyPlan55RollbackDrillProof,
  verifyRollbackProof,
} from './rollback-proof.mjs'

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

const plan55Drill = () => {
  const baselineSha = 'b'.repeat(40)
  const baselineReleaseId = `harness-${baselineSha.slice(0, 12)}-${'c'.repeat(12)}`
  const candidateSha = 'a'.repeat(40)
  const candidateReleaseId = `harness-${candidateSha.slice(0, 12)}-${'d'.repeat(12)}`
  const source = (releaseId, gitSha, mobileVersion, mobileDigest, releaseLane) => hosted({
    releaseId,
    gitSha,
    releaseLane,
    managedEdgeFunctions: {
      'mobile-api': {
        status: 'ACTIVE', version: mobileVersion, ezbr_sha256: mobileDigest,
        verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
      'kael-matching-maintainer': {
        status: 'ACTIVE', version: 10, ezbr_sha256: digest('d'),
        verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
    },
  })
  const baseline = source(baselineReleaseId, baselineSha, 40, digest('a'), null)
  const candidateBefore = source(candidateReleaseId, candidateSha, 44, digest('b'), 'plan55-production-only')
  const rollback = source(baselineReleaseId, baselineSha, 45, digest('a'), null)
  const candidateAfter = source(candidateReleaseId, candidateSha, 46, digest('b'), 'plan55-production-only')
  const controlState = (activeReleaseId, previousActiveReleaseId, revision) => ({
    active_release_id: activeReleaseId,
    previous_active_release_id: previousActiveReleaseId,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    candidate_started_at: null,
    revision,
  })
  const controlBefore = controlState(baselineReleaseId, null, 9)
  const controlAfterRollback = controlState(baselineReleaseId, null, 9)
  const input = {
    hostedBaseline: baseline,
    hostedBefore: candidateBefore,
    hostedAfterRollback: rollback,
    hostedAfterRestore: candidateAfter,
    controlBefore: { action: 'read', result: controlBefore },
    controlRecovery: {
      action: 'read',
      mode: 'unchanged',
      before: controlBefore,
      after: controlAfterRollback,
    },
    controlAfter: { action: 'read', result: controlState(baselineReleaseId, null, 9) },
    baselineSourceSha256: digest('c'),
    rollbackSourceSha256: digest('c'),
    candidateBeforeSourceSha256: digest('b'),
    candidateAfterSourceSha256: digest('b'),
    flagsBefore: {
      environment: 'production', projectRef: 'iwevizmsedyqozxlawwl',
      globalServiceFlagsAbsent: true, scopedCanaryFlagAbsent: true,
    },
    flagsAfter: {
      environment: 'production', projectRef: 'iwevizmsedyqozxlawwl',
      globalServiceFlagsAbsent: true, scopedCanaryFlagAbsent: true,
    },
  }
  return {
    input,
    baselineReleaseId,
    baselineSha,
    candidateReleaseId,
    candidateSha,
    policy: {
      environment: 'production',
      projectRef: 'iwevizmsedyqozxlawwl',
      releaseLane: 'plan55-production-only',
      productionSourceBase: {
        branch: `codex/plan55-production-base-${baselineSha.slice(0, 8)}-review-v2`,
        releaseId: baselineReleaseId,
        sha: baselineSha,
      },
    },
    release: {
      environment: 'production',
      projectRef: 'iwevizmsedyqozxlawwl',
      releaseLane: 'plan55-production-only',
      releaseId: candidateReleaseId,
      gitSha: candidateSha,
      edgeFunctions: { 'mobile-api': digest('b') },
    },
  }
}

const rollbackArtifactFiles = (value) => {
  const jsonFile = (contents) => Buffer.from(`${JSON.stringify(contents)}\n`)
  const textFile = (contents) => Buffer.from(`${contents}\n`)
  const files = new Map([
    ['artifacts/release/release.json', jsonFile(value.release)],
    ['artifacts/release/hosted-baseline.json', jsonFile(value.input.hostedBaseline)],
    ['artifacts/release/hosted-before-drill.json', jsonFile(value.input.hostedBefore)],
    ['artifacts/release/hosted-after-rollback.json', jsonFile(value.input.hostedAfterRollback)],
    ['artifacts/release/hosted-after-restore.json', jsonFile(value.input.hostedAfterRestore)],
    ['artifacts/release/control-before-drill.json', jsonFile(value.input.controlBefore)],
    ['artifacts/release/control-recovery.json', jsonFile(value.input.controlRecovery)],
    ['artifacts/release/control-after-restore.json', jsonFile(value.input.controlAfter)],
    ['artifacts/release/flags-before.json', jsonFile(value.input.flagsBefore)],
    ['artifacts/release/flags-after.json', jsonFile(value.input.flagsAfter)],
    ['artifacts/release/baseline-mobile-api-source-sha256.txt', textFile(value.input.baselineSourceSha256)],
    ['artifacts/release/rollback-mobile-api-source-sha256.txt', textFile(value.input.rollbackSourceSha256)],
    ['artifacts/release/candidate-before-mobile-api-source-sha256.txt', textFile(value.input.candidateBeforeSourceSha256)],
    ['artifacts/release/candidate-after-mobile-api-source-sha256.txt', textFile(value.input.candidateAfterSourceSha256)],
  ])
  const proof = verifyPlan55RollbackDrillProof(value.input, {
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: files,
  })
  files.set('artifacts/release/plan55-rollback-drill-proof.json', jsonFile(proof))
  return files
}

test('accepts an exact identity, aborted control, forward schema, and byte-identical downloaded source', () => {
  assert.deepEqual(verifyRollbackProof(input()).problems, [])
})

test('Plan 55 rollback drill restores the hosted source without activating the candidate release-control lane', () => {
  const value = plan55Drill()
  const report = verifyPlan55RollbackDrillProof(value.input, {
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: rollbackArtifactFiles(value),
  })

  assert.deepEqual(report.problems, [])
  assert.equal(report.status, 'PASS')
  assert.equal(report.candidateReleaseId, value.candidateReleaseId)
  assert.equal(report.candidateSourceSha, value.candidateSha)
  assert.equal(report.restoredReleaseId, value.candidateReleaseId)
  assert.equal(report.restoredSourceSha, value.candidateSha)
  assert.deepEqual(Object.values(report.edgeVersions), [40, 44, 45, 46])
  assert.deepEqual(report.releaseControl, {
    recoveryMode: 'unchanged',
    revisionBefore: 9,
    revisionAfterRollback: 9,
    revisionAfterRestore: 9,
    activeReleaseAfterRestore: value.baselineReleaseId,
  })
  assert.equal(Object.keys(report.artifactFileSha256).length, 14)
  const files = rollbackArtifactFiles(value)
  assert.deepEqual(buildPlan55RollbackDrillProofFromArchive({
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: files,
  }), report)
  assert.equal(assertPlan55RollbackDrillProof(report, {
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: files,
  }), true)
})

test('Plan 55 rollback drill rejects candidate activation or any release-control mutation', () => {
  const mutate = [
    (value) => { value.input.controlBefore.result.active_release_id = value.candidateReleaseId },
    (value) => { value.input.controlAfter.result.active_release_id = value.candidateReleaseId },
    (value) => { value.input.controlAfter.result.revision += 1 },
    (value) => { value.input.controlAfter.result.candidate_release_id = value.candidateReleaseId },
    (value) => { value.input.controlRecovery.mode = 'active_rolled_back' },
    (value) => { value.input.controlRecovery.before.revision += 1 },
    (value) => { value.input.controlAfter.result.candidate_started_at = '2026-10-03T00:00:00.000Z' },
    (value) => { delete value.input.controlAfter.result.previous_active_release_id },
  ]
  for (const change of mutate) {
    const value = plan55Drill()
    change(value)
    const report = verifyPlan55RollbackDrillProof(value.input, {
      policy: value.policy,
      release: value.release,
      sourceArtifactFiles: rollbackArtifactFiles(value),
    })
    assert.equal(report.status, 'BLOCKED')
    assert.ok(report.problems.length > 0)
  }
})

test('Plan 55 rollback drill requires and binds the archived raw evidence bytes', () => {
  const value = plan55Drill()
  const missingArchive = verifyPlan55RollbackDrillProof(value.input, {
    policy: value.policy,
    release: value.release,
  })
  assert.equal(missingArchive.status, 'BLOCKED')
  assert.match(missingArchive.problems.join('\n'), /archived Plan 55 rollback drill evidence/u)

  const files = rollbackArtifactFiles(value)
  files.set('artifacts/release/hosted-after-restore.json', Buffer.from('{}\n'))
  const changedArchive = verifyPlan55RollbackDrillProof(value.input, {
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: files,
  })
  assert.equal(changedArchive.status, 'BLOCKED')
  assert.match(changedArchive.problems.join('\n'), /archived Plan 55 rollback evidence/u)
  const rebuilt = buildPlan55RollbackDrillProofFromArchive({
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: files,
  })
  assert.equal(rebuilt.status, 'BLOCKED')
  assert.throws(() => assertPlan55RollbackDrillProof(changedArchive, {
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: files,
  }), /exact archived rollback artifact/u)

  const missingControlArchive = rollbackArtifactFiles(value)
  missingControlArchive.delete('artifacts/release/control-recovery.json')
  assert.equal(verifyPlan55RollbackDrillProof(value.input, {
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: missingControlArchive,
  }).status, 'BLOCKED')
  assert.throws(() => buildPlan55RollbackDrillProofFromArchive({
    policy: value.policy,
    release: value.release,
    sourceArtifactFiles: missingControlArchive,
  }), /rollback drill artifact is missing/u)
})

test('Plan 55 rollback drill rejects wrong source, baseline, deployment order, bindings, digest, and flags', () => {
  const cases = [
    (value) => { value.release.gitSha = 'e'.repeat(40) },
    (value) => { value.release.releaseLane = 'ordinary-production' },
    (value) => { value.policy.releaseLane = 'ordinary-production' },
    (value) => { value.policy.projectRef = 'not-production' },
    (value) => { value.policy.productionSourceBase.releaseId = `harness-${'f'.repeat(12)}-${'a'.repeat(12)}` },
    (value) => { value.input.hostedAfterRollback.gitSha = 'e'.repeat(40) },
    (value) => { value.input.hostedBefore.releaseId = value.baselineReleaseId },
    (value) => { value.input.hostedAfterRestore.bundleSha256 = digest('e') },
    (value) => { value.input.hostedAfterRollback.managedEdgeFunctions['mobile-api'].version = 43 },
    (value) => { value.input.rollbackSourceSha256 = digest('e') },
    (value) => { value.input.candidateAfterSourceSha256 = digest('e') },
    (value) => { value.input.flagsBefore.scopedCanaryFlagAbsent = false },
    (value) => { value.input.flagsAfter.globalServiceFlagsAbsent = false },
  ]
  for (const mutate of cases) {
    const value = plan55Drill()
    mutate(value)
    const report = verifyPlan55RollbackDrillProof(value.input, {
      policy: value.policy,
      release: value.release,
      sourceArtifactFiles: rollbackArtifactFiles(value),
    })
    assert.equal(report.status, 'BLOCKED')
    assert.ok(report.problems.length > 0)
  }
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

test('accepts hosted deploy paths that differ only by the redeployed version', () => {
  const value = input()
  const hostedPath = (functionId, version, name, file) =>
    `file:///tmp/user_fn_iwevizmsedyqozxlawwl_${functionId}_${version}/source/supabase/functions/${name}/${file}`
  const mobileId = '7d0946b9-aa63-42d3-b4d6-f1615a2c4d05'
  const maintainerId = 'f762b8fd-821c-4607-ac7f-8c46bb5a8c9a'
  for (const [state, mobileVersion, maintainerVersion] of [
    [value.hostedBefore, 265, 57],
    [value.hostedAfter, 269, 61],
  ]) {
    Object.assign(state.managedEdgeFunctions['mobile-api'], {
      version: mobileVersion,
      entrypoint_path: hostedPath(mobileId, mobileVersion, 'mobile-api', 'index.ts'),
      import_map_path: hostedPath(mobileId, mobileVersion, 'mobile-api', 'deno.json'),
    })
    Object.assign(state.managedEdgeFunctions['kael-matching-maintainer'], {
      version: maintainerVersion,
      entrypoint_path: hostedPath(maintainerId, maintainerVersion, 'kael-matching-maintainer', 'index.ts'),
      import_map_path: hostedPath(maintainerId, maintainerVersion, 'kael-matching-maintainer', 'deno.json'),
    })
  }
  assert.deepEqual(verifyRollbackProof(value).problems, [])

  value.hostedAfter.managedEdgeFunctions['mobile-api'].entrypoint_path =
    hostedPath(mobileId, 269, 'mobile-api', 'other.ts')
  assert.match(verifyRollbackProof(value).problems.join('\n'), /mobile-api runtime configuration/u)
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

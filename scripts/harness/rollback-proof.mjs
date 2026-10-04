import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runtimeReleaseBindingsFromHostedState } from './runtime-release-bindings.mjs'
import { RELEASE_EDGE_FUNCTIONS } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA256 = /^[0-9a-f]{64}$/u

export function verifyRollbackProof(input) {
  const problems = []
  const before = input?.hostedBefore
  const after = input?.hostedAfter
  const controlBefore = input?.controlBefore?.result ?? input?.controlBefore
  const controlAfter = input?.controlAfter?.result ?? input?.controlAfter
  const controlRecovery = input?.controlRecovery

  let expectedBindings
  let restoredBindings
  try {
    expectedBindings = runtimeReleaseBindingsFromHostedState(before)
    restoredBindings = runtimeReleaseBindingsFromHostedState(after)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  }
  if (expectedBindings && restoredBindings &&
      JSON.stringify(expectedBindings) !== JSON.stringify(restoredBindings)) {
    problems.push('restored runtime release identity does not match the hosted baseline')
  }

  const restoredFunctions = {}
  for (const functionName of RELEASE_EDGE_FUNCTIONS) {
    const beforeFunction = before?.managedEdgeFunctions?.[functionName]
    const afterFunction = after?.managedEdgeFunctions?.[functionName]
    if (!validActiveFunction(beforeFunction)) problems.push(`hosted baseline ${functionName} evidence is invalid`)
    if (!validActiveFunction(afterFunction)) problems.push(`restored ${functionName} is not an active managed Edge function`)
    if (validActiveFunction(beforeFunction) && validActiveFunction(afterFunction) &&
        afterFunction.version <= beforeFunction.version) {
      problems.push(`restored ${functionName} version does not prove a post-failure redeploy`)
    }
    if (validActiveFunction(beforeFunction) && validActiveFunction(afterFunction) &&
        !sameRuntimeConfiguration(beforeFunction, afterFunction)) {
      problems.push(`restored ${functionName} runtime configuration does not match the hosted baseline`)
    }
    const rollbackSource = input?.rollbackSourceSha256ByFunction?.[functionName]
    const restoredSource = input?.restoredSourceSha256ByFunction?.[functionName]
    if (!SHA256.test(rollbackSource ?? '') || !SHA256.test(restoredSource ?? '') ||
        rollbackSource !== restoredSource) {
      problems.push(`redownloaded rollback source does not match the bound hosted source for ${functionName}`)
    }
    restoredFunctions[functionName] = {
      edgeVersion: afterFunction?.version ?? null,
      hostedDigest: afterFunction?.ezbr_sha256 ?? null,
      sourceSha256: restoredSource ?? null,
    }
  }

  const baselineVersions = migrationVersions(before?.migrations, problems, 'baseline')
  const restoredVersions = migrationVersions(after?.migrations, problems, 'restored')
  if (baselineVersions && restoredVersions &&
      restoredVersions.slice(0, baselineVersions.length).join('\n') !== baselineVersions.join('\n')) {
    problems.push('rollback rewrote or reordered hosted migration history')
  }

  if (!controlBefore || !controlAfter) problems.push('release control evidence is missing')
  else {
    if (controlBefore.candidate_release_id !== null || controlBefore.candidate_cohort_id !== null) {
      problems.push('pre-canary release control already had a candidate')
    }
    if (controlAfter.active_release_id !== controlBefore.active_release_id) {
      problems.push('canary abort changed the active release')
    }
    if (controlAfter.candidate_release_id !== null || controlAfter.candidate_cohort_id !== null ||
        controlAfter.candidate_packet_sha256 !== null) {
      problems.push('canary candidate remained active after abort')
    }
    const recoveryModes = new Set(['candidate_aborted', 'active_rolled_back', 'already_safe'])
    if (controlRecovery?.action !== 'recover' || !recoveryModes.has(controlRecovery?.mode) ||
        JSON.stringify(controlRecovery?.after) !== JSON.stringify(controlAfter)) {
      problems.push('release control recovery receipt does not match hosted post-failure state')
    } else if (controlRecovery.mode === 'already_safe') {
      if (JSON.stringify(controlRecovery.before) !== JSON.stringify(controlRecovery.after)) {
        problems.push('already-safe release control receipt changed state')
      }
    } else if (!Number.isSafeInteger(controlRecovery.before?.revision) ||
        controlAfter.revision !== controlRecovery.before.revision + 1) {
      problems.push('release control recovery did not advance exactly one atomic revision')
    }
  }

  return Object.freeze({
    schemaVersion: 'stage1-rollback-proof.v2',
    ok: problems.length === 0,
    problems,
    activeReleaseId: controlAfter?.active_release_id ?? null,
    restoredFunctions,
  })
}

export function verifyPlan55RollbackDrillProof(input, { policy, release, sourceArtifactFiles } = {}) {
  const problems = []
  const artifactFileSha256 = verifyArchivedRollbackEvidence({
    sourceArtifactFiles, input, release, problems,
  })
  const baseline = policy?.productionSourceBase
  const candidateSha = release?.gitSha
  const baselineSha = baseline?.sha
  const candidateId = release?.releaseId
  const baselineId = baseline?.releaseId
  const hostedBaseline = input?.hostedBaseline
  const hostedBefore = input?.hostedBefore
  const hostedAfterRollback = input?.hostedAfterRollback
  const hostedAfterRestore = input?.hostedAfterRestore
  const controlBefore = releaseControlSnapshot(input?.controlBefore)
  const controlAfter = releaseControlSnapshot(input?.controlAfter)
  const recoveryBefore = releaseControlSnapshot(input?.controlRecovery?.before)
  const recoveryAfter = releaseControlSnapshot(input?.controlRecovery?.after)
  const flagsBefore = input?.flagsBefore
  const flagsAfter = input?.flagsAfter

  if (policy?.environment !== 'production' || policy?.releaseLane !== 'plan55-production-only' ||
      !/^[a-z0-9]{20}$/u.test(policy?.projectRef ?? '') || release?.environment !== 'production' ||
      release?.projectRef !== policy?.projectRef || !/^[a-f0-9]{40}$/u.test(candidateSha ?? '') ||
      release?.releaseLane !== 'plan55-production-only' ||
      !new RegExp(`^harness-${candidateSha.slice(0, 12)}-[a-f0-9]{12}$`, 'u').test(candidateId ?? '') ||
      !SHA256.test(release?.edgeFunctions?.['mobile-api'] ?? '')) {
    problems.push('rollback drill candidate does not match the exact Plan 55 Production release')
  }
  if (!/^[a-f0-9]{40}$/u.test(baselineSha ?? '') ||
      !new RegExp(`^harness-${baselineSha.slice(0, 12)}-[a-f0-9]{12}$`, 'u').test(baselineId ?? '') ||
      baseline?.branch !== `codex/plan55-production-base-${String(baselineSha ?? '').slice(0, 8)}-review-v2`) {
    problems.push('rollback drill baseline is not the pinned Production source')
  }

  if (!controlBefore || !controlAfter || !recoveryBefore || !recoveryAfter) {
    problems.push('rollback drill release-control snapshots are missing or invalid')
  } else {
    if (controlBefore.activeReleaseId !== baselineId ||
        controlBefore.previousActiveReleaseId !== null ||
        !emptyReleaseControlCandidate(controlBefore)) {
      problems.push('rollback drill did not preserve the pinned Stage 1 baseline as the only active release')
    }
    if (input?.controlRecovery?.action !== 'read' ||
        input.controlRecovery.mode !== 'unchanged' ||
        !sameReleaseControlSnapshot(recoveryBefore, controlBefore)) {
      problems.push('rollback drill lacks read-only release-control snapshots around the hosted rollback')
    }
    if (!sameReleaseControlSnapshot(recoveryBefore, recoveryAfter) ||
        !sameReleaseControlSnapshot(controlBefore, recoveryAfter)) {
      problems.push('rollback drill changed global Stage 1 release control')
    }
    if (!sameReleaseControlSnapshot(controlBefore, controlAfter)) {
      problems.push('rollback drill changed the global Stage 1 release-control lane')
    }
  }

  const snapshots = [
    ['pinned baseline', hostedBaseline, baselineId, baselineSha],
    ['candidate before rollback', hostedBefore, candidateId, candidateSha],
    ['restored baseline', hostedAfterRollback, baselineId, baselineSha],
    ['candidate after restore', hostedAfterRestore, candidateId, candidateSha],
  ]
  for (const [label, hosted, expectedReleaseId, expectedSha] of snapshots) {
    if (hosted?.environment !== 'production' || hosted.projectRef !== policy?.projectRef ||
        hosted.releaseId !== expectedReleaseId || hosted.gitSha !== expectedSha ||
        !Array.isArray(hosted.migrations)) {
      problems.push(`rollback drill ${label} snapshot has the wrong Production identity`)
    }
  }

  const baselineBindings = safeRuntimeBindings(hostedBaseline, problems, 'pinned baseline')
  const rollbackBindings = safeRuntimeBindings(hostedAfterRollback, problems, 'restored baseline')
  const candidateBindings = safeRuntimeBindings(hostedBefore, problems, 'candidate before rollback')
  const restoredCandidateBindings = safeRuntimeBindings(hostedAfterRestore, problems, 'candidate after restore')
  if (baselineBindings && rollbackBindings &&
      JSON.stringify(baselineBindings) !== JSON.stringify(rollbackBindings)) {
    problems.push('rollback drill did not restore the pinned Production runtime bindings')
  }
  if (candidateBindings && restoredCandidateBindings &&
      JSON.stringify(candidateBindings) !== JSON.stringify(restoredCandidateBindings)) {
    problems.push('rollback drill did not reapply the exact Plan 55 candidate runtime bindings')
  }

  const baselineMigrations = migrationVersions(hostedBaseline?.migrations, problems, 'pinned baseline')
  for (const [label, hosted] of [
    ['candidate before rollback', hostedBefore],
    ['restored baseline', hostedAfterRollback],
    ['candidate after restore', hostedAfterRestore],
  ]) {
    const versions = migrationVersions(hosted?.migrations, problems, label)
    if (baselineMigrations && versions && JSON.stringify(versions) !== JSON.stringify(baselineMigrations)) {
      problems.push(`rollback drill ${label} changed Production migration history`)
    }
  }

  const baselineMobile = hostedBaseline?.managedEdgeFunctions?.['mobile-api']
  const candidateMobile = hostedBefore?.managedEdgeFunctions?.['mobile-api']
  const rollbackMobile = hostedAfterRollback?.managedEdgeFunctions?.['mobile-api']
  const restoredMobile = hostedAfterRestore?.managedEdgeFunctions?.['mobile-api']
  if ([baselineMobile, candidateMobile, rollbackMobile, restoredMobile].some((item) => !validActiveFunction(item)) ||
      !(baselineMobile?.version < candidateMobile?.version &&
        candidateMobile?.version < rollbackMobile?.version &&
        rollbackMobile?.version < restoredMobile?.version)) {
    problems.push('rollback drill does not prove candidate, baseline rollback, and candidate restore deployments in order')
  }
  if (validActiveFunction(baselineMobile) && validActiveFunction(rollbackMobile) &&
      !sameRuntimeConfiguration(baselineMobile, rollbackMobile)) {
    problems.push('rollback drill baseline restore changed the pinned mobile-api runtime configuration')
  }
  if (validActiveFunction(candidateMobile) && validActiveFunction(restoredMobile) &&
      !sameRuntimeConfiguration(candidateMobile, restoredMobile)) {
    problems.push('rollback drill candidate restore changed the mobile-api runtime configuration')
  }
  for (const functionName of RELEASE_EDGE_FUNCTIONS) {
    if (functionName === 'mobile-api') continue
    const entries = snapshots.map(([, hosted]) => hosted?.managedEdgeFunctions?.[functionName])
    if (entries.some((entry) => !validActiveFunction(entry)) ||
        entries.slice(1).some((entry) => JSON.stringify(entry) !== JSON.stringify(entries[0]))) {
      problems.push(`rollback drill unexpectedly changed managed Edge function ${functionName}`)
    }
  }

  const baselineSourceSha256 = input?.baselineSourceSha256
  const rollbackSourceSha256 = input?.rollbackSourceSha256
  const candidateBeforeSourceSha256 = input?.candidateBeforeSourceSha256
  const candidateAfterSourceSha256 = input?.candidateAfterSourceSha256
  if (!SHA256.test(baselineSourceSha256 ?? '') ||
      rollbackSourceSha256 !== baselineSourceSha256) {
    problems.push('rollback drill did not restore the exact pinned Production mobile-api source')
  }
  if (!SHA256.test(release?.edgeFunctions?.['mobile-api'] ?? '') ||
      candidateBeforeSourceSha256 !== release.edgeFunctions['mobile-api'] ||
      candidateAfterSourceSha256 !== release.edgeFunctions['mobile-api']) {
    problems.push('rollback drill did not restore the exact locked Plan 55 mobile-api source')
  }

  for (const [label, flags] of [['before', flagsBefore], ['after', flagsAfter]]) {
    if (flags?.environment !== 'production' || flags?.projectRef !== policy?.projectRef ||
        flags?.globalServiceFlagsAbsent !== true || flags?.scopedCanaryFlagAbsent !== true) {
      problems.push(`rollback drill ${label} flag snapshot is not clean and Production-scoped`)
    }
  }

  return Object.freeze({
    schemaVersion: 'plan55-rollback-drill-proof.v2',
    gate: 'plan55-rollback-drill',
    status: problems.length === 0 ? 'PASS' : 'BLOCKED',
    environment: 'production',
    projectRef: policy?.projectRef ?? null,
    baselineReleaseId: baselineId ?? null,
    baselineSourceSha: baselineSha ?? null,
    candidateReleaseId: candidateId ?? null,
    candidateSourceSha: candidateSha ?? null,
    restoredReleaseId: hostedAfterRestore?.releaseId ?? null,
    restoredSourceSha: hostedAfterRestore?.gitSha ?? null,
    edgeVersions: {
      baseline: baselineMobile?.version ?? null,
      candidateBeforeRollback: candidateMobile?.version ?? null,
      baselineAfterRollback: rollbackMobile?.version ?? null,
      candidateAfterRestore: restoredMobile?.version ?? null,
    },
    baselineSourceSha256: SHA256.test(baselineSourceSha256 ?? '') ? baselineSourceSha256 : null,
    candidateSourceSha256: SHA256.test(candidateAfterSourceSha256 ?? '') ? candidateAfterSourceSha256 : null,
    releaseControl: {
      recoveryMode: input?.controlRecovery?.mode ?? null,
      revisionBefore: controlBefore?.revision ?? null,
      revisionAfterRollback: recoveryAfter?.revision ?? null,
      revisionAfterRestore: controlAfter?.revision ?? null,
      activeReleaseAfterRestore: controlAfter?.activeReleaseId ?? null,
    },
    artifactFileSha256,
    problems,
  })
}

export function buildPlan55RollbackDrillProofFromArchive({ policy, release, sourceArtifactFiles } = {}) {
  if (!(sourceArtifactFiles instanceof Map)) {
    throw new Error('Plan 55 rollback drill source artifact is missing')
  }
  const archivedRelease = readRollbackJson(sourceArtifactFiles, 'release.json')
  if (JSON.stringify(archivedRelease) !== JSON.stringify(release)) {
    throw new Error('Plan 55 rollback drill release manifest does not match its source artifact')
  }
  const input = {
    hostedBaseline: readRollbackJson(sourceArtifactFiles, 'hosted-baseline.json'),
    hostedBefore: readRollbackJson(sourceArtifactFiles, 'hosted-before-drill.json'),
    hostedAfterRollback: readRollbackJson(sourceArtifactFiles, 'hosted-after-rollback.json'),
    hostedAfterRestore: readRollbackJson(sourceArtifactFiles, 'hosted-after-restore.json'),
    controlBefore: readRollbackJson(sourceArtifactFiles, 'control-before-drill.json'),
    controlRecovery: readRollbackJson(sourceArtifactFiles, 'control-recovery.json'),
    controlAfter: readRollbackJson(sourceArtifactFiles, 'control-after-restore.json'),
    flagsBefore: readRollbackJson(sourceArtifactFiles, 'flags-before.json'),
    flagsAfter: readRollbackJson(sourceArtifactFiles, 'flags-after.json'),
    baselineSourceSha256: readRollbackDigest(sourceArtifactFiles, 'baseline-mobile-api-source-sha256.txt'),
    rollbackSourceSha256: readRollbackDigest(sourceArtifactFiles, 'rollback-mobile-api-source-sha256.txt'),
    candidateBeforeSourceSha256: readRollbackDigest(
      sourceArtifactFiles, 'candidate-before-mobile-api-source-sha256.txt'),
    candidateAfterSourceSha256: readRollbackDigest(
      sourceArtifactFiles, 'candidate-after-mobile-api-source-sha256.txt'),
  }
  return verifyPlan55RollbackDrillProof(input, { policy, release, sourceArtifactFiles })
}

export function assertPlan55RollbackDrillProof(proof, options = {}) {
  const expected = buildPlan55RollbackDrillProofFromArchive(options)
  const proofBytes = uniqueRollbackArtifactFile(
    options.sourceArtifactFiles, 'plan55-rollback-drill-proof.json', [],
  )
  if (expected.status !== 'PASS' || JSON.stringify(proof) !== JSON.stringify(expected) ||
      !proofBytes?.equals(Buffer.from(`${JSON.stringify(proof)}\n`))) {
    throw new Error('Plan 55 rollback drill proof does not match its exact archived rollback artifact')
  }
  return true
}

function verifyArchivedRollbackEvidence({ sourceArtifactFiles, input, release, problems }) {
  const jsonFiles = [
    ['releaseManifest', 'release.json', release],
    ['hostedBaseline', 'hosted-baseline.json', input?.hostedBaseline],
    ['hostedBefore', 'hosted-before-drill.json', input?.hostedBefore],
    ['hostedAfterRollback', 'hosted-after-rollback.json', input?.hostedAfterRollback],
    ['hostedAfterRestore', 'hosted-after-restore.json', input?.hostedAfterRestore],
    ['controlBefore', 'control-before-drill.json', input?.controlBefore],
    ['controlRecovery', 'control-recovery.json', input?.controlRecovery],
    ['controlAfter', 'control-after-restore.json', input?.controlAfter],
    ['flagsBefore', 'flags-before.json', input?.flagsBefore],
    ['flagsAfter', 'flags-after.json', input?.flagsAfter],
  ]
  const textFiles = [
    ['baselineMobileSource', 'baseline-mobile-api-source-sha256.txt', input?.baselineSourceSha256],
    ['rollbackMobileSource', 'rollback-mobile-api-source-sha256.txt', input?.rollbackSourceSha256],
    ['candidateBeforeSource', 'candidate-before-mobile-api-source-sha256.txt', input?.candidateBeforeSourceSha256],
    ['candidateAfterSource', 'candidate-after-mobile-api-source-sha256.txt', input?.candidateAfterSourceSha256],
  ]
  const digests = {}
  if (!(sourceArtifactFiles instanceof Map)) {
    problems.push('archived Plan 55 rollback drill evidence is missing or invalid')
    return digests
  }

  for (const [key, filename, expected] of jsonFiles) {
    const bytes = uniqueRollbackArtifactFile(sourceArtifactFiles, filename, problems)
    if (!bytes) continue
    try {
      const parsed = JSON.parse(bytes.toString('utf8'))
      if (JSON.stringify(parsed) !== JSON.stringify(expected)) {
        problems.push(`archived Plan 55 rollback evidence does not match parsed input: ${filename}`)
      }
    } catch {
      problems.push(`archived Plan 55 rollback evidence is invalid JSON: ${filename}`)
    }
    digests[key] = sha256(bytes)
  }
  for (const [key, filename, expected] of textFiles) {
    const bytes = uniqueRollbackArtifactFile(sourceArtifactFiles, filename, problems)
    if (!bytes) continue
    if (!bytes.equals(Buffer.from(`${expected ?? ''}\n`))) {
      problems.push(`archived Plan 55 rollback source digest does not match parsed input: ${filename}`)
    }
    digests[key] = sha256(bytes)
  }
  return Object.freeze(digests)
}

function safeRuntimeBindings(hosted, problems, label) {
  try {
    return runtimeReleaseBindingsFromHostedState(hosted)
  } catch (error) {
    problems.push(`rollback drill ${label} runtime bindings are invalid: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function readRollbackJson(sourceArtifactFiles, filename) {
  const bytes = uniqueRollbackArtifactFile(sourceArtifactFiles, filename, [])
  if (!bytes) throw new Error(`Plan 55 rollback drill artifact is missing: ${filename}`)
  try {
    const value = JSON.parse(bytes.toString('utf8'))
    if (!bytes.equals(Buffer.from(`${JSON.stringify(value)}\n`))) throw new Error('serialization')
    return value
  } catch {
    throw new Error(`Plan 55 rollback drill artifact is invalid: ${filename}`)
  }
}

function readRollbackDigest(sourceArtifactFiles, filename) {
  const bytes = uniqueRollbackArtifactFile(sourceArtifactFiles, filename, [])
  if (!bytes) throw new Error(`Plan 55 rollback drill source digest is missing: ${filename}`)
  const value = bytes.toString('utf8')
  if (!/^[a-f0-9]{64}\n$/u.test(value)) {
    throw new Error(`Plan 55 rollback drill source digest is invalid: ${filename}`)
  }
  return value.slice(0, -1)
}

function uniqueRollbackArtifactFile(sourceArtifactFiles, filename, problems) {
  const matches = [...sourceArtifactFiles].filter(([path, bytes]) =>
    typeof path === 'string' && path.split('/').at(-1) === filename && Buffer.isBuffer(bytes) &&
    bytes.length > 0 && bytes.length <= 16 * 1024 * 1024)
  if (matches.length !== 1) {
    problems.push(`archived rollback evidence is missing, oversized, or ambiguous: ${filename}`)
    return undefined
  }
  return matches[0][1]
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function releaseControlSnapshot(value) {
  const state = value?.result ?? value
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      !Number.isSafeInteger(state.revision) || state.revision < 1 ||
      ['active_release_id', 'previous_active_release_id', 'candidate_release_id',
        'candidate_cohort_id', 'candidate_packet_sha256', 'candidate_started_at'].some((key) =>
        !Object.prototype.hasOwnProperty.call(state, key))) return null
  const snapshot = {
    activeReleaseId: state.active_release_id ?? null,
    previousActiveReleaseId: state.previous_active_release_id ?? null,
    candidateReleaseId: state.candidate_release_id ?? null,
    candidateCohortId: state.candidate_cohort_id ?? null,
    candidatePacketSha256: state.candidate_packet_sha256 ?? null,
    candidateStartedAt: state.candidate_started_at ?? null,
    revision: state.revision,
  }
  for (const field of ['activeReleaseId', 'previousActiveReleaseId', 'candidateReleaseId']) {
    if (snapshot[field] !== null && !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(snapshot[field])) return null
  }
  if (snapshot.candidateCohortId !== null &&
      !/^synthetic-[a-z0-9-]{8,100}$/u.test(snapshot.candidateCohortId)) return null
  if (snapshot.candidatePacketSha256 !== null && !SHA256.test(snapshot.candidatePacketSha256)) return null
  return Object.freeze(snapshot)
}

function emptyReleaseControlCandidate(state) {
  return state.candidateReleaseId === null && state.candidateCohortId === null &&
    state.candidatePacketSha256 === null && state.candidateStartedAt === null
}

function sameReleaseControlSnapshot(left, right) {
  return Boolean(left && right) && JSON.stringify(left) === JSON.stringify(right)
}

function validActiveFunction(value) {
  return value?.status === 'ACTIVE' && Number.isSafeInteger(value?.version) && value.version > 0 &&
    SHA256.test(value?.ezbr_sha256 ?? '')
}

function sameRuntimeConfiguration(before, after) {
  return before.verify_jwt === after.verify_jwt && before.import_map === after.import_map &&
    deployPath(before.entrypoint_path) === deployPath(after.entrypoint_path) &&
    deployPath(before.import_map_path) === deployPath(after.import_map_path)
}

// Hosted paths live under /tmp/user_fn_<ref>_<function id>_<version>/, and a rollback must raise the
// version, so only that deploy-version segment is ignored; project, function, and file must still match.
function deployPath(path) {
  return typeof path === 'string'
    ? path.replace(/\/user_fn_([a-z0-9]+)_([0-9a-f-]{36})_\d+\//u, '/user_fn_$1_$2_version/')
    : path
}

function migrationVersions(rows, problems, label) {
  if (!Array.isArray(rows)) {
    problems.push(`${label} migration evidence is missing`)
    return null
  }
  const versions = rows.map((row) => String(row?.version ?? ''))
  if (versions.some((version) => !/^\d{14}$/u.test(version)) ||
      new Set(versions).size !== versions.length ||
      versions.join('\n') !== [...versions].sort().join('\n')) {
    problems.push(`${label} migration evidence is invalid`)
    return null
  }
  return versions
}

function insideRoot(path) {
  const absolute = resolve(ROOT, path)
  const local = relative(ROOT, absolute)
  if (!local || local.startsWith('..')) throw new Error('rollback proof path escapes repository root')
  return absolute
}

function parseArgs(args) {
  const options = {}
  const supported = new Set([
    '--hosted-before', '--hosted-after', '--control-before', '--control-after', '--control-recovery',
    '--rollback-mobile-source-sha256', '--restored-mobile-source-sha256',
    '--rollback-maintainer-source-sha256', '--restored-maintainer-source-sha256', '--output',
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!supported.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
  }
  return options
}

function readJson(path) {
  return JSON.parse(readFileSync(insideRoot(path), 'utf8'))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  for (const required of [
    'hostedBefore', 'hostedAfter', 'controlBefore', 'controlAfter', 'controlRecovery',
    'rollbackMobileSourceSha256', 'restoredMobileSourceSha256',
    'rollbackMaintainerSourceSha256', 'restoredMaintainerSourceSha256', 'output',
  ]) if (!options[required]) throw new Error(`rollback proof option is missing: ${required}`)
  const report = verifyRollbackProof({
    hostedBefore: readJson(options.hostedBefore),
    hostedAfter: readJson(options.hostedAfter),
    controlBefore: readJson(options.controlBefore),
    controlAfter: readJson(options.controlAfter),
    controlRecovery: readJson(options.controlRecovery),
    rollbackSourceSha256ByFunction: {
      'mobile-api': options.rollbackMobileSourceSha256,
      'kael-matching-maintainer': options.rollbackMaintainerSourceSha256,
    },
    restoredSourceSha256ByFunction: {
      'mobile-api': options.restoredMobileSourceSha256,
      'kael-matching-maintainer': options.restoredMaintainerSourceSha256,
    },
  })
  const output = insideRoot(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  if (!report.ok) throw new Error(`rollback proof failed: ${report.problems.join('; ')}`)
  console.log('rollback proof passed: all managed Edge functions were restored')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import { RELEASE_EDGE_FUNCTIONS } from './release-bundle.mjs'
import { TRANSACTION_BEHAVIOR_MODE, verifyTransactionBehaviorReceipt } from './transaction-behavior-receipt.mjs'
import { verifyProductionUiNormalityReceipt } from '../check-production-ui-copy.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA256 = /^[0-9a-f]{64}$/u
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const COHORT_ID = /^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$/u
const REQUIRED_GATES = Object.freeze([
  'main-branch-merge',
  'workspace-typecheck',
  'workspace-tests',
  'workspace-build',
  'security',
  'harness',
  'edge-deno',
  'database-reset',
  'sql-verification',
  'generated-types',
  'expand-only',
  'hosted-drift-baseline',
  'production-ui-normality',
])
// A verification release must also prove every bound transaction assertion ran, because its remaining
// gaps are acknowledged rather than closed.
const VERIFICATION_GATES = Object.freeze([...REQUIRED_GATES, 'transaction-bound-assertions'])

export function buildStage1PromotionPacket(input) {
  validateBuildInput(input)
  const verification = input.lane === 'verification'
  const receipt = input.transactionBehaviorReceipt
  const rollbackFunctions = Object.fromEntries(RELEASE_EDGE_FUNCTIONS.map((functionName) => {
    const hostedFunction = input.previousHostedState.managedEdgeFunctions[functionName]
    return [functionName, {
      hostedEdgeVersion: hostedFunction.version,
      hostedEdgeDigest: hostedFunction.ezbr_sha256,
      sourceSha256: input.rollbackSourceSha256ByFunction[functionName],
    }]
  }))
  const packet = {
    schemaVersion: 'stage1-promotion-packet.v3',
    packetId: `stage1-${input.release.releaseId}-${input.workflowRunId}`,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    ...(verification ? { lane: 'verification' } : {}),
    release: {
      ...(verification ? { releaseLane: 'verification' } : {}),
      releaseId: input.release.releaseId,
      gitSha: input.release.gitSha,
      bundleSha256: input.release.bundleSha256,
      sourceBundleSha256: input.release.sourceBundleSha256,
      mobileBuildFingerprintSha256: input.release.mobileBuildFingerprintSha256,
      productionUiSourceSha256: input.release.productionUiSourceSha256,
      edgeBundleSha256: input.release.edgeBundleSha256,
      migrationInventorySha256: input.release.migrationInventorySha256,
      migrationWatermark: input.release.migrationWatermark,
      serviceIntakePolicyBundleSha256: input.release.serviceIntakePolicyBundleSha256,
      priceEvidenceBundleSha256: input.release.priceEvidenceBundleSha256,
      providerReadinessFingerprintSha256: input.release.providerReadinessFingerprintSha256,
    },
    cohortId: input.cohortId,
    mobileBinaryAttestation: input.mobileBinaryAttestation,
    ...(verification ? {
      transactionBehavior: {
        mode: receipt.mode,
        receiptSha256: receipt.receiptSha256,
        manifestSha256: receipt.manifestSha256,
        entryCount: receipt.entryCount,
        partialEntryCount: receipt.partialCount,
        boundAssertionsPassed: receipt.boundAssertions.passed,
        boundAssertionsRequired: receipt.boundAssertions.required,
        gapsSha256: receipt.gapsSha256,
      },
    } : {}),
    productionUiNormality: {
      sourceSha256: input.productionUiNormalityReceipt.sourceSha256,
      receiptSha256: input.productionUiNormalityReceipt.receiptSha256,
      scannedFileCount: input.productionUiNormalityReceipt.scannedFileCount,
      localizedLiteralCount: input.productionUiNormalityReceipt.localizedLiteralCount,
      unsafeVisibleCopyCount: input.productionUiNormalityReceipt.unsafeVisibleCopyCount,
      languageLeakageCount: input.productionUiNormalityReceipt.languageLeakageCount,
    },
    workflowRunId: String(input.workflowRunId),
    expandOnly: {
      auditSha256: input.expandOnlyReceipt.auditSha256,
      hostedWatermark: input.expandOnlyReceipt.hostedWatermark ?? null,
      pendingWatermark: input.expandOnlyReceipt.pendingWatermark ?? null,
      pendingMigrationCount: input.expandOnlyReceipt.pendingMigrations.length,
    },
    rollback: {
      strategy: 'downloaded-hosted-edge-source-on-expanded-schema',
      priorReleaseId: input.previousHostedState.releaseId ?? null,
      functions: rollbackFunctions,
      sourceVerifiedBeforeDeploy: true,
      databaseRollbackForbidden: true,
    },
    passedGates: [...input.passedGates].sort(),
    promotionRequirements: {
      candidateCohortOnlyBeforePromotion: true,
      consecutiveSyntheticSmokes: 3,
      atomicPromotion: true,
      abortKeepsRealTrafficOnPreviousLane: true,
      rollbackDeployRequiredOnFailure: true,
    },
    packetSha256: '',
  }
  packet.packetSha256 = sha256(canonicalJson({ ...packet, packetSha256: undefined }))
  return Object.freeze(packet)
}

export function verifyStage1PromotionPacket(packet) {
  const problems = []
  if (!packet || typeof packet !== 'object') return ['promotion packet is invalid']
  if (packet.schemaVersion !== 'stage1-promotion-packet.v3') problems.push('promotion packet schema is invalid')
  if (Object.prototype.hasOwnProperty.call(packet, 'approval')) problems.push('promotion packet contains a retired reviewer approval')
  if (packet.environment !== 'production' || packet.projectRef !== 'iwevizmsedyqozxlawwl') problems.push('promotion packet target is invalid')
  if (!RELEASE_ID.test(packet.release?.releaseId ?? '')) problems.push('promotion packet release ID is invalid')
  if (!COHORT_ID.test(packet.cohortId ?? '')) problems.push('promotion packet cohort ID is invalid')
  if (verifyMobileBinaryAttestation(packet.mobileBinaryAttestation, packet.release).length > 0) {
    problems.push('promotion packet mobile binary attestation is invalid')
  }
  const relation = packet.mobileBinaryAttestation?.binaryRelation
  if (packet.lane === 'verification') {
    if (packet.release?.releaseLane !== 'verification') problems.push('promotion packet verification lane requires a verification release')
    if (relation !== 'latest_existing') problems.push('promotion packet verification lane requires the latest existing store binaries')
    if (!validTransactionBehavior(packet.transactionBehavior)) problems.push('promotion packet transaction behavior evidence is invalid')
    if (!packet.passedGates?.includes('transaction-bound-assertions')) problems.push('promotion packet is missing required release gate: transaction-bound-assertions')
  } else {
    if (packet.lane !== undefined) problems.push('promotion packet lane is invalid')
    if (packet.release?.releaseLane !== undefined || relation !== undefined) {
      problems.push('promotion packet strict lane requires an exact-commit release and binaries')
    }
    if (Object.hasOwn(packet, 'transactionBehavior')) {
      problems.push('promotion packet strict lane cannot carry acknowledged transaction gaps')
    }
  }
  for (const field of [
    packet.release?.bundleSha256,
    packet.release?.sourceBundleSha256,
    packet.release?.mobileBuildFingerprintSha256,
    packet.release?.productionUiSourceSha256,
    packet.release?.edgeBundleSha256,
    packet.release?.migrationInventorySha256,
    packet.release?.serviceIntakePolicyBundleSha256,
    packet.release?.priceEvidenceBundleSha256,
    packet.release?.providerReadinessFingerprintSha256,
    packet.expandOnly?.auditSha256,
    packet.packetSha256,
  ]) if (!SHA256.test(field ?? '')) problems.push('promotion packet contains an invalid digest')
  if (!SHA256.test(packet.productionUiNormality?.receiptSha256 ?? '') ||
      packet.productionUiNormality?.sourceSha256 !== packet.release?.productionUiSourceSha256 ||
      !Number.isSafeInteger(packet.productionUiNormality?.scannedFileCount) ||
      packet.productionUiNormality.scannedFileCount < 1 ||
      !Number.isSafeInteger(packet.productionUiNormality?.localizedLiteralCount) ||
      packet.productionUiNormality.localizedLiteralCount < 1 ||
      packet.productionUiNormality?.unsafeVisibleCopyCount !== 0 ||
      packet.productionUiNormality?.languageLeakageCount !== 0) {
    problems.push('promotion packet Production UI normality evidence is invalid')
  }
  if (!exactFunctionSet(packet.rollback?.functions)) {
    problems.push('promotion packet rollback function inventory is invalid')
  } else {
    for (const functionName of RELEASE_EDGE_FUNCTIONS) {
      const rollbackFunction = packet.rollback.functions[functionName]
      if (!Number.isSafeInteger(rollbackFunction?.hostedEdgeVersion) || rollbackFunction.hostedEdgeVersion < 1 ||
          !SHA256.test(rollbackFunction?.hostedEdgeDigest ?? '') ||
          !SHA256.test(rollbackFunction?.sourceSha256 ?? '')) {
        problems.push(`promotion packet rollback evidence is invalid for ${functionName}`)
      }
    }
  }
  for (const gate of REQUIRED_GATES) if (!packet.passedGates?.includes(gate)) problems.push(`promotion packet is missing required release gate: ${gate}`)
  if (packet.rollback?.strategy !== 'downloaded-hosted-edge-source-on-expanded-schema' ||
      packet.rollback?.databaseRollbackForbidden !== true || packet.rollback?.sourceVerifiedBeforeDeploy !== true) {
    problems.push('promotion packet rollback contract is invalid')
  }
  if (packet.promotionRequirements?.candidateCohortOnlyBeforePromotion !== true ||
      packet.promotionRequirements?.consecutiveSyntheticSmokes !== 3 ||
      packet.promotionRequirements?.atomicPromotion !== true ||
      packet.promotionRequirements?.abortKeepsRealTrafficOnPreviousLane !== true ||
      packet.promotionRequirements?.rollbackDeployRequiredOnFailure !== true) {
    problems.push('promotion packet Stage 1 gates are incomplete')
  }
  const expected = sha256(canonicalJson({ ...packet, packetSha256: undefined }))
  if (packet.packetSha256 !== expected) problems.push('promotion packet checksum mismatch')
  return [...new Set(problems)]
}

function validateBuildInput(input) {
  if (input?.mergeApprovalReceipt !== undefined) throw new Error('Stage 1 Production promotion no longer accepts a reviewer approval receipt')
  const release = input?.release
  const lane = input?.lane ?? 'strict'
  if (lane !== 'strict' && lane !== 'verification') throw new Error('Stage 1 promotion lane is invalid')
  if (lane === 'strict') {
    if (release?.releaseLane !== undefined || input?.mobileBinaryAttestation?.binaryRelation !== undefined ||
        input?.transactionBehaviorReceipt !== undefined) {
      throw new Error('strict Stage 1 promotion accepts only an exact-commit release and binaries, with no acknowledged transaction gaps')
    }
  } else {
    if (release?.releaseLane !== 'verification') throw new Error('verification Stage 1 promotion requires a verification-lane release')
    if (input.mobileBinaryAttestation?.binaryRelation !== 'latest_existing') {
      throw new Error('verification Stage 1 promotion requires the latest existing store binaries, recorded as such')
    }
    const receiptProblems = verifyTransactionBehaviorReceipt(input.transactionBehaviorReceipt)
    if (receiptProblems.length > 0) {
      throw new Error(`verification Stage 1 promotion requires a valid transaction behavior receipt: ${receiptProblems.join('; ')}`)
    }
  }
  if (!RELEASE_ID.test(release?.releaseId ?? '') || release?.environment !== 'production' ||
      !/^[0-9a-f]{40}$/u.test(release?.gitSha ?? '') || !SHA256.test(release?.bundleSha256 ?? '')) {
    throw new Error('Stage 1 promotion requires a valid production release')
  }
  for (const field of [
    'sourceBundleSha256', 'mobileBuildFingerprintSha256', 'productionUiSourceSha256', 'edgeBundleSha256',
    'migrationInventorySha256', 'serviceIntakePolicyBundleSha256',
    'priceEvidenceBundleSha256', 'providerReadinessFingerprintSha256',
  ]) if (!SHA256.test(release[field] ?? '')) throw new Error(`Stage 1 release ${field} is invalid`)
  if (release.rollbackPolicy?.historicalMigrationsImmutable !== true ||
      release.rollbackPolicy?.schemaCorrectionMode !== 'forward-migration' ||
      release.rollbackPolicy?.compatibilityStrategy !== 'expand-contract') {
    throw new Error('Stage 1 release has no expand-contract rollback policy')
  }
  if (!COHORT_ID.test(input.cohortId ?? '') ||
      !input.cohortId.startsWith(`synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-`)) {
    throw new Error('Stage 1 promotion cohort is invalid')
  }
  if (!/^[0-9]{1,30}$/u.test(String(input.workflowRunId ?? ''))) {
    throw new Error('Stage 1 promotion workflow run identity is invalid')
  }
  if (verifyMobileBinaryAttestation(input.mobileBinaryAttestation, release).length > 0) {
    throw new Error('Stage 1 promotion requires exact iOS and Android binary attestations')
  }
  if (!verifyProductionUiNormalityReceipt(input.productionUiNormalityReceipt) ||
      input.productionUiNormalityReceipt.sourceSha256 !== release.productionUiSourceSha256) {
    throw new Error('Stage 1 promotion requires exact Production UI normality evidence')
  }
  const expand = input.expandOnlyReceipt
  if (expand?.environment !== 'production' || expand?.projectRef !== 'iwevizmsedyqozxlawwl' ||
      !SHA256.test(expand?.auditSha256 ?? '') || !Array.isArray(expand?.pendingMigrations)) {
    throw new Error('expand-only receipt target or digest is invalid')
  }
  const hosted = input.previousHostedState
  if (hosted?.environment !== 'production' || hosted?.projectRef !== 'iwevizmsedyqozxlawwl') {
    throw new Error('hosted baseline target is invalid')
  }
  if (expand.pendingMigrations.length > 0 && expand.pendingWatermark !== release.migrationWatermark) {
    // Production's migration history is not always a plain contiguous suffix: an earlier hotfix can
    // apply a newer-dated migration ahead of older ones still pending (as happened for the harness
    // retention migrations here), which drops the newer one out of the "pending" set and caps its
    // watermark below the release's declared final version. That is only safe when nothing between
    // the two watermarks is missing outright, so require every inventory entry after pendingWatermark
    // up to migrationWatermark to already be applied on the hosted target rather than refusing outright.
    const inventoryEntries = release.migrationInventory?.entries
    const appliedVersions = new Set((hosted?.migrations ?? []).map((row) => String(row?.version ?? '')))
    const unaccountedTail = Array.isArray(inventoryEntries)
      ? inventoryEntries
        .map((entry) => String(entry?.version ?? ''))
        .filter((version) => version > expand.pendingWatermark && version <= release.migrationWatermark && !appliedVersions.has(version))
      : null
    if (unaccountedTail === null || unaccountedTail.length > 0) {
      throw new Error('expand-only receipt does not reach the release migration watermark')
    }
  }
  if (!exactFunctionSet(hosted?.managedEdgeFunctions) || !exactFunctionSet(input.rollbackSourceSha256ByFunction)) {
    throw new Error('downloaded hosted rollback function inventory is incomplete')
  }
  for (const functionName of RELEASE_EDGE_FUNCTIONS) {
    const hostedFunction = hosted.managedEdgeFunctions[functionName]
    const expectedRuntime = release.edgeRuntimeConfigurations?.[functionName]
    if (hostedFunction?.status !== 'ACTIVE' || !Number.isSafeInteger(hostedFunction?.version) ||
        hostedFunction.version < 1 || !SHA256.test(hostedFunction?.ezbr_sha256 ?? '') ||
        !SHA256.test(input.rollbackSourceSha256ByFunction[functionName] ?? '')) {
      throw new Error(`downloaded hosted rollback source is not bound for ${functionName}`)
    }
    if (typeof expectedRuntime?.verifyJwt !== 'boolean' || typeof expectedRuntime?.importMap !== 'boolean' ||
        hostedFunction.verify_jwt !== expectedRuntime.verifyJwt || hostedFunction.import_map !== expectedRuntime.importMap ||
        !managedPathMatches(hostedFunction.entrypoint_path, expectedRuntime.entrypointPath, functionName) ||
        (expectedRuntime.importMap
          ? !managedPathMatches(hostedFunction.import_map_path, expectedRuntime.importMapPath, functionName)
          : hostedFunction.import_map_path !== null)) {
      throw new Error(`hosted rollback runtime configuration is incompatible for ${functionName}`)
    }
  }
  if (!Array.isArray(input.passedGates) || new Set(input.passedGates).size !== input.passedGates.length) {
    throw new Error('release gates must be a unique list')
  }
  for (const gate of lane === 'verification' ? VERIFICATION_GATES : REQUIRED_GATES) {
    if (!input.passedGates.includes(gate)) throw new Error(`missing required release gate: ${gate}`)
  }
}

function validTransactionBehavior(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    value.mode === TRANSACTION_BEHAVIOR_MODE &&
    SHA256.test(value.receiptSha256 ?? '') && SHA256.test(value.manifestSha256 ?? '') && SHA256.test(value.gapsSha256 ?? '') &&
    Number.isSafeInteger(value.entryCount) && value.entryCount >= 1 &&
    Number.isSafeInteger(value.partialEntryCount) && value.partialEntryCount >= 0 && value.partialEntryCount <= value.entryCount &&
    Number.isSafeInteger(value.boundAssertionsRequired) && value.boundAssertionsRequired >= 1 &&
    value.boundAssertionsPassed === value.boundAssertionsRequired
}

function parseArgs(args) {
  const options = {}
  const allowed = new Set([
    '--release', '--expand-only', '--hosted-before', '--rollback-mobile-source-sha256',
    '--rollback-maintainer-source-sha256',
    '--cohort', '--mobile-binary', '--production-ui-normality', '--workflow-run-id', '--gates', '--output',
    '--lane', '--transaction-behavior',
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!allowed.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
  }
  for (const key of ['release', 'expandOnly', 'hostedBefore', 'rollbackMobileSourceSha256', 'rollbackMaintainerSourceSha256', 'cohort', 'mobileBinary', 'productionUiNormality', 'workflowRunId', 'gates', 'output']) {
    if (!options[key]) throw new Error(`Stage 1 promotion packet option is missing: ${key}`)
  }
  return options
}

function resolveInsideRoot(path) {
  const absolute = resolve(ROOT, path)
  const local = relative(ROOT, absolute)
  if (!local || local.startsWith('..')) throw new Error(`promotion packet path escapes repository root: ${path}`)
  return absolute
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactFunctionSet(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const expected = [...RELEASE_EDGE_FUNCTIONS].sort()
  return Object.keys(value).sort().join('\n') === expected.join('\n')
}

function managedPathMatches(hostedPath, releasePath, functionName) {
  if (typeof hostedPath !== 'string' || typeof releasePath !== 'string') return false
  const normalizedHosted = hostedPath.replaceAll('\\', '/')
  const normalizedRelease = releasePath.replaceAll('\\', '/')
  const suffix = normalizedRelease.split(`supabase/functions/${functionName}/`).at(-1)
  return Boolean(suffix) && (normalizedHosted === suffix || normalizedHosted.endsWith(`/${suffix}`))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const packet = buildStage1PromotionPacket({
    release: JSON.parse(readFileSync(resolveInsideRoot(options.release), 'utf8')),
    expandOnlyReceipt: JSON.parse(readFileSync(resolveInsideRoot(options.expandOnly), 'utf8')),
    previousHostedState: JSON.parse(readFileSync(resolveInsideRoot(options.hostedBefore), 'utf8')),
    rollbackSourceSha256ByFunction: {
      'mobile-api': options.rollbackMobileSourceSha256,
      'kael-matching-maintainer': options.rollbackMaintainerSourceSha256,
    },
    cohortId: options.cohort,
    lane: options.lane,
    transactionBehaviorReceipt: options.transactionBehavior
      ? JSON.parse(readFileSync(resolveInsideRoot(options.transactionBehavior), 'utf8'))
      : undefined,
    mobileBinaryAttestation: JSON.parse(readFileSync(resolveInsideRoot(options.mobileBinary), 'utf8')),
    productionUiNormalityReceipt: JSON.parse(readFileSync(resolveInsideRoot(options.productionUiNormality), 'utf8')),
    workflowRunId: options.workflowRunId,
    passedGates: options.gates.split(',').map((value) => value.trim()).filter(Boolean),
  })
  const problems = verifyStage1PromotionPacket(packet)
  if (problems.length) throw new Error(problems.join('; '))
  const output = resolveInsideRoot(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(packet, null, 2)}\n`)
  console.log(`Stage 1 promotion packet written: ${relative(ROOT, output).replaceAll('\\', '/')}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

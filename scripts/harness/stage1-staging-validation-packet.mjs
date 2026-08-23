import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifyHostedSourceProof } from './edge-source-proof.mjs'
import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'
import {
  canonicalMigrationEntries,
  resolveHostedMigrationState,
} from './migration-history.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROJECT_REF = 'xyylanuyflrjzbjzhqfl'
const SHA256 = /^[0-9a-f]{64}$/u
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const COHORT_ID = /^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$/u
const DEPLOYMENT_ID = new RegExp(`^${PROJECT_REF}_[0-9a-f-]{36}_[1-9][0-9]*$`, 'iu')
const FUNCTIONS = Object.freeze(['kael-matching-maintainer', 'mobile-api'])

export function buildStage1StagingValidationPacket(input) {
  const release = input?.release
  const hosted = input?.hosted
  const proofs = {
    'mobile-api': input?.mobileProof,
    'kael-matching-maintainer': input?.maintainerProof,
  }
  const releaseProblems = checkHarnessRelease(release)
  if (releaseProblems.length || release?.environment !== 'staging') {
    throw new Error(`Staging validation requires a valid Staging release: ${releaseProblems.join('; ')}`)
  }
  if (!COHORT_ID.test(input?.cohortId ?? '')) throw new Error('Staging validation cohort ID is invalid')
  assertHostedRelease(hosted, release)
  for (const functionName of FUNCTIONS) {
    try {
      verifyHostedSourceProof(proofs[functionName], hosted)
    } catch {
      throw new Error(`Staging validation source proof is invalid for ${functionName}`)
    }
  }
  const packet = {
    schemaVersion: 'stage1-staging-validation-packet.v1',
    environment: 'staging',
    projectRef: PROJECT_REF,
    cohortId: input.cohortId,
    release: {
      releaseId: release.releaseId,
      gitSha: release.gitSha,
      bundleSha256: release.bundleSha256,
      manifestSha256: release.manifestSha256,
      sourceBundleSha256: release.sourceBundleSha256,
      edgeBundleSha256: release.edgeBundleSha256,
      migrationInventorySha256: release.migrationInventorySha256,
      providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
    },
    hostedEvidenceSource: hosted.evidenceSource,
    hostedMigrationWatermark: release.migrationWatermark,
    clientCompatibilitySha256: sha256(canonicalJson(hosted.clientCompatibility)),
    deployments: Object.fromEntries(FUNCTIONS.map((functionName) => {
      const proof = proofs[functionName]
      return [functionName, {
        deploymentId: proof.deploymentId,
        edgeVersion: proof.edgeVersion,
        sourceSha256: proof.sourceSha256,
        hostedBundleSha256: proof.hostedBundleSha256,
        proofSha256: proof.proofSha256,
      }]
    })),
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    packetSha256: '',
  }
  packet.packetSha256 = sha256(canonicalJson({ ...packet, packetSha256: undefined }))
  const problems = verifyStage1StagingValidationPacket(packet)
  if (problems.length) throw new Error(`Staging validation packet is invalid: ${problems.join('; ')}`)
  return Object.freeze(packet)
}

export function verifyStage1StagingValidationPacket(packet) {
  const problems = []
  if (packet?.schemaVersion !== 'stage1-staging-validation-packet.v1') problems.push('schema version is invalid')
  if (packet?.environment !== 'staging' || packet?.projectRef !== PROJECT_REF) problems.push('target is invalid')
  if (!COHORT_ID.test(packet?.cohortId ?? '')) problems.push('cohort is invalid')
  const release = packet?.release
  if (!RELEASE_ID.test(release?.releaseId ?? '') || !/^[0-9a-f]{40}$/u.test(release?.gitSha ?? '') ||
      ['bundleSha256', 'manifestSha256', 'sourceBundleSha256', 'edgeBundleSha256',
        'migrationInventorySha256', 'providerReadinessFingerprintSha256']
        .some((field) => !SHA256.test(release?.[field] ?? ''))) {
    problems.push('release identity is invalid')
  }
  if (packet?.hostedEvidenceSource !== 'hosted-api-and-readonly-sql' ||
      !/^\d{14}$/u.test(packet?.hostedMigrationWatermark ?? '') ||
      !SHA256.test(packet?.clientCompatibilitySha256 ?? '')) {
    problems.push('hosted evidence is invalid')
  }
  if (Object.keys(packet?.deployments ?? {}).sort().join('\n') !== [...FUNCTIONS].sort().join('\n')) {
    problems.push('deployment inventory is invalid')
  } else {
    for (const functionName of FUNCTIONS) {
      const deployment = packet.deployments[functionName]
      if (!DEPLOYMENT_ID.test(deployment?.deploymentId ?? '') ||
          !Number.isSafeInteger(deployment?.edgeVersion) || deployment.edgeVersion < 1 ||
          !deployment.deploymentId.endsWith(`_${deployment.edgeVersion}`) ||
          ['sourceSha256', 'hostedBundleSha256', 'proofSha256']
            .some((field) => !SHA256.test(deployment?.[field] ?? ''))) {
        problems.push(`${functionName} deployment evidence is invalid`)
      }
    }
  }
  if (typeof packet?.generatedAt !== 'string' || !Number.isFinite(Date.parse(packet.generatedAt)) ||
      new Date(packet.generatedAt).toISOString() !== packet.generatedAt) problems.push('generatedAt is invalid')
  const expected = sha256(canonicalJson({ ...packet, packetSha256: undefined }))
  if (packet?.packetSha256 !== expected) problems.push('checksum is invalid')
  return problems
}

function assertHostedRelease(hosted, release) {
  const fields = [
    ['releaseId', 'releaseId'],
    ['gitSha', 'gitSha'],
    ['manifestSha256', 'manifestSha256'],
    ['bundleSha256', 'bundleSha256'],
    ['sourceBundleSha256', 'sourceBundleSha256'],
    ['edgeBundleSha256', 'edgeBundleSha256'],
    ['migrationInventorySha256', 'migrationInventorySha256'],
    ['providerReadinessFingerprintSha256', 'providerReadinessFingerprintSha256'],
  ]
  if (hosted?.environment !== 'staging' || hosted?.projectRef !== PROJECT_REF ||
      hosted?.evidenceSource !== 'hosted-api-and-readonly-sql' || !Array.isArray(hosted?.migrations) ||
      hosted.migrations.length === 0 ||
      hosted?.clientCompatibility?.contractEpoch !== 2 ||
      fields.some(([hostedField, releaseField]) => hosted?.[hostedField] !== release?.[releaseField])) {
    throw new Error('Staging hosted identity does not match the release')
  }
  try {
    const migrationState = resolveHostedMigrationState(release.migrationInventory, hosted.migrations)
    const missingCanonicalVersions = canonicalMigrationEntries(release.migrationInventory)
      .map((entry) => entry.version)
      .filter((version) => !migrationState.appliedCanonicalVersions.has(version))
    if (missingCanonicalVersions.length > 0 ||
        !migrationState.appliedCanonicalVersions.has(release.migrationWatermark)) {
      throw new Error('Staging hosted migration history is incomplete')
    }
  } catch {
    throw new Error('Staging hosted identity does not match the release')
  }
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseArgs(args) {
  const options = {}
  const values = new Map([
    ['--release', 'release'], ['--hosted', 'hosted'], ['--mobile-proof', 'mobileProof'],
    ['--maintainer-proof', 'maintainerProof'], ['--cohort-id', 'cohortId'], ['--output', 'output'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const field = values.get(args[index])
    if (!field) throw new Error(`unknown Staging validation argument: ${args[index]}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${args[index - 1]} requires a value`)
    options[field] = value
  }
  for (const field of values.values()) if (!options[field]) throw new Error(`Staging validation option is missing: ${field}`)
  return options
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const read = (path) => JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, path), 'utf8'))
    const packet = buildStage1StagingValidationPacket({
      release: read(options.release),
      hosted: read(options.hosted),
      mobileProof: read(options.mobileProof),
      maintainerProof: read(options.maintainerProof),
      cohortId: options.cohortId,
    })
    const output = resolveReleaseArtifactPath(ROOT, options.output)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(packet, null, 2)}\n`)
    console.log(`Staging validation packet passed: ${packet.packetSha256}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

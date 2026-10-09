import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA256 = /^[0-9a-f]{64}$/u
const GIT_SHA = /^[0-9a-f]{40}$/u
const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const MOBILE_RELEASE_POLICY = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/config/release-client-policy.json'), 'utf8'))
const PLATFORM_POLICY = Object.freeze({
  ios: Object.freeze({
    applicationId: MOBILE_RELEASE_POLICY.platforms.ios.applicationId,
    buildNumber: MOBILE_RELEASE_POLICY.platforms.ios.buildNumber,
    appVersion: MOBILE_RELEASE_POLICY.appVersion,
    runtimeVersion: MOBILE_RELEASE_POLICY.appVersion,
  }),
  android: Object.freeze({
    applicationId: MOBILE_RELEASE_POLICY.platforms.android.applicationId,
    buildNumber: MOBILE_RELEASE_POLICY.platforms.android.buildNumber,
    appVersion: MOBILE_RELEASE_POLICY.appVersion,
    runtimeVersion: MOBILE_RELEASE_POLICY.appVersion,
  }),
})

/**
 * `exact` binds store builds made from the release's own commit. `active_production` binds the exact EAS
 * identities reported by the pinned Production runtime snapshot, even when app and backend commits differ.
 */
export const BINARY_RELATIONS = Object.freeze(['exact', 'active_production'])

export function buildMobileBinaryAttestation(input) {
  const release = input?.release
  const problems = checkHarnessRelease(release)
  if (problems.length > 0 || release.environment !== 'production') {
    throw new Error(`mobile binary attestation requires a valid production release: ${problems.join('; ')}`)
  }
  const relation = input.relation ?? 'exact'
  if (!BINARY_RELATIONS.includes(relation)) throw new Error(`unknown mobile binary relation: ${relation}`)
  const builds = Array.isArray(input.builds) ? input.builds : []
  const selected = relation === 'exact'
    ? selectExactEasBuilds(release, builds)
    : selectActiveProductionEasBuilds(release, builds)
  const platforms = {}
  for (const platform of ['ios', 'android']) {
    const policy = PLATFORM_POLICY[platform]
    const build = selected[platform]
    if (!build) {
      const relationLabel = relation === 'exact'
        ? 'exact'
        : relation === 'active_production' ? 'unique active Production' : 'latest existing'
      throw new Error(`no ${relationLabel} finished EAS ${platform} store build matches the release`)
    }
    const fingerprint = build?.fingerprint?.hash ?? build?.fingerprintHash
    const artifactPath = input.artifactPaths?.[platform]
    const artifactBytes = input.artifactBytes?.[platform] ??
      (artifactPath ? readFileSync(resolveReleaseArtifactPath(ROOT, artifactPath)) : null)
    const fingerprintAlgorithm = easFingerprintAlgorithm(fingerprint)
    if (!UUID.test(build?.id ?? '') || !fingerprintAlgorithm) {
      throw new Error(`EAS ${platform} build identity or fingerprint is invalid`)
    }
    if (!(artifactBytes instanceof Uint8Array) || artifactBytes.byteLength === 0) {
      throw new Error(`EAS ${platform} artifact must contain downloaded binary bytes`)
    }
    const activeClient = release.activeClientCompatibility?.[platform]
    platforms[platform] = {
      easBuildId: build.id.toLowerCase(),
      applicationId: relation === 'active_production' ? activeClient.applicationId : policy.applicationId,
      appVersion: relation === 'active_production' ? activeClient.runtimeVersion : policy.appVersion,
      buildNumber: relation === 'active_production' ? activeClient.minimumBuildNumber : policy.buildNumber,
      runtimeVersion: build.runtimeVersion,
      gitCommitHash: build.gitCommitHash,
      easFingerprintAlgorithm: fingerprintAlgorithm,
      easFingerprintHash: fingerprint,
      artifactSha256: sha256(artifactBytes),
      artifactSizeBytes: artifactBytes.byteLength,
      completedAt: build.completedAt,
      distribution: 'store',
      profile: 'production',
    }
  }
  const receipt = {
    schemaVersion: 'stage1-mobile-binary-attestation.v2',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    sourceFingerprintSha256: release.mobileBuildFingerprintSha256,
    contractEpoch: 2,
    ...(relation === 'exact' ? {} : { binaryRelation: relation }),
    platforms,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    receiptSha256: '',
  }
  receipt.receiptSha256 = sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))
  const receiptProblems = verifyMobileBinaryAttestation(receipt, release)
  if (receiptProblems.length > 0) throw new Error(receiptProblems.join('; '))
  return Object.freeze(receipt)
}

export function selectExactEasBuilds(release, builds) {
  return selectEasBuilds(release, builds, true)
}

export function selectActiveProductionEasBuilds(release, builds) {
  const compatibility = release?.activeClientCompatibility
  if (release?.releaseLane !== 'plan55-production-only' || !compatibility) {
    return Object.freeze({})
  }
  const selected = {}
  for (const platform of ['ios', 'android']) {
    const expected = compatibility[platform]
    const policy = PLATFORM_POLICY[platform]
    const matches = (Array.isArray(builds) ? builds : [])
      .map(normalizeEasBuildIdentity)
      .filter((build) =>
        normalizePlatform(build?.platform) === platform &&
        String(build?.status ?? '').toUpperCase() === 'FINISHED' &&
        String(build?.distribution ?? '').toUpperCase() === 'STORE' &&
        build?.buildProfile === 'production' &&
        build?.id?.toLowerCase() === expected?.easBuildId?.toLowerCase() &&
        build?.appVersion === expected?.runtimeVersion &&
        String(build?.appBuildVersion ?? '') === String(expected?.minimumBuildNumber ?? '') &&
        build?.runtimeVersion === expected?.runtimeVersion &&
        build?.applicationIdentifier === expected?.applicationId &&
        expected?.applicationId === policy.applicationId)
    if (matches.length === 1) selected[platform] = matches[0]
  }
  return Object.freeze(selected)
}

function selectEasBuilds(release, builds, requireReleaseCommit) {
  const selected = {}
  for (const platform of ['ios', 'android']) {
    const policy = PLATFORM_POLICY[platform]
    const matches = (Array.isArray(builds) ? builds : []).map(normalizeEasBuildIdentity).filter((build) =>
      normalizePlatform(build?.platform) === platform &&
      String(build?.status ?? '').toUpperCase() === 'FINISHED' &&
      String(build?.distribution ?? '').toUpperCase() === 'STORE' &&
      build?.buildProfile === 'production' &&
      (!requireReleaseCommit || build?.gitCommitHash === release?.gitSha) &&
      build?.appVersion === policy.appVersion && String(build?.appBuildVersion ?? '') === String(policy.buildNumber) &&
      build?.runtimeVersion === policy.runtimeVersion && build?.applicationIdentifier === policy.applicationId)
      .sort((left, right) => String(right.completedAt ?? '').localeCompare(String(left.completedAt ?? '')))
    if (matches[0]) selected[platform] = matches[0]
  }
  return Object.freeze(selected)
}

export function verifyMobileBinaryAttestation(receipt, release) {
  const problems = []
  if (receipt?.schemaVersion !== 'stage1-mobile-binary-attestation.v2' ||
      receipt?.contractEpoch !== 2 || !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(receipt?.releaseId ?? '') ||
      !/^[0-9a-f]{40}$/u.test(receipt?.gitSha ?? '') || !SHA256.test(receipt?.sourceFingerprintSha256 ?? '') ||
      !Number.isFinite(Date.parse(receipt?.generatedAt ?? ''))) {
    problems.push('mobile binary attestation identity is invalid')
  }
  if (release && (receipt?.releaseId !== release.releaseId || receipt?.gitSha !== release.gitSha ||
      receipt?.sourceFingerprintSha256 !== release.mobileBuildFingerprintSha256)) {
    problems.push('mobile binary attestation does not match the release')
  }
  const relation = receipt?.binaryRelation ?? 'exact'
  if (!BINARY_RELATIONS.includes(relation)) {
    problems.push('mobile binary attestation relation is invalid')
  }
  const exactCommit = relation === 'exact'
  const activeProduction = relation === 'active_production'
  if (release?.releaseLane === 'plan55-production-only' && !activeProduction) {
    problems.push('Plan 55 release requires attestation of the exact active Production client binaries')
  }
  if (activeProduction && release?.releaseLane !== 'plan55-production-only') {
    problems.push('active Production binary relation is reserved for the Plan 55 release lane')
  }
  for (const platform of ['ios', 'android']) {
    const value = receipt?.platforms?.[platform]
    const policy = PLATFORM_POLICY[platform]
    const activeClient = release?.activeClientCompatibility?.[platform]
    const expectedApplicationId = activeProduction ? activeClient?.applicationId : policy.applicationId
    const expectedBuildNumber = activeProduction ? activeClient?.minimumBuildNumber : policy.buildNumber
    const expectedAppVersion = activeProduction ? activeClient?.runtimeVersion : policy.appVersion
    const expectedRuntimeVersion = activeProduction ? activeClient?.runtimeVersion : policy.runtimeVersion
    if (!UUID.test(value?.easBuildId ?? '') || value?.applicationId !== expectedApplicationId ||
        value?.appVersion !== expectedAppVersion || value?.buildNumber !== expectedBuildNumber ||
        value?.runtimeVersion !== expectedRuntimeVersion ||
        (exactCommit ? value?.gitCommitHash !== receipt?.gitSha : !GIT_SHA.test(value?.gitCommitHash ?? '')) ||
        value?.distribution !== 'store' || value?.profile !== 'production' ||
        !easFingerprintAlgorithm(value?.easFingerprintHash) ||
        value?.easFingerprintAlgorithm !== easFingerprintAlgorithm(value?.easFingerprintHash) ||
        !SHA256.test(value?.artifactSha256 ?? '') ||
        !Number.isSafeInteger(value?.artifactSizeBytes) || value.artifactSizeBytes < 1 ||
        !Number.isFinite(Date.parse(value?.completedAt ?? ''))) {
      problems.push(`mobile ${platform} binary evidence is invalid`)
    }
    if (activeProduction &&
        (value?.easBuildId?.toLowerCase() !== activeClient?.easBuildId?.toLowerCase() ||
         value?.applicationId !== activeClient?.applicationId ||
         value?.buildNumber !== activeClient?.minimumBuildNumber ||
         value?.runtimeVersion !== activeClient?.runtimeVersion)) {
      problems.push(`mobile ${platform} attestation does not match the active Production client`)
    }
  }
  const expected = sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))
  if (!SHA256.test(receipt?.receiptSha256 ?? '') || receipt.receiptSha256 !== expected) {
    problems.push('mobile binary attestation checksum mismatch')
  }
  return [...new Set(problems)]
}

function normalizePlatform(value) {
  const normalized = String(value ?? '').toLowerCase()
  return normalized === 'ios' || normalized === 'android' ? normalized : null
}

function normalizeEasBuildIdentity(build) {
  if (!build || typeof build !== 'object' || Array.isArray(build)) return null
  const runtimeVersion = Object.hasOwn(build, 'runtime') ? build.runtime?.version : build.runtimeVersion
  const applicationIdentifier = Object.hasOwn(build, 'appIdentifier') ? build.appIdentifier : build.applicationIdentifier
  if ((build.runtimeVersion !== undefined && build.runtimeVersion !== runtimeVersion) ||
      (build.applicationIdentifier !== undefined && build.applicationIdentifier !== applicationIdentifier)) return null
  return { ...build, runtimeVersion, applicationIdentifier }
}

function easFingerprintAlgorithm(value) {
  if (typeof value !== 'string') return null
  if (/^[0-9a-f]{40}$/u.test(value)) return 'sha1'
  if (SHA256.test(value)) return 'sha256'
  return null
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

function parseArgs(args) {
  const values = new Map([
    ['--release', 'release'], ['--builds', 'builds'], ['--ios-artifact', 'iosArtifact'],
    ['--android-artifact', 'androidArtifact'], ['--output', 'output'],
  ])
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const field = args[index] === '--relation' ? 'relation' : values.get(args[index])
    if (!field) throw new Error(`unknown mobile binary attestation argument: ${args[index]}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${args[index - 1]} requires a value`)
    parsed[field] = value
  }
  for (const field of values.values()) if (!parsed[field]) throw new Error(`mobile binary attestation requires ${field}`)
  return parsed
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const receipt = buildMobileBinaryAttestation({
    release: JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.release), 'utf8')),
    builds: JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.builds), 'utf8')),
    artifactPaths: { ios: options.iosArtifact, android: options.androidArtifact },
    relation: options.relation,
  })
  const output = resolveReleaseArtifactPath(ROOT, options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`Mobile binary attestation written: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stderr.write(`mobile-binary-attestation failed: ${error.message}\n`)
    process.exitCode = 1
  }
}

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA256 = /^[0-9a-f]{64}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const PLATFORM_POLICY = Object.freeze({
  ios: Object.freeze({ applicationId: 'com.phanmanhtu.homeservices', buildNumber: 45 }),
  android: Object.freeze({ applicationId: 'com.phanmanhtu.nestscout', buildNumber: 4 }),
})

export function buildMobileBinaryAttestation(input) {
  const release = input?.release
  const problems = checkHarnessRelease(release)
  if (problems.length > 0 || release.environment !== 'production') {
    throw new Error(`mobile binary attestation requires a valid production release: ${problems.join('; ')}`)
  }
  const builds = Array.isArray(input.builds) ? input.builds : []
  const selected = selectExactEasBuilds(release, builds)
  const platforms = {}
  for (const platform of ['ios', 'android']) {
    const policy = PLATFORM_POLICY[platform]
    const build = selected[platform]
    if (!build) throw new Error(`no exact finished EAS ${platform} store build matches this release`)
    const fingerprint = build?.fingerprint?.hash ?? build?.fingerprintHash
    const artifactPath = input.artifactPaths?.[platform]
    const artifactBytes = input.artifactBytes?.[platform] ??
      (artifactPath ? readFileSync(resolveReleaseArtifactPath(ROOT, artifactPath)) : null)
    if (!UUID.test(build?.id ?? '') || !SHA256.test(fingerprint ?? '') ||
        !artifactBytes || !UUID.test(build.id)) {
      throw new Error(`EAS ${platform} build identity or fingerprint is invalid`)
    }
    platforms[platform] = {
      easBuildId: build.id.toLowerCase(),
      applicationId: policy.applicationId,
      appVersion: build.appVersion,
      buildNumber: policy.buildNumber,
      runtimeVersion: build.runtimeVersion,
      gitCommitHash: build.gitCommitHash,
      fingerprintSha256: fingerprint.toLowerCase(),
      artifactSha256: sha256(artifactBytes),
      completedAt: build.completedAt,
      distribution: 'store',
      profile: 'production',
    }
  }
  const receipt = {
    schemaVersion: 'stage1-mobile-binary-attestation.v1',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    sourceFingerprintSha256: release.mobileBuildFingerprintSha256,
    contractEpoch: 2,
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
  const selected = {}
  for (const platform of ['ios', 'android']) {
    const policy = PLATFORM_POLICY[platform]
    const matches = (Array.isArray(builds) ? builds : []).filter((build) =>
      normalizePlatform(build?.platform) === platform &&
      String(build?.status ?? '').toUpperCase() === 'FINISHED' &&
      String(build?.distribution ?? '').toUpperCase() === 'STORE' &&
      build?.buildProfile === 'production' && build?.gitCommitHash === release?.gitSha &&
      build?.appVersion === '0.2.0' && String(build?.appBuildVersion ?? '') === String(policy.buildNumber) &&
      build?.runtimeVersion === '0.2.0' && build?.applicationIdentifier === policy.applicationId)
      .sort((left, right) => String(right.completedAt ?? '').localeCompare(String(left.completedAt ?? '')))
    if (matches[0]) selected[platform] = matches[0]
  }
  return Object.freeze(selected)
}

export function verifyMobileBinaryAttestation(receipt, release) {
  const problems = []
  if (receipt?.schemaVersion !== 'stage1-mobile-binary-attestation.v1' ||
      receipt?.contractEpoch !== 2 || !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(receipt?.releaseId ?? '') ||
      !/^[0-9a-f]{40}$/u.test(receipt?.gitSha ?? '') || !SHA256.test(receipt?.sourceFingerprintSha256 ?? '') ||
      !Number.isFinite(Date.parse(receipt?.generatedAt ?? ''))) {
    problems.push('mobile binary attestation identity is invalid')
  }
  if (release && (receipt?.releaseId !== release.releaseId || receipt?.gitSha !== release.gitSha ||
      receipt?.sourceFingerprintSha256 !== release.mobileBuildFingerprintSha256)) {
    problems.push('mobile binary attestation does not match the release')
  }
  for (const platform of ['ios', 'android']) {
    const value = receipt?.platforms?.[platform]
    const policy = PLATFORM_POLICY[platform]
    if (!UUID.test(value?.easBuildId ?? '') || value?.applicationId !== policy.applicationId ||
        value?.appVersion !== '0.2.0' || value?.buildNumber !== policy.buildNumber ||
        value?.runtimeVersion !== '0.2.0' || value?.gitCommitHash !== receipt?.gitSha ||
        value?.distribution !== 'store' || value?.profile !== 'production' ||
        !SHA256.test(value?.fingerprintSha256 ?? '') || !SHA256.test(value?.artifactSha256 ?? '') ||
        !Number.isFinite(Date.parse(value?.completedAt ?? ''))) {
      problems.push(`mobile ${platform} binary evidence is invalid`)
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
    const field = values.get(args[index])
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

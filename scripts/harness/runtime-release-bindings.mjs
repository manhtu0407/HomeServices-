import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'
import { verifyMobileBinaryAttestation } from './mobile-binary-attestation.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DIGEST = /^[0-9a-f]{64}$/u
const GIT_SHA = /^[0-9a-f]{40}$/u
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const RUNTIME_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u
const PLAN55_ACTIVE_CLIENT_BINDINGS = Object.freeze([
  ['HARNESS_CLIENT_COMPAT_GIT_SHA', 'gitSha'],
  ['HARNESS_CLIENT_COMPAT_RELEASE_ID', 'releaseId'],
])

const STAGING_CLIENT_POLICY = Object.freeze({
  ios: Object.freeze({
    applicationId: 'com.phanmanhtu.homeservices',
    distribution: 'STORE',
    buildProfile: 'production',
  }),
  android: Object.freeze({
    applicationId: 'com.phanmanhtu.nestscout',
    distribution: 'INTERNAL',
    buildProfile: 'preview',
  }),
})

const BINDINGS = Object.freeze([
  ['HARNESS_RELEASE_ID', 'releaseId'],
  ['HARNESS_GIT_SHA', 'gitSha'],
  ['HARNESS_MANIFEST_SHA256', 'manifestSha256'],
  ['HARNESS_BUNDLE_SHA256', 'bundleSha256'],
  ['HARNESS_SOURCE_BUNDLE_SHA256', 'sourceBundleSha256'],
  ['HARNESS_MOBILE_BUILD_FINGERPRINT_SHA256', 'mobileBuildFingerprintSha256'],
  ['HARNESS_PRODUCTION_UI_SOURCE_SHA256', 'productionUiSourceSha256'],
  ['HARNESS_EDGE_BUNDLE_SHA256', 'edgeBundleSha256'],
  ['HARNESS_MIGRATION_INVENTORY_SHA256', 'migrationInventorySha256'],
  ['HARNESS_SERVICE_INTAKE_POLICY_BUNDLE_SHA256', 'serviceIntakePolicyBundleSha256'],
  ['HARNESS_PRICE_EVIDENCE_BUNDLE_SHA256', 'priceEvidenceBundleSha256'],
  ['HARNESS_PROVIDER_READINESS_FINGERPRINT_SHA256', 'providerReadinessFingerprintSha256'],
])
const CLIENT_BINDINGS = Object.freeze([
  ['NESTSCOUT_STAGE1_CLIENT_CONTRACT_EPOCH', () => '2'],
  ['NESTSCOUT_STAGE1_IOS_APPLICATION_ID', (receipt) => receipt.platforms.ios.applicationId],
  ['NESTSCOUT_STAGE1_IOS_MINIMUM_BUILD_NUMBER', (receipt) => String(receipt.platforms.ios.buildNumber)],
  ['NESTSCOUT_STAGE1_IOS_EAS_BUILD_ID', (receipt) => receipt.platforms.ios.easBuildId],
  ['NESTSCOUT_STAGE1_IOS_RUNTIME_VERSION', (receipt) => receipt.platforms.ios.runtimeVersion],
  ['NESTSCOUT_STAGE1_ANDROID_APPLICATION_ID', (receipt) => receipt.platforms.android.applicationId],
  ['NESTSCOUT_STAGE1_ANDROID_MINIMUM_BUILD_NUMBER', (receipt) => String(receipt.platforms.android.buildNumber)],
  ['NESTSCOUT_STAGE1_ANDROID_EAS_BUILD_ID', (receipt) => receipt.platforms.android.easBuildId],
  ['NESTSCOUT_STAGE1_ANDROID_RUNTIME_VERSION', (receipt) => receipt.platforms.android.runtimeVersion],
])
const PUSH_READINESS_BINDINGS = Object.freeze([
  ['NESTSCOUT_ANDROID_FCM_V1_READY', 'android_fcm_v1'],
  ['NESTSCOUT_IOS_APNS_READY', 'ios_apns'],
  ['NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY', 'push_receipt_reconciler'],
])

function pushReadinessBindings(readiness) {
  return Object.fromEntries(PUSH_READINESS_BINDINGS.map(([name, field]) => [
    name, readiness?.[field] === true ? 'true' : 'false',
  ]))
}

export function runtimeReleaseBindingsFromRelease(release, mobileBinaryAttestation) {
  const problems = checkHarnessRelease(release)
  const attestationProblems = verifyMobileBinaryAttestation(mobileBinaryAttestation, release)
  if (problems.length || release.environment !== 'production' || attestationProblems.length > 0) {
    throw new Error(`runtime bindings require a valid production release: ${[...problems, ...attestationProblems].join('; ')}`)
  }
  return Object.freeze({
    NESTSCOUT_ENVIRONMENT: 'production',
    ...(release.releaseLane ? { HARNESS_RELEASE_LANE: release.releaseLane } : {}),
    ...(release.releaseLane === 'plan55-production-only'
      ? plan55ClientCompatibilityBindings(release.activeClientCompatibility)
      : {}),
    ...pushReadinessBindings(release.providerReadiness),
    ...Object.fromEntries(BINDINGS.map(([name, field]) => [name, release[field]])),
    ...Object.fromEntries(CLIENT_BINDINGS.map(([name, read]) => [name, read(mobileBinaryAttestation)])),
  })
}

export function runtimeReleaseBindingsFromStagingRelease(release, compatibilityEvidence) {
  const problems = checkHarnessRelease(release)
  const evidenceProblems = checkStagingClientCompatibility(compatibilityEvidence, release)
  if (problems.length || release.environment !== 'staging' || evidenceProblems.length > 0) {
    throw new Error(`runtime bindings require a valid staging release and client compatibility evidence: ${[
      ...problems,
      ...(release.environment === 'staging' ? [] : ['release environment must be staging']),
      ...evidenceProblems,
    ].join('; ')}`)
  }
  const receipt = {
    platforms: Object.fromEntries(Object.entries(compatibilityEvidence.platforms).map(([platform, value]) => [
      platform,
      { ...value, buildNumber: value.minimumBuildNumber },
    ])),
  }
  return Object.freeze({
    NESTSCOUT_ENVIRONMENT: 'staging',
    ...pushReadinessBindings(release.providerReadiness),
    ...Object.fromEntries(BINDINGS.map(([name, field]) => [name, release[field]])),
    ...Object.fromEntries(CLIENT_BINDINGS.map(([name, read]) => [name, read(receipt)])),
  })
}

export function runtimeReleaseBindingsFromHostedState(hosted) {
  if (hosted?.environment !== 'production' || hosted?.projectRef !== 'iwevizmsedyqozxlawwl') {
    throw new Error('rollback bindings require the exact hosted production baseline')
  }
  const values = {
    releaseId: valid(hosted.releaseId, RELEASE_ID) ? hosted.releaseId : 'unreleased',
    gitSha: valid(hosted.gitSha, GIT_SHA) ? hosted.gitSha : 'unknown',
  }
  const releaseLane = hosted.releaseLane == null ? null : validReleaseLane(hosted.releaseLane)
  if (hosted.releaseLane != null && !releaseLane) {
    throw new Error('rollback bindings contain an invalid release lane')
  }
  for (const [, field] of BINDINGS.slice(2)) {
    values[field] = valid(hosted[field], DIGEST) ? hosted[field] : 'unknown'
  }
  const activeClientCompatibility = releaseLane === 'plan55-production-only' &&
    hosted.clientCompatibility?.gitSha && hosted.clientCompatibility?.releaseId
    ? plan55ClientCompatibilityBindings({
      gitSha: hosted.clientCompatibility.gitSha,
      releaseId: hosted.clientCompatibility.releaseId,
    })
    : {}
  return Object.freeze({
    NESTSCOUT_ENVIRONMENT: 'production',
    ...(releaseLane ? { HARNESS_RELEASE_LANE: releaseLane } : {}),
    ...activeClientCompatibility,
    ...pushReadinessBindings(hosted.providerReadiness),
    ...Object.fromEntries(BINDINGS.map(([name, field]) => [name, values[field]])),
    NESTSCOUT_STAGE1_CLIENT_CONTRACT_EPOCH: String(hosted.clientCompatibility?.contractEpoch ?? 1),
    NESTSCOUT_STAGE1_IOS_APPLICATION_ID: hosted.clientCompatibility?.ios?.applicationId ?? 'legacy-unavailable',
    NESTSCOUT_STAGE1_IOS_MINIMUM_BUILD_NUMBER: String(hosted.clientCompatibility?.ios?.minimumBuildNumber ?? 1),
    NESTSCOUT_STAGE1_IOS_EAS_BUILD_ID: hosted.clientCompatibility?.ios?.easBuildId ?? 'legacy-unavailable',
    NESTSCOUT_STAGE1_IOS_RUNTIME_VERSION: hosted.clientCompatibility?.ios?.runtimeVersion ?? 'legacy-unavailable',
    NESTSCOUT_STAGE1_ANDROID_APPLICATION_ID: hosted.clientCompatibility?.android?.applicationId ?? 'legacy-unavailable',
    NESTSCOUT_STAGE1_ANDROID_MINIMUM_BUILD_NUMBER: String(hosted.clientCompatibility?.android?.minimumBuildNumber ?? 1),
    NESTSCOUT_STAGE1_ANDROID_EAS_BUILD_ID: hosted.clientCompatibility?.android?.easBuildId ?? 'legacy-unavailable',
    NESTSCOUT_STAGE1_ANDROID_RUNTIME_VERSION: hosted.clientCompatibility?.android?.runtimeVersion ?? 'legacy-unavailable',
  })
}

export function assertHostedRuntimeBindingsRestorable(hosted) {
  if (hosted?.environment !== 'production' || hosted?.projectRef !== 'iwevizmsedyqozxlawwl' ||
      !valid(hosted.releaseId, RELEASE_ID) || !valid(hosted.gitSha, GIT_SHA)) {
    throw new Error('rollback preflight requires an exact registered Production release identity')
  }
  for (const [, field] of BINDINGS.slice(2)) {
    if (!valid(hosted[field], DIGEST)) {
      throw new Error(`rollback preflight is missing exact hosted release metadata: ${field}`)
    }
  }
  const readiness = hosted.providerReadiness
  const readinessKeys = ['android_fcm_v1', 'anthropic', 'deepseek', 'durable_guards', 'global_ai_enabled',
    'ios_apns', 'perplexity', 'push_receipt_reconciler', 'vietmap']
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness) ||
      Object.keys(readiness).sort().join('\n') !== readinessKeys.sort().join('\n') ||
      readinessKeys.some((key) => typeof readiness[key] !== 'boolean')) {
    throw new Error('rollback preflight requires complete hosted provider readiness')
  }
  const compatibility = hosted.clientCompatibility
  if (!compatibility || typeof compatibility !== 'object' || Array.isArray(compatibility) ||
      !Number.isSafeInteger(compatibility.contractEpoch) || compatibility.contractEpoch < 1 ||
      !['ios', 'android'].every((platform) => {
        const value = compatibility[platform]
        return value && typeof value === 'object' &&
          typeof value.applicationId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/u.test(value.applicationId) &&
          Number.isSafeInteger(value.minimumBuildNumber) && value.minimumBuildNumber > 0 &&
          typeof value.easBuildId === 'string' && UUID.test(value.easBuildId) &&
          typeof value.runtimeVersion === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(value.runtimeVersion)
      })) {
    throw new Error('rollback preflight requires complete hosted client compatibility')
  }
  if (hosted.releaseLane != null && !validReleaseLane(hosted.releaseLane)) {
    throw new Error('rollback preflight contains an invalid hosted release lane')
  }
  const bindings = runtimeReleaseBindingsFromHostedState(hosted)
  const args = bindingArguments(bindings)
  if (args.some((argument) => /(?:=unknown|=unreleased|=legacy-unavailable)$/u.test(argument)) ||
      args.length !== (hosted.releaseLane === 'plan55-production-only' ? 28 : hosted.releaseLane ? 26 : 25)) {
    throw new Error('rollback preflight cannot reconstruct the exact hosted binding set')
  }
  return Object.freeze({ bindingCount: args.length, bindings })
}

function validReleaseLane(value) {
  return value === 'verification' || value === 'plan55-production-only' ? value : null
}

export function bindingArguments(bindings) {
  const required = new Set(['NESTSCOUT_ENVIRONMENT', ...BINDINGS.map(([name]) => name),
    ...CLIENT_BINDINGS.map(([name]) => name), ...PUSH_READINESS_BINDINGS.map(([name]) => name)])
  const allowed = new Set([
    ...required,
    'HARNESS_RELEASE_LANE',
    ...PLAN55_ACTIVE_CLIENT_BINDINGS.map(([name]) => name),
  ])
  const names = Object.keys(bindings ?? {})
  const activeClientFields = PLAN55_ACTIVE_CLIENT_BINDINGS.map(([name]) => Object.hasOwn(bindings ?? {}, name))
  if (!bindings || names.some((name) => !allowed.has(name)) ||
      [...required].some((name) => !Object.hasOwn(bindings, name)) ||
      (activeClientFields.some(Boolean) && !activeClientFields.every(Boolean)) ||
      (activeClientFields.some(Boolean) && bindings.HARNESS_RELEASE_LANE !== 'plan55-production-only') ||
      (Object.hasOwn(bindings, 'HARNESS_RELEASE_LANE') && !validReleaseLane(bindings.HARNESS_RELEASE_LANE))) {
    throw new Error('runtime release binding set is incomplete')
  }
  return Object.entries(bindings).sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => {
      if (!/^[A-Z][A-Z0-9_]{2,80}$/u.test(name) || !/^[A-Za-z0-9._:-]{1,160}$/u.test(value)) {
        throw new Error('runtime release binding contains an unsafe value')
      }
      return `${name}=${value}`
    })
}

function plan55ClientCompatibilityBindings(value) {
  const gitSha = String(value?.gitSha ?? '').toLowerCase()
  const releaseId = value?.releaseId
  if (!GIT_SHA.test(gitSha) || !RELEASE_ID.test(releaseId ?? '') ||
      !new RegExp(`^harness-${gitSha.slice(0, 12)}-[0-9a-f]{12}$`, 'i').test(releaseId)) {
    throw new Error('Plan 55 client compatibility must identify the pinned Production app release')
  }
  return Object.freeze({
    HARNESS_CLIENT_COMPAT_GIT_SHA: gitSha,
    HARNESS_CLIENT_COMPAT_RELEASE_ID: releaseId,
  })
}

function valid(value, pattern) {
  return typeof value === 'string' && pattern.test(value)
}

function checkStagingClientCompatibility(evidence, release) {
  const problems = []
  const native = evidence?.schemaVersion === 'stage1-staging-native-compatibility.v1'
  if (!native && evidence?.schemaVersion !== 'stage1-staging-client-compatibility.v1') {
    problems.push('schemaVersion must be stage1-staging-client-compatibility.v1')
  }
  if (evidence?.environment !== 'staging') problems.push('environment must be staging')
  const source = native ? 'eas-build-and-embedded-artifact' : 'eas-build-inventory'
  if (evidence?.source !== source) problems.push(`source must be ${source}`)
  if (native) {
    if (evidence.projectId !== 'c2fd8ae7-a6fa-4b6e-a9a0-df85b52ac94b') {
      problems.push('native evidence must target the NestScout EAS project')
    }
    for (const field of ['releaseId', 'gitSha', 'sourceBundleSha256']) {
      if (!evidence[field] || evidence[field] !== release?.[field]) {
        problems.push(`native evidence ${field} must match the staging release`)
      }
    }
  }
  if (evidence?.contractEpoch !== 2) problems.push('contractEpoch must be 2')
  const observedAt = evidence?.observedAt
  if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt)) ||
      new Date(observedAt).toISOString() !== observedAt) {
    problems.push('observedAt must be a canonical ISO timestamp')
  }
  for (const [platform, policy] of Object.entries(STAGING_CLIENT_POLICY)) {
    const value = evidence?.platforms?.[platform]
    if (!value || typeof value !== 'object') {
      problems.push(`${platform} compatibility evidence is required`)
      continue
    }
    if (value.applicationId !== policy.applicationId) problems.push(`${platform} applicationId is invalid`)
    if (!Number.isSafeInteger(value.minimumBuildNumber) || value.minimumBuildNumber < 1) {
      problems.push(`${platform} minimumBuildNumber must be a positive integer`)
    }
    if (!valid(value.easBuildId, UUID)) problems.push(`${platform} easBuildId must be a UUID`)
    if (!valid(value.runtimeVersion, RUNTIME_VERSION)) problems.push(`${platform} runtimeVersion is invalid`)
    if (!valid(value.buildGitSha, GIT_SHA)) problems.push(`${platform} buildGitSha must be a Git SHA`)
    if (value.distribution !== (native ? 'INTERNAL' : policy.distribution)) problems.push(`${platform} distribution is invalid`)
    if (value.buildProfile !== (native ? 'native-proof-staging' : policy.buildProfile)) problems.push(`${platform} buildProfile is invalid`)
    if (native) problems.push(...checkNativeStagingArtifact(platform, value, evidence))
  }
  return problems
}

function checkNativeStagingArtifact(platform, value, evidence) {
  const problems = []
  if (value.status !== 'FINISHED' || !valid(value.artifactSha256, DIGEST) ||
      !Number.isFinite(Date.parse(value.completedAt)) ||
      Date.parse(value.completedAt) > Date.parse(evidence.observedAt)) {
    problems.push(`${platform} requires a finished, hashed native artifact`)
  }
  if (value.buildGitSha !== evidence.gitSha) problems.push(`${platform} build Git SHA must match the staging release`)
  const expected = {
    applicationId: value.applicationId,
    buildNumber: value.minimumBuildNumber,
    easBuildId: value.easBuildId,
    runtimeVersion: value.runtimeVersion,
    contractEpoch: '2',
    gitSha: evidence.gitSha,
    releaseId: evidence.releaseId,
    buildProfile: 'native-proof-staging',
    supabaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
    apiBaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value.embedded?.[field] !== expectedValue) {
      problems.push(`${platform} embedded ${field} does not match staging compatibility`)
    }
  }
  return problems
}

function parseArgs(args) {
  if (args[0] === '--release' && args.length === 4 && args[2] === '--mobile-attestation') {
    return { mode: 'release', path: args[1], mobileAttestationPath: args[3] }
  }
  if (args[0] === '--release' && args.length === 4 && args[2] === '--staging-client-compatibility') {
    return { mode: 'staging-release', path: args[1], compatibilityEvidencePath: args[3] }
  }
  if (args[0] === '--hosted' && args.length === 2) return { mode: 'hosted', path: args[1] }
  throw new Error('runtime-release-bindings requires --release with --mobile-attestation, --release with --staging-client-compatibility, or one --hosted path')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const value = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.path), 'utf8'))
    const bindings = options.mode === 'release'
      ? runtimeReleaseBindingsFromRelease(
        value,
        JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.mobileAttestationPath), 'utf8')),
      )
      : options.mode === 'staging-release'
        ? runtimeReleaseBindingsFromStagingRelease(
          value,
          JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.compatibilityEvidencePath), 'utf8')),
        )
        : runtimeReleaseBindingsFromHostedState(value)
    process.stdout.write(`${bindingArguments(bindings).join('\n')}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

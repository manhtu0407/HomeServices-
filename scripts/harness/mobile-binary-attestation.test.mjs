import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { rehash } from './fixtures/checksum.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import {
  buildMobileBinaryAttestation,
  selectActiveProductionEasBuilds,
  selectExactEasBuilds,
  verifyMobileBinaryAttestation,
} from './mobile-binary-attestation.mjs'

const mobilePolicy = JSON.parse(readFileSync(resolve('apps/mobile/config/release-client-policy.json'), 'utf8'))
const release = buildHarnessRelease({
  environment: 'production', gitSha: 'a'.repeat(40), requireCleanWorktree: false,
  providerReadiness: productionProviderReadiness(),
})
const now = '2026-08-23T01:02:03.000Z'

function build(platform, id, applicationIdentifier, appBuildVersion, appVersion = mobilePolicy.appVersion) {
  return {
    id,
    platform,
    status: 'FINISHED',
    distribution: 'STORE',
    buildProfile: 'production',
    gitCommitHash: release.gitSha,
    appVersion,
    appBuildVersion,
    runtime: { version: appVersion },
    appIdentifier: applicationIdentifier,
    fingerprint: { hash: platform === 'IOS' ? '1'.repeat(40) : '2'.repeat(40) },
    completedAt: now,
  }
}

function attestationInput() {
  return {
    release,
    builds: [
      build('IOS', '11111111-1111-4111-8111-111111111111', mobilePolicy.platforms.ios.applicationId, String(mobilePolicy.platforms.ios.buildNumber)),
      build('ANDROID', '22222222-2222-4222-8222-222222222222', mobilePolicy.platforms.android.applicationId, String(mobilePolicy.platforms.android.buildNumber)),
    ],
    artifactBytes: { ios: Buffer.from('ios-binary'), android: Buffer.from('android-binary') },
    now,
  }
}

function plan55ReleaseAndBuilds() {
  const policy = JSON.parse(readFileSync(resolve('config/harness/plan55-production-only-policy.json'), 'utf8'))
  const inventory = JSON.parse(readFileSync(resolve('config/harness/migration-inventory.json'), 'utf8'))
  const clientCompatibility = {
    gitSha: policy.productionSourceBase.sha,
    releaseId: policy.productionSourceBase.releaseId,
    contractEpoch: 2,
    ios: {
      applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 46,
      easBuildId: '33333333-3333-4333-8333-333333333333', runtimeVersion: '0.2.0',
    },
    android: {
      applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 5,
      easBuildId: '44444444-4444-4444-8444-444444444444', runtimeVersion: '0.2.0',
    },
  }
  const hostedBeforeBytes = Buffer.from(`${JSON.stringify({
    environment: 'production', projectRef: policy.projectRef,
    releaseId: policy.productionSourceBase.releaseId, gitSha: policy.productionSourceBase.sha,
    clientCompatibility, migrations: inventory.entries.slice(0, 3).map(({ version, name }) => ({ version, name })),
  }, null, 2)}\n`)
  const plan55Release = buildHarnessRelease({
    environment: 'production', gitSha: 'e'.repeat(40), lane: 'plan55-production-only',
    requireCleanWorktree: false, hostedBeforeBytes,
    providerReadiness: productionProviderReadiness(),
  })
  const builds = [
    {
      ...build('IOS', clientCompatibility.ios.easBuildId, clientCompatibility.ios.applicationId, '46', clientCompatibility.ios.runtimeVersion),
      gitCommitHash: 'a'.repeat(40), runtime: { version: clientCompatibility.ios.runtimeVersion },
    },
    {
      ...build('ANDROID', clientCompatibility.android.easBuildId, clientCompatibility.android.applicationId, '5', clientCompatibility.android.runtimeVersion),
      gitCommitHash: 'b'.repeat(40), runtime: { version: clientCompatibility.android.runtimeVersion },
    },
  ]
  return { release: plan55Release, builds, clientCompatibility }
}

test('binds exact EAS iOS and Android store builds plus downloaded artifact bytes', () => {
  const receipt = buildMobileBinaryAttestation(attestationInput())
  assert.equal(receipt.platforms.ios.buildNumber, mobilePolicy.platforms.ios.buildNumber)
  assert.equal(receipt.platforms.android.buildNumber, mobilePolicy.platforms.android.buildNumber)
  assert.equal(receipt.schemaVersion, 'stage1-mobile-binary-attestation.v2')
  assert.equal(receipt.platforms.ios.easFingerprintAlgorithm, 'sha1')
  assert.equal(receipt.platforms.ios.easFingerprintHash, '1'.repeat(40))
  assert.match(receipt.platforms.ios.artifactSha256, /^[0-9a-f]{64}$/u)
  assert.notEqual(receipt.platforms.ios.artifactSha256, receipt.platforms.android.artifactSha256)
  assert.deepEqual(verifyMobileBinaryAttestation(receipt, release), [])
  assert.match(verifyMobileBinaryAttestation({
    ...receipt,
    platforms: { ...receipt.platforms, ios: { ...receipt.platforms.ios, easBuildId: '33333333-3333-4333-8333-333333333333' } },
  }, release).join('; '), /checksum/u)
})

test('rejects stale commit, wrong build number, or missing platform build', () => {
  assert.throws(() => buildMobileBinaryAttestation({
    release, builds: [], artifactPaths: {}, now,
  }), /no exact finished EAS ios/u)
  for (const [field, value] of Object.entries({
    gitCommitHash: 'b'.repeat(40), appVersion: '0.2.0',
    appBuildVersion: String(mobilePolicy.platforms.ios.buildNumber - 1), runtimeVersion: '0.1.0',
    applicationIdentifier: 'com.example.other', status: 'IN_PROGRESS',
    distribution: 'INTERNAL', buildProfile: 'native-proof-production',
  })) {
    const input = attestationInput()
    input.builds[0][field] = value
    assert.throws(() => buildMobileBinaryAttestation(input), /no exact finished EAS ios/u, field)
  }
})

test('preserves SHA-256 EAS fingerprints without confusing them with artifact hashes', () => {
  const input = attestationInput()
  input.builds[0].fingerprint.hash = '3'.repeat(64)
  const receipt = buildMobileBinaryAttestation(input)
  assert.equal(receipt.platforms.ios.easFingerprintAlgorithm, 'sha256')
  assert.equal(receipt.platforms.ios.easFingerprintHash, '3'.repeat(64))
  assert.notEqual(receipt.platforms.ios.easFingerprintHash, receipt.platforms.ios.artifactSha256)
  const altered = structuredClone(receipt)
  altered.platforms.ios.easFingerprintAlgorithm = 'sha1'
  assert.ok(verifyMobileBinaryAttestation(altered, release).includes('mobile ios binary evidence is invalid'),
    'algorithm/hash inconsistency must fail semantically, not only because the checksum changed')
  assert.ok(verifyMobileBinaryAttestation({ ...receipt, schemaVersion: 'stage1-mobile-binary-attestation.v1' }, release)
    .includes('mobile binary attestation identity is invalid'))
})

test('rejects missing or malformed EAS fingerprints and empty artifacts', () => {
  for (const hash of [undefined, '', '1'.repeat(39), '1'.repeat(41), 'g'.repeat(40), '1'.repeat(63)]) {
    const input = attestationInput()
    input.builds[0].fingerprint.hash = hash
    assert.throws(() => buildMobileBinaryAttestation(input), /identity or fingerprint is invalid/u)
  }
  const empty = attestationInput()
  empty.artifactBytes.ios = Buffer.alloc(0)
  assert.throws(() => buildMobileBinaryAttestation(empty), /artifact/u, 'an empty download is not binary evidence')
  empty.artifactBytes.ios = 'not-downloaded-bytes'
  assert.throws(() => buildMobileBinaryAttestation(empty), /artifact/u)
})

test('does not invent EAS runtime identity or prefer conflicting normalized aliases', () => {
  const mutations = [
    (value) => { value.runtime = null; value.runtimeVersion = '0.2.0' },
    (value) => { value.runtime = { version: null } },
    (value) => { delete value.runtime },
    (value) => { value.runtimeVersion = '0.1.0' },
    (value) => { value.appIdentifier = 'com.example.other' },
    (value) => { value.applicationIdentifier = 'com.example.other' },
    (value) => { value.appIdentifier = null; value.applicationIdentifier = 'com.phanmanhtu.homeservices' },
  ]
  for (const mutate of mutations) {
    const input = attestationInput()
    mutate(input.builds[0])
    assert.throws(() => buildMobileBinaryAttestation(input), /no exact finished EAS ios/u)
  }
  const receipt = buildMobileBinaryAttestation(attestationInput())
  receipt.platforms.ios.artifactSizeBytes = 0
  assert.ok(verifyMobileBinaryAttestation(receipt, release).includes('mobile ios binary evidence is invalid'))
})

function olderCommitInput() {
  const input = attestationInput()
  input.builds[0] = { ...input.builds[0], gitCommitHash: 'b'.repeat(40), completedAt: '2026-08-01T00:00:00.000Z' }
  input.builds[1] = { ...input.builds[1], gitCommitHash: 'c'.repeat(40), completedAt: '2026-08-02T00:00:00.000Z' }
  return input
}

test('verification releases cannot attest a store build from another commit', () => {
  assert.throws(() => buildMobileBinaryAttestation({
    ...olderCommitInput(), relation: 'latest_existing',
  }), /unknown mobile binary relation/u)
  assert.throws(() => buildMobileBinaryAttestation(olderCommitInput()), /no exact finished EAS ios/u)
})

test('the exact relation still refuses a build of another commit, and its receipt carries no relation field', () => {
  assert.throws(() => buildMobileBinaryAttestation(olderCommitInput()), /no exact finished EAS ios/u)
  const exact = buildMobileBinaryAttestation(attestationInput())
  assert.equal(Object.hasOwn(exact, 'binaryRelation'), false, 'strict receipts must stay byte-identical to before')
  assert.throws(() => buildMobileBinaryAttestation({ ...attestationInput(), relation: 'newest' }), /unknown mobile binary relation/u)
})

test('an unsupported relation cannot be forged to launder a build of another commit', () => {
  const exact = buildMobileBinaryAttestation(attestationInput())
  const relabelled = rehash({ ...exact, binaryRelation: 'latest_existing', platforms: {
    ...exact.platforms,
    ios: { ...exact.platforms.ios, gitCommitHash: 'b'.repeat(40) },
  } })
  assert.ok(verifyMobileBinaryAttestation(relabelled, release).includes('mobile binary attestation relation is invalid'))
})

test('exact selection chooses only the newest finished store build for this release commit and policy', () => {
  const builds = [
    { ...build('IOS', '11111111-1111-4111-8111-111111111111', mobilePolicy.platforms.ios.applicationId, String(mobilePolicy.platforms.ios.buildNumber)), gitCommitHash: 'b'.repeat(40), completedAt: '2026-08-01T00:00:00.000Z' },
    { ...build('IOS', '44444444-4444-4444-8444-444444444444', mobilePolicy.platforms.ios.applicationId, String(mobilePolicy.platforms.ios.buildNumber)), completedAt: '2026-09-01T00:00:00.000Z' },
    build('ANDROID', '22222222-2222-4222-8222-222222222222', mobilePolicy.platforms.android.applicationId, String(mobilePolicy.platforms.android.buildNumber)),
  ]
  assert.equal(selectExactEasBuilds(release, builds).ios.id, '44444444-4444-4444-8444-444444444444')
  for (const [field, value] of Object.entries({
    gitCommitHash: 'd'.repeat(40), appBuildVersion: String(mobilePolicy.platforms.ios.buildNumber - 1),
    runtimeVersion: '0.1.0', applicationIdentifier: 'com.example.other', status: 'IN_PROGRESS',
    distribution: 'INTERNAL', buildProfile: 'preview', appVersion: '0.2.0',
  })) {
    const mutated = builds.map((item) => (item.platform === 'IOS' ? { ...item, [field]: value } : item))
    assert.equal(selectExactEasBuilds(release, mutated).ios, undefined, field)
  }
})

test('Plan 55 attests the exact active Production EAS builds without requiring their commit to equal the backend release SHA', () => {
  const { release: plan55Release, builds, clientCompatibility } = plan55ReleaseAndBuilds()
  const selected = selectActiveProductionEasBuilds(plan55Release, builds)
  assert.equal(selected.ios.id, clientCompatibility.ios.easBuildId)
  assert.equal(selected.android.id, clientCompatibility.android.easBuildId)
  const receipt = buildMobileBinaryAttestation({
    release: plan55Release,
    builds,
    relation: 'active_production',
    artifactBytes: { ios: Buffer.from('active-ios'), android: Buffer.from('active-android') },
    now,
  })
  assert.equal(receipt.binaryRelation, 'active_production')
  assert.equal(receipt.platforms.ios.buildNumber, 46)
  assert.equal(receipt.platforms.android.buildNumber, 5)
  assert.equal(receipt.platforms.ios.gitCommitHash, 'a'.repeat(40))
  assert.deepEqual(verifyMobileBinaryAttestation(receipt, plan55Release), [])
})

test('Plan 55 active Production binary selection rejects stale, duplicate, and mismatched identities', () => {
  const { release: plan55Release, builds, clientCompatibility } = plan55ReleaseAndBuilds()
  assert.equal(selectActiveProductionEasBuilds(plan55Release, [
    { ...builds[0], id: '55555555-5555-4555-8555-555555555555' }, builds[1],
  ]).ios, undefined)
  assert.equal(selectActiveProductionEasBuilds(plan55Release, [...builds, builds[0]]).ios, undefined,
    'duplicate exact EAS identities are ambiguous and fail closed')
  assert.equal(selectActiveProductionEasBuilds(plan55Release, [
    { ...builds[0], appBuildVersion: String(clientCompatibility.ios.minimumBuildNumber - 1) }, builds[1],
  ]).ios, undefined)
  const receipt = buildMobileBinaryAttestation({
    release: plan55Release, builds, relation: 'active_production',
    artifactBytes: { ios: Buffer.from('ios'), android: Buffer.from('android') }, now,
  })
  const altered = rehash({
    ...receipt,
    platforms: {
      ...receipt.platforms,
      ios: { ...receipt.platforms.ios, easBuildId: '55555555-5555-4555-8555-555555555555' },
    },
  })
  assert.ok(verifyMobileBinaryAttestation(altered, plan55Release)
    .includes('mobile ios attestation does not match the active Production client'))
})

function productionProviderReadiness() {
  return {
    android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, ios_apns: true, perplexity: true,
    push_receipt_reconciler: true, vietmap: true,
  }
}

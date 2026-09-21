import assert from 'node:assert/strict'
import { test } from 'node:test'

import { rehash } from './fixtures/checksum.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import {
  buildMobileBinaryAttestation,
  selectExactEasBuilds,
  selectLatestEasBuilds,
  verifyMobileBinaryAttestation,
} from './mobile-binary-attestation.mjs'

const release = buildHarnessRelease({
  environment: 'production', gitSha: 'a'.repeat(40), requireCleanWorktree: false,
  providerReadiness: productionProviderReadiness(),
})
const now = '2026-08-23T01:02:03.000Z'

function build(platform, id, applicationIdentifier, appBuildVersion) {
  return {
    id,
    platform,
    status: 'FINISHED',
    distribution: 'STORE',
    buildProfile: 'production',
    gitCommitHash: release.gitSha,
    appVersion: '0.2.0',
    appBuildVersion,
    runtime: { version: '0.2.0' },
    appIdentifier: applicationIdentifier,
    fingerprint: { hash: platform === 'IOS' ? '1'.repeat(40) : '2'.repeat(40) },
    completedAt: now,
  }
}

function attestationInput() {
  return {
    release,
    builds: [
      build('IOS', '11111111-1111-4111-8111-111111111111', 'com.phanmanhtu.homeservices', '45'),
      build('ANDROID', '22222222-2222-4222-8222-222222222222', 'com.phanmanhtu.nestscout', '4'),
    ],
    artifactBytes: { ios: Buffer.from('ios-binary'), android: Buffer.from('android-binary') },
    now,
  }
}

test('binds exact EAS iOS and Android store builds plus downloaded artifact bytes', () => {
  const receipt = buildMobileBinaryAttestation(attestationInput())
  assert.equal(receipt.platforms.ios.buildNumber, 45)
  assert.equal(receipt.platforms.android.buildNumber, 4)
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
    gitCommitHash: 'b'.repeat(40), appBuildVersion: '44', runtimeVersion: '0.1.0',
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

test('a verification release may bind the latest existing store builds and says so', () => {
  const input = { ...olderCommitInput(), relation: 'latest_existing' }
  const receipt = buildMobileBinaryAttestation(input)
  assert.equal(receipt.binaryRelation, 'latest_existing')
  assert.equal(receipt.gitSha, release.gitSha)
  assert.equal(receipt.platforms.ios.gitCommitHash, 'b'.repeat(40))
  assert.equal(receipt.platforms.android.gitCommitHash, 'c'.repeat(40))
  assert.deepEqual(verifyMobileBinaryAttestation(receipt, release), [])
  assert.match(
    verifyMobileBinaryAttestation({ ...receipt, binaryRelation: 'anything_else' }, release).join('; '),
    /relation is invalid/u,
  )
})

test('the exact relation still refuses a build of another commit, and its receipt carries no relation field', () => {
  assert.throws(() => buildMobileBinaryAttestation(olderCommitInput()), /no exact finished EAS ios/u)
  const exact = buildMobileBinaryAttestation(attestationInput())
  assert.equal(Object.hasOwn(exact, 'binaryRelation'), false, 'strict receipts must stay byte-identical to before')
  assert.throws(() => buildMobileBinaryAttestation({ ...attestationInput(), relation: 'newest' }), /unknown mobile binary relation/u)
})

test('the relation cannot be stripped or forged to launder a build of another commit, even with a recomputed checksum', () => {
  const latest = buildMobileBinaryAttestation({ ...olderCommitInput(), relation: 'latest_existing' })
  const stripped = { ...latest }
  delete stripped.binaryRelation
  assert.ok(verifyMobileBinaryAttestation(rehash(stripped), release).includes('mobile ios binary evidence is invalid'),
    'without the relation marker a receipt claims binaries built from the release commit')
  const exact = buildMobileBinaryAttestation(attestationInput())
  const relabelled = rehash({ ...exact, platforms: { ...exact.platforms, ios: { ...exact.platforms.ios, gitCommitHash: 'b'.repeat(40) } } })
  assert.ok(verifyMobileBinaryAttestation(relabelled, release).includes('mobile ios binary evidence is invalid'))
})

test('latest existing selects the newest finished store build per platform and keeps the store build policy', () => {
  const builds = [
    { ...build('IOS', '11111111-1111-4111-8111-111111111111', 'com.phanmanhtu.homeservices', '45'), gitCommitHash: 'b'.repeat(40), completedAt: '2026-08-01T00:00:00.000Z' },
    { ...build('IOS', '44444444-4444-4444-8444-444444444444', 'com.phanmanhtu.homeservices', '45'), gitCommitHash: 'd'.repeat(40), completedAt: '2026-09-01T00:00:00.000Z' },
    build('ANDROID', '22222222-2222-4222-8222-222222222222', 'com.phanmanhtu.nestscout', '4'),
  ]
  assert.equal(selectLatestEasBuilds(release, builds).ios.id, '44444444-4444-4444-8444-444444444444')
  assert.equal(selectExactEasBuilds(release, builds).ios, undefined, 'no iOS build was made from the release commit')
  for (const [field, value] of Object.entries({
    appBuildVersion: '44', runtimeVersion: '0.1.0', applicationIdentifier: 'com.example.other',
    status: 'IN_PROGRESS', distribution: 'INTERNAL', buildProfile: 'preview', appVersion: '0.1.0',
  })) {
    const mutated = builds.map((item) => (item.platform === 'IOS' ? { ...item, [field]: value } : item))
    assert.equal(selectLatestEasBuilds(release, mutated).ios, undefined, field)
  }
})

function productionProviderReadiness() {
  return {
    android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, ios_apns: true, perplexity: true,
    push_receipt_reconciler: true, vietmap: true,
  }
}

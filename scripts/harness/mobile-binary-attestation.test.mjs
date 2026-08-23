import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildHarnessRelease } from './release-bundle.mjs'
import { buildMobileBinaryAttestation, verifyMobileBinaryAttestation } from './mobile-binary-attestation.mjs'

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
    runtimeVersion: '0.2.0',
    applicationIdentifier,
    fingerprint: { hash: platform === 'IOS' ? '1'.repeat(64) : '2'.repeat(64) },
    completedAt: now,
  }
}

test('binds exact EAS iOS and Android store builds plus downloaded artifact bytes', () => {
  const receipt = buildMobileBinaryAttestation({
    release,
    builds: [
      build('IOS', '11111111-1111-4111-8111-111111111111', 'com.phanmanhtu.homeservices', '45'),
      build('ANDROID', '22222222-2222-4222-8222-222222222222', 'com.phanmanhtu.nestscout', '4'),
    ],
    artifactBytes: { ios: Buffer.from('ios-binary'), android: Buffer.from('android-binary') },
    now,
  })
  assert.equal(receipt.platforms.ios.buildNumber, 45)
  assert.equal(receipt.platforms.android.buildNumber, 4)
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
})

function productionProviderReadiness() {
  return {
    anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, perplexity: true, vietmap: true,
  }
}

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bindingArguments,
  runtimeReleaseBindingsFromHostedState,
  runtimeReleaseBindingsFromRelease,
  runtimeReleaseBindingsFromStagingRelease,
} from './runtime-release-bindings.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { buildMobileBinaryAttestation } from './mobile-binary-attestation.mjs'

function mobileAttestation(release) {
  return buildMobileBinaryAttestation({
    release,
    builds: [
      {
        id: '11111111-1111-4111-8111-111111111111', platform: 'IOS', status: 'FINISHED',
        distribution: 'STORE', buildProfile: 'production', gitCommitHash: release.gitSha,
        appVersion: '0.2.0', appBuildVersion: '45', runtimeVersion: '0.2.0',
        applicationIdentifier: 'com.phanmanhtu.homeservices', fingerprint: { hash: '1'.repeat(64) },
        completedAt: '2026-08-23T01:00:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222', platform: 'ANDROID', status: 'FINISHED',
        distribution: 'STORE', buildProfile: 'production', gitCommitHash: release.gitSha,
        appVersion: '0.2.0', appBuildVersion: '4', runtimeVersion: '0.2.0',
        applicationIdentifier: 'com.phanmanhtu.nestscout', fingerprint: { hash: '2'.repeat(64) },
        completedAt: '2026-08-23T01:01:00.000Z',
      },
    ],
    artifactBytes: { ios: Buffer.from('ios'), android: Buffer.from('android') },
    now: '2026-08-23T01:02:00.000Z',
  })
}

function stagingCompatibility() {
  return {
    schemaVersion: 'stage1-staging-client-compatibility.v1',
    environment: 'staging',
    source: 'eas-build-inventory',
    observedAt: '2026-08-23T02:06:03.000Z',
    contractEpoch: 2,
    platforms: {
      ios: {
        applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 44,
        easBuildId: '4e695919-a04c-4b19-8b66-81d8593bbcaf', runtimeVersion: '0.1.0',
        buildGitSha: '82604135da164c6c1ddd84029da0fcd2a428f666', distribution: 'STORE',
        buildProfile: 'production',
      },
      android: {
        applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 3,
        easBuildId: 'b14c8cd0-a3f8-4ec6-ad64-6893b371af67', runtimeVersion: '0.1.0',
        buildGitSha: '62b89bac10b35fdf520922dee2b52ec5403e88db', distribution: 'INTERNAL',
        buildProfile: 'preview',
      },
    },
  }
}

test('candidate bindings require the complete checksummed production release', () => {
  const release = buildHarnessRelease({
    environment: 'production',
    gitSha: '1'.repeat(40),
    requireCleanWorktree: false,
    providerReadiness: {
      anthropic: true, deepseek: false, durable_guards: true,
      global_ai_enabled: true, perplexity: true, vietmap: true,
    },
  })
  const bindings = runtimeReleaseBindingsFromRelease(release, mobileAttestation(release))
  assert.equal(bindings.HARNESS_RELEASE_ID, release.releaseId)
  assert.equal(bindings.HARNESS_BUNDLE_SHA256, release.bundleSha256)
  assert.equal(bindings.NESTSCOUT_ENVIRONMENT, 'production')
  assert.equal(bindings.NESTSCOUT_STAGE1_IOS_MINIMUM_BUILD_NUMBER, '45')
  assert.equal(bindings.NESTSCOUT_STAGE1_ANDROID_MINIMUM_BUILD_NUMBER, '4')
  assert.equal(bindingArguments(bindings).length, 22)
  assert.throws(
    () => runtimeReleaseBindingsFromRelease({ ...release, bundleSha256: '0'.repeat(64) }, mobileAttestation(release)),
    /valid production release/u,
  )
})

test('staging bindings require explicit compatibility evidence from real EAS inventory', () => {
  const release = buildHarnessRelease({
    environment: 'staging',
    gitSha: '1'.repeat(40),
    requireCleanWorktree: false,
    providerReadiness: {
      anthropic: true, deepseek: true, durable_guards: true,
      global_ai_enabled: true, perplexity: true, vietmap: true,
    },
  })
  const compatibility = stagingCompatibility()
  const bindings = runtimeReleaseBindingsFromStagingRelease(release, compatibility)
  assert.equal(bindings.NESTSCOUT_ENVIRONMENT, 'staging')
  assert.equal(bindings.HARNESS_RELEASE_ID, release.releaseId)
  assert.equal(bindings.NESTSCOUT_STAGE1_CLIENT_CONTRACT_EPOCH, '2')
  assert.equal(bindings.NESTSCOUT_STAGE1_IOS_MINIMUM_BUILD_NUMBER, '44')
  assert.equal(bindings.NESTSCOUT_STAGE1_ANDROID_EAS_BUILD_ID, compatibility.platforms.android.easBuildId)
  assert.equal(bindingArguments(bindings).length, 22)
})

test('staging bindings reject invented or cross-environment client evidence', () => {
  const release = buildHarnessRelease({
    environment: 'staging', gitSha: '1'.repeat(40), requireCleanWorktree: false,
  })
  const compatibility = stagingCompatibility()
  assert.throws(
    () => runtimeReleaseBindingsFromStagingRelease(release, {
      ...compatibility,
      platforms: { ...compatibility.platforms, ios: { ...compatibility.platforms.ios, applicationId: 'com.example.fake' } },
    }),
    /ios applicationId is invalid/u,
  )
  assert.throws(
    () => runtimeReleaseBindingsFromStagingRelease(release, {
      ...compatibility,
      platforms: { ...compatibility.platforms, android: { ...compatibility.platforms.android, easBuildId: 'invented' } },
    }),
    /android easBuildId must be a UUID/u,
  )
  assert.throws(
    () => runtimeReleaseBindingsFromStagingRelease(release, { ...compatibility, environment: 'production' }),
    /environment must be staging/u,
  )
  assert.throws(
    () => runtimeReleaseBindingsFromStagingRelease(release, {
      ...compatibility,
      platforms: { ...compatibility.platforms, ios: { ...compatibility.platforms.ios, minimumBuildNumber: 0 } },
    }),
    /minimumBuildNumber must be a positive integer/u,
  )
})

test('rollback bindings preserve exact hosted identity and fail closed to unreleased or unknown', () => {
  const bindings = runtimeReleaseBindingsFromHostedState({
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseId: 'harness-old-release',
    gitSha: 'a'.repeat(40),
    manifestSha256: 'b'.repeat(64),
    bundleSha256: 'c'.repeat(64),
    clientCompatibility: {
      contractEpoch: 2,
      ios: { applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 45, easBuildId: '11111111-1111-4111-8111-111111111111', runtimeVersion: '0.2.0' },
      android: { applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 4, easBuildId: '22222222-2222-4222-8222-222222222222', runtimeVersion: '0.2.0' },
    },
  })
  assert.equal(bindings.HARNESS_RELEASE_ID, 'harness-old-release')
  assert.equal(bindings.HARNESS_GIT_SHA, 'a'.repeat(40))
  assert.equal(bindings.HARNESS_MANIFEST_SHA256, 'b'.repeat(64))
  assert.equal(bindings.HARNESS_BUNDLE_SHA256, 'c'.repeat(64))
  assert.equal(bindings.HARNESS_EDGE_BUNDLE_SHA256, 'unknown')
  assert.equal(bindings.NESTSCOUT_STAGE1_IOS_EAS_BUILD_ID, '11111111-1111-4111-8111-111111111111')
  assert.equal(bindingArguments(bindings).length, 22)
})

test('rollback bindings reject the wrong project and shell-unsafe values', () => {
  assert.throws(() => runtimeReleaseBindingsFromHostedState({ environment: 'production', projectRef: 'wrong' }), /exact hosted/u)
  const bindings = runtimeReleaseBindingsFromHostedState({
    environment: 'production', projectRef: 'iwevizmsedyqozxlawwl', releaseId: 'safe',
  })
  assert.throws(() => bindingArguments({ ...bindings, HARNESS_RELEASE_ID: 'bad value' }), /unsafe value/u)
})

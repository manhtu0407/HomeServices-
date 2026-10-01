import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import {
  bindingArguments,
  assertHostedRuntimeBindingsRestorable,
  runtimeReleaseBindingsFromHostedState,
  runtimeReleaseBindingsFromRelease,
  runtimeReleaseBindingsFromStagingRelease,
} from './runtime-release-bindings.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { buildMobileBinaryAttestation, verifyMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import { compareDeploymentState } from './deployment-drift.mjs'
import { canonicalMigrationEntries } from './migration-history.mjs'

const requireFromMobile = createRequire(new URL('../../apps/mobile/package.json', import.meta.url))
const ts = requireFromMobile('typescript')
const runtimeSource = readFileSync(new URL('../../supabase/functions/_shared/harness/release.ts', import.meta.url), 'utf8')
const runtimeModule = ts.transpileModule(runtimeSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { readHarnessRuntimeRelease, harnessHealthPayload } = await import(
  `data:text/javascript;base64,${Buffer.from(runtimeModule).toString('base64')}`
)

test('Edge health preserves the release manifest provider readiness contract without exposing credentials', () => {
  const readiness = {
    android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, ios_apns: true, perplexity: true,
    push_receipt_reconciler: true, vietmap: true,
  }
  const release = buildHarnessRelease({ environment: 'staging', providerReadiness: readiness })
  const environment = {
    ...runtimeReleaseBindingsFromStagingRelease(release, stagingCompatibility()),
    ANTHROPIC_API_KEY: 'sentinel-provider-secret',
    PERPLEXITY_API_KEY: 'sentinel-provider-secret',
    VIETMAP_API_KEY: 'sentinel-provider-secret',
    KAEL_DURABLE_GUARDS_ENABLED: 'true',
  }
  const runtime = readHarnessRuntimeRelease((name) => environment[name])
  const health = harnessHealthPayload({ environment: { name: 'staging' }, release: runtime })
  assert.deepEqual(health.release.provider_readiness, readiness,
    'hosted Edge must emit all nine manifest fields, including each push readiness flag')
  assert.equal(health.release.provider_readiness_fingerprint_sha256, release.providerReadinessFingerprintSha256)
  assert.equal(health.release.release_lane, null)
  assert.equal(health.status, 'ok')
  assert.doesNotMatch(JSON.stringify(health), /sentinel-provider-secret/u)
  const remoteFixture = {
    ...release,
    projectRef: 'xyylanuyflrjzbjzhqfl',
    migrations: canonicalMigrationEntries(release.migrationInventory),
    providerReadiness: health.release.provider_readiness,
  }
  const report = compareDeploymentState({ release, inventory: release.migrationInventory, remote: remoteFixture })
  assert.deepEqual(report.problems, [], 'runtime health must be consumable by the strict drift verifier')
  const staleReadiness = { ...remoteFixture.providerReadiness, ios_apns: false }
  const staleReport = compareDeploymentState({
    release, inventory: release.migrationInventory,
    remote: { ...remoteFixture, providerReadiness: staleReadiness },
  })
  assert.equal(staleReport.ok, false)
  assert.ok(staleReport.problems.includes('remote provider readiness fingerprint does not bind hosted readiness evidence'))
  assert.ok(staleReport.problems.includes('provider readiness evidence mismatch'))
})

function mobileAttestation(release) {
  const compatibility = release.activeClientCompatibility
  const active = release.releaseLane === 'plan55-production-only'
  return buildMobileBinaryAttestation({
    release,
    builds: [
      {
        id: active ? compatibility.ios.easBuildId : '11111111-1111-4111-8111-111111111111', platform: 'IOS', status: 'FINISHED',
        distribution: 'STORE', buildProfile: 'production', gitCommitHash: active ? '3'.repeat(40) : release.gitSha,
        appVersion: '0.2.0', appBuildVersion: String(active ? compatibility.ios.minimumBuildNumber : 45),
        runtimeVersion: active ? compatibility.ios.runtimeVersion : '0.2.0',
        applicationIdentifier: active ? compatibility.ios.applicationId : 'com.phanmanhtu.homeservices', fingerprint: { hash: '1'.repeat(64) },
        completedAt: '2026-08-23T01:00:00.000Z',
      },
      {
        id: active ? compatibility.android.easBuildId : '22222222-2222-4222-8222-222222222222', platform: 'ANDROID', status: 'FINISHED',
        distribution: 'STORE', buildProfile: 'production', gitCommitHash: active ? '4'.repeat(40) : release.gitSha,
        appVersion: '0.2.0', appBuildVersion: String(active ? compatibility.android.minimumBuildNumber : 4),
        runtimeVersion: active ? compatibility.android.runtimeVersion : '0.2.0',
        applicationIdentifier: active ? compatibility.android.applicationId : 'com.phanmanhtu.nestscout', fingerprint: { hash: '2'.repeat(64) },
        completedAt: '2026-08-23T01:01:00.000Z',
      },
    ],
    artifactBytes: { ios: Buffer.from('ios'), android: Buffer.from('android') },
    now: '2026-08-23T01:02:00.000Z',
    ...(active ? { relation: 'active_production' } : {}),
  })
}

test('Edge push readiness requires explicit flags and stays false for absent or invalid values', () => {
  const flags = {
    android_fcm_v1: 'NESTSCOUT_ANDROID_FCM_V1_READY',
    ios_apns: 'NESTSCOUT_IOS_APNS_READY',
    push_receipt_reconciler: 'NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY',
  }
  for (const [field, variable] of Object.entries(flags)) {
    for (const value of [undefined, '', ' ', 'false', '0', 'off', 'ready', 'sentinel-provider-secret']) {
      const runtime = readHarnessRuntimeRelease((name) => name === variable ? value : undefined)
      assert.equal(runtime.providerReadiness[field], false, `${field} must fail closed for ${String(value)}`)
    }
    for (const value of ['true', '1', 'yes', 'on', ' TRUE ']) {
      const runtime = readHarnessRuntimeRelease((name) => name === variable ? value : undefined)
      for (const other of Object.keys(flags)) {
        assert.equal(runtime.providerReadiness[other], other === field,
          `enabling ${field} must not invent readiness for ${other}`)
      }
    }
  }
})

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

function nativeStagingCompatibility(release) {
  const evidence = stagingCompatibility()
  return {
    ...evidence,
    schemaVersion: 'stage1-staging-native-compatibility.v1',
    source: 'eas-build-and-embedded-artifact',
    projectId: 'c2fd8ae7-a6fa-4b6e-a9a0-df85b52ac94b',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    sourceBundleSha256: release.sourceBundleSha256,
    platforms: Object.fromEntries(Object.entries(evidence.platforms).map(([platform, value]) => [platform, {
      ...value,
      status: 'FINISHED',
      distribution: 'INTERNAL',
      buildProfile: 'native-proof-staging',
      buildGitSha: release.gitSha,
      completedAt: evidence.observedAt,
      artifactSha256: 'a'.repeat(64),
      embedded: {
        applicationId: value.applicationId,
        buildNumber: value.minimumBuildNumber,
        easBuildId: value.easBuildId,
        runtimeVersion: value.runtimeVersion,
        contractEpoch: '2',
        gitSha: release.gitSha,
        releaseId: release.releaseId,
        buildProfile: 'native-proof-staging',
        supabaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
        apiBaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
      },
    }])),
  }
}

test('staging native builds bind only with matching release and embedded artifact identity', () => {
  const release = buildHarnessRelease({ environment: 'staging' })
  const evidence = nativeStagingCompatibility(release)
  const bindings = runtimeReleaseBindingsFromStagingRelease(release, evidence)
  assert.equal(bindings.NESTSCOUT_STAGE1_IOS_EAS_BUILD_ID, evidence.platforms.ios.easBuildId)
  assert.equal(bindings.NESTSCOUT_STAGE1_ANDROID_EAS_BUILD_ID, evidence.platforms.android.easBuildId)
  assert.equal(bindings.HARNESS_SOURCE_BUNDLE_SHA256, release.sourceBundleSha256)
  assert.equal(bindingArguments(bindings).length, 25)
})

test('native staging evidence rejects unfinished, stale, mixed-target and incomplete artifacts', () => {
  const release = buildHarnessRelease({ environment: 'staging' })
  const original = nativeStagingCompatibility(release)
  const reject = (mutate, label) => {
    const evidence = structuredClone(original)
    mutate(evidence)
    assert.throws(() => runtimeReleaseBindingsFromStagingRelease(release, evidence),
      /valid staging release and client compatibility evidence/u, label)
  }
  for (const [field, value] of Object.entries({
    environment: 'production', projectId: 'other-project', source: 'eas-build-inventory',
    releaseId: 'harness-other', gitSha: '0'.repeat(40), sourceBundleSha256: '0'.repeat(64),
    contractEpoch: 1, observedAt: 'invalid',
  })) reject((evidence) => { evidence[field] = value }, `root ${field}`)
  for (const platform of ['ios', 'android']) {
    reject((evidence) => { delete evidence.platforms[platform] }, `${platform} missing`)
    for (const [field, value] of Object.entries({
      status: 'IN_PROGRESS', artifactSha256: '', buildGitSha: '0'.repeat(40),
      completedAt: '2999-01-01T00:00:00.000Z', distribution: 'STORE',
      buildProfile: 'native-proof-production',
    })) reject((evidence) => { evidence.platforms[platform][field] = value }, `${platform} ${field}`)
    for (const field of Object.keys(original.platforms[platform].embedded)) {
      reject((evidence) => { delete evidence.platforms[platform].embedded[field] }, `${platform} missing embedded ${field}`)
    }
    reject((evidence) => {
      evidence.platforms[platform].embedded.supabaseUrl = 'https://iwevizmsedyqozxlawwl.supabase.co'
    }, `${platform} production auth host`)
    reject((evidence) => {
      evidence.platforms[platform].embedded.apiBaseUrl = 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api'
    }, `${platform} production API host`)
  }
  assert.throws(() => runtimeReleaseBindingsFromRelease(release, original), /valid production release/u,
    'native staging evidence must never satisfy the production store-binary gate')
  assert.ok(verifyMobileBinaryAttestation(original, release).includes('mobile binary attestation identity is invalid'),
    'the production binary verifier itself must reject the native receipt class')
})

test('candidate bindings require the complete checksummed production release', () => {
  const release = buildHarnessRelease({
    environment: 'production',
    gitSha: '1'.repeat(40),
    requireCleanWorktree: false,
    providerReadiness: {
      android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
      global_ai_enabled: true, ios_apns: true, perplexity: true,
      push_receipt_reconciler: true, vietmap: true,
    },
  })
  const bindings = runtimeReleaseBindingsFromRelease(release, mobileAttestation(release))
  assert.equal(bindings.HARNESS_RELEASE_ID, release.releaseId)
  assert.equal(bindings.HARNESS_BUNDLE_SHA256, release.bundleSha256)
  assert.equal(bindings.NESTSCOUT_ENVIRONMENT, 'production')
  assert.equal(bindings.NESTSCOUT_STAGE1_IOS_MINIMUM_BUILD_NUMBER, '45')
  assert.equal(bindings.NESTSCOUT_STAGE1_ANDROID_MINIMUM_BUILD_NUMBER, '4')
  assert.equal(bindingArguments(bindings).length, 25)
  assert.equal(bindings.NESTSCOUT_IOS_APNS_READY, 'true')
  assert.equal(bindings.NESTSCOUT_ANDROID_FCM_V1_READY, 'true')
  assert.equal(bindings.NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY, 'true')
  assert.throws(
    () => runtimeReleaseBindingsFromRelease({ ...release, bundleSha256: '0'.repeat(64) }, mobileAttestation(release)),
    /valid production release/u,
  )
})

test('Plan 55 release lane is bound through runtime health and cannot be set in Staging', () => {
  const policy = JSON.parse(readFileSync(new URL('../../config/harness/plan55-production-only-policy.json', import.meta.url), 'utf8'))
  const inventory = JSON.parse(readFileSync(new URL('../../config/harness/migration-inventory.json', import.meta.url), 'utf8'))
  const hostedBeforeBytes = Buffer.from(`${JSON.stringify({
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: policy.productionSourceBase.releaseId,
    gitSha: policy.productionSourceBase.sha,
    releaseLane: 'verification',
    clientCompatibility: {
      gitSha: policy.productionSourceBase.sha,
      releaseId: policy.productionSourceBase.releaseId,
      contractEpoch: 2,
      ios: {
        applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 45,
        easBuildId: '11111111-1111-4111-8111-111111111111', runtimeVersion: '0.2.0',
      },
      android: {
        applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 4,
        easBuildId: '22222222-2222-4222-8222-222222222222', runtimeVersion: '0.2.0',
      },
    },
    migrations: inventory.entries.slice(0, 3).map(({ version, name }) => ({ version, name })),
  }, null, 2)}\n`)
  const release = buildHarnessRelease({
    environment: 'production',
    lane: 'plan55-production-only',
    gitSha: '2'.repeat(40),
    requireCleanWorktree: false,
    hostedBeforeBytes,
    providerReadiness: {
      android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
      global_ai_enabled: true, ios_apns: true, perplexity: true,
      push_receipt_reconciler: true, vietmap: true,
    },
  })
  const bindings = runtimeReleaseBindingsFromRelease(release, mobileAttestation(release))
  assert.equal(bindings.HARNESS_RELEASE_LANE, 'plan55-production-only')
  assert.equal(bindings.HARNESS_CLIENT_COMPAT_GIT_SHA, '891b1e26dd9a785f05671002c5e74cb270678be4')
  assert.equal(bindings.HARNESS_CLIENT_COMPAT_RELEASE_ID, 'harness-891b1e26dd9a-8c7eb92a4783')
  assert.equal(bindingArguments(bindings).length, 28)
  assert.throws(() => runtimeReleaseBindingsFromHostedState({
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseLane: 'forged',
  }), /invalid release lane/u)
})

test('staging bindings require explicit compatibility evidence from real EAS inventory', () => {
  const release = buildHarnessRelease({
    environment: 'staging',
    gitSha: '1'.repeat(40),
    requireCleanWorktree: false,
    providerReadiness: {
      android_fcm_v1: true, anthropic: true, deepseek: true, durable_guards: true,
      global_ai_enabled: true, ios_apns: true, perplexity: true,
      push_receipt_reconciler: true, vietmap: true,
    },
  })
  const compatibility = stagingCompatibility()
  const bindings = runtimeReleaseBindingsFromStagingRelease(release, compatibility)
  assert.equal(bindings.NESTSCOUT_ENVIRONMENT, 'staging')
  assert.equal(bindings.HARNESS_RELEASE_ID, release.releaseId)
  assert.equal(bindings.NESTSCOUT_STAGE1_CLIENT_CONTRACT_EPOCH, '2')
  assert.equal(bindings.NESTSCOUT_STAGE1_IOS_MINIMUM_BUILD_NUMBER, '44')
  assert.equal(bindings.NESTSCOUT_STAGE1_ANDROID_EAS_BUILD_ID, compatibility.platforms.android.easBuildId)
  assert.equal(bindingArguments(bindings).length, 25)
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
  assert.equal(bindingArguments(bindings).length, 25)
  assert.equal(bindings.NESTSCOUT_IOS_APNS_READY, 'false')
  assert.equal(bindings.NESTSCOUT_ANDROID_FCM_V1_READY, 'false')
  assert.equal(bindings.NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY, 'false')
})

test('rollback restores each observed push capability instead of inheriting candidate flags', () => {
  const bindings = runtimeReleaseBindingsFromHostedState({
    environment: 'production', projectRef: 'iwevizmsedyqozxlawwl',
    providerReadiness: { ios_apns: true, android_fcm_v1: false, push_receipt_reconciler: 'true' },
  })
  assert.equal(bindings.NESTSCOUT_IOS_APNS_READY, 'true')
  assert.equal(bindings.NESTSCOUT_ANDROID_FCM_V1_READY, 'false')
  assert.equal(bindings.NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY, 'false')
})

test('rollback bindings reject the wrong project and shell-unsafe values', () => {
  assert.throws(() => runtimeReleaseBindingsFromHostedState({ environment: 'production', projectRef: 'wrong' }), /exact hosted/u)
  const bindings = runtimeReleaseBindingsFromHostedState({
    environment: 'production', projectRef: 'iwevizmsedyqozxlawwl', releaseId: 'safe',
  })
  assert.throws(() => bindingArguments({ ...bindings, HARNESS_RELEASE_ID: 'bad value' }), /unsafe value/u)
})

test('rollback preflight accepts only a complete exact hosted Production binding snapshot', () => {
  const hosted = {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseId: 'harness-old-release',
    gitSha: 'a'.repeat(40),
    releaseLane: null,
    manifestSha256: 'b'.repeat(64),
    bundleSha256: 'c'.repeat(64),
    sourceBundleSha256: 'd'.repeat(64),
    mobileBuildFingerprintSha256: 'e'.repeat(64),
    productionUiSourceSha256: 'f'.repeat(64),
    edgeBundleSha256: '1'.repeat(64),
    migrationInventorySha256: '2'.repeat(64),
    serviceIntakePolicyBundleSha256: '3'.repeat(64),
    priceEvidenceBundleSha256: '4'.repeat(64),
    providerReadinessFingerprintSha256: '5'.repeat(64),
    providerReadiness: {
      android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
      global_ai_enabled: true, ios_apns: false, perplexity: true,
      push_receipt_reconciler: false, vietmap: true,
    },
    clientCompatibility: {
      contractEpoch: 2,
      ios: { applicationId: 'com.example.ios', minimumBuildNumber: 45,
        easBuildId: '11111111-1111-4111-8111-111111111111', runtimeVersion: '1.2.3' },
      android: { applicationId: 'com.example.android', minimumBuildNumber: 12,
        easBuildId: '22222222-2222-4222-8222-222222222222', runtimeVersion: '4.5.6' },
    },
  }
  const result = assertHostedRuntimeBindingsRestorable(hosted)
  assert.equal(result.bindingCount, 25)
  assert.equal(result.bindings.HARNESS_RELEASE_ID, hosted.releaseId)
  assert.equal(result.bindings.HARNESS_GIT_SHA, hosted.gitSha)
  assert.throws(() => assertHostedRuntimeBindingsRestorable({ ...hosted, edgeBundleSha256: null }),
    /exact hosted release metadata/u)
  assert.throws(() => assertHostedRuntimeBindingsRestorable({
    ...hosted,
    clientCompatibility: { ...hosted.clientCompatibility, android: undefined },
  }), /complete hosted client compatibility/u)
})

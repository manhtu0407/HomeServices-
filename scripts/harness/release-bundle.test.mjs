import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { assertCleanReleaseWorktree, buildHarnessRelease, checkHarnessRelease, edgeFunctionBundles, resolveReleaseArtifactPath } from './release-bundle.mjs'

test('builds a deterministic immutable release bundle', () => {
  const input = { environment: 'preview', gitSha: 'a'.repeat(40) }
  const first = buildHarnessRelease(input)
  const second = buildHarnessRelease(input)
  assert.deepEqual(first, second)
  assert.match(first.releaseId, /^harness-a{12}-[0-9a-f]{12}$/)
  assert.equal(first.environmentBinding.providerConfigurationClass, 'preview-isolated')
  assert.equal(first.migrationInventory.migrationCount, first.migrationInventory.entries.length)
  for (const field of [
    'sourceBundleSha256',
    'mobileBuildFingerprintSha256',
    'productionUiSourceSha256',
    'edgeBundleSha256',
    'serviceIntakePolicyBundleSha256',
    'priceEvidenceBundleSha256',
    'providerReadinessFingerprintSha256',
  ]) assert.match(first[field], /^[0-9a-f]{64}$/)
  assert.equal(first.migrationWatermark, first.migrationInventory.entries.at(-1).version)
  assert.deepEqual(checkHarnessRelease(first), [])
})

test('detects release bundle tampering', () => {
  const release = buildHarnessRelease({ environment: 'staging', gitSha: 'b'.repeat(40) })
  release.policyBundleSha256 = '0'.repeat(64)
  assert.ok(checkHarnessRelease(release).includes('release bundle checksum mismatch'))
})

test('binds the deterministic release ID to its immutable contents', () => {
  const release = buildHarnessRelease({ environment: 'staging', gitSha: 'c'.repeat(40) })
  release.releaseId = 'harness-cccccccccccc-000000000000'
  assert.ok(checkHarnessRelease(release).includes('release ID does not bind release contents'))
})

test('rejects a manifest that omits release-integrity fingerprints', () => {
  const release = buildHarnessRelease({ environment: 'staging', gitSha: 'd'.repeat(40) })
  delete release.sourceBundleSha256
  const problems = checkHarnessRelease(release)
  assert.ok(problems.includes('sourceBundleSha256 is invalid'))
})

test('fails a Production release when either native push provider or the receipt reconciler is unproven', () => {
  const providerReadiness = {
    android_fcm_v1: true,
    anthropic: true,
    deepseek: false,
    durable_guards: true,
    global_ai_enabled: true,
    ios_apns: false,
    perplexity: true,
    push_receipt_reconciler: true,
    vietmap: true,
  }
  const release = buildHarnessRelease({
    environment: 'production',
    gitSha: 'e'.repeat(40),
    providerReadiness,
    requireCleanWorktree: false,
  })
  assert.ok(checkHarnessRelease(release).includes('production provider readiness is incomplete'))
})

const readyProviders = Object.freeze({
  android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
  global_ai_enabled: true, ios_apns: true, perplexity: true, push_receipt_reconciler: true, vietmap: true,
})
const plan55ActiveClientCompatibility = Object.freeze({
  gitSha: '645c907e178f21ddde24a72501e6c8449d6720f9',
  releaseId: 'harness-645c907e178f-f426155f83de',
  contractEpoch: 2,
  ios: Object.freeze({
    applicationId: 'com.phanmanhtu.homeservices',
    minimumBuildNumber: 45,
    easBuildId: '11111111-1111-4111-8111-111111111111',
    runtimeVersion: '0.2.0',
  }),
  android: Object.freeze({
    applicationId: 'com.phanmanhtu.nestscout',
    minimumBuildNumber: 4,
    easBuildId: '22222222-2222-4222-8222-222222222222',
    runtimeVersion: '0.2.0',
  }),
})
const pushUnready = Object.freeze({
  ...readyProviders, android_fcm_v1: false, ios_apns: false, push_receipt_reconciler: false,
})

function hostedBeforeBytes(root = resolve('.')) {
  const policy = JSON.parse(readFileSync(resolve(root, 'config/harness/plan55-production-only-policy.json'), 'utf8'))
  const inventory = JSON.parse(readFileSync(resolve(root, 'config/harness/migration-inventory.json'), 'utf8'))
  return Buffer.from(`${JSON.stringify({
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: policy.productionSourceBase.releaseId,
    gitSha: policy.productionSourceBase.sha,
    releaseLane: 'verification',
    clientCompatibility: plan55ActiveClientCompatibility,
    migrations: inventory.entries.slice(0, 3).map(({ version, name }) => ({ version, name })),
  }, null, 2)}\n`)
}

const builds = new Map()
function productionRelease(providerReadiness, lane) {
  const key = JSON.stringify([providerReadiness, lane])
  if (!builds.has(key)) {
    builds.set(key, buildHarnessRelease({
      environment: 'production', gitSha: 'f'.repeat(40), providerReadiness, requireCleanWorktree: false, lane,
      ...(lane === 'plan55-production-only' ? { hostedBeforeBytes: hostedBeforeBytes() } : {}),
    }))
  }
  return builds.get(key)
}

// Swaps the provider evidence and re-binds its fingerprint so only the readiness rule is exercised.
function withProviders(release, providerReadiness) {
  const canonical = JSON.stringify(Object.fromEntries(Object.keys(providerReadiness).sort().map((key) => [key, providerReadiness[key]])))
  return { ...release, providerReadiness, providerReadinessFingerprintSha256: createHash('sha256').update(canonical).digest('hex') }
}

test('a verification release records unready push honestly and stays valid; a strict one does not', () => {
  const verification = productionRelease(pushUnready, 'verification')
  assert.equal(verification.releaseLane, 'verification')
  assert.deepEqual(verification.providerReadiness, pushUnready, 'the manifest must not claim push readiness it lacks')
  assert.deepEqual(checkHarnessRelease(verification), [])
  assert.ok(checkHarnessRelease(productionRelease(pushUnready)).includes('production provider readiness is incomplete'))
})

test('the verification lane relaxes only the three push flags', () => {
  const verification = productionRelease(pushUnready, 'verification')
  for (const name of ['anthropic', 'durable_guards', 'global_ai_enabled', 'perplexity', 'vietmap']) {
    const problems = checkHarnessRelease(withProviders(verification, { ...pushUnready, [name]: false }))
    assert.ok(problems.includes('production provider readiness is incomplete'), name)
  }
  const optional = checkHarnessRelease(withProviders(verification, { ...pushUnready, deepseek: true }))
  assert.equal(optional.includes('production provider readiness is incomplete'), false, 'deepseek is optional in both lanes')
})

test('the lane is part of the release identity and a strict release carries no lane field', () => {
  const strict = productionRelease(readyProviders)
  const verification = productionRelease(readyProviders, 'verification')
  assert.equal(Object.hasOwn(strict, 'releaseLane'), false, 'strict manifests must stay byte-identical to before')
  assert.notEqual(strict.releaseId, verification.releaseId)
  assert.notEqual(strict.bundleSha256, verification.bundleSha256)
})

test('Plan 55 Production-only release lane replaces only the Staging dependency with explicit pre-canary gates', () => {
  const plan55 = productionRelease(readyProviders, 'plan55-production-only')
  assert.equal(plan55.environment, 'production')
  assert.equal(plan55.releaseLane, 'plan55-production-only')
  assert.ok(plan55.verificationRequirements.includes('plan55-production-source-merge'))
  assert.ok(plan55.verificationRequirements.includes('plan55-exact-production-base-ancestry'))
  assert.ok(!plan55.verificationRequirements.includes('main-branch-merge'))
  assert.ok(plan55.verificationRequirements.includes('plan55-actor-scoped-guard-tests'))
  assert.ok(plan55.verificationRequirements.includes('plan55-canary-runner-tests'))
  assert.ok(plan55.verificationRequirements.includes('plan55-independent-holdout-freeze'))
  assert.ok(!plan55.verificationRequirements.includes('staging-migration-match'))
  assert.deepEqual(plan55.activeClientCompatibility, plan55ActiveClientCompatibility)
  assert.deepEqual(checkHarnessRelease(plan55), [])
  assert.ok(checkHarnessRelease({ ...plan55, activeClientCompatibility: { ...plan55ActiveClientCompatibility, gitSha: '0'.repeat(40) } })
    .includes('Plan 55 release does not preserve the exact active Production client identity'))
  const missingGuardGate = {
    ...plan55,
    verificationRequirements: plan55.verificationRequirements.filter((gate) => gate !== 'plan55-actor-scoped-guard-tests'),
  }
  assert.ok(checkHarnessRelease(missingGuardGate).includes('release verification requirements do not match the selected lane'))
  const missingBaseGate = {
    ...plan55,
    verificationRequirements: plan55.verificationRequirements.filter((gate) => gate !== 'plan55-exact-production-base-ancestry'),
  }
  assert.ok(checkHarnessRelease(missingBaseGate).includes('release verification requirements do not match the selected lane'))
})

test('Plan 55 release derives active client identity only from the exact hosted-before snapshot', () => {
  const base = {
    environment: 'production',
    gitSha: 'f'.repeat(40),
    providerReadiness: readyProviders,
    requireCleanWorktree: false,
    lane: 'plan55-production-only',
  }
  assert.throws(() => buildHarnessRelease(base), /requires a hosted-before snapshot/u)
  assert.throws(() => buildHarnessRelease({
    ...base, activeClientCompatibility: plan55ActiveClientCompatibility, hostedBeforeBytes: hostedBeforeBytes(),
  }),
    /derived from hosted-before/u)
  const exactHostedBefore = hostedBeforeBytes()
  const forgedHostedState = JSON.parse(hostedBeforeBytes().toString('utf8'))
  forgedHostedState.clientCompatibility = {
    ...forgedHostedState.clientCompatibility,
    ios: { ...forgedHostedState.clientCompatibility.ios, easBuildId: '33333333-3333-4333-8333-333333333333' },
  }
  const forgedSnapshotRelease = buildHarnessRelease({
    ...base,
    hostedBeforeBytes: Buffer.from(`${JSON.stringify(forgedHostedState, null, 2)}\n`),
  })
  assert.ok(checkHarnessRelease(forgedSnapshotRelease, { hostedBeforeBytes: exactHostedBefore })
    .includes('Plan 55 hosted-before bytes do not match the release snapshot'))
})

test('Plan 55 release generation requires an exact hosted-before snapshot and binds its applied inventory', () => {
  const base = {
    environment: 'production',
    gitSha: 'f'.repeat(40),
    providerReadiness: readyProviders,
    requireCleanWorktree: false,
    lane: 'plan55-production-only',
  }
  assert.throws(() => buildHarnessRelease(base), /requires a hosted-before snapshot/u)
  const release = buildHarnessRelease({ ...base, hostedBeforeBytes: hostedBeforeBytes() })
  assert.equal(release.plan55AppliedMigrationSnapshot.appliedMigrationCount, 3)
  assert.equal(release.migrationInventory.migrationCount, 3)
  assert.match(release.plan55AppliedMigrationSnapshot.hostedStateSha256, /^[0-9a-f]{64}$/u)
  assert.deepEqual(checkHarnessRelease(release), [])
  const exactHostedBefore = hostedBeforeBytes()
  assert.deepEqual(checkHarnessRelease(release, { hostedBeforeBytes: exactHostedBefore }), [])
  const alteredHostedState = JSON.parse(exactHostedBefore.toString('utf8'))
  alteredHostedState.clientCompatibility.ios.easBuildId = '33333333-3333-4333-8333-333333333333'
  assert.ok(checkHarnessRelease(release, {
    hostedBeforeBytes: Buffer.from(`${JSON.stringify(alteredHostedState, null, 2)}\n`),
  }).includes('Plan 55 hosted-before bytes do not match the release snapshot'))
  assert.ok(checkHarnessRelease({
    ...release,
    plan55AppliedMigrationSnapshot: {
      ...release.plan55AppliedMigrationSnapshot,
      sourceGitSha: '0'.repeat(40),
    },
  }).includes('Plan 55 applied migration snapshot is not tied to the policy Production base'))
})

test('a lane cannot be forged onto a strict release or applied outside production', () => {
  const problems = checkHarnessRelease({ ...productionRelease(pushUnready), releaseLane: 'verification' })
  assert.ok(problems.includes('release ID does not bind release contents'), 'editing the lane must break the ID')
  assert.ok(problems.includes('release bundle checksum mismatch'))
  const verification = productionRelease(readyProviders, 'verification')
  assert.ok(checkHarnessRelease({ ...verification, releaseLane: 'strict' }).includes('release lane is invalid'))
  assert.ok(checkHarnessRelease({ ...verification, environment: 'staging' }).includes('release lane is invalid'))
  assert.throws(() => buildHarnessRelease({ environment: 'production', gitSha: 'a'.repeat(40), lane: 'strict', requireCleanWorktree: false }), /invalid release lane/u)
  assert.throws(
    () => buildHarnessRelease({ environment: 'preview', gitSha: 'a'.repeat(40), lane: 'verification' }),
    /only for production/u,
  )
})

test('keeps release artifacts inside the repository root', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-release-path-'))
  try {
    assert.equal(
      resolveReleaseArtifactPath(root, 'artifacts/harness/release-manifest.json'),
      resolve(root, 'artifacts/harness/release-manifest.json'),
    )
    assert.throws(() => resolveReleaseArtifactPath(root, '../outside.json'), /escapes repository root/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses a production release from a dirty Git worktree', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-release-clean-worktree-'))
  try {
    runGit(root, ['init', '--quiet'])
    runGit(root, ['config', 'user.email', 'harness@example.test'])
    runGit(root, ['config', 'user.name', 'Harness Test'])
    write(root, 'tracked.txt', 'baseline\n')
    runGit(root, ['add', 'tracked.txt'])
    runGit(root, ['commit', '--quiet', '-m', 'baseline'])

    assert.doesNotThrow(() => assertCleanReleaseWorktree(root))

    write(root, 'untracked.txt', 'dirty\n')
    assert.throws(() => assertCleanReleaseWorktree(root), /clean Git worktree/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Edge source digests and runtime configuration identities are separated', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-release-edge-'))
  try {
    write(root, 'supabase/config.toml', '[project]\nid = "fixture"\n')
    write(root, 'supabase/functions/mobile-api/deno.json', '{"imports":{}}\n')
    write(root, 'supabase/functions/mobile-api/deno.lock', '{"version":"4"}\n')
    write(root, 'supabase/functions/mobile-api/index.ts', 'import { answer } from "./_shared/answer.ts"\nconsole.log(answer)\n')
    write(root, 'supabase/functions/mobile-api/_shared/answer.ts', 'export { answer } from "../../_shared/value.ts"\n')
    write(root, 'supabase/functions/_shared/value.ts', 'export const answer = 42\n')
    write(root, 'supabase/functions/_shared/type-only.ts', 'export type RuntimeReceipt = { id: string }\n')
    write(root, 'supabase/functions/mobile-api/_shared/type-wrapper.ts', 'export * from "../../_shared/type-only.ts"\n')
    write(root, 'supabase/functions/mobile-api/_shared/unused-runtime.ts', 'export const neverDeployed = true\n')
    write(root, 'supabase/functions/mobile-api/index.ts', [
      'import { answer } from "./_shared/answer.ts"',
      'import type { RuntimeReceipt } from "../_shared/type-only.ts"',
      'import type { neverDeployed } from "./_shared/unused-runtime.ts"',
      'export * from "./_shared/type-wrapper.ts"',
      'const receipt: RuntimeReceipt = { id: String(answer) }',
      'console.log(receipt)',
      '',
    ].join('\n'))
    write(root, 'docs/unrelated.md', 'one\n')

    const first = edgeFunctionBundles(root, ['mobile-api'])
    assert.deepEqual(first.inputs['mobile-api'], [
      'supabase/functions/_shared/value.ts',
      'supabase/functions/mobile-api/_shared/answer.ts',
      'supabase/functions/mobile-api/index.ts',
    ])
    assert.ok(!first.inputs['mobile-api'].some((path) => path.includes('type-only') || path.includes('type-wrapper')))
    assert.ok(!first.inputs['mobile-api'].some((path) => path.includes('unused-runtime')))
    assert.deepEqual(first.runtimeConfigurations['mobile-api'].inputs, [
      'supabase/config.toml',
      'supabase/functions/mobile-api/deno.json',
      'supabase/functions/mobile-api/deno.lock',
    ])

    write(root, 'supabase/functions/_shared/value.ts', 'export const answer = 43\n')
    const transitiveChanged = edgeFunctionBundles(root, ['mobile-api'])
    assert.notEqual(transitiveChanged.digests['mobile-api'], first.digests['mobile-api'])

    write(root, 'supabase/functions/_shared/value.ts', 'export const answer = 42\n')
    write(root, 'supabase/config.toml', '[project]\nid = "changed"\n')
    const configChanged = edgeFunctionBundles(root, ['mobile-api'])
    assert.equal(configChanged.digests['mobile-api'], first.digests['mobile-api'])
    assert.notEqual(
      configChanged.runtimeConfigurations['mobile-api'].sha256,
      first.runtimeConfigurations['mobile-api'].sha256,
    )

    write(root, 'supabase/config.toml', '[project]\nid = "fixture"\n')
    write(root, 'docs/unrelated.md', 'two\n')
    const unrelatedChanged = edgeFunctionBundles(root, ['mobile-api'])
    assert.equal(unrelatedChanged.digests['mobile-api'], first.digests['mobile-api'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function write(root, path, content) {
  const absolute = resolve(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
}

function runGit(root, args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

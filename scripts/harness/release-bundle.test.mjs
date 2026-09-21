import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
const pushUnready = Object.freeze({
  ...readyProviders, android_fcm_v1: false, ios_apns: false, push_receipt_reconciler: false,
})

const builds = new Map()
function productionRelease(providerReadiness, lane) {
  const key = JSON.stringify([providerReadiness, lane])
  if (!builds.has(key)) {
    builds.set(key, buildHarnessRelease({
      environment: 'production', gitSha: 'f'.repeat(40), providerReadiness, requireCleanWorktree: false, lane,
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

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { buildHarnessRelease, checkHarnessRelease, edgeFunctionBundles, resolveReleaseArtifactPath } from './release-bundle.mjs'

test('builds a deterministic immutable release bundle', () => {
  const input = { environment: 'preview', gitSha: 'a'.repeat(40) }
  const first = buildHarnessRelease(input)
  const second = buildHarnessRelease(input)
  assert.deepEqual(first, second)
  assert.match(first.releaseId, /^harness-a{12}-[0-9a-f]{12}$/)
  assert.equal(first.environmentBinding.providerConfigurationClass, 'preview-isolated')
  assert.equal(first.migrationInventory.migrationCount, first.migrationInventory.entries.length)
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

test('Edge digests include transitive imports and runtime configuration but ignore unrelated files', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-release-edge-'))
  try {
    write(root, 'supabase/config.toml', '[project]\nid = "fixture"\n')
    write(root, 'supabase/functions/mobile-api/deno.json', '{"imports":{}}\n')
    write(root, 'supabase/functions/mobile-api/deno.lock', '{"version":"4"}\n')
    write(root, 'supabase/functions/mobile-api/index.ts', 'import { answer } from "./_shared/answer.ts"\nconsole.log(answer)\n')
    write(root, 'supabase/functions/mobile-api/_shared/answer.ts', 'export { answer } from "../../_shared/value.ts"\n')
    write(root, 'supabase/functions/_shared/value.ts', 'export const answer = 42\n')
    write(root, 'docs/unrelated.md', 'one\n')

    const first = edgeFunctionBundles(root)
    assert.deepEqual(first.inputs['mobile-api'], [
      'supabase/config.toml',
      'supabase/functions/_shared/value.ts',
      'supabase/functions/mobile-api/_shared/answer.ts',
      'supabase/functions/mobile-api/deno.json',
      'supabase/functions/mobile-api/deno.lock',
      'supabase/functions/mobile-api/index.ts',
    ])

    write(root, 'supabase/functions/_shared/value.ts', 'export const answer = 43\n')
    const transitiveChanged = edgeFunctionBundles(root)
    assert.notEqual(transitiveChanged.digests['mobile-api'], first.digests['mobile-api'])

    write(root, 'supabase/functions/_shared/value.ts', 'export const answer = 42\n')
    write(root, 'supabase/config.toml', '[project]\nid = "changed"\n')
    const configChanged = edgeFunctionBundles(root)
    assert.notEqual(configChanged.digests['mobile-api'], first.digests['mobile-api'])

    write(root, 'supabase/config.toml', '[project]\nid = "fixture"\n')
    write(root, 'docs/unrelated.md', 'two\n')
    const unrelatedChanged = edgeFunctionBundles(root)
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

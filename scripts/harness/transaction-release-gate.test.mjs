// Workflow wiring regression: product behavior is proven by the referenced runner reports,
// not these source assertions. Neither this test nor a catalog pass authorizes deployment.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildHarnessRelease } from './release-bundle.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

test('whole-workspace CI uses the same native-WebSocket-capable Node major as the release tests', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
    .replace(/\r\n/gu, '\n')
  const workspaceJob = workflow.split('  workspace:\n')[1].split('\n  database:')[0]
  const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release-production.yml'), 'utf8')
  const major = Number(workspaceJob.match(/node-version: (\d+)/u)?.[1])
  assert.equal(major, Number(releaseWorkflow.match(/node-version: (\d+)/u)?.[1]))
  assert.ok(major >= 22, 'the real Supabase Storage fixture must initialize without the Node 20 Realtime error')
})

function identityScript(workflow) {
  return workflow.replace(/\r\n/gu, '\n').split('        run: |')[1].split('\n\n  build_ios:')[0]
    .split('\n').slice(1).map((line) => line.replace(/^          /u, '')).join('\n')
}

test('native builds use the verified checkout branch instead of a stale project environment label', () => {
  const workflow = readFileSync(resolve(root, 'apps/mobile/.eas/workflows/native-account-release-proof.yml'), 'utf8')
    .replace(/\r\n/gu, '\n')
  const release = buildHarnessRelease({ environment: 'preview' })
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const bash = process.platform === 'win32'
    ? resolve(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
    : 'bash'
  const result = spawnSync(bash, ['-c', 'set-output() { printf "%s=%s\\n" "$1" "$2"; }\n' + identityScript(workflow)], {
    cwd: root,
    encoding: 'utf8',
    timeout: 45_000,
    env: {
      ...process.env,
      EXPECTED_GIT_SHA: release.gitSha,
      RELEASE_ID: release.releaseId,
      SOURCE_BUNDLE_SHA256: release.sourceBundleSha256,
      TARGET_ENVIRONMENT: 'staging',
      NESTSCOUT_BUILD_GIT_BRANCH: 'stale-project-branch',
    },
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.stdout.split(/\r?\n/u).includes(`git_branch=${branch}`),
    'identity must publish the actual Git checkout branch, not the project environment label')
  assert.ok(workflow.includes('      git_branch: ${{ steps.identity.outputs.git_branch }}'),
    'prepare_identity must expose the shell branch output to dependent build jobs')
  for (const platform of ['ios', 'android']) {
    const job = workflow.split(`  build_${platform}:\n`)[1].split(/\n  [a-z_]+:/u)[0]
    assert.ok(job.includes('      NESTSCOUT_BUILD_GIT_BRANCH: ${{ needs.prepare_identity.outputs.git_branch }}'),
      `${platform} must override stale project branch metadata with the verified job output`)
  }
})

test('native identity inputs are bound in the dispatched job environment', () => {
  const workflow = readFileSync(resolve(root, 'apps/mobile/.eas/workflows/native-account-release-proof.yml'), 'utf8')
    .replace(/\r\n/gu, '\n')
  const prepareJob = workflow.split('  prepare_identity:\n')[1].split('\n    steps:')[0]
  for (const [variable, input] of [
    ['EXPECTED_GIT_SHA', 'expected_git_sha'],
    ['RELEASE_ID', 'release_id'],
    ['SOURCE_BUNDLE_SHA256', 'source_bundle_sha256'],
    ['TARGET_ENVIRONMENT', 'target_environment'],
  ]) {
    assert.ok(prepareJob.includes('      ' + variable + ': ${{ inputs.' + input + ' }}'),
      `${variable} must be bound before the custom job is dispatched, not only in a step environment`)
  }
})

test('native identity rejection reports its failed gate without dumping environment values', () => {
  const workflow = readFileSync(resolve(root, 'apps/mobile/.eas/workflows/native-account-release-proof.yml'), 'utf8')
  const script = identityScript(workflow)
  const bash = process.platform === 'win32'
    ? resolve(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
    : 'bash'
  const result = spawnSync(bash, ['-c', script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 45_000,
    env: {
      ...process.env,
      EXPECTED_GIT_SHA: '0'.repeat(40),
      RELEASE_ID: `harness-${'0'.repeat(12)}-${'1'.repeat(12)}`,
      SOURCE_BUNDLE_SHA256: '2'.repeat(64),
      TARGET_ENVIRONMENT: 'staging',
      NATIVE_TEST_SECRET: 'must-not-appear-in-identity-error',
    },
  })
  assert.ifError(result.error)
  assert.notEqual(result.status, 0, 'another Git SHA must never reach native builds')
  assert.match(result.stderr, /NATIVE_IDENTITY_FAILED:git_sha/u)
  assert.doesNotMatch(result.stdout + result.stderr, /must-not-appear-in-identity-error/u)
})

test('EAS upload retains every tracked input used by the full-source release identity', () => {
  const excluded = execFileSync('git', [
    'ls-files', '--cached', '--ignored', '--exclude-from=.easignore', '-z',
  ], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
    .filter((path) => !path.startsWith('artifacts/') && !path.startsWith('.scratch/'))
  assert.equal(excluded.length, 0, `EAS would omit ${excluded.length} release inputs; first: ${excluded.slice(0, 5).join(', ')}`)
})

function hasRequiredGate(source, mode) {
  const api = source.indexOf('--reporter=json --outputFile=../../artifacts/transactions/api-vitest.json')
  const mobile = source.indexOf('--json --outputFile=../../artifacts/transactions/mobile-jest.json')
  const gate = source.indexOf(`transaction-critical-coverage.mjs ${mode}`)
  return api >= 0 && mobile >= 0 && gate > api && gate > mobile &&
    source.includes('--results artifacts/transactions/api-vitest.json') &&
    source.includes('--results artifacts/transactions/mobile-jest.json')
}

for (const [workflow, mode] of [
  ['ci.yml', '--require-bound-assertions'],
  ['release-production.yml', '--require-behavioral'],
]) {
  test(`${workflow} requires fresh API and mobile assertions for its evidence gate`, () => {
    const source = readFileSync(resolve(root, '.github/workflows', workflow), 'utf8')
    assert.equal(hasRequiredGate(source, mode), true)
    assert.equal(hasRequiredGate(source.replace(mode, ''), mode), false)
    assert.equal(hasRequiredGate(source.replace('--reporter=json', ''), mode), false)
    if (workflow === 'release-production.yml') {
      assert.ok(source.indexOf('--require-behavioral') < source.indexOf('  production-release:'))
      assert.match(source, /production-release:[\s\S]*?needs: \[quality, release-config-gate\]/u)
    }
  })
}

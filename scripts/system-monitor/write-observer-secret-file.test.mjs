import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { writeObserverSecretFile } from './write-observer-secret-file.mjs'

const workflow = readFileSync(resolve('.github/workflows/release-backend-system-health.yml'), 'utf8')

test('deployment and rollback use the tested observer secret file writer', () => {
  const writerCalls = workflow.match(/node scripts\/system-monitor\/write-observer-secret-file\.mjs "\$secret_file"/gu) ?? []

  assert.equal(writerCalls.length, 2)
  assert.doesNotMatch(workflow, /writeFileSync\(process\.argv\[1\].*flag:\s*'wx'/su)
})

test('writes the observer secret into an existing empty mktemp file', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'system-health-secret-'))
  const filePath = resolve(directory, 'observer-secret.json')
  const secret = 'a'.repeat(64)
  writeFileSync(filePath, '')

  try {
    writeObserverSecretFile(filePath, secret)

    assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), {
      SYSTEM_HEALTH_OBSERVER_SECRET: secret,
    })
    if (process.platform !== 'win32') assert.equal(statSync(filePath).mode & 0o777, 0o600)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('command writes the inherited secret without echoing it', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'system-health-secret-cli-'))
  const filePath = resolve(directory, 'observer-secret.json')
  const secret = 'b'.repeat(64)
  writeFileSync(filePath, '')

  try {
    const output = execFileSync(process.execPath, [
      'scripts/system-monitor/write-observer-secret-file.mjs',
      filePath,
    ], {
      encoding: 'utf8',
      env: { ...process.env, SYSTEM_HEALTH_OBSERVER_SECRET: secret },
    })

    assert.equal(output, '')
    assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), {
      SYSTEM_HEALTH_OBSERVER_SECRET: secret,
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('refuses an invalid secret without changing the precreated file', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'system-health-secret-invalid-'))
  const filePath = resolve(directory, 'observer-secret.json')
  writeFileSync(filePath, '')

  try {
    assert.throws(() => writeObserverSecretFile(filePath, 'not-a-secret'), /SYSTEM_HEALTH_OBSERVER_SECRET_INVALID/u)
    assert.equal(readFileSync(filePath, 'utf8'), '')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

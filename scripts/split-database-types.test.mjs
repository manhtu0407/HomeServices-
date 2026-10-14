import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bucketOf, join as joinTypes, write } from './split-database-types.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('completion operations and audited recovery belong to the job lifecycle', () => {
  for (const name of ['completion_payment_operations', 'workflow_recovery_action_audit', 'workflow_recovery_cases']) {
    assert.equal(bucketOf(name), 'jobs', name)
  }
})

test('system health monitor tables belong to the monitoring lifecycle', () => {
  for (const name of [
    'system_health_deliveries',
    'system_health_incidents',
    'system_mobile_health_observations',
    'system_monitor_worker_heartbeats',
  ]) {
    assert.equal(bucketOf(name), 'monitoring', name)
  }
})

test('backend system-health promotion evidence belongs to the harness lifecycle', () => {
  assert.equal(bucketOf('backend_system_health_release_evidence'), 'harness')
})

test('generated type comparison accepts terminal newline differences but rejects schema drift', () => {
  const committed = joinTypes(root)
  const scratch = resolve(root, '.scratch')
  mkdirSync(scratch, { recursive: true })
  const fixture = mkdtempSync(resolve(scratch, 'database-types-compare-'))
  const generatedPath = resolve(fixture, 'database.types.ts')
  const compare = () => spawnSync(process.execPath, [
    resolve(root, 'scripts/split-database-types.mjs'),
    '--check-against',
    generatedPath,
  ], { cwd: root, encoding: 'utf8' })
  try {
    writeFileSync(generatedPath, committed.replace(/\n+$/u, ''))
    const matching = compare()
    assert.equal(matching.status, 0, matching.stderr)

    writeFileSync(generatedPath, `${committed.trimEnd()}\nexport type Drift = never\n`)
    const drift = compare()
    assert.equal(drift.status, 1, `${drift.stdout}\n${drift.stderr}`)
  } finally {
    const fixturePath = resolve(fixture)
    const relativeFixture = relative(scratch, fixturePath)
    assert.ok(
      relativeFixture && relativeFixture !== '..' &&
      !relativeFixture.startsWith(`..${sep}`) && !isAbsolute(relativeFixture),
    )
    rmSync(fixturePath, { recursive: true, force: true })
  }
})

test('type regeneration preserves neighboring files and exact schema bytes', () => {
  const source = readFileSync(resolve(root, 'scripts/split-database-types.mjs'), 'utf8')
  // Refuse to exercise a destructive generator even inside the regression fixture.
  assert.doesNotMatch(source, /\b(?:rmSync|unlinkSync|rmdirSync)\s*\(/u)
  mkdirSync(resolve(root, '.scratch'), { recursive: true })
  const fixture = mkdtempSync(resolve(root, '.scratch/type-generator-preservation-'))
  const output = resolve(fixture, 'packages/shared/src/types/database')
  mkdirSync(output, { recursive: true })
  const neighbor = resolve(output, 'preserved-fixture.txt')
  writeFileSync(neighbor, 'unrelated user-owned content\n')
  const schema = joinTypes(root)
  write(schema, fixture)
  write(schema, fixture)
  assert.equal(readFileSync(neighbor, 'utf8'), 'unrelated user-owned content\n')
  assert.equal(joinTypes(fixture), schema)
})

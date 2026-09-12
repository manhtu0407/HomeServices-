import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bucketOf, join as joinTypes, write } from './split-database-types.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('completion operations and audited recovery belong to the job lifecycle', () => {
  for (const name of ['completion_payment_operations', 'workflow_recovery_action_audit', 'workflow_recovery_cases']) {
    assert.equal(bucketOf(name), 'jobs', name)
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

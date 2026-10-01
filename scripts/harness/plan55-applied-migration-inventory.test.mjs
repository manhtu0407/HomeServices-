import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { buildPlan55AppliedMigrationInventory } from './plan55-applied-migration-inventory.mjs'

const productionRef = 'iwevizmsedyqozxlawwl'
const sourceSha = '891b1e26dd9a785f05671002c5e74cb270678be4'
const releaseId = 'harness-891b1e26dd9a-8c7eb92a4783'

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'plan55-applied-migrations-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const sql = new Map([
    ['20260924231604', 'create policy fixture;\n'],
    ['20260927182024', 'alter table fixture add column image_ref text;\n'],
    ['20260929100000', 'create table fixture_chat_image_refs ();\n'],
    ['20260930100000', 'create table pending_fixture ();\n'],
  ])
  const entries = [...sql].map(([version, body]) => {
    const name = `migration_${version}`
    const file = `supabase/migrations/${version}_${name}.sql`
    const bytes = Buffer.from(body.replace(/\r\n/gu, '\n'), 'utf8')
    mkdirSync(resolve(root, 'supabase/migrations'), { recursive: true })
    writeFileSync(resolve(root, file), bytes)
    return {
      version,
      name,
      file,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    }
  })
  const equivalences = { version: '1.0.0', groups: [] }
  const inventory = {
    version: '1.1.0',
    historicalBaseline: { file: 'baseline.json', immutableThroughVersion: '20260923120000', sha256: 'a'.repeat(64) },
    migrationCount: entries.length,
    migrationEquivalences: equivalences,
    migrationsSha256: createHash('sha256')
      .update(entries.map((entry) => `${entry.version}:${entry.name}:${entry.sha256}\n`).join(''))
      .digest('hex'),
    databaseTypes: { file: 'types.ts', sha256: 'b'.repeat(64) },
    entries,
  }
  const hostedState = {
    environment: 'production',
    projectRef: productionRef,
    releaseId,
    gitSha: sourceSha,
    releaseLane: 'verification',
    migrations: entries.slice(0, 3).map(({ version, name }) => ({ version, name })),
  }
  return { root, inventory, hostedState, entries }
}

test('builds a source-attested inventory from exactly the applied Production migrations', (t) => {
  const { root, inventory, hostedState, entries } = fixture(t)
  const result = buildPlan55AppliedMigrationInventory({
    root,
    sourceInventory: inventory,
    hostedState,
    expectedProjectRef: productionRef,
    expectedProductionBase: { sha: sourceSha, releaseId },
  })

  assert.deepEqual(result.entries, entries.slice(0, 3))
  assert.equal(result.migrationCount, 3)
  assert.deepEqual(result.migrationEquivalences, { version: '1.0.0', groups: [] })
  assert.equal(result.databaseTypes, inventory.databaseTypes)
  assert.equal(result.migrationsSha256, createHash('sha256')
    .update(entries.slice(0, 3).map((entry) => `${entry.version}:${entry.name}:${entry.sha256}\n`).join(''))
    .digest('hex'))
})

test('rejects an applied Production migration missing from the source inventory', (t) => {
  const { root, inventory, hostedState } = fixture(t)
  hostedState.migrations.push({ version: '20261001100000', name: 'unknown_live_migration' })
  assert.throws(() => buildPlan55AppliedMigrationInventory({
    root, sourceInventory: inventory, hostedState,
    expectedProjectRef: productionRef,
    expectedProductionBase: { sha: sourceSha, releaseId },
  }), /unknown applied Production migration/u)
})

test('rejects target, release, duplicate, and ordering drift', (t) => {
  const { root, inventory, hostedState } = fixture(t)
  const options = {
    root, sourceInventory: inventory,
    expectedProjectRef: productionRef,
    expectedProductionBase: { sha: sourceSha, releaseId },
  }
  assert.throws(() => buildPlan55AppliedMigrationInventory({
    ...options, hostedState: { ...hostedState, projectRef: 'xyylanuyflrjzbjzhqfl' },
  }), /registered release target/u)
  assert.throws(() => buildPlan55AppliedMigrationInventory({
    ...options, hostedState: { ...hostedState, gitSha: '0'.repeat(40) },
  }), /exact Production release base/u)
  assert.throws(() => buildPlan55AppliedMigrationInventory({
    ...options, hostedState: { ...hostedState, migrations: [...hostedState.migrations, hostedState.migrations[0]] },
  }), /duplicate applied Production migration/u)
  assert.throws(() => buildPlan55AppliedMigrationInventory({
    ...options, hostedState: { ...hostedState, migrations: [...hostedState.migrations].reverse() },
  }), /applied Production migrations are not ordered/u)
})

test('rejects inventory tampering before selecting the applied subset', (t) => {
  const { root, inventory, hostedState } = fixture(t)
  writeFileSync(resolve(root, inventory.entries[0].file), 'altered;\n')
  assert.throws(() => buildPlan55AppliedMigrationInventory({
    root, sourceInventory: inventory, hostedState,
    expectedProjectRef: productionRef,
    expectedProductionBase: { sha: sourceSha, releaseId },
  }), /source migration digest mismatch/u)
})

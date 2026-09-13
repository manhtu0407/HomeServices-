import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import {
  buildMigrationInventory,
  checkHistoricalMigrationBaseline,
  compareRemoteMigrations,
} from './migration-inventory.mjs'

test('builds a deterministic repository migration inventory', () => {
  const first = buildMigrationInventory()
  const second = buildMigrationInventory()
  assert.deepEqual(first, second)
  assert.equal(first.entries.length, first.migrationCount)
  assert.match(first.migrationsSha256, /^[0-9a-f]{64}$/)
  assert.match(first.databaseTypes.sha256, /^[0-9a-f]{64}$/)
})

test('published policy-evidence migrations retain their original SQL identity', () => {
  const inventory = buildMigrationInventory()
  for (const version of ['20260823043422', '20260823184000']) {
    const entry = inventory.entries.find((item) => item.version === version)
    assert.equal(entry?.sha256, 'a7915627b837d3eeaa5feb40f30f45214f0960ed8d317f35dd69e146650e0761',
      `published policy migration ${version} must not be rewritten to make a replay succeed`)
  }
})

test('immutable baseline covers the published release migration history', () => {
  const baseline = JSON.parse(readFileSync(new URL('../../config/harness/migration-baseline.json', import.meta.url), 'utf8'))
  const publishedThrough = '20260904113000'
  assert.ok(baseline.immutableThroughVersion >= publishedThrough,
    'the immutable baseline must protect migrations published through the Stage 1 compatibility release')
  const protectedEntries = baseline.entries.filter((entry) => entry.version <= publishedThrough)
  assert.equal(protectedEntries.length, 336, 'all published migration identities must be protected, not only the original baseline')
  const inventory = buildMigrationInventory()
  for (const entry of protectedEntries) {
    const actual = inventory.entries.find((candidate) => candidate.version === entry.version)
    assert.equal(actual?.file, entry.file)
    assert.equal(actual?.sha256, entry.sha256, `published migration identity changed: ${entry.version}`)
    assert.equal(actual?.bytes, entry.bytes)
  }
})

test('rejects unknown remote migrations before deriving a pending set', () => {
  const inventory = {
    migrationEquivalences: { version: '1.0.0', groups: [] },
    entries: [
      { version: '20260101000000' },
      { version: '20260102000000' },
    ],
  }
  const problems = compareRemoteMigrations(inventory, [
    { version: '20260101000000' },
    { version: '20260103000000' },
  ])
  assert.ok(problems.some((problem) => problem.includes('unknown versions')))
})

test('reports known migrations that remain pending', () => {
  const inventory = {
    migrationEquivalences: { version: '1.0.0', groups: [] },
    entries: [
      { version: '20260101000000' },
      { version: '20260102000000' },
    ],
  }
  const problems = compareRemoteMigrations(inventory, [{ version: '20260101000000' }])
  assert.ok(problems.some((problem) => problem.includes('missing migrations')))
})

test('rejects malformed remote migration entries before any weaker comparison', () => {
  const inventory = {
    migrationEquivalences: { version: '1.0.0', groups: [] },
    entries: [
      { version: '20260101000000' },
      { version: '20260102000000' },
    ],
  }
  const problems = compareRemoteMigrations(inventory, [
    { version: '20260101000000' },
    { version: '20260102000000' },
    { version: '20260102000000' },
    {},
    null,
  ])
  assert.ok(problems.some((problem) => problem.includes('invalid version')))
})

test('rejects duplicate remote migration entries', () => {
  const inventory = {
    migrationEquivalences: { version: '1.0.0', groups: [] },
    entries: [
      { version: '20260101000000' },
      { version: '20260102000000' },
    ],
  }
  const problems = compareRemoteMigrations(inventory, [
    { version: '20260101000000' },
    { version: '20260101000000' },
  ])
  assert.ok(problems.some((problem) => problem.includes('duplicate versions')))
})


function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function withMigrationFixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-migrations-'))
  try {
    const migration = 'begin; select 1; commit;\n'
    write(resolve(root, 'supabase/migrations/20260101000000_base.sql'), migration)
    const sha = createHash('sha256').update(migration).digest('hex')
    const entry = {
      version: '20260101000000',
      file: 'supabase/migrations/20260101000000_base.sql',
      sha256: sha,
      bytes: Buffer.byteLength(migration),
    }
    const migrationsSha256 = createHash('sha256')
      .update(`${entry.version}:${entry.file}:${entry.sha256}\n`)
      .digest('hex')
    write(resolve(root, 'config/harness/migration-baseline.json'), `${JSON.stringify({
      version: '1.0.0',
      immutableThroughVersion: '20260101000000',
      migrationCount: 1,
      migrationsSha256,
      entries: [entry],
    }, null, 2)}\n`)
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('rejects a modified historical migration', () => {
  withMigrationFixture((root) => {
    write(resolve(root, 'supabase/migrations/20260101000000_base.sql'), 'begin; select 2; commit;\n')
    const problems = checkHistoricalMigrationBaseline({ root })
    assert.ok(problems.some((problem) => problem.includes('historical migration was modified')))
  })
})

test('ignores checkout line endings while preserving historical migration integrity', () => {
  withMigrationFixture((root) => {
    write(resolve(root, 'supabase/migrations/20260101000000_base.sql'), 'begin; select 1; commit;\r\n')
    assert.deepEqual(checkHistoricalMigrationBaseline({ root }), [])
  })
})

test('rejects a backdated migration outside the immutable baseline', () => {
  withMigrationFixture((root) => {
    write(resolve(root, 'supabase/migrations/20251231000000_backdated.sql'), 'select 1;\n')
    const problems = checkHistoricalMigrationBaseline({ root })
    assert.ok(problems.some((problem) => problem.includes('backdated migration')))
  })
})

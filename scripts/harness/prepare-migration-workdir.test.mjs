import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildEmptyMigrationApplyPlan,
  buildMigrationApplyPlan,
  materializeEmptyMigrationWorkdir,
  materializeMigrationApplyWorkdir,
} from './prepare-migration-workdir.mjs'

const entries = [
  { version: '20260801000000', file: 'supabase/migrations/alias-a.sql', sha256: 'a'.repeat(64) },
  { version: '20260802000000', file: 'supabase/migrations/alias-b.sql', sha256: 'b'.repeat(64) },
  { version: '20260803000000', file: 'supabase/migrations/canonical.sql', sha256: 'c'.repeat(64) },
  { version: '20260804000000', file: 'supabase/migrations/next.sql', sha256: 'd'.repeat(64) },
]
const inventory = {
  migrationEquivalences: {
    version: '1.0.0',
    groups: [{
      id: 'fixture-hotfix', canonicalVersion: '20260803000000',
      versions: ['20260801000000', '20260802000000', '20260803000000'],
      semanticSha256: 'f'.repeat(64),
    }],
  },
  entries,
}
const hosted = {
  environment: 'production', projectRef: 'iwevizmsedyqozxlawwl',
  migrations: [{ version: '20260802000000' }],
}
const receipt = {
  environment: 'production', projectRef: 'iwevizmsedyqozxlawwl',
  pendingMigrations: [entries[3]],
}

test('isolated workdir keeps the exact hosted alias and excludes equivalent replay', () => {
  const plan = buildMigrationApplyPlan({ inventory, hosted, receipt })
  assert.deepEqual(plan.hostedVersions, ['20260802000000'])
  assert.deepEqual(plan.pendingVersions, ['20260804000000'])
  assert.deepEqual(plan.files.map((entry) => entry.version), [
    '20260802000000', '20260804000000',
  ])
})

test('release apply plan accepts the observed production ledger aliases without replaying their canonical migrations', () => {
  const workerAlias = '20261010081826'
  const workerCanonical = '20261010140000'
  const candidateAlias = '20261010090340'
  const candidateCanonical = '20261010150000'
  const nextVersion = '20261011100000'
  const versions = [workerAlias, workerCanonical, candidateAlias, candidateCanonical, nextVersion]
  const releaseInventory = {
    migrationEquivalences: {
      version: '1.0.0',
      groups: [
        {
          id: 'worker-retry-ledger-marker',
          canonicalVersion: workerCanonical,
          versions: [workerAlias, workerCanonical],
          semanticSha256: 'a'.repeat(64),
          allowMultipleHostedVersions: true,
        },
        {
          id: 'candidate-retry-time-alias',
          canonicalVersion: candidateCanonical,
          versions: [candidateAlias, candidateCanonical],
          semanticSha256: 'b'.repeat(64),
        },
      ],
    },
    entries: versions.map((version, index) => ({
      version,
      file: `supabase/migrations/${version}_fixture.sql`,
      sha256: String(index + 1).repeat(64),
    })),
  }
  const production = {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    migrations: [workerAlias, candidateAlias, workerCanonical].map((version) => ({ version })),
  }
  const pending = [releaseInventory.entries.at(-1)]

  const plan = buildMigrationApplyPlan({
    inventory: releaseInventory,
    hosted: production,
    receipt: { environment: 'production', projectRef: production.projectRef, pendingMigrations: pending },
  })

  assert.deepEqual(plan.hostedVersions, [workerAlias, candidateAlias, workerCanonical])
  assert.deepEqual(plan.pendingVersions, [nextVersion])
  assert.deepEqual(plan.files.map((entry) => entry.version), [workerAlias, candidateAlias, workerCanonical, nextVersion])
  assert.deepEqual(buildEmptyMigrationApplyPlan({ inventory: releaseInventory }).pendingVersions,
    [workerCanonical, candidateCanonical, nextVersion])
})

test('planner rejects a receipt that silently omits or adds a migration', () => {
  assert.throws(() => buildMigrationApplyPlan({
    inventory,
    hosted,
    receipt: { ...receipt, pendingMigrations: [] },
  }), /does not match hosted history/u)
})

test('catch-up mode is locked after the Staging backend retirement', () => {
  assert.throws(() => buildMigrationApplyPlan({
    inventory, hosted, mode: 'staging-catchup', receipt: null,
  }), /Staging migration catch-up is locked/u)
})

test('empty reset replays one canonical migration per equivalence group', () => {
  const plan = buildEmptyMigrationApplyPlan({ inventory })
  assert.equal(plan.mode, 'empty-reset')
  assert.deepEqual(plan.hostedVersions, [])
  assert.deepEqual(plan.pendingVersions, [
    '20260803000000', '20260804000000',
  ])
  assert.deepEqual(plan.files.map((entry) => entry.version), [
    '20260803000000', '20260804000000',
  ])
})

test('only the isolated empty-reset workdir pins the patched Postgres image', () => {
  const root = mkdtempSync(join(tmpdir(), 'nestscout-postgres-pin-'))
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true })
  const sql = 'select 1;\n'
  writeFileSync(join(root, 'supabase/config.toml'), 'project_id = "fixture"\n')
  writeFileSync(join(root, 'supabase/seed.sql'), sql)
  writeFileSync(join(root, 'supabase/migrations/20260804000000_fixture.sql'), sql)
  const fixtureInventory = { migrationEquivalences: { version: '1.0.0', groups: [] }, entries: [{ version: '20260804000000',
    file: 'supabase/migrations/20260804000000_fixture.sql',
    sha256: createHash('sha256').update(sql).digest('hex') }] }
  materializeEmptyMigrationWorkdir({ root, output: 'empty', inventory: fixtureInventory })
  assert.equal(readFileSync(join(root, 'empty/supabase/.temp/postgres-version'), 'utf8').trim(), '17.6.1.121')
  materializeMigrationApplyWorkdir({ root, output: 'hosted', inventory: fixtureInventory,
    hosted: { ...hosted, migrations: [] }, receipt: { ...receipt, pendingMigrations: fixtureInventory.entries } })
  assert.equal(existsSync(join(root, 'hosted/supabase/.temp/postgres-version')), false)
  assert.equal(existsSync(join(root, 'supabase/.temp/postgres-version')), false)
})

test('canonical empty-reset workdir can be reused when it still matches the inventory', () => {
  const root = mkdtempSync(join(tmpdir(), 'nestscout-reuse-migrations-'))
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true })
  const sql = 'select 1;\n'
  writeFileSync(join(root, 'supabase/config.toml'), 'project_id = "fixture"\n')
  writeFileSync(join(root, 'supabase/seed.sql'), sql)
  writeFileSync(join(root, 'supabase/migrations/20260804000000_fixture.sql'), sql)
  const fixtureInventory = { migrationEquivalences: { version: '1.0.0', groups: [] }, entries: [{ version: '20260804000000',
    file: 'supabase/migrations/20260804000000_fixture.sql',
    sha256: createHash('sha256').update(sql).digest('hex') }] }
  const input = { root, output: 'empty', inventory: fixtureInventory }
  const first = materializeEmptyMigrationWorkdir(input)
  const reused = materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true })
  assert.deepEqual(reused, first)
  writeFileSync(join(root, 'empty/supabase/migrations/20260801000000_alias.sql'), sql)
  assert.throws(
    () => materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true }),
    /canonical migration file set/u,
  )
})

test('refreshing a stale empty-reset workdir preserves the old snapshot and installs the current inventory', () => {
  const root = mkdtempSync(join(tmpdir(), 'nestscout-refresh-migrations-'))
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true })
  const sql = 'select 1;\n'
  writeFileSync(join(root, 'supabase/config.toml'), 'project_id = "fixture"\n')
  writeFileSync(join(root, 'supabase/seed.sql'), sql)
  writeFileSync(join(root, 'supabase/migrations/20260804000000_fixture.sql'), sql)
  const fixtureInventory = { migrationEquivalences: { version: '1.0.0', groups: [] }, entries: [{ version: '20260804000000',
    file: 'supabase/migrations/20260804000000_fixture.sql',
    sha256: createHash('sha256').update(sql).digest('hex') }] }
  const input = { root, output: '.scratch/local-migrations', inventory: fixtureInventory }
  materializeEmptyMigrationWorkdir(input)
  writeFileSync(join(root, '.scratch/local-migrations/preserved-marker.txt'), 'old snapshot')
  writeFileSync(join(root, '.scratch/local-migrations/supabase/migrations/20260804000000_fixture.sql'), 'select 2;\n')

  let archivedPath
  const refreshed = materializeEmptyMigrationWorkdir({
    ...input,
    reuseExisting: true,
    refreshStaleExisting: true,
    onStaleSnapshotArchived: (path) => { archivedPath = path },
  })

  assert.deepEqual(refreshed, buildEmptyMigrationApplyPlan({ inventory: fixtureInventory }))
  assert.equal(readFileSync(join(root, '.scratch/local-migrations/supabase/migrations/20260804000000_fixture.sql'), 'utf8'), sql)
  assert.ok(archivedPath)
  assert.equal(readFileSync(join(root, archivedPath, 'preserved-marker.txt'), 'utf8'), 'old snapshot')
  assert.equal(readFileSync(join(root, archivedPath, 'supabase/migrations/20260804000000_fixture.sql'), 'utf8'), 'select 2;\n')
  assert.equal(readdirSync(join(root, '.scratch')).some((name) => name.startsWith('local-migrations-refresh-')), false)
})

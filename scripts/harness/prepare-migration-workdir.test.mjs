import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
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

test('an isolated local instance changes only its copied project and ports and remains reusable', () => {
  const root = mkdtempSync(join(tmpdir(), 'nestscout-local-instance-'))
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true })
  const sql = 'select 1;\n'
  const config = 'project_id = "nestscout"\n[api]\nport = 55321\n[db]\nport = 55322\nshadow_port = 55320\n[studio]\nport = 55323\n[inbucket]\nport = 55324\n[edge_runtime]\ninspector_port = 8083\n'
  writeFileSync(join(root, 'supabase/config.toml'), config)
  writeFileSync(join(root, 'supabase/seed.sql'), sql)
  writeFileSync(join(root, 'supabase/migrations/20260804000000_fixture.sql'), sql)
  const fixtureInventory = { migrationEquivalences: { version: '1.0.0', groups: [] }, entries: [{ version: '20260804000000', file: 'supabase/migrations/20260804000000_fixture.sql', sha256: createHash('sha256').update(sql).digest('hex') }] }
  const input = { root, output: '.scratch/local-migrations-qa-journey56', inventory: fixtureInventory, localInstance: { name: 'journey56', portBase: 58320 } }
  const plan = materializeEmptyMigrationWorkdir(input)
  assert.equal(plan.projectRef, 'nestscout-qa-journey56')
  assert.deepEqual(plan.localRuntime, input.localInstance)
  const copied = readFileSync(join(root, input.output, 'supabase/config.toml'), 'utf8')
  assert.match(copied, /^project_id = "nestscout-qa-journey56"$/mu)
  for (const port of [58320, 58321, 58322, 58323, 58324, 58328]) assert.ok(copied.includes(`= ${port}\n`))
  assert.equal(readFileSync(join(root, 'supabase/config.toml'), 'utf8'), config)
  assert.equal(readFileSync(join(root, input.output, 'supabase/seed.sql'), 'utf8'), sql)
  assert.throws(() => materializeEmptyMigrationWorkdir({ ...input, output: 'supabase' }), /dedicated scratch path/u)
  assert.equal(readFileSync(join(root, 'supabase/config.toml'), 'utf8'), config)
  assert.deepEqual(materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true }), plan)
  assert.throws(() => materializeEmptyMigrationWorkdir({ ...input, localInstance: { name: 'journey56', portBase: 59320 }, reuseExisting: true }), /stale|differs/u)
})

test('local instance selection rejects unsafe names and invalid port ranges before planning', () => {
  for (const name of ['../production', 'production', 'staging', 'main', '', 'UPPER', 'x;echo', 'x'.repeat(41)]) {
    assert.throws(() => buildEmptyMigrationApplyPlan({ inventory, localInstance: { name, portBase: 58320 } }), /local instance/u)
  }
  for (const portBase of [0, 1023, 65530, 58320.5, Number.NaN, '58320']) {
    assert.throws(() => buildEmptyMigrationApplyPlan({ inventory, localInstance: { name: 'journey56', portBase } }), /port base/u)
  }
})

test('a local instance override cannot be used for a hosted migration apply plan', () => {
  assert.throws(() => buildMigrationApplyPlan({ inventory, hosted, receipt, localInstance: { name: 'journey56', portBase: 58320 } }), /local instance.*empty/u)
})

test('local runtime snapshots copy tracked function sources and reject stale or changed copies', () => {
  const root = mkdtempSync(join(tmpdir(), 'nestscout-local-functions-'))
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true })
  mkdirSync(join(root, 'supabase/functions/mobile-api'), { recursive: true })
  mkdirSync(join(root, 'packages/shared/src'), { recursive: true })
  const sql = 'select 1;\n'
  const entry = 'Deno.serve(() => new Response("fixture"))\n'
  writeFileSync(join(root, 'supabase/config.toml'), 'project_id = "fixture"\n')
  writeFileSync(join(root, 'supabase/seed.sql'), sql)
  writeFileSync(join(root, 'supabase/migrations/20260804000000_fixture.sql'), sql)
  writeFileSync(join(root, 'supabase/functions/mobile-api/index.ts'), entry)
  writeFileSync(join(root, 'packages/shared/src/worker-capability-data.ts'), 'export const capabilities = {}\n')
  writeFileSync(join(root, 'supabase/functions/.env'), 'PRIVATE_FIXTURE=not-for-copy\n')
  const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true, timeout: 15_000, stdio: 'pipe' })
  git('init', '--quiet')
  git('add', '--', 'supabase/functions/mobile-api/index.ts')
  git('add', '--', 'packages/shared/src/worker-capability-data.ts')
  const fixtureInventory = { migrationEquivalences: { version: '1.0.0', groups: [] }, entries: [{ version: '20260804000000', file: 'supabase/migrations/20260804000000_fixture.sql', sha256: createHash('sha256').update(sql).digest('hex') }] }
  const input = { root, output: '.scratch/local-migrations', inventory: fixtureInventory }
  const plan = materializeEmptyMigrationWorkdir(input)
  const copied = join(root, input.output, 'supabase/functions/mobile-api/index.ts')
  assert.equal(readFileSync(copied, 'utf8'), entry)
  assert.equal(readFileSync(join(root, input.output, 'packages/shared/src/worker-capability-data.ts'), 'utf8'), 'export const capabilities = {}\n')
  assert.equal(existsSync(join(root, input.output, 'supabase/functions/.env')), false)
  assert.deepEqual(materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true }), plan)
  writeFileSync(copied, 'changed copy')
  assert.throws(() => materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true }), /function.*checksum/u)
  writeFileSync(copied, entry)
  writeFileSync(join(root, 'supabase/functions/mobile-api/index.ts'), `${entry}// changed source\n`)
  assert.throws(() => materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true }), /stale/u)
  materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true, refreshStaleExisting: true })
  assert.equal(readFileSync(copied, 'utf8'), `${entry}// changed source\n`)
  git('add', '--', 'supabase/functions/.env')
  assert.throws(() => materializeEmptyMigrationWorkdir({ ...input, reuseExisting: true }), /unsafe file/u)
})

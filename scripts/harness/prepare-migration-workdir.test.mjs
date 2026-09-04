import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildEmptyMigrationApplyPlan,
  buildMigrationApplyPlan,
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

test('planner rejects a receipt that silently omits or adds a migration', () => {
  assert.throws(() => buildMigrationApplyPlan({
    inventory,
    hosted,
    receipt: { ...receipt, pendingMigrations: [] },
  }), /does not match hosted history/u)
})

test('catch-up mode is restricted to the exact Staging target', () => {
  assert.throws(() => buildMigrationApplyPlan({
    inventory, hosted, mode: 'staging-catchup', receipt: null,
  }), /restricted to the registered Staging project/u)
  const plan = buildMigrationApplyPlan({
    inventory,
    hosted: { ...hosted, environment: 'staging', projectRef: 'xyylanuyflrjzbjzhqfl' },
    mode: 'staging-catchup',
    receipt: null,
  })
  assert.equal(plan.mode, 'staging-catchup')
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

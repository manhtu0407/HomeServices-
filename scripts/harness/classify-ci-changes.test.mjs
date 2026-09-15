import assert from 'node:assert/strict'
import test from 'node:test'

import { allCategories, classifyChangedPaths, classifyEvent } from './classify-ci-changes.mjs'

test('mobile-only changes stay in the focused workspace lane', () => {
  assert.deepEqual(classifyChangedPaths(['apps/mobile/components/customer/Home.tsx']), {
    frontend: true,
    backend: false,
    shared: false,
    database: false,
    harness: false,
    sandbox: false,
    security: false,
    integration: false,
    kael: false,
    workspace: true,
    workspace_full: false,
    runtime: false,
  })
})

test('generic API changes run runtime, integration, and security lanes without Kael evals', () => {
  const result = classifyChangedPaths(['apps/api/src/app/jobs/service.ts'])
  assert.equal(result.backend, true)
  assert.equal(result.runtime, true)
  assert.equal(result.integration, true)
  assert.equal(result.security, true)
  assert.equal(result.kael, false)
  assert.equal(result.workspace_full, false)
})

test('Kael backend changes opt into the full Kael lane', () => {
  assert.equal(classifyChangedPaths([
    'supabase/functions/mobile-api/_shared/kael/pipeline/orchestrator.ts',
  ]).kael, true)
})

test('migration changes force the database and full workspace lanes', () => {
  const result = classifyChangedPaths(['supabase/migrations/20260915120000_forward.sql'])
  assert.equal(result.database, true)
  assert.equal(result.integration, true)
  assert.equal(result.security, true)
  assert.equal(result.workspace_full, true)
})

test('workflow and harness changes retain full safety coverage', () => {
  const result = classifyChangedPaths(['.github/workflows/integration.yml'])
  assert.equal(result.harness, true)
  assert.equal(result.integration, true)
  assert.equal(result.security, true)
  assert.equal(result.kael, true)
  assert.equal(result.workspace_full, true)
})

test('manual and scheduled events fail open to every category', () => {
  assert.deepEqual(classifyEvent({ event: 'schedule' }), allCategories())
  assert.deepEqual(classifyEvent({ event: 'workflow_dispatch' }), allCategories())
})

test('mixed mobile and API changes cannot take a focused lane', () => {
  assert.equal(classifyChangedPaths([
    'apps/mobile/components/customer/Home.tsx',
    'apps/api/src/app/jobs/service.ts',
  ]).workspace_full, true)
})

test('a path no lane claims fails closed to every lane', () => {
  for (const path of [
    'scripts/run.mjs',
    'scripts/structure-baseline.json',
    'patches/react-native-svg@15.15.4.patch',
    'compose.yaml',
    '.gitattributes',
  ]) {
    assert.deepEqual(classifyChangedPaths([path]), allCategories(), path)
  }
  assert.deepEqual(classifyChangedPaths([
    'apps/mobile/components/customer/Home.tsx',
    'scripts/run.mjs',
  ]), allCategories())
})

test('documentation-only changes take no conditional lane', () => {
  assert.deepEqual(classifyChangedPaths(['docs/INDEX.md', 'README.md']), allCategories(false))
})

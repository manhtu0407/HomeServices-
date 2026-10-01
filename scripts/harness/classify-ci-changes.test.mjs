import assert from 'node:assert/strict'
import test from 'node:test'

import {
  allCategories,
  changedPathsArgs,
  classifyChangedPaths,
  classifyEvent,
} from './classify-ci-changes.mjs'

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

test('rules, skills, commands, and memory take no conditional lane', () => {
  for (const path of [
    'governance/RULES.md',
    'governance/protocols/test-pillars.md',
    'governance/design/reference/signature-glass-dock.tsx',
    '.claude/MEMORY.md',
    '.claude/skills/kael-tdd/SKILL.md',
    '.claude/commands/kael-mem.md',
    '.agents/skills/kael-tdd/agents/openai.yaml',
    '.opencodereview/rule.json',
  ]) {
    assert.deepEqual(classifyChangedPaths([path]), allCategories(false), path)
  }
})

test('a regenerated pillar index does not widen a mobile-only change', () => {
  const pillar = 'apps/mobile/components/worker/__tests__/worker-stage-six-production-pillar-test.tsx'
  const alone = classifyChangedPaths([pillar])
  assert.equal(alone.workspace, true)
  assert.equal(alone.workspace_full, false)
  assert.deepEqual(classifyChangedPaths([pillar, 'governance/protocols/test-pillars.md']), alone)
})

test('a lane-neutral path never opens a lane by naming Kael', () => {
  for (const path of [
    'docs/design/kael-source-trust-pricing-20260707.md',
    '.claude/skills/kael-tdd/SKILL.md',
    'governance/protocols/kael-anything.md',
  ]) {
    assert.equal(classifyChangedPaths([path]).kael, false, path)
  }
})

test('executable agent configuration keeps full safety coverage', () => {
  for (const path of [
    '.claude/hooks/verify-comment-hygiene.mjs',
    '.claude/settings.json',
    '.claude/launch.json',
    '.agents/notes.txt',
  ]) {
    const result = classifyChangedPaths([path])
    assert.equal(result.harness, true, path)
    assert.equal(result.workspace_full, true, path)
    assert.equal(result.database, false, path)
  }
})

test('both sides of a rename count as changed paths', () => {
  assert.ok(changedPathsArgs({ base: 'a'.repeat(40), head: 'b'.repeat(40) }).includes('--no-renames'))
  assert.ok(changedPathsArgs({ base: '0'.repeat(40), head: 'b'.repeat(40) }).includes('--no-renames'))
})

test('a merge commit with no base still lists its changes instead of an empty diff', () => {
  const args = changedPathsArgs({ base: '0'.repeat(40), head: 'b'.repeat(40) })
  assert.ok(args.includes('-m') && args.includes('--first-parent'))
})

// Fixture suite for the work-router reconciler.
//
// Run it by hand: `node --test scripts/check-work-plan.test.mjs`. The harness CI pass
// over `node --test` suites is switched off (see scripts/harness/verify.mjs), so nothing
// here is claimed to be enforced automatically — the enforced gates are the two ratchet
// invocations, `check-work-plan.mjs` and `check-work-plan.mjs --coverage`.
//
// The reconciler is exercised as a pure function so no temporary git tree is needed;
// what it does with a real working tree is proven by running the ratchet itself.

import assert from 'node:assert/strict'
import test from 'node:test'
import { ALWAYS_ON, coverage, reconcile } from './check-work-plan.mjs'

function slice(overrides = {}) {
  return {
    id: 's1',
    domain: 'infra',
    reach: 'C',
    goal: 'fixture',
    read: ['scripts'],
    skills: [],
    dropped: [],
    files: 4,
    status: 'closed',
    ...overrides,
  }
}

function problemsFor(plan, changed) {
  return reconcile({ plan, changed }).problems
}

test('a plan that matches the tree raises nothing', () => {
  const problems = problemsFor({ slices: [slice()] }, ['scripts/check-work-plan.mjs'])
  assert.deepEqual(problems, [])
})

test('more files changed than declared is caught', () => {
  const problems = problemsFor(
    { slices: [slice({ files: 1 })] },
    ['scripts/a.mjs', 'scripts/b.mjs', 'scripts/c.mjs'],
  )
  assert.ok(problems.some((problem) => /understated its own size/.test(problem)))
})

test('a file changed outside every read-window is caught', () => {
  const problems = problemsFor({ slices: [slice()] }, ['apps/mobile/app/index.tsx'])
  assert.ok(problems.some((problem) => /outside every slice read-window/.test(problem)))
})

test('a slice left open is caught', () => {
  const problems = problemsFor({ slices: [slice({ status: 'open' })] }, [])
  assert.ok(problems.some((problem) => /still open/.test(problem)))
})

test('a domain outside the twelve classes is caught', () => {
  const problems = problemsFor({ slices: [slice({ domain: 'chores' })] }, [])
  assert.ok(problems.some((problem) => /not one of the twelve classes/.test(problem)))
})

test('a missing dropped array is caught while an empty one passes', () => {
  const missing = slice()
  delete missing.dropped
  assert.ok(problemsFor({ slices: [missing] }, []).some((problem) => /no `dropped` array/.test(problem)))
  assert.deepEqual(problemsFor({ slices: [slice({ dropped: [] })] }, []), [])
})

test('a reach outside T C X E is caught', () => {
  const problems = problemsFor({ slices: [slice({ reach: 'M' })] }, [])
  assert.ok(problems.some((problem) => /is not T, C, X, or E/.test(problem)))
})

test('a shared-contract path cannot be claimed as a trivial slice', () => {
  const problems = problemsFor(
    { slices: [slice({ domain: 'docs', reach: 'T', read: ['packages/shared'] })] },
    ['packages/shared/src/contracts/job.ts'],
  )
  assert.ok(problems.some((problem) => /reach floor of `X`/.test(problem)))
})

test('a shared-contract path is accepted once a slice declares cross-cutting reach', () => {
  const problems = problemsFor(
    { slices: [slice({ domain: 'refactor', reach: 'X', read: ['packages/shared'] })] },
    ['packages/shared/src/contracts/job.ts'],
  )
  assert.deepEqual(problems, [])
})

test('a migration touched under an undeclared domain is caught', () => {
  const problems = problemsFor(
    { slices: [slice({ domain: 'docs', reach: 'X', read: ['supabase/migrations'] })] },
    ['supabase/migrations/20260101000000_add_column.sql'],
  )
  assert.ok(problems.some((problem) => /no slice declared that domain/.test(problem)))
})

test('exploratory reach satisfies every floor', () => {
  const problems = problemsFor(
    { slices: [slice({ domain: 'refactor', reach: 'E', read: ['packages/shared'] })] },
    ['packages/shared/src/contracts/job.ts'],
  )
  assert.deepEqual(problems, [])
})

const LANES = [
  '## Lane — by domain',
  '',
  '| domain | candidates |',
  '|---|---|',
  '| `bugfix` | `kael-diagnose` |',
  '| `ui` | hand to `kael-design-preflight` then `governance/design/runtime.md` |',
  '',
  '## Always-on — exempt from routing',
  '',
  '`kael-core-hygiene` `karpathy-guidelines` `kael-subagent-orchestration` `kael-work-router`',
  '',
  '## Namespace trap — protocol, not skill',
  '',
  '`kael-review` `kael-preflight`',
  '',
].join('\n')

function manifestOf(...ids) {
  return {
    entries: ids.map(([id, group]) => ({ id, group, kind: 'repository-skill' })),
  }
}

test('coverage passes when every skill is reachable', () => {
  const manifest = manifestOf(
    ['kael-diagnose', 'everyday'],
    ['kael-design-preflight', 'design'],
    ['kael-motion', 'design'],
    ['kael-core-hygiene', 'everyday'],
  )
  const report = coverage({ markdown: LANES, manifest })
  assert.deepEqual(report.problems, [])
  assert.equal(report.reachable, report.skills)
})

test('coverage fails when a manifest skill no lane reaches is added', () => {
  const manifest = manifestOf(['kael-diagnose', 'everyday'], ['kael-invented', 'everyday'])
  const report = coverage({ markdown: LANES, manifest })
  assert.ok(report.problems.some((problem) => /kael-invented: in the manifest but no lane can reach it/.test(problem)))
})

test('coverage fails when a lane names something the manifest lacks', () => {
  const report = coverage({ markdown: LANES, manifest: manifestOf(['kael-design-preflight', 'design']) })
  assert.ok(report.problems.some((problem) => /kael-diagnose: named by a lane but absent/.test(problem)))
})

test('coverage fails when a protocol-only name becomes a real skill', () => {
  const manifest = manifestOf(
    ['kael-diagnose', 'everyday'],
    ['kael-design-preflight', 'design'],
    ['kael-review', 'everyday'],
  )
  const report = coverage({ markdown: LANES, manifest })
  assert.ok(report.problems.some((problem) => /the trap table is stale/.test(problem)))
})

test('coverage fails when the design delegation row is dropped', () => {
  const withoutDelegation = LANES.replace('then `governance/design/runtime.md`', 'directly')
  const manifest = manifestOf(['kael-diagnose', 'everyday'], ['kael-motion', 'design'])
  const report = coverage({ markdown: withoutDelegation, manifest })
  assert.ok(report.problems.some((problem) => /design skills would be orphaned/.test(problem)))
})

test('the always-on set is the four skills that are never selected', () => {
  assert.deepEqual(
    [...ALWAYS_ON].sort(),
    ['kael-core-hygiene', 'kael-subagent-orchestration', 'kael-work-router', 'karpathy-guidelines'],
  )
})

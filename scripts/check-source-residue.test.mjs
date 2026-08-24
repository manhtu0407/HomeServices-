// Fixture suite for the residue ratchet.
//
// Half of these cases assert the linter stays SILENT. That half matters as much as the other:
// this repo runs 11 conditional skips and a fleet of CLI scripts that print to stdout, and a
// rule that flags those would be switched off within a week. A gate only proven in the red
// direction has never been shown to be right, only loud.
//
// Fixtures are assembled from fragments because the linter scans every source file, this one
// included. Assembly keeps the banned literals from appearing here; the alternative is
// exempting this path, and a path exemption is exactly what the rule set avoids needing.

import assert from 'node:assert/strict'
import test from 'node:test'

import { residue, scopesFor } from './check-source-residue.mjs'

const FOCUS = '.on' + 'ly('
const SKIP = '.sk' + 'ip('
const XIT = 'x' + 'it('
const PROBE = '[DEBUG-' + 'kael-probe]'

const RUNTIME = 'apps/mobile/components/thing.tsx'
const TEST_FILE = 'apps/api/src/__tests__/unit/thing.test.ts'
const SANDBOX_TS = 'sandbox/agent/src/probe.ts'
const SANDBOX_CLI = 'sandbox/agent/src/sandbox-check.mjs'
const TOOL = 'scripts/some-tool.mjs'

function run(files) {
  return residue(files.map(([path, text]) => ({ path, text })))
}

function messages(report) {
  return report.problems.map((problem) => `${problem.path}:${problem.line} ${problem.id}`).join('\n')
}

test('a clean tree raises nothing and counts both scopes', () => {
  const report = run([
    [RUNTIME, 'export const a = 1\n'],
    [TEST_FILE, 'it("works", () => {})\n'],
    [TOOL, 'console.log("hello")\n'],
    ['docs/INDEX.md', `# not source ${FOCUS}\n`],
  ])
  assert.deepEqual(report.problems, [])
  assert.equal(report.scanned, 3)
  assert.equal(report.runtime, 1)
})

test('a focused test is caught', () => {
  const report = run([[TEST_FILE, `it${FOCUS}"x", () => {})\n`]])
  assert.match(messages(report), /thing\.test\.ts:1 focused test/)
})

test('an unconditionally skipped test is caught', () => {
  const report = run([[TEST_FILE, `describe${SKIP}"x", () => {})\n`]])
  assert.match(messages(report), /thing\.test\.ts:1 skipped test/)
})

test('an x-prefixed test is caught', () => {
  const report = run([[TEST_FILE, `${XIT}"x", () => {})\n`]])
  assert.match(messages(report), /thing\.test\.ts:1 skipped test/)
})

test('process.exit and onExit are NOT caught — the x-prefix rule is word-anchored', () => {
  const report = run([
    [TOOL, 'if (bad) process.exit(1)\n'],
    [RUNTIME, 'const close = () => void props.onExit()\n'],
  ])
  assert.deepEqual(report.problems, [])
})

test('skipIf and the ternary skip form are NOT caught — the repo runs 11 of them', () => {
  const report = run([
    [TEST_FILE, 'it.skipIf(!hasPowerShell)("x", () => {})\n'],
    [TEST_FILE, 'const describeReal = resolution.ok ? describe : describe.skip\n'],
  ])
  assert.deepEqual(report.problems, [])
})

test('a leftover debug probe is caught', () => {
  const report = run([[RUNTIME, `  log("${PROBE} value", v)\n`]])
  assert.match(messages(report), /thing\.tsx:1 debug probe/)
})

test('console.log in runtime source is caught', () => {
  const report = run([[RUNTIME, 'console.log(user)\n']])
  assert.match(messages(report), /thing\.tsx:1 debug console/)
})

test('console.warn, error, and info in runtime source are NOT caught', () => {
  const report = run([[RUNTIME, 'console.warn(a)\nconsole.error(b)\nconsole.info(c)\n']])
  assert.deepEqual(report.problems, [])
})

test('console.log is NOT caught in tests, in scripts, or in a CLI .mjs', () => {
  const report = run([
    [TEST_FILE, 'console.log(captured)\n'],
    [TOOL, 'console.log(summary)\n'],
    [SANDBOX_CLI, 'console.log(result)\n'],
  ])
  assert.deepEqual(report.problems, [])
})

test('sandbox IS scanned for focus, skip, and probes', () => {
  const report = run([[SANDBOX_TS, `it${FOCUS}"x", () => {})\n`]])
  assert.match(messages(report), /sandbox\/agent\/src\/probe\.ts:1 focused test/)
})

test('scopesFor draws the two scopes where the rules claim they are drawn', () => {
  assert.deepEqual(scopesFor(RUNTIME), ['source', 'runtime'])
  assert.deepEqual(scopesFor('supabase/functions/mobile-api/index.ts'), ['source', 'runtime'])
  assert.deepEqual(scopesFor(TEST_FILE), ['source'])
  assert.deepEqual(scopesFor('apps/mobile/components/x-pillar-test.tsx'), ['source'])
  assert.deepEqual(scopesFor(SANDBOX_TS), ['source', 'runtime'])
  assert.deepEqual(scopesFor(SANDBOX_CLI), ['source'])
  assert.deepEqual(scopesFor(TOOL), ['source'])
  assert.deepEqual(scopesFor('apps/api/scripts/smoke.ts'), ['source'])
  assert.deepEqual(scopesFor('docs/INDEX.md'), [])
  assert.deepEqual(scopesFor('config/harness/manifest.json'), [])
})

test('the reported line number and text point at the offending line', () => {
  const report = run([[TEST_FILE, `const a = 1\n\nit${FOCUS}"x", () => {})\n`]])
  assert.equal(report.problems.length, 1)
  assert.equal(report.problems[0].line, 3)
  assert.match(report.problems[0].text, /^it\.on/)
})

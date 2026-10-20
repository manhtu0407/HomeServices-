import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeChanges } from './check-test-integrity.mjs'
import { parseUnifiedDiff } from './lib/unified-diff.mjs'

// Forbidden tokens are assembled at runtime so this file does not contain them as literals.
const tok = (...parts) => parts.join('')
const SKIP_CALL = tok('it.', 'skip', '(')
const TODO_CALL = tok('it.', 'todo', '(')
const SNAPSHOT = tok('expect(a).toMatch', 'Snapshot', '()')
const TRUE_CONST = tok('expect', '(true)', '.toBe(true)')
const ANY_CAST = tok('as ', 'any')
const IGNORE_LINE = tok('// @ts-', 'ignore')
const UPDATE_CMD = tok('"test": "vitest run ', '-u"')
const EXPECT_CALL = tok('expect', '(a).toBe(1)')

const change = (path, added, removed = [], content = null, deleted = false) => ({
  path,
  added: added.map((text, index) => ({ line: index + 1, text })),
  removed,
  content,
  deleted,
})

const blocks = (findings) => findings.filter((finding) => finding.severity === 'block').map((finding) => finding.rule)
const reports = (findings) => findings.filter((finding) => finding.severity === 'report').map((finding) => finding.rule)
const TEST_PATH = 'apps/mobile/components/__tests__/widget-test.tsx'

test('clean control: a replaced assertion with a real value raises no finding', () => {
  const findings = analyzeChanges([
    change(TEST_PATH, [`  ${EXPECT_CALL}`], [`  ${tok('expect', '(a).toBe(2)')}`], `test('x', () => {\n  ${EXPECT_CALL}\n})`),
  ])
  assert.deepEqual(blocks(findings), [])
})

test('red fixture: net assertion removal blocks', () => {
  const findings = analyzeChanges([change(TEST_PATH, [], [`  ${EXPECT_CALL}`, `  ${EXPECT_CALL}`], `test('x', () => {})`)])
  assert.deepEqual(blocks(findings), ['assertion-drop', 'no-assertion'])
})

test('red fixture: a deleted test file counts its removed assertions', () => {
  const findings = analyzeChanges([change('apps/mobile/lib/__tests__/gone-test.ts', [], [`  ${EXPECT_CALL}`], null, true)])
  assert.deepEqual(blocks(findings), ['assertion-drop'])
})

test('red fixture: focused, skipped, or todo test blocks', () => {
  assert.deepEqual(blocks(analyzeChanges([change(TEST_PATH, [`${SKIP_CALL} 'x', () => {`, `${EXPECT_CALL}`])])), ['focus-or-skip'])
  assert.deepEqual(blocks(analyzeChanges([change(TEST_PATH, [`${TODO_CALL} 'x')`, `${EXPECT_CALL}`])])), ['focus-or-skip'])
})

test('red fixture: snapshot assertion blocks', () => {
  assert.deepEqual(blocks(analyzeChanges([change(TEST_PATH, [`  ${SNAPSHOT}`])])), ['snapshot-assertion'])
})

test('red fixture: snapshot update command blocks even outside a test file', () => {
  assert.deepEqual(blocks(analyzeChanges([change('package.json', [`    ${UPDATE_CMD}`])])), ['snapshot-update'])
})

test('clean control: a vitest run without an update flag is not a snapshot update', () => {
  assert.deepEqual(blocks(analyzeChanges([change('package.json', ['    "test": "vitest run --reporter=dot"'])])), [])
})

test('red fixture: constant assertion blocks', () => {
  assert.deepEqual(blocks(analyzeChanges([change(TEST_PATH, [`  ${TRUE_CONST}`])])), ['trivial-assertion'])
})

test('red fixture: type escape in a test blocks', () => {
  assert.deepEqual(blocks(analyzeChanges([change(TEST_PATH, [`  const v = value ${ANY_CAST}`, `  ${EXPECT_CALL}`])])), ['type-escape'])
  assert.deepEqual(blocks(analyzeChanges([change(TEST_PATH, [`  ${IGNORE_LINE}`, `  ${EXPECT_CALL}`])])), ['type-escape'])
})

test('red fixture: a test file that declares tests but asserts nothing blocks', () => {
  const content = 'test("one", () => {})\nit("two", () => {})'
  assert.deepEqual(blocks(analyzeChanges([change(TEST_PATH, ['test("one", () => {})'], [], content)])), ['no-assertion'])
})

test('a helper module with no test calls is not required to assert', () => {
  assert.deepEqual(blocks(analyzeChanges([change('apps/mobile/lib/__tests__/helpers-test.ts', ['export const x = 1'], [], 'export const x = 1')])), [])
})

test('gate and config edits are reported, never blocked', () => {
  const findings = analyzeChanges([
    change('scripts/check-source-residue.mjs', ['const x = 1']),
    change('config/harness/manifest.json', ['  "entries": []']),
    change('apps/mobile/app/index.tsx', ['export const y = 2']),
  ])
  assert.deepEqual(blocks(findings), [])
  assert.deepEqual(reports(findings), ['protected-surface', 'protected-surface'])
})

test('expected literal changed alongside product source is reported', () => {
  const findings = analyzeChanges([
    change(TEST_PATH, [`  ${tok('expect', '(a).toBe(2)')}`], [`  ${tok('expect', '(a).toBe(1)')}`], `test('x', () => {\n  ${tok('expect', '(a).toBe(2)')}\n})`),
    change('packages/shared/src/price.ts', ['export const p = 2']),
  ])
  assert.deepEqual(blocks(findings), [])
  assert.ok(reports(findings).includes('expected-literal-changed'))
})

test('parseUnifiedDiff keeps removed lines that look like headers and marks deleted files', () => {
  const raw = [
    'diff --git a/apps/x/__tests__/a.test.ts b/apps/x/__tests__/a.test.ts',
    'index 111..222 100644',
    '--- a/apps/x/__tests__/a.test.ts',
    '+++ b/apps/x/__tests__/a.test.ts',
    '@@ -3,2 +3,2 @@',
    '-  expect(a).toBe(1)',
    '+  expect(a).toBe(2)',
    '--- old sql comment',
    '+  // keep',
    'diff --git a/apps/x/gone.test.ts b/apps/x/gone.test.ts',
    'deleted file mode 100644',
    '--- a/apps/x/gone.test.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-  expect(b).toBe(1)',
    '',
  ].join('\n')
  const [live, gone] = parseUnifiedDiff(raw)
  assert.equal(live.path, 'apps/x/__tests__/a.test.ts')
  assert.deepEqual(live.added, [{ line: 3, text: '  expect(a).toBe(2)' }, { line: 4, text: '  // keep' }])
  assert.deepEqual(live.removed, ['  expect(a).toBe(1)', '-- old sql comment'])
  assert.equal(gone.path, 'apps/x/gone.test.ts')
  assert.equal(gone.deleted, true)
  assert.deepEqual(gone.removed, ['  expect(b).toBe(1)'])
})

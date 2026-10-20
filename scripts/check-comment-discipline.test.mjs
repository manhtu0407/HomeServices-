import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zeroCommentViolations } from './check-comment-discipline.mjs'
import { commentLines } from './lib/comment-lines.mjs'

const PRODUCT = 'apps/mobile/lib/price.ts'
const PRODUCT_TSX = 'apps/mobile/components/card.tsx'

const lines = (violations) => violations.map((violation) => violation.line)

const added = (content, indexes = null) => {
  const all = content.split('\n')
  return new Set(indexes ?? all.map((_, index) => index + 1))
}

test('clean control: a URL inside a string literal is not a comment', () => {
  const content = 'export const url = "https://example.com/path"\nexport const n = 1'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT, content)), [])
})

test('red fixture: a trailing line comment on an added line is a violation', () => {
  const content = 'export const n = 1 // the count'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT, content)), [1])
})

test('red fixture: a multi-line block comment reports every line it spans', () => {
  const content = '/**\n * Explains the price.\n */\nexport const n = 1'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT, content)), [1, 2, 3])
})

test('a comment on a line the change did not add is not judged', () => {
  const content = '// old note\nexport const n = 1'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT, content, added(content, [2]))), [])
})

test('a comment-like sequence inside a template literal is not a comment', () => {
  const content = 'export const s = `/* not a comment */ and // not either`'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT, content)), [])
})

test('a comment-like sequence inside JSX text is not a comment', () => {
  const content = 'export const C = () => <p>https://example.com // x</p>'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT_TSX, content)), [])
})

test('red fixture: a JSX expression comment is a violation', () => {
  const content = 'export const C = () => (\n  <p>\n    {/* note */}\n  </p>\n)'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT_TSX, content)), [3])
})

test('authority citations are comments too', () => {
  const content = '// Per RULES.md #8\nexport const n = 1'
  assert.deepEqual(lines(zeroCommentViolations(PRODUCT, content)), [1])
})

test('test files and paths outside the product roots are exempt', () => {
  const content = 'test("x", () => {}) // a note'
  assert.deepEqual(zeroCommentViolations('apps/mobile/lib/__tests__/x-test.ts', content), [])
  assert.deepEqual(zeroCommentViolations('scripts/tool.ts', content), [])
  assert.deepEqual(zeroCommentViolations('apps/mobile/lib/readme.md', content), [])
})

test('commentLines reports exactly the lines that carry comment tokens', () => {
  const content = 'const a = 1 // one\nconst b = "// not"\n/* two */ const c = 3'
  assert.deepEqual([...commentLines('apps/mobile/x.ts', content)].sort((a, b) => a - b), [1, 3])
})

// Exercise the scanner with identical source under both checkout line endings.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { analyse } from './find-artifact-text-assertions.mjs'

const fixturePath = resolve('apps/api/src/__tests__/artifact-fixture.test.ts')
function fixture(matcher) {
  return [
    "import { readFileSync } from 'node:fs'",
    "it('checks migration contents', () => {",
    "  const migration = readFileSync('supabase/migrations/example.sql', 'utf8')",
    `  expect(migration).${matcher}('for update')`,
    '})',
  ]
}

for (const [label, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`${label} checkout rejects positive SQL text assertions`, () => {
    const findings = analyse(fixturePath, fixture('toContain').join(newline))
    assert.equal(findings.length, 1)
    assert.equal(findings[0].severity, 'banned')
    assert.equal(findings[0].kind, 'migration')
    assert.equal(findings[0].line, 2)
  })

  test(`${label} checkout permits negative artifact contamination scans`, () => {
    assert.deepEqual(analyse(fixturePath, fixture('not.toContain').join(newline)), [])
  })
}

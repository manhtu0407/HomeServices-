import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { digestPath } from './path-digest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

test('digestPath is deterministic for a bounded tracked fixture directory', () => {
  const first = digestPath(root, 'scripts/harness/fixtures')
  const second = digestPath(root, 'scripts/harness/fixtures')
  assert.match(first, /^[0-9a-f]{64}$/u)
  assert.equal(first, second)
})

test('digestPath refuses to escape the declared root', () => {
  assert.throws(() => digestPath(resolve(root, 'scripts'), '../package.json'), /escapes/u)
})

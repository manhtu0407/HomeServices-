import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLinkedMigrationList } from './linked-migration-state.mjs'

test('parses only the remote version column from Supabase CLI output', () => {
  const value = `
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260801000000 | 20260801000000 | 2026-08-01 00:00:00
   20260802000000 |                | 2026-08-02 00:00:00
                  | 20260803000000 | 2026-08-03 00:00:00
  `
  assert.deepEqual(parseLinkedMigrationList(value), [
    { version: '20260801000000' },
    { version: '20260803000000' },
  ])
})

test('rejects duplicate remote history', () => {
  assert.throws(() => parseLinkedMigrationList(`
   20260801000000 | 20260801000000 | x
                  | 20260801000000 | y
  `), /duplicate or out of order/u)
})

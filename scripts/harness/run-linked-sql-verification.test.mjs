import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareLinkedVerificationSql } from './run-linked-sql-verification.mjs'

test('injects deterministic seed data inside a rollback-only verification transaction', () => {
  const prepared = prepareLinkedVerificationSql('begin;\nselect 1;\nrollback;\n', 'insert into fixture values (1);\n')
  assert.equal(prepared.eligible, true)
  assert.match(prepared.sql, /^begin;\n\ninsert into fixture values \(1\);\n\nselect 1;\nrollback;/u)
})

test('refuses non-rollback and dblink files in the linked Staging lane', () => {
  assert.equal(prepareLinkedVerificationSql('select 1;', '').eligible, false)
  assert.equal(prepareLinkedVerificationSql('begin;\nselect dblink_connect();\nrollback;', '').eligible, false)
  assert.equal(prepareLinkedVerificationSql('begin;\n\\gset\nrollback;', '').eligible, false)
})

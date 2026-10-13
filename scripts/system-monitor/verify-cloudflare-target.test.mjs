import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyCloudflareTarget } from './verify-cloudflare-target.mjs'

const expected = {
  accountId: '45dec251ed1c9627256f9b6ba24bcdff',
  databaseId: '33d39ec6-73a4-44e6-b030-fb9ee3e4f281',
  databaseName: 'nestscout-system-health-observer',
}
const whoami = { accounts: [{ id: expected.accountId, name: 'NestScout' }] }
const d1Databases = { success: true, result: [{ uuid: expected.databaseId, name: expected.databaseName }] }

test('verifies the exact Cloudflare account and D1 database before release mutation', () => {
  assert.deepEqual(verifyCloudflareTarget({ whoami, d1Databases, expected }), {
    status: 'verified',
    ...expected,
  })
})

test('rejects a different Cloudflare account', () => {
  assert.throws(
    () => verifyCloudflareTarget({ whoami: { accounts: [{ id: 'a'.repeat(32) }] }, d1Databases, expected }),
    /CLOUDFLARE_ACCOUNT_MISMATCH/u,
  )
})

test('rejects a same-name D1 database with a different identity', () => {
  assert.throws(
    () => verifyCloudflareTarget({ whoami, d1Databases: { result: [{ uuid: 'a'.repeat(36), name: expected.databaseName }] }, expected }),
    /CLOUDFLARE_D1_TARGET_MISMATCH/u,
  )
})

test('rejects malformed CLI output without echoing it', () => {
  assert.throws(
    () => verifyCloudflareTarget({ whoami: 'private-value', d1Databases, expected }),
    (error) => error.message === 'CLOUDFLARE_TARGET_OUTPUT_INVALID' && !error.message.includes('private-value'),
  )
})

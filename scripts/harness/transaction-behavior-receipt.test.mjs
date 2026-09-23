import assert from 'node:assert/strict'
import { test } from 'node:test'

import { rehash } from './fixtures/checksum.mjs'
import { clone, transactionBehaviorFixture as fixture } from './fixtures/transaction-behavior-fixture.mjs'
import { buildTransactionBehaviorReceipt, verifyTransactionBehaviorReceipt } from './transaction-behavior-receipt.mjs'

const now = '2026-09-21T01:02:03.000Z'

test('names every acknowledged gap and binds it by digest', () => {
  const { value, report } = fixture('PARTIAL')
  const receipt = buildTransactionBehaviorReceipt({ manifest: value, reports: [report], now })
  assert.equal(receipt.partialCount, 1)
  assert.equal(receipt.mappedCount, 0)
  assert.equal(receipt.unverifiedCount, 0)
  assert.deepEqual(receipt.acknowledgedGaps, [{ id: 'worker.fulfillment.advance', gaps: ['Hosted transaction proof remains open.'] }])
  assert.equal(receipt.boundAssertions.passed, receipt.boundAssertions.required)
  assert.deepEqual(verifyTransactionBehaviorReceipt(receipt), [])
})

test('a fully mapped catalog acknowledges nothing', () => {
  const { value, report } = fixture('MAPPED')
  const receipt = buildTransactionBehaviorReceipt({ manifest: value, reports: [report], now })
  assert.equal(receipt.partialCount, 0)
  assert.deepEqual(receipt.acknowledgedGaps, [])
  assert.deepEqual(verifyTransactionBehaviorReceipt(receipt), [])
})

test('refuses a receipt when any bound assertion did not execute and pass', () => {
  for (const outcome of ['missing', 'failed', 'skipped']) {
    const { value, report } = fixture('PARTIAL')
    const results = report.testResults[0].assertionResults
    if (outcome === 'missing') results.shift()
    else results[0].status = outcome
    assert.throws(() => buildTransactionBehaviorReceipt({ manifest: value, reports: [report], now }), /did not all execute and pass/u, outcome)
  }
  const red = fixture('PARTIAL')
  red.report.success = false
  assert.throws(() => buildTransactionBehaviorReceipt({ manifest: red.value, reports: [red.report], now }), /did not all execute/u)
})

test('refuses runner-less proof and entries that have no reviewed binding', () => {
  const { value, report } = fixture('PARTIAL')
  assert.throws(() => buildTransactionBehaviorReceipt({ manifest: value, reports: [], now }), /did not all execute/u)
  const withoutBinding = clone(value)
  withoutBinding.entries.push({ ...withoutBinding.entries[0], id: 'worker.fulfillment.unbound' })
  assert.throws(
    () => buildTransactionBehaviorReceipt({ manifest: withoutBinding, reports: [report], now }),
    /no reviewed behavioral binding/u,
  )
})

test('detects a receipt edited after it was written, by rule and not only by checksum', () => {
  const { value, report } = fixture('PARTIAL')
  const receipt = buildTransactionBehaviorReceipt({ manifest: value, reports: [report], now })
  const { required } = receipt.boundAssertions
  const cases = [
    [{ ...receipt, acknowledgedGaps: [{ id: receipt.acknowledgedGaps[0].id, gaps: ['Nothing is open.'] }] }, /gap digest mismatch/u],
    [{ ...receipt, acknowledgedGaps: [] }, /must name every acknowledged gap/u],
    [{ ...receipt, partialCount: 0, mappedCount: 1 }, /must name every acknowledged gap/u],
    [{ ...receipt, boundAssertions: { passed: required - 1, required } }, /every bound assertion to have passed/u],
    [{ ...receipt, unverifiedCount: 1 }, /counts are inconsistent or leave an entry unverified/u],
    [{ ...receipt, mode: 'require-behavioral' }, /identity is invalid/u],
  ]
  for (const [candidate, expected] of cases) {
    assert.match(verifyTransactionBehaviorReceipt(rehash(candidate)).join('; '), expected, JSON.stringify(candidate).slice(0, 90))
  }
  assert.match(verifyTransactionBehaviorReceipt({ ...receipt, receiptSha256: 'f'.repeat(64) }).join('; '), /checksum mismatch/u)
  assert.notDeepEqual(verifyTransactionBehaviorReceipt(null), [])
})

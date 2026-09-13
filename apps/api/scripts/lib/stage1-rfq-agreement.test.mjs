import assert from 'node:assert/strict'
import { test } from 'node:test'
import { proveSyntheticRfqAgreement } from './stage1-rfq-agreement.mjs'

function fixture(change = {}) {
  const calls = []
  const worker = { id: 'worker' }, customer = { id: 'customer' }
  let quote
  const api = async (actor, method, path, input) => {
    calls.push({ actor, method, path, input })
    if (path.endsWith('/rfq-price')) {
      quote = { id: input.request_id, job_id: 'job', worker_id: worker.id, customer_id: customer.id,
        quote_mode: 'rfq', ...input, status: 'pending', ...change }
      return { json: quote }
    }
    if (path.endsWith('/decide')) return { json: { ...quote, status: 'approved', decided_at: '2026-09-13T01:00:00Z' } }
    return { json: { job: { final_price: calls.length === 2 ? null : 220000 } } }
  }
  return { api, worker, customer, jobId: 'job', requestId: 'request', calls }
}
test('requires Worker proposal, unpriced read, owning Customer decision, and final-price rehydration in order', async () => {
  const run = fixture()
  await proveSyntheticRfqAgreement(run)
  assert.deepEqual(run.calls.map(c => [c.actor.id, c.method, c.path]), [
    ['worker','POST','/jobs/job/rfq-price'], ['customer','GET','/jobs/job'],
    ['customer','POST','/jobs/job/rfq-price/decide'], ['customer','GET','/jobs/job'],
  ])
  assert.deepEqual(run.calls[2].input, { proposal_id: 'request', approve: true })
  assert.equal(run.calls.some(c => c.input?.final_price !== undefined), false)
})
test('rejects wrong mode, authority or amount before Customer consent', async () => {
  for (const change of [{ quote_mode: 'kael_auto_quote' }, { customer_id: 'other' }, { customer_total: 1 }]) {
    const run = fixture(change)
    await assert.rejects(proveSyntheticRfqAgreement(run), /proposal receipt is invalid/)
    assert.equal(run.calls.length, 1)
  }
})

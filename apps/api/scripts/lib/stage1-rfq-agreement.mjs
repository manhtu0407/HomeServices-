// Synthetic actors use the same price-consent routes as app users, never a final_price SQL patch.
export async function proveSyntheticRfqAgreement({ api, jobId, worker, customer, requestId }) {
  const input = { request_id: requestId, customer_total: 220000,
    scope_summary: 'Khảo sát và xử lý đầu nối theo kịch bản cô lập; gồm vật tư và công thực hiện.' }
  const proposed = await api(worker, 'POST', `/jobs/${jobId}/rfq-price`, input,
    { idempotencyKey: `rfq-proposal-${requestId}` })
  const quote = proposed.json
  if (quote?.id !== requestId || quote?.job_id !== jobId || quote?.worker_id !== worker.id ||
    quote?.customer_id !== customer.id || quote?.customer_total !== input.customer_total ||
    quote?.scope_summary !== input.scope_summary || quote?.status !== 'pending' ||
    !['rfq', 'inspection_only'].includes(quote?.quote_mode)) throw new Error('RFQ Worker proposal receipt is invalid')
  const before = await api(customer, 'GET', `/jobs/${jobId}`)
  if ((before.json?.job ?? before.json)?.final_price != null) throw new Error('RFQ price locked before Customer approval')
  const decision = await api(customer, 'POST', `/jobs/${jobId}/rfq-price/decide`,
    { proposal_id: quote.id, approve: true }, { idempotencyKey: `rfq-decision-${requestId}` })
  if (decision.json?.id !== quote.id || decision.json?.status !== 'approved' ||
    decision.json?.customer_total !== quote.customer_total || !decision.json?.decided_at) {
    throw new Error('RFQ Customer approval receipt is invalid')
  }
  const after = await api(customer, 'GET', `/jobs/${jobId}`)
  if ((after.json?.job ?? after.json)?.final_price !== input.customer_total) {
    throw new Error('RFQ exact Customer-approved price did not rehydrate')
  }
}

import { describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { localQaRecord as record } from './local-qa-http-harness'
import { createLocalFulfillmentFixture } from './local-qa-fulfillment-fixture'

export const PILLAR = {
  id: 'P396-kael-local-http-fulfillment',
  invariant: 'a noncohort job reaches execution only through Customer assignment and immutable RFQ approval, requires real private completion evidence, and never invents payment readiness',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'actual local mobile-api confirmation, matching, job status, RFQ, Storage and completion boundaries',
  layer: 'integration',
  siblings: ['P395-kael-local-http-confirmation', 'P178-rfq-price-public-contract', 'P79-worker-completion-media-ownership'],
  mutation: 'skip the Customer RFQ price approval; real PostgreSQL must prevent the later repairing transition',
} as const satisfies PillarManifest

const { target, prepare } = createLocalFulfillmentFixture(PILLAR)
const integration = pillarPrerequisite(PILLAR, { available: target !== null,
  hint: 'Requires the guarded named local Auth Edge PostgreSQL and Storage; no provider inference or bank transfer.' }) ? describe.sequential : describe.skip
const why = (detail?: string) => pillarWhy(PILLAR, detail)

integration('Noncohort fulfillment through actual local HTTP, Storage and PostgreSQL', () => {
  it('carries the same Customer-confirmed RFQ job through arrival, price consent and private completion evidence', async context => {
    const { owner, jobId, request, command, stored, journey } = await prepare(context)
    const payment = await command(`/jobs/${jobId}/confirm-completion`, owner)
    expect(payment.status, why('unconfigured local bank rail cannot pretend it created a payment')).toBe(409)
    expect(record(payment.payload), why()).toMatchObject({ code: 'PAYMENT_NOT_ENABLED' })
    Object.assign(journey, { completionPaymentStatus: payment.status, completionPaymentCode: record(payment.payload).code })
    const unchanged = await request(`/rest/v1/jobs?id=eq.${jobId}&select=status,final_price,synthetic_cohort_id,completion_photo_urls,payment_status`)
    expect(unchanged.payload, why('a disabled rail cannot advance the job or invent settlement')).toEqual(stored.payload)
    const logs = await request(`/rest/v1/api_logs?job_id=eq.${jobId}&select=id`)
    expect(logs.payload, why('the deterministic RFQ execution must not call inference')).toEqual([])
  }, 120_000)
})

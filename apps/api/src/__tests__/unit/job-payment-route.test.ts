import { describe, expect, it } from 'vitest'
import { matchJobResourceRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/job.ts'

const jobId = '22222222-2222-4222-8222-222222222222'

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

describe('job payment routes', () => {
  it('routes the nested manual bank claim to the customer-only handler', () => {
    expect(matchJobResourceRoute(`/jobs/${jobId}/payment-order/claim`, 'POST', decodePathSegment)).toMatchObject({
      kind: 'jobs.paymentOrderClaim',
      jobId,
      roles: ['customer'],
    })
  })

  it('routes direct payment selection and two-party responses', () => {
    expect(matchJobResourceRoute(`/jobs/${jobId}/direct-payment/select`, 'POST', decodePathSegment)).toMatchObject({
      kind: 'jobs.directPaymentSelect',
      jobId,
      roles: ['customer'],
    })
    expect(matchJobResourceRoute(`/jobs/${jobId}/direct-payment/respond`, 'POST', decodePathSegment)).toMatchObject({
      kind: 'jobs.directPaymentRespond',
      jobId,
      roles: ['customer', 'worker'],
    })
  })
})

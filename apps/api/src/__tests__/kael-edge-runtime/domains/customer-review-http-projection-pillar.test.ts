import { describe, expect, it, vi } from 'vitest'

import { toWorkflowPhase } from '@nestscout/shared'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P360-customer-review-http-and-closed-projection',
  invariant:
    'The authenticated Customer review route validates the public DTO, binds the review to the route job, returns reviewed state, and projects it to the closed workflow phase',
  authority: [
    'governance/structures/customer-workflow-fulfillment.md A14 (review follows payment)',
    'governance/structures/state-machines.md §12.1 (reviewed maps to done)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/dispatch/job.ts',
  layer: 'integration',
  siblings: ['P12-workflow-transition-composition', 'P68-completion-payment-authority', 'P82-review-submission-runtime'],
  mutation:
    'bypass the review DTO or change the reviewed-to-done projection; invalid input reaches the service or the closed-projection assertion turns red',
} as const satisfies PillarManifest

const JOB = 'f8200000-0000-4000-8000-000000000001'
const CUSTOMER = 'f8200000-0000-4000-8000-000000000002'
const REVIEW = 'f8200000-0000-4000-8000-000000000003'

function setup(role: 'customer' | 'worker' = 'customer') {
  const client = makeSequenceClient([])
  const submitReview = vi.fn(async (_ctx: MobileApiContext, jobId: string, _input: {
    rating: number
    tags?: string[]
    comment?: string
  }) => ({
    review_id: REVIEW,
    job_id: jobId,
    status: 'reviewed' as const,
  }))
  const services = Object.assign(createEdgeServices({}), { submitReview })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: CUSTOMER },
      role,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services,
  })

  return {
    submitReview,
    send: (body: Record<string, unknown>) => handler(new Request(
      `https://edge.test/jobs/${JOB}/review`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    )),
  }
}

describe('customer review public HTTP route and closed projection', () => {
  installEdgeRuntimeTestHooks()

  it('rejects an out-of-range rating before calling the review service', async () => {
    const { send, submitReview } = setup()
    const response = await send({ rating: 6, tags: ['clean'] })

    expect(response.status, pillarWhy(PILLAR)).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
    expect(submitReview).not.toHaveBeenCalled()
  })

  it('refuses a Worker before calling the Customer review service', async () => {
    const { send, submitReview } = setup('worker')
    const response = await send({ rating: 5, tags: [] })

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'CAPABILITY_FORBIDDEN' })
    expect(submitReview).not.toHaveBeenCalled()
  })

  it('uses the route job id and projects reviewed to the closed phase', async () => {
    const { send, submitReview } = setup()
    const response = await send({
      job_id: 'f8200000-0000-4000-8000-000000000099',
      rating: 5,
      tags: ['clean', 'on_time'],
      comment: 'Công việc hoàn tất tốt.',
    })

    expect(response.status, pillarWhy(PILLAR)).toBe(201)
    const body = await response.json() as { job_id: string; status: 'reviewed' }
    expect(body).toMatchObject({ review_id: REVIEW, job_id: JOB, status: 'reviewed' })
    expect(submitReview).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: CUSTOMER }, role: 'customer' }),
      JOB,
      { rating: 5, tags: ['clean', 'on_time'], comment: 'Công việc hoàn tất tốt.' },
    )
    expect(toWorkflowPhase(body.status), pillarWhy(PILLAR, 'reviewed is shown as transaction closed'))
      .toBe('done')
  })
})

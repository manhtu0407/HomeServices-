import { describe, expect, it } from 'vitest'
import {
  buildCustomerCancellationPhase0Outcome,
  classifyCustomerCancellationReason,
  determineCustomerCancellationSubCase,
  evaluateCustomerCancellationAbuse,
  recordCustomerCancellationReview,
  type CustomerCancellationExpectedCategory,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agentic/case-4-customer-cancel'

describe('Kael P12 customer cancellation case', () => {
  it('T12.2/3/4/5/6: determines all five customer cancellation sub-cases', () => {
    expect(determineCustomerCancellationSubCase({
      status: 'awaiting_customer_confirm',
      workerId: null,
      scheduledAt: null,
      now: '2026-05-26T00:00:00.000Z',
    }).subCase).toBe('before_a7')

    expect(determineCustomerCancellationSubCase({
      status: 'broadcasting',
      workerId: null,
      scheduledAt: null,
      now: '2026-05-26T00:00:00.000Z',
    }).subCase).toBe('after_a7_before_worker_accept')

    expect(determineCustomerCancellationSubCase({
      status: 'worker_matched',
      workerId: 'worker-1',
      scheduledAt: null,
      now: '2026-05-26T00:00:00.000Z',
    }).subCase).toBe('after_worker_accept')

    expect(determineCustomerCancellationSubCase({
      status: 'completed_by_worker',
      workerId: 'worker-1',
      scheduledAt: null,
      now: '2026-05-26T00:00:00.000Z',
    }).subCase).toBe('after_worker_completed_trigger_dispute')

    expect(determineCustomerCancellationSubCase({
      status: 'worker_matched',
      workerId: 'worker-1',
      scheduledAt: '2026-05-26T08:00:00.000Z',
      now: '2026-05-26T00:00:00.000Z',
    }).subCase).toBe('scheduled_job')
  })

  it('T12.7: classifies customer cancellation reasons by the P12 taxonomy', () => {
    const cases: Array<{ reason: string; expected: CustomerCancellationExpectedCategory }> = [
      { reason: 'Thợ đến trễ quá lâu nên tôi không thể chờ thêm.', expected: 'no_penalty_anytime' },
      { reason: 'Việc nhà tự hết sự cố rồi nên tôi muốn hủy.', expected: 'no_penalty_anytime' },
      { reason: 'Tôi đổi ý và muốn hủy trước khi thợ nhận.', expected: 'no_penalty_phase_0' },
      { reason: 'Tôi chọn nhầm dịch vụ, cần hủy để đặt lại.', expected: 'no_penalty_phase_0' },
      { reason: 'Tôi thấy thợ không đáng tin và muốn admin kiểm tra.', expected: 'needs_admin_review' },
      { reason: 'Không có lý do cụ thể.', expected: 'flag_suspicious' },
    ]

    for (const item of cases) {
      expect(classifyCustomerCancellationReason({ reason: item.reason }).category).toBe(item.expected)
    }
  })

  it('T12.4/Phase0: records goodwill without customer penalty or worker money promise', () => {
    const outcome = buildCustomerCancellationPhase0Outcome({
      subCase: 'after_worker_accept',
      reasonCode: 'changed_mind',
      workerId: 'worker-1',
    })

    expect(outcome.customerPenaltyAmount).toBeNull()
    expect(outcome.workerCompensationAmount).toBeNull()
    expect(outcome.phase0NoMonetaryPenalty).toBe(true)
    expect(outcome.workerGoodwill).toMatchObject({
      required: true,
      kind: 'phase0_goodwill_note',
      worker_id: 'worker-1',
    })
  })

  it('T12.8: anti-abuse thresholds create review requirements without autonomous blocks', () => {
    const abuse = evaluateCustomerCancellationAbuse({
      cancellations30d: 4,
      completedJobs30d: 10,
      cancelsAfterAccept30d: 3,
      sameDayCancels: 2,
      noReasonCancels30d: 3,
    })

    expect(abuse.adminReviewRequired).toBe(true)
    expect(abuse.signals).toEqual(expect.arrayContaining([
      'customer_cancellation_rate_exceeded',
      'cancel_after_accept_threshold',
      'same_day_cancel_threshold',
      'no_reason_cancel_threshold',
    ]))
    expect(abuse.trustSignalsPatch).toEqual(expect.objectContaining({
      customer_cancellation_abuse_review: true,
      require_specific_reason_next_booking: true,
      require_admin_verify_before_next_booking: true,
    }))
    expect(JSON.stringify(abuse)).not.toContain('temp_block')
    expect(JSON.stringify(abuse)).not.toContain('late_cancel_fee')
  })

  it('T12.9: records customer cancellation review with sanitized admin queue metadata', async () => {
    const client = makeSequenceClient([
      { data: { trust_signals: {}, safe_metadata: {} }, error: null },
      { data: { customer_id: 'customer-1' }, error: null },
      { data: { id: 'queue-1' }, error: null },
    ])
    const classification = classifyCustomerCancellationReason({
      reason: 'Số tôi 0901234567, tôi đổi ý và muốn hủy.',
    })
    const abuse = evaluateCustomerCancellationAbuse({
      cancellations30d: 4,
      completedJobs30d: 10,
      cancelsAfterAccept30d: 3,
      sameDayCancels: 2,
      noReasonCancels30d: 0,
    })

    await recordCustomerCancellationReview(client, {
      jobId: 'job-1',
      customerId: 'customer-1',
      workerId: 'worker-1',
      cancellationId: 'cancel-1',
      reason: 'Số tôi 0901234567, tôi đổi ý và muốn hủy.',
      subCase: 'after_worker_accept',
      classification,
      abuse,
      phase0Outcome: buildCustomerCancellationPhase0Outcome({
        subCase: 'after_worker_accept',
        reasonCode: classification.reasonCode,
        workerId: 'worker-1',
      }),
    })

    expect(client.calls.find((call) =>
      call.table === 'customer_kael_memory' &&
      call.operations.some((op) => op[0] === 'upsert')
    )?.operations).toContainEqual([
      'upsert',
      expect.objectContaining({
        customer_id: 'customer-1',
        trust_signals: expect.objectContaining({
          customer_cancellation_abuse_review: true,
        }),
      }),
    ])
    expect(client.calls.find((call) => call.table === 'kael_admin_queue')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        actor_id: 'customer-1',
        actor_role: 'customer',
        queue_type: 'customer_cancellation_review',
        priority: 'medium',
        escalation_level: 'soft',
      }),
    ])
    expect(JSON.stringify(client.calls)).not.toContain('0901234567')
  })
})

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }
type QueryCall = { table: string; operations: unknown[][] }

function makeSequenceClient(results: QueryResult[]) {
  const calls: QueryCall[] = []
  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, operations: [] }
      calls.push(call)
      return makeQuery(call, results)
    },
  }
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(value: string) {
      call.operations.push(['select', value])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    upsert(value: unknown) {
      call.operations.push(['upsert', value])
      return query
    },
    eq(column: string, value: unknown) {
      call.operations.push(['eq', column, value])
      return query
    },
    maybeSingle() {
      call.operations.push(['maybeSingle'])
      return query
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      const result = results.shift() ?? { data: null, error: null }
      return Promise.resolve(result).then(onfulfilled, onrejected)
    },
  }
  return query
}

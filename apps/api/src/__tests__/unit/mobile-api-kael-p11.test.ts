import { describe, expect, it } from 'vitest'
import {
  buildWorkerCancellationFallbackOptions,
  classifyWorkerCancellationReason,
  detectWorkerNoShow,
  evaluateWorkerCancellationAbuse,
  recordWorkerCancellationReview,
  type WorkerCancellationExpectedCategory,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agentic/case-3-worker-cancel'

describe('Kael P11 worker cancellation case', () => {
  it('T11.1/3/4/5: classifies explicit worker cancellation reasons by taxonomy', () => {
    expect(classifyWorkerCancellationReason({
      reason: 'Xe bị hỏng giữa đường, tôi có ảnh hiện trường và không thể đến tiếp.',
      evidencePhotoUrls: ['https://storage.example.test/job-media/vehicle.jpg'],
    })).toMatchObject({
      category: 'legit_auto_approve',
      reasonCode: 'vehicle_breakdown_with_photo',
      autoApprove: true,
      adminReviewRequired: false,
    })

    expect(classifyWorkerCancellationReason({
      reason: 'Việc thực tế phức tạp hơn mô tả, cần admin xem lại phạm vi.',
      evidencePhotoUrls: [],
    })).toMatchObject({
      category: 'legit_with_admin_review',
      reasonCode: 'job_more_complex_than_described',
      autoApprove: false,
      adminReviewRequired: true,
    })

    expect(classifyWorkerCancellationReason({
      reason: 'Tôi đổi ý vì có chỗ khác trả công cao hơn.',
      evidencePhotoUrls: [],
    })).toMatchObject({
      category: 'suspicious',
      reasonCode: 'higher_pay_elsewhere',
      autoApprove: false,
      adminReviewRequired: true,
    })

    expect(classifyWorkerCancellationReason({
      reason: '          ',
      evidencePhotoUrls: [],
    })).toMatchObject({
      category: 'no_reason',
      reasonCode: 'no_reason',
      autoApprove: false,
      adminReviewRequired: true,
    })
  })

  it('T11.2: detects no-show when matched status is stale or scheduled ETA has passed without on-way', () => {
    expect(detectWorkerNoShow({
      jobStatus: 'worker_matched',
      matchedAt: '2026-05-25T10:00:00.000Z',
      scheduledAt: null,
      now: '2026-05-25T10:16:00.000Z',
    })).toMatchObject({
      triggered: true,
      reasonCode: 'status_stuck_after_match',
      minutesLate: 16,
    })

    expect(detectWorkerNoShow({
      jobStatus: 'worker_matched',
      matchedAt: '2026-05-25T10:12:00.000Z',
      scheduledAt: '2026-05-25T10:00:00.000Z',
      now: '2026-05-25T10:20:00.000Z',
    })).toMatchObject({
      triggered: true,
      reasonCode: 'eta_past_no_on_way',
      minutesLate: 20,
    })

    expect(detectWorkerNoShow({
      jobStatus: 'worker_on_way',
      matchedAt: '2026-05-25T10:00:00.000Z',
      scheduledAt: '2026-05-25T10:00:00.000Z',
      now: '2026-05-25T10:30:00.000Z',
    })).toMatchObject({ triggered: false })
  })

  it('T11.7/8/9: emits fallback options and review-only anti-abuse flags without auto suspension', () => {
    const fallbackOptions = buildWorkerCancellationFallbackOptions()
    expect(fallbackOptions.map((option) => option.id)).toEqual([
      'wait_15_minutes',
      'reschedule',
      'cancel_no_charge',
    ])
    expect(fallbackOptions[0].label_vi).toContain('15 phút')
    expect(fallbackOptions[2]).toMatchObject({ no_charge_phase0: true })

    const abuse = evaluateWorkerCancellationAbuse({
      completedJobs30d: 10,
      cancellations30d: 4,
      consecutiveCancellations: 3,
      noReasonCancellations30d: 2,
      cancellationsAfterArrival30d: 1,
    })

    expect(abuse).toMatchObject({
      adminReviewRequired: true,
      queuePriority: 'medium',
      suspensionAction: 'admin_review_required',
      redFlagPatch: {
        worker_cancellation_abuse_review: true,
      },
    })
    expect(abuse.signals).toEqual(expect.arrayContaining([
      'cancellation_rate_exceeded',
      'consecutive_cancel_threshold',
      'no_reason_cancel_threshold',
      'cancel_after_arrival_threshold',
    ]))
    expect(JSON.stringify(abuse)).not.toContain('auto_suspend')
    expect(JSON.stringify(abuse)).not.toContain('is_suspended')
  })

  it('T11.8/9: records admin review queue and L4 red flag with safe metadata only', async () => {
    const client = makeSequenceClient([
      { data: { red_flags: { previous_flag: true }, reliability_signals: {}, safe_metadata: {} }, error: null },
      { data: { worker_id: 'worker-1' }, error: null },
      { data: { id: 'queue-1' }, error: null },
    ])
    const classification = classifyWorkerCancellationReason({
      reason: 'Tôi đổi ý vì có việc khác trả cao hơn.',
      evidencePhotoUrls: [],
    })
    const abuse = evaluateWorkerCancellationAbuse({
      completedJobs30d: 10,
      cancellations30d: 4,
      consecutiveCancellations: 3,
      noReasonCancellations30d: 0,
      cancellationsAfterArrival30d: 0,
    })

    await recordWorkerCancellationReview(client, {
      jobId: 'job-1',
      workerId: 'worker-1',
      cancellationId: 'cancel-1',
      reason: 'Số điện thoại tôi 0901234567, tôi đổi ý vì có việc khác trả cao hơn.',
      classification,
      abuse,
      subCase: 'explicit_cancel',
    })

    const memoryUpsert = client.calls.find((call) =>
      call.table === 'worker_kael_memory' &&
      call.operations.some((op) => op[0] === 'upsert')
    )?.operations.find((op) => op[0] === 'upsert')?.[1] as Record<string, unknown>
    expect(memoryUpsert).toMatchObject({
      worker_id: 'worker-1',
      red_flags: expect.objectContaining({
        previous_flag: true,
        worker_cancellation_abuse_review: true,
      }),
    })

    const queueInsert = client.calls.find((call) => call.table === 'kael_admin_queue')
      ?.operations.find((op) => op[0] === 'insert')?.[1] as Record<string, unknown>
    expect(queueInsert).toMatchObject({
      job_id: 'job-1',
      actor_id: 'worker-1',
      actor_role: 'worker',
      queue_type: 'worker_cancellation_review',
      priority: 'medium',
      escalation_level: 'soft',
      reason_code: classification.reasonCode,
    })
    expect(JSON.stringify(client.calls)).not.toContain('0901234567')
  })

  it('T11-quality: keeps scenario classification above the 95% case target', () => {
    const cases: Array<{
      reason: string
      evidencePhotoUrls?: string[]
      expected: WorkerCancellationExpectedCategory
    }> = [
      { reason: 'Tôi bị tai nạn nhẹ và có giấy xác nhận y tế.', evidencePhotoUrls: ['https://e.test/a.jpg'], expected: 'legit_auto_approve' },
      { reason: 'Gia đình có việc khẩn cấp đã xác nhận, tôi không thể tiếp tục.', evidencePhotoUrls: ['https://e.test/a.jpg'], expected: 'legit_auto_approve' },
      { reason: 'Xe máy bị hỏng, tôi gửi ảnh hiện trường.', evidencePhotoUrls: ['https://e.test/a.jpg'], expected: 'legit_auto_approve' },
      { reason: 'Khách mô tả thiếu, việc thực tế phức tạp hơn nhiều.', expected: 'legit_with_admin_review' },
      { reason: 'Điều kiện tại nhà không an toàn, có mùi khét và dây trần.', expected: 'legit_with_admin_review' },
      { reason: 'Tôi đến nơi nhưng khách không phản hồi cuộc gọi trong app.', expected: 'legit_with_admin_review' },
      { reason: 'Có chỗ khác trả cao hơn nên tôi không làm nữa.', expected: 'suspicious' },
      { reason: 'Tôi đổi ý, không muốn nhận việc này nữa.', expected: 'suspicious' },
      { reason: 'Tôi không tìm thấy địa chỉ nên hủy.', expected: 'suspicious' },
      { reason: '   ', expected: 'no_reason' },
    ]

    const correct = cases.filter((item) =>
      classifyWorkerCancellationReason({
        reason: item.reason,
        evidencePhotoUrls: item.evidencePhotoUrls ?? [],
      }).category === item.expected
    ).length

    expect(correct / cases.length).toBeGreaterThanOrEqual(0.95)
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
    select(columns?: string) {
      call.operations.push(['select', columns])
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
      const next = results.shift() ?? { data: null, error: null }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}

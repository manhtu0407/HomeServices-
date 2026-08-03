import { describe, expect, it } from 'vitest'
import {
  detectDemandingCustomerPatterns,
  type DemandingCustomerExpectedNuance,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/agentic/demanding-customer-detect'
import {
  buildDemandingCustomerResponse,
  recordDemandingCustomerInteraction,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/agentic/case-2-demanding'

describe('Kael P10 demanding customer case', () => {
  it('T10-test-1/2: separates detail-oriented concern from pressure and expands transparency', () => {
    const detection = detectDemandingCustomerPatterns({
      message: 'Tôi muốn xem bảng giá, lý do Kael tính mức này và chứng chỉ của thợ.',
      qaCount: 4,
      cancelCount: 0,
    })

    expect(detection).toMatchObject({
      nuance: 'detail_oriented',
      legitimateConcernSignals: expect.arrayContaining([
        'request_breakdown',
        'request_credentials',
      ]),
      pressureSignals: [],
      escalationLevel: 'none',
    })

    const response = buildDemandingCustomerResponse(detection, {
      priceReasoning: 'Kael dựa trên mức nền Quận 7, độ phức tạp medium và kiểm tra thị trường.',
      marketSource: 'market_baseline_hcmc',
      workerCredentials: { completedJobs: 12, rating: 4.8 },
    })

    expect(response.strategyIds).toEqual(expect.arrayContaining([
      'transparency_expansion',
      'defensive_documentation',
    ]))
    expect(response.showTransparency).toBe(true)
    expect(response.adminQueuePriority).toBe('none')
    expect(response.stopAiLoop).toBe(false)
    expect(response.responseText).toContain('Kael hiểu')
    expect(response.responseText).toContain('cơ sở')
  })

  it('T10-test-3: handles discount pressure with soft escalation and polite continuity', () => {
    const detection = detectDemandingCustomerPatterns({
      message: 'Giảm giá ngay cho tôi, chỗ khác rẻ hơn nhiều.',
      qaCount: 2,
      cancelCount: 0,
    })
    const response = buildDemandingCustomerResponse(detection)

    expect(detection.pressureSignals).toContain('demand_discount')
    expect(detection.pressureScore).toBeGreaterThanOrEqual(0.5)
    expect(response).toMatchObject({
      adminQueuePriority: 'medium',
      stopAiLoop: false,
      defensiveLogRequired: true,
    })
    expect(response.strategyIds).toEqual(expect.arrayContaining([
      'empathy_factual',
      'soft_escalation',
      'defensive_documentation',
    ]))
    expect(response.responseText).toContain('Quy trình')
  })

  it('T10-test-4/5: hard escalation stops AI loop without accusatory wording', () => {
    const detection = detectDemandingCustomerPatterns({
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
      qaCount: 5,
      cancelCount: 1,
    })
    const response = buildDemandingCustomerResponse(detection)

    expect(detection.pressureSignals).toEqual(expect.arrayContaining([
      'threat_complaint',
      'demand_refund_no_reason',
    ]))
    expect(response).toMatchObject({
      adminQueuePriority: 'high',
      stopAiLoop: true,
      defensiveLogRequired: true,
    })
    expect(response.responseText).toContain('admin')
    for (const forbidden of [
      'Bạn đang đe dọa',
      'Kael phát hiện bạn đang',
      'Yêu cầu của bạn không hợp lý',
      'Bạn đang lừa Kael',
      'Không thể chấp nhận',
      'Bạn cần bình tĩnh',
    ]) {
      expect(response.responseText).not.toContain(forbidden)
    }
  })

  it('T10-test-5b: repeated pressure after a long QA loop becomes hard escalation', () => {
    const detection = detectDemandingCustomerPatterns({
      message: 'Tôi đã hỏi nhiều lần rồi, giảm giá ngay cho tôi.',
      qaCount: 5,
      cancelCount: 0,
    })
    const response = buildDemandingCustomerResponse(detection)

    expect(detection.pressureSignals).toContain('demand_discount')
    expect(detection.escalationLevel).toBe('hard')
    expect(response).toMatchObject({
      adminQueuePriority: 'high',
      stopAiLoop: true,
    })
  })

  it('T10-test-5c: normalizes accented and unaccented Vietnamese pressure signals', () => {
    const accented = detectDemandingCustomerPatterns({
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại.',
      qaCount: 1,
    })
    const unaccented = detectDemandingCustomerPatterns({
      message: 'Hoan tien ngay khong toi se khieu nai.',
      qaCount: 1,
    })

    expect(accented.pressureSignals).toEqual(expect.arrayContaining([
      'demand_refund_no_reason',
      'threat_complaint',
    ]))
    expect(unaccented.pressureSignals).toEqual(accented.pressureSignals)
    expect(unaccented.escalationLevel).toBe('hard')
  })

  it.each([
    ['Tôi muốn xem thêm lựa chọn trước khi đặt thợ.', 'detail_oriented'],
    ['Ghế này bọc lụa nên cần vệ sinh nhẹ.', 'none'],
    ['Tôi sẽ trả tiền cho thợ sau khi xác nhận hoàn tất.', 'none'],
  ] as const)('does not hard-escalate benign Vietnamese wording: %s', (message, expectedNuance) => {
    const detection = detectDemandingCustomerPatterns({ message, qaCount: 1 })

    expect(detection.expectedNuance).toBe(expectedNuance)
    expect(detection.pressureSignals).toEqual([])
    expect(detection.escalationLevel).toBe('none')
  })

  it('renders demanding-customer responses in English when English mode is selected', () => {
    const detailDetection = detectDemandingCustomerPatterns({
      message: 'Tôi muốn xem lý do tính giá và chứng chỉ của thợ.',
      qaCount: 2,
    })
    const detail = buildDemandingCustomerResponse(detailDetection, {
      workerCredentials: { completedJobs: 8, rating: 4.7 },
      marketSource: 'governed_baseline',
    }, 'en')
    expect(detail.responseText).toContain('clear price explanation')
    expect(detail.responseText).toContain('available governed pricing evidence')
    expect(detail.responseText).not.toMatch(/[ăâđêôơưàáạảã]/iu)

    const hardDetection = detectDemandingCustomerPatterns({
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại.',
      qaCount: 5,
    })
    const hard = buildDemandingCustomerResponse(hardDetection, {}, 'en')
    expect(hard).toMatchObject({ adminQueuePriority: 'high', stopAiLoop: true })
    expect(hard.responseText).toContain('human support review')
    expect(hard.responseText).not.toContain('admin')
  })

  it('T10-test-6: records defensive interaction logs and admin queue rows with sanitized metadata', async () => {
    const client = makeSequenceClient([
      { data: { id: 'interaction-1' }, error: null },
      { data: { id: 'queue-1' }, error: null },
    ])
    const detection = detectDemandingCustomerPatterns({
      message: 'Số tôi 0901234567, email tu@example.com, giảm giá không tôi khiếu nại.',
      qaCount: 5,
      cancelCount: 0,
    })
    const response = buildDemandingCustomerResponse(detection)

    await recordDemandingCustomerInteraction(client, {
      jobId: 'job-1',
      actorId: 'customer-1',
      actorRole: 'customer',
      message: 'Số tôi 0901234567, email tu@example.com, giảm giá không tôi khiếu nại.',
      detection,
      response,
    })

    expect(client.calls[0]).toMatchObject({ table: 'kael_interaction_log' })
    expect(client.calls[0].operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        actor_id: 'customer-1',
        actor_role: 'customer',
        nuance: detection.nuance,
        escalation_level: detection.escalationLevel,
        sanitized_excerpt: expect.not.stringContaining('0901234567'),
      }),
    ])
    expect(client.calls[1]).toMatchObject({ table: 'kael_admin_queue' })
    expect(JSON.stringify(client.calls)).not.toContain('0901234567')
    expect(JSON.stringify(client.calls)).not.toContain('tu@example.com')
  })

  it('fails closed when the defensive interaction log cannot be persisted', async () => {
    const client = makeSequenceClient([
      { data: null, error: { code: 'INTERACTION_LOG_UNAVAILABLE' } },
    ])
    const detection = detectDemandingCustomerPatterns({
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại.',
      qaCount: 5,
    })

    await expect(recordDemandingCustomerInteraction(client, {
      jobId: 'job-1',
      actorId: 'customer-1',
      actorRole: 'customer',
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại.',
      detection,
      response: buildDemandingCustomerResponse(detection),
    })).rejects.toThrow('KAEL_DEMANDING_INTERACTION_LOG_FAILED')
    expect(client.calls.map((call) => call.table)).toEqual(['kael_interaction_log'])
  })

  it('fails closed when a promised demanding-customer escalation cannot enter the admin queue', async () => {
    const client = makeSequenceClient([
      { data: { id: 'interaction-1' }, error: null },
      { data: null, error: { code: 'ADMIN_QUEUE_UNAVAILABLE' } },
    ])
    const detection = detectDemandingCustomerPatterns({
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại.',
      qaCount: 5,
    })

    await expect(recordDemandingCustomerInteraction(client, {
      jobId: 'job-1',
      actorId: 'customer-1',
      actorRole: 'customer',
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại.',
      detection,
      response: buildDemandingCustomerResponse(detection),
    })).rejects.toThrow('KAEL_DEMANDING_ESCALATION_QUEUE_FAILED')
    expect(client.calls.map((call) => call.table)).toEqual([
      'kael_interaction_log',
      'kael_admin_queue',
    ])
  })

  it('T10-test-7: keeps detection accuracy above the Case 2 acceptance threshold', () => {
    const cases: Array<{ message: string; qaCount: number; expected: DemandingCustomerExpectedNuance }> = [
      { message: 'Cho tôi xem lý do tính giá và nguồn thị trường.', qaCount: 4, expected: 'detail_oriented' },
      { message: 'Thợ này có giấy tờ và kinh nghiệm chưa?', qaCount: 2, expected: 'detail_oriented' },
      { message: 'Có phương án nào khác trước khi đặt thợ không?', qaCount: 3, expected: 'detail_oriented' },
      { message: 'Tôi muốn hiểu chi tiết từng phần chi phí.', qaCount: 5, expected: 'detail_oriented' },
      { message: 'Giảm giá ngay cho tôi.', qaCount: 1, expected: 'pressure' },
      { message: 'Không hoàn tiền thì tôi khiếu nại.', qaCount: 4, expected: 'pressure' },
      { message: 'Dịch vụ thế này mà lấy tiền à?', qaCount: 5, expected: 'pressure' },
      { message: 'Tôi sẽ đăng bài nếu không xử lý.', qaCount: 3, expected: 'pressure' },
      { message: 'Tôi cần thợ đến đúng giờ vì nhà có trẻ nhỏ.', qaCount: 1, expected: 'detail_oriented' },
      { message: 'Hủy đi, tôi gọi chỗ khác rẻ hơn.', qaCount: 2, expected: 'pressure' },
    ]

    const correct = cases.filter((item) =>
      detectDemandingCustomerPatterns({
        message: item.message,
        qaCount: item.qaCount,
        cancelCount: 0,
      }).expectedNuance === item.expected
    ).length

    expect(correct / cases.length).toBeGreaterThanOrEqual(0.9)
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
    insert(value: unknown) {
      call.operations.push(['insert', value])
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

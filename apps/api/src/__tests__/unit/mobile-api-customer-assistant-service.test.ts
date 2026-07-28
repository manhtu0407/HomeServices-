import { afterEach, describe, expect, it } from 'vitest'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import { __resetRateLimitStoreForTests } from '../../../../../supabase/functions/mobile-api/_shared/rate-limit'
import { answerKaelAssistant } from '../../../../../supabase/functions/mobile-api/_shared/services/customer-assistant.service'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'

const customerId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'

describe('mobile-api customer assistant service', () => {
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
    __resetRateLimitStoreForTests()
  })

  it('answers only after loading the customer-owned active job from server state', async () => {
    openEducationalProviderCircuits()
    const { client, selections } = makeJobClient({
      id: jobId,
      status: 'awaiting_customer_confirm',
      customer_id: customerId,
      worker_id: null,
      service_type: 'hvac',
      description: 'Máy lạnh không mát',
      address_district: 'q7',
      kael_problem_identified: 'Khả năng cần vệ sinh và kiểm tra dàn lạnh',
      kael_complexity: 'small',
      kael_advisory: null,
      payment_status: null,
    })

    const result = await answerKaelAssistant(
      customerContext(client),
      {
        job_id: jobId,
        language: 'vi',
        message: 'Báo giá này gồm những gì?',
        surface: 'customer_case',
      },
      { knowledgeRetrievalEnabled: false },
    )

    expect(result.fallback_used).toBe(true)
    expect(result).not.toHaveProperty('trace')
    expect(selections).toContain('id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_advisory, payment_status')
  })

  it('hides a different customer job as not found', async () => {
    const { client } = makeJobClient({
      id: jobId,
      status: 'awaiting_customer_confirm',
      customer_id: '99999999-9999-4999-8999-999999999999',
      worker_id: null,
    })

    await expect(answerKaelAssistant(
      customerContext(client),
      {
        job_id: jobId,
        language: 'vi',
        message: 'Cho tôi xem hồ sơ này.',
        surface: 'customer_case',
      },
      {},
    )).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('rejects Case Work chat after the server job is terminal', async () => {
    const { client } = makeJobClient({
      id: jobId,
      status: 'cancelled',
      customer_id: customerId,
      worker_id: null,
    })

    await expect(answerKaelAssistant(
      customerContext(client),
      {
        job_id: jobId,
        language: 'vi',
        message: 'Đổi lại báo giá giúp tôi.',
        surface: 'customer_case',
      },
      {},
    )).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })
  })

  it('keeps the customer Case Work chat available after payment', async () => {
    const { client } = makeJobClient({
      id: jobId,
      status: 'paid',
      customer_id: customerId,
      worker_id: '33333333-3333-4333-8333-333333333333',
      service_type: 'electrical',
      payment_status: 'paid',
    })

    const result = await answerKaelAssistant(
      customerContext(client),
      {
        job_id: jobId,
        language: 'vi',
        message: 'Thanh toán đã hoàn tất. Tôi đang ở bước nào?',
        surface: 'customer_case',
      },
      {},
    )

    expect(result.answer).toBe(
      'Thanh toán đã được ghi nhận. Bạn có thể xem lại công việc hoàn thành trong ứng dụng.',
    )
  })

  it('rate-limits repeated customer assistant provider attempts', async () => {
    openEducationalProviderCircuits()
    const { client } = makeJobClient({
      id: jobId,
      status: 'awaiting_customer_confirm',
      customer_id: customerId,
      worker_id: null,
      service_type: 'electrical',
    })
    const request = () => answerKaelAssistant(
      customerContext(client),
      {
        job_id: jobId,
        language: 'vi' as const,
        message: 'Giải thích phạm vi giúp tôi.',
        surface: 'customer_case' as const,
      },
      { knowledgeRetrievalEnabled: false },
    )

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request()
    }
    await expect(request()).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
  })
})

function customerContext(client: unknown): MobileApiContext {
  return {
    success: true,
    user: { id: customerId },
    role: 'customer',
    supabase: client,
  }
}

function openEducationalProviderCircuits() {
  KAEL_CIRCUIT_BREAKER.recordFailure({
    purpose: 'educational_response',
    provider: 'deepseek',
    errorCode: 'HTTP_402',
  })
  KAEL_CIRCUIT_BREAKER.recordFailure({
    purpose: 'educational_response',
    provider: 'anthropic',
    errorCode: 'HTTP_402',
  })
}

function makeJobClient(row: Record<string, unknown>) {
  const selections: string[] = []
  const query = {
    select: (columns: string) => {
      selections.push(columns)
      return query
    },
    eq: () => query,
    single: () => Promise.resolve({ data: row, error: null }),
  }
  return {
    client: {
      from: () => query,
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
    selections,
  }
}

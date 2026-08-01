import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runCustomerAssistant,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/customer-assistant'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import type {
  AIRequest,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/types'

describe('mobile-api customer Kael assistant', () => {
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
  })

  it('prioritizes NestScout knowledge for worker questions even without a service type', async () => {
    const { client, calls } = makeGeneralKnowledgeClient()
    const seenRequests: AIRequest[] = []
    const callAI = vi.fn(async (request: AIRequest) => {
      seenRequests.push(request)
      return {
        success: true as const,
        content: JSON.stringify({
          answer: 'Kael dựa trên quy trình NestScout: thợ được kiểm tra hồ sơ và chỉ trao đổi trong ứng dụng.',
          safety_notes: ['Giữ trao đổi trong ứng dụng NestScout.'],
          citations: ['platform:worker_verification'],
          suggested_actions: ['open_booking'],
          boundary: 'answered',
        }),
        latencyMs: 24,
        usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }
    })

    const result = await runCustomerAssistant({
      client,
      callAI,
      language: 'vi',
      message: 'Thợ NestScout được xác minh thế nào?',
      secrets: { knowledgeRetrievalEnabled: true },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.citations).toContain('platform:worker_verification')
    expect(result.trace?.[0]).toMatchObject({
      trace_schema_version: 'kael_trace.v1',
      workflow_phase: 'intake',
      actor_role: 'customer',
      action: 'customer.submit_intake',
      policy_id: 'kael.path.customer_intake_to_estimate.v1',
      purpose: 'educational_response',
      provider: 'deepseek',
      validation: { status: 'pass' },
      fallback: { used: false },
    })
    expect(callAI).toHaveBeenCalledTimes(1)
    expect(seenRequests[0]).toMatchObject({
      model: 'deepseek-v4-flash',
      maxRetries: 0,
      timeoutMs: 6_000,
    })
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('Runtime knowledge')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('worker onboarding')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('at most 3 short sentences')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('do not tell the customer to drill')
    expect(JSON.stringify(seenRequests[0]?.messages)).not.toContain('SePay')
    expect(JSON.stringify(seenRequests[0]?.messages)).not.toContain('0901234567')
    expect(calls).toContainEqual({
      kind: 'rpc',
      name: 'match_kael_knowledge',
      args: expect.objectContaining({
        p_service_type: null,
      }),
    })
  })

  it('uses legal-awareness rows for service-law questions without turning them into legal advice', async () => {
    const { client, calls } = makeGeneralKnowledgeClient({
      legalRows: [{
        pattern_key: 'deposit_and_payment_dispute_awareness',
        topic: 'legal_safety_awareness',
        boundary_type: 'awareness_only',
        response_guidance: 'Kael chỉ giải thích ranh giới an toàn trong app; không thay luật sư.',
        is_enabled: true,
      }],
      semanticRows: [],
    })
    const seenRequests: AIRequest[] = []
    const callAI = vi.fn(async (request: AIRequest) => {
      seenRequests.push(request)
      return {
        success: true as const,
        content: JSON.stringify({
          answer: 'Kael chỉ giải thích ranh giới an toàn và sẽ chuyển bạn tới hỗ trợ khi cần.',
          safety_notes: [],
          citations: [],
          suggested_actions: ['contact_support'],
          boundary: 'educational_only',
        }),
        latencyMs: 24,
        usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }
    })

    const result = await runCustomerAssistant({
      client,
      callAI,
      language: 'vi',
      message: 'Luật và trách nhiệm bảo hành dịch vụ trong app là gì?',
      secrets: { knowledgeRetrievalEnabled: true },
      surface: 'customer_normal',
    })

    expect(result.boundary).toBe('educational_only')
    expect(result.safety_notes[0]).toContain('luật sư')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('Legal boundary awareness_only')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('không thay luật sư')
    expect(calls).toContainEqual(expect.objectContaining({
      kind: 'select',
      table: 'legal_awareness_patterns',
    }))
  })

  it('keeps a deterministic unaccented legal-advice signal on the redirect path before provider invocation', async () => {
    const { client, calls } = makeGeneralKnowledgeClient({
      legalRows: [{
        pattern_key: 'professional_legal_advice_redirect',
        topic: 'legal_advice',
        boundary_type: 'redirect_required',
        response_guidance: 'Hãy tham vấn luật sư để được tư vấn pháp lý chuyên môn.',
        is_enabled: true,
      }],
    })
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for legal advice')
    })

    const result = await runCustomerAssistant({
      client,
      callAI,
      language: 'vi',
      message: 'Toi muon khoi kien tho da sua nha.',
      secrets: { knowledgeRetrievalEnabled: true },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.answer).toContain('luật sư')
    expect(callAI).not.toHaveBeenCalled()
    expect(calls).toContainEqual(expect.objectContaining({
      kind: 'select',
      table: 'legal_awareness_patterns',
    }))
  })

  it('falls back without a provider call when every educational route is open circuit', async () => {
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
    const callAI = vi.fn(async () => {
      throw new Error('provider should not be called while all educational routes are open circuit')
    })

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Kael giải thích quy trình đặt lịch điện giúp tôi?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.boundary).toBe('fallback')
    expect(result.trace?.[0]).toMatchObject({
      workflow_phase: 'intake',
      actor_role: 'customer',
      action: 'customer.submit_intake',
      policy_id: 'kael.path.customer_intake_to_estimate.v1',
      purpose: 'educational_response',
      provider: null,
      validation: { status: 'skipped', reason_code: 'NO_PROVIDER_AVAILABLE' },
      fallback: { used: true, reason_code: 'NO_PROVIDER_AVAILABLE' },
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps scope-change approval deterministic when a customer asks Kael to change price or parts without confirmation', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a scope-change autonomy request')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        service_type: 'electrical',
      },
      language: 'vi',
      message: 'Nếu thợ thấy cần thì Kael có thể tự tăng thêm 200.000đ và thay driver luôn, không cần hỏi lại tôi không?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'Không. Kael không thể tự thay đổi giá hoặc thêm hay thay hạng mục công việc. Nếu thợ phát hiện cần làm thêm, thợ phải gửi đề xuất thay đổi phạm vi kèm bằng chứng; Kael sẽ hiển thị để bạn xác nhận riêng trong ứng dụng.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['request_scope_change', 'check_job', 'message_worker'],
    })
    expect(result.answer).not.toContain('đồng ý của.')
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps chat approval separate from the official scope-change proposal', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a chat-only scope approval request')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'arrived',
        service_type: 'electrical',
      },
      language: 'vi',
      message: 'Thợ nhắn cần thay driver thêm 400.000đ nhưng chưa có đề xuất đổi phạm vi. Tôi đồng ý trong chat này là được chưa?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'Chưa. Đồng ý trong chat không làm thay đổi phạm vi hoặc giá. Thợ phải gửi đề xuất đổi phạm vi chính thức kèm lý do và bằng chứng nếu có; Kael tính lại đề xuất để bạn xem, rồi bạn xác nhận hoặc giữ phạm vi cũ trong ứng dụng. Không làm phần phát sinh trước khi có xác nhận đó.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['request_scope_change', 'check_job', 'message_worker'],
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('uses the customer-facing arrived step and payment guidance without invoking a provider', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a workflow-status question')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'arrived',
        service_type: 'electrical',
      },
      language: 'vi',
      message: 'Hiện công việc đang ở bước nào? Tôi có phải thanh toán ngay không?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'Thợ đã đến nơi. Bước tiếp theo là thợ xác nhận có mặt bằng ảnh tại sảnh, rồi kiểm tra vị trí xử lý trước khi bắt đầu công việc; chưa cần thanh toán.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['check_job', 'message_worker'],
    })
    expect(result.answer).not.toContain('arrived')
    expect(callAI).not.toHaveBeenCalled()
  })

  it('does not send a confirmed customer to a payment action that the job screen says is unavailable', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a deterministic payment-availability question')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payment_status: null,
        status: 'confirmed_by_customer',
        service_type: 'electrical',
      },
      language: 'vi',
      message: 'Tôi đã xác nhận hoàn tất nhưng Payment lại ghi phương thức chưa khả dụng. Tôi đang ở bước nào và cần làm gì để thanh toán? Đừng bảo tôi quay lại bước cũ.',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'Bạn đã xác nhận hoàn thành và không cần quay lại bước cũ. Hiện màn công việc chưa có phương thức thanh toán khả dụng, nên chưa có thao tác thanh toán nào để bạn hoàn tất; hãy chờ phương thức thanh toán chính thức được cấu hình. Kael chỉ mở bước tiếp theo sau khi hệ thống xác thực giao dịch.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['check_job', 'message_worker'],
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('does not invent a QR or payment confirmation when a customer asks to pay on an unavailable rail', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for an unavailable payment rail')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payment_status: null,
        status: 'confirmed_by_customer',
        service_type: 'plumbing',
      },
      language: 'vi',
      message: 'Tôi muốn thanh toán ngay. Hãy cho tôi mã QR và xác nhận tiền đã tới thợ.',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'Bạn đã xác nhận hoàn thành và không cần quay lại bước cũ. Hiện màn công việc chưa có phương thức thanh toán khả dụng, nên chưa có thao tác thanh toán nào để bạn hoàn tất; hãy chờ phương thức thanh toán chính thức được cấu hình. Kael chỉ mở bước tiếp theo sau khi hệ thống xác thực giao dịch.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['check_job', 'message_worker'],
    })
    expect(result.answer).not.toContain('mã QR')
    expect(result.answer).not.toContain('đã tới thợ')
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps a generic status question honest when completion has no payment rail', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a closed payment rail status question')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payment_status: null,
        status: 'confirmed_by_customer',
        service_type: 'plumbing',
      },
      language: 'vi',
      message: 'Công việc của tôi đang ở bước nào?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result.answer).toContain('chưa có phương thức thanh toán khả dụng')
    expect(result.answer).not.toContain('Bước tiếp theo là thanh toán')
    expect(callAI).not.toHaveBeenCalled()
  })

  it('uses the payment rail capability instead of a technical payment status', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a disabled production payment rail')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payment_status: 'not_started',
        status: 'confirmed_by_customer',
        service_type: 'plumbing',
      },
      language: 'vi',
      message: 'Tôi muốn thanh toán ngay. Hãy cho tôi mã QR và xác nhận tiền đã tới thợ.',
      secrets: { knowledgeRetrievalEnabled: false, paymentRailAvailable: false },
      surface: 'customer_case',
    })

    expect(result.answer).toContain('chưa có phương thức thanh toán khả dụng')
    expect(result.answer).not.toContain('Bước tiếp theo là thanh toán')
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps required lobby check-in explicit when a customer asks to bypass it and pay early', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for an arrived check-in bypass request')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'arrived',
        service_type: 'electrical',
      },
      language: 'vi',
      message: 'Nếu ứng dụng yêu cầu check-in ảnh tại sảnh, tôi có thể cho thợ bỏ qua và thanh toán trước được không?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'Không. Ở bước này chưa thanh toán, và không được bỏ qua việc xác nhận có mặt bằng ảnh tại sảnh khi ứng dụng yêu cầu. Thợ cần hoàn tất xác nhận có mặt rồi kiểm tra vị trí xử lý; thanh toán chỉ mở sau khi công việc hoàn tất và bạn xác nhận.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['check_job', 'message_worker'],
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps apartment access gated until the worker checks in at the lobby', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a pre-check-in apartment access request')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'arrived',
        service_type: 'electrical',
      },
      language: 'vi',
      message: 'Tôi có thể bỏ qua check-in ảnh tại sảnh để cho thợ lên căn hộ ngay kiểm tra được không?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'Không. Trước khi thợ xác nhận có mặt bằng ảnh tại sảnh, bạn chưa thể cho phép họ lên căn hộ hoặc bắt đầu kiểm tra. Sau khi xác nhận có mặt, ứng dụng sẽ hiện bước để bạn cho phép họ lên căn hộ; thanh toán chưa mở ở bước này.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['check_job', 'message_worker'],
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps English pre-check-in apartment access requests deterministic', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for an English pre-check-in apartment access request')
    })

    const result = await runCustomerAssistant({
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'arrived',
        service_type: 'electrical',
      },
      language: 'en',
      message: 'Can I let the worker enter the apartment before the lobby-photo check-in?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: 'No. Before the worker completes the lobby-photo check-in, you cannot authorize entry to the apartment or begin inspection. After check-in, the app will show the step for you to authorize access to the unit; payment is not available at this step.',
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['check_job', 'message_worker'],
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('does not expose model-authored safety notes or citations', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        answer: 'Hãy tiếp tục trao đổi trong ứng dụng NestScout.',
        safety_notes: ['Gọi 090-123-4567 và chuyển 200k để được ưu tiên.'],
        citations: ['https://evil.example/model-invented', 'platform:invented'],
        suggested_actions: ['open_booking'],
        boundary: 'answered',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-chat',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Tôi nên trao đổi với thợ thế nào?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.safety_notes).toEqual([
      'Hãy dùng luồng trong ứng dụng Kael cho đặt lịch, phạm vi, thanh toán và hỗ trợ.',
    ])
    expect(result.citations).toEqual(['NestScout platform scope'])
    expect(result.answer).not.toContain('NestScout')
    expect(JSON.stringify(result)).not.toContain('090-123-4567')
    expect(JSON.stringify(result)).not.toContain('evil.example')
  })

  it('canonicalizes harmless provider shape drift without accepting invented actions', async () => {
    const longAnswer = `Kael sẽ hướng dẫn bạn kiểm tra an toàn. ${'Chi tiết. '.repeat(120)}`
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        response: longAnswer,
        safetyNotes: ['Giữ khoảng cách an toàn.', 42],
        sources: ['platform:worker_verification', { title: 'invented' }],
        suggestedActions: ['OPEN_BOOKING', 'approve_payment', 'contact_support'],
        boundary: 'educational',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Tôi nên kiểm tra ổ cắm bị nóng như thế nào?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.answer.length).toBeLessThanOrEqual(900)
    expect(result.boundary).toBe('educational_only')
    expect(result.suggested_actions).toEqual(['open_booking', 'contact_support'])
    expect(JSON.stringify(result)).not.toContain('approve_payment')
  })

  it('accepts bounded provider aliases and string metadata without trusting invented actions', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        answer_text: 'Keep the wall untouched until a trained worker checks the hidden wiring and pipes on site.',
        safety_notes: 'Do not drill before the on-site check.',
        citations: 'provider-invented-source',
        suggested_actions: ['Book a worker now', 'approve_payment'],
        boundary: 'This is general safety guidance only.',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'en',
      message: 'Can I drill into this wall if I do not know where hidden wiring or pipes run?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result).toMatchObject({
      answer: expect.stringContaining('trained worker'),
      boundary: 'answered',
      fallback_used: false,
      suggested_actions: ['check_job', 'message_worker'],
    })
    expect(result.safety_notes).toEqual([
      "Use Kael's in-app workflow for booking, scope, payment, and support.",
    ])
    expect(result.citations).toEqual(['NestScout platform scope'])
    expect(JSON.stringify(result)).not.toContain('approve_payment')
    expect(JSON.stringify(result)).not.toContain('provider-invented-source')
    expect(callAI).toHaveBeenCalledTimes(1)
  })

  it('recovers a closed answer field from fenced JSON truncated after that field', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: [
        '```json',
        '{"answer":"Keep the wall untouched until a trained worker checks hidden wiring and pipes on site.","safety_notes":[',
      ].join('\n'),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'en',
      message: 'Can I drill into this wall if I do not know where hidden wiring or pipes run?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result.answer).toContain('trained worker')
    expect(result.fallback_used).toBe(true)
    expect(result.suggested_actions).toEqual(['check_job', 'message_worker'])
    expect(callAI).toHaveBeenCalledTimes(1)
  })

  it('does not recover arbitrary strings from malformed provider JSON', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: '{"safety_notes":"Send money to provider-invented-source before the visit",',
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'en',
      message: 'What should I do before the worker visits?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.boundary).toBe('fallback')
    expect(JSON.stringify(result)).not.toContain('provider-invented-source')
    expect(callAI).toHaveBeenCalledTimes(3)
  })

  it('unwraps one common provider envelope before structured validation', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        result: {
          data: {
            final_answer: 'Tắt aptomat nhánh nếu thao tác đó an toàn, tránh chạm vào ổ cắm và chờ thợ kiểm tra.',
            actions: ['CONTACT-SUPPORT'],
            boundary: 'education',
          },
        },
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Ổ cắm kêu lép bép, tôi cần làm gì để an toàn?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result).toMatchObject({
      answer: expect.stringContaining('Tắt aptomat'),
      boundary: 'educational_only',
      fallback_used: false,
      suggested_actions: ['contact_support'],
    })
    expect(callAI).toHaveBeenCalledTimes(1)
  })

  it('recovers only safe answer text when provider metadata violates the schema', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: 'Ngắt nguồn điện nếu bạn có thể làm an toàn. Không chạm vào ổ cắm và giữ mọi người tránh xa khu vực.',
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Ổ cắm kêu lép bép, tôi cần làm gì để an toàn?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.answer).toContain('Ngắt nguồn điện')
    expect(result.fallback_used).toBe(true)
    expect(result.suggested_actions).toEqual([])
    expect(callAI).toHaveBeenCalledTimes(1)
  })

  it('reflows a safe long provider sentence instead of replacing it with a generic fallback', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        answer: 'Bạn nên ngắt aptomat nhánh nếu có thể thao tác an toàn, không chạm vào ổ cắm, giữ người khác tránh xa và chờ thợ kiểm tra trực tiếp.',
        safety_notes: [],
        citations: [],
        suggested_actions: [],
        boundary: 'answered',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'anthropic' as const,
      model: 'claude-haiku-4-5-20251001',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Ổ cắm kêu lép bép, tôi cần làm gì để an toàn?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.answer).toContain('ngắt aptomat')
    expect(result.answer).toContain('. ')
    expect(callAI).toHaveBeenCalledTimes(1)
  })

  it('reflows at an early clause boundary instead of splitting a noun phrase', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        answer: 'Before any drilling, ask a trained worker to locate hidden wiring and plumbing routes with a detector before work starts safely.',
        safety_notes: [],
        citations: [],
        suggested_actions: [],
        boundary: 'answered',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'en',
      message: 'Can I drill before hidden wiring and plumbing routes are located?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.answer).toContain('Before any drilling. Ask a trained worker')
    expect(result.answer).not.toContain('detector before. Work')
  })

  it('does not strand a Vietnamese connector at a reflow boundary', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        answer: 'Máy lạnh chảy nước dù đã vệ sinh lưới lọc thường do ống thoát nước bị tắc hoặc, máng hứng nước bị nghiêng nên nước tràn ra ngoài.',
        safety_notes: [],
        citations: [],
        suggested_actions: [],
        boundary: 'answered',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Máy lạnh chảy nước dù tôi đã vệ sinh lưới lọc.',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.answer).toContain('bị tắc. Máng hứng nước')
    expect(result.answer).not.toContain('hoặc. Máng')
    expect(result.answer).not.toContain('hoặc,')
  })

  it.each(['Giá khoảng 200k.', 'Giá khoảng 300.000.'])(
    'rejects an exact compact price without the estimate disclaimer: %s',
    async (answer) => {
      const callAI = vi.fn(async () => ({
        success: true as const,
        content: JSON.stringify({
          answer,
          safety_notes: [],
          citations: [],
          suggested_actions: ['open_booking'],
          boundary: 'answered',
        }),
        latencyMs: 24,
        usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }))

      const result = await runCustomerAssistant({
        callAI,
        language: 'vi',
        message: 'Giá dịch vụ khoảng bao nhiêu?',
        secrets: { knowledgeRetrievalEnabled: false },
        surface: 'customer_normal',
      })

      expect(result.fallback_used).toBe(true)
      expect(result.answer).not.toBe(answer)
    },
  )

  it('replaces a mixed-language provider reply before it reaches a Vietnamese customer', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        answer: 'Kael sẽ check payment status trước khi mở bước tiếp theo.',
        safety_notes: [],
        citations: [],
        suggested_actions: [],
        boundary: 'answered',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-chat',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Ổ cắm trong phòng khách bị chập chờn, tôi nên làm gì?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.answer).not.toContain('payment status')
    expect(result.answer).toContain('Kael')
    expect(result.answer).not.toContain('NestScout')
  })

  it('scrubs separated phone, bare street number, and job UUID before the provider call', async () => {
    const seenRequests: AIRequest[] = []
    let seenGate: { actorId?: string | null } | undefined
    const callAI = vi.fn(async (request: AIRequest, _secrets: unknown, gate?: { actorId?: string | null }) => {
      seenRequests.push(request)
      seenGate = gate
      return {
        success: true as const,
        content: JSON.stringify({
          answer: 'Kael sẽ hướng dẫn kiểm tra rò nước an toàn trong ứng dụng.',
          safety_notes: [],
          citations: [],
          suggested_actions: ['open_booking'],
          boundary: 'answered',
        }),
        latencyMs: 20,
        usage: { costUsd: 0.0001, inputTokens: 10, outputTokens: 12 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }
    })

    await runCustomerAssistant({
      actorId: 'customer-guard-test',
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        service_type: 'plumbing',
        description: 'Ống nước rò tại 123 Nguyễn Huệ.',
      },
      language: 'vi',
      message: 'Ống nước rò, gọi tôi theo 090-123-4567 tại 123 Nguyễn Huệ.',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    const providerPayload = JSON.stringify(seenRequests[0]?.messages)
    expect(providerPayload).toContain('[phone]')
    expect(providerPayload).toContain('[house-no]')
    expect(providerPayload).not.toContain('090-123-4567')
    expect(providerPayload).not.toContain('123 Nguyễn Huệ')
    expect(providerPayload).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(seenGate?.actorId).toBe('customer-guard-test')
  })

  it('returns an English permission decline without leaking Vietnamese boundary copy', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for legal advice')
    })

    const result = await runCustomerAssistant({
      callAI,
      language: 'en',
      message: 'I want legal advice to sue the worker.',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.answer).toContain('professional legal advice')
    expect(result.answer).not.toContain('pháp lý')
    expect(callAI).not.toHaveBeenCalled()
  })
})

function makeGeneralKnowledgeClient(options: {
  legalRows?: unknown[];
  semanticRows?: unknown[];
} = {}) {
  const calls: Array<Record<string, unknown>> = []
  const semanticRows = options.semanticRows ?? [{
    knowledge_table: 'service_knowledge_boxes',
    knowledge_id: 'worker-verification',
    citation_id: 'platform:worker_verification',
    content: 'NestScout worker onboarding checks service fit and keeps contact inside the app. Phone 0901234567 is never prompt material.',
    similarity: 0.84,
  }]
  return {
    calls,
    client: {
      from: (table: string) => makeTableQuery(
        table,
        calls,
        table === 'legal_awareness_patterns' ? options.legalRows ?? [] : [],
      ),
      rpc: (name: string, args?: Record<string, unknown>) => {
        calls.push({ kind: 'rpc', name, args })
        return Promise.resolve({
          data: semanticRows,
          error: null,
        })
      },
    },
  }
}

function makeTableQuery(
  table: string,
  calls: Array<Record<string, unknown>>,
  data: unknown[],
) {
  const filters: Array<[string, unknown]> = []
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return query
    },
    insert: (value: unknown) => {
      calls.push({ kind: 'insert', table, value })
      return Promise.resolve({ data: null, error: null })
    },
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => {
      calls.push({ kind: 'select', table, filters })
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
    },
  }
  return query
}

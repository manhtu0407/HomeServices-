import { describe, expect, it, vi } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/router'

const customerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'customer',
  supabase: {},
}

const workerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '33333333-3333-4333-8333-333333333333' },
  role: 'worker',
  supabase: {},
}

const adminAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '99999999-9999-4999-8999-999999999999' },
  role: 'admin',
  supabase: {},
}

function makeServices(overrides: Partial<MobileApiServices> = {}): MobileApiServices {
  return {
    getKaelCharter: vi.fn(async () => ({
      charter_version: '2026-05-25.p8',
      identity_summary: 'Kael is the NestScout assistant.',
      locked_files: ['identity.md', 'persona.md', 'mission-values.md'],
      tunable_files: ['tone-matrix.yaml', 'language-rules.md', 'forbidden-language.json', 'style-guidelines.md'],
      forbidden_categories: ['ai_self_reference'],
      mission_values: ['Trust'],
    })),
    listServices: vi.fn(async () => ({ services: [] })),
    placesAutocomplete: vi.fn(async () => ({ suggestions: [], fallback_used: false })),
    resolvePlace: vi.fn(async () => ({
      fallback_used: true,
      label: null,
      location: null,
      place_id: 'fallback',
      provider: 'fallback' as const,
    })),
    getVietmapStaticMap: vi.fn(async () => new Response(new ArrayBuffer(0), {
      headers: { 'Content-Type': 'image/png' },
    })),
    createJob: vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'broadcasting' as const,
      estimate: {
        service_type: 'electrical' as const,
        problem_category: 'outlet_or_switch_broken',
        problem_summary: 'Ổ cắm cần kiểm tra',
        complexity: 'medium' as const,
        price_min: 100000,
        price_max: 250000,
        confidence: 0.5,
        advisory: null,
        disclaimer:
          'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.',
      },
      final_price: 250000,
      fallback_used: false,
    })),
    getJob: vi.fn(),
    listCustomerActiveJobs: vi.fn(),
    createKaelChat: vi.fn(),
    createKaelChatMediaUpload: vi.fn(async () => ({
      bucket_id: 'kael-chat-media' as const,
      object_path: '11111111-1111-4111-8111-111111111111/kael-chat/photo.jpg',
      media_ref: 'supabase://kael-chat-media/11111111-1111-4111-8111-111111111111/kael-chat/photo.jpg',
      token: 'upload-token',
      signed_upload_url: 'https://storage.example.test/upload/sign/photo.jpg',
      expires_in_seconds: 7200,
    })),
    answerKaelAssistant: vi.fn(),
    getKaelChat: vi.fn(),
    getKaelChatProgress: vi.fn(async () => ({
      session_id: 'session-1',
      progress: {
        current_stage: 'market_lookup',
        status: 'running' as const,
        progress: 0.32,
        failure_reason: null,
        updated_at: '2026-06-04T00:00:00.000Z',
      },
    })),
    streamKaelChatTurn: vi.fn(async () => new Response(new ReadableStream(), {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })),
    sendKaelChatTurn: vi.fn(),
    submitKaelChatEvidence: vi.fn(),
    confirmKaelChat: vi.fn(),
    confirmSearch: vi.fn(),
    cancelJob: vi.fn(),
    acceptBroadcast: vi.fn(),
    declineBroadcast: vi.fn(),
    updateJobStatus: vi.fn(),
    requestScopeChange: vi.fn(),
    askKaelForWorker: vi.fn(),
    createWorkerKaelChat: vi.fn(),
    listWorkerKaelChats: vi.fn(),
    getWorkerKaelChat: vi.fn(),
    sendWorkerKaelChatTurn: vi.fn(),
    submitWorkerKaelFeedback: vi.fn(),
    getWorkerKaelTrainingConsent: vi.fn(),
    setWorkerKaelTrainingConsent: vi.fn(),
    decideScopeChange: vi.fn(),
    requestCustomerCancellation: vi.fn(),
    requestWorkerCancellation: vi.fn(),
    openDispute: vi.fn(),
    submitDisputeCounterStatement: vi.fn(),
    decideDispute: vi.fn(),
    attachJobMedia: vi.fn(),
    listJobMessages: vi.fn(),
    sendJobMessage: vi.fn(),
    decideWorkerCancellation: vi.fn(),
    confirmCompletion: vi.fn(),
    createPaymentIntent: vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'payment_pending' as const,
      payment: {
        provider: 'sepay_vietqr' as const,
        status: 'vietqr_ready' as const,
        gross_amount: 250000,
        platform_fee: 25000,
        worker_net: 225000,
        payment_code: 'NSMOH260001',
        transfer_content: 'NestScout NSMOH260001',
        qr_image_url: 'https://qr.sepay.vn/img?acc=redacted',
        expires_at: '2026-06-14T00:30:00.000Z',
        received_at: null,
        amount_received: null,
        updated_at: '2026-06-14T00:00:00.000Z',
      },
    })),
    handleSepayWebhook: vi.fn(async () => ({ success: true as const })),
    submitReview: vi.fn(),
    submitCustomerKaelFeedback: vi.fn(),
    submitWorkerApplication: vi.fn(),
    registerWorker: vi.fn(),
    getMyKaelMemory: vi.fn(),
    updateMyCustomerKaelMemoryPreference: vi.fn(async () => ({
      memory: null,
      subject_type: 'customer' as const,
    })),
    updateMyWorkerKaelMemoryPreference: vi.fn(async () => ({
      memory: null,
      subject_type: 'worker' as const,
    })),
    getCustomerProfileInsights: vi.fn(),
    getCustomerPaymentMethod: vi.fn(async () => ({ payment_method: null })),
    saveCustomerPaymentMethod: vi.fn(async () => ({
      payment_method: {
        account_holder_name: 'PHAN MANH TU',
        bank_account_masked: '**** 6789',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
        id: '92000000-0000-0000-0000-000000000001',
        is_default: true,
        status: 'pending_verification' as const,
        updated_at: '2026-06-27T00:00:00.000Z',
        verified_at: null,
      },
    })),
    saveWorkerPayoutMethod: vi.fn(async () => ({
      payout_method: {
        account_holder_name: 'PHAN MANH TU',
        bank_account_masked: '****6789',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
        status: 'pending_verification' as const,
        updated_at: '2026-06-29T00:00:00.000Z',
      },
      worker_profile: {
        bank_account_masked: '****6789',
        bank_name: 'Techcombank',
        date_of_birth: null,
        districts: [],
        gender: null,
        has_cccd: false,
        has_selfie: false,
        home_lat: null,
        home_lng: null,
        id: '33333333-3333-4333-8333-333333333333',
        is_approved: true,
        is_available: false,
        is_suspended: false,
        legal_name: null,
        problem_specializations: [],
        rating: 0,
        service_radius_km: null,
        service_types: [],
        total_jobs: 0,
        verification_status: 'approved' as const,
        years_experience: 0,
      },
    })),
    getWorkerKaelMemory: vi.fn(),
    deleteMyKaelMemory: vi.fn(),
    getWorkerProfile: vi.fn(),
    getWorkerPerformanceInsights: vi.fn(),
    updateWorkerAvailability: vi.fn(),
    updateWorkerServiceArea: vi.fn(),
    listWorkerBroadcasts: vi.fn(),
    listWorkerJobs: vi.fn(),
    streamWorkerKaelChatTurn: vi.fn(async () => new Response(new ReadableStream(), {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })),
    getWorkerEarnings: vi.fn(),
    invalidateMarketCache: vi.fn(),
    processKaelLearningQueue: vi.fn(async () => ({ selected: 0, submitted: 0, realtime_fallback: 0 })),
    processKaelBatchResults: vi.fn(async () => ({ checked: 0, ended: 0, processed_items: 0, failed_items: 0 })),
    monitorKaelLearningRules: vi.fn(async () => ({ checked: 0, monitored: 0, rolled_back: 0 })),
    listKaelLearningCandidates: vi.fn(async () => ({ candidates: [] })),
    approveKaelLearningCandidate: vi.fn(async () => ({
      ok: true,
      candidate_id: 'candidate-1',
      rule_id: 'rule-1',
      rule_version: 1,
      status: 'auto_promoted',
      knowledge_apply: null,
    })),
    rejectKaelLearningCandidate: vi.fn(async () => ({
      ok: true,
      candidate_id: 'candidate-1',
      status: 'archived',
    })),
    evaluatePriceSynthesisAbCase: vi.fn(async () => ({
      case_key: 'router-test-case',
      purpose: 'price_synthesis' as const,
      perplexity: {
        provider: 'perplexity' as const,
        model: 'sonar',
        schema_valid: true,
        price_min: 100000,
        price_max: 200000,
        confidence: 0.6,
        failure_reason: null,
        input_tokens: 10,
        output_tokens: 10,
        cost_usd: 0.0001,
        latency_ms: 100,
      },
      anthropic: {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-6',
        schema_valid: true,
        price_min: 100000,
        price_max: 200000,
        confidence: 0.6,
        failure_reason: null,
        input_tokens: 10,
        output_tokens: 10,
        cost_usd: 0.0001,
        latency_ms: 100,
      },
      fallback_used: false,
    })),
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    registerDevicePushToken: vi.fn(),
    ...overrides,
  }
}

describe('mobile-api Edge router contract', () => {
  it('answers OPTIONS preflight without auth', async () => {
    const authenticate = vi.fn()
    const handler = createMobileApiHandler({ authenticate, services: makeServices() })

    const response = await handler(new Request('https://example.test/functions/v1/mobile-api/services', {
      method: 'OPTIONS',
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('normalizes Supabase function prefixes before route matching', async () => {
    const listServices = vi.fn(async () => ({ services: [] }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listServices }),
    })

    const response = await handler(new Request('https://example.test/functions/v1/mobile-api/services'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ services: [] })
    expect(listServices).toHaveBeenCalledOnce()
  })

  it('does not turn malformed encoded path segments into 500s', async () => {
    const getJob = vi.fn()
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ getJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/%E0%A4%A'))

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(authenticate).not.toHaveBeenCalled()
    expect(getJob).not.toHaveBeenCalled()
  })

  it('returns AUTH_MISSING before protected route handlers run', async () => {
    const listServices = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async (): Promise<MobileApiAuthResult> => ({
        success: false,
        status: 401,
        error: 'Vui lòng đăng nhập',
      })),
      services: makeServices({ listServices }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/services'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
    })
    expect(listServices).not.toHaveBeenCalled()
  })

  it('routes notification inbox through authenticated mobile API services', async () => {
    const listNotifications = vi.fn(async () => ({
      unread_count: 1,
      notifications: [{
        id: 'notification-1',
        title: 'Kael',
        body: 'Có cập nhật mới',
        event_type: 'job_update',
        status: 'sent',
        job_id: null,
        created_at: '2026-05-19T00:00:00.000Z',
        read_at: null,
      }],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listNotifications }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/notifications'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ unread_count: 1 })
    expect(listNotifications).toHaveBeenCalledWith(expect.objectContaining({ role: 'customer' }))
  })

  it('routes notification read receipts through authenticated mobile API services', async () => {
    const markNotificationRead = vi.fn(async () => ({
      notification_id: 'notification-1',
      status: 'read' as const,
      read_at: '2026-05-19T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ markNotificationRead }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/notifications/notification-1/read', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'read' })
    expect(markNotificationRead).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'notification-1',
    )
  })

  it('routes customer profile feedback through authenticated mobile API services', async () => {
    const submitCustomerKaelFeedback = vi.fn(async () => ({
      feedback_id: 'feedback-1',
      status: 'new' as const,
      created_at: '2026-06-02T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ submitCustomerKaelFeedback }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/kael-feedback', {
      body: JSON.stringify({
        language: 'vi',
        message: 'Kael cần giải thích biên giá rõ hơn.',
        source: 'profile',
      }),
      method: 'POST',
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ feedback_id: 'feedback-1', status: 'new' })
    expect(submitCustomerKaelFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      {
        language: 'vi',
        message: 'Kael cần giải thích biên giá rõ hơn.',
        source: 'profile',
      },
    )
  })

  it('rejects short customer profile feedback before service dispatch', async () => {
    const submitCustomerKaelFeedback = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ submitCustomerKaelFeedback }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/kael-feedback', {
      body: JSON.stringify({ message: 'short' }),
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
    expect(submitCustomerKaelFeedback).not.toHaveBeenCalled()
  })

  it('routes worker Kael clarification through the job-scoped worker endpoint', async () => {
    const askKaelForWorker = vi.fn(async () => ({
      qa_id: 'qa-1',
      job_id: 'job-1',
      remaining_questions: 2,
      answer: {
        schema_version: 'worker_qa_answer.v1' as const,
        text: 'Kael gợi ý kiểm tra phần phát sinh và chụp ảnh rõ.',
        safety_notes: ['Không bắt đầu phần phát sinh khi Kael chưa quyết định hoặc chưa có override hợp lệ.'],
      },
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ askKaelForWorker }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/kael-clarify', {
      method: 'POST',
      body: JSON.stringify({ question: 'Tôi nên giải thích phát sinh thế nào?' }),
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ qa_id: 'qa-1', remaining_questions: 2 })
    expect(askKaelForWorker).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'job-1',
      { question: 'Tôi nên giải thích phát sinh thế nào?' },
    )
  })

  it('routes P12 customer cancellation through the job-scoped customer endpoint', async () => {
    const requestCustomerCancellation = vi.fn(async () => ({
      cancellation_id: 'cancel-1',
      job_id: 'job-1',
      status: 'cancelled',
      job_status: 'cancelled' as const,
      sub_case: 'after_worker_accept',
      reason_code: 'changed_mind',
      reason_category: 'no_penalty_phase_0',
      admin_review_required: true,
      phase0_no_monetary_penalty: true,
      worker_goodwill: { required: true, kind: 'phase0_goodwill_note' },
      abuse_signals: [],
      message: 'Kael đã ghi nhận yêu cầu hủy.',
      created_at: '2026-05-26T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ requestCustomerCancellation } as Partial<MobileApiServices>),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/customer-cancellation', {
      method: 'POST',
      body: JSON.stringify({
        reason_code: 'changed_mind',
        reason_note: 'Tôi đổi ý và muốn hủy lịch này.',
      }),
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      cancellation_id: 'cancel-1',
      phase0_no_monetary_penalty: true,
    })
    expect(requestCustomerCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'job-1',
      expect.objectContaining({
        reason_code: 'changed_mind',
        reason_note: 'Tôi đổi ý và muốn hủy lịch này.',
      }),
    )
  })

  it('routes P13 dispute open through the job-scoped endpoint', async () => {
    const openDispute = vi.fn(async () => ({
      dispute_id: 'dispute-1',
      job_id: 'job-1',
      status: 'open',
      dispute_type: 'completion_rejected',
      evidence_snapshot_id: 'snapshot-1',
      admin_review_required: true,
      priority: 'high',
      evidence_locked_at: '2026-05-26T00:00:00.000Z',
      message: 'Dispute opened for admin review.',
      created_at: '2026-05-26T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ openDispute } as Partial<MobileApiServices>),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/disputes', {
      method: 'POST',
      body: JSON.stringify({
        dispute_type: 'completion_rejected',
        initiator_statement: 'Cong viec chua hoan tat nhu thong tin ban dau.',
        evidence_photo_urls: ['supabase://job-media/job-1/after/a.jpg'],
      }),
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      dispute_id: 'dispute-1',
      evidence_snapshot_id: 'snapshot-1',
    })
    expect(openDispute).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'job-1',
      expect.objectContaining({ dispute_type: 'completion_rejected' }),
    )
  })

  it('routes P13 counter statement and admin decision through dispute endpoints', async () => {
    const submitDisputeCounterStatement = vi.fn(async () => ({
      dispute_id: 'dispute-1',
      status: 'admin_review',
      counter_party_statement_submitted: true,
      updated_at: '2026-05-26T00:30:00.000Z',
    }))
    const decideDispute = vi.fn(async () => ({
      dispute_id: 'dispute-1',
      status: 'admin_decided',
      outcome: 'no_fault_both',
      decided_at: '2026-05-26T01:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async (request) =>
        request.url.includes('admin-decision') ? adminAuth : workerAuth
      ),
      services: makeServices({
        submitDisputeCounterStatement,
        decideDispute,
      } as Partial<MobileApiServices>),
    })

    const counterResponse = await handler(new Request('https://example.test/mobile-api/disputes/dispute-1/counter-statement', {
      method: 'POST',
      body: JSON.stringify({ statement: 'Toi da lam dung pham vi ban dau.' }),
    }))
    const decisionResponse = await handler(new Request('https://example.test/mobile-api/disputes/dispute-1/admin-decision', {
      method: 'POST',
      body: JSON.stringify({
        outcome: 'no_fault_both',
        customer_trust_impact: 'none',
        worker_action: 'none',
        reasoning: 'Admin reviewed the locked evidence and found no clear fault from either party.',
      }),
    }))

    expect(counterResponse.status).toBe(200)
    expect(decisionResponse.status).toBe(200)
    expect(submitDisputeCounterStatement).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'dispute-1',
      { statement: 'Toi da lam dung pham vi ban dau.' },
    )
    expect(decideDispute).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      'dispute-1',
      expect.objectContaining({ outcome: 'no_fault_both' }),
    )
  })

  it('routes Kael memory self-view and deletion through authenticated services', async () => {
    const getMyKaelMemory = vi.fn(async () => ({ subject_type: 'customer' as const, memory: null }))
    const deleteMyKaelMemory = vi.fn(async () => ({ subject_type: 'customer' as const, deleted: true as const }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ getMyKaelMemory, deleteMyKaelMemory }),
    })

    const getResponse = await handler(new Request('https://example.test/mobile-api/me/kael-memory'))
    const deleteResponse = await handler(new Request('https://example.test/mobile-api/me/kael-memory', {
      method: 'DELETE',
    }))

    expect(getResponse.status).toBe(200)
    expect(deleteResponse.status).toBe(200)
    expect(getMyKaelMemory).toHaveBeenCalledWith(expect.objectContaining(customerAuth))
    expect(deleteMyKaelMemory).toHaveBeenCalledWith(expect.objectContaining(customerAuth))
  })

  it('routes customer Kael message memory permission updates through authenticated services', async () => {
    const updateMyCustomerKaelMemoryPreference = vi.fn(async () => ({
      memory: {
        customer_id: customerAuth.user.id,
        service_preferences: {
          memory_permissions: {
            message_interaction_memory: true,
          },
        },
      },
      subject_type: 'customer' as const,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ updateMyCustomerKaelMemoryPreference }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/kael-memory', {
      body: JSON.stringify({
        enabled: true,
        key: 'message_interaction_memory',
      }),
      method: 'PATCH',
    }))

    expect(response.status).toBe(200)
    expect(updateMyCustomerKaelMemoryPreference).toHaveBeenCalledWith(
      expect.objectContaining(customerAuth),
      {
        enabled: true,
        key: 'message_interaction_memory',
      },
    )
  })

  it('X4 F-17: routes customer GET /me/jobs/active to listCustomerActiveJobs', async () => {
    const listCustomerActiveJobs = vi.fn(async () => ({ active_job: null }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listCustomerActiveJobs }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/jobs/active'))

    expect(response.status).toBe(200)
    expect(listCustomerActiveJobs).toHaveBeenCalledWith(expect.objectContaining(customerAuth))
  })

  it('X4 F-17: /me/jobs/active is role-gated to customer + admin', async () => {
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ listCustomerActiveJobs: vi.fn(async () => ({ active_job: null })) }),
    })

    await handler(new Request('https://example.test/mobile-api/me/jobs/active'))

    // The router passes the route's allowed roles to authenticate(); worker is
    // intentionally excluded so the real auth layer rejects it with 403.
    expect(authenticate).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['customer', 'admin']),
    )
    expect(authenticate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['worker']),
    )
  })

  it('routes worker Kael memory self-view through the worker endpoint', async () => {
    const getWorkerKaelMemory = vi.fn(async () => ({ subject_type: 'worker' as const, memory: null }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ getWorkerKaelMemory }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael-memory'))

    expect(response.status).toBe(200)
    expect(getWorkerKaelMemory).toHaveBeenCalledWith(expect.objectContaining(workerAuth))
  })

  it('routes worker Kael memory preference updates through the worker endpoint', async () => {
    const updateMyWorkerKaelMemoryPreference = vi.fn(async () => ({
      memory: {
        safe_metadata: {
          memory_preferences: {
            area_preference: false,
          },
        },
        worker_id: workerAuth.user.id,
      },
      subject_type: 'worker' as const,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateMyWorkerKaelMemoryPreference }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael-memory', {
      body: JSON.stringify({
        enabled: false,
        key: 'area_preference',
      }),
      method: 'PATCH',
    }))

    expect(response.status).toBe(200)
    expect(updateMyWorkerKaelMemoryPreference).toHaveBeenCalledWith(
      expect.objectContaining(workerAuth),
      {
        enabled: false,
        key: 'area_preference',
      },
    )
  })

  it('routes worker payout method confirmation through worker/admin auth', async () => {
    const saveWorkerPayoutMethod = vi.fn(async () => ({
      payout_method: {
        account_holder_name: 'PHAN MANH TU',
        bank_account_masked: '****6789',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
        status: 'pending_verification' as const,
        updated_at: '2026-06-29T00:00:00.000Z',
      },
      worker_profile: {
        bank_account_masked: '****6789',
        bank_name: 'Techcombank',
        date_of_birth: null,
        districts: [],
        gender: null,
        has_cccd: false,
        has_selfie: false,
        home_lat: null,
        home_lng: null,
        id: '33333333-3333-4333-8333-333333333333',
        is_approved: true,
        is_available: false,
        is_suspended: false,
        legal_name: null,
        rating: 0,
        service_radius_km: null,
        service_types: [],
        total_jobs: 0,
        verification_status: 'approved' as const,
        years_experience: 0,
      },
    }))
    const authenticate = vi.fn(async () => workerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ saveWorkerPayoutMethod } as Partial<MobileApiServices>),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/payout-method', {
      body: JSON.stringify({
        account_holder_name: 'PHAN MANH TU',
        bank_account: '123456789',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }))

    expect(response.status).toBe(200)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker', 'admin'])
    expect(saveWorkerPayoutMethod).toHaveBeenCalledWith(expect.objectContaining(workerAuth), {
      account_holder_name: 'PHAN MANH TU',
      bank_account: '123456789',
      bank_key: 'techcombank',
      bank_name: 'Techcombank',
    })
  })

  it('routes device push token registration through authenticated mobile API services', async () => {
    const registerDevicePushToken = vi.fn(async () => ({
      token_id: '44444444-4444-4444-8444-444444444444',
      enabled: true,
      updated_at: '2026-05-19T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ registerDevicePushToken }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/notifications/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'ios',
        push_token: 'ExponentPushToken[valid-token]',
        permission_status: 'granted',
        safe_metadata: { device: 'expo-go' },
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ enabled: true })
    expect(registerDevicePushToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      expect.objectContaining({ platform: 'ios', permission_status: 'granted' }),
    )
  })

  it('routes Places autocomplete through authenticated mobile API services', async () => {
    const placesAutocomplete = vi.fn(async () => ({
      suggestions: [{
        place_id: 'place-1',
        label: 'Landmark 81, Bình Thạnh, TP.HCM',
        main_text: 'Landmark 81',
        secondary_text: 'Bình Thạnh, TP.HCM',
      }],
      fallback_used: false,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ placesAutocomplete }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/places/autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Landmark Bình Thạnh' }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ fallback_used: false })
    expect(placesAutocomplete).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      expect.objectContaining({ input: 'Landmark Bình Thạnh' }),
    )
  })

  it('routes Places resolve through authenticated mobile API services', async () => {
    const resolvePlace = vi.fn(async () => ({
      fallback_used: false,
      label: 'Landmark 81, Binh Thanh',
      location: { lat: 10.795, lng: 106.722 },
      place_id: 'vietmap-place-1',
      provider: 'vietmap' as const,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ resolvePlace }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/places/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Landmark 81, Binh Thanh', place_id: 'vietmap-place-1' }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ provider: 'vietmap' })
    expect(resolvePlace).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      expect.objectContaining({ place_id: 'vietmap-place-1' }),
    )
  })

  it('routes VietMap static map through authenticated binary mobile API services', async () => {
    const getVietmapStaticMap = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { 'Content-Type': 'image/png' },
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ getVietmapStaticMap }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/maps/vietmap/static?lat=10.795&lng=106.722&zoom=13'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(getVietmapStaticMap).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      { lat: 10.795, lng: 106.722, zoom: 13 },
    )
  })

  it('routes Q3 market cache invalidation through admin-only mobile API services', async () => {
    const invalidateMarketCache = vi.fn(async () => ({
      invalidated_count: 1,
      invalidated_at: '2026-05-26T00:00:00.000Z',
      filters: { district_code: 'q7' },
    }))
    const authenticate = vi.fn(async () => adminAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ invalidateMarketCache }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/admin/market-cache/invalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ district_code: 'Q7' }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ invalidated_count: 1 })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['admin'])
    expect(invalidateMarketCache).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      { district_code: 'q7' },
    )
  })

  it('routes Q4 learning queue processors and A3 monitor through admin-only mobile API services', async () => {
    const processKaelLearningQueue = vi.fn(async () => ({
      selected: 2,
      submitted: 2,
      realtime_fallback: 0,
      batch_id: 'batch-local-1',
    }))
    const processKaelBatchResults = vi.fn(async () => ({
      checked: 1,
      ended: 1,
      processed_items: 2,
      failed_items: 0,
    }))
    const monitorKaelLearningRules = vi.fn(async () => ({
      checked: 1,
      monitored: 1,
      rolled_back: 1,
    }))
    const authenticate = vi.fn(async () => adminAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({
        processKaelLearningQueue,
        processKaelBatchResults,
        monitorKaelLearningRules,
      }),
    })

    const queueResponse = await handler(new Request('https://example.test/mobile-api/admin/kael-learning/process-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 2 }),
    }))
    const resultsResponse = await handler(new Request('https://example.test/mobile-api/admin/kael-learning/process-batch-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, force_poll: true }),
    }))
    const monitorResponse = await handler(new Request('https://example.test/mobile-api/admin/kael-learning/monitor-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 3 }),
    }))

    expect(queueResponse.status).toBe(200)
    expect(resultsResponse.status).toBe(200)
    expect(monitorResponse.status).toBe(200)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['admin'])
    expect(processKaelLearningQueue).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      { limit: 2, force_realtime: false },
    )
    expect(processKaelBatchResults).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      { limit: 1, force_poll: true },
    )
    expect(monitorKaelLearningRules).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      { limit: 3 },
    )
  })

  it('accepts worker application review requests without authenticating or granting worker role', async () => {
    const submitWorkerApplication = vi.fn(async () => ({
      application_id: 'application-1',
      status: 'open' as const,
      submitted_at: '2026-06-12T00:00:00.000Z',
    }))
    const authenticate = vi.fn(async () => workerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ submitWorkerApplication } as Partial<MobileApiServices>),
    })

    const response = await handler(new Request('https://example.test/mobile-api/worker-applications', {
      method: 'POST',
      body: JSON.stringify({
        contact: 'worker@example.com',
        language: 'vi',
        source: 'auth_worker_create',
        client_request_id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      application_id: 'application-1',
      status: 'open',
      submitted_at: '2026-06-12T00:00:00.000Z',
    })
    expect(authenticate).not.toHaveBeenCalled()
    expect(submitWorkerApplication).toHaveBeenCalledWith(expect.objectContaining({
      contact: 'worker@example.com',
      language: 'vi',
      source: 'auth_worker_create',
      client_request_id: '550e8400-e29b-41d4-a716-446655440000',
    }))
  })

  it('rejects invalid worker application contact before service dispatch', async () => {
    const submitWorkerApplication = vi.fn()
    const authenticate = vi.fn(async () => workerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ submitWorkerApplication } as Partial<MobileApiServices>),
    })

    const response = await handler(new Request('https://example.test/mobile-api/worker-applications', {
      method: 'POST',
      body: JSON.stringify({
        contact: 'khong-phai-lien-he',
        language: 'vi',
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
    expect(authenticate).not.toHaveBeenCalled()
    expect(submitWorkerApplication).not.toHaveBeenCalled()
  })

  it('routes A4 manual learning candidate list and review through admin-only mobile API services', async () => {
    const listKaelLearningCandidates = vi.fn(async () => ({
      candidates: [{
        id: 'candidate-1',
        candidate_type: 'service_knowledge_candidate',
        affected_service: 'cleaning' as const,
        affected_problem: 'deep_clean',
        affected_district: 'q7',
        confidence: 0.7,
        evidence_count: 3,
        status: 'manual_review' as const,
        audit_reason: null,
        created_at: '2026-06-04T00:00:00.000Z',
        updated_at: '2026-06-04T00:00:00.000Z',
        promoted_at: null,
        rolled_back_at: null,
        suggested_payload: { skill_id: 'LS5' },
        evidence_snapshot: { evidence_count: 3 },
      }],
    }))
    const approveKaelLearningCandidate = vi.fn(async () => ({
      ok: true,
      candidate_id: 'candidate-1',
      rule_id: 'rule-1',
      rule_version: 2,
      status: 'auto_promoted',
      knowledge_apply: {
        ok: true,
        error_code: null,
        knowledge_table: 'service_knowledge_boxes',
        record_key: 'plumbing',
        knowledge_version: 1,
      },
    }))
    const rejectKaelLearningCandidate = vi.fn(async () => ({
      ok: true,
      candidate_id: 'candidate-2',
      status: 'archived',
    }))
    const authenticate = vi.fn(async () => adminAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({
        listKaelLearningCandidates,
        approveKaelLearningCandidate,
        rejectKaelLearningCandidate,
      }),
    })

    const listResponse = await handler(new Request('https://example.test/mobile-api/admin/kael/learning/candidates?state=manual_review&limit=10'))
    const approveResponse = await handler(new Request('https://example.test/mobile-api/admin/kael/learning/candidates/candidate-1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_note: 'approved after admin check' }),
    }))
    const rejectResponse = await handler(new Request('https://example.test/mobile-api/admin/kael-learning/candidates/candidate-2/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'insufficient_evidence' }),
    }))

    expect(listResponse.status).toBe(200)
    expect(approveResponse.status).toBe(200)
    expect(rejectResponse.status).toBe(200)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer', 'worker', 'admin'])
    expect(listKaelLearningCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      { state: 'manual_review', limit: 10 },
    )
    expect(approveKaelLearningCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      'candidate-1',
      { review_note: 'approved after admin check' },
    )
    expect(rejectKaelLearningCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      'candidate-2',
      { reason: 'insufficient_evidence' },
    )
  })

  it('does not dispatch worker routes when the authenticator rejects the role', async () => {
    const updateJobStatus = vi.fn()
    const authenticate = vi.fn(async (): Promise<MobileApiAuthResult> => ({
      success: false,
      status: 403,
      error: 'forbidden',
    }))
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'arrived' }),
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      code: 'AUTH_FORBIDDEN',
      error: 'forbidden',
    })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker', 'admin'])
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('routes customer profile insights through customer/admin auth', async () => {
    const getCustomerProfileInsights = vi.fn(async () => ({
      customer_id: customerAuth.user.id,
      member_since: '2026-01-02T00:00:00.000Z',
      kael_interaction_count: 4,
      active_streak_days: 2,
      completed_service_count: 3,
      preferred_service_count: 2,
      positive_review_rate_percent: 98,
      price_savings_vnd: 200000,
      saved_address_count: 1,
      total_spend_vnd: 1600000,
      usage_rank_level: 2,
      usage_rank_points: 260,
      fair_price_service_count: 2,
      money_protection_score: 67,
      protected_value_vnd: 1600000,
      protected_transaction_count: 2,
      total_transaction_count: 3,
      dispute_free_rate_percent: 100,
      fair_price_status: 'verified' as const,
    }))
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ getCustomerProfileInsights } as Partial<MobileApiServices>),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/profile-insights'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      customer_id: customerAuth.user.id,
      completed_service_count: 3,
      fair_price_status: 'verified',
    })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer', 'admin'])
    expect(getCustomerProfileInsights).toHaveBeenCalledWith(expect.objectContaining({
      role: 'customer',
      user: customerAuth.user,
    }))
  })

  it('routes worker performance insights through worker/admin auth', async () => {
    const getWorkerPerformanceInsights = vi.fn(async () => ({
      worker_id: workerAuth.user.id,
      completed_job_count: 12,
      review_count: 10,
      average_rating: 4.9,
      response_rate_percent: 98,
      average_response_minutes: 18,
      on_time_rate_percent: 96,
      total_broadcast_count: 20,
      responded_broadcast_count: 19,
      accepted_broadcast_count: 12,
      scheduled_arrival_job_count: 8,
      on_time_job_count: 8,
      paid_job_count: 9,
      reconciled_earnings_vnd: 12850000,
      performance_score: 94,
      badges: [
        { id: 'verified_profile' as const, status: 'earned' as const },
      ],
      performance_axes: [
        { id: 'rating' as const, score: 98 },
        { id: 'response' as const, score: 98 },
        { id: 'arrival' as const, score: 96 },
        { id: 'completion' as const, score: 100 },
        { id: 'earnings' as const, score: 100 },
      ],
    }))
    const authenticate = vi.fn(async () => workerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ getWorkerPerformanceInsights } as Partial<MobileApiServices>),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/performance-insights'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      worker_id: workerAuth.user.id,
      response_rate_percent: 98,
      performance_score: 94,
    })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker', 'admin'])
    expect(getWorkerPerformanceInsights).toHaveBeenCalledWith(expect.objectContaining({
      role: 'worker',
      user: workerAuth.user,
    }))
  })

  it('validates POST /jobs before creating a job', async () => {
    const createJob = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_type: 'painting', description: 'short' }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 'VALIDATION',
      error: 'Dữ liệu không hợp lệ',
    })
    expect(createJob).not.toHaveBeenCalled()
  })

  it('passes validated POST /jobs payload to the backend service', async () => {
    const createJob = vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'broadcasting' as const,
      estimate: {
        service_type: 'plumbing' as const,
        problem_category: 'pipe_leak',
        problem_summary: 'Ống rò rỉ cần kiểm tra',
        complexity: 'medium' as const,
        price_min: 150000,
        price_max: 350000,
        confidence: 0.5,
        advisory: null,
        disclaimer:
          'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.',
      },
      final_price: 350000,
      fallback_used: true,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: 'plumbing',
        problem_chips: ['Ống rò rỉ'],
        description: 'Ống nước dưới lavabo bị rò và nhỏ nước liên tục',
        photo_urls: [],
        address_district: 'q7',
      }),
    }))

    expect(response.status).toBe(201)
    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'customer',
        user: customerAuth.user,
      }),
      expect.objectContaining({
        service_type: 'plumbing',
        address_district: 'q7',
      }),
    )
  })

  it('routes Kael chat session creation through customer/admin auth', async () => {
    const createKaelChat = vi.fn(async () => ({
      session: {
        id: 'kael-session-1',
        status: 'estimate_ready' as const,
        service_type: 'plumbing' as const,
        job_id: null,
        customer_id: customerAuth.user.id,
        estimate: {
          service_type: 'plumbing' as const,
          problem_category: 'pipe_leak',
          problem_summary: 'Ống nước rò rỉ',
          complexity: 'medium' as const,
          price_min: 150000,
          price_max: 350000,
          confidence: 0.7,
          advisory: null,
          disclaimer: 'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.',
        },
        started_at: '2026-05-20T00:00:00.000Z',
        estimate_ready_at: '2026-05-20T00:01:00.000Z',
        total_turns: 2,
        total_cost_usd: 0,
        next_action: 'estimate_ready' as const,
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: 'plumbing',
        message: 'Ống nước dưới lavabo đang rò liên tục',
        problem_chips: ['Ống rò rỉ'],
        photo_urls: [],
        address_district: 'q7',
      }),
    }))

    expect(response.status).toBe(201)
    expect(createKaelChat).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      expect.objectContaining({ service_type: 'plumbing', address_district: 'q7' }),
    )
  })

  it('routes Kael chat media uploads through the signed Edge upload endpoint', async () => {
    const createKaelChatMediaUpload = vi.fn(async () => ({
      bucket_id: 'kael-chat-media' as const,
      object_path: `${customerAuth.user.id}/kael-chat/leak.jpg`,
      media_ref: `supabase://kael-chat-media/${customerAuth.user.id}/kael-chat/leak.jpg`,
      token: 'upload-token',
      signed_upload_url: 'https://storage.example.test/upload/sign/leak.jpg',
      expires_in_seconds: 7200,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createKaelChatMediaUpload }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/media-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: 'leak.jpg',
        mime_type: 'image/jpeg',
        file_size_bytes: 1200,
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      bucket_id: 'kael-chat-media',
      media_ref: `supabase://kael-chat-media/${customerAuth.user.id}/kael-chat/leak.jpg`,
    })
    expect(createKaelChatMediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      {
        file_name: 'leak.jpg',
        mime_type: 'image/jpeg',
        file_size_bytes: 1200,
      },
    )
  })

  it('routes Kael chat evidence from local audit media refs into the Edge analysis service', async () => {
    const localCustomerAuth: MobileApiAuthResult = {
      ...customerAuth,
      user: { id: 'local-visual-audit-customer' },
    }
    const submitKaelChatEvidence = vi.fn(async () => ({
      session: {
        id: 'session-local-audit',
        job_id: null,
        customer_id: 'local-visual-audit-customer',
        service_type: 'plumbing' as const,
        status: 'estimate_ready' as const,
        estimate: {
          service_type: 'plumbing' as const,
          problem_category: 'leaking_pipe',
          problem_summary: 'Ống nước cần kiểm tra',
          complexity: 'medium' as const,
          price_min: 100000,
          price_max: 250000,
          confidence: 0.72,
          advisory: null,
          disclaimer: 'Ước tính cần bạn xác nhận trước khi mở công việc.',
        },
        started_at: '2026-06-30T00:00:00.000Z',
        estimate_ready_at: '2026-06-30T00:00:05.000Z',
        total_turns: 3,
        total_cost_usd: 0.01,
        next_action: 'estimate_ready' as const,
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => localCustomerAuth),
      services: makeServices({ submitKaelChatEvidence }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/session-local-audit/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'confirmed',
        message: 'Ống rò rỉ dưới bồn rửa chén.',
        media_refs: ['supabase://kael-chat-media/local-visual-audit-customer/kael-chat/evidence.jpg'],
        photo_urls: [],
        problem_chips: ['Ống rò rỉ'],
      }),
    }))

    expect(response.status).toBe(200)
    expect(submitKaelChatEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer', user: { id: 'local-visual-audit-customer' } }),
      'session-local-audit',
      expect.objectContaining({
        decision: 'confirmed',
        media_refs: ['supabase://kael-chat-media/local-visual-audit-customer/kael-chat/evidence.jpg'],
      }),
    )
  })

  it('routes normal Kael assistant without requiring service_type', async () => {
    const answerKaelAssistant = vi.fn(async () => ({
      answer: 'Kael can explain NestScout service rules first.',
      boundary: 'answered' as const,
      citations: ['NestScout platform scope'],
      fallback_used: false,
      safety_notes: [],
      suggested_actions: ['open_booking' as const],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ answerKaelAssistant }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'vi',
        message: 'Thợ NestScout được xác minh thế nào?',
        surface: 'customer_normal',
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      answer: 'Kael can explain NestScout service rules first.',
      boundary: 'answered',
    })
    expect(answerKaelAssistant).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      expect.objectContaining({
        language: 'vi',
        message: 'Thợ NestScout được xác minh thế nào?',
        surface: 'customer_normal',
      }),
    )
  })

  it('routes Kael chat history reads through customer auth', async () => {
    const getKaelChat = vi.fn(async () => ({
      session: {
        id: 'kael-session-1',
        status: 'active' as const,
        service_type: 'plumbing' as const,
        job_id: null,
        customer_id: customerAuth.user.id,
        estimate: null,
        started_at: '2026-05-20T00:00:00.000Z',
        estimate_ready_at: null,
        total_turns: 1,
        total_cost_usd: 0,
        next_action: 'await_input' as const,
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ getKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1', {
      method: 'GET',
    }))

    expect(response.status).toBe(200)
    expect(getKaelChat).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'kael-session-1',
    )
  })

  it('routes Kael chat progress polling through customer auth', async () => {
    const getKaelChatProgress = vi.fn(async () => ({
      session_id: 'kael-session-1',
      progress: {
        current_stage: 'market_lookup',
        status: 'running' as const,
        progress: 0.32,
        failure_reason: null,
        updated_at: '2026-06-04T00:00:00.000Z',
      },
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ getKaelChatProgress }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1/progress', {
      method: 'GET',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      session_id: 'kael-session-1',
      progress: {
        current_stage: 'market_lookup',
        status: 'running',
        progress: 0.32,
      },
    })
    expect(getKaelChatProgress).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'kael-session-1',
    )
  })

  it('blocks workers from polling customer Kael chat progress', async () => {
    const getKaelChatProgress = vi.fn()
    const authenticate = vi.fn(async (_request: Request, roles?: string[]): Promise<MobileApiAuthResult> => {
      expect(roles).toEqual(['customer', 'admin'])
      return {
        success: false,
        status: 403,
        error: 'Forbidden',
      }
    })
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ getKaelChatProgress }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1/progress', {
      method: 'GET',
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'AUTH_FORBIDDEN' })
    expect(authenticate).toHaveBeenCalledOnce()
    expect(getKaelChatProgress).not.toHaveBeenCalled()
  })

  it('routes Kael chat SSE stream without wrapping the Response as JSON', async () => {
    const streamKaelChatTurn = vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: result\ndata: {"ok":true}\n\n'))
          controller.close()
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
    ))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ streamKaelChatTurn }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1/stream', {
      method: 'POST',
      body: JSON.stringify({ message: 'Outlet still sparks.' }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(await response.text()).toContain('event: result')
    expect(streamKaelChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'kael-session-1',
      { message: 'Outlet still sparks.', photo_urls: [], apartment_access_profile: {} },
    )
  })

  it('routes worker Kael advisory SSE stream without wrapping the Response as JSON', async () => {
    const streamWorkerKaelChatTurn = vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: result\ndata: {"ok":true}\n\n'))
          controller.close()
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
    ))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ streamWorkerKaelChatTurn }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael/chat/worker-session-1/stream', {
      method: 'POST',
      body: JSON.stringify({ language: 'vi', media_refs: [], message: 'Need scope advice.' }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(await response.text()).toContain('event: result')
    expect(streamWorkerKaelChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'worker-session-1',
      { language: 'vi', media_refs: [], message: 'Need scope advice.' },
    )
  })

  it('routes Kael chat follow-up turns with validated payloads', async () => {
    const sendKaelChatTurn = vi.fn(async () => ({
      session: {
        id: 'kael-session-1',
        status: 'active' as const,
        service_type: 'plumbing' as const,
        job_id: null,
        customer_id: customerAuth.user.id,
        estimate: null,
        started_at: '2026-05-20T00:00:00.000Z',
        estimate_ready_at: null,
        total_turns: 2,
        total_cost_usd: 0.01,
        next_action: 'ask_photo' as const,
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ sendKaelChatTurn }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Nước rò mạnh hơn dưới lavabo',
        photo_urls: ['https://storage.example.test/job-media/photo.jpg'],
      }),
    }))

    expect(response.status).toBe(200)
    expect(sendKaelChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'kael-session-1',
      expect.objectContaining({
        message: 'Nước rò mạnh hơn dưới lavabo',
        photo_urls: ['https://storage.example.test/job-media/photo.jpg'],
      }),
    )
  })

  it('routes Kael chat confirmation as the explicit booking-search confirmation', async () => {
    const confirmKaelChat = vi.fn(async () => ({
      session_id: 'kael-session-1',
      job_id: 'job-1',
      status: 'broadcasting' as const,
      broadcast_sent: false,
      worker: null,
      message: 'Đang tìm thợ phù hợp',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ confirmKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1/confirm', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(confirmKaelChat).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'kael-session-1',
    )
  })

  it('lets admin QA exercise the customer job creation route explicitly', async () => {
    const createJob = vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'broadcasting' as const,
      estimate: {
        service_type: 'cleaning' as const,
        problem_category: 'home_cleaning',
        problem_summary: 'Can don dep can ho',
        complexity: 'medium' as const,
        price_min: 200000,
        price_max: 450000,
        confidence: 0.6,
        advisory: null,
        disclaimer: 'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.',
      },
      final_price: 450000,
      fallback_used: false,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => adminAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: 'cleaning',
        problem_chips: ['Don dep nha'],
        description: 'Can don dep can ho sau khi sua chua va gom rac nhe',
        photo_urls: [],
        address_district: 'q7',
      }),
    }))

    expect(response.status).toBe(201)
    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', user: adminAuth.user }),
      expect.objectContaining({ service_type: 'cleaning' }),
    )
  })

  it('routes customer payment intent creation through customer/admin auth', async () => {
    const createPaymentIntent = vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'payment_pending' as const,
      payment: {
        provider: 'sepay_vietqr' as const,
        status: 'vietqr_ready' as const,
        gross_amount: 250000,
        platform_fee: 25000,
        worker_net: 225000,
        payment_code: 'NSMOH260001',
        transfer_content: 'NestScout NSMOH260001',
        qr_image_url: 'https://qr.sepay.vn/img?acc=redacted',
        expires_at: '2026-06-14T00:30:00.000Z',
        received_at: null,
        amount_received: null,
        updated_at: '2026-06-14T00:00:00.000Z',
      },
    }))
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ createPaymentIntent }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/22222222-2222-4222-8222-222222222222/payment-intent', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'payment_pending',
      payment: {
        provider: 'sepay_vietqr',
        status: 'vietqr_ready',
      },
    })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer', 'admin'])
    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      '22222222-2222-4222-8222-222222222222',
    )
  })

  it('dispatches SePay webhook publicly without mobile auth', async () => {
    const handleSepayWebhook = vi.fn(async () => ({ success: true as const }))
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ handleSepayWebhook }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/payments/sepay/webhook', {
      method: 'POST',
      headers: {
        Authorization: 'Apikey test-webhook-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 123,
        code: 'NSMOH260001',
        transferAmount: 250000,
        transferType: 'in',
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(authenticate).not.toHaveBeenCalled()
    expect(handleSepayWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 123,
        code: 'NSMOH260001',
        transferAmount: 250000,
        transferType: 'in',
      }),
      expect.any(Headers),
    )
  })

  it('passes validated POST /jobs/:id/media payload to the backend service', async () => {
    const attachJobMedia = vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      photo_urls: ['supabase://job-media/22222222-2222-4222-8222-222222222222/before/photo.jpg'],
      media: [{
        bucket_id: 'job-media' as const,
        object_path: '22222222-2222-4222-8222-222222222222/before/photo.jpg',
        storage_ref: 'supabase://job-media/22222222-2222-4222-8222-222222222222/before/photo.jpg',
        stage: 'before' as const,
      }],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ attachJobMedia }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/22222222-2222-4222-8222-222222222222/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assets: [{
          object_path: '22222222-2222-4222-8222-222222222222/before/photo.jpg',
          stage: 'before',
          mime_type: 'image/jpeg',
          file_size_bytes: 1200,
        }],
      }),
    }))

    expect(response.status).toBe(201)
    expect(attachJobMedia).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      '22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        assets: [expect.objectContaining({ stage: 'before' })],
      }),
    )
  })

  it('routes GET /jobs/:id/messages to the backend service', async () => {
    const listJobMessages = vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      messages: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listJobMessages }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/22222222-2222-4222-8222-222222222222/messages'))

    expect(response.status).toBe(200)
    expect(listJobMessages).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      '22222222-2222-4222-8222-222222222222',
    )
  })

  it('passes validated POST /jobs/:id/messages payload to the backend service', async () => {
    const sendJobMessage = vi.fn(async () => ({
      message: {
        id: 'message-1',
        job_id: '22222222-2222-4222-8222-222222222222',
        sender_id: workerAuth.user.id,
        sender_role: 'worker' as const,
        content: 'Tôi đang lên thang máy.',
        is_read: false,
        created_at: '2026-05-20T00:00:00.000Z',
      },
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ sendJobMessage }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/22222222-2222-4222-8222-222222222222/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Tôi đang lên thang máy.' }),
    }))

    expect(response.status).toBe(201)
    expect(sendJobMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      '22222222-2222-4222-8222-222222222222',
      { content: 'Tôi đang lên thang máy.' },
    )
  })

  it('rejects invalid worker completion price before service mutation', async () => {
    const updateJobStatus = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        final_price: -1,
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION',
    })
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('rejects invalid worker completion photo URLs before service mutation', async () => {
    const updateJobStatus = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        completion_photo_urls: ['not-a-url'],
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION',
    })
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('requires worker completion notes and photos before service mutation', async () => {
    const updateJobStatus = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION',
    })
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('lets note-only worker completion retries reach the service so stored after-photos can be reused', async () => {
    const updateJobStatus = vi.fn(async () => ({
      job_id: 'job-1',
      from_status: 'repairing' as const,
      to_status: 'completed_by_worker' as const,
      updated_at: '2026-05-20T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
      }),
    }))

    expect(response.status).toBe(200)
    expect(updateJobStatus).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'job-1',
      {
        status: 'completed_by_worker',
        completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
      },
    )
  })

  it('accepts completion media refs returned by the job media attach endpoint', async () => {
    const updateJobStatus = vi.fn(async () => ({
      job_id: 'job-1',
      from_status: 'repairing' as const,
      to_status: 'completed_by_worker' as const,
      updated_at: '2026-05-20T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
        completion_photo_urls: ['supabase://job-media/job-1/after/photo.jpg'],
      }),
    }))

    expect(response.status).toBe(200)
    expect(updateJobStatus).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'job-1',
      {
        status: 'completed_by_worker',
        completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
        completion_photo_urls: ['supabase://job-media/job-1/after/photo.jpg'],
      },
    )
  })

  it('passes worker apartment access check-in evidence through status updates', async () => {
    const updateJobStatus = vi.fn(async () => ({
      job_id: 'job-1',
      from_status: 'worker_on_way' as const,
      to_status: 'arrived' as const,
      updated_at: '2026-06-04T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'arrived',
        access_check_in: {
          mode: 'manual_photo',
          photo_urls: ['supabase://job-media/job-1/after/lobby.jpg'],
          note: 'Đã đến sảnh.',
        },
      }),
    }))

    expect(response.status).toBe(200)
    expect(updateJobStatus).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'job-1',
      {
        status: 'arrived',
        access_check_in: {
          mode: 'manual_photo',
          photo_urls: ['supabase://job-media/job-1/after/lobby.jpg'],
          note: 'Đã đến sảnh.',
        },
      },
    )
  })

  it('rejects manual apartment access check-in without photo evidence', async () => {
    const updateJobStatus = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'arrived',
        access_check_in: { mode: 'manual_photo' },
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('rejects non-completion storage refs for worker completion photos', async () => {
    const updateJobStatus = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        completion_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/photo.jpg'],
      }),
    }))

    expect(response.status).toBe(400)
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('rejects oversized JSON bodies before service mutation', async () => {
    const createJob = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: 'plumbing',
        problem_chips: ['leak'],
        description: 'x'.repeat(70_000),
      }),
    }))

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      error: 'Dữ liệu gửi lên quá lớn',
    })
    expect(createJob).not.toHaveBeenCalled()
  })

  it('does not log raw unhandled error messages from Edge services', async () => {
    const sensitive = 'sb_secret_sensitive_value'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({
        listServices: vi.fn(async () => {
          throw new Error(`database failed with ${sensitive}`)
        }),
      }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/services'))
    const body = await response.json()
    const logged = JSON.stringify(errorSpy.mock.calls)
    errorSpy.mockRestore()

    expect(response.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain(sensitive)
    expect(logged).not.toContain(sensitive)
  })
})

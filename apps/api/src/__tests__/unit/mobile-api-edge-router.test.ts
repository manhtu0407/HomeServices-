import { describe, expect, it, vi } from 'vitest'
import type { MatchingState } from '@nestscout/shared'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'

const customerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'customer',
  supabase: {},
  userSupabase: {},
}

const workerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '33333333-3333-4333-8333-333333333333' },
  role: 'worker',
  supabase: {},
  userSupabase: {},
}

const adminAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '99999999-9999-4999-8999-999999999999' },
  role: 'admin',
  supabase: {},
  userSupabase: {},
}

function makeServices(overrides: Partial<MobileApiServices> = {}): MobileApiServices {
  return {
    getKaelCharter: vi.fn(async () => ({
      charter_version: '2026-08-06.p11',
      identity_summary: 'Kael is the Home Services assistant.',
      locked_files: ['identity.md', 'persona.md', 'mission-values.md'],
      tunable_files: ['tone-matrix.yaml', 'language-rules.md', 'forbidden-language.json', 'style-guidelines.md'],
      forbidden_categories: ['ai_self_reference'],
      mission_values: ['Trust'],
    })),
    listServices: vi.fn(async () => ({ services: [] })),
    placesAutocomplete: vi.fn(async () => ({ suggestions: [], fallback_used: false })),
    placesResolve: vi.fn(async () => ({
      fallback_used: false,
      label: 'Chung cu NestScout',
      location: { lat: 10.7769, lng: 106.7009 },
      place_id: 'place-1',
      provider: 'vietmap' as const,
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
    listCustomerServiceHistory: vi.fn(),
    listFavoriteWorkersForMatching: vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      workers: [],
    })),
    createCustomerKaelConversation: vi.fn(),
    listCustomerKaelConversations: vi.fn(async () => ({ sessions: [] })),
    archiveCustomerKaelConversation: vi.fn(),
    renameCustomerKaelConversation: vi.fn(),
    setCustomerKaelConversationPinned: vi.fn(),
    getCustomerKaelConversation: vi.fn(),
    sendCustomerKaelConversationTurn: vi.fn(),
    streamCustomerKaelConversationTurn: vi.fn(async () => new Response(new ReadableStream(), {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })),
    createKaelChat: vi.fn(),
    answerKaelAssistant: vi.fn(),
    createKaelChatMediaUpload: vi.fn(async () => ({
      bucket_id: 'kael-chat-media' as const,
      object_path: 'customer/session/photo.jpg',
      media_ref: 'supabase://kael-chat-media/customer/session/photo.jpg',
      token: 'signed-token',
      signed_upload_url: 'https://storage.example.test/upload',
      expires_in_seconds: 900,
    })),
    revokeKaelChatMedia: vi.fn(async () => ({
      revoked_count: 1,
      deletion_pending: false,
    })),
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
    streamKaelChatEvidence: vi.fn(async () => new Response(new ReadableStream(), {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })),
    sendKaelChatTurn: vi.fn(),
    decideKaelIntakeConfirmation: vi.fn(),
    confirmKaelChat: vi.fn(),
    submitKaelChatEvidence: vi.fn(),
    confirmSearch: vi.fn(),
    setJobMatchingPreference: vi.fn(),
    cancelJob: vi.fn(),
    acceptBroadcast: vi.fn(),
    declineBroadcast: vi.fn(),
    getWorkerCandidate: vi.fn(),
    confirmWorkerCandidate: vi.fn(),
    rejectWorkerCandidate: vi.fn(),
    updateJobStatus: vi.fn(),
    authorizeApartmentAccess: vi.fn(),
    requestScopeChange: vi.fn(),
    getJobIncident: vi.fn(async () => ({ incident: null })),
    openJobIncident: vi.fn(async () => ({ incident: null })),
    previewScopeChangeFromJobIncident: vi.fn(),
    proposeScopeChangeFromJobIncident: vi.fn(),
    askKaelForWorker: vi.fn(),
    createWorkerKaelChat: vi.fn(),
    listWorkerKaelChats: vi.fn(),
    archiveWorkerKaelChat: vi.fn(async () => ({
      session_id: 'worker-session-1',
      archived_at: '2026-07-13T07:45:00.000Z',
    })),
    renameWorkerKaelChat: vi.fn(),
    setWorkerKaelChatPinned: vi.fn(),
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
    createJobMediaUpload: vi.fn(async () => ({
      bucket_id: 'job-media' as const,
      object_path: 'job/before/photo.jpg',
      storage_ref: 'supabase://job-media/job/before/photo.jpg',
      signed_upload_url: 'https://storage.example.test/upload',
      token: 'signed-token',
      expires_in_seconds: 7200,
    })),
    revokeJobMediaUploads: vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      revoked_count: 1,
      deletion_pending: false,
    })),
    listJobMessages: vi.fn(),
    sendJobMessage: vi.fn(),    confirmCompletion: vi.fn(),
    createPaymentIntent: vi.fn(),
    createManualBankPaymentOrder: vi.fn(),
    claimManualBankPayment: vi.fn(),
    selectDirectWorkerPayment: vi.fn(),
    respondToDirectWorkerPayment: vi.fn(),
    confirmWorkerCashPayment: vi.fn(),
    confirmStagingPayment: vi.fn(),
    submitReview: vi.fn(),
    submitCustomerKaelFeedback: vi.fn(),
    registerWorker: vi.fn(),
    submitWorkerApplication: vi.fn(async () => ({
      application_id: 'application-1',
      status: 'open' as const,
      submitted_at: '2026-05-26T00:00:00.000Z',
    })),
    getAdminOperations: vi.fn(),
    listAdminDisputes: vi.fn(),
    listAdminPriceBaselines: vi.fn(),
    listAdminAiCosts: vi.fn(),
    listAdminLearningRules: vi.fn(),
    listAdminWorkerApplications: vi.fn(),
    getAdminWorkerApplication: vi.fn(),
    decideAdminWorkerApplication: vi.fn(),
    setAdminWorkerAccess: vi.fn(),
    listAdminTransactions: vi.fn(),
    getAdminTransaction: vi.fn(),
    listAdminPayoutMethods: vi.fn(),
    getAdminPayoutMethod: vi.fn(),
    decideAdminPayoutMethod: vi.fn(),
    listAdminWithdrawalRequests: vi.fn(),
    getAdminWithdrawalRequest: vi.fn(),
    claimAdminWithdrawalRequest: vi.fn(),
    resolveAdminWithdrawalRequest: vi.fn(),
    listAdminPaymentReconciliations: vi.fn(),
    decideAdminPaymentReconciliation: vi.fn(),
    getAdminFinanceSummary: vi.fn(),
    recordAdminFinanceBalanceSnapshot: vi.fn(),
    listAdminSubAdmins: vi.fn(),
    searchAdminSubAdminAccounts: vi.fn(),
    nominateAdminManager: vi.fn(),
    cancelAdminManagerNomination: vi.fn(),
    setAdminSubAdminAccess: vi.fn(),
    getMyKaelMemory: vi.fn(),
    getWorkerKaelMemory: vi.fn(),
    deleteMyKaelMemory: vi.fn(),
    updateMyKaelMemory: vi.fn(),
    updateWorkerKaelMemoryPreference: vi.fn(),
    listMyPendingDecisions: vi.fn(async () => ({ pending_decisions: [] })),
    listMyThreads: vi.fn(async () => ({ threads: [] })),
    getCustomerProfileInsights: vi.fn(async () => ({
      customer_id: '11111111-1111-4111-8111-111111111111',
      member_since: null,
      kael_interaction_count: 0,
      completed_service_count: 0,
      saved_address_count: 0,
      preferred_service_count: 0,
      active_service_days: 0,
      active_streak_days: 0,
      reviewed_service_count: 0,
      positive_review_rate_percent: 0,
      price_savings_vnd: 0,
      total_spend_vnd: 0,
      usage_rank_level: 0,
      usage_rank_points: 0,
      fair_price_service_count: 0,
      money_protection_score: 0,
      protected_value_vnd: 0,
      protected_transaction_count: 0,
      total_transaction_count: 0,
      dispute_free_rate_percent: 0,
      fair_price_status: null,
    })),
    getCustomerAvatar: vi.fn(async () => ({
      avatar_url: null,
      customer_id: '11111111-1111-4111-8111-111111111111',
      updated_at: null,
    })),
    createCustomerAvatarUpload: vi.fn(),
    updateCustomerAvatar: vi.fn(),
    getCustomerRefundAccount: vi.fn(async () => ({ refund_account: null })),
    saveCustomerRefundAccount: vi.fn(async () => ({ refund_account: null })),
    getWorkerProfile: vi.fn(),
    createWorkerAvatarUpload: vi.fn(),
    updateWorkerAvatar: vi.fn(),
    recordWorkerAppActiveMinute: vi.fn(),
    getWorkerPerformanceInsights: vi.fn(async () => ({
      worker_id: '33333333-3333-4333-8333-333333333333',
      completed_job_count: 0,
      review_count: 0,
      average_rating: null,
      response_rate_percent: null,
      average_response_minutes: null,
      on_time_rate_percent: null,
      total_broadcast_count: 0,
      responded_broadcast_count: 0,
      accepted_broadcast_count: 0,
      scheduled_arrival_job_count: 0,
      on_time_job_count: 0,
      paid_job_count: 0,
      reconciled_earnings_vnd: null,
      work_response_review_count: 0,
      resolved_incident_case_count: 0,
      incident_rank_bonus: 0,
      performance_score: null,
      badges: [],
      performance_axes: [],
    })),
    updateWorkerServiceArea: vi.fn(),
    updateWorkerServicePreferences: vi.fn(),
    updateWorkerAvailability: vi.fn(),
    listWorkerBroadcasts: vi.fn(),
    listWorkerJobs: vi.fn(),
    getWorkerPayoutMethod: vi.fn(),
    saveWorkerPayoutMethod: vi.fn(),
    listWorkerWithdrawalRequests: vi.fn(),
    createWorkerWithdrawalRequest: vi.fn(),
    getWorkerRoutePreview: vi.fn(async () => ({ distance_meters: 3200, duration_seconds: 720 })),
    getWorkerRouteMap: vi.fn(async () => new Response('map', {
      headers: { 'Content-Type': 'image/png' },
    })),
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
    unregisterDevicePushToken: vi.fn(),
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

  it('does not authorize admin access to customer-only profile insights', async () => {
    const getCustomerProfileInsights = vi.fn()
    const authenticate = vi.fn(async (
      _request: Request,
      allowedRoles?: string[],
    ): Promise<MobileApiAuthResult> => {
      if (allowedRoles?.includes('admin')) return adminAuth
      return { success: false, status: 403, error: 'forbidden' }
    })
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ getCustomerProfileInsights }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/profile-insights'))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'AUTH_FORBIDDEN' })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer'])
    expect(getCustomerProfileInsights).not.toHaveBeenCalled()
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
    const jobId = '11111111-1111-4111-8111-111111111111'
    const openDispute = vi.fn(async () => ({
      dispute_id: 'dispute-1',
      job_id: jobId,
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

    const response = await handler(new Request(`https://example.test/mobile-api/jobs/${jobId}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispute_type: 'completion_rejected',
        initiator_statement: 'Cong viec chua hoan tat nhu thong tin ban dau.',
        evidence_photo_urls: [`supabase://job-media/${jobId}/after/a.jpg`],
      }),
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      dispute_id: 'dispute-1',
      evidence_snapshot_id: 'snapshot-1',
    })
    expect(openDispute).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      jobId,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'Toi da lam dung pham vi ban dau.' }),
    }))
    const decisionResponse = await handler(new Request('https://example.test/mobile-api/disputes/dispute-1/admin-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  it('U-5: routes the 3 Agentic-Center endpoints to their authenticated services', async () => {
    const updateMyKaelMemory = vi.fn(async () => ({ subject_type: 'customer' as const, memory: null }))
    const listMyPendingDecisions = vi.fn(async () => ({ pending_decisions: [] }))
    const listMyThreads = vi.fn(async () => ({ threads: [] }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ updateMyKaelMemory, listMyPendingDecisions, listMyThreads }),
    })

    const patchResponse = await handler(new Request('https://example.test/mobile-api/me/kael-memory', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'en' }),
    }))
    const pendingResponse = await handler(new Request('https://example.test/mobile-api/me/pending-decisions'))
    const threadsResponse = await handler(new Request('https://example.test/mobile-api/me/threads'))

    expect(patchResponse.status).toBe(200)
    expect(pendingResponse.status).toBe(200)
    expect(threadsResponse.status).toBe(200)
    expect(updateMyKaelMemory).toHaveBeenCalledWith(expect.objectContaining(customerAuth), { language: 'en' })
    expect(listMyPendingDecisions).toHaveBeenCalledWith(expect.objectContaining(customerAuth))
    expect(listMyThreads).toHaveBeenCalledWith(expect.objectContaining(customerAuth))
  })

  it('U-5: PATCH /me/kael-memory rejects an empty update with 400', async () => {
    const updateMyKaelMemory = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ updateMyKaelMemory }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/kael-memory', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }))

    expect(response.status).toBe(400)
    expect(updateMyKaelMemory).not.toHaveBeenCalled()
  })

  it('routes customer refund-account reads and persisted saves through the Edge boundary', async () => {
    const getCustomerRefundAccount = vi.fn(async () => ({
      refund_account: {
        id: 'refund-account-1',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
        bank_account_masked: '**** 6789',
        status: 'pending_verification' as const,
        is_default: true,
        verified_at: null,
        updated_at: '2026-07-28T00:00:00.000Z',
      },
    }))
    const saveCustomerRefundAccount = vi.fn(async () => ({ refund_account: null }))
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ getCustomerRefundAccount, saveCustomerRefundAccount }),
    })

    const getResponse = await handler(new Request('https://example.test/mobile-api/me/refund-account'))
    const saveResponse = await handler(new Request('https://example.test/mobile-api/me/refund-account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        account_holder_name: 'PHAN MANH TU',
        bank_account: '123456789',
        bank_key: 'techcombank',
      }),
    }))

    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual({
      refund_account: expect.objectContaining({ bank_account_masked: '**** 6789' }),
    })
    expect(saveResponse.status).toBe(200)
    expect(getCustomerRefundAccount).toHaveBeenCalledWith(expect.objectContaining(customerAuth))
    expect(saveCustomerRefundAccount).toHaveBeenCalledWith(expect.objectContaining(customerAuth), {
      account_holder_name: 'PHAN MANH TU',
      bank_account: '123456789',
      bank_key: 'techcombank',
    })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer'])
  })

  it('rejects invalid refund-account input before it reaches persistence', async () => {
    const saveCustomerRefundAccount = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ saveCustomerRefundAccount }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/refund-account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        account_holder_name: 'P',
        bank_account: '1234-5678',
        bank_key: 'not-a-bank',
      }),
    }))

    expect(response.status).toBe(400)
    expect(saveCustomerRefundAccount).not.toHaveBeenCalled()
  })

  it('routes an explicitly confirmed account-deletion request to the customer-only service', async () => {
    const deleteCustomerAccount = vi.fn(async () => ({
      account_deleted: true as const,
      request_id: '77777777-7777-4777-8777-777777777777',
      retained_transaction_records: true as const,
    }))
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ deleteCustomerAccount }),
    })
    const input = {
      acknowledge_data_loss: true,
      client_request_id: '88888888-8888-4888-8888-888888888888',
      confirmation: 'XÓA TÀI KHOẢN',
    } as const

    const response = await handler(new Request('https://example.test/mobile-api/me/account-deletion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }))

    expect(response.status).toBe(200)
    expect(deleteCustomerAccount).toHaveBeenCalledWith(expect.objectContaining(customerAuth), input)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer'])
  })

  it('rejects account deletion when consent, phrase, idempotency id, or body shape is invalid', async () => {
    const deleteCustomerAccount = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ deleteCustomerAccount }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/account-deletion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        acknowledge_data_loss: false,
        client_request_id: 'not-a-uuid',
        confirmation: 'xóa',
        user_id: customerAuth.success ? customerAuth.user.id : null,
      }),
    }))

    expect(response.status).toBe(400)
    expect(deleteCustomerAccount).not.toHaveBeenCalled()
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

  it('routes customer GET /me/jobs/history to listCustomerServiceHistory', async () => {
    const listCustomerServiceHistory = vi.fn(async () => ({ service_history: [] }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listCustomerServiceHistory }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/jobs/history'))

    expect(response.status).toBe(200)
    expect(listCustomerServiceHistory).toHaveBeenCalledWith(expect.objectContaining(customerAuth))
  })

  it('/me/jobs/history is role-gated to customer + admin', async () => {
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ listCustomerServiceHistory: vi.fn(async () => ({ service_history: [] })) }),
    })

    await handler(new Request('https://example.test/mobile-api/me/jobs/history'))

    expect(authenticate).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['customer', 'admin']),
    )
    expect(authenticate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['worker']),
    )
  })

  it('returns only the customer-owned saved-worker matching list for a valid job', async () => {
    const jobId = '22222222-2222-4222-8222-222222222222'
    const listFavoriteWorkersForMatching = vi.fn(async () => ({ job_id: jobId, workers: [] }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listFavoriteWorkersForMatching }),
    })

    const response = await handler(new Request(
      `https://example.test/mobile-api/me/favorite-workers?job_id=${jobId}`,
    ))

    expect(response.status).toBe(200)
    expect(listFavoriteWorkersForMatching).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      jobId,
    )
  })

  it('validates and routes a customer matching preference with its idempotency key', async () => {
    const jobId = '22222222-2222-4222-8222-222222222222'
    const matchingState: MatchingState = {
      batch: null,
      checks: [
        { kind: 'service_capability', state: 'verified' },
        { kind: 'service_area', state: 'verified' },
        { kind: 'availability', state: 'verified' },
      ],
      event_history: [],
      stage: 'general_search',
      strategy: 'general',
    }
    const setJobMatchingPreference = vi.fn(async () => ({
      broadcast_sent: false,
      job_id: jobId,
      matching_state: matchingState,
      message: 'Kael đang bắt đầu tìm thợ.',
      status: 'broadcasting' as const,
      worker: null,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ setJobMatchingPreference }),
    })

    const response = await handler(new Request(
      `https://example.test/mobile-api/jobs/${jobId}/matching-preference`,
      {
        body: JSON.stringify({
          auto_general: true,
          client_request_id: '55555555-5555-4555-8555-555555555555',
          mode: 'general',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ))

    expect(response.status).toBe(200)
    expect(setJobMatchingPreference).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      jobId,
      {
        auto_general: true,
        client_request_id: '55555555-5555-4555-8555-555555555555',
        mode: 'general',
      },
    )

    const noFallbackResponse = await handler(new Request(
      `https://example.test/mobile-api/jobs/${jobId}/matching-preference`,
      {
        body: JSON.stringify({
          auto_general: false,
          client_request_id: '66666666-6666-4666-8666-666666666666',
          mode: 'saved_worker_first',
          worker_id: '44444444-4444-4444-8444-444444444444',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ))

    expect(noFallbackResponse.status).toBe(400)
    expect(setJobMatchingPreference).toHaveBeenCalledTimes(1)
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

  it('routes worker Kael memory preference writes through the worker endpoint', async () => {
    const updateWorkerKaelMemoryPreference = vi.fn(async () => ({ subject_type: 'worker' as const, memory: null }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateWorkerKaelMemoryPreference }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael-memory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'area_preference', enabled: true }),
    }))

    expect(response.status).toBe(200)
    expect(updateWorkerKaelMemoryPreference).toHaveBeenCalledWith(
      expect.objectContaining(workerAuth),
      { key: 'area_preference', enabled: true },
    )
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
        safe_metadata: {
          project_id_available: true,
          role: 'customer',
          source: 'expo-notifications',
        },
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
    // S2/F2 (§38): learning-candidate routes are now admin-only at the router
    // (before: ['customer','worker','admin']). The service-layer ctx.role guard
    // remains as defense-in-depth.
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['admin'])
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

  it('allows the optional worker route map origin to be omitted', async () => {
    const getWorkerRouteMap = vi.fn(async () => new Response('map', {
      headers: { 'content-type': 'image/png' },
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ getWorkerRouteMap }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/workers/me/jobs/job-1/route-map',
    ))

    expect(response.status).toBe(200)
    expect(getWorkerRouteMap).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'job-1',
      null,
    )
  })

  it('rejects explicit invalid route-map coordinates instead of treating them as omitted', async () => {
    const getWorkerRouteMap = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ getWorkerRouteMap }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/workers/me/jobs/job-1/route-map?origin_lat=bad&origin_lng=bad',
    ))

    expect(response.status).toBe(400)
    expect(getWorkerRouteMap).not.toHaveBeenCalled()
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

  it.each([
    'electrical',
    'plumbing',
    'cleaning',
    'hvac',
    'upholstery',
    'handyman',
  ])('fails closed when legacy POST /jobs tries to bypass Case Work for %s', async (serviceType) => {
    const createJob = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: serviceType,
        problem_chips: ['Ống rò rỉ'],
        description: 'Ống nước dưới lavabo bị rò và nhỏ nước liên tục',
        photo_urls: [],
        address_district: 'q7',
      }),
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'KAEL_CASE_WORK_REQUIRED',
      next_route: '/kael/chat',
    })
    expect(createJob).not.toHaveBeenCalled()
  })

  it('routes Kael chat session creation through customer/admin auth', async () => {
    const createKaelChat = vi.fn(async () => ({
      session: {
        id: 'kael-session-1',
        status: 'estimate_ready' as const,
        case_phase: 'offer_review' as const,
        diagnosis_scope: null,
        scheduled_at: null,
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

  it('fails closed when an admin tries to execute a customer Kael path-control action', async () => {
    const createKaelChat = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => adminAuth),
      services: makeServices({ createKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: 'plumbing',
        message: 'Ong nuoc duoi lavabo dang ro nuoc lien tuc',
        problem_chips: ['Ong ro ri'],
        photo_urls: [],
        address_district: 'q7',
      }),
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      code: 'KAEL_PATH_CONTROL_DENIED',
      reason_code: 'PATH_CONTROL_ACTOR_MISMATCH',
      actor_role: 'admin',
      expected_actor_role: 'customer',
      edge_route: 'POST /kael/chat',
      kael_purpose: 'intent_classification',
    })
    expect(createKaelChat).not.toHaveBeenCalled()
  })

  it('routes owner-scoped Kael media revocation through the Edge service', async () => {
    const revokeKaelChatMedia = vi.fn(async () => ({
      revoked_count: 1,
      deletion_pending: false,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ revokeKaelChatMedia }),
    })
    const mediaRef = `supabase://kael-chat-media/${customerAuth.user.id}/kael-chat/model_vision/frame.jpg`

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/media-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_refs: [mediaRef] }),
    }))

    expect(response.status).toBe(200)
    expect(revokeKaelChatMedia).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: customerAuth.user.id }) }),
      { media_refs: [mediaRef] },
    )
  })

  it('routes Kael chat history reads through customer auth', async () => {
    const getKaelChat = vi.fn(async () => ({
      session: {
        id: 'kael-session-1',
        status: 'active' as const,
        case_phase: 'analysis' as const,
        diagnosis_scope: null,
        scheduled_at: null,
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
      headers: { 'Content-Type': 'application/json' },
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

  it('routes Kael evidence SSE stream through the validated evidence contract', async () => {
    const streamKaelChatEvidence = vi.fn(async () => new Response(
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
      services: makeServices({ streamKaelChatEvidence }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1/evidence-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'skipped',
        skip_reason: 'No photo or reviewed transcript is available.',
      }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(await response.text()).toContain('event: result')
    expect(streamKaelChatEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'kael-session-1',
      expect.objectContaining({
        decision: 'skipped',
        media_refs: [],
        photo_urls: [],
        skip_reason: 'No photo or reviewed transcript is available.',
      }),
    )
  })

  it('routes private avatar upload, avatar confirmation, and activity-minute writes for workers', async () => {
    const createWorkerAvatarUpload = vi.fn(async () => ({
      avatar_ref: 'supabase://worker-avatars/33333333-3333-4333-8333-333333333333/avatar.jpg',
      bucket_id: 'worker-avatars' as const,
      expires_in_seconds: 7200,
      object_path: '33333333-3333-4333-8333-333333333333/avatar.jpg',
      signed_upload_url: 'https://storage.example.test/upload',
      token: 'signed-token',
    }))
    const updateWorkerAvatar = vi.fn(async () => ({
      avatar_url: 'https://storage.example.test/read/avatar.jpg',
      updated_at: '2026-07-13T14:00:00.000Z',
      worker_id: '33333333-3333-4333-8333-333333333333',
    }))
    const recordWorkerAppActiveMinute = vi.fn(async () => ({
      active_minutes: 1,
      incremented: true,
      last_active_at: '2026-07-13T14:01:00.000Z',
      worker_id: '33333333-3333-4333-8333-333333333333',
    }))
    const authenticate = vi.fn(async () => workerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({
        createWorkerAvatarUpload,
        recordWorkerAppActiveMinute,
        updateWorkerAvatar,
      }),
    })

    const uploadResponse = await handler(new Request('https://example.test/mobile-api/workers/me/avatar-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: 'worker.jpg',
        file_size_bytes: 1234,
        mime_type: 'image/jpeg',
      }),
    }))
    const avatarRef = 'supabase://worker-avatars/33333333-3333-4333-8333-333333333333/avatar.jpg'
    const updateResponse = await handler(new Request('https://example.test/mobile-api/workers/me/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_ref: avatarRef }),
    }))
    const activityResponse = await handler(new Request('https://example.test/mobile-api/workers/me/activity-minute', {
      method: 'POST',
    }))

    expect(uploadResponse.status).toBe(201)
    expect(updateResponse.status).toBe(200)
    expect(activityResponse.status).toBe(200)
    expect(createWorkerAvatarUpload).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      { file_name: 'worker.jpg', file_size_bytes: 1234, mime_type: 'image/jpeg' },
    )
    expect(updateWorkerAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      { avatar_ref: avatarRef },
    )
    expect(recordWorkerAppActiveMinute).toHaveBeenCalledWith(expect.objectContaining({ role: 'worker' }))
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker', 'admin'])
  })

  it('routes private avatar read, upload, and confirmation only for the signed-in customer', async () => {
    const getCustomerAvatar = vi.fn(async () => ({
      avatar_url: null,
      customer_id: '11111111-1111-4111-8111-111111111111',
      updated_at: null,
    }))
    const createCustomerAvatarUpload = vi.fn(async () => ({
      avatar_ref: 'supabase://customer-avatars/11111111-1111-4111-8111-111111111111/avatar.jpg',
      bucket_id: 'customer-avatars' as const,
      expires_in_seconds: 7200,
      object_path: '11111111-1111-4111-8111-111111111111/avatar.jpg',
      signed_upload_url: 'https://storage.example.test/upload',
      token: 'signed-token',
    }))
    const updateCustomerAvatar = vi.fn(async () => ({
      avatar_url: 'https://storage.example.test/read/customer-avatar.jpg',
      customer_id: '11111111-1111-4111-8111-111111111111',
      updated_at: '2026-07-29T12:00:00.000Z',
    }))
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({
        createCustomerAvatarUpload,
        getCustomerAvatar,
        updateCustomerAvatar,
      }),
    })

    const readResponse = await handler(new Request('https://example.test/mobile-api/me/avatar'))
    const uploadResponse = await handler(new Request('https://example.test/mobile-api/me/avatar-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: 'customer.jpg',
        file_size_bytes: 2345,
        mime_type: 'image/jpeg',
      }),
    }))
    const avatarRef = 'supabase://customer-avatars/11111111-1111-4111-8111-111111111111/avatar.jpg'
    const updateResponse = await handler(new Request('https://example.test/mobile-api/me/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_ref: avatarRef }),
    }))

    expect([readResponse.status, uploadResponse.status, updateResponse.status]).toEqual([200, 201, 200])
    expect(getCustomerAvatar).toHaveBeenCalledWith(expect.objectContaining({ role: 'customer' }))
    expect(createCustomerAvatarUpload).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      { file_name: 'customer.jpg', file_size_bytes: 2345, mime_type: 'image/jpeg' },
    )
    expect(updateCustomerAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      { avatar_ref: avatarRef },
    )
    expect(authenticate).toHaveBeenCalledTimes(3)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer'])
  })

  it('does not dispatch Customer avatar operations when customer authorization fails', async () => {
    const createCustomerAvatarUpload = vi.fn()
    const getCustomerAvatar = vi.fn()
    const updateCustomerAvatar = vi.fn()
    const authenticate = vi.fn(async (): Promise<MobileApiAuthResult> => ({
      success: false,
      status: 403,
      error: 'forbidden',
    }))
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ createCustomerAvatarUpload, getCustomerAvatar, updateCustomerAvatar }),
    })

    const responses = await Promise.all([
      handler(new Request('https://example.test/mobile-api/me/avatar')),
      handler(new Request('https://example.test/mobile-api/me/avatar-upload', { method: 'POST' })),
      handler(new Request('https://example.test/mobile-api/me/avatar', { method: 'PATCH' })),
    ])

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403])
    expect(getCustomerAvatar).not.toHaveBeenCalled()
    expect(createCustomerAvatarUpload).not.toHaveBeenCalled()
    expect(updateCustomerAvatar).not.toHaveBeenCalled()
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer'])
  })

  it('does not dispatch Worker avatar or activity writes when role authorization fails', async () => {
    const createWorkerAvatarUpload = vi.fn()
    const recordWorkerAppActiveMinute = vi.fn()
    const updateWorkerAvatar = vi.fn()
    const authenticate = vi.fn(async (): Promise<MobileApiAuthResult> => ({
      success: false,
      status: 403,
      error: 'forbidden',
    }))
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ createWorkerAvatarUpload, recordWorkerAppActiveMinute, updateWorkerAvatar }),
    })

    const responses = await Promise.all([
      handler(new Request('https://example.test/mobile-api/workers/me/avatar-upload', { method: 'POST' })),
      handler(new Request('https://example.test/mobile-api/workers/me/avatar', { method: 'PATCH' })),
      handler(new Request('https://example.test/mobile-api/workers/me/activity-minute', { method: 'POST' })),
    ])

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403])
    expect(createWorkerAvatarUpload).not.toHaveBeenCalled()
    expect(updateWorkerAvatar).not.toHaveBeenCalled()
    expect(recordWorkerAppActiveMinute).not.toHaveBeenCalled()
    expect(authenticate).toHaveBeenCalledTimes(3)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker', 'admin'])
  })

  it('forwards the explicit Customer Kael mode when listing a catalog', async () => {
    const listCustomerKaelConversations = vi.fn(async () => ({ sessions: [] }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listCustomerKaelConversations }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/me/kael/conversations?mode=case',
      { method: 'GET' },
    ))

    expect(response.status).toBe(200)
    expect(listCustomerKaelConversations).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer', user: customerAuth.user }),
      'case',
    )
  })

  it('creates a mode-scoped Customer Kael session through the owned route', async () => {
    const clientRequestId = '77777777-7777-4777-8777-777777777777'
    const privilegedSupabase = { client: 'service' }
    const userSupabase = { client: 'user' }
    const auth = {
      ...customerAuth,
      privilegedSupabase,
      supabase: privilegedSupabase,
      userSupabase,
    }
    const createCustomerKaelConversation = vi.fn(async () => ({
      session: {
        case_job_id: null,
        case_session_id: null,
        client_request_id: clientRequestId,
        customer_id: customerAuth.user.id,
        id: 'customer-conversation-1',
        mode: 'normal' as const,
        pinned_at: null,
        profile_id: null,
        service_type: null,
        started_at: '2026-07-13T17:00:00.000Z',
        title: null,
        total_turns: 0,
        updated_at: '2026-07-13T17:00:00.000Z',
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => auth),
      services: makeServices({ createCustomerKaelConversation }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/me/kael/conversations', {
      body: JSON.stringify({ client_request_id: clientRequestId, mode: 'normal' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(201)
    expect(createCustomerKaelConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        privilegedSupabase,
        role: 'customer',
        supabase: privilegedSupabase,
      }),
      { client_request_id: clientRequestId, mode: 'normal' },
    )
  })

  it('uses the service client only for catalog paths that can write', async () => {
    const privilegedSupabase = { client: 'service' }
    const userSupabase = { client: 'user' }
    const auth = {
      ...customerAuth,
      privilegedSupabase,
      supabase: privilegedSupabase,
      userSupabase,
    }
    const conversation = {
      session: {
        case_job_id: null,
        case_session_id: null,
        client_request_id: '77777777-7777-4777-8777-777777777777',
        customer_id: customerAuth.user.id,
        id: 'customer-conversation-1',
        mode: 'case' as const,
        pinned_at: null,
        profile_id: null,
        service_type: null,
        started_at: '2026-08-11T00:00:00.000Z',
        title: null,
        total_turns: 0,
        updated_at: '2026-08-11T00:00:00.000Z',
      },
      turns: [],
    }
    const listCustomerKaelConversations = vi.fn(async (ctx: { supabase: unknown }) => {
      expect(ctx.supabase).toBe(privilegedSupabase)
      return { sessions: [] }
    })
    const getCustomerKaelConversation = vi.fn(async (ctx: { supabase: unknown }) => {
      expect(ctx.supabase).toBe(userSupabase)
      return conversation
    })
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => auth),
      services: makeServices({ getCustomerKaelConversation, listCustomerKaelConversations }),
    })

    const [listResponse, getResponse] = await Promise.all([
      handler(new Request('https://example.test/mobile-api/me/kael/conversations?mode=case')),
      handler(new Request('https://example.test/mobile-api/me/kael/conversations/customer-conversation-1')),
    ])

    expect(listResponse.status).toBe(200)
    expect(getResponse.status).toBe(200)
    expect(listCustomerKaelConversations).toHaveBeenCalledOnce()
    expect(getCustomerKaelConversation).toHaveBeenCalledOnce()
  })

  it('dispatches a Customer conversation turn through the SSE boundary', async () => {
    const streamCustomerKaelConversationTurn = vi.fn(async () =>
      new Response(new ReadableStream(), {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ streamCustomerKaelConversationTurn }),
    })
    const input = {
      client_request_id: '88888888-8888-4888-8888-888888888888',
      language: 'vi',
      message: 'Kael kiem tra giup toi.',
    }

    const response = await handler(new Request(
      'https://example.test/mobile-api/me/kael/conversations/22222222-2222-4222-8222-222222222222/stream',
      {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(streamCustomerKaelConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      '22222222-2222-4222-8222-222222222222',
      input,
    )
  })

  it('forwards explicit Case Work closure confirmation when archiving a Customer session', async () => {
    const archiveCustomerKaelConversation = vi.fn(async () => ({
      archived_at: '2026-07-14T00:00:00.000Z',
      case_action: 'cancelled' as const,
      case_session_id: '33333333-3333-4333-8333-333333333333',
      job_id: '44444444-4444-4444-8444-444444444444',
      job_status: 'cancelled' as const,
      session_id: '22222222-2222-4222-8222-222222222222',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ archiveCustomerKaelConversation }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/me/kael/conversations/22222222-2222-4222-8222-222222222222?confirm_case_work=true',
      { method: 'DELETE' },
    ))

    expect(response.status).toBe(200)
    expect(archiveCustomerKaelConversation).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      '22222222-2222-4222-8222-222222222222',
      true,
    )
  })

  it('rejects an unknown Customer Kael mode before listing sessions', async () => {
    const listCustomerKaelConversations = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listCustomerKaelConversations }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/me/kael/conversations?mode=combined',
      { method: 'GET' },
    ))

    expect(response.status).toBe(400)
    expect(listCustomerKaelConversations).not.toHaveBeenCalled()
  })

  it('does not dispatch Customer Kael session routes when the role is rejected', async () => {
    const listCustomerKaelConversations = vi.fn()
    const authenticate = vi.fn(async (): Promise<MobileApiAuthResult> => ({
      error: 'forbidden',
      status: 403,
      success: false,
    }))
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ listCustomerKaelConversations }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/me/kael/conversations?mode=normal',
      { method: 'GET' },
    ))

    expect(response.status).toBe(403)
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['customer'])
    expect(listCustomerKaelConversations).not.toHaveBeenCalled()
  })

  it('forwards the explicit worker Kael chat mode when listing a catalog', async () => {
    const listWorkerKaelChats = vi.fn(async () => ({ sessions: [] }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ listWorkerKaelChats }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/workers/me/kael/chat?mode=normal',
      { method: 'GET' },
    ))

    expect(response.status).toBe(200)
    expect(listWorkerKaelChats).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'normal',
    )
  })

  it('rejects an unknown worker Kael chat mode before listing sessions', async () => {
    const listWorkerKaelChats = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ listWorkerKaelChats }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/workers/me/kael/chat?mode=combined',
      { method: 'GET' },
    ))

    expect(response.status).toBe(400)
    expect(listWorkerKaelChats).not.toHaveBeenCalled()
  })

  it('persists the selected worker Kael chat mode when creating a session', async () => {
    const createWorkerKaelChat = vi.fn(async () => ({
      session: {
        id: 'worker-session-normal',
        job_id: null,
        mode: 'normal' as const,
        worker_id: workerAuth.user.id,
        status: 'active' as const,
        title: null,
        pinned_at: null,
        started_at: '2026-07-13T07:30:00.000Z',
        closed_at: null,
        total_turns: 0,
        progress: null,
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ createWorkerKaelChat }),
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/workers/me/kael/chat',
      {
        body: JSON.stringify({
          language: 'vi',
          mode: 'normal',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    ))

    expect(response.status).toBe(201)
    expect(createWorkerKaelChat).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      {
        language: 'vi',
        mode: 'normal',
      },
    )
  })

  it('archives a worker Kael advisory session through the owned Edge route', async () => {
    const archiveWorkerKaelChat = vi.fn(async () => ({
      session_id: 'worker-session-1',
      archived_at: '2026-07-13T07:45:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ archiveWorkerKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael/chat/worker-session-1', {
      method: 'DELETE',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      session_id: 'worker-session-1',
      archived_at: '2026-07-13T07:45:00.000Z',
    })
    expect(archiveWorkerKaelChat).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'worker-session-1',
    )
  })

  it('renames an owned worker Kael advisory session through a validated Edge route', async () => {
    const renameWorkerKaelChat = vi.fn(async () => ({
      session: {
        id: 'worker-session-1',
        job_id: '22222222-2222-4222-8222-222222222222',
        mode: 'intake' as const,
        worker_id: workerAuth.user.id,
        status: 'active' as const,
        title: 'Kiểm tra rò nước lavabo',
        pinned_at: null,
        started_at: '2026-07-13T07:30:00.000Z',
        closed_at: null,
        total_turns: 2,
        progress: null,
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ renameWorkerKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael/chat/worker-session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Kiểm tra rò nước lavabo' }),
    }))

    expect(response.status).toBe(200)
    expect(renameWorkerKaelChat).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'worker-session-1',
      { title: 'Kiểm tra rò nước lavabo' },
    )
  })

  it('rejects an empty worker Kael session title before the service boundary', async () => {
    const renameWorkerKaelChat = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ renameWorkerKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael/chat/worker-session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    }))

    expect(response.status).toBe(400)
    expect(renameWorkerKaelChat).not.toHaveBeenCalled()
  })

  it('pins an owned worker Kael advisory session through a validated Edge route', async () => {
    const setWorkerKaelChatPinned = vi.fn(async () => ({
      session: {
        id: 'worker-session-1',
        job_id: '22222222-2222-4222-8222-222222222222',
        mode: 'intake' as const,
        worker_id: workerAuth.user.id,
        status: 'active' as const,
        title: 'Kiểm tra rò nước lavabo',
        pinned_at: '2026-07-13T08:00:00.000Z',
        started_at: '2026-07-13T07:30:00.000Z',
        closed_at: null,
        total_turns: 2,
        progress: null,
      },
      turns: [],
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ setWorkerKaelChatPinned }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael/chat/worker-session-1/pin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: true }),
    }))

    expect(response.status).toBe(200)
    expect(setWorkerKaelChatPinned).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'worker-session-1',
      { pinned: true },
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

    const clientRequestId = 'a7400000-0000-4000-8000-000000000001'
    const response = await handler(new Request('https://example.test/mobile-api/workers/me/kael/chat/worker-session-1/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_request_id: clientRequestId, language: 'vi', media_refs: [], message: 'Need scope advice.' }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(await response.text()).toContain('event: result')
    expect(streamWorkerKaelChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      'worker-session-1',
      { client_request_id: clientRequestId, language: 'vi', media_refs: [], message: 'Need scope advice.' },
    )
  })

  it('rejects client-controlled push metadata outside the safe allowlist', async () => {
    const registerDevicePushToken = vi.fn()
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
        safe_metadata: { phone: '0901234567' },
      }),
    }))

    expect(response.status).toBe(400)
    expect(registerDevicePushToken).not.toHaveBeenCalled()
  })

  it('routes current-device token unregister without accepting a user id', async () => {
    const unregisterDevicePushToken = vi.fn(async () => ({
      token_id: '44444444-4444-4444-8444-444444444444',
      unregistered: true,
      updated_at: '2026-07-14T00:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ unregisterDevicePushToken }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/notifications/device-token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        push_token: 'ExponentPushToken[valid-token]',
        user_id: 'another-user',
      }),
    }))

    expect(response.status).toBe(400)
    expect(unregisterDevicePushToken).not.toHaveBeenCalled()

    const validResponse = await handler(new Request('https://example.test/mobile-api/notifications/device-token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ push_token: 'ExponentPushToken[valid-token]' }),
    }))

    expect(validResponse.status).toBe(200)
    expect(await validResponse.json()).toMatchObject({ unregistered: true })
    expect(unregisterDevicePushToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer', user: customerAuth.user }),
      { push_token: 'ExponentPushToken[valid-token]' },
    )
  })

  it.each(['GET', 'PATCH', 'PUT', 'DELETE'])(
    'rejects %s on the POST-only worker Kael stream route',
    async (method) => {
      const streamWorkerKaelChatTurn = vi.fn()
      const authenticate = vi.fn(async () => workerAuth)
      const handler = createMobileApiHandler({
        authenticate,
        services: makeServices({ streamWorkerKaelChatTurn }),
      })
      const response = await handler(new Request(
        'https://example.test/mobile-api/workers/me/kael/chat/worker-session-1/stream',
        { method },
      ))

      expect(response.status).toBe(404)
      expect(authenticate).not.toHaveBeenCalled()
      expect(streamWorkerKaelChatTurn).not.toHaveBeenCalled()
    },
  )

  it('routes Kael chat follow-up turns with validated payloads', async () => {
    const sendKaelChatTurn = vi.fn(async () => ({
      session: {
        id: 'kael-session-1',
        status: 'active' as const,
        case_phase: 'analysis' as const,
        diagnosis_scope: null,
        scheduled_at: null,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_reasoning_receipt_id: 'price_reasoning:receipt-1',
      }),
    }))

    expect(response.status).toBe(200)
    expect(confirmKaelChat).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      'kael-session-1',
      { price_reasoning_receipt_id: 'price_reasoning:receipt-1' },
    )
  })

  it('rejects a Kael confirmation without the reviewed price receipt id', async () => {
    const confirmKaelChat = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ confirmKaelChat }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/chat/kael-session-1/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))

    expect(response.status).toBe(400)
    expect(confirmKaelChat).not.toHaveBeenCalled()
  })

  it('does not let admin QA bypass the Case Work offer gate through legacy POST /jobs', async () => {
    const createJob = vi.fn()
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

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'KAEL_CASE_WORK_REQUIRED',
      next_route: '/kael/chat',
    })
    expect(createJob).not.toHaveBeenCalled()
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

  it('keeps Kael job incident opening, readback, price preview, and proposal behind dedicated Edge routes', async () => {
    const openJobIncident = vi.fn(async () => ({ incident: null }))
    const getJobIncident = vi.fn(async () => ({ incident: null }))
    const previewScopeChangeFromJobIncident = vi.fn(async () => ({
      incident: {} as never,
      quote: {} as never,
    }))
    const proposeScopeChangeFromJobIncident = vi.fn(async () => ({
      incident: {
        id: 'incident-1',
        job_id: '22222222-2222-4222-8222-222222222222',
        status: 'scope_proposed' as const,
        evidence_status: 'ready' as const,
        last_summary: null,
        last_question: null,
        last_next_actor: null,
        created_at: '2026-07-12T00:00:00.000Z',
        updated_at: '2026-07-12T00:00:00.000Z',
      },
      scope_change: {
        scope_change_id: 'scope-1',
        job_id: '22222222-2222-4222-8222-222222222222',
        status: 'waiting_customer_decision' as const,
        created_at: '2026-07-12T00:00:00.000Z',
      },
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({
        getJobIncident,
        openJobIncident,
        previewScopeChangeFromJobIncident,
        proposeScopeChangeFromJobIncident,
      }),
    })
    const jobId = '22222222-2222-4222-8222-222222222222'
    const incidentRequestId = 'a7400000-0000-4000-8000-000000000002'

    const opened = await handler(new Request(`https://example.test/mobile-api/jobs/${jobId}/kael-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_request_id: incidentRequestId,
        new_description: 'Có thêm đoạn ống bị nứt sau lavabo.',
        reason: 'Phần nứt này chưa thuộc phạm vi đã chốt.',
        photo_urls: [],
      }),
    }))
    const read = await handler(new Request(`https://example.test/mobile-api/jobs/${jobId}/kael-incident`))
    const previewRequestId = 'a7500000-0000-4000-8000-000000000002'
    const previewed = await handler(new Request(`https://example.test/mobile-api/jobs/${jobId}/kael-incident/preview-scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_request_id: previewRequestId }),
    }))
    const rejectedProposal = await handler(new Request(`https://example.test/mobile-api/jobs/${jobId}/kael-incident/propose-scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }))
    const proposalRequestId = 'a7500000-0000-4000-8000-000000000003'
    const quoteId = 'a7500000-0000-4000-8000-000000000004'
    const proposed = await handler(new Request(`https://example.test/mobile-api/jobs/${jobId}/kael-incident/propose-scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_request_id: proposalRequestId, quote_id: quoteId }),
    }))

    expect(opened.status).toBe(201)
    expect(read.status).toBe(200)
    expect(previewed.status).toBe(200)
    expect(rejectedProposal.status).toBe(400)
    expect(proposed.status).toBe(200)
    expect(openJobIncident).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      jobId,
      expect.objectContaining({ client_request_id: incidentRequestId, photo_urls: [] }),
    )
    expect(getJobIncident).toHaveBeenCalledWith(expect.objectContaining({ role: 'worker' }), jobId)
    expect(previewScopeChangeFromJobIncident).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      jobId,
      { client_request_id: previewRequestId },
    )
    expect(proposeScopeChangeFromJobIncident).toHaveBeenCalledTimes(1)
    expect(proposeScopeChangeFromJobIncident).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker' }),
      jobId,
      { client_request_id: proposalRequestId, quote_id: quoteId },
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
          photo_urls: ['supabase://job-media/job-1/access_check_in/lobby.jpg'],
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
          photo_urls: ['supabase://job-media/job-1/access_check_in/lobby.jpg'],
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

  it('rejects apartment check-in evidence that belongs to a different job', async () => {
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
        access_check_in: {
          mode: 'manual_photo',
          photo_urls: ['supabase://job-media/job-2/access_check_in/lobby.jpg'],
        },
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION' })
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('rejects a JSON mutation sent with a non-JSON content type', async () => {
    const createJob = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      body: '{}',
      headers: { 'Content-Type': 'text/plain' },
      method: 'POST',
    }))

    expect(response.status).toBe(415)
    expect(await response.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' })
    expect(createJob).not.toHaveBeenCalled()
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

  it('stops reading an oversized chunked JSON body near the byte limit', async () => {
    const createJob = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })
    let pullCount = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1
        if (pullCount > 200) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(8 * 1024).fill(120))
      },
      cancel() {
        cancelled = true
      },
    })

    const response = await handler(new Request(
      'https://example.test/mobile-api/jobs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' },
    ))

    expect(response.status).toBe(413)
    expect(pullCount).toBeLessThanOrEqual(10)
    expect(cancelled).toBe(true)
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

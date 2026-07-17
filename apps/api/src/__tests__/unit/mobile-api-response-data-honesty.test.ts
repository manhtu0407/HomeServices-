import { describe, expect, it } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import { listServices } from '../../../../../supabase/functions/mobile-api/_shared/services/catalog.service'
import {
  serializeJobMessage,
  serializeKaelEstimate,
  serializeKaelSession,
  serializeKaelTurn,
} from '../../../../../supabase/functions/mobile-api/_shared/services/_runtime/shared'
import {
  getCustomerProfileInsights,
  getWorkerPerformanceInsights,
} from '../../../../../supabase/functions/mobile-api/_shared/services/profile-insights.service'
import { getWorkerCandidate } from '../../../../../supabase/functions/mobile-api/_shared/services/matching/candidates'
import { serializeWorkerKaelSession } from '../../../../../supabase/functions/mobile-api/_shared/services/worker-kael/index'
import { createJob } from '../../../../../supabase/functions/mobile-api/_shared/services/jobs/create'
import { getJobIncident } from '../../../../../supabase/functions/mobile-api/_shared/services/jobs/incident'
import {
  listNotifications,
  registerDevicePushToken,
} from '../../../../../supabase/functions/mobile-api/_shared/services/notifications.service'
import {
  setWorkerKaelTrainingConsent,
  submitCustomerKaelFeedback,
} from '../../../../../supabase/functions/mobile-api/_shared/services/kael-feedback.service'

type QueryResult = {
  data: unknown
  error: { code?: string; message?: string } | null
  count?: number | null
}

function sequenceClient(results: QueryResult[]) {
  const query = () => {
    const chain: Record<string, unknown> = {}
    for (const method of ['eq', 'in', 'insert', 'limit', 'maybeSingle', 'neq', 'order', 'select', 'single', 'update', 'upsert']) {
      chain[method] = () => chain
    }
    chain.then = (
      onfulfilled?: (value: QueryResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(results.shift() ?? { data: null, error: null }).then(onfulfilled, onrejected)
    return chain
  }

  return {
    from: () => query(),
    rpc: () => query(),
  }
}

function context(role: 'customer' | 'worker', client: ReturnType<typeof sequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: role === 'customer' ? 'customer-1' : 'worker-1' },
    role,
    supabase: client,
  }
}

describe('mobile-api response data honesty', () => {
  it('rejects a persisted Kael estimate with a missing price instead of emitting zero', () => {
    expect(() => serializeKaelEstimate({
      service_type: 'plumbing',
      problem_category: 'pipe_leak',
      problem_summary: 'Rò rỉ đường ống dưới bồn rửa.',
      complexity: 'small',
      price_max: 300_000,
      confidence: 0.8,
      disclaimer: 'Ước tính theo dữ liệu hiện có.',
    })).toThrow('Dữ liệu ước tính Kael không hợp lệ')
  })

  it('rejects an idempotent job replay with missing confidence instead of emitting zero percent', async () => {
    const client = sequenceClient([
      { data: { id: 'job-existing' }, error: null },
      {
        data: {
          display_code: 'NS-2026-000555',
          final_price: 300_000,
          id: 'job-existing',
          kael_advisory: null,
          kael_complexity: 'small',
          kael_estimate_card_v3: {
            estimate: {
              complexity: 'small',
              problem_category: 'pipe_leak',
              price_max: 300_000,
              price_min: 200_000,
            },
          },
          kael_price_max: 300_000,
          kael_price_min: 200_000,
          kael_problem_identified: 'Rò rỉ đường ống dưới bồn rửa.',
          service_type: 'plumbing',
          status: 'broadcasting',
        },
        error: null,
      },
    ])

    await expect(createJob(context('customer', client), {
      address_district: 'q7',
      client_request_id: 'c1000000-0000-4000-8000-000000000055',
      description: 'Rò rỉ đường ống dưới bồn rửa.',
      photo_urls: [],
      problem_chips: ['pipe_leak'],
      service_type: 'plumbing',
    }, {})).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects an unknown persisted chat sender instead of attributing it to the customer', () => {
    expect(() => serializeJobMessage({
      id: 'message-1',
      job_id: 'job-1',
      sender_id: 'worker-1',
      sender_role: 'provider_unknown_role',
      content: 'Tôi đang đến.',
      is_read: false,
      created_at: '2026-07-15T00:00:00.000Z',
    })).toThrow('Dữ liệu tin nhắn không hợp lệ')
  })

  it('rejects an unknown persisted customer Kael status instead of reopening it as active', () => {
    expect(() => serializeKaelSession({
      id: 'session-1',
      customer_id: 'customer-1',
      service_type: 'plumbing',
      status: 'provider_unknown_status',
      case_phase: 'analysis',
      diagnosis_scope: null,
      started_at: '2026-07-15T00:00:00.000Z',
      total_turns: 0,
      total_cost_usd: 0,
    }, null, [])).toThrow('Dữ liệu phiên Kael không hợp lệ')
  })

  it('rejects an unknown persisted customer Kael turn role instead of attributing it to system', () => {
    expect(() => serializeKaelTurn({
      id: 'turn-1',
      session_id: 'session-1',
      turn_index: 1,
      role: 'provider_unknown_role',
      content_type: 'text',
      text_content: 'Nội dung hợp lệ.',
      media_refs: [],
      safe_metadata: {},
      created_at: '2026-07-15T00:01:00.000Z',
    })).toThrow('Dữ liệu lượt chat Kael không hợp lệ')
  })

  it('rejects an unknown persisted worker Kael status instead of reopening it as active', () => {
    expect(() => serializeWorkerKaelSession({
      id: 'worker-session-1',
      job_id: 'job-1',
      worker_id: 'worker-1',
      status: 'provider_unknown_status',
      started_at: '2026-07-15T00:00:00.000Z',
      total_turns: 0,
      kael_progress: null,
    })).toThrow('Dữ liệu phiên Kael của thợ không hợp lệ')
  })

  it('rejects an unsupported service category instead of publishing it to mobile', async () => {
    const client = sequenceClient([
      {
        data: [{ id: 'category-1', service_type: 'roofing', label_vi: 'Sửa mái' }],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ])

    await expect(listServices(context('customer', client))).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects a partial customer aggregate instead of fabricating missing totals as zero', async () => {
    const client = sequenceClient([{
      data: [{
        active_streak_days: 0,
        completed_service_count: 1,
        disputed_transaction_count: 0,
        fair_price_service_count: 1,
        has_primary_address: false,
        kael_interaction_count: 1,
        member_since: '2026-07-15T00:00:00.000Z',
        positive_review_rate_percent: 100,
        preferred_service_count: 1,
        price_savings_vnd: 50_000,
        protected_transaction_count: 1,
        protected_value_vnd: 250_000,
        reviewed_service_count: 1,
        total_transaction_count: 1,
      }],
      error: null,
    }])

    await expect(getCustomerProfileInsights(context('customer', client))).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects a partial worker aggregate instead of publishing a fake zero review count', async () => {
    const client = sequenceClient([{
      data: [{
        accepted_broadcast_count: 1,
        average_response_minutes: 5,
        average_review_rating: null,
        completed_job_count: 1,
        on_time_job_count: 1,
        paid_job_count: 1,
        profile_exists: false,
        reconciled_earnings_vnd: 250_000,
        resolved_incident_case_count: 0,
        responded_broadcast_count: 1,
        scheduled_arrival_job_count: 1,
        total_broadcast_count: 1,
        work_response_review_count: 0,
        work_response_score: null,
      }],
      error: null,
    }])

    await expect(getWorkerPerformanceInsights(context('worker', client))).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects a candidate with a missing completed-job count instead of hiding it as zero', async () => {
    const client = sequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_candidate_pending',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
      {
        data: {
          id: 'candidate-1',
          job_id: 'job-1',
          worker_id: 'worker-1',
          status: 'proposed',
          proposed_at: '2026-07-15T00:00:00.000Z',
          expires_at: null,
          customer_decided_at: null,
        },
        error: null,
      },
      {
        data: {
          id: 'worker-1',
          rating: null,
          years_experience: 3,
          verification_status: 'approved',
        },
        error: null,
      },
      {
        data: { full_name: 'Thợ Minh', avatar_url: null },
        error: null,
      },
      { data: null, error: null },
    ])

    await expect(getWorkerCandidate(context('customer', client), 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects an inserted customer feedback row without an id instead of reporting success', async () => {
    const client = sequenceClient([{
      data: {
        id: null,
        status: 'new',
        created_at: '2026-07-15T00:00:00.000Z',
      },
      error: null,
    }])

    await expect(submitCustomerKaelFeedback(context('customer', client), {
      language: 'vi',
      message: 'Kael giải thích rõ ràng.',
      source: 'profile',
    })).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects a malformed persisted training-consent boolean instead of flipping it to false', async () => {
    const client = sequenceClient([{
      data: {
        worker_id: 'worker-1',
        training_consent: 'true',
        updated_at: '2026-07-15T00:00:00.000Z',
      },
      error: null,
    }])

    await expect(setWorkerKaelTrainingConsent(context('worker', client), {
      language: 'vi',
      source: 'profile',
      training_consent: true,
    })).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects a missing exact unread count instead of reporting zero notifications', async () => {
    const client = sequenceClient([
      { data: null, error: null, count: null },
      { data: [], error: null },
    ])

    await expect(listNotifications(context('customer', client))).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects a malformed persisted notification instead of emitting blank required copy', async () => {
    const client = sequenceClient([
      { data: null, error: null, count: 1 },
      {
        data: [{
          id: 'notification-1',
          title: null,
          body: 'Bạn có cập nhật mới.',
          event_type: 'job_status_changed',
          status: 'created',
          job_id: 'job-1',
          created_at: '2026-07-15T00:00:00.000Z',
          read_at: null,
        }],
        error: null,
      },
    ])

    await expect(listNotifications(context('customer', client))).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects a malformed device-token registration row instead of reporting success', async () => {
    const client = sequenceClient([{
      data: [{
        token_id: null,
        enabled_out: false,
        updated_at_ts: null,
      }],
      error: null,
    }])

    await expect(registerDevicePushToken(context('customer', client), {
      permission_status: 'granted',
      platform: 'ios',
      push_token: 'ExponentPushToken[test-device]',
      safe_metadata: {},
    })).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('rejects an impossible persisted job-incident status instead of stranding the worker flow', async () => {
    const client = sequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: {
          id: 'incident-1',
          job_id: 'job-1',
          status: 'provider_unknown_status',
          evidence_status: 'needs_more',
          last_summary: null,
          last_question: null,
          last_next_actor: null,
          created_at: '2026-07-15T00:00:00.000Z',
          updated_at: '2026-07-15T00:01:00.000Z',
        },
        error: null,
      },
    ])

    await expect(getJobIncident(context('worker', client), 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiContext,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/router'
import { readEdgeEnv } from '../../../../../supabase/functions/mobile-api/_shared/env'
import { requireJobAccess } from '../../../../../supabase/functions/mobile-api/_shared/access'
import { runKaelPipeline, type SupabaseLike } from '../../../../../supabase/functions/mobile-api/_shared/kael'
import { sendPushToUsers } from '../../../../../supabase/functions/mobile-api/_shared/push'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/services'

describe('mobile-api Edge runtime helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads current Supabase secret key JSON without exposing it to mobile code', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_test' }),
      }
      return values[name]
    })

    expect(env.supabaseUrl).toBe('https://project.supabase.co')
    expect(env.supabaseSecretKey).toBe('sb_secret_test')
  })

  it('accepts the APP_SECRET_KEY Edge secret name used by the linked Supabase project', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })

    expect(env.supabaseSecretKey).toBe('sb_secret_project')
  })

  it('reads the VietMap Maps key only from Edge secrets', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
        VIETMAP_API_KEY: 'vietmap-test-key',
      }
      return values[name]
    })

    expect(env.vietmapApiKey).toBe('vietmap-test-key')
  })

  it('accepts the legacy GOOGLE_MAP_KEY Edge secret alias used by production', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
        GOOGLE_MAP_KEY: 'maps-project-key',
      }
      return values[name]
    })

    expect(env.googleMapsApiKey).toBe('maps-project-key')
  })

  it('reads the Section 25 R2 Perplexity source trust flag at the Edge boundary', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: '1',
      }
      return values[name]
    })

    expect(env.sourceTrustPerplexityFilterEnabled).toBe(true)
    expect(env.sourceTrustPerplexityFilterExplicit).toBe(true)
  })

  it('keeps the B1 knowledge retrieval flag off by default and explicit at the Edge boundary', () => {
    const defaultEnv = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })
    const enabledEnv = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED: '1',
      }
      return values[name]
    })

    expect(defaultEnv.knowledgeRetrievalEnabled).toBe(false)
    expect(enabledEnv.knowledgeRetrievalEnabled).toBe(true)
  })

  it('accepts the Section 25 R2 source trust rollout alias at the Edge boundary', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_OPT_SOURCE_TRUST_ENABLED: 'yes',
      }
      return values[name]
    })

    expect(env.sourceTrustPerplexityFilterEnabled).toBe(true)
    expect(env.sourceTrustPerplexityFilterExplicit).toBe(true)
  })

  it('keeps Section 25 R2 staging-on and production-off when the rollout flag is absent', () => {
    const stagingEnv = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })
    const productionEnv = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })

    expect(stagingEnv.sourceTrustPerplexityFilterEnabled).toBe(true)
    expect(stagingEnv.sourceTrustPerplexityFilterExplicit).toBe(false)
    expect(productionEnv.sourceTrustPerplexityFilterEnabled).toBe(false)
    expect(productionEnv.sourceTrustPerplexityFilterExplicit).toBe(false)
  })

  it('lets an explicit Section 25 R2 false flag override the staging fallback', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
        KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: 'false',
      }
      return values[name]
    })

    expect(env.sourceTrustPerplexityFilterEnabled).toBe(false)
    expect(env.sourceTrustPerplexityFilterExplicit).toBe(true)
  })

  it('passes request host and project ref into the Edge service context', async () => {
    let seenContext: MobileApiContext | undefined
    const services = {
      listServices: async (ctx: MobileApiContext) => {
        seenContext = ctx
        return { services: [] }
      },
    } as unknown as MobileApiServices
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true,
        user: { id: 'customer-1' },
        role: 'customer',
        supabase: makeSequenceClient([]),
      }),
      services,
    })

    const response = await handler(
      new Request('https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api/services'),
    )

    expect(response.status).toBe(200)
    expect(seenContext).toMatchObject({
      requestUrl: expect.stringContaining('xyylanuyflrjzbjzhqfl.supabase.co'),
      requestHost: 'xyylanuyflrjzbjzhqfl.supabase.co',
      requestProjectRef: 'xyylanuyflrjzbjzhqfl',
    })
  })

  it('keeps the Edge service surface aligned with the mobile API plan', () => {
    const services = createEdgeServices({})

    expect(Object.keys(services).sort()).toEqual([
      'acceptBroadcast',
      'approveKaelLearningCandidate',
      'askKaelForWorker',
      'attachJobMedia',
      'cancelJob',
      'confirmKaelChat',
      'confirmCompletion',
      'confirmSearch',
      'createKaelChat',
      'createJob',
      'createWorkerKaelChat',
      'decideScopeChange',
      'decideWorkerCancellation',
      'declineBroadcast',
      'deleteMyKaelMemory',
      'evaluatePriceSynthesisAbCase',
      'getJob',
      'getKaelCharter',
      'getKaelChat',
      'getKaelChatProgress',
      'getMyKaelMemory',
      'getWorkerEarnings',
      'getWorkerKaelChat',
      'getWorkerKaelMemory',
      'getWorkerKaelTrainingConsent',
      'getWorkerProfile',
      'invalidateMarketCache',
      'listCustomerActiveJobs',
      'listJobMessages',
      'listKaelLearningCandidates',
      'listWorkerKaelChats',
      'processKaelBatchResults',
      'processKaelLearningQueue',
      'sendKaelChatTurn',
      'sendJobMessage',
      'sendWorkerKaelChatTurn',
      'setWorkerKaelTrainingConsent',
      'streamKaelChatTurn',
      'streamWorkerKaelChatTurn',
      'listNotifications',
      'listServices',
      'listWorkerBroadcasts',
      'listWorkerJobs',
      'markNotificationRead',
      'monitorKaelLearningRules',
      'openDispute',
      'placesAutocomplete',
      'registerDevicePushToken',
      'registerWorker',
      'requestScopeChange',
      'requestCustomerCancellation',
      'requestWorkerCancellation',
      'rejectKaelLearningCandidate',
      'submitDisputeCounterStatement',
      'submitCustomerKaelFeedback',
      'submitReview',
      'submitWorkerKaelFeedback',
      'decideDispute',
      'updateJobStatus',
      'updateWorkerAvailability',
    ].sort())
  })

  it('stores customer Kael feedback with a scrubbed learning copy', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'feedback-1',
          status: 'new',
          created_at: '2026-06-02T00:00:00.000Z',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).submitCustomerKaelFeedback(ctx, {
      language: 'vi',
      message: 'Kael nên nhắc rõ hơn qua số 0901234567 khi biên giá thay đổi.',
      source: 'profile',
    })

    expect(result).toEqual({
      feedback_id: 'feedback-1',
      status: 'new',
      created_at: '2026-06-02T00:00:00.000Z',
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].table).toBe('customer_kael_feedback')
    expect(client.calls[0].operations).toContainEqual([
      'insert',
      expect.objectContaining({
        customer_id: 'customer-1',
        language: 'vi',
        message: 'Kael nên nhắc rõ hơn qua số 0901234567 khi biên giá thay đổi.',
        message_scrubbed: expect.stringContaining('[phone]'),
        source: 'profile',
        status: 'new',
      }),
    ])
    expect(client.calls[0].operations).toContainEqual(['select', 'id, status, created_at'])
    expect(client.calls[0].operations).toContainEqual(['maybeSingle'])
  })

  it('returns a safe Places autocomplete fallback when no Maps provider key is configured', async () => {
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({}).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
    })).resolves.toEqual({
      suggestions: [],
      fallback_used: true,
    })
  })

  it('uses VietMap autocomplete before falling back to Google Maps', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify([{
        ref_id: 'vietmap-place-1',
        display: 'Landmark 81, Binh Thanh, Ho Chi Minh City',
        name: 'Landmark 81',
        address: 'Binh Thanh, Ho Chi Minh City',
      }]))
    )
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({
      vietmapApiKey: 'vietmap-test-key',
      googleMapsApiKey: 'maps-test-key',
    }).placesAutocomplete(ctx, {
      input: 'Landmark 81',
      session_token: 'session-1',
    })).resolves.toEqual({
      suggestions: [{
        place_id: 'vietmap-place-1',
        label: 'Landmark 81, Binh Thanh, Ho Chi Minh City',
        main_text: 'Landmark 81',
        secondary_text: 'Binh Thanh, Ho Chi Minh City',
      }],
      fallback_used: false,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const calledUrl = new URL(String(firstCall?.[0]))
    expect(`${calledUrl.origin}${calledUrl.pathname}`).toBe('https://maps.vietmap.vn/api/autocomplete/v4')
    expect(calledUrl.searchParams.get('text')).toBe('Landmark 81')
    expect(calledUrl.searchParams.get('display_type')).toBe('6')
    expect(calledUrl.searchParams.get('cityId')).toBe('12')
  })

  it('returns a safe Places autocomplete fallback when quota is exhausted', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({ googleMapsApiKey: 'maps-test-key' }).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
      session_token: 'session-1',
    })).resolves.toEqual({
      suggestions: [],
      fallback_used: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Bình Thạnh'),
      }),
    )
  })

  it('confirms Kael chat through the atomic RPC before starting worker broadcast', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_id: 'job-1',
          job_status: 'awaiting_customer_confirm',
          service_type: 'plumbing',
          district_code: 'q7',
        }],
        error: null,
      },
      { data: { safe_metadata: { address_label: 'Landmark 81, Bình Thạnh' } }, error: null },
      { data: null, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: ['leak'], service_problem_id: null, kael_problem_identified: 'Pipe leak' }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1')).resolves.toMatchObject({
      session_id: 'kael-session-1',
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: false,
    })

    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'confirm_kael_chat_atomic',
      {
        p_session_id: 'kael-session-1',
        p_customer_id: 'customer-1',
      },
    ])
    const addressUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const value = op[1] as { address_building?: string } | undefined
        return op[0] === 'update' && value?.address_building === 'Landmark 81, Bình Thạnh'
      })
    )
    expect(addressUpdateCall?.operations).toContainEqual(['eq', 'id', 'job-1'])
    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const value = op[1] as { status?: string } | undefined
        return op[0] === 'update' && value?.status === 'broadcasting'
      })
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'status', 'awaiting_customer_confirm'])
  })

  it('returns current state for a duplicate Kael chat confirmation without rebroadcasting', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_CONFIRMED',
          job_id: 'job-1',
          job_status: null,
          service_type: 'plumbing',
          district_code: null,
        }],
        error: null,
      },
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
      { data: [{ id: 'broadcast-1', expires_at: '2999-01-01T00:00:00.000Z' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1')).resolves.toMatchObject({
      session_id: 'kael-session-1',
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
      worker: null,
    })

    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'confirm_kael_chat_atomic',
      {
        p_session_id: 'kael-session-1',
        p_customer_id: 'customer-1',
      },
    ])
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'insert')
    )).toBe(false)
  })

  it('finishes the pending search transition when a duplicate Kael confirmation finds the job still in ticket review', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_CONFIRMED',
          job_id: 'job-1',
          job_status: null,
          service_type: 'plumbing',
          district_code: null,
        }],
        error: null,
      },
      {
        data: {
          id: 'job-1',
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
      {
        data: {
          id: 'job-1',
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_problem_identified: 'Pipe leak',
          kael_price_min: 150000,
          kael_price_max: 250000,
          final_price: null,
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: ['leak'], service_problem_id: null, kael_problem_identified: 'Pipe leak' }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1')).resolves.toMatchObject({
      session_id: 'kael-session-1',
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: false,
    })

    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const value = op[1] as { status?: string } | undefined
        return op[0] === 'update' && value?.status === 'broadcasting'
      })
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'status', 'awaiting_customer_confirm'])
    expect(client.calls.some((call) => call.table === 'kael_chat_sessions')).toBe(false)
  })

  it('hard-stops Kael chat before provider calls when the session exceeds the AI budget cap', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          total_turns: 2,
          safe_metadata: {
            address_district: 'q7',
            problem_chips: ['leak'],
            photo_urls: [],
          },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_cost_usd: 1 }, error: null },
      { data: { id: 'kael-session-1', total_turns: 3, total_cost_usd: 1 }, error: null },
      { data: { id: 'turn-budget' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: null,
          total_turns: 4,
          total_cost_usd: 1,
          safe_metadata: {},
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 3,
            role: 'customer',
            content_type: 'text',
            text_content: 'Pipe is still leaking in the kitchen cabinet',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-budget',
            session_id: 'kael-session-1',
            turn_index: 4,
            role: 'kael',
            content_type: 'error',
            text_content: 'Budget cap reached',
            media_refs: [],
            safe_metadata: { budget_exceeded: true },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Pipe is still leaking in the kitchen cabinet',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('budget_exceeded')
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    expect(client.calls.some((call) => call.table === 'price_baselines')).toBe(false)
    const budgetTurnUpdate = client.calls
      .flatMap((call) => call.operations)
      .find((op) => {
        const updateValue = op[1] as { total_turns?: number } | undefined
        return op[0] === 'update' && updateValue?.total_turns === 4
      })
    expect(budgetTurnUpdate?.[1]).not.toHaveProperty('estimate_ready_at')
  })

  it('records structured missing-field artifact metadata when Kael needs district context', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          total_turns: 0,
          safe_metadata: {},
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_cost_usd: 0 }, error: null },
      { data: { id: 'kael-session-1', total_turns: 1, total_cost_usd: 0, safe_metadata: {} }, error: null },
      { data: { id: 'turn-clarify' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: null,
          total_turns: 2,
          total_cost_usd: 0,
          safe_metadata: {},
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 1,
            role: 'customer',
            content_type: 'text',
            text_content: 'Ống nước rò dưới lavabo',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-clarify',
            session_id: 'kael-session-1',
            turn_index: 2,
            role: 'kael',
            content_type: 'clarification',
            text_content: 'Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.',
            media_refs: [],
            safe_metadata: {
              artifact_proposal: {
                artifact_type: 'process_ticket',
                visibility: 'partial',
                confidence: 0.4,
                missing_fields: ['address_district'],
                may_transition: false,
                recommended_next_question: 'Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.',
              },
            },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Ống nước rò dưới lavabo',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('await_input')
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    const clarificationInsert = client.calls.find((call) =>
      call.table === 'kael_chat_turns' &&
      call.operations.some((op) => {
        const value = op[1] as { content_type?: string } | undefined
        return op[0] === 'insert' && value?.content_type === 'clarification'
      })
    )
    const insertedTurn = clarificationInsert?.operations.find((op) => op[0] === 'insert')?.[1] as { safe_metadata?: Record<string, unknown> } | undefined
    expect(insertedTurn?.safe_metadata?.artifact_proposal).toMatchObject({
      artifact_type: 'process_ticket',
      missing_fields: ['address_district'],
      may_transition: false,
    })
  })

  it('records structured artifact metadata when Kael needs more description before estimating', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          total_turns: 0,
          safe_metadata: { address_district: 'q7' },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_cost_usd: 0 }, error: null },
      { data: { id: 'kael-session-1', total_turns: 1, total_cost_usd: 0, safe_metadata: {} }, error: null },
      { data: { id: 'turn-clarify' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: null,
          total_turns: 2,
          total_cost_usd: 0,
          safe_metadata: { address_district: 'q7' },
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 1,
            role: 'customer',
            content_type: 'text',
            text_content: 'Rò',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-clarify',
            session_id: 'kael-session-1',
            turn_index: 2,
            role: 'kael',
            content_type: 'clarification',
            text_content: 'Bạn mô tả rõ hơn vấn đề đang gặp: vị trí, dấu hiệu và mức độ ảnh hưởng trong căn hộ.',
            media_refs: [],
            safe_metadata: {
              artifact_proposal: {
                artifact_type: 'process_ticket',
                visibility: 'partial',
                confidence: 0.4,
                missing_fields: ['description'],
                may_transition: false,
                recommended_next_question: 'Bạn mô tả rõ hơn vấn đề đang gặp: vị trí, dấu hiệu và mức độ ảnh hưởng trong căn hộ.',
              },
            },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Rò',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('await_input')
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    const clarificationInsert = client.calls.find((call) =>
      call.table === 'kael_chat_turns' &&
      call.operations.some((op) => {
        const value = op[1] as { content_type?: string } | undefined
        return op[0] === 'insert' && value?.content_type === 'clarification'
      })
    )
    const insertedTurn = clarificationInsert?.operations.find((op) => op[0] === 'insert')?.[1] as { safe_metadata?: Record<string, unknown> } | undefined
    expect(insertedTurn?.safe_metadata?.artifact_proposal).toMatchObject({
      artifact_type: 'process_ticket',
      missing_fields: ['description'],
      may_transition: false,
    })
  })

  it('hard-stops Kael chat and queues admin review for demanding customer pressure', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'estimate_ready',
          total_turns: 3,
          safe_metadata: {
            address_district: 'q7',
            problem_chips: ['leak'],
            photo_urls: [],
            demanding_customer_qa_count: 4,
          },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'interaction-1' }, error: null },
      { data: { id: 'queue-1' }, error: null },
      { data: { id: 'kael-session-1', total_turns: 4, total_cost_usd: 0.001, safe_metadata: {} }, error: null },
      { data: { id: 'turn-hard' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: '2026-05-20T00:00:10.000Z',
          total_turns: 5,
          total_cost_usd: 0.001,
          safe_metadata: { demanding_customer_hard_escalation: true },
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 4,
            role: 'customer',
            content_type: 'text',
            text_content: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-hard',
            session_id: 'kael-session-1',
            turn_index: 5,
            role: 'kael',
            content_type: 'clarification',
            text_content: 'Kael đã ghi nhận đầy đủ. Để giải quyết tốt nhất, admin sẽ liên hệ bạn trong vòng 30 phút.',
            media_refs: [],
            safe_metadata: {
              demanding_customer: {
                escalation_level: 'hard',
                stop_ai_loop: true,
              },
            },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('await_input')
    expect(result.turns.at(-1)).toMatchObject({
      role: 'kael',
      content_type: 'clarification',
      text_content: expect.stringContaining('admin sẽ liên hệ'),
    })
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    expect(client.calls.some((call) => call.table === 'price_baselines')).toBe(false)
    expect(client.calls.find((call) => call.table === 'kael_interaction_log')).toBeTruthy()
    const queueCall = client.calls.find((call) => call.table === 'kael_admin_queue')
    expect(queueCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: null,
        actor_id: 'customer-1',
        priority: 'high',
        escalation_level: 'hard',
      }),
    ])
    const hardStopUpdate = client.calls
      .flatMap((call) => call.operations)
      .find((op) => {
        const updateValue = op[1] as { safe_metadata?: Record<string, unknown> } | undefined
        return op[0] === 'update' &&
          updateValue?.safe_metadata?.demanding_customer_hard_escalation === true
      })?.[1] as { safe_metadata?: Record<string, unknown> } | undefined
    expect(hardStopUpdate?.safe_metadata).toMatchObject({
      demanding_customer_hard_escalation: true,
      demanding_customer_stop_ai_loop: true,
    })
  })

  it('logs provider purposes for Kael chat estimate calls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const target = String(input)
      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                service_type: 'electrical',
                problem_slug: 'outlet_or_switch_broken',
                confidence: 0.9,
                needs_clarification: false,
              }),
            },
          }],
          usage: { prompt_tokens: 20, completion_tokens: 12 },
        }))
      }
      if (target.includes('anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              problem_identified: 'Ổ cắm cháy đen và có mùi khét',
              severity_indicators: ['mùi khét'],
              complexity_hint: 'medium',
            }),
          }],
          usage: { input_tokens: 35, output_tokens: 18 },
        }))
      }
      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 420000,
                confidence: 0.78,
                sources_summary: 'HCMC apartment repair references',
              }),
            },
          }],
          usage: { prompt_tokens: 25, completion_tokens: 15 },
        }))
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          service_type: 'electrical',
          status: 'active',
          total_turns: 1,
          safe_metadata: {
            address_district: 'q7',
            problem_chips: ['outlet_or_switch_broken'],
            photo_urls: [],
          },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_cost_usd: 0 }, error: null },
      { data: [{ id: 'problem-1' }], error: null },
      { data: [{ complexity: 'medium', price_min: 120000, price_max: 320000, district_code: 'hcmc_all' }], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: 'kael-session-1', total_turns: 2, total_cost_usd: 0 }, error: null },
      { data: { id: 'turn-estimate' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'electrical',
          status: 'estimate_ready',
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: '2026-05-20T00:00:10.000Z',
          total_turns: 3,
          total_cost_usd: 0.001,
          safe_metadata: {},
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 2,
            role: 'customer',
            content_type: 'text',
            text_content: 'Ổ cắm bị cháy đen và có mùi khét',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-estimate',
            session_id: 'kael-session-1',
            turn_index: 3,
            role: 'kael',
            content_type: 'estimate',
            text_content: 'Kael estimate',
            media_refs: [],
            safe_metadata: {
              estimate: {
                service_type: 'electrical',
                problem_category: 'outlet_or_switch_broken',
                problem_summary: 'Ổ cắm cháy đen và có mùi khét',
                complexity: 'medium',
                price_min: 156000,
                price_max: 380000,
                confidence: 0.64,
                advisory: null,
                disclaimer: 'disclaimer',
              },
            },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({
      deepseekApiKey: 'deepseek-ok',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    }).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Ổ cắm bị cháy đen và có mùi khét',
      photo_urls: [],
    })).resolves.toMatchObject({
      session: { next_action: 'estimate_ready' },
    })

    const apiLogCall = client.calls.find((call) => call.table === 'api_logs')
    const insertOp = apiLogCall?.operations.find((op) => op[0] === 'insert')
    const rows = insertOp?.[1] as Array<Record<string, unknown>>
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        job_id: null,
        purpose: 'intent_classification',
        provider: 'deepseek',
        success: true,
        safe_metadata: { surface: 'kael_chat', session_id: 'kael-session-1' },
      }),
      expect.objectContaining({
        job_id: null,
        purpose: 'market_lookup',
        provider: 'perplexity',
        success: true,
      }),
    ]))
    expect(rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        purpose: 'vision_analysis',
        provider: 'anthropic',
      }),
    ]))
    expect(rows.some((row) => row.purpose == null)).toBe(false)
    const metricCall = client.calls.find((call) => call.table === 'kael_optimization_metrics')
    const metricRows = metricCall?.operations.find((op) => op[0] === 'insert')?.[1] as Array<Record<string, unknown>>
    expect(metricRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        purpose: 'market_lookup',
        provider: 'perplexity',
        enabled_options: [],
        quality_pass: true,
      }),
    ]))
    const kaelEstimateTurn = client.calls
      .filter((call) => call.table === 'kael_chat_turns')
      .map((call) => call.operations.find((op) => op[0] === 'insert')?.[1] as Record<string, unknown>)
      .find((row) => row?.content_type === 'estimate')
    expect(kaelEstimateTurn?.safe_metadata).toMatchObject({
      artifact_proposal: {
        artifact_type: 'estimate',
        visibility: 'customer_review',
        may_transition: false,
      },
      estimate_card_v3: {
        artifact_proposal: {
          may_transition: false,
        },
      },
    })
  })

  it('returns JOB_PENDING instead of a fake estimate for duplicate in-flight job creates', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-pending' }, error: null },
      {
        data: {
          id: 'job-pending',
          status: 'analyzing',
          service_type: 'plumbing',
          kael_problem_identified: null,
          kael_complexity: null,
          kael_price_min: null,
          kael_price_max: null,
          kael_advisory: null,
          kael_estimate_card_v3: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      description: 'Ong nuoc ro ri duoi lavabo can tho toi kiem tra',
      problem_chips: ['pipe_leak'],
      photo_urls: [],
      address_district: 'q7',
      client_request_id: '00000000-0000-4000-8000-000000000001',
    })).rejects.toMatchObject({ code: 'JOB_PENDING', status: 409 })
  })

  it('returns SESSION_PENDING instead of a half-created empty Kael chat session', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-pending',
          job_id: null,
          status: 'active',
          estimate_ready_at: null,
          total_turns: 0,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createKaelChat(ctx, {
      service_type: 'electrical',
      message: 'Den phong tam chap chon can kiem tra',
      problem_chips: [],
      photo_urls: [],
      client_request_id: '00000000-0000-4000-8000-000000000002',
    })).rejects.toMatchObject({ code: 'SESSION_PENDING', status: 409 })
    expect(client.calls.map((call) => call.table)).toEqual(['kael_chat_sessions'])
  })

  it('requireJobAccess hides cross-customer jobs with 404', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'other-customer',
          worker_id: null,
        },
        error: null,
      },
    ])
    const ctx = {
      role: 'customer',
      user: { id: 'customer-1' },
      supabase: client,
    } as MobileApiContext
    const accessClient = client as unknown as Parameters<typeof requireJobAccess>[0]

    await expect(requireJobAccess(accessClient, 'job-1', ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  it('lists job chat messages for a job participant and marks received messages read', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'message-2',
            job_id: 'job-1',
            sender_id: 'customer-1',
            sender_role: 'customer',
            content: 'Tôi đang chờ ở sảnh.',
            is_read: false,
            created_at: '2026-05-20T00:01:00.000Z',
          },
          {
            id: 'message-1',
            job_id: 'job-1',
            sender_id: 'worker-1',
            sender_role: 'worker',
            content: 'Tôi đang đến.',
            is_read: true,
            created_at: '2026-05-20T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [{ id: 'message-2' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).listJobMessages(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      messages: [
        { id: 'message-1', sender_role: 'worker' },
        { id: 'message-2', sender_role: 'customer' },
      ],
    })

    const readCall = client.calls.find((call) =>
      call.table === 'chat_messages' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(readCall?.operations).toContainEqual(['neq', 'sender_id', 'worker-1'])
    expect(readCall?.operations).toContainEqual(['eq', 'is_read', false])
  })

  it('sends a job chat message and notifies the other participant without message body in push copy', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'worker-1',
          sender_role: 'worker',
          content: 'Tôi đang lên thang máy.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Tôi đang lên thang máy.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'worker',
        content: 'Tôi đang lên thang máy.',
      },
    })

    const insertCall = client.calls.find((call) => call.table === 'chat_messages')
    expect(insertCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        sender_id: 'worker-1',
        sender_role: 'worker',
        content: 'Tôi đang lên thang máy.',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('Tôi đang lên thang máy.'),
      }),
    )
  })

  it('redacts worker contact solicitation, records risk memory, and queues soft admin evidence', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-contact-guard',
          worker_id: 'worker-contact-guard',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'worker-contact-guard',
          sender_role: 'worker',
          content: 'Kael redacted contact content.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: 'message-kael-1',
          job_id: 'job-1',
          sender_id: null,
          sender_role: 'kael',
          content: 'Kael keeps contact, evidence, and payment in app.',
          is_read: false,
          created_at: '2026-05-20T00:00:01.000Z',
        },
        error: null,
      },
      {
        data: {
          red_flags: { disintermediation_risk_count: 1 },
          reliability_signals: {},
          safe_metadata: {},
        },
        error: null,
      },
      { data: { worker_id: 'worker-contact-guard' }, error: null },
      { data: { id: 'queue-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-contact-guard', push_token: 'ExponentPushToken[customer-contact-guard]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-contact-guard' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Goi em 0901234567 qua Zalo, khoi qua app cung duoc.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'worker',
      },
    })

    const chatInserts = client.calls
      .filter((call) => call.table === 'chat_messages')
      .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
    const workerInsert = chatInserts.find((op) =>
      (op[1] as Record<string, unknown>).sender_role === 'worker'
    )?.[1] as Record<string, unknown> | undefined
    const kaelInsert = chatInserts.find((op) =>
      (op[1] as Record<string, unknown>).sender_role === 'kael'
    )?.[1] as Record<string, unknown> | undefined
    expect(workerInsert).toMatchObject({
      job_id: 'job-1',
      sender_id: 'worker-contact-guard',
      sender_role: 'worker',
      content: expect.stringContaining('Kael'),
    })
    expect(JSON.stringify(workerInsert)).not.toContain('0901234567')
    expect(JSON.stringify(workerInsert)).not.toContain('Zalo')
    expect(kaelInsert).toMatchObject({
      job_id: 'job-1',
      sender_id: null,
      sender_role: 'kael',
      content: expect.stringContaining('app'),
    })

    const memoryUpsert = client.calls
      .find((call) => call.table === 'worker_kael_memory' && call.operations.some((op) => op[0] === 'upsert'))
      ?.operations.find((op) => op[0] === 'upsert')?.[1] as Record<string, unknown> | undefined
    expect(memoryUpsert).toMatchObject({
      worker_id: 'worker-contact-guard',
      red_flags: expect.objectContaining({
        disintermediation_contact_leak: true,
        disintermediation_risk_count: 2,
        last_disintermediation_job_id: 'job-1',
        last_disintermediation_signals: expect.arrayContaining(['phone', 'zalo', 'off_app']),
      }),
      reliability_signals: expect.objectContaining({
        app_channel_guard_triggered: true,
      }),
      safe_metadata: expect.objectContaining({
        last_disintermediation_guard: expect.objectContaining({
          job_id: 'job-1',
          signals: expect.arrayContaining(['phone', 'zalo', 'off_app']),
        }),
      }),
    })
    expect(JSON.stringify(memoryUpsert)).not.toContain('0901234567')

    expect(client.calls.find((call) => call.table === 'kael_admin_queue')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        actor_id: 'worker-contact-guard',
        actor_role: 'worker',
        queue_type: 'disintermediation_risk',
        priority: 'medium',
        escalation_level: 'soft',
        reason_code: 'worker_contact_or_off_app_solicitation',
        safe_metadata: expect.objectContaining({
          signals: expect.arrayContaining(['phone', 'zalo', 'off_app']),
        }),
      }),
    ])
    expect(JSON.stringify(client.calls)).not.toContain('0901234567')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('0901234567'),
      }),
    )
  })

  it('redacts customer contact solicitation without adding worker risk evidence', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-contact-customer',
          worker_id: 'worker-contact-customer',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'customer-contact-customer',
          sender_role: 'customer',
          content: 'Kael redacted contact content.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: 'message-kael-1',
          job_id: 'job-1',
          sender_id: null,
          sender_role: 'kael',
          content: 'Kael keeps contact and payment in app.',
          is_read: false,
          created_at: '2026-05-20T00:00:01.000Z',
        },
        error: null,
      },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-contact-customer', push_token: 'ExponentPushToken[worker-contact-customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-contact-customer' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Trao doi qua worker@example.com hoac Zalo, khoi qua app nhe.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'customer',
      },
    })

    const customerInsert = client.calls
      .filter((call) => call.table === 'chat_messages')
      .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
      .find((op) => (op[1] as Record<string, unknown>).sender_role === 'customer')?.[1] as
        | Record<string, unknown>
        | undefined
    expect(customerInsert).toMatchObject({
      job_id: 'job-1',
      sender_id: 'customer-contact-customer',
      sender_role: 'customer',
      content: expect.stringContaining('Kael'),
    })
    expect(JSON.stringify(client.calls)).not.toContain('worker@example.com')
    expect(client.calls.some((call) => call.table === 'worker_kael_memory')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('worker@example.com'),
      }),
    )
  })

  it('adds a Kael admin-wait message and defensive logs for hard demanding job chat', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'completed_by_worker',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'customer-1',
          sender_role: 'customer',
          content: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      { data: { id: 'interaction-1' }, error: null },
      { data: { id: 'queue-1' }, error: null },
      {
        data: {
          id: 'message-kael-1',
          job_id: 'job-1',
          sender_id: null,
          sender_role: 'kael',
          content: 'Kael đã ghi nhận đầy đủ. Để giải quyết tốt nhất, admin sẽ liên hệ bạn trong vòng 30 phút.',
          is_read: false,
          created_at: '2026-05-20T00:00:01.000Z',
        },
        error: null,
      },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'customer',
      },
    })

    const chatInserts = client.calls
      .filter((call) => call.table === 'chat_messages')
      .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
    expect(chatInserts).toEqual(expect.arrayContaining([
      [
        'insert',
        expect.objectContaining({
          sender_id: 'customer-1',
          sender_role: 'customer',
        }),
      ],
      [
        'insert',
        expect.objectContaining({
          sender_id: null,
          sender_role: 'kael',
          content: expect.stringContaining('admin sẽ liên hệ'),
        }),
      ],
    ]))
    expect(client.calls.find((call) => call.table === 'kael_interaction_log')).toBeTruthy()
    expect(client.calls.find((call) => call.table === 'kael_admin_queue')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        priority: 'high',
        escalation_level: 'hard',
      }),
    ])
    expect(client.calls.some((call) =>
      call.table === 'jobs' && call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('requireJobAccess allows admin owner bypass unless a role is required', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
    ])
    const ctx = {
      role: 'admin',
      user: { id: 'admin-1' },
      supabase: client,
    } as MobileApiContext
    const accessClient = client as unknown as Parameters<typeof requireJobAccess>[0]

    await expect(requireJobAccess(accessClient, 'job-1', ctx)).resolves.toMatchObject({
      id: 'job-1',
      status: 'broadcasting',
    })
    await expect(
      requireJobAccess(accessClient, 'job-1', ctx, { requiredRole: 'worker' }),
    ).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      status: 403,
    })
  })

  it('requireJobAccess enforces status guards with 409', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
    ])
    const ctx = {
      role: 'customer',
      user: { id: 'customer-1' },
      supabase: client,
    } as MobileApiContext
    const accessClient = client as unknown as Parameters<typeof requireJobAccess>[0]

    await expect(
      requireJobAccess(accessClient, 'job-1', ctx, { statuses: ['completed_by_worker'] }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })
  })

  it('counts unread notifications separately from the limited notification page', async () => {
    const client = makeSequenceClient([
      { data: null, error: null, count: 42 },
      {
        data: [{
          id: 'notification-1',
          title: 'Cập nhật',
          body: 'Đã đọc trong trang mới nhất',
          event_type: 'job_update',
          status: 'read',
          job_id: 'job-1',
          created_at: '2026-05-19T00:00:00.000Z',
          read_at: '2026-05-19T00:01:00.000Z',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).listNotifications(ctx)

    expect(result.unread_count).toBe(42)
    expect(result.notifications).toHaveLength(1)
    expect(client.calls).toHaveLength(2)
    expect(client.calls[0].operations).toContainEqual(['select', 'id', { count: 'exact', head: true }])
    expect(client.calls[0].operations).toContainEqual(['eq', 'user_id', 'customer-1'])
    expect(client.calls[0].operations).toContainEqual(['neq', 'status', 'read'])
    expect(client.calls[0].operations).toContainEqual(['neq', 'status', 'archived'])
    expect(client.calls[0].operations.some((op) => op[0] === 'limit')).toBe(false)
    expect(client.calls[1].operations).toContainEqual(['limit', 30])
  })

  it('registers notification device tokens through the atomic Supabase RPC only', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          token_id: '44444444-4444-4444-8444-444444444444',
          enabled_out: true,
          updated_at_ts: '2026-05-19T00:00:00.000Z',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).registerDevicePushToken(ctx, {
      platform: 'ios',
      push_token: 'ExponentPushToken[valid-token]',
      permission_status: 'granted',
      safe_metadata: { device: 'expo-go' },
    })

    expect(result).toEqual({
      token_id: '44444444-4444-4444-8444-444444444444',
      enabled: true,
      updated_at: '2026-05-19T00:00:00.000Z',
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'register_device_push_token_atomic',
      {
        p_user_id: 'customer-1',
        p_platform: 'ios',
        p_push_token: 'ExponentPushToken[valid-token]',
        p_permission_status: 'granted',
        p_safe_metadata: { device: 'expo-go' },
      },
    ])
  })

  it('sends Expo push batches and disables unregistered device tokens', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        data: [
          { status: 'ok', id: 'ticket-1' },
          {
            status: 'error',
            message: 'Device not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        ],
      }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: [
          { id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[ok]' },
          { id: 'token-2', user_id: 'worker-2', push_token: 'ExponentPushToken[stale]' },
        ],
        error: null,
      },
      { data: { id: 'token-2' }, error: null },
    ])

    const result = await sendPushToUsers(
      client as unknown as Parameters<typeof sendPushToUsers>[0],
      ['worker-1', 'worker-2'],
      {
        title: 'Có yêu cầu mới gần bạn',
        body: 'Sửa nước - Quận 7',
        data: {
          event_type: 'broadcast_received',
          job_id: 'job-1',
          deep_link: '/(worker)/jobs?broadcast_id=broadcast-1',
        },
        sound: 'default',
      },
    )

    expect(result).toMatchObject({ delivered: 1, failed: 1 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('ExponentPushToken[ok]'),
      }),
    )
    const tokenQuery = client.calls[0]
    expect(tokenQuery.operations).toContainEqual(['in', 'user_id', ['worker-1', 'worker-2']])
    expect(tokenQuery.operations).toContainEqual(['eq', 'enabled', true])
    expect(tokenQuery.operations).toContainEqual(['eq', 'permission_status', 'granted'])
    const disableCall = client.calls.find((call) =>
      call.table === 'device_push_tokens' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(disableCall?.operations).toContainEqual(['update', expect.objectContaining({ enabled: false })])
    expect(disableCall?.operations).toContainEqual(['eq', 'id', 'token-2'])
  })

  it('rejects unknown worker districts before registration upsert', async () => {
    const client = makeSequenceClient([
      { data: { role: 'worker' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['Ha Noi'],
      cccd_front_url: 'https://storage.example.com/front.jpg',
      cccd_back_url: 'https://storage.example.com/back.jpg',
      selfie_url: 'https://storage.example.com/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls).toHaveLength(2)
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'upsert')
    )).toBe(false)
  })

  it('rejects suspended worker registration before upsert even if verification status is not suspended', async () => {
    const client = makeSequenceClient([
      { data: { role: 'worker' }, error: null },
      { data: { verification_status: 'under_review', is_suspended: true }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['q1'],
      cccd_front_url: 'https://storage.example.com/front.jpg',
      cccd_back_url: 'https://storage.example.com/back.jpg',
      selfie_url: 'https://storage.example.com/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).rejects.toMatchObject({
      code: 'ALREADY_FINALIZED',
      status: 409,
    })

    expect(client.calls).toHaveLength(2)
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'upsert')
    )).toBe(false)
  })

  it('fails the service catalog when price baselines cannot load', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      { data: null, error: { code: 'PGRST500' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('maps thrown DB query failures to DB_ERROR instead of an unhandled Edge error', async () => {
    const client = makeSequenceClient([
      { reject: new Error('DB timeout after 10000ms') },
      { data: [], error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('fails the service catalog when a baseline row has an invalid price range', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      {
        data: [{
          service_type: 'plumbing',
          complexity: 'medium',
          district_code: 'q7',
          price_min: 0,
          price_max: 250000,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('fails the service catalog when a baseline row has an unknown district code', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      {
        data: [{
          service_type: 'plumbing',
          complexity: 'medium',
          district_code: 'unknown-district',
          price_min: 100000,
          price_max: 250000,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('deduplicates service-level catalog baselines when rows are problem-specific', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sua nuoc' }], error: null },
      {
        data: [
          { id: 'problem-1', service_category_id: 'cat-1', slug: 'pipe_leak', label_vi: 'Leak', default_complexity: 'small' },
          { id: 'problem-2', service_category_id: 'cat-1', slug: 'faucet_broken', label_vi: 'Faucet', default_complexity: 'small' },
        ],
        error: null,
      },
      {
        data: [
          {
            service_type: 'plumbing',
            service_problem_id: 'problem-1',
            complexity: 'small',
            district_code: 'hcmc_all',
            price_min: 150000,
            price_max: 350000,
          },
          {
            service_type: 'plumbing',
            service_problem_id: 'problem-2',
            complexity: 'small',
            district_code: 'hcmc_all',
            price_min: 150000,
            price_max: 350000,
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).listServices(ctx)

    expect(result.services[0].baselines).toEqual([{
      complexity: 'small',
      district_code: 'hcmc_all',
      price_min: 150000,
      price_max: 350000,
    }])
  })

  it('filters Edge baseline lookup by the classified problem slug', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'medium', price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q7',
    }, client, {})

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.serviceProblemId).toBe('pipe-problem')
    }
    expect(client.calls[0]).toMatchObject({
      table: 'service_problems',
      operations: expect.arrayContaining([
        ['eq', 'service_type', 'plumbing'],
        ['eq', 'slug', 'pipe_leak'],
      ]),
    })
    expect(client.calls[1]).toMatchObject({
      table: 'price_baselines',
      operations: expect.arrayContaining([
        ['eq', 'service_problem_id', 'pipe-problem'],
        ['eq', 'service_type', 'plumbing'],
        ['in', 'district_code', ['q7', 'hcmc_all']],
      ]),
    })
  })

  it('applies learned Edge Kael complexity and price rules when the read-path flag is enabled', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'large', price_min: 250000, price_max: 450000, district_code: 'q7' }], error: null },
      {
        data: [{
          id: 'complexity-rule-1',
          active_version: 1,
          affected_district: 'q7',
          rule_payload: {
            candidate_type: 'analysis_rule',
            suggested: {
              kind: 'raise_complexity_prior',
              from: 'medium',
              to: 'large',
              rationale: 'Frequent scope increases for this problem.',
            },
          },
        }],
        error: null,
      },
      {
        data: [{
          id: 'price-rule-1',
          active_version: 2,
          affected_district: 'q7',
          rule_payload: {
            candidate_type: 'price_prior_update',
            suggested: {
              new_min: 500000,
              new_max: 700000,
            },
          },
        }],
        error: null,
      },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q7',
    }, client, { learningEnabled: true })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.estimate.complexity).toBe('large')
      expect(result.estimate.price_min).toBe(500000)
      expect(result.estimate.price_max).toBe(700000)
    }

    const learningCalls = client.calls.filter((call) => call.table === 'learning_rules')
    expect(learningCalls).toHaveLength(2)
    expect(learningCalls[0].operations).toContainEqual(['eq', 'rule_type', 'analysis_rule'])
    expect(learningCalls[1].operations).toContainEqual(['eq', 'rule_type', 'price_prior_update'])

    const baselineCall = client.calls.find((call) => call.table === 'price_baselines')
    expect(baselineCall?.operations).toContainEqual(['select', 'complexity, price_min, price_max, district_code'])
    expect(baselineCall?.operations).toContainEqual(['in', 'district_code', ['q7', 'hcmc_all']])
  })

  it('rejects customer job creation without a concrete HCMC district before insert', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      problem_chips: ['pipe_leak'],
      description: 'Pipe leak under the sink',
      photo_urls: [],
      address_district: 'Ha Noi',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls).toHaveLength(0)
  })

  it('cancels an analyzing job when the Kael pipeline throws unexpectedly', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1' }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { reject: new Error('DB timeout after 10000ms') },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      problem_chips: ['pipe_leak'],
      description: 'Pipe leak under the sink',
      photo_urls: [],
      address_district: 'q7',
    })).rejects.toMatchObject({
      code: 'AI_FAILED',
      status: 502,
    })

    const cancelCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const updateValue = op[1] as { status?: string } | null
        return op[0] === 'update' && updateValue?.status === 'cancelled'
      })
    )
    expect(cancelCall?.operations).toContainEqual([
      'update',
      { status: 'cancelled', cancelled_at: expect.any(String) },
    ])
    expect(cancelCall?.operations).toContainEqual(['eq', 'id', 'job-1'])
    expect(cancelCall?.operations).toContainEqual(['eq', 'status', 'analyzing'])
    expect(cancelCall?.operations).toContainEqual(['select', 'id'])
    expect(cancelCall?.operations).toContainEqual(['maybeSingle'])

    const failedEventCall = client.calls.find((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) =>
        op[0] === 'insert' &&
        typeof op[1] === 'object' &&
        op[1] !== null &&
        'event_type' in op[1] &&
        op[1].event_type === 'kael_failed'
      )
    )
    expect(failedEventCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'kael_failed',
        from_status: 'analyzing',
        to_status: 'cancelled',
        safe_metadata: { reason_code: 'PIPELINE_THROW' },
      }),
    ])
  })

  it('declines unsupported work before touching price baselines', async () => {
    const supabase = {
      from: () => {
        throw new Error('baseline should not be queried for unsupported service')
      },
    }

    const result = await runKaelPipeline({
      serviceType: 'electrical',
      problemChips: ['Vấn đề khác'],
      description: 'Tôi cần sửa máy lạnh trong căn hộ',
      district: 'q7',
    }, supabase, {})

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('rejects invalid price baseline rows instead of synthesizing a zero estimate', async () => {
    const invalidBaselineResult = {
      data: [{ price_min: null, price_max: 250000, district_code: 'q7' }],
      error: null,
    }
    const query: ReturnType<SupabaseLike['from']> = {
      select: () => query,
      eq: () => query,
      in: () => query,
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(invalidBaselineResult).then(onfulfilled, onrejected)
      },
    }
    const supabase: SupabaseLike = {
      from: () => query,
    }

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Ống nước dưới lavabo bị rò và nhỏ nước liên tục',
      district: 'q7',
    }, supabase, {})

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'NO_BASELINE' })
  })

  it('uses Anthropic intent fallback before local heuristic fallback when DeepSeek has no balance', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number }
      const target = String(url)

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          error: {
            message: 'Insufficient Balance',
            code: 'invalid_request_error',
          },
        }), { status: 402 })
      }

      if (target.includes('anthropic.com') && body.max_tokens === 200) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              service_type: 'plumbing',
              problem_slug: 'pipe_leak',
              confidence: 0.86,
              needs_clarification: false,
            }),
          }],
          usage: { input_tokens: 40, output_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 320) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              problem_identified: 'Kitchen sink pipe leak',
              severity_indicators: ['steady leak'],
              complexity_hint: 'small',
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 24 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
                sources_summary: 'staging source summary '.repeat(35),
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'small', price_min: 150000, price_max: 350000, district_code: 'q1' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['pipe leak'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q1',
    }, supabase, {
      deepseekApiKey: 'deepseek-no-balance',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(false)
      expect(result.estimate.problem_category).toBe('pipe_leak')
      expect(result.serviceProblemId).toBe('pipe-problem')
    }
    expect(result.stageLogs.filter((stage) => stage.stage === 'intent')).toEqual([
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        success: false,
        failureReason: 'AI call failed: HTTP_402',
        fallbackUsed: false,
      }),
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        success: true,
        fallbackUsed: false,
      }),
    ])
  })

  it('skips Anthropic vision analysis when no customer photos are present', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> & { max_tokens?: number }
      requestBodies.push(body)
      const target = String(url)

      if (target.includes('storage.example.com')) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                service_type: 'plumbing',
                problem_slug: 'pipe_leak',
                confidence: 0.9,
                needs_clarification: false,
              }),
            },
          }],
          usage: { prompt_tokens: 40, completion_tokens: 12 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'medium', price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['á»ng rÃ² rá»‰'],
      description: 'Lavabo Ä‘ang rÃ² nÆ°á»›c phÃ­a dÆ°á»›i tá»§.',
      district: 'q7',
      photoUrls: [],
    }, supabase, {
      deepseekApiKey: 'deepseek-ok',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(false)
      expect(result.stageLogs.some((stage) => stage.stage === 'vision')).toBe(false)
      expect(result.estimate.problem_summary).toBe('plumbing: pipe_leak')
    }
    expect(requestBodies.some((body) => body.max_tokens === 320)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('anthropic.com'), expect.anything())
  })

  it('passes customer photo URLs to Anthropic vision analysis', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> & { max_tokens?: number }
      requestBodies.push(body)
      const target = String(url)

      if (target.includes('storage.example.com')) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                service_type: 'plumbing',
                problem_slug: 'pipe_leak',
                confidence: 0.9,
                needs_clarification: false,
              }),
            },
          }],
          usage: { prompt_tokens: 40, completion_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 320) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              problem_identified: 'Rò nước nhìn thấy dưới lavabo',
              severity_indicators: ['nước rỉ liên tục'],
              complexity_hint: 'small',
            }),
          }],
          usage: { input_tokens: 90, output_tokens: 28 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'small', price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])
    const photoUrl = 'https://storage.example.com/job-media/before-lavabo.jpg'

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Lavabo đang rò nước phía dưới tủ.',
      district: 'q7',
      photoUrls: [photoUrl],
    }, supabase, {
      deepseekApiKey: 'deepseek-ok',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    const visionBody = requestBodies.find((body) => body.max_tokens === 320)
    const visionMessages = visionBody?.messages as Array<{ content: unknown }> | undefined
    expect(visionMessages?.[0]?.content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Lavabo đang rò nước phía dưới tủ.'),
      }),
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: expect.any(String),
        },
      },
    ])
  })

  it('normalizes AI-invented problem slugs to a service fallback before baseline lookup', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number }
      const target = String(url)

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          error: {
            message: 'Insufficient Balance',
            code: 'invalid_request_error',
          },
        }), { status: 402 })
      }

      if (target.includes('anthropic.com') && body.max_tokens === 200) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              service_type: 'electrical',
              problem_slug: 'short_circuit',
              confidence: 0.82,
              needs_clarification: false,
            }),
          }],
          usage: { input_tokens: 40, output_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 500) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              problem_identified: 'Breaker trips repeatedly',
              severity_indicators: ['burning smell'],
              complexity_hint: 'medium',
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 24 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 350000,
                market_range_max: 750000,
                confidence: 0.7,
                sources_summary: 'staging source summary '.repeat(35),
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'other-electrical-problem' }], error: null },
      { data: [{ complexity: 'medium', price_min: 300000, price_max: 700000, district_code: 'hcmc_all' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'electrical',
      problemChips: ['cau dao trip'],
      description: 'Breaker keeps tripping and there is a light burning smell from an outlet.',
      district: 'q1',
    }, supabase, {
      deepseekApiKey: 'deepseek-no-balance',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(true)
      expect(result.estimate.problem_category).toBe('other_electrical')
      expect(result.serviceProblemId).toBe('other-electrical-problem')
    }
    expect(supabase.calls[0]).toMatchObject({
      table: 'service_problems',
      operations: expect.arrayContaining([
        ['eq', 'service_type', 'electrical'],
        ['eq', 'slug', 'other_electrical'],
      ]),
    })
  })

  it('surfaces worker status races as STATUS_CHANGED instead of fake success', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'repairing', worker_id: 'worker-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'completed_by_worker',
      // Phase 2.0 (2026-05-23): worker không nhập final_price; Kael giữ authority.
      completion_notes: 'Đã hoàn tất',
      completion_photo_urls: ['https://example.com/after-1.jpg'],
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })

    const updateCall = client.calls.find((call) => call.table === 'jobs' && call.operations.some((op) => op[0] === 'update'))
    expect(updateCall?.operations).toContainEqual(['eq', 'worker_id', 'worker-1'])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'repairing'])
    expect(updateCall?.operations).toContainEqual(['select', 'id'])
    expect(updateCall?.operations).toContainEqual(['maybeSingle'])
  })

  it('reuses stored completion photos when a worker retries completion after media attach', async () => {
    const storedAfterPhotos = ['supabase://job-media/job-1/after/photo-1.jpg']
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: null,
          worker_id: 'worker-1',
          final_price: null,
          completion_notes: null,
          completion_photo_urls: storedAfterPhotos,
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'completed_by_worker',
      completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'repairing',
      to_status: 'completed_by_worker',
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({
        status: 'completed_by_worker',
        completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
        completion_photo_urls: storedAfterPhotos,
      }),
    ])
  })

  it('rejects worker completion when neither payload nor stored after-photos exist', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: null,
          worker_id: 'worker-1',
          final_price: null,
          completion_notes: null,
          completion_photo_urls: [],
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'completed_by_worker',
      completion_notes: 'Đã thay ổ cắm và kiểm tra tải.',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('blocks customer completion when Kael has not locked final price', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'completed_by_worker', customer_id: 'customer-1', final_price: null }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })
  })

  it('keeps the customer ownership guard inside customer completion updates', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'completed_by_worker', customer_id: 'customer-1', final_price: 250000 }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'completed_by_worker'])
    expect(updateCall?.operations).toContainEqual(['select', 'id'])
    expect(updateCall?.operations).toContainEqual(['maybeSingle'])
  })

  it('treats duplicate customer completion confirmation as current state without writing again', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'confirmed_by_customer',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          final_price: 250000,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).resolves.toEqual({
      job_id: 'job-1',
      status: 'confirmed_by_customer',
      final_price: 250000,
    })

    expect(client.calls.map((call) => call.table)).toEqual(['jobs'])
  })

  it('returns broadcast_state on job detail after expiring stale broadcasts', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          service_type: 'plumbing',
          description: 'Leak under sink',
          problem_chips: ['Leak'],
          photo_urls: [],
          address_district: 'q7',
          customer_id: 'customer-1',
          created_at: '2026-05-17T00:00:00.000Z',
        },
        error: null,
      },
      { data: { id: 'broadcast-1' }, error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-1')).resolves.toMatchObject({
      job: { id: 'job-1', status: 'broadcasting' },
      broadcast_state: { active_count: 0, seconds_remaining: 0 },
    })

    const expireCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(expireCall?.operations).toContainEqual(['eq', 'job_id', 'job-1'])
    expect(expireCall?.operations).toContainEqual(['eq', 'status', 'sent'])
    expect(expireCall?.operations.some((op) => op[0] === 'lte' && op[1] === 'expires_at')).toBe(true)
  })

  it('returns the active scope-change request on pending job detail', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'scope_change_pending',
          service_type: 'electrical',
          description: 'Breaker issue',
          problem_chips: ['Breaker'],
          photo_urls: [],
          address_district: 'q1',
          customer_id: 'customer-1',
          created_at: '2026-05-17T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [{
          id: 'scope-1',
          status: 'waiting_customer_decision',
          requested_description: 'Replace damaged breaker',
          reason: 'Breaker is burnt',
          price_min: 250000,
          price_max: 250000,
          kael_computed_min: 250000,
          kael_computed_max: 350000,
          kael_review: {
            problem_summary: 'Replace damaged breaker',
            advisory: 'Confirm before continuing',
            complexity_assessment: 'medium',
            confidence: 0.8,
            fallback_used: false,
          },
          kael_progress: {
            current_stage: 'scope_estimating',
            status: 'completed',
            progress: 1,
            failure_reason: null,
            updated_at: '2026-06-04T13:58:30.716Z',
          },
          evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
          created_at: '2026-05-17T00:01:00.000Z',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-1')).resolves.toMatchObject({
      job: { id: 'job-1', status: 'scope_change_pending' },
      current_scope_change: {
        id: 'scope-1',
        requested_description: 'Replace damaged breaker',
        price_min: 250000,
        kael_computed_max: 350000,
        kael_progress: expect.objectContaining({
          current_stage: 'scope_estimating',
          status: 'completed',
        }),
        evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
      },
    })

    const scopeCall = client.calls.find((call) => call.table === 'scope_change_requests')
    expect(scopeCall?.operations).toContainEqual(['eq', 'job_id', 'job-1'])
    expect(scopeCall?.operations).toContainEqual(['in', 'status', ['waiting_customer_decision', 'reviewing_by_kael']])
  })

  it('treats duplicate review RPC responses as idempotent current state when a review exists', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'paid',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REVIEWED',
          review_id: 'review-1',
          job_status: 'reviewed',
          reviewed_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: [],
    })).resolves.toEqual({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
    })

    expect(client.calls).toHaveLength(2)
    expect(client.calls[1]).toEqual({
      table: 'rpc:submit_review_atomic',
      operations: [[
        'rpc',
        'submit_review_atomic',
        {
          p_job_id: 'job-1',
          p_customer_id: 'customer-1',
          p_rating: 5,
          p_tags: [],
          p_comment: null,
        },
      ]],
    })
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
  })

  it('keeps duplicate review idempotency in reviewed phase when RPC omits job status', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'paid',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REVIEWED',
          review_id: 'review-1',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: [],
    })).resolves.toEqual({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
    })
  })

  it('returns the existing review when the current job is already reviewed', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'reviewed',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_problem_identified: 'Pipe leak',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
          final_price: 250000,
        },
        error: null,
      },
      { data: { id: 'review-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: [],
    })).resolves.toEqual({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
    })

    expect(client.calls.map((call) => call.table)).toEqual(['jobs', 'reviews'])
  })

  it('P9 records normal transaction memory and thanks the customer after review', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'paid',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_problem_identified: 'leaking_pipe',
          kael_complexity: 'medium',
          kael_price_min: 250000,
          kael_price_max: 450000,
          final_price: 450000,
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          review_id: 'review-1',
          job_status: 'reviewed',
          reviewed_at_ts: '2026-05-25T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: { service_preferences: {}, trust_signals: {}, safe_metadata: {} }, error: null },
      { data: null, error: null },
      { data: { service_skill_proficiency: {}, reliability_signals: {}, safe_metadata: {} }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-25T00:00:00.000Z' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: ['on_time'],
    })).resolves.toMatchObject({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
    })

    const customerMemoryUpsert = client.calls
      .find((call) =>
        call.table === 'customer_kael_memory' &&
        call.operations.some((op) => op[0] === 'upsert')
      )
      ?.operations.find((op) => op[0] === 'upsert')?.[1] as Record<string, unknown>
    expect(customerMemoryUpsert).toMatchObject({
      customer_id: 'customer-1',
      trust_signals: expect.objectContaining({
        reviewed_after_completion: true,
        last_rating: 5,
      }),
      safe_metadata: expect.objectContaining({
        last_normal_transaction: expect.objectContaining({
          layers: ['L2', 'L3', 'L5'],
          final_price_present: true,
        }),
      }),
    })

    const workerMemoryUpsert = client.calls
      .find((call) =>
        call.table === 'worker_kael_memory' &&
        call.operations.some((op) => op[0] === 'upsert')
      )
      ?.operations.find((op) => op[0] === 'upsert')?.[1] as Record<string, unknown>
    expect(workerMemoryUpsert).toMatchObject({
      worker_id: 'worker-1',
      reliability_signals: expect.objectContaining({
        customer_reviewed_after_completion: true,
        last_rating: 5,
      }),
    })

    const memoryAuditLayers = client.calls
      .filter((call) => call.table === 'kael_memory_audit')
      .map((call) => (call.operations.find((op) => op[0] === 'insert')?.[1] as Record<string, unknown>)?.layer)
    expect(memoryAuditLayers).toEqual(['L2', 'L3', 'L4', 'L5'])
    expect(client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')?.operations)
      .toContainEqual([
        'rpc',
        'insert_notification_atomic',
        expect.objectContaining({
          p_user_id: 'customer-1',
          p_job_id: 'job-1',
          p_event_type: 'review_thanks',
        }),
      ])
  })

  it('rejects direct cancellation after worker accept before calling the cancel RPC', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-1',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).cancelJob(ctx, 'job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls).toEqual([
      {
        table: 'jobs',
        operations: [[
          'select',
          'id, status, customer_id',
        ], [
          'eq',
          'id',
          'job-1',
        ], [
          'single',
        ]],
      },
    ])
  })

  it('validates pre-accept cancellation before using the atomic cancel RPC', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'cancelled',
          cancelled_at_ts: '2026-05-27T00:00:00.000Z',
        }],
        error: null,
      },
      { data: { id: 'event-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).cancelJob(ctx, 'job-1')).resolves.toEqual({
      job_id: 'job-1',
      status: 'cancelled',
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'rpc:cancel_job_before_accept_atomic',
      'job_events',
    ])
    expect(client.calls[1]?.operations).toContainEqual([
      'rpc',
      'cancel_job_before_accept_atomic',
      {
        p_job_id: 'job-1',
        p_customer_id: 'customer-1',
      },
    ])
    expect(client.calls[2]?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        event_type: 'customer_cancelled_before_accept',
        from_status: 'broadcasting',
        to_status: 'cancelled',
      }),
    ])
  })

  it('rejects accept when the atomic RPC says the worker is no longer eligible', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'WORKER_NOT_ELIGIBLE',
          job_status: null,
          address_building: null,
          address_unit: null,
          address_floor: null,
          address_district: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).acceptBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'WORKER_NOT_ELIGIBLE',
      status: 403,
    })
  })

  it('notifies the customer when a worker accepts a broadcast', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'worker_matched',
          address_building: 'River Gate',
          address_unit: '1201',
          address_floor: '12',
          address_district: 'q7',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: { customer_id: 'customer-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).acceptBroadcast(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'worker_matched',
      full_address: {
        building: 'River Gate',
        unit: null,
        floor: null,
        district: 'q7',
      },
      address_access: {
        release_stage: 'building_released',
        exact_unit_released: false,
        check_in_required: true,
        evidence_mode: 'none',
      },
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_matched',
        p_safe_metadata: { worker_id: 'worker-1' },
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?job_id=job-1'),
      }),
    )
  })

  it('masks exact apartment unit after accept until the worker check-in evidence releases it', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'worker_matched',
          address_building: 'River Gate',
          address_unit: '1201',
          address_floor: '12',
          address_district: 'q7',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: { customer_id: null }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).acceptBroadcast(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'worker_matched',
      full_address: {
        building: 'River Gate',
        unit: null,
        floor: null,
        district: 'q7',
      },
      address_access: {
        release_stage: 'building_released',
        exact_unit_released: false,
        check_in_required: true,
        identity_check_required: true,
        customer_handoff_required: true,
        evidence_mode: 'none',
      },
    })
  })

  it('notifies the customer when a worker arrives', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_on_way',
      to_status: 'arrived',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_arrived',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?job_id=job-1'),
      }),
    )
  })

  it('unlocks exact unit only when arrived status carries check-in evidence', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: null,
          worker_id: 'worker-1',
          apartment_access_state: { release_stage: 'building_released' },
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'arrived',
      access_check_in: {
        mode: 'manual_photo',
        photo_urls: ['supabase://job-media/job-1/after/lobby.jpg'],
        note: 'Đã đến sảnh và gặp bảo vệ.',
      },
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_on_way',
      to_status: 'arrived',
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({
        status: 'arrived',
        apartment_access_state: expect.objectContaining({
          release_stage: 'unit_released',
          exact_unit_released: true,
          check_in_required: false,
          evidence_mode: 'manual_photo',
          check_in: expect.objectContaining({
            mode: 'manual_photo',
            photo_urls: ['supabase://job-media/job-1/after/lobby.jpg'],
          }),
        }),
      }),
    ])
    const eventCall = client.calls.find((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) => op[0] === 'insert')
    )
    expect(eventCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        event_type: 'worker_status_update',
        safe_metadata: expect.objectContaining({
          apartment_access_release: true,
          release_stage: 'unit_released',
          evidence_mode: 'manual_photo',
        }),
      }),
    ])
  })

  it('keeps worker job list exact unit locked before check-in release', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          id: 'job-1',
          status: 'worker_matched',
          service_type: 'plumbing',
          kael_problem_identified: 'Pipe leak',
          address_building: 'River Gate',
          address_unit: '1201',
          address_floor: '12',
          address_district: 'q7',
          apartment_access_profile: { entry_method: 'Đăng ký ở quầy lễ tân' },
          apartment_access_state: { release_stage: 'building_released', exact_unit_released: false },
          kael_price_min: 150000,
          kael_price_max: 250000,
          kael_worker_brief_guidance: null,
          final_price: null,
          completion_notes: null,
          completion_photo_urls: [],
          created_at: '2026-06-04T00:00:00.000Z',
          matched_at: '2026-06-04T00:01:00.000Z',
          completed_at: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).listWorkerJobs(ctx)).resolves.toMatchObject({
      jobs: [{
        id: 'job-1',
        address_building: 'River Gate',
        address_unit: null,
        address_floor: null,
        district: 'q7',
        address_access: {
          release_stage: 'building_released',
          exact_unit_released: false,
          access_profile: { entry_method: 'Đăng ký ở quầy lễ tân' },
        },
      }],
    })
  })

  it('P9 keeps worker_on_way silent for the customer notification budget', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-p9-silent',
          worker_id: 'worker-1',
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'worker_on_way',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_matched',
      to_status: 'worker_on_way',
    })

    expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('persists Kael review before notifying the customer when scope-change confidence is below auto-decision policy', async () => {
    // Phase 2.0 (plan §22.7.B, 2026-05-23): computeScopeChangeEstimate schema
    // returns complexity_assessment + price_min/max + problem_summary.
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = typeof url === 'string' ? url : url.toString()
      if (target.includes('api.anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              complexity_assessment: 'medium',
              price_min: 200000,
              price_max: 350000,
              confidence: 0.42,
              problem_summary: 'Phần phát sinh: ống chính cần thay đoạn lớn.',
              advisory: 'Cần Kael quyết định trước khi thợ tiếp tục.',
            }),
          }],
          usage: { input_tokens: 120, output_tokens: 48 },
        }))
      }
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'electrical',
          description: 'Ổ cắm bị cháy',
          kael_problem_identified: 'Ổ cắm có dấu hiệu cháy',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
        },
        error: null,
      },
      { data: { scope_change_rate: 0.4 }, error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          scope_change_id: 'scope-1',
          scope_status: 'waiting_customer_decision',
          created_at_ts: '2026-05-20T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({ anthropicApiKey: 'test-anthropic-key' }).requestScopeChange(ctx, 'job-1', {
      // Phase 2.0 (2026-05-23): worker không gửi price; Kael compute từ context.
      new_description: 'Add repair scope after onsite inspection',
      reason: 'Found additional damaged part that needs immediate handling',
      photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
    })).resolves.toMatchObject({
      scope_change_id: 'scope-1',
      job_id: 'job-1',
      status: 'waiting_customer_decision',
    })

    const requestCallIndex = client.calls.findIndex((call) => call.table === 'rpc:request_scope_change_atomic')
    const notificationCallIndex = client.calls.findIndex((call) => call.table === 'rpc:insert_notification_atomic')
    expect(requestCallIndex).toBeGreaterThan(-1)
    expect(notificationCallIndex).toBeGreaterThan(requestCallIndex)
    const requestCall = client.calls[requestCallIndex]
    expect(requestCall.operations).toContainEqual([
      'rpc',
      'request_scope_change_atomic',
      expect.objectContaining({
        p_evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
        p_kael_computed_min: 200000,
        p_kael_computed_max: 350000,
        p_kael_review: expect.objectContaining({
          version: 'scope-change-estimate.2026-05-23.v1',
          fallback_used: false,
          problem_summary: expect.any(String),
          advisory: expect.any(String),
          complexity_assessment: 'medium',
          confidence: 0.42,
        }),
      }),
    ])
    const progressCalls = client.calls.filter((call) =>
      call.operations.some((op) => {
        const value = op[1] as { kael_progress?: unknown } | undefined
        return op[0] === 'update' && value?.kael_progress !== undefined
      })
    )
    expect(progressCalls.map((call) => call.table)).toEqual(expect.arrayContaining([
      'jobs',
      'scope_change_requests',
    ]))
    const scopeProgressCall = progressCalls.find((call) => call.table === 'scope_change_requests')
    expect(scopeProgressCall?.operations).toContainEqual([
      'update',
      {
        kael_progress: expect.objectContaining({
          current_stage: 'scope_estimating',
          status: 'completed',
          progress: 1,
        }),
      },
    ])
    expect(scopeProgressCall?.operations).toContainEqual(['eq', 'id', 'scope-1'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    )
    const apiLogCall = client.calls.find((call) => call.table === 'api_logs')
    expect(apiLogCall?.operations).toContainEqual([
      'insert',
      [expect.objectContaining({
        purpose: 'scope_change',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        success: true,
      })],
    ])
    expect(client.calls.findIndex((call) => call.table === 'api_logs')).toBeLessThan(notificationCallIndex)
    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'scope_change_requested',
        p_safe_metadata: { scope_change_id: 'scope-1' },
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?scope_change=scope-1&job_id=job-1'),
      }),
    )
  })

  it('limits worker "Hỏi Kael thêm" to three questions per job and logs sanitized answers', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          worker_id: 'worker-1',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          description: 'Ống nước dưới lavabo bị rò',
          address_district: 'Quận 7',
          kael_problem_identified: 'Ống nước rò dưới lavabo',
          kael_complexity: 'medium',
          kael_price_min: 250000,
          kael_price_max: 450000,
          kael_worker_brief_core: null,
          kael_worker_brief_guidance: null,
        },
        error: null,
      },
      { data: null, error: null, count: 2 },
      {
        data: {
          id: 'qa-3',
          created_at: '2026-05-25T00:00:00.000Z',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).askKaelForWorker(ctx, 'job-1', {
      question: 'Khách có SĐT 0901234567, tôi có nên báo thêm 300.000 VND không?',
    })

    expect(result).toMatchObject({
      qa_id: 'qa-3',
      job_id: 'job-1',
      remaining_questions: 0,
    })
    expect(JSON.stringify(result.answer)).not.toContain('0901234567')
    expect(JSON.stringify(result.answer).toLowerCase()).not.toContain('vnd')

    const insertCall = client.calls.find((call) =>
      call.table === 'kael_worker_qa_log' &&
      call.operations.some((op) => op[0] === 'insert')
    )
    expect(insertCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        worker_id: 'worker-1',
        question: expect.not.stringContaining('0901234567'),
      }),
    ])
  })

  it('keeps scope-change evidence media separate from completion photos', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'repairing',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          photo_urls: [],
          completion_photo_urls: ['supabase://job-media/existing-after.jpg'],
        },
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: 'media-1' }], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: `${jobId}/scope_change_evidence/evidence.jpg`,
        stage: 'scope_change_evidence',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).resolves.toMatchObject({
      job_id: jobId,
      media: [expect.objectContaining({
        stage: 'scope_change_evidence',
        storage_ref: `supabase://job-media/${jobId}/scope_change_evidence/evidence.jpg`,
      })],
    })

    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) =>
        op[0] === 'update' && JSON.stringify(op[1]).includes('completion_photo_urls')
      )
    )).toBe(false)
  })

  it('treats repeated media attach calls for the same object path as idempotent metadata sync', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const objectPath = `${jobId}/before/photo.jpg`
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'awaiting_customer_confirm',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: null,
          photo_urls: [],
          completion_photo_urls: [],
        },
        error: null,
      },
      { data: [{ object_path: objectPath }], error: null },
      { data: { id: jobId }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: objectPath,
        stage: 'before',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).resolves.toMatchObject({
      job_id: jobId,
      media: [expect.objectContaining({
        object_path: objectPath,
        storage_ref: `supabase://job-media/${objectPath}`,
      })],
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'job_media_assets',
      'jobs',
    ])
    expect(client.calls.some((call) =>
      call.table === 'job_media_assets' &&
      call.operations.some((op) => op[0] === 'insert')
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
  })

  it('deduplicates repeated media object paths within one attach request', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const objectPath = `${jobId}/before/photo.jpg`
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'awaiting_customer_confirm',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: null,
          photo_urls: [],
          completion_photo_urls: [],
        },
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: 'media-1' }], error: null },
      { data: { id: jobId }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [
        { object_path: objectPath, stage: 'before', mime_type: 'image/jpeg', file_size_bytes: 1234 },
        { object_path: objectPath, stage: 'before', mime_type: 'image/jpeg', file_size_bytes: 1234 },
      ],
    })

    expect(result).toMatchObject({
      job_id: jobId,
      photo_urls: [`supabase://job-media/${objectPath}`],
    })
    expect(result.media).toHaveLength(1)

    const insertCall = client.calls.find((call) =>
      call.table === 'job_media_assets' &&
      call.operations.some((op) => op[0] === 'insert')
    )
    expect(insertCall?.operations).toContainEqual([
      'insert',
      [expect.objectContaining({ object_path: objectPath })],
    ])
    expect(client.calls.find((call) => call.table === 'job_events')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        event_type: 'job_media_attached',
        safe_metadata: expect.objectContaining({ count: 1 }),
      }),
    ])
  })

  it('rejects completion media before the worker reaches repair/completion phase', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'worker_on_way',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          photo_urls: [],
          completion_photo_urls: [],
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: `${jobId}/after/evidence.jpg`,
        stage: 'after',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls.map((call) => call.table)).toEqual(['jobs'])
  })

  it('rejects worker cancellation after the customer has confirmed completion before calling the RPC', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'confirmed_by_customer',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Cannot continue after the job was already confirmed',
      evidence_photo_urls: [],
    })).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls.map((call) => call.table)).toEqual(['jobs'])
  })

  it('returns the existing worker cancellation request instead of duplicating side effects', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REQUESTED',
          cancellation_id: 'worker-cancel-1',
          cancellation_status: 'reviewing_by_kael',
          job_status: 'worker_on_way',
        }],
        error: null,
      },
      {
        data: {
          id: 'worker-cancel-1',
          status: 'reviewing_by_kael',
          created_at: '2026-05-26T00:00:00.000Z',
          reason_code: 'higher_pay_elsewhere',
          reason_category: 'suspicious',
          admin_review_required: true,
          fallback_options: [{ id: 'wait_15_minutes' }],
          abuse_signals: ['cancellation_rate_exceeded'],
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Emergency reason that prevents continuing the job',
      evidence_photo_urls: [],
    })).resolves.toMatchObject({
      cancellation_id: 'worker-cancel-1',
      job_id: 'job-1',
      status: 'reviewing_by_kael',
      job_status: 'worker_on_way',
      broadcast_sent: false,
      reason_code: 'higher_pay_elsewhere',
      reason_category: 'suspicious',
      admin_review_required: true,
      abuse_signals: ['cancellation_rate_exceeded'],
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'rpc:request_worker_cancellation_atomic',
      'worker_cancellation_requests',
    ])
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
  })

  it('returns the existing worker cancellation request when the duplicate RPC omits the cancellation id', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REQUESTED',
          cancellation_id: null,
          cancellation_status: 'reviewing_by_kael',
          job_status: 'worker_on_way',
        }],
        error: null,
      },
      {
        data: {
          id: 'worker-cancel-1',
          status: 'reviewing_by_kael',
          created_at: '2026-05-26T00:00:00.000Z',
          reason_code: 'higher_pay_elsewhere',
          reason_category: 'suspicious',
          admin_review_required: true,
          fallback_options: [{ id: 'wait_15_minutes' }],
          abuse_signals: ['cancellation_rate_exceeded'],
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Emergency reason that prevents continuing the job',
      evidence_photo_urls: [],
    })).resolves.toMatchObject({
      cancellation_id: 'worker-cancel-1',
      job_id: 'job-1',
      status: 'reviewing_by_kael',
      job_status: 'worker_on_way',
      broadcast_sent: false,
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'rpc:request_worker_cancellation_atomic',
      'worker_cancellation_requests',
    ])
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
  })

  it('returns an approved worker cancellation after the worker has already been released from the job', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
      {
        data: {
          id: 'worker-cancel-1',
          status: 'approved',
          created_at: '2026-05-26T00:00:00.000Z',
          reason_code: 'vehicle_breakdown_with_photo',
          reason_category: 'legit_auto_approve',
          admin_review_required: false,
          fallback_options: [{ id: 'wait_15_minutes' }],
          abuse_signals: [],
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Vehicle breakdown with photo proof already submitted.',
      evidence_photo_urls: ['supabase://job-media/job-1/cancellation_evidence/vehicle.jpg'],
    })).resolves.toMatchObject({
      cancellation_id: 'worker-cancel-1',
      job_id: 'job-1',
      status: 'approved',
      job_status: 'broadcasting',
      broadcast_sent: false,
      reason_code: 'vehicle_breakdown_with_photo',
      reason_category: 'legit_auto_approve',
      admin_review_required: false,
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'worker_cancellation_requests',
    ])
    expect(client.calls.some((call) => call.table === 'rpc:request_worker_cancellation_atomic')).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
  })

  it('notifies the worker when a scope change decision is recorded', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    // Phase 2.0a (plan §22.7.B.1, 2026-05-23): on approve, decideScopeChange
    // now (a) looks up scope_change_requests.kael_computed_min/max and (b)
    // updates jobs.final_price to the Kael-locked value before the
    // notification flow. The sequence below adds those two DB rounds.
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_id_out: 'job-1',
          scope_status: 'approved_by_customer',
          decided_at_ts: '2026-05-20T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { worker_id: 'worker-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).resolves.toMatchObject({
      scope_change_id: 'scope-1',
      job_id: 'job-1',
      status: 'approved_by_customer',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'worker-1',
        p_job_id: 'job-1',
        p_event_type: 'scope_change_approved',
        p_safe_metadata: expect.objectContaining({ scope_change_id: 'scope-1', decision: 'approve', actor: 'kael_system' }),
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(worker)/jobs?job_id=job-1'),
      }),
    )
    expect(client.calls.some((call) =>
      call.table === 'scope_change_requests' &&
      call.operations.some((op) => op[0] === 'select')
    )).toBe(false)
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('final_price'))
    )).toBe(false)
  })

  it('fails A11 Kael scope decision atomically when the Kael computed max is missing', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'KAEL_PRICE_MISSING',
          job_id_out: null,
          scope_status: null,
          decided_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'KAEL_PRICE_MISSING',
      status: 409,
    })

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].table).toBe('rpc:decide_scope_change_atomic')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('auto-approves worker cancellation, re-broadcasts, and notifies the customer without rating penalties', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-cancelled',
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          cancellation_id: 'cancel-1',
          cancellation_status: 'approved',
          job_id_out: 'job-1',
          job_status: 'broadcasting',
          service_type_out: 'plumbing',
          district_code: 'q7',
          worker_id_out: 'worker-cancelled',
          created_at_ts: '2026-05-20T00:00:00.000Z',
          reason_code: 'higher_pay_elsewhere',
          reason_category: 'suspicious',
          admin_review_required: true,
          fallback_options: [
            { id: 'wait_15_minutes', label_vi: 'Đợi 15 phút để Kael tìm tiếp', effect: 'continue_rebroadcast_search' },
            { id: 'reschedule', label_vi: 'Đổi sang khung giờ khác', effect: 'reschedule_job' },
            { id: 'cancel_no_charge', label_vi: 'Hủy việc, chưa tính phí trong Phase 0', effect: 'cancel_without_charge', no_charge_phase0: true },
          ],
          abuse_signals: ['cancellation_rate_exceeded', 'consecutive_cancel_threshold'],
        }],
        error: null,
      },
      {
        data: [
          { worker_id: 'worker-cancelled' },
          { worker_id: 'worker-prior' },
        ],
        error: null,
      },
      { data: { address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      {
        data: [
          { id: 'worker-cancelled', rating: 5, total_jobs: 100, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-prior', rating: 4.9, total_jobs: 90, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-new', rating: 4.8, total_jobs: 80, service_types: ['plumbing'], districts: ['q7'] },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: 'broadcast-new', worker_id: 'worker-new' }], error: null },
      { data: [{ notification_id: 'notification-worker', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-worker', user_id: 'worker-new', push_token: 'ExponentPushToken[worker]' }], error: null },
      { data: [{ notification_id: 'notification-customer', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-customer', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
      { data: null, error: null },
      { data: { red_flags: {}, reliability_signals: {}, safe_metadata: {} }, error: null },
      { data: { worker_id: 'worker-cancelled' }, error: null },
      { data: { id: 'queue-worker-cancel' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-cancelled' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Emergency reason that prevents continuing the job',
      evidence_photo_urls: [],
    })).resolves.toMatchObject({
      cancellation_id: 'cancel-1',
      job_id: 'job-1',
      status: 'approved',
      job_status: 'broadcasting',
      broadcast_sent: true,
      reason_code: 'higher_pay_elsewhere',
      reason_category: 'suspicious',
      admin_review_required: true,
      abuse_signals: ['cancellation_rate_exceeded', 'consecutive_cancel_threshold'],
      fallback_options: [
        expect.objectContaining({ id: 'wait_15_minutes' }),
        expect.objectContaining({ id: 'reschedule' }),
        expect.objectContaining({ id: 'cancel_no_charge', no_charge_phase0: true }),
      ],
    })

    const broadcastInsert = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'insert')
    )
    const insertOp = broadcastInsert?.operations.find((op) => op[0] === 'insert')
    expect(insertOp?.[1]).toEqual([
      expect.objectContaining({ worker_id: 'worker-new', job_id: 'job-1' }),
    ])
    expect(JSON.stringify(insertOp?.[1])).not.toContain('worker-cancelled')
    expect(JSON.stringify(insertOp?.[1])).not.toContain('worker-prior')

    const customerNotification = client.calls.find((call) =>
      call.table === 'rpc:insert_notification_atomic' &&
      call.operations.some((op) =>
        JSON.stringify(op).includes('worker_replacement_search')
      )
    )
    expect(customerNotification?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_replacement_search',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?job_id=job-1'),
      }),
    )
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('rating'))
    )).toBe(false)
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('is_suspended'))
    )).toBe(false)
    const workerMemoryUpdate = client.calls.find((call) =>
      call.table === 'worker_kael_memory' &&
      call.operations.some((op) => op[0] === 'upsert')
    )
    expect(workerMemoryUpdate?.operations).toContainEqual([
      'upsert',
      expect.objectContaining({
        worker_id: 'worker-cancelled',
        red_flags: expect.objectContaining({
          worker_cancellation_abuse_review: true,
        }),
      }),
    ])
    expect(client.calls.find((call) => call.table === 'kael_admin_queue')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        actor_id: 'worker-cancelled',
        queue_type: 'worker_cancellation_review',
        priority: 'medium',
        escalation_level: 'soft',
        reason_code: 'higher_pay_elsewhere',
      }),
    ])
  })

  it('requests customer cancellation through the atomic P12 RPC and notifies the accepted worker without money penalties', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          cancellation_id: 'customer-cancel-1',
          job_id_out: 'job-1',
          job_status: 'cancelled',
          sub_case: 'after_worker_accept',
          reason_code: 'changed_mind',
          reason_category: 'no_penalty_phase_0',
          worker_id_out: 'worker-1',
          admin_review_required: true,
          phase0_no_monetary_penalty: true,
          worker_goodwill: {
            required: true,
            kind: 'phase0_goodwill_note',
            worker_id: 'worker-1',
          },
          abuse_signals: ['cancel_after_accept_threshold'],
          created_at_ts: '2026-05-26T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', worker_id: 'worker-1' }, error: null },
      { data: { trust_signals: {}, safe_metadata: {} }, error: null },
      { data: { customer_id: 'customer-1' }, error: null },
      { data: { id: 'queue-customer-cancel' }, error: null },
      { data: [{ notification_id: 'notification-worker', created_at_ts: '2026-05-26T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-worker', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestCustomerCancellation(ctx, 'job-1', {
      reason_code: 'changed_mind',
      reason_note: 'Toi doi y va muon huy sau khi tho da nhan viec.',
    })).resolves.toMatchObject({
      cancellation_id: 'customer-cancel-1',
      job_id: 'job-1',
      status: 'requested',
      job_status: 'cancelled',
      sub_case: 'after_worker_accept',
      reason_code: 'changed_mind',
      reason_category: 'no_penalty_phase_0',
      admin_review_required: true,
      phase0_no_monetary_penalty: true,
      worker_goodwill: {
        required: true,
        kind: 'phase0_goodwill_note',
        worker_id: 'worker-1',
      },
      abuse_signals: ['cancel_after_accept_threshold'],
    })

    expect(client.calls.find((call) => call.table === 'rpc:request_customer_cancellation_atomic')?.operations).toContainEqual([
      'rpc',
      'request_customer_cancellation_atomic',
      expect.objectContaining({
        p_job_id: 'job-1',
        p_customer_id: 'customer-1',
        p_reason_code: 'changed_mind',
      }),
    ])
    expect(client.calls.find((call) => call.table === 'job_events')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'customer_requested_cancellation',
        to_status: 'cancelled',
        safe_metadata: expect.objectContaining({
          autonomy_decision: expect.objectContaining({
            actor: 'kael_system',
            action: 'process_cancellation',
            resulting_event: 'kael_processed_cancellation',
          }),
          autonomy_transition_valid: true,
        }),
      }),
    ])
    expect(client.calls.filter((call) => call.table === 'job_events')[1]?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'kael_processed_cancellation',
        from_status: 'worker_matched',
        to_status: 'cancelled',
        safe_metadata: expect.objectContaining({
          cancellation_id: 'customer-cancel-1',
          autonomy_decision: expect.objectContaining({
            actor: 'kael_system',
            action: 'process_cancellation',
          }),
        }),
      }),
    ])
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
      }),
    ])
    expect(client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')?.operations)
      .toContainEqual([
        'rpc',
        'insert_notification_atomic',
        expect.objectContaining({
          p_user_id: 'worker-1',
          p_job_id: 'job-1',
          p_event_type: 'customer_cancelled_after_accept',
        }),
      ])
    expect(JSON.stringify(client.calls)).not.toContain('customerPenaltyAmount')
    expect(JSON.stringify(client.calls)).not.toContain('workerCompensationAmount')
  })

  it('returns the existing customer cancellation request instead of duplicating side effects', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'completed_by_worker',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REQUESTED',
          job_status: 'completed_by_worker',
        }],
        error: null,
      },
      {
        data: {
          id: 'customer-cancel-1',
          status: 'dispute_pending',
          job_id: 'job-1',
          sub_case: 'after_worker_completed_trigger_dispute',
          reason_code: 'not_completed',
          reason_category: 'needs_admin_review',
          worker_id: 'worker-1',
          admin_review_required: true,
          phase0_no_monetary_penalty: true,
          worker_goodwill: { required: false, kind: 'none', worker_id: null, amount: null },
          abuse_signals: [],
          created_at: '2026-05-26T00:00:00.000Z',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestCustomerCancellation(ctx, 'job-1', {
      reason_code: 'not_completed',
      reason_note: 'Cong viec chua hoan tat nhu thong tin ban dau.',
    })).resolves.toMatchObject({
      cancellation_id: 'customer-cancel-1',
      job_id: 'job-1',
      status: 'requested',
      job_status: 'completed_by_worker',
      sub_case: 'after_worker_completed_trigger_dispute',
      reason_code: 'not_completed',
      reason_category: 'needs_admin_review',
      admin_review_required: true,
      phase0_no_monetary_penalty: true,
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'rpc:request_customer_cancellation_atomic',
      'customer_cancellation_records',
    ])
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
    expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
  })

  it('returns an existing customer cancellation even after the job is already cancelled', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'cancelled',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: {
          id: 'customer-cancel-1',
          status: 'requested',
          job_id: 'job-1',
          sub_case: 'after_worker_accept',
          reason_code: 'changed_mind',
          reason_category: 'no_penalty_phase_0',
          worker_id: 'worker-1',
          admin_review_required: false,
          phase0_no_monetary_penalty: true,
          worker_goodwill: { required: true, kind: 'phase0_goodwill_note', worker_id: 'worker-1' },
          abuse_signals: [],
          created_at: '2026-05-26T00:00:00.000Z',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestCustomerCancellation(ctx, 'job-1', {
      reason_code: 'changed_mind',
      reason_note: 'Toi bam lai nut huy sau khi yeu cau da duoc ghi nhan.',
    })).resolves.toMatchObject({
      cancellation_id: 'customer-cancel-1',
      job_id: 'job-1',
      status: 'requested',
      job_status: 'cancelled',
      sub_case: 'after_worker_accept',
      reason_code: 'changed_mind',
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'customer_cancellation_records',
    ])
  })

  it('opens a P13 dispute through the atomic RPC with a neutral summary and locked evidence id', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          dispute_id: 'dispute-1',
          evidence_snapshot_id: 'snapshot-1',
          dispute_status: 'open',
          admin_review_required: true,
          priority: 'high',
          evidence_locked_at: '2026-05-26T00:00:00.000Z',
          created_at_ts: '2026-05-26T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).openDispute(ctx, 'job-1', {
      dispute_type: 'completion_rejected',
      initiator_statement: 'Cong viec chua hoan tat nhu thong tin ban dau.',
      evidence_photo_urls: ['supabase://job-media/job-1/after/a.jpg'],
    })).resolves.toMatchObject({
      dispute_id: 'dispute-1',
      job_id: 'job-1',
      status: 'open',
      dispute_type: 'completion_rejected',
      evidence_snapshot_id: 'snapshot-1',
      admin_review_required: true,
      priority: 'high',
    })

    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'open_dispute_atomic',
      expect.objectContaining({
        p_job_id: 'job-1',
        p_initiated_by_id: 'customer-1',
        p_dispute_type: 'completion_rejected',
        p_kael_neutral_summary: expect.stringContaining('Evidence snapshot'),
      }),
    ])
    expect(JSON.stringify(client.calls[0].operations)).not.toContain('refund')
    expect(client.calls.find((call) => call.table === 'job_events')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'dispute_opened',
      }),
    ])
  })

  it('maps scope-change request races to STATUS_CHANGED instead of DB_ERROR', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'electrical',
          description: 'Old scope',
          address_district: 'q1',
          kael_problem_identified: 'Old issue',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
        },
        error: null,
      },
      { data: { worker_id: 'worker-1', scope_change_rate: 0 }, error: null },
      {
        data: [{
          ok: false,
          error_code: 'STATUS_CHANGED',
          scope_change_id: null,
          scope_status: null,
          created_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestScopeChange(ctx, 'job-1', {
      // Phase 2.0 (2026-05-23): worker không gửi price; Kael compute từ context.
      new_description: 'Thêm phạm vi sửa chữa',
      reason: 'Phát hiện lỗi phụ',
      photo_urls: [],
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
  })

  it('maps scope-change decision races to STATUS_CHANGED instead of DB_ERROR', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'STATUS_CHANGED',
          job_id_out: null,
          scope_status: null,
          decided_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
  })

  it('expires a stale broadcast before allowing worker decline', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'broadcast-1',
          status: 'sent',
          expires_at: '2000-01-01T00:00:00.000Z',
          jobs: { status: 'broadcasting' },
        },
        error: null,
      },
      { data: { id: 'broadcast-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).declineBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'EXPIRED',
      status: 410,
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      { status: 'expired', responded_at: expect.any(String) },
    ])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'sent'])
  })

  it('does not let worker decline overwrite an accept race', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'broadcast-1',
          status: 'sent',
          expires_at: new Date(Date.now() + 30_000).toISOString(),
          jobs: { status: 'broadcasting' },
        },
        error: null,
      },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).declineBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_NOT_ACTIVE',
      status: 409,
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'sent'])
  })

  it('rejects direct worker decline when the parent job is no longer broadcasting', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'broadcast-1',
          status: 'sent',
          expires_at: new Date(Date.now() + 30_000).toISOString(),
          jobs: { status: 'worker_matched' },
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).declineBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_NOT_ACTIVE',
      status: 409,
    })

    expect(client.calls.some((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('blocks confirm-search retry while a broadcast is still active', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'broadcast-1', expires_at: '2999-01-01T00:00:00.000Z' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_ACTIVE',
      status: 409,
    })

    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('rejects confirm-search when a legacy job has no concrete HCMC district', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'priced',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls.some((call) => call.table === 'job_broadcasts')).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('rejects confirm-search if the frontend tries to skip ticket review', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'estimate_ready',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_price_max: 250000,
          final_price: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('rejects A7 matching start before broadcasting when Kael baseline max is missing', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_price_max: null,
          final_price: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'KAEL_PRICE_MISSING',
      status: 409,
    })

    expect(client.calls.some((call) => call.table === 'job_broadcasts')).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('returns broadcast_sent=false when retry finds no eligible worker', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: false,
      worker: null,
    })

    const workerCall = client.calls.find((call) => call.table === 'worker_profiles')
    expect(workerCall?.operations).toContainEqual(['or', 'districts.cs.{q7},districts.cs.{hcmc_all}'])
  })

  it('creates worker notification rows and Expo push after broadcast insert', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [{ id: 'worker-1', rating: 4.8, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'] }], error: null },
      { data: [], error: null },
      { data: [{ id: 'broadcast-1', worker_id: 'worker-1' }], error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'worker-1',
        p_job_id: 'job-1',
        p_event_type: 'broadcast_received',
        p_safe_metadata: expect.objectContaining({ broadcast_id: 'broadcast-1' }),
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(worker)/jobs?broadcast_id=broadcast-1'),
      }),
    )
  })

  it('blocks duplicate confirm-search retries when another retry already took the broadcast lease', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_ACTIVE',
      status: 409,
    })

    const leaseCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(leaseCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(leaseCall?.operations).toContainEqual(['eq', 'status', 'broadcasting'])
    expect(leaseCall?.operations).toContainEqual(['or', expect.stringContaining('broadcast_at.lte.')])
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('normalizes legacy job district before querying eligible Edge workers', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'electrical', address_district: 'Quận 1' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      broadcast_sent: false,
    })

    const workerCall = client.calls.find((call) => call.table === 'worker_profiles')
    expect(workerCall?.operations).toContainEqual(['or', 'districts.cs.{q1},districts.cs.{hcmc_all}'])
  })

  it('does not fake no-worker fallback when worker eligibility query fails', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: null, error: { code: 'PGRST500', message: 'worker query failed' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })

    expect(client.calls.some((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) => op[0] === 'insert' && JSON.stringify(op[1]).includes('no_worker_found'))
    )).toBe(false)
    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
  })

  it('does not fake a no-worker fallback when broadcast insert fails', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [{ id: 'worker-1' }], error: null },
      { data: [], error: null },
      { data: null, error: { code: 'PGRST500', message: 'insert failed' } },
      { data: { id: 'job-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })

    expect(client.calls.some((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) => op[0] === 'insert' && JSON.stringify(op[1]).includes('no_worker_found'))
    )).toBe(false)
    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    const rollbackCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const updateValue = op[1] as { status?: string } | null
        return op[0] === 'update' && updateValue?.status === 'awaiting_customer_confirm'
      })
    )
    expect(rollbackCall).toBeDefined()
    expect(rollbackCall!.operations).toContainEqual(['eq', 'id', 'job-1'])
    expect(rollbackCall!.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(rollbackCall!.operations).toContainEqual(['eq', 'status', 'broadcasting'])
  })

  it('rejects legacy admin worker-cancellation decisions after auto-approval is enabled', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'admin-1' },
      role: 'admin',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideWorkerCancellation(ctx, 'cancel-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'DEPRECATED',
      status: 410,
    })
    expect(client.calls).toEqual([])
  })

  it('does not fake zero earnings when the earnings query fails', async () => {
    const client = makeSequenceClient([
      { data: null, error: { code: 'PGRST500', message: 'db unavailable' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).getWorkerEarnings(ctx, {})).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('counts reviewed jobs with paid_at as paid earnings in the Edge runtime', async () => {
    const client = makeSequenceClient([
      {
        data: [
          {
            id: 'job-reviewed-paid',
            status: 'reviewed',
            final_price: 300000,
            paid_at: '2026-05-20T00:00:00.000Z',
            created_at: '2026-05-20T00:00:00.000Z',
          },
          {
            id: 'job-pending',
            status: 'payment_pending',
            final_price: 200000,
            paid_at: null,
            created_at: '2026-05-20T00:01:00.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).getWorkerEarnings(ctx, {})).resolves.toMatchObject({
      worker_id: 'worker-1',
      total_jobs_paid: 1,
      gross_earnings: 300000,
      pending_payment_count: 1,
      pending_payment_amount: 200000,
    })

    expect(client.calls[0].operations).toContainEqual([
      'select',
      'id, status, final_price, paid_at, created_at',
    ])
  })

  it('blocks workers from going online while an active job is assigned', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'WORKER_BUSY',
          is_available: null,
          updated_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateWorkerAvailability(ctx, {
      is_available: true,
    })).rejects.toMatchObject({
      code: 'WORKER_BUSY',
      status: 409,
    })

    const rpcCall = client.calls.find((call) => call.table === 'rpc:set_worker_availability_atomic')
    expect(rpcCall?.operations).toContainEqual([
      'rpc',
      'set_worker_availability_atomic',
      { p_worker_id: 'worker-1', p_is_available: true },
    ])
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
    expect(client.calls.some((call) => call.table === 'jobs')).toBe(false)
  })

  it('expires stale worker broadcasts during worker polling', async () => {
    const client = makeSequenceClient([
      { data: null, error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).listWorkerBroadcasts(ctx)

    expect(result.broadcasts).toEqual([])
    const expireCall = client.calls[0]
    expect(expireCall.table).toBe('job_broadcasts')
    expect(expireCall.operations).toContainEqual(['update', expect.objectContaining({ status: 'expired' })])
    expect(expireCall.operations).toContainEqual(['eq', 'worker_id', 'worker-1'])
    expect(expireCall.operations).toContainEqual(['eq', 'status', 'sent'])
    expect(expireCall.operations.some((op) => op[0] === 'lte' && op[1] === 'expires_at')).toBe(true)
  })

  it('does not show sent worker broadcasts when the parent job is no longer broadcasting', async () => {
    const expiresAt = new Date(Date.now() + 30_000).toISOString()
    const client = makeSequenceClient([
      { data: null, error: null },
      {
        data: [
          {
            id: 'broadcast-stale',
            job_id: 'job-cancelled',
            status: 'sent',
            sent_at: '2026-05-18T00:00:00.000Z',
            expires_at: expiresAt,
            jobs: {
              status: 'cancelled',
              service_type: 'plumbing',
              address_district: 'q7',
              kael_problem_identified: 'Leak',
              kael_price_min: 100000,
              kael_price_max: 200000,
            },
          },
          {
            id: 'broadcast-active',
            job_id: 'job-active',
            status: 'sent',
            sent_at: '2026-05-18T00:00:01.000Z',
            expires_at: expiresAt,
            jobs: {
              status: 'broadcasting',
              service_type: 'electrical',
              address_district: 'q1',
              kael_problem_identified: 'Outlet check',
              kael_price_min: 150000,
              kael_price_max: 250000,
            },
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).listWorkerBroadcasts(ctx)

    expect(result.broadcasts).toHaveLength(1)
    expect(result.broadcasts[0]).toMatchObject({
      broadcast_id: 'broadcast-active',
      job_id: 'job-active',
      service_type: 'electrical',
    })
    const listCall = client.calls[1]
    expect(listCall.operations).toContainEqual([
      'select',
      'id, job_id, status, sent_at, expires_at, jobs(status, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core)',
    ])
  })
})

type QueryResult =
  | { data: unknown; error: { code?: string; message?: string } | null; count?: number | null }
  | { reject: unknown }
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
    rpc(name: string, args?: Record<string, unknown>) {
      const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
      calls.push(call)
      return makeQuery(call, results)
    },
  }
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(columns?: string, options?: unknown) {
      call.operations.push(options === undefined ? ['select', columns] : ['select', columns, options])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    update(value: unknown) {
      call.operations.push(['update', value])
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
    neq(column: string, value: unknown) {
      call.operations.push(['neq', column, value])
      return query
    },
    gt(column: string, value: unknown) {
      call.operations.push(['gt', column, value])
      return query
    },
    gte(column: string, value: unknown) {
      call.operations.push(['gte', column, value])
      return query
    },
    lte(column: string, value: unknown) {
      call.operations.push(['lte', column, value])
      return query
    },
    in(column: string, value: unknown[]) {
      call.operations.push(['in', column, value])
      return query
    },
    contains(column: string, value: unknown[]) {
      call.operations.push(['contains', column, value])
      return query
    },
    or(filter: string) {
      call.operations.push(['or', filter])
      return query
    },
    order(column: string, options?: unknown) {
      call.operations.push(['order', column, options])
      return query
    },
    range(from: number, to: number) {
      call.operations.push(['range', from, to])
      return query
    },
    limit(count: number) {
      call.operations.push(['limit', count])
      return query
    },
    single() {
      call.operations.push(['single'])
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
      if (isKaelProgressUpdate(call)) {
        return Promise.resolve({ data: { id: 'kael-progress-ok' }, error: null }).then(onfulfilled, onrejected)
      }
      const next = results.shift() ?? { data: null, error: null }
      if ('reject' in next) {
        return Promise.reject(next.reject).then(onfulfilled, onrejected)
      }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}

function isKaelProgressUpdate(call: QueryCall) {
  return call.operations.some((op) => {
    const value = op[1] as { kael_progress?: unknown } | undefined
    return op[0] === 'update' && value?.kael_progress !== undefined
  })
}

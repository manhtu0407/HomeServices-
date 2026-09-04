import { describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { allowKaelSpendForTest } from '../../unit/kael-spend-test-helper'
import {
  projectWorkerBroadcastRows,
  projectWorkerOpportunityAssistContext,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/broadcasts'
import {
  deriveWorkerKaelConversationScope,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat-scope'
import {
  createWorkerKaelChat,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat'
import {
  sendWorkerKaelChatTurn,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat-turn'
import {
  runWorkerAssist,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/agents/worker-assist'
import type { AIRequest } from '../../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'

export const PILLAR = {
  id: 'P59-worker-kael-opportunity-intake-boundary',
  invariant:
    'jobless intake is derived server-side, receives only scrubbed active-opportunity context, and never runs accepted-job workflow guards or exposes price, address, contact, or storage data to the model',
  authority: [
    'governance/RULES.md AI Boundary Invariants',
    'governance/RULES.md #9 (do not expose exact addresses)',
    'governance/STRUCTURES.md Worker Kael workflow',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/kael-chat-turn.ts',
  layer: 'security-negative',
  siblings: ['P09-kael-pii-scrub', 'P36-worker-route-unit-protection', 'P58-worker-kael-opportunity-intake-contract'],
  mutation:
    'derive jobless intake as job_intake, pass the full broadcast DTO to the prompt, or key job guardrails from public mode instead of internal scope — the scope, absence, or provider-call assertion turns red',
} as const satisfies PillarManifest

const broadcast = {
  broadcast_id: 'broadcast-p59',
  job_id: 'job-p59',
  status: 'sent',
  service_type: 'cleaning',
  problem_summary: 'Vệ sinh căn hộ',
  scope_summary: 'Vệ sinh căn 1208, gọi 0900000059 hoặc customer-p59@example.test',
  district: 'Quận 7',
  estimated_price_min: 900_001,
  estimated_price_max: 900_002,
  estimated_earning_min: 765_001,
  estimated_earning_max: 765_002,
  media_count: 2,
  worker_brief_core: { customer_phone: '0900000059' },
  scheduled_at: '2026-08-31T02:00:00.000Z',
  sent_at: '2026-08-30T02:00:00.000Z',
  expires_at: '2026-08-30T03:00:00.000Z',
  seconds_remaining: 3600,
  original_scope_price_quote: {
    customer_name: 'CUSTOMER-SENTINEL-P59',
    storage_path: 'supabase://job-media/private-p59.jpg',
  },
}

const workerId = '33333333-3333-4333-8333-333333333333'
const sessionId = '44444444-4444-4444-8444-444444444444'

function validQuote(
  broadcastId: string,
  jobId: string,
  expiresAt: string,
  ownerId = workerId,
) {
  return {
    broadcast_id: broadcastId,
    commission_level: 2,
    commission_rate_bps: 1_000,
    customer_confirmation_required: true,
    customer_total: 200_000,
    expires_at: expiresAt,
    job_id: jobId,
    platform_fee: 20_000,
    price_source: 'baseline_with_market',
    quote_id: jobId.replace('1520', '1510'),
    reasoning_receipt: {
      fairness: {
        baseline_evidence: null,
        cap_statement: 'Verified sources only.',
        confidence: 'medium',
        high_trust_source_count: 2,
        market_source_count: 3,
        price_source: 'baseline_with_market',
        quorum_met: true,
      },
      receipt_id: `price_reasoning:${jobId}`,
      scenarios: { high: { total: 250_000 }, low: { total: 150_000 } },
      schema_version: 'price_reasoning_receipt.v1',
    },
    reference_price_max: 250_000,
    reference_price_min: 150_000,
    schema_version: 'original_scope_price_quote.v1',
    selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
    worker_confirmation_required: true,
    worker_confirmed_at: null,
    worker_id: ownerId,
    worker_net: 180_000,
  }
}

function rawBroadcast(
  suffix: string,
  expiresAt: string,
  sentAt: string,
  options: {
    jobStatus?: string
    quoteExpiresAt?: string
    quoteMode?: 'kael_auto_quote' | 'rfq' | 'inspection_only'
    status?: string
    withoutQuote?: boolean
    workerId?: string
  } = {},
) {
  const broadcastId = `a1540000-0000-4000-8000-0000000000${suffix}`
  const jobId = `a1520000-0000-4000-8000-0000000000${suffix}`
  return {
    expires_at: expiresAt,
    id: broadcastId,
    job_id: jobId,
    jobs: {
      address_district: 'quan_7',
      description: 'Vệ sinh căn hộ',
      kael_price_max: 250_000,
      kael_price_min: 150_000,
      kael_problem_identified: 'Vệ sinh căn hộ',
      kael_worker_brief_core: {},
      photo_urls: [],
      problem_chips: ['Vệ sinh căn hộ'],
      quote_mode: options.quoteMode ?? null,
      scheduled_at: '2099-08-31T02:00:00.000Z',
      service_type: 'cleaning',
      status: options.jobStatus ?? 'broadcasting',
    },
    original_scope_price_quote: options.withoutQuote
      ? null
      : validQuote(
          broadcastId,
          jobId,
          options.quoteExpiresAt ?? expiresAt,
          options.workerId,
        ),
    sent_at: sentAt,
    status: options.status ?? 'sent',
  }
}

function session() {
  return {
    archived_at: null,
    chat_mode: 'intake',
    closed_at: null,
    created_at: '2026-08-30T00:00:00.000Z',
    id: sessionId,
    job_id: null,
    kael_progress: null,
    pinned_at: null,
    safe_metadata: {},
    started_at: '2026-08-30T00:00:00.000Z',
    status: 'active',
    title: null,
    total_cost_usd: 0,
    total_turns: 0,
    updated_at: '2026-08-30T00:00:00.000Z',
    worker_id: workerId,
  }
}

function context(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    role: 'worker',
    success: true,
    supabase: client,
    user: { id: workerId },
  } as MobileApiContext
}

describe('P59 worker Kael opportunity-intake boundary', () => {
  installEdgeRuntimeTestHooks()

  it('derives the three internal scopes without trusting client metadata', () => {
    expect(deriveWorkerKaelConversationScope('normal', null)).toBe('normal')
    expect(deriveWorkerKaelConversationScope('normal', 'job-p59')).toBeNull()
    expect(deriveWorkerKaelConversationScope('intake', null)).toBe('opportunity_intake')
    expect(deriveWorkerKaelConversationScope('intake', 'job-p59')).toBe('job_intake')
  })

  it('projects only the bounded fields allowed in an opportunity prompt', () => {
    const projected = projectWorkerOpportunityAssistContext([broadcast])
    const serialized = JSON.stringify(projected)

    expect(projected).toHaveLength(1)
    expect(projected[0]).toMatchObject({
      broadcast_id: 'broadcast-p59',
      job_id: 'job-p59',
      service_type: 'cleaning',
      problem_summary: 'Vệ sinh căn hộ',
      district: 'Quận 7',
      scheduled_at: '2026-08-31T02:00:00.000Z',
      expires_at: '2026-08-30T03:00:00.000Z',
      media_count: 2,
    })
    expect(projected[0]?.scope_summary).toContain('[unit]')
    expect(projected[0]?.scope_summary).toContain('[phone]')
    expect(projected[0]?.scope_summary).toContain('[email]')
    for (const sentinel of ['900001', '765001', '0900000059', 'CUSTOMER-SENTINEL-P59', 'private-p59.jpg']) {
      expect(serialized.includes(sentinel), pillarWhy(PILLAR, `prompt context must omit ${sentinel}`)).toBe(false)
    }
  })

  it('filters stale or foreign records and keeps stable opportunity ordering', () => {
    const now = new Date('2099-08-30T05:00:00.000Z')
    const rows = [
      rawBroadcast('01', '2099-08-30T08:00:00.000Z', '2099-08-30T03:00:00.000Z'),
      rawBroadcast('02', '2099-08-30T06:00:00.000Z', '2099-08-30T02:00:00.000Z'),
      rawBroadcast('03', '2099-08-30T04:00:00.000Z', '2099-08-30T03:30:00.000Z'),
      rawBroadcast('04', '2099-08-30T07:00:00.000Z', '2099-08-30T04:00:00.000Z', { jobStatus: 'worker_matched' }),
      rawBroadcast('05', '2099-08-30T07:30:00.000Z', '2099-08-30T04:30:00.000Z', { quoteExpiresAt: '2099-08-30T04:59:00.000Z' }),
      rawBroadcast('06', '2099-08-30T07:45:00.000Z', '2099-08-30T04:45:00.000Z', { workerId: '33333333-3333-4333-8333-333333333334' }),
    ]

    const projected = projectWorkerBroadcastRows(rows, workerId, now)

    expect(projected.map((item) => item.broadcast_id)).toEqual([
      'a1540000-0000-4000-8000-000000000002',
      'a1540000-0000-4000-8000-000000000001',
    ])
  })

  it('keeps RFQ without a price quote while rejecting a priced offer without its receipt', () => {
    const now = new Date('2099-08-30T05:00:00.000Z')
    const projected = projectWorkerBroadcastRows([
      rawBroadcast('07', '2099-08-30T08:00:00.000Z', '2099-08-30T03:00:00.000Z', {
        quoteMode: 'rfq',
        withoutQuote: true,
      }),
      rawBroadcast('08', '2099-08-30T08:30:00.000Z', '2099-08-30T03:30:00.000Z', {
        quoteMode: 'kael_auto_quote',
        withoutQuote: true,
      }),
    ], workerId, now)

    expect(projected).toHaveLength(1)
    expect(projected[0]).toMatchObject({
      estimated_earning_max: null,
      estimated_earning_min: null,
      estimated_price_max: null,
      estimated_price_min: null,
      original_scope_price_quote: null,
      proposal_action: 'submit_rfq_proposal',
      quote_mode: 'rfq',
    })
  })

  it('uses opportunity guidance instead of accepted-job lifecycle guards', async () => {
    const requests: AIRequest[] = []
    const callAI = vi.fn(async (request: AIRequest) => {
      requests.push(request)
      return {
        success: true as const,
        content: JSON.stringify({
          public_reasoning_summary: ['Kael reviewed only the currently available opportunities.'],
          text: 'Open each opportunity to review its general area and schedule, then decide in the app.',
          safety_notes: [],
          redirect_scope_change: false,
        }),
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 8, outputTokens: 12 },
      }
    })

    const answer = await runWorkerAssist({
      callAI,
      conversationMode: 'intake',
      conversationScope: 'opportunity_intake',
      job: null,
      language: 'en',
      opportunities: projectWorkerOpportunityAssistContext([broadcast]),
      question: 'Can I do the extra scope immediately before the customer confirms?',
      secrets: {},
      spendGate: allowKaelSpendForTest('worker-p59'),
    })

    expect(callAI, pillarWhy(PILLAR, 'a phrase matching job workflow guards must remain advisory in opportunity scope')).toHaveBeenCalledTimes(1)
    expect(answer).toMatchObject({ fallback_used: false, redirect_scope_change: false })
    const prompt = requests.flatMap((request) => request.messages.map((message) => message.content)).join('\n')
    expect(prompt).toContain('opportunity_intake')
    expect(prompt).toContain('broadcast-p59')
    expect(prompt).toContain('[unit]')
    expect(prompt).toContain('[phone]')
    expect(prompt).toContain('[email]')
    expect(prompt).not.toMatch(/900001|765001|0900000059|customer-p59@example\.test|CUSTOMER-SENTINEL-P59|private-p59\.jpg/)
  })

  it('creates a jobless intake session without reading an accepted job', async () => {
    const client = makeSequenceClient([], {}, {
      kael_worker_chat_sessions: [
        { data: session(), error: null },
        { data: session(), error: null },
      ],
      kael_worker_chat_turns: [{ data: [], error: null }],
    })

    const result = await createWorkerKaelChat(context(client), {
      language: 'vi',
      mode: 'intake',
    }, {})

    expect(result.session).toMatchObject({ job_id: null, mode: 'intake', worker_id: workerId })
    expect(client.calls.some((call) => call.table === 'jobs')).toBe(false)
    expect(client.calls.find((call) => call.table === 'kael_worker_chat_sessions')?.operations)
      .toContainEqual(['insert', expect.objectContaining({ chat_mode: 'intake', job_id: null })])
  })

  it('returns the existing jobless intake session for an idempotent create retry', async () => {
    const client = makeSequenceClient([], {}, {
      kael_worker_chat_sessions: [
        { data: { id: sessionId }, error: null },
        { data: session(), error: null },
      ],
      kael_worker_chat_turns: [{ data: [], error: null }],
    })

    const result = await createWorkerKaelChat(context(client), {
      client_request_id: '45454545-4545-4545-8545-454545454545',
      language: 'vi',
      mode: 'intake',
    }, {})

    expect(result.session).toMatchObject({ id: sessionId, job_id: null, mode: 'intake' })
    expect(client.calls.flatMap((call) => call.operations).some(([operation]) => operation === 'insert')).toBe(false)
  })

  it('completes a verified empty opportunity turn with zero provider cost', async () => {
    const client = makeSequenceClient([], {
      claim_worker_kael_general_turn_atomic: [{
        data: [{
          ok: true,
          claimed: true,
          completed: false,
          request_id: '55555555-5555-4555-8555-555555555555',
          worker_turn_id: '66666666-6666-4666-8666-666666666666',
        }],
        error: null,
      }],
      complete_worker_kael_general_turn_atomic: [{
        data: [{ ok: true, applied: true, completed: true, stale: false }],
        error: null,
      }],
    }, {
      job_broadcasts: [{ data: [], error: null }],
      worker_profiles: [{
        data: { active_service_types: ['cleaning'], districts: ['quan_7'] },
        error: null,
      }],
      kael_worker_chat_sessions: [
        { data: session(), error: null },
        { data: { id: sessionId }, error: null },
        { data: { id: sessionId }, error: null },
        { data: { id: sessionId }, error: null },
        { data: { id: sessionId }, error: null },
        { data: session(), error: null },
      ],
      kael_worker_chat_turns: [{ data: [], error: null }],
    })

    const result = await sendWorkerKaelChatTurn(context(client), sessionId, {
      client_request_id: '77777777-7777-4777-8777-777777777777',
      language: 'vi',
      media_refs: [],
      message: 'Tìm việc vệ sinh đang có',
    }, {}, { skipRateLimit: true })

    expect(result.session).toMatchObject({ id: sessionId, mode: 'intake' })
    expect(client.calls.find((call) => call.table === 'job_broadcasts')?.operations)
      .toContainEqual(['eq', 'worker_id', workerId])
    const completeCall = client.calls.find((call) => call.table === 'rpc:complete_worker_kael_general_turn_atomic')
    expect(JSON.stringify(completeCall)).toContain('Hiện chưa có cơ hội nào còn hiệu lực')
    expect(completeCall?.operations[0]?.[2]).toEqual(expect.objectContaining({ p_cost_usd: 0 }))
    expect(client.calls.some((call) => call.table === 'rpc:reserve_kael_ai_spend')).toBe(false)
  })

  it('fails closed and releases the claim when opportunity context cannot be read', async () => {
    const client = makeSequenceClient([], {
      claim_worker_kael_general_turn_atomic: [{
        data: [{
          ok: true,
          claimed: true,
          completed: false,
          request_id: '88888888-8888-4888-8888-888888888888',
          worker_turn_id: '99999999-9999-4999-8999-999999999999',
        }],
        error: null,
      }],
      release_worker_kael_chat_turn_claim_atomic: [{ data: [{ released: true }], error: null }],
    }, {
      job_broadcasts: [{ data: null, error: { code: 'DB_DOWN' } }],
      worker_profiles: [{ data: null, error: null }],
      kael_worker_chat_sessions: [{ data: session(), error: null }],
    })

    await expect(sendWorkerKaelChatTurn(context(client), sessionId, {
      client_request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      language: 'vi',
      media_refs: [],
      message: 'Tìm cơ hội đang có',
    }, {}, { skipRateLimit: true })).rejects.toBeDefined()

    expect(client.calls.some((call) => call.table === 'rpc:release_worker_kael_chat_turn_claim_atomic')).toBe(true)
    expect(client.calls.some((call) => call.table === 'rpc:complete_worker_kael_general_turn_atomic')).toBe(false)
    expect(client.calls.some((call) => call.table === 'rpc:reserve_kael_ai_spend')).toBe(false)
  })
})

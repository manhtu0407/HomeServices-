import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import type { EdgeAiSecrets } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import { runWorkerAssist } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/worker-assist'
import type { KaelReasoningReporter } from '../../../../../supabase/functions/mobile-api/_shared/kael/reasoning-receipt'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { createWorkerKaelChat } from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat'
import {
  claimWorkerKaelChatTurn,
  completeWorkerKaelChatTurn,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat-claims'
import { allowKaelSpendForTest } from './kael-spend-test-helper'

const workerId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'

function createNormalSessionClient() {
  const operations: Array<{ operation: string; table: string; value?: unknown }> = []
  const session = {
    archived_at: null,
    chat_mode: 'normal',
    closed_at: null,
    created_at: '2026-07-23T00:00:00.000Z',
    id: sessionId,
    job_id: null,
    kael_progress: null,
    pinned_at: null,
    safe_metadata: {},
    started_at: '2026-07-23T00:00:00.000Z',
    status: 'active',
    title: null,
    total_cost_usd: 0,
    total_turns: 0,
    updated_at: '2026-07-23T00:00:00.000Z',
    worker_id: workerId,
  }
  const from = vi.fn((table: string) => {
    const result = table === 'kael_worker_chat_sessions'
      ? { data: session, error: null }
      : table === 'kael_worker_chat_turns'
        ? { data: [], error: null }
        : { data: null, error: { code: 'UNEXPECTED_TABLE' } }
    const chain = {
      delete: () => chain,
      eq: (column: string, value: unknown) => {
        operations.push({ operation: `eq:${column}`, table, value })
        return chain
      },
      in: () => chain,
      insert: (value: unknown) => {
        operations.push({ operation: 'insert', table, value })
        return chain
      },
      is: () => chain,
      limit: () => chain,
      maybeSingle: () => chain,
      neq: () => chain,
      or: () => chain,
      order: () => chain,
      range: () => chain,
      select: () => chain,
      single: () => chain,
      then: (
        onfulfilled?: (value: typeof result) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onfulfilled, onrejected),
      update: () => chain,
      upsert: () => chain,
      contains: () => chain,
      gt: () => chain,
      gte: () => chain,
      lte: () => chain,
    }
    return chain
  })
  return {
    client: {
      from,
      rpc: vi.fn(),
    },
    from,
    operations,
  }
}

describe('worker Kael normal chat service', () => {
  it('creates an owned normal session without reading a job', async () => {
    const { client, from, operations } = createNormalSessionClient()
    const ctx: MobileApiContext = {
      role: 'worker',
      success: true,
      supabase: client,
      user: { id: workerId },
    }

    const result = await createWorkerKaelChat(ctx, {
      language: 'vi',
      mode: 'normal',
    }, {} satisfies EdgeAiSecrets)

    expect(result.session).toMatchObject({
      id: sessionId,
      job_id: null,
      mode: 'normal',
      worker_id: workerId,
    })
    expect(from).not.toHaveBeenCalledWith('jobs')
    expect(operations).toContainEqual({
      operation: 'insert',
      table: 'kael_worker_chat_sessions',
      value: expect.objectContaining({
        chat_mode: 'normal',
        job_id: null,
        worker_id: workerId,
      }),
    })
  })

  it('keeps general sessions jobless while intake sessions remain job-scoped', () => {
    const migration = readFileSync(
      new URL('../../../../../supabase/migrations/20260723092515_enable_worker_kael_normal_chat.sql', import.meta.url),
      'utf8',
    )

    expect(migration).toContain('alter column job_id drop not null')
    expect(migration).toContain("chat_mode = 'normal' and job_id is null")
    expect(migration).toContain("chat_mode = 'intake' and job_id is not null")
    expect(migration).toContain('kael_worker_chat_sessions_normal_idempotency_idx')
    expect(migration).toContain('kael_worker_chat_sessions_intake_idempotency_idx')
    expect(migration).toContain('kael_worker_chat_turns')
    expect(migration).toContain('kael_worker_chat_turn_requests')
    expect(migration).toContain('create or replace function public.claim_worker_kael_general_turn_atomic')
    expect(migration).toContain('create or replace function public.complete_worker_kael_general_turn_atomic')
  })

  it('answers a general worker question without job context', async () => {
    const requests: AIRequest[] = []
    const answer = await runWorkerAssist({
      conversationMode: 'normal',
      job: null,
      language: 'vi',
      question: 'Tôi tạo cuộc trò chuyện mới trong ứng dụng như thế nào?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
      callAI: async (nextRequest) => {
        requests.push(nextRequest)
        return {
          success: true,
          content: JSON.stringify({
            public_reasoning_summary: [
              'The question asks how to begin a general Kael chat.',
            ],
            text: 'Mở danh sách trò chuyện, chọn Cuộc trò chuyện mới rồi nhập câu hỏi cho Kael.',
            safety_notes: [],
            redirect_scope_change: false,
          }),
          usage: { inputTokens: 60, outputTokens: 24, costUsd: 0.00004 },
          latencyMs: 40,
        }
      },
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      redirect_scope_change: false,
    })
    const sentPrompt = requests[0]?.messages.map((message) => message.content).join('\n') ?? ''
    expect(sentPrompt).toContain('general')
    expect(sentPrompt).not.toContain('job_id')
    expect(sentPrompt).toContain('Return JSON only with text and public_reasoning_summary.')
    expect(sentPrompt).toContain('Use exactly {"public_reasoning_summary":["..."],"text":"..."}')
  })

  it('keeps the receipt limited to backend-generated public feedback', async () => {
    const steps: Parameters<KaelReasoningReporter['step']>[0][] = []
    const requests: AIRequest[] = []
    const reasoning: KaelReasoningReporter = {
      complete: () => undefined,
      fail: () => undefined,
      start: () => undefined,
      step: (step) => steps.push(step),
    }

    const answer = await runWorkerAssist({
      callAI: async (request) => {
        requests.push(request)
        return {
          success: true as const,
          content: JSON.stringify({
            public_reasoning_summary: [
              'The worker asked how to begin a normal Kael conversation.',
              'Kael chose a short in-app navigation answer without job-specific data.',
            ],
            redirect_scope_change: false,
            safety_notes: [],
            text: 'Open a new conversation, then enter the question you need help with.',
          }),
          latencyMs: 12,
          usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
        }
      },
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'How do I start a new chat?',
      reasoning,
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer.public_reasoning_summary).toEqual([
      'The worker asked how to begin a normal Kael conversation.',
      'Kael chose a short in-app navigation answer without job-specific data.',
    ])
    expect(JSON.stringify(requests)).toContain('public_reasoning_summary')
    expect(steps).toEqual([
      expect.objectContaining({
        detail: 'The request was classified as a general worker-support question.',
        id: 'request-classified',
        stage: 'intent',
        status: 'completed',
      }),
      expect.objectContaining({
        detail: 'The request is eligible for advisory support within current boundaries.',
        id: 'scope-cleared',
        stage: 'context',
        status: 'completed',
      }),
      expect.objectContaining({
        detail: 'The worker asked how to begin a normal Kael conversation.',
        id: 'public-summary-0',
        stage: 'compose',
        status: 'completed',
      }),
      expect.objectContaining({
        detail: 'Kael chose a short in-app navigation answer without job-specific data.',
        id: 'public-summary-1',
        stage: 'compose',
        status: 'completed',
      }),
    ])
    expect(steps.map((step) => step.id)).not.toContain('compose')
    expect(steps.map((step) => step.id)).not.toContain('safety')
    expect(JSON.stringify(steps)).not.toMatch(/deepseek|anthropic|perplexity|model|provider/i)
  })

  it('keeps a valid worker reply when the public summary shape is malformed', async () => {
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: JSON.stringify({
          public_reasoning_summary: { unexpected: true },
          redirect_scope_change: false,
          safety_notes: [],
          text: 'Open a new conversation, then enter the question you need help with.',
        }),
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'How do I start a new chat?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      public_reasoning_summary: [],
    })
  })

  it('keeps a valid worker reply when a provider summary contains unsafe internals', async () => {
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: JSON.stringify({
          public_reasoning_summary: ['Anthropic used a provider API key before replying.'],
          redirect_scope_change: false,
          safety_notes: [],
          text: 'Open a new conversation, then enter the question you need help with.',
        }),
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'How do I start a new chat?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      public_reasoning_summary: [],
    })
    expect(JSON.stringify(answer.public_reasoning_summary)).not.toMatch(/anthropic|provider|api key/i)
  })

  it('drops English public reasoning before a Vietnamese normal-chat reply reaches the receipt', async () => {
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: JSON.stringify({
          public_reasoning_summary: ['The worker request is within the supported guidance boundary.'],
          redirect_scope_change: false,
          safety_notes: [],
          text: 'Hay xem lai pham vi da nhan va chuan bi dung cu an toan.',
        }),
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'vi',
      question: 'Toi can chuan bi gi truoc khi nhan viec?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      public_reasoning_summary: [],
    })
  })

  it('accepts a bounded final reply nested in a provider output envelope', async () => {
    const providerReply = `Use the in-app checklist before you start. ${'Keep the customer informed through Kael. '.repeat(32)}`
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: JSON.stringify({
          data: {
            final_answer: providerReply,
          },
          redirect_scope_change: false,
          safety_notes: [],
        }),
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'How should I start a new chat?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      redirect_scope_change: false,
    })
    expect(answer.text.startsWith('Use the in-app checklist before you start.')).toBe(true)
    expect(answer.text.length).toBeLessThanOrEqual(700)
  })

  it('recovers a guarded plain reply for normal chat when JSON formatting fails', async () => {
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: 'Before you start, confirm the service symptom, the safety risk, and any visible warning signs in the Kael chat.',
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'What should I prepare before asking about air-conditioning safety?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: true,
      text: 'Before you start, confirm the service symptom, the safety risk, and any visible warning signs in the Kael chat.',
    })
  })

  it('removes one outer quote pair from a normal provider reply', async () => {
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: JSON.stringify({ text: '"Confirm the evidence in the app before you start."' }),
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'What should I check first?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      text: 'Confirm the evidence in the app before you start.',
    })
  })

  it('normalizes a guarded reply from a singleton provider array envelope', async () => {
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: JSON.stringify([{
          data: {
            final_answer: 'Ask the customer about visible warning signs and whether the unit has any burning smell before you travel.',
          },
        }]),
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'What should I ask before responding to an air-conditioning safety question?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      text: 'Ask the customer about visible warning signs and whether the unit has any burning smell before you travel.',
    })
  })

  it('strips private reasoning before recovering an unstructured provider reply', async () => {
    const answer = await runWorkerAssist({
      callAI: async () => ({
        success: true as const,
        content: '<think>private hidden reasoning</think> Give the worker a reply.',
        latencyMs: 12,
        usage: { costUsd: 0.00001, inputTokens: 5, outputTokens: 8 },
      }),
      conversationMode: 'normal',
      job: null,
      language: 'en',
      question: 'What should I prepare before asking about air-conditioning safety?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
    })

    expect(answer).toMatchObject({
      fallback_used: true,
      text: 'Give the worker a reply.',
    })
    expect(answer.text).not.toContain('private hidden reasoning')
  })

  it('keeps extra scope work blocked until the customer confirms in the app', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a premature scope-work request')
    })

    const answer = await runWorkerAssist({
      conversationMode: 'intake',
      job: {
        id: 'job-1',
        service_type: 'electrical',
        status: 'arrived',
      },
      language: 'vi',
      question: 'Tôi có thể làm luôn phần phát sinh trước khi khách phản hồi không?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
      callAI,
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      redirect_scope_change: true,
      text: 'Không. Bạn có thể gửi đề xuất đổi phạm vi để Kael kiểm tra, nhưng không được làm phần phát sinh cho đến khi khách xác nhận đề xuất đó trong ứng dụng. Thêm ảnh nếu có.',
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('requires lobby-photo check-in before a worker enters or starts inspecting', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a pre-check-in bypass request')
    })

    const answer = await runWorkerAssist({
      conversationMode: 'intake',
      job: {
        id: 'job-1',
        service_type: 'electrical',
        status: 'arrived',
      },
      language: 'vi',
      question: 'Tôi đã đến nơi nhưng chưa có ảnh check-in. Tôi có thể báo đang kiểm tra, vào căn hộ và bắt đầu kiểm tra trước không?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
      callAI,
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      redirect_scope_change: false,
      text: 'Không. Khi chưa xác nhận có mặt, bạn không được báo đang kiểm tra, vào căn hộ hoặc bắt đầu kiểm tra. Hãy dùng bước xác nhận có mặt bằng ảnh tại sảnh trong ứng dụng. Sau khi xác nhận có mặt, chờ khách xác nhận trong ứng dụng cho phép lên căn hộ trước khi kiểm tra; tin nhắn ngoài ứng dụng không thay thế bước xác nhận này.',
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('rejects off-platform apartment access before lobby-photo check-in', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for an off-platform pre-check-in bypass request')
    })

    const answer = await runWorkerAssist({
      conversationMode: 'intake',
      job: {
        id: 'job-1',
        service_type: 'electrical',
        status: 'arrived',
      },
      language: 'vi',
      question: 'Em chưa checkin vì camera hư, khách nhắn Zalo cho lên rồi. Em bỏ qua ảnh sảnh và bấm bắt đầu kiểm tra được chưa?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
      callAI,
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      redirect_scope_change: false,
      text: 'Không. Khi chưa xác nhận có mặt, bạn không được báo đang kiểm tra, vào căn hộ hoặc bắt đầu kiểm tra. Hãy dùng bước xác nhận có mặt bằng ảnh tại sảnh trong ứng dụng. Sau khi xác nhận có mặt, chờ khách xác nhận trong ứng dụng cho phép lên căn hộ trước khi kiểm tra; tin nhắn ngoài ứng dụng không thay thế bước xác nhận này.',
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps English pre-check-in requests deterministic for the worker', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for an English pre-check-in bypass request')
    })

    const answer = await runWorkerAssist({
      conversationMode: 'intake',
      job: {
        id: 'job-1',
        service_type: 'electrical',
        status: 'arrived',
      },
      language: 'en',
      question: 'Can I skip the lobby photo check-in and enter the apartment to start inspecting?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
      callAI,
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      redirect_scope_change: false,
      text: 'No. Before check-in, do not report an inspection, enter the apartment, or begin inspecting. Use the Check in with a lobby photo step in the app. After check-in, wait for the customer to authorize unit access in the app before inspecting; an off-platform message does not replace that authorization.',
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('keeps completion and payment behind the real arrived workflow', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for a premature completion and payment request')
    })

    const answer = await runWorkerAssist({
      conversationMode: 'intake',
      job: {
        id: 'job-1',
        service_type: 'electrical',
        status: 'arrived',
      },
      language: 'vi',
      question: 'Tôi chưa check-in và chưa kiểm tra xong. Tôi có thể báo hoàn thành để khách thanh toán ngay không?',
      secrets: {},
      spendGate: allowKaelSpendForTest(workerId),
      callAI,
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      redirect_scope_change: false,
      text: 'Không. Bạn chưa thể báo hoàn thành hoặc mở thanh toán ở bước này. Trước hết hãy xác nhận có mặt bằng ảnh tại sảnh, chờ khách cho phép lên căn hộ, rồi kiểm tra và chỉ thực hiện công việc trong phạm vi đã xác nhận. Sau khi hoàn thành thực tế, bạn gửi kết quả và bằng chứng để khách xem, rồi khách xác nhận; chỉ khi đó thanh toán mới mở.',
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('uses jobless atomic claims for a normal conversation turn', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{
          assistant_turn_id: null,
          claimed: true,
          completed: false,
          error_code: null,
          ok: true,
          request_id: '33333333-3333-4333-8333-333333333333',
          worker_turn_id: '44444444-4444-4444-8444-444444444444',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          applied: true,
          assistant_turn_id: '55555555-5555-4555-8555-555555555555',
          completed: true,
          error_code: null,
          ok: true,
          stale: false,
        }],
        error: null,
      })
    const client = { from: vi.fn(), rpc }

    const claim = await claimWorkerKaelChatTurn(client as never, {
      claimId: '66666666-6666-4666-8666-666666666666',
      clientRequestId: '77777777-7777-4777-8777-777777777777',
      contentType: 'text',
      jobId: null,
      mediaRefs: [],
      message: 'Hướng dẫn tôi dùng ứng dụng',
      sessionId,
      workerId,
    })
    await completeWorkerKaelChatTurn(client as never, {
      answer: {
        fallback_used: false,
        redirect_scope_change: false,
        safety_notes: [],
        schema_version: 'worker_assist_answer.v1',
        text: 'Mở danh sách trò chuyện và chọn phiên cần dùng.',
      },
      claimId: '66666666-6666-4666-8666-666666666666',
      jobId: null,
      requestId: String(claim.request_id),
      sessionId,
      workerId,
      workerTurnId: String(claim.worker_turn_id),
    })

    expect(rpc.mock.calls[0][0]).toBe('claim_worker_kael_general_turn_atomic')
    expect(rpc.mock.calls[1][0]).toBe('complete_worker_kael_general_turn_atomic')
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_job_id')
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_job_id')
  })
})

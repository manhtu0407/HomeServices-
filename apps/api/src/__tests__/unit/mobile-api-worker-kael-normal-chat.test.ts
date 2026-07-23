import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import type { EdgeAiSecrets } from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import { runWorkerAssist } from '../../../../../supabase/functions/mobile-api/_shared/kael/worker-assist'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import { createWorkerKaelChat } from '../../../../../supabase/functions/mobile-api/_shared/services/worker-kael-chat.service'
import {
  claimWorkerKaelChatTurn,
  completeWorkerKaelChatTurn,
} from '../../../../../supabase/functions/mobile-api/_shared/services/worker-kael-chat-claims.service'
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

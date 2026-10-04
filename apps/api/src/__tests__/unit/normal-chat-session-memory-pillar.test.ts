import { describe, expect, it, vi } from 'vitest'
import type { AIRequest, EdgeAiSecrets } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import type { DbClient } from '../../../../../supabase/functions/mobile-api/_shared/platform/db'
import {
  loadNormalChatSessionContext,
  summarizeNormalChatSessionIfDue,
  type NormalChatSessionRole,
  type NormalChatSessionScope,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-memory/normal-chat-session'
import { makeSequenceClient } from '../kael-edge-runtime/harness'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P253-kael-normal-chat-session-memory',
  invariant:
    'Normal-chat memory is sourced from the exact Customer or Worker session transcript, validates source turns, and refreshes in bounded ten-exchange batches',
  authority: [
    'governance/Plan.md #57.2 (session-scoped transcript, memory, and source evidence)',
    'governance/RULES.md #0 (mobile -> mobile-api -> session-scoped server AI)',
    'governance/RULES.md #8 (source-backed data; no fabricated memory)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-memory/normal-chat-session.ts',
  layer: 'unit',
  siblings: ['P252-kael-chat-http-roundtrip'],
  mutation:
    'Mix actor/session keys, trust a deleted or mismatched source turn, summarize before ten exchanges, or skip the bounded summary write; one of these cases fails',
} as const satisfies PillarManifest

const CUSTOMER_ID = 'c253abcd-0000-4000-8000-000000000001'
const CUSTOMER_SESSION_ID = 'c253abcd-0000-4000-8000-0000000000c1'
const WORKER_ID = 'c253abcd-0000-4000-8000-000000000002'
const WORKER_SESSION_ID = 'c253abcd-0000-4000-8000-0000000000d1'

function scope(actorRole: NormalChatSessionRole): NormalChatSessionScope {
  return actorRole === 'customer'
    ? { actorRole, actorId: CUSTOMER_ID, sessionId: CUSTOMER_SESSION_ID }
    : { actorRole, actorId: WORKER_ID, sessionId: WORKER_SESSION_ID }
}

function storedTurn(actorRole: NormalChatSessionRole, turnIndex: number) {
  const role = turnIndex % 2 === 1 ? actorRole : 'kael'
  const id = `turn-${turnIndex}`
  return {
    id,
    turn_index: turnIndex,
    role,
    text_content: `${role} turn ${turnIndex}`,
    safe_metadata: turnIndex === 2
      ? {
        normal_chat_image_analysis: {
          schema_version: 'normal_chat_image_analysis.v1',
          source_turn_id: 'turn-1',
          source_turn_index: 1,
          observation: 'A loose drain line is visible.',
        },
      }
      : {},
  }
}

function storedMemory(actorRole: NormalChatSessionRole, sessionId: string) {
  return {
    summary: 'The user is troubleshooting an air conditioner in this session and shared phone 0909123456.',
    facts: [{
      statement: 'The user prefers a short checklist and lives on floor 12, unit A.25.07.',
      source_turn_indices: [1],
      source_turn_ids: ['turn-1'],
    }],
    source_through_turn_index: 2,
    revision: 4,
    actor_role: actorRole,
    actor_id: actorRole === 'customer' ? CUSTOMER_ID : WORKER_ID,
    session_id: sessionId,
  }
}

function sessionRow(actorRole: NormalChatSessionRole, sessionId: string, totalTurns: number) {
  return actorRole === 'customer'
    ? { id: sessionId, customer_id: CUSTOMER_ID, chat_mode: 'normal', archived_at: null, total_turns: totalTurns }
    : { id: sessionId, worker_id: WORKER_ID, chat_mode: 'normal', job_id: null, archived_at: null, total_turns: totalTurns }
}

function turnsThrough(actorRole: NormalChatSessionRole, count: number) {
  return Array.from({ length: count }, (_, index) => storedTurn(actorRole, index + 1))
}

function turnTable(actorRole: NormalChatSessionRole) {
  return actorRole === 'customer'
    ? 'kael_customer_conversation_turns'
    : 'kael_worker_chat_turns'
}

describe('P253 normal-chat session memory', () => {
  it.each(['customer', 'worker'] as const)(
    'loads only source-validated transcript and image evidence for the %s session',
    async (actorRole) => {
      const currentScope = scope(actorRole)
      const turns = turnTable(actorRole)
      const client = makeSequenceClient([], {}, {
        kael_normal_chat_session_memory: [{ data: storedMemory(actorRole, currentScope.sessionId), error: null }],
        [turns]: [
          { data: null, error: null, count: 2 },
          { data: [{ id: 'turn-1', turn_index: 1, role: actorRole }], error: null },
          { data: [storedTurn(actorRole, 2), storedTurn(actorRole, 1)], error: null },
        ],
      })

      const context = await loadNormalChatSessionContext(client as unknown as DbClient, currentScope)
      const memoryRead = client.calls.find((call) => call.table === 'kael_normal_chat_session_memory')

      expect(memoryRead?.operations).toEqual(expect.arrayContaining([
        ['eq', 'actor_role', actorRole],
        ['eq', 'actor_id', currentScope.actorId],
        ['eq', 'session_id', currentScope.sessionId],
      ]))
      expect(context.memorySummary, pillarWhy(PILLAR, 'the stored summary must remain scoped to its actor and session'))
        .toContain('The user is troubleshooting an air conditioner in this session')
      expect(context.memorySummary).toContain('[phone]')
      expect(context.memorySummary).not.toContain('0909123456')
      expect(context.memorySummary, pillarWhy(PILLAR, 'source-linked facts must survive retrieval'))
        .toContain('The user prefers a short checklist')
      expect(context.memorySummary).toContain('[floor]')
      expect(context.memorySummary).toContain('[unit]')
      expect(context.memorySummary).not.toContain('A.25.07')
      expect(context.memorySummary, pillarWhy(PILLAR, 'validated image findings belong to the same transcript context'))
        .toContain('A loose drain line is visible.')
      expect(context.previousTurns.map((turn) => [turn.id, turn.turnIndex, turn.role])).toEqual([
        ['turn-1', 1, actorRole],
        ['turn-2', 2, 'kael'],
      ])
    },
  )

  it('suppresses a stale memory summary when transcript source coverage has a deletion gap', async () => {
    const client = makeSequenceClient([], {}, {
      kael_normal_chat_session_memory: [{
        data: {
          summary: 'The user prefers the earlier setting.',
          facts: [],
          source_through_turn_index: 2,
          revision: 1,
        },
        error: null,
      }],
      kael_customer_conversation_turns: [
        { data: null, error: null, count: 1 },
        { data: [storedTurn('customer', 1)], error: null },
      ],
    })

    const context = await loadNormalChatSessionContext(client as unknown as DbClient, scope('customer'))

    expect(context.memorySummary, pillarWhy(PILLAR, 'a deleted source range must suppress the stale summary')).toBeNull()
    expect(context.previousTurns).toMatchObject([{ id: 'turn-1', turnIndex: 1, role: 'customer' }])
  })

  it('waits for ten complete exchanges, then stores only facts linked to actor turns', async () => {
    const invoke = vi.fn(async (_request: AIRequest) => ({
      success: true as const,
      content: JSON.stringify({
        summary: 'The user prefers a short checklist for air conditioner maintenance.',
        facts: [{ statement: 'The user prefers a short checklist.', source_turn_indices: [1, 3] }],
      }),
      usage: { inputTokens: 100, outputTokens: 40, costUsd: 0.0001 },
      latencyMs: 12,
    }))
    const tenExchangeTurns = turnsThrough('customer', 20)
    const earlyClient = makeSequenceClient([], {}, {
      kael_customer_conversations: [{ data: sessionRow('customer', CUSTOMER_SESSION_ID, 19), error: null }],
      kael_customer_conversation_turns: [{ data: tenExchangeTurns.slice(0, 19), error: null }],
    })

    await summarizeNormalChatSessionIfDue(
      earlyClient as unknown as DbClient,
      scope('customer'),
      {} as EdgeAiSecrets,
      'vi',
      invoke,
    )
    expect(invoke, pillarWhy(PILLAR, 'nineteen source turns are fewer than ten complete exchanges')).not.toHaveBeenCalled()

    const readyClient = makeSequenceClient([], {
      upsert_kael_normal_chat_session_memory: [{ data: true, error: null }],
    }, {
      kael_customer_conversations: [{ data: sessionRow('customer', CUSTOMER_SESSION_ID, 20), error: null }],
      kael_customer_conversation_turns: [{ data: tenExchangeTurns, error: null }],
    })

    await summarizeNormalChatSessionIfDue(
      readyClient as unknown as DbClient,
      scope('customer'),
      {} as EdgeAiSecrets,
      'vi',
      invoke,
    )

    const request = invoke.mock.calls[0]?.[0]
    const save = readyClient.calls.find((call) => call.table === 'rpc:upsert_kael_normal_chat_session_memory')
    expect(request, pillarWhy(PILLAR, 'session summaries stay on the DeepSeek memory purpose'))
      .toMatchObject({ purpose: 'normal_chat_memory', provider: 'deepseek', model: 'deepseek-v4-flash' })
    expect(save?.operations[0]?.[2]).toMatchObject({
      p_actor_role: 'customer',
      p_actor_id: CUSTOMER_ID,
      p_session_id: CUSTOMER_SESSION_ID,
      p_expected_revision: 0,
      p_source_through_turn_index: 20,
      p_facts: [{
        statement: 'The user prefers a short checklist.',
        source_turn_indices: [1, 3],
        source_turn_ids: ['turn-1', 'turn-3'],
      }],
    })
  })

  it('waits for another ten exchanges before refreshing an existing summary', async () => {
    const invoke = vi.fn(async (_request: AIRequest) => {
      throw new Error('memory refresh should not run yet')
    })
    const client = makeSequenceClient([], {}, {
      kael_customer_conversations: [{ data: sessionRow('customer', CUSTOMER_SESSION_ID, 38), error: null }],
      kael_normal_chat_session_memory: [{
        data: {
          summary: 'Existing summary.',
          facts: [],
          source_through_turn_index: 20,
          revision: 3,
        },
        error: null,
      }],
      kael_customer_conversation_turns: [
        { data: null, error: null, count: 20 },
        { data: turnsThrough('customer', 18).map((turn) => ({ ...turn, turn_index: turn.turn_index + 20, id: `turn-${turn.turn_index + 20}` })), error: null },
      ],
    })

    await summarizeNormalChatSessionIfDue(
      client as unknown as DbClient,
      scope('customer'),
      {} as EdgeAiSecrets,
      'vi',
      invoke,
    )

    expect(invoke, pillarWhy(PILLAR, 'an existing summary waits for the next ten-exchange batch')).not.toHaveBeenCalled()
    expect(client.calls.some((call) => call.table === 'rpc:upsert_kael_normal_chat_session_memory')).toBe(false)
  })

  it.each(['customer', 'worker'] as const)(
    'scrubs transcript PII before sending the %s memory request to DeepSeek',
    async (actorRole) => {
      const currentScope = scope(actorRole)
      const sessionTable = actorRole === 'customer' ? 'kael_customer_conversations' : 'kael_worker_chat_sessions'
      const turns = turnsThrough(actorRole, 20)
      turns[0]!.text_content = 'Gọi tôi số 0909123456, nhà ở tầng 12 căn A.25.07.'
      const invoke = vi.fn(async (_request: AIRequest) => ({
        success: true as const,
        content: JSON.stringify({ summary: 'The user is asking about a repair.', facts: [] }),
        usage: { inputTokens: 100, outputTokens: 40, costUsd: 0.0001 },
        latencyMs: 12,
      }))
      const client = makeSequenceClient([], {
        upsert_kael_normal_chat_session_memory: [{ data: true, error: null }],
      }, {
        [sessionTable]: [{ data: sessionRow(actorRole, currentScope.sessionId, 20), error: null }],
        [turnTable(actorRole)]: [{ data: turns, error: null }],
      })

      await summarizeNormalChatSessionIfDue(
        client as unknown as DbClient,
        currentScope,
        {} as EdgeAiSecrets,
        'vi',
        invoke,
      )

      const request = invoke.mock.calls[0]?.[0]
      const serialized = JSON.stringify(request?.messages)
      expect(request).toMatchObject({ purpose: 'normal_chat_memory', provider: 'deepseek' })
      expect(serialized).toContain('[phone]')
      expect(serialized).toContain('[floor]')
      expect(serialized).toContain('[unit]')
      expect(serialized).not.toContain('0909123456')
      expect(serialized).not.toContain('A.25.07')
    },
  )
})

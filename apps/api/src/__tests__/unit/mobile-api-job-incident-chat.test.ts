import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logApiCalls: vi.fn(async () => undefined),
  requestScopeChange: vi.fn(),
  runJobIncidentAssistant: vi.fn(),
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/kael/index.ts', () => ({
  runJobIncidentAssistant: mocks.runJobIncidentAssistant,
  scrubSensitiveForLLM: (value: string) => value,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/kael/learning/audit.ts', () => ({
  logApiCalls: mocks.logApiCalls,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/platform/coercions.ts', () => ({
  asNumber: (value: unknown) => Number(value ?? 0),
  asRecord: (value: unknown) => typeof value === 'object' && value !== null ? value : {},
  asString: (value: unknown) => typeof value === 'string' ? value : '',
  nullableString: (value: unknown) => typeof value === 'string' ? value : null,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/request.ts', () => ({
  requestScopeChange: mocks.requestScopeChange,
  validateScopeChangeEvidenceRefs: vi.fn(),
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/platform/api-failure.ts', () => ({
  apiFailure: (code: string, message: string) => {
    throw new Error(`${code}: ${message}`)
  },
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/platform/access.ts', () => ({
  requireJobAccess: vi.fn(),
}))

import {
  proposeScopeChangeFromJobIncident,
  recordJobIncidentChatMessage,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/job/incident'

const incident = {
  id: 'incident-1',
  job_id: 'job-1',
  status: 'scope_proposed',
  reported_description: 'Thay đoạn dây bị cháy.',
  reported_reason: 'Dây cũ không còn an toàn.',
  evidence_photo_urls: [],
  evidence_status: 'ready',
  last_summary: null,
  last_question: null,
  last_next_actor: null,
  created_at: '2026-07-12T00:00:00.000Z',
  updated_at: '2026-07-12T00:00:00.000Z',
  revision: 4,
}

function clientForScopeProposedChat(options?: {
  duplicate?: boolean
  stale?: boolean
}) {
  const rpcCalls: Array<{ args: Record<string, unknown>; name: string }> = []
  return {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ args, name })
      if (name === 'claim_job_incident_chat_turn_atomic') {
        return Promise.resolve({
          data: [{
            claimed: !options?.duplicate,
            idempotent: Boolean(options?.duplicate),
            incident,
            ok: true,
            revision: incident.revision,
            source_event_id: 'event-message-1',
          }],
          error: null,
        })
      }
      if (name === 'apply_job_incident_assistant_turn_atomic') {
        return Promise.resolve({
          data: [{
            applied: !options?.stale,
            incident,
            ok: true,
            stale: Boolean(options?.stale),
          }],
          error: null,
        })
      }
      if (name === 'release_job_incident_assistant_claim_atomic') {
        return Promise.resolve({ data: [{ released: true }], error: null })
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
    from(table: string) {
      const chain = {
        eq: () => chain,
        in: () => chain,
        limit: () => chain,
        order: () => chain,
        select: () => chain,
        then<TResult1 = unknown>(onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null) {
          const result = table === 'kael_job_incident_events'
            ? { data: [], error: null }
            : { data: null, error: null }
          return Promise.resolve(result).then(onfulfilled ?? undefined)
        },
      }
      return chain
    },
    rpcCalls,
  }
}

describe('Kael job incident chat after proposal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('surfaces a stale job phase before running scope proposal work', async () => {
    const client = {
      rpc(name: string) {
        if (name === 'claim_job_incident_scope_proposal_atomic') {
          return Promise.resolve({
            data: [{
              claimed: false,
              error_code: 'STATUS_CHANGED',
              idempotent: false,
              incident: null,
              ok: false,
            }],
            error: null,
          })
        }
        throw new Error(`Unexpected RPC ${name}`)
      },
    }

    await expect(proposeScopeChangeFromJobIncident(
      {
        role: 'worker',
        supabase: client,
        user: { id: 'worker-1' },
      } as never,
      'job-1',
      { client_request_id: 'a7500000-0000-4000-8000-000000000009' },
      {},
    )).rejects.toThrow('STATUS_CHANGED:')
    expect(mocks.requestScopeChange).not.toHaveBeenCalled()
  })

  it('returns the durable proposal when the successful response is retried', async () => {
    const rpcCalls: string[] = []
    const scopeChangeId = 'scope-change-1'
    const finalizedIncident = {
      ...incident,
      scope_change_id: scopeChangeId,
    }
    const client = {
      rpc(name: string) {
        rpcCalls.push(name)
        if (name === 'claim_job_incident_scope_proposal_atomic') {
          return Promise.resolve({
            data: [{
              claimed: false,
              idempotent: true,
              incident: finalizedIncident,
              ok: true,
            }],
            error: null,
          })
        }
        throw new Error(`Unexpected RPC ${name}`)
      },
      from(table: string) {
        const chain = {
          eq: () => chain,
          maybeSingle: () => chain,
          select: () => chain,
          then<TResult1 = unknown>(onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null) {
            const result = table === 'scope_change_requests'
              ? {
                data: {
                  created_at: '2026-07-12T00:00:00.000Z',
                  id: scopeChangeId,
                  job_id: 'job-1',
                  status: 'waiting_customer_decision',
                },
                error: null,
              }
              : { data: null, error: null }
            return Promise.resolve(result).then(onfulfilled ?? undefined)
          },
        }
        return chain
      },
    }

    const clientRequestId = 'a7500000-0000-4000-8000-000000000001'
    await expect(proposeScopeChangeFromJobIncident(
      {
        role: 'worker',
        supabase: client,
        user: { id: 'worker-1' },
      } as never,
      'job-1',
      { client_request_id: clientRequestId },
      {},
    )).resolves.toMatchObject({
      incident: { id: 'incident-1', status: 'scope_proposed' },
      scope_change: {
        job_id: 'job-1',
        scope_change_id: scopeChangeId,
        status: 'waiting_customer_decision',
      },
    })
    expect(mocks.requestScopeChange).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual(['claim_job_incident_scope_proposal_atomic'])
  })

  it('uses the durable client request id as the proposal claim id', async () => {
    const clientRequestId = 'a7500000-0000-4000-8000-000000000002'
    const rpcArgs: Record<string, unknown>[] = []
    const client = {
      rpc(name: string, args: Record<string, unknown>) {
        if (name !== 'claim_job_incident_scope_proposal_atomic') {
          throw new Error(`Unexpected RPC ${name}`)
        }
        rpcArgs.push(args)
        return Promise.resolve({
          data: [{
            claimed: false,
            error_code: 'INCIDENT_NOT_READY',
            idempotent: false,
            incident: null,
            ok: false,
          }],
          error: null,
        })
      },
    }

    await expect(proposeScopeChangeFromJobIncident(
      {
        role: 'worker',
        supabase: client,
        user: { id: 'worker-1' },
      } as never,
      'job-1',
      { client_request_id: clientRequestId },
      {},
    )).rejects.toThrow('INCIDENT_NOT_READY:')

    expect(rpcArgs).toContainEqual(expect.objectContaining({ p_claim_id: clientRequestId }))
  })

  it('keeps the customer approval hard-stop while Kael clarifies a real job message', async () => {
    mocks.runJobIncidentAssistant.mockResolvedValue({
      summary: 'Kael ghi nhận câu hỏi của thợ.',
      next_actor: 'customer',
      question: 'Bạn có thể xác nhận phần việc phát sinh không?',
      evidence_status: 'needs_more',
      evidence_gaps: [],
      fallback_used: false,
      provider: null,
      model: null,
    })
    const client = clientForScopeProposedChat()

    await recordJobIncidentChatMessage(
      client as never,
      { id: 'job-1', description: 'Sửa điện', service_type: 'electrical' },
      { id: 'message-1', sender_role: 'worker', content: 'Khách cần làm rõ vị trí dây cháy.' },
      { user: { id: 'worker-1' } } as never,
      {},
    )

    expect(mocks.runJobIncidentAssistant).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ actor: 'worker' }),
    }))
    expect(client.rpcCalls).toContainEqual(expect.objectContaining({
      args: expect.objectContaining({
        p_expected_revision: 4,
        p_message_content: expect.stringContaining('Kael Công việc:'),
        p_status: 'scope_proposed',
      }),
      name: 'apply_job_incident_assistant_turn_atomic',
    }))
  })

  it('does not rerun Kael for a duplicate durable chat message source', async () => {
    const client = clientForScopeProposedChat({ duplicate: true })

    await recordJobIncidentChatMessage(
      client as never,
      { id: 'job-1', description: 'Sửa điện', service_type: 'electrical' },
      { id: 'message-1', sender_role: 'worker', content: 'Khách cần làm rõ vị trí dây cháy.' },
      { user: { id: 'worker-1' } } as never,
      {},
    )

    expect(mocks.runJobIncidentAssistant).not.toHaveBeenCalled()
    expect(client.rpcCalls.map((call) => call.name)).toEqual(['claim_job_incident_chat_turn_atomic'])
  })

  it('does not perform a second write when the assistant result is stale', async () => {
    mocks.runJobIncidentAssistant.mockResolvedValue({
      summary: 'Phản hồi cũ.',
      next_actor: 'customer',
      question: 'Câu hỏi cũ?',
      evidence_status: 'needs_more',
      evidence_gaps: [],
      fallback_used: false,
      provider: null,
      model: null,
    })
    const client = clientForScopeProposedChat({ stale: true })

    await recordJobIncidentChatMessage(
      client as never,
      { id: 'job-1', description: 'Sửa điện', service_type: 'electrical' },
      { id: 'message-1', sender_role: 'worker', content: 'Tin nhắn mới hơn đã đến.' },
      { user: { id: 'worker-1' } } as never,
      {},
    )

    expect(client.rpcCalls.filter((call) => call.name === 'apply_job_incident_assistant_turn_atomic')).toHaveLength(1)
  })

  it('releases the durable assistant claim when provider work fails', async () => {
    mocks.runJobIncidentAssistant.mockRejectedValue(new Error('provider unavailable'))
    const client = clientForScopeProposedChat()

    await expect(recordJobIncidentChatMessage(
      client as never,
      { id: 'job-1', description: 'Sửa điện', service_type: 'electrical' },
      { id: 'message-1', sender_role: 'worker', content: 'Cần thử lại lượt Kael này.' },
      { user: { id: 'worker-1' } } as never,
      {},
    )).rejects.toThrow('provider unavailable')

    expect(client.rpcCalls.map((call) => call.name)).toEqual([
      'claim_job_incident_chat_turn_atomic',
      'release_job_incident_assistant_claim_atomic',
    ])
  })
})

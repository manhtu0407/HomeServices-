import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P257-chat-guard-evidence-retained',
  invariant:
    'when the job-chat contact guard redacts a message, the original text and the matched rules are written to chat_guard_redaction_evidence through the service client while the chat row keeps only the redacted placeholder; a clean message writes no evidence, and a failed evidence write never blocks the chat',
  authority: [
    'governance/RULES.md #8',
    'Plan moonlit-singing-phoenix Phase 0.3 (an off-app case needs evidence an admin can review)',
    'supabase/migrations/20260928102000_chat_guard_evidence_retention.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/job/chat-support.ts',
  layer: 'integration',
  siblings: ['P200-user-routes-service-owned-writes'],
  mutation:
    'delete the retainRedactionEvidence call from maybeHandleJobChatContactGuard — the redacted-message case turns red because no evidence insert is recorded; or pass guard.redactedContent as original_body — the original-text case turns red',
} as const satisfies PillarManifest

const WORKER = 'worker-evidence'
const CUSTOMER = 'customer-evidence'
const ORIGINAL = 'Goi em 0901234567 qua Zalo, khoi qua app cung duoc.'

function jobRow() {
  return {
    data: { id: 'job-1', status: 'worker_on_way', customer_id: CUSTOMER, worker_id: WORKER },
    error: null,
  }
}

function messageRow(senderRole: string, content: string, id = 'message-1') {
  return {
    data: {
      id,
      job_id: 'job-1',
      sender_id: senderRole === 'kael' ? null : WORKER,
      sender_role: senderRole,
      content,
      is_read: false,
      created_at: '2026-09-25T00:00:00.000Z',
    },
    error: null,
  }
}

function contactGuardSequence() {
  return [
    jobRow(),
    messageRow('worker', 'Kael redacted contact content.'),
    messageRow('kael', 'Kael keeps contact in app.', 'message-kael-1'),
    { data: [{ applied: true, disintermediation_risk_count: 1 }], error: null },
    { data: [{ notification_id: 'notification-1', created_at_ts: '2026-09-25T00:00:00.000Z' }], error: null },
    { data: [], error: null },
  ]
}

function workerCtx(client: unknown, privileged?: unknown): MobileApiContext {
  return {
    success: true,
    user: { id: WORKER },
    role: 'worker',
    supabase: client,
    ...(privileged ? { privilegedSupabase: privileged } : {}),
  } as MobileApiContext
}

function evidenceInserts(client: ReturnType<typeof makeSequenceClient>) {
  return client.calls
    .filter((call) => call.table === 'chat_guard_redaction_evidence')
    .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
    .map((op) => op[1] as Record<string, unknown>)
}

describe(`${PILLAR.id}: redacted chat keeps its original as evidence`, () => {
  installEdgeRuntimeTestHooks()

  it('writes the original text and matched rules for a redacted message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }))))
    const client = makeSequenceClient(contactGuardSequence())

    await createEdgeServices({}).sendJobMessage(workerCtx(client), 'job-1', { content: ORIGINAL })

    const inserts = evidenceInserts(client)
    expect(inserts, pillarWhy(PILLAR, 'exactly one evidence row per redacted message')).toHaveLength(1)
    expect(inserts[0], pillarWhy(PILLAR, 'the evidence row carries the original text')).toMatchObject({
      job_id: 'job-1',
      message_id: 'message-1',
      sender_id: WORKER,
      sender_role: 'worker',
      original_body: ORIGINAL,
      matched_rules: expect.arrayContaining(['phone', 'zalo', 'off_app']),
    })

    const chatInsert = client.calls
      .filter((call) => call.table === 'chat_messages')
      .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
      .map((op) => op[1] as Record<string, unknown>)
      .find((row) => row.sender_role === 'worker')
    expect(JSON.stringify(chatInsert), pillarWhy(PILLAR, 'the chat row stays redacted')).not.toContain('0901234567')
  })

  it('writes evidence through the service client, not the caller token client', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }))))
    const client = makeSequenceClient(contactGuardSequence())
    const service = makeSequenceClient([])

    await createEdgeServices({}).sendJobMessage(workerCtx(client, service), 'job-1', { content: ORIGINAL })

    expect(evidenceInserts(service), pillarWhy(PILLAR, 'evidence lands on the service client')).toHaveLength(1)
    expect(evidenceInserts(client), pillarWhy(PILLAR, 'no evidence on the caller client')).toHaveLength(0)
  })

  it('writes no evidence for a clean message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }))))
    const client = makeSequenceClient([
      jobRow(),
      messageRow('worker', 'Tôi đang lên thang máy.'),
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-09-25T00:00:00.000Z' }], error: null },
      { data: [], error: null },
    ])

    await createEdgeServices({}).sendJobMessage(workerCtx(client), 'job-1', { content: 'Tôi đang lên thang máy.' })

    expect(evidenceInserts(client), pillarWhy(PILLAR, 'clean text is never retained')).toHaveLength(0)
  })

  it('still delivers the chat when the evidence write fails, and logs it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }))))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = makeSequenceClient(contactGuardSequence(), {}, {
      chat_guard_redaction_evidence: [{ data: null, error: { code: '42501', message: 'denied' } }],
    })

    await expect(
      createEdgeServices({}).sendJobMessage(workerCtx(client), 'job-1', { content: ORIGINAL }),
      pillarWhy(PILLAR, 'a failed evidence write must not fail the send'),
    ).resolves.toMatchObject({ message: { id: 'message-1' } })
    expect(warn, pillarWhy(PILLAR, 'the lost evidence is logged')).toHaveBeenCalledWith(
      'mobile-api chat redaction evidence write failed',
      expect.objectContaining({ jobId: 'job-1', messageId: 'message-1', errorCode: '42501' }),
    )
  })
})

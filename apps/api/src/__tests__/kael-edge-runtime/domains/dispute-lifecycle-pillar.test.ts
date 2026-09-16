import { describe, expect, it } from 'vitest'

import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P189-dispute-lifecycle',
  invariant: 'Customer and Worker dispute statements, counter-statements, and Admin decisions cross the Edge boundary only through their actor-bound atomic operations',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7'],
  target: 'supabase/functions/mobile-api/_shared/domains/dispute/dispute.ts',
  layer: 'integration',
  siblings: ['P19-job-access-ownership', 'P49-admin-operations-support'],
  mutation: 'replace an actor-bound dispute RPC with an unbound or direct write, allowing a statement or decision to be accepted without the authenticated actor and atomic receipt',
} as const satisfies PillarManifest

const JOB = 'e1890000-0000-4000-8000-000000000001'
const CUSTOMER = 'e1890000-0000-4000-8000-000000000002'
const WORKER = 'e1890000-0000-4000-8000-000000000003'
const DISPUTE = 'e1890000-0000-4000-8000-000000000004'

describe('dispute lifecycle', () => {
  installEdgeRuntimeTestHooks()

  it('opens a dispute for the Customer through the atomic operation', async () => {
    const client = makeSequenceClient([
      { data: [openRow()], error: null },
      { data: null, error: null },
    ])

    await expect(createEdgeServices({}).openDispute(
      context(client, 'customer', CUSTOMER),
      JOB,
      openInput(),
    )).resolves.toMatchObject({
      dispute_id: DISPUTE,
      job_id: JOB,
      status: 'open',
      evidence_snapshot_id: 'snapshot-1',
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'rpc:open_dispute_atomic',
      'job_events',
    ])
  })

  it('denies a Customer dispute when the atomic outcome is uncertain', async () => {
    const client = makeSequenceClient([{ data: null, error: { code: 'DB_TIMEOUT', message: 'private database detail' } }])

    await expect(createEdgeServices({}).openDispute(
      context(client, 'customer', CUSTOMER),
      JOB,
      openInput(),
    )).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })

  it('opens a dispute for the Worker through the atomic operation', async () => {
    const client = makeSequenceClient([
      { data: [openRow()], error: null },
      { data: null, error: null },
    ])

    await expect(createEdgeServices({}).openDispute(
      context(client, 'worker', WORKER),
      JOB,
      openInput(),
    )).resolves.toMatchObject({
      dispute_id: DISPUTE,
      job_id: JOB,
      status: 'open',
      evidence_snapshot_id: 'snapshot-1',
    })

    expect(client.calls.find((call) => call.table === 'rpc:open_dispute_atomic')?.operations).toContainEqual([
      'rpc',
      'open_dispute_atomic',
      expect.objectContaining({ p_initiated_by_id: WORKER, p_initiated_by: 'worker' }),
    ])
  })

  it('denies a Worker dispute when the atomic outcome is uncertain', async () => {
    const client = makeSequenceClient([{ data: null, error: { code: 'DB_TIMEOUT', message: 'private database detail' } }])

    await expect(createEdgeServices({}).openDispute(
      context(client, 'worker', WORKER),
      JOB,
      openInput(),
    )).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })

  it('submits a Customer counter-statement through the atomic operation', async () => {
    const client = makeSequenceClient([{ data: [counterRow()], error: null }])

    await expect(createEdgeServices({}).submitDisputeCounterStatement(
      context(client, 'customer', CUSTOMER),
      DISPUTE,
      counterInput(),
    )).resolves.toEqual({
      dispute_id: DISPUTE,
      status: 'admin_review',
      counter_party_statement_submitted: true,
      updated_at: '2026-09-15T00:00:00.000Z',
    })

    expect(client.calls.find((call) => call.table === 'rpc:submit_counter_statement_atomic')?.operations).toContainEqual([
      'rpc',
      'submit_counter_statement_atomic',
      { p_dispute_id: DISPUTE, p_actor_id: CUSTOMER, p_statement: 'Tôi muốn bổ sung phản hồi của mình.' },
    ])
  })

  it('denies a Customer counter-statement when the atomic outcome is uncertain', async () => {
    const client = makeSequenceClient([{ data: null, error: { code: 'DB_TIMEOUT', message: 'private database detail' } }])

    await expect(createEdgeServices({}).submitDisputeCounterStatement(
      context(client, 'customer', CUSTOMER),
      DISPUTE,
      counterInput(),
    )).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })

  it('submits a Worker counter-statement through the atomic operation', async () => {
    const client = makeSequenceClient([{ data: [counterRow()], error: null }])

    await expect(createEdgeServices({}).submitDisputeCounterStatement(
      context(client, 'worker', WORKER),
      DISPUTE,
      counterInput(),
    )).resolves.toMatchObject({
      dispute_id: DISPUTE,
      status: 'admin_review',
      counter_party_statement_submitted: true,
    })

    expect(client.calls.find((call) => call.table === 'rpc:submit_counter_statement_atomic')?.operations).toContainEqual([
      'rpc',
      'submit_counter_statement_atomic',
      expect.objectContaining({ p_dispute_id: DISPUTE, p_actor_id: WORKER }),
    ])
  })

  it('denies a Worker counter-statement when the atomic outcome is uncertain', async () => {
    const client = makeSequenceClient([{ data: null, error: { code: 'DB_TIMEOUT', message: 'private database detail' } }])

    await expect(createEdgeServices({}).submitDisputeCounterStatement(
      context(client, 'worker', WORKER),
      DISPUTE,
      counterInput(),
    )).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })

  it('records an Admin dispute decision through the atomic operation', async () => {
    const client = makeSequenceClient([{ data: [decisionRow()], error: null }])

    await expect(createEdgeServices({}).decideDispute(
      context(client, 'admin', 'admin-1'),
      DISPUTE,
      decisionInput(),
    )).resolves.toEqual({
      dispute_id: DISPUTE,
      status: 'admin_decided',
      outcome: 'refund_customer',
      decided_at: '2026-09-15T00:01:00.000Z',
    })

    expect(client.calls.find((call) => call.table === 'rpc:admin_decide_dispute_atomic')?.operations).toContainEqual([
      'rpc',
      'admin_decide_dispute_atomic',
      expect.objectContaining({ p_dispute_id: DISPUTE, p_admin_id: 'admin-1' }),
    ])
  })

  it('denies an Admin dispute decision when the atomic outcome is uncertain', async () => {
    const client = makeSequenceClient([{ data: null, error: { code: 'DB_TIMEOUT', message: 'private database detail' } }])

    await expect(createEdgeServices({}).decideDispute(
      context(client, 'admin', 'admin-1'),
      DISPUTE,
      decisionInput(),
    )).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })
})

function context(
  client: ReturnType<typeof makeSequenceClient>,
  role: 'customer' | 'worker' | 'admin',
  userId: string,
): MobileApiContext {
  return {
    success: true,
    user: { id: userId },
    role,
    supabase: client,
  }
}

function openInput() {
  return {
    dispute_type: 'completion_rejected',
    initiator_statement: 'Công việc chưa hoàn tất như thông tin ban đầu.',
    evidence_photo_urls: [],
  } as never
}

function counterInput() {
  return { statement: 'Tôi muốn bổ sung phản hồi của mình.' } as never
}

function decisionInput() {
  return {
    outcome: 'refund_customer',
    refund_amount: 450_000,
    worker_credit_amount: 0,
    customer_trust_impact: 'neutral',
    worker_action: 'none',
    reasoning: 'Admin reviewed the available evidence and recorded the outcome.',
  } as never
}

function openRow() {
  return {
    ok: true,
    error_code: null,
    dispute_id: DISPUTE,
    evidence_snapshot_id: 'snapshot-1',
    dispute_status: 'open',
    admin_review_required: true,
    priority: 'high',
    evidence_locked_at: '2026-09-15T00:00:00.000Z',
    created_at_ts: '2026-09-15T00:00:00.000Z',
  }
}

function counterRow() {
  return {
    ok: true,
    error_code: null,
    dispute_id: DISPUTE,
    dispute_status: 'admin_review',
    updated_at_ts: '2026-09-15T00:00:00.000Z',
  }
}

function decisionRow() {
  return {
    ok: true,
    error_code: null,
    dispute_id: DISPUTE,
    dispute_status: 'admin_decided',
    decided_at_ts: '2026-09-15T00:01:00.000Z',
  }
}

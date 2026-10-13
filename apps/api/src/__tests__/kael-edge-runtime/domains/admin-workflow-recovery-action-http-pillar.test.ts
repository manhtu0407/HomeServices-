import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P370-admin-workflow-recovery-action-http',
  invariant: 'Admin recovery actions return the versioned recovery-case lifecycle receipt, require operations.triage, and never claim or write a job status transition',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive actions stay behind the mobile-api Edge boundary)',
    'supabase/migrations/20260904233000_workflow_recovery_capacity_reconciliation.sql comments (recovery actions do not change job status)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/workflow-recovery.ts',
  layer: 'security-negative',
  siblings: ['P49-admin-operations-support', 'P70-workflow-recovery-capacity', 'P365-admin-workflow-recovery-read-http'],
  mutation: 'drop the triage capability or versioned RPC receipt, or project recovery-case status as a job status; the public HTTP success and refusal cases turn red',
} as const satisfies PillarManifest

const CASE_ID = 'd3700000-0000-4000-8000-000000000001'
const JOB_ID = 'd3700000-0000-4000-8000-000000000002'
const ADMIN_ID = 'd3700000-0000-4000-8000-000000000003'
const APPLIED_AT = '2026-10-12T08:00:00.000Z'

function receipt(status: string, version: number, alreadyApplied = false) {
  return {
    ok: true,
    error_code: null,
    recovery_case_id: CASE_ID,
    job_id: JOB_ID,
    status,
    version,
    affected_reservation_count: 0,
    already_applied: alreadyApplied,
    applied_at: APPLIED_AT,
  }
}

function body(input: {
  action: 'acknowledge' | 'mark_contact_required' | 'reconcile_capacity' | 'resolve_verified'
  reason: string
  idempotency_key: string
  expected_version: number
}) {
  return input
}

function setup(input: {
  role?: 'admin' | 'admin_operator' | 'customer'
  operatorCapabilities?: string[]
  rpcResults?: QueryResult[]
} = {}) {
  const role = input.role ?? 'admin'
  const client = makeSequenceClient([], {
    admin_apply_workflow_recovery_action_atomic: input.rpcResults ?? [{
      data: [receipt('acknowledged', 2)],
      error: null,
    }],
  }, role === 'admin_operator' ? {
    admin_operator_accounts: [{
      data: {
        user_id: ADMIN_ID,
        capabilities: input.operatorCapabilities ?? ['operations.read'],
        status: 'active',
      },
      error: null,
    }],
  } : {})
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: ADMIN_ID },
      role,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  const send = (payload: unknown) => handler(new Request(
    `https://edge.test/admin/operations/recovery-cases/${CASE_ID}/action`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  ))
  return { client, send }
}

function actionCalls(client: ReturnType<typeof makeSequenceClient>) {
  return client.calls.filter((call) => call.table === 'rpc:admin_apply_workflow_recovery_action_atomic')
}

describe('Admin workflow recovery action at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('applies a versioned recovery-case lifecycle without changing job state', async () => {
    const { client, send } = setup({ rpcResults: [
      { data: [receipt('acknowledged', 2)], error: null },
      { data: [receipt('action_required', 3)], error: null },
      { data: [receipt('resolved', 4)], error: null },
    ] })
    const steps = [
      body({ action: 'acknowledge', reason: 'Review the detected workflow.', idempotency_key: 'd3700000-0000-4000-8000-000000000011', expected_version: 1 }),
      body({ action: 'mark_contact_required', reason: 'Contact the customer before closing.', idempotency_key: 'd3700000-0000-4000-8000-000000000012', expected_version: 2 }),
      body({ action: 'resolve_verified', reason: 'The workflow recovered and was verified.', idempotency_key: 'd3700000-0000-4000-8000-000000000013', expected_version: 3 }),
    ] as const
    const expectedStatuses = ['acknowledged', 'action_required', 'resolved']

    for (let index = 0; index < steps.length; index += 1) {
      const response = await send(steps[index])
      expect(response.status, pillarWhy(PILLAR, `lifecycle step ${index + 1}`)).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        recovery_case_id: CASE_ID,
        job_id: JOB_ID,
        status: expectedStatuses[index],
        version: index + 2,
        already_applied: false,
        applied_at: APPLIED_AT,
      })
    }

    expect(actionCalls(client)).toHaveLength(3)
    expect(actionCalls(client).map((call) => call.operations[0]?.[2])).toEqual([
      expect.objectContaining({ p_recovery_case_id: CASE_ID, p_actor_id: ADMIN_ID, p_action: 'acknowledge', p_expected_version: 1 }),
      expect.objectContaining({ p_recovery_case_id: CASE_ID, p_actor_id: ADMIN_ID, p_action: 'mark_contact_required', p_expected_version: 2 }),
      expect.objectContaining({ p_recovery_case_id: CASE_ID, p_actor_id: ADMIN_ID, p_action: 'resolve_verified', p_expected_version: 3 }),
    ])
    expect(client.calls.filter((call) => call.table === 'jobs')).toEqual([])
  })

  it('replays the same resolution receipt without a second action', async () => {
    const resolution = body({
      action: 'resolve_verified',
      reason: 'The workflow recovered and was verified.',
      idempotency_key: 'd3700000-0000-4000-8000-000000000021',
      expected_version: 3,
    })
    const { client, send } = setup({ rpcResults: [
      { data: [receipt('resolved', 4)], error: null },
      { data: [receipt('resolved', 4, true)], error: null },
    ] })

    const first = await send(resolution)
    const retry = await send(resolution)
    expect(first.status, pillarWhy(PILLAR)).toBe(200)
    expect(retry.status, pillarWhy(PILLAR, 'an unknown response recovers the same durable receipt')).toBe(200)
    const firstBody = await first.json()
    const retryBody = await retry.json()
    expect(retryBody).toMatchObject({
      recovery_case_id: firstBody.recovery_case_id,
      job_id: firstBody.job_id,
      status: firstBody.status,
      version: firstBody.version,
      already_applied: true,
    })
    expect(actionCalls(client)).toHaveLength(2)
    expect(actionCalls(client).map((call) => call.operations[0]?.[2])).toEqual([
      expect.objectContaining({ p_idempotency_key: resolution.idempotency_key, p_expected_version: 3 }),
      expect.objectContaining({ p_idempotency_key: resolution.idempotency_key, p_expected_version: 3 }),
    ])
    expect(client.calls.filter((call) => call.table === 'jobs')).toEqual([])
  })

  it('denies an Operator without operations.triage before the atomic action', async () => {
    const { client, send } = setup({ role: 'admin_operator' })
    const response = await send(body({
      action: 'acknowledge',
      reason: 'Review the detected workflow.',
      idempotency_key: 'd3700000-0000-4000-8000-000000000031',
      expected_version: 1,
    }))

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(actionCalls(client)).toEqual([])
  })

  it('rejects a missing reason or version before dispatch', async () => {
    const { client, send } = setup()
    const response = await send({
      action: 'resolve_verified',
      reason: 'x',
      idempotency_key: 'd3700000-0000-4000-8000-000000000041',
      expected_version: 0,
    })

    expect(response.status, pillarWhy(PILLAR)).toBe(400)
    expect(actionCalls(client)).toEqual([])
  })

  it('preserves an atomic version conflict', async () => {
    const { client, send } = setup({ rpcResults: [{
      data: [{ ok: false, error_code: 'VERSION_CONFLICT', version: 4 }],
      error: null,
    }] })
    const response = await send(body({
      action: 'acknowledge',
      reason: 'Review the detected workflow.',
      idempotency_key: 'd3700000-0000-4000-8000-000000000051',
      expected_version: 3,
    }))

    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CONFLICT' })
    expect(actionCalls(client)).toHaveLength(1)
    expect(client.calls.filter((call) => call.table === 'jobs')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P365-admin-workflow-recovery-read-http',
  invariant: 'Admin recovery list and detail reads enforce operations.read, return only allowlisted recovery evidence, and fail closed when required records are unavailable',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #8', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/workflow-recovery.ts',
  layer: 'security-negative',
  siblings: ['P49-admin-operations-support', 'P70-workflow-recovery-capacity'],
  mutation: 'bypass operations.read, spread private recovery rows into an Admin response, or treat a missing required relation as an empty valid record; the public HTTP cases turn red',
} as const satisfies PillarManifest

const CASE_ID = 'd3650000-0000-4000-8000-000000000001'
const JOB_ID = 'd3650000-0000-4000-8000-000000000002'
const ADMIN_ID = 'd3650000-0000-4000-8000-000000000003'
const PRIVATE_SENTINEL = 'PRIVATE RECOVERY DETAIL'
const CASE_ROW = {
  id: CASE_ID,
  job_id: JOB_ID,
  reason_code: 'worker_inactive',
  detected_state: 'working',
  severity: 'critical',
  status: 'open',
  first_detected_at: '2026-10-10T10:00:00.000Z',
  last_detected_at: '2026-10-10T10:05:00.000Z',
  last_activity_at: '2026-10-10T10:06:00.000Z',
  updated_at: '2026-10-10T10:06:00.000Z',
  version: 3,
  private_internal_note: PRIVATE_SENTINEL,
}
const JOB_ROW = {
  id: JOB_ID,
  display_code: 'NS-RECOVERY-01',
  service_type: 'plumbing',
  status: 'repairing',
  customer_contact: PRIVATE_SENTINEL,
}

function setup(input: {
  role?: 'admin' | 'admin_operator' | 'customer' | 'worker'
  operatorCapabilities?: string[]
  tables?: Record<string, QueryResult[]>
} = {}) {
  const role = input.role ?? 'admin'
  const client = makeSequenceClient([], {}, {
    ...(role === 'admin_operator' ? {
      admin_operator_accounts: [{ data: {
        user_id: ADMIN_ID,
        capabilities: input.operatorCapabilities ?? ['operations.read'],
        status: 'active',
      }, error: null }],
    } : {}),
    ...input.tables,
  })
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
  const send = (path: string) => handler(new Request(`https://edge.test${path}`))
  return { client, send }
}

describe('Admin workflow recovery reads at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('returns allowlisted recovery summaries through the authenticated list route', async () => {
    const { client, send } = setup({ tables: {
      workflow_recovery_cases: [{ data: [CASE_ROW], error: null, count: 1 }],
      jobs: [{ data: [JOB_ROW], error: null }],
    } })
    const response = await send('/admin/operations/recovery-cases?status=open&severity=critical&limit=1&offset=0')
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      total_count: 1,
      records: [{
        recovery_case_id: CASE_ID,
        job_id: JOB_ID,
        display_code: 'NS-RECOVERY-01',
        service_type: 'plumbing',
        reason_code: 'worker_inactive',
        detected_state: 'working',
        severity: 'critical',
        status: 'open',
        version: 3,
      }],
    })
    expect(JSON.stringify(body)).not.toContain(PRIVATE_SENTINEL)
    const caseQuery = client.calls.find((call) => call.table === 'workflow_recovery_cases')
    expect(caseQuery?.operations).toContainEqual(['eq', 'status', 'open'])
    expect(caseQuery?.operations).toContainEqual(['eq', 'severity', 'critical'])
    expect(caseQuery?.operations).toContainEqual(['range', 0, 0])
    expect(caseQuery?.operations.find((operation) => operation[0] === 'select')?.[1]).not.toContain('private_internal_note')
  })

  it('refuses a Customer before reading recovery cases', async () => {
    const { client, send } = setup({ role: 'customer' })
    const response = await send('/admin/operations/recovery-cases')
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table === 'workflow_recovery_cases')).toEqual([])
  })

  it('denies an Operator without operations.read before reading recovery cases', async () => {
    const { client, send } = setup({ role: 'admin_operator', operatorCapabilities: ['system.read'] })
    const response = await send('/admin/operations/recovery-cases')
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table === 'workflow_recovery_cases')).toEqual([])
  })

  it('returns an allowlisted recovery timeline through the authenticated detail route', async () => {
    const { client, send } = setup({ tables: {
      workflow_recovery_cases: [{ data: CASE_ROW, error: null }],
      jobs: [{ data: JOB_ROW, error: null }],
      matching_operations: [{ data: { state: 'recovery_required', updated_at: '2026-10-10T10:05:00.000Z' }, error: null }],
      matching_capacity_reservations: [{ data: [
        { status: 'held', expires_at: '2999-01-01T00:00:00.000Z' },
        { status: 'expired', expires_at: '2026-10-09T10:00:00.000Z' },
      ], error: null }],
      workflow_recovery_action_audit: [{ data: [], error: null }],
    } })
    const response = await send(`/admin/operations/recovery-cases/${CASE_ID}`)
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      summary: { recovery_case_id: CASE_ID, job_id: JOB_ID, status: 'open', version: 3 },
      current_job_status: 'repairing',
      matching_operation_state: 'recovery_required',
      active_capacity_reservations: 1,
      expired_capacity_reservations: 1,
      actions: [],
    })
    expect(JSON.stringify(body)).not.toContain(PRIVATE_SENTINEL)
  })

  it('refuses a Customer before reading recovery details', async () => {
    const { client, send } = setup({ role: 'customer' })
    const response = await send(`/admin/operations/recovery-cases/${CASE_ID}`)
    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table === 'workflow_recovery_cases')).toEqual([])
  })

  it('returns not found without reading dependent records for a missing case', async () => {
    const { client, send } = setup({ tables: {
      workflow_recovery_cases: [{ data: null, error: null }],
    } })
    const response = await send(`/admin/operations/recovery-cases/${CASE_ID}`)
    expect(response.status, pillarWhy(PILLAR)).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(client.calls.some((call) => ['jobs', 'matching_operations', 'matching_capacity_reservations'].includes(call.table))).toBe(false)
  })

  it('fails closed when a required timeline relation errors', async () => {
    const { send } = setup({ tables: {
      workflow_recovery_cases: [{ data: CASE_ROW, error: null }],
      jobs: [{ data: JOB_ROW, error: null }],
      matching_operations: [{ data: null, error: { code: '08006', message: PRIVATE_SENTINEL } }],
      matching_capacity_reservations: [{ data: [], error: null }],
      workflow_recovery_action_audit: [{ data: [], error: null }],
    } })
    const response = await send(`/admin/operations/recovery-cases/${CASE_ID}`)
    expect(response.status, pillarWhy(PILLAR)).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'DB_ERROR' })
    expect(JSON.stringify(body)).not.toContain(PRIVATE_SENTINEL)
  })
})

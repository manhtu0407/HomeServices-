import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P366-worker-kyc-submit-http',
  invariant: 'Worker KYC submission crosses the public HTTP route through one actor-bound atomic receipt and never fabricates completion after an uncertain outcome',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #8', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/registration.ts',
  layer: 'integration',
  siblings: ['P71-worker-readiness-onboarding', 'P164-worker-draft-receipt', 'P165-worker-verification-upload-deadline'],
  mutation: 'bypass the authenticated Worker route, omit actor binding, or acknowledge a failed RPC; the HTTP boundary cases turn red',
} as const satisfies PillarManifest

const SUBMITTED_AT = '2026-10-12T00:00:00.000Z'

function submitHttp(input: {
  workerId: string
  role?: 'worker' | 'customer'
  data?: unknown
  error?: { code: string; message: string } | null
}) {
  const workerId = input.workerId
  const client = makeSequenceClient([], {
    submit_worker_registration_atomic: [{
      data: input.data ?? [{
        ok: true,
        error_code: null,
        worker_id_out: workerId,
        verification_status_out: 'submitted',
        submitted_at_ts: SUBMITTED_AT,
      }],
      error: input.error ?? null,
    }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: workerId, authProvider: 'email' },
      role: input.role ?? 'worker',
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return {
    client,
    response: handler(new Request('https://edge.test/workers/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        legal_name: 'Nguyen Van A',
        date_of_birth: '1990-01-15',
        gender: 'male',
        service_types: ['electrical'],
        years_experience: 5,
        districts: ['q1'],
        cccd_front_url: `supabase://worker-verification/${workerId}/cccd-front/front.jpg`,
        cccd_back_url: `supabase://worker-verification/${workerId}/cccd-back/back.jpg`,
        selfie_url: `supabase://worker-verification/${workerId}/selfie/selfie.jpg`,
        bank_account: '0123456789',
        bank_name: 'Vietcombank',
      }),
    })),
  }
}

describe('Worker KYC submission at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('returns the actor-bound submitted receipt from the atomic registration command', async () => {
    const workerId = 'd3660000-0000-4000-8000-000000000001'
    const { client, response } = submitHttp({ workerId })
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(201)
    expect(await result.json()).toEqual({
      worker_id: workerId,
      verification_status: 'submitted',
      submitted_at: SUBMITTED_AT,
    })
    const command = client.calls.find((call) => call.table === 'rpc:submit_worker_registration_atomic')
    expect(command?.operations[0]).toMatchObject([
      'rpc',
      'submit_worker_registration_atomic',
      { p_actor_id: workerId, p_worker_id: workerId },
    ])
    expect(client.calls.some((call) => call.operations.some((operation) =>
      ['insert', 'update', 'upsert', 'delete'].includes(String(operation[0]))
    ))).toBe(false)
  })

  it('refuses a Customer before invoking the Worker registration RPC', async () => {
    const workerId = 'd3660000-0000-4000-8000-000000000002'
    const { client, response } = submitHttp({ workerId, role: 'customer' })
    const result = await response
    expect(result.status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table === 'rpc:submit_worker_registration_atomic')).toEqual([])
  })

  it('keeps an RPC timeout unresolved without returning a submitted receipt', async () => {
    const workerId = 'd3660000-0000-4000-8000-000000000003'
    const { client, response } = submitHttp({
      workerId,
      error: { code: '57014', message: 'private database diagnostic' },
    })
    const result = await response
    const body = await result.text()
    expect(result.status, pillarWhy(PILLAR)).toBe(500)
    expect(JSON.parse(body)).toMatchObject({ code: 'DB_ERROR' })
    expect(body).not.toContain('private database diagnostic')
    expect(JSON.parse(body)).not.toHaveProperty('verification_status')
    expect(client.calls.filter((call) => call.table === 'rpc:submit_worker_registration_atomic')).toHaveLength(1)
  })
})

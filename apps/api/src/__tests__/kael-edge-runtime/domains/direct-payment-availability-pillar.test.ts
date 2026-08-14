import { afterEach, describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { loadDirectWorkerPaymentAvailability } from '../../../../../../supabase/functions/mobile-api/_shared/domains/payment/direct-payment-availability'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'

export const PILLAR = {
  id: 'P03-direct-payment-availability',
  invariant:
    'the direct-payment projection is scoped by both job and customer, fails closed to null on any non-boolean answer, and never names the customer in its log',
  authority: [
    'governance/RULES.md #8 (fallback yes, fake success no)',
    'governance/RULES.md #9 (no PII in logs)',
    'governance/RULES.md #7 (payment requires an implemented rail)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/direct-payment-availability.ts',
  layer: 'integration',
  siblings: ['P01-commission-math', 'P10-per-actor-rls'],
  mutation:
    'weaken the guard from `typeof available !== "boolean"` to `available === undefined` — the non-boolean fail-closed cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const JOB_ID = 'job-p03'
const CUSTOMER_ID = 'customer-p03-must-not-be-logged'

function clientAnswering(result: { data: unknown; error: unknown }) {
  return makeSequenceClient([result as never])
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadDirectWorkerPaymentAvailability', () => {
  it.each([
    ['available', true],
    ['unavailable', false],
  ])('returns the projected boolean when the rail reports %s', async (_label, available) => {
    const client = clientAnswering({ data: [{ direct_payment_available: available }], error: null })
    const result = await loadDirectWorkerPaymentAvailability(client as unknown as DbClient, JOB_ID, CUSTOMER_ID)
    expect(result, pillarWhy(PILLAR, `projection said ${String(available)}`)).toBe(available)
  })

  // Both identifiers must reach the projection: the server, not the client, decides whether
  // this customer may pay this job directly.
  it('scopes the projection by both job and customer', async () => {
    const client = clientAnswering({ data: [{ direct_payment_available: true }], error: null })
    await loadDirectWorkerPaymentAvailability(client as unknown as DbClient, JOB_ID, CUSTOMER_ID)

    expect(client.calls, pillarWhy(PILLAR, 'exactly one projection call is expected')).toHaveLength(1)
    expect(client.calls[0].operations[0], pillarWhy(PILLAR, 'the RPC must carry both scoping ids')).toEqual([
      'rpc',
      'get_direct_worker_payment_availability',
      { p_customer_id: CUSTOMER_ID, p_job_id: JOB_ID },
    ])
  })

  it('reads the projection instead of touching payment tables directly', async () => {
    const client = clientAnswering({ data: [{ direct_payment_available: true }], error: null })
    await loadDirectWorkerPaymentAvailability(client as unknown as DbClient, JOB_ID, CUSTOMER_ID)

    const tablesTouched = client.calls.filter((call) => !call.table.startsWith('rpc:'))
    expect(
      tablesTouched,
      pillarWhy(PILLAR, 'a direct table read would bypass the RPC-side authorization'),
    ).toEqual([])
  })

  it.each([
    ['a string', 'true'],
    ['a number', 1],
    ['null', null],
    ['an object', {}],
    ['an absent field', undefined],
  ])('fails closed to null when the projection answers with %s', async (_label, available) => {
    const client = clientAnswering({ data: [{ direct_payment_available: available }], error: null })
    const result = await loadDirectWorkerPaymentAvailability(client as unknown as DbClient, JOB_ID, CUSTOMER_ID)
    expect(
      result,
      pillarWhy(PILLAR, `a non-boolean answer (${JSON.stringify(available)}) must not be read as permission`),
    ).toBeNull()
  })

  it.each([
    ['the projection errors', { data: null, error: { message: 'boom' } }],
    ['no row comes back', { data: [], error: null }],
    ['data is null', { data: null, error: null }],
  ])('fails closed to null when %s', async (_label, result) => {
    const client = clientAnswering(result)
    const available = await loadDirectWorkerPaymentAvailability(client as unknown as DbClient, JOB_ID, CUSTOMER_ID)
    expect(available, pillarWhy(PILLAR, 'an unresolved projection is not a grant')).toBeNull()
  })

  it('names only the job when it logs a projection failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = clientAnswering({ data: null, error: { message: 'boom' } })

    await loadDirectWorkerPaymentAvailability(client as unknown as DbClient, JOB_ID, CUSTOMER_ID)

    expect(warn, pillarWhy(PILLAR, 'the failure must still be observable')).toHaveBeenCalledTimes(1)
    expect(
      JSON.stringify(warn.mock.calls),
      pillarWhy(PILLAR, 'a customer identifier in a log line is a RULES #9 violation'),
    ).not.toContain(CUSTOMER_ID)
    expect(warn.mock.calls[0][1], pillarWhy(PILLAR, 'the job id is the safe correlation key')).toEqual({
      jobId: JOB_ID,
    })
  })
})

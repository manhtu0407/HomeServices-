import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { decideAdminPaymentReconciliation } from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/finance'

export const PILLAR = {
  id: 'P34-admin-finance-bank-reference',
  invariant:
    'a raw bank transaction reference never reaches the reconciliation RPC — only a SHA-256 of the trimmed value and at most its last sixteen characters cross, and a cash decision sends neither',
  authority: [
    'governance/RULES.md #9 (logging must not expose PII or secrets)',
    'governance/RULES.md Security Invariants — PII Handling (bank details are not shared beyond the minimum the workflow needs)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/finance-reconciliation.ts',
  layer: 'security-negative',
  siblings: ['P01-commission-math', 'P09-kael-pii-scrub', 'P19-job-access-ownership'],
  mutation:
    'pass `input.bank_reference` straight through as `p_bank_reference_hash` — two cases turn red, the hash-is-not-the-value one and the trimming one, since an untrimmed raw value no longer agrees with its trimmed twin. The suffix is computed separately and stays green, so truncating `normalized.slice(-16)` to eight is the second recorded mutation: it fails only the sixteen-character case. Both were observed; neither alone reaches the other half',
} as const satisfies PillarManifest

function ownerContext(rpc: ReturnType<typeof vi.fn>) {
  return {
    role: 'admin',
    supabase: { rpc },
    user: { id: 'owner-1' },
  } as never
}

/** Records every RPC the decision path makes, so an assertion can name the call that carried a value. */
function recordingRpc(row: Record<string, unknown>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    calls.push({ name, args: args ?? {} })
    return { data: [row], error: null }
  })
  return { calls, rpc }
}

const MANUAL_ROW = {
  hold_until: '2026-08-12T10:00:00.000Z',
  job_id: 'job-1',
  ok: true,
  outcome: 'paid',
  payment_status: 'manual_verified',
  status: 'paid',
}

const CASH_ROW = {
  hold_until: null,
  job_id: 'job-1',
  ok: true,
  outcome: 'confirmed',
  payment_status: 'cash_verified',
  status: 'paid',
}

async function decideWith(bankReference: string | undefined) {
  const { calls, rpc } = recordingRpc(MANUAL_ROW)
  await decideAdminPaymentReconciliation(ownerContext(rpc), 'payment-order-1', {
    amount_received: 450_000,
    credited_at: '2026-08-11T10:00:00.000Z',
    decision: 'confirm',
    ...(bankReference === undefined ? {} : { bank_reference: bankReference }),
  } as never)
  expect(calls).toHaveLength(1)
  return calls[0].args
}

describe('P34 admin finance — the raw reference does not cross', () => {
  it('sends a full-width hash that is not the reference itself', async () => {
    const reference = 'VCB-TRANSFER-99887766554433'
    const args = await decideWith(reference)

    expect(
      args.p_bank_reference_hash,
      pillarWhy(PILLAR, 'the reconciliation row keeps a bank reference forever; only a one-way digest may be kept'),
    ).toMatch(/^[0-9a-f]{64}$/)
    expect(
      args.p_bank_reference_hash,
      pillarWhy(PILLAR, 'a hash equal to its input is not a hash'),
    ).not.toBe(reference)
    expect(
      JSON.stringify(args).includes(reference),
      pillarWhy(PILLAR, 'the whole reference must not appear anywhere in the RPC arguments'),
    ).toBe(false)
  })

  it('sends at most the last sixteen characters as the readable suffix', async () => {
    const reference = 'VCB-TRANSFER-99887766554433'
    const args = await decideWith(reference)

    expect(
      args.p_bank_reference_suffix,
      pillarWhy(PILLAR, `a ${reference.length}-character reference may cross only as its last sixteen`),
    ).toBe(reference.slice(-16))
    expect(
      (args.p_bank_reference_suffix as string).length,
      pillarWhy(PILLAR, 'sixteen is the bound; a longer suffix is more of the reference than the operator needs'),
    ).toBe(16)
  })

  it('hashes the trimmed value, so surrounding whitespace cannot fork one reference into two', async () => {
    const padded = await decideWith('  VCB-TRANSFER-99887766554433  ')
    const plain = await decideWith('VCB-TRANSFER-99887766554433')

    expect(
      padded.p_bank_reference_hash,
      pillarWhy(PILLAR, 'the reuse guard compares hashes; an untrimmed value would slip past it as a new reference'),
    ).toBe(plain.p_bank_reference_hash)
  })

  it('sends null rather than an empty string when no reference was supplied', async () => {
    const args = await decideWith(undefined)

    expect(
      args.p_bank_reference_hash,
      pillarWhy(PILLAR, 'an empty string is a value the reuse guard would index; absence must read as absence'),
    ).toBeNull()
    expect(args.p_bank_reference_suffix, pillarWhy(PILLAR, 'the suffix follows the hash')).toBeNull()
  })
})

describe('P34 admin finance — a cash decision carries no bank fields at all', () => {
  it('routes to the cash RPC and passes neither hash nor suffix', async () => {
    const { calls, rpc } = recordingRpc(CASH_ROW)
    await decideAdminPaymentReconciliation(ownerContext(rpc), 'payment-order-1', {
      decision: 'cash_confirm',
    } as never)

    expect(calls).toHaveLength(1)
    expect(
      calls[0].name,
      pillarWhy(PILLAR, 'cash reconciliation is a different RPC; sending it down the bank path would carry bank columns'),
    ).toBe('decide_cash_payment_reconciliation')
    expect(
      Object.keys(calls[0].args).filter((key) => key.includes('bank_reference')),
      pillarWhy(PILLAR, 'there is no bank reference in a cash settlement, so none may be sent'),
    ).toEqual([])
  })
})

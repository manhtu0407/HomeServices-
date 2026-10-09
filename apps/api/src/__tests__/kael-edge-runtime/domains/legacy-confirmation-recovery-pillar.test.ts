import { describe, expect, it } from 'vitest'
import { recoverLegacyKaelConfirmation } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/legacy-confirmation-recovery'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/platform/auth'
import type { PillarManifest } from '../../pillar-manifest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { dispatchKaelRoute } from '../../../../../../supabase/functions/mobile-api/_shared/http/dispatch/kael'
import { matchCustomerKaelChatSessionRoute } from '../../../../../../supabase/functions/mobile-api/_shared/http/routes/kael-chat-session-routes'
import { legacyConfirmationRecoverySchema as sharedRecoverySchema } from '../../../../../../packages/shared/src/contracts/legacy-confirmation-recovery'
import { legacyConfirmationRecoverySchema as edgeRecoverySchema } from '../../../../../../supabase/functions/_shared/contracts/legacy-confirmation-recovery'
import { CAPABILITY_POLICIES } from '../../../../../../supabase/functions/mobile-api/_shared/platform/authz/capability-registry'

export const PILLAR = {
  id: 'P186-legacy-confirmation-recovery',
  invariant: 'legacy recovery preserves owned job identity and requires validated original offer and current policy',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/legacy-confirmation-recovery.ts',
  layer: 'integration', siblings: ['P48-durable-confirmation-operation', 'P20-price-receipt-gate'],
  mutation: 'remove the customer role guard; worker and admin rejection cases fail before a database command',
} as const satisfies PillarManifest

describe('legacy confirmation recovery command', () => {
  installEdgeRuntimeTestHooks()
  const sessionId = '11111111-1111-4111-8111-111111111111'
  const customerId = '22222222-2222-4222-8222-222222222222'
  const jobId = '33333333-3333-4333-8333-333333333333'
  const input = { job_id: jobId, price_reasoning_receipt_id: 'receipt-original-001' }
  const receipt = {
    operation_id: '44444444-4444-4444-8444-444444444444',
    idempotency_key: `kael-confirm:${sessionId}:${customerId}`,
    session_id: sessionId, job_id: jobId, quote_mode: 'kael_auto_quote',
    state: 'no_reachable_worker', terminal: true,
    accepted_at: '2026-10-09T00:01:17Z', updated_at: '2026-10-09T04:00:00Z',
    retry_after_ms: null, support_code: '1234ABCD',
  }
  const context = (client: ReturnType<typeof makeSequenceClient>, role = 'customer') => ({
    success: true, user: { id: customerId }, role, supabase: client,
  } as MobileApiContext)

  it('adopts the same job through one atomic command and never sends invitations directly', async () => {
    const client = makeSequenceClient([], {
      recover_legacy_kael_confirmation_atomic: [{ data: receipt, error: null }],
    })
    await expect(recoverLegacyKaelConfirmation(context(client), sessionId, input))
      .resolves.toEqual({ operation: receipt })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]?.operations).toContainEqual(['rpc', 'recover_legacy_kael_confirmation_atomic', {
      p_session_id: sessionId, p_customer_id: customerId, p_job_id: jobId,
      p_price_reasoning_receipt_id: input.price_reasoning_receipt_id,
    }])
  })

  it.each(['worker', 'admin'])('rejects %s before any database command', async (role) => {
    const client = makeSequenceClient([])
    await expect(recoverLegacyKaelConfirmation(context(client, role), sessionId, input))
      .rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' })
    expect(client.calls).toHaveLength(0)
  })

  it.each(['LEGACY_OFFER_CHANGED', 'KAEL_PRICE_EVIDENCE_REQUIRED', 'POLICY_BLOCKED',
    'CONFIRMATION_KIND_MISMATCH', 'LEGACY_RECOVERY_NOT_READY'])('keeps %s fail closed', async (message) => {
    const client = makeSequenceClient([], {
      recover_legacy_kael_confirmation_atomic: [{ data: null, error: { code: '23514', message } }],
    })
    await expect(recoverLegacyKaelConfirmation(context(client), sessionId, input))
      .rejects.toMatchObject({ code: message, status: 409 })
    expect(client.calls).toHaveLength(1)
  })

  it('rejects a receipt belonging to another job', async () => {
    const client = makeSequenceClient([], {
      recover_legacy_kael_confirmation_atomic: [{ data: { ...receipt, job_id: customerId }, error: null }],
    })
    await expect(recoverLegacyKaelConfirmation(context(client), sessionId, input))
      .rejects.toMatchObject({ code: 'LEGACY_RECOVERY_OUTCOME_UNKNOWN' })
  })

  it('routes explicit confirmation to the real Edge service, with the same contract on both boundaries', async () => {
    const client = makeSequenceClient([], {
      recover_legacy_kael_confirmation_atomic: [{ data: receipt, error: null }],
    })
    const route = matchCustomerKaelChatSessionRoute(`/kael/chat/${sessionId}/recover-confirmation`,
      'POST', (value) => value)
    expect(route).toMatchObject({ kind: 'kael.chat.recoverConfirmation', roles: ['customer'] })
    if (!route) throw new Error('Recovery route missing')
    await expect(dispatchKaelRoute(route, new Request('https://example.test', {
      method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' },
    }), context(client), createEdgeServices({}))).resolves.toEqual({ operation: receipt })
    for (const schema of [sharedRecoverySchema, edgeRecoverySchema]) {
      expect(schema.safeParse(input).success).toBe(true)
      expect(schema.safeParse({ ...input, quote_mode: 'kael_auto_quote' }).success).toBe(false)
      expect(schema.safeParse({ job_id: jobId }).success).toBe(false)
    }
  })

  it('does not restore confirmation during GET or accept a bodyless legacy retry', () => {
    expect(CAPABILITY_POLICIES['kael.chat.recoverConfirmation']).toMatchObject({
      privileged: true, resourceType: 'session', requiresResourceCheck: true,
      operationClass: 'idempotent_write',
    })
    expect(matchCustomerKaelChatSessionRoute(`/kael/chat/${sessionId}/recover-confirmation`,
      'GET', (value) => value)).toBeNull()
    expect(sharedRecoverySchema.safeParse({}).success).toBe(false)
  })

  it('maps timeouts to reconciliation rather than another job creation', async () => {
    const client = makeSequenceClient([], {
      recover_legacy_kael_confirmation_atomic: [{ data: null, error: { code: 'DB_TIMEOUT' } }],
    })
    await expect(recoverLegacyKaelConfirmation(context(client), sessionId, input))
      .rejects.toMatchObject({ code: 'LEGACY_RECOVERY_OUTCOME_UNKNOWN', status: 503,
        extra: { reconcile_required: true } })
    expect(client.calls).toHaveLength(1)
  })
})

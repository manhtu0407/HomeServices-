import { describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  buildConfirmationIdempotencyKey,
  claimKaelConfirmationRecovery,
  requestDurableKaelConfirmation,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/confirmation-operation'
import { matchCustomerKaelChatSessionRoute } from '../../../../../../supabase/functions/mobile-api/_shared/http/routes/kael-chat-session-routes'
import { serializeKaelSession } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/serialize'
import { publicMissingTierA } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support'
import {
  createMobileApiHandler,
  type MobileApiContext,
  type MobileApiServices,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'

export const PILLAR = {
  id: 'P48-durable-confirmation-operation',
  invariant:
    'repeating one Kael confirmation claims one stable durable operation and returns its recoverable receipt without waiting for geocoding or broadcast delivery',
  authority: [
    'governance/RULES.md #7 (workflow actions require a recorded server decision)',
    'docs/dev-suggestion/stage1-intake-quote-admin-proposal.md (confirmation must be idempotent and reconcilable)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/confirmation-operation.ts',
  layer: 'integration',
  siblings: ['P49-durable-matching-delivery', 'P50-reachable-cohort-matching'],
  mutation:
    'replace the stable session/customer key with a random UUID, or accept an empty RPC row; duplicate retries diverge or an unrecorded confirmation reports success',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const SESSION_ID = '10000000-0000-4000-8000-000000000048'
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000048'

describe('durable Kael confirmation', () => {
  it('keeps the existing confirm path but reports asynchronous acceptance', () => {
    expect(matchCustomerKaelChatSessionRoute(
      `/kael/chat/${SESSION_ID}/confirm`,
      'POST',
      (value) => value,
    )).toMatchObject({ kind: 'kael.chat.confirm', successStatus: 202 })
    expect(matchCustomerKaelChatSessionRoute(
      `/kael/chat/${SESSION_ID}/operation`,
      'GET',
      (value) => value,
    )).toMatchObject({ kind: 'kael.chat.operation', method: 'GET' })
  })

  it('uses a privileged read capability without demanding a write idempotency key', async () => {
    const privilegedSupabase = { client: 'service-role' }
    const userSupabase = { client: 'authenticated-user' }
    let context!: MobileApiContext
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true,
        user: { id: CUSTOMER_ID },
        role: 'customer',
        accountState: 'active',
        environment: 'staging',
        releaseId: 'release-p48-test',
        supabase: privilegedSupabase,
        privilegedSupabase,
        userSupabase,
      }),
      services: {
        getKaelConfirmationOperation: async (ctx: MobileApiContext) => {
          context = ctx
          return { operation: null }
        },
      } as unknown as MobileApiServices,
    })

    const response = await handler(new Request(`https://api.example.test/kael/chat/${SESSION_ID}/operation`))

    expect(response.status).toBe(200)
    expect(context.supabase).toBe(privilegedSupabase)
    expect(context.capabilityEnvelope).toMatchObject({
      routeKind: 'kael.chat.operation',
      capability: 'mobile.route.kael.chat.operation',
      operationClass: 'database_read',
      privileged: true,
      resource: { type: 'session', id: SESSION_ID },
    })
  })

  it('uses the domain receipt and batched audit instead of generic request idempotency', async () => {
    const rpcCalls: string[] = []
    const privilegedSupabase = {
      rpc(name: string) {
        rpcCalls.push(name)
        return Promise.resolve({ data: true, error: null })
      },
    }
    const confirmKaelChat = async (ctx: MobileApiContext) => {
      if (!ctx.requestLifecycle) throw new Error('request lifecycle is unavailable')
      ctx.requestLifecycle.finalizedByDomain = true
      return {
        session_id: SESSION_ID,
        job_id: '50000000-0000-4000-8000-000000000048',
        status: 'awaiting_customer_confirm' as const,
        broadcast_sent: false,
        worker: null,
        message: 'Kael đã tiếp nhận yêu cầu.',
        matching_state: null,
        operation: null,
      }
    }
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true,
        user: { id: CUSTOMER_ID },
        role: 'customer',
        accountState: 'active',
        environment: 'staging',
        releaseId: 'release-p48-test',
        supabase: privilegedSupabase,
        privilegedSupabase,
        userSupabase: {},
      }),
      services: { confirmKaelChat } as unknown as MobileApiServices,
    })

    const response = await handler(new Request(
      `https://api.example.test/kael/chat/${SESSION_ID}/confirm`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'client-confirm-attempt-1',
        },
        body: JSON.stringify({ confirmation_kind: 'rfq_request' }),
      },
    ))

    expect(response.status).toBe(202)
    expect(rpcCalls).toEqual(['begin_harness_authorized_request'])
    expect(rpcCalls).not.toContain('reserve_harness_idempotency')
  })

  it('derives the same non-secret idempotency key for every retry', () => {
    const first = buildConfirmationIdempotencyKey(SESSION_ID, CUSTOMER_ID)
    const retry = buildConfirmationIdempotencyKey(SESSION_ID, CUSTOMER_ID)

    expect(first, pillarWhy(PILLAR, 'network retries must claim the same database operation')).toBe(retry)
    expect(first, pillarWhy(PILLAR, 'the key is namespaced for operational diagnosis')).toBe(
      `kael-confirm:${SESSION_ID}:${CUSTOMER_ID}`,
    )
  })

  it('surfaces governed RFQ coverage as the session next action', () => {
    const session = serializeKaelSession({
      id: SESSION_ID,
      job_id: null,
      customer_id: CUSTOMER_ID,
      service_type: 'plumbing',
      status: 'estimate_ready',
      case_phase: 'offer_review',
      diagnosis_scope: null,
      scheduled_at: '2026-08-24T04:00:00.000Z',
      started_at: '2026-08-23T04:00:00.000Z',
      estimate_ready_at: '2026-08-23T04:00:10.000Z',
      total_turns: 1,
      total_cost_usd: 0.01,
      safe_metadata: {
        intake_coverage: {
          policy_id: '60000000-0000-4000-8000-000000000048',
          policy_version: 2,
          quote_mode: 'rfq',
          order_eligible: true,
          missing_required_fields: [],
          missing_enrichment_slots: ['pipe_material'],
          safety_blocker: null,
          confirmation_kind: 'rfq_request',
          next_action: 'rfq_review',
        },
      },
    }, null, [])

    expect(session).toMatchObject({
      quote_mode: 'rfq',
      policy_version: 2,
      next_action: 'rfq_review',
      intake_coverage: { confirmation_kind: 'rfq_request', order_eligible: true },
    })
  })

  it('maps the internal description_min floor to the public description contract', () => {
    expect(publicMissingTierA(['address_district', 'description_min'])).toEqual([
      'address_district',
      'description',
    ])
  })

  it('returns the durable receipt produced by the atomic RPC', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const client = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args })
        return Promise.resolve({
          error: null,
          data: [{
            ok: true,
            error_code: null,
            operation_id: '30000000-0000-4000-8000-000000000048',
            receipt_id: '40000000-0000-4000-8000-000000000048',
            job_id: '50000000-0000-4000-8000-000000000048',
            job_status: 'broadcasting',
            quote_mode: 'rfq',
            operation_state: 'matching_queued',
            already_applied: false,
            accepted_at: '2026-08-23T04:00:00.000Z',
            updated_at: '2026-08-23T04:00:00.000Z',
            idempotency_key: `kael-confirm:${SESSION_ID}:${CUSTOMER_ID}`,
            support_code: 'P48TEST1',
            terminal: false,
            retry_after_ms: null,
            trace_finalized: true,
          }],
        })
      },
    }

    const result = await requestDurableKaelConfirmation(client, {
      sessionId: SESSION_ID,
      customerId: CUSTOMER_ID,
      confirmationKind: 'rfq_request',
      priceReasoningReceiptId: null,
      traceFinalizer: {
        runId: '60000000-0000-4000-8000-000000000048',
        traceId: '70000000-0000-4000-8000-000000000048',
        actorIdHash: 'a'.repeat(64),
        actorRole: 'customer',
        routeKind: 'kael.chat.confirm',
        capability: 'mobile.route.kael.chat.confirm',
        environment: 'staging',
        releaseId: 'harness-001cc7757f65-39db01eb11ed',
        privileged: true,
        resourceType: 'session',
        resourceIdHash: 'b'.repeat(64),
        durationMs: 173,
      },
    })

    expect(calls, pillarWhy(PILLAR, 'all durable writes belong to one atomic DB boundary')).toEqual([
      {
        name: 'confirm_kael_chat_durable_authorized_v4',
        args: {
          p_session_id: SESSION_ID,
          p_customer_id: CUSTOMER_ID,
          p_idempotency_key: `kael-confirm:${SESSION_ID}:${CUSTOMER_ID}`,
          p_confirmation_kind: 'rfq_request',
          p_price_reasoning_receipt_id: null,
          p_run_id: '60000000-0000-4000-8000-000000000048',
          p_trace_id: '70000000-0000-4000-8000-000000000048',
          p_actor_id_hash: 'a'.repeat(64),
          p_actor_role: 'customer',
          p_route_kind: 'kael.chat.confirm',
          p_capability: 'mobile.route.kael.chat.confirm',
          p_environment: 'staging',
          p_release_id: 'harness-001cc7757f65-39db01eb11ed',
          p_privileged: true,
          p_resource_type: 'session',
          p_resource_id_hash: 'b'.repeat(64),
          p_duration_ms: 173,
        },
      },
    ])
    expect(result).toMatchObject({
      ok: true,
      operationId: '30000000-0000-4000-8000-000000000048',
      receiptId: '40000000-0000-4000-8000-000000000048',
      jobId: '50000000-0000-4000-8000-000000000048',
      quoteMode: 'rfq',
      operationState: 'matching_queued',
      alreadyApplied: false,
      traceFinalized: true,
      operation: {
        operation_id: '30000000-0000-4000-8000-000000000048',
        support_code: 'P48TEST1',
        state: 'matching_queued',
      },
    })
  })

  it('fails closed when the atomic boundary has no receipt', async () => {
    const client = {
      rpc() {
        return Promise.resolve({ error: null, data: [] })
      },
    }
    await expect(
      requestDurableKaelConfirmation(client, {
        sessionId: SESSION_ID,
        customerId: CUSTOMER_ID,
        confirmationKind: 'inspection_request',
        priceReasoningReceiptId: null,
      }),
      pillarWhy(PILLAR, 'an accepted HTTP response must never outrun its durable receipt'),
    ).rejects.toThrow('KAEL_CONFIRM_DURABILITY_FAILED')
  })

  it('reclaims queued matching after a restart without creating another confirmation', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const client = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args })
        return Promise.resolve({
          error: null,
          data: [{
            operation_id: '30000000-0000-4000-8000-000000000048',
            job_id: '50000000-0000-4000-8000-000000000048',
            operation_state: 'matching_queued',
            claimed: true,
          }],
        })
      },
    }

    await expect(claimKaelConfirmationRecovery(client, {
      sessionId: SESSION_ID,
      customerId: CUSTOMER_ID,
    })).resolves.toMatchObject({
      operationId: '30000000-0000-4000-8000-000000000048',
      jobId: '50000000-0000-4000-8000-000000000048',
      claimed: true,
    })
    expect(calls).toEqual([{
      name: 'claim_confirmation_matching_outbox',
      args: {
        p_session_id: SESSION_ID,
        p_customer_id: CUSTOMER_ID,
        p_lease_seconds: 30,
      },
    }])
  })
})

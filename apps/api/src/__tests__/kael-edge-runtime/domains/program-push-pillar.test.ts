import { describe, expect, it, vi } from 'vitest'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { dispatchProgramPushes } from '../../../../../../supabase/functions/mobile-api/_shared/domains/notification/program-push'
import { hashReliabilityValue } from '../../../../../../supabase/functions/_shared/harness/reliability'
import { customerCompensationRoute, workerViolationsRoute } from '../../../../../mobile/lib/program-notification-routes'

export const PILLAR = {
  id: 'P287-program-push-dispatch',
  invariant:
    'a claimed discipline or compensation notice is pushed only to its recipient with the inbox title and body, once per notice under a stable idempotency key, deep-links a worker to the violations screen and a customer to the compensation section, and a failed push or malformed row is counted instead of failing the batch',
  authority: [
    'governance/RULES.md #8',
    'Plan moonlit-singing-phoenix R2.2: program decisions reach a closed app',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/notification/program-push.ts',
  layer: 'integration',
  siblings: ['P278-worker-reply-nudge-push', 'P286-program-push-claim-sql'],
  mutation:
    'send every recipient to WORKER_VIOLATIONS_ROUTE, or drop the idempotencyKey from the push options — the customer deep-link or idempotency case turns red',
} as const satisfies PillarManifest

const id = (n: number) => `c2870000-0000-4000-8000-${String(n).padStart(12, '0')}`
const workerClaim = {
  notification_id: id(1), user_id: id(2), recipient_role: 'worker', event_type: 'violation_confirmed',
  title: 'Vi phạm cấp 1 đã được xác nhận', body: 'Xem lý do và hình thức xử lý.',
}
const customerClaim = {
  notification_id: id(3), user_id: id(4), recipient_role: 'customer', event_type: 'compensation_agreed',
  title: 'Hai bên đã thống nhất bồi thường', body: 'NestScout sẽ chuyển khoản cho bạn và báo khi hoàn tất.',
}
const options = { limit: 50, environment: 'production', releaseId: 'harness-287000000000-287000000000' }

function setup(claims: unknown[], providerOk = true) {
  const reservations = claims.map((_, index) => ({
    data: [{ state: 'reserved', reservation_id: id(100 + index), response_hash: null }], error: null,
  }))
  const tokens = claims.map((claim, index) => ({
    data: [{ id: id(200 + index), user_id: (claim as { user_id?: string }).user_id, push_token: `ExponentPushToken[p287-${index}]`, updated_at: '2026-09-28T00:00:00Z' }],
    error: null,
  }))
  const database = makeSequenceClient([], {
    claim_program_pushes: [{ data: claims, error: null }],
    reserve_harness_idempotency: reservations,
  }, { device_push_tokens: tokens })
  const fetch = vi.fn<typeof globalThis.fetch>(async () => providerOk
    ? new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-p287' }] }))
    : new Response('provider down', { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  return { database, fetch, run: () => dispatchProgramPushes(database as unknown as DbClient, options) }
}

const sentMessages = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit | undefined)?.body))[0])

describe(`${PILLAR.id}: program notices reach a closed app`, () => {
  installEdgeRuntimeTestHooks()

  it('pushes the inbox text to each recipient with the screen that owns the decision', async () => {
    const { database, fetch, run } = setup([workerClaim, customerClaim])
    expect(await run(), pillarWhy(PILLAR)).toEqual({ claimed: 2, pushed: 2, pushFailed: 0, malformed: 0 })
    expect(database.calls[0]?.operations[0]).toEqual(['rpc', 'claim_program_pushes', { p_limit: 50 }])

    const [toWorker, toCustomer] = sentMessages(fetch)
    expect(toWorker).toMatchObject({ to: 'ExponentPushToken[p287-0]', title: workerClaim.title, body: workerClaim.body })
    expect(toWorker.data, pillarWhy(PILLAR, 'a worker lands on the violations screen')).toEqual({
      event_type: 'violation_confirmed', notification_id: workerClaim.notification_id, deep_link: workerViolationsRoute,
    })
    expect(toCustomer.data.deep_link, pillarWhy(PILLAR, 'a customer lands on the compensation section')).toBe(customerCompensationRoute)
  })

  it('keys each push to its notice so a retried tick never sends it twice', async () => {
    const { database, run } = setup([workerClaim])
    await run()
    const reserved = database.calls.find((call) => call.table === 'rpc:reserve_harness_idempotency')?.operations[0][2]
    expect(reserved, pillarWhy(PILLAR)).toMatchObject({
      p_operation_id: 'notification.program_push',
      p_key_hash: await hashReliabilityValue(`program-push:${workerClaim.notification_id}`),
    })
  })

  it('counts a provider failure instead of reporting the notice as sent', async () => {
    const { run } = setup([workerClaim], false)
    expect(await run(), pillarWhy(PILLAR)).toMatchObject({ claimed: 1, pushed: 0, pushFailed: 1 })
  })

  it('skips a malformed row without pushing to an unknown user or dropping the rest', async () => {
    const { fetch, run } = setup([{ ...workerClaim, recipient_role: 'admin' }, customerClaim])
    expect(await run(), pillarWhy(PILLAR)).toEqual({ claimed: 2, pushed: 1, pushFailed: 0, malformed: 1 })
    expect(sentMessages(fetch).map((message) => message.title)).toEqual([customerClaim.title])
  })
})

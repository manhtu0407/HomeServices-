import { describe, expect, it, vi } from 'vitest'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { dispatchWorkerReplyNudges } from '../../../../../../supabase/functions/mobile-api/_shared/domains/notification/worker-reply-nudge'
import { hashReliabilityValue } from '../../../../../../supabase/functions/_shared/harness/reliability'

export const PILLAR = {
  id: 'P278-worker-reply-nudge-push',
  invariant:
    'a claimed reply reminder is pushed only to the job\'s worker, once per reminder under a stable idempotency key, carries no chat text, and a failed push is counted instead of failing the maintainer run or being reported as sent',
  authority: [
    'governance/structures/do-not-build-now.md §21',
    'Tu 2026-09-28: remind the worker before any slow-response penalty; both sides treated fairly',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/notification/worker-reply-nudge.ts',
  layer: 'integration',
  siblings: ['P125-official-match-push-runtime', 'P279-worker-reply-nudge-sql'],
  mutation:
    'drop the idempotencyKey from the push options, or count a failed push as pushed — the idempotency or failure case turns red',
} as const satisfies PillarManifest

const id = (n: number) => `c2290000-0000-4000-8000-${String(n).padStart(12, '0')}`
const claim = { nudge_id: id(1), job_id: id(2), worker_id: id(3) }
const options = { limit: 50, environment: 'staging', releaseId: 'harness-229000000000-229000000000' }

function setup(claims: unknown = [claim], providerOk = true) {
  const database = makeSequenceClient([], {
    claim_worker_reply_nudges: [{ data: claims, error: null }],
    reserve_harness_idempotency: [{ data: [{ state: 'reserved', reservation_id: id(6), response_hash: null }], error: null }],
  }, {
    device_push_tokens: [{ data: [{ id: id(7), user_id: claim.worker_id, push_token: 'ExponentPushToken[p229]', updated_at: '2026-09-28T00:00:00Z' }], error: null }],
  })
  const fetch = vi.fn<typeof globalThis.fetch>(async () => providerOk
    ? new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-p229' }] }))
    : new Response('provider down', { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  return { database, fetch, run: () => dispatchWorkerReplyNudges(database as unknown as DbClient, options) }
}

describe(`${PILLAR.id}: worker reply reminders`, () => {
  installEdgeRuntimeTestHooks()

  it('pushes the claimed reminder to the job worker under a per-reminder key, without chat text', async () => {
    const { database, fetch, run } = setup()
    expect(await run(), pillarWhy(PILLAR)).toEqual({ claimed: 1, pushed: 1, pushFailed: 0 })
    expect(database.calls[0]?.operations[0]).toEqual(['rpc', 'claim_worker_reply_nudges', { p_limit: 50 }])
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))[0]
    expect(request.to).toBe('ExponentPushToken[p229]')
    expect(request.data).toEqual({ event_type: 'worker_reply_nudge', job_id: claim.job_id, deep_link: `/(worker)/jobs?job_id=${claim.job_id}` })
    const reserved = database.calls.find((call) => call.table === 'rpc:reserve_harness_idempotency')?.operations[0][2]
    expect(reserved, pillarWhy(PILLAR, 'a retried maintainer tick must not push the same reminder twice')).toMatchObject({
      p_operation_id: 'notification.worker_reply_nudge',
      p_key_hash: await hashReliabilityValue(`reply-nudge:${claim.nudge_id}`),
    })
  })

  it('counts a provider failure instead of reporting the reminder as sent', async () => {
    const { run } = setup([claim], false)
    expect(await run(), pillarWhy(PILLAR)).toMatchObject({ claimed: 1, pushed: 0, pushFailed: 1 })
  })

  it('does nothing when no reminder is due', async () => {
    const { fetch, run } = setup([])
    expect(await run()).toEqual({ claimed: 0, pushed: 0, pushFailed: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a malformed claim row rather than pushing to an unknown user', async () => {
    const { fetch, run } = setup([{ ...claim, worker_id: 'not-a-uuid' }])
    await expect(run()).rejects.toThrow('REPLY_NUDGE_CLAIM_MALFORMED')
    expect(fetch).not.toHaveBeenCalled()
  })
})

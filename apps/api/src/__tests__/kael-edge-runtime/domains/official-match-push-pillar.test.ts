import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { dispatchOfficialMatchPush } from '../../../../../../supabase/functions/mobile-api/_shared/domains/notification/official-match-push'

export const PILLAR = {
  id: 'P125-official-match-push-runtime',
  invariant: 'The maintainer dispatches only a live release-bound notification lease; missing tokens and unknown provider outcomes never become delivered claims',
  authority: ['governance/RULES.md #8 and #9', 'approved Production Agentic Transaction Readiness plan'],
  target: 'supabase/functions/mobile-api/_shared/domains/notification/official-match-push.ts',
  layer: 'integration',
  siblings: ['P124-official-match-push-sql', 'P57-stage1-provider-push-receipt', 'P123-official-match-receipt-http'],
  mutation: 'remove the replayed receipt guard; an unknown completed harness key is incorrectly reported as no registered token',
} as const satisfies PillarManifest

const id = (n: number) => `c1250000-0000-4000-8000-${String(n).padStart(12, '0')}`
const claim = { notification_id: id(1), job_id: id(2), user_id: id(3), candidate_id: id(4),
  lease_token: id(5), event_type: 'worker_matched' }
const identity = { environment: 'staging', releaseId: 'harness-125000000000-125000000000',
  deploymentId: 'xyylanuyflrjzbjzhqfl_c1250000-0000-4000-8000-000000000058_1', dispatcherId: 'test-p125' }

function setup(options: { claim?: unknown; start?: unknown; finish?: unknown; noToken?: boolean;
  replay?: boolean; circuitOpen?: boolean; finishError?: boolean } = {}) {
  const database = makeSequenceClient([], {
    claim_official_match_push: [{ data: options.claim ?? [claim], error: null }, { data: [], error: null }],
    begin_official_match_push: [{ data: options.start === undefined ? true : options.start, error: null }],
    finish_official_match_push: [{ data: options.finish === undefined ? true : options.finish,
      error: options.finishError ? { message: 'private database detail' } : null }],
    reserve_harness_idempotency: [{ data: [{ state: options.replay ? 'completed' : 'reserved',
      reservation_id: id(6), response_hash: options.replay ? 'hash-is-not-a-delivery-receipt' : null }], error: null }],
    ...(options.circuitOpen ? { acquire_harness_dependency_permit: [
      { data: [{ allowed: false, state: 'open' }], error: null }] } : {}),
  }, { device_push_tokens: [{ data: options.noToken ? [] : [{
    id: id(7), user_id: claim.user_id, push_token: 'ExponentPushToken[p125]',
    updated_at: '2026-09-08T00:00:00Z' }], error: null }] })
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-p125' }] })))
  vi.stubGlobal('fetch', fetch)
  return { database, fetch, run: () => dispatchOfficialMatchPush(database as unknown as DbClient, identity) }
}
function settlement(database: ReturnType<typeof setup>['database']) {
  return database.calls.find((call) => call.table === 'rpc:finish_official_match_push')?.operations[0][2]
}

describe('official match durable push dispatcher', () => {
  installEdgeRuntimeTestHooks()

  it.each(['worker_matched', 'customer_confirmed_worker'])('sends only the leased %s participant with a stable notification identity', async (event_type) => {
    const { database, fetch, run } = setup({ claim: [{ ...claim, event_type }] })
    expect(await run(), pillarWhy(PILLAR)).toMatchObject({ claimed: 1, submitted: 1, recoveryRequired: 0 })
    expect(fetch).toHaveBeenCalledTimes(1)
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))[0]
    expect(request.data).toEqual({ event_type, job_id: claim.job_id, candidate_id: claim.candidate_id,
      notification_id: claim.notification_id,
      deep_link: event_type === 'worker_matched' ? `/(customer)/history?job_id=${claim.job_id}` : `/(worker)/jobs?job_id=${claim.job_id}` })
    expect(request.data).not.toHaveProperty('address')
    expect(settlement(database)).toMatchObject({ p_notification_id: claim.notification_id,
      p_lease_token: claim.lease_token, p_outcome: 'submitted', p_submitted_count: 1, p_error_code: null })
    const beginIndex = database.calls.findIndex((call) => call.table === 'rpc:begin_official_match_push')
    const tokenIndex = database.calls.findIndex((call) => call.table === 'device_push_tokens')
    expect(beginIndex).toBeLessThan(tokenIndex)
    expect(database.calls[0].operations[0][2]).toMatchObject({
      p_environment: identity.environment, p_release_id: identity.releaseId,
      p_deployment_id: identity.deploymentId, p_limit: 1 })
    const reserved = database.calls.find((call) => call.table === 'rpc:reserve_harness_idempotency')?.operations[0][2]
    expect(reserved).toMatchObject({ p_operation_id: 'notification.official_match', p_release_id: identity.releaseId })
  })

  it('keeps no-token recipients unreachable without inventing a successful send', async () => {
    const { database, fetch, run } = setup({ noToken: true })
    expect(await run()).toMatchObject({ submitted: 0, unreachable: 1 })
    expect(fetch).not.toHaveBeenCalled()
    expect(settlement(database)).toMatchObject({ p_outcome: 'unreachable', p_submitted_count: 0,
      p_error_code: 'NO_REGISTERED_PUSH_TOKEN' })
  })

  it('does not infer delivery or token absence from an idempotency replay hash', async () => {
    const { database, fetch, run } = setup({ replay: true })
    expect(await run(), pillarWhy(PILLAR)).toMatchObject({ submitted: 0, unreachable: 0, recoveryRequired: 1 })
    expect(fetch).not.toHaveBeenCalled()
    expect(settlement(database)).toMatchObject({ p_outcome: 'recovery_required',
      p_error_code: 'PUSH_REPLAY_REQUIRES_RECONCILIATION' })
  })

  it('schedules a bounded retry when the provider circuit prevented sending', async () => {
    const { database, fetch, run } = setup({ circuitOpen: true })
    expect(await run()).toMatchObject({ retryScheduled: 1, submitted: 0 })
    expect(fetch).not.toHaveBeenCalled()
    expect(settlement(database)).toMatchObject({ p_outcome: 'retry', p_error_code: 'PUSH_CIRCUIT_OPEN' })
  })

  it('preserves an unknown malformed provider ticket as reconciliation work', async () => {
    const { database, fetch, run } = setup()
    fetch.mockImplementation(async () => new Response(JSON.stringify({ data: [{ status: 'ok' }] })))
    expect(await run()).toMatchObject({ recoveryRequired: 1, submitted: 0 })
    expect(settlement(database)).toMatchObject({ p_outcome: 'recovery_required', p_error_code: 'PUSH_OUTCOME_UNKNOWN' })
  })

  it('does not send when the job or release changed after claim', async () => {
    const { database, fetch, run } = setup({ start: false })
    expect(await run()).toMatchObject({ notStarted: 1, submitted: 0 })
    expect(fetch).not.toHaveBeenCalled()
    expect(settlement(database)).toBeUndefined()
  })

  it.each([null, 'true', [], {}])('refuses an untyped start receipt: %j', async (start) => {
    const { fetch, run } = setup({ start })
    await expect(run()).rejects.toThrow('OFFICIAL_MATCH_PUSH_START_UNKNOWN')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([{ receipt: [{ ...claim, user_id: 'bad-id' }] },
    { receipt: [{ ...claim, event_type: 'invented' }] }, { receipt: [claim, claim] }])(
    'refuses a malformed claim before provider access: %j', async ({ receipt }) => {
      const { fetch, run } = setup({ claim: receipt })
      await expect(run()).rejects.toThrow(/OFFICIAL_MATCH_PUSH_CLAIM_/)
      expect(fetch).not.toHaveBeenCalled()
    })

  it('does not count a provider submission as settled after losing the SQL lease', async () => {
    const { run } = setup({ finish: false })
    expect(await run()).toMatchObject({ submitted: 0, leaseLost: 1 })
  })

  it('does not hide an unknown receipt commit or return database details', async () => {
    const { run } = setup({ finishError: true })
    await expect(run()).rejects.toThrow('OFFICIAL_MATCH_PUSH_SETTLEMENT_UNKNOWN')
  })

  it('refuses an unidentified runtime before even claiming a row', async () => {
    const { database } = setup()
    await expect(dispatchOfficialMatchPush(database as unknown as DbClient, { ...identity, releaseId: 'unreleased' }))
      .rejects.toThrow('OFFICIAL_MATCH_PUSH_RELEASE_UNAVAILABLE')
    expect(database.calls).toHaveLength(0)
  })

  it('stops claiming more notifications after a slow provider consumes the dispatch budget', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const { database, fetch, run } = setup()
    fetch.mockImplementation(async () => {
      now = 20_000
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-p125' }] }))
    })
    expect(await run()).toMatchObject({ submitted: 1 })
    expect(database.calls.filter((call) => call.table === 'rpc:claim_official_match_push')).toHaveLength(1)
  })

  it('retains a scheduled recovery path independent of the Customer request', () => {
    const source = readFileSync(new URL('../../../../../../supabase/functions/kael-matching-maintainer/index.ts', import.meta.url), 'utf8')
    expect(source).toContain('const officialMatchPushTask = dispatchOfficialMatchPush(dbClient,')
    expect(source).toContain('await officialMatchPushTask')
    expect(source).toContain('official_match_push: officialMatchPush')
    expect(source).toContain('officialMatchPushFailed ? 500 : 200')
  })
})

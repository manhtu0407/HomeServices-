import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  createHarnessTraceContext,
  recordHarnessEvent,
} from '../../../../../supabase/functions/_shared/harness/trace.ts'

export const PILLAR = {
  id: 'P359-harness-event-console-echo',
  invariant:
    'a harness event reaches the console only when it is failed, blocked, cancelled, error-coded, or could not be persisted; a healthy persisted event is never echoed, so log ingestion does not scale with traffic',
  authority: [
    'governance/RULES.md #8 (never silently swallow provider, Edge, or DB failures without safe logging)',
    'governance/RULES.md #9 (logging must carry safe metadata only)',
  ],
  target: 'supabase/functions/_shared/harness/trace.ts',
  layer: 'unit',
  siblings: ['P29-harness-metadata-allowlist'],
  mutation:
    'restore the unconditional console.info before the RPC in recordHarnessEvent — the healthy-event case turns red; delete the persist-failure fallbacks — the fallback case turns red',
} as const satisfies PillarManifest

type RpcResult = { data: unknown; error: unknown }

const traceWith = (rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>) =>
  createHarnessTraceContext({ releaseId: 'harness-test', environment: 'staging', client: { rpc } })

const echoed = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([label]) => label === 'harness_event')

describe('P359 harness event console echo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps durable healthy events out of the console', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const trace = traceWith(() => Promise.resolve({ data: true, error: null }))
    await recordHarnessEvent(trace, { eventClass: 'request.completed', status: 'succeeded' })
    await recordHarnessEvent(trace, { eventClass: 'request.started', status: 'started' })
    await recordHarnessEvent(trace, { eventClass: 'request.observed', status: 'observed' })
    expect(echoed(info), pillarWhy(PILLAR, 'three healthy events persisted by a working client')).toHaveLength(0)
  })

  it('echoes failed, blocked, cancelled and error-coded events exactly once', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const trace = traceWith(() => Promise.resolve({ data: true, error: null }))
    await recordHarnessEvent(trace, { eventClass: 'request.blocked', status: 'failed', errorCode: 'DB_ERROR' })
    await recordHarnessEvent(trace, { eventClass: 'request.blocked', status: 'blocked' })
    await recordHarnessEvent(trace, { eventClass: 'request.completed', status: 'cancelled' })
    await recordHarnessEvent(trace, { eventClass: 'request.completed', status: 'succeeded', errorCode: 'WARN' })
    expect(echoed(info), pillarWhy(PILLAR, 'four notable events, each persisted successfully')).toHaveLength(4)
  })

  it('falls back to the console when a healthy event cannot be persisted', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const rejected = traceWith(() => Promise.reject(new Error('db down')))
    const errored = traceWith(() => Promise.resolve({ data: null, error: { code: '57014' } }))
    const detached = createHarnessTraceContext({ releaseId: 'harness-test', environment: 'staging' })
    const settled = [
      await recordHarnessEvent(rejected, { eventClass: 'request.completed', status: 'succeeded' }),
      await recordHarnessEvent(errored, { eventClass: 'request.completed', status: 'succeeded' }),
      await recordHarnessEvent(detached, { eventClass: 'request.completed', status: 'succeeded' }),
    ]
    expect(settled.map((id) => id === null), pillarWhy(PILLAR, 'rejected rpc, rpc error, no client')).toEqual([true, true, false])
    expect(echoed(info), pillarWhy(PILLAR, 'three healthy events that were not durably stored')).toHaveLength(3)
  })
})

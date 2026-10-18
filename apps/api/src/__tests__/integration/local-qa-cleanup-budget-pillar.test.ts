import { afterEach, beforeEach, describe, expect, it, vi, type TestContext } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { createLocalFulfillmentFixture } from './local-qa-fulfillment-fixture'

export const PILLAR = {
  id: 'P400-local-qa-cleanup-budget',
  invariant: 'owned QA cleanup waits for its bounded read, optional cancellation and parallel availability writes without hiding failures or abandoning later actors',
  authority: ['governance/RULES.md #8', 'approved Build 56 journey verification plan'],
  target: 'fulfillment fixture onTestFinished orchestration and request budgets',
  layer: 'unit',
  siblings: ['P399-kael-local-http-cancellation', 'P397-kael-local-http-payment'],
  mutation: 'restore the default ten-second hook timeout; three individually valid nine-second cleanup phases must exceed it and fail',
} as const satisfies PillarManifest

const state = vi.hoisted(() => ({ actor: 0, cleanup: false, failRead: false, missingAttribution: false, offline: [] as string[], calls: [] as string[] }))
vi.mock('./local-qa-http-harness', () => ({
  LOCAL_QA_REQUEST_TIMEOUT_MS: 10_000,
  localQaRecord: (value: unknown) => value,
  createLocalQaHttpHarness: () => ({
    target: { anonKey: 'fixture-only' },
    customer: async () => { const id = `actor-${++state.actor}`; return { id, token: id } },
    seedRows: () => undefined,
    dispatchMatching: async () => { state.cleanup = true; throw new Error('stop after owned job persisted') },
    request: async (path: string, options: { body?: unknown; token?: string } = {}) => {
      if (state.missingAttribution) return { status: 503, runId: 'safe-run', elapsedMs: 4321,
        fixtureProviderCalls: null, fixtureDeniedCalls: null, payload: { secret: 'sentinel-private-payload' } }
      if (state.cleanup) {
        state.calls.push(path)
        await new Promise(resolve => setTimeout(resolve, 9000))
        if (path.startsWith('/rest/v1/jobs?')) {
          if (state.failRead) throw new Error('read failed')
          return { status: 200, payload: [{ status: 'broadcasting', worker_id: null }] }
        }
        if (path.endsWith('/availability')) state.offline.push(String(options.token))
        return { status: 200, payload: {} }
      }
      if (path.includes('/service_problems?')) return { status: 200, payload: [{ id: 'problem-1' }] }
      if (path.endsWith('/confirm')) return { status: 202, payload: { job_id: 'owned-job' } }
      return { status: 200, payload: {} }
    },
  }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(state, { actor: 0, cleanup: false, failRead: false, missingAttribution: false, offline: [], calls: [] })
})
afterEach(() => vi.useRealTimers())

describe('Owned fixture cleanup lifecycle', () => {
  it('keeps missing attribution red with safe status and timing diagnostics', async context => {
    state.missingAttribution = true
    const captured = { ...context, onTestFinished: () => undefined }
    const error = await createLocalFulfillmentFixture(PILLAR).prepareAssigned(captured, { apiRoot: '/functions/v1/qa-test' })
      .then(() => null, (failure: unknown) => failure)
    expect(error, pillarWhy(PILLAR)).toBeInstanceOf(Error)
    const message = error instanceof Error ? error.message : ''
    expect(message, pillarWhy(PILLAR)).toContain('"status":503')
    expect(message, pillarWhy(PILLAR)).toContain('"elapsed_ms":4321')
    expect(message, pillarWhy(PILLAR)).toContain('"run_id":"safe-run"')
    expect(message, pillarWhy(PILLAR, 'response bodies cannot become diagnostics')).not.toContain('sentinel-private-payload')
  })
  for (const failRead of [false, true]) {
    it(`settles all bounded phases and attempts every Worker when read fails=${failRead}`, async context => {
      let callback: Parameters<TestContext['onTestFinished']>[0] | undefined
      let budget = 10_000
      const captured = { ...context, onTestFinished: (fn: Parameters<TestContext['onTestFinished']>[0], timeout?: number) => {
        callback = fn
        budget = timeout ?? 10_000
      } }
      await expect(createLocalFulfillmentFixture(PILLAR).prepareAssigned(captured), pillarWhy(PILLAR))
        .rejects.toThrow('stop after owned job persisted')
      if (!callback) throw new Error(pillarWhy(PILLAR, 'cleanup callback was not registered'))
      state.failRead = failRead
      const finished = Promise.resolve().then(() => callback?.(context)).then(() => 'completed', () => 'cleanup_failed')
      const hook = Promise.race([finished, new Promise<string>(resolve => setTimeout(() => resolve('hook_timeout'), budget))])
      await vi.advanceTimersByTimeAsync(30_000)
      expect(await hook, pillarWhy(PILLAR, 'the hook must report the actual cleanup result, not interrupt valid request windows'))
        .toBe(failRead ? 'cleanup_failed' : 'completed')
      expect(state.offline, pillarWhy(PILLAR, 'all three actors must be attempted even when retirement fails')).toEqual(['actor-3', 'actor-4', 'actor-5'])
      expect(state.calls.filter(path => path.endsWith('/cancel')), pillarWhy(PILLAR)).toHaveLength(failRead ? 0 : 1)
    })
  }
})

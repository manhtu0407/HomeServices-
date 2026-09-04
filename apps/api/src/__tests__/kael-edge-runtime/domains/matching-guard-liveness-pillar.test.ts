import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'

export const PILLAR = {
  id: 'P21-matching-guard-liveness',
  invariant:
    'the transition guard after a matching RPC checks the status the RPC actually returned, so a job the RPC left on an unexpected status is refused instead of being logged as a successful match',
  authority: [
    'governance/RULES.md #7 (the customer confirms a proposed worker, and the server decides the outcome)',
    'governance/RULES.md #8 (no silent degradation: a wrong outcome is reported, not recorded as success)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
  layer: 'integration',
  siblings: ['P12-workflow-transition-composition', 'P19-job-access-ownership', 'P10-per-actor-rls'],
  mutation:
    'restore either guard to a literal `to:` — `to: "worker_matched"` on confirm or `to: "broadcasting"` on reject — and the mismatch case for that route turns green again, which is the whole defect',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const JOB_ID = 'job-p21'
const CANDIDATE_ID = 'candidate-p21'
const candidateSource = readFileSync(
  resolve(__dirname, '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/candidate.ts'),
  'utf8',
)

// Both RPCs answer with the row shape the domain reads: the outcome flag, the worker, whether the
// decision was already applied, and the status the job ended up on.
function rpcAnswering(fn: string, jobStatus: string) {
  return makeSequenceClient([], {
    [fn]: [{
      data: [{
        ok: true,
        error_code: null,
        worker_id: 'worker-p21',
        already_applied: false,
        job_status: jobStatus,
      }],
      error: null,
    }],
  }, {
    jobs: [{
      data: {
        id: JOB_ID,
        status: 'worker_candidate_pending',
        customer_id: 'customer-p21',
        worker_id: null,
        quote_mode: 'kael_auto_quote',
      },
      error: null,
    }],
  })
}

function customerCtx(client: ReturnType<typeof rpcAnswering>): MobileApiContext {
  return { success: true, user: { id: 'customer-p21' }, role: 'customer', supabase: client }
}

// An apiFailure carries a `code`. Anything else thrown is a broken fixture rather than a verdict,
// and swallowing it as "no failure" would make every assertion below pass for the wrong reason.
async function failureCodeOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    const code = (error as { code?: string }).code
    if (typeof code !== 'string') throw error
    return code
  }
}

const confirm = (status: string) => {
  const client = rpcAnswering('confirm_worker_candidate_atomic', status)
  return {
    client,
    run: () => createEdgeServices({}).confirmWorkerCandidate(customerCtx(client), JOB_ID, CANDIDATE_ID),
  }
}

const reject = (status: string) => {
  const client = rpcAnswering('reject_worker_candidate_atomic', status)
  return {
    client,
    run: () => createEdgeServices({}).rejectWorkerCandidate(customerCtx(client), JOB_ID, CANDIDATE_ID),
  }
}

describe('confirm refuses a status the RPC should not have produced', () => {
  it('keeps status in the custom access projection before dispatching by quote mode', () => {
    const confirmBody = candidateSource.match(
      /export async function confirmWorkerCandidate[\s\S]*?const result =/,
    )?.[0] ?? ''
    expect(
      confirmBody,
      pillarWhy(PILLAR, 'requireJobAccess cannot validate ownership when its mandatory status field is omitted'),
    ).toContain('select: "id, status, customer_id, quote_mode"')
  })

  // The guard used to compare two string literals, so it could not fail whatever the RPC did. These
  // are the statuses a broken or racing RPC could plausibly leave behind.
  it.each(['cancelled', 'broadcasting', 'paid', 'reviewed'])(
    'refuses a confirm that landed on %s',
    async (status) => {
      expect(
        await failureCodeOf(confirm(status).run),
        pillarWhy(PILLAR, 'a job that did not reach worker_matched has not been matched'),
      ).toBe('INVALID_STATUS')
    },
  )

  it('does not refuse the status a successful confirm produces', async () => {
    expect(
      await failureCodeOf(confirm('worker_matched').run),
      pillarWhy(PILLAR, 'a guard that also refuses the correct outcome is worse than no guard'),
    ).not.toBe('INVALID_STATUS')
  })
})

describe('reject refuses a status the RPC should not have produced', () => {
  it.each(['worker_matched', 'cancelled', 'paid'])(
    'refuses a rejection that landed on %s',
    async (status) => {
      expect(
        await failureCodeOf(reject(status).run),
        pillarWhy(PILLAR, 'declining a candidate must return the job to matching, not advance it'),
      ).toBe('INVALID_STATUS')
    },
  )

  it('does not refuse the status a successful rejection produces', async () => {
    expect(
      await failureCodeOf(reject('broadcasting').run),
      pillarWhy(PILLAR, 'a guard that also refuses the correct outcome is worse than no guard'),
    ).not.toBe('INVALID_STATUS')
  })
})

describe('the refusal happens before anything is written', () => {
  // The guard runs after the RPC has already committed, so it cannot prevent the write it is
  // checking. What it must still prevent is a job event that claims a match that did not happen.
  it('writes no job event when confirm lands on the wrong status', async () => {
    const { client, run } = confirm('cancelled')
    await failureCodeOf(run)
    expect(
      client.calls.map((call) => call.table),
      pillarWhy(PILLAR, 'an event log asserting a match that did not happen is worse than no log'),
    ).not.toContain('job_events')
  })

  it('writes no job event when a rejection lands on the wrong status', async () => {
    const { client, run } = reject('worker_matched')
    await failureCodeOf(run)
    expect(
      client.calls.map((call) => call.table),
      pillarWhy(PILLAR, 'an event log asserting a rejection that did not happen is worse than no log'),
    ).not.toContain('job_events')
  })
})

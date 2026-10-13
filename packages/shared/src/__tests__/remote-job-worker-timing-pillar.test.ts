import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from './pillar-manifest'
import { createInitialLocalWorkflowState, localWorkflowReducer, type LocalRemoteJobSnapshot } from '../mobile-workflow'

export const PILLAR = {
  id: 'P376-remote-job-worker-timing',
  invariant:
    'hydrating a remote job keeps the server-recorded arrival time, work start, pause and worker note on the deal, and a snapshot that is silent about the scope proposal keeps the one already held for the same pending job, so the worker screens do not fall back to an empty state',
  authority: [
    'governance/RULES.md #8 (no silent degradation: a value the server sent must not vanish client-side)',
    'governance/STRUCTURES.md (the backend drives the phase; the client renders what it was given)',
  ],
  target: 'packages/shared/src/mobile-workflow/reducer.ts',
  layer: 'unit',
  siblings: ['P04-remote-snapshot-validation'],
  mutation:
    'delete arrivedAt or workStartedAt from createDealFromRemoteJob, or drop the keepsHeldScope branch — the timestamp test or the held-scope tests turn red',
} as const satisfies PillarManifest

const BASE_JOB: Omit<LocalRemoteJobSnapshot, 'status'> = {
  id: 'job-p376',
  serviceType: 'electrical',
  description: 'Ổ cắm chập chờn.',
  problemChips: ['Ổ cắm'],
  addressLabel: 'Chung cư X, Quận 7',
  districtLabel: 'Quận 7',
  mediaCount: 0,
  estimate: null,
  broadcast: null,
  scopeChange: null,
}

describe('remote job worker timing', () => {
  it('keeps arrival, work start, pause and note from the server', () => {
    const deal = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_job',
      job: {
        ...BASE_JOB,
        status: 'repairing',
        backendStatus: 'repairing',
        arrivedAt: '2026-10-13T08:00:00.000Z',
        workStartedAt: '2026-10-13T08:10:00.000Z',
        workPausedAt: '2026-10-13T08:30:00.000Z',
        workPausedMs: 120_000,
        workerWorkNote: 'Đã thay ổ cắm đôi',
      },
      workerGate: 'remote_backend',
    }).deal

    const why = pillarWhy(PILLAR, 'every timing field the server sent is still on the deal after hydration')
    expect(deal, why).not.toBeNull()
    expect(deal?.arrivedAt, why).toBe('2026-10-13T08:00:00.000Z')
    expect(deal?.workStartedAt, why).toBe('2026-10-13T08:10:00.000Z')
    expect(deal?.workPausedAt, why).toBe('2026-10-13T08:30:00.000Z')
    expect(deal?.workPausedMs, why).toBe(120_000)
    expect(deal?.workerWorkNote, why).toBe('Đã thay ổ cắm đôi')
  })

  it('leaves the timing empty when the server has none', () => {
    const deal = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_job',
      job: { ...BASE_JOB, status: 'worker_matched', backendStatus: 'worker_matched' },
      workerGate: 'remote_backend',
    }).deal

    const why = pillarWhy(PILLAR, 'no timing from the server means no timing on the deal, never an invented value')
    expect(deal, why).not.toBeNull()
    expect(deal?.arrivedAt, why).toBeNull()
    expect(deal?.workStartedAt, why).toBeNull()
    expect(deal?.workPausedAt, why).toBeNull()
    expect(deal?.workPausedMs, why).toBe(0)
    expect(deal?.workerWorkNote, why).toBeNull()
  })

  describe('scope proposal held across worker polls', () => {
    const SCOPE: NonNullable<LocalRemoteJobSnapshot['scopeChange']> = {
      id: 'scope-p376',
      status: 'waiting_customer_decision',
      requestedDescription: 'Thay đoạn dây bị chảy nhựa',
      reason: 'Dây dẫn sau ổ cắm bị hỏng',
      priceMin: 258000,
      priceMax: 258000,
      kaelReview: null,
      kaelProgress: null,
      evidencePhotoUrls: [],
      createdAt: '2026-10-13T09:00:00.000Z',
    }

    const withProposal = () => {
      const first = localWorkflowReducer(createInitialLocalWorkflowState(), {
        type: 'hydrate_remote_job',
        job: { ...BASE_JOB, status: 'scope_change_pending', backendStatus: 'scope_change_pending', scopeChange: SCOPE },
        workerGate: 'remote_backend',
      })
      return first
    }

    it('keeps the proposal when the next snapshot says nothing about it', () => {
      const next = localWorkflowReducer(withProposal(), {
        type: 'hydrate_remote_job',
        job: { ...BASE_JOB, status: 'scope_change_pending', backendStatus: 'scope_change_pending', scopeChange: undefined },
        workerGate: 'remote_backend',
      })

      expect(next.deal?.scopeChange, pillarWhy(PILLAR, 'a worker poll must not erase the pending proposal')).toEqual(SCOPE)
    })

    it('takes the server answer when the snapshot states the proposal explicitly', () => {
      const next = localWorkflowReducer(withProposal(), {
        type: 'hydrate_remote_job',
        job: { ...BASE_JOB, status: 'scope_change_pending', backendStatus: 'scope_change_pending', scopeChange: null },
        workerGate: 'remote_backend',
      })

      expect(next.deal?.scopeChange, pillarWhy(PILLAR, 'an explicit null is the server saying there is none')).toBeNull()
    })

    it('drops the proposal once the job is no longer pending', () => {
      const next = localWorkflowReducer(withProposal(), {
        type: 'hydrate_remote_job',
        job: { ...BASE_JOB, status: 'repairing', backendStatus: 'repairing', scopeChange: undefined },
        workerGate: 'remote_backend',
      })

      expect(next.deal?.scopeChange ?? null, pillarWhy(PILLAR, 'a resolved proposal must not linger on a job that moved on')).toBeNull()
    })

    it('never carries a proposal over to a different job', () => {
      const next = localWorkflowReducer(withProposal(), {
        type: 'hydrate_remote_job',
        job: { ...BASE_JOB, id: 'job-other', status: 'scope_change_pending', backendStatus: 'scope_change_pending', scopeChange: undefined },
        workerGate: 'remote_backend',
      })

      expect(next.deal?.scopeChange ?? null, pillarWhy(PILLAR, 'the held proposal belongs to one job only')).toBeNull()
    })
  })
})

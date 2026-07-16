import { describe, expect, it } from 'vitest'

import {
  createInitialLocalWorkflowState,
  localWorkflowReducer,
  type LocalRemoteJobSnapshot,
} from '../mobile-workflow'

const scheduledAt = '2026-07-15T01:00:00.000Z'

function futureJobSnapshot(): LocalRemoteJobSnapshot {
  return {
    id: 'job-scheduled',
    status: 'worker_matched',
    backendStatus: 'worker_matched',
    serviceType: 'electrical',
    description: 'Ổ cắm mất điện cần kiểm tra',
    problemChips: ['outlet_not_working'],
    addressLabel: 'Tòa A, Quận 7',
    districtLabel: 'Quận 7',
    scheduledAt,
  }
}

describe('remote job schedule hydration', () => {
  it('preserves the canonical scheduled instant in the local deal', () => {
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_job',
      job: futureJobSnapshot(),
    })

    expect(state.deal?.scheduledAt).toBe(scheduledAt)
  })

  it('preserves the canonical scheduled instant while hydrating a worker broadcast', () => {
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_broadcast',
      broadcast: {
        broadcastId: 'broadcast-scheduled',
        jobId: 'job-scheduled',
        status: 'sent',
        serviceType: 'electrical',
        problemSummary: 'Ổ cắm mất điện',
        generalArea: 'Quận 7',
        secondsRemaining: 300,
        scheduledAt,
      },
    })

    expect(state.deal?.scheduledAt).toBe(scheduledAt)
  })
})

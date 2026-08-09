import { describe, expect, it, vi } from 'vitest'
import {
  assertHarnessCapabilityEnabled,
  readHarnessKillSwitch,
  recordHarnessSloObservation,
  setHarnessKillSwitch,
  transitionHarnessPromotion,
} from '../../../../../supabase/functions/_shared/harness/promotion'
import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client'

function client(data: unknown, error: { message?: string } | null = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) }
}

describe('Harness promotion runtime', () => {
  it('submits one immutable transition packet with safe cohort metadata', async () => {
    const db = client([{ ok: true, promotion_id: 'promotion-1', state: 'canary' }])
    const result = await transitionHarnessPromotion(db, {
      packet: {
        releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
        environment: 'staging',
        fromState: 'shadow',
        toState: 'canary',
        packetSha256: 'a'.repeat(64),
        evaluationReportId: '00000000-0000-4000-8000-000000000301',
        rollbackReleaseId: 'harness-111111111111-222222222222',
        humanApprovalId: 'approval-1',
        cohort: 'internal',
        observationWindowMinutes: 30,
      },
      actorId: '00000000-0000-4000-8000-000000000399',
      safeMetadata: { trace_id: 'trace-1', authorization: 'not-persisted' },
    })

    expect(result).toEqual({ ok: true, promotionId: 'promotion-1', state: 'canary' })
    expect(db.rpc).toHaveBeenCalledWith('transition_harness_promotion', expect.objectContaining({
      p_safe_metadata: {
        trace_id: 'trace-1',
        cohort: 'internal',
        observation_window_minutes: 30,
      },
    }))
  })

  it('records SLO evidence through the registry-owned RPC', async () => {
    const db = client('00000000-0000-4000-8000-000000000401')
    await expect(recordHarnessSloObservation(db, {
      sloId: 'mobile-api-availability',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      environment: 'staging',
      windowStartedAt: '2026-08-06T00:00:00.000Z',
      windowEndedAt: '2026-08-06T00:10:00.000Z',
      actual: 0.999,
      safeMetadata: { sample_count: 100 },
    })).resolves.toEqual({
      ok: true,
      observationId: '00000000-0000-4000-8000-000000000401',
    })
  })

  it('fails closed when a remote kill-switch read is unavailable', async () => {
    const db = client(null, { message: 'offline' })
    await expect(readHarnessKillSwitch(db, {
      environment: 'production',
      switchId: 'global_ai',
    })).resolves.toEqual({ enabled: true, reasonCode: 'KILL_SWITCH_READ_FAILED' })
    await expect(assertHarnessCapabilityEnabled(db, {
      environment: 'production',
      switches: ['global_ai'],
    })).resolves.toEqual({
      allowed: false,
      switchId: 'global_ai',
      reasonCode: 'KILL_SWITCH_READ_FAILED',
    })
  })

  it('requires a successful admin write to change a kill switch', async () => {
    const db = client(true)
    await expect(setHarnessKillSwitch(db, {
      environment: 'staging',
      switchId: 'tool_vision',
      enabled: true,
      reasonCode: 'PROVIDER_INCIDENT',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      actorId: '00000000-0000-4000-8000-000000000399',
      safeMetadata: { incident_id: 'incident-1' },
    })).resolves.toBe(true)
  })

  it('blocks a staging provider call before provider I/O when its switch is enabled', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'read_harness_kill_switch'
        ? [{ enabled: true, reason_code: 'PROVIDER_INCIDENT' }]
        : true,
      error: null,
    }))

    try {
      await expect(callAI({
        purpose: 'intent_classification',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: 'safe metadata only' }],
        maxRetries: 0,
      }, {
        deepseekApiKey: 'test-key',
        durableGuardsEnabled: true,
        durableGuardClient: { rpc },
        harnessTrace: {
          traceId: '00000000-0000-4000-8000-000000000011',
          runId: '00000000-0000-4000-8000-000000000012',
          parentRunId: null,
          turnId: null,
          toolCallId: null,
          parentEventId: null,
          actorIdHash: 'a'.repeat(64),
          actorRole: 'customer',
          jobId: null,
          releaseId: 'release-test',
          environment: 'staging',
          startedAtMs: 0,
          client: { rpc },
        },
      })).resolves.toMatchObject({ success: false, code: 'AI_DISABLED', error: 'PROVIDER_INCIDENT' })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(rpc).toHaveBeenCalledWith('read_harness_kill_switch', {
        p_environment: 'staging',
        p_switch_id: 'global_ai',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

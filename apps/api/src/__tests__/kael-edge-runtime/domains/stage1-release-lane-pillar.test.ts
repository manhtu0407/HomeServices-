import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  resolveStage1ReleaseLane,
  resolveStage1RuntimeBehavior,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/release/stage1-release-lane'

export const PILLAR = {
  id: 'P55-stage1-release-cohort-canary',
  invariant:
    'the candidate Stage-1 runtime is enabled only when the provider-owned deployment, immutable release, and exact synthetic session cohort are accepted by append-only database evidence',
  authority: [
    'governance/RULES.md #7 (workflow mutation requires a recorded server decision)',
    'config/harness/promotion.json (canary must precede production)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/release/stage1-release-lane.ts',
  layer: 'unit',
  siblings: ['P53-stage1-release-integrity', 'P54-synthetic-cohort-nonvisibility'],
  mutation:
    'trust mutable release secrets without an exact source-deployment attestation; new bytes can reach real traffic before three synthetic smokes',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const deploymentId = 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000055_7'

describe('Stage-1 release lane', () => {
  it.each(['candidate', 'active', 'previous'] as const)('returns the database-owned %s lane', async (lane) => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const client = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args })
        return Promise.resolve({ data: lane, error: null })
      },
    }
    await expect(resolveStage1ReleaseLane(client, {
      environment: 'production',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      sessionId: '10000000-0000-4000-8000-000000000055',
      deploymentId,
    })).resolves.toBe(lane)
    expect(calls, pillarWhy(PILLAR, 'the Edge runtime must not infer cohort state')).toEqual([{
      name: 'resolve_stage1_release_lane_attested',
      args: {
        p_environment: 'production',
        p_release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
        p_session_id: '10000000-0000-4000-8000-000000000055',
        p_deployment_id: deploymentId,
      },
    }])
  })

  it('fails closed on a missing, unknown, or errored release-control decision', async () => {
    for (const result of [
      { data: null, error: null },
      { data: 'all_users', error: null },
      { data: null, error: { message: 'unavailable' } },
    ]) {
      await expect(resolveStage1ReleaseLane({
        rpc: () => Promise.resolve(result),
      }, {
        environment: 'production',
        releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
        sessionId: '10000000-0000-4000-8000-000000000055',
        deploymentId,
      }), pillarWhy(PILLAR, 'an unknown lane cannot silently enter candidate behavior')).rejects.toMatchObject({
        code: 'RELEASE_CONTROL_UNAVAILABLE',
        status: 503,
      })
    }
    await expect(resolveStage1ReleaseLane({
      rpc: () => Promise.reject(new Error('timeout')),
    }, {
      environment: 'production',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      sessionId: '10000000-0000-4000-8000-000000000055',
      deploymentId,
    })).rejects.toMatchObject({ code: 'RELEASE_CONTROL_UNAVAILABLE', status: 503 })
  })

  it('keeps production on previous behavior unless the exact session is candidate or active', async () => {
    const input = {
      environment: 'production',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      sessionId: '10000000-0000-4000-8000-000000000055',
      deploymentId,
      clientContractEpoch: 2,
    }
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => Promise.resolve({ data: 'candidate', error: null }),
    }, input)).resolves.toBe('governed')
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => Promise.resolve({ data: 'active', error: null }),
    }, input)).resolves.toBe('governed')
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => Promise.resolve({ data: 'previous', error: null }),
    }, input)).resolves.toBe('previous')
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => Promise.resolve({ data: null, error: { message: 'offline' } }),
    }, input)).rejects.toMatchObject({ code: 'RELEASE_CONTROL_UNAVAILABLE', status: 503 })
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => Promise.resolve({ data: 'candidate', error: null }),
    }, { ...input, releaseId: 'unreleased' })).rejects.toMatchObject({
      code: 'RELEASE_CONTROL_UNAVAILABLE',
      status: 503,
    })
  })

  it('keeps new bytes on previous behavior until their exact provider deployment is attested', async () => {
    let calls = 0
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => {
        calls += 1
        return Promise.resolve({ data: 'previous', error: null })
      },
    }, {
      environment: 'production',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      sessionId: '10000000-0000-4000-8000-000000000055',
      deploymentId: 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000055_8',
      clientContractEpoch: 2,
    })).resolves.toBe('previous')
    expect(calls, pillarWhy(PILLAR, 'the database must reject an unattested deployment/release pair')).toBe(1)

    calls = 0
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => {
        calls += 1
        return Promise.resolve({ data: 'active', error: null })
      },
    }, {
      environment: 'production',
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      sessionId: '10000000-0000-4000-8000-000000000055',
      clientContractEpoch: 2,
    })).resolves.toBe('previous')
    expect(calls, pillarWhy(PILLAR, 'missing provider identity cannot be repaired by mutable release secrets')).toBe(0)
  })

  it('uses governed behavior outside Production so isolated Local and Staging can verify it', async () => {
    let calls = 0
    await expect(resolveStage1RuntimeBehavior({
      rpc: () => {
        calls += 1
        return Promise.resolve({ data: null, error: null })
      },
    }, {
      environment: 'staging',
      releaseId: 'staging-test',
      sessionId: '10000000-0000-4000-8000-000000000055',
    })).resolves.toBe('governed')
    expect(calls).toBe(0)
  })

  it('wires the lane into policy finalization, confirmation, and broadcast activation', () => {
    const root = resolve(import.meta.dirname, '../../../../../..')
    const estimate = readFileSync(resolve(root,
      'supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support.ts'), 'utf8')
    const confirm = readFileSync(resolve(root,
      'supabase/functions/mobile-api/_shared/domains/kael-chat/confirm.service.ts'), 'utf8')
    const broadcasts = readFileSync(resolve(root,
      'supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts'), 'utf8')
    expect(estimate, pillarWhy(PILLAR, 'real traffic must retain the previous intake behavior before promotion'))
      .toContain('runtimeBehavior === "previous"')
    expect(confirm, pillarWhy(PILLAR, 'legacy sessions and non-cohort sessions must not enter durable confirm'))
      .toContain('confirmPreviousReleaseKaelChat')
    expect(confirm, pillarWhy(PILLAR, 'session coverage cannot substitute for the database lane decision'))
      .toContain('resolveStage1RuntimeBehavior')
    expect(broadcasts, pillarWhy(PILLAR, 'legacy jobs must use the legacy fanout RPC while quote_mode is null'))
      .toContain('activate_job_broadcast_batch_atomic')
    expect(broadcasts).toContain('nullableString(modeResult.data.quote_mode) !== null')
  })

})

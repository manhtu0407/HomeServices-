import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P367-worker-job-media-upload-http',
  invariant:
    'Worker job media reservations require the assigned Worker and current fulfillment stage, and a failed Storage handshake releases the reservation without advancing job state',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive operations remain server-bound)',
    'governance/RULES.md #7 (workflow authority and confirmation gates)',
    'governance/RULES.md Security Invariants (private evidence and validated workflow writes)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/job/media.ts',
  layer: 'security-negative',
  siblings: ['P190-customer-media-upload', 'P79-worker-completion-media-ownership', 'P10-per-actor-rls'],
  mutation:
    'allow an unassigned Worker to reserve job media or retain quota after signed-upload creation fails; the Worker ownership and recovery cases turn red',
} as const satisfies PillarManifest

const JOB_ID = 'd3670000-0000-4000-8000-000000000001'
const CUSTOMER_ID = 'd3670000-0000-4000-8000-000000000002'
const WORKER_ID = 'd3670000-0000-4000-8000-000000000003'
const OTHER_WORKER_ID = 'd3670000-0000-4000-8000-000000000004'

const WORKER_UPLOAD_STATES = [
  { transactionState: 'arrived', jobStatus: 'arrived', stage: 'kael_reference' },
  { transactionState: 'inspecting', jobStatus: 'inspecting', stage: 'kael_reference' },
  { transactionState: 'working', jobStatus: 'repairing', stage: 'after' },
  { transactionState: 'completion_proposed', jobStatus: 'completed_by_worker', stage: 'after' },
] as const

function setup(jobStatus: string, options: { actorId?: string; signingFails?: boolean } = {}) {
  const client = makeSequenceClient([], {
    reserve_job_media_upload: [{
      data: [{ allowed: true, expires_at: '2099-01-01T00:00:00.000Z' }],
      error: null,
    }],
    fail_job_media_uploads: [{
      data: [{ revoked_paths: [`${JOB_ID}/after/intent-reference.jpg`] }],
      error: null,
    }],
  }, {
    jobs: [{ data: {
      customer_id: CUSTOMER_ID,
      id: JOB_ID,
      service_type: 'electrical',
      status: jobStatus,
      worker_id: WORKER_ID,
    }, error: null }],
  })
  const storageRequests: string[] = []
  Object.assign(client, {
    storage: {
      from(bucket: string) {
        if (bucket !== 'job-media') throw new Error(`Unexpected bucket ${bucket}`)
        return {
          async createSignedUploadUrl(objectPath: string) {
            storageRequests.push(objectPath)
            if (options.signingFails) throw new Error('storage unavailable')
            return {
              data: { signedUrl: 'https://storage.example.test/upload', token: 'signed-token' },
              error: null,
            }
          },
        }
      },
    },
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true,
      user: { id: options.actorId ?? WORKER_ID },
      role: 'worker',
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })

  return {
    client,
    storageRequests,
    run: (stage: string) => handler(new Request(`https://edge.test/jobs/${JOB_ID}/media-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        file_name: 'intent-reference.jpg',
        file_size_bytes: 1024,
        mime_type: 'image/jpeg',
        stage,
      }),
    })),
  }
}

describe('Worker public job media upload intent', () => {
  installEdgeRuntimeTestHooks()

  it('reserves stage-valid uploads at each supported fulfillment state without advancing job status', async () => {
    for (const { transactionState, jobStatus, stage } of WORKER_UPLOAD_STATES) {
      const { client, run, storageRequests } = setup(jobStatus)
      const response = await run(stage)

      expect(response.status, `${transactionState}: ${pillarWhy(PILLAR)}`).toBe(201)
      expect(await response.json()).toMatchObject({
        bucket_id: 'job-media',
        storage_ref: expect.stringMatching(/^supabase:\/\/job-media\//),
        token: 'signed-token',
        expires_in_seconds: 7200,
      })
      expect(client.calls.filter(call => call.table === 'rpc:reserve_job_media_upload')).toHaveLength(1)
      expect(client.calls.find(call => call.table === 'rpc:reserve_job_media_upload')?.operations[0]?.[2]).toMatchObject({
        p_job_id: JOB_ID,
        p_owner_id: WORKER_ID,
        p_stage: stage,
      })
      expect(client.calls.filter(call => call.table === 'jobs' && call.operations.some(operation => operation[0] === 'update'))).toEqual([])
      expect(storageRequests).toHaveLength(1)
      expect(storageRequests[0]).toMatch(new RegExp(`^${JOB_ID}/${stage}/`))
    }
  })

  it('rejects an unassigned Worker before reserving media or requesting a signed upload', async () => {
    const { client, run, storageRequests } = setup('repairing', { actorId: OTHER_WORKER_ID })
    const response = await run('after')

    expect(response.status, pillarWhy(PILLAR, 'job ownership must be checked before quota reservation')).toBe(404)
    expect(client.calls.filter(call => call.table === 'rpc:reserve_job_media_upload')).toEqual([])
    expect(storageRequests).toEqual([])
  })

  it('revokes the Worker reservation when signed upload preparation fails', async () => {
    const { client, run, storageRequests } = setup('repairing', { signingFails: true })
    const response = await run('after')

    expect(response.status, pillarWhy(PILLAR, 'a failed Storage handshake must not retain reserved quota')).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'STORAGE_ERROR' })
    expect(client.calls.filter(call => call.table === 'rpc:reserve_job_media_upload')).toHaveLength(1)
    expect(client.calls.filter(call => call.table === 'rpc:fail_job_media_uploads')).toHaveLength(1)
    expect(client.calls.find(call => call.table === 'rpc:fail_job_media_uploads')?.operations[0]?.[2]).toMatchObject({
      p_job_id: JOB_ID,
      p_owner_id: WORKER_ID,
    })
    expect(storageRequests).toHaveLength(1)
  })
})
